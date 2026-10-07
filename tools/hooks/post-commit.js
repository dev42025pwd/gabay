// The Node half of .githooks/post-commit: brings the REAL index in step with a stamp that pre-commit
// made in a temporary one (`git commit -- <paths>`).
//
// Why: in pathspec mode git computes the real index before pre-commit runs and hooks only see the
// temporary index. After the commit, HEAD and the working files hold the stamp but the real index still
// holds the old version files, so git would show a staged change that REVERSES the stamp. Resetting
// those entries to HEAD (the first version of this hook) also threw away anything the developer had
// staged in the same files on purpose. So instead the recorded decisions are applied to what the real
// index holds: a staged hunk survives, and the stamp is in it. Idempotent; for a plain `git commit` the
// index already equals HEAD and nothing changes.
//
// Never blocks: a failure here is a warning.
//
// Plain CommonJS, no dependencies, any Node >= 22.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const stamp = require('./stamp');

const git = (args, { input } = {}) =>
  execFileSync('git', args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] });

function indexText(rel) {
  try {
    return git(['show', `:${rel}`]);
  } catch {
    return null;
  }
}

function stageBlob(rel, text) {
  const mode = git(['ls-files', '-s', '--', rel]).split(/\s+/)[0] || '100644';
  const sha = git(['hash-object', '-w', '--stdin'], { input: text }).trim();
  git(['update-index', '--cacheinfo', `${mode},${sha},${rel}`]);
}

function main() {
  const marker = path.join(git(['rev-parse', '--absolute-git-dir']).trim(), 'gabay-restage');
  if (!fs.existsSync(marker)) return;
  try {
    const { decisions } = JSON.parse(fs.readFileSync(marker, 'utf8'));
    const versionSrc = indexText(stamp.VERSION_FILE);
    const changelogSrc = indexText(stamp.CHANGELOG_FILE);
    if (versionSrc !== null && changelogSrc !== null) {
      const next = stamp.applyDecisions(versionSrc, changelogSrc, decisions);
      if (next.versionSrc !== versionSrc) stageBlob(stamp.VERSION_FILE, next.versionSrc);
      if (next.changelogSrc !== changelogSrc) stageBlob(stamp.CHANGELOG_FILE, next.changelogSrc);
    }
  } catch (err) {
    console.warn(`post-commit: could not re-apply the version stamp to the index: ${err.message}`);
  } finally {
    fs.rmSync(marker, { force: true });
  }
}

main();
