// GET /api/lookups/:name and GET /api/lookups/:name/:id (Blueprint 4.15; FF-0, E-20). Read-only: no other method is
// routed, so anything else is the API's ordinary 404. The tenant is req.tenantCompanyID, set by the development stub
// (and by tenantContext after the retrofit's R1); nothing the client sends picks it (rule 2).
'use strict';

const express = require('express');

/** @param {ReturnType<import('../services/lookup.service').createLookupService>} lookups */
function lookupRoutes(lookups) {
  const router = express.Router();

  router.get('/:name', async (req, res, next) => {
    try {
      res.json(await lookups.list(req.params.name, req.tenantCompanyID, req.query));
    } catch (err) {
      next(err);
    }
  });

  router.get('/:name/:id', async (req, res, next) => {
    try {
      res.json(await lookups.get(req.params.name, req.tenantCompanyID, req.params.id));
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { lookupRoutes };
