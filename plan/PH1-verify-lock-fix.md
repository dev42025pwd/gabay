# Plan: the verify lock never goes to two runs at once (lock fix)

> **Version**: 1.0 | **Date**: 2026-10-08 | **Status**: APPROVED by Genesis Perez, 2026-10-08 (plan.html L143) | **Spec**: none (tooling for Phase 1's rails, as `plan/PH1-rails.md`, L123; amends `plan/PH1-verify-lock.md`, L140) | **Approver**: Genesis Perez, product owner | **Builds**: api-coder (Sonnet 5.5), tests first | **Review**: dod-reviewer (AI self-check) | **Merge**: the product owner's go (L139)

## Why

The verify lock (`tools/lib/verify-lock.js`, merged in PR #3) can give the lock to two runs at once under heavy load. api-coder's stress harness (8 runs per round, CPU burners, 12 parallel copies) saw two holders at once in about 7 of 96 rounds, and one full verify went red on it: `tools/test/verify-lock-review.test.js` "S2a: eight runs released at the same moment never hold the lock together" (round 1: two holders at once). The verify logs (L141) named the test. Two causes:

1. **A release can fail silently.** `releaseLock` swallows its `unlinkSync` error. On Windows another run reading the lock file at that moment can make the delete fail, so a finished run leaves a lock behind that the waiting runs then judge dead (api-coder's reading, not confirmed by a trace; an experiment with retries in `releaseLock` cut the bad rounds from about 9 to 1 in 96).
2. **Clearing a dead lock can remove a live one.** Several waiting runs judge the same dead lock; one clears it and a new run takes the lock; a waiter that judged earlier then renames that new, live lock aside (`clearStale`; its link-back fails when a third run has already created a lock). The code calls this a window of microseconds; under load it widens.

## What

1. **Release retries.** `releaseLock` removes its lock with a short retry (as `resetLogs` does, `rmSync` with `maxRetries` and `retryDelay`, named constants). If the lock is still there afterwards, verify prints one line naming the file, so a leftover lock is never silent. It still never removes a lock that is not its own.
2. **One clearer at a time.** Before judging a lock dead and removing it, a run takes a short claim file beside the lock (`<lock>.clearing`), created exclusively so only one run can hold it. Holding the claim, it re-reads the lock and judges again; it removes the lock only if it is still the same dead lock, then removes its claim. A run that does not get the claim goes on waiting and judges afresh next time, never acting on what it read before. A claim older than a named limit (about 30 s, far longer than a clear takes) is treated as left by a crashed run and removed with a line.
3. **Unchanged:** the waiting, the 15-minute limit, the busy line, a newer-version lock never cleared (VL-6), an unreadable lock cleared as stale (VL-5) under the same claim, no lock in CI, the record format (`version` stays 1 unless the plan's rules change; say so if a change is needed).

## DESIGN CHOICES (each with an alternative)

| # | Choice | Alternative, and why it was passed over |
|---|---|---|
| LF-1 | A short exclusive claim file for clearing | Keep rename-compare-link-back (VL-7): narrows the window but cannot close it, as the stress run showed |
| LF-2 | Deterministic race tests through a test-only pause point between "judge" and "remove" | Only a large stress test: slow, and can still miss the race on a fast or idle machine |
| LF-3 | A stale claim is removed after about 30 s | No expiry: a run killed while clearing would block every later run until the 15-minute limit |

## Tests (tests first; each fails before its fix)

- **The clearing race, forced:** run A judges a dead lock and pauses (test-only pause point); run B clears it and a run C takes the lock; A resumes: C's lock survives and A does not hold the lock.
- **Only one clearer:** while one run holds the claim, another neither removes the lock nor the claim.
- **A stale claim** (older than the limit, its run gone) is removed with its line, and clearing proceeds.
- **Release with the file held open briefly** (Windows: PowerShell `FileShare None` for a moment): the retry removes it. **Held throughout:** the line names the leftover lock.
- **A short stress test:** several runs released together for a few rounds, each appending "in" and "out" to one sequence log; the log strictly alternates. Kept fast (seconds).
- The existing lock tests keep passing unchanged; list any that must change with a one-line reason (rule C1).

## Companion files (CLAUDE.md's sync table)

README's verify section (the leftover-lock line, the claim file); `plan/PH1-verify-lock.md` is not edited (this plan amends it); CLAUDE.md only if its verify line describes clearing.

## Done when

The tests above pass, and the forced-race test fails on `main`'s code (pasted); api-coder's stress harness shows no double holder in at least 96 rounds under load (pasted); a full verify ALL GREEN; dod-reviewer's check; the pull request's `lint` and `e2e` green; the product owner merges.
