# Deployment Guide

This project is a split frontend/backend app. Deploy the Vite frontend and FastAPI backend separately, then point the frontend to the backend with `VITE_API_URL`.

## 1. Frontend deployment

### Vercel

Project settings:

- Framework preset: Vite
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `dist`

Set these environment variables in Vercel:

```bash
VITE_API_URL=https://YOUR_BACKEND_HOST
VITE_SUPABASE_URL=https://YOUR_SUPABASE_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
VITE_FIREBASE_API_KEY=YOUR_FIREBASE_WEB_API_KEY
VITE_FIREBASE_AUTH_DOMAIN=YOUR_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID=YOUR_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET=YOUR_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID=YOUR_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID=YOUR_FIREBASE_APP_ID
VITE_FIREBASE_MEASUREMENT_ID=YOUR_FIREBASE_MEASUREMENT_ID
VITE_FIREBASE_ADMIN_EMAILS=YOUR_ADMIN_EMAILS
VITE_FIREBASE_ANALYST_EMAILS=
```

### Netlify

Project settings:

- Build command: `npm run build`
- Publish directory: `dist`

Use the same environment variables as above.

## 2. Firebase setup for Google Auth

In Firebase Console:

1. Open project `sih2026-airfare-index`.
2. Go to Authentication → Sign-in method.
3. Enable Google.
4. Go to Authentication → Settings → Authorized domains.
5. Add:
   - `localhost` for local development
   - your Vercel/Netlify deployment domain
   - your final custom domain, if any

If the deployed app says the domain is not authorized, the frontend is working but Firebase has not allowed that domain yet.

## 3. Backend deployment

Deploy `backend/` as a FastAPI service.

Start command:

```bash
python -m uvicorn main:app --host 0.0.0.0 --port $PORT
```

Set backend environment variables from [backend/.env.example](./backend/.env.example).

The airfare collector uses only configured authorized providers. No Google
Flights scraping, Playwright collection, or unconfigured public fare provider
is enabled. When no authorized fare provider is configured, the API reports
that fares are unavailable rather than inventing observations.

Minimum production-like backend variables:

```bash
ENVIRONMENT=production
SECRET_KEY=<generate-a-long-random-secret>
ALLOWED_ORIGINS=https://YOUR_FRONTEND_DOMAIN
DATABASE_URL=<postgres-or-hosted-db-url>
```

For SIH prototype mode, SQLite can run locally. For hosted deployment, use Postgres or the host filesystem may lose SQLite data.

## 4. CORS

The backend validates CORS through `ALLOWED_ORIGINS`.

For local development:

```bash
ALLOWED_ORIGINS=http://localhost:8443,http://localhost:5173
```

For deployment:

```bash
ALLOWED_ORIGINS=https://YOUR_FRONTEND_DOMAIN
```

Do not use wildcard `*`.

## 5. Final pre-push checklist

- `npm run build`
- `cd backend && .venv\Scripts\python.exe -m pytest -q`
- Confirm `.env`, `.env.local`, and `backend/.env` are not committed.
- Confirm Firebase authorized domains include the deployed frontend.
- Confirm `VITE_API_URL` points to the deployed backend.
- Confirm backend `ALLOWED_ORIGINS` includes the deployed frontend.

## 6. Known prototype boundaries

- Firebase Google Auth creates normal User access only.
- Firebase Google Auth creates Admin access only for emails listed in `VITE_FIREBASE_ADMIN_EMAILS`.
- TGC/DGCA Analyst and Admin access still require backend-authorized accounts.
- Production payment/subscription gates are represented as locked UI until entitlement/payment logic is added.
- Live aviation telemetry uses ADSB.lol with OpenSky fallback. Fare
  observations require configured authorized provider credentials; unavailable
  fare data is never fabricated.
