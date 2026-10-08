# Plan: one verify at a time on this machine (the verify lock)

> **Version**: 1.1 | **Date**: 2026-10-08 | **Status**: APPROVED by Genesis Perez, 2026-10-08 (plan.html L140); 1.1 adds the review fixes and names the two changed test files (L140) | **Spec**: none (tooling for Phase 1's rails, as `plan/PH1-rails.md`, L123) | **Approver**: Genesis Perez, product owner | **Builds**: api-coder (Sonnet 5.5), tests first | **Review**: dod-reviewer (AI self-check) | **Merge**: the product owner's go (L139)

## Why

Every `npm run verify` uses the same machine-wide resources: the database `gabay_dev` (`PGDATABASE` in `.env`) and the emulator ports fixed in committed files (5001 in `firebase.json`, 9099 in `db/seeds/firebase.json`, the hub on 4400, logging on 4500; `tools/verify.js` `FUNCTIONS_PORTS`, `SEED_PORTS`). On 2026-10-08, runs by api-coder and the main session overlapped and went red with no code fault: "Auth emulator port taken", api-tests 60/61, the hub moved 4400 → 4401, and one corrupted `.verify/last-run.json` (fixed in S7 by an atomic write). Recorded in `phase-reports/phase-1/S7.md` §6.

## What (Part 1 only; the product owner's choice)

1. **One lock for the whole machine.** At its start, before any check, `npm run verify` creates a lock file in the system temp folder (`os.tmpdir()`, named for Gabay), with an exclusive create, so only one run can hold it. The file records who holds it (`GABAY_VERIFY_OWNER` if set, for example `api-coder` or `main session`, otherwise the user and folder), the process ID, the folder, the commit and the start time.
2. **A second run waits, with a limit** (the product owner's choice). It prints `verify is busy: held by <who> (pid <n>, <folder>, <commit>) since <time>` at once and then each minute. After a named limit (15 minutes by default, a validated positive whole number in an env value) it stops with exit 2, naming the holder. It is not recorded as a verify run.
3. **A stale lock is cleared.** A lock whose process no longer exists is removed with one line saying so; then the run takes the lock.
4. **Always released.** Normal end, a failed check, Ctrl+C or a termination signal: the lock is removed (the same paths that already stop the servers verify started). Only the holder removes its own lock.
5. **CI skips it.** GitHub's runners are fresh and run one job each; with `CI=true` there is no lock, and the workflow snapshot is unchanged.
6. **Partial runs** (`--only`) take the lock too, since they may use the database or ports. `--list` does not.

## Not in this plan

Part 2 (each coder in its own `git worktree` with its own database `gabay_wt_<name>`, sharing the ports under this lock) is planned again after S8 (the product owner's choice). Different ports per working copy would need generated emulator configs; whether the Firebase CLI can override the committed ports is RECALLED and unchecked.

## DESIGN CHOICES (each with an alternative)

| # | Choice | Alternative, and why it was passed over |
|---|---|---|
| VL-1 | A second run waits, 15 min limit (the product owner's choice) | Fail at once: simpler, but agents would retry blindly |
| VL-2 | One lock file for the machine, in the system temp folder | A lock inside each repository folder: misses runs from another working copy or clone sharing the same database and ports |
| VL-3 | Stale lock found by checking the process ID | A time-out on the lock's age: a long run (cold Flutter) could be cut off, or a dead run's lock kept for minutes |
| VL-4 | No lock in CI | A lock everywhere: pointless on a fresh runner and one more thing in the snapshot |

## Tests (tests first; each fails before its fix)

- A second run waits and names the holder, then takes the lock when the first releases it.
- A second run stops with exit 2 after the limit (a short limit in the test), naming the holder; nothing is recorded in `.verify/last-run.json`.
- A stale lock (a process ID that does not exist) is cleared with its line.
- The lock is released after a green run, a red run and a termination signal.
- A bad limit value (`abc`, `0`, `-5`, `1.5`) stops with exit 2 and a message, as `GABAY_VERIFY_CHECK_TIMEOUT_MS` does.
- `CI=true`: no lock file is created.

## Review fixes (1.1; dod-reviewer's review of `e9836a7`, the product owner's rulings)

1. **A stale lock that cannot be deleted** (antivirus, the indexer or an editor holding it open; another user's file in a sticky `/tmp`) must not make a waiting run spin: print one line naming the error, then wait as for a live lock (the busy line, the pause, the limit, exit 2). Test: a lock held open without delete sharing (Windows) or in a read-only folder (POSIX) gives exit 2 at the limit.
2. **Safety:** clearing a dead lock cannot remove a lock another run has just taken (claim it, then check); a closed terminal (SIGHUP) releases the lock; a waiting run reads the lock before trying to create it (no temp file every poll, less litter after a hard kill); the lock record carries a `version` field, so a working copy on other code (Part 2) never misreads a newer lock.
3. **Wording and docs:** the time-out message does not tell the reader to end a process number that may now belong to another program; README says the lock follows the TEMP folder (`os.tmpdir()`); clearing an unreadable lock is listed as a DESIGN CHOICE (VL-5; the alternative: refuse and name the file).
4. **A test of a true simultaneous start:** several runs released at once never hold the lock together.

## Existing tests that change (rule C1)

- `tools/test/verify.test.js`: its helpers move to the new `tools/test/verify-scratch.js` (shared with the lock tests); child runs get `CI=''` and their own lock file, so they never touch the machine's lock and the lock tests also run on GitHub. No assertion changes.
- `tools/test/s5-review.test.js`: its copy list gains `tools/lib/verify-lock.js` (`verify.js` now requires it), and its child verify gets its own lock file, so a nested verify never waits on the outer run's lock. No assertion changes.

## Companion files (CLAUDE.md's sync table)

CLAUDE.md's Commands (the owner variable and the limit) and its traps (the manual "hold" message is no longer needed); README's verify section; WORKING_AGREEMENT §6 (the hooks and verify row); `.env.example` only if the limit is read from `.env` (it is a tool setting, like `GABAY_VERIFY_CHECK_TIMEOUT_MS`, so it is expected not to be).

## Done when

The tests above pass; two full verify runs started together on this machine both end ALL GREEN, the second after waiting (pasted); dod-reviewer's check; the pull request's `lint` and `e2e` green; the product owner merges.
