# AeroPrice — India Airfare Intelligence Platform

SIH 2026 prototype for problem statement SIH26056. AeroPrice is a role-aware airfare intelligence dashboard for Indian domestic aviation: route-level fare observations, Jevons index methodology, government data references, aviation map views, and administrative pipeline monitoring.

This repository contains:

- React 19 + Vite frontend
- FastAPI backend
- Firebase Google Authentication for normal user login
- Supabase client support for user-facing price-alert persistence
- Backend JWT auth for Admin/TGC/DGCA-style privileged workspaces
- Deployment-ready environment templates

## Quick start

Frontend:

```bash
npm install
cp .env.example .env.local
npm run build
npm run dev
```

Backend:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python -m uvicorn main:app --reload --port 8000
```

Open the app at `http://localhost:8443`.

## Authentication model

- User login:
  - Email/password through existing backend auth when credentials exist.
  - Google sign-in through Firebase Auth.
- TGC/DGCA analyst login:
  - Backend-authorized account only.
  - Routes to the government intelligence workspace.
- Admin login:
  - Backend-authorized account only.
  - Routes to the admin console.

The frontend role tabs do not grant privileges. They only select the intended workspace. The authenticated account role still controls access.

## Required frontend environment variables

See [.env.example](./.env.example).

Important variables:

- `VITE_API_URL`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Firebase web config values are public client identifiers, not service-role secrets. Do not commit Firebase service account JSON, backend database passwords, API provider secrets, or Supabase service-role keys.

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md).

Recommended setup:

- Frontend: Vercel or Netlify.
- Backend: Render, Railway, Fly.io, or any Python/FastAPI host.
- Database: keep current SQLite for prototype only; use Postgres for durable production-style deployment.
- Firebase: enable Google provider and add deployment domains to Firebase Auth authorized domains.

## Verification commands

```bash
npm run build
cd backend
.venv\Scripts\python.exe -m pytest -q
```

Current verified result in this workspace:

- Frontend build passes.
- Backend tests pass: 183 passed, 7 skipped.

## SIH reviewer notes

This is a prototype and should be presented as an SIH 2026 prototype, not as an official Government of India service. Government/DGCA/MoSPI references are data-source and methodology references only.
