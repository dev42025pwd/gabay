'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const {
  runWithActor,
  getActorId,
  getTenantId,
  inRequestContext,
} = require('../src/utils/requestContext');
const { actorContext } = require('../src/middleware/actorContext');
const { listen } = require('./helpers');

test('actor context: null outside a request, the actor inside, null again after', async () => {
  assert.equal(getActorId(), null);
  assert.equal(getTenantId(), null);
  const inside = await runWithActor(42, async () => {
    await new Promise((resolve) => setImmediate(resolve)); // survives an async hop
    return [getActorId(), getTenantId()];
  });
  assert.deepEqual(inside, [42, null]);
  assert.equal(getActorId(), null);
});

test('actor context: the tenant slot is carried when a caller sets it', () => {
  runWithActor(1, () => assert.equal(getTenantId(), 7), { tenantId: 7 });
});

test('actor context: concurrent requests never see each other', async () => {
  const app = express();
  app.use((req, res, next) => runWithActor(Number(req.query.u), next));
  app.get('/who', async (req, res) => {
    await new Promise((resolve) => setTimeout(resolve, 20 - Number(req.query.u))); // finish out of order
    res.json({ actor: getActorId() });
  });
  const s = await listen(app);
  try {
    const answers = await Promise.all(
      [1, 2, 3, 4, 5].map((u) => fetch(`${s.url}/who?u=${u}`).then((r) => r.json())),
    );
    assert.deepEqual(
      answers.map((a) => a.actor),
      [1, 2, 3, 4, 5],
    );
  } finally {
    await s.close();
  }
});

test('actorContext slot: runs the rest of the request inside a context with no actor yet (Phase 2 fills it)', async () => {
  const app = express();
  app.use(actorContext);
  app.get('/ctx', async (req, res) => {
    await new Promise((resolve) => setImmediate(resolve));
    res.json({ inContext: inRequestContext(), actor: getActorId(), tenant: getTenantId() });
  });
  const s = await listen(app);
  try {
    assert.equal(inRequestContext(), false, 'not in a context outside a request');
    const body = await fetch(`${s.url}/ctx`).then((r) => r.json());
    assert.deepEqual(body, { inContext: true, actor: null, tenant: null });
  } finally {
    await s.close();
  }
});
