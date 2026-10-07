// Regression: S2 review, Important 1. functions/index.js used to build the app, and so read the
// config and open the database pool, at module load. Firebase's deploy-time analysis loads index.js
// with no PG* environment, and a bad config would then process.exit(1) the deploy. Loading must be
// inert; the app is built on the first request.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { listen } = require('./helpers');

const INDEX = path.resolve(__dirname, '..', 'index.js');

test('index.js: requiring it with no PG* env neither exits, throws, nor reads the config', () => {
  const script = `
    const mod = require(${JSON.stringify(INDEX)});
    const problems = [];
    if (typeof mod.api !== 'function') problems.push('exports.api is not a function');
    // getConfig() loads the root .env into process.env; an inert load leaves PGHOST unset.
    if (process.env.PGHOST !== undefined) problems.push('the config was read at load (.env was loaded)');
    if (problems.length) { console.error(problems.join('; ')); process.exit(3); }
    console.log('inert');
    // The PGHOST check above is what proves the config was not read: getConfig() is the only thing
    // that loads .env, and a pool is only ever created from that config.
  `;
  const run = spawnSync(process.execPath, ['-e', script], {
    // A scrubbed environment: no PG*, no NODE_ENV=test (which would turn a config exit into a throw).
    env: { SystemRoot: process.env.SystemRoot ?? '', PATH: '' },
    encoding: 'utf8',
    timeout: 20_000,
  });
  assert.equal(run.status, 0, `exit ${run.status}\n${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /inert/);
});

test('index.js: the exported function builds the app on the first request and answers /api/health', async () => {
  const { api } = require(INDEX);
  const server = await listen(http.createServer((req, res) => api(req, res)));
  try {
    const res = await fetch(`${server.url}/api/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ok', db: 'ok' });
    // The same app answers the second request (built once).
    assert.equal((await fetch(`${server.url}/api/health`)).status, 200);
  } finally {
    await server.close();
    await require('../src/db').getDb().close();
  }
});
