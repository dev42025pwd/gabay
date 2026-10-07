'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { lint, at } = require('./helper');

const FILE = 'functions/src/routes/venues.js';
const run = (js) => lint('sql-interpolation', { [FILE]: js });

test('sql-interpolation: the gate sample, an interpolated value in SQL, fails on its line', () => {
  const js = `async function find(name) {
  return query(\`SELECT * FROM gabay.Venue WHERE Name = '\${name}'\`, []);
}
`;
  assert.deepEqual(at(run(js)), [`${FILE}:2:sql-interpolation`]);
});

test('sql-interpolation: lower-case SQL naming gabay.<table> is still found', () => {
  assert.equal(run('const q = `select name from gabay.venue where id = ${id}`;\n').length, 1);
});

test('sql-interpolation: SQL joined to a variable with + fails (either side)', () => {
  const js = `const a = 'SELECT * FROM gabay.Venue WHERE Name = ' + name;
const b = filter + ' ORDER BY Name';
const c = 'SELECT * FROM gabay.Venue ' + 'WHERE x = 1 ' + clause;
`;
  assert.deepEqual(at(run(js)), [
    `${FILE}:1:sql-interpolation`,
    `${FILE}:2:sql-interpolation`,
    `${FILE}:3:sql-interpolation`,
  ]);
});

test('sql-interpolation: parameterized SQL, literal-only concatenation and plain prose pass', () => {
  const js = `const a = query('SELECT * FROM gabay.Venue WHERE Name = $1', [name]);
const b = query(\`SELECT 1
                  FROM gabay.Venue\`, []);
const c = 'SELECT * FROM gabay.Venue ' + 'WHERE Name = $1';
const d = \`Could not select \${what} from the list\`;
// query(\`SELECT \${evil}\`)
const e = 'a' + b;
`;
  assert.deepEqual(run(js), []);
});

test('sql-interpolation: an allow-list identifier passes only with // sql-identifiers: and a reason on the line above', () => {
  const ok = `// sql-identifiers: orderBy comes from the caller's sortMap allow-list
const a = \`SELECT * FROM gabay.Venue ORDER BY \${orderBy}\`;
`;
  assert.deepEqual(run(ok), []);

  const noReason = `// sql-identifiers:
const a = \`SELECT * FROM gabay.Venue ORDER BY \${orderBy}\`;
`;
  const found = run(noReason);
  assert.deepEqual(at(found), [`${FILE}:2:sql-interpolation`]);
  assert.match(found[0].message, /needs a reason/);

  const tooFar = `// sql-identifiers: because
const x = 1;
const a = \`SELECT * FROM gabay.Venue ORDER BY \${orderBy}\`;
`;
  assert.deepEqual(at(run(tooFar)), [`${FILE}:3:sql-interpolation`]);
});

test('sql-interpolation: only functions/src is checked', () => {
  const bad = 'const a = `SELECT * FROM gabay.Venue WHERE x = ${y}`;\n';
  assert.deepEqual(
    lint('sql-interpolation', { 'functions/test/x.js': bad, 'db/seeds/lib/db.js': bad }),
    [],
  );
});

test('sql-interpolation: a regex literal with a quote in it does not derail the scan', () => {
  const js = `const re = /['"]/g;
const a = \`SELECT * FROM gabay.Venue WHERE x = \${y}\`;
`;
  assert.deepEqual(at(run(js)), [`${FILE}:2:sql-interpolation`]);
});
