// S4 review C1 and I1: SQL fragments that build a query without looking like a whole statement.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { lint, at } = require('./helper');

const FILE = 'functions/src/routes/venues.js';
const run = (js) => lint('sql-interpolation', { [FILE]: js });

test('sql-interpolation (C1): a runPaged where value with ${} fails, the injection sample included', () => {
  const js = `async function list(req) {
  return runPaged({
    query,
    select: 'v.Name',
    from: 'gabay.Venue v',
    where: \`v.TenantId = $1 AND b.Name ILIKE '%\${req.query.search}%'\`,
    params: [req.tenantCompanyID],
  });
}
`;
  assert.deepEqual(at(run(js)), [`${FILE}:6:sql-interpolation`]);
});

test('sql-interpolation (C1): a ${} template that is the value of select, from, where, orderBy or join fails', () => {
  for (const key of ['select', 'from', 'where', 'orderBy', 'join']) {
    const found = run(`const o = { ${key}: \`v.Name \${x}\` };\n`);
    assert.deepEqual(at(found), [`${FILE}:1:sql-interpolation`], key);
  }
});

test('sql-interpolation (C1): a quote-wrapped interpolation or a $n placeholder beside ${} marks a template as SQL', () => {
  assert.deepEqual(at(run("const a = `Name = '${n}'`;\n")), [`${FILE}:1:sql-interpolation`]);
  assert.deepEqual(at(run('const a = `LIMIT $1 ${x}`;\n')), [`${FILE}:1:sql-interpolation`]);
  assert.deepEqual(
    run('const a = `Could not find venue ${id}`;\n'),
    [],
    'prose without a quote or placeholder',
  );
  assert.deepEqual(run('const a = { title: `Venue ${id}` };\n'), [], 'a key that is not a SQL key');
});

test('sql-interpolation (C1): the same fragments pass with // sql-identifiers: and a reason', () => {
  const js = `const o = {
  // sql-identifiers: orderCol comes from the sortMap allow-list
  orderBy: \`\${orderCol} DESC\`,
};
`;
  assert.deepEqual(run(js), []);
});

test('sql-interpolation (I1): += building SQL, a concatenated fragment and a nested template fail', () => {
  const js = `let sql = 'SELECT * FROM gabay.Venue WHERE 1 = 1';
sql += \` AND Name = '\${x}'\`;
sql += " AND City = '" + city + "'";
const r = query(\`\${base} \${n ? \`WHERE Name = '\${n}'\` : ''}\`, []);
`;
  assert.deepEqual(at(run(js)), [
    `${FILE}:2:sql-interpolation`,
    `${FILE}:3:sql-interpolation`,
    `${FILE}:4:sql-interpolation`,
  ]);
});
