'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { connect } = require('../lib/connect');
const { runMigrations, readMigrations, extractVerifyQuery } = require('../lib/migrations');

/** A scratch migrations folder with the given { filename: content }. */
function folder(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gabay-migrations-'));
  for (const [name, content] of Object.entries(files))
    fs.writeFileSync(path.join(dir, name), content);
  return dir;
}

const GOOD = `CREATE TEMP TABLE mig_probe (n INT);
INSERT INTO mig_probe VALUES (1), (2);

-- verify:
-- SELECT COUNT(*)::int AS rows FROM mig_probe;
`;

test('migrations: the verify query is the SELECT in the comment block after "-- verify:"', () => {
  assert.equal(extractVerifyQuery(GOOD), 'SELECT COUNT(*)::int AS rows FROM mig_probe');
  assert.equal(extractVerifyQuery('SELECT 1;'), null, 'no marker');
  assert.equal(extractVerifyQuery('-- verify:\n-- DELETE FROM x'), null, 'only a SELECT');
  assert.equal(extractVerifyQuery('-- verify:\n-- SELECT 1; SELECT 2'), null, 'only one statement');
});

test('migrations: an empty or missing folder is not an error', () => {
  assert.deepEqual(readMigrations(folder({})), []);
  assert.deepEqual(readMigrations(path.join(os.tmpdir(), 'gabay-no-such-folder')), []);
});

test('migrations: bad names, repeated numbers and missing verify queries are refused, all listed', () => {
  const dir = folder({
    '1_unpadded.sql': GOOD,
    '0002_Has_Capitals.sql': GOOD,
    '0003_ok.sql': GOOD,
    '0003_dup.sql': GOOD,
    '0004_no_verify.sql': 'SELECT 1;',
  });
  assert.throws(
    () => readMigrations(dir),
    (err) => {
      assert.match(err.message, /1_unpadded\.sql: the name must match/);
      assert.match(err.message, /0002_Has_Capitals\.sql: the name must match/);
      assert.match(err.message, /0004_no_verify\.sql: no verification query/);
      assert.match(err.message, /number 0003 is used by more than one/);
      return true;
    },
  );
});

test('migrations: files run in number order', () => {
  const dir = folder({ '0010_b.sql': GOOD, '0002_a.sql': GOOD, 'README.md': 'not sql' });
  assert.deepEqual(
    readMigrations(dir).map((m) => m.name),
    ['0002_a.sql', '0010_b.sql'],
  );
});

test('migrations: against the local database a file applies, its verification runs, and a failure rolls back', async () => {
  const client = await connect();
  try {
    const originalTable = console.table;
    const printed = [];
    console.table = (rows) => printed.push(rows);
    try {
      const applied = await runMigrations(client, folder({ '0001_probe.sql': GOOD }));
      assert.equal(applied, 1);
      assert.deepEqual(printed, [[{ rows: 2 }]], 'the verification rows are printed');
    } finally {
      console.table = originalTable;
    }

    await assert.rejects(
      () =>
        runMigrations(
          client,
          folder({
            '0001_bad.sql':
              'CREATE TEMP TABLE mig_fail (n INT);\nSELECT * FROM no_such_table_here;\n-- verify:\n-- SELECT 1\n',
          }),
        ),
      /0001_bad\.sql failed and was rolled back/,
    );
    // The connection is usable again, and the failed file's table did not survive.
    const gone = await client.query("SELECT to_regclass('pg_temp.mig_fail') AS t");
    assert.equal(gone.rows[0].t, null);
  } finally {
    await client.end();
  }
});
