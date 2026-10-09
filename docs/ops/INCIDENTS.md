# Gabay — INCIDENTS.md

> **Version**: 0.2 | **Date**: 2026-10-09 | **Status**: in use (plan.html C22, L115; INC-001 recorded by L152) | **Audience**: everyone | **Scope**: every incident, newest first; rules elsewhere cite these entries (incident-first, standard §2)

## INC-001 — A push from a coder's working copy changed the real repository
- When: 2026-10-09, 11:36 Asia/Manila (the junk commits are stamped 11:36:44–11:36:45); repaired by 11:41 the same day.
- Detected by: the main session. Its push of `p2-s1-auth` from the api-coder working copy was refused by the pre-push verify (linter-tests and tools-tests failing); looking into why, it found the repository changed.
- Symptom: in the real repository, `core.bare=true`; four junk commits on top of `p2-s1-auth` ("migrations", "add 0003", "edit 0001 (the bad commit)", "migrations"); new branches `feature` and `wt/test`; a stray temporary worktree; the api-coder working copy switched to `feature`. Nothing reached GitHub, and no product code or data was lost.
- Cause: git exports its per-repository variables to a hook. From a linked worktree that includes an absolute `GIT_DIR` (`.git/worktrees/<name>`), plus `GIT_PREFIX` and, under `git -c`, `GIT_CONFIG_PARAMETERS`; from a main checkout only the last two (measured on git 2.52.0.windows.1). `.githooks/pre-push` ran `npm run verify`, verify ran the tool tests, and the tests that build scratch repositories inherited `GIT_DIR`, so their git commands (`init`, `config`, `commit`, `branch`, `worktree add`) hit the real repository. Earlier pushes from the main folder were unaffected because no `GIT_DIR` is exported there.
- Fix: the hand repair, with the product owner's go: `core.bare` back to false; `p2-s1-auth` reset to its real tip `fcf3b19`; the working copy's HEAD restored (it was clean); the stray worktree pruned; the junk branches deleted. Checked by a full `npm run verify` in the main folder (ALL GREEN, 201.3 s) and the branch list. The code fix was built in a throwaway clone, never in the real repository: `003f8fd` and its follow-up on branch `fix-prepush-gitdir` (plan.html L152).
- Rule added: `.githooks/pre-push` runs verify after `unset $(git rev-parse --local-env-vars)` (the idiom in git's own githooks documentation). The tool-test helpers `tools/test/timeout.js` and `tools/test/scratch.js` clear the same variables when they load (`tools/test/clean-git-env.js`), and a check fails when a `tools/**` test file does not load `timeout.js`. Regression test: `tools/test/git-env.test.js` (a real push from a linked worktree and from a main checkout of a scratch repository; a hand run of the tests with `GIT_DIR` set leaves the repository it names byte-identical). Rule in CLAUDE.md, "Things agents get wrong here". Accepted limit: a hand-run `npm run verify` started with `GIT_DIR` already set still passes it to flutter, firebase and npm (`tools/lib/proc.js` `childEnv`); nothing sets it today (L152).
- Personal data involved: none.

## Template (copy for each incident, newest at the top)

```
## INC-<nnn> — <one-line title>
- When: <date and time, Asia/Manila>
- Detected by: <who or what>
- Symptom: <what users or staff saw>
- Cause: <the root cause>
- Fix: <what was done, with the commit or PR>
- Rule added: <the rule, lint or test that stops it recurring, and where it lives>
- Personal data involved: <none / what; if any, the DPO decides on the 72-hour NPC notice (Circular 16-03)>
```
