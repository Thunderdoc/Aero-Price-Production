"""
Route basket seed data.

Seeds the route_baskets table if it is empty.
All 12 monitored domestic corridors with equal weights.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.index import RouteBasket

SEED_ROUTES = [
    ("DEL-BOM", 1.0), ("DEL-BLR", 1.0), ("BOM-BLR", 1.0),
    ("DEL-CCU", 1.0), ("DEL-HYD", 1.0), ("DEL-MAA", 1.0),
    ("BOM-CCU", 1.0), ("BOM-HYD", 1.0), ("BLR-CCU", 1.0),
    ("BLR-HYD", 1.0), ("MAA-DEL", 1.0), ("MAA-BOM", 1.0),
]


async def seed_route_basket(db: AsyncSession) -> int:
    """Insert default routes if the basket is empty. Returns number of routes added."""
    existing = await db.scalar(select(func.count()).select_from(RouteBasket))
    if existing and existing > 0:
        return 0
    for route, weight in SEED_ROUTES:
        origin, destination = route.split("-", 1)
        db.add(RouteBasket(
            route_code=route,
            origin=origin,
            destination=destination,
            region="DOMESTIC_TRUNK",
            weight=weight,
            active=True,
        ))
    await db.commit()
    return len(SEED_ROUTES)
