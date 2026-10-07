// The Claude Code hooks (.claude/hooks, .claude/settings.json), driven by synthesized stdin JSON in
// scratch repositories (L129). Each hook is shown blocking a bad case and passing a good one.
'use strict';

const test = require('./timeout');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { REAL, scratchRepo, git, write, read, remove } = require('./scratch');
const { SCHEMA } = require('../lint/test/helper');

/** Runs a hook script of the scratch repo with `event` as stdin. */
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

function withRepo(fn, extra) {
  const dir = scratchRepo({
    'db/schema.sql': SCHEMA,
    'functions/src/app.js': "'use strict';\n",
    ...extra,
  });
  try {
    return fn(dir);
  } finally {
    remove(dir);
  }
}

/** Records a verify result for the repo's current code, as `npm run verify` would. */
function recordVerify(
  dir,
  { result = 'green', failed = [], partial = false, ran = 0, total = 15 } = {},
) {
  const { fingerprint, writeState } = require(path.join(dir, 'tools', 'fingerprint.js'));
  writeState(
    {
      fingerprint: fingerprint(dir),
      result,
      partial,
      failed,
      checks: Array.from({ length: ran }, (_, i) => ({ name: `check-${i}`, ok: true })),
      totalChecks: total,
      finishedAt: new Date().toISOString(),
    },
    dir,
  );
}

const commitQuiet = (dir, message = 'work') => {
  git(dir, ['add', '-A']);
  git(dir, ['-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', message]);
};

// ---- Stop: verify must have run on the current code ----------------------------------------------------

test('stop-verify: no verify result blocks, with the block JSON on stdout and exit 0', () => {
  withRepo((dir) => {
    const r = hook(dir, 'stop-verify', {
      session_id: 's',
      hook_event_name: 'Stop',
      stop_hook_active: false,
    });
    assert.equal(r.status, 0);
    assert.equal(r.json.decision, 'block');
    assert.match(r.json.reason, /npm run verify has not been run/);
  });
});

test('stop-verify: green on exactly this code lets the session stop, silently', () => {
  withRepo((dir) => {
    recordVerify(dir);
    const r = hook(dir, 'stop-verify', { hook_event_name: 'Stop' });
    assert.deepEqual([r.status, r.out], [0, '']);
  });
});

test('stop-verify: a code edit after a green run blocks with the stale-code reason; a docs-only edit does not', () => {
  withRepo((dir) => {
    recordVerify(dir);
    write(dir, 'docs/product/NOTES.md', 'a document\n');
    write(dir, 'tools/lint/README.md', 'a document in a code folder\n');
    assert.equal(hook(dir, 'stop-verify', {}).out, '', 'documents do not change the fingerprint');
    write(dir, 'functions/src/app.js', "'use strict';\n// edited\n");
    const r = hook(dir, 'stop-verify', {});
    assert.equal(r.json.decision, 'block');
    assert.equal(
      r.json.reason,
      'Code changed since the last npm run verify. Run it and paste its output.',
    );
  });
});

test('stop-verify: a new untracked code file blocks too', () => {
  withRepo((dir) => {
    recordVerify(dir);
    write(dir, 'app/lib/features/shopper/new.dart', 'void x() {}\n');
    assert.equal(hook(dir, 'stop-verify', {}).json.decision, 'block');
  });
});

test('stop-verify: stop_hook_active does NOT release the block (ruling L129 b)', () => {
  withRepo((dir) => {
    const r = hook(dir, 'stop-verify', { hook_event_name: 'Stop', stop_hook_active: true });
    assert.equal(r.json.decision, 'block');
  });
});

test('stop-verify: a FAILED run on this code lets the session stop, with a "verify FAILED" notice naming the checks', () => {
  withRepo((dir) => {
    recordVerify(dir, { result: 'red', failed: ['eslint', 'flutter-test'], ran: 2 });
    const r = hook(dir, 'stop-verify', { stop_hook_active: false });
    assert.equal(r.status, 0);
    assert.equal(r.json.decision, undefined, 'not a block');
    assert.equal(
      r.json.systemMessage,
      'verify FAILED on the current code: 2 of 15 checks ran; failed: eslint, flutter-test',
    );
    // ...and a red run on OLDER code still blocks: it says nothing about this code.
    write(dir, 'functions/src/app.js', "'use strict';\n// changed after the red run\n");
    assert.equal(hook(dir, 'stop-verify', {}).json.decision, 'block');
  });
});

test('stop-verify: a partial run (--only) never counts as a verify', () => {
  withRepo((dir) => {
    recordVerify(dir, { partial: true });
    assert.equal(hook(dir, 'stop-verify', {}).json.decision, 'block');
  });
});

// ---- Stop: screens changed with no changelog entry ---------------------------------------------------

const SESSION = { session_id: 'sess-1', hook_event_name: 'Stop' };
const startSession = (dir) =>
  hook(dir, 'session-baseline', {
    session_id: 'sess-1',
    source: 'startup',
    hook_event_name: 'SessionStart',
  });

test('session-baseline: records HEAD for the session id, and keeps it when the session resumes', () => {
  withRepo((dir) => {
    startSession(dir);
    const file = path.join(dir, '.verify', 'session-sess-1.json');
    const first = JSON.parse(fs.readFileSync(file, 'utf8')).head;
    assert.equal(first, git(dir, ['rev-parse', 'HEAD']).out.trim());
    write(dir, 'x.txt', 'x\n');
    commitQuiet(dir);
    hook(dir, 'session-baseline', { session_id: 'sess-1', source: 'resume' });
    assert.equal(
      JSON.parse(fs.readFileSync(file, 'utf8')).head,
      first,
      'resume keeps the baseline',
    );
    hook(dir, 'session-baseline', { session_id: 'sess-1', source: 'startup' });
    assert.notEqual(
      JSON.parse(fs.readFileSync(file, 'utf8')).head,
      first,
      'a fresh start moves it',
    );
  });
});

test('stop-screens: a changed view with no changelog entry blocks, naming the file', () => {
  withRepo((dir) => {
    startSession(dir);
    write(dir, 'app/lib/features/shopper/views/search_view.dart', 'void search() {}\n');
    const r = hook(dir, 'stop-screens', SESSION);
    assert.equal(r.json.decision, 'block');
    assert.match(r.json.reason, /search_view\.dart/);
    assert.match(r.json.reason, /no changelog entry/);
  });
});

test('stop-screens: the work counts even when it was committed during the session', () => {
  withRepo((dir) => {
    startSession(dir);
    write(dir, 'app/lib/shared/widgets/chip.dart', 'void chip() {}\n');
    commitQuiet(dir);
    assert.equal(hook(dir, 'stop-screens', SESSION).json.decision, 'block');
  });
});

test('stop-screens (L130): stop_hook_active no longer releases the block', () => {
  withRepo((dir) => {
    startSession(dir);
    write(dir, 'app/lib/shared/components/card.dart', 'void card() {}');
    for (const active of [false, true]) {
      const r = hook(dir, 'stop-screens', { ...SESSION, stop_hook_active: active });
      assert.equal(r.status, 0);
      assert.equal(r.json.decision, 'block', `stop_hook_active=${active}`);
      assert.match(r.json.reason, /Changelog waived:/, 'the way out is named');
    }
  });
});

test('stop-screens: a non-changelog string in app_en.arb is a screen change; a changelog bullet is not', () => {
  withRepo((dir) => {
    startSession(dir);
    const arb = JSON.parse(read(dir, 'app/lib/l10n/app_en.arb'));
    arb.searchHint = 'Search for a store';
    write(dir, 'app/lib/l10n/app_en.arb', `${JSON.stringify(arb, null, 2)}\n`);
    const blocked = hook(dir, 'stop-screens', SESSION);
    assert.equal(blocked.json.decision, 'block');
    assert.match(blocked.json.reason, /app_en\.arb \(searchHint\)/);

    arb.changelogMobile_e002_a = 'You can now search for a store.';
    write(dir, 'app/lib/l10n/app_en.arb', `${JSON.stringify(arb, null, 2)}\n`);
    assert.equal(hook(dir, 'stop-screens', SESSION).out, '', 'the changelog bullet is the entry');
  });
});

test('stop-screens: a new changelog.dart entry satisfies it, but the version/date stamp alone does not', () => {
  withRepo((dir) => {
    startSession(dir);
    write(dir, 'app/lib/features/shopper/views/page.dart', 'void page() {}\n');
    const src = read(dir, 'app/lib/core/config/changelog.dart');
    write(
      dir,
      'app/lib/core/config/changelog.dart',
      src.replace(
        "version: '0.1.0',\n    date: '2026-10-07'",
        "version: '0.1.1',\n    date: '2026-10-09'",
      ),
    );
    assert.equal(
      hook(dir, 'stop-screens', SESSION).json.decision,
      'block',
      'a stamp is not an entry',
    );

    write(
      dir,
      'app/lib/core/config/changelog.dart',
      src.replace(
        'const List<ChangelogEntry> mobileChangelog = [',
        "const List<ChangelogEntry> mobileChangelog = [\n  ChangelogEntry(number: 2, version: '0.1.1', date: '2026-10-09', bullets: _mobileE001),",
      ),
    );
    assert.equal(hook(dir, 'stop-screens', SESSION).out, '');
  });
});

test('stop-screens: changes that are not screens (API, tests, docs) are left alone', () => {
  withRepo((dir) => {
    startSession(dir);
    write(dir, 'functions/src/more.js', "'use strict';\n");
    write(dir, 'app/lib/core/network/x.dart', 'void x() {}\n');
    write(dir, 'docs/x.md', 'x\n');
    assert.equal(hook(dir, 'stop-screens', SESSION).out, '');
  });
});

// ---- PostToolUse: schema-to-form drift after a Dart edit -------------------------------------------------

const EDIT = (file) => ({
  hook_event_name: 'PostToolUse',
  tool_name: 'Edit',
  tool_input: { file_path: file },
});

test('post-edit-drift: a Dart edit that leaves a bad FieldSpec exits 2 with the violation on stderr', () => {
  withRepo((dir) => {
    const file = 'app/lib/features/shopper/specs.dart';
    write(
      dir,
      file,
      "final s = FieldSpec(table: 'Venue', name: 'Name', kind: ColKind.text, required: true, maxLength: 99);\n",
    );
    const r = hook(dir, 'post-edit-drift', EDIT(path.join(dir, file)));
    assert.equal(r.status, 2);
    assert.match(
      r.err,
      /specs\.dart:1: schema-forms: Venue\.Name is VARCHAR\(120\): maxLength must be 120/,
    );
  });
});

test('post-edit-drift: a good FieldSpec, a non-Dart edit and an empty event all exit 0 quietly', () => {
  withRepo((dir) => {
    const file = 'app/lib/features/shopper/specs.dart';
    write(
      dir,
      file,
      "final s = FieldSpec(table: 'Venue', name: 'Name', kind: ColKind.text, required: true, maxLength: 120);\n",
    );
    assert.deepEqual([hook(dir, 'post-edit-drift', EDIT(path.join(dir, file))).status], [0]);
    write(
      dir,
      'app/lib/features/shopper/bad.dart',
      "final s = FieldSpec(table: 'Ghost', name: 'x', kind: ColKind.text);\n",
    );
    assert.equal(
      hook(dir, 'post-edit-drift', EDIT('C:\\x\\notes.md')).status,
      0,
      'only .dart files trigger it',
    );
    assert.equal(hook(dir, 'post-edit-drift', {}).status, 0);
  });
});

// ---- settings.json -------------------------------------------------------------------------------------

test('settings.json: valid JSON, the three hooks wired as ruled, Stop for the main session only', () => {
  const file = path.join(REAL, '.claude', 'settings.json');
  const settings = JSON.parse(fs.readFileSync(file, 'utf8'));
  const commands = (event) =>
    (settings.hooks[event] ?? []).flatMap((g) => g.hooks.map((h) => h.command));
  assert.deepEqual(Object.keys(settings.hooks).sort(), ['PostToolUse', 'SessionStart', 'Stop']);
  assert.equal(
    settings.hooks.SubagentStop,
    undefined,
    'L129 (c): coders hand back to the main session',
  );
  assert.equal(commands('Stop').length, 2);
  assert.match(commands('Stop')[0], /stop-verify\.js/);
  assert.match(commands('Stop')[1], /stop-screens\.js/);
  assert.match(commands('SessionStart')[0], /session-baseline\.js/);
  assert.equal(settings.hooks.PostToolUse[0].matcher, 'Edit|Write|MultiEdit');
  assert.match(commands('PostToolUse')[0], /post-edit-drift\.js/);
  for (const c of Object.keys(settings.hooks).flatMap(commands)) {
    assert.match(c, /^node "\$CLAUDE_PROJECT_DIR"\/\.claude\/hooks\/[\w-]+\.js$/);
    assert.ok(fs.existsSync(path.join(REAL, c.split('/.claude/')[1].replace(/^/, '.claude/'))), c);
  }
});
