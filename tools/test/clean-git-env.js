// Git's per-repository environment variables, and how the tests get rid of them.
//
// Incident INC-001 (2026-10-09): `git push` from a linked worktree runs the pre-push hook with GIT_DIR set (an
// absolute path into .git/worktrees/<name>). Everything the hook starts inherits it, including the tests
// that build scratch repositories: their `git init`, `commit` and `config` then hit the REAL repository.
// git's own documentation (`git help githooks`, "Environment variables ... should clear these environment
// variables") prescribes clearing them whenever a child works in another repository. The hook does that
// before verify (.githooks/pre-push); this module is the second layer, so a test run by hand with GIT_DIR
// set cannot reach the repository it names either. Plain CommonJS.
'use strict';

/**
 * What `git rev-parse --local-env-vars` lists (git 2.52): the variables that name a repository, its index,
 * its objects or its configuration. GIT_EDITOR, GIT_AUTHOR_* and the like are not repository-local and stay.
 * A test compares this list with what the installed git reports, so a git that adds one fails it by name.
 */
const LOCAL_GIT_ENV_VARS = [
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_CONFIG',
  'GIT_CONFIG_PARAMETERS',
  'GIT_CONFIG_COUNT',
  'GIT_OBJECT_DIRECTORY',
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_IMPLICIT_WORK_TREE',
  'GIT_GRAFT_FILE',
  'GIT_INDEX_FILE',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_REPLACE_REF_BASE',
  'GIT_PREFIX',
  'GIT_SHALLOW_FILE',
  'GIT_COMMON_DIR',
];

const LOCAL = new Set(LOCAL_GIT_ENV_VARS);

/** A copy of `env` without the per-repository git variables (names compared upper-case: Windows ignores case). */
function withoutLocalGitEnv(env) {
  const kept = {};
  for (const [key, value] of Object.entries(env)) {
    if (!LOCAL.has(key.toUpperCase())) kept[key] = value;
  }
  return kept;
}

/** Removes the per-repository git variables from this process, so every child it starts is clean. */
function clearLocalGitEnv(env = process.env) {
  for (const key of Object.keys(env)) {
    if (LOCAL.has(key.toUpperCase())) delete env[key];
  }
}

module.exports = { LOCAL_GIT_ENV_VARS, withoutLocalGitEnv, clearLocalGitEnv };
