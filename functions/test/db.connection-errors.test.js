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

// Regression: S2 re-review N1. withTransaction tagged (and destroyed the connection for) ANY
// connection-like error, including one thrown by the caller's own fn. Only errors raised by the
// database layer's own calls (connect, BEGIN, COMMIT, ROLLBACK, tx.query) may be tagged.
test('withTransaction: an errno thrown by fn is not tagged and the connection is kept', async () => {
  const db = singleConnectionDb();
  try {
    const mine = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
    await assert.rejects(
      () =>
        db.withTransaction(async (tx) => {
          await tx.query('SELECT 1', []);
          throw mine;
        }),
      (err) => err === mine && err.dbUnavailable === undefined,
    );
    assert.equal(db.pool.totalCount, 1, 'the healthy connection is released, not destroyed');
    assert.equal(db.pool.idleCount, 1);
    assert.equal((await db.query('SELECT 1 AS one', [])).rows[0].one, 1);
  } finally {
    await db.close();
  }
});

test('withTransaction: a connection lost inside tx.query is tagged and the connection is destroyed', async () => {
  const db = singleConnectionDb();
  try {
    await assert.rejects(
      () =>
        db.withTransaction((tx) => tx.query('SELECT pg_terminate_backend(pg_backend_pid())', [])),
      (err) => err.code === '57P01' && err.dbUnavailable === true,
    );
    assert.equal(db.pool.totalCount, 0, 'the lost connection was destroyed');
    assert.equal((await db.query('SELECT 1 AS one', [])).rows[0].one, 1, 'the pool recovers');
  } finally {
    await db.close();
  }
});
