import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import '../../l10n/app_localizations.dart';
import '../components/messaging/message_overlay.dart';
import 'app_router.dart';

/// The root widget both surfaces share. Wrap it in ONE `ProviderScope` that
/// overrides `surfaceProvider` (and, in `main`, `apiBaseUrlProvider`).
class GabayApp extends ConsumerWidget {
  const GabayApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      onGenerateTitle: (context) => AppLocalizations.of(context).appName,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      // The debug ribbon covers the app bar's right edge in debug runs and in
      // the test-rendered screenshots; release builds never show it anyway.
      debugShowCheckedModeBanner: false,
      theme: gabayLightTheme,
      darkTheme: gabayDarkTheme,
      themeMode: ThemeMode.system,
      routerConfig: ref.watch(routerProvider),
      // The ONE messaging surface, above the Navigator (standard 4.6).
      builder: (context, child) => MessageOverlay(child: child),
    );
  }
}
