import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gabay/core/config/surface_info.dart';
import 'package:gabay/l10n/app_localizations.dart';
import 'package:gabay/shared/components/messaging/message_notifier.dart';
import 'package:gabay/shared/components/messaging/message_overlay.dart';

import 'support/shell_harness.dart';

void main() {
  late AppLocalizations l10n;
  setUpAll(() async => l10n = await loadEnglish());

  for (final surface in [SurfaceInfo.mobile, SurfaceInfo.admin]) {
    group('${surface.surface.name} shell', () {
      testWidgets('renders the app name, the surface and the version', (
        tester,
      ) async {
        setLogicalSize(tester, const Size(390, 844));
        await tester.pumpWidget(shellApp(surface));
        await tester.pumpAndSettle();

        expect(find.text(l10n.appName), findsWidgets);
        expect(find.text(surface.displayName(l10n)), findsOneWidget);
        expect(
          find.text(l10n.versionLine(surface.version.version)),
          findsOneWidget,
        );
        expect(find.text(l10n.skeletonStatus), findsOneWidget);
      });

      testWidgets('navigates to /about and back', (tester) async {
        setLogicalSize(tester, const Size(390, 844));
        await tester.pumpWidget(shellApp(surface));
        await tester.pumpAndSettle();

        await tester.tap(find.text(l10n.aboutAction));
        await tester.pumpAndSettle();
        expect(find.text(l10n.aboutTitle), findsOneWidget);
        expect(find.text(l10n.whatsNewTitle), findsOneWidget);
        expect(
          find.text('• ${surface.changelog.first.bullets(l10n).first}'),
          findsOneWidget,
        );

        await tester.tap(find.byTooltip(l10n.backAction));
        await tester.pumpAndSettle();
        expect(find.text(l10n.aboutAction), findsOneWidget);
      });

      testWidgets('nothing overflows at text size x1.4 on a small phone', (
        tester,
      ) async {
        setLogicalSize(tester, const Size(320, 640));
        tester.platformDispatcher.textScaleFactorTestValue = 1.4;
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
        await tester.pumpWidget(shellApp(surface));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);

        await tester.tap(find.text(l10n.aboutAction));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      });

      testWidgets('shows the success and error banners through the overlay', (
        tester,
      ) async {
        final semantics = tester.ensureSemantics();
        setLogicalSize(tester, const Size(390, 844));
        await tester.pumpWidget(shellApp(surface));
        await tester.pumpAndSettle();

        await tester.tap(find.text(l10n.showErrorAction));
        await tester.pump();
        expect(find.textContaining(l10n.sampleError), findsOneWidget);
        // The dismiss control has a screen-reader name.
        expect(
          find.bySemanticsLabel(l10n.messageDismissAction),
          findsOneWidget,
        );

        // A newer message replaces the older one.
        await tester.tap(find.text(l10n.showSuccessAction));
        await tester.pump();
        expect(find.textContaining(l10n.sampleError), findsNothing);
        expect(find.textContaining(l10n.sampleSuccess), findsOneWidget);

        // A screen reader dismisses it through its semantics action.
        tester.semantics.tap(find.semantics.byLabel(l10n.messageDismissAction));
        await tester.pump();
        expect(find.textContaining(l10n.sampleSuccess), findsNothing);

        // A finger dismisses it with a tap on the close icon.
        await tester.tap(find.text(l10n.showErrorAction));
        await tester.pump();
        await tester.tap(find.byIcon(Icons.close));
        await tester.pump();
        expect(find.textContaining(l10n.sampleError), findsNothing);

        // And auto-dismiss on a timer.
        await tester.tap(find.text(l10n.showErrorAction));
        await tester.pump();
        expect(find.textContaining(l10n.sampleError), findsOneWidget);
        await tester.pump(kErrorMessageDuration + const Duration(seconds: 1));
        expect(find.textContaining(l10n.sampleError), findsNothing);
        semantics.dispose();
      });

      testWidgets(
        'the overlay sits above the Navigator, so it covers dialogs',
        (tester) async {
          setLogicalSize(tester, const Size(390, 844));
          await tester.pumpWidget(shellApp(surface));
          await tester.pumpAndSettle();

          expect(
            find.ancestor(
              of: find.byType(Navigator),
              matching: find.byType(MessageOverlay),
            ),
            findsOneWidget,
          );
        },
      );
    });
  }
}
