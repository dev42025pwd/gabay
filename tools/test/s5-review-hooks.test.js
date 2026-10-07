// S5 review, Claude-side findings (I6 / L130 and the stop-verify nits). Each fails on 7150314.
'use strict';

const test = require('./timeout');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { scratchRepo, git, write, read, remove } = require('./scratch');
const { SCHEMA } = require('../lint/test/helper');

const VIEW = 'app/lib/features/shopper/views/home.dart';
const CHANGELOG = 'app/lib/core/config/changelog.dart';
const ARB = 'app/lib/l10n/app_en.arb';

function hook(dir, name, event) {
  const r = spawnSync(process.execPath, [path.join(dir, '.claude', 'hooks', `${name}.js`)], {
    cwd: dir,
    encoding: 'utf8',
    input: JSON.stringify(event),
  });
  return {
    status: r.status,
    out: r.stdout.trim(),
    err: r.stderr.trim(),
    json: r.stdout.trim() ? JSON.parse(r.stdout) : null,
  };
}

function withRepo(fn, extra = {}) {
  const dir = scratchRepo({
    'db/schema.sql': SCHEMA,
    'functions/src/app.js': "'use strict';\n",
    [VIEW]: '// view\n',
    ...extra,
  });
  try {
    return fn(dir);
  } finally {
    remove(dir);
  }
}

const SESSION = { session_id: 's1', hook_event_name: 'Stop' };
const start = (dir) => hook(dir, 'session-baseline', { session_id: 's1', source: 'startup' });
const screens = (dir, event = {}) => hook(dir, 'stop-screens', { ...SESSION, ...event });
const allowed = (r) => r.status === 0 && (r.json === null || r.json.decision === undefined);

// ---- what counts as a screen change -------------------------------------------------------------------------------

const SCREEN_CASES = {
  'a view renamed out of views/': (dir) => {
    fs.mkdirSync(path.join(dir, 'app/lib/features/shopper/widgets'), { recursive: true });
    git(dir, ['mv', VIEW, 'app/lib/features/shopper/widgets/home.dart']);
  },
  'a file anywhere under app/lib/features, not only views/': (dir) =>
    write(dir, 'app/lib/features/shopper/viewmodels/search_vm.dart', '// changed\n'),
  'a new screen under app/lib/shared/navigation': (dir) =>
    write(dir, 'app/lib/shared/navigation/settings_screen.dart', '// a new screen\n'),
  'a theme token under app/lib/core/theme': (dir) =>
    write(dir, 'app/lib/core/theme/gabay_tokens.dart', '// seed colour changed\n'),
  'a shared widget': (dir) => write(dir, 'app/lib/shared/widgets/chip.dart', '// chip\n'),
};

for (const [label, act] of Object.entries(SCREEN_CASES)) {
  test(`stop-screens (I6): ${label} blocks until there is a changelog entry`, () => {
    withRepo((dir) => {
      start(dir);
      act(dir);
      const r = screens(dir);
      assert.equal(r.json?.decision, 'block', r.out);
      assert.match(r.json.reason, /no changelog entry/);
    });
  });
}

test('stop-screens (I6): an ARB @description (translator note) change is not a screen change', () => {
  withRepo((dir) => {
    start(dir);
    const arb = JSON.parse(read(dir, ARB));
    const key = Object.keys(arb).find(
      (k) => k.startsWith('@') && !k.startsWith('@@') && !/changelog/.test(k),
    );
    arb[key] = { description: 'reworded note for translators' };
    write(dir, ARB, `${JSON.stringify(arb, null, 2)}\n`);
    assert.ok(allowed(screens(dir)));
  });
});

test('stop-screens (I6): a comment-only or whitespace-only edit to changelog.dart is not an entry', () => {
  for (const edit of ['\n// a note\n', '\n\n\n   \n', '\n/* block comment */\n']) {
    withRepo((dir) => {
      start(dir);
      write(dir, VIEW, '// view v2\n');
      write(dir, CHANGELOG, read(dir, CHANGELOG) + edit);
      assert.equal(screens(dir).json?.decision, 'block', JSON.stringify(edit));
    });
  }
});

test('stop-screens (I6): a real new entry (or a changelog ARB bullet) is an entry', () => {
  withRepo((dir) => {
    start(dir);
    write(dir, VIEW, '// view v2\n');
    write(
      dir,
      CHANGELOG,
      read(dir, CHANGELOG).replace(
        'const List<ChangelogEntry> mobileChangelog = [\n',
        "const List<ChangelogEntry> mobileChangelog = [\n  ChangelogEntry(number: 2, version: '0.1.1', date: '2026-10-09', bullets: _mobileE002),\n",
      ),
    );
    assert.ok(allowed(screens(dir)));
  });
});

// ---- L130: the waiver --------------------------------------------------------------------------------------------------

test('stop-screens (L130): "Changelog waived: <reason>" in the last message lets the session finish', () => {
  withRepo((dir) => {
    start(dir);
    write(dir, VIEW, '// view v2\n');
    for (const message of [
      'Done.\nChangelog waived: an internal refactor, no visible change',
      'Changelog waived: no user-facing change',
      'Summary...\n\n  Changelog waived:   reason with spaces  \nMore text',
    ]) {
      assert.ok(allowed(screens(dir, { last_assistant_message: message })), message);
    }
  });
});

test('stop-screens (L130): a waiver with no reason, or not at the start of a line, does not count', () => {
  withRepo((dir) => {
    start(dir);
    write(dir, VIEW, '// view v2\n');
    for (const message of [
      'Changelog waived:',
      'Changelog waived:    \nthen a reason on the next line',
      'I said "Changelog waived: because" in passing',
      'no waiver at all',
      '',
    ]) {
      assert.equal(
        screens(dir, { last_assistant_message: message }).json?.decision,
        'block',
        message,
      );
    }
    assert.equal(screens(dir).json?.decision, 'block', 'no last_assistant_message at all');
  });
});

test('stop-screens (L130): stop_hook_active does not release it, with or without a waiver being absent', () => {
  withRepo((dir) => {
    start(dir);
    write(dir, VIEW, '// view v2\n');
    const r = screens(dir, { stop_hook_active: true, last_assistant_message: 'Done.' });
    assert.equal(r.json.decision, 'block');
    assert.ok(
      allowed(
        screens(dir, {
          stop_hook_active: true,
          last_assistant_message: 'Changelog waived: tests only',
        }),
      ),
    );
  });
});

// ---- stop-verify nits ---------------------------------------------------------------------------------------------------

test('stop-verify (nit): if the fingerprint cannot be computed it blocks with the reason, never an unhandled rejection', () => {
  withRepo((dir) => {
    fs.rmSync(path.join(dir, '.git'), { recursive: true, force: true }); // git ls-files will fail
    const r = hook(dir, 'stop-verify', { hook_event_name: 'Stop' });
    assert.equal(r.status, 0, r.err);
    assert.equal(r.json.decision, 'block');
    assert.match(r.json.reason, /Could not tell whether the code changed since the last verify/);
    assert.doesNotMatch(r.err, /UnhandledPromiseRejection|Unhandled/);
  });
});

test('stop-verify (nit): the "verify FAILED" notice says how many checks ran', () => {
  withRepo((dir) => {
    const { fingerprint, writeState } = require(path.join(dir, 'tools', 'fingerprint.js'));
    writeState(
      {
        fingerprint: fingerprint(dir),
        result: 'red',
        partial: false,
        failed: ['node-version'],
        checks: [{ name: 'node-version', ok: false }],
        totalChecks: 15,
        finishedAt: new Date().toISOString(),
      },
      dir,
    );
    const r = hook(dir, 'stop-verify', { hook_event_name: 'Stop' });
    assert.equal(
      r.json.systemMessage,
      'verify FAILED on the current code: 1 of 15 checks ran; failed: node-version',
    );
  });
});
