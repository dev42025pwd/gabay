// The command-line arguments of `npm run worktree:new` and `npm run worktree:remove` (plan/PH1-worktrees.md 1.1).
// Plain CommonJS, no dependencies, any Node >= 22.
'use strict';

const { assertBranchName } = require('./worktree-names');

const NEW_USAGE = 'Usage: npm run worktree:new -- <name> [<branch>]';
const REMOVE_USAGE = 'Usage: npm run worktree:remove -- <name> [--force]';

/** `<name> [<branch>]` -> { name, branch }. The name is checked against the agent list when it is used. */
function parseNewArgs(argv) {
  const [name, branch, ...rest] = argv;
  if (!name) throw new Error(`worktree:new needs a name. ${NEW_USAGE}`);
  for (const a of [name, branch]) {
    if (a?.startsWith('-')) throw new Error(`Unknown option ${a}. ${NEW_USAGE}`);
  }
  if (rest.length) throw new Error(`Too many arguments. ${NEW_USAGE}`);
  if (branch !== undefined) assertBranchName(branch);
  return { name, branch: branch ?? null };
}

/** `<name> [--force]` (in either order) -> { name, force }. */
function parseRemoveArgs(argv) {
  const unknown = argv.filter((a) => a.startsWith('-') && a !== '--force');
  if (unknown.length) throw new Error(`Unknown option ${unknown.join(' ')}. ${REMOVE_USAGE}`);
  const names = argv.filter((a) => a !== '--force');
  if (names.length === 0) throw new Error(`worktree:remove needs a name. ${REMOVE_USAGE}`);
  if (names.length > 1) throw new Error(`Too many arguments. ${REMOVE_USAGE}`);
  return { name: names[0], force: argv.includes('--force') };
}

module.exports = { parseNewArgs, parseRemoveArgs };
