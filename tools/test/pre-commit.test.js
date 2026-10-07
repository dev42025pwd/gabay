// .githooks/pre-commit, post-commit and tools/hooks/*, exercised in scratch git repositories with
// the real hooks, linters and version files (L129; standard §8.1).
'use strict';

const test = require('./timeout');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { scratchRepo, git, write, read, headFile, remove } = require('./scratch');
const stamp = require('../hooks/stamp');

const VERSION = 'app/lib/core/config/app_version.dart';
const CHANGELOG = 'app/lib/core/config/changelog.dart';
const ARB = 'app/lib/l10n/app_en.arb';
const NOW = '2026-10-07T17:00:00Z'; // already 2026-10-08 in Manila (UTC+8)

/** The surface's fallback version and top entry { version, date } as committed in HEAD. */
function committed(dir, surface) {
  return stamp.readSurface(headFile(dir, VERSION), headFile(dir, CHANGELOG), surface);
}

/** Runs fn with a fresh scratch repo and always removes it. */
function withRepo(fn, extra) {
  const dir = scratchRepo(extra);
  try {
    return fn(dir);
  } finally {
    remove(dir);
  }
}

const commit = (dir, args = []) =>
  git(dir, ['commit', '-q', '-m', 'change', ...args], { env: { GABAY_NOW: NOW } });

// ---- secret guard -------------------------------------------------------------------------------

test('secret guard: a staged .env is refused; .env.example and the other templates are allowed', () => {
  withRepo((dir) => {
    write(dir, '.env', 'PGPASSWORD=hunter2\n');
    git(dir, ['add', '-f', '.env']);
    const refused = commit(dir);
    assert.notEqual(refused.status, 0);
    assert.match(refused.all, /refusing to commit secrets: \.env/);
    git(dir, ['reset', '-q']);
    fs.rmSync(path.join(dir, '.env'));

    for (const name of ['.env.example', '.env.sample', '.env.template', '.env.dist']) {
      write(dir, name, 'PGPASSWORD=\n');
    }
    write(dir, 'app/.env.local', 'X=1\n');
    git(dir, ['add', '-f', '.env.example', '.env.sample', '.env.template', '.env.dist']);
    assert.equal(commit(dir).status, 0, 'templates pass');
    git(dir, ['add', '-f', 'app/.env.local']);
    const nested = commit(dir);
    assert.notEqual(nested.status, 0, 'a nested .env.local is refused too');
    assert.match(nested.all, /app\/\.env\.local/);
  });
});

test('secret guard: it fires even when Node is not on the PATH', () => {
  withRepo((dir) => {
    write(dir, '.env', 'X=1\n');
    git(dir, ['add', '-f', '.env']);
    // A PATH with git but no node (git's own folder only).
    // git itself, plus its bundled sh and coreutils; no node anywhere. On Windows that is Git for
    // Windows' cmd, mingw64/bin and usr/bin (found from `git --exec-path`).
    const execPath = git(dir, ['--exec-path']).out.trim();
    const gitHome = path.resolve(execPath, '..', '..', '..');
    const bare =
      process.platform === 'win32'
        ? [
            path.join(gitHome, 'cmd'),
            path.join(gitHome, 'mingw64', 'bin'),
            path.join(gitHome, 'usr', 'bin'),
          ].join(path.delimiter)
        : ['/usr/bin', '/bin'].join(path.delimiter);
    const r = git(dir, ['commit', '-q', '-m', 'x'], { env: { PATH: bare, Path: bare } });
    assert.notEqual(r.status, 0);
    assert.match(r.all, /refusing to commit secrets/);
  });
});

// ---- version bump and changelog stamp (L129) ------------------------------------------------------

test('stamp: a mobile-only change raises the mobile patch once and stamps its changelog, admin untouched', () => {
  withRepo((dir) => {
    write(dir, 'app/lib/features/shopper/home.dart', 'void home() {}\n');
    git(dir, ['add', '-A']);
    const r = commit(dir);
    assert.equal(r.status, 0, r.all);
    const mobile = committed(dir, 'mobile');
    const admin = committed(dir, 'admin');
    assert.deepEqual(
      [mobile.fallback, mobile.topVersion, mobile.topDate],
      ['0.1.1', '0.1.1', '2026-10-08'],
    );
    assert.deepEqual(
      [admin.fallback, admin.topVersion, admin.topDate],
      ['0.1.0', '0.1.0', '2026-10-07'],
    );
    assert.equal(git(dir, ['status', '--porcelain']).out, '');
  });
});

test('stamp: an admin-only change raises the admin patch once, mobile untouched', () => {
  withRepo((dir) => {
    write(dir, 'app/lib/features/admin/home.dart', 'void home() {}\n');
    git(dir, ['add', '-A']);
    assert.equal(commit(dir).status, 0);
    assert.deepEqual(
      [committed(dir, 'admin').fallback, committed(dir, 'admin').topVersion],
      ['0.1.1', '0.1.1'],
    );
    assert.equal(committed(dir, 'mobile').fallback, '0.1.0');
  });
});

test('stamp: a shared change (core, shared, l10n) raises both surfaces once', () => {
  for (const file of [
    'app/lib/core/network/x.dart',
    'app/lib/shared/widgets/x.dart',
    'app/lib/l10n/extra.txt',
  ]) {
    withRepo((dir) => {
      write(dir, file, 'x\n');
      git(dir, ['add', '-A']);
      assert.equal(commit(dir).status, 0);
      assert.equal(committed(dir, 'mobile').fallback, '0.1.1', file);
      assert.equal(committed(dir, 'admin').fallback, '0.1.1', file);
    });
  }
});

test('stamp: the platform and entry folders map to their surface (android, ios, web, main_mobile, main_admin)', () => {
  const cases = {
    'app/android/app/src/main/AndroidManifest.xml': ['mobile'],
    'app/ios/Runner/Info.plist': ['mobile'],
    'app/lib/main_mobile.dart': ['mobile'],
    'app/web/index.html': ['admin'],
    'app/lib/main_admin.dart': ['admin'],
    'app/test/x_test.dart': [],
    'docs/product/GABAY_PRD.md': [],
    'functions/src/app.js': [],
  };
  for (const [file, surfaces] of Object.entries(cases)) {
    assert.deepEqual(stamp.surfacesTouched([file]), surfaces, file);
  }
  assert.deepEqual(
    stamp.surfacesTouched([VERSION, CHANGELOG]),
    [],
    'the version files themselves touch nothing',
  );
});

test('stamp: a version raised by hand is kept and never bumped twice; the date is still stamped', () => {
  withRepo((dir) => {
    write(
      dir,
      VERSION,
      read(dir, VERSION).replace(
        "mobileFallbackVersion = '0.1.0'",
        "mobileFallbackVersion = '0.2.0'",
      ),
    );
    write(dir, 'app/lib/features/shopper/home.dart', 'void home() {}\n');
    git(dir, ['add', '-A']);
    assert.equal(commit(dir).status, 0);
    const mobile = committed(dir, 'mobile');
    assert.deepEqual(
      [mobile.fallback, mobile.topVersion, mobile.topDate],
      ['0.2.0', '0.2.0', '2026-10-08'],
    );
    assert.equal(committed(dir, 'admin').fallback, '0.1.0');
  });
});

test('stamp: a commit that touches no surface changes no version', () => {
  withRepo((dir) => {
    write(dir, 'functions/src/x.js', "'use strict';\n");
    write(dir, 'README.md', 'x\n');
    git(dir, ['add', '-A']);
    assert.equal(commit(dir).status, 0);
    assert.equal(committed(dir, 'mobile').fallback, '0.1.0');
    assert.equal(committed(dir, 'admin').fallback, '0.1.0');
  });
});

test('stamp: Manila date from Intl, never the shell clock (UTC late evening is already tomorrow in Manila)', () => {
  assert.equal(stamp.manilaDate(new Date('2026-10-07T15:59:59Z')), '2026-10-07');
  assert.equal(stamp.manilaDate(new Date('2026-10-07T16:00:00Z')), '2026-10-08');
  assert.equal(stamp.manilaDate(new Date('2026-12-31T20:00:00Z')), '2027-01-01');
  assert.equal(stamp.bumpPatch('0.1.9'), '0.1.10');
  assert.equal(stamp.bumpPatch('1.0'), null);
});

test('stamp: a failure in the stamp warns and never blocks the commit', () => {
  withRepo((dir) => {
    // A changelog.dart the stamper cannot make sense of: the commit must still go through.
    write(dir, CHANGELOG, '// not a changelog\nconst x = 1;\n');
    git(dir, ['add', '-A']);
    git(dir, ['-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'break changelog']);
    write(dir, 'app/lib/features/shopper/home.dart', 'void home() {}\n');
    git(dir, ['add', '-A']);
    const r = commit(dir);
    assert.equal(r.status, 0, r.all);
  });
});

// ---- both commit modes (the TRAP) ------------------------------------------------------------------

const stateOf = (dir) => ({
  status: git(dir, ['status', '--porcelain']).out,
  staged: git(dir, ['diff', '--cached', '--name-status']).out,
  unstaged: git(dir, ['diff', '--name-status']).out,
});

test('both commit modes: HEAD, the index and the working tree all hold the stamp, and git status is clean', () => {
  for (const mode of ['git commit', 'git commit -- <paths>']) {
    withRepo((dir) => {
      write(dir, 'app/lib/features/shopper/home.dart', 'void home() {}\n');
      git(dir, ['add', '-A']);
      git(dir, ['-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'add the file (no hooks)']);
      write(dir, 'app/lib/features/shopper/home.dart', 'void home() { /* edited */ }\n');
      if (mode === 'git commit') git(dir, ['add', '-A']);
      const r =
        mode === 'git commit'
          ? commit(dir)
          : commit(dir, ['--', 'app/lib/features/shopper/home.dart']);
      assert.equal(r.status, 0, `${mode}: ${r.all}`);
      const head = stamp.readSurface(headFile(dir, VERSION), headFile(dir, CHANGELOG), 'mobile');
      assert.deepEqual([head.fallback, head.topVersion], ['0.1.1', '0.1.1'], `${mode}: HEAD`);
      const disk = stamp.readSurface(read(dir, VERSION), read(dir, CHANGELOG), 'mobile');
      assert.deepEqual(
        [disk.fallback, disk.topVersion],
        ['0.1.1', '0.1.1'],
        `${mode}: working tree`,
      );
      assert.deepEqual(
        stateOf(dir),
        { status: '', staged: '', unstaged: '' },
        `${mode}: index and status`,
      );
      assert.ok(!fs.existsSync(path.join(dir, '.git', 'gabay-restage')), `${mode}: marker removed`);
    });
  }
});

test('both commit modes: without the post-commit hook the pathspec mode leaves a reversed staged change (why it exists)', () => {
  withRepo((dir) => {
    write(dir, 'app/lib/features/shopper/home.dart', 'void home() {}\n');
    git(dir, ['add', '-A']);
    git(dir, ['-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'add the file (no hooks)']);
    write(dir, 'app/lib/features/shopper/home.dart', 'void home() { /* edited */ }\n');
    fs.rmSync(path.join(dir, '.githooks', 'post-commit'));
    const r = commit(dir, ['--', 'app/lib/features/shopper/home.dart']);
    assert.equal(r.status, 0, r.all);
    assert.match(
      stateOf(dir).staged,
      /app_version\.dart/,
      'the stamp is in HEAD and the working tree, but the index is behind',
    );
  });
});

test('pathspec mode: other staged work stays staged and out of the commit; the stamp still lands once', () => {
  withRepo((dir) => {
    write(dir, 'app/lib/features/shopper/home.dart', 'void home() {}\n');
    write(dir, 'notes.txt', 'later\n');
    git(dir, ['add', '-A']);
    git(dir, ['-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'add files (no hooks)']);
    write(dir, 'app/lib/features/shopper/home.dart', 'void home() { /* edited */ }\n');
    write(dir, 'notes.txt', 'later, changed\n');
    git(dir, ['add', 'notes.txt']);
    assert.equal(commit(dir, ['--', 'app/lib/features/shopper/home.dart']).status, 0);
    assert.equal(
      stateOf(dir).staged.trim(),
      'M\tnotes.txt',
      'notes.txt is still staged, nothing else is',
    );
    assert.equal(committed(dir, 'mobile').fallback, '0.1.1');
  });
});

// ---- duplicate changelog guard ---------------------------------------------------------------------

test('duplicate guard: a repeated entry number in changelog.dart is refused', () => {
  withRepo((dir) => {
    const src = read(dir, CHANGELOG);
    const dup = src.replace(
      /(const List<ChangelogEntry> mobileChangelog = \[\n)/,
      "$1  ChangelogEntry(number: 1, version: '0.1.0', date: '2026-10-07', bullets: _mobileE001),\n",
    );
    assert.notEqual(dup, src);
    write(dir, CHANGELOG, dup);
    git(dir, ['add', '-A']);
    const r = commit(dir);
    assert.notEqual(r.status, 0);
    assert.match(r.all, /mobile changelog has entry number 1 twice/);
  });
});

test('duplicate guard: the same bullet text under a new entry (versions and dates ignored) is refused; new text passes', () => {
  withRepo((dir) => {
    const arb = JSON.parse(read(dir, ARB));
    arb['changelogMobile_e002_a'] = `${arb['changelogMobile_e001_a']} (0.1.1, 2026-10-08)`;
    write(dir, ARB, `${JSON.stringify(arb, null, 2)}\n`);
    git(dir, ['add', '-A']);
    const refused = commit(dir);
    assert.notEqual(refused.status, 0);
    assert.match(refused.all, /changelogMobile_e002_a repeats the text of changelogMobile_e001_a/);

    arb['changelogMobile_e002_a'] = 'You can now search for a store.';
    write(dir, ARB, `${JSON.stringify(arb, null, 2)}\n`);
    git(dir, ['add', '-A']);
    assert.equal(commit(dir).status, 0);
  });
});

// ---- conditional linters ----------------------------------------------------------------------------

test('linters: a staged bad Dart file (a hardcoded colour in a view) refuses the commit, naming file and line', () => {
  withRepo((dir) => {
    write(
      dir,
      'app/lib/features/shopper/views/page.dart',
      'Widget w() {\n  return Container(color: Colors.black);\n}\n',
    );
    git(dir, ['add', '-A']);
    const r = commit(dir);
    assert.notEqual(r.status, 0);
    assert.match(r.all, /app\/lib\/features\/shopper\/views\/page\.dart:2: colour-literals/);
    assert.match(r.all, /a structural linter refused the staged files/);
    assert.equal(stateOf(dir).staged.includes('page.dart'), true, 'nothing was committed');
  });
});

test('linters: a TextFormField and an unparameterized query are refused; a clean file passes', () => {
  withRepo((dir) => {
    write(dir, 'app/lib/features/shopper/views/form.dart', 'Widget w() => TextFormField();\n');
    git(dir, ['add', '-A']);
    assert.match(commit(dir).all, /no-bare-textfield/);
    git(dir, ['reset', '-q']);
    fs.rmSync(path.join(dir, 'app/lib/features/shopper/views/form.dart'));

    write(
      dir,
      'functions/src/q.js',
      "async function f(db, name) {\n  return db.query(`SELECT * FROM gabay.Venue WHERE Name = '${name}'`, []);\n}\n",
    );
    git(dir, ['add', '-A']);
    assert.match(commit(dir).all, /sql-interpolation/);
    git(dir, ['reset', '-q']);
    fs.rmSync(path.join(dir, 'functions/src/q.js'));

    write(dir, 'app/lib/features/shopper/views/ok.dart', "Widget w() => Text('hi');\n");
    git(dir, ['add', '-A']);
    assert.equal(commit(dir).status, 0);
  });
});

test('linters: editing a committed migration is refused; adding a new one is fine', () => {
  withRepo(
    (dir) => {
      write(
        dir,
        'db/migrations/0001_a.sql',
        'CREATE TABLE a (x BIGINT);\n-- verify:\n-- SELECT 1\n',
      );
      git(dir, ['add', '-A']);
      const r = commit(dir);
      assert.notEqual(r.status, 0);
      assert.match(
        r.all,
        /db\/migrations\/0001_a\.sql:1: migrations-immutable: committed migration modified/,
      );
      git(dir, ['reset', '-q', '--hard']);

      write(dir, 'db/migrations/0002_b.sql', 'CREATE TABLE b (x INT);\n-- verify:\n-- SELECT 1\n');
      git(dir, ['add', '-A']);
      assert.equal(commit(dir).status, 0);
    },
    { 'db/migrations/0001_a.sql': 'CREATE TABLE a (x INT);\n-- verify:\n-- SELECT 1\n' },
  );
});

// ---- the hooks as committed -------------------------------------------------------------------------

test('the three hooks are executable in the index (git ignores a hook that is not)', () => {
  const real = path.resolve(__dirname, '..', '..');
  const listed = git(real, ['ls-files', '-s', '.githooks']).out.trim().split('\n');
  for (const hook of ['pre-commit', 'post-commit', 'pre-push']) {
    const line = listed.find((l) => l.endsWith(`.githooks/${hook}`));
    assert.ok(line, `${hook} is tracked`);
    assert.match(line, /^100755 /, `${hook} must be mode 100755 (git update-index --chmod=+x)`);
  }
});
