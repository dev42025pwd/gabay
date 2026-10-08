#!/usr/bin/env node
// The two pre-commit guards that CI must repeat (L133, S6): until now they ran only in the local
// pre-commit hook, so a commit made with --no-verify, or on a machine without hooks, skipped them.
// CI runs them over the CHECKED-OUT TREE (the committed files), and fails on any problem.
//
//   secret guard           no tracked file named .env* except the templates (.example, .sample,
//                          .template, .dist) (standard §8.1: a leaked .env forced a credential rotation)
//   changelog duplicate    no repeated entry number or reused bullets in changelog.dart, no changelog
//   guard                  bullet text repeated across entries in an ARB file (tools/hooks/changelog-guard.js,
//                          the same module the pre-commit hook uses)
//
// Usage:  node tools/ci-guards.js            (npm run ci:guards)
// Exit code: the number of problems (at most 255); 2 when this is not a git repository.
//
// Plain CommonJS, no dependencies, any Node >= 22.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { checkChangelogDart, checkArb } = require('./hooks/changelog-guard');
const { CHANGELOG_FILE } = require('./hooks/stamp');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE_SUFFIX = /\.(example|sample|template|dist)$/;

/** Tracked paths (forward slashes). Throws when `root` is not a git repository. */
function trackedFiles(root) {
  return execFileSync('git', ['-c', 'core.quotePath=false', 'ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean);
}

/** [{ guard, message }] for every tracked .env* that is not a template. */
function secretGuard(files) {
  return files
    .filter((f) => {
      const base = f.split('/').pop();
      return base.startsWith('.env') && !TEMPLATE_SUFFIX.test(base);
    })
    .map((f) => ({
      guard: 'secret',
      message: `${f} is tracked: a real .env never goes into git (only .env.example, .sample, .template, .dist). Remove it from the index and rotate anything it held.`,
    }));
}

/** [{ guard, message }] for a repeated changelog entry in the committed changelog.dart and ARB files. */
function changelogGuard(root, files) {
  const problems = [];
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
  if (files.includes(CHANGELOG_FILE)) {
    problems.push(...checkChangelogDart(read(CHANGELOG_FILE)));
  }
  for (const f of files.filter((x) => /^app\/lib\/l10n\/[^/]+\.arb$/.test(x))) {
    problems.push(...checkArb(f, read(f)));
  }
  return problems.map((p) => ({ guard: 'changelog', message: p.message }));
}

/** Runs both guards over the repository at `root`. */
function runGuards(root = ROOT) {
  const files = trackedFiles(root);
  return [...secretGuard(files), ...changelogGuard(root, files)];
}

function main() {
  let problems;
  try {
    problems = runGuards();
  } catch (err) {
    console.error(`ci-guards: cannot list the repository's files: ${err.message}`);
    process.exit(2);
  }
  for (const p of problems) console.log(`ci-guards: ${p.guard}: ${p.message}`);
  console.log(
    problems.length === 0
      ? 'ci-guards: ok (secret guard, changelog duplicate guard)'
      : `ci-guards: ${problems.length} problem(s)`,
  );
  process.exit(Math.min(problems.length, 255));
}

if (require.main === module) main();

module.exports = { runGuards, secretGuard, changelogGuard, trackedFiles };
