// Which errors mean "the database cannot be reached" (as opposed to "the database refused this
// statement"). The db layer tags these, and the error handler answers 503 for a tagged error.
// The names below were checked against pg 8.23.1 on 2026-10-07 by triggering each failure.
'use strict';

/** Node socket errors pg surfaces while connecting or on a dropped connection. */
const NETWORK_CODES = new Set([
  'ECONNREFUSED', // nothing listening (port 1)
  'ENOTFOUND', // the host name does not resolve
  'ETIMEDOUT',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'EAI_AGAIN', // DNS temporarily unavailable
]);

/** SQLSTATEs that mean the server dropped us or cannot take us: class 08, shutdowns, too many connections. */
const SQLSTATES = new Set(['57P01', '57P02', '57P03', '53300']);

/** pg's own messages for failures that carry no code (the pool and the client raise plain Errors). */
const MESSAGES = [
  /^Connection terminated/i, // "...unexpectedly", "...due to connection timeout"
  /^timeout exceeded when trying to connect/i, // the pool could not hand out a connection in time
  /^Client has encountered a connection error and is not queryable/i,
  /^Connection ended unexpectedly/i,
];

/** True when `err` is a connection-level database failure. Never throws. */
function isConnectionError(err) {
  if (!err || typeof err !== 'object') return false;
  if (NETWORK_CODES.has(err.code)) return true;
  if (typeof err.code === 'string' && err.severity) {
    // A PostgreSQL error: the SQLSTATE says whether the connection itself is the problem.
    if (err.code.startsWith('08') || SQLSTATES.has(err.code)) return true;
  }
  if (Array.isArray(err.errors) && err.errors.length > 0 && err.errors.every(isConnectionError)) {
    return true;
  }
  return typeof err.message === 'string' && MESSAGES.some((re) => re.test(err.message));
}

module.exports = { isConnectionError };
