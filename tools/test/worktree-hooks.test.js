// plan/PH1-worktrees.md 1.1, point 8: the Claude Code hooks follow the edited copy. The hook scripts load from
// the main folder ($CLAUDE_PROJECT_DIR stays at the session-start root), so every test runs the scripts of one
// scratch repository ("main") on a second working tree of it ("the copy", made with `git worktree add`): the
// edit hooks take their root from the edited file's own repository, the Stop and SessionStart hooks from the
// event's cwd, and with neither they fall back to the repository the scripts are in.
'use strict';

const test = require('./timeout');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { scratchRepo, git, write, remove, REAL } = require('./scratch');
const { SCHEMA } = require('../lint/test/helper');

const BAD_SPEC =
  "final s = FieldSpec(table: 'Venue', name: 'Name', kind: ColKind.text, required: true, maxLength: 99);\n";
const GOOD_SPEC =
  "final s = FieldSpec(table: 'Venue', name: 'Name', kind: ColKind.text, required: true, maxLength: 120);\n";
const SPEC_FILE = 'app/lib/features/shopper/specs.dart';

/** Runs a hook script of `scriptsIn` (a scratch repo) in `cwd`, with `event` on stdin. */
function hook(scriptsIn, name, event, cwd = scriptsIn) {
  const r = spawnSync(process.execPath, [path.join(scriptsIn, '.claude', 'hooks', `${name}.js`)], {
    cwd,
    encoding: 'utf8',
    input: JSON.stringify(event),
  });
  return {
    status: r.status,
    err: r.stderr.trim(),
    json: r.stdout.trim() ? JSON.parse(r.stdout) : null,
  };
}

/** A main scratch repo and a working copy of it (a second worktree, own branch). */
function withCopy(fn) {
  const main = scratchRepo({
    'db/schema.sql': SCHEMA,
    'functions/src/app.js': "'use strict';\n",
  });
  const copy = `${main}-copy`;
  const added = git(main, ['worktree', 'add', '-q', '-b', 'wt/test', copy]);
  if (added.status !== 0) throw new Error(`worktree add failed: ${added.all}`);
  try {
    return fn(main, copy);
  } finally {
    remove(copy);
    remove(main);
  }
}

const EDIT = (file, extra = {}) => ({
  hook_event_name: 'PostToolUse',
  tool_name: 'Edit',
  tool_input: { file_path: file },
  ...extra,
});

function recordVerify(dir, { result = 'green' } = {}) {
  const { fingerprint, writeState } = require(path.join(dir, 'tools', 'fingerprint.js'));
  writeState(
    {
      fingerprint: fingerprint(dir),
      result,
      partial: false,
      failed: [],
      checks: [],
      totalChecks: 15,
      finishedAt: new Date().toISOString(),
    },
    dir,
  );
}

// ---- the root a hook uses ----------------------------------------------------------------------------------

test("hookRoot: the edited file's own repository, else the event cwd's, else the scripts' repository", () => {
  const { hookRoot, ROOT } = require('../../.claude/hooks/lib');
  const real = (p) => fs.realpathSync.native(p);
  withCopy((main, copy) => {
    write(copy, 'app/lib/features/new/a.dart', 'x\n');
    // an edit inside the copy resolves to the copy, from the file's path
    assert.equal(real(hookRoot(EDIT(path.join(copy, 'app/lib/features/new/a.dart')))), real(copy));
    // a file whose folder does not exist yet resolves through its nearest existing folder
    assert.equal(
      real(hookRoot(EDIT(path.join(copy, 'app/lib/features/later/deep/b.dart')))),
      real(copy),
    );
    // the file wins over cwd
    assert.equal(real(hookRoot(EDIT(path.join(copy, 'tools/x.js'), { cwd: main }))), real(copy));
    // a relative file path is read against the event's cwd
    assert.equal(real(hookRoot(EDIT('app/lib/a.dart', { cwd: copy }))), real(copy));
    // no file: the event's cwd, also when it is a folder inside the copy (Claude can cd)
    assert.equal(real(hookRoot({ hook_event_name: 'Stop', cwd: copy })), real(copy));
    assert.equal(
      real(hookRoot({ hook_event_name: 'Stop', cwd: path.join(copy, 'app') })),
      real(copy),
    );
  });
  // nothing usable: the repository the scripts are in
  assert.equal(hookRoot({}), ROOT);
  assert.equal(hookRoot(EDIT('')), ROOT);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'gabay-nogit-'));
  try {
    assert.equal(
      hookRoot(EDIT(path.join(outside, 'a.dart'))),
      ROOT,
      'a file outside any repository',
    );
    assert.equal(hookRoot({ cwd: outside }), ROOT, 'a cwd outside any repository');
    assert.equal(hookRoot({ cwd: path.join(outside, 'gone') }), ROOT, 'a cwd that does not exist');
  } finally {
    remove(outside);
  }
  assert.equal(real(hookRoot(EDIT(path.join(REAL, 'tools', 'verify.js')))), real(REAL));
});

// ---- post-edit-drift ----------------------------------------------------------------------------------------

test('post-edit-drift: an edit inside the copy is checked in the copy, though the hook runs from the main folder', () => {
  withCopy((main, copy) => {
    write(main, SPEC_FILE, GOOD_SPEC); // the main folder is clean
    write(copy, SPEC_FILE, BAD_SPEC); // the copy has the drift
    const r = hook(main, 'post-edit-drift', EDIT(path.join(copy, SPEC_FILE)));
    assert.equal(r.status, 2, 'the drift in the copy is found');
    assert.match(r.err, /specs\.dart:1: schema-forms: Venue\.Name is VARCHAR\(120\)/);
  });
});

test('post-edit-drift: drift left in the main folder does not fail an edit that is clean in the copy', () => {
  withCopy((main, copy) => {
    write(main, SPEC_FILE, BAD_SPEC);
    write(copy, SPEC_FILE, GOOD_SPEC);
    assert.equal(hook(main, 'post-edit-drift', EDIT(path.join(copy, SPEC_FILE))).status, 0);
    // the same file path edited in the main folder still fails there: nothing changed for the main session
    assert.equal(hook(main, 'post-edit-drift', EDIT(path.join(main, SPEC_FILE))).status, 2);
  });
});

test('post-edit-drift: a relative file path is read against the event cwd (the copy)', () => {
  withCopy((main, copy) => {
    write(copy, SPEC_FILE, BAD_SPEC);
    const r = hook(main, 'post-edit-drift', EDIT(SPEC_FILE, { cwd: copy }));
    assert.equal(r.status, 2);
  });
});

// ---- Stop hooks: the main folder ALWAYS, and the event's working copy as well (owner ruling I-4) -----------------
// A Stop hook never checks only the copy: the main session's own edits in the main folder are verified even when
// its shell stands in a copy, and a copy's stale verify is reported on top. Messages name the folder only when two
// are checked.

const STOP = (cwd, extra = {}) => ({ hook_event_name: 'Stop', session_id: 's1', cwd, ...extra });
const UNVERIFIED = /has not been run/;

test('stop-verify: both green (the main folder and the copy the shell is in) lets the session stop, silently', () => {
  withCopy((main, copy) => {
    recordVerify(main);
    recordVerify(copy);
    const r = hook(main, 'stop-verify', STOP(copy));
    assert.equal(r.status, 0);
    assert.equal(r.json, null);
  });
});

test('stop-verify: a copy that verified green does not excuse an unverified main folder (no fail-open)', () => {
  withCopy((main, copy) => {
    recordVerify(copy); // the main folder has no record at all
    const r = hook(main, 'stop-verify', STOP(copy));
    assert.equal(r.json.decision, 'block');
    assert.match(r.json.reason, UNVERIFIED);
    assert.match(r.json.reason, /main folder/);
    assert.doesNotMatch(r.json.reason, /working copy/);
  });
});

test('stop-verify: main edits after its green run still block when the shell is in a copy', () => {
  withCopy((main, copy) => {
    recordVerify(main);
    recordVerify(copy);
    write(main, 'functions/src/app.js', "'use strict';\n// edited in the main folder\n");
    const r = hook(main, 'stop-verify', STOP(copy));
    assert.equal(r.json.decision, 'block');
    assert.match(r.json.reason, /Code changed since the last npm run verify/);
    assert.match(r.json.reason, /main folder/);
  });
});

test("stop-verify: the copy's stale or missing verify is also reported, naming the copy", () => {
  withCopy((main, copy) => {
    recordVerify(main);
    const none = hook(main, 'stop-verify', STOP(copy));
    assert.equal(none.json.decision, 'block');
    assert.match(none.json.reason, UNVERIFIED);
    assert.ok(
      none.json.reason.includes(copy) || none.json.reason.includes(copy.replace(/\\/g, '/')),
    );
    assert.doesNotMatch(none.json.reason, /main folder/, 'the main folder is fine');

    recordVerify(copy);
    write(copy, 'functions/src/app.js', "'use strict';\n// edited in the copy\n");
    const stale = hook(main, 'stop-verify', STOP(copy));
    assert.equal(stale.json.decision, 'block');
    assert.match(stale.json.reason, /Code changed since the last npm run verify/);
    assert.match(stale.json.reason, /working copy/);
  });
});

test('stop-verify: both unverified give one block that names both', () => {
  withCopy((main, copy) => {
    const r = hook(main, 'stop-verify', STOP(copy));
    assert.equal(r.json.decision, 'block');
    assert.match(r.json.reason, /main folder/);
    assert.match(r.json.reason, /working copy/);
  });
});

test("stop-verify: a failed run in the copy is noticed (with the copy's logs); the main folder's green run adds nothing", () => {
  withCopy((main, copy) => {
    recordVerify(main);
    recordVerify(copy, { result: 'red' });
    const state = path.join(copy, '.verify', 'last-run.json');
    const parsed = JSON.parse(fs.readFileSync(state, 'utf8'));
    parsed.failed = ['api-tests'];
    fs.writeFileSync(state, JSON.stringify(parsed));
    write(copy, '.verify/logs/api-tests.log', 'boom\n');
    const r = hook(main, 'stop-verify', STOP(copy));
    assert.equal(r.json.decision, undefined, 'a failed run lets the session stop');
    assert.match(
      r.json.systemMessage,
      /working copy.*verify FAILED on the current code.*api-tests.*\.verify\/logs\//,
    );
  });
});

test('stop-verify: a shell in an unrelated repository, or in the main folder, checks only the main folder, with the old messages', () => {
  withCopy((main) => {
    const other = scratchRepo({ 'functions/src/app.js': "'use strict';\n" });
    try {
      for (const cwd of [other, path.join(main, 'app'), main, undefined]) {
        fs.mkdirSync(path.join(main, 'app'), { recursive: true });
        const r = hook(main, 'stop-verify', STOP(cwd));
        assert.equal(r.json.decision, 'block');
        assert.match(r.json.reason, /^npm run verify has not been run on this code/);
      }
      recordVerify(main);
      assert.equal(hook(main, 'stop-verify', STOP(other)).json, null);
    } finally {
      remove(other);
    }
  });
});

test('stop-screens: screens changed in the main folder block even when the shell is in a clean copy (no fail-open)', () => {
  withCopy((main, copy) => {
    write(main, 'app/lib/features/shopper/home_view.dart', '// a view\n');
    const r = hook(main, 'stop-screens', STOP(copy));
    assert.equal(r.json.decision, 'block');
    assert.match(r.json.reason, /home_view\.dart/);
  });
});

test('stop-screens: screens changed in the copy block too, naming the copy; a clean main folder and copy do not', () => {
  withCopy((main, copy) => {
    assert.equal(hook(main, 'stop-screens', STOP(copy)).json, null, 'nothing changed anywhere');
    write(copy, 'app/lib/features/shopper/copy_view.dart', '// a view\n');
    const r = hook(main, 'stop-screens', STOP(copy));
    assert.equal(r.json.decision, 'block');
    assert.match(r.json.reason, /copy_view\.dart/);
    assert.match(r.json.reason, /working copy/);
    assert.equal(
      hook(main, 'stop-screens', STOP(undefined)).json,
      null,
      'no cwd: the main folder only',
    );
  });
});

test('stop-screens: one "Changelog waived" line covers the screens of both folders', () => {
  withCopy((main, copy) => {
    write(main, 'app/lib/features/shopper/a_view.dart', '// a\n');
    write(copy, 'app/lib/features/shopper/b_view.dart', '// b\n');
    const r = hook(
      main,
      'stop-screens',
      STOP(copy, { last_assistant_message: 'Changelog waived: wording not changed' }),
    );
    assert.match(r.json.systemMessage, /a_view\.dart/);
    assert.match(r.json.systemMessage, /b_view\.dart/);
  });
});

test("session-baseline and stop-screens: a copy has its own baseline; the main folder's is never used for it", () => {
  withCopy((main, copy) => {
    // A screen change committed in the copy BEFORE the session started: it is not this session's work.
    write(copy, 'app/lib/features/shopper/earlier_view.dart', '// earlier\n');
    git(copy, ['add', '-A']);
    git(copy, ['-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'earlier, in the copy']);
    const copyHead = git(copy, ['rev-parse', 'HEAD']).out.trim();
    const mainHead = git(main, ['rev-parse', 'HEAD']).out.trim();
    assert.notEqual(copyHead, mainHead);

    const start = hook(main, 'session-baseline', {
      ...STOP(copy),
      session_id: 'abc',
      source: 'startup',
    });
    assert.equal(start.status, 0);
    const mainBaseline = JSON.parse(
      fs.readFileSync(path.join(main, '.verify', 'session-abc.json'), 'utf8'),
    );
    assert.equal(
      mainBaseline.head,
      mainHead,
      "the main folder's baseline stays the main folder's HEAD",
    );

    const stop = (extra) =>
      hook(main, 'stop-screens', { ...STOP(copy), session_id: 'abc', ...extra });
    assert.equal(
      stop().json,
      null,
      "measured from the copy's own baseline, the earlier commit is not counted",
    );

    // The same session then changes a screen in the copy and commits it: counted.
    write(copy, 'app/lib/features/shopper/later_view.dart', '// later\n');
    git(copy, ['add', '-A']);
    git(copy, ['-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'later, in the copy']);
    const r = stop();
    assert.equal(r.json.decision, 'block');
    assert.match(r.json.reason, /later_view\.dart/);
    assert.doesNotMatch(r.json.reason, /earlier_view\.dart/);
  });
});

test('session-baseline: with no copy, only the main folder baseline is written, as before', () => {
  withCopy((main) => {
    const r = hook(main, 'session-baseline', {
      hook_event_name: 'SessionStart',
      session_id: 'solo',
      source: 'startup',
      cwd: main,
    });
    assert.equal(r.status, 0);
    const files = fs
      .readdirSync(path.join(main, '.verify'))
      .filter((f) => f.startsWith('session-solo'));
    assert.deepEqual(files, ['session-solo.json']);
  });
});
