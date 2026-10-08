// A snapshot of each workflow's whole non-comment text (S7 round 4). The step pins and the other rules in
// workflow-rules.js give clear messages for the edits they know; the snapshot is the backstop for every edit they
// do not: a NODE_OPTIONS in an env block (every `node` exits 0), `defaults: run: shell: true {0}` (every run: step
// becomes a no-op), a `ref:` or `sparse-checkout:` on the checkout. Any change to a workflow file fails here until
// tools/test/workflow-snapshots/<file>.snap is changed in the same commit, so every workflow edit is read twice.
//
// What is NOT compared, so a routine change still passes: whole-line comments, blank lines, trailing spaces, the
// 40-hex SHA and the version comment of each `uses: actions/...@sha # vX.Y.Z` (the common rules still require every
// action to be SHA-pinned), and the Flutter version (the common rules tie it to the Blueprint pin).
'use strict';

const SNAPSHOT_DIR = 'tools/test/workflow-snapshots';
const FLUTTER = '<flutter>';

/**
 * The comparable lines of a workflow: [{ line, text }] with `line` the line number in the file.
 * Inline `# ...` comments stay (a `#` inside a run: script cannot be told from a comment without a YAML parser).
 */
function normalise(text) {
  const flutter = /--branch (\d+\.\d+\.\d+) https:\/\/github\.com\/flutter\/flutter\.git/.exec(
    text,
  );
  const out = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const trimmed = raw.replace(/\s+$/, '');
    if (trimmed === '' || /^\s*#/.test(trimmed)) return;
    let line = trimmed.replace(
      /^(\s*(?:- )?uses: [A-Za-z0-9_./-]+)@[0-9a-f]{40} # v\d+\.\d+\.\d+$/,
      '$1@<sha> # <version>',
    );
    if (flutter) line = line.split(flutter[1]).join(FLUTTER);
    out.push({ line: i + 1, text: line });
  });
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
  const expected = snapshot.split(/\r?\n/); // a CRLF checkout of the snapshot must not differ
  if (expected[expected.length - 1] === '') expected.pop();
  const length = Math.max(found.length, expected.length);
  for (let i = 0; i < length; i += 1) {
    if (found[i]?.text === expected[i]) continue;
    const where = found[i] ? found[i].line : text.split(/\r?\n/).length;
    const show = (s) =>
      s === undefined ? '(nothing: the file ends or the snapshot ends here)' : `"${s.trim()}"`;
    return [
      `${name}:${where}: the workflow text differs from ${SNAPSHOT_DIR}/${name}.snap at its comparable line ${i + 1}. ` +
        `The file has ${show(found[i]?.text)}; the snapshot has ${show(expected[i])}. ` +
        `If this edit is intended, edit ${SNAPSHOT_DIR}/${name}.snap in the same commit so that it holds the file's non-comment lines ` +
        `(action SHAs shown as <sha> and the version comment as <version>, the Flutter version as ${FLUTTER}); a reviewer then reads the change twice. ` +
        `(file: ${found.length} comparable lines, snapshot: ${expected.length})`,
    ];
  }
  return [];
}

module.exports = { snapshotProblems, snapshotText, normalise, SNAPSHOT_DIR };
