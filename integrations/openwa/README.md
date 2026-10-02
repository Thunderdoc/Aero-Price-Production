# AeroPrice OpenWA WhatsApp Bridge

This optional service connects AeroPrice to WhatsApp through OpenWA:

<https://github.com/rmyndharis/OpenWA.git>

Do not run this inside Vercel serverless. OpenWA needs a persistent Node
process and a browser session. Deploy this folder to an always-on host such as
Render, Railway, Fly.io, or a VPS.

## Run locally

```bash
cd integrations/openwa
npm install
WHATSAPP_BRIDGE_TOKEN=change-me npm start
```

Scan the WhatsApp QR code on first run.

## Backend environment

Set these variables on the AeroPrice backend:

```bash
WHATSAPP_NOTIFICATIONS_ENABLED=true
WHATSAPP_BRIDGE_URL=https://your-openwa-bridge.example.com
WHATSAPP_BRIDGE_TOKEN=the-same-secret-token
WHATSAPP_ADMIN_TO=919999999999
```

`WHATSAPP_ADMIN_TO` may also be an OpenWA group/chat id, such as
`120363000000000000@g.us`.

## Current hooks

When enabled, AeroPrice sends best-effort WhatsApp admin alerts for:

- new user feedback
- new Premium access requests

If the bridge is down, AeroPrice continues normally and logs only a warning.
