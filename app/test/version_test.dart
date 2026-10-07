import 'package:flutter_test/flutter_test.dart';
import 'package:gabay/core/config/app_version.dart';
import 'package:gabay/core/config/changelog.dart';
import 'package:gabay/l10n/app_localizations.dart';

import 'support/shell_harness.dart';

// The "Current" marker of the what's-new list must match the running version
// constant exactly (standard 4.8). With no --dart-define the running version
// is the committed fallback, which the pre-commit hook stamps together with
// the top changelog entry.
void main() {
  late AppLocalizations l10n;
  setUpAll(() async => l10n = await loadEnglish());

  final hasDefine = const String.fromEnvironment('APP_VERSION').isNotEmpty;

  group('versions and changelogs', () {
    test('each surface changelog is non-empty with plain bullets', () {
      for (final log in [mobileChangelog, adminChangelog]) {
        expect(log, isNotEmpty);
        for (final entry in log) {
          expect(entry.version, matches(RegExp(r'^\d+\.\d+\.\d+$')));
          expect(entry.date, matches(RegExp(r'^\d{4}-\d{2}-\d{2}$')));
          expect(entry.bullets(l10n), isNotEmpty);
        }
      }
    });

    test('changelogs are newest first', () {
      for (final log in [mobileChangelog, adminChangelog]) {
        final dates = log.map((e) => e.date).toList();
        final sorted = [...dates]..sort((a, b) => b.compareTo(a));
        expect(dates, sorted);
      }
    });

    test('the committed fallback version equals the top changelog entry', () {
      expect(AppVersion.mobile.version, mobileChangelog.first.version);
      expect(AppVersion.admin.version, adminChangelog.first.version);
    }, skip: hasDefine ? 'APP_VERSION is defined for this run' : false);

    test('fallbacks are used when no dart-define is given', () {
      if (hasDefine) return;
      expect(AppVersion.mobile.buildNumber, '0');
      expect(AppVersion.mobile.gitCommit, 'local');
      expect(AppVersion.admin.buildTime, 'unknown');
    });
  });
}
