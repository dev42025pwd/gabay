// tools/fingerprint.js: the code fingerprint shared by `npm run verify` and the Stop hook (L129).
'use strict';

const test = require('./timeout');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  fingerprint,
  isCode,
  codeFiles,
  readState,
  readStateDetailed,
  writeState,
  STALE_TEMP_MS,
} = require('../fingerprint');

/** A git repository with one commit of the given files. */
function repo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gabay-fp-'));
  const run = (...args) =>
    spawnSync('git', ['-c', 'user.email=t@e.test', '-c', 'user.name=T', ...args], {
      cwd: dir,
      encoding: 'utf8',
    });
  run('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(dir, '.gitignore'), 'build/\nnode_modules/\n.verify/\n');
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
  run('add', '-A');
  run('commit', '-q', '-m', 'x');
  return dir;
}

const BASE = {
  'app/lib/main_mobile.dart': 'void main() {}\n',
  'functions/src/app.js': "'use strict';\n",
  'db/schema.sql': 'CREATE TABLE x (a INT);\n',
  'db/seeds/sources/demo/a.json': '{}\n',
  'tools/lint/run.js': "'use strict';\n",
  '.githooks/pre-commit': '#!/bin/sh\n',
  '.claude/hooks/lib.js': "'use strict';\n",
  '.claude/settings.json': '{}\n',
  'package.json': '{}\n',
  'firebase.json': '{}\n',
  'README.md': 'docs\n',
  'docs/product/PRD.md': 'docs\n',
  'plan.html': '<html></html>\n',
  'app/lib/features/README.md': 'docs in a code folder\n',
};

test('which paths are code: app, functions, db, tools, hooks and the root config; documents are not', () => {
  for (const code of [
    'app/lib/a.dart',
    'functions/index.js',
    'db/schema.sql',
    'db/seeds/seed.js',
    'tools/verify.js',
    '.githooks/pre-push',
    '.github/workflows/lint.yml',
    '.claude/hooks/stop-verify.js',
    '.claude/settings.json',
    'package.json',
    'firebase.json',
  ]) {
    assert.equal(isCode(code), true, code);
  }
  for (const other of [
    'README.md',
    'docs/x.md',
    'plan.html',
    'CLAUDE.md',
    'app/lib/features/README.md',
    'tools/lint/README.md',
    'db/SCHEMA_READING_GUIDE.md',
    '.env.example',
    'Engineering Standards.html',
    'INSTALL.md',
  ]) {
    assert.equal(isCode(other), false, other);
  }
});

test('the fingerprint is stable, ignores documents and ignored output, and moves with any code change', () => {
  const dir = repo(BASE);
  try {
    const base = fingerprint(dir);
    assert.match(base, /^[0-9a-f]{64}$/);
    assert.equal(fingerprint(dir), base, 'stable');

    for (const [rel, text] of [
      ['README.md', 'changed docs\n'],
      ['docs/product/PRD.md', 'changed docs\n'],
      ['plan.html', '<html>changed</html>\n'],
      ['app/lib/features/README.md', 'changed\n'],
      ['app/build/out.js', 'generated\n'],
      ['functions/node_modules/x/index.js', 'dependency\n'],
      ['.verify/last-run.json', '{}\n'],
    ]) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), text);
      assert.equal(fingerprint(dir), base, `${rel} must not change it`);
    }

    const moves = (rel, text) => {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), text);
      const now = fingerprint(dir);
      assert.notEqual(now, base, `${rel} must change it`);
      return now;
    };
    const edited = moves('functions/src/app.js', "'use strict';\n// edit\n");
    fs.writeFileSync(path.join(dir, 'functions/src/app.js'), "'use strict';\n");
    assert.equal(fingerprint(dir), base, 'undoing the edit restores it');
    assert.notEqual(
      moves('app/lib/new_file.dart', 'void x() {}\n'),
      edited,
      'an untracked new code file counts',
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a tracked file deleted from disk is skipped, and a rename changes the fingerprint', () => {
  const dir = repo(BASE);
  try {
    const base = fingerprint(dir);
    fs.rmSync(path.join(dir, 'functions/src/app.js'));
    assert.notEqual(fingerprint(dir), base);
    assert.ok(
      !codeFiles(dir).includes('nothing') && codeFiles(dir).includes('functions/src/app.js'),
      'still listed by git',
    );
    fs.writeFileSync(path.join(dir, 'functions/src/app.js'), "'use strict';\n");
    fs.renameSync(path.join(dir, 'functions/src/app.js'), path.join(dir, 'functions/src/api.js'));
    assert.notEqual(fingerprint(dir), base, 'the path is part of what is hashed');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the state file round-trips and a missing or broken one reads as null', () => {
  const dir = repo(BASE);
  try {
    assert.equal(readState(dir), null);
    writeState({ fingerprint: 'abc', result: 'green', failed: [] }, dir);
    assert.deepEqual(readState(dir), { fingerprint: 'abc', result: 'green', failed: [] });
    fs.writeFileSync(path.join(dir, '.verify', 'last-run.json'), '{ broken');
    assert.equal(readState(dir), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('speed: the fingerprint of the real repository takes well under a second (the Stop hook calls it)', () => {
  fingerprint(); // warm the file cache
  const start = process.hrtime.bigint();
  fingerprint();
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  assert.ok(ms < 1000, `${ms.toFixed(0)} ms`);
});

// ---- S7 round 2: two verify runs finishing together corrupted .verify/last-run.json (in-place write) ----------

test('writeState never writes the record in place: a temp file in .verify, then a rename over it (atomic)', () => {
  const dir = repo(BASE);
  const file = path.join(dir, '.verify', 'last-run.json');
  const realWrite = fs.writeFileSync;
  const realRename = fs.renameSync;
  const writes = [];
  const renames = [];
  fs.writeFileSync = (target, ...rest) => (writes.push(String(target)), realWrite(target, ...rest));
  fs.renameSync = (from, to) => (renames.push([String(from), String(to)]), realRename(from, to));
  try {
    writeState({ fingerprint: 'abc', result: 'green', failed: [] }, dir);
  } finally {
    fs.writeFileSync = realWrite;
    fs.renameSync = realRename;
  }
  try {
    assert.ok(!writes.includes(file), 'the final path is never opened for writing');
    assert.equal(renames.length, 1);
    assert.equal(renames[0][1], file);
    assert.equal(
      path.dirname(renames[0][0]),
      path.dirname(file),
      'same folder, so the rename is atomic',
    );
    assert.deepEqual(
      fs.readdirSync(path.join(dir, '.verify')),
      ['last-run.json'],
      'no temp file left',
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('two writers finishing together leave one whole record and no temp files', () => {
  const dir = repo(BASE);
  try {
    const script = `
      const { writeState } = require(${JSON.stringify(path.join(__dirname, '..', 'fingerprint.js'))});
      const pad = 'x'.repeat(400000);
      for (let i = 0; i < 25; i += 1) writeState({ fingerprint: process.argv[1], result: 'green', failed: [], pad }, ${JSON.stringify(dir)});
    `;
    const { spawn } = require('node:child_process');
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const run = (tag) =>
      new Promise((resolve) => {
        const child = spawn(process.execPath, ['-e', script, tag], { env, stdio: 'ignore' });
        child.on('exit', resolve);
      });
    return Promise.all([run('A'), run('B')]).then((codes) => {
      assert.deepEqual(codes, [0, 0], 'neither writer failed');
      const state = readState(dir);
      assert.ok(state && ['A', 'B'].includes(state.fingerprint), 'one writer won, whole');
      assert.deepEqual(fs.readdirSync(path.join(dir, '.verify')), ['last-run.json']);
      fs.rmSync(dir, { recursive: true, force: true });
    });
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw err;
  }
});

test('readStateDetailed tells a missing record from a corrupt one, and names the corruption', () => {
  const dir = repo(BASE);
  try {
    assert.deepEqual(readStateDetailed(dir), { state: null, corrupt: false, error: null });
    fs.mkdirSync(path.join(dir, '.verify'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.verify', 'last-run.json'), '{"a": 1}\n.3"\n}');
    const d = readStateDetailed(dir);
    assert.equal(d.state, null);
    assert.equal(d.corrupt, true);
    assert.match(d.error, /JSON|Unexpected/i);
    assert.equal(readState(dir), null, 'readState keeps its meaning: no usable state');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- S7 round 3: stale temp files, and a read error that is not "missing" -------------------------------------

const tempName = (tag) => `last-run.json.${process.pid}.${tag}.tmp`;
const age = (file, ms) => {
  const when = new Date(Date.now() - ms);
  fs.utimesSync(file, when, when);
};

test('writeState removes a stale last-run.json.*.tmp (a hard kill between write and rename), keeps a fresh one and anything else', () => {
  const dir = repo(BASE);
  try {
    const folder = path.join(dir, '.verify');
    fs.mkdirSync(folder, { recursive: true });
    const stale = path.join(folder, tempName('stale1'));
    const fresh = path.join(folder, tempName('fresh1')); // another live writer, about to rename
    const other = path.join(folder, 'notes.tmp'); // not ours
    const staleSubfolder = path.join(folder, `last-run.json.1.dir.tmp`); // not a file
    for (const f of [stale, fresh, other]) fs.writeFileSync(f, '{"fingerprint":"zzz"}\n');
    fs.mkdirSync(staleSubfolder);
    for (const f of [stale, other, staleSubfolder]) age(f, STALE_TEMP_MS + 60_000);
    age(fresh, STALE_TEMP_MS - 60_000);

    writeState({ fingerprint: 'abc', result: 'green', failed: [] }, dir);

    assert.deepEqual(fs.readdirSync(folder).sort(), [
      'last-run.json',
      'last-run.json.1.dir.tmp',
      path.basename(fresh),
      'notes.tmp',
    ]);
    assert.equal(readState(dir).fingerprint, 'abc');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a temp file is never read as the record, even a whole, valid one next to a missing record', () => {
  const dir = repo(BASE);
  try {
    const folder = path.join(dir, '.verify');
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(
      path.join(folder, tempName('x')),
      JSON.stringify({ fingerprint: fingerprint(dir), result: 'green', failed: [] }),
    );
    assert.equal(readState(dir), null);
    assert.deepEqual(readStateDetailed(dir), { state: null, corrupt: false, error: null });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a failed temp write leaves no temp file behind, and the error reaches the caller', () => {
  const dir = repo(BASE);
  const real = fs.writeFileSync;
  fs.writeFileSync = (target) => {
    real(target, '{ half'); // what a full disk leaves
    throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
  };
  try {
    assert.throws(
      () => writeState({ fingerprint: 'abc', result: 'green', failed: [] }, dir),
      /ENOSPC/,
    );
  } finally {
    fs.writeFileSync = real;
  }
  try {
    assert.deepEqual(fs.readdirSync(path.join(dir, '.verify')), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('readStateDetailed reports a read error that is not "missing" (here EISDIR; EACCES and EBUSY are the same path) and carries it', () => {
  const dir = repo(BASE);
  try {
    fs.mkdirSync(path.join(dir, '.verify', 'last-run.json'), { recursive: true });
    const d = readStateDetailed(dir);
    assert.equal(d.state, null);
    assert.equal(d.corrupt, false, 'it is not corrupt: it could not be read');
    assert.equal(d.unreadable, true);
    assert.match(d.error, /EISDIR/);
    assert.equal(readState(dir), null, 'readState: still no usable state');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
