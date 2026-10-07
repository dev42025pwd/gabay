import 'package:flutter/material.dart';

import 'gabay_tokens.dart';

/// One build function for both brightnesses (standard §4.7): Material 3,
/// `ColorScheme.fromSeed`, and the [GabayTokens] extension for that
/// brightness. Read `colorScheme` only (the legacy primary-colour getter turns
/// invisible in dark mode).
ThemeData buildGabayTheme(Brightness brightness) {
  final scheme = ColorScheme.fromSeed(
    seedColor: GabayTokens.seed,
    brightness: brightness,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    extensions: <ThemeExtension<dynamic>>[
      GabayTokens.forBrightness(brightness),
    ],
  );
}

/// Light theme for `MaterialApp.theme`.
ThemeData get gabayLightTheme => buildGabayTheme(Brightness.light);

/// Dark theme for `MaterialApp.darkTheme`.
ThemeData get gabayDarkTheme => buildGabayTheme(Brightness.dark);
