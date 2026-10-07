'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { lint, at, SCHEMA } = require('./helper');

const FILE = 'functions/src/services/venues.js';
const run = (js, extra) => lint('tenant-predicate', { 'db/schema.sql': SCHEMA, [FILE]: js }, extra);

test('tenant-predicate: SQL on a tenant-scoped table with no TenantId predicate fails on its line', () => {
  const js = `const a = db.query('SELECT * FROM gabay.Venue WHERE Name = $1', [n]);
const b = db.query('DELETE FROM gabay.Venue WHERE VenueId = $1', [id]);
const c = db.query('UPDATE gabay.Level SET Name = $1 WHERE LevelId = $2', [n, id]);
const d = db.query('SELECT TenantId, Name FROM gabay.Venue', []);
`;
  assert.deepEqual(at(run(js)), [
    `${FILE}:1:tenant-predicate`,
    `${FILE}:2:tenant-predicate`,
    `${FILE}:3:tenant-predicate`,
    `${FILE}:4:tenant-predicate`,
  ]);
});

test('tenant-predicate: names the table and says where the tenant comes from', () => {
  const found = run("db.query('SELECT * FROM gabay.Venue', []);\n");
  assert.match(found[0].message, /tenant-scoped table venue/i);
  assert.match(found[0].message, /req\.tenantCompanyID/);
});

test('tenant-predicate: a TenantId predicate (=, IN, IS NULL OR, joined) or a TenantId insert passes', () => {
  const js = `const a = db.query('SELECT * FROM gabay.Venue WHERE TenantId = $1 AND Name = $2', [t, n]);
const b = db.query('SELECT * FROM gabay.Venue v WHERE v.TenantId IN ($1, $2)', [t, u]);
const c = db.query(\`SELECT * FROM gabay.Level
                      WHERE TenantId = $1 OR TenantId IS NULL\`, [t]);
const d = db.query('INSERT INTO gabay.Venue (TenantId, Name) VALUES ($1, $2)', [t, n]);
const e = db.query('SELECT * FROM gabay.Level l JOIN gabay.Venue v ON v.TenantId = l.TenantId WHERE l.TenantId = $1', [t]);
`;
  assert.deepEqual(run(js), []);
});

test('tenant-predicate: tables with no TenantId column, parameterless SELECT 1 and prose pass', () => {
  const js = `const a = db.query('SELECT * FROM gabay.Role WHERE Code = $1', [c]);
const b = db.query('SELECT 1', []);
const c = 'Select a venue from the list';
`;
  assert.deepEqual(run(js), []);
});

test('tenant-predicate: an INSERT without TenantId fails', () => {
  assert.equal(run("db.query('INSERT INTO gabay.Venue (Name) VALUES ($1)', [n]);\n").length, 1);
});

test('tenant-predicate: // tenant-scope: <reason> above passes; without a reason it fails', () => {
  const ok = `// tenant-scope: platform job, reads every tenant on purpose (nightly roll-up)
db.query('SELECT * FROM gabay.Venue', []);
`;
  assert.deepEqual(run(ok), []);
  const bad = `// tenant-scope:
db.query('SELECT * FROM gabay.Venue', []);
`;
  const found = run(bad);
  assert.deepEqual(at(found), [`${FILE}:2:tenant-predicate`]);
  assert.match(found[0].message, /needs a reason/);
});

test('tenant-predicate: an interpolated table name is not guessed at', () => {
  assert.deepEqual(run('db.query(`SELECT * FROM gabay.${table} WHERE id = $1`, [id]);\n'), []);
});

test('tenant-predicate: --files mode checks listed files; a changed schema.sql widens to every file', () => {
  const bad = "db.query('SELECT * FROM gabay.Venue', []);\n";
  assert.deepEqual(run(bad, { files: ['README.md'] }), []);
  assert.equal(run(bad, { files: [FILE] }).length, 1);
  assert.equal(run(bad, { files: ['db/schema.sql'] }).length, 1);
});

test('tenant-predicate: only functions/src is checked', () => {
  const bad = "db.query('SELECT * FROM gabay.Venue', []);\n";
  assert.deepEqual(lint('tenant-predicate', { 'db/schema.sql': SCHEMA, 'functions/test/x.js': bad }), []);
});
