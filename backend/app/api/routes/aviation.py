"""Live aviation endpoints backed by public ADS-B position data.

The response intentionally distinguishes position telemetry from schedules and
fares. ADS-B data does not reliably contain origin/destination airport data.
"""
from datetime import datetime, timezone
import asyncio
import time
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query
from app.core.config import settings

router = APIRouter(prefix="/aviation", tags=["aviation"])

ADSB_LOL_URL = "https://api.adsb.lol/v2/point/22.9734/78.6569/1000"
# AvioADSB exposes the same readsb-compatible aircraft shape and does not
# require a credential. Keep it as a provider fallback, not as synthetic data.
AVIOADSB_URL = "https://avioadsb.org/v1/point/22.9734/78.6569/100"
OPENSKY_URL = "https://opensky-network.org/api/states/all"
AVIATION_EDGE_URL = "https://aviation-edge.com/v2/public/flights"
AVIATIONSTACK_URL = "https://api.aviationstack.com/v1/flights"
CACHE_TTL_SECONDS = 15
# Keep the last valid positions visible briefly while the provider recovers,
# but never indefinitely and never label them as live.
STALE_RETENTION_SECONDS = 240
_live_cache: dict[str, Any] = {"expires_at": 0.0, "fetched_at": 0.0, "aircraft": [], "source": "", "data_origin": "", "retrieved_at": None}
_schedule_cache: dict[str, dict[str, Any]] = {}


def _number(value: Any):
    return value if isinstance(value, (int, float)) else None


def _normalize_opensky_states(states: Any, limit: int) -> list[dict]:
    """Normalize OpenSky state vectors into the public aircraft contract."""
    if not isinstance(states, list):
        return []
    aircraft = []
    for item in states:
        if not isinstance(item, list) or len(item) < 14:
            continue
        lat, lon = _number(item[6]), _number(item[5])
        if lat is None or lon is None or not (6.0 <= lat <= 37.8 and 67.0 <= lon <= 98.0):
            continue
        aircraft.append({
            "icao24": str(item[0] or "").strip(), "callsign": str(item[1] or "").strip(),
            "registration": "", "aircraft_type": "", "latitude": lat, "longitude": lon,
            "altitude_ft": round(float(item[7]) * 3.28084) if _number(item[7]) is not None else None,
            "ground_speed_kts": round(float(item[9]) * 1.94384) if _number(item[9]) is not None else None,
            "track_deg": _number(item[10]),
            "vertical_rate_fpm": round(float(item[11]) * 196.8504) if _number(item[11]) is not None else None,
            "on_ground": bool(item[8]), "seen_seconds": None,
        })
        if len(aircraft) >= limit:
            break
    return aircraft


def _live_payload(source: str, data_origin: str, aircraft: list[dict], note: str) -> dict:
    retrieved_at = datetime.now(timezone.utc).isoformat()
    _live_cache.update({"expires_at": time.monotonic() + CACHE_TTL_SECONDS, "fetched_at": time.monotonic(), "aircraft": aircraft, "source": source, "data_origin": data_origin, "retrieved_at": retrieved_at})
    return {"source": source, "data_origin": data_origin, "provider_status": "LIVE", "retrieved_at": retrieved_at, "count": len(aircraft), "aircraft": aircraft, "note": note}


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


async def _adsb_compatible_aircraft(client: httpx.AsyncClient, url: str, limit: int) -> list[dict]:
    """Read a live readsb-compatible feed and normalize its aircraft rows."""
    response = await client.get(url, headers={"User-Agent": "AeroPrice-India/2.1"})
    response.raise_for_status()
    payload = response.json()
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
            "latitude": lat, "longitude": lon,
            "altitude_ft": _number(item.get("alt_baro")),
            "ground_speed_kts": _number(item.get("gs")),
            "track_deg": _number(item.get("track")),
            "vertical_rate_fpm": _number(item.get("baro_rate")),
            "on_ground": item.get("alt_baro") == "ground",
            "seen_seconds": seen,
        })
        if len(aircraft) >= limit:
            break
    return aircraft


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
    cache_key = f"{departure.upper()}:{(arrival or '').upper()}"
    cached = _schedule_cache.get(cache_key)
    if not settings.AVIATIONSTACK_API_KEY:
        if cached:
            return {**cached, "status": "LAST_KNOWN", "note": "Current schedule provider is not configured; showing the last valid response."}
        return {"source": "No schedule provider", "data_origin": "POSITION_ONLY", "retrieved_at": None, "count": 0, "flights": [], "status": "POSITION_ONLY", "note": "No authorized schedule provider is configured."}
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
    except (httpx.HTTPError, ValueError):
        if cached:
            return {**cached, "status": "LAST_KNOWN", "note": "Schedule provider failed; showing the last valid response."}
        return {"source": "Aircraft position feed", "data_origin": "POSITION_ONLY", "retrieved_at": None, "count": 0, "flights": [], "status": "POSITION_ONLY", "note": "No schedule response; use the live aircraft feed for current positions."}
    if payload.get("error"):
        # Never return a provider key or request URL in the browser response.
        if cached:
            return {**cached, "status": "LAST_KNOWN", "note": "Schedule provider rejected the request; showing the last valid response."}
        return {"source": "Aircraft position feed", "data_origin": "POSITION_ONLY", "retrieved_at": None, "count": 0, "flights": [], "status": "POSITION_ONLY", "note": "No schedule response; use the live aircraft feed for current positions."}
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
    payload_out = {
        "source": "AviationStack", "data_origin": "LIVE_SCHEDULE_API",
        "retrieved_at": datetime.now(timezone.utc).isoformat(), "count": len(rows), "flights": rows, "status": "LIVE",
    }
    if rows:
        _schedule_cache[cache_key] = payload_out
    elif cached:
        return {**cached, "status": "LAST_KNOWN", "note": "Provider returned no current rows; showing the last valid response."}
    return payload_out


@router.get("/live")
async def live_aircraft(limit: int = Query(default=150, ge=1, le=300)):
    """Return live aircraft with ADSB.lol primary and OpenSky fallback."""
    limit = min(limit, 300)
    if time.monotonic() < float(_live_cache["expires_at"]):
        # This is a short refresh cache of a successful provider response, not
        # stale fallback data. Keep the feed LIVE until the provider actually
        # fails after the cache expires.
        return {"source": _live_cache["source"], "data_origin": _live_cache["data_origin"], "provider_status": "LIVE",
                "retrieved_at": _live_cache["retrieved_at"], "count": len(_live_cache["aircraft"]),
                "aircraft": _live_cache["aircraft"][:limit], "note": "Recent live provider response (15-second refresh cache)."}

    errors = []
    async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
        if settings.AVIATION_EDGE_API_KEY:
            try:
                aircraft = await _aviation_edge_aircraft(client, limit)
                if aircraft:
                    return _live_payload("Aviation Edge", "LIVE_TRACKING_API", aircraft, "Live positions from configured Aviation Edge account.")
            except (httpx.HTTPError, ValueError) as exc:
                errors.append(exc)

        # Public feeds are independent and sometimes rate-limit or sleep. Run
        # them together so one unavailable source cannot make the map wait for
        # every provider timeout in sequence.
        async def fetch_adsb(url: str):
            return await _adsb_compatible_aircraft(client, url, limit)

        async def fetch_opensky():
            response = await client.get(OPENSKY_URL, params={"lamin": 6, "lomin": 67, "lamax": 37.8, "lomax": 98})
            response.raise_for_status()
            return _normalize_opensky_states(response.json().get("states", []), limit)

        results = await asyncio.gather(
            fetch_adsb(ADSB_LOL_URL), fetch_adsb(AVIOADSB_URL), fetch_opensky(),
            return_exceptions=True,
        )
        for result, provider_name, data_origin, note in (
            (results[0], "ADSB.lol", "LIVE_ADSB", "Live transponder positions; routes and fares are not inferred."),
            (results[1], "AvioADSB", "LIVE_ADSB", "Live transponder positions; routes and fares are not inferred."),
            (results[2], "OpenSky", "LIVE_OPENSKY", "Live OpenSky positions used as a public ADS-B fallback."),
        ):
            if isinstance(result, Exception):
                errors.append(result)
            elif result:
                return _live_payload(provider_name, data_origin, result, note)

    cache_age = time.monotonic() - float(_live_cache.get("fetched_at") or 0)
    if _live_cache["aircraft"] and cache_age <= STALE_RETENTION_SECONDS:
        return {"source": _live_cache["source"], "data_origin": _live_cache["data_origin"], "provider_status": "CACHED",
                "retrieved_at": _live_cache["retrieved_at"], "count": len(_live_cache["aircraft"]),
                "aircraft": _live_cache["aircraft"][:limit], "cache_age_seconds": round(cache_age),
                "note": "Provider temporarily unavailable; showing the last valid positions while retrying."}
    return {"source": "Aircraft providers", "data_origin": "ERROR", "provider_status": "ERROR",
            "retrieved_at": None, "count": 0, "aircraft": [],
            "note": "Live aircraft providers are temporarily unavailable."}
