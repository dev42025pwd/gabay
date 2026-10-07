// The ONE test that reads the live version and changelog files (the other tests use fixed fixtures; see
// the R1 guard in s5-review2.test.js, which skips this file by name). It is version-independent: it only
// asserts that the stamp's parser still understands the live files, so a rename in them (a different
// constant name, a changed entry shape) cannot silently turn the version stamp off.
'use strict';

const test = require('./timeout');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const stamp = require('../hooks/stamp');

const live = (rel) => fs.readFileSync(path.resolve(__dirname, '..', '..', rel), 'utf8');

test('the live app_version.dart and changelog.dart are still parsed by the stamp (both surfaces)', () => {
  const versionSrc = live(stamp.VERSION_FILE);
  const changelogSrc = live(stamp.CHANGELOG_FILE);
  for (const surface of stamp.SURFACES) {
    const s = stamp.readSurface(versionSrc, changelogSrc, surface);
    assert.match(
      s.fallback ?? '',
      /^\d+\.\d+\.\d+$/,
      `${surface}: a fallback version the stamp can read`,
    );
    assert.ok(Number.isInteger(s.topNumber) && s.topNumber >= 1, `${surface}: a top entry number`);
    assert.match(s.topVersion ?? '', /^\d+\.\d+\.\d+$/, `${surface}: a top entry version`);
    assert.match(s.topDate ?? '', /^\d{4}-\d{2}-\d{2}$/, `${surface}: a top entry date`);
    // And stamping it changes exactly those literals.
    const out = stamp.stampSurface(
      versionSrc,
      changelogSrc,
      surface,
      '9.9.9',
      '2099-01-01',
      s.topNumber,
    );
    const after = stamp.readSurface(out.versionSrc, out.changelogSrc, surface);
    assert.deepEqual(
      [after.fallback, after.topVersion, after.topDate],
      ['9.9.9', '9.9.9', '2099-01-01'],
    );
  }
});
