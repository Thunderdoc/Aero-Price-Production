"""
Index route weights configuration.

Current state (22 Nov 2026): GRAVITY-MODEL WEIGHTS from AAI airport
traffic — explicitly documented as a modelled proxy, NOT DGCA route
traffic.

Why a gravity model
-------------------
SIH26056 asks for the basket to be selected and weighted on the basis of
DGCA passenger-traffic data. Route-level DGCA traffic (passengers per
city-pair, per month) is NOT available to this project in machine-readable
form:

- The DGCA monthly dataset the backend can fetch (`dgca_monthly` table)
  carries total domestic passengers only — no per-route breakdown.
- DGCA publishes route-level traffic in PDF statistical reports, not as a
  downloadable per-route dataset; no free DGCA API exposes it.
- No DGCA traffic dataset has been manually downloaded into this repo yet.

The honest substitute: the Airports Authority of India (AAI) publishes
per-airport domestic passenger totals every month in its Traffic News
(Annexure-III B), openly, with no API key or registration. Route weights
are derived from those airport totals with a standard gravity model:

    raw(route A-B) = sqrt(passengers(A) x passengers(B))
    weight(route)  = raw(route) / sum(raw over the basket)

so weights sum to 1.0 across the basket. A gravity weight is a MODELLED
PROXY for route traffic — big airports imply busy routes — not measured
route traffic. It is labelled as such everywhere (API metadata, Airfare
Index page, pitch deck) and must never be presented as DGCA data.

Data: ``backend/data/aai/aai_domestic_passengers_2026-09.csv`` — domestic
passengers by airport, September 2026 (the latest AAI month published at
the time of writing), read from AAI Traffic News Annexure-III B. Full
provenance and cross-checks: ``backend/data/aai/README.md``.

Updating to a newer month
-------------------------
1. Replace the CSV with the new month's Annexure-III B "For The Month"
   figures (same columns, new filename) and update ``AAI_DATA_FILE``,
   ``AAI_TRAFFIC_PERIOD`` and ``AAI_TRAFFIC_SOURCE`` below.
2. Bump ``WEIGHTS_VERSION`` and update the pinned values in
   ``backend/tests/test_weights.py``.
3. Do not mix months inside one file.

How to replace with DGCA weights (future)
-----------------------------------------
1. Obtain DGCA route-level passenger traffic (manual download from DGCA
   statistical reports, or a data.gov.in dataset with per-route traffic).
2. Add the per-route passenger counts to ``DGCA_ROUTE_TRAFFIC`` below, with
   the source document and reference period filled in.
3. Set ``WEIGHT_SOURCE = "DGCA_OFFICIAL"`` and bump ``WEIGHTS_VERSION``.
4. The index engine normalises weights (weighted Jevons), so no engine
   change is needed — weights are relative shares, not absolute counts.

Source / date: AAI September 2026 traffic, retrieved 22 Nov 2026. DGCA
route traffic still unavailable as of 2026-11-22. Re-check before any
finale claim that weights are DGCA-based.
"""
import csv
import logging
import math
from pathlib import Path

from app.services.collector import ROUTE_BASKET as COLLECTION_ROUTE_BASKET

logger = logging.getLogger(__name__)

# --- AAI gravity-model data --------------------------------------------------
AAI_DATA_FILE = "aai_domestic_passengers_2026-09.csv"
AAI_TRAFFIC_SOURCE = (
    "AAI Traffic News, September 2026, Annexure-III B (Domestic Passengers)"
)
AAI_TRAFFIC_PERIOD = "2026-09"
AAI_TRAFFIC_URL = (
    "https://www.aai.aero/sites/default/files/traffic-news/Sep2k26Annex_3.pdf"
)
WEIGHT_FORMULA = (
    "w(route A-B) proportional to sqrt(domestic_pax(A) x domestic_pax(B)), "
    "normalised to sum 1.0 over the basket (AAI airport traffic, gravity model)"
)

# --- Weight regime -----------------------------------------------------------
WEIGHTS_VERSION = "aai-gravity-v1"

# DGCA weights: not available. See module docstring for why.
DGCA_WEIGHTS_STATUS = "UNAVAILABLE"
DGCA_WEIGHTS_NOTE = (
    "DGCA route-level passenger traffic is not available to this project in "
    "machine-readable form, so these are not DGCA weights. The index weights "
    "routes from AAI airport domestic-passenger traffic (September 2026, "
    "Annexure-III B) via a gravity model instead — a modelled proxy for "
    "route traffic, stated here and on the Airfare Index page."
)

# Per-route DGCA passenger counts, when obtained. Empty until a real DGCA
# route-level dataset is downloaded and recorded here with its source.
# Format: {"DEL-BOM": {"passengers": 1234567, "period": "2025-04", ...}, ...}
# Source document / reference period must be filled in when this is populated.
DGCA_ROUTE_TRAFFIC: dict[str, dict] = {}
DGCA_TRAFFIC_SOURCE = None  # e.g. "DGCA Domestic Traffic Report, Apr 2025"
DGCA_TRAFFIC_PERIOD = None  # e.g. "2025-04"


def _aai_data_path() -> Path:
    """backend/data/aai/<file>, resolved from this module's location."""
    return Path(__file__).resolve().parents[2] / "data" / "aai" / AAI_DATA_FILE


def load_aai_airport_traffic(path: str | Path | None = None) -> dict[str, int]:
    """Per-airport domestic passengers from the shipped AAI CSV.

    Returns {IATA: passengers} for the reference month. Raises (FileNotFound,
    KeyError, ValueError) on a missing or malformed file — the caller
    decides whether to fall back to equal shares.
    """
    target = Path(path) if path is not None else _aai_data_path()
    traffic: dict[str, int] = {}
    with open(target, newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            traffic[row["iata_code"].strip().upper()] = int(
                row["domestic_pax_sep_2026"]
            )
    return traffic


def compute_gravity_weights(
    traffic: dict[str, int], routes: list[str]
) -> dict[str, float]:
    """Gravity-model weights from per-airport passengers.

    raw(route A-B) = sqrt(pax(A) * pax(B)); weights are raw values
    normalised to sum 1.0 over the given routes. Raises KeyError if any
    basket airport is missing from ``traffic``.
    """
    raw: dict[str, float] = {}
    for route in routes:
        origin, destination = route.split("-", 1)
        raw[route] = math.sqrt(traffic[origin] * traffic[destination])
    total = sum(raw.values())
    if total <= 0:
        raise ValueError("AAI traffic totals are zero — cannot weight routes.")
    return {route: value / total for route, value in raw.items()}


def _load_route_weights() -> tuple[dict[str, float], dict[str, int], bool]:
    """Load gravity weights; fall back to equal shares if the AAI data is
    unusable, so a missing data file can never break app boot. Returns
    (weights, traffic, fallback_active)."""
    try:
        traffic = load_aai_airport_traffic()
        weights = compute_gravity_weights(traffic, COLLECTION_ROUTE_BASKET)
        return weights, traffic, False
    except Exception:
        logger.exception(
            "AAI traffic data unusable — falling back to equal route shares"
        )
        share = 1.0 / len(COLLECTION_ROUTE_BASKET)
        return {route: share for route in COLLECTION_ROUTE_BASKET}, {}, True


# --- Route weights (current regime) ------------------------------------------
ROUTE_WEIGHTS, AAI_AIRPORT_TRAFFIC, WEIGHTS_FALLBACK_ACTIVE = _load_route_weights()

# The regime reports honestly: AAI_GRAVITY only when the gravity weights
# actually loaded; EQUAL_CONFIGURED when the fallback is in force.
WEIGHT_SOURCE = "AAI_GRAVITY" if not WEIGHTS_FALLBACK_ACTIVE else "EQUAL_CONFIGURED"


def get_weight(route: str) -> float:
    """Weight for one route. Unknown routes get the equal share (1/N)."""
    return ROUTE_WEIGHTS.get(route.upper(), 1.0 / len(ROUTE_WEIGHTS))


def get_route_weights() -> list[dict]:
    """Basket rows for the /index/basket endpoint and the index engine."""
    return [
        {
            "route": route,
            "region": "India",
            "weight": ROUTE_WEIGHTS[route],
            "weight_source": WEIGHT_SOURCE,
        }
        for route in COLLECTION_ROUTE_BASKET
    ]


def weights_metadata() -> dict:
    """Weight-regime metadata for API responses and the frontend."""
    if WEIGHTS_FALLBACK_ACTIVE:
        weight_source_note = (
            "AAI traffic data was unavailable at startup, so the index "
            "temporarily uses equal shares (1/N per route). No DGCA traffic "
            "weights are applied — DGCA route-level traffic data is "
            "unavailable (see backend/app/config/weights.py)."
        )
    else:
        weight_source_note = (
            "Route weights come from AAI airport domestic-passenger traffic "
            "(September 2026, Annexure-III B) via a gravity model: each "
            "route's weight is proportional to sqrt(passengers at origin x "
            "passengers at destination), normalised to sum 1.0. This is a "
            "modelled proxy for route traffic, not measured DGCA route "
            "traffic — DGCA route-level data remains unavailable."
        )
    return {
        "weight_source": WEIGHT_SOURCE,
        "weights_version": WEIGHTS_VERSION,
        "weight_formula": WEIGHT_FORMULA,
        "dgca_weights_status": DGCA_WEIGHTS_STATUS,
        "dgca_weights_note": DGCA_WEIGHTS_NOTE,
        "dgca_traffic_source": DGCA_TRAFFIC_SOURCE,
        "dgca_traffic_period": DGCA_TRAFFIC_PERIOD,
        "aai_traffic_source": AAI_TRAFFIC_SOURCE,
        "aai_traffic_period": AAI_TRAFFIC_PERIOD,
        "aai_traffic_url": AAI_TRAFFIC_URL,
        "weights_fallback_active": WEIGHTS_FALLBACK_ACTIVE,
        "weight_source_note": weight_source_note,
    }
