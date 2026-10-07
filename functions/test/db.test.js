'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Decimal } = require('../src/utils/money');
const { singleConnectionDb, fakeLogger, testConfig } = require('./helpers');
const { createDb } = require('../src/db');

test('db: query() refuses a call without a params array (every query is parameterized)', async () => {
  const db = singleConnectionDb();
  try {
    await assert.rejects(() => db.query('SELECT 1'), /params must be an array/);
    await assert.rejects(() => db.query('SELECT 1', undefined), TypeError);
    await assert.rejects(() => db.query('SELECT $1::int', 5), TypeError);
    const ok = await db.query('SELECT $1::int AS n', [5]);
    assert.equal(ok.rows[0].n, 5);
  } finally {
    await db.close();
  }
});

test('db: a transaction commits on success and rolls back, rethrowing, on failure', async () => {
  const db = singleConnectionDb();
  try {
    await db.query('CREATE TEMP TABLE tx_probe (n INT NOT NULL)', []);

    await db.withTransaction(async (tx) => {
      await tx.query('INSERT INTO tx_probe VALUES ($1)', [1]);
    });
    assert.equal((await db.query('SELECT COUNT(*)::int AS c FROM tx_probe', [])).rows[0].c, 1);

    await assert.rejects(
      () =>
        db.withTransaction(async (tx) => {
          await tx.query('INSERT INTO tx_probe VALUES ($1)', [2]);
          throw new Error('stop');
        }),
      /stop/,
    );
    assert.equal(
      (await db.query('SELECT COUNT(*)::int AS c FROM tx_probe', [])).rows[0].c,
      1,
      'the second insert was rolled back',
    );

    // tx.query has the same params rule.
    await assert.rejects(() => db.withTransaction((tx) => tx.query('SELECT 1')), TypeError);
    // The connection went back to the pool clean: a following query works.
    assert.equal((await db.query('SELECT 1 AS one', [])).rows[0].one, 1);
  } finally {
    await db.close();
  }
});

test('db: DATE comes back as YYYY-MM-DD text, TIMESTAMPTZ as a Date, NUMERIC as exact text', async () => {
  const db = singleConnectionDb();
  try {
    const { rows } = await db.query(
      `SELECT DATE '2026-10-07' AS d,
              TIMESTAMPTZ '2026-10-07 00:00:00+00' AS ts,
              $1::numeric(18,4) AS money`,
      ['0.1000'],
    );
    assert.equal(rows[0].d, '2026-10-07');
    assert.ok(rows[0].ts instanceof Date);
    assert.equal(rows[0].ts.toISOString(), '2026-10-07T00:00:00.000Z');
    assert.equal(rows[0].money, '0.1000');
    assert.equal(new Decimal(rows[0].money).plus('0.2000').toFixed(4), '0.3000');
  } finally {
    await db.close();
  }
});

test('db: the boot log names host, database and user, never the password', async () => {
  const logger = fakeLogger();
  const config = testConfig({ PGPASSWORD: 'do-not-log-this-password' });
  const db = createDb(config, logger);
  try {
    const logged = JSON.stringify(logger.calls.info);
    assert.match(logged, new RegExp(config.db.database));
    assert.match(logged, new RegExp(config.db.user));
    assert.doesNotMatch(logged, /do-not-log-this-password/);
  } finally {
    await db.close();
  }
});
