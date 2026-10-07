// S5 second-round review (dod-reviewer on c16b4ef): R1 to R3 and the nits. Each fails on that commit.
'use strict';

const test = require('./timeout');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { REAL, scratchRepo, git, write, read, headFile, remove } = require('./scratch');
const { SCHEMA } = require('../lint/test/helper');

const VERSION = 'app/lib/core/config/app_version.dart';
const CHANGELOG = 'app/lib/core/config/changelog.dart';
const VIEW = 'app/lib/features/shopper/views/home.dart';
const NOW = { GABAY_NOW: '2026-10-07T17:00:00Z' }; // 2026-10-08 in Manila

function withRepo(fn, extra = {}) {
  const dir = scratchRepo({ [VIEW]: '// view\n', ...extra });
  try {
    return fn(dir);
  } finally {
    remove(dir);
  }
}

const commit = (dir, args = [], env = {}) =>
  git(dir, ['commit', '-q', '-m', 'change', ...args], { env: { ...NOW, ...env } });

/** "number/version/date" of every entry of one surface's changelog, newest first. */
function entries(text, list = 'mobileChangelog') {
  const block = text.slice(text.indexOf(`List<ChangelogEntry> ${list}`));
  const stop = block.indexOf('List<ChangelogEntry>', 10);
  return [
    ...(stop === -1 ? block : block.slice(0, stop)).matchAll(
      /number: (\d+),\s*version: '([^']*)',\s*date: '([^']*)'/g,
    ),
  ].map((m) => m.slice(1).join('/'));
}
const fallbackOf = (text, name = 'mobile') =>
  new RegExp(`${name}FallbackVersion = '([^']*)'`).exec(text)[1];

function addDraft(dir, number = 2, bullets = '_mobileE002') {
  write(
    dir,
    CHANGELOG,
    read(dir, CHANGELOG).replace(
      'const List<ChangelogEntry> mobileChangelog = [\n',
      `const List<ChangelogEntry> mobileChangelog = [\n  ChangelogEntry(\n    number: ${number},\n    version: '',\n    date: '',\n    bullets: ${bullets},\n  ),\n`,
    ),
  );
}

// ---- R1: no test depends on the live version files ----------------------------------------------------------------

test('tests (R1): none reads the live version, changelog or ARB files (they move with every stamped commit)', () => {
  const dir = __dirname;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.test.js'))) {
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    assert.doesNotMatch(src, /read\(\s*REAL\s*,/, `${file} reads a file of the real repo`);
    assert.doesNotMatch(src, /join\(\s*REAL\s*,\s*['"]app\//, `${file} reads the real app/`);
  }
  assert.equal(
    fs
      .readFileSync(path.join(__dirname, 'fixtures', 'changelog.dart'), 'utf8')
      .includes("version: '0.1.0'"),
    true,
    'the fixtures are fixed at 0.1.0',
  );
  assert.ok(REAL);
});

// ---- R2: the stamp targets the committed entry, never a draft on top ------------------------------------------------

test('stamp (R2): an unstaged DRAFT entry on top is left alone; the committed entry is the one stamped', () => {
  withRepo((dir) => {
    addDraft(dir); // not staged
    write(dir, VIEW, '// view v2\n');
    git(dir, ['add', VIEW]);
    const first = commit(dir);
    assert.equal(first.status, 0, first.all);
    assert.deepEqual(entries(headFile(dir, CHANGELOG)), ['1/0.1.1/2026-10-08']);
    assert.equal(fallbackOf(headFile(dir, VERSION)), '0.1.1');
    assert.deepEqual(
      entries(read(dir, CHANGELOG)),
      ['2//', '1/0.1.1/2026-10-08'],
      'the draft keeps its placeholders',
    );
    assert.equal(fallbackOf(read(dir, VERSION)), '0.1.1');

    git(dir, ['add', CHANGELOG]); // later the developer stages the draft
    const second = commit(dir);
    assert.equal(second.status, 0, second.all);
    assert.deepEqual(entries(headFile(dir, CHANGELOG)), [
      '2/0.1.2/2026-10-08',
      '1/0.1.1/2026-10-08',
    ]);
    assert.equal(fallbackOf(headFile(dir, VERSION)), '0.1.2');
  });
});

test('post-commit (R2): a new entry staged on purpose survives a pathspec commit, untouched, and the committed entry is right', () => {
  withRepo((dir) => {
    addDraft(dir);
    git(dir, ['add', CHANGELOG]);
    write(dir, VIEW, '// view v2\n');
    git(dir, ['add', VIEW]);
    const r = commit(dir, ['--', VIEW]);
    assert.equal(r.status, 0, r.all);
    assert.deepEqual(entries(headFile(dir, CHANGELOG)), ['1/0.1.1/2026-10-08']);
    const index = git(dir, ['show', `:${CHANGELOG}`]).out;
    assert.deepEqual(
      entries(index),
      ['2//', '1/0.1.1/2026-10-08'],
      'the staged draft is intact and entry 1 is stamped',
    );
    assert.equal(fallbackOf(git(dir, ['show', `:${VERSION}`]).out), '0.1.1');
    const staged = git(dir, ['diff', '--cached', '--', CHANGELOG]).out;
    assert.doesNotMatch(
      staged,
      /^-\s+version: '0\.1\.1'/m,
      'no staged change reverses the stamp of entry 1',
    );
  });
});

// ---- R3: pre-push judges the refs being pushed ----------------------------------------------------------------------------

function withPushRepo(verifyExit, fn) {
  const dir = scratchRepo({
    'tools/verify.js': `console.log('verify stub'); process.exit(${verifyExit});\n`,
  });
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'gabay-remote-'));
  git(remote, ['init', '-q', '-b', 'main', '--bare']);
  git(dir, ['remote', 'add', 'origin', remote.split(path.sep).join('/')]);
  try {
    return fn(dir, remote);
  } finally {
    remove(dir);
    remove(remote);
  }
}

const remoteRef = (remote, ref) => git(remote, ['rev-parse', '--verify', '-q', ref]);
const quietCommit = (dir, file, text) => {
  write(dir, file, text);
  git(dir, ['add', file]);
  git(dir, ['-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', `add ${file}`]);
};

test('pre-push (R3): a ref that is not the checked-out commit is refused, whatever verify says', () => {
  withPushRepo(0, (dir, remote) => {
    git(dir, ['checkout', '-q', '-b', 'feature']);
    quietCommit(dir, 'app/lib/features/shopper/views/bad.dart', 'x() => TextFormField();\n');
    git(dir, ['checkout', '-q', 'main']);
    const r = git(dir, ['push', 'origin', 'feature']);
    assert.notEqual(r.status, 0, r.all);
    assert.match(r.all, /check out the branch you are pushing/i);
    assert.notEqual(remoteRef(remote, 'feature').status, 0, 'nothing reached the remote');
    assert.doesNotMatch(r.all, /verify stub/, 'verify was not even run for the wrong tree');

    const both = git(dir, ['push', 'origin', '--all']);
    assert.notEqual(both.status, 0, 'two branches, one checkout');
    assert.match(both.all, /check out the branch you are pushing/i);
  });
});

test('pre-push (R3): the checked-out branch (by name or as HEAD:other) is verified and pushed', () => {
  withPushRepo(0, (dir, remote) => {
    const named = git(dir, ['push', 'origin', 'main']);
    assert.equal(named.status, 0, named.all);
    assert.match(named.all, /verify stub/);
    quietCommit(dir, 'functions/src/more.js', "'use strict';\n");
    const other = git(dir, ['push', 'origin', 'HEAD:other']);
    assert.equal(other.status, 0, other.all);
    assert.equal(remoteRef(remote, 'other').out.trim(), git(dir, ['rev-parse', 'HEAD']).out.trim());
  });
});

test('pre-push (R3): deleting a remote branch needs no verify and no clean tree', () => {
  withPushRepo(7, (dir, remote) => {
    assert.equal(git(dir, ['push', '--no-verify', 'origin', 'main:old']).status, 0);
    write(dir, 'app/lib/features/shopper/dirty.dart', 'void x() {}\n'); // would refuse a normal push
    const r = git(dir, ['push', 'origin', ':old']);
    assert.equal(r.status, 0, r.all);
    assert.notEqual(remoteRef(remote, 'old').status, 0, 'the branch is gone');
    assert.doesNotMatch(r.all, /verify stub/);
  });
});

test('pre-push (R3): generated and ignored files (build output, node_modules, .verify) do not count as dirty', () => {
  withPushRepo(0, (dir) => {
    for (const f of [
      'app/build/app.dill',
      'app/.dart_tool/x.json',
      'functions/node_modules/x/index.js',
      'db/seeds/.emulator-data/auth.json',
      '.verify/last-run.json',
    ]) {
      write(dir, f, 'x\n');
    }
    const r = git(dir, ['push', 'origin', 'main']);
    assert.equal(r.status, 0, r.all);
  });
});

// ---- nit: a refused commit must not leak its staged export ---------------------------------------------------------------

test('pre-commit (nit): no gabay-staged-* export folder is left behind, after a refused or a good commit', () => {
  withRepo((dir) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gabay-tmpcheck-'));
    const env = { TEMP: tmp, TMP: tmp, TMPDIR: tmp };
    try {
      write(dir, 'app/lib/features/shopper/views/bad.dart', 'x() => TextFormField();\n');
      git(dir, ['add', '-A']);
      const refused = commit(dir, [], env);
      assert.notEqual(refused.status, 0, refused.all);
      assert.deepEqual(
        fs.readdirSync(tmp).filter((n) => n.startsWith('gabay-staged-')),
        [],
        'after a refused commit',
      );

      git(dir, ['reset', '-q']);
      fs.rmSync(path.join(dir, 'app/lib/features/shopper/views/bad.dart'));
      write(dir, 'app/lib/features/shopper/views/good.dart', "Widget w() => Text('hi');\n");
      git(dir, ['add', '-A']);
      assert.equal(commit(dir, [], env).status, 0);
      assert.deepEqual(
        fs.readdirSync(tmp).filter((n) => n.startsWith('gabay-staged-')),
        [],
        'after a good commit',
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ---- nits: the waiver line and a git failure in stop-screens -------------------------------------------------------------

function screensHook(dir, event) {
  const r = spawnSync(process.execPath, [path.join(dir, '.claude', 'hooks', 'stop-screens.js')], {
    cwd: dir,
    encoding: 'utf8',
    input: JSON.stringify({ session_id: 's1', ...event }),
  });
  return {
    status: r.status,
    out: r.stdout.trim(),
    json: r.stdout.trim() ? JSON.parse(r.stdout) : null,
  };
}
const blocks = (r) => r.json?.decision === 'block';

test('waiver (nit): accepted in the usual markdown shapes, in any case, with CRLF', () => {
  withRepo((dir) => {
    write(dir, VIEW, '// view v2\n');
    for (const message of [
      '- Changelog waived: refactor only, no visible change',
      '* Changelog waived: refactor only',
      '**Changelog waived:** refactor only',
      '**Changelog waived**: refactor only',
      '- **Changelog waived:** refactor only',
      'changelog waived: refactor only',
      'CHANGELOG WAIVED: refactor only',
      'x\r\nChangelog waived: refactor only\r\n',
    ]) {
      assert.equal(
        blocks(screensHook(dir, { last_assistant_message: message })),
        false,
        JSON.stringify(message),
      );
    }
  });
});

test('waiver (nit): refused inside a code fence, with the template text, or with no real reason', () => {
  withRepo((dir) => {
    write(dir, VIEW, '// view v2\n');
    for (const message of [
      'Here:\n```\nChangelog waived: refactor\n```',
      'Here:\n```text\n- Changelog waived: refactor\n```\nDone.',
      'Changelog waived: <reason>',
      'Changelog waived: <reason> ',
      '- **Changelog waived:** <reason>',
      'Changelog waived: .',
      'Changelog waived: ...',
      'Changelog waived: 123',
      'Changelog waived:   ',
      'The hook said: put a line "Changelog waived: <reason>" in your final message.',
    ]) {
      assert.equal(
        blocks(screensHook(dir, { stop_hook_active: true, last_assistant_message: message })),
        true,
        JSON.stringify(message),
      );
    }
  });
});

test('waiver (nit): a fence that closes lets a later waiver line count', () => {
  withRepo((dir) => {
    write(dir, VIEW, '// view v2\n');
    const message =
      'Code:\n```\nChangelog waived: inside\n```\nChangelog waived: nothing user-facing changed';
    assert.equal(blocks(screensHook(dir, { last_assistant_message: message })), false);
  });
});

test('stop-screens (nit): a git failure blocks with the reason instead of letting the session finish', () => {
  withRepo((dir) => {
    fs.rmSync(path.join(dir, '.git'), { recursive: true, force: true });
    const r = screensHook(dir, {});
    assert.equal(r.status, 0);
    assert.equal(r.json?.decision, 'block', r.out);
    assert.match(r.json.reason, /Could not tell whether screens changed/);
    assert.ok(SCHEMA);
  });
});
