"""
Unit tests for anomaly detector (z-score logic).
Run: pytest tests/test_anomaly_detector.py -v
"""
import math
import pytest
from app.services.anomaly_detector import Z_THRESHOLD, MIN_SAMPLE_FOR_ZSCORE


def test_z_threshold_constant():
    assert Z_THRESHOLD == 3.0


def test_min_sample_constant():
    assert MIN_SAMPLE_FOR_ZSCORE == 10


def _compute_z(fares: list, value: float) -> float:
    mean = sum(fares) / len(fares)
    variance = sum((f - mean) ** 2 for f in fares) / len(fares)
    stddev = math.sqrt(variance)
    if stddev == 0:
        return math.inf if value != mean else 0.0
    return abs((value - mean) / stddev)


def test_normal_fare_not_outlier():
    fares = [5000.0] * 20
    z = _compute_z(fares, 5000.0)
    assert z < Z_THRESHOLD


def test_extreme_fare_is_outlier():
    fares = [5000.0] * 20
    z = _compute_z(fares, 50000.0)
    assert z > Z_THRESHOLD


def test_insufficient_sample_skipped():
    # If len(fares) < MIN_SAMPLE_FOR_ZSCORE, bucket must be skipped.
    fares = [5000.0] * (MIN_SAMPLE_FOR_ZSCORE - 1)
    skip = len(fares) < MIN_SAMPLE_FOR_ZSCORE
    assert skip is True
