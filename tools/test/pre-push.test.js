// .githooks/pre-push: the push is refused unless `npm run verify` is green. Scratch repositories only:
// the "remote" is a bare repository in a temp folder, and the repository's verify.js is a stub whose
// exit code is set by the test (the real verify takes minutes and is proven separately).
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { scratchRepo, git, write, remove } = require('./scratch');

function withPushRepo(verifyExit, fn) {
  const dir = scratchRepo({
    // The hook runs tools/verify.js; this stub stands in for it and exits with the given code.
    'tools/verify.js': `process.stdout.write('verify stub\\n'); process.exit(${verifyExit});\n`,
  });
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

const remoteHead = (remote) => git(remote, ['rev-parse', '--verify', '-q', 'main']);

test('pre-push: a failing verify refuses the push, and nothing reaches the remote', () => {
  withPushRepo(3, (dir, remote) => {
    const r = git(dir, ['push', 'origin', 'main']);
    assert.notEqual(r.status, 0);
    assert.match(r.all, /verify stub/);
    assert.match(r.all, /pre-push: npm run verify failed \(3 check\(s\)\); the push is refused/);
    assert.notEqual(remoteHead(remote).status, 0, 'the remote has no main branch');
  });
});

test('pre-push: a green verify lets the push through', () => {
  withPushRepo(0, (dir, remote) => {
    const r = git(dir, ['push', 'origin', 'main']);
    assert.equal(r.status, 0, r.all);
    assert.equal(remoteHead(remote).out.trim(), git(dir, ['rev-parse', 'HEAD']).out.trim());
  });
});

test('pre-push: --no-verify is the one way around it (CI still refuses the merge)', () => {
  withPushRepo(1, (dir, remote) => {
    assert.equal(git(dir, ['push', '--no-verify', 'origin', 'main']).status, 0);
    assert.equal(remoteHead(remote).status, 0);
  });
});

test('pre-push: the hook runs the repository root verify.js whatever the current folder is', () => {
  withPushRepo(5, (dir) => {
    write(dir, 'sub/x.txt', 'x\n');
    const r = git(path.join(dir, 'sub'), ['push', 'origin', 'main']);
    assert.notEqual(r.status, 0);
    assert.match(r.all, /\(5 check\(s\)\)/);
  });
});
