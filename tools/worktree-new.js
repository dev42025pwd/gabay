#!/usr/bin/env node
// npm run worktree:new -- <name> [<branch>]: a coder's own working copy and database (plan/PH1-worktrees.md 1.1).
// Fetches origin, adds a git worktree in <main folder>-wt/<name> on <branch> (default wt/<name>/<date>, made from
// origin/main), writes its .env (the main one, only PGDATABASE changed), creates the database gabay_wt_<name>, copies
// the git-ignored internal seed source, installs the packages and runs setup-db. <name> is one of the agents:
// api-coder, flutter-coder, engine-coder, native-ble, test-verifier. Exit code: 0, or 1 with the reason.
'use strict';

const { parseNewArgs } = require('./lib/worktree-args');
const { MAIN_ROOT } = require('./lib/worktree-names');
const { createWorkingCopy } = require('./lib/worktree-copy');
const { realDeps, assertMainFolder, localDate } = require('./lib/worktree-real');

async function main() {
  const { name, branch } = parseNewArgs(process.argv.slice(2));
  assertMainFolder(MAIN_ROOT);
  await createWorkingCopy(
    { name, branch, mainRoot: MAIN_ROOT, today: localDate() },
    realDeps(MAIN_ROOT),
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
