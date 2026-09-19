"""
Unit tests for the forecast engine (Holt-Winters, INSUFFICIENT_DATA guard).
Run: pytest tests/test_forecast_engine.py -v
"""
import pytest
from app.services.forecast_engine import (
    _holt_winters_simple,
    _forecast_next,
    _mae,
    _rmse,
    _mape,
    MIN_OBS_FOR_FORECAST,
    FORECAST_HORIZONS_DAYS,
)


def test_holt_winters_same_length():
    series = [100.0, 110.0, 105.0, 115.0, 108.0]
    smoothed = _holt_winters_simple(series)
    assert len(smoothed) == len(series)


def test_holt_winters_constant_series():
    series = [500.0] * 10
    smoothed = _holt_winters_simple(series)
    assert all(abs(v - 500.0) < 1e-3 for v in smoothed)


def test_forecast_next_upward_trend():
    series = [100.0, 110.0, 120.0, 130.0, 140.0]
    forecast = _forecast_next(series, 1)
    assert forecast > 140.0, "Forecast should extrapolate upward trend"


def test_mae_perfect():
    actual = [100.0, 200.0, 300.0]
    predicted = [100.0, 200.0, 300.0]
    assert _mae(actual, predicted) == 0.0


def test_rmse_basic():
    actual = [100.0, 200.0]
    predicted = [110.0, 190.0]
    assert _rmse(actual, predicted) == pytest.approx(10.0, abs=0.01)


def test_mape_basic():
    actual = [100.0, 200.0]
    predicted = [110.0, 190.0]
    expected_mape = (10 + 5) / 2  # 10% + 5% averaged
    assert _mape(actual, predicted) == pytest.approx(expected_mape, abs=0.01)


def test_min_obs_constant():
    assert MIN_OBS_FOR_FORECAST == 14


def test_forecast_horizons():
    assert 2 in FORECAST_HORIZONS_DAYS
    assert 7 in FORECAST_HORIZONS_DAYS
    assert 14 in FORECAST_HORIZONS_DAYS
