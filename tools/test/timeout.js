// `node:test` with a ceiling on every test: a test that spawns git, node or a server must fail, not
// hang, when something goes wrong. Test files use `const test = require('./timeout');`.
'use strict';

const baseTest = require('node:test');
const { clearLocalGitEnv } = require('./clean-git-env');

// Every test file under tools/ loads this wrapper (git-env.test.js fails, naming the file, when one does
// not; functions/test and db/tools/test start no git and are outside it), so every child git a test starts
// is clean: a run with GIT_DIR set (INC-001: a pre-push hook in a linked worktree, or by hand) must never
// reach the repository GIT_DIR names.
clearLocalGitEnv();

const TEST_TIMEOUT_MS = 120_000;

module.exports = (name, fn) => baseTest(name, { timeout: TEST_TIMEOUT_MS }, fn);
module.exports.TEST_TIMEOUT_MS = TEST_TIMEOUT_MS;
