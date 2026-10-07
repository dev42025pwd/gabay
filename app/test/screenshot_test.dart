import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gabay/core/config/surface_info.dart';

import 'support/shell_harness.dart';

/// Renders PNGs of both empty shells (L121): light and dark, phone and tablet.
///
///   flutter test test/screenshot_test.dart --dart-define=SHOTS_OUT=DIR
///
/// Without SHOTS_OUT the tests still pass and write nothing.
///
/// Fonts: `flutter test` draws text with a blocky placeholder font. For
/// readable screenshots this test (and only this test) loads Roboto and the
/// Material icon font from the Flutter SDK's own bundled material fonts, found
/// through FLUTTER_ROOT. No font asset is added to the app and no package is
/// used.
const String _shotsOut = String.fromEnvironment('SHOTS_OUT');

const Map<String, Size> _devices = {
  'phone': Size(390, 844),
  'tablet': Size(1024, 1366),
};

Future<void> _loadFont(String family, List<String> files) async {
  final root = Platform.environment['FLUTTER_ROOT'];
  if (root == null) return;
  final loader = FontLoader(family);
  for (final name in files) {
    final file = File('$root/bin/cache/artifacts/material_fonts/$name');
    if (file.existsSync()) {
      final bytes = file.readAsBytesSync();
      loader.addFont(Future<ByteData>.value(ByteData.sublistView(bytes)));
    }
  }
  await loader.load();
}

void main() {
  final writing = _shotsOut.isNotEmpty;

  setUpAll(() async {
    if (!writing) return;
    await _loadFont('Roboto', [
      'roboto-regular.ttf',
      'roboto-medium.ttf',
      'roboto-bold.ttf',
      'roboto-light.ttf',
    ]);
    await _loadFont('MaterialIcons', ['materialicons-regular.otf']);
  });

  for (final surface in [SurfaceInfo.mobile, SurfaceInfo.admin]) {
    for (final brightness in Brightness.values) {
      for (final device in _devices.entries) {
        final name = '${surface.surface.name}_${brightness.name}_${device.key}';
        testWidgets('shell screenshot $name', (tester) async {
          setLogicalSize(tester, device.value);
          tester.platformDispatcher.platformBrightnessTestValue = brightness;
          addTearDown(
            tester.platformDispatcher.clearPlatformBrightnessTestValue,
          );

          final boundaryKey = GlobalKey();
          await tester.pumpWidget(
            RepaintBoundary(key: boundaryKey, child: shellApp(surface)),
          );
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);

          if (!writing) return;
          await tester.runAsync(() async {
            final boundary =
                boundaryKey.currentContext!.findRenderObject()!
                    as RenderRepaintBoundary;
            final image = await boundary.toImage(pixelRatio: 1);
            final data = await image.toByteData(format: ui.ImageByteFormat.png);
            final dir = Directory(_shotsOut)..createSync(recursive: true);
            File('${dir.path}/$name.png')
                .writeAsBytesSync(data!.buffer.asUint8List());
          });
        });
      }
    }
  }
}
