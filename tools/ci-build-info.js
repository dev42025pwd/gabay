#!/usr/bin/env node
// What build.yml stamps into the builds (standard §4.8, §8.3): each surface's version (the committed
// fallback in app/lib/core/config/app_version.dart, the same number the pre-commit hook stamps and the
// changelog's top entry carries), the build number (`git rev-list --count HEAD`), the short commit and the
// build time in UTC. Printed as name=value lines, so a workflow can append them to $GITHUB_OUTPUT.
// app/pubspec.yaml is never stamped (L129): builds pass --build-name and --build-number.
//
// Usage:  node tools/ci-build-info.js            Plain CommonJS, no dependencies, any Node >= 22.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const stamp = require('./hooks/stamp');

const ROOT = path.resolve(__dirname, '..');

const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

/** { mobile_version, admin_version, build_number, git_commit, build_time } for the checkout at `root`. */
function buildInfo(root = ROOT, now = new Date()) {
  const versionSrc = fs.readFileSync(path.join(root, stamp.VERSION_FILE), 'utf8');
  const changelogSrc = fs.readFileSync(path.join(root, stamp.CHANGELOG_FILE), 'utf8');
  const info = {
    mobile_version: stamp.readSurface(versionSrc, changelogSrc, 'mobile').fallback,
    admin_version: stamp.readSurface(versionSrc, changelogSrc, 'admin').fallback,
    build_number: git(root, ['rev-list', '--count', 'HEAD']),
    git_commit: git(root, ['rev-parse', '--short=10', 'HEAD']),
    build_time: now.toISOString().replace(/\.\d+Z$/, 'Z'),
  };
  for (const [key, value] of Object.entries(info)) {
    if (!value) throw new Error(`could not read ${key}`);
  }
  if (!/^\d+$/.test(info.build_number))
    throw new Error(`build_number is not a number: ${info.build_number}`);
  return info;
}

if (require.main === module) {
  try {
    for (const [key, value] of Object.entries(buildInfo())) console.log(`${key}=${value}`);
  } catch (err) {
    console.error(`ci-build-info: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { buildInfo };
