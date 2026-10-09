'use strict';

// schema-forms against the REAL db/schema.sql and the REAL specs in app/lib (S9, plan/PH2-identity.md):
// the drift linter now has something to check, and it catches a mismatch. The deliberate mismatches
// live only here, as strings built in memory from the real spec file; nothing wrong is committed
// under app/lib.

const test = require('../../test/timeout');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { lint } = require('./helper');
const { findFieldSpecs } = require('../schema-forms');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const SCHEMA_FILE = 'db/schema.sql';
const SPEC_FILE = 'app/lib/features/admin/users/models/user_field_specs.dart';
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** The real schema and the real spec file, with `edit` applied to the spec source. */
function run(edit = (s) => s) {
  return lint('schema-forms', {
    [SCHEMA_FILE]: read(SCHEMA_FILE),
    [SPEC_FILE]: edit(read(SPEC_FILE)),
  });
}

/** Replaces `from` with `to` once, failing the test if the real file no longer contains `from`. */
const swap = (from, to) => (src) => {
  assert.ok(src.includes(from), `the real spec file no longer contains: ${from}`);
  return src.replace(from, to);
};

test('schema-forms: the real S11 specs exist and agree with the real db/schema.sql', () => {
  const specs = findFieldSpecs(read(SPEC_FILE));
  const names = specs.map((s) => `${s.args.table}.${s.args.name}`);
  assert.deepEqual(names, [
    'AppUser.Email',
    'AppUser.DisplayName',
    'AppUser.IsActive',
    'UserRole.RoleId',
  ]);
  assert.deepEqual(run(), []);
});

test('schema-forms: the whole repository passes, with at least one real spec to check', () => {
  const { runLinters } = require('../run');
  const { results } = runLinters({
    names: ['schema-forms'],
    files: null,
    staged: false,
    base: null,
    root: ROOT,
  });
  assert.deepEqual(results[0].violations, []);
  assert.ok(results[0].scanned > 0, 'schema-forms scanned no Dart file');
});

test('schema-forms: a wrong maxLength on AppUser.Email is caught, naming the column', () => {
  const found = run(swap('maxLength: 254', 'maxLength: 120'));
  assert.equal(found.length, 1);
  assert.equal(found[0].rule, 'schema-forms');
  assert.equal(found[0].file, SPEC_FILE);
  assert.match(
    found[0].message,
    /AppUser\.Email is VARCHAR\(254\): maxLength must be 254, spec has 120/,
  );
});

test('schema-forms: a missing required on a NOT NULL column is caught', () => {
  const found = run((src) => src.replace(/(name: 'DisplayName',[\s\S]*?)required: true,/, '$1'));
  assert.equal(found.length, 1);
  assert.match(
    found[0].message,
    /AppUser\.DisplayName is NOT NULL: the spec must say required: true/,
  );
});

test('schema-forms: the wrong kind for a column is caught', () => {
  const found = run(swap('kind: ColKind.flag', 'kind: ColKind.text'));
  assert.equal(found.length, 1);
  assert.match(found[0].message, /AppUser\.IsActive is BOOLEAN: kind must be flag, not text/);
});

test('schema-forms: a column that left the schema is caught', () => {
  const found = run(swap("name: 'DisplayName'", "name: 'FullName'"));
  assert.equal(found.length, 1);
  assert.match(found[0].message, /AppUser\.FullName: no such column in db\/schema\.sql/);
});
