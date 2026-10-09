// SessionStart hook: records where the repository stood when the session began, for the Stop hook
// that checks "screens changed, no changelog entry" (stop-screens.js). It stores the HEAD commit for
// the session_id in .verify/session-<id>.json (gitignored). A resumed or compacted session keeps its
// original baseline; a new or cleared one gets a fresh one.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { hookRoot, readEvent, baselineFile } = require('./lib');

async function main() {
  const event = await readEvent();
  if (!event.session_id) return;
  const file = baselineFile(event.session_id);
  const fresh =
    event.source === undefined || event.source === 'startup' || event.source === 'clear';
  if (fs.existsSync(file) && !fresh) return;
  let head;
  try {
    head = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: hookRoot(event),
      encoding: 'utf8',
    }).trim();
  } catch {
    return; // no commits yet: the Stop hook then compares against nothing
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `${JSON.stringify({ head, startedAt: new Date().toISOString() }, null, 2)}\n`,
  );
}

main();
