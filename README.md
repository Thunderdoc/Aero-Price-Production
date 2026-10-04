# AeroPrice
<img width="2172" height="724" alt="image" src="https://github.com/user-attachments/assets/1cba6b94-5b8f-4494-98d1-e3b069be1145" />


> India’s airfare intelligence platform for evidence-led decisions across routes, markets, government data, and aviation operations.

AeroPrice is an SIH 2026 prototype for problem statement **SIH26056**. It turns airfare observations and aviation data into a fast, role-aware intelligence workspace for public users, analysts, government stakeholders, and administrators.

## What AeroPrice helps users do

- **See the market at a glance** with an AI-assisted briefing of the latest verified fare movement.
- **Compare domestic routes** using median fares, observed ranges, and route-level changes.
- **Understand India geographically** through fare movement and aviation map views.
- **Connect price signals to context** with DGCA, MoSPI CPI, PPAC ATF, and data.gov.in references.
- **Explore live aviation activity** with aircraft, airports, and operational views.
- **Create actionable alerts** for routes and price changes.
- **Support governance workflows** with source provenance, freshness indicators, exports, and audit trails.

## Product principles

### Evidence first

Verified and official observations stay visibly separate from modeled or AI-assisted interpretation. AI may summarize patterns and suggest where to look; it does not replace the underlying source record.

### Intelligence before complexity

The dashboard opens with a concise “what changed / why it matters / what to inspect next” brief, followed by the evidence needed to validate it.

### Fast first view

The first meaningful dashboard view should arrive quickly from cached, clearly labelled last-known data while live feeds refresh in parallel. The frontend is designed to load only the active workspace instead of initializing every page at startup.

## Experience direction

The visual system follows the AeroPrice mark: aviation blue, electric cyan accents, deep navy surfaces, glass-like data cards, route-line motifs, and generous information hierarchy. AI-generated or decorative imagery is used only as interface atmosphere; fares, government records, and operational statuses remain data-backed.

## Architecture

- React 19 + Vite + TypeScript frontend
- Tailwind CSS v4 and Lucide icons
- FastAPI backend
- Firebase Google Authentication for normal user login
- Backend JWT auth for privileged analyst and admin workspaces
- Supabase client support for user-facing price-alert persistence
- SQLite for prototype storage; Postgres recommended for production durability

## Quick start

### Frontend

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:8443`.

### Backend

```bash
cd backend
python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
cp .env.example .env
python -m uvicorn main:app --reload --port 8000
```

## Environment

See [.env.example](./.env.example). Main frontend values include `VITE_API_URL`, Firebase web configuration, and Supabase client configuration.

Firebase web configuration values are public client identifiers. Never commit service-account JSON, backend passwords, provider secrets, or Supabase service-role keys.

## Performance plan

The one-second goal applies to the first meaningful frontend view, not an unconditional promise about every backend response. Measure frontend bundle startup, first render, and backend/API cold start separately. Planned optimizations include route-level code splitting, cached dashboard snapshots, parallel refreshes, independent timeouts for optional feeds, and production-build measurements on a cold browser cache.

## Verification

```bash
npm run build
cd backend
.venv\\Scripts\\python.exe -m pytest -q
```

The repository is a prototype and should be presented as an SIH 2026 prototype, not as an official Government of India service. Government, DGCA, and MoSPI references are data-source and methodology references only.

See [DEPLOYMENT.md](./DEPLOYMENT.md) for deployment guidance.
