// position-privacy (Blueprint invariant 4, catastrophic set): a shopper's position stays on the
// phone. Two rules, both on resolved imports (a relative path, a package:<app>/ path or a barrel
// re-export cannot hide the position code):
//
//   1. ALLOW-LIST (ruling L128). Only files under core/positioning/, core/routing/, core/map3d/,
//      core/analytics/ and features/shopper/ may import or export anything under core/positioning/.
//      Any other importer is a violation.
//   2. CO-IMPORT. Outside core/analytics/, one file may not import the position code AND network
//      code: package:dio, package:http, package:web_socket_channel, package:firebase_*,
//      package:cloud_firestore, anything under core/network/, or dart:io together with
//      HttpClient / Socket / RawSocket / SecureSocket / WebSocket.
//
// Not checked (a review-pass item): the indirect path, a view model that reads the position from a
// service and hands it to another service that talks to the network. Only the analytics module
// may send a position, and only once the shopper has opted in.
'use strict';

const path = require('node:path');
const { violation } = require('./lib/context');
const { withoutComments, codeOnly, lineMap } = require('./lib/scan');

const NAME = 'position-privacy';
const LIB = 'app/lib/';
const ANALYTICS = `${LIB}core/analytics/`;
const POSITIONING = `${LIB}core/positioning/`;
const NETWORK_DIR = `${LIB}core/network/`;
const MAY_IMPORT_POSITION = [
  POSITIONING,
  `${LIB}core/routing/`,
  `${LIB}core/map3d/`,
  ANALYTICS,
  `${LIB}features/shopper/`,
];
const DART_IN_LIB = /^app\/lib\/.+\.dart$/;
const IMPORT = /^[ \t]*(?:import|export)\s+(['"])(.+?)\1/gm;
const NETWORK_PACKAGE = /^package:(dio|http|web_socket_channel|cloud_firestore|firebase_[a-z_]+)\//;
const RAW_SOCKET_USE = /\b(HttpClient|Socket|RawSocket|SecureSocket|WebSocket)\b/;

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
  for (const file of ctx.list((f) => DART_IN_LIB.test(f))) {
    const src = ctx.read(file);
    const text = withoutComments(src, 'dart');
    const lineOf = lineMap(text);
    const imports = [...text.matchAll(IMPORT)].map((m) => ({
      uri: m[2],
      target: resolve(file, m[2], pkg),
      line: lineOf(m.index),
    }));
    const position = imports.filter((i) => i.target.startsWith(POSITIONING));
    if (position.length === 0) continue;

    if (!MAY_IMPORT_POSITION.some((dir) => file.startsWith(dir))) {
      for (const i of position) {
        found.push(
          violation(
            file,
            i.line,
            NAME,
            `only core/positioning, core/routing, core/map3d, core/analytics and features/shopper may import the position code (${i.uri}); position stays on the phone (invariant 4, L128)`,
          ),
        );
      }
    }

    if (file.startsWith(ANALYTICS)) continue;
    const code = codeOnly(src, 'dart');
    const network = imports.find(
      (i) =>
        NETWORK_PACKAGE.test(i.target) ||
        i.target.startsWith(NETWORK_DIR) ||
        (i.target === 'dart:io' && RAW_SOCKET_USE.test(code)),
    );
    if (network) {
      found.push(
        violation(
          file,
          network.line,
          NAME,
          `imports network code (${network.uri}) and the position code (${position[0].uri}, line ${position[0].line}) outside core/analytics/: position never leaves the phone except through the opt-in analytics module (invariant 4)`,
        ),
      );
    }
  }
  return found;
}

module.exports = { name: NAME, run };
