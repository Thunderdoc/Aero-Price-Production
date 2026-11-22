"""
Routes basket API — the monitored route list and per-route coverage.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from collections import defaultdict
from datetime import date, datetime, time, timezone, timedelta
from app.core.database import get_db
from app.models.fare import FareObservation
from app.services.collector import ROUTE_BASKET

router = APIRouter()
# PUBLIC_INTERFACE (scraped Google Flights fares, honestly labelled) counts as
# live data here — same set as the fares listing and the index.
LIVE_ORIGINS = ("REAL", "OFFICIAL", "PUBLIC_INTERFACE")

# M5 — minimum quotes for a latest-collection-day median to stand on its own.
# Below this floor the median falls back to the wider recent window below, so
# a route is never priced from a handful of quotes (CCU-IMF once had 2).
MIN_SAMPLES_LATEST_DAY = 10
# M5 — fallback window (calendar days, ending on the route's own latest
# collection day) used when the latest day alone has fewer than
# MIN_SAMPLES_LATEST_DAY quotes. The window is anchored to each route's own
# latest collection day, not to today, so stale-but-real data still yields a
# meaningful median instead of an empty or 2-quote one.
FALLBACK_WINDOW_DAYS = 7

AIRPORTS = {
    "DEL": {"name": "Indira Gandhi International", "city": "New Delhi"},
    "BOM": {"name": "Chhatrapati Shivaji Maharaj International", "city": "Mumbai"},
    "BLR": {"name": "Kempegowda International", "city": "Bengaluru"},
    "CCU": {"name": "Netaji Subhas Chandra Bose International", "city": "Kolkata"},
    "HYD": {"name": "Rajiv Gandhi International", "city": "Hyderabad"},
    "MAA": {"name": "Chennai International", "city": "Chennai"},
}


def _median(values: list[float]) -> float | None:
    """Median of a list of prices; None when empty (SQLite path only — the
    PostgreSQL path computes the median in SQL via percentile_cont)."""
    if not values:
        return None
    values = sorted(values)
    midpoint = len(values) // 2
    return values[midpoint] if len(values) % 2 else (values[midpoint - 1] + values[midpoint]) / 2


@router.get("/routes")
async def list_routes(
    db: AsyncSession = Depends(get_db),
):
    """Return the monitored route basket with per-route observation counts."""
    since_7d = datetime.now(timezone.utc) - timedelta(days=7)

    counts_7d = dict((row[0], row[1]) for row in (await db.execute(
        select(FareObservation.route, func.count()).where(
            and_(FareObservation.data_origin.in_(LIVE_ORIGINS), FareObservation.collected_at >= since_7d)
        ).group_by(FareObservation.route)
    )).all())
    # M1 — has_data means "has any stored observations", not "collected in
    # the last 7 days": the live DB's newest data is weeks old, so the 7-day
    # gate marked every route NO_DATA and the map drew nothing. The 7-day
    # count stays available (observations_7d) and staleness is surfaced by
    # last_collected_at on /routes/summary — the gate no longer hides data.
    counts_total = dict((row[0], row[1]) for row in (await db.execute(
        select(FareObservation.route, func.count()).where(
            FareObservation.data_origin.in_(LIVE_ORIGINS)
        ).group_by(FareObservation.route)
    )).all())
    routes = []
    for route in ROUTE_BASKET:
        origin_code, dest_code = route.split("-")
        count_7d = counts_7d.get(route, 0)
        total = counts_total.get(route, 0)
        routes.append({
            "route": route,
            "origin": origin_code,
            "destination": dest_code,
            "origin_name": AIRPORTS.get(origin_code, {}).get("city", origin_code),
            "destination_name": AIRPORTS.get(dest_code, {}).get("city", dest_code),
            "observations_7d": count_7d or 0,
            "observations_total": total or 0,
            "has_data": (total or 0) > 0,
            "status": "ACTIVE" if (total or 0) > 0 else "NO_DATA",
        })

    return {
        "routes": routes,
        "total": len(routes),
        "advance_windows": [1, 7, 15, 30, 45],
        "basket_version": "v1.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/routes/summary")
async def route_summaries(db: AsyncSession = Depends(get_db)):
    """Return verified route medians in one request for fast map rendering.

    M5 — each route's median is over its latest COLLECTION day (the dashboard
    approach), falling back to the recent FALLBACK_WINDOW_DAYS window when
    that day has fewer than MIN_SAMPLES_LATEST_DAY quotes.
    S3 — aggregates run in SQL (GROUP BY route; median via percentile_cont on
    PostgreSQL, via a lightweight (route, price) column query on SQLite).
    The full fare table is never loaded into Python.
    """
    base_filters = [
        FareObservation.data_origin.in_(LIVE_ORIGINS),
        FareObservation.is_valid.is_(True),
        FareObservation.currency == "INR",
        FareObservation.cabin == "ECONOMY",
        FareObservation.total_fare.is_not(None),
    ]

    # Per (route, collection day) quote counts — one small GROUP BY whose
    # result is bounded by routes x collection days, not by row count.
    day_rows = (await db.execute(
        select(
            FareObservation.route,
            func.date(FareObservation.collected_at).label("day"),
            func.count(),
        )
        .where(*base_filters)
        .group_by(FareObservation.route, func.date(FareObservation.collected_at))
    )).all()
    if not day_rows:
        return {"summaries": {}, "timestamp": datetime.now(timezone.utc).isoformat()}

    counts_by_route_day: dict[str, dict[date, int]] = defaultdict(dict)
    for route, day, count in day_rows:
        # func.date returns a date on PostgreSQL, a 'YYYY-MM-DD' string on
        # SQLite — normalise to date either way.
        counts_by_route_day[route][date.fromisoformat(str(day))] = count

    # Per-route window: the latest collection day, unless it is too thin,
    # in which case the FALLBACK_WINDOW_DAYS ending on that day.
    windows: dict[str, tuple[date, date, int, int]] = {}
    for route, day_counts in counts_by_route_day.items():
        latest_day = max(day_counts)
        if day_counts[latest_day] >= MIN_SAMPLES_LATEST_DAY:
            windows[route] = (latest_day, latest_day, 1, day_counts[latest_day])
        else:
            start_day = latest_day - timedelta(days=FALLBACK_WINDOW_DAYS - 1)
            sample_count = sum(
                count for day, count in day_counts.items()
                if start_day <= day <= latest_day
            )
            windows[route] = (start_day, latest_day, FALLBACK_WINDOW_DAYS, sample_count)

    # Window filter: each route contributes only rows inside its own window.
    # Datetime bounds (UTC) keep the collected_at index usable.
    window_conditions = []
    for route, (start_day, end_day, _days, _n) in windows.items():
        window_conditions.append(and_(
            FareObservation.route == route,
            FareObservation.collected_at >= datetime.combine(start_day, time.min, tzinfo=timezone.utc),
            FareObservation.collected_at < datetime.combine(end_day + timedelta(days=1), time.min, tzinfo=timezone.utc),
        ))

    bind = db.bind
    dialect = bind.dialect.name if bind is not None else ""
    agg_columns = [
        FareObservation.route,
        func.count().label("n"),
        func.min(FareObservation.total_fare).label("min_fare"),
        func.max(FareObservation.total_fare).label("max_fare"),
        func.max(FareObservation.collected_at).label("last_collected"),
    ]
    if dialect == "postgresql":
        # PostgreSQL computes the median in SQL — no price rows cross the wire.
        agg_columns.append(
            func.percentile_cont(0.5).within_group(FareObservation.total_fare).label("median_fare")
        )
    agg_rows = (await db.execute(
        select(*agg_columns)
        .where(*base_filters, or_(*window_conditions))
        .group_by(FareObservation.route)
    )).all()

    medians: dict[str, float | None] = {}
    if dialect == "postgresql":
        medians = {
            row.route: (float(row.median_fare) if row.median_fare is not None else None)
            for row in agg_rows
        }
    else:
        # SQLite has no percentile function: median in Python, but only from
        # a lightweight (route, price) column query over the chosen windows —
        # never full ORM objects, never the whole table.
        price_rows = (await db.execute(
            select(FareObservation.route, FareObservation.total_fare)
            .where(*base_filters, or_(*window_conditions))
        )).all()
        prices_by_route: dict[str, list[float]] = defaultdict(list)
        for route, price in price_rows:
            if price is not None:
                prices_by_route[route].append(float(price))
        medians = {route: _median(prices) for route, prices in prices_by_route.items()}

    summaries = {}
    for row in agg_rows:
        median = medians.get(row.route)
        if median is None:
            continue
        start_day, end_day, window_days, _n = windows[row.route]
        summaries[row.route] = {
            "median": median,
            "min": float(row.min_fare),
            "max": float(row.max_fare),
            "count": row.n,
            # M5 — the number of quotes behind this median, so the UI can
            # show it honestly instead of implying a full sample.
            "sample_count": row.n,
            # The route's latest collection day (YYYY-MM-DD) — the day the
            # median is anchored to. When sample_window_days is 1 this is
            # the whole sample ("Latest-day median"); otherwise the median
            # spans sample_period_start..sample_period.
            "sample_period": end_day.isoformat(),
            "sample_period_start": start_day.isoformat(),
            "sample_window_days": window_days,
            "last_collected_at": row.last_collected.isoformat() if row.last_collected else None,
        }
    return {"summaries": summaries, "timestamp": datetime.now(timezone.utc).isoformat()}


@router.get("/context")
async def system_context(
    db: AsyncSession = Depends(get_db),
):
    """Overall system context: coverage, freshness, data-origin breakdown."""
    total = await db.scalar(
        select(func.count()).select_from(FareObservation)
        .where(FareObservation.data_origin.in_(LIVE_ORIGINS))
    )
    since_24h = datetime.now(timezone.utc) - timedelta(hours=24)
    fresh = await db.scalar(
        select(func.count()).select_from(FareObservation)
        .where(and_(
            FareObservation.data_origin.in_(LIVE_ORIGINS),
            FareObservation.collected_at >= since_24h,
        ))
    )
    return {
        "real_observations_total": total or 0,
        "real_observations_24h": fresh or 0,
        "routes_monitored": len(ROUTE_BASKET),
        "advance_windows": [1, 7, 15, 30, 45],
        "airline_sources_status": "AGGREGATOR_LIVE" if (fresh or 0) > 0 else "NO_LIVE_DATA",
        "airline_sources_note": "Verified aggregator fares available. Direct airline feeds still require authorized credentials." if (fresh or 0) > 0 else "No verified fares collected in the past 24 hours.",
        "system_status": "OPERATIONAL" if (fresh or 0) > 0 else "AWAITING_REAL_DATA",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
