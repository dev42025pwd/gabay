// Stop hook (main session): the session may not finish when user-facing screens changed and no
// changelog entry came with them (standard §4.8, WORKING_AGREEMENT §6).
//
// "Changed" is measured from the session's baseline (the HEAD recorded by session-baseline.js; HEAD itself
// when there is none) to the working tree, so work committed during the session still counts.
//   screens:   app/lib/features/**/views/**, app/lib/shared/components/**, app/lib/shared/widgets/**, or a
//              key of app/lib/l10n/app_en.arb that is not a changelog key
//   changelog: a real change to app/lib/core/config/changelog.dart, or a changelog* key in the ARB file.
//              The pre-commit hook rewrites the top entry's version and date on every commit that touches
//              a surface; that stamp alone is NOT an entry, so version and date values are ignored here.
// First time: block. If stop_hook_active is true and it still holds, allow with a notice ("shown, not
// trapped", the spirit of L129): the product owner sees it.
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, readEvent, baselineFile, block, notice } = require('./lib');

const ARB = 'app/lib/l10n/app_en.arb';
const CHANGELOG = 'app/lib/core/config/changelog.dart';
const SCREEN_PATHS = [
  /^app\/lib\/features\/.+\/views\/.+/,
  /^app\/lib\/shared\/components\//,
  /^app\/lib\/shared\/widgets\//,
];
const isChangelogKey = (key) => /^@?changelog/.test(key);

const git = (args) =>
  execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });

function baselineHead(sessionId) {
  try {
    return JSON.parse(fs.readFileSync(baselineFile(sessionId), 'utf8')).head;
  } catch {
    return 'HEAD';
  }
}

/** Paths that differ between `base` and the working tree (tracked changes, plus new untracked files). */
function changedPaths(base) {
  const tracked = git(['-c', 'core.quotePath=false', 'diff', '--name-only', '-z', base]).split(
    '\0',
  );
  const untracked = git(['ls-files', '-z', '--others', '--exclude-standard']).split('\0');
  return [...new Set([...tracked, ...untracked].filter(Boolean))];
}

const baseText = (base, rel) => {
  try {
    return git(['show', `${base}:${rel}`]);
  } catch {
    return null;
  }
};
const diskText = (rel) => {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return null;
  }
};

/** The ARB keys whose value differs (added, removed or changed) between two texts. */
function changedKeys(before, after) {
  const parse = (t) => {
    try {
      return JSON.parse(t ?? '{}');
    } catch {
      return {};
    }
  };
  const a = parse(before);
  const b = parse(after);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(
    (k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]),
  );
}

/** changelog.dart with every version and date value blanked, so a version stamp compares equal. */
const withoutStamp = (text) =>
  (text ?? '').replace(/(version:\s*')[^']*(')/g, '$1$2').replace(/(date:\s*')[^']*(')/g, '$1$2');

function assess(base) {
  const paths = changedPaths(base);
  const screens = paths.filter((p) => SCREEN_PATHS.some((re) => re.test(p)));
  let arbChanged = [];
  if (paths.includes(ARB)) arbChanged = changedKeys(baseText(base, ARB), diskText(ARB));
  const copyKeys = arbChanged.filter((k) => !isChangelogKey(k));
  if (copyKeys.length)
    screens.push(
      `${ARB} (${copyKeys.slice(0, 3).join(', ')}${copyKeys.length > 3 ? ', ...' : ''})`,
    );
  const entryInDart =
    paths.includes(CHANGELOG) &&
    withoutStamp(baseText(base, CHANGELOG)) !== withoutStamp(diskText(CHANGELOG));
  const entryInArb = arbChanged.some(isChangelogKey);
  return { screens, hasEntry: entryInDart || entryInArb };
}

async function main() {
  const event = await readEvent();
  let result;
  try {
    result = assess(baselineHead(event.session_id));
  } catch {
    return; // not a git repo, or git is unavailable: never trap the session on our own failure
  }
  if (result.screens.length === 0 || result.hasEntry) return;
  const list = result.screens.slice(0, 6).join(', ') + (result.screens.length > 6 ? ', ...' : '');
  if (event.stop_hook_active) {
    notice(`screens changed without a changelog entry: ${list}`);
    return;
  }
  block(
    `Screens changed (${list}) with no changelog entry. Add one to the surface's changelog (app/lib/core/config/changelog.dart and its bullet in app/lib/l10n/app_en.arb), then finish.`,
  );
}

main();
