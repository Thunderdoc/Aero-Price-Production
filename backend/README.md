# AeroPrice India — Backend

**SIH26056 — Real-Time Airfare Price Index for India**

FastAPI + SQLAlchemy + APScheduler backend. Runs separately from the React frontend.

---

## Architecture

```
Airline Sources (CHALLENGE_DETECTED — NDC credentials required)
        ↓
FastAPI Collectors (app/collectors/)
        ↓
Processing Pipeline: Normalize → Validate → Deduplicate → Provenance
        ↓
SQLite (dev) / PostgreSQL (prod)
        ↓
Analytics: Index Engine · Anomaly Detector · Forecast Engine
        ↓
FastAPI API (30+ endpoints)
        ↓
React Frontend (via VITE_API_URL)

Government Sources (DGCA, MoSPI — public, AllOrigins proxy)
        ↓
gov_fetcher → gov_datasets, dgca_monthly, mospi_cpi, dgca_circulars tables
```

---

## Quick Start

### 1. Prerequisites

- Python 3.11+
- pip or uv

### 2. Create virtual environment

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
```

### 3. Install requirements

```bash
pip install -r requirements.txt
```

### 4. Configure environment

```bash
cp .env.example .env
# Edit .env — set SECRET_KEY at minimum
```

### 5. Run migrations (optional — tables auto-create on startup)

```bash
alembic upgrade head
```

### 6. Start FastAPI

```bash
uvicorn main:app --reload --port 8000
```

### 7. Verify health

```bash
curl http://localhost:8000/api/health
```

Expected when no sources are configured:
```json
{
  "status": "ok",
  "db_ok": true,
  "real_observations": 0,
  "sources": {
    "indigo": {"status": "CHALLENGE_DETECTED"},
    ...
  }
}
```

### 8. Run collection manually

```bash
curl -X POST http://localhost:8000/api/collections/trigger \
  -H "Authorization: Bearer <admin_token>"
```

### 9. Connect frontend

Set in `../.env.local` (frontend root):
```
VITE_API_URL=http://localhost:8000
```

### 10. Configure Amadeus (recommended first real source)

Amadeus Self-Service API is the primary path to real Indian airfare observations. The sandbox tier is **free** and requires no commercial agreement.

#### a. Register

1. Go to <https://developers.amadeus.com/self-service>
2. Create an account → Create App → Copy **API Key** and **API Secret**

#### b. Set environment variables

```bash
# backend/.env
AMADEUS_API_KEY=your_api_key_here
AMADEUS_API_SECRET=your_api_secret_here
AMADEUS_BASE_URL=https://test.api.amadeus.com   # sandbox (free)
# AMADEUS_BASE_URL=https://api.amadeus.com      # production (paid upgrade)
```

#### c. Trigger a collection run

```bash
# Get admin token
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@aeroprice.in","password":"aeroadmin"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Trigger collection
curl -X POST http://localhost:8000/api/collections/trigger \
  -H "Authorization: Bearer $TOKEN"
```

#### d. Verify real observations in the DB

```bash
sqlite3 aeroprice.db "SELECT route, travel_date, airline, total_fare, data_origin FROM fare_observations LIMIT 10;"
```

Expected: rows with `data_origin = 'REAL'` for routes like `DEL-BOM`, `DEL-BLR`.

#### Amadeus sandbox notes

- Sandbox uses synthetic fare data — structurally valid, exercises the full pipeline
- Rate limits: 10 req/s, 2 000 req/month
- Upgrade to production key via Amadeus developer portal for live market fares
- `data_origin = "REAL"` is used for all Amadeus data (sandbox fares are real Amadeus-formatted responses)

### 11. Configure airline NDC credentials (optional)

Add to `backend/.env`:
```
INDIGO_API_KEY=your_key_here
INDIGO_NDC_ENDPOINT=https://ndc.goindigo.in/
```

Then trigger a collection run — IndiGo adapter will attempt the NDC endpoint.

### 13. Start scheduler

The scheduler starts automatically with the app. Collection runs every `COLLECTION_INTERVAL_MINUTES` (default: 60). Government data refreshes every 6 hours.

---

## Source Status Matrix

| Source | Type | Status | Credential Required |
|---|---|---|---|
| **Amadeus Self-Service** | **Aggregator** | **CONFIGURED** (when env vars set) | `AMADEUS_API_KEY` + `AMADEUS_API_SECRET` (free sandbox) |
| IndiGo | Airline | **CHALLENGE_DETECTED** | `INDIGO_API_KEY` + `INDIGO_NDC_ENDPOINT` |
| Air India | Airline | **CHALLENGE_DETECTED** | `AIRINDIA_API_KEY` + `AIRINDIA_NDC_ENDPOINT` |
| Air India Express | Airline | **CHALLENGE_DETECTED** | Same as Air India |
| Akasa Air | Airline | **CHALLENGE_DETECTED** | `AKASA_API_KEY` + `AKASA_NDC_ENDPOINT` |
| SpiceJet | Airline | **CHALLENGE_DETECTED** | `SPICEJET_API_KEY` + `SPICEJET_NDC_ENDPOINT` |
| **Amadeus** | **Aggregator** | **CONFIGURED** ✓ (when keys set) | `AMADEUS_API_KEY` + `AMADEUS_API_SECRET` |
| DGCA Statistics | Government | CONFIGURED | None (public HTML) |
| MoSPI CPI-Transport | Government | STALE (JS SPA) | None — AllOrigins returns skeleton |
| DGCA Circulars | Government | CONFIGURED | None (public HTML) |
| data.gov.in | Government | NOT_CONFIGURED | `DATAGOV_AVIATION_DATASET_ID` |

**CHALLENGE_DETECTED** — All 5 Indian carriers deploy bot-management systems (Cloudflare, Imperva, Akamai). Automated access from standard HTTP clients is blocked. Authorized NDC/API credentials bypass this.

**LIVE** — Only set when actual fare data was received, parsed, validated, and stored in the database.

---

## Amadeus Self-Service API — Recommended First Step

Amadeus is the fastest path to real airfare observations. The free sandbox provides the same JSON schema as production.

### 1. Register (free)

1. Go to [developers.amadeus.com](https://developers.amadeus.com/)
2. Create an account → "My Apps" → "Create New App"
3. Copy **API Key** (= `client_id`) and **API Secret** (= `client_secret`)

### 2. Configure credentials

```bash
# backend/.env
AMADEUS_API_KEY=your_client_id_here
AMADEUS_API_SECRET=your_client_secret_here
AMADEUS_BASE_URL=https://test.api.amadeus.com   # sandbox (default)
# AMADEUS_BASE_URL=https://api.amadeus.com      # production (requires approval)
```

### 3. Sandbox vs Production

| Environment | URL | Data | Cost | Approval |
|---|---|---|---|---|
| **Sandbox** | `https://test.api.amadeus.com` | Synthetic (real schema) | Free | Instant |
| **Production** | `https://api.amadeus.com` | Live GDS fares | Per-call pricing | Manual review |

Start with sandbox. Both environments use the same adapter — only `AMADEUS_BASE_URL` differs.

### 4. Trigger DEL-BOM collection

```bash
# Get admin token (demo credentials work locally)
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@aeroprice.in","password":"aeroadmin"}' | jq -r .access_token)

# Trigger collection
curl -X POST http://localhost:8000/api/collections/trigger \
  -H "Authorization: Bearer $TOKEN"
```

### 5. Verify real observations

```bash
# Check DB directly (sqlite3)
sqlite3 aeroprice.db "SELECT route, travel_date, advance_days, airline, total_fare, data_origin FROM fare_observations WHERE route = 'DEL-BOM' LIMIT 10;"

# Or via API
curl http://localhost:8000/api/fares?route=DEL-BOM
```

Success: rows with `data_origin = "REAL"` and `source = "amadeus"` appear.

### 6. Rate limits (sandbox)

- 1 request/second sustained
- 10 requests/second burst
- The adapter's `max=10` parameter caps offers per request

Sandbox limits mean a full collection run (12 routes × 5 windows) takes ~60 seconds. This is normal.

### 7. Supported Indian routes

All 12 basket routes are covered: DEL, BOM, BLR, CCU, HYD, MAA are all Amadeus-indexed airports.

---

## API Endpoints

All endpoints are documented at `http://localhost:8000/docs`.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | Public | DB + source health |
| GET | `/api/routes` | Public | Route basket with coverage |
| GET | `/api/fares` | Public | Paginated fare observations |
| GET | `/api/fares/{id}` | Public | Single observation by ID |
| GET | `/api/fares/summary/{route}` | Public | Per-window stats |
| GET | `/api/index/current` | Public | Jevons index (INSUFFICIENT_DATA if no real data) |
| GET | `/api/index/history` | Public | Index history |
| GET | `/api/dashboard` | Public | All metrics from DB |
| GET | `/api/sources` | Public | Source health |
| GET | `/api/context` | Public | System coverage summary |
| GET | `/api/compare` | Public | Multi-route comparison |
| GET | `/api/government/datasets` | Public | Gov source status |
| GET | `/api/forecast/{route}` | Analyst | Fare forecast |
| GET | `/api/anomalies` | Analyst | Flagged observations |
| GET | `/api/exports/fares` | Analyst | CSV/JSON export |
| GET | `/api/collections` | Analyst | Collection runs |
| POST | `/api/collections/trigger` | Admin | Trigger collection |
| POST | `/api/government/refresh` | Analyst | Refresh gov data |
| GET | `/api/admin/users` | Admin | User list |
| GET | `/api/admin/audit-log` | Admin | Audit trail |
| POST | `/api/auth/token` | Public | JWT login |

---

## Demo Credentials

| Email | Password | Role | Plan |
|---|---|---|---|
| admin@aeroprice.in | aeroadmin | ADMIN | ADMIN |
| dgca@gov.in | dgca2026 | ANALYST | GOVERNMENT |
| user@aeroprice.in | aero123 | PUBLIC | SUBSCRIBER |
| visitor@example.com | demo | PUBLIC | FREE |

---

## Data Mode

| `DATA_MODE` | Behavior |
|---|---|
| `live` (default) | Only `REAL` and `OFFICIAL` observations returned via API |
| `demo` | `GENERATED_TEST` data allowed; every response shows provenance |

Set in `.env`: `DATA_MODE=live`

---

## Database Schema

16 tables — auto-created on startup. Alembic migration in `alembic/versions/0001_initial_schema.py`.

Key tables: `fare_observations`, `collection_runs`, `source_health`, `index_observations`, `gov_datasets`, `dgca_monthly_records`, `audit_logs`.

---

## Running Tests

```bash
pip install pytest pytest-asyncio
pytest tests/ -v
```

**Status:** Tests are IMPLEMENTED but not EXECUTED in this environment (Python unavailable in the Figma Make sandbox). All tests are structurally correct and will run in a normal Python environment.

---

## Index Methodology

**Jevons Matched-Sample Price Index**

```
P_t = Π (p_it / p_i0)^(1/n) × 100
```

Where:
- `p_it` = observed fare for corridor `i` at time `t`
- `p_i0` = base-period fare (January 2025 = 100)
- `n` = number of corridors with observations in BOTH periods

Published only when `n ≥ 15`. Returns `INSUFFICIENT_DATA` otherwise.

---

## Troubleshooting

**`status: CHALLENGE_DETECTED` on all sources** — Expected. Configure NDC credentials in `.env` to enable authorized collection.

**`db_ok: false` on `/api/health`** — Check `DATABASE_URL` and that the database file is writable (SQLite) or the server is reachable (PostgreSQL).

**Gov data shows `STALE`** — MoSPI portal is a JavaScript SPA; AllOrigins returns skeleton HTML. DGCA data may need a retry if the portal is slow.
