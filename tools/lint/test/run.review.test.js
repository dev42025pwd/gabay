// S4 review I2 (the runner must not pass silently) and nit 3 (migration names, any case, any folder).
'use strict';

const test = require('../../test/timeout');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { tree, lint, at, SCHEMA } = require('./helper');

const RUN = path.resolve(__dirname, '..', 'run.js');
const cli = (...args) => spawnSync(process.execPath, [RUN, ...args], { encoding: 'utf8' });
const withTree = (files, fn) => {
  const root = tree(files);
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

test('run (I2): --base and --root with a missing, empty or flag-like value exit 2', () => {
  withTree({ 'README.md': 'x' }, (root) => {
    for (const args of [['--base'], ['--base', ''], ['--base', '--staged']]) {
      const r = cli('--root', root, '--allow-partial', ...args);
      assert.equal(r.status, 2, `${JSON.stringify(args)} ${r.stderr}`);
      assert.match(r.stderr, /--base needs a value/);
    }
  });
  for (const args of [['--root'], ['--root', ''], ['--root', '--staged']]) {
    const r = cli('--allow-partial', ...args);
    assert.equal(r.status, 2, JSON.stringify(args));
    assert.match(r.stderr, /--root needs a value/);
  }
});

test('run (I2): in whole-repo mode a missing db/schema.sql, app/lib or functions/src is a violation, not a pass', () => {
  withTree({ 'README.md': 'x' }, (root) => {
    const r = cli('--root', root);
    assert.equal(r.status, 3);
    assert.match(r.stdout, /db\/schema\.sql:0: repo-layout: .*missing/);
    assert.match(r.stdout, /app\/lib:0: repo-layout: .*missing/);
    assert.match(r.stdout, /functions\/src:0: repo-layout: .*missing/);
  });
  withTree(
    {
      'db/schema.sql': SCHEMA,
      'app/lib/main.dart': 'void main() {}\n',
      'functions/src/app.js': "'use strict';\n",
    },
    (root) => {
      assert.equal(cli('--root', root).status, 0);
    },
  );
});

test('run (I2): the layout check is off for --files runs and for --allow-partial', () => {
  withTree({ 'README.md': 'x' }, (root) => {
    assert.equal(cli('--root', root, '--files', 'README.md').status, 0);
    assert.equal(cli('--root', root, '--allow-partial').status, 0);
  });
});

test('run (I2): each linter reports how many files it scanned', () => {
  const files = {
    'db/schema.sql': SCHEMA,
    'app/lib/features/a/views/a.dart': 'void a() {}\n',
    'app/lib/features/a/views/b.dart': 'void b() {}\n',
    'functions/src/app.js': "'use strict';\n",
  };
  withTree(files, (root) => {
    const r = cli('--root', root);
    assert.equal(r.status, 0, r.stdout);
    assert.match(r.stdout, /ok\s+no-bare-textfield \(2 files\)/);
    assert.match(r.stdout, /ok\s+schema-drops \(1 file\)/);
    assert.match(r.stdout, /ok\s+sql-interpolation \(1 file\)/);
  });
});

// ---- migrations-immutable, nit 3 ---------------------------------------------------------------

test('migrations-immutable (nit 3): an upper-case .SQL extension and a file in a subfolder fail the name rule', () => {
  const found = lint('migrations-immutable', {
    'db/migrations/0001_ok.sql': 'SELECT 1;\n',
    'db/migrations/0004_C.SQL': 'SELECT 1;\n',
    'db/migrations/0005_lower.SQL': 'SELECT 1;\n',
    'db/migrations/sub/5_x.sql': 'SELECT 1;\n',
    'db/migrations/sub/0006_fine_name.sql': 'SELECT 1;\n',
  });
  assert.deepEqual(at(found).sort(), [
    'db/migrations/0004_C.SQL:1:migrations-immutable',
    'db/migrations/0005_lower.SQL:1:migrations-immutable',
    'db/migrations/sub/0006_fine_name.sql:1:migrations-immutable',
    'db/migrations/sub/5_x.sql:1:migrations-immutable',
  ]);
  const sub = found.find((v) => v.file.endsWith('0006_fine_name.sql'));
  assert.match(sub.message, /directly in db\/migrations/);
});
