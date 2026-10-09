#!/usr/bin/env node
// npm run worktree:remove -- <name> [--force]: removes a coder's working copy and drops its database
// (plan/PH1-worktrees.md 1.1). It refuses a copy with uncommitted changes unless --force is given; the branch stays.
// Exit code: 0, or 1 with the reason.
'use strict';

const { parseRemoveArgs } = require('./lib/worktree-args');
const { MAIN_ROOT } = require('./lib/worktree-names');
const { removeWorkingCopy } = require('./lib/worktree-copy');
const { realDeps, assertMainFolder } = require('./lib/worktree-real');

async function main() {
  const { name, force } = parseRemoveArgs(process.argv.slice(2));
  assertMainFolder(MAIN_ROOT);
  await removeWorkingCopy({ name, force, mainRoot: MAIN_ROOT }, realDeps(MAIN_ROOT));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
