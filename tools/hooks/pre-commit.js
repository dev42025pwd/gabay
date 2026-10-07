// The Node half of .githooks/pre-commit (standard §8.1). The shell half has already run the secret
// guard. In order:
//   1. changelog duplicate guard   a repeated entry in changelog.dart or an ARB file blocks the commit
//   2. conditional linters         tools/lint/run.js --files <staged files>, and migrations-immutable --staged
//   3. version bump + stamp        L129; NEVER blocks: its own errors are warnings
// The guards run first so a refused commit leaves no stamped files behind.
//
// It reads and writes through whatever index git gave this hook (GIT_INDEX_FILE): the real index for
// `git commit`, a temporary one for `git commit -- <paths>`. The stamp updates that index and the working
// tree; for the temporary-index case the real index still holds the old blobs, so the paths are
// recorded in .git/gabay-restage and .githooks/post-commit resets them (see there).
//
// Plain CommonJS, no dependencies, any Node >= 22.
'use strict';

const fs = require('node:fs');
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

function guardChangelog(paths) {
  const problems = [];
  if (paths.includes(stamp.CHANGELOG_FILE)) {
    problems.push(...checkChangelogDart(stagedText(stamp.CHANGELOG_FILE) ?? ''));
  }
  for (const p of paths.filter((x) => /^app\/lib\/l10n\/[^/]+\.arb$/.test(x))) {
    problems.push(...checkArb(p, stagedText(p) ?? '{}'));
  }
  if (problems.length)
    refuse(
      'a changelog entry is repeated (standard §8.1)',
      problems.map((p) => p.message),
    );
}

function lint(files) {
  const node = process.execPath;
  const run = (args) =>
    spawnSync(node, ['tools/lint/run.js', ...args], { stdio: 'inherit' }).status;
  for (let i = 0; i < files.length; i += LINT_CHUNK) {
    if (run(['--files', ...files.slice(i, i + LINT_CHUNK)]) !== 0)
      refuse('a structural linter refused the staged files', ['see the lines above']);
  }
  if (run(['migrations-immutable', '--staged', '--files']) !== 0)
    refuse('a committed migration was changed', ['see the lines above']);
}

/** Replaces the staged blob of `rel`, and the working-tree file when it has no other changes. */
function writeStaged(rel, oldText, newText, restage) {
  const mode = git(['ls-files', '-s', '--', rel]).split(/\s+/)[0] || '100644';
  const sha = git(['hash-object', '-w', '--stdin'], { input: newText }).trim();
  git(['update-index', '--cacheinfo', `${mode},${sha},${rel}`]);
  restage.push(rel);
  const full = path.join(root, rel);
  const onDisk = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
  if (onDisk !== null && onDisk.replace(/\r\n/g, '\n') === oldText.replace(/\r\n/g, '\n')) {
    fs.writeFileSync(full, newText);
  } else {
    console.warn(
      `pre-commit: ${rel} has other unstaged changes; the stamp is in the commit only, not in your working file`,
    );
  }
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

function stampVersions(paths) {
  const staged = {
    versionSrc: stagedText(stamp.VERSION_FILE),
    changelogSrc: stagedText(stamp.CHANGELOG_FILE),
  };
  if (staged.versionSrc === null || staged.changelogSrc === null) return; // not a repo with the app yet
  const head = readHead();
  const decisions = stamp.plan({ paths, head, staged });
  if (decisions.length === 0) return;
  const date = stamp.manilaDate();
  let { versionSrc, changelogSrc } = staged;
  for (const d of decisions) {
    ({ versionSrc, changelogSrc } = stamp.stampSurface(
      versionSrc,
      changelogSrc,
      d.surface,
      d.version,
      date,
    ));
    console.log(
      `pre-commit: ${d.surface} version ${d.version} (${d.reason}), changelog date ${date}`,
    );
  }
  const restage = [];
  if (versionSrc !== staged.versionSrc)
    writeStaged(stamp.VERSION_FILE, staged.versionSrc, versionSrc, restage);
  if (changelogSrc !== staged.changelogSrc)
    writeStaged(stamp.CHANGELOG_FILE, staged.changelogSrc, changelogSrc, restage);
  if (restage.length) {
    const marker = path.join(git(['rev-parse', '--absolute-git-dir']).trim(), 'gabay-restage');
    fs.appendFileSync(marker, `${restage.join('\n')}\n`);
  }
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
