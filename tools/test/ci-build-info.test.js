// tools/ci-build-info.js: the numbers build.yml stamps into the builds. Scratch repositories only.
'use strict';

const test = require('./timeout');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { scratchRepo, git, write, read, remove } = require('./scratch');
const { buildInfo } = require('../ci-build-info');

const VERSION = 'app/lib/core/config/app_version.dart';

function withRepo(fn) {
  const dir = scratchRepo();
  try {
    return fn(dir);
  } finally {
    remove(dir);
  }
}

test('ci-build-info: each surface reads its own fallback version, the commit count is the build number', () => {
  withRepo((dir) => {
    write(
      dir,
      VERSION,
      read(dir, VERSION).replace(
        "mobileFallbackVersion = '0.1.0'",
        "mobileFallbackVersion = '0.4.2'",
      ),
    );
    git(dir, ['add', '-A']);
    git(dir, ['-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'raise mobile']);
    const info = buildInfo(dir, new Date('2026-10-08T03:04:05.678Z'));
    assert.equal(info.mobile_version, '0.4.2');
    assert.equal(info.admin_version, '0.1.0');
    assert.equal(info.build_number, git(dir, ['rev-list', '--count', 'HEAD']).out.trim());
    assert.equal(info.build_number, '2');
    assert.equal(info.git_commit, git(dir, ['rev-parse', '--short=10', 'HEAD']).out.trim());
    assert.equal(info.build_time, '2026-10-08T03:04:05Z', 'UTC, without milliseconds');
  });
});

test('ci-build-info: the command prints name=value lines a workflow can append to GITHUB_OUTPUT', () => {
  withRepo((dir) => {
    fs.mkdirSync(path.join(dir, 'tools', 'hooks'), { recursive: true });
    const r = spawnSync(process.execPath, [path.join(dir, 'tools', 'ci-build-info.js')], {
      cwd: dir,
      encoding: 'utf8',
    });
    // The scratch repo has no copy of the script: copy it in, then run it.
    assert.notEqual(r.status, 0);
    fs.copyFileSync(
      path.join(__dirname, '..', 'ci-build-info.js'),
      path.join(dir, 'tools', 'ci-build-info.js'),
    );
    const ok = spawnSync(process.execPath, [path.join(dir, 'tools', 'ci-build-info.js')], {
      cwd: dir,
      encoding: 'utf8',
    });
    assert.equal(ok.status, 0, ok.stderr);
    const lines = ok.stdout.trim().split('\n');
    assert.deepEqual(
      lines.map((l) => l.split('=')[0]),
      ['mobile_version', 'admin_version', 'build_number', 'git_commit', 'build_time'],
    );
    assert.ok(
      lines.every((l) => /^[a-z_]+=\S+$/.test(l)),
      'one token per line, nothing to escape',
    );
  });
});

test('ci-build-info: a missing version fails loudly rather than stamping "undefined"', () => {
  withRepo((dir) => {
    write(dir, VERSION, '// no versions here\n');
    assert.throws(() => buildInfo(dir), /could not read mobile_version/);
  });
});
