import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gabay/core/theme/app_theme.dart';
import 'package:gabay/core/theme/gabay_tokens.dart';

void main() {
  for (final brightness in Brightness.values) {
    group('theme ${brightness.name}', () {
      final theme = buildGabayTheme(brightness);

      test('is Material 3 with the right brightness', () {
        expect(theme.useMaterial3, isTrue);
        expect(theme.colorScheme.brightness, brightness);
      });

      test('applies the seed colour', () {
        final expected = ColorScheme.fromSeed(
          seedColor: GabayTokens.seed,
          brightness: brightness,
        );
        expect(theme.colorScheme.primary, expected.primary);
        expect(theme.colorScheme.surface, expected.surface);
      });

      test('carries the GabayTokens extension for that brightness', () {
        final tokens = theme.extension<GabayTokens>();
        expect(tokens, isNotNull);
        expect(tokens, GabayTokens.forBrightness(brightness));
      });
    });
  }

  test('light and dark tokens differ', () {
    expect(
      GabayTokens.light.successContainer,
      isNot(GabayTokens.dark.successContainer),
    );
  });

  test('tokens lerp and copyWith keep every field', () {
    final mid = GabayTokens.light.lerp(GabayTokens.dark, 0.5);
    expect(mid.infoContainer, isNot(GabayTokens.light.infoContainer));
    final copy = GabayTokens.light.copyWith(
      warningContainer: GabayTokens.dark.warningContainer,
    );
    expect(copy.warningContainer, GabayTokens.dark.warningContainer);
    expect(copy.onWarningContainer, GabayTokens.light.onWarningContainer);
    expect(GabayTokens.light.lerp(null, 0.5), GabayTokens.light);
  });
}
