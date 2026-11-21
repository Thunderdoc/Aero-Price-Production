"""Server-side evaluation of approved Premium fare thresholds."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.access import PriceAlert, UserNotification
from app.models.fare import FareObservation
from app.models.user import AuditLog

# Alerts fire only on fares collected within this window. A 2-month-old fare
# must never trigger an alert — the old query took the minimum over ALL stored
# rows with no collected_at window at all.
ALERT_FRESHNESS_HOURS = 48

# Origins eligible for alert evaluation: genuine observed fares, including
# honestly-labelled PUBLIC_INTERFACE (scraped) fares. SANDBOX_TEST and
# GENERATED_TEST are never eligible.
_ALERT_ORIGINS = ("REAL", "OFFICIAL", "PUBLIC_INTERFACE")


async def evaluate_price_alerts(db: AsyncSession) -> int:
    """Record the first verified target hit for every active server alert.

    Evaluation deliberately uses only REAL, OFFICIAL or PUBLIC_INTERFACE,
    valid observations collected within the last ALERT_FRESHNESS_HOURS.
    A triggered alert stays recorded rather than repeatedly sending the same
    notification each collection interval.
    """
    alerts = (await db.execute(select(PriceAlert).where(
        PriceAlert.status == "ACTIVE",
        PriceAlert.triggered_at.is_(None),
    ))).scalars().all()
    triggered = 0
    fresh_since = datetime.now(timezone.utc) - timedelta(hours=ALERT_FRESHNESS_HOURS)
    for alert in alerts:
        query = select(func.min(FareObservation.total_fare)).where(
            FareObservation.route == alert.route,
            FareObservation.is_valid == True,
            FareObservation.data_origin.in_(_ALERT_ORIGINS),
            FareObservation.collected_at >= fresh_since,
        )
        if alert.travel_date:
            query = query.where(FareObservation.travel_date == alert.travel_date)
        observed = await db.scalar(query)
        if observed is None:
            continue
        observed_fare = float(observed)
        alert.last_observed_fare = observed_fare
        if observed_fare > alert.target_fare:
            continue
        alert.triggered_at = datetime.now(timezone.utc)
        db.add(UserNotification(
            user_email=alert.user_email,
            title="Fare target reached",
            message=f"{alert.route.replace('-', ' → ')} is available from ₹{observed_fare:,.0f}, meeting your ₹{alert.target_fare:,.0f} target.",
        ))
        db.add(AuditLog(
            user_email=alert.user_email,
            action="PRICE_ALERT_TRIGGERED",
            resource_type="price_alert",
            resource_id=alert.id,
            details={"route": alert.route, "target_fare": alert.target_fare, "observed_fare": observed_fare},
        ))
        triggered += 1
    if triggered:
        await db.flush()
    return triggered
