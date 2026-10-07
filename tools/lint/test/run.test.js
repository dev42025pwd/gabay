// The runner: arguments, which files are skipped, exit codes, and the shared scanner.
'use strict';

const test = require('../../test/timeout');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { tree, SCHEMA } = require('./helper');
const { parseArgs, runLinters, LINTERS } = require('../run');
const { scan, codeOnly } = require('../lib/scan');

const RUN = path.resolve(__dirname, '..', 'run.js');
const BAD_VIEW = 'app/lib/features/demo/views/v.dart';
const cli = (root, ...args) =>
  spawnSync(process.execPath, [RUN, '--root', root, '--allow-partial', ...args], {
    encoding: 'utf8',
  });

test('run: all ten linters are registered, with the fixed rule names', () => {
  assert.deepEqual(
    LINTERS.map((l) => l.name),
    [
      'schema-drops',
      'schema-forms',
      'no-bare-textfield',
      'colour-literals',
      'sql-interpolation',
      'tenant-predicate',
      'position-privacy',
      'foreground-manifest',
      'migrations-immutable',
      'no-snackbar',
    ],
  );
});

test('run: parseArgs reads names, --files lists, --staged, --base and rejects unknown input', () => {
  const o = parseArgs([
    'schema-forms',
    '--files',
    'a.dart',
    'b.js',
    '--staged',
    '--base',
    'origin/main',
  ]);
  assert.deepEqual(o.names, ['schema-forms']);
  assert.deepEqual(o.files, ['a.dart', 'b.js']);
  assert.equal(o.staged, true);
  assert.equal(o.base, 'origin/main');
  assert.throws(() => parseArgs(['no-such-linter']), /unknown linter no-such-linter/);
  assert.throws(() => parseArgs(['--wat']), /unknown option --wat/);
});

test('run: exit code is the violation count, output is path:line: rule: message', () => {
  const root = tree({ [BAD_VIEW]: 'a() => TextField();\nb() => Colors.red;\n' });
  try {
    const r = cli(root);
    assert.equal(r.status, 2);
    assert.match(r.stdout, new RegExp(`${BAD_VIEW}:1: no-bare-textfield: `));
    assert.match(r.stdout, new RegExp(`${BAD_VIEW}:2: colour-literals: `));
    assert.match(r.stdout, /2 violation\(s\)\./);
    assert.equal(cli(root, 'no-snackbar').status, 0, 'a named linter runs alone');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('run: exit code is capped at 255; a clean tree exits 0; a bad argument exits 2', () => {
  const many = Object.fromEntries(
    Array.from({ length: 300 }, (_, i) => [
      `app/lib/features/f/views/v${i}.dart`,
      'x() => TextField();\n',
    ]),
  );
  const root = tree(many);
  try {
    assert.equal(cli(root, 'no-bare-textfield').status, 255);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  const clean = tree({ 'README.md': 'x' });
  try {
    const ok = cli(clean);
    assert.equal(ok.status, 0);
    assert.match(ok.stdout, /10 linter\(s\), 0 violations\./);
    assert.equal(cli(clean, 'nope').status, 2);
  } finally {
    fs.rmSync(clean, { recursive: true, force: true });
  }
});

test('run: --files lints only the listed files', () => {
  const root = tree({
    [BAD_VIEW]: 'a() => TextField();\n',
    'app/lib/features/demo/views/w.dart': 'a() => TextField();\n',
  });
  try {
    const r = cli(root, 'no-bare-textfield', '--files', BAD_VIEW);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /v\.dart:1:/);
    assert.doesNotMatch(r.stdout, /w\.dart/);
    assert.equal(
      cli(root, '--files', 'README.md').status,
      0,
      'a listed file that does not exist is ignored',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("run: node_modules, build, .dart_tool, generated l10n and the linters' own fixtures are never linted", () => {
  const bad = 'a() => TextField();\nb() => Colors.red;\n';
  const root = tree({
    'app/lib/features/x/views/node_modules/a.dart': bad,
    'app/build/lib/features/x/views/b.dart': bad,
    'app/.dart_tool/lib/features/x/views/c.dart': bad,
    'app/lib/l10n/app_localizations_tl.dart': bad,
    'tools/lint/test/fixtures/app/lib/features/x/views/d.dart': bad,
  });
  try {
    assert.equal(cli(root).status, 0);
    assert.equal(
      cli(root, '--files', 'tools/lint/test/fixtures/app/lib/features/x/views/d.dart').status,
      0,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('run: a linter that crashes fails the run instead of passing', () => {
  const root = tree({ 'db/schema.sql': SCHEMA });
  const original = LINTERS[0].run;
  LINTERS[0].run = () => {
    throw new Error('boom');
  };
  try {
    const { count, results } = runLinters({
      names: ['schema-drops'],
      files: null,
      staged: false,
      base: null,
      root,
    });
    assert.equal(count, 1);
    assert.match(results[0].violations[0].message, /crashed: .*boom/s);
  } finally {
    LINTERS[0].run = original;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ---- the scanner ------------------------------------------------------------------------------

test('scan: comments, strings, templates (with nested ${}) and regex literals are told apart from code', () => {
  const js =
    "const a = 1; // c1\nconst b = 'x // not a comment';\nconst t = `a ${f(`inner ${g}`)} b`;\nconst r = /['\"`]/g; /* c2 */\n";
  const tokens = scan(js, { lang: 'js' });
  assert.deepEqual(
    tokens.filter((t) => t.depth === 0).map((t) => t.type),
    ['comment', 'string', 'template', 'regex', 'comment'],
  );
  const tpl = tokens.find((t) => t.type === 'template' && t.depth === 0);
  assert.equal(tpl.hasInterpolation, true);
  assert.equal(tpl.text, 'a \0 b');
  assert.ok(!codeOnly(js, 'js').includes('not a comment'));
});

test('scan: Dart triple-quoted and raw strings and // inside a URL string', () => {
  const dart =
    "final u = 'https://example.test/a'; // real comment\nfinal t = '''multi\nline // no''';\nfinal r = r'\\d // no';\n";
  const code = codeOnly(dart, 'dart');
  assert.ok(!code.includes('example'));
  assert.ok(!code.includes('real comment'));
  assert.ok(!code.includes('multi'));
  assert.equal(code.split('\n').length, dart.split('\n').length, 'line numbers are preserved');
});
