// Changelog duplicate guard (standard §8.1): a commit that repeats a changelog entry is refused. The
// bump renumbers versions and dates, so a copy-pasted entry would otherwise slip through looking new.
// Two checks, per surface:
//   1. changelog.dart: no two entries of one surface share an entry `number:`.
//   2. an ARB file: no two changelog keys of one surface (changelogMobile_e001_a, ...) of DIFFERENT
//      entries carry the same text, once versions (0.1.0) and dates (2026-10-07) are ignored.
// Pure functions: the pre-commit hook gives them the staged file texts.
//
// Plain CommonJS, no dependencies, any Node >= 22.
'use strict';

const KEY = /^changelog(Mobile|Admin)_e(\d+)_([a-z])$/;

/** Text with versions and dates blanked, whitespace collapsed, lower-cased. */
const normalise = (text) =>
  String(text)
    .replace(/\b\d+\.\d+\.\d+\b/g, '')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ') // punctuation left behind by a removed version or date
    .trim()
    .toLowerCase();

/** Problems in changelog.dart: [{ message }] */
function checkChangelogDart(src) {
  const problems = [];
  for (const [list, surface] of [
    ['mobileChangelog', 'mobile'],
    ['adminChangelog', 'admin'],
  ]) {
    const at = src.indexOf(`List<ChangelogEntry> ${list}`);
    if (at === -1) continue;
    const next = src.indexOf('List<ChangelogEntry>', at + 1);
    const block = src.slice(at, next === -1 ? src.length : next);
    const seen = new Set();
    const byBullets = new Map(); // bullets function -> entry number that already uses it
    for (const entry of block.split('ChangelogEntry(').slice(1)) {
      const number = /number:\s*(\d+)/.exec(entry)?.[1];
      if (number !== undefined) {
        if (seen.has(number)) {
          problems.push({
            message: `changelog.dart: the ${surface} changelog has entry number ${number} twice`,
          });
        }
        seen.add(number);
      }
      // A renumbered copy still points at the old entry's bullets: two entries, one text.
      const bullets = /bullets:\s*(\w+)/.exec(entry)?.[1];
      if (bullets !== undefined) {
        const other = byBullets.get(bullets);
        if (other !== undefined && other !== number) {
          const [a, b] = [Number(other), Number(number)].sort((x, y) => x - y);
          problems.push({
            message: `changelog.dart: the ${surface} changelog entries ${a} and ${b} both use bullets ${bullets}; each entry needs its own text`,
          });
        }
        byBullets.set(bullets, number);
      }
    }
  }
  return problems;
}

/** Problems in one ARB file's text: [{ message }] */
function checkArb(file, text) {
  let arb;
  try {
    arb = JSON.parse(text);
  } catch (err) {
    return [{ message: `${file}: not valid JSON (${err.message})` }];
  }
  const problems = [];
  const seen = new Map(); // "<surface>|<normalised text>" -> first key
  for (const [key, value] of Object.entries(arb)) {
    const m = KEY.exec(key);
    if (!m || typeof value !== 'string') continue;
    const id = `${m[1]}|${normalise(value)}`;
    const first = seen.get(id);
    if (first && first.entry !== m[2]) {
      problems.push({
        message: `${file}: ${key} repeats the text of ${first.key} (a changelog bullet must not be copied into a new entry)`,
      });
    } else if (!first) {
      seen.set(id, { key, entry: m[2] });
    }
  }
  return problems;
}

module.exports = { checkChangelogDart, checkArb, normalise };
