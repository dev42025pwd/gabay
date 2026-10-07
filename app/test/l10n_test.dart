import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gabay/core/config/changelog.dart';
import 'package:gabay/l10n/app_localizations.dart';

import 'support/shell_harness.dart';

/// The ONE test that pins English text on purpose: it proves the ARB file is
/// wired in and that placeholders render. Every other test reads wording
/// through AppLocalizations.
void main() {
  test('English is the only supported locale until P0-14', () {
    expect(AppLocalizations.supportedLocales, [const Locale('en')]);
  });

  test('the en text and its placeholders come from the ARB file', () async {
    final l10n = await loadEnglish();
    expect(l10n.appName, 'Gabay');
    expect(l10n.versionLine('0.1.0'), 'Version: 0.1.0');
    expect(l10n.validatorRequired('Venue name'), 'Venue name is required.');
    expect(
      l10n.validatorTooLong('Code', 3),
      'Code must be at most 3 characters.',
    );
    expect(l10n.errorForbidden, 'You do not have permission to do that.');
  });

  test('every changelog entry resolves to non-empty bullet text', () async {
    final l10n = await loadEnglish();
    for (final log in [mobileChangelog, adminChangelog]) {
      for (final entry in log) {
        final bullets = entry.bullets(l10n);
        expect(bullets, isNotEmpty, reason: entry.version);
        for (final bullet in bullets) {
          expect(bullet.trim(), isNotEmpty);
        }
      }
    }
  });
}
