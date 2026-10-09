// Names for the coder working copies (plan/PH1-worktrees.md 1.1): the allowed agent names, the database and the
// folder each one gets, and the check on a branch name. Plain CommonJS, no dependencies, any Node >= 22.
'use strict';

const path = require('node:path');

/** The agents that get a working copy; a name outside this list is refused before anything runs. */
const AGENT_NAMES = Object.freeze([
  'api-coder',
  'flutter-coder',
  'engine-coder',
  'native-ble',
  'test-verifier',
]);

/** Where the main folder is: tools/lib/../.. */
const MAIN_ROOT = path.resolve(__dirname, '..', '..');

/** The folder that holds every working copy: a sibling of the main folder (WT-4), `Gabay-wt` for `Gabay`. */
const workingCopiesBase = (mainRoot = MAIN_ROOT) =>
  path.join(path.dirname(mainRoot), `${path.basename(mainRoot)}-wt`);

/** Throws for a name that is not one of the agents (so nothing derived from it can reach a path or a query). */
function assertAgentName(name) {
  if (!AGENT_NAMES.includes(name)) {
    throw new Error(`Unknown agent name "${name}". Allowed: ${AGENT_NAMES.join(', ')}.`);
  }
}

/** The copy's database (WT-3): gabay_wt_ and the name with hyphens turned into underscores. */
const databaseName = (name) => `gabay_wt_${name.replace(/-/g, '_')}`;

/** The branch a new copy gets when none is named: wt/<name>/<date>. */
const defaultBranch = (name, date) => `wt/${name}/${date}`;

/** A branch name git accepts that cannot be read as an option and carries no space or shell character. */
const BRANCH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
function assertBranchName(branch) {
  const bad =
    !BRANCH_PATTERN.test(branch) ||
    branch.includes('..') ||
    branch.endsWith('/') ||
    branch.endsWith('.lock');
  if (bad) {
    throw new Error(
      `"${branch}" is not a valid branch name (letters, digits, . _ - and / only, not starting with -).`,
    );
  }
}

module.exports = {
  AGENT_NAMES,
  MAIN_ROOT,
  workingCopiesBase,
  assertAgentName,
  databaseName,
  defaultBranch,
  assertBranchName,
};
