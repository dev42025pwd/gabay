// foreground-manifest (Blueprint "Foreground" rule, invariant 5): Gabay positions only while the
// app is in the foreground. The Android manifests must not ask for background location, a
// location or connected-device foreground service permission, or declare a service whose
// android:foregroundServiceType includes location or connectedDevice. Info.plist must not hold an
// "Always" location key or any UIBackgroundModes entry for location or Bluetooth. An element that
// REMOVES a permission a plugin adds (tools:node="remove") is the right fix and is allowed.
'use strict';

const { violation } = require('./lib/context');
const { lineMap } = require('./lib/scan');

const NAME = 'foreground-manifest';
const MANIFEST = /^app\/android\/.+\/AndroidManifest\.xml$|^app\/android\/AndroidManifest\.xml$/;
const PLIST = /^app\/ios\/.+\/Info\.plist$/;
const BANNED_PERMISSIONS = [
  'ACCESS_BACKGROUND_LOCATION',
  'FOREGROUND_SERVICE_LOCATION',
  'FOREGROUND_SERVICE_CONNECTED_DEVICE',
];
const BANNED_SERVICE_TYPES = ['location', 'connectedDevice'];
const BANNED_PLIST_KEYS = ['NSLocationAlwaysUsageDescription', 'NSLocationAlwaysAndWhenInUseUsageDescription'];
const BANNED_BACKGROUND_MODES = ['location', 'bluetooth-central'];
const REMOVED = /tools:node\s*=\s*["']remove["']/;

/** The file with <!-- comments --> blanked, newlines kept. */
const withoutXmlComments = (text) => text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));

function checkManifest(file, text, found) {
  const lineOf = lineMap(text);
  for (const m of text.matchAll(/<uses-permission\b[^>]*>/g)) {
    const banned = BANNED_PERMISSIONS.find((p) => m[0].includes(p));
    if (banned && !REMOVED.test(m[0])) {
      found.push(violation(file, lineOf(m.index), NAME, `${banned}: Gabay positions in the foreground only (Blueprint Foreground rule); remove it, or tools:node="remove" a plugin's copy`));
    }
  }
  for (const m of text.matchAll(/<service\b[^>]*>/g)) {
    const type = /android:foregroundServiceType\s*=\s*"([^"]*)"/.exec(m[0]);
    if (!type || REMOVED.test(m[0])) continue;
    const bad = type[1].split('|').map((t) => t.trim()).filter((t) => BANNED_SERVICE_TYPES.includes(t));
    if (bad.length) {
      const at = m.index + type.index;
      found.push(violation(file, lineOf(at), NAME, `foregroundServiceType "${bad.join('|')}": no location or connected-device foreground service (Blueprint Foreground rule)`));
    }
  }
}

function checkPlist(file, text, found) {
  const lineOf = lineMap(text);
  for (const key of BANNED_PLIST_KEYS) {
    for (const m of text.matchAll(new RegExp(`<key>\\s*${key}\\s*</key>`, 'g'))) {
      found.push(violation(file, lineOf(m.index), NAME, `${key}: an "Always" location key is not allowed (Blueprint Foreground rule)`));
    }
  }
  for (const modes of text.matchAll(/<key>\s*UIBackgroundModes\s*<\/key>\s*<array>([\s\S]*?)<\/array>/g)) {
    const base = modes.index + modes[0].lastIndexOf(modes[1]);
    for (const mode of modes[1].matchAll(/<string>\s*([^<]*?)\s*<\/string>/g)) {
      if (BANNED_BACKGROUND_MODES.includes(mode[1])) {
        found.push(violation(file, lineOf(base + mode.index), NAME, `UIBackgroundModes "${mode[1]}": no background location or Bluetooth (Blueprint Foreground rule)`));
      }
    }
  }
}

function run(ctx) {
  const found = [];
  for (const file of ctx.list((f) => MANIFEST.test(f))) checkManifest(file, withoutXmlComments(ctx.read(file)), found);
  for (const file of ctx.list((f) => PLIST.test(f))) checkPlist(file, withoutXmlComments(ctx.read(file)), found);
  return found;
}

module.exports = { name: NAME, run };
