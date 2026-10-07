import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gabay/shared/components/module_list_scaffold.dart';
import 'package:gabay/shared/components/routed_form_scaffold.dart';

// Phase 1 stubs: the tests pin the contract Phase 3 fills in.
void main() {
  Widget list(AsyncValue<List<String>> items, {VoidCallback? onRetry}) =>
      MaterialApp(
        home: ModuleListScaffold<String>(
          title: 'Venues',
          items: items,
          itemBuilder: (context, item) => ListTile(title: Text(item)),
          emptyLabel: 'Nothing here yet',
          retryLabel: 'Try again',
          errorText: 'Could not load',
          onRetry: onRetry ?? () {},
        ),
      );

  group('ModuleListScaffold', () {
    testWidgets('loading shows a progress indicator', (tester) async {
      await tester.pumpWidget(list(const AsyncLoading<List<String>>()));
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('error shows the text and a working retry', (tester) async {
      var retried = 0;
      await tester.pumpWidget(
        list(
          const AsyncError<List<String>>('x', StackTrace.empty),
          onRetry: () => retried++,
        ),
      );
      expect(find.text('Could not load'), findsOneWidget);
      await tester.tap(find.text('Try again'));
      expect(retried, 1);
    });

    testWidgets('empty shows the empty label', (tester) async {
      await tester.pumpWidget(list(const AsyncData<List<String>>([])));
      expect(find.text('Nothing here yet'), findsOneWidget);
    });

    testWidgets('data shows one row per item', (tester) async {
      await tester.pumpWidget(list(const AsyncData<List<String>>(['A', 'B'])));
      expect(find.text('A'), findsOneWidget);
      expect(find.text('B'), findsOneWidget);
    });
  });

  group('RoutedFormScaffold', () {
    testWidgets('submits, and disables the button while submitting', (
      tester,
    ) async {
      var submitted = 0;
      Widget form({required bool busy}) => MaterialApp(
        home: RoutedFormScaffold(
          title: 'Edit venue',
          formKey: GlobalKey<FormState>(),
          submitLabel: 'Save',
          isSubmitting: busy,
          onSubmit: () => submitted++,
          children: const [Text('field slot')],
        ),
      );

      await tester.pumpWidget(form(busy: false));
      await tester.tap(find.text('Save'));
      expect(submitted, 1);

      await tester.pumpWidget(form(busy: true));
      await tester.tap(find.text('Save'));
      expect(submitted, 1);
      expect(find.text('field slot'), findsOneWidget);
    });
  });
}
