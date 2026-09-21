"""Map tile proxy routes.

The browser should not receive provider tokens in tile URLs. This proxy keeps
the Carto key server-side while preserving Leaflet's standard z/x/y tile shape.
"""
import httpx
from fastapi import APIRouter, HTTPException, Response

from app.core.config import settings

router = APIRouter(prefix="/maps", tags=["maps"])


@router.get("/carto/{z}/{x}/{y}.png")
async def carto_basemap_tile(z: int, x: int, y: int):
    if z < 0 or z > 19:
        raise HTTPException(status_code=400, detail="Invalid zoom level")
    max_tile = (1 << z) - 1
    if x < 0 or y < 0 or x > max_tile or y > max_tile:
        raise HTTPException(status_code=400, detail="Invalid tile coordinate")

    params = {"api_key": settings.CARTO_API_KEY} if settings.CARTO_API_KEY else None
    url = f"https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"
    try:
        async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
            upstream = await client.get(url, params=params)
            upstream.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail="Carto tile provider error")
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Carto tile provider unavailable")

    return Response(
        content=upstream.content,
        media_type=upstream.headers.get("content-type", "image/png"),
        headers={"Cache-Control": "public, max-age=86400"},
    )
