// ONE error shape for the whole API: { error: "message" } (standard §3.8). Clients depend on it.
'use strict';

/**
 * A domain error that carries its HTTP status (no class hierarchy, §3.8).
 * Messages of 4xx errors are shown to the client, so write them for a person.
 * A 5xx domain error is shown generically unless it is created with { expose: true }.
 */
function httpError(httpStatus, message, { expose = false } = {}) {
  const err = new Error(message);
  err.httpStatus = httpStatus;
  err.expose = expose;
  return err;
}

const GENERIC_500 = 'Internal server error';
const PG_UNIQUE_VIOLATION = '23505';

/** A PostgreSQL error: a five-character SQLSTATE `code` plus a `severity`, both set by pg. */
const isPgError = (err) =>
  typeof err?.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code) && !!err.severity;

/** body-parser errors (http-errors) carry a stable `type`; their raw text is not shown. */
const BODY_ERRORS = {
  'entity.too.large': { status: 413, message: 'Request body too large' },
  'entity.parse.failed': { status: 400, message: 'Malformed JSON body' },
  'encoding.unsupported': { status: 415, message: 'Unsupported content encoding' },
  'charset.unsupported': { status: 415, message: 'Unsupported charset' },
};

/** Maps any thrown value to { status, message, log }. `log` is true when it should be logged as an error. */
function describeError(err) {
  if (BODY_ERRORS[err?.type]) return { ...BODY_ERRORS[err.type], log: false };
  if (isPgError(err)) {
    // Inspected, never echoed (§3.8): the driver's text can name tables and columns.
    if (err.code === PG_UNIQUE_VIOLATION) {
      return { status: 409, message: 'That record already exists.', log: true };
    }
    return { status: 500, message: GENERIC_500, log: true };
  }
  const status = Number.isInteger(err?.httpStatus) ? err.httpStatus : null;
  if (status && status >= 400 && status < 600) {
    const shown = status < 500 || err.expose === true;
    return { status, message: shown ? err.message : GENERIC_500, log: status >= 500 };
  }
  return { status: 500, message: GENERIC_500, log: true };
}

/** The Express error handler (4 arguments: Express identifies it by arity). */
function createErrorHandler(logger) {
  return function errorHandler(err, req, res, _next) {
    const { status, message, log } = describeError(err);
    if (log) logger.error({ err, method: req.method, path: req.path }, 'request failed');
    if (res.headersSent) return res.destroy(err);
    res.status(status).json({ error: message });
  };
}

/** 404 for any route nothing handled; same shape as every other error. */
function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

module.exports = { httpError, describeError, createErrorHandler, notFound, GENERIC_500 };
