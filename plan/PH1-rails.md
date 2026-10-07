# PH1-rails — Phase 1: rails and guardrails

> **Version**: 1.1 | **Date**: 2026-10-07 | **Status**: APPROVED by Genesis Perez, 2026-10-07 (L123); building | **Decision rows**: L122 (Phase 1 declared), L123 (how Phase 1 is run) | **Spec**: none. The standard's Appendix C Phase 1 is the specification (L123), read at Engineering Standards v1.0, `src-order` §"Phase 1 — Rails & guardrails", with the checklist items it names. | **Approver**: Genesis Perez, product owner

## 1. What Phase 1 delivers

An application with **zero features** whose hooks and CI already refuse bad code. The standard's gate (Appendix C):

> a deliberately bad commit (a hardcoded colour, an unparameterized query, a `TextFormField` in a view) is blocked by the hooks or CI on an application with zero features.

**Not in Phase 1** (standard, Appendix C): sign-in and permissions (Phase 2), any table that is not already in `db/schema.sql`, realtime, notifications, scheduled jobs, uploads, webhooks, and every product feature (P0-01 onward). No Firebase deploy (L109). No schema change.

## 2. Rulings this plan follows

| Ruling | Source |
|---|---|
| One plan, built in slices, each closed with pasted proof; approved once | L123 |
| Node 22 for Gabay through fnm, per folder from `.nvmrc`; Node 24 stays the default elsewhere | L123, amended by L124 |
| `Gabay Demo.apk` and `db/seeds/sources/internal/` stay out of git | L123 |
| GitHub repo `dev42025pwd/gabay` (private) is created at slice S7, after you sign the GitHub CLI in as `dev42025pwd` | L121, L123 |
| App store ID `com.dynamiqes.gabay` (Android applicationId and iOS bundle ID) | L123 |
| Riverpod, dio through one `ApiClient`, go_router with `usePathUrlStrategy()`; one Flutter project with `main_mobile.dart` and `main_admin.dart` | Blueprint Part 1, §2.3 |
| Express in one Cloud Function (Node 22), `pg` with raw parameterized SQL, PostgreSQL | L98, E-06 to E-09 |
| `npm run verify` ends `ALL GREEN`, exit code = number of failures; pre-commit and pre-push; agent Stop hooks; the drift linter after Flutter edits | L121 |
| Android 7.0+ (`minSdk 24`), iOS 15+ | L103 |
| Sonnet 5.5 coders, Opus 5.5 review; anything important comes to you first | L122 |

## 3. Repository layout (DESIGN CHOICE)

```
Gabay/
  app/                 Flutter project (shopper app + admin web), created with --org com.dynamiqes --project-name gabay
  functions/           the API: Express inside one Cloud Function (firebase-functions onRequest)
  db/                  schema.sql (unchanged), migrations/ (new, empty), seeds/ (existing), setup-db orchestrator
  tools/lint/          the structural linters, one file each, each with a bad-sample test
  tools/verify.js      the npm run verify orchestrator
  .githooks/           pre-commit, pre-push
  .github/workflows/   lint.yml, e2e.yml, build.yml
  .claude/             settings.json (hooks), agents/ (existing), skills/
  plan/ phase-reports/ the documents at the root, as now
  package.json         root scripts: verify, test:syntax, test:schema-forms, setup-db
```

*Alternative:* separate repositories for app and API. Passed over: the drift linter must read `db/schema.sql` and `app/lib/` together, and the standard expects one verification command.

## 4. Slices

Each slice ends with its evidence pasted into the slice report (outputs with exit codes; screenshots where a screen exists), then dod-reviewer's check. **Who builds:** api-coder (S2, S4 backend linters), flutter-coder (S3, S4 Flutter linters), the main session (S0, S1, S5, S6, S7, S8, and every review). All on the models of L122.

### S0 — Machine preparation — DONE 2026-10-07 (L124)
- fnm 1.39.0 (winget); Node v22.23.3; fnm's default left on the system Node 24; `.nvmrc` = `22` at the root; the PowerShell profile runs `fnm env --use-on-cd`.
- Evidence: fresh PowerShell in Gabay → v22.23.3, outside → v24.13.0; `fnm exec --using=22 -- npm.cmd run seed` → exit 0, six venues, six accounts.
- Limit: a terminal that leaves Gabay keeps 22 until closed; hooks and `verify` call Node through fnm, so they always get 22.

### S1 — Repository foundation — DONE 2026-10-07
- Evidence: `git init -b main`; 52 files committed as `d3a6c48`; `git ls-files` holds no APK, `sources/internal/`, `.env`, emulator data or `node_modules`; no `.env` secret value in any committed file (scanned); no remote. The seed skips the penthouse with a note when `sources/internal/` is absent (both paths exit 0) and the full seed still exits 0. The root `package.json` gains each script in the slice that builds it (only `seed` exists now), so no script points at a missing file.
- `git init` (branch `main`); `.gitignore` (APK, `db/seeds/sources/internal/`, `node_modules/`, `.env` but not `.env.example`, `.emulator-data/`, build outputs); `.gitattributes` (LF line endings for scripts and hooks, so they run in CI).
- Root `package.json` with the scripts above. README: the one-time `git config core.hooksPath .githooks` line (it is already in the README; it is kept).
- The seed skips the penthouse with a clear message when `sources/internal/` is absent (a clean clone).
- Check: `git status` lists no APK, no internal data and no `.env`; first local commit made; nothing pushed.

### S2 — API skeleton (`functions/`) — BUILT 2026-10-07 by api-coder; awaiting dod-reviewer
Checklist items, adapted where Cloud Functions differ (§6 lists each adaptation):
- **§3.1** middleware order: `trust proxy` hop count from env (default 1) → `x-powered-by` off → `helmet` → `cors` allow-list from `CORS_ORIGINS` (loud warning on the permissive fallback) → 5 MB body limit (`MAX_JSON_BODY`) → audit-logger slot (filled in Phase 2) → `/api` no-store headers → rate-limiter slot (Phase 2) → routes → 404 → error handler.
- **§3.16** config: `.env.example` heavily commented; the env loaded by absolute path; fail fast on missing required config; the `GlobalSetting` resolver (frozen defaults, 30 s cache, never throws, `PUBLIC_FLAGS` allow-list).
- **§3.8** one error shape `{ error }`; PostgreSQL errors logged, never echoed; unique-violation (`23505`) → 409; `err.httpStatus` for domain errors.
- **§3.9** the DB layer: one `pg` pool (explicit size and timeouts from env), `query(text, params)` that refuses a call without a params array, `withTransaction(fn)` (BEGIN/COMMIT/ROLLBACK), boot log without the password; `decimal.js` set once (precision 18, half-up) for money.
- **§3.10** `utils/dates.js`: UTC everywhere (invariant 12); `projectDates()` for `DATE` columns at the service boundary.
- **§3.11** `utils/pagination.js`: `{ items, totalCount, page, pageSize }`; one WHERE clause and one params list for both the count and the page; `sortBy` only through an allow-list map; `LIMIT/OFFSET`.
- **§3.18** `utils/requestContext.js`: `runWithActor`, `getActorId` (AsyncLocalStorage), plus the tenant id slot for Phase 2.
- `GET /api/health`: answers `{ status, db }` after a `SELECT 1`.
- `index.js`: `exports.api = onRequest({ region: 'asia-southeast1', maxInstances: 1 }, app)`.
- **§8.2** `db/migrations/` (zero-padded `NNNN_name.sql`, none yet). Every migration is idempotent, as §8.2 requires (`IF NOT EXISTS`, guarded `DO` blocks), so the runner applies them all in order each time, and after each one runs and prints its verification query. `setup-db`: dev mode (schema → migrations → seed) and `--bootstrap` (schema → reference seed), with `--stop-on-error` and `--skip-*`. No schema change.
- ESLint + Prettier with rules that fail the build.
- Tests with Node's built-in runner (`node --test`), against the local `gabay_dev`: error shape, the middleware order, pagination's count/page agreement, the actor context, the settings resolver's safe default on DB failure, `/api/health` through the Functions emulator.
- Pins: express 5, pg 8, decimal.js 10, helmet 8, cors 2, express-rate-limit 8, multer 2, firebase-functions 7, firebase-admin 14, zod, pino; exact versions read from npm on the day, rechecked against the Blueprint (a moved major is raised with you, not bumped).
- Evidence (api-coder, 2026-10-07; full output in the slice report): `npm ci` exit 0 in `functions/` and `db/tools/`; `node --test` in `functions/` 39 pass, 0 fail, exit 0 (twice); `db/tools` tests 5 pass, exit 0; `npm run lint` and `format:check` exit 0, each exit 1 on a deliberately bad file (deleted); `setup-db` dev exit 0 with 56 tables, 133 indexes, 1 trigger, six venues, six accounts; `--bootstrap` exit 0; `migrate` with no migrations exit 0; the Functions emulator answered `GET /demo-gabay/asia-southeast1/api/api/health` with `{"status":"ok","db":"ok"}`. Choices not in this plan: no dotenv (Node's `process.loadEnvFile`); `db/tools/` has its own package; DATE columns are returned as text by the pool.

### S3 — App skeleton (`app/`)
- `flutter create --org com.dynamiqes --project-name gabay --platforms android,ios,web`; `minSdk 24`; iOS deployment target 15.0.
- **§4.1** `lib/core/` (config, network, theme, services), `lib/shared/` (components, widgets, utils, navigation), `lib/features/` (empty, with the fixed shape documented), `main_mobile.dart`, `main_admin.dart`. No `kIsWeb` forks in shared trees.
- **§4.2** one `ProviderScope`; providers typed at file scope; services take no `ref`.
- **§4.3** `ApiClient`: one dio instance; token and tenant via callbacks; interceptors: debug logger → tenant + auth headers (per-call `Authorization` wins) → 401 handler that skips sign-in paths and calls `onUnauthenticated`. `formatApiError()` and `sanitizeErrorText()`.
- **§4.6** the `shared/` skeleton: the messaging overlay mounted in `MaterialApp.builder` (no `showSnackBar`), `Validators`, stubs for the list scaffold and form scaffold.
- **§4.7** theme: `ColorScheme.fromSeed` light and dark from one builder; a `GabayTokens` `ThemeExtension`, the only file holding colour literals. Seed `#C1623D` terracotta until the Gabay or Dynamiq brand colour is known (L123). The "Gabay" or "Terracotta" setting is P0-14, not Phase 1.
- **§4.8, §4.9** `AppVersion` (dart-defines with committed fallbacks, one stream per surface); `ChangelogEntry` lists (mobile, admin); `AppConfig.apiBaseUrl` with the release guard against localhost.
- go_router with `usePathUrlStrategy()`: two placeholder routes per surface, so the router is exercised.
- `analysis_options.yaml` customised so that lints fail the build.
- Tests: widget tests for both shells, the theme in both brightnesses, `formatApiError`, the interceptors with a fake adapter; **screenshots rendered by a test** of both empty shells, light and dark, phone and tablet (L121).

### S4 — Structural linters (`tools/lint/`)
Each is about 60 lines, names the file and line it fails on, and has a test that feeds it a bad sample and expects the failure.

| Linter | Catches | Source |
|---|---|---|
| `schema-drops` | a `CREATE TABLE` without its `DROP TABLE` | §8.2 |
| `schema-forms` | a `FieldSpec` that disagrees with `schema.sql` (type, nullability, length, scale); passes trivially until Phase 3's first form | §7.2 |
| `no-bare-textfield` | `TextFormField` / `TextField` inside `features/**/views/` | rule 7, gate |
| `colour-literals` | `Color(0x…)`, `Colors.black/white/grey…`, `primaryColor` outside the tokens file | rule 6, §4.7, gate |
| `sql-interpolation` | a `${…}` or `+` string inside a SQL text passed to `query`, except identifiers from an allow-list map | rule 3, gate |
| `tenant-predicate` | a SQL text touching a tenant-scoped table (read from `schema.sql`) with no `TenantId` predicate | rule 2, Blueprint catastrophic set |
| `position-privacy` | network or upload code outside `lib/core/analytics/` that imports the position stream | invariant 4, Blueprint catastrophic set |
| `foreground-manifest` | background location or background BLE in `AndroidManifest.xml`; an "Always" location key in `Info.plist` | Blueprint, Foreground rule |
| `migrations-immutable` | an edit to a committed migration; an unpadded number | rule 4, §8.2 |
| `no-snackbar` | `ScaffoldMessenger…showSnackBar` | §4.6 |

Deferred to the slice that creates the thing they guard: published-version immutability (P0-03; the database trigger already exists) and the Public-Read package allow-list (the first public route).

### S5 — Hooks and `npm run verify`
- `npm run verify` runs, in order: `node --check` on the critical files; every linter; ESLint; Prettier check; the API tests; `schema.sql` twice on the local PostgreSQL; the seed (Auth emulator); `flutter analyze`; `flutter test`. It prints one line per check with its result, ends `ALL GREEN` or lists the failures, and exits with the failure count.
- `.githooks/pre-commit`: the secret guard (pure shell); the version bump and changelog date stamp for the surface touched (Node, so the date is right on Windows); the changelog duplicate guard; the linters for the staged paths.
- `.githooks/pre-push`: `npm run verify`.
- `.claude/settings.json`: a Stop hook that refuses to finish without a passing `npm run verify` in the session; a Stop hook that refuses to finish when screens changed with no changelog entry; the drift linter after any Flutter edit.
- Check: each hook shown blocking a bad sample and passing a good one.

### S6 — CLAUDE.md under a page, the sync table and REVIEW.md
- CLAUDE.md rewritten to under a page (§8.4): commands, the verification block, absolute rules with their enforcers, the companion-file sync table (§8.5), the traps agents have actually hit here, and the "Rules every product agent carries" section, kept.
- The settled product rulings now in CLAUDE.md move to a project skill, `.claude/skills/gabay-product-rulings/`, which loads when work touches the shopper app (§8.4: "CLAUDE.md points; skills carry"). *Alternative:* a document CLAUDE.md links to; passed over because agents do not load it unless told.
- REVIEW.md: drop the passes CI now enforces.

### S7 — GitHub repository and CI
- **Stops for you:** you sign the GitHub CLI in as `dev42025pwd`. I then create `dev42025pwd/gabay` (private) and push `main`.
- `.github/workflows/lint.yml` (every push and PR): verify's fast part (linters, ESLint, `flutter analyze`, tests that need no database).
- `e2e.yml` (nightly and on demand): a PostgreSQL service from `schema.sql`, the seed with the Auth emulator, the API tests, the server log uploaded on failure; its cost stated in a header comment.
- `build.yml` (after lint passes): builds the admin web and a debug APK, stamping `APP_VERSION`, `BUILD_NUMBER`, `GIT_COMMIT` and `BUILD_TIME`. Artifacts only: no store upload, no Firebase deploy.
- Branch protection on `main`: lint must pass before merge.

### S8 — The gate
- Three deliberately bad commits on a throwaway branch (a hardcoded colour, an unparameterized query, a `TextFormField` in a view): each blocked by pre-commit; each also failing `lint.yml` when pushed with `--no-verify` to a test PR (which is then closed, not merged).
- dod-reviewer runs `npm run verify` in a fresh context.
- `phase-reports/phase-1.md`: each gate condition with its evidence; the documents synced (Blueprint pins and §2.3, pipeline, INSTALL, smoke guide, CLAUDE.md); the modules page republished. **You sign it.**

## 5. DESIGN CHOICES (for your approval with this plan)

| # | Choice | Alternative, and why it was passed over |
|---|---|---|
| DC-1 | Layout in §3 | Separate repositories: the drift linter and `verify` need both sides together |
| DC-2 | Tests with Node's built-in `node --test` | Jest or Vitest: a dependency outside §1 for no gain at this size |
| DC-3 | Tenant header `X-Tenant-Id` (DC28 names no header) | `X-Company-ID` as in the standard's example: Gabay's tenants are mall operators, so the name says what it is |
| DC-4 | Idempotent migrations re-run in order every time, with no ledger table (§8.2) | A ledger table recording what each database has applied: it would change the schema you signed, for a check the idempotency rule already covers |
| DC-5 | Rulings move to a project skill (S6) | A linked document: agents read it only when told |
| DC-6 | Phase 1's test DB is the local `gabay_dev`, reset by the schema run | A second database `gabay_test`: cleaner, but one more thing to set up; can be added if the seed reset gets in the way |

## 6. Where Cloud Functions change a standard item (stated, not hidden)

| Standard item | In Gabay | Why |
|---|---|---|
| §3.1 TLS options, fail fast | Not applicable | Google's front end ends TLS before the function; locally the emulator is http on 127.0.0.1 |
| §3.1 static, uploads, SPA fallback | Not applicable | Firebase Hosting serves the admin page (L93); files are in Cloud Storage (L98) |
| §3.1 "DB connect first, then `listen()`" | No `listen()`: the function is exported. The pool is created at cold start; `/api/health` and a first-request check return 503 with a log line when the database is unreachable | Cloud Functions owns the server |
| §3.1 graceful shutdown (P1) | Deferred to the SSE slice (P1-01) | No long-lived streams in Phase 1 |
| §3.9 `.input(name, type, value)`, `OUTPUT inserted.*` | `$1…$n` parameters; `RETURNING *` | `pg` and PostgreSQL (E-06, E-07) |
| A.6 `GO` splitter | Not applicable. Each schema or migration file runs as one `pg` query inside a transaction, with no parameters. Verified 2026-10-07 on the local database: three statements in one parameterless `query` returned three results; with parameters, PostgreSQL refuses ("cannot insert multiple commands into a prepared statement") | `GO` is a SQL Server batch separator |
| §3.11 `OFFSET/FETCH` | `LIMIT/OFFSET` | PostgreSQL |

## 7. Open items (asked when the slice reaches them, not assumed)

1. **The brand colour** (P0-14): yours to supply when known. Settled for Phase 1: terracotta (L123).
2. **The GitHub sign-in** (S7): yours to do.

## 8. Risks

- `verify` runs the schema and the seed, so it takes minutes and resets the local data each time. The pre-push hook therefore takes as long; the pre-commit hook runs only the fast linters for the staged files.
- `flutter create` output and generated platform files are large; reviewers skip them (REVIEW.md lists them as generated paths).

## 9. Done means

Every slice's checks pasted with exit codes; `npm run verify` ending `ALL GREEN` (exit 0) on a clean clone; the three gate commits blocked by the hooks and by CI; the gate report signed by you.
