#!/usr/bin/env node
// lint.yml's "a committed migration is never edited" step (rule 4), on pull requests AND on pushes
// (S7 review I2: it used to run only on pull requests, so a push to main, or a pull-request run that was
// cancelled, was green without it). It works out what to compare with, says which and why, and runs
//   node tools/lint/run.js migrations-immutable --base <what>
// The workflow passes its values through the environment (never `${{ }}` inside the script text):
//
//   EVENT_NAME   github.event_name   push or pull_request
//   BASE_REF     github.base_ref     pull_request: the branch the PR targets (compared as origin/<it>)
//   BEFORE_SHA   github.event.before push: the branch tip before the push; all zeros for a new branch
//   REF_NAME     github.ref_name     push: the branch or tag pushed
//   REF_TYPE     github.ref_type     push: branch or tag (for the wording, and a tag named main is not main)
//
// push, in order of preference:
//   1. the tip the branch had before the push, when this clone has it and it is an ancestor of HEAD;
//   2. a new branch (all-zeros BEFORE_SHA) or a force push (the old tip is not in this history): origin/main;
//   3. nothing to compare with (the very first push of main: all-zeros BEFORE_SHA): a `::warning::` says so,
//      and the migration FILE-NAME rules still run (never a silent pass).
// Two things FAIL (exit 2) instead of falling back: a shallow clone (fetch-depth: 0 is required, or a normal
// push would look like a force push and be skipped), and a push to main whose previous tip is missing or not an
// ancestor (a force push of main, which L136's branch rule forbids).
// lint.yml runs this on pushes to main and on pull requests only; the other branches are covered by their PR.
//
// Exit code: the linter's (the number of violations), or 2 for a missing or unusable input. Plain CommonJS, no
// dependencies, any Node >= 22.
'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ZEROS = /^0+$/;
const LINTER = path.join(__dirname, 'lint', 'run.js');

/** git in the current directory: { ok, out }. */
function git(args) {
  const r = spawnSync('git', args, { encoding: 'utf8' });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}`.trim() };
}

const exists = (ref) => git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).ok;

/**
 * What to compare with: { base, reason } for a comparison, { base: null, reason } when there is nothing to
 * compare with, or { error } when the input is unusable.
 */
function chooseBase({ event, baseRef, before, refName, refType }) {
  // Without the whole history every comparison below is wrong (a normal push would look like a force push).
  if (git(['rev-parse', '--is-shallow-repository']).out === 'true') {
    return {
      error:
        'this clone is shallow: the history is incomplete, so nothing can be compared. The checkout needs fetch-depth: 0',
    };
  }
  if (event === 'pull_request') {
    if (!baseRef) return { error: 'BASE_REF is empty: a pull request run needs its base branch' };
    const base = `origin/${baseRef}`;
    if (!exists(base)) return { error: `${base} is not in this clone (fetch-depth: 0 fetches it)` };
    return { base, reason: `the pull request's base, ${base}` };
  }
  if (event !== 'push') {
    return { error: `event "${event}": this check handles push and pull_request only` };
  }
  const isMain = refName === 'main' && refType !== 'tag';
  const missingTip =
    !before || ZEROS.test(before)
      ? null
      : !exists(before) || !git(['merge-base', '--is-ancestor', before, 'HEAD']).ok;
  if (isMain && missingTip) {
    return {
      error: `the previous tip of main (${before}) is not an ancestor of this push, or not in this clone: a force push of main, which the branch rule (L136) forbids. Nothing was compared`,
    };
  }
  let why;
  if (!before || ZEROS.test(before)) {
    why = refType === 'tag' ? 'a new tag (no earlier tip)' : 'a new branch (no earlier tip)';
  } else if (!exists(before)) {
    why = 'a force push (the old tip is not in this history)';
  } else if (!git(['merge-base', '--is-ancestor', before, 'HEAD']).ok) {
    why = 'a force push (the old tip is not an ancestor of the new one)';
  } else {
    return { base: before, reason: 'the branch tip before this push' };
  }
  const head = git(['rev-parse', 'HEAD']).out;
  if (exists('origin/main') && git(['rev-parse', 'origin/main']).out !== head) {
    return { base: 'origin/main', reason: `${why}, so origin/main` };
  }
  return {
    base: null,
    reason: `${why} on ${refName || 'this ref'}, and origin/main is this very commit or missing: nothing to compare with`,
  };
}

function main() {
  const choice = chooseBase({
    event: process.env.EVENT_NAME,
    baseRef: process.env.BASE_REF,
    before: process.env.BEFORE_SHA,
    refName: process.env.REF_NAME,
    refType: process.env.REF_TYPE,
  });
  if (choice.error) {
    console.error(`ci-migrations: ${choice.error}`);
    return 2;
  }
  const args = ['migrations-immutable'];
  if (choice.base) {
    args.push('--base', choice.base);
    console.log(`ci-migrations: compared with ${choice.base} (${choice.reason})`);
  } else {
    console.log(`::warning::ci-migrations: ${choice.reason}. Only the file-name rules ran.`);
  }
  const r = spawnSync(process.execPath, [LINTER, ...args], { encoding: 'utf8' });
  process.stdout.write(r.stdout ?? '');
  process.stderr.write(r.stderr ?? '');
  return r.status ?? 2;
}

if (require.main === module) process.exit(main());

module.exports = { chooseBase };
