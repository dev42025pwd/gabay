// tools/ci-guards.js: the secret guard and the changelog duplicate guard, run by CI over the committed tree
// (L133). Scratch repositories only; commits skip the local hooks on purpose (that is the gap CI closes).
'use strict';

const test = require('./timeout');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { scratchRepo, git, write, read, remove } = require('./scratch');

const CHANGELOG = 'app/lib/core/config/changelog.dart';
const ARB = 'app/lib/l10n/app_en.arb';

function withRepo(fn, extra = {}) {
  const dir = scratchRepo({ ...extra });
  try {
    return fn(dir);
  } finally {
    remove(dir);
  }
}

/** Commits everything with the local hooks off, as a --no-verify commit would. */
function commitNoHooks(dir) {
  git(dir, ['add', '-A', '-f']);
  const r = git(dir, ['-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'no hooks']);
  assert.equal(r.status, 0, r.all);
}

const guards = (dir) => {
  const r = spawnSync(process.execPath, [path.join(dir, 'tools', 'ci-guards.js')], {
    cwd: dir,
    encoding: 'utf8',
  });
  return { status: r.status, out: r.stdout + r.stderr };
};

test('ci-guards: a clean tree passes', () => {
  withRepo((dir) => {
    const r = guards(dir);
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /ci-guards: ok/);
  });
});

test('ci-guards: a tracked .env (or .env.local, anywhere) fails; the templates pass', () => {
  withRepo((dir) => {
    write(dir, '.env.example', 'PGPASSWORD=\n');
    write(dir, '.env.sample', 'X=\n');
    write(dir, '.env.template', 'X=\n');
    write(dir, '.env.dist', 'X=\n');
    commitNoHooks(dir);
    assert.equal(guards(dir).status, 0, 'templates are allowed');

    write(dir, '.env', 'PGPASSWORD=hunter2\n');
    write(dir, 'app/.env.local', 'X=1\n');
    commitNoHooks(dir);
    const r = guards(dir);
    assert.equal(r.status, 2);
    assert.match(r.out, /ci-guards: secret: \.env is tracked/);
    assert.match(r.out, /ci-guards: secret: app\/\.env\.local is tracked/);
    assert.doesNotMatch(r.out, /hunter2/, 'the file content is never printed');
  });
});

test("ci-guards: an untracked or ignored .env is not the guard's business", () => {
  withRepo((dir) => {
    write(dir, '.env', 'PGPASSWORD=hunter2\n'); // ignored by the real .gitignore, never added
    assert.equal(guards(dir).status, 0);
  });
});

test('ci-guards: a repeated changelog entry number fails', () => {
  withRepo((dir) => {
    write(
      dir,
      CHANGELOG,
      read(dir, CHANGELOG).replace(
        'const List<ChangelogEntry> mobileChangelog = [\n',
        "const List<ChangelogEntry> mobileChangelog = [\n  ChangelogEntry(number: 1, version: '0.1.0', date: '2026-10-07', bullets: _mobileE002),\n",
      ),
    );
    commitNoHooks(dir);
    const r = guards(dir);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /ci-guards: changelog: .*mobile changelog has entry number 1 twice/);
  });
});

test('ci-guards: a renumbered copy that reuses the bullets, and ARB text repeated under a new entry, fail', () => {
  withRepo((dir) => {
    write(
      dir,
      CHANGELOG,
      read(dir, CHANGELOG).replace(
        'const List<ChangelogEntry> mobileChangelog = [\n',
        "const List<ChangelogEntry> mobileChangelog = [\n  ChangelogEntry(number: 2, version: '0.1.0', date: '2026-10-07', bullets: _mobileE001),\n",
      ),
    );
    const arb = JSON.parse(read(dir, ARB));
    arb.changelogMobile_e002_a = `${arb.changelogMobile_e001_a} (0.1.1)`;
    write(dir, ARB, `${JSON.stringify(arb, null, 2)}\n`);
    commitNoHooks(dir);
    const r = guards(dir);
    assert.equal(r.status, 2, r.out);
    assert.match(r.out, /both use bullets _mobileE001/);
    assert.match(r.out, /changelogMobile_e002_a repeats the text of changelogMobile_e001_a/);
  });
});

// S7 review nit: this test used to claim "the COMMITTED files" while the code reads the working tree. The rule:
// the guards judge the TRACKED files as they are on disk. In CI the checkout is the commit, so that is the
// committed tree; locally it also catches an edit you have not committed yet.
test('ci-guards: an untracked .env is not their business (only tracked files are listed)', () => {
  withRepo((dir) => {
    write(dir, '.env', 'X=1\n'); // untracked only
    const r = guards(dir);
    assert.equal(r.status, 0, r.out);
  });
});

test('ci-guards: a tracked file is read as it is on disk, so an uncommitted edit is seen locally (in CI disk = commit)', () => {
  withRepo((dir) => {
    write(
      dir,
      CHANGELOG,
      read(dir, CHANGELOG).replace(
        'const List<ChangelogEntry> mobileChangelog = [\n',
        "const List<ChangelogEntry> mobileChangelog = [\n  ChangelogEntry(number: 1, version: '0.1.0', date: '2026-10-07', bullets: _mobileE002),\n",
      ),
    ); // edited, not committed
    const r = guards(dir);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /mobile changelog has entry number 1 twice/);
  });
});

test('ci-guards: a tracked file deleted on disk is skipped, not a crash', () => {
  withRepo((dir) => {
    remove(path.join(dir, CHANGELOG));
    remove(path.join(dir, ARB));
    const r = guards(dir);
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /ci-guards: ok/);
  });
});

test('ci-guards: outside a git repository it exits 2 with a message', () => {
  withRepo((dir) => {
    const lone = require('node:fs').mkdtempSync(
      path.join(require('node:os').tmpdir(), 'gabay-nogit-'),
    );
    try {
      require('node:fs').mkdirSync(path.join(lone, 'tools', 'hooks'), { recursive: true });
      for (const f of ['ci-guards.js', 'hooks/changelog-guard.js', 'hooks/stamp.js']) {
        require('node:fs').copyFileSync(path.join(dir, 'tools', f), path.join(lone, 'tools', f));
      }
      const r = spawnSync(process.execPath, [path.join(lone, 'tools', 'ci-guards.js')], {
        cwd: lone,
        encoding: 'utf8',
      });
      assert.equal(r.status, 2);
      assert.match(r.stderr, /cannot list the repository's files/);
    } finally {
      remove(lone);
    }
  });
});
