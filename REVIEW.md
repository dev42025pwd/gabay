# Gabay — REVIEW.md

> **Version**: 1.1 | **Date**: 2026-10-08 | **Status**: in force (standard §8.6; plan.html L121; trimmed in Phase 1 S6, L131) | **Audience**: dod-reviewer and any reviewer of a Gabay change | **Scope**: the passes a change goes through before the product owner signs its PR

Run the passes in order. Skip what the hooks and `npm run verify` already enforce (standard §8.6): rules 2, 3, 4, 6 and 7 (the structural linters, `tools/lint/README.md`), staged `.env` files (the pre-commit secret guard), the changelog stamp and duplicates (pre-commit), and the schema-to-form drift. Review only what those cannot judge. Report each finding as `file:line`, the rule it breaks, and what fails because of it. A pass with nothing found says "none found" and what was checked. Never fix code here: report.

## 0. Verification (always first)
- Run `npm run verify` in a fresh context and paste its full output with the exit code. Anything other than `ALL GREEN` stops the review: report the failure.

## 1. Security pass
- Routes guarded in order: role → permission → tenant scope → validation (§9 item 3).
- Rules 2 and 3 are linted; review only what the linters cannot see: where a bound tenant parameter's value comes from (the request context, never the token's user object), and that sort keys, filters and lookup names pass through an allow-list map.
- Read every new `// sql-identifiers:` and `// tenant-scope:` annotation in the diff: the linters accept any stated reason, so the reviewer judges it (L128). The linters' documented limits are read by hand: see "Accepted limits" in `tools/lint/README.md`.
- Firebase ID token verified before anything else; permissions read from the database (E-08).
- No secret, key or real password anywhere in the diff (the pre-commit guard refuses only `.env*` files).
- Positions: nothing leaves the phone outside opted-in analytics (invariant 4); no background location or BLE (invariant 5). Follow any position value a ViewModel hands to a service: the linter checks only who imports positioning and same-file network use (L128).

## 2. Compliance pass (the standard and Gabay's rules)
- Rules 1 and 5 of `CLAUDE.md`, which no linter enforces: money as `decimal.js` and `DECIMAL(18,4)`, never a float; no hardcoded option list a client could extend. For rule 4, that the migration and `schema.sql` say the same thing (the linters check only that committed migrations are untouched and every table has its drop).
- Every `docs/product/FEATURE_PIPELINE.md` §5 item met or waived in one line: the standard's 15 and G1–G4.
- Every row of the companion-file sync table in `CLAUDE.md` evaluated: seeds, permission and menu rows, manuals, smoke guide and the changelog's wording updated, or one line why not (§9 items 2, 4, 10, 11, 12).
- New enumerable sets as tables or commented constants (§9 item 14).
- Decisions: behaviour that differs from the PRD or Blueprint has its `plan.html` row (G4).

## 3. Evidence pass (WORKING_AGREEMENT §4)
- The verify output is pasted, not described.
- Screen changes have test-rendered screenshots: light and dark, phone and tablet.
- The traceability table maps every acceptance criterion and edge case to a passing test or a one-line reason.
- Every changed existing test is named in `plan/<id>.md` with its spec change (C1).

## 4. Product pass (Gabay)
- Taglish: new phrases in the ARB files, the untranslated-phrase test passing, the product owner's review recorded (G2).
- Accessibility: screen-reader names, no overflow at ×1.4, contrast 4.5:1 (PRD §6.23).
- Offline: shopper features in PRD §6.5–§6.9 work with no data (G3).
- References: nothing copied from `demo_app` or `gabay_spike` (L34); the penthouse data stays internal (L48).

## 5. Scope and quality pass
- Only what the spec and plan say; anything else under `## Suggestions`.
- Scale targets stated in the spec are met, with the measurement pasted.
- No overengineering: no abstraction without a second use, except what the standard or Blueprint mandates.
- Clear names, one responsibility per file.

## 6. For the product owner (standard §9's human checks)
Answer only: does the change do what `plan/<id>.md` said; is the residual risk acceptable; is the tier still right; does anything belong in Blueprint Part 6 as a named rule. The product owner signs; this review does not.
