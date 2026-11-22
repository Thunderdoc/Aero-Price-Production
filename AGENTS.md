# AeroPrice (Aero-Price-Production)

React + Vite + Tailwind CSS frontend + FastAPI backend. SIH 2026 problem SIH26056 (real-time airfare price index for India).

## Development Server

Start the Vite dev server with `npm run dev` (default port 8443). Hot reload: changes to source files are reflected immediately. The FastAPI backend runs separately (see Backend section).

## Project Structure

This is the canonical project structure. Start with task-relevant files below. Only follow imports or inspect other files when required, when a documented path is missing, or when the repository contradicts this guide.

- `src/main.tsx` - React entrypoint; imports `src/index.css` and mounts `src/App.tsx` into the `#root` element
- `src/App.tsx` - Primary application component and the usual starting point for UI work
- `src/index.css` - Global CSS entrypoint and Tailwind CSS v4 import
- `index.html` - Vite HTML shell containing the `#root` element and loading `src/main.tsx`
- `package.json` - Project dependencies and the Vite build, development, preview, and formatting scripts
- `vite.config.ts` - Vite configuration with React, Tailwind CSS v4, plus the `@` alias for `src` (the old Figma Make plugins were removed in Nov 2026; meta is single-sourced in `index.html`)
- `.mise.toml` - Toolchain versions for Node.js and pnpm

## Dependencies

- Runtime: React 19 and React DOM 19
- Styling: Tailwind CSS v4 with the `@tailwindcss/vite` plugin
- Build tooling: Vite 8, TypeScript 5.7, and `@vitejs/plugin-react`
- Formatting: oxfmt

## Styling

This project uses **Tailwind CSS v4** through the `@tailwindcss/vite` plugin configured in `vite.config.ts`. `src/index.css` imports Tailwind with `@import 'tailwindcss';`. Use Tailwind utility classes directly in JSX and put global CSS or Tailwind v4 theme customization in `src/index.css`. This scaffold does not need a Tailwind config file or PostCSS config.

`src/main.tsx` imports `src/index.css`, so global font wiring belongs in `src/index.css`. Keep CSS `@import` statements first, then add any `@font-face` rules and font-family defaults there.

## Backend (FastAPI)

The FastAPI backend lives in `backend/` (entrypoint `backend/main.py`, Python 3.12). One Vercel deployment serves both halves: the SPA from `dist/` and every `/api/*` request via the serverless function in `api/index.py`. There is no separate backend host.

- **Layout:** `backend/app/api/routes/` (one module per resource), `backend/app/services/` (collector, Jevons index engine, forecast engine, gov fetcher), `backend/app/collectors/` (fare-source adapters), `backend/app/processing/` (normalize / quality / dedupe), `backend/app/models/` (SQLAlchemy models), `backend/app/config/weights.py` (index route weights — equal 1.0 today; DGCA traffic weights unavailable, see that file), `backend/app/analytics/backtest.py` (backtest method — live benchmark is the MoSPI CPI Transport index shipped in `backend/data/mospi_cpi_transport.csv`; the DGCA path is retained and honestly reports NO_DGCA_DATA because DGCA does not publish monthly average fares publicly, verified 22 Nov 2026).
- **Run locally:** `cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && python -m uvicorn main:app --reload --port 8000`. `SECRET_KEY` is required (no default — the app refuses to boot without one); set it in `backend/.env` (gitignored). Local storage is SQLite; production uses hosted Postgres via `DATABASE_URL`.
- **Tests:** `cd backend && python -m pytest -q` (in-memory SQLite via `tests/conftest.py`). The suite needs `SECRET_KEY` set — `conftest.py` supplies a test-only value.
- **Migrations:** Alembic in `backend/alembic/` (`alembic upgrade head`). New models must be imported in both `backend/alembic/env.py` and `backend/tests/conftest.py`, or autogenerate and the test fixture silently miss their tables.
- **Provenance rules (do not break):** fares carry `data_origin`. `REAL`/`OFFICIAL` are verified fares; `PUBLIC_INTERFACE` is scraped Google Flights fares (honest label, feeds the index under the disclosed demo methodology); `SANDBOX_TEST` is synthetic Amadeus/Duffel test data, permanently excluded from the index and live analytics; `UNKNOWN` is hard-rejected by the quality stage. Never default a new origin to `REAL`.
- **Collection:** a full sweep cannot finish inside Vercel's 60 s function limit — collection runs chunked from the GitHub Actions worker (`.github/workflows/collect.yml`). `run_collection` takes a run lock (`CollectionLockedError` if one is already RUNNING) and `reap_stale_runs()` clears `RUNNING` rows left by killed workers.
- **Access:** DGCA self-registration is open (anyone may register as DGCA analyst → ANALYST role); only ADMIN registration is blocked (owner decision 22 Nov 2026). Read-only endpoints (forecast, index history/basket, exports, collections reads, source-health) are open to any signed-in user; write/admin actions stay gated. See `ACCESS_PLAN.md`.
