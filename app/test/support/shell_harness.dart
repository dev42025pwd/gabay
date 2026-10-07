import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gabay/core/config/surface_info.dart';
import 'package:gabay/core/config/surface_provider.dart';
import 'package:gabay/core/network/network_providers.dart';
import 'package:gabay/l10n/app_localizations.dart';
import 'package:gabay/shared/navigation/gabay_app.dart';

/// The same root `main_<surface>.dart` builds, with a fixed API base so no
/// test depends on `API_BASE`.
Widget shellApp(SurfaceInfo surface) => ProviderScope(
  overrides: [
    surfaceProvider.overrideWithValue(surface),
    apiBaseUrlProvider.overrideWithValue('http://api.test.invalid'),
  ],
  child: const GabayApp(),
);

/// Sets a logical window size for the test (device pixel ratio 2).
void setLogicalSize(WidgetTester tester, Size logical, {double dpr = 2}) {
  tester.view.devicePixelRatio = dpr;
  tester.view.physicalSize = Size(logical.width * dpr, logical.height * dpr);
  addTearDown(tester.view.reset);
}

/// The English strings, loaded the way the app loads them. Tests read wording
/// through this, so an ARB edit never needs a test edit (except the one test
/// that deliberately pins the en text: `l10n_test.dart`).
Future<AppLocalizations> loadEnglish() =>
    AppLocalizations.delegate.load(const Locale('en'));
