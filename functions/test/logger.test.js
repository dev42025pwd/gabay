// Regression: S2 review, nit 3. The severity was pino's label upper-cased, which gave "TRACE" and
// "FATAL", names Cloud Logging does not have. An explicit map now sends every pino level to one of
// Cloud Logging's LogSeverity names.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Writable } = require('node:stream');
const { SEVERITY, createLogger } = require('../src/utils/logger');

test('logger: pino levels map to Cloud Logging severities', () => {
  assert.deepEqual(SEVERITY, {
    trace: 'DEBUG',
    debug: 'DEBUG',
    info: 'INFO',
    warn: 'WARNING',
    error: 'ERROR',
    fatal: 'CRITICAL',
  });
  assert.ok(Object.isFrozen(SEVERITY));
});

test('logger: a written line carries severity and message, and no pino level number', () => {
  const lines = [];
  const stream = new Writable({
    write(chunk, _enc, done) {
      lines.push(JSON.parse(chunk.toString()));
      done();
    },
  });
  const log = createLogger('trace', stream);
  log.trace('t');
  log.warn({ reqId: 'r1' }, 'w');
  log.fatal('f');
  assert.deepEqual(
    lines.map((l) => [l.severity, l.message]),
    [
      ['DEBUG', 't'],
      ['WARNING', 'w'],
      ['CRITICAL', 'f'],
    ],
  );
  assert.equal(lines[1].reqId, 'r1');
  assert.equal('level' in lines[0], false);
});
