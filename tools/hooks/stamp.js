// Version bump and changelog stamp (standard §8.1; L129). Pure functions: the pre-commit hook feeds
// them the file texts and writes back what they return.
//
// Two surfaces (standard §4.8), the shopper app ("mobile") and the admin page ("admin"), each have:
//   - a committed fallback version in app/lib/core/config/app_version.dart
//       static const String mobileFallbackVersion = '0.1.0';
//   - a changelog list in app/lib/core/config/changelog.dart whose FIRST entry is the newest:
//       const List<ChangelogEntry> mobileChangelog = [ ChangelogEntry(number: 1, version: '0.1.0', date: '2026-10-07', ...
// A commit that touches a surface raises its PATCH (0.1.0 -> 0.1.1) and stamps the top entry's
// version and date to match. Minor and major are raised by hand: if the staged version already
// differs from HEAD's, it is kept and never bumped again. The date is the commit time in
// Asia/Manila, taken with Intl (shell `date` is wrong about time zones on Windows).
//
// Plain CommonJS, no dependencies, any Node >= 22.
'use strict';

const SURFACES = ['mobile', 'admin'];
const VERSION_FILE = 'app/lib/core/config/app_version.dart';
const CHANGELOG_FILE = 'app/lib/core/config/changelog.dart';
const CARRIERS = new Set([VERSION_FILE, CHANGELOG_FILE]);

/** What a staged path touches. The two carrier files only hold versions, so they touch nothing. */
const PATH_RULES = [
  { re: /^app\/lib\/main_mobile\.dart$/, surfaces: ['mobile'] },
  { re: /^app\/lib\/features\/shopper\//, surfaces: ['mobile'] },
  { re: /^app\/android\//, surfaces: ['mobile'] },
  { re: /^app\/ios\//, surfaces: ['mobile'] },
  { re: /^app\/lib\/main_admin\.dart$/, surfaces: ['admin'] },
  { re: /^app\/lib\/features\/admin\//, surfaces: ['admin'] },
  { re: /^app\/web\//, surfaces: ['admin'] },
  { re: /^app\/lib\/core\//, surfaces: ['mobile', 'admin'] },
  { re: /^app\/lib\/shared\//, surfaces: ['mobile', 'admin'] },
  { re: /^app\/lib\/l10n\//, surfaces: ['mobile', 'admin'] },
];

/** The surfaces a list of repo-relative paths touches. */
function surfacesTouched(paths) {
  const touched = new Set();
  for (const p of paths) {
    if (CARRIERS.has(p)) continue;
    for (const rule of PATH_RULES)
      if (rule.re.test(p)) rule.surfaces.forEach((s) => touched.add(s));
  }
  return SURFACES.filter((s) => touched.has(s));
}

/** YYYY-MM-DD in Asia/Manila at `now` (GABAY_NOW, an ISO instant, overrides it for tests). */
function manilaDate(now = process.env.GABAY_NOW ? new Date(process.env.GABAY_NOW) : new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/** 0.1.0 -> 0.1.1, or null when it is not X.Y.Z. */
function bumpPatch(version) {
  const m = SEMVER.exec(version ?? '');
  return m ? `${m[1]}.${m[2]}.${Number(m[3]) + 1}` : null;
}

const fallbackPattern = (surface) => new RegExp(`(${surface}FallbackVersion\\s*=\\s*')([^']*)(')`);

/** The text of one surface's changelog list, from its declaration to the end of the first entry. */
function topEntryRange(changelogSrc, surface) {
  const decl = changelogSrc.indexOf(`List<ChangelogEntry> ${surface}Changelog`);
  if (decl === -1) return null;
  const from = changelogSrc.indexOf('ChangelogEntry(', decl + 1);
  if (from === -1) return null;
  // The first entry ends at the first "),\n" after it (entries do not nest parentheses).
  const rel = changelogSrc.slice(from).search(/\)\s*,?\s*(\]|ChangelogEntry\()/);
  return { from, to: rel === -1 ? changelogSrc.length : from + rel };
}

/** { fallback, topVersion, topDate, topNumber } for one surface; a missing piece is null. */
function readSurface(versionSrc, changelogSrc, surface) {
  const fb = fallbackPattern(surface).exec(versionSrc);
  const range = topEntryRange(changelogSrc, surface);
  const entry = range ? changelogSrc.slice(range.from, range.to) : '';
  return {
    fallback: fb ? fb[2] : null,
    topVersion: /version:\s*'([^']*)'/.exec(entry)?.[1] ?? null,
    topDate: /date:\s*'([^']*)'/.exec(entry)?.[1] ?? null,
    topNumber: Number(/number:\s*(\d+)/.exec(entry)?.[1] ?? NaN) || null,
  };
}

/** Both sources with one surface's fallback, and top entry version and date, set. */
function stampSurface(versionSrc, changelogSrc, surface, version, date) {
  const nextVersionSrc = versionSrc.replace(fallbackPattern(surface), `$1${version}$3`);
  const range = topEntryRange(changelogSrc, surface);
  if (!range) return { versionSrc: nextVersionSrc, changelogSrc };
  const entry = changelogSrc
    .slice(range.from, range.to)
    .replace(/(version:\s*')[^']*(')/, `$1${version}$2`)
    .replace(/(date:\s*')[^']*(')/, `$1${date}$2`);
  return {
    versionSrc: nextVersionSrc,
    changelogSrc: changelogSrc.slice(0, range.from) + entry + changelogSrc.slice(range.to),
  };
}

/**
 * Decides what to stamp.
 * @param {object} o
 * @param {string[]} o.paths  the staged paths
 * @param {{versionSrc:string, changelogSrc:string}|null} o.head  HEAD's copies (null: first commit)
 * @param {{versionSrc:string, changelogSrc:string}} o.staged  the staged copies
 * @returns {Array<{ surface, version, reason: 'bump'|'kept'|'sync' }>}
 */
function plan({ paths, head, staged }) {
  const touched = surfacesTouched(paths);
  const out = [];
  for (const surface of SURFACES) {
    const now = readSurface(staged.versionSrc, staged.changelogSrc, surface);
    if (now.fallback === null) continue;
    if (!head) {
      // First commit: nothing to bump from; only make the two agree.
      if (now.topVersion !== now.fallback)
        out.push({ surface, version: now.fallback, reason: 'sync' });
      continue;
    }
    const before = readSurface(head.versionSrc, head.changelogSrc, surface);
    const raisedFallback = now.fallback !== before.fallback;
    const raisedTop = now.topVersion !== before.topVersion || now.topNumber !== before.topNumber;
    if (raisedFallback || raisedTop) {
      // Raised by hand (a minor or major, or a new entry): keep it, never bump twice.
      out.push({
        surface,
        version: raisedFallback ? now.fallback : now.topVersion,
        reason: 'kept',
      });
    } else if (touched.includes(surface)) {
      const next = bumpPatch(before.fallback);
      if (next) out.push({ surface, version: next, reason: 'bump' });
    }
  }
  return out;
}

module.exports = {
  SURFACES,
  VERSION_FILE,
  CHANGELOG_FILE,
  surfacesTouched,
  manilaDate,
  bumpPatch,
  readSurface,
  stampSurface,
  plan,
};
