// S5 last fixes (dod-reviewer on 2825924): E1, tags in pre-push, waiver shapes. Each fails on that commit.
'use strict';

const test = require('./timeout');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { scratchRepo, git, write, read, headFile, remove } = require('./scratch');
const stamp = require('../hooks/stamp');

const VERSION = 'app/lib/core/config/app_version.dart';
const CHANGELOG = 'app/lib/core/config/changelog.dart';
const VIEW = 'app/lib/features/shopper/views/home.dart';
const NOW = { GABAY_NOW: '2026-10-07T17:00:00Z' };

function withRepo(fn, extra = {}) {
  const dir = scratchRepo({ [VIEW]: '// view\n', ...extra });
  try {
    return fn(dir);
  } finally {
    remove(dir);
  }
}

/** "number/version/date/bullets" of every mobile entry, newest first. */
const entries = (text) => {
  const block = text.slice(text.indexOf('List<ChangelogEntry> mobileChangelog'));
  const stop = block.indexOf('List<ChangelogEntry>', 10);
  return [
    ...(stop === -1 ? block : block.slice(0, stop)).matchAll(
      /number: (\d+),\s*version: '([^']*)',\s*date: '([^']*)',\s*bullets: (\w+)/g,
    ),
  ].map((m) => m.slice(1).join('/'));
};
const fallbackOf = (text) => /mobileFallbackVersion = '([^']*)'/.exec(text)[1];

// ---- E1: a pasted draft that still has the old number ---------------------------------------------------------------

test('stamp (E1): a draft pasted ABOVE the original with the same number is left alone; the original is stamped', () => {
  withRepo((dir) => {
    write(
      dir,
      CHANGELOG,
      read(dir, CHANGELOG).replace(
        'const List<ChangelogEntry> mobileChangelog = [\n',
        "const List<ChangelogEntry> mobileChangelog = [\n  ChangelogEntry(\n    number: 1,\n    version: '0.1.0',\n    date: '',\n    bullets: _mobileE001,\n  ),\n",
      ),
    );
    write(dir, VIEW, '// view v2\n');
    git(dir, ['add', VIEW]);
    const first = git(dir, ['commit', '-q', '-m', 'view'], { env: NOW });
    assert.equal(first.status, 0, first.all);
    assert.deepEqual(entries(headFile(dir, CHANGELOG)), ['1/0.1.1/2026-10-08/_mobileE001']);
    assert.deepEqual(
      entries(read(dir, CHANGELOG)),
      ['1/0.1.0//_mobileE001', '1/0.1.1/2026-10-08/_mobileE001'],
      'the draft above keeps its text, the original below carries the stamp',
    );

    // The developer renumbers the draft and commits it.
    write(
      dir,
      CHANGELOG,
      read(dir, CHANGELOG)
        .replace('number: 1,', 'number: 2,')
        .replace('bullets: _mobileE001,', 'bullets: _mobileE002,'),
    );
    git(dir, ['add', CHANGELOG]);
    const second = git(dir, ['commit', '-q', '-m', 'entry'], { env: NOW });
    assert.equal(second.status, 0, second.all);
    assert.deepEqual(entries(headFile(dir, CHANGELOG)), [
      '2/0.1.2/2026-10-08/_mobileE002',
      '1/0.1.1/2026-10-08/_mobileE001',
    ]);
    assert.equal(fallbackOf(headFile(dir, VERSION)), '0.1.2');
  });
});

test('stamp (E1): stampSurface with an entry number picks the LAST entry that has it', () => {
  const entry = (version) =>
    `  ChangelogEntry(\n    number: 1,\n    version: '${version}',\n    date: 'd',\n    bullets: _b,\n  ),\n`;
  const src = `const List<ChangelogEntry> mobileChangelog = [\n${entry('draft')}${entry('original')}];\n`;
  const out = stamp.stampSurface(
    "static const String mobileFallbackVersion = '0.1.0';",
    src,
    'mobile',
    '0.1.1',
    '2026-10-08',
    1,
  );
  assert.match(out.changelogSrc, /version: 'draft'/);
  assert.match(out.changelogSrc, /version: '0.1.1',\n\s+date: '2026-10-08'/);
});

// ---- pre-push: tags peel to their commit -----------------------------------------------------------------------------------

function withPushRepo(fn) {
  const dir = scratchRepo({ 'tools/verify.js': "console.log('verify stub'); process.exit(0);\n" });
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

const quiet = (dir, ...args) => git(dir, ['-c', 'core.hooksPath=/dev/null', ...args]);
function secondCommit(dir) {
  write(dir, 'functions/src/more.js', "'use strict';\n");
  quiet(dir, 'add', '-A');
  quiet(dir, 'commit', '-q', '-m', 'second');
}

test('pre-push (tags): an annotated or lightweight tag on the checked-out commit is verified and pushed', () => {
  withPushRepo((dir, remote) => {
    secondCommit(dir);
    quiet(dir, 'tag', '-a', 'v1', '-m', 'release');
    quiet(dir, 'tag', 'light');
    for (const tag of ['v1', 'light']) {
      const r = git(dir, ['push', 'origin', tag]);
      assert.equal(r.status, 0, `${tag}: ${r.all}`);
      assert.match(r.all, /verify stub/, `${tag} was verified`);
    }
    assert.equal(git(remote, ['rev-parse', '--verify', '-q', 'refs/tags/v1']).status, 0);
  });
});

test('pre-push (tags): a tag on an older commit, or on a tree, is refused ("peeled to its commit")', () => {
  withPushRepo((dir, remote) => {
    secondCommit(dir);
    quiet(dir, 'tag', '-a', 'old-annotated', '-m', 'old', 'HEAD~1');
    quiet(dir, 'tag', 'old-light', 'HEAD~1');
    quiet(dir, 'tag', '-a', 'tree-tag', '-m', 'a tree', 'HEAD^{tree}');
    for (const tag of ['old-annotated', 'old-light', 'tree-tag']) {
      const r = git(dir, ['push', 'origin', tag]);
      assert.notEqual(r.status, 0, tag);
      assert.match(r.all, /peeled to its commit/, tag);
      assert.notEqual(
        git(remote, ['rev-parse', '--verify', '-q', `refs/tags/${tag}`]).status,
        0,
        `${tag} did not reach the remote`,
      );
    }
  });
});

test('pre-push (tags): --mirror follows the same rule', () => {
  withPushRepo((dir) => {
    secondCommit(dir);
    quiet(dir, 'tag', 'elsewhere', 'HEAD~1');
    const refused = git(dir, ['push', '--mirror', 'origin']);
    assert.notEqual(refused.status, 0, refused.all);
    assert.match(refused.all, /peeled to its commit/);
    quiet(dir, 'tag', '-d', 'elsewhere');
    assert.equal(git(dir, ['push', '--mirror', 'origin']).status, 0);
  });
});

// ---- waiver: more markdown shapes ----------------------------------------------------------------------------------------

function screensHook(dir, message) {
  const r = spawnSync(process.execPath, [path.join(dir, '.claude', 'hooks', 'stop-screens.js')], {
    cwd: dir,
    encoding: 'utf8',
    input: JSON.stringify({
      session_id: 's1',
      stop_hook_active: true,
      last_assistant_message: message,
    }),
  });
  return r.stdout.trim() ? JSON.parse(r.stdout) : null;
}
const blocked = (r) => r?.decision === 'block';

test('waiver (nit): an ordered-list marker or a markdown heading may come before the words', () => {
  withRepo((dir) => {
    write(dir, VIEW, '// view v2\n');
    for (const message of [
      '1. Changelog waived: refactor only',
      '12) Changelog waived: refactor only',
      '## Changelog waived: refactor only',
      '### **Changelog waived:** refactor only',
      '1. **Changelog waived:** refactor only',
    ]) {
      assert.equal(blocked(screensHook(dir, message)), false, message);
    }
  });
});

test('waiver (nit): a ~~~ fence hides an example like a ``` fence does', () => {
  withRepo((dir) => {
    write(dir, VIEW, '// view v2\n');
    assert.equal(blocked(screensHook(dir, 'x\n~~~\nChangelog waived: example only\n~~~')), true);
    assert.equal(
      blocked(screensHook(dir, 'x\n~~~text\n- Changelog waived: example only\n~~~\nDone.')),
      true,
    );
    assert.equal(
      blocked(
        screensHook(
          dir,
          '~~~\nChangelog waived: inside\n~~~\nChangelog waived: nothing user-facing changed',
        ),
      ),
      false,
      'after the fence closes a real line counts',
    );
    // A ``` line inside a ~~~ fence does not close it.
    assert.equal(blocked(screensHook(dir, '~~~\n```\nChangelog waived: still inside\n~~~')), true);
  });
});
