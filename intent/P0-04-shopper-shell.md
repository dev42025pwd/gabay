# Intent P0-04 — Shopper shell and package delivery

> **Pipeline entry:** P0-04 · **Slice:** FF-4 (`plan/PH4-feature-first.md` §4) · **Date:** 2026-10-09 · **Status:** draft, for the product owner's approval with its spec (L156) · **Sources:** PRD §6.4; Blueprint §4.4; FEATURE_PIPELINE P0-04; L102, L103

## What the product owner wants
The shopper app's container on an Android emulator or a phone on this machine: a manual mall picker (mall detection by location as far as localhost allows), package download from the public GET route with SHA-256 verification and the ETag refresh check (L102), verify-then-swap only between trips, opened read-only, and the 2.5D map (L83) with levels, pinch, rotate, recentre, the whole-site and all-levels views.

## Settled context
- **Order and constraints:** feature-first under EXCEPTIONS E-20 (plan.html L153; `plan/PH4-feature-first.md` 1.0): localhost only (L109), no deploy, throwaway test data only, nothing live until the retrofit (R1–R13) is signed. Admin routes sit behind the development stub (`plan/FF0-dev-stub-lookups.md`, L154, L155): no sign-in, tenant from `req.tenantCompanyID`, no permission check yet; definition-of-done items 3, 4 and 9 are waived only as `Waived: <item> — R<n>` with a retrofit-ledger row. The seven rules and every linter apply in full.
- **Product rulings:** the `gabay-product-rulings` skill (L83–L124 and later) governs behaviour; the Gabay Demo app is the main reference for the shopper side (L85, L99).
- **Approval:** this intent and its spec are approved together by the product owner, in one sitting with FF-1 to FF-4 (L156).

## Notes for the spec
Which parts of detection and refresh can be exercised on localhost; the public package route is GET-only and unauthenticated by design (`/api/public`). Shopper accounts are R10.
