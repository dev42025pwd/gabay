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

// ---- stop-verify --------------------------------------------------------------------------------------------

test("stop-verify: the copy's own verify record counts when the event cwd is the copy; the main folder's has none", () => {
  withCopy((main, copy) => {
    recordVerify(copy);
    const inCopy = hook(main, 'stop-verify', { hook_event_name: 'Stop', cwd: copy });
    assert.equal(inCopy.status, 0);
    assert.equal(inCopy.json, null, "green on the copy's code: allowed silently");
    const noCwd = hook(main, 'stop-verify', { hook_event_name: 'Stop' });
    assert.equal(
      noCwd.json.decision,
      'block',
      'with no cwd it falls back to the main folder, which has no record',
    );
    assert.match(noCwd.json.reason, /has not been run/);
  });
});

test('stop-verify: an edit in the copy after its green run blocks with the stale-code reason', () => {
  withCopy((main, copy) => {
    recordVerify(copy);
    write(copy, 'functions/src/app.js', "'use strict';\n// edited in the copy\n");
    const r = hook(main, 'stop-verify', { hook_event_name: 'Stop', cwd: copy });
    assert.equal(r.json.decision, 'block');
    assert.match(r.json.reason, /Code changed since the last npm run verify/);
  });
});

test("stop-verify: a failed run in the copy says so, and points at the copy's own logs", () => {
  withCopy((main, copy) => {
    recordVerify(copy, { result: 'red' });
    const state = path.join(copy, '.verify', 'last-run.json');
    const parsed = JSON.parse(fs.readFileSync(state, 'utf8'));
    parsed.failed = ['api-tests'];
    fs.writeFileSync(state, JSON.stringify(parsed));
    write(copy, '.verify/logs/api-tests.log', 'boom\n');
    const r = hook(main, 'stop-verify', { hook_event_name: 'Stop', cwd: copy });
    assert.match(
      r.json.systemMessage,
      /verify FAILED on the current code.*api-tests.*\.verify\/logs\//,
    );
  });
});

// ---- stop-screens and session-baseline -----------------------------------------------------------------------

test('stop-screens: a screen changed in the copy blocks when the event cwd is the copy; the clean main folder does not', () => {
  withCopy((main, copy) => {
    write(copy, 'app/lib/features/shopper/home_view.dart', '// a view\n');
    const inCopy = hook(main, 'stop-screens', {
      hook_event_name: 'Stop',
      session_id: 's1',
      cwd: copy,
    });
    assert.equal(inCopy.json.decision, 'block');
    assert.match(inCopy.json.reason, /home_view\.dart/);
    const inMain = hook(main, 'stop-screens', {
      hook_event_name: 'Stop',
      session_id: 's1',
      cwd: main,
    });
    assert.equal(inMain.json, null, 'nothing changed in the main folder');
    const noCwd = hook(main, 'stop-screens', { hook_event_name: 'Stop', session_id: 's1' });
    assert.equal(noCwd.json, null, 'with no cwd it looks at the main folder, as before');
  });
});

test('session-baseline: records the HEAD of the repository the session started in (the event cwd)', () => {
  withCopy((main, copy) => {
    write(copy, 'docs/a.md', 'a\n');
    git(copy, ['add', '-A']);
    git(copy, ['-c', 'core.hooksPath=/dev/null', 'commit', '-q', '-m', 'in the copy']);
    const copyHead = git(copy, ['rev-parse', 'HEAD']).out.trim();
    const mainHead = git(main, ['rev-parse', 'HEAD']).out.trim();
    assert.notEqual(copyHead, mainHead);
    const r = hook(main, 'session-baseline', {
      hook_event_name: 'SessionStart',
      session_id: 'abc',
      source: 'startup',
      cwd: copy,
    });
    assert.equal(r.status, 0);
    const baseline = JSON.parse(
      fs.readFileSync(path.join(main, '.verify', 'session-abc.json'), 'utf8'),
    );
    assert.equal(baseline.head, copyHead);
  });
});
