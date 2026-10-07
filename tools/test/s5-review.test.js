// S5 review (dod-reviewer on 7150314): one test per reproduced finding. Each fails on that commit.
'use strict';

const test = require('./timeout');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { REAL, FIXTURES, scratchRepo, git, write, read, headFile, remove } = require('./scratch');
const stamp = require('../hooks/stamp');
const { checkChangelogDart } = require('../hooks/changelog-guard');

const VERSION = 'app/lib/core/config/app_version.dart';
const CHANGELOG = 'app/lib/core/config/changelog.dart';
const ARB = 'app/lib/l10n/app_en.arb';
const VIEW = 'app/lib/features/shopper/views/home.dart';
const NOW = { GABAY_NOW: '2026-10-07T17:00:00Z' }; // 2026-10-08 in Manila

function withRepo(fn, extra) {
  const dir = scratchRepo(extra);
  try {
    return fn(dir);
  } finally {
    remove(dir);
  }
}

const commit = (dir, args = []) =>
  git(dir, ['commit', '-q', '-m', 'change', ...args], { env: NOW });
const surface = (dir, name = 'mobile') =>
  stamp.readSurface(headFile(dir, VERSION), headFile(dir, CHANGELOG), name);
const fallbackOf = (text, name = 'mobile') =>
  new RegExp(`${name}FallbackVersion = '([^']*)'`).exec(text)[1];

// ---- C1: a new top changelog entry is a release, not a hand-raised version ---------------------------

function addEntry(dir, version, date, bullets = '_mobileE002') {
  write(
    dir,
    CHANGELOG,
    read(dir, CHANGELOG).replace(
      'const List<ChangelogEntry> mobileChangelog = [\n',
      `const List<ChangelogEntry> mobileChangelog = [\n  ChangelogEntry(\n    number: 2,\n    version: '${version}',\n    date: '${date}',\n    bullets: ${bullets},\n  ),\n`,
    ),
  );
  const arb = JSON.parse(read(dir, ARB));
  arb.changelogMobile_e002_a = 'You can now search for a store.';
  write(dir, ARB, `${JSON.stringify(arb, null, 2)}\n`);
}

for (const [label, version, date, expected] of [
  ['an empty placeholder', '', '', '0.1.1'],
  ['the previous version copied', '0.1.0', '2026-10-07', '0.1.1'],
  ['a version lower than HEAD', '0.0.9', '2026-10-07', '0.1.1'],
  ['a text that is not a version', 'x.y.z', 'YYYY-MM-DD', '0.1.1'],
  ['a hand-raised minor', '0.2.0', '2026-10-07', '0.2.0'],
]) {
  test(`stamp (C1): a new top entry with ${label} ships version ${expected} and today's date`, () => {
    withRepo((dir) => {
      addEntry(dir, version, date);
      write(dir, VIEW, '// view\n');
      git(dir, ['add', '-A']);
      const r = commit(dir);
      assert.equal(r.status, 0, r.all);
      const entry = surface(dir);
      assert.deepEqual(
        [entry.fallback, entry.topVersion, entry.topDate],
        [expected, expected, '2026-10-08'],
      );
      assert.equal(surface(dir, 'admin').fallback, '0.1.0', 'admin untouched');
    });
  });
}

test('stamp (C1): plan never keeps a version that is empty, not semver, or not above HEAD', () => {
  const head = {
    versionSrc: fs.readFileSync(path.join(FIXTURES, 'app_version.dart'), 'utf8'),
    changelogSrc: fs.readFileSync(path.join(FIXTURES, 'changelog.dart'), 'utf8'),
  };
  const staged = (fallback) => ({
    versionSrc: head.versionSrc.replace(
      "mobileFallbackVersion = '0.1.0'",
      `mobileFallbackVersion = '${fallback}'`,
    ),
    changelogSrc: head.changelogSrc,
  });
  const paths = ['app/lib/features/shopper/views/home.dart'];
  const pick = (fallback) =>
    stamp.plan({ paths, head, staged: staged(fallback) }).find((d) => d.surface === 'mobile');
  assert.deepEqual(pick('0.2.0'), {
    surface: 'mobile',
    version: '0.2.0',
    reason: 'kept',
    entryNumber: 1,
  });
  assert.equal(pick('0.1.0-beta').version, '0.1.1');
  assert.equal(pick('').version, '0.1.1');
  assert.equal(pick('0.0.5').version, '0.1.1', 'lower than HEAD is bumped from HEAD, not kept');
});

// ---- I2: the linters read what is staged, not what is on disk ----------------------------------------------

test('linters (I2): bad code staged and fixed only on disk is refused', () => {
  withRepo((dir) => {
    write(dir, VIEW, 'x() => TextFormField();\ny() => Colors.black;\n');
    git(dir, ['add', VIEW]);
    write(dir, VIEW, '// fixed on disk, not staged\n');
    const r = commit(dir);
    assert.notEqual(r.status, 0, 'the staged content is what gets committed');
    assert.match(
      r.all,
      /app\/lib\/features\/shopper\/views\/home\.dart:\d+: (no-bare-textfield|colour-literals)/,
    );
  });
});

test('linters (I2): good code staged with a violation only in the unstaged working copy is accepted', () => {
  withRepo((dir) => {
    write(dir, VIEW, '// good\n');
    git(dir, ['add', VIEW]);
    write(dir, VIEW, 'x() => TextFormField();\n');
    const r = commit(dir);
    assert.equal(r.status, 0, r.all);
    assert.equal(headFile(dir, VIEW), '// good\n');
  });
});

// ---- pre-push: verify checks the working tree, so a dirty tree is refused -----------------------------------

function withPushRepo(fn) {
  const dir = scratchRepo({ 'tools/verify.js': "console.log('verify stub'); process.exit(0);\n" });
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'gabay-remote-'));
  git(remote, ['init', '-q', '--bare', '-b', 'main']);
  git(dir, ['remote', 'add', 'origin', remote.split(path.sep).join('/')]);
  try {
    return fn(dir, remote);
  } finally {
    remove(dir);
    remove(remote);
  }
}

test('pre-push: uncommitted or untracked code refuses the push, with the files named; documents do not', () => {
  withPushRepo((dir, remote) => {
    write(dir, 'app/lib/features/shopper/new.dart', 'void x() {}\n');
    const untracked = git(dir, ['push', 'origin', 'main']);
    assert.notEqual(untracked.status, 0);
    assert.match(untracked.all, /uncommitted or untracked code/);
    assert.match(untracked.all, /app\/lib\/features\/shopper\/new\.dart/);
    assert.notEqual(
      git(remote, ['rev-parse', '--verify', '-q', 'main']).status,
      0,
      'nothing was pushed',
    );
    fs.rmSync(path.join(dir, 'app/lib/features/shopper/new.dart'));

    write(dir, 'tools/hooks/stamp.js', `${read(dir, 'tools/hooks/stamp.js')}\n// edited\n`);
    assert.match(git(dir, ['push', 'origin', 'main']).all, /tools\/hooks\/stamp\.js/);
    git(dir, ['checkout', '--', 'tools/hooks/stamp.js']);

    write(dir, 'README.md', 'only a document changed\n');
    write(dir, 'docs/x.md', 'x\n');
    const docsOnly = git(dir, ['push', 'origin', 'main']);
    assert.equal(docsOnly.status, 0, docsOnly.all);
  });
});

// ---- I3a: the stamp reaches the working file even with unstaged edits; a later commit cannot lower it -------

test('stamp (I3a): a working file with an unstaged edit is stamped too, and the next commit keeps the version', () => {
  withRepo((dir) => {
    write(
      dir,
      VERSION,
      read(dir, VERSION).replace('/// Build identity', '/// Build identity (draft note)'),
    );
    write(dir, VIEW, '// view\n');
    git(dir, ['add', VIEW]);
    assert.equal(commit(dir).status, 0);
    assert.equal(fallbackOf(headFile(dir, VERSION)), '0.1.1');
    assert.equal(
      fallbackOf(read(dir, VERSION)),
      '0.1.1',
      'the working file carries the stamp as well',
    );
    assert.match(read(dir, VERSION), /draft note/, 'and keeps the unstaged edit');

    git(dir, ['add', VERSION]); // the developer stages the draft note later
    assert.equal(commit(dir).status, 0);
    assert.equal(
      fallbackOf(headFile(dir, VERSION)),
      '0.1.1',
      'the version did not go back to 0.1.0',
    );
  });
});

test('stamp (I3a): a staged version lower than HEAD is never committed', () => {
  withRepo((dir) => {
    write(dir, VIEW, '// view\n');
    git(dir, ['add', VIEW]);
    assert.equal(commit(dir).status, 0); // HEAD is 0.1.1 now
    write(
      dir,
      VERSION,
      read(dir, VERSION).replace(
        "mobileFallbackVersion = '0.1.1'",
        "mobileFallbackVersion = '0.1.0'",
      ),
    );
    git(dir, ['add', VERSION]);
    assert.equal(commit(dir).status, 0);
    assert.equal(fallbackOf(headFile(dir, VERSION)), '0.1.1');
  });
});

// ---- I3b: a hunk the developer staged on purpose survives a pathspec commit -------------------------------------

test('post-commit (I3b): a staged hunk of a version file survives `git commit -- <paths>`', () => {
  withRepo((dir) => {
    write(
      dir,
      VERSION,
      read(dir, VERSION).replace('/// Build identity', '/// Build identity (staged on purpose)'),
    );
    git(dir, ['add', VERSION]);
    write(dir, VIEW, '// view\n');
    git(dir, ['add', VIEW]);
    const r = commit(dir, ['--', VIEW]);
    assert.equal(r.status, 0, r.all);
    assert.equal(fallbackOf(headFile(dir, VERSION)), '0.1.1');
    const staged = git(dir, ['diff', '--cached', '--', VERSION]).out;
    assert.match(staged, /staged on purpose/, 'the deliberate staging is still there');
    assert.doesNotMatch(
      staged,
      /^[-+].*FallbackVersion/m,
      'and the stamp is not reversed in the index',
    );
    assert.equal(git(dir, ['diff', '--', VERSION]).out, '', 'the working file equals the index');
  });
});

// ---- I4: an interrupted verify only touches what it started -------------------------------------------------------

const listenOn = (port) =>
  new Promise((resolve, reject) => {
    const server = net.createServer().on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });

test('verify (I4): an interrupt never kills a foreign process listening on an emulator port', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gabay-verify-'));
  for (const rel of ['tools/verify.js', 'tools/fingerprint.js', 'tools/lib/proc.js']) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.copyFileSync(path.join(REAL, rel), path.join(dir, rel));
  }
  // A package.json whose test script just waits, so the interrupt lands while a check runs.
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ scripts: { 'tools:test': 'node -e "setTimeout(() => {}, 20000)"' } }),
  );
  fs.writeFileSync(path.join(dir, '.gitignore'), '.verify/\n');
  const g = (...a) =>
    spawnSync('git', ['-c', 'user.email=t@e.test', '-c', 'user.name=T', ...a], { cwd: dir });
  g('init', '-q', '-b', 'main');
  g('add', '-A');
  g('commit', '-q', '-m', 'x');

  // Another project's emulator, as a separate process, on a port verify's old sweep covered.
  const foreign = spawn(
    process.execPath,
    [
      '-e',
      "require('net').createServer().listen(4400, '127.0.0.1', () => console.log('up')); setInterval(() => {}, 1000)",
    ],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  );
  try {
    await new Promise((resolve, reject) => {
      foreign.stdout.once('data', resolve);
      foreign.once('exit', () =>
        reject(new Error('port 4400 is busy: stop the emulators and run this test again')),
      );
    });
    const r = spawnSync(
      process.execPath,
      [path.join(dir, 'tools', 'verify.js'), '--only', 'tools-tests'],
      {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, GABAY_VERIFY_TEST_INTERRUPT_MS: '1500' },
      },
    );
    assert.equal(r.status, 130, r.stdout + r.stderr);
    assert.doesNotThrow(() => process.kill(foreign.pid, 0), 'the foreign listener is still alive');
    const probe = await listenOn(4400).then(
      (s) => (s.close(), 'free'),
      () => 'in use',
    );
    assert.equal(probe, 'in use', 'and still holds its port');
  } finally {
    foreign.kill();
    remove(dir);
  }
});

// ---- I5: a renumbered copy that reuses an entry's bullets ---------------------------------------------------------

test('duplicate guard (I5): two entries of one surface that reference the same bullets function are refused', () => {
  const src = fs
    .readFileSync(path.join(FIXTURES, 'changelog.dart'), 'utf8')
    .replace(
      'const List<ChangelogEntry> mobileChangelog = [\n',
      "const List<ChangelogEntry> mobileChangelog = [\n  ChangelogEntry(\n    number: 2,\n    version: '0.1.0',\n    date: '2026-10-07',\n    bullets: _mobileE001,\n  ),\n",
    );
  const problems = checkChangelogDart(src);
  assert.equal(problems.length, 1);
  assert.match(
    problems[0].message,
    /mobile changelog entries 1 and 2 both use bullets _mobileE001/,
  );
  assert.deepEqual(
    checkChangelogDart(fs.readFileSync(path.join(FIXTURES, 'changelog.dart'), 'utf8')),
    [],
  );
});

test('duplicate guard (I5): the commit is refused', () => {
  withRepo((dir) => {
    addEntry(dir, '0.1.0', '2026-10-07', '_mobileE001');
    write(dir, VIEW, '// view\n');
    git(dir, ['add', '-A']);
    const r = commit(dir);
    assert.notEqual(r.status, 0);
    assert.match(r.all, /both use bullets _mobileE001/);
  });
});

// ---- nits ---------------------------------------------------------------------------------------------------------------

test('listeners (nit): a server that listens on IPv6 only is found too', async () => {
  const { listeners } = require('../lib/proc');
  const server = await new Promise((resolve, reject) => {
    const s = net.createServer().on('error', reject);
    s.listen(0, '::1', () => resolve(s));
  });
  try {
    const { port } = server.address();
    assert.deepEqual(listeners(port), [process.pid]);
  } finally {
    server.close();
  }
});

test('fingerprint (nit): .gitignore is code (what is ignored decides what is hashed)', () => {
  const { isCode } = require('../fingerprint');
  assert.equal(isCode('.gitignore'), true);
});

test('pre-commit (nit): a commit that only adds a changelogMobile_ bullet bumps mobile only; a shared string bumps both', () => {
  withRepo((dir) => {
    const arb = JSON.parse(read(dir, ARB));
    arb.changelogMobile_e002_a = 'You can now search for a store.';
    write(dir, ARB, `${JSON.stringify(arb, null, 2)}\n`);
    git(dir, ['add', '-A']);
    assert.equal(commit(dir).status, 0);
    assert.equal(surface(dir, 'mobile').fallback, '0.1.1');
    assert.equal(surface(dir, 'admin').fallback, '0.1.0');

    arb.changelogAdmin_e002_a = 'The admin page now lists venues.';
    write(dir, ARB, `${JSON.stringify(arb, null, 2)}\n`);
    git(dir, ['add', '-A']);
    assert.equal(commit(dir).status, 0);
    assert.equal(surface(dir, 'mobile').fallback, '0.1.1', 'an admin bullet leaves mobile alone');
    assert.equal(surface(dir, 'admin').fallback, '0.1.1');

    arb.searchHint = 'Search for a store';
    write(dir, ARB, `${JSON.stringify(arb, null, 2)}\n`);
    git(dir, ['add', '-A']);
    assert.equal(commit(dir).status, 0);
    assert.equal(surface(dir, 'mobile').fallback, '0.1.2');
    assert.equal(surface(dir, 'admin').fallback, '0.1.2');
  });
});

test('scratch (nit): the copy filter works when the repository path itself contains a test folder', () => {
  const { isTestPath } = require('./scratch');
  assert.equal(isTestPath(path.join('tools', 'lint', 'test', 'x.test.js')), true);
  assert.equal(isTestPath(path.join('tools', 'hooks', 'stamp.js')), false);
  assert.equal(isTestPath(path.join('app', 'lib', 'core', 'config', 'app_version.dart')), false);
});
