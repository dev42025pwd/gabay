// requestId (Blueprint order, L126): every request gets an id, shown on the response as
// X-Request-Id and bound to a child logger as req.log, so one id ties a client's report to the
// server's log lines. No package: Node's crypto.randomUUID().
'use strict';

const { randomUUID } = require('node:crypto');

/** Longest incoming X-Request-Id we keep. */
const MAX_REQUEST_ID_LENGTH = 64;
/** What an incoming id may contain: no spaces, slashes, quotes or control characters (it goes into logs and headers). */
const REQUEST_ID_PATTERN = new RegExp(`^[A-Za-z0-9._-]{1,${MAX_REQUEST_ID_LENGTH}}$`);

/** @param {{child: Function}} logger  the root logger */
function createRequestId(logger) {
  return function requestId(req, res, next) {
    const incoming = req.get('x-request-id');
    req.id = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
    res.set('X-Request-Id', req.id);
    req.log = logger.child({ reqId: req.id });
    next();
  };
}

module.exports = { createRequestId, MAX_REQUEST_ID_LENGTH, REQUEST_ID_PATTERN };
