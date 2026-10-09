// Stop hook (main session only; registered under Stop, never SubagentStop): the session may not finish
// when user-facing screens changed and no changelog entry came with them (standard §4.8,
// WORKING_AGREEMENT §6). Ruling L130: it blocks until there is an entry, OR the Stop event's
// last_assistant_message holds a line that starts "Changelog waived:" followed by a reason on that line
// (the product owner reads the reason). stop_hook_active does NOT release it.
//
// WORKING COPIES (owner ruling I-4): the main folder is always checked, and the working copy of this repository the
// event's cwd is in as well, each from its own baseline (session-baseline.js records one per folder); a waiver line
// covers both.
//
// "Changed" is measured from the session's baseline (the HEAD recorded by session-baseline.js; HEAD
// itself when there is none) to the working tree, so work committed during the session still counts.
//   screens:   any file under app/lib/features/**, app/lib/shared/components|widgets|navigation/**, or
//              app/lib/core/theme/** (a rename counts: the new path is there), or a key of
//              app/lib/l10n/app_en.arb that is not a changelog key. An ARB "@key" entry is translator
//              metadata, not wording a user sees, so it does not count.
//   changelog: a real change to app/lib/core/config/changelog.dart, or a changelog* key in the ARB file.
//              "Real" means: comments, whitespace and the version and date values are ignored. The
//              pre-commit hook rewrites the top entry's version and date on every commit that touches a
//              surface; that stamp alone is NOT an entry.
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, stopRoots, readEvent, baselineFile, block, notice } = require('./lib');

const ARB = 'app/lib/l10n/app_en.arb';
const CHANGELOG = 'app/lib/core/config/changelog.dart';
const SCREEN_PATHS = [
  /^app\/lib\/features\/.+/,
  /^app\/lib\/shared\/(components|widgets|navigation)\/.+/,
  /^app\/lib\/core\/theme\/.+/,
];
const isChangelogKey = (key) => /^@?changelog/.test(key);
const isMetadataKey = (key) => key.startsWith('@');

/**
 * The reason of a "Changelog waived: <reason>" line in the assistant's last message, or null.
 * The line may start with a markdown heading (#..######) and/or a list marker (- * + or 1. 1)), and
 * may be bold; the words are matched in any case; lines inside ``` or ~~~ code fences are ignored
 * (an example is not a waiver); and the reason must be real: the template text <reason>, or text with
 * no letter in it (".", "...", "123"), does not count.
 */
const WAIVER_LINE =
  /^[ \t]*(?:#{1,6}[ \t]+)?(?:(?:[-*+]|\d+[.)])[ \t]+)?(?:\*\*|__)?[ \t]*changelog waived[ \t]*(?:\*\*|__)?[ \t]*:[ \t]*(?:\*\*|__)?[ \t]*(\S.*)$/i;
const FENCE = /^[ \t]*(```|~~~)/;
function waiverReason(message) {
  let fence = null; // the marker that opened the fence we are in, so ``` does not close ~~~
  for (const line of String(message ?? '').split(/\r?\n/)) {
    const opens = FENCE.exec(line)?.[1];
    if (opens) {
      if (fence === null) fence = opens;
      else if (fence === opens) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const reason = WAIVER_LINE.exec(line)?.[1]
      .replace(/(\*\*|__)\s*$/, '')
      .trim();
    if (reason && reason.toLowerCase() !== '<reason>' && /\p{L}/u.test(reason)) return reason;
  }
  return null;
}

const git = (root, args) =>
  execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });

function baselineHead(sessionId, root) {
  try {
    return JSON.parse(fs.readFileSync(baselineFile(sessionId, root), 'utf8')).head;
  } catch {
    return 'HEAD';
  }
}

/** Paths that differ between `base` and the working tree (tracked changes, plus new untracked files). */
function changedPaths(root, base) {
  const tracked = git(root, [
    '-c',
    'core.quotePath=false',
    'diff',
    '--name-only',
    '-z',
    base,
  ]).split('\0');
  const untracked = git(root, ['ls-files', '-z', '--others', '--exclude-standard']).split('\0');
  return [...new Set([...tracked, ...untracked].filter(Boolean))];
}

const baseText = (root, base, rel) => {
  try {
    return git(root, ['show', `${base}:${rel}`]);
  } catch {
    return null;
  }
};
const diskText = (root, rel) => {
  try {
    return fs.readFileSync(path.join(root, rel), 'utf8');
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

/** changelog.dart without comments and whitespace, and with every version and date value blanked. */
const withoutNoise = (text) =>
  (text ?? '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/(version:\s*')[^']*(')/g, '$1$2')
    .replace(/(date:\s*')[^']*(')/g, '$1$2')
    .replace(/\s+/g, '');

function assess(root, base) {
  const paths = changedPaths(root, base);
  const screens = paths.filter((p) => !/\.md$/i.test(p) && SCREEN_PATHS.some((re) => re.test(p)));
  let arbChanged = [];
  if (paths.includes(ARB)) arbChanged = changedKeys(baseText(root, base, ARB), diskText(root, ARB));
  const wording = arbChanged.filter((k) => !isMetadataKey(k) && !isChangelogKey(k));
  if (wording.length) {
    screens.push(`${ARB} (${wording.slice(0, 3).join(', ')}${wording.length > 3 ? ', ...' : ''})`);
  }
  const entryInDart =
    paths.includes(CHANGELOG) &&
    withoutNoise(baseText(root, base, CHANGELOG)) !== withoutNoise(diskText(root, CHANGELOG));
  const entryInArb = arbChanged.some((k) => !isMetadataKey(k) && isChangelogKey(k));
  return { screens, hasEntry: entryInDart || entryInArb };
}

async function main() {
  const event = await readEvent();
  // The main folder always, and the working copy the event's cwd is in as well (owner ruling I-4). Each folder is
  // measured from its own baseline and judged on its own changelog entry; a copy's baseline is never the main folder's.
  const screens = [];
  try {
    for (const root of stopRoots(event)) {
      const result = assess(root, baselineHead(event.session_id, root));
      if (result.screens.length === 0 || result.hasEntry) continue;
      const where = root === ROOT ? '' : ` (in the working copy ${root})`;
      screens.push(...result.screens.map((s) => `${s}${where}`));
    }
  } catch (err) {
    // Fail closed, like stop-verify: when git cannot say what changed, do not finish on trust.
    block(
      `Could not tell whether screens changed (${String(err.message).split('\n')[0]}). Check the repository and try again.`,
    );
    return;
  }
  if (screens.length === 0) return;
  const list = screens.slice(0, 6).join(', ') + (screens.length > 6 ? ', ...' : '');
  const waiver = waiverReason(event.last_assistant_message);
  if (waiver) {
    notice(`changelog waived for the screen changes (${list}): ${waiver}`);
    return;
  }
  block(
    `Screens changed (${list}) with no changelog entry. Add one to the surface's changelog (app/lib/core/config/changelog.dart and its bullet in app/lib/l10n/app_en.arb), or, if no user-visible change is meant, put a line "Changelog waived: <reason>" in your final message.`,
  );
}

main();
