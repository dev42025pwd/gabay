// A snapshot of each workflow's whole non-comment text (S7 round 4). The step pins and the other rules in
// workflow-rules.js give clear messages for the edits they know; the snapshot is the backstop for every edit they
// do not: a NODE_OPTIONS in an env block (every `node` exits 0), `defaults: run: shell: true {0}` (every run: step
// becomes a no-op), a `ref:` or `sparse-checkout:` on the checkout. Any change to a workflow file fails here until
// tools/test/workflow-snapshots/<file>.snap is changed in the same commit, so every workflow edit is read twice.
//
// What is NOT compared, so a routine change still passes: whole-line comments outside block scalars, blank lines
// outside block scalars, trailing spaces, and the Flutter version (the common rules tie it to the Blueprint pin).
// What IS compared: every other character, including each action's 40-hex SHA and its version comment (owner ruling,
// S7 round 5: an action upgrade changes the snapshot too), and inside a block scalar (`|`, `>`, `|-`, `>-` ...)
// every line, blank lines and `#` lines included: there they are content of the script or list, not comments.
// The files are plain (printable ASCII, tab and LF: workflow-rules.js plainProblems), so splitting on LF is the
// whole story: no CR, NEL, LS or PS can hide a line.
'use strict';

const SNAPSHOT_DIR = 'tools/test/workflow-snapshots';
const FLUTTER = '<flutter>';

/** A line that opens a block scalar: `key: |`, `- run: >-`, `path: |+`, optionally followed by a comment. */
const BLOCK_HEADER = /^\s*(?:- )?(?:[A-Za-z0-9_-]+:\s+)?[|>][1-9+-]*\s*(?:#.*)?$/;
const BLOCK_MODIFIERS = /[|>]([1-9+-]*)\s*(?:#.*)?$/;

const indentOf = (line) => /^( *)/.exec(line)[1].length;

/**
 * The comparable lines of a workflow: [{ line, text }] with `line` the line number in the file.
 * Inline `# ...` comments stay (a `#` inside a run: script cannot be told from a comment without a YAML parser).
 */
function normalise(text) {
  const flutter = /--branch (\d+\.\d+\.\d+) https:\/\/github\.com\/flutter\/flutter\.git/.exec(
    text,
  );
  const shape = (raw) => {
    const line = raw.replace(/\s+$/, '');
    return flutter ? line.split(flutter[1]).join(FLUTTER) : line;
  };
  const out = [];
  let block = null; // { keyIndent, keepTrailing, blanks: [line numbers] } while inside a block scalar
  const flushBlanks = (keep) => {
    if (keep) for (const line of block.blanks) out.push({ line, text: '' });
    block.blanks = [];
  };
  text.split('\n').forEach((raw, i) => {
    const trimmed = raw.replace(/\s+$/, '');
    if (block) {
      if (trimmed === '') {
        block.blanks.push(i + 1);
        return;
      }
      if (indentOf(trimmed) > block.keyIndent) {
        flushBlanks(true); // a blank line between two content lines changes the text
        out.push({ line: i + 1, text: shape(raw) });
        return;
      }
      flushBlanks(block.keepTrailing); // blank lines at the end of the block count only for |+ and >+
      block = null;
    }
    if (trimmed === '' || /^\s*#/.test(trimmed)) return;
    out.push({ line: i + 1, text: shape(raw) });
    if (BLOCK_HEADER.test(trimmed)) {
      block = {
        keyIndent: indentOf(trimmed) + (/^\s*- /.test(trimmed) ? 2 : 0),
        keepTrailing: BLOCK_MODIFIERS.exec(trimmed)[1].includes('+'),
        blanks: [],
      };
    }
  });
  if (block) flushBlanks(block.keepTrailing);
  return out;
}

/** The text a snapshot file holds for a workflow: the normalised lines, one per line. */
const snapshotText = (text) =>
  `${normalise(text)
    .map((l) => l.text)
    .join('\n')}\n`;

/**
 * Problems of one workflow against its snapshot (empty = identical after normalising).
 * @param {string} name      lint.yml, e2e.yml or build.yml
 * @param {string} text      the workflow's text
 * @param {string|undefined} snapshot  the snapshot file's text, or undefined when there is none
 */
function snapshotProblems(name, text, snapshot) {
  if (snapshot === undefined) {
    return [
      `${name}: no snapshot ${SNAPSHOT_DIR}/${name}.snap (a workflow without one is unpinned)`,
    ];
  }
  const found = normalise(text);
  const expected = snapshot.split('\n');
  if (expected[expected.length - 1] === '') expected.pop();
  const length = Math.max(found.length, expected.length);
  for (let i = 0; i < length; i += 1) {
    if (found[i]?.text === expected[i]) continue;
    const where = found[i] ? found[i].line : text.split('\n').length;
    const show = (s) =>
      s === undefined ? '(nothing: the file ends or the snapshot ends here)' : `"${s.trim()}"`;
    return [
      `${name}:${where}: the workflow text differs from ${SNAPSHOT_DIR}/${name}.snap at its comparable line ${i + 1}. ` +
        `The file has ${show(found[i]?.text)}; the snapshot has ${show(expected[i])}. ` +
        `If this edit is intended, edit ${SNAPSHOT_DIR}/${name}.snap in the same commit so that it holds the file's non-comment lines ` +
        `(the Flutter version shown as ${FLUTTER}; blank lines inside a block scalar kept); a reviewer then reads the change twice. ` +
        `(file: ${found.length} comparable lines, snapshot: ${expected.length})`,
    ];
  }
  return [];
}

module.exports = { snapshotProblems, snapshotText, normalise, SNAPSHOT_DIR };
