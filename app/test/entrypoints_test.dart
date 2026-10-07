import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gabay/core/config/app_version.dart';
import 'package:gabay/l10n/app_localizations.dart';
import 'package:gabay/main_admin.dart' as admin;
import 'package:gabay/main_mobile.dart' as mobile;

import 'support/shell_harness.dart';

/// Boots the REAL entry points (`main_mobile.dart` and `main_admin.dart`), not
/// a hand-built copy of their root: it proves each one wires its own surface,
/// the localisation, the router and the version.
void main() {
  late AppLocalizations l10n;
  setUpAll(() async => l10n = await loadEnglish());

  testWidgets('main_mobile boots the shopper shell', (tester) async {
    setLogicalSize(tester, const Size(390, 844));
    mobile.main();
    await tester.pumpAndSettle();

    expect(find.text(l10n.surfaceMobileName), findsOneWidget);
    expect(find.text(l10n.surfaceAdminName), findsNothing);
    expect(
      find.text(l10n.versionLine(AppVersion.mobile.version)),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('main_admin boots the admin shell', (tester) async {
    setLogicalSize(tester, const Size(1024, 768));
    admin.main();
    await tester.pumpAndSettle();

    expect(find.text(l10n.surfaceAdminName), findsOneWidget);
    expect(find.text(l10n.surfaceMobileName), findsNothing);
    expect(
      find.text(l10n.versionLine(AppVersion.admin.version)),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });
}
