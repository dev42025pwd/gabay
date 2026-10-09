# Intent P0-02 — Test venue seeds and accounts, finished

> **Pipeline entry:** P0-02 · **Slice:** FF-2 (`plan/PH4-feature-first.md` §4) · **Date:** 2026-10-09 · **Status:** draft, for the product owner's approval with its spec (L156) · **Sources:** PRD §6.1; Blueprint §4.6; FEATURE_PIPELINE P0-02 (IN PROGRESS, L120); L119

## What the product owner wants
Finish the scripted import of the test venues into P0-01's tables so they show in the admin lists: tenant Demo Malls (the demo's four malls, no beacons) and tenant Spike Venues (the penthouse with its real beacons, internal only; MEZZ office; the owner's spike exports when provided), six `@gabay.test` accounts. Converted from JSON only (L34: no code copied); the penthouse data stays out of git (L48, L123).

## Settled context
- **Order and constraints:** feature-first under EXCEPTIONS E-20 (plan.html L153; `plan/PH4-feature-first.md` 1.0): localhost only (L109), no deploy, throwaway test data only, nothing live until the retrofit (R1–R13) is signed. Admin routes sit behind the development stub (`plan/FF0-dev-stub-lookups.md`, L154, L155): no sign-in, tenant from `req.tenantCompanyID`, no permission check yet; definition-of-done items 3, 4 and 9 are waived only as `Waived: <item> — R<n>` with a retrofit-ledger row. The seven rules and every linter apply in full.
- **Product rulings:** the `gabay-product-rulings` skill (L83–L124 and later) governs behaviour; the Gabay Demo app is the main reference for the shopper side (L85, L99).
- **Approval:** this intent and its spec are approved together by the product owner, in one sitting with FF-1 to FF-4 (L156).

## Notes for the spec
What remains of P0-02 after L120, set against P0-01 as built in FF-1; the owner's spike exports may still be missing (say how the seed behaves without them). Publishing the seeds is FF-3.
