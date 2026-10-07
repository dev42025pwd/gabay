// PostToolUse hook (Edit|Write|MultiEdit): after any Dart file is edited, run the schema-to-form drift
// linter (tools/lint/run.js schema-forms, standard §7.2). PostToolUse cannot undo the edit; exit 2 with the
// violations on stderr feeds them back to the agent, which must fix the spec or the schema reading.
'use strict';

const { spawnSync } = require('node:child_process');
const { ROOT, readEvent } = require('./lib');

async function main() {
  const event = await readEvent();
  const file = event.tool_input?.file_path ?? event.tool_response?.filePath ?? '';
  if (!/\.dart$/i.test(String(file))) return;
  const run = spawnSync(process.execPath, ['tools/lint/run.js', 'schema-forms'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (run.status === 0) return;
  console.error(
    `The schema-to-form drift linter failed after editing ${file}:\n${run.stdout}${run.stderr}`,
  );
  process.exit(2);
}

main();
