// position-privacy and foreground-manifest.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { lint, at } = require('./helper');

// ---- position-privacy (invariant 4) ------------------------------------------------------------

const MAP = 'app/lib/features/map/data/map_sync.dart';

test('position-privacy: position code and package:dio in one file outside core/analytics fails on the dio line', () => {
  const dart = `import 'package:flutter/foundation.dart';
import '../../../core/positioning/position_stream.dart';
import 'package:dio/dio.dart';
`;
  const found = lint('position-privacy', { [MAP]: dart });
  assert.deepEqual(at(found), [`${MAP}:3:position-privacy`]);
  assert.match(found[0].message, /position never leaves the phone/);
});

test('position-privacy: a relative or package: path to core/network, or dart:io HttpClient, counts as network', () => {
  const viaNetworkDir = `import 'package:gabay/core/positioning/p.dart';\nimport '../../../core/network/api_client.dart';\n`;
  const viaDartIo = `import 'dart:io';\nimport '../../../core/positioning/p.dart';\nfinal c = HttpClient();\n`;
  const viaPackage = `import 'package:gabay/core/network/api_client.dart';\nimport '../../../core/positioning/p.dart';\n`;
  assert.deepEqual(at(lint('position-privacy', { [MAP]: viaNetworkDir })), [`${MAP}:2:position-privacy`]);
  assert.deepEqual(at(lint('position-privacy', { [MAP]: viaDartIo })), [`${MAP}:1:position-privacy`]);
  assert.deepEqual(at(lint('position-privacy', { [MAP]: viaPackage })), [`${MAP}:1:position-privacy`]);
});

test('position-privacy: the analytics module, position-only, network-only and dart:io without HttpClient pass', () => {
  const both = `import '../positioning/position_stream.dart';\nimport 'package:dio/dio.dart';\n`;
  assert.deepEqual(lint('position-privacy', { 'app/lib/core/analytics/uploader.dart': both }), []);
  assert.deepEqual(lint('position-privacy', { [MAP]: `import '../../../core/positioning/p.dart';\n` }), []);
  assert.deepEqual(lint('position-privacy', { [MAP]: `import 'package:dio/dio.dart';\n` }), []);
  assert.deepEqual(
    lint('position-privacy', { [MAP]: `import 'dart:io';\nimport '../../../core/positioning/p.dart';\nfinal f = File('x');\n` }),
    [],
  );
  assert.deepEqual(lint('position-privacy', { [MAP]: `// import 'package:dio/dio.dart';\nimport '../../../core/positioning/p.dart';\n` }), []);
});

test('position-privacy: the app package name is read from pubspec.yaml', () => {
  const dart = `import 'package:wayfinder/core/positioning/p.dart';\nimport 'package:dio/dio.dart';\n`;
  assert.equal(lint('position-privacy', { 'app/pubspec.yaml': 'name: wayfinder\n', [MAP]: dart }).length, 1);
});

// ---- foreground-manifest (Foreground rule) -----------------------------------------------------

const MANIFEST = 'app/android/app/src/main/AndroidManifest.xml';
const PLIST = 'app/ios/Runner/Info.plist';

test('foreground-manifest: background location and a location foreground service fail on their lines', () => {
  const xml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
  <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
  <uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION"/>
</manifest>
`;
  assert.deepEqual(at(lint('foreground-manifest', { [MANIFEST]: xml })), [
    `${MANIFEST}:3:foreground-manifest`,
    `${MANIFEST}:4:foreground-manifest`,
  ]);
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

test('foreground-manifest: foreground-only manifests, removed plugin permissions, comments and build output pass', () => {
  const xml = `<manifest xmlns:tools="http://schemas.android.com/tools">
  <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
  <uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
  <!-- <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" /> -->
  <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" tools:node="remove" />
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
