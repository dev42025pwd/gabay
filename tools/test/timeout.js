// `node:test` with a ceiling on every test: a test that spawns git, node or a server must fail, not
// hang, when something goes wrong. Test files use `const test = require('./timeout');`.
'use strict';

const baseTest = require('node:test');

const TEST_TIMEOUT_MS = 120_000;

module.exports = (name, fn) => baseTest(name, { timeout: TEST_TIMEOUT_MS }, fn);
module.exports.TEST_TIMEOUT_MS = TEST_TIMEOUT_MS;
