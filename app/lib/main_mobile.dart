import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/config/app_config.dart';
import 'core/config/surface_info.dart';
import 'core/config/surface_provider.dart';
import 'core/network/network_providers.dart';
import 'shared/navigation/gabay_app.dart';

/// Shopper app entry point: `flutter run -t lib/main_mobile.dart`.
void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // Resolved before runApp: a release build without API_BASE stops here.
  final apiBase = AppConfig.apiBaseUrl;
  runApp(
    ProviderScope(
      overrides: [
        surfaceProvider.overrideWithValue(SurfaceInfo.mobile),
        apiBaseUrlProvider.overrideWithValue(apiBase),
      ],
      child: const GabayApp(),
    ),
  );
}
