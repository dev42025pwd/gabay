import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gabay/core/config/surface_info.dart';
import 'package:gabay/core/copy/app_copy.dart';
import 'package:gabay/shared/components/messaging/message_notifier.dart';
import 'package:gabay/shared/components/messaging/message_overlay.dart';

import 'support/shell_harness.dart';

void main() {
  for (final surface in [SurfaceInfo.mobile, SurfaceInfo.admin]) {
    group('${surface.surface.name} shell', () {
      testWidgets('renders the app name, the surface and the version', (
        tester,
      ) async {
        setLogicalSize(tester, const Size(390, 844));
        await tester.pumpWidget(shellApp(surface));
        await tester.pumpAndSettle();

        expect(find.text(AppCopy.appName), findsWidgets);
        expect(find.text(surface.displayName), findsOneWidget);
        expect(
          find.text('${AppCopy.versionLabel}: ${surface.version.version}'),
          findsOneWidget,
        );
        expect(find.text(AppCopy.skeletonStatus), findsOneWidget);
      });

      testWidgets('navigates to /about and back', (tester) async {
        setLogicalSize(tester, const Size(390, 844));
        await tester.pumpWidget(shellApp(surface));
        await tester.pumpAndSettle();

        await tester.tap(find.text(AppCopy.aboutAction));
        await tester.pumpAndSettle();
        expect(find.text(AppCopy.aboutTitle), findsOneWidget);
        expect(find.text(AppCopy.whatsNewTitle), findsOneWidget);
        expect(
          find.text('• ${surface.changelog.first.bullets.first}'),
          findsOneWidget,
        );

        await tester.tap(find.byTooltip(AppCopy.backAction));
        await tester.pumpAndSettle();
        expect(find.text(AppCopy.aboutAction), findsOneWidget);
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

        await tester.tap(find.text(AppCopy.aboutAction));
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

        await tester.tap(find.text(AppCopy.showErrorAction));
        await tester.pump();
        expect(find.textContaining(AppCopy.sampleError), findsOneWidget);
        // The dismiss control has a screen-reader name.
        expect(find.bySemanticsLabel(AppCopy.dismissAction), findsOneWidget);

        // A newer message replaces the older one.
        await tester.tap(find.text(AppCopy.showSuccessAction));
        await tester.pump();
        expect(find.textContaining(AppCopy.sampleError), findsNothing);
        expect(find.textContaining(AppCopy.sampleSuccess), findsOneWidget);

        // A screen reader dismisses it through its semantics action.
        tester.semantics.tap(find.semantics.byLabel(AppCopy.dismissAction));
        await tester.pump();
        expect(find.textContaining(AppCopy.sampleSuccess), findsNothing);

        // A finger dismisses it with a tap on the close icon.
        await tester.tap(find.text(AppCopy.showErrorAction));
        await tester.pump();
        await tester.tap(find.byIcon(Icons.close));
        await tester.pump();
        expect(find.textContaining(AppCopy.sampleError), findsNothing);

        // And auto-dismiss on a timer.
        await tester.tap(find.text(AppCopy.showErrorAction));
        await tester.pump();
        expect(find.textContaining(AppCopy.sampleError), findsOneWidget);
        await tester.pump(kErrorMessageDuration + const Duration(seconds: 1));
        expect(find.textContaining(AppCopy.sampleError), findsNothing);
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
