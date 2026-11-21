"""
Index route weights configuration.

Current state (21 Nov 2026): EQUAL WEIGHTS, explicitly documented as a
limitation — NOT DGCA traffic weights.

Why equal weights
-----------------
SIH26056 asks for the basket to be selected and weighted on the basis of DGCA
passenger-traffic data. Route-level DGCA traffic (passengers per city-pair,
per month) is NOT available to this project in machine-readable form:

- The DGCA monthly dataset the backend can fetch (`dgca_monthly` table)
  carries total domestic passengers only — no per-route breakdown.
- DGCA publishes route-level traffic in PDF statistical reports, not as a
  downloadable per-route dataset; no free DGCA API exposes it.
- No DGCA traffic dataset has been manually downloaded into this repo yet.

So every route currently carries weight 1.0 and the index is an unweighted
(geometric-mean) Jevons index. This is a STATED LIMITATION, shown on the
Airfare Index page and in the pitch deck — never silently presented as a
DGCA-weighted index.

How to replace with DGCA weights
--------------------------------
1. Obtain DGCA route-level passenger traffic (manual download from DGCA
   statistical reports, or a data.gov.in dataset with per-route traffic).
2. Add the per-route passenger counts to ``DGCA_ROUTE_TRAFFIC`` below, with
   the source document and reference period filled in.
3. Set ``WEIGHT_SOURCE = "DGCA_OFFICIAL"`` and bump ``WEIGHTS_VERSION``.
4. The index engine normalises weights (weighted Jevons), so no engine change
   is needed — weights are relative shares, not absolute counts.

Source / date: DGCA traffic data unavailable as of 2026-11-21. Re-check before
any finale claim that weights are DGCA-based.
"""
from app.services.collector import ROUTE_BASKET as COLLECTION_ROUTE_BASKET

# --- Weight regime -----------------------------------------------------------
WEIGHT_SOURCE = "EQUAL_CONFIGURED"
WEIGHTS_VERSION = "equal-weights-v1"

# DGCA weights: not available. See module docstring for why.
DGCA_WEIGHTS_STATUS = "UNAVAILABLE"
DGCA_WEIGHTS_NOTE = (
    "DGCA route-level passenger traffic is not available to this project in "
    "machine-readable form (the DGCA monthly feed carries total domestic "
    "passengers only, with no per-route breakdown). The index therefore uses "
    "equal 1.0 weights for every route. This is a stated limitation, not a "
    "DGCA-weighted index."
)

# Per-route DGCA passenger counts, when obtained. Empty until a real DGCA
# route-level dataset is downloaded and recorded here with its source.
# Format: {"DEL-BOM": {"passengers": 1234567, "period": "2025-04", ...}, ...}
# Source document / reference period must be filled in when this is populated.
DGCA_ROUTE_TRAFFIC: dict[str, dict] = {}
DGCA_TRAFFIC_SOURCE = None  # e.g. "DGCA Domestic Traffic Report, Apr 2025"
DGCA_TRAFFIC_PERIOD = None  # e.g. "2025-04"

# --- Equal weights (current regime) ------------------------------------------
ROUTE_WEIGHTS: dict[str, float] = {route: 1.0 for route in COLLECTION_ROUTE_BASKET}


def get_weight(route: str) -> float:
    """Weight for one route. 1.0 for every route under equal weighting."""
    return ROUTE_WEIGHTS.get(route.upper(), 1.0)


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
    return {
        "weight_source": WEIGHT_SOURCE,
        "weights_version": WEIGHTS_VERSION,
        "dgca_weights_status": DGCA_WEIGHTS_STATUS,
        "dgca_weights_note": DGCA_WEIGHTS_NOTE,
        "dgca_traffic_source": DGCA_TRAFFIC_SOURCE,
        "dgca_traffic_period": DGCA_TRAFFIC_PERIOD,
        "weight_source_note": (
            "The current index calculation uses equal 1.0 weights for every "
            "collection route. No DGCA traffic weights are applied — DGCA "
            "route-level traffic data is unavailable (see backend/app/config/"
            "weights.py). This is a stated limitation."
        ),
    }
