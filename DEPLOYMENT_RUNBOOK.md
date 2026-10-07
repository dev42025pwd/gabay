# Gabay — Deployment Runbook

> **Version**: 0.1 stub | **Date**: 2026-10-07 | **Status**: Phase 0 stub (standard §2; plan.html L115) | **Audience**: whoever deploys, on the product owner's call | **Scope**: reusable per environment; the per-release deploy plan is separate and dated

**⚠️ Nothing in this runbook is run until the product owner calls the first deploy (L109).** Until then everything is local (INSTALL.md). Every step that writes to a cloud resource carries a ⚠️ and needs the release approval named in the deploy plan.

The standard's runbook phases assume a VM; Gabay runs on Firebase (L98), so the phases map as below.

| # | Standard phase | Gabay | State |
|---|---|---|---|
| 1 | Prerequisites | A Google Cloud / Firebase project in `asia-southeast1` on the Blaze plan; `firebase-tools` 15.x; Node 22; two named Owners (L93) | Decided at the deploy call (L117) |
| 2 | Layout | Firebase Hosting (admin web page), one Cloud Function (`api`, Express, `maxInstances = 1`), Cloud SQL for PostgreSQL 18 via SQL Connect, Cloud Storage, Firebase Auth | Decided (L98) |
| 3 | Build | `flutter build web` for the admin; the function bundle | Phase 1 |
| 4 | Database + least-privilege login | Cloud SQL instance; an API login with only the grants it needs; migrations in order | Phase 1; the connection path (Cloud SQL connector or authorised networks) at the deploy call |
| 5 | Environment | Function secrets and config; `CORS_ORIGINS` lists the Hosting address (E-05) | Phase 1 |
| 6 | Reverse proxy | None: Hosting rewrites serve the admin page; the API is called at its own address (E-05; the 60 s Hosting rewrite limit) | Decided |
| 7 | TLS | Managed by Firebase and Google Cloud; a custom domain's certificate is automatic (RECALLED; check at the deploy call) | — |
| 8 | Service supervisor, log rotation | Managed by Cloud Functions and Cloud Logging | — |
| 9 | Firewall | Cloud SQL network access; the function's ingress | At the deploy call |
| 10 | Verify | `GET /api/health`, then `Smoke_Test_Guide.md` | Phase 1 |
| 11 | Operations | Cloud SQL backups; canary by deploying to a preview first | Phase 1 |

## Gotchas (known before the first deploy)

- **OQ9:** `better-sqlite3` (the package builder) is a native module; whether it builds and fits the in-memory `/tmp` in the Functions runtime is checked at the first deploy. Fallback: a Cloud Run job for the build.
- Firebase Auth processes sign-in data in the US; everything else stays in Singapore (accepted, L116).

## Hard limits

- `maxInstances = 1` for the pilot: no shared in-memory state across instances (Blueprint §2.6).
- Nothing deploys without the product owner's call (L109). No Firestore or Realtime Database (L98).
