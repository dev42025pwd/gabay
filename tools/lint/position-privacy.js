// position-privacy (Blueprint invariant 4, catastrophic set): a shopper's position stays on the
// phone. Only the opt-in analytics module (app/lib/core/analytics/) may combine the position code
// (app/lib/core/positioning/) with network code. Any other file that imports both is refused:
// "network code" is package:dio, anything under core/network/, or dart:io together with HttpClient.
// Imports are resolved to their file, so a relative path or package:<app>/ path cannot hide it.
'use strict';

const path = require('node:path');
const { violation } = require('./lib/context');
const { withoutComments, lineMap } = require('./lib/scan');

const NAME = 'position-privacy';
const LIB = 'app/lib/';
const ANALYTICS = `${LIB}core/analytics/`;
const POSITIONING = `${LIB}core/positioning/`;
const NETWORK = `${LIB}core/network/`;
const DART_IN_LIB = /^app\/lib\/.+\.dart$/;
const IMPORT = /^[ \t]*(?:import|export)\s+(['"])(.+?)\1/gm;

function appPackage(ctx) {
  const pubspec = ctx.exists('app/pubspec.yaml') ? ctx.read('app/pubspec.yaml') : '';
  return /^name:\s*(\w+)/m.exec(pubspec)?.[1] ?? 'gabay';
}

/** An import URI as a repo path (app/lib/...), or as itself for dart: and other packages. */
function resolve(file, uri, pkg) {
  if (uri.startsWith(`package:${pkg}/`)) return LIB + uri.slice(`package:${pkg}/`.length);
  if (/^[a-z]+:/.test(uri)) return uri;
  return path.posix.normalize(path.posix.join(path.posix.dirname(file), uri));
}

function run(ctx) {
  const pkg = appPackage(ctx);
  const found = [];
  for (const file of ctx.list((f) => DART_IN_LIB.test(f) && !f.startsWith(ANALYTICS))) {
    const code = withoutComments(ctx.read(file), 'dart');
    const lineOf = lineMap(code);
    const imports = [...code.matchAll(IMPORT)].map((m) => ({
      uri: m[2],
      target: resolve(file, m[2], pkg),
      line: lineOf(m.index),
    }));
    const position = imports.find((i) => i.target.startsWith(POSITIONING));
    const network = imports.find(
      (i) =>
        i.target.startsWith('package:dio') ||
        i.target.startsWith(NETWORK) ||
        (i.target === 'dart:io' && /\bHttpClient\b/.test(code)),
    );
    if (position && network) {
      found.push(
        violation(
          file,
          network.line,
          NAME,
          `imports network code (${network.uri}) and the position code (${position.uri}, line ${position.line}) outside core/analytics/: position never leaves the phone except through the opt-in analytics module (invariant 4)`,
        ),
      );
    }
  }
  return found;
}

module.exports = { name: NAME, run };
