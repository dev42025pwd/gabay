# FF-0 (client half): the lookups fetcher and the admin development banner: slice report

> **Plan**: `plan/FF0-dev-stub-lookups.md` 1.1 (APPROVED, L154), sections 4, 5 (client tests) and 6; parent `plan/PH4-feature-first.md` 1.0 | **Built by**: flutter-coder (Sonnet 5.5), in its working copy `Gabay-wt\flutter-coder`, branch `ff0-client` from `origin/main` | **Server half**: api-coder's branch `ff0-server`, not merged when this was built; the client is built against the contract in the hand-off, with fakes in the tests | **Status**: built; the product owner ruled the open questions (section 2) and the branch is green | **Reviewed by**: not yet (dod-reviewer)

## 1. What was built

All of it is in `app/`. There is no new screen route; the banner is on every admin page.

- **`LookupName`** (`shared/forms/lookup_names.dart`): an enum of the three FF-0 lookups, `building-types`, `amenity-types` and `transit-types`. A call site names an enum value, never a string. A later slice adds a line here and the same line in the server's allow-list.
- **`LookupService`** (`shared/forms/lookup_service.dart`): stateless, takes the one `ApiClient`.
  - `lookupFetcher(name)` returns the `LookupFetcher` that S9's `LookupPickerField` takes: `GET /api/lookups/:name` with `page` and, when not blank, `search`; the envelope and each row become a `PageResult<SelectOption>` (`id` to value, `label`, `isActive`).
  - `lookupOption(name, id)` returns the `currentOption`: `GET /api/lookups/:name/:id`, an inactive row included.
  - Errors are rethrown as dio threw them, for `formatApiError`. A reply of the wrong shape (no `items`, a row without `isActive`, a non-numeric `id`, no `totalCount`) is a `FormatException`, which `formatApiError` words as "unexpected reply".
  - The client sends no `X-Tenant-Id` and no token (FF-0: the stub decides).
- **`lookupServiceProvider`** (`shared/forms/lookup_providers.dart`): how a ViewModel reaches the service.
- **The banner** (`shared/components/dev_stub_banner.dart`, `core/config/dev_stub_provider.dart`, `AppConfig.showsDevStubBanner`): "Development build: no sign-in", mounted once in `GabayApp`'s `MaterialApp.builder` (inside the message overlay), so it sits above every admin page. Shown on the admin surface when the build is not a release build, or when it was made with `--dart-define=DEV_STUB=true`. Never on the shopper app. It wraps to more lines at text size x1.4 and grows with the text.
- **Wording**: `devStubBanner` and `changelogAdmin_e002_a` in `app_en.arb`, each with a description; `flutter gen-l10n` regenerated the two Dart files.
- **Changelog**: admin entry 2 (`changelog.dart`, ARB bullet). `adminFallbackVersion` is set to 0.1.4 by hand, equal to the new top entry, so `version_test.dart` holds before the commit; the pre-commit hook keeps a staged version above HEAD's.
- **Docs**: the retrofit ledger (`plan/PH4-feature-first.md` section 7) now has its table with the banner row; five rows in the frontend manual (`FF0-FE-01` to `FF0-FE-05`); one case in the smoke guide (0.3); `INSTALL.md` notes `DEV_STUB` and the screenshot count (8 was stale; it is 24); `shared/forms/README.md` lists the three new files.

## 2. Existing tests changed, by the product owner's ruling

Three existing-test changes, each ruled by the product owner on 2026-10-09 (L163), each setup or cleanup only, **no assertion changed**:

| File | Change | Why |
|---|---|---|
| `app/test/shell_test.dart`, "admin shell nothing overflows at text size x1.4 on a small phone" | `await tester.scrollUntilVisible(find.text(l10n.aboutAction), 100);` before the tap | The banner takes room: at 320 px and x1.4 it is two lines (three in the test's fixed-width font), so the "About this app" button is built lazily below the fold and `tester.tap` found nothing (`Found 0 widgets with text "About this app"`, shell_test.dart:61). Not a defect |
| `tools/test/verify-lock-review.test.js`, "I1: a stale lock that cannot be removed ..." (both kinds) | The helper's `release` awaits the PowerShell process's real exit; the folder delete retries on EBUSY or EPERM | The flake of section 4 run 1: `EBUSY ... unlink ...\test.lock` after a fixed 300 ms sleep. Same fix as `a7cc993` made for `verify-lock-fix.test.js` |
| `tools/test/verify-logs.test.js`, the two tests that use `holdOpen` | `holdOpen`'s release awaits the helper's exit; the folder delete retries (replacing a fixed 500 ms sleep) | The same fixed-sleep-then-delete pattern, found by checking every test under `tools/test/` that holds a file open from a helper process (only these three files do) |

The retry helper, `cleanWhenFree(folder, withinMs = 5000)` (every 50 ms, EBUSY or EPERM only, bounded), is in `tools/test/verify-scratch.js` beside `clean`, so the two files share one copy. `verify-lock-fix.test.js` keeps its own copy from `a7cc993`, untouched.

The three lock-holding test files (`verify-lock-review`, `verify-logs`, `verify-lock-fix`) passed five runs in a row, alone: each run `# tests 48  # pass 47  # fail 0  # skipped 1` (the one skip is the existing platform skip).

## 3. Tests, failing first

**New files** (existing files touched only as section 2 lists, plus one addition to the screenshot test, below):

| File | Tests | What it proves |
|---|---|---|
| `test/forms/lookup_service_test.dart` | 18 | the three names; the path, page and search sent; blank search omitted; no tenant header and no token; the envelope and rows mapped, `isActive` included; an empty page; five malformed replies refused; `lookupOption` reads one row, inactive too; errors worded by `formatApiError`: 404, 403, 503, a 500 with no message, a 500 naming `DEV_STUB_USER_EMAIL`, a connection failure, a malformed reply |
| `test/forms/lookup_picker_wiring_test.dart` | 8 | the picker over the real `LookupService` and a fake route: lists active rows; choosing reports the id; searching asks the route; a held inactive value is shown "(inactive)" through `lookupOption`, still satisfies `required`, and opening and closing the picker does not clear it; an active held value shows plainly; a route error shows its message with a working retry; no overflow at x1.4 on 320 px |
| `test/dev_stub_banner_test.dart` | 12 | `showsDevStubBanner` for every mode and define; the define is off in tests; shown on the admin page above the app bar, full width, on About too; not on the shopper app; hidden when the provider says release; screen-reader name; the colour scheme in light and dark; x1.4 at 320 px with no overflow; a much longer line wraps |
| `test/screenshot_test.dart` | +4 scenarios | `admin_dev_stub_banner_{light,dark}_{phone,tablet}`. These were added to the existing file's `scenario` helper; no existing scenario or assertion changed |

**Failing before the code**, `flutter test` on the four files with the library files absent:

```
Failed to load ".../test/forms/lookup_service_test.dart":  Error when reading 'lib/shared/forms/lookup_names.dart'
Failed to load ".../test/forms/lookup_picker_wiring_test.dart": Error when reading 'lib/shared/forms/lookup_names.dart'
Failed to load ".../test/dev_stub_banner_test.dart": Error when reading 'lib/core/config/dev_stub_provider.dart'
Failed to load ".../test/screenshot_test.dart": Error when reading 'lib/shared/components/dev_stub_banner.dart'
00:00 +0 -4: Some tests failed.      exit=1
```

That red is a compile failure, as the new names did not exist yet; it proves the tests could not pass before the code. After the code, three failures were real and are why two things in the code changed:

1. **The banner was silent to a screen reader.** `find.bySemanticsLabel` found nothing, and the semantics tree had no banner node, though the text was on screen. Cause: the banner was the first child of the `Column`, so it painted before the Navigator, and the route barrier blocks the semantics of everything painted before it. Fix: the `Column` is laid out upward (page first, banner second), so the banner paints after the page and still sits on top. The test "has a screen-reader name" holds this.
2. A fake adapter of mine answered a 500 HTML body as JSON, so dio could not parse it (test bug, fixed in the test).
3. My x1.4 banner test tapped a button below the fold (the same cause as section 2); it now scrolls first.

## 4. Verification

`flutter analyze`: `No issues found!`.

`flutter test` on the first commit (`6e3abbf`, before the owner's ruling): `+283 -1: Some tests failed.`, the one failure being the `shell_test.dart` test of section 2. After the ruling it passes (run 4).

`npm run verify` (`GABAY_VERIFY_OWNER=flutter-coder`), run twice on this working tree:

- **Run 1** (superseded; with the one-line scroll applied to `shell_test.dart`): `1 FAILED: tools-tests` (351.7 s). The failing test was `tools/test/verify-lock-review.test.js`, "I1: a stale lock that cannot be removed...", with `EBUSY: resource busy or locked, unlink '...\gabay-lock-stuck-616TVl\test.lock'` on Windows, in the test's own temp-folder cleanup. I did not touch `tools/`. That file alone passes (9 pass, 0 fail) twice in a row. It looks like a Windows file-handle timing flake in that test's cleanup (not mine to fix here); see Suggestions.
- **Run 2** (same tree, same one-line scroll): every check `ok`, and

```
ok   tools-tests          (155.3 s)
ok   eslint               (14.5 s)
ok   prettier             (3.3 s)
ok   schema-run-1         (3.8 s)
ok   schema-run-2         (1.9 s)
ok   api-tests            (17.8 s)
ok   db-tools-tests       (1.4 s)
ok   seed                 (68.0 s)
ok   functions-health     (28.6 s)
ok   flutter-analyze      (49.1 s)
ok   flutter-test         (37.6 s)

ALL GREEN   (395.3 s)
EXIT=0
```

- **Run 3** (the committed state `6e3abbf`, `shell_test.dart` untouched): every check `ok` except one,

```
ok   tools-tests          (120.1 s)    ok   flutter-analyze      (32.6 s)
FAIL flutter-test         (21.5 s)
  shell_test.dart: admin shell nothing overflows at text size x1.4 on a small phone [E]
  00:15 +283 -1: Some tests failed.
1 FAILED: flutter-test   (303.7 s)
EXIT=1
```

That ALL GREEN (run 2) needs the one-line change to an existing test. Without it, `flutter-test` fails by exactly that test and verify exits 1. Nothing is reported as passing beyond this.
- **Run 4** (final, after the owner's rulings: the `shell_test.dart` scroll, the lock-test cleanups, and `origin/main` merged in, which brings FF-0's server half, PR #16). `flutter analyze`: `No issues found!`.

```
ok   tools-tests          (134.3 s)
ok   eslint               (24.6 s)
ok   prettier             (5.2 s)
ok   api-tests            (14.3 s)
ok   seed                 (63.1 s)
ok   functions-health     (32.3 s)
ok   flutter-analyze      (11.4 s)
ok   flutter-test         (31.8 s)
ALL GREEN   (337.7 s)
EXIT=0
```
(all 15 checks `ok`; the others are omitted here for length)

**Screenshots** (test-rendered from the committed state, Roboto and the Material icons loaded from the SDK, no private data), committed in `phase-reports/feature-first/shots/FF-0/`:
[light phone](shots/FF-0/admin_dev_stub_banner_light_phone.png), [dark phone](shots/FF-0/admin_dev_stub_banner_dark_phone.png), [light tablet](shots/FF-0/admin_dev_stub_banner_light_tablet.png), [dark tablet](shots/FF-0/admin_dev_stub_banner_dark_tablet.png).
The test renders 24 PNGs in all; the other 20 are the existing shell, About and message-banner shots, which now show the banner on the admin surface. I looked at light and dark on the phone and light on the tablet: a full-width tinted band with an icon and the text, above the app bar, readable in both modes.

## 5. DESIGN CHOICES (flutter-coder; each with its alternative)

1. **`LookupName` is an enum.** A misspelt name is a compile error, not a 404. *Alternative:* `static const String` constants, which still allow a free string at a call site.
2. **`LookupService` is a stateless class with a provider,** and `lookupFetcher` and `lookupOption` are its methods. The plan's `lookupFetcher(name)` needs an `ApiClient` from somewhere, and services take theirs in the constructor (`core/services/README.md`). *Alternative:* free functions with the `ApiClient` as a first parameter.
3. **The banner is mounted in `MaterialApp.builder`,** so every admin route has it and a later screen cannot forget it. *Alternative:* a line in each admin screen or in a future shell route; the ledger would then need a row per screen.
4. **The banner is painted after the page** (an upward `Column`), for the reason in section 3. *Alternative:* a `Stack` with the banner over the page's top edge, which would cover the app bar.
5. **Colours are `colorScheme.tertiaryContainer` and `onTertiaryContainer`,** as the plan says "colorScheme only". *Alternative:* `GabayTokens.warningContainer`, the project's semantic warning colour, which is also allowed by rule 6.
6. **The screen-reader name is the banner's own text,** read once (one ARB string, the icon is decoration). *Alternative:* a longer spoken sentence, which would be a second string to translate.
7. **Visibility is `!kReleaseMode || DEV_STUB`,** with the surface check in the provider and the mode check in a pure `AppConfig.showsDevStubBanner` (a test cannot change `kReleaseMode`). The define name is `DEV_STUB`, as in the plan. *Alternative:* always shown until R8, which the plan names and passes over.
8. **The fetcher sends no `pageSize`** (the server's default is 25 and it echoes the value it used), omits `search` when blank, and reads `id` only as a whole number. *Alternative:* sending a size constant, which would be a second place for the number.
9. **One changelog bullet, for the banner only.** The fetcher changes nothing a person sees yet. *Alternative:* a bullet about choice lists, which would claim something not visible.
10. **The four screenshot scenarios were added to the existing `screenshot_test.dart`.** It owns the font loading and the `scenario` helper, and extracting them would have edited existing tests. *Alternative:* a second screenshot file with a copy of the font loader.
11. **`adminFallbackVersion` was set to 0.1.4 by hand,** to equal the new top changelog entry before the commit, since `version_test.dart` compares them and `verify` runs before the hook. The hook keeps a staged version above HEAD's. *Alternative:* leave 0.1.3 and let `version_test` fail until the commit.

## 6. Definition of done (FEATURE_PIPELINE section 5), for the client half

| Item | Status |
|---|---|
| 1, 2 (schema, seeds) | N/A: the client changes neither; the lookup rows are the server half's and already seeded |
| 3 | `Waived: 3 (guard order) — the dev stub stands in; R1–R3, checked by R7's route-guard-order lint` |
| 4 | `Waived: 4 (permission and menu rows) — R2` |
| 5 Four states, `formatApiError` | Met: the fetcher's errors go through `formatApiError` (tests); the picker's four states are S9's, exercised over the real service. The banner has no list |
| 6, 7 (notifications, refresh on return) | N/A: none |
| 8 Rule 6 | Met: `colour-literals` passes; the banner takes `colorScheme` only |
| 9 | `Waived: 9 (automated e2e) — R12`. The frontend manual cases are written now |
| 10 Manuals and smoke guide | Met: `FF0-FE-01` to `FF0-FE-05`; smoke guide 0.3 |
| 11 Changelog | Met: admin entry 2 |
| 12 Sync table | Walked below |
| 13 FieldSpecs | N/A: no new field; the drift linter passes |
| 14 Enumerable sets | Met for the client: no list is hardcoded; `LookupName` holds route names, not options |
| 15 Inactive lookup value | `N/A for FF-0 — no record type references a lookup yet; FF-1's plan carries the full end-to-end item-15 test (L155)`. The client half is tested now: a held inactive value shows "(inactive)" via `lookupOption` and survives opening the picker |
| G1 Traceability | Section 7 |
| G2 | Screen-reader name, no overflow at x1.4 on 320 px: met. Tagalog for `devStubBanner` and `changelogAdmin_e002_a` waits for P0-14 (owner's ruling, L163; no `app_tl.arb` exists until then, `l10n.yaml`, L109, as in S9's report) |
| G3 | N/A: admin side |
| G4 | No difference from the PRD or Blueprint |

**Companion-file sync table:**

| Row | Done |
|---|---|
| `db/schema.sql` | N/A |
| An API route | N/A for the client (the route, its tests, the API manual and Blueprint 4.15 are api-coder's) |
| A screen or its wording | ARB with descriptions; changelog entry; screenshots; frontend manual; smoke guide. Tagalog waived to P0-14 |
| A dependency | None added |
| A setting, limit or option list | `DEV_STUB` (a build define) in `INSTALL.md` and, with the banner's visibility rule and `LookupService`/`LookupName`, in Blueprint Part 4 anchor 4.15 (one body line, client half); no option list in the client. `DEV_STUB_USER_EMAIL` is the server's |
| A command or check | None added; `INSTALL.md`'s screenshot count corrected |
| An owner ruling | None new |
| A pipeline entry's state | FF-0 is not DONE: the server half and review remain. No marker |
| A deploy or an incident | None |

## 7. Traceability (plan section 5, client; criterion to test)

| Criterion | Test |
|---|---|
| The fetcher maps rows | `lookup_service_test.dart`: "maps the envelope and each row to a SelectOption", "an empty page..." |
| The fetcher maps errors | `lookup_service_test.dart` group "errors" (404, 403, 503, 500 with and without a message, connection, malformed); "a reply that is not the envelope is refused as unexpected" |
| The picker shows a held inactive value as inactive | `lookup_picker_wiring_test.dart`: "shows inactive, with its label from lookupOption"; "still satisfies required, and opening the picker keeps it" |
| The banner has its name | `dev_stub_banner_test.dart`: "has a screen-reader name" |
| The banner passes x1.4 at 320 px | `dev_stub_banner_test.dart`: "nothing overflows at text size x1.4 on a 320 px phone", "a much longer line wraps..."; the picker's own x1.4 test |
| The banner shows only where it should | `dev_stub_banner_test.dart`: "where it shows" and `AppConfig.showsDevStubBanner` |
| The screenshot test | `screenshot_test.dart`: `admin_dev_stub_banner_*` (4) |
| Existing tests | Only the three owner-ruled changes of section 2 (no assertion changed); `screenshot_test.dart` gains scenarios only |

## 8. Suggestions (outside the slice)

- The ledger table: main (PR #16) and this branch both added one; merged by hand into main's layout (nine columns, one table), with the banner row added under api-coder's two route rows.
- Two things left as they are on purpose (dod-reviewer's nits): the four `admin_dev_stub_banner_*` scenarios duplicate what the existing admin shell scenarios already render (they add the explicit banner assertion); and `verify-lock-fix.test.js` keeps its own `cleanWhenFree` copy rather than importing the shared one from `verify-scratch.js`.
- A Tagalog file could be started before P0-14 for the phrases already in the app, so each slice's wording is reviewed as it lands rather than all at once.
