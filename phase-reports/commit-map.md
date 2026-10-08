# Commit map: hashes before and after the history rewrite

> **Date**: 2026-10-08 | **Why**: L135 (every commit's author and committer email rewritten to `200053725+dev42025pwd@users.noreply.github.com` before the first push) and L137 (the drawing measurements removed from plan.html's L134 row in every commit) | **How**: `git filter-branch` with an env filter for the two emails and a tree filter that trims the L134 row; nothing else in any commit changed (old and new head differ only in plan.html, 4 lines in, 5 out) | **Use**: plan.html rows, slice reports and commit messages written before this date cite the old hashes; look them up here.

| # | Old | New | Date | Subject |
|---|---|---|---|---|
| 1 | `d3a6c48` | `c95372e` | 2026-10-07 | Phase 0 documents, the test seed and the Phase 1 plan (S1) |
| 2 | `92ec211` | `b03607d` | 2026-10-07 | S1 done: repository foundation evidence in plan/PH1-rails.md |
| 3 | `a262d2a` | `e554132` | 2026-10-07 | S2 prep: pins for zod, pino, eslint, globals, prettier; pg multi-statement check verified |
| 4 | `c28b321` | `726367d` | 2026-10-07 | S2: API skeleton (functions/), db/tools (migrate, setup-db), db/migrations |
| 5 | `4252f72` | `cdcc7f1` | 2026-10-07 | S3: app skeleton (app/) |
| 6 | `49dd3f7` | `74fcfda` | 2026-10-07 | L125: documents into docs/ (product, process, testing, ops, reference) |
| 7 | `58ba1a8` | `b29a2c0` | 2026-10-07 | L126: S2/S3 review rulings (request-ID and actor-context steps, ARB now, E-15/E-16), pins merged, plan 1.3 |
| 8 | `f8ae713` | `6d9592f` | 2026-10-07 | S3 follow-up: ARB localisation (L126), empty default signInPaths |
| 9 | `5fb83fa` | `dc2d7a4` | 2026-10-07 | S2 review fixes: lazy app build, 503 on db unreachable, settings precedence, requestId and actorContext slots |
| 10 | `e8d5d00` | `80be7d0` | 2026-10-07 | S2 re-review fixes: tag only the db layer's own errors in transactions, normalise tenant ids in settings |
| 11 | `732ddae` | `b9fd32a` | 2026-10-07 | L127: intl as E-17 (S3 review); S2 slice report; plan nit A |
| 12 | `55704dd` | `1affe95` | 2026-10-07 | S2 final nit: normaliseTenantId can never throw; fix the withTransaction doc comment |
| 13 | `6eb4be9` | `e152740` | 2026-10-07 | S3 review fixes: sanitizer, ARB integrity, manifest, entry-point tests |
| 14 | `8076757` | `3826092` | 2026-10-07 | S3: drop the web manifest's portrait lock (L103: tablets and the admin page get landscape); S2 report closed |
| 15 | `6f3bc37` | `109cef5` | 2026-10-07 | S4: structural linters (tools/lint): ten linters, runner, tests |
| 16 | `9625105` | `2e08ad7` | 2026-10-07 | S3 final nits: anchored sanitizer rules, changelog text check |
| 17 | `7c9073b` | `10ff41f` | 2026-10-07 | S3 slice report |
| 18 | `bc8e9d5` | `eee37e9` | 2026-10-07 | L128: S4 review rulings (text fields everywhere, positioning allow-list, two enforcers to Phase 2); REVIEW.md annotation and position passes |
| 19 | `57e7616` | `6d10248` | 2026-10-07 | S4 review fixes: tenant-predicate and sql-interpolation hardened, wider scopes, runner never passes silently |
| 20 | `ded10a0` | `c068a41` | 2026-10-07 | S4 re-check fixes: unreadable runPaged calls fail, narrower Colors match, runner and manifest nits |
| 21 | `397bf1d` | `7109a1e` | 2026-10-07 | S4 slice report; README limit for lower-case unquoted SQL; plan S2-S4 marked done |
| 22 | `50fae17` | `8a0b148` | 2026-10-07 | L129: S5 hook rulings (patch bump per touched surface; verify Stop hook requires a run, shows failure; main session only) |
| 23 | `9840e96` | `719af85` | 2026-10-07 | S5: npm run verify, git hooks, Claude hooks (L126, L129) |
| 24 | `220f3f8` | `11f24da` | 2026-10-07 | S5: mark the three hooks executable |
| 25 | `7150314` | `fad9c92` | 2026-10-07 | S5: verify fails when code changes during a run; hooks executable test; pubspec 0.1.0+1 |
| 26 | `a1ac587` | `7cfff38` | 2026-10-07 | L130: screens Stop hook blocks until a changelog entry or a stated waiver; main session only |
| 27 | `c16b4ef` | `ff3ec7e` | 2026-10-07 | S5 review fixes: stamp rules, staged-content linting, dirty-tree push refusal, L130 screens hook |
| 28 | `2825924` | `3d8c06a` | 2026-10-07 | S5 second-round fixes: fixtures for the tools tests, entry-targeted stamp, pre-push judges the pushed refs |
| 29 | `f91cf2e` | `515d156` | 2026-10-07 | S5 last fixes: stamp the last entry with the committed number, pre-push peels tags, waiver shapes |
| 30 | `faaf7f5` | `ba4e088` | 2026-10-07 | S5 slice report; WORKING_AGREEMENT §6 pre-push row; plan S5 marked done |
| 31 | `224f8c7` | `57036c2` | 2026-10-08 | S6: CLAUDE.md rewritten (93 lines), product rulings to the gabay-product-rulings skill, REVIEW.md 1.1 (L131) |
| 32 | `92958f2` | `b7946ef` | 2026-10-08 | S6 review fixes: CLAUDE.md meaning restored, quoted frontmatter, REVIEW.md severity and skips, WORKING_AGREEMENT 1.7; S6 report |
| 33 | `b56f35b` | `c590ceb` | 2026-10-08 | L132: CLAUDE.md length accepted, §8.4 one-page item waived; S6 done |
| 34 | `d7f16fa` | `7d09856` | 2026-10-08 | L133: S7 repo under dev42025pwd; on GitHub Free the hooks gate and CI reports (no branch protection) |
| 35 | `a0d2934` | `937a11b` | 2026-10-08 | S7: GitHub Actions workflows (local files only), ci guards, Linux support in the tools |
| 36 | `57ff232` | `e37cff1` | 2026-10-08 | L134: spike MEZZ building ground floor from the owner's blueprint; the stair behaves as the demo app's (0.70) |
| 37 | `caf2cc4` | `c980c12` | 2026-10-08 | L135: the repository is public as it is; commit emails to the GitHub noreply address before the first push |
| 38 | `c4c0034` | `d7be645` | 2026-10-08 | L136: changes reach main only through pull requests; lint and e2e required, no bypass; S7 to plan 1.10 |
| 39 | `8a871f3` | `7dfc8be` | 2026-10-08 | S7 review fixes: fork-safe build job, schema before the tests that read it, migration history on pushes, stronger workflow rules, e2e on pull requests (L135, L136) |
| 40 | `aea7283` | `af39f66` | 2026-10-08 | WORKING_AGREEMENT 1.8: date 2026-10-08 (S7 review nit) |
| 41 | `b8385c5` | `e692c00` | 2026-10-08 | S7 round 2: lint pushes only on main, gate steps pinned, shallow and force-push-of-main fail, cap validated |
| 42 | `3951fc3` | `6c54436` | 2026-10-08 | S7 round 2: verify's record is written atomically; a corrupt record is reported as corrupt |
| 43 | `34bb99b` | `2bc1aa8` | 2026-10-08 | S7 round 3: db-unavailable test setup no longer under the 300 ms limit; workflow env values and step lists pinned; stale verify temp files removed; unreadable verify record named |
| 44 | `262a0a5` | `51922b2` | 2026-10-08 | S7 round 3: unused rest argument in the failed-write test (ESLint) |
| 45 | `372b3f4` | `cd9243a` | 2026-10-08 | S7 round 4: whole-text snapshot of every workflow; verify repairs a leftover firebase-export folder after the seed check |
| 46 | `7b1764e` | `875867d` | 2026-10-08 | S7 round 5: workflow files plain ASCII; repairSeedExport leaves live exports alone; action SHAs kept in the snapshot; blank lines in block scalars compared; auth_export required |
| 47 | `0a794af` | `56c9a6a` | 2026-10-08 | S7 round 5: build the LS, PS and BOM probe characters from code points (a literal LS in the test file is a line break to ESLint) |
| 48 | `9912a83` | `664b5d1` | 2026-10-08 | S7 slice report; CLAUDE.md names ci:guards and the verify check cap; seed README on a just-made leftover export |

The full 40-character hashes: old `9912a83b7089de99755f599adfe5d730e75be170` became `664b5d130d5fcb11ce74676cd286743d8ae3ec27` (the head before this map was committed).
