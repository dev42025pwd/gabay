// Everything under /api, in the Blueprint's order: the unauthenticated mounts first (health stays public), then each
// authenticated group behind `auth`. Auth is mounted per group, not for the whole router, so an unknown path is still
// a 404 with no token (standard §3.6 drops anonymous 404s from the audit; nothing is revealed by them).
// Later slices add to each authenticated group, in the same order: tenantContext (S2), the role and permission guards
// (S3), validation (S6), then the handler.
//
// Admin features (E-20, L153): until the retrofit's R1 every feature route is mounted behind the development stub
// instead of auth -> tenantContext. The stub is mounted PER PATH, like auth, so an unknown path stays a plain 404 and
// never reaches it. R1 swaps the one `devStub` for `auth, requireAdminUser, tenantContext` here and deletes devStub.js.
// Each mount is a row in the retrofit ledger (plan/PH4-feature-first.md section 7).
'use strict';

const express = require('express');
const { healthRoutes } = require('./health');
const { meRoutes } = require('./me');
const { lookupRoutes } = require('./lookups');
const { requireAdminUser } = require('../middleware/auth');

/**
 * @param {object} deps
 * @param {import('express').RequestHandler} deps.auth  the auth middleware (createAuth)
 * @param {import('express').RequestHandler} deps.devStub  the development stub (createDevStub; E-20)
 * @param {object} deps.lookups  the lookup service (createLookupService)
 */
function apiRoutes({ db, logger, auth, devStub, accessStore, lookups }) {
  const router = express.Router();

  // Unauthenticated.
  router.use(healthRoutes(db, logger));

  // Authenticated (admin accounts only: Q12).
  router.use('/me', auth, requireAdminUser, meRoutes(accessStore));

  // Admin features (E-20): behind the development stub until R1.
  router.use('/lookups', devStub, lookupRoutes(lookups));

  return router;
}

module.exports = { apiRoutes };
