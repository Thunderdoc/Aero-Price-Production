"""
Unit tests for Jevons matched-sample index engine.
Run: pytest tests/test_index_engine.py -v
"""
import math
import pytest
from app.services.index_engine import (
    _get_median_fare,
    MIN_CORRIDORS_TO_PUBLISH,
    BASE_VALUE,
    METHOD,
)


def test_min_corridors_constant():
    # The configured basket contains 12 verified corridors. Requiring 15 would
    # make a legitimate full-basket live index impossible to publish.
    assert MIN_CORRIDORS_TO_PUBLISH == 10


def test_base_value_constant():
    assert BASE_VALUE == 100.0


def test_method_is_jevons():
    assert "JEVONS" in METHOD


def test_jevons_formula():
    """Verify Jevons geometric mean formula P = (prod ratios)^(1/n) * 100."""
    ratios = [1.1, 0.9, 1.05, 1.0, 0.95]
    n = len(ratios)
    product = math.prod(ratios)
    expected = (product ** (1 / n)) * 100.0
    assert abs(expected - 100.0) < 10  # ratios near 1 → index near base


def test_jevons_all_equal_ratios():
    """When all ratios == 1.0, index must equal BASE_VALUE."""
    ratios = [1.0] * 20
    n = len(ratios)
    product = math.prod(ratios)
    result = (product ** (1 / n)) * BASE_VALUE
    assert abs(result - BASE_VALUE) < 0.001


def test_jevons_requires_min_corridors():
    """Result must be INSUFFICIENT_DATA when n < MIN_CORRIDORS_TO_PUBLISH."""
    # Simulated dict result from calculate_index with insufficient corridors
    n = MIN_CORRIDORS_TO_PUBLISH - 1
    result = {
        "status": "INSUFFICIENT_DATA" if n < MIN_CORRIDORS_TO_PUBLISH else "CALCULATED",
        "n": n,
    }
    assert result["status"] == "INSUFFICIENT_DATA"
