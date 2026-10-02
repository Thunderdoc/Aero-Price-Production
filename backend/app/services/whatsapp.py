"""Optional WhatsApp notification bridge.

The OpenWA client is a Node/browser automation runtime, so it should not run
inside the Vercel Python serverless function.  Instead, run the OpenWA bridge
as a separate always-on service and point these settings at it:

    WHATSAPP_NOTIFICATIONS_ENABLED=true
    WHATSAPP_BRIDGE_URL=https://your-openwa-bridge.example.com
    WHATSAPP_BRIDGE_TOKEN=...

All calls are best-effort.  A WhatsApp outage must never block app workflows.
"""

from __future__ import annotations

import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


def whatsapp_configured() -> bool:
    return bool(
        settings.WHATSAPP_NOTIFICATIONS_ENABLED
        and settings.WHATSAPP_BRIDGE_URL.strip()
        and settings.WHATSAPP_BRIDGE_TOKEN.strip()
    )


async def send_whatsapp_message(to: str | None, message: str) -> bool:
    """Send one WhatsApp message through the configured OpenWA bridge."""
    target = (to or "").strip()
    if not whatsapp_configured() or not target or not message.strip():
        return False

    bridge_url = settings.WHATSAPP_BRIDGE_URL.strip().rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.post(
                f"{bridge_url}/send",
                headers={"Authorization": f"Bearer {settings.WHATSAPP_BRIDGE_TOKEN}"},
                json={"to": target, "message": message.strip()},
            )
            response.raise_for_status()
        return True
    except Exception as exc:  # pragma: no cover - network failures are env-specific
        logger.warning("WhatsApp bridge delivery failed: %s", exc)
        return False


async def notify_admins(message: str) -> bool:
    """Send an operational WhatsApp notification to the configured admin chat."""
    return await send_whatsapp_message(settings.WHATSAPP_ADMIN_TO, message)
