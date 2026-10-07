// S4 re-check (dod-reviewer on 57e7616): I-1 and nits 1, 3, 4, and design choice 1's message.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { lint, at, tree, SCHEMA } = require('./helper');

const API = 'functions/src/routes/venues.js';
const tenant = (js, extra) => lint('tenant-predicate', { 'db/schema.sql': SCHEMA, [API]: js }, extra);
const RUN = path.resolve(__dirname, '..', 'run.js');

// ---- I-1: a runPaged call that cannot be read is a violation, not a pass -------------------------

const UNREADABLE = {
  'from is not a literal': `const FROM_VENUE = 'gabay.Venue v';
async function list(db, paging) {
  return runPaged({ query: db.query, select: 'v.Name', from: FROM_VENUE, where: 'v.TenantId = $1', params: [], paging });
}
`,
  'the object has a spread': `async function list(db, opts) {
  return runPaged({ ...opts, from: 'gabay.Venue v', where: 'v.TenantId = $1' });
}
`,
  'the argument is not an object literal': `async function list(db, opts) {
  return runPaged(opts);
}
`,
  'from is missing': `async function list(db, paging) {
  return runPaged({ query: db.query, select: 'v.Name', where: 'v.TenantId = $1', params: [], paging });
}
`,
};

for (const [name, js] of Object.entries(UNREADABLE)) {
  test(`tenant-predicate (I-1): a runPaged call where ${name} fails with the string-literal message`, () => {
    const line = js.split('\n').findIndex((l) => l.includes('runPaged(')) + 1;
    const found = tenant(js);
    assert.deepEqual(at(found), [`${API}:${line}:tenant-predicate`]);
    assert.match(found[0].message, /must be string literals at the call site/);
  });

  test(`tenant-predicate (I-1): the same call passes with // tenant-scope: <reason> above (${name})`, () => {
    const lines = js.split('\n');
    const at0 = lines.findIndex((l) => l.includes('runPaged('));
    lines.splice(at0, 0, '  // tenant-scope: cross-tenant report for platform staff');
    assert.deepEqual(tenant(lines.join('\n')), []);
  });
}

test('tenant-predicate (I-1): a literal from and where, and a literal from on a table without TenantId, still pass', () => {
  const ok = "runPaged({ query, select: 'v.Name', from: 'gabay.Venue v', where: 'v.TenantId = $1', params: [], paging });\n";
  const role = 'runPaged({ query, select: "r.Code", from: "gabay.Role r", where: whereSql, params: [], paging });\n';
  assert.deepEqual(tenant(ok), []);
  assert.deepEqual(tenant(role), []);
});

// ---- nit 1: colour-literals must not flag a field that merely ends in "Colors" ------------------

test('colour-literals (nit 1): levelColors, categoryColors, MyColors and WidgetStateColor pass; the framework classes still fail', () => {
  const view = 'app/lib/features/venue/views/fp.dart';
  const fine = `final a = tokens.levelColors.first;
final b = GabayTokens.of(context).categoryColors[3];
final c = MyColors.black;
final d = WidgetStateColor.resolveWith((s) => x);
`;
  assert.deepEqual(lint('colour-literals', { [view]: fine }), []);
  for (const bad of ['Colors.black', 'm.Colors.black', 'CupertinoColors.black', 'material.Colors.grey.shade200']) {
    assert.deepEqual(at(lint('colour-literals', { [view]: `final a = ${bad};\n` })), [`${view}:1:colour-literals`], bad);
  }
});

// ---- nit 3: --allow-partial only with --root ---------------------------------------------------

test('run (nit 3): --allow-partial without --root exits 2; with --root it works', () => {
  const alone = spawnSync(process.execPath, [RUN, '--allow-partial'], { encoding: 'utf8' });
  assert.equal(alone.status, 2);
  assert.match(alone.stderr, /--allow-partial only works together with --root/);
  const root = tree({ 'README.md': 'x' });
  try {
    assert.equal(spawnSync(process.execPath, [RUN, '--root', root, '--allow-partial'], { encoding: 'utf8' }).status, 0);
    assert.equal(spawnSync(process.execPath, [RUN, '--allow-partial', '--root', root], { encoding: 'utf8' }).status, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ---- nit 4: single-quoted manifest attribute values --------------------------------------------

const MANIFEST = 'app/android/app/src/main/AndroidManifest.xml';

test('foreground-manifest (nit 4): single-quoted android:foregroundServiceType and permission names are read', () => {
  const xml = `<manifest xmlns:android='http://schemas.android.com/apk/res/android'>
  <uses-permission android:name='android.permission.ACCESS_BACKGROUND_LOCATION'/>
  <service android:name='.Tracker' android:foregroundServiceType='dataSync|location' />
</manifest>
`;
  assert.deepEqual(at(lint('foreground-manifest', { [MANIFEST]: xml })), [
    `${MANIFEST}:2:foreground-manifest`,
    `${MANIFEST}:3:foreground-manifest`,
  ]);
  const removed = `<manifest xmlns:tools='x'><uses-permission android:name='android.permission.ACCESS_BACKGROUND_LOCATION' tools:node='remove'/></manifest>\n`;
  assert.deepEqual(lint('foreground-manifest', { [MANIFEST]: removed }), []);
});

// ---- design choice 1: say why a quote-wrapped ${} is flagged -----------------------------------

test('sql-interpolation: when the only SQL signal is a quote-wrapped ${}, the message says why and what to do', () => {
  const found = lint('sql-interpolation', { [API]: "const m = `venue '${id}' not found`;\n" });
  assert.deepEqual(at(found), [`${API}:1:sql-interpolation`]);
  assert.match(found[0].message, /a \$\{\} wrapped in single quotes is treated as SQL; bind it as \$n, or if this is not SQL use double quotes/);
  const real = lint('sql-interpolation', { [API]: "const q = `SELECT * FROM gabay.Venue WHERE Name = '${n}'`;\n" });
  assert.doesNotMatch(real[0].message, /wrapped in single quotes/, 'a real SQL statement keeps the general message');
});
