# Plan: a failing check's whole output is kept (verify logs)

> **Version**: 1.1 | **Date**: 2026-10-08 | **Status**: APPROVED by Genesis Perez, 2026-10-08 (plan.html L141); 1.1 adds the review fixes (L142) | **Spec**: none (tooling for Phase 1's rails, as `plan/PH1-rails.md`, L123) | **Approver**: Genesis Perez, product owner | **Builds**: api-coder (Sonnet 5.5), tests first | **Review**: dod-reviewer (AI self-check) | **Merge**: the product owner's go (L139)

## Why

`npm run verify` prints only the last 30 lines of a failing check (`TAIL_LINES`, `tools/verify.js`; `tail` in `tools/lib/proc.js`). On 2026-10-08 a full verify ended `1 FAILED: tools-tests` once under heavy load, and the failing test's name was cut off; it never came back in later runs (dod-reviewer: `tools:test` 6 of 6 green, 3 under full load), so its cause is unproven (`plan/PH1-verify-lock.md`, L140).

## What (the product owner's choice: local logs only)

1. **A failing check's whole output is saved** to `.verify/logs/<check>.log` (`.verify/` is already git-ignored), before it is cut to the tail. The FAIL line names the file; the console still shows the last 30 lines.
2. **Only the latest run's failures.** At its start, after taking the verify lock, verify empties `.verify/logs/`; a green run leaves it empty.
3. **A size cap.** Each log keeps at most a named limit (5 MB); beyond it, the start and the end are kept with a line saying how much was cut.
4. **Every failing path.** A check's command failing, timing out (`GABAY_VERIFY_CHECK_TIMEOUT_MS`), a server that would not start, the per-file checks: whatever output the check had is saved.
5. **Not in CI's workflows.** No workflow or snapshot changes (the product owner's choice); e2e already uploads its own log on failure.

## DESIGN CHOICES (each with an alternative)

| # | Choice | Alternative, and why it was passed over |
|---|---|---|
| VG-1 | One file per failing check | One combined log for the run: harder to read when several checks fail |
| VG-2 | Failing checks only | Every check's output: disk use for nothing on a green run |
| VG-3 | Logs emptied at the start of each run | Kept across runs with timestamps: old failures pile up and are mistaken for current ones |
| VG-4 | Head and tail kept past the cap | Only the tail: a failure's first lines (the test name, the first error) are often at the start |

## Tests (tests first; each fails before its fix)

- A failing check leaves `.verify/logs/<check>.log` with its whole output (longer than 30 lines), and the FAIL line names it.
- A green run leaves `.verify/logs/` empty, including after a red run.
- A timed-out check's output is saved.
- An output past the cap keeps its start and end with the "cut" line.

## Review fixes (1.1; dod-reviewer's review of `2fe0898`, the product owner's rulings, L142)

1. **The cut is made once and its count is true.** `runCommand` already caps its output (head, tail and a "cut N characters" line); `writeLog` must not cap that text again, which replaced the true count with the size of the first cut line (reviewer: a 300 MB failure saved as "cut 154 characters"). Test: an output past the cap is saved with the real number of characters cut.
2. **One locked log does not stop the reset.** Each old log is removed on its own, with a short retry for a brief antivirus or indexer lock; any that still cannot be removed are named in one line, and the rest are removed (reviewer: one log held open on Windows left all three in place). Test: one log held open, the others removed, the held one named.
3. **Why a check stopped.** `node-check` and `structural-linters` say "TIMED OUT" in their console tail and their log when they are cut off, as the command checks do.
4. **The finish check points to the logs.** When the last verify failed, the Stop hook's notice (`.claude/hooks/stop-verify.js`) also says the full output is in `.verify/logs/`.
5. **The pull request states** that a failing check on GitHub now prints up to about 5 MB of output instead of 2 MB (CI prints the whole output; no workflow change).

## Companion files (CLAUDE.md's sync table)

CLAUDE.md's Commands (where a failing check's full output is); README's verify section; WORKING_AGREEMENT §6 only if its verify row describes the output.

## Done when

The tests above pass; a deliberately failing check shows its whole output in `.verify/logs/` (pasted); a full verify ALL GREEN with `.verify/logs/` empty; dod-reviewer's check; the pull request's `lint` and `e2e` green; the product owner merges.
