import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gabay/shared/forms/debounced_search_field.dart';

import '../support/forms_harness.dart';

/// The list's search box: a quiet-period debounce of about 350 ms (standard 4.6).
void main() {
  final seen = <String>[];
  setUp(seen.clear);

  Future<void> pump(WidgetTester tester) => tester.pumpWidget(
    formHarness(
      DebouncedSearchField(label: 'Search venues', onChanged: seen.add),
    ),
  );

  test('the debounce is 350 ms', () {
    expect(kSearchDebounce, const Duration(milliseconds: 350));
  });

  testWidgets('has a visible and screen-reader name', (tester) async {
    final handle = tester.ensureSemantics();
    await pump(tester);
    expect(find.text('Search venues'), findsOneWidget);
    expect(find.bySemanticsLabel('Search venues'), findsOneWidget);
    handle.dispose();
  });

  testWidgets('reports once, after the quiet period, not before', (
    tester,
  ) async {
    await pump(tester);
    await tester.enterText(find.byType(TextField), 'aur');
    await tester.pump(const Duration(milliseconds: 349));
    expect(seen, isEmpty);
    await tester.pump(const Duration(milliseconds: 1));
    expect(seen, ['aur']);
  });

  testWidgets('each keystroke restarts the wait: a burst reports once', (
    tester,
  ) async {
    await pump(tester);
    await tester.enterText(find.byType(TextField), 'a');
    await tester.pump(const Duration(milliseconds: 200));
    await tester.enterText(find.byType(TextField), 'au');
    await tester.pump(const Duration(milliseconds: 200));
    expect(seen, isEmpty);
    await tester.pump(const Duration(milliseconds: 150));
    expect(seen, ['au']);
  });

  testWidgets('the search key reports at once, without waiting', (
    tester,
  ) async {
    await pump(tester);
    await tester.enterText(find.byType(TextField), 'bay');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    expect(seen, ['bay']);
    await tester.pump(kSearchDebounce * 2);
    expect(seen, ['bay'], reason: 'the pending timer was cancelled');
  });

  testWidgets('sends the trimmed text, and never the same text twice', (
    tester,
  ) async {
    await pump(tester);
    await tester.enterText(find.byType(TextField), ' bay ');
    await tester.pump(kSearchDebounce);
    await tester.enterText(find.byType(TextField), 'bay');
    await tester.pump(kSearchDebounce);
    expect(seen, ['bay']);
  });

  testWidgets('clearing the box reports an empty search', (tester) async {
    await pump(tester);
    await tester.enterText(find.byType(TextField), 'bay');
    await tester.pump(kSearchDebounce);
    await tester.enterText(find.byType(TextField), '');
    await tester.pump(kSearchDebounce);
    expect(seen, ['bay', '']);
  });

  testWidgets('leaving the screen cancels a pending report', (tester) async {
    await pump(tester);
    await tester.enterText(find.byType(TextField), 'bay');
    await tester.pumpWidget(const SizedBox());
    await tester.pump(kSearchDebounce * 2);
    expect(seen, isEmpty);
    expect(tester.takeException(), isNull);
  });
}
