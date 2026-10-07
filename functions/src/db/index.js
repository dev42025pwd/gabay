// The DB layer (standard §3.9): one pg Pool, parameterized queries only, explicit transactions.
// Raw SQL with $1...$n placeholders; no ORM, no query builder (Blueprint Part 1).
'use strict';

const pg = require('pg');
const { getConfig } = require('../config');
const { createLogger } = require('../utils/logger');
const { isConnectionError } = require('./connectionError');

const PG_DATE_OID = 1082;

/**
 * DESIGN CHOICE (UTC everywhere, Blueprint invariant 12; standard §3.10): a DATE column is returned as
 * its 'YYYY-MM-DD' text instead of a Date at the server's local midnight, which JSON would shift a
 * day. TIMESTAMPTZ still arrives as a Date, an exact instant. NUMERIC arrives as text (for Decimal).
 */
const types = {
  getTypeParser: (oid, format) =>
    oid === PG_DATE_OID ? (value) => value : pg.types.getTypeParser(oid, format),
};

/** Guard shared by every query path: a call without a params array is a programming error. */
function assertParams(text, params) {
  if (typeof text !== 'string') throw new TypeError('query(text, params): text must be a string');
  if (!Array.isArray(params)) {
    throw new TypeError(
      'query(text, params): params must be an array, use [] when there are none. Every query is parameterized.',
    );
  }
}

/**
 * Builds the db access object for a validated config. Tests build their own against a
 * different config (for example an unreachable database).
 */
function createDb(config, logger = createLogger(config.logLevel)) {
  const { db } = config;
  const pool = new pg.Pool({
    host: db.host,
    port: db.port,
    database: db.database,
    user: db.user,
    password: db.password,
    max: db.poolMax,
    idleTimeoutMillis: db.idleTimeoutMs,
    connectionTimeoutMillis: db.connectTimeoutMs,
    // Raised on purpose (§3.9): bulk writes and publishes legitimately run long.
    statement_timeout: db.statementTimeoutMs,
    types,
  });
  // An idle client that errors (server restart) must not crash the process.
  pool.on('error', (err) => logger.error({ err }, 'idle database client error'));

  // Boot log (§3.9): where we point, never the password.
  logger.info(
    { host: db.host, port: db.port, database: db.database, user: db.user },
    'database pool created',
  );

  /**
   * Tags a connection-level failure (refused, unknown host, pool timeout, server shutdown) with
   * `dbUnavailable`, so the error handler can answer 503 on any route (S2 review, Important 2).
   * Statement errors (a unique violation, a bad column) are left alone: those are 4xx or 500.
   */
  async function tagUnavailable(run) {
    try {
      return await run();
    } catch (err) {
      if (isConnectionError(err)) err.dbUnavailable = true;
      throw err;
    }
  }

  /** Runs one parameterized statement on the pool. */
  async function query(text, params) {
    assertParams(text, params);
    return tagUnavailable(() => pool.query(text, params));
  }

  /**
   * BEGIN -> fn(tx) -> COMMIT; any throw rolls back and rethrows (§3.9). `tx.query` has the same
   * params rule as `query` and runs on the transaction's own connection.
   *
   * Only failures raised by the database layer's own calls (pool.connect, BEGIN, COMMIT, ROLLBACK,
   * tx.query) are tagged `dbUnavailable` and make the connection count as lost. An error thrown by
   * the caller's fn itself (an ECONNRESET from some other service) is passed through untouched, and the
   * healthy connection goes back to the pool (S2 re-review N1).
   */
  async function withTransaction(fn) {
    const client = await tagUnavailable(() => pool.connect());
    let lost = false;
    // The pool only listens for errors on IDLE clients. While this one is checked out, a dropped
    // connection can emit 'error' with no listener, which would crash the process (found by a test
    // that kills the backend mid-transaction). Note it, log it, and let the failing query report it.
    const onClientError = (err) => {
      lost = true;
      logger.error({ err }, 'transaction connection error');
    };
    client.on('error', onClientError);
    /** Runs one call on the transaction's own connection, noting a connection-level failure. */
    const onClient = async (run) => {
      try {
        return await run();
      } catch (err) {
        if (isConnectionError(err)) {
          err.dbUnavailable = true;
          lost = true;
        }
        throw err;
      }
    };
    const tx = {
      query: async (text, params) => {
        assertParams(text, params);
        return onClient(() => client.query(text, params));
      },
    };
    try {
      await onClient(() => client.query('BEGIN'));
      const result = await fn(tx);
      await onClient(() => client.query('COMMIT'));
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        lost = true; // a connection that cannot roll back is not safe to reuse
        logger.error({ err: rollbackErr }, 'rollback failed');
      }
      throw err;
    } finally {
      client.off('error', onClientError);
      client.release(lost); // a lost connection is destroyed, not returned to the pool
    }
  }

  const close = () => pool.end();

  return { query, withTransaction, close, pool };
}

let shared = null;

/** The process-wide db (created on first use, so importing this file never connects). */
function getDb() {
  if (!shared) shared = createDb(getConfig());
  return shared;
}

module.exports = { createDb, getDb, assertParams };
