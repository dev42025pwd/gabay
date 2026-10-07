'use strict';

const test = require('../../test/timeout');
const assert = require('node:assert/strict');
const { lint, at, SCHEMA } = require('./helper');

const SPEC_FILE = 'app/lib/features/venues/venue_specs.dart';
const files = (dart) => ({ 'db/schema.sql': SCHEMA, [SPEC_FILE]: dart });
const run = (dart, extra) => lint('schema-forms', files(dart), extra);

const GOOD = `import 'field_spec.dart';
const specs = [
  FieldSpec(table: 'Venue', name: 'Name', label: 'Name', kind: ColKind.text, required: true, maxLength: 120),
  FieldSpec(table: 'gabay.Venue', name: 'Notes', label: 'Notes', kind: ColKind.memo),
  FieldSpec(table: 'Venue', name: 'Price', label: 'Price', kind: ColKind.money, required: true, scale: 4),
  FieldSpec(table: 'Venue', name: 'Opened', label: 'Opened', kind: ColKind.date),
  FieldSpec(table: 'Venue', name: 'IsActive', label: 'Active', kind: ColKind.flag),
  FieldSpec(table: 'Venue', name: 'Code', label: 'Code', kind: ColKind.text, required: true, maxLength: 10),
  FieldSpec(table: 'Venue', name: 'Label', label: 'Label', kind: ColKind.text, maxLength: 30),
  FieldSpec(table: 'Venue', name: 'LevelId', label: 'Level', kind: ColKind.fk, required: true, lookup: 'levels'),
  FieldSpec(table: 'Venue', name: 'VenueId', label: 'Id', kind: ColKind.integer, readOnly: true),
  FieldSpec(table: 'Venue', name: 'CreatedAt', label: 'Created', kind: ColKind.datetime, readOnly: true),
];
`;

test('schema-forms: specs that agree with the schema pass (multi-column lines and continuation lines parsed)', () => {
  assert.deepEqual(run(GOOD), []);
});

test('schema-forms: the class declaration, comments and a repo with no specs pass', () => {
  const decl = `class FieldSpec {
  const FieldSpec({required this.table, required this.name});
  final String table, name;
}
// FieldSpec(table: 'Venue', name: 'Nope', kind: ColKind.text)
/* FieldSpec(table: 'Nope', name: 'x', kind: ColKind.text) */
`;
  assert.deepEqual(run(decl), []);
  assert.deepEqual(run('void main() {}'), []);
});

/** [dart for line 3, expected message fragment] */
const BAD = [
  [
    "FieldSpec(table: 'Venue', name: 'Name', kind: ColKind.text, required: true, maxLength: 100)",
    /Venue\.Name is VARCHAR\(120\): maxLength must be 120, spec has 100/,
  ],
  [
    "FieldSpec(table: 'Venue', name: 'Name', kind: ColKind.text, required: true)",
    /maxLength must be 120, spec has none/,
  ],
  [
    "FieldSpec(table: 'Venue', name: 'Name', kind: ColKind.text, maxLength: 120)",
    /Venue\.Name is NOT NULL: the spec must say required: true/,
  ],
  [
    "FieldSpec(table: 'Venue', name: 'Notes', kind: ColKind.memo, required: true)",
    /Venue\.Notes is nullable: the spec must not say required: true/,
  ],
  [
    "FieldSpec(table: 'Venue', name: 'Opened', kind: ColKind.text)",
    /Venue\.Opened is DATE: kind must be date, not text/,
  ],
  [
    "FieldSpec(table: 'Venue', name: 'Price', kind: ColKind.money, required: true, scale: 2)",
    /Venue\.Price is DECIMAL\(18,4\): scale must be 4, spec has 2/,
  ],
  [
    "FieldSpec(table: 'Venue', name: 'Price', kind: ColKind.decimal, required: true)",
    /scale must be 4, spec has none/,
  ],
  [
    "FieldSpec(table: 'Venue', name: 'IsActive', kind: ColKind.integer)",
    /Venue\.IsActive is BOOLEAN: kind must be flag, not integer/,
  ],
  [
    "FieldSpec(table: 'Venue', name: 'LevelId', kind: ColKind.integer, required: true)",
    /Venue\.LevelId is INT: kind must be fk or fkMulti, not integer/,
  ],
  [
    "FieldSpec(table: 'Venue', name: 'Tags', kind: ColKind.integer)",
    /Venue\.Tags is INT\[\]: kind must be none/,
  ],
  [
    "FieldSpec(table: 'Venue', name: 'Opened', kind: ColKind.date, maxLength: 5)",
    /Venue\.Opened has no length: remove maxLength: 5/,
  ],
  [
    "FieldSpec(table: 'Venue', name: 'Nope', kind: ColKind.text)",
    /Venue\.Nope: no such column in db\/schema\.sql/,
  ],
  [
    "FieldSpec(table: 'Ghost', name: 'Name', kind: ColKind.text)",
    /table "Ghost" is not in db\/schema\.sql/,
  ],
  [
    "FieldSpec(table: 'Venue', name: columnName, kind: ColKind.text)",
    /needs named literal table:, name: and kind:/,
  ],
  ["FieldSpec('Venue', 'Name', ColKind.text)", /needs named literal table:, name: and kind:/],
];

for (const [i, [spec, expected]] of BAD.entries()) {
  test(`schema-forms: bad spec ${i + 1} of ${BAD.length} fails: ${expected.source.slice(0, 60)}`, () => {
    const found = run(`import 'x.dart';\nconst specs = [\n  ${spec},\n];\n`);
    assert.deepEqual(at(found), [`${SPEC_FILE}:3:schema-forms`]);
    assert.match(found[0].message, expected);
  });
}

test('schema-forms: readOnly skips required, maxLength and scale but still checks the kind', () => {
  assert.deepEqual(
    run("FieldSpec(table: 'Venue', name: 'Name', kind: ColKind.text, readOnly: true);"),
    [],
  );
  assert.equal(
    run("FieldSpec(table: 'Venue', name: 'Name', kind: ColKind.date, readOnly: true);").length,
    1,
  );
});

test('schema-forms: a multi-line spec is reported on its first line', () => {
  const dart = `final s = [
  FieldSpec(
    table: 'Venue',
    name: 'Name',
    kind: ColKind.text,
    required: true,
  ),
];
`;
  assert.deepEqual(at(run(dart)), [`${SPEC_FILE}:2:schema-forms`]);
});

test('schema-forms: --files mode checks listed Dart files; a changed schema.sql widens to every Dart file', () => {
  const bad = "FieldSpec(table: 'Venue', name: 'Nope', kind: ColKind.text);";
  assert.deepEqual(run(bad, { files: ['README.md'] }), []);
  assert.equal(run(bad, { files: [SPEC_FILE] }).length, 1);
  assert.equal(
    run(bad, { files: ['db/schema.sql'] }).length,
    1,
    'the schema changed, the spec file did not',
  );
});

test('schema-forms: generated l10n code is never scanned', () => {
  const found = lint('schema-forms', {
    'db/schema.sql': SCHEMA,
    'app/lib/l10n/app_localizations_en.dart':
      "FieldSpec(table: 'Ghost', name: 'x', kind: ColKind.text);",
  });
  assert.deepEqual(found, []);
});
