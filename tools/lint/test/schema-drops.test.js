'use strict';

const test = require('../../test/timeout');
const assert = require('node:assert/strict');
const { lint, at, SCHEMA } = require('./helper');

test('schema-drops: a CREATE TABLE with no DROP fails, on the CREATE line', () => {
  const bad = SCHEMA.replace('DROP TABLE IF EXISTS gabay.Role          CASCADE;\n', '');
  const found = lint('schema-drops', { 'db/schema.sql': bad });
  const line = bad.split('\n').findIndex((l) => l.startsWith('CREATE TABLE gabay.Role')) + 1;
  assert.deepEqual(at(found), [`db/schema.sql:${line}:schema-drops`]);
  assert.match(found[0].message, /gabay\.Role has no matching DROP TABLE IF EXISTS/);
});

test('schema-drops: a DROP that is only in a comment does not count', () => {
  const bad = SCHEMA.replace(
    'DROP TABLE IF EXISTS gabay.Level         CASCADE;',
    '-- DROP TABLE IF EXISTS gabay.Level CASCADE;',
  );
  assert.equal(lint('schema-drops', { 'db/schema.sql': bad }).length, 1);
});

test('schema-drops: every table dropped passes; so does a repo with no schema', () => {
  assert.deepEqual(lint('schema-drops', { 'db/schema.sql': SCHEMA }), []);
  assert.deepEqual(lint('schema-drops', { 'README.md': 'x' }), []);
});

test('schema-drops: the real db/schema.sql passes (56 tables, 56 drops)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const real = fs.readFileSync(
    path.resolve(__dirname, '..', '..', '..', 'db', 'schema.sql'),
    'utf8',
  );
  assert.deepEqual(lint('schema-drops', { 'db/schema.sql': real }), []);
});
