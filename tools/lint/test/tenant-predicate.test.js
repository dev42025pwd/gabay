'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { lint, at, SCHEMA } = require('./helper');

const FILE = 'functions/src/services/venues.js';
const run = (js, extra) => lint('tenant-predicate', { 'db/schema.sql': SCHEMA, [FILE]: js }, extra);
const q = (sql) => `db.query(${JSON.stringify(sql)}, []);\n`;

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

test('tenant-predicate: TenantId bound to a parameter (=, ANY, IN, OR IS NULL) or a $n TenantId insert passes', () => {
  const js = `const a = db.query('SELECT * FROM gabay.Venue WHERE TenantId = $1 AND Name = $2', [t, n]);
const b = db.query('SELECT * FROM gabay.Venue v WHERE v.TenantId IN ($1, $2)', [t, u]);
const c = db.query(\`SELECT * FROM gabay.Level
                      WHERE TenantId = $1 OR TenantId IS NULL\`, [t]);
const d = db.query('INSERT INTO gabay.Venue (TenantId, Name) VALUES ($1, $2)', [t, n]);
const e = db.query('SELECT * FROM gabay.Level l JOIN gabay.Venue v ON v.TenantId = l.TenantId WHERE l.TenantId = $1', [t]);
const f = db.query('SELECT * FROM gabay.Venue WHERE TenantId = ANY($1)', [ids]);
const g = db.query('UPDATE gabay.Venue SET Name = $1 WHERE TenantId = $2; DELETE FROM gabay.Level WHERE TenantId = $2 AND LevelId = $3', [n, t, id]);
const h = db.query('INSERT INTO gabay.Venue (TenantId, Name) VALUES ($1, $2), ($1, $3)', [t, n, m]);
const i = db.query('SELECT * FROM gabay.Venue WHERE /* the tenant */ TenantId = $1', [t]);
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

// ---- S4 review C2: a join, a comparison or a comment is not a tenant predicate ------------------

const C2_BAD = [
  [
    'a join on TenantId is not a binding',
    'SELECT * FROM gabay.Venue v JOIN gabay.Level b ON b.TenantId = v.TenantId WHERE v.VenueId = $1',
  ],
  ['TenantId <> $1', 'SELECT * FROM gabay.Venue WHERE TenantId <> $1'],
  ['TenantId IS NOT NULL', 'SELECT * FROM gabay.Venue WHERE TenantId IS NOT NULL'],
  ['TenantId only in a -- comment', 'SELECT * FROM gabay.Venue WHERE Name = $1 -- TenantId = $2'],
  [
    'TenantId only in a block comment',
    'SELECT * FROM gabay.Venue /* TenantId = $1 */ WHERE Name = $1',
  ],
  [
    'TenantId only inside a string literal',
    "SELECT * FROM gabay.Venue WHERE Name = 'TenantId = $1'",
  ],
  [
    'a string literal that mentions TenantId = 0',
    "SELECT * FROM gabay.Venue WHERE Name <> 'TenantId = 0'",
  ],
  ['SELECT TenantId IS NULL AS platform', 'SELECT TenantId IS NULL AS platform FROM gabay.Venue'],
  [
    'INSERT ... SELECT with no predicate',
    'INSERT INTO gabay.Venue (TenantId, Name) SELECT TenantId, Name FROM gabay.Level',
  ],
  ['INSERT with a literal tenant value', 'INSERT INTO gabay.Venue (TenantId, Name) VALUES (1, $1)'],
  [
    'INSERT where one row has a literal tenant',
    'INSERT INTO gabay.Venue (TenantId, Name) VALUES ($1, $2), (5, $3)',
  ],
  ['INSERT with no TenantId column', 'INSERT INTO gabay.Venue (Name) VALUES ($1)'],
  [
    'second statement has no predicate',
    'UPDATE gabay.Venue SET Name = $1 WHERE TenantId = $2; DELETE FROM gabay.Level WHERE LevelId = $3',
  ],
  [
    'UPDATE that sets TenantId but does not filter on it',
    'UPDATE gabay.Venue SET TenantId = $1 WHERE VenueId = $2',
  ],
  ['TenantId compared with a non-parameter', 'SELECT * FROM gabay.Venue WHERE TenantId = 5'],
];

for (const [name, sql] of C2_BAD) {
  test(`tenant-predicate (C2): ${name} fails`, () => {
    assert.deepEqual(at(run(q(sql))), [`${FILE}:1:tenant-predicate`]);
  });
}

// ---- S4 review C1: runPaged calls are statements too -------------------------------------------

const PAGED = (where, extra = '') => `async function list(db, paging) {
  return runPaged({
    query: db.query,
    select: 'v.Name',
    from: 'gabay.Venue v',
    ${extra}
    where: ${where},
    params: [],
    paging,
  });
}
`;

test('tenant-predicate (C1): a runPaged call on a tenant table with no TenantId predicate fails on the call line', () => {
  const found = run(PAGED("'v.Name ILIKE $1'"));
  assert.deepEqual(at(found), [`${FILE}:2:tenant-predicate`]);
  assert.match(found[0].message, /runPaged/);
});

test('tenant-predicate (C1): a runPaged call with TenantId bound in where passes', () => {
  assert.deepEqual(run(PAGED("'v.TenantId = $1 AND v.Name ILIKE $2'")), []);
  assert.deepEqual(run(PAGED("'v.TenantId = $1 AND ' + 'v.Name ILIKE $2'")), []);
});

test('tenant-predicate (C1): a join on TenantId in runPaged does not count, and a where that is not a literal fails', () => {
  const join = PAGED("'v.VenueId = $1'", "join: 'JOIN gabay.Level l ON l.TenantId = v.TenantId',");
  assert.equal(run(join).length, 1);
  const found = run(PAGED('whereSql'));
  assert.equal(found.length, 1);
  assert.match(found[0].message, /literal/);
});

test('tenant-predicate (C1): runPaged on a table without TenantId, the declaration itself, and an annotated call pass', () => {
  const role = `runPaged({ query, select: 'r.Code', from: 'gabay.Role r', where: 'r.Code ILIKE $1', params: [], paging });\n`;
  assert.deepEqual(run(role), []);
  const decl =
    'async function runPaged({ query, select, from, where = "", params = [], paging }) { return 1; }\n';
  assert.deepEqual(run(decl), []);
  const note = PAGED("'v.Name ILIKE $1'").replace(
    '  return runPaged({',
    '  // tenant-scope: platform report across all venues\n  return runPaged({',
  );
  assert.deepEqual(run(note), []);
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
  assert.deepEqual(
    lint('tenant-predicate', { 'db/schema.sql': SCHEMA, 'functions/test/x.js': bad }),
    [],
  );
});
