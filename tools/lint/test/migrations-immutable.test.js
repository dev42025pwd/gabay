'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { lint, at, tree } = require('./helper');
const { runLinters } = require('../run');

const SQL = 'SELECT 1;\n';

test('migrations-immutable: unpadded, capitalised and non-NNNN names fail; good names pass', () => {
  const found = lint('migrations-immutable', {
    'db/migrations/1_add_x.sql': SQL,
    'db/migrations/0002_Add_X.sql': SQL,
    'db/migrations/add_y.sql': SQL,
    'db/migrations/0003_ok_name.sql': SQL,
    'db/migrations/README.md': 'not a migration',
  });
  assert.deepEqual(at(found).sort(), [
    'db/migrations/0002_Add_X.sql:1:migrations-immutable',
    'db/migrations/1_add_x.sql:1:migrations-immutable',
    'db/migrations/add_y.sql:1:migrations-immutable',
  ]);
  assert.deepEqual(lint('migrations-immutable', { 'db/migrations/0001_a.sql': SQL, 'db/migrations/0002_b.sql': SQL }), []);
  assert.deepEqual(lint('migrations-immutable', { 'README.md': 'no migrations folder' }), []);
});

test('migrations-immutable: two migrations with the same number fail', () => {
  const found = lint('migrations-immutable', {
    'db/migrations/0001_a.sql': SQL,
    'db/migrations/0001_b.sql': SQL,
  });
  assert.deepEqual(at(found), ['db/migrations/0001_b.sql:1:migrations-immutable']);
  assert.match(found[0].message, /number 0001 is also used by 0001_a\.sql/);
});

// ---- git modes, on a temporary repository (the real repo's history is never touched) -----------

const git = (cwd, ...args) =>
  execFileSync('git', ['-c', 'user.email=t@example.test', '-c', 'user.name=Test', '-c', 'core.autocrlf=false', ...args], {
    cwd,
    encoding: 'utf8',
  });

/** A repo with 0001 and 0002 committed on main. */
function repoWithMigrations() {
  const root = tree({ 'db/migrations/0001_a.sql': 'CREATE TABLE a (x INT);\n', 'db/migrations/0002_b.sql': 'CREATE TABLE b (x INT);\n' });
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'migrations');
  return root;
}
const write = (root, rel, text) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
};
const staged = (root) =>
  runLinters({ names: ['migrations-immutable'], files: null, staged: true, base: null, root }).results[0].violations;

test('migrations-immutable --staged: editing, deleting or renaming a committed migration fails; adding one passes', () => {
  const root = repoWithMigrations();
  try {
    assert.deepEqual(staged(root), [], 'nothing staged');

    write(root, 'db/migrations/0003_c.sql', 'CREATE TABLE c (x INT);\n');
    git(root, 'add', '-A');
    assert.deepEqual(staged(root), [], 'a new migration is fine');
    git(root, 'commit', '-q', '-m', 'add 0003');

    write(root, 'db/migrations/0001_a.sql', 'CREATE TABLE a (x BIGINT);\n');
    git(root, 'add', '-A');
    let found = staged(root);
    assert.deepEqual(at(found), ['db/migrations/0001_a.sql:1:migrations-immutable']);
    assert.match(found[0].message, /modified: a committed migration is never edited/);
    git(root, 'commit', '-q', '-m', 'edit 0001 (the bad commit)');

    git(root, 'rm', '-q', 'db/migrations/0002_b.sql');
    found = staged(root);
    assert.deepEqual(at(found), ['db/migrations/0002_b.sql:1:migrations-immutable']);
    assert.match(found[0].message, /deleted/);
    git(root, 'reset', '-q', '--hard');

    git(root, 'mv', 'db/migrations/0003_c.sql', 'db/migrations/0004_c.sql');
    found = staged(root);
    assert.deepEqual(at(found), ['db/migrations/0003_c.sql:1:migrations-immutable']);
    assert.match(found[0].message, /renamed/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('migrations-immutable --base: an edit between REF and HEAD fails; a pure addition passes', () => {
  const root = repoWithMigrations();
  try {
    git(root, 'checkout', '-q', '-b', 'feature');
    write(root, 'db/migrations/0003_c.sql', 'CREATE TABLE c (x INT);\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'add');
    const against = (base) =>
      runLinters({ names: ['migrations-immutable'], files: null, staged: false, base, root }).results[0].violations;
    assert.deepEqual(against('main'), []);

    write(root, 'db/migrations/0002_b.sql', 'CREATE TABLE b (x TEXT);\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'edit 0002');
    assert.deepEqual(at(against('main')), ['db/migrations/0002_b.sql:1:migrations-immutable']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('migrations-immutable: git modes outside a repository report a violation instead of passing silently', () => {
  const root = tree({ 'db/migrations/0001_a.sql': SQL });
  try {
    const found = runLinters({ names: ['migrations-immutable'], files: null, staged: true, base: null, root }).results[0].violations;
    assert.equal(found.length, 1);
    assert.match(found[0].message, /could not ask git/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
