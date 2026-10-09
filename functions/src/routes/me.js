// GET /api/me: who the signed-in admin is, which tenants they belong to (their UserRole rows, L121), and their merged
// permissions in each (standard §3.4: role rows OR-ed, a user's own row replaces the merged role row). The client builds
// its menu from this (Q9) and the guard in S3 uses the same merge, so the screen and the server agree. No tenant is read
// from the request: a user's tenants are what the database says they are (rule 2).
'use strict';

const express = require('express');
const { buildAccessProfile } = require('../auth/permissionMerge');

/** @param {{loadForUser: (userId: number) => Promise<object>}} accessStore */
function meRoutes(accessStore) {
  const router = express.Router();

  router.get('/', async (req, res, next) => {
    try {
      const access = await accessStore.loadForUser(req.user.userId);
      res.json(
        buildAccessProfile({
          user: req.user,
          ...access,
          warn: (fields, message) => req.log?.warn(fields, message),
        }),
      );
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { meRoutes };
