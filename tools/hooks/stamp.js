// Version bump and changelog stamp (standard §8.1; L129). Pure functions: the pre-commit hook feeds
// them the file texts and writes back what they return.
//
// Two surfaces (standard §4.8), the shopper app ("mobile") and the admin page ("admin"), each have:
//   - a committed fallback version in app/lib/core/config/app_version.dart
//       static const String mobileFallbackVersion = '0.1.0';
//   - a changelog list in app/lib/core/config/changelog.dart whose FIRST entry is the newest:
//       const List<ChangelogEntry> mobileChangelog = [ ChangelogEntry(number: 1, version: '0.1.0', date: '2026-10-07', ...
// A commit that touches a surface raises its PATCH (0.1.0 -> 0.1.1) and stamps the top entry's
// version and date to match. Minor and major are raised by hand: a staged version that is a valid
// X.Y.Z and ABOVE HEAD's is kept and never bumped again. Anything else the developer left there (an
// empty placeholder, a copied or lower version, text that is not a version) is replaced: a new top
// entry is a release and gets HEAD's patch + 1, and a version never goes down. The date is the
// commit time in Asia/Manila, taken with Intl (shell `date` is wrong about time zones on Windows).
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

/** An ARB file: one string table for both surfaces, except its changelog keys, which are per surface. */
const isArb = (p) => /^app\/lib\/l10n\/[^/]+\.arb$/.test(p);
const CHANGELOG_KEY = /^@?changelog(Mobile|Admin)_/;

/**
 * Which surfaces an ARB change touches, from the keys that changed between two texts: only
 * changelogMobile_* keys -> mobile, only changelogAdmin_* -> admin, both kinds -> both, and any other
 * key (a string both surfaces may show) -> null, meaning "both, like the rest of l10n".
 */
function arbSurfaces(beforeText, afterText) {
  const parse = (t) => {
    try {
      return JSON.parse(t ?? '{}');
    } catch {
      return {};
    }
  };
  const a = parse(beforeText);
  const b = parse(afterText);
  const changed = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(
    (k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]),
  );
  if (changed.length === 0 || changed.some((k) => !CHANGELOG_KEY.test(k))) return null;
  return SURFACES.filter((s) => changed.some((k) => CHANGELOG_KEY.exec(k)[1].toLowerCase() === s));
}

/**
 * The surfaces a list of repo-relative paths touches. `arb` maps an ARB path to the surfaces its
 * change touches (see arbSurfaces); an ARB path that is not in it counts for both.
 */
function surfacesTouched(paths, arb = {}) {
  const touched = new Set();
  for (const p of paths) {
    if (CARRIERS.has(p)) continue;
    if (isArb(p) && Array.isArray(arb[p])) {
      arb[p].forEach((s) => touched.add(s));
      continue;
    }
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

const numbers = (v) =>
  SEMVER.exec(v ?? '')
    ?.slice(1)
    .map(Number) ?? null;

/** True when a and b are both X.Y.Z and a is the higher. */
function isAbove(a, b) {
  const x = numbers(a);
  const y = numbers(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
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

/**
 * Both sources with one surface's fallback, and top entry version and date, set (date null: leave it).
 * It touches only those literals, so it is safe on a file that has other edits of its own.
 */
function stampSurface(versionSrc, changelogSrc, surface, version, date) {
  const nextVersionSrc = versionSrc.replace(fallbackPattern(surface), `$1${version}$3`);
  const range = topEntryRange(changelogSrc, surface);
  if (!range) return { versionSrc: nextVersionSrc, changelogSrc };
  let entry = changelogSrc
    .slice(range.from, range.to)
    .replace(/(version:\s*')[^']*(')/, `$1${version}$2`);
  if (date !== null) entry = entry.replace(/(date:\s*')[^']*(')/, `$1${date}$2`);
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
 * @param {Record<string,string[]>} [o.arb]  see surfacesTouched
 * @returns {Array<{ surface, version, reason: 'bump'|'kept'|'sync'|'restore' }>}
 */
function plan({ paths, head, staged, arb }) {
  const touched = surfacesTouched(paths, arb);
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
    const newEntry = now.topNumber !== before.topNumber;
    const raisedTop = newEntry || now.topVersion !== before.topVersion;
    // What the developer wrote by hand counts only when it is a real version above HEAD's.
    const hand = [raisedFallback ? now.fallback : null, raisedTop ? now.topVersion : null]
      .filter((v) => isAbove(v, before.fallback))
      .sort((x, y) => (isAbove(x, y) ? -1 : 1))[0];
    if (hand) {
      out.push({ surface, version: hand, reason: 'kept' });
    } else if (touched.includes(surface) || newEntry) {
      // A new top entry is a release even when no surface path is staged.
      const next = bumpPatch(before.fallback);
      if (next) out.push({ surface, version: next, reason: 'bump' });
    } else if (raisedFallback || raisedTop) {
      // Something moved the versions but not up (lower, empty, copied): HEAD's goes back, never lower.
      out.push({ surface, version: before.fallback, reason: 'restore' });
    }
  }
  return out;
}

/**
 * Applies decisions ({ surface, version, date }) to the two sources, in order. Idempotent: applying
 * the same decisions twice gives the same text. A decision whose version is below the one already
 * in the text is skipped (a stamp never lowers a version a developer staged on purpose).
 */
function applyDecisions(versionSrc, changelogSrc, decisions) {
  let out = { versionSrc, changelogSrc };
  for (const d of decisions) {
    const now = readSurface(out.versionSrc, out.changelogSrc, d.surface);
    if (d.reason !== 'restore' && isAbove(now.fallback, d.version)) continue;
    out = stampSurface(out.versionSrc, out.changelogSrc, d.surface, d.version, d.date ?? null);
  }
  return out;
}

module.exports = {
  applyDecisions,
  SURFACES,
  VERSION_FILE,
  CHANGELOG_FILE,
  surfacesTouched,
  arbSurfaces,
  manilaDate,
  bumpPatch,
  isAbove,
  readSurface,
  stampSurface,
  plan,
};
