// Regression: S2 review, Important 2 (the database layer's half): which failures count as
// "the database is unreachable", and that query() and withTransaction() tag them.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDb } = require('../src/db');
const { isConnectionError } = require('../src/db/connectionError');
const { singleConnectionDb, fakeLogger, testConfig } = require('./helpers');

const withCode = (code, message = 'x', extra = {}) =>
  Object.assign(new Error(message), { code, ...extra });

test('isConnectionError recognises the connection-level failures pg gives, and nothing else', () => {
  const yes = [
    withCode('ECONNREFUSED', 'connect ECONNREFUSED 127.0.0.1:1'),
    withCode('ENOTFOUND', 'getaddrinfo ENOTFOUND h'),
    withCode('ETIMEDOUT'),
    withCode('ECONNRESET'),
    withCode('EHOSTUNREACH'),
    withCode('EAI_AGAIN'),
    new Error('Connection terminated unexpectedly'),
    new Error('Connection terminated due to connection timeout'),
    new Error('timeout exceeded when trying to connect'),
    new Error('Client has encountered a connection error and is not queryable'),
    withCode('57P01', 'terminating connection due to administrator command', { severity: 'FATAL' }),
    withCode('57P03', 'the database system is starting up', { severity: 'FATAL' }),
    withCode('08006', 'connection failure', { severity: 'FATAL' }),
    withCode('53300', 'too many connections', { severity: 'FATAL' }),
    // "localhost" resolves to ::1 and 127.0.0.1: Node reports an AggregateError of the attempts.
    Object.assign(new AggregateError([withCode('ECONNREFUSED'), withCode('ECONNREFUSED')]), {
      code: 'ECONNREFUSED',
    }),
  ];
  for (const err of yes) assert.equal(isConnectionError(err), true, err.code ?? err.message);
  const no = [
    withCode('23505', 'duplicate key', { severity: 'ERROR' }),
    withCode('42P01', 'relation does not exist', { severity: 'ERROR' }),
    withCode('28P01', 'password authentication failed', { severity: 'FATAL' }),
    new Error('boom'),
    null,
    undefined,
  ];
  for (const err of no) assert.equal(isConnectionError(err), false, String(err?.code ?? err));
});

test('real connection failures through query() and withTransaction() are tagged; SQL errors are not', async () => {
  const refused = createDb(
    testConfig({ PGPORT: '1', PG_CONNECT_TIMEOUT_MS: '2000' }),
    fakeLogger(),
  );
  try {
    await assert.rejects(
      () => refused.query('SELECT 1', []),
      (err) => err.dbUnavailable === true,
    );
    await assert.rejects(
      () => refused.withTransaction((tx) => tx.query('SELECT 1', [])),
      (err) => err.dbUnavailable === true,
    );
  } finally {
    await refused.close();
  }
  const db = singleConnectionDb();
  try {
    await assert.rejects(
      () => db.query('SELECT * FROM gabay.no_such_table_for_this_test', []),
      (err) => err.code === '42P01' && err.dbUnavailable === undefined,
    );
  } finally {
    await db.close();
  }
});
