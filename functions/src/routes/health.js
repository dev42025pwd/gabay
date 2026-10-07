// GET /api/health: liveness plus a database check. Cloud Functions owns the server (there is no
// listen() to fail), so an unreachable database shows here as 503 and a log line (plan §6).
'use strict';

const express = require('express');

/** @param {{query: Function}} db  @param {{error: Function}} logger */
function healthRoutes(db, logger) {
  const router = express.Router();

  router.get('/health', async (req, res) => {
    try {
      await db.query('SELECT 1', []);
      res.json({ status: 'ok', db: 'ok' });
    } catch (err) {
      (req.log ?? logger).error({ err }, 'health check: database unreachable');
      res.status(503).json({ error: 'Database unavailable' });
    }
  });

  return router;
}

module.exports = { healthRoutes };
