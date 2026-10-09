// The real git, database, commands and verify lock behind `npm run worktree:new` and `worktree:remove`
// (plan/PH1-worktrees.md 1.1). Tested only through the fakes in tools/test/worktree.test.js and the live run in the
// plan; this file holds no decisions. Plain CommonJS, any Node >= 22.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { childEnv } = require('./proc');
const {
  lockFilePath,
  readWaitLimit,
  readReportInterval,
  acquireLock,
  releaseLock,
} = require('./verify-lock');
const { connectionFrom } = require('./worktree-env');
const { createDatabaseTools, pgClient } = require('./worktree-db');

/** Runs git with an argument list (never a shell) and returns { status, stdout, stderr }. */
async function git(args, { cwd }) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr || `${r.error ?? ''}` };
}

/**
 * Runs a fixed command line in `cwd` with the output going to this terminal, and returns its exit code. `env` adds
 * to the process's own, with the running Node first on PATH so `npm` matches it. shell:true is needed to start
 * npm.cmd on Windows; the command lines are constants of worktree-copy.js, never user input.
 */
async function run(commandLine, { cwd, env = {} }) {
  const r = spawnSync(commandLine, { cwd, env: childEnv(env), stdio: 'inherit', shell: true });
  return r.status ?? 1;
}

/** Holds the machine-wide verify lock around `fn`, waiting its turn as a verify run does. */
async function withLock({ owner, root }, fn) {
  const taken = await acquireLock({
    file: lockFilePath(),
    root,
    owner,
    waitMs: readWaitLimit(),
    reportMs: readReportInterval(),
  });
  if (taken.timedOut) throw new Error(taken.message);
  try {
    return await fn();
  } finally {
    releaseLock(taken.handle);
  }
}

/** The database tools, connecting with the main .env (read when first used; nothing of it is logged). */
function lazyDatabase(mainRoot) {
  let tools;
  const get = () => {
    tools ??= createDatabaseTools(
      connectionFrom(fs.readFileSync(path.join(mainRoot, '.env'), 'utf8')),
      pgClient(mainRoot),
    );
    return tools;
  };
  return { ensure: (name) => get().ensure(name), drop: (name) => get().drop(name) };
}

/** Everything createWorkingCopy and removeWorkingCopy need, for real. */
const realDeps = (mainRoot, log = console.log) => ({
  git,
  run,
  withLock,
  db: lazyDatabase(mainRoot),
  log,
});

/** Throws when `root` is a linked working copy: these commands belong to the main folder. */
function assertMainFolder(root) {
  const ask = (flag) =>
    spawnSync('git', ['rev-parse', '--path-format=absolute', flag], {
      cwd: root,
      encoding: 'utf8',
    });
  const dir = ask('--git-dir');
  const common = ask('--git-common-dir');
  if (dir.status !== 0 || common.status !== 0) throw new Error(`${root} is not a git repository.`);
  if (path.resolve(dir.stdout.trim()) !== path.resolve(common.stdout.trim())) {
    throw new Error(`${root} is a working copy, not the main folder: run this in the main folder.`);
  }
}

/** Today's date in this machine's time zone, YYYY-MM-DD (a branch name, so the date of the work). */
function localDate(now = new Date()) {
  const two = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

module.exports = { realDeps, assertMainFolder, localDate };
