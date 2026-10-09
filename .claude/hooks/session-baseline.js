// SessionStart hook: records where the repository stood when the session began, for the Stop hook
// that checks "screens changed, no changelog entry" (stop-screens.js). It stores the HEAD commit for
// the session_id in .verify/session-<id>.json (gitignored). A resumed or compacted session keeps its
// original baseline; a new or cleared one gets a fresh one. The main folder's baseline is always recorded; when the
// session starts in a working copy of this repository, that copy gets a baseline of its own (its HEAD is not the
// main folder's), which stop-screens uses for that copy only (owner ruling I-4, plan/PH1-worktrees.md 1.1).
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { stopRoots, readEvent, baselineFile } = require('./lib');

/** Records the HEAD of `root` as this session's baseline for that folder. */
function record(event, root) {
  const file = baselineFile(event.session_id, root);
  const fresh =
    event.source === undefined || event.source === 'startup' || event.source === 'clear';
  if (fs.existsSync(file) && !fresh) return;
  let head;
  try {
    head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return; // no commits yet: the Stop hook then compares against nothing
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `${JSON.stringify({ head, startedAt: new Date().toISOString() }, null, 2)}
`,
  );
}

async function main() {
  const event = await readEvent();
  if (!event.session_id) return;
  for (const root of stopRoots(event)) record(event, root);
}

main();
