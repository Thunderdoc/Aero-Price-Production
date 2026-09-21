"""Live aviation endpoints backed by public ADS-B position data.

The response intentionally distinguishes position telemetry from schedules and
fares. ADS-B data does not reliably contain origin/destination airport data.
"""
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query
from app.core.config import settings

router = APIRouter(prefix="/aviation", tags=["aviation"])

ADSB_LOL_URL = "https://api.adsb.lol/v2/point/22.9734/78.6569/1000"
AVIATION_EDGE_URL = "https://aviation-edge.com/v2/public/flights"
AVIATIONSTACK_URL = "https://api.aviationstack.com/v1/flights"


def _number(value: Any):
    return value if isinstance(value, (int, float)) else None


async def _aviation_edge_aircraft(client: httpx.AsyncClient, limit: int) -> list[dict]:
    """Normalize Aviation Edge into the same public aircraft contract."""
    response = await client.get(AVIATION_EDGE_URL, params={
        "key": settings.AVIATION_EDGE_API_KEY, "lat": 22.9734, "lng": 78.6569,
        "distance": 1800, "limit": limit,
    })
    response.raise_for_status()
    rows = response.json()
    if not isinstance(rows, list):
        return []
    normalized = []
    for item in rows:
        geo, aircraft, flight, airline = item.get("geography", {}), item.get("aircraft", {}), item.get("flight", {}), item.get("airline", {})
        lat, lon = _number(geo.get("latitude")), _number(geo.get("longitude"))
        if lat is None or lon is None or not (6.0 <= lat <= 37.8 and 67.0 <= lon <= 98.0):
            continue
        normalized.append({
            "icao24": str(aircraft.get("icao24") or "").lower(),
            "callsign": str(flight.get("iataNumber") or flight.get("icaoNumber") or "").strip(),
            "registration": str(aircraft.get("regNumber") or "").strip(),
            "aircraft_type": str(aircraft.get("iataCode") or "").strip(),
            "latitude": lat, "longitude": lon,
            "altitude_ft": _number(geo.get("altitude")),
            "ground_speed_kts": _number(item.get("speed", {}).get("horizontal")),
            "track_deg": _number(geo.get("direction")),
            "vertical_rate_fpm": _number(item.get("speed", {}).get("vspeed")),
            "on_ground": bool(item.get("speed", {}).get("isGround")),
            "seen_seconds": None,
        })
    return normalized[:limit]


@router.get("/schedules")
async def flight_schedules(
    departure: str = Query(default="DEL", min_length=3, max_length=3),
    arrival: str | None = Query(default=None, min_length=3, max_length=3),
    limit: int = Query(default=25, ge=1, le=100),
):
    """Return real schedule/status rows from the configured AviationStack account.

    Position telemetry remains at /aviation/live; this endpoint intentionally
    does not infer a route from an ADS-B transponder signal.
    """
    if not settings.AVIATIONSTACK_API_KEY:
        raise HTTPException(status_code=503, detail="AviationStack is not configured on this server.")
    params = {
        "access_key": settings.AVIATIONSTACK_API_KEY,
        "dep_iata": departure.upper(),
        "limit": limit,
    }
    if arrival:
        params["arr_iata"] = arrival.upper()
    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            response = await client.get(AVIATIONSTACK_URL, params=params)
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"AviationStack returned HTTP {exc.response.status_code}.") from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="AviationStack is temporarily unavailable.") from exc
    if payload.get("error"):
        # Never return a provider key or request URL in the browser response.
        raise HTTPException(status_code=502, detail=f"AviationStack rejected the request: {payload['error'].get('message', 'unknown error')}")
    rows = []
    for item in payload.get("data", []):
        dep, arr, airline, flight = item.get("departure", {}), item.get("arrival", {}), item.get("airline", {}), item.get("flight", {})
        rows.append({
            "flight_iata": flight.get("iata") or "",
            "airline_name": airline.get("name") or "",
            "airline_iata": airline.get("iata") or "",
            "dep_iata": dep.get("iata") or departure.upper(),
            "dep_city": dep.get("airport") or "",
            "arr_iata": arr.get("iata") or "",
            "arr_city": arr.get("airport") or "",
            "dep_scheduled": dep.get("scheduled") or "",
            "arr_scheduled": arr.get("scheduled") or "",
            "status": item.get("flight_status") or "unknown",
            "dep_actual": dep.get("actual"),
            "arr_actual": arr.get("actual"),
        })
    return {
        "source": "AviationStack", "data_origin": "LIVE_SCHEDULE_API",
        "retrieved_at": datetime.now(timezone.utc).isoformat(), "count": len(rows), "flights": rows,
    }


@router.get("/live")
async def live_aircraft(limit: int = Query(default=150, ge=1, le=300)):
    """Return recent aircraft positions within India from ADSB.lol."""
    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            if settings.AVIATION_EDGE_API_KEY:
                try:
                    aircraft = await _aviation_edge_aircraft(client, limit)
                    if aircraft:
                        return {
                            "source": "Aviation Edge", "data_origin": "LIVE_TRACKING_API",
                            "retrieved_at": datetime.now(timezone.utc).isoformat(), "count": len(aircraft),
                            "aircraft": aircraft, "note": "Live positions from configured Aviation Edge account.",
                        }
                except httpx.HTTPError:
                    # Do not take tracking offline merely because the optional provider fails.
                    pass
            response = await client.get(ADSB_LOL_URL, headers={"User-Agent": "AeroPrice-India/2.1"})
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Live ADS-B provider is temporarily unavailable.") from exc

    aircraft = []
    for item in payload.get("ac", []):
        lat, lon = _number(item.get("lat")), _number(item.get("lon"))
        if lat is None or lon is None or not (6.0 <= lat <= 37.8 and 67.0 <= lon <= 98.0):
            continue
        seen = _number(item.get("seen"))
        if seen is not None and seen > 90:
            continue
        aircraft.append({
            "icao24": str(item.get("hex") or "").strip(),
            "callsign": str(item.get("flight") or "").strip(),
            "registration": str(item.get("r") or "").strip(),
            "aircraft_type": str(item.get("t") or "").strip(),
            "latitude": lat,
            "longitude": lon,
            "altitude_ft": _number(item.get("alt_baro")),
            "ground_speed_kts": _number(item.get("gs")),
            "track_deg": _number(item.get("track")),
            "vertical_rate_fpm": _number(item.get("baro_rate")),
            "on_ground": item.get("alt_baro") == "ground",
            "seen_seconds": seen,
        })
        if len(aircraft) >= limit:
            break

    return {
        "source": "ADSB.lol",
        "data_origin": "LIVE_ADSB",
        "license": "ODbL-1.0",
        "retrieved_at": datetime.now(timezone.utc).isoformat(),
        "count": len(aircraft),
        "aircraft": aircraft,
        "note": "Live transponder positions; routes and fares are not inferred.",
    }
