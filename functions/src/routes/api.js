// Everything under /api, in the Blueprint's order: the unauthenticated mounts first (health stays public), then each
// authenticated group behind `auth`. Auth is mounted per group, not for the whole router, so an unknown path is still
// a 404 with no token (standard §3.6 drops anonymous 404s from the audit; nothing is revealed by them).
// Later slices add to each authenticated group, in the same order: tenantContext (S2), the role and permission guards
// (S3), validation (S6), then the handler.
'use strict';

const express = require('express');
const { healthRoutes } = require('./health');
const { meRoutes } = require('./me');
const { requireAdminUser } = require('../middleware/auth');

/**
 * @param {object} deps
 * @param {import('express').RequestHandler} deps.auth  the auth middleware (createAuth)
 */
function apiRoutes({ db, logger, auth, accessStore }) {
  const router = express.Router();

  // Unauthenticated.
  router.use(healthRoutes(db, logger));

  // Authenticated (admin accounts only: Q12).
  router.use('/me', auth, requireAdminUser, meRoutes(accessStore));

  return router;
}

module.exports = { apiRoutes };
