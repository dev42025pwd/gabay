// One pino logger for the API (Blueprint Part 1 pin). Level from LOG_LEVEL (tests set "silent").
'use strict';

const pino = require('pino');

/**
 * RECALLED (not checked this session): Cloud Logging reads `severity` and `message` from a JSON
 * line, so pino's numeric `level` is mapped to a `severity` label and the message key is `message`.
 */
function createLogger(level = process.env.LOG_LEVEL || 'info') {
  return pino({
    level,
    messageKey: 'message',
    formatters: { level: (label) => ({ severity: label.toUpperCase() }) },
  });
}

module.exports = { createLogger };
