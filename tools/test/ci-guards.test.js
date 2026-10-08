// tools/ci-guards.js: the secret guard and the changelog duplicate guard, run by CI over the committed tree
// (L133). Scratch repositories only; commits skip the local hooks on purpose (that is the gap CI closes).
'use strict';

const test = require('./timeout');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { scratchRepo, git, write, read, remove } = require('./scratch');
const { parseProcNetTcp } = require('../lib/proc');

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

test('ci-guards: the guards read the COMMITTED files, not an uncommitted working copy', () => {
  withRepo((dir) => {
    write(dir, '.env', 'X=1\n'); // untracked only
    const r = guards(dir);
    assert.equal(r.status, 0, r.out);
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

// ---- Linux: the /proc parser used by proc.js listeners() on Linux --------------------------------------------------------

test('proc (Linux): parseProcNetTcp finds the inode of a LISTEN socket on a port, IPv4 and IPv6', () => {
  const v4 = `  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 0100007F:1389 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 41001 1 0000000000000000 100 0 0 10 0
   1: 0100007F:1389 0100007F:C350 01 00000000:00000000 00:00000000 00000000  1000        0 41002 1 0000000000000000 100 0 0 10 0
   2: 00000000:0016 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 41003 1 0000000000000000 100 0 0 10 0
`;
  const v6 = `  sl  local_address                         remote_address                        st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 00000000000000000000000001000000:1389 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 41010 1 0000000000000000 100 0 0 10 0
`;
  assert.deepEqual(
    parseProcNetTcp(v4, 0x1389),
    ['41001'],
    'port 5001 listening; the ESTABLISHED row (st 01) is not',
  );
  assert.deepEqual(parseProcNetTcp(v4, 22), ['41003']);
  assert.deepEqual(parseProcNetTcp(v6, 0x1389), ['41010']);
  assert.deepEqual(parseProcNetTcp(v4, 9999), []);
  assert.deepEqual(parseProcNetTcp('', 1), []);
});
