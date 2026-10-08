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
const { repairSeedExport, AFTER_CHECK, EXPORT_SETTLE_MS } = require('../verify');

const META = '{"version":"15.32.1","auth":{"version":"15.32.1","path":"auth_export"}}\n';
const ACCOUNTS = '{"users":[]}\n';
/** Old enough that no export can still be running (S7 round 5: the repair leaves anything newer alone). */
const OLD = EXPORT_SETTLE_MS + 60_000;

/** The repair with no listener on any port (a test must not depend on what runs on this machine). */
const repair = (dir, log, options = {}) =>
  repairSeedExport(dir, log, { listening: () => [], ...options });

/** Sets the mtime of a folder and everything inside it (the folder last, as a writer would leave it). */
function setAge(target, ageMs) {
  const when = new Date(Date.now() - ageMs);
  if (fs.statSync(target).isDirectory()) {
    for (const entry of fs.readdirSync(target)) setAge(path.join(target, entry), ageMs);
  }
  fs.utimesSync(target, when, when);
}

/**
 * A scratch db/seeds with the given entries:
 * { name: { kind: 'valid' | 'no-metadata' | 'bad-metadata' | 'null-metadata' | 'metadata-only' | 'auth-file' | 'file',
 *           ageMs (default OLD), innerAgeMs (a file inside that is newer than the folder), marker } }.
 */
function seeds(entries) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gabay-seedexport-'));
  for (const [name, { kind = 'valid', ageMs = OLD, innerAgeMs, marker = name }] of Object.entries(
    entries,
  )) {
    const folder = path.join(dir, name);
    if (kind === 'file') {
      fs.writeFileSync(folder, 'not a folder\n');
      continue;
    }
    fs.mkdirSync(folder, { recursive: true });
    if (kind === 'auth-file') fs.writeFileSync(path.join(folder, 'auth_export'), 'a file');
    else if (kind !== 'metadata-only') {
      fs.mkdirSync(path.join(folder, 'auth_export'));
      fs.writeFileSync(path.join(folder, 'auth_export', 'accounts.json'), ACCOUNTS);
    }
    fs.writeFileSync(path.join(folder, 'marker.txt'), marker);
    if (kind === 'valid' || kind === 'metadata-only' || kind === 'auth-file')
      fs.writeFileSync(path.join(folder, 'firebase-export-metadata.json'), META);
    if (kind === 'bad-metadata')
      fs.writeFileSync(path.join(folder, 'firebase-export-metadata.json'), '{ half');
    if (kind === 'null-metadata')
      fs.writeFileSync(path.join(folder, 'firebase-export-metadata.json'), 'null');
    setAge(folder, ageMs);
    if (innerAgeMs !== undefined) {
      const when = new Date(Date.now() - innerAgeMs);
      fs.utimesSync(path.join(folder, 'marker.txt'), when, when);
    }
  }
  return dir;
}

const marker = (dir, folder) => fs.readFileSync(path.join(dir, folder, 'marker.txt'), 'utf8');

test('.emulator-data missing and one leftover: the leftover is moved into place, with one line saying so', () => {
  const dir = seeds({ 'firebase-export-1791432747663v93X2Q': {} });
  try {
    const lines = [];
    repair(dir, (l) => lines.push(l));
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
    repair(dir, (l) => lines.push(l));
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
    'firebase-export-new': { ageMs: OLD },
  });
  try {
    const lines = [];
    repair(dir, (l) => lines.push(l));
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
      const result = repair(dir, (l) => lines.push(l));
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
      const result = repair(dir, (l) => lines.push(l));
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
    'firebase-export-broken-newer': { kind: 'no-metadata', ageMs: OLD },
  });
  try {
    repair(dir, () => {});
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
    repair(dir, () => {});
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
    repair(path.join(os.tmpdir(), 'gabay-no-such-seeds'), (l) => lines.push(l)),
    {
      restored: null,
      removed: [],
    },
  );
  assert.deepEqual(lines, []);
});

// ---- S7 round 5: never touch an export that may be live ----------------------------------------------------

/** Everything under dir as sorted relative paths with their sizes: what "nothing was touched" means. */
function listing(dir, base = dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => {
      const full = path.join(dir, e.name);
      return e.isDirectory()
        ? [`${path.relative(base, full)}/`, ...listing(full, base)]
        : [`${path.relative(base, full)} ${fs.statSync(full).size}`];
    })
    .sort();
}

test('A: a partial export being written right now (0 s old, no metadata yet) is left alone, even with .emulator-data present', () => {
  const dir = seeds({
    '.emulator-data': { marker: 'mine' },
    'firebase-export-live': { kind: 'no-metadata', ageMs: 0 },
  });
  try {
    const before = listing(dir);
    const lines = [];
    const result = repair(dir, (l) => lines.push(l));
    assert.deepEqual(listing(dir), before, 'nothing deleted, nothing moved');
    assert.deepEqual(result.removed, []);
    assert.equal(result.restored, null);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /left 1 firebase-export folder\(s\) in db\/seeds alone/);
    assert.match(lines[0], /export may still be running/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('B: a finished export that another process is about to move (.emulator-data just removed) is not taken over', () => {
  const dir = seeds({ 'firebase-export-live': { ageMs: 5_000 } });
  try {
    const before = listing(dir);
    const lines = [];
    repair(dir, (l) => lines.push(l));
    assert.deepEqual(listing(dir), before, 'the folder stays where it is for its owner to move');
    assert.ok(!fs.existsSync(path.join(dir, '.emulator-data')), 'not renamed into place');
    assert.equal(lines.length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the age is the newest mtime INSIDE the folder: an old folder with a file written a moment ago is live', () => {
  const dir = seeds({
    'firebase-export-live': { kind: 'no-metadata', ageMs: OLD, innerAgeMs: 1_000 },
  });
  try {
    const before = listing(dir);
    repair(dir, () => {});
    assert.deepEqual(listing(dir), before);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the age is judged at the settle limit: just under it is left alone, just over it is repaired', () => {
  for (const [ageMs, repaired] of [
    [EXPORT_SETTLE_MS - 5_000, false],
    [EXPORT_SETTLE_MS + 5_000, true],
  ]) {
    const dir = seeds({ 'firebase-export-edge': { ageMs } });
    try {
      repair(dir, () => {});
      assert.equal(fs.existsSync(path.join(dir, '.emulator-data')), repaired, `${ageMs} ms old`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('one live leftover next to an old one: the whole repair waits (nothing restored, nothing deleted)', () => {
  const dir = seeds({
    'firebase-export-old': { ageMs: 3_600_000 },
    'firebase-export-live': { kind: 'no-metadata', ageMs: 1_000 },
  });
  try {
    const before = listing(dir);
    repair(dir, () => {});
    assert.deepEqual(listing(dir), before);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a listener on 4400 or on 9099 (a seed emulator is up): the repair is skipped entirely, and the line names the port', () => {
  for (const [port, pid] of [
    [4400, 111],
    [9099, 222],
  ]) {
    const dir = seeds({ 'firebase-export-old': {}, 'firebase-export-older': { ageMs: 3_600_000 } });
    try {
      const before = listing(dir);
      const lines = [];
      const asked = [];
      const result = repair(dir, (l) => lines.push(l), {
        listening: (p) => (asked.push(p), p === port ? [pid] : []),
      });
      assert.deepEqual(listing(dir), before, `port ${port}: nothing touched`);
      assert.equal(result.restored, null);
      assert.equal(lines.length, 1);
      assert.match(lines[0], new RegExp(`port ${port} \\(pid ${pid}\\) has a listener`));
      assert.ok(
        asked.length > 0 && asked.every((p) => [4400, 9099].includes(p)),
        'only the seed emulator ports are asked about',
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('the ports are not even asked about when there is no leftover (netstat is not run for nothing)', () => {
  const dir = seeds({ '.emulator-data': {} });
  try {
    const asked = [];
    const lines = [];
    repair(dir, (l) => lines.push(l), { listening: (p) => (asked.push(p), [111]) });
    assert.deepEqual(asked, []);
    assert.deepEqual(lines, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a leftover is repaired when no seed emulator listens and it is older than the limit (nothing else changed)', () => {
  const dir = seeds({ 'firebase-export-old': {} });
  try {
    const lines = [];
    repair(dir, (l) => lines.push(l));
    assert.equal(marker(dir, '.emulator-data'), 'firebase-export-old');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- S7 round 5, 4b: an export holds auth_export/ as well as parseable metadata ---------------------------

test('a folder holding only the metadata file (no auth_export/ folder) is not restored; it is deleted as invalid', () => {
  for (const kind of ['metadata-only', 'auth-file']) {
    const dir = seeds({ 'firebase-export-half': { kind } });
    try {
      const lines = [];
      const result = repair(dir, (l) => lines.push(l));
      assert.equal(result.restored, null, kind);
      assert.deepEqual(fs.readdirSync(dir), [], kind);
      assert.match(lines[0], /\.emulator-data is still missing/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
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
