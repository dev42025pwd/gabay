// verify's repair of the seed's Firebase emulator export (S7 round 4). firebase-tools' HubExport exports to a
// temporary folder `firebase-export-<ms><random>` (db/seeds, relative path), then removes .emulator-data and moves
// the temp folder into its place. On Windows that move failed once: .emulator-data was gone, the temp folder stayed
// (untracked, not ignored), and verify ended FAIL code-changed-during-run although every check had passed.
// After the seed check, repairSeedExport puts the newest valid export back, deletes the other leftovers, and says
// so in one line. Everything else in the folder is left alone.
'use strict';

const test = require('./timeout');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { repairSeedExport, AFTER_CHECK } = require('../verify');

const META = '{"version":"15.32.1","auth":{"version":"15.32.1","path":"auth_export"}}\n';
const ACCOUNTS = '{"users":[]}\n';

/** A scratch db/seeds with the given entries: { name: 'valid' | 'no-metadata' | 'bad-metadata' | 'null-metadata' | 'file', ageMs }. */
function seeds(entries) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gabay-seedexport-'));
  for (const [name, { kind = 'valid', ageMs = 0, marker = name }] of Object.entries(entries)) {
    const folder = path.join(dir, name);
    if (kind === 'file') {
      fs.writeFileSync(folder, 'not a folder\n');
      continue;
    }
    fs.mkdirSync(path.join(folder, 'auth_export'), { recursive: true });
    fs.writeFileSync(path.join(folder, 'auth_export', 'accounts.json'), ACCOUNTS);
    fs.writeFileSync(path.join(folder, 'marker.txt'), marker);
    if (kind === 'valid')
      fs.writeFileSync(path.join(folder, 'firebase-export-metadata.json'), META);
    if (kind === 'bad-metadata')
      fs.writeFileSync(path.join(folder, 'firebase-export-metadata.json'), '{ half');
    if (kind === 'null-metadata')
      fs.writeFileSync(path.join(folder, 'firebase-export-metadata.json'), 'null');
    const when = new Date(Date.now() - ageMs);
    fs.utimesSync(folder, when, when);
  }
  return dir;
}

const marker = (dir, folder) => fs.readFileSync(path.join(dir, folder, 'marker.txt'), 'utf8');

test('.emulator-data missing and one leftover: the leftover is moved into place, with one line saying so', () => {
  const dir = seeds({ 'firebase-export-1791432747663v93X2Q': {} });
  try {
    const lines = [];
    repairSeedExport(dir, (l) => lines.push(l));
    assert.deepEqual(fs.readdirSync(dir), ['.emulator-data']);
    assert.equal(marker(dir, '.emulator-data'), 'firebase-export-1791432747663v93X2Q');
    assert.ok(fs.existsSync(path.join(dir, '.emulator-data', 'auth_export', 'accounts.json')));
    assert.equal(lines.length, 1);
    assert.match(lines[0], /\.emulator-data was missing/);
    assert.match(lines[0], /firebase-export-1791432747663v93X2Q/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('.emulator-data present and leftovers: the leftovers are deleted, .emulator-data is not touched', () => {
  const dir = seeds({
    '.emulator-data': { marker: 'mine' },
    'firebase-export-1': {},
    'firebase-export-2': { kind: 'no-metadata' },
  });
  try {
    const lines = [];
    repairSeedExport(dir, (l) => lines.push(l));
    assert.deepEqual(fs.readdirSync(dir), ['.emulator-data']);
    assert.equal(marker(dir, '.emulator-data'), 'mine');
    assert.equal(lines.length, 1);
    assert.match(lines[0], /removed 2 leftover/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('two leftovers and .emulator-data missing: the newest is moved, the other deleted', () => {
  const dir = seeds({
    'firebase-export-old': { ageMs: 3_600_000 },
    'firebase-export-new': { ageMs: 1_000 },
  });
  try {
    const lines = [];
    repairSeedExport(dir, (l) => lines.push(l));
    assert.deepEqual(fs.readdirSync(dir), ['.emulator-data']);
    assert.equal(marker(dir, '.emulator-data'), 'firebase-export-new');
    assert.equal(lines.length, 1);
    assert.match(lines[0], /firebase-export-new/);
    assert.match(lines[0], /removed 1 leftover/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('no leftover: nothing is done and nothing is printed, with or without .emulator-data', () => {
  for (const entries of [{}, { '.emulator-data': {} }]) {
    const dir = seeds({ node_modules: { kind: 'no-metadata' }, ...entries });
    try {
      const before = fs.readdirSync(dir).sort();
      const lines = [];
      const result = repairSeedExport(dir, (l) => lines.push(l));
      assert.deepEqual(lines, []);
      assert.deepEqual(result, { restored: null, removed: [] });
      assert.deepEqual(fs.readdirSync(dir).sort(), before);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('a leftover without a metadata file (or with a broken one) is never moved into place: it is deleted, .emulator-data stays missing, and the line says so', () => {
  for (const kind of ['no-metadata', 'bad-metadata', 'null-metadata']) {
    const dir = seeds({ 'firebase-export-9': { kind } });
    try {
      const lines = [];
      const result = repairSeedExport(dir, (l) => lines.push(l));
      assert.equal(result.restored, null, kind);
      assert.deepEqual(fs.readdirSync(dir), [], `${kind}: nothing left, nothing restored`);
      assert.equal(lines.length, 1);
      assert.match(lines[0], /\.emulator-data is still missing/);
      assert.match(lines[0], /removed 1 leftover/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('the newest leftover is invalid but an older one is valid: the older one is moved', () => {
  const dir = seeds({
    'firebase-export-valid-older': { ageMs: 3_600_000 },
    'firebase-export-broken-newer': { kind: 'no-metadata', ageMs: 1_000 },
  });
  try {
    repairSeedExport(dir, () => {});
    assert.deepEqual(fs.readdirSync(dir), ['.emulator-data']);
    assert.equal(marker(dir, '.emulator-data'), 'firebase-export-valid-older');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('only folders named firebase-export-<something> are touched: files, other folders and the sources stay', () => {
  const dir = seeds({
    'firebase-export-1': {},
    'firebase-export-notes.txt': { kind: 'file' },
    'firebase-exports': { marker: 'not ours' },
    'my-firebase-export-1': { marker: 'not ours' },
    sources: { kind: 'no-metadata', marker: 'sources' },
    node_modules: { kind: 'no-metadata', marker: 'modules' },
  });
  try {
    repairSeedExport(dir, () => {});
    assert.deepEqual(fs.readdirSync(dir).sort(), [
      '.emulator-data',
      'firebase-export-notes.txt',
      'firebase-exports',
      'my-firebase-export-1',
      'node_modules',
      'sources',
    ]);
    assert.equal(marker(dir, 'sources'), 'sources');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a missing seeds folder is not an error', () => {
  const lines = [];
  assert.deepEqual(
    repairSeedExport(path.join(os.tmpdir(), 'gabay-no-such-seeds'), (l) => lines.push(l)),
    {
      restored: null,
      removed: [],
    },
  );
  assert.deepEqual(lines, []);
});

test('verify runs the repair after the seed check and after no other', () => {
  assert.deepEqual(Object.keys(AFTER_CHECK), ['seed']);
  assert.equal(typeof AFTER_CHECK.seed, 'function');
  assert.match(
    fs.readFileSync(path.join(__dirname, '..', 'verify.js'), 'utf8'),
    /AFTER_CHECK\[check\.name\]/,
    'the run loop calls it',
  );
});

test('the leftover folders are git-ignored, so they never move the code fingerprint', () => {
  const ignore = fs.readFileSync(
    path.join(__dirname, '..', '..', 'db', 'seeds', '.gitignore'),
    'utf8',
  );
  assert.match(ignore, /^firebase-export-\*\/$/m);
});
