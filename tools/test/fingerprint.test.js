// tools/fingerprint.js: the code fingerprint shared by `npm run verify` and the Stop hook (L129).
'use strict';

const test = require('./timeout');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { fingerprint, isCode, codeFiles, readState, writeState } = require('../fingerprint');

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
