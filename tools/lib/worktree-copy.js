// Making and removing a coder's working copy (plan/PH1-worktrees.md 1.1). All the outside world (git, the database,
// commands, the verify lock, the log) comes in as `deps`, so the tests drive it with fakes; tools/lib/worktree-real.js
// supplies the real ones. Nothing here prints an .env value.
//
//   deps.git(args, { cwd })                   -> { status, stdout, stderr }
//   deps.db.ensure(name) / deps.db.drop(name) -> true when it created / dropped the database
//   deps.run(commandLine, { cwd, env })       -> the exit code (env: values added to the process's own)
//   deps.withLock({ owner, root }, fn)        -> runs fn holding the machine-wide verify lock (see createWorkingCopy)
//   deps.log(line)
//
// Plain CommonJS, no dependencies, any Node >= 22.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  workingCopiesBase,
  assertAgentName,
  assertBranchName,
  databaseName,
  defaultBranch,
} = require('./worktree-names');
const { withDatabase } = require('./worktree-env');

/** Where the internal seed source is, relative to a repository root (git-ignored: L48, L123). */
const INTERNAL_SEED = path.join('db', 'seeds', 'sources', 'internal');

/** Package installs in a new copy, in this order: [command line, folder]. */
const INSTALLS = [
  ['npm ci', 'functions'],
  ['npm ci', path.join('db', 'tools')],
  ['npm ci', path.join('db', 'seeds')],
  ['flutter pub get', 'app'],
];

const sameFolder = (a, b) =>
  process.platform === 'win32'
    ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
    : path.resolve(a) === path.resolve(b);

/** Runs git and throws with git's own message when it fails. */
async function mustGit(git, args, cwd) {
  const r = await git(args, { cwd });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${`${r.stderr}`.trim() || `exit ${r.status}`}`);
  }
  return r;
}

const refExists = async (git, ref, cwd) =>
  (await git(['show-ref', '--verify', '--quiet', ref], { cwd })).status === 0;

/**
 * The arguments of `git worktree add` for `branch` in `dir`: an existing local branch is checked out as it is; a
 * branch only on origin is tracked; a new one is made from the fetched origin/main (a branch the copy leaves behind
 * keeps its commits, so the next copy of the same name can pick it up).
 */
async function worktreeAddArgs(git, mainRoot, dir, branch) {
  if (await refExists(git, `refs/heads/${branch}`, mainRoot))
    return ['worktree', 'add', dir, branch];
  if (await refExists(git, `refs/remotes/origin/${branch}`, mainRoot)) {
    return ['worktree', 'add', '--track', '-b', branch, dir, `origin/${branch}`];
  }
  return ['worktree', 'add', '-b', branch, dir, 'origin/main'];
}

/** Copies the internal seed source from the main folder when it is there; it stays git-ignored, never committed. */
function copyInternalSeed(mainRoot, dir, log) {
  const from = path.join(mainRoot, INTERNAL_SEED);
  if (!fs.existsSync(from)) {
    log(
      'No internal seed source in the main folder: the seed will skip the penthouse, as a clean clone does.',
    );
    return;
  }
  fs.cpSync(from, path.join(dir, INTERNAL_SEED), { recursive: true });
  log(
    `Copied the internal seed source (${INTERNAL_SEED}) file to file; it is git-ignored and never committed.`,
  );
}

/**
 * Creates the working copy of agent `name`: fetch, worktree, its own .env, its database, the internal seed source,
 * the package installs, then setup-db. Resolves { dir, branch, database }; throws on the first failing step, and the
 * copy made so far stays (run `worktree:remove -- <name> --force` to start over).
 *
 * DESIGN CHOICE (not in the plan): setup-db's seed starts the Auth emulator on the ports every verify run uses (L140),
 * so the setup-db step runs inside the verify lock, named "worktree:new <name>", instead of colliding with a run
 * in progress. Alternative: no lock, as `npm run setup-db` has always run.
 * @param {{ name: string, branch?: string|null, mainRoot: string, base?: string, today: string }} opts today: YYYY-MM-DD
 */
async function createWorkingCopy(opts, deps) {
  const { name, mainRoot } = opts;
  const { git, db, run, withLock, log } = deps;
  assertAgentName(name);
  if (opts.branch) assertBranchName(opts.branch);
  const dir = path.join(opts.base ?? workingCopiesBase(mainRoot), name);
  const database = databaseName(name);
  const branch = opts.branch || defaultBranch(name, opts.today);
  if (fs.existsSync(dir)) {
    throw new Error(`${dir} already exists. Remove it first: npm run worktree:remove -- ${name}`);
  }
  const mainEnvFile = path.join(mainRoot, '.env');
  if (!fs.existsSync(mainEnvFile)) throw new Error(`There is no .env in ${mainRoot} to copy.`);
  const envText = withDatabase(fs.readFileSync(mainEnvFile, 'utf8'), database);

  log('Fetching origin ...');
  await mustGit(git, ['fetch', 'origin'], mainRoot);
  await mustGit(git, await worktreeAddArgs(git, mainRoot, dir, branch), mainRoot);
  log(`Working copy: ${dir} (branch ${branch}).`);

  fs.writeFileSync(path.join(dir, '.env'), envText);
  log(`Wrote its .env: the main one with only PGDATABASE changed to ${database}.`);

  const created = await db.ensure(database);
  log(created ? `Created the database ${database}.` : `The database ${database} already exists.`);

  copyInternalSeed(mainRoot, dir, log);

  for (const [commandLine, folder] of INSTALLS) {
    log(`${commandLine} in ${folder} ...`);
    const code = await run(commandLine, { cwd: path.join(dir, folder) });
    if (code !== 0) throw new Error(`${commandLine} in ${folder} failed (exit ${code}).`);
  }

  log('npm run setup-db (schema, migrations, test seed) ...');
  const setupCode = await withLock({ owner: `worktree:new ${name}`, root: dir }, () =>
    run('npm run setup-db', { cwd: dir, env: { PGDATABASE: database } }),
  );
  if (setupCode !== 0) {
    throw new Error(
      `npm run setup-db failed (exit ${setupCode}). The copy stays; fix the cause and run npm run setup-db in ${dir}.`,
    );
  }
  log(`\nReady: ${dir}\n  branch ${branch}, database ${database}.`);
  return { dir, branch, database };
}

/** The `worktree` entries of `git worktree list --porcelain`: [{ path, branch }]. */
function parseWorktrees(text) {
  return `${text}`
    .split(/\r?\n\r?\n/)
    .map((block) => {
      const lines = block.split(/\r?\n/);
      const where = lines.find((l) => l.startsWith('worktree '));
      const on = lines.find((l) => l.startsWith('branch '));
      return (
        where && {
          path: where.slice('worktree '.length),
          branch: on?.replace(/^branch (refs\/heads\/)?/, ''),
        }
      );
    })
    .filter(Boolean);
}

/**
 * Removes the working copy of agent `name` and drops its database. It refuses a copy with uncommitted changes
 * (tracked changes or new files) unless `force`; a folder git does not list as a working copy is left alone. The
 * database is dropped only after git has removed the folder. The branch stays, with its commits.
 * @param {{ name: string, force?: boolean, mainRoot: string, base?: string }} opts
 */
async function removeWorkingCopy(opts, deps) {
  const { name, mainRoot } = opts;
  const { git, db, log } = deps;
  assertAgentName(name);
  const dir = path.join(opts.base ?? workingCopiesBase(mainRoot), name);
  const database = databaseName(name);

  const listed = parseWorktrees(
    (await mustGit(git, ['worktree', 'list', '--porcelain'], mainRoot)).stdout,
  );
  const entry = listed.find((w) => sameFolder(w.path, dir));
  if (!entry)
    throw new Error(`${dir} is not a working copy of this repository (git does not list it).`);

  if (!opts.force) {
    const status = await mustGit(git, ['status', '--porcelain'], dir);
    const changes = `${status.stdout}`.split(/\r?\n/).filter(Boolean).length;
    if (changes > 0) {
      throw new Error(
        `${dir} has ${changes} uncommitted change(s). Commit or stash them, or run again with --force to discard them.`,
      );
    }
  }
  await mustGit(git, ['worktree', 'remove', ...(opts.force ? ['--force'] : []), dir], mainRoot);
  log(`Removed the working copy ${dir}.`);
  if (entry.branch) log(`The branch ${entry.branch} is kept, with its commits.`);

  const dropped = await db.drop(database);
  log(dropped ? `Dropped the database ${database}.` : `The database ${database} was not there.`);
  return { dir, database };
}

module.exports = { createWorkingCopy, removeWorkingCopy, parseWorktrees, INTERNAL_SEED };
