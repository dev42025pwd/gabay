// The Node half of .githooks/pre-commit (standard §8.1). The shell half has already run the secret
// guard. In order:
//   1. changelog duplicate guard   a repeated entry in changelog.dart or an ARB file blocks the commit
//   2. conditional linters         tools/lint/run.js on the STAGED content of the staged files, and
//                                  migrations-immutable --staged
//   3. version bump + stamp        L129; NEVER blocks: its own errors are warnings
// The guards run first (the plan lists the stamp earlier) so a refused commit leaves no stamped files.
//
// It reads and writes through whatever index git gave this hook (GIT_INDEX_FILE): the real index for
// `git commit`, a temporary one for `git commit -- <paths>`. The linters get an export of that index, so
// they see what will be committed, not what is on disk. The stamp updates that index AND the working
// files (it only rewrites the version and date literals, so unstaged edits survive). For the
// temporary-index case the real index still holds the old blobs; the decisions are recorded in
// .git/gabay-restage and .githooks/post-commit re-applies them to the real index (see there).
//
// Plain CommonJS, no dependencies, any Node >= 22.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const stamp = require('./stamp');
const { checkChangelogDart, checkArb } = require('./changelog-guard');

const LINT_CHUNK = 200;

const git = (args, { input } = {}) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    input,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

const root = git(['rev-parse', '--show-toplevel']).trim();
process.chdir(root);

/** Staged paths, optionally only some change kinds (git's --diff-filter letters). */
const stagedPaths = (filter) =>
  git([
    '-c',
    'core.quotePath=false',
    'diff',
    '--cached',
    '--name-only',
    '-z',
    ...(filter ? [`--diff-filter=${filter}`] : []),
  ])
    .split('\0')
    .filter(Boolean);

const stagedText = (p) => {
  try {
    return git(['show', `:${p}`]);
  } catch {
    return null;
  }
};

const headText = (p) => {
  try {
    return git(['show', `HEAD:${p}`]);
  } catch {
    return null;
  }
};

function refuse(title, lines) {
  console.error(`\npre-commit: ${title}`);
  for (const line of lines) console.error(`  - ${line}`);
  process.exit(1);
}

const isArb = (p) => /^app\/lib\/l10n\/[^/]+\.arb$/.test(p);

function guardChangelog(paths) {
  const problems = [];
  if (paths.includes(stamp.CHANGELOG_FILE)) {
    problems.push(...checkChangelogDart(stagedText(stamp.CHANGELOG_FILE) ?? ''));
  }
  for (const p of paths.filter(isArb)) {
    problems.push(...checkArb(p, stagedText(p) ?? '{}'));
  }
  if (problems.length)
    refuse(
      'a changelog entry is repeated (standard §8.1)',
      problems.map((p) => p.message),
    );
}

/**
 * Lints what is staged. The index (the temporary one in pathspec mode) is exported to a temp folder
 * and the linters run there with --root, so a violation fixed only on disk is still refused and one
 * that exists only on disk does not block a clean commit. Paths in the output are repo paths.
 */
function lint(files) {
  const node = process.execPath;
  if (files.length > 0) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gabay-staged-'));
    try {
      git(['checkout-index', '-a', '-f', `--prefix=${tmp.split(path.sep).join('/')}/`]);
      for (let i = 0; i < files.length; i += LINT_CHUNK) {
        const r = spawnSync(
          node,
          ['tools/lint/run.js', '--root', tmp, '--files', ...files.slice(i, i + LINT_CHUNK)],
          { stdio: 'inherit' },
        );
        if (r.status !== 0)
          refuse('a structural linter refused the staged files', ['see the lines above']);
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
  const migrations = spawnSync(
    node,
    ['tools/lint/run.js', 'migrations-immutable', '--staged', '--files'],
    {
      stdio: 'inherit',
    },
  );
  if (migrations.status !== 0) refuse('a committed migration was changed', ['see the lines above']);
}

/** HEAD's copies of the two version files, or null on a first commit (or when they are not there). */
function readHead() {
  try {
    git(['rev-parse', '--verify', 'HEAD']);
  } catch {
    return null;
  }
  const versionSrc = headText(stamp.VERSION_FILE);
  const changelogSrc = headText(stamp.CHANGELOG_FILE);
  return versionSrc === null || changelogSrc === null ? null : { versionSrc, changelogSrc };
}

/** Replaces the staged blob of `rel` with `text`. */
function stageBlob(rel, text) {
  const mode = git(['ls-files', '-s', '--', rel]).split(/\s+/)[0] || '100644';
  const sha = git(['hash-object', '-w', '--stdin'], { input: text }).trim();
  git(['update-index', '--cacheinfo', `${mode},${sha},${rel}`]);
}

/** Applies the decisions to the working file, whatever else is in it (only literals change). */
function stampWorkingFiles(decisions) {
  const read = (rel) => {
    const full = path.join(root, rel);
    return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
  };
  const versionSrc = read(stamp.VERSION_FILE);
  const changelogSrc = read(stamp.CHANGELOG_FILE);
  if (versionSrc === null || changelogSrc === null) return;
  const next = stamp.applyDecisions(versionSrc, changelogSrc, decisions);
  if (next.versionSrc !== versionSrc)
    fs.writeFileSync(path.join(root, stamp.VERSION_FILE), next.versionSrc);
  if (next.changelogSrc !== changelogSrc)
    fs.writeFileSync(path.join(root, stamp.CHANGELOG_FILE), next.changelogSrc);
}

function stampVersions(paths) {
  const staged = {
    versionSrc: stagedText(stamp.VERSION_FILE),
    changelogSrc: stagedText(stamp.CHANGELOG_FILE),
  };
  if (staged.versionSrc === null || staged.changelogSrc === null) return; // not a repo with the app yet
  const arb = {};
  for (const p of paths.filter(isArb)) arb[p] = stamp.arbSurfaces(headText(p), stagedText(p));
  const date = stamp.manilaDate();
  const decisions = stamp
    .plan({ paths, head: readHead(), staged, arb })
    .map((d) => ({ ...d, date: d.reason === 'restore' ? null : date }));
  if (decisions.length === 0) return;
  for (const d of decisions) {
    console.log(
      `pre-commit: ${d.surface} version ${d.version} (${d.reason})${d.date ? `, changelog date ${d.date}` : ''}`,
    );
  }
  const next = stamp.applyDecisions(staged.versionSrc, staged.changelogSrc, decisions);
  if (next.versionSrc !== staged.versionSrc) stageBlob(stamp.VERSION_FILE, next.versionSrc);
  if (next.changelogSrc !== staged.changelogSrc) stageBlob(stamp.CHANGELOG_FILE, next.changelogSrc);
  stampWorkingFiles(decisions);
  const marker = path.join(git(['rev-parse', '--absolute-git-dir']).trim(), 'gabay-restage');
  fs.writeFileSync(marker, `${JSON.stringify({ decisions })}\n`);
}

function main() {
  const all = stagedPaths();
  guardChangelog(all);
  lint(stagedPaths('ACMR'));
  try {
    stampVersions(all);
  } catch (err) {
    console.warn(
      `pre-commit: the version stamp failed and was skipped (the commit goes on): ${err.message}`,
    );
  }
}

main();
