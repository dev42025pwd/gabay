import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gabay/l10n/app_localizations.dart';
import 'package:gabay/shared/components/module_list_scaffold.dart';
import 'package:gabay/shared/forms/debounced_search_field.dart';

import '../support/forms_harness.dart';
import '../support/shell_harness.dart';

/// What S9 adds to the list scaffold: search with debounce, paging, and the
/// four states around them. The Phase 1 contract (no search, no paging) stays
/// pinned by `scaffolds_test.dart`, which is unchanged.
void main() {
  late AppLocalizations l10n;
  setUpAll(() async => l10n = await loadEnglish());

  final searches = <String>[];
  var loadMores = 0;
  var retries = 0;
  setUp(() {
    searches.clear();
    loadMores = 0;
    retries = 0;
  });

  Widget list(
    AsyncValue<List<String>> items, {
    bool withSearch = true,
    ListPaging? paging,
    double textScale = 1,
  }) => screenHarness(
    textScale: textScale,
    ModuleListScaffold<String>(
      title: 'Venues',
      items: items,
      itemBuilder: (context, item) => ListTile(title: Text(item)),
      emptyLabel: 'Nothing here yet',
      retryLabel: 'Try again',
      errorText: 'Could not load',
      onRetry: () => retries++,
      search: withSearch
          ? ListSearch(label: 'Search venues', onChanged: searches.add)
          : null,
      paging: paging,
    ),
  );

  ListPaging paging({
    bool hasMore = true,
    bool isLoadingMore = false,
    bool failed = false,
  }) => ListPaging(
    hasMore: hasMore,
    isLoadingMore: isLoadingMore,
    loadMoreFailed: failed,
    loadMoreLabel: 'Load more',
    onLoadMore: () => loadMores++,
  );

  group('the four states, with the search box above them', () {
    testWidgets('loading: indicator, and the search box stays', (tester) async {
      await tester.pumpWidget(list(const AsyncLoading<List<String>>()));
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('Search venues'), findsOneWidget);
    });

    testWidgets('error: text, a working retry, and the search box stays', (
      tester,
    ) async {
      await tester.pumpWidget(
        list(const AsyncError<List<String>>('x', StackTrace.empty)),
      );
      expect(find.text('Could not load'), findsOneWidget);
      await tester.tap(find.text('Try again'));
      expect(retries, 1);
      expect(find.text('Search venues'), findsOneWidget);
    });

    testWidgets('empty: the empty label, and the search box stays', (
      tester,
    ) async {
      await tester.pumpWidget(list(const AsyncData<List<String>>([])));
      expect(find.text('Nothing here yet'), findsOneWidget);
      expect(find.text('Search venues'), findsOneWidget);
    });

    testWidgets('data: one row per item', (tester) async {
      await tester.pumpWidget(list(const AsyncData<List<String>>(['A', 'B'])));
      expect(find.text('A'), findsOneWidget);
      expect(find.text('B'), findsOneWidget);
    });

    testWidgets('no search given: no search box (the Phase 1 shape)', (
      tester,
    ) async {
      await tester.pumpWidget(
        list(const AsyncData<List<String>>(['A']), withSearch: false),
      );
      expect(find.byType(DebouncedSearchField), findsNothing);
    });
  });

  group('search', () {
    testWidgets('typing reports after the debounce, once', (tester) async {
      await tester.pumpWidget(list(const AsyncData<List<String>>(['A'])));
      await tester.enterText(find.byType(TextField), 'aur');
      await tester.pump(const Duration(milliseconds: 300));
      expect(searches, isEmpty);
      await tester.pump(const Duration(milliseconds: 60));
      expect(searches, ['aur']);
    });

    testWidgets('the box keeps its text while the list reloads', (
      tester,
    ) async {
      await tester.pumpWidget(list(const AsyncData<List<String>>(['A'])));
      await tester.enterText(find.byType(TextField), 'aur');
      await tester.pumpWidget(list(const AsyncLoading<List<String>>()));
      expect(find.text('aur'), findsOneWidget);
    });
  });

  group('paging', () {
    testWidgets('more rows exist: a Load more button after the rows', (
      tester,
    ) async {
      await tester.pumpWidget(
        list(const AsyncData<List<String>>(['A']), paging: paging()),
      );
      await tester.tap(find.text('Load more'));
      expect(loadMores, 1);
    });

    testWidgets('the last page: no Load more button', (tester) async {
      await tester.pumpWidget(
        list(
          const AsyncData<List<String>>(['A']),
          paging: paging(hasMore: false),
        ),
      );
      expect(find.text('Load more'), findsNothing);
    });

    testWidgets('loading the next page: a progress row, no button', (
      tester,
    ) async {
      await tester.pumpWidget(
        list(
          const AsyncData<List<String>>(['A']),
          paging: paging(isLoadingMore: true),
        ),
      );
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('Load more'), findsNothing);
    });

    testWidgets('the next page failed: rows stay, the error and a retry show', (
      tester,
    ) async {
      await tester.pumpWidget(
        list(
          const AsyncData<List<String>>(['A']),
          paging: paging(failed: true),
        ),
      );
      expect(find.text('A'), findsOneWidget);
      expect(find.text('Could not load'), findsOneWidget);
      await tester.tap(find.text('Try again'));
      expect(loadMores, 1);
      expect(retries, 0, reason: 'a failed next page retries the page only');
    });

    testWidgets('empty list: no footer even when told there is more', (
      tester,
    ) async {
      await tester.pumpWidget(
        list(const AsyncData<List<String>>([]), paging: paging()),
      );
      expect(find.text('Load more'), findsNothing);
    });
  });

  // Review finding 7: a progress ring with no name is silent for a screen reader.
  group('screen-reader names', () {
    testWidgets('the loading spinner is named', (tester) async {
      final handle = tester.ensureSemantics();
      await tester.pumpWidget(list(const AsyncLoading<List<String>>()));
      expect(find.bySemanticsLabel(l10n.loadingLabel), findsOneWidget);
      handle.dispose();
    });

    testWidgets('the loading-more spinner in the footer is named', (
      tester,
    ) async {
      final handle = tester.ensureSemantics();
      await tester.pumpWidget(
        list(
          const AsyncData<List<String>>(['A']),
          paging: paging(isLoadingMore: true),
        ),
      );
      expect(find.bySemanticsLabel(l10n.loadingLabel), findsOneWidget);
      handle.dispose();
    });
  });

  group('layout', () {
    testWidgets('nothing overflows at text size x1.4 on a 320 px phone', (
      tester,
    ) async {
      setLogicalSize(tester, const Size(320, 640));
      await tester.pumpWidget(
        list(
          const AsyncData<List<String>>(['A', 'B']),
          paging: paging(failed: true),
          textScale: 1.4,
        ),
      );
      expect(tester.takeException(), isNull);
    });
  });
}
