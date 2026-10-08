// A worker for the simultaneous-start test (verify-lock-review.test.js): waits for the start time, takes the verify
// lock, holds it for a while and releases it. Two holders at once show as a marker file that already exists.
//   node lock-worker.js <lock module> <lock file> <start at ms> <marker> <overlaps log> <entered log> <hold ms> <id>
'use strict';

const fs = require('node:fs');

const [lockModule, file, startAt, marker, overlaps, entered, holdMs, id] = process.argv.slice(2);
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
  fs.appendFileSync(entered, `${id}\n`);
  try {
    fs.writeFileSync(marker, id, { flag: 'wx' });
  } catch {
    fs.appendFileSync(overlaps, `${id}\n`);
  }
  await new Promise((resolve) => setTimeout(resolve, Number(holdMs)));
  fs.rmSync(marker, { force: true });
  releaseLock(got.handle);
})();
