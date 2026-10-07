// position-privacy and foreground-manifest.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { lint, at } = require('./helper');

// ---- position-privacy (invariant 4; allow-list ruled by L128) ----------------------------------

const SHOPPER = 'app/lib/features/shopper/map/map_sync.dart';
const OTHER = 'app/lib/features/venue/data/venue_sync.dart';
const POS = (depthUp) => `import '${'../'.repeat(depthUp)}core/positioning/position_stream.dart';\n`;

test('position-privacy (I5): only positioning, routing, map3d, analytics and features/shopper may import the position code', () => {
  const allowed = [
    'app/lib/core/positioning/fusion.dart',
    'app/lib/core/routing/route_service.dart',
    'app/lib/core/map3d/map_view.dart',
    'app/lib/core/analytics/uploader.dart',
    SHOPPER,
  ];
  const relative = (file) => {
    const depth = file.split('/').length - 3; // app/lib/<...>/file.dart -> how far up to lib/
    return `import '${'../'.repeat(depth)}core/positioning/position_stream.dart';\n`;
  };
  for (const file of allowed) assert.deepEqual(lint('position-privacy', { [file]: relative(file) }), [], file);
});

test('position-privacy (I5): any other importer fails on the import line, whatever way it is written', () => {
  const cases = {
    relative: [OTHER, POS(3)],
    'package:': [OTHER, "import 'package:gabay/core/positioning/position_stream.dart';\n"],
    'a barrel re-export': ['app/lib/features/venue/barrel.dart', "export 'package:gabay/core/positioning/position_stream.dart';\n"],
    'a view': ['app/lib/features/venue/views/v.dart', "import 'x.dart';\nimport '../../../core/positioning/p.dart';\n"],
    'shared/': ['app/lib/shared/widgets/w.dart', "import '../../core/positioning/p.dart';\n"],
  };
  for (const [name, [file, dart]] of Object.entries(cases)) {
    const found = lint('position-privacy', { [file]: dart });
    const line = dart.trimEnd().split('\n').length;
    assert.deepEqual(at(found), [`${file}:${line}:position-privacy`], name);
    assert.match(found[0].message, /may import the position code/);
  }
});

test('position-privacy: position code and package:dio in one file fails on the network line (co-import rule)', () => {
  const dart = `import 'package:flutter/foundation.dart';
${POS(3)}import 'package:dio/dio.dart';
`;
  const found = lint('position-privacy', { [SHOPPER]: dart });
  assert.deepEqual(at(found), [`${SHOPPER}:3:position-privacy`]);
  assert.match(found[0].message, /position never leaves the phone/);
});

test('position-privacy (I5): the network set covers http, web sockets, firebase_*, firestore, core/network and dart:io sockets', () => {
  const network = [
    "import 'package:http/http.dart' as http;",
    "import 'package:web_socket_channel/web_socket_channel.dart';",
    "import 'package:firebase_core/firebase_core.dart';",
    "import 'package:firebase_auth/firebase_auth.dart';",
    "import 'package:cloud_firestore/cloud_firestore.dart';",
    "import '../../../core/network/api_client.dart';",
    "import 'package:gabay/core/network/api_client.dart';",
    "import 'dart:io';\nfinal c = HttpClient();",
    "import 'dart:io';\nfinal s = Socket.connect('h', 1);",
    "import 'dart:io';\nfinal w = WebSocket.connect('ws://h');",
  ];
  for (const net of network) {
    const dart = `import '../../../core/positioning/p.dart';\n${net}\n`;
    const found = lint('position-privacy', { [SHOPPER]: dart });
    // The network import is always line 2 (for dart:io, the import line, not the HttpClient line).
    assert.deepEqual(at(found), [`${SHOPPER}:2:position-privacy`], net);
    assert.match(found[0].message, /position never leaves the phone/, net);
  }
});

test('position-privacy: the analytics module may combine them; position-only, network-only, plain dart:io and comments pass', () => {
  const both = `import '../positioning/position_stream.dart';\nimport 'package:dio/dio.dart';\n`;
  assert.deepEqual(lint('position-privacy', { 'app/lib/core/analytics/uploader.dart': both }), []);
  assert.deepEqual(lint('position-privacy', { [SHOPPER]: POS(3) }), []);
  assert.deepEqual(lint('position-privacy', { [OTHER]: `import 'package:dio/dio.dart';\n` }), []);
  assert.deepEqual(
    lint('position-privacy', { [SHOPPER]: `import 'dart:io';\n${POS(3)}final f = File('x');\n` }),
    [],
  );
  assert.deepEqual(lint('position-privacy', { [SHOPPER]: `// import 'package:dio/dio.dart';\n${POS(3)}` }), []);
  assert.deepEqual(lint('position-privacy', { [OTHER]: `// import '../../../core/positioning/p.dart';\n` }), []);
});

test('position-privacy: the app package name is read from pubspec.yaml', () => {
  const dart = `import 'package:wayfinder/core/positioning/p.dart';\n`;
  assert.equal(lint('position-privacy', { 'app/pubspec.yaml': 'name: wayfinder\n', [OTHER]: dart }).length, 1);
});

// ---- foreground-manifest (Foreground rule) -----------------------------------------------------

const MANIFEST = 'app/android/app/src/main/AndroidManifest.xml';
const PLIST = 'app/ios/Runner/Info.plist';

test('foreground-manifest: background location and location or connected-device foreground services fail on their lines', () => {
  const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
  <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
  <uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION"/>
  <uses-permission android:name="android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE"/>
</manifest>
`;
  assert.deepEqual(at(lint('foreground-manifest', { [MANIFEST]: xml })), [
    `${MANIFEST}:3:foreground-manifest`,
    `${MANIFEST}:4:foreground-manifest`,
    `${MANIFEST}:5:foreground-manifest`,
  ]);
});

test('foreground-manifest (I6): android:foregroundServiceType with location or connectedDevice fails, however the list is written', () => {
  for (const type of ['location', 'connectedDevice', 'dataSync|location', 'location|connectedDevice']) {
    const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application>
    <service
        android:name=".Tracker"
        android:foregroundServiceType="${type}" />
  </application>
</manifest>
`;
    const found = lint('foreground-manifest', { [MANIFEST]: xml });
    assert.deepEqual(at(found), [`${MANIFEST}:5:foreground-manifest`], type); // the attribute's line
  }
  const fine = '<manifest xmlns:android="x"><service android:name=".S" android:foregroundServiceType="dataSync" /></manifest>\n';
  assert.deepEqual(lint('foreground-manifest', { [MANIFEST]: fine }), []);
});

test('foreground-manifest: any AndroidManifest.xml under app/android is checked (debug, profile)', () => {
  const xml = '<manifest>\n<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION"/>\n</manifest>\n';
  const found = lint('foreground-manifest', { 'app/android/app/src/debug/AndroidManifest.xml': xml });
  assert.deepEqual(at(found), ['app/android/app/src/debug/AndroidManifest.xml:2:foreground-manifest']);
});

test('foreground-manifest: Always keys and background modes for location or Bluetooth fail in Info.plist', () => {
  const plist = `<plist><dict>
  <key>NSLocationWhenInUseUsageDescription</key><string>Find shops</string>
  <key>NSLocationAlwaysUsageDescription</key><string>no</string>
  <key>NSLocationAlwaysAndWhenInUseUsageDescription</key><string>no</string>
  <key>UIBackgroundModes</key>
  <array>
    <string>fetch</string>
    <string>location</string>
    <string>bluetooth-central</string>
  </array>
</dict></plist>
`;
  assert.deepEqual(at(lint('foreground-manifest', { [PLIST]: plist })), [
    `${PLIST}:3:foreground-manifest`,
    `${PLIST}:4:foreground-manifest`,
    `${PLIST}:8:foreground-manifest`,
    `${PLIST}:9:foreground-manifest`,
  ]);
});

test('foreground-manifest (I6): keys with whitespace inside the tag and every UIBackgroundModes array are checked', () => {
  const plist = `<plist><dict>
  <key> NSLocationAlwaysUsageDescription </key><string>no</string>
  <key>
    NSLocationAlwaysAndWhenInUseUsageDescription
  </key><string>no</string>
  <key>UIBackgroundModes</key><array><string>fetch</string></array>
  <key>UIBackgroundModes</key>
  <array>
    <string> location </string>
  </array>
</dict></plist>
`;
  assert.deepEqual(at(lint('foreground-manifest', { [PLIST]: plist })), [
    `${PLIST}:2:foreground-manifest`,
    `${PLIST}:3:foreground-manifest`,
    `${PLIST}:9:foreground-manifest`,
  ]);
});

test('foreground-manifest: foreground-only manifests, removed plugin permissions, comments and build output pass', () => {
  const xml = `<manifest xmlns:tools="http://schemas.android.com/tools">
  <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
  <uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
  <!-- <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" /> -->
  <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" tools:node="remove" />
  <uses-permission android:name="android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE" tools:node="remove" />
</manifest>
`;
  const plist = `<plist><dict>
  <key>NSLocationWhenInUseUsageDescription</key><string>Find shops</string>
  <key>UIBackgroundModes</key><array><string>fetch</string></array>
</dict></plist>
`;
  const bad = '<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION"/>\n';
  assert.deepEqual(
    lint('foreground-manifest', {
      [MANIFEST]: xml,
      [PLIST]: plist,
      'app/android/build/AndroidManifest.xml': bad,
      'app/ios/Pods/x/Info.plist': '<key>NSLocationAlwaysUsageDescription</key>\n',
    }),
    [],
  );
});
