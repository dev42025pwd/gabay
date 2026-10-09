// The Express app, built in the standard's load-bearing order (§3.1; plan/PH1-rails.md S2):
//
//   trust proxy -> x-powered-by off -> helmet -> cors allow-list -> JSON body limit
//   -> requestId -> actorContext -> audit logger (slot) -> /api no-store
//   -> rate limiter (slot) -> routes (public first, then each group behind auth: routes/api.js) -> 404 -> errors
//
// Cloud Functions owns TLS, the server and listen(), so the standard's TLS options, static files,
// SPA fallback and "connect, then listen" do not apply (plan §6). createApp() returns the app and
// never listens: index.js exports it as the function; tests mount it on an ephemeral port.
'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const { getConfig } = require('./config');
const { getDb } = require('./db');
const { createSettings } = require('./config/settings');
const { createLogger } = require('./utils/logger');
const { createErrorHandler, notFound } = require('./utils/errors');
const { createRequestId } = require('./middleware/requestId');
const { actorContext } = require('./middleware/actorContext');
const { createAuth } = require('./middleware/auth');
const { createFirebaseVerifier } = require('./auth/firebaseVerifier');
const { createIdentityStore } = require('./auth/identityStore');
const { createAccessStore } = require('./auth/accessStore');
const { apiRoutes } = require('./routes/api');

/** Response headers a browser page may read: the request id, so a user can quote it in a report. */
const EXPOSED_HEADERS = ['X-Request-Id'];

/**
 * CORS allow-list from CORS_ORIGINS (§3.1). A request with no Origin (curl, server-to-server)
 * passes: CORS only governs browsers. An empty list falls back to permissive, loudly.
 */
function corsMiddleware(config, logger) {
  if (config.corsOrigins.length === 0) {
    logger.warn(
      'CORS_ORIGINS is empty: allowing EVERY origin. Set CORS_ORIGINS to the admin web page address before any deploy.',
    );
    return cors({ exposedHeaders: EXPOSED_HEADERS });
  }
  const allowed = new Set(config.corsOrigins);
  return cors({
    origin: (origin, callback) => callback(null, !origin || allowed.has(origin)),
    exposedHeaders: EXPOSED_HEADERS,
  });
}

/** SLOT, filled in Phase 2 (§3.6): audit rows for POST/PUT/DELETE, written on res.on('finish'). */
function auditLoggerSlot(req, res, next) {
  next();
}

/** /api answers are never cached, so a re-login cannot render the previous user's data (§3.1). */
function apiNoStore(req, res, next) {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  next();
}

/** SLOT, filled in Phase 2 (§3.2): the global and the auth rate limiters. */
function rateLimiterSlot(req, res, next) {
  next();
}

/**
 * @param {object} [deps]  every dependency can be replaced, which is how tests mount the app
 * @param {ReturnType<typeof getConfig>} [deps.config]
 * @param {ReturnType<typeof getDb>} [deps.db]
 * @param {ReturnType<typeof createLogger>} [deps.logger]
 * @param {{verifyIdToken: Function}} [deps.tokenVerifier]  the Firebase ID-token check (tests inject a double)
 * @param {{getSetting: Function}} [deps.settings]  runtime settings; by default over the same db
 * @param {() => number} [deps.now]  clock in milliseconds, for the token-age check
 */
function createApp({
  config = getConfig(),
  db = getDb(),
  logger = createLogger(config.logLevel),
  tokenVerifier = createFirebaseVerifier(config.firebase), // lazy: no Firebase app until the first token
  settings = createSettings((text, params) => db.query(text, params), logger),
  now = Date.now,
} = {}) {
  const app = express();

  app.set('trust proxy', config.trustProxyHops); // a hop count, set before anything reads req.ip
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(corsMiddleware(config, logger));
  app.use(express.json({ limit: config.maxJsonBody })); // never a blanket 50 MB; big files go through multer
  app.use(createRequestId(logger));
  app.use(actorContext); // the actor is null until auth (below, per route group) binds the verified user (L126)
  app.use(auditLoggerSlot);
  app.use('/api', apiNoStore);
  app.use('/api', rateLimiterSlot);

  const auth = createAuth({
    verifier: tokenVerifier,
    identities: createIdentityStore(db),
    settings,
    now,
  });
  app.use('/api', apiRoutes({ db, logger, auth, accessStore: createAccessStore(db) }));

  app.use(notFound);
  app.use(createErrorHandler(logger));
  return app;
}

module.exports = { createApp };
