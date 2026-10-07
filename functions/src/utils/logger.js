// One pino logger for the API (Blueprint Part 1 pin). Level from LOG_LEVEL (tests set "silent").
'use strict';

const pino = require('pino');

/**
 * pino level -> Cloud Logging LogSeverity. VERIFIED 2026-10-07 against Google's LogEntry reference
 * (cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#logseverity): DEBUG, INFO, WARNING,
 * ERROR and CRITICAL are LogSeverity names, and the page says to map other encodings (it names
 * Java's FINE, FINER and FINEST to DEBUG) onto them. pino's own labels TRACE and FATAL are not
 * LogSeverity names, hence this explicit map.
 */
const SEVERITY = Object.freeze({
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
});

/**
 * RECALLED (the structured-logging page would not render for a fetch): Cloud Logging reads a JSON
 * line's "severity" and "message" fields as the entry's severity and text, hence messageKey below.
 * Re-check at the first deploy.
 * @param {string} [level]
 * @param {import('node:stream').Writable} [destination] stdout when omitted (tests pass a stream)
 */
function createLogger(level = process.env.LOG_LEVEL || 'info', destination) {
  return pino(
    {
      level,
      messageKey: 'message',
      formatters: { level: (label) => ({ severity: SEVERITY[label] ?? 'DEFAULT' }) },
    },
    destination,
  );
}

module.exports = { SEVERITY, createLogger };
