# Deployment Guide

AeroPrice is **one Vercel deployment serving both halves**: the static React SPA from `dist/`, and every `/api/*` request via a single Python serverless function (`api/index.py` → the FastAPI app in `backend/main.py`). There is no separate backend host and no Netlify deployment.

**Live URL:** https://aero-price-production.vercel.app

## 1. How the deployment fits together

```
Browser ──> Vercel ──> /            → static SPA (dist/, built by `npm run build`)
                 └──> /api/*       → serverless function (api/index.py → FastAPI)
                 └──> /api/collections/cron (daily 00:00 UTC, vercel.json)
```

- `vercel.json` defines the rewrites, the 60-second `maxDuration` for the API function, and the daily cron. Vercel Hobby allows daily crons only.
- The frontend talks to the backend over **same-origin `/api`** in production. `VITE_API_URL` is ignored by the production build (see §5) — do not set it expecting a split deploy.
- Collection does **not** run inside the Vercel function (a full sweep cannot finish in 60 s). Collection runs on the free GitHub Actions worker (`.github/workflows/`) against the hosted database; the Vercel cron is only a lightweight trigger. See `backend/app/services/collector.py` (`run_collection_chunk`).

## 2. Vercel project settings

- Framework preset: Vite
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `dist`
- Root `requirements.txt` is the serverless function's Python manifest (it must stay in sync with `backend/requirements.txt`).

### Environment variables (Vercel dashboard)

Backend (required):

```bash
ENVIRONMENT=production
SECRET_KEY=<generate-a-long-random-secret>   # required; the app refuses to boot without one
DATABASE_URL=<hosted-postgres-url>           # Supabase/Neon free tier; SQLite cannot persist on Vercel
ALLOWED_ORIGINS=https://aero-price-production.vercel.app
CRON_SECRET=<random-16+-char-secret>         # the daily cron sends it as a Bearer token
AEROPRICE_INIT_SCHEMA_ON_STARTUP=1           # set for ONE deploy to create tables, then remove
```

Backend (optional, fare/government providers — all free tiers):

```bash
SERPAPI_API_KEY=<free SerpApi key, 250 searches/mo>
AMADEUS_API_KEY=<free Amadeus test key>
AMADEUS_API_SECRET=<free Amadeus test secret>
AMADEUS_ENV=sandbox                             # test env returns synthetic fares, tagged SANDBOX_TEST
DUFFEL_ACCESS_TOKEN=<Duffel test token>
DATAGOV_API_KEY=<free data.gov.in key>
MOSPI_API_EMAIL=<free MoSPI portal email>
MOSPI_API_PASSWORD=<free MoSPI portal password>
```

Frontend (build-time, `VITE_*`):

```bash
VITE_FIREBASE_API_KEY=YOUR_FIREBASE_WEB_API_KEY
VITE_FIREBASE_AUTH_DOMAIN=YOUR_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID=YOUR_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET=YOUR_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID=YOUR_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID=YOUR_FIREBASE_APP_ID
VITE_FIREBASE_MEASUREMENT_ID=YOUR_FIREBASE_MEASUREMENT_ID
VITE_FIREBASE_ADMIN_EMAILS=YOUR_ADMIN_EMAILS
VITE_AUTH_MODE=backend        # default; set to `firebase` only to use Firebase auth
```

Do **not** set `VITE_API_URL` for the Vercel deployment: the production frontend uses same-origin `/api`, and a stale `VITE_API_URL` breaks the app (`src/services/api.ts`). `VITE_API_URL` is only for local development against a backend on another port.

## 3. Database

- Production uses a hosted Postgres (`DATABASE_URL`). SQLite cannot persist on Vercel's ephemeral filesystem: any SQLite file is per-instance and vanishes on cold start.
- Schema creation: set `AEROPRICE_INIT_SCHEMA_ON_STARTUP=1` for one deploy (or run the Alembic migrations in `backend/alembic/` against the hosted DB), verify `/api/health` returns `database: "connected"`, then remove the flag.
- If `DATABASE_URL` is unset, the entrypoint falls back to an empty ephemeral SQLite database and `/api/health` honestly reports `NO_LIVE_DATA` — collection is disabled in that mode. Do NOT "fix" a dead database by unsetting `DATABASE_URL`.
- The old committed snapshot `backend/aeroprice.db` was removed from the repo (21 Nov 2026). There is no bundled snapshot anymore.

## 4. Firebase setup for Google Auth

In Firebase Console (project `sih2026-airfare-index`):

1. Open Authentication → Sign-in method.
2. Enable Google (and Email/Password if password login via Firebase is wanted).
3. Go to Authentication → Settings → Authorized domains.
4. Add:
   - `localhost` for local development
   - `aero-price-production.vercel.app`
   - your final custom domain, if any

If the deployed app says the domain is not authorized, the frontend is working but Firebase has not allowed that domain yet.

Backend Firebase verification needs `FIREBASE_PROJECT_ID` set; admin invites need `FIREBASE_SERVICE_ACCOUNT_JSON` (without it the invite flow returns 503).

## 5. Fare collection — what actually runs

- The demo fare source is the Google Flights public interface via the `fast-flights` adapter, run from the GitHub Actions worker with throttling. Fares collected this way are labelled `PUBLIC_INTERFACE` (never `REAL`, never "GDS fare") and feed the index under the disclosed SIH-demo methodology — see `PROVIDER_SCORECARD.md` and `backend/app/config/weights.py`.
- Amadeus and Duffel adapters are wired into the collector (`backend/app/services/collector.py`, `_make_adapters()`). Their test/sandbox environments return synthetic fares, tagged `SANDBOX_TEST` and excluded from the index and all live analytics.
- SerpApi (free key, 250 searches/mo) is the reliable second source for top routes.
- All five airline-direct adapters return `CHALLENGE_DETECTED` (no NDC access on free tiers) — see the pitch-deck notes for the honest position.
- When no fare provider is configured, the API reports that fares are unavailable rather than inventing observations.

## 6. CORS

The backend validates CORS through `ALLOWED_ORIGINS`.

For local development:

```bash
ALLOWED_ORIGINS=http://localhost:8443,http://localhost:5173
```

For deployment:

```bash
ALLOWED_ORIGINS=https://aero-price-production.vercel.app
```

Do not use wildcard `*`. The old wildcard Vercel-origin regex was removed on 21 Nov 2026 — preview deployments must be added to `ALLOWED_ORIGINS` explicitly. See `backend/.env.example` for the full variable template (placeholders only, no real values).

## 7. Final pre-push checklist

- `npm run build`
- `cd backend && python -m pytest -q` (use the virtual environment's Python)
- Confirm `.env`, `.env.local`, and `backend/.env` are not committed.
- Confirm Firebase authorized domains include the deployed frontend.
- Confirm backend `ALLOWED_ORIGINS` includes the deployed frontend.
- Confirm `/api/health` on the deployment returns `database: "connected"`.

## 8. Known prototype boundaries

- Firebase Google Auth creates normal User access only.
- TGC/DGCA Analyst access is admin-granted only — self-registration as DGCA is closed.
- Read-only endpoints (forecast, index history/basket, exports, collections reads, source-health) are open to any signed-in user; write/admin actions stay gated. See `ACCESS_PLAN.md`.
- Production payment/subscription gates are represented as locked UI until entitlement/payment logic is added.
- Live aviation telemetry uses ADSB.lol with OpenSky fallback. Fare observations require a configured provider (or the public-interface worker); unavailable fare data is never fabricated.
- Vercel Hobby cron is daily-only, so collection is a daily batch, not real-time. The on-demand `/api/fares/live` path is the only near-live fare lookup.
