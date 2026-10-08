// A worker for the strict-alternation test (verify-lock-fix.test.js): waits for the start time, takes the verify lock,
// appends "in <id>" to one sequence log, holds the lock a while, appends "out <id>" and releases it. If the lock
// is ever held by two runs at once the log shows two "in" lines in a row (appends from different processes are
// ordered by the file system, so the order of the lines is the order of the events).
//   node lock-seq-worker.js <lock module> <lock file> <start at ms> <sequence log> <hold ms> <id>
'use strict';

const fs = require('node:fs');

const [lockModule, file, startAt, sequence, holdMs, id] = process.argv.slice(2);
const { acquireLock, releaseLock } = require(lockModule);

(async () => {
  while (Date.now() < Number(startAt)) {
    // every worker leaves this loop within the same millisecond
  }
  const got = await acquireLock({
    file,
    root: process.cwd(),
    waitMs: 60_000,
    pollMs: 20, // the test is about who gets in, not how long the others sleep
    owner: `w${id}`,
    log: () => {},
  });
  fs.appendFileSync(sequence, `in ${id}\n`);
  await new Promise((resolve) => setTimeout(resolve, Number(holdMs)));
  fs.appendFileSync(sequence, `out ${id}\n`);
  releaseLock(got.handle, () => {});
})();
