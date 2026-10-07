import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_web_plugins/url_strategy.dart';

import 'core/config/app_config.dart';
import 'core/config/surface_info.dart';
import 'core/config/surface_provider.dart';
import 'core/network/network_providers.dart';
import 'shared/navigation/gabay_app.dart';

/// Admin web entry point: `flutter run -d chrome -t lib/main_admin.dart`.
void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // Clean path URLs (/about, not /#/about) on the admin web page.
  usePathUrlStrategy();
  // Resolved before runApp: a release build without API_BASE stops here.
  final apiBase = AppConfig.apiBaseUrl;
  runApp(
    ProviderScope(
      overrides: [
        surfaceProvider.overrideWithValue(SurfaceInfo.admin),
        apiBaseUrlProvider.overrideWithValue(apiBase),
      ],
      child: const GabayApp(),
    ),
  );
}
