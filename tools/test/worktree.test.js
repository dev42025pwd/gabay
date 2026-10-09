// plan/PH1-worktrees.md 1.1: `npm run worktree:new` and `npm run worktree:remove`, driven with a fake git, a
// fake database and a fake command runner (no repository, no PostgreSQL, no npm install is touched), plus the
// .env writer, the names and the arguments. One test shows the lock's "held by" line for a working copy.
'use strict';

const test = require('./timeout');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { AGENT_NAMES, databaseName, defaultBranch } = require('../lib/worktree-names');
const { withDatabase } = require('../lib/worktree-env');
const { createWorkingCopy, removeWorkingCopy } = require('../lib/worktree-copy');
const { parseNewArgs, parseRemoveArgs } = require('../lib/worktree-args');
const { createDatabaseTools } = require('../lib/worktree-db');
const { acquireLock } = require('../lib/verify-lock');

// Distinctive values, so a leak of any one of them into the output is found by a plain search.
const ENV_TEXT = [
  '# Gabay .env (test)',
  'PGHOST=host-7e2b.example',
  'PGPORT=15432',
  'PGDATABASE=gabay_dev',
  'PGUSER=user-4c1d',
  'PGPASSWORD=pw-9f3a1-secret',
  '',
  'SEED_PW_SUPERADMIN=seed-pw-5b8e',
  'CORS_ORIGINS=http://origin-3d4f.example:5000',
  '',
].join('\n');
const ENV_VALUES = [
  'host-7e2b.example',
  '15432',
  'user-4c1d',
  'pw-9f3a1-secret',
  'seed-pw-5b8e',
  'origin-3d4f.example',
];

/** A main folder and a working-copies folder in the temp area; `internal` puts the penthouse file in the main folder. */
function sandbox({ internal = false } = {}) {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'gabay-wt-test-'));
  const mainRoot = path.join(top, 'Gabay');
  const base = path.join(top, 'Gabay-wt');
  fs.mkdirSync(mainRoot, { recursive: true });
  fs.writeFileSync(path.join(mainRoot, '.env'), ENV_TEXT);
  if (internal) {
    const dir = path.join(mainRoot, 'db', 'seeds', 'sources', 'internal');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'penthouse.json'), '{"penthouse":true}\n');
  }
  return { top, mainRoot, base, done: () => fs.rmSync(top, { recursive: true, force: true }) };
}

/** A git that records every call and answers the few commands the tool uses. */
function fakeGit({ localBranches = [], remoteBranches = [], dirty = '', registered = [] } = {}) {
  const calls = [];
  const known = new Set(registered);
  const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
  const git = async (args, { cwd } = {}) => {
    calls.push({ args, cwd });
    const [cmd, sub] = args;
    if (cmd === 'fetch') return ok();
    if (cmd === 'show-ref') {
      const ref = args[args.length - 1];
      const found =
        localBranches.some((b) => ref === `refs/heads/${b}`) ||
        remoteBranches.some((b) => ref === `refs/remotes/origin/${b}`);
      return { status: found ? 0 : 1, stdout: '', stderr: '' };
    }
    if (cmd === 'worktree' && sub === 'add') {
      const dir = args.find((a) => path.isAbsolute(a));
      fs.mkdirSync(dir, { recursive: true });
      known.add(dir);
      return ok();
    }
    if (cmd === 'worktree' && sub === 'list') {
      return ok([...known].map((d) => `worktree ${d}\nHEAD abc\nbranch refs/heads/x\n`).join('\n'));
    }
    if (cmd === 'status') return ok(dirty);
    if (cmd === 'worktree' && sub === 'remove') {
      const dir = args.find((a) => path.isAbsolute(a));
      fs.rmSync(dir, { recursive: true, force: true });
      known.delete(dir);
      return ok();
    }
    return { status: 1, stdout: '', stderr: `fake git: unexpected ${args.join(' ')}` };
  };
  return { git, calls };
}

function fakeDb(existing = []) {
  const names = new Set(existing);
  const events = [];
  return {
    names,
    events,
    async ensure(name) {
      events.push(`ensure ${name}`);
      const created = !names.has(name);
      names.add(name);
      return created;
    },
    async drop(name) {
      events.push(`drop ${name}`);
      return names.delete(name);
    },
  };
}

/** Records every command and the lock events around them; a command named in `fail` exits with that code. */
function fakeRunner(fail = {}) {
  const runs = [];
  const events = [];
  return {
    runs,
    events,
    run: async (commandLine, { cwd, env } = {}) => {
      runs.push({ commandLine, cwd, env });
      events.push(commandLine);
      return fail[commandLine] ?? 0;
    },
    withLock: async ({ owner }, fn) => {
      events.push(`lock ${owner}`);
      try {
        return await fn();
      } finally {
        events.push('unlock');
      }
    },
  };
}

function setup(box, options = {}) {
  const g = fakeGit(options.git);
  const db = fakeDb(options.existingDbs);
  const runner = fakeRunner(options.fail);
  const lines = [];
  const deps = {
    git: g.git,
    db,
    run: runner.run,
    withLock: runner.withLock,
    log: (line) => lines.push(line),
  };
  const opts = { mainRoot: box.mainRoot, base: box.base, today: '2026-10-09' };
  return { g, db, runner, lines, deps, opts };
}

// ---- names and arguments ---------------------------------------------------------------------------------

test('the allowed names are the five agents, and a database name turns hyphens into underscores (WT-3)', () => {
  assert.deepEqual([...AGENT_NAMES].sort(), [
    'api-coder',
    'engine-coder',
    'flutter-coder',
    'native-ble',
    'test-verifier',
  ]);
  assert.equal(databaseName('api-coder'), 'gabay_wt_api_coder');
  assert.equal(databaseName('native-ble'), 'gabay_wt_native_ble');
  assert.equal(defaultBranch('api-coder', '2026-10-09'), 'wt/api-coder/2026-10-09');
});

test('arguments: new takes <name> [<branch>], remove takes <name> [--force]; anything else is an error', () => {
  assert.deepEqual(parseNewArgs(['api-coder']), { name: 'api-coder', branch: null });
  assert.deepEqual(parseNewArgs(['api-coder', 'feature/x']), {
    name: 'api-coder',
    branch: 'feature/x',
  });
  assert.throws(() => parseNewArgs([]), /needs a name/);
  assert.throws(() => parseNewArgs(['api-coder', 'a', 'b']), /too many/i);
  assert.throws(() => parseNewArgs(['api-coder', '--force']), /Unknown option/);
  assert.throws(() => parseNewArgs(['api-coder', '-x']), /Unknown option|not a valid branch/);
  assert.deepEqual(parseRemoveArgs(['api-coder']), { name: 'api-coder', force: false });
  assert.deepEqual(parseRemoveArgs(['api-coder', '--force']), { name: 'api-coder', force: true });
  assert.deepEqual(parseRemoveArgs(['--force', 'api-coder']), { name: 'api-coder', force: true });
  assert.throws(() => parseRemoveArgs([]), /needs a name/);
  assert.throws(() => parseRemoveArgs(['api-coder', '--hard']), /Unknown option/);
});

// ---- the .env writer -------------------------------------------------------------------------------------

test('the .env writer changes only the PGDATABASE value and keeps every other byte', () => {
  const out = withDatabase(ENV_TEXT, 'gabay_wt_api_coder');
  assert.equal(out, ENV_TEXT.replace('PGDATABASE=gabay_dev', 'PGDATABASE=gabay_wt_api_coder'));
  const before = ENV_TEXT.split('\n');
  const after = out.split('\n');
  assert.equal(after.length, before.length);
  const changed = after.filter((line, i) => line !== before[i]);
  assert.deepEqual(changed, ['PGDATABASE=gabay_wt_api_coder']);
});

test('the .env writer keeps CRLF line ends, spacing, a quoted value, comments and a missing final newline', () => {
  const text =
    '# PGDATABASE=commented\r\nPGHOST=h\r\n  export PGDATABASE = "gabay_dev"  \r\n\r\nX=1';
  assert.equal(
    withDatabase(text, 'gabay_wt_x'),
    '# PGDATABASE=commented\r\nPGHOST=h\r\n  export PGDATABASE = gabay_wt_x  \r\n\r\nX=1',
  );
});

test('the .env writer refuses a main .env that has no PGDATABASE line', () => {
  assert.throws(() => withDatabase('PGHOST=h\n', 'gabay_wt_x'), /no PGDATABASE/);
});

// ---- worktree:new ----------------------------------------------------------------------------------------

test('new: fetches first, adds the worktree on wt/<name>/<date> from origin/main, writes .env, creates the database', async () => {
  const box = sandbox();
  try {
    const t = setup(box);
    const result = await createWorkingCopy({ ...t.opts, name: 'api-coder' }, t.deps);
    const dir = path.join(box.base, 'api-coder');
    assert.equal(result.dir, dir);
    assert.equal(result.branch, 'wt/api-coder/2026-10-09');
    const gitArgs = t.g.calls.map((c) => c.args.join(' '));
    assert.equal(gitArgs[0], 'fetch origin');
    assert.ok(
      gitArgs.includes(`worktree add -b wt/api-coder/2026-10-09 ${dir} origin/main`),
      gitArgs.join('\n'),
    );
    assert.ok(
      gitArgs.indexOf('fetch origin') < gitArgs.findIndex((a) => a.startsWith('worktree add')),
    );
    assert.equal(
      fs.readFileSync(path.join(dir, '.env'), 'utf8'),
      ENV_TEXT.replace('PGDATABASE=gabay_dev', 'PGDATABASE=gabay_wt_api_coder'),
    );
    assert.deepEqual(t.db.events, ['ensure gabay_wt_api_coder']);
    assert.ok(t.db.names.has('gabay_wt_api_coder'));
  } finally {
    box.done();
  }
});

test('new: a database that already exists is not an error and is not created again', async () => {
  const box = sandbox();
  try {
    const t = setup(box, { existingDbs: ['gabay_wt_api_coder'] });
    await createWorkingCopy({ ...t.opts, name: 'api-coder' }, t.deps);
    assert.equal(t.db.names.size, 1);
    assert.ok(
      t.lines.some((l) => /gabay_wt_api_coder already exists/.test(l)),
      t.lines.join('\n'),
    );
    // a second copy of the same name, after the first was removed, runs the same way
    fs.rmSync(path.join(box.base, 'api-coder'), { recursive: true, force: true });
    const again = setup(box, { existingDbs: ['gabay_wt_api_coder'] });
    await createWorkingCopy({ ...again.opts, name: 'api-coder' }, again.deps);
    assert.deepEqual(again.db.events, ['ensure gabay_wt_api_coder']);
  } finally {
    box.done();
  }
});

test('new: a branch that exists is checked out as it is; one that does not is made from origin/main; a remote-only one is tracked', async () => {
  const box = sandbox();
  try {
    const dir = path.join(box.base, 'api-coder');
    const local = setup(box, { git: { localBranches: ['feature/x'] } });
    await createWorkingCopy({ ...local.opts, name: 'api-coder', branch: 'feature/x' }, local.deps);
    assert.ok(local.g.calls.some((c) => c.args.join(' ') === `worktree add ${dir} feature/x`));
    fs.rmSync(dir, { recursive: true, force: true });

    const fresh = setup(box);
    await createWorkingCopy({ ...fresh.opts, name: 'api-coder', branch: 'feature/y' }, fresh.deps);
    assert.ok(
      fresh.g.calls.some(
        (c) => c.args.join(' ') === `worktree add -b feature/y ${dir} origin/main`,
      ),
    );
    fs.rmSync(dir, { recursive: true, force: true });

    const remote = setup(box, { git: { remoteBranches: ['feature/z'] } });
    await createWorkingCopy(
      { ...remote.opts, name: 'api-coder', branch: 'feature/z' },
      remote.deps,
    );
    assert.ok(
      remote.g.calls.some(
        (c) => c.args.join(' ') === `worktree add --track -b feature/z ${dir} origin/feature/z`,
      ),
    );
  } finally {
    box.done();
  }
});

test('new: an unknown agent name is refused before anything runs', async () => {
  const box = sandbox();
  try {
    for (const bad of ['someone', 'API-CODER', '..', '../Gabay', 'api-coder/x', '', 'api_coder']) {
      const t = setup(box);
      await assert.rejects(
        createWorkingCopy({ ...t.opts, name: bad }, t.deps),
        /Unknown agent name/,
        JSON.stringify(bad),
      );
      assert.equal(t.g.calls.length, 0, 'no git call');
      assert.equal(t.db.events.length, 0, 'no database call');
      assert.equal(t.runner.runs.length, 0, 'no command');
    }
    assert.equal(fs.existsSync(box.base), false);
  } finally {
    box.done();
  }
});

test('new: a branch name that could be read as an option is refused', async () => {
  const box = sandbox();
  try {
    for (const bad of ['--upload-pack=x', '-b', 'a b', 'a;b', 'x..y']) {
      const t = setup(box);
      await assert.rejects(
        createWorkingCopy({ ...t.opts, name: 'api-coder', branch: bad }, t.deps),
        /not a valid branch name/,
        bad,
      );
      assert.equal(t.g.calls.length, 0);
    }
  } finally {
    box.done();
  }
});

test('new: a working copy that is already there is refused', async () => {
  const box = sandbox();
  try {
    fs.mkdirSync(path.join(box.base, 'api-coder'), { recursive: true });
    const t = setup(box);
    await assert.rejects(
      createWorkingCopy({ ...t.opts, name: 'api-coder' }, t.deps),
      /already exists/,
    );
    assert.equal(t.db.events.length, 0);
  } finally {
    box.done();
  }
});

test('new: prints no .env value (neither the main one nor the copy)', async () => {
  const box = sandbox({ internal: true });
  try {
    const t = setup(box);
    await createWorkingCopy({ ...t.opts, name: 'api-coder' }, t.deps);
    const out = t.lines.join('\n');
    assert.ok(out.length > 0);
    for (const value of [...ENV_VALUES, 'gabay_dev']) {
      assert.equal(out.includes(value), false, `the output holds an .env value: ${value}`);
    }
    // the commands it starts carry no value on their command lines either
    for (const r of t.runner.runs) {
      for (const value of ENV_VALUES) assert.equal(r.commandLine.includes(value), false);
    }
  } finally {
    box.done();
  }
});

test('new: copies db/seeds/sources/internal/ file to file when the main folder has it, and says so; never adds or commits it', async () => {
  const box = sandbox({ internal: true });
  try {
    const t = setup(box);
    await createWorkingCopy({ ...t.opts, name: 'api-coder' }, t.deps);
    const copied = path.join(
      box.base,
      'api-coder',
      'db',
      'seeds',
      'sources',
      'internal',
      'penthouse.json',
    );
    assert.equal(fs.readFileSync(copied, 'utf8'), '{"penthouse":true}\n');
    assert.ok(t.lines.some((l) => /internal seed source/.test(l) && /never committed/.test(l)));
    for (const c of t.g.calls) {
      assert.ok(!['add', 'commit', 'push'].includes(c.args[0]), `git ${c.args.join(' ')}`);
    }
  } finally {
    box.done();
  }
});

test('new: without the internal seed source it carries on, with a note that the seed will skip the penthouse', async () => {
  const box = sandbox({ internal: false });
  try {
    const t = setup(box);
    await createWorkingCopy({ ...t.opts, name: 'api-coder' }, t.deps);
    assert.equal(fs.existsSync(path.join(box.base, 'api-coder', 'db', 'seeds', 'sources')), false);
    assert.ok(
      t.lines.some((l) => /no internal seed source/i.test(l)),
      t.lines.join('\n'),
    );
  } finally {
    box.done();
  }
});

test('new: installs the packages in the four folders, then runs setup-db for the copy inside the verify lock', async () => {
  const box = sandbox();
  try {
    const t = setup(box);
    await createWorkingCopy({ ...t.opts, name: 'api-coder' }, t.deps);
    const dir = path.join(box.base, 'api-coder');
    assert.deepEqual(
      t.runner.runs.map((r) => [r.commandLine, path.relative(dir, r.cwd).replace(/\\/g, '/')]),
      [
        ['npm ci', 'functions'],
        ['npm ci', 'db/tools'],
        ['npm ci', 'db/seeds'],
        ['flutter pub get', 'app'],
        ['npm run setup-db', ''],
      ],
    );
    assert.deepEqual(t.runner.events.slice(-3), [
      'lock worktree:new api-coder',
      'npm run setup-db',
      'unlock',
    ]);
    assert.equal(
      t.runner.runs.at(-1).env.PGDATABASE,
      'gabay_wt_api_coder',
      'a PGDATABASE in the shell cannot win',
    );
  } finally {
    box.done();
  }
});

test('new: a failing install or setup-db stops with a message naming the step; the copy stays', async () => {
  const box = sandbox();
  try {
    const bad = setup(box, { fail: { 'flutter pub get': 1 } });
    await assert.rejects(
      createWorkingCopy({ ...bad.opts, name: 'api-coder' }, bad.deps),
      /flutter pub get.*exit 1/,
    );
    assert.ok(fs.existsSync(path.join(box.base, 'api-coder')));
    assert.ok(!bad.runner.runs.some((r) => r.commandLine === 'npm run setup-db'));
    fs.rmSync(path.join(box.base, 'api-coder'), { recursive: true, force: true });

    const bad2 = setup(box, { fail: { 'npm run setup-db': 2 } });
    await assert.rejects(
      createWorkingCopy({ ...bad2.opts, name: 'api-coder' }, bad2.deps),
      /setup-db.*exit 2/,
    );
    assert.equal(bad2.runner.events.at(-1), 'unlock', 'the lock is released when setup-db fails');
  } finally {
    box.done();
  }
});

// ---- worktree:remove -------------------------------------------------------------------------------------

/** A registered, existing working copy for api-coder. */
function existingCopy(box) {
  const dir = path.join(box.base, 'api-coder');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

test('remove: refuses a working copy with uncommitted changes, removes nothing and drops nothing', async () => {
  const box = sandbox();
  try {
    const dir = existingCopy(box);
    const t = setup(box, {
      git: { dirty: ' M functions/src/app.js\n?? notes.txt\n', registered: [dir] },
      existingDbs: ['gabay_wt_api_coder'],
    });
    await assert.rejects(
      removeWorkingCopy({ ...t.opts, name: 'api-coder', force: false }, t.deps),
      /uncommitted change\(s\).*--force/s,
    );
    assert.ok(fs.existsSync(dir));
    assert.ok(t.db.names.has('gabay_wt_api_coder'));
    assert.deepEqual(t.db.events, []);
    assert.ok(!t.g.calls.some((c) => c.args[1] === 'remove'));
  } finally {
    box.done();
  }
});

test('remove: a clean copy is removed without --force and its database is dropped', async () => {
  const box = sandbox();
  try {
    const dir = existingCopy(box);
    const t = setup(box, {
      git: { dirty: '', registered: [dir] },
      existingDbs: ['gabay_wt_api_coder'],
    });
    await removeWorkingCopy({ ...t.opts, name: 'api-coder', force: false }, t.deps);
    const removeCall = t.g.calls.find((c) => c.args[0] === 'worktree' && c.args[1] === 'remove');
    assert.deepEqual(removeCall.args, ['worktree', 'remove', dir]);
    assert.equal(fs.existsSync(dir), false);
    assert.deepEqual(t.db.events, ['drop gabay_wt_api_coder']);
    assert.equal(t.db.names.size, 0);
  } finally {
    box.done();
  }
});

test('remove --force: removes a copy with uncommitted changes and drops its database', async () => {
  const box = sandbox();
  try {
    const dir = existingCopy(box);
    const t = setup(box, {
      git: { dirty: ' M a.js\n', registered: [dir] },
      existingDbs: ['gabay_wt_api_coder'],
    });
    await removeWorkingCopy({ ...t.opts, name: 'api-coder', force: true }, t.deps);
    const removeCall = t.g.calls.find((c) => c.args[0] === 'worktree' && c.args[1] === 'remove');
    assert.deepEqual(removeCall.args, ['worktree', 'remove', '--force', dir]);
    assert.equal(fs.existsSync(dir), false);
    assert.deepEqual(t.db.events, ['drop gabay_wt_api_coder']);
  } finally {
    box.done();
  }
});

test('remove: an unknown name, or a folder git does not know as a working copy, is refused and nothing is dropped', async () => {
  const box = sandbox();
  try {
    const t = setup(box);
    await assert.rejects(
      removeWorkingCopy({ ...t.opts, name: 'someone', force: true }, t.deps),
      /Unknown agent name/,
    );
    existingCopy(box); // a folder is there, but git does not list it
    await assert.rejects(
      removeWorkingCopy({ ...t.opts, name: 'api-coder', force: true }, t.deps),
      /not a working copy/,
    );
    assert.deepEqual(t.db.events, []);
    assert.ok(
      fs.existsSync(path.join(box.base, 'api-coder')),
      'a folder git does not know is left alone',
    );
  } finally {
    box.done();
  }
});

test('remove: when git cannot remove the folder, the database is kept', async () => {
  const box = sandbox();
  try {
    const dir = existingCopy(box);
    const t = setup(box, { git: { registered: [dir] }, existingDbs: ['gabay_wt_api_coder'] });
    const realGit = t.deps.git;
    t.deps.git = async (args, o) =>
      args[1] === 'remove'
        ? { status: 128, stdout: '', stderr: 'fatal: locked' }
        : realGit(args, o);
    await assert.rejects(
      removeWorkingCopy({ ...t.opts, name: 'api-coder', force: true }, t.deps),
      /fatal: locked/,
    );
    assert.deepEqual(t.db.events, []);
  } finally {
    box.done();
  }
});

// ---- the database tools (a fake pg Client) -----------------------------------------------------------------

/** A Client class that records its queries and answers "does the database exist" from `exists`. */
function fakeClientClass(log, { exists }) {
  return class FakeClient {
    constructor(config) {
      log.push({ connect: config });
    }
    async connect() {}
    async query(text, values) {
      log.push({ text, values });
      if (/FROM pg_database/.test(text)) return { rows: exists ? [{ ok: 1 }] : [] };
      return { rows: [] };
    }
    async end() {
      log.push({ end: true });
    }
  };
}

test('database tools: ensure creates a missing database once and leaves an existing one; drop uses IF EXISTS', async () => {
  const conn = { host: 'h', port: 1, user: 'u', password: 'p' };
  const missing = [];
  const toolsA = createDatabaseTools(conn, fakeClientClass(missing, { exists: false }));
  assert.equal(await toolsA.ensure('gabay_wt_api_coder'), true);
  const created = missing.filter((e) => e.text).map((e) => e.text);
  assert.deepEqual(created, [
    'SELECT 1 AS ok FROM pg_database WHERE datname = $1',
    'CREATE DATABASE "gabay_wt_api_coder"',
  ]);
  assert.equal(missing[0].connect.database, 'postgres', 'it connects to the maintenance database');
  assert.ok(
    missing.some((e) => e.end),
    'the client is closed',
  );

  const present = [];
  const toolsB = createDatabaseTools(conn, fakeClientClass(present, { exists: true }));
  assert.equal(await toolsB.ensure('gabay_wt_api_coder'), false);
  assert.equal(present.filter((e) => /CREATE/.test(e.text ?? '')).length, 0);

  const dropped = [];
  const toolsC = createDatabaseTools(conn, fakeClientClass(dropped, { exists: true }));
  assert.equal(await toolsC.drop('gabay_wt_api_coder'), true);
  assert.ok(
    dropped.some((e) => e.text === 'DROP DATABASE IF EXISTS "gabay_wt_api_coder" WITH (FORCE)'),
  );
});

test('database tools: a name that is not one of the working-copy databases is never put into SQL', async () => {
  const conn = { host: 'h', port: 1, user: 'u', password: 'p' };
  const log = [];
  const tools = createDatabaseTools(conn, fakeClientClass(log, { exists: false }));
  for (const bad of [
    'gabay_dev',
    'gabay_wt_x"; DROP DATABASE gabay_dev; --',
    'postgres',
    'gabay_wt_',
  ]) {
    await assert.rejects(tools.ensure(bad), /not a working-copy database/);
    await assert.rejects(tools.drop(bad), /not a working-copy database/);
  }
  assert.equal(log.length, 0, 'it did not even connect');
});

// ---- the verify lock names the working copy --------------------------------------------------------------

test('the lock names a working copy: "held by api-coder (pid <n>, ...\\Gabay-wt\\api-coder, <commit>)"', async () => {
  const box = sandbox();
  try {
    const dir = path.join(box.base, 'api-coder');
    fs.mkdirSync(dir, { recursive: true });
    const run = (args) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
    run(['init', '-q', '-b', 'main']);
    fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
    run(['add', '-A']);
    run([
      '-c',
      'user.email=t@example.test',
      '-c',
      'user.name=T',
      '-c',
      'core.hooksPath=/dev/null',
      'commit',
      '-q',
      '-m',
      'x',
    ]);
    const commit = run(['rev-parse', '--short', 'HEAD']).stdout.trim();

    const file = path.join(box.top, 'verify.lock');
    const held = await acquireLock({
      file,
      root: dir,
      waitMs: 1000,
      owner: 'api-coder',
      log: () => {},
    });
    assert.ok(held.handle);
    const lines = [];
    const second = await acquireLock({
      file,
      root: box.mainRoot,
      waitMs: 300,
      pollMs: 50,
      owner: 'main',
      log: (l) => lines.push(l),
    });
    assert.ok(second.timedOut);
    assert.match(
      lines[0],
      new RegExp(`^verify is busy: held by api-coder \\(pid ${process.pid}, `),
    );
    assert.ok(lines[0].includes(`, ${dir}, ${commit})`), lines[0]);
    assert.ok(/Gabay-wt[\\/]api-coder, [0-9a-f]+\)/.test(lines[0]), lines[0]);
    require('../lib/verify-lock').releaseLock(held.handle);
  } finally {
    box.done();
  }
});

// ---- the main-folder guard and the date ------------------------------------------------------------------

test('the commands refuse to run inside a working copy (they belong to the main folder)', () => {
  const { assertMainFolder, localDate } = require('../lib/worktree-real');
  const box = sandbox();
  try {
    const g = (cwd, args) =>
      spawnSync(
        'git',
        [
          '-c',
          'user.email=t@example.test',
          '-c',
          'user.name=T',
          '-c',
          'core.hooksPath=/dev/null',
          ...args,
        ],
        { cwd, encoding: 'utf8' },
      );
    g(box.mainRoot, ['init', '-q', '-b', 'main']);
    fs.writeFileSync(path.join(box.mainRoot, 'a.txt'), 'a\n');
    g(box.mainRoot, ['add', 'a.txt']);
    g(box.mainRoot, ['commit', '-q', '-m', 'x']);
    const copy = path.join(box.base, 'api-coder');
    assert.equal(g(box.mainRoot, ['worktree', 'add', '-q', '-b', 'wt', copy]).status, 0);
    assertMainFolder(box.mainRoot); // the main folder passes
    assert.throws(() => assertMainFolder(copy), /is a working copy, not the main folder/);
    assert.throws(() => assertMainFolder(box.top), /not a git repository/);
    assert.equal(localDate(new Date(2026, 9, 9, 23, 59)), '2026-10-09');
    assert.equal(localDate(new Date(2026, 0, 5, 0, 1)), '2026-01-05');
  } finally {
    box.done();
  }
});
