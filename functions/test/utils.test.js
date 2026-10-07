'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { dateOnly, projectDates } = require('../src/utils/dates');
const { Decimal } = require('../src/utils/money');

test('dates: dateOnly gives YYYY-MM-DD from text, from an instant (UTC), or null', () => {
  assert.equal(dateOnly('2026-10-07'), '2026-10-07');
  assert.equal(dateOnly('2026-10-07T23:59:59.000Z'), '2026-10-07');
  assert.equal(dateOnly(new Date('2026-10-07T23:59:59.000Z')), '2026-10-07');
  assert.equal(dateOnly(new Date('2026-10-08T00:00:00.000Z')), '2026-10-08');
  assert.equal(dateOnly(null), null);
  assert.equal(dateOnly(undefined), null);
  assert.equal(dateOnly('not a date'), null);
  assert.equal(dateOnly('2026-13-45'), null);
  assert.equal(dateOnly(new Date('garbage')), null);
  assert.equal(dateOnly(20261007), null);
});

test('dates: an impossible calendar date is null, not silently rolled over (regression: S2 review, nit 1)', () => {
  assert.equal(dateOnly('2026-02-31'), null);
  assert.equal(dateOnly('2026-02-31T10:00:00Z'), null);
  assert.equal(dateOnly('2026-04-31'), null);
  assert.equal(dateOnly('2025-02-29'), null, 'not a leap year');
  assert.equal(dateOnly('2024-02-29'), '2024-02-29', 'a leap day is real');
  assert.equal(dateOnly('2026-00-10'), null);
  assert.equal(dateOnly('2026-12-00'), null);
});

test('dates: projectDates rewrites only the named columns that exist', () => {
  const row = { startdate: new Date('2026-01-31T00:00:00Z'), enddate: null, label: 'x' };
  const out = projectDates(['startdate', 'enddate', 'missing'])(row);
  assert.deepEqual(out, { startdate: '2026-01-31', enddate: null, label: 'x' });
  assert.equal('missing' in out, false);
});

test('money: Decimal is set once to precision 18, half-up, and is exact where floats are not', () => {
  assert.equal(Decimal.precision, 18);
  assert.equal(Decimal.rounding, Decimal.ROUND_HALF_UP);
  assert.equal(new Decimal('0.1').plus('0.2').toString(), '0.3');
  assert.equal(new Decimal('2.5').toDecimalPlaces(0).toString(), '3');
  assert.equal(new Decimal('1.00005').toDecimalPlaces(4).toString(), '1.0001');
});
