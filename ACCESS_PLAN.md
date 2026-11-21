# AeroPrice Access Plan for SIH Review

The safest approach is to separate public user access from privileged evaluator/admin access.

## Recommended access model

### 1. Public/User access

- Anyone may self-register with email + password, or sign in with Google (Firebase, when configured).
- Self-registration creates role `PUBLIC`, plan `FREE` only.
- **DGCA self-registration is CLOSED.** Registering with workspace `DGCA` is rejected by the backend (`POST /api/auth/register`); the ANALYST role is granted by an admin only. There is no way for a visitor to grant themselves analyst access.
- Signed-in public users can VIEW all read-only surfaces: dashboard, map, fares, route explorer, forecast, anomalies, government intelligence, index history/basket, exports, collections reads and source-health. The analyst gate on those read-only endpoints was dropped on 21 Nov 2026; write/admin actions (collection trigger, anomaly-detection run, government refresh, all `/api/admin/*`) stay gated.

### 2. SIH evaluator access

One evaluator account exists, created out of band by a seed script — never hardcoded in the app, never published in the repo.

- Email: `evaluator@aeroprice.in`
- Role: `ANALYST`, plan: `GOVERNMENT`
- Created by: `backend/app/seed/evaluator.py` (run with `EVALUATOR_PASSWORD` set in the environment — the seed refuses to run without one, and there is no default password)
- The password is shared privately with judges in the submission notes, never in GitHub, the UI, screenshots, or slides.

The evaluator sees the analyst workspace (forecast, government intelligence, exports, collections) with no admin controls.

### 3. Admin access

Admin is private only.

- Do not publish Admin email/password in GitHub README, UI, WhatsApp screenshots, or SIH presentation slides.
- Give Admin credentials only to your own team.
- The first admin is created out of band via `scripts/bootstrap_admin.py`.
- Admin accounts are backend-authorized; admin routes remain protected by backend role checks.
- **No demo credentials exist in the code.** The old hardcoded `DEMO_USERS` dict (including a full ADMIN account with a plaintext password) was deleted from `backend/app/core/auth.py` on 21 Nov 2026. Any document that still lists demo passwords (e.g. old plan files under `plans/`) is stale and must not be trusted. Note: the old credentials remain in git HISTORY until a history rewrite is approved and done — deletion from the working tree does not purge them. Treat them as compromised and never reuse them.

### 4. TGC / DGCA access

Treat TGC/DGCA as invite-only.

- The login screen no longer offers DGCA as a self-registration path.
- Access is granted only when an admin assigns role `ANALYST` to an existing account.
- A normal Google user cannot become TGC/DGCA by clicking anything.

## What not to do

- Do not add visible demo credential buttons.
- Do not hardcode Admin credentials in the frontend — or anywhere in the repo.
- Do not let a frontend dropdown decide the role.
- Do not publish Admin credentials in GitHub.
- Do not use one shared Admin account for all reviewers.
- Do not re-introduce demo users into app code. Test fixtures belong in `backend/tests/` only.

## For SIH submission

Submit:

1. Public URL: https://aero-price-production.vercel.app
2. User access: "Self-register, or use Google sign-in."
3. Evaluator access: the `evaluator@aeroprice.in` credential, shared privately.
4. Admin access: "Available on request for live demonstration by team only."

## Current implementation

- The real role comes from backend authentication (JWT claims overridden by the persisted DB role on every request).
- Google sign-in creates normal User access only.
- TGC/Analyst and Admin require backend-authorized accounts (admin-granted).
- Read-only endpoints (forecast, index history/basket, exports, collections reads, source-health) are open to any signed-in user; write/admin endpoints require ANALYST or ADMIN as documented on each route.
