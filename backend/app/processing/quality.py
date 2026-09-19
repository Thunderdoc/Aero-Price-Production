"""
Data quality validation pipeline stage.

Applies a series of rule-based checks to a normalized FareRecord.
Appends quality flags; returns (is_valid, flags).
"""
from app.collectors.base import FareRecord

# Fare bounds in INR for domestic economy
MIN_FARE_INR = 800
MAX_FARE_INR = 100_000

VALID_CABINS = {"ECONOMY", "BUSINESS", "FIRST", "PREMIUM_ECONOMY"}
VALID_ADVANCE_WINDOWS = {1, 7, 15, 30, 45}
VALID_DATA_ORIGINS = {"REAL", "OFFICIAL", "DERIVED", "GENERATED_TEST"}


def validate_record(record: FareRecord) -> tuple[bool, list[str]]:
    """
    Run all quality checks. Returns (is_valid, quality_flags).
    A record is rejected (is_valid=False) only on hard failures.
    Soft issues add flags but do not reject.
    """
    flags: list[str] = list(record.quality_flags or [])
    hard_fail = False

    # Hard: fare bounds
    if record.total_fare < MIN_FARE_INR:
        flags.append("BELOW_MINIMUM_FARE")
        hard_fail = True
    if record.total_fare > MAX_FARE_INR:
        flags.append("ABOVE_MAXIMUM_FARE")
        hard_fail = True

    # Hard: negative components
    if record.base_fare < 0 or record.taxes < 0 or (record.fees or 0) < 0:
        flags.append("NEGATIVE_FARE_COMPONENT")
        hard_fail = True

    # Hard: missing route
    if not record.origin or not record.destination:
        flags.append("MISSING_ROUTE")
        hard_fail = True

    # Hard: missing travel date
    if not record.travel_date:
        flags.append("MISSING_TRAVEL_DATE")
        hard_fail = True

    # Soft: cabin not in known set
    if record.cabin and record.cabin.upper() not in VALID_CABINS:
        flags.append("UNKNOWN_CABIN")

    # Soft: advance window not in standard set
    if record.advance_days not in VALID_ADVANCE_WINDOWS:
        flags.append("NON_STANDARD_WINDOW")

    # Soft: data origin unrecognized
    if record.data_origin not in VALID_DATA_ORIGINS:
        flags.append("UNKNOWN_ORIGIN")

    # Soft: total ≠ base + taxes + fees by more than ₹10
    computed = record.base_fare + record.taxes + (record.fees or 0)
    if abs(computed - record.total_fare) > 10:
        flags.append("FARE_COMPONENTS_MISMATCH")

    return not hard_fail, flags


def validate_batch(records: list[FareRecord]) -> tuple[list[FareRecord], list[FareRecord], int]:
    """
    Validate a batch. Returns (valid_records, rejected_records, rejected_count).
    Adds quality_flags to each record in-place.
    """
    valid = []
    rejected = []
    for rec in records:
        is_valid, flags = validate_record(rec)
        rec.quality_flags = flags
        if is_valid:
            valid.append(rec)
        else:
            rejected.append(rec)
    return valid, rejected, len(rejected)
