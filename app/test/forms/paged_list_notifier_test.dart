import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gabay/shared/components/paged_list_notifier.dart';

/// The list's fetch lifecycle (standard 4.6): pages, search, and an
/// incrementing fetch ticket so a slow, older answer never overwrites a newer one.
typedef _Fetch = Future<PageResult<String>> Function(String search, int page);

class _Names extends PagedListNotifier<String> {
  static late _Fetch handler;

  @override
  Future<PageResult<String>> fetchPage({
    required String search,
    required int page,
  }) => handler(search, page);
}

final _provider = AsyncNotifierProvider<_Names, PagedList<String>>(_Names.new);

PageResult<String> _page(List<String> items, int page, int total) =>
    PageResult(items: items, totalCount: total, page: page, pageSize: 2);

void main() {
  late ProviderContainer container;
  late List<(String, int)> calls;

  setUp(() {
    calls = [];
    container = ProviderContainer();
    addTearDown(container.dispose);
  });

  PagedList<String> value() => container.read(_provider).requireValue;

  /// Four rows in pages of two.
  void fourRows() => _Names.handler = (search, page) async {
    calls.add((search, page));
    return page == 1 ? _page(['a', 'b'], 1, 4) : _page(['c', 'd'], 2, 4);
  };

  test('loads page 1 with an empty search', () async {
    fourRows();
    await container.read(_provider.future);
    expect(calls, [('', 1)]);
    expect(value().items, ['a', 'b']);
    expect(value().hasMore, isTrue);
  });

  test('loadMore appends the next page, then there is no more', () async {
    fourRows();
    await container.read(_provider.future);
    await container.read(_provider.notifier).loadMore();
    expect(calls, [('', 1), ('', 2)]);
    expect(value().items, ['a', 'b', 'c', 'd']);
    expect(value().hasMore, isFalse);

    await container.read(_provider.notifier).loadMore();
    expect(calls.length, 2, reason: 'nothing left to ask for');
  });

  test('loadMore while one is running asks only once', () async {
    final second = Completer<PageResult<String>>();
    _Names.handler = (search, page) {
      calls.add((search, page));
      return page == 1 ? Future.value(_page(['a', 'b'], 1, 4)) : second.future;
    };
    await container.read(_provider.future);
    final notifier = container.read(_provider.notifier);
    final first = notifier.loadMore();
    expect(value().isLoadingMore, isTrue);
    await notifier.loadMore();
    second.complete(_page(['c', 'd'], 2, 4));
    await first;
    expect(calls, [('', 1), ('', 2)]);
    expect(value().isLoadingMore, isFalse);
  });

  test('setSearch goes back to page 1 with the new text', () async {
    fourRows();
    await container.read(_provider.future);
    await container.read(_provider.notifier).loadMore();
    await container.read(_provider.notifier).setSearch('aur');
    expect(calls.last, ('aur', 1));
    expect(value().items, ['a', 'b']);
    expect(value().search, 'aur');
  });

  test('setSearch shows the loading state while it fetches', () async {
    fourRows();
    await container.read(_provider.future);
    final slow = Completer<PageResult<String>>();
    _Names.handler = (_, _) => slow.future;
    final pending = container.read(_provider.notifier).setSearch('x');
    expect(container.read(_provider).isLoading, isTrue);
    slow.complete(_page([], 1, 0));
    await pending;
    expect(value().items, isEmpty);
  });

  test('the same search again does not fetch again', () async {
    fourRows();
    await container.read(_provider.future);
    await container.read(_provider.notifier).setSearch('');
    expect(calls, [('', 1)]);
  });

  test('a slow older search never overwrites a newer one (ticket)', () async {
    fourRows();
    await container.read(_provider.future);
    final slow = Completer<PageResult<String>>();
    _Names.handler = (search, page) =>
        search == 'old' ? slow.future : Future.value(_page(['new-row'], 1, 1));
    final notifier = container.read(_provider.notifier);
    final older = notifier.setSearch('old');
    await notifier.setSearch('new');
    slow.complete(_page(['old-row'], 1, 1));
    await older;
    expect(value().items, ['new-row']);
    expect(value().search, 'new');
  });

  test('a page that arrives after a new search is dropped (ticket)', () async {
    final slowSecond = Completer<PageResult<String>>();
    _Names.handler = (search, page) {
      if (search.isEmpty && page == 2) return slowSecond.future;
      return Future.value(
        search.isEmpty ? _page(['a', 'b'], 1, 4) : _page(['hit'], 1, 1),
      );
    };
    await container.read(_provider.future);
    final notifier = container.read(_provider.notifier);
    final more = notifier.loadMore();
    await notifier.setSearch('hit');
    slowSecond.complete(_page(['c', 'd'], 2, 4));
    await more;
    expect(value().items, ['hit']);
    expect(value().isLoadingMore, isFalse);
  });

  test(
    'a search made before the first page arrives wins, with no error',
    () async {
      final slowFirst = Completer<PageResult<String>>();
      _Names.handler = (search, page) => search.isEmpty
          ? slowFirst.future
          : Future.value(_page(['hit'], 1, 1));
      final first = container.read(_provider.future);
      final searched = container.read(_provider.notifier).setSearch('hit');
      await searched;
      slowFirst.complete(_page(['a', 'b'], 1, 4));
      await first.then<void>((_) {}, onError: (_) {});
      await Future<void>.delayed(Duration.zero);
      expect(container.read(_provider).hasError, isFalse);
      expect(value().items, ['hit']);
    },
  );

  test('a failed first load is an error; reload recovers', () async {
    _Names.handler = (_, _) async => throw StateError('down');
    await expectLater(container.read(_provider.future), throwsStateError);
    expect(container.read(_provider).hasError, isTrue);

    fourRows();
    await container.read(_provider.notifier).reload();
    expect(value().items, ['a', 'b']);
  });

  test('a failed next page keeps the rows; loadMore tries again', () async {
    var failNext = true;
    _Names.handler = (search, page) async {
      if (page == 1) return _page(['a', 'b'], 1, 4);
      if (failNext) throw StateError('down');
      return _page(['c', 'd'], 2, 4);
    };
    await container.read(_provider.future);
    final notifier = container.read(_provider.notifier);
    await notifier.loadMore();
    expect(value().items, ['a', 'b']);
    expect(value().loadMoreFailed, isTrue);
    expect(value().isLoadingMore, isFalse);

    failNext = false;
    await notifier.loadMore();
    expect(value().items, ['a', 'b', 'c', 'd']);
    expect(value().loadMoreFailed, isFalse);
  });

  test('reload after a failed search asks for the same search again', () async {
    fourRows();
    await container.read(_provider.future);
    _Names.handler = (_, _) async => throw StateError('down');
    await container.read(_provider.notifier).setSearch('aur');
    expect(container.read(_provider).hasError, isTrue);

    fourRows();
    await container.read(_provider.notifier).reload();
    expect(calls.last, ('aur', 1));
  });

  test(
    'an older request failing late does not replace a newer answer',
    () async {
      fourRows();
      await container.read(_provider.future);
      final slow = Completer<PageResult<String>>();
      _Names.handler = (search, page) => search == 'old'
          ? slow.future
          : Future.value(_page(['new-row'], 1, 1));
      final notifier = container.read(_provider.notifier);
      final older = notifier.setSearch('old');
      await notifier.setSearch('new');
      slow.completeError(StateError('late'));
      await older;
      expect(container.read(_provider).hasError, isFalse);
      expect(value().items, ['new-row']);
    },
  );

  test('reload keeps the current search', () async {
    fourRows();
    await container.read(_provider.future);
    await container.read(_provider.notifier).setSearch('aur');
    await container.read(_provider.notifier).reload();
    expect(calls.last, ('aur', 1));
  });

  test('empty result: no rows, nothing more', () async {
    _Names.handler = (_, _) async => _page([], 1, 0);
    await container.read(_provider.future);
    expect(value().items, isEmpty);
    expect(value().hasMore, isFalse);
  });
}
