# AeroPrice Access Plan for SIH Review

The safest approach is to separate public user access from privileged evaluator/admin access.

## Recommended access model

### 1. Public/User access

- Use Firebase Google Authentication.
- Anyone with Google sign-in can enter only the normal User workspace.
- User role is `PUBLIC`.
- User plan is `FREE` until a backend entitlement/subscription system grants more.
- Public users cannot access Admin, Collection, System Config, Reports/Exports, Methodology, or TGC/DGCA-only pages.

### 2. SIH evaluator access

Create one temporary evaluator account and share it privately in the submission notes, not in the UI and not in GitHub screenshots.

Recommended:

- `sih-reviewer@yourdomain.in`
- role: `ANALYST`
- plan: `GOVERNMENT`
- allowed pages: dashboard, map, fares, route explorer, forecast, anomalies, government intelligence, methodology/reports if needed

This gives reviewers enough weightage-visible access without exposing Admin controls.

### 3. Admin access

Admin should be private only.

- Do not publish Admin email/password in GitHub README, UI, WhatsApp screenshots, or SIH presentation slides.
- Give Admin credentials only to your own team.
- Admin account must be backend-authorized.
- Admin routes must remain protected by backend role checks.

### 4. TGC / DGCA access

Treat TGC/DGCA as invite-only.

- Login tab is visible.
- Access is granted only when the backend returns role `ANALYST`.
- A normal Google user cannot become TGC/DGCA by clicking the tab.

## What not to do

- Do not add visible demo credential buttons.
- Do not hardcode Admin credentials in the frontend.
- Do not let a frontend dropdown decide the role.
- Do not publish Admin credentials in GitHub.
- Do not use one shared Admin account for all reviewers.

## For SIH submission

Submit:

1. Public URL.
2. User access: "Use Google sign-in."
3. Evaluator access: one private reviewer credential with analyst/TGC permission.
4. Admin access: "Available on request for live demonstration by team only."

## Current implementation

- Role tabs are only workspace selectors.
- The real role comes from Firebase/backend authentication.
- Google sign-in creates normal User access only.
- Google sign-in creates Admin access only when the email is explicitly listed in `VITE_FIREBASE_ADMIN_EMAILS`.
- TGC/Admin require approved backend credentials.
- If a user selects Admin/TGC but signs in with a normal user account, the app logs them out and shows a role mismatch error.
