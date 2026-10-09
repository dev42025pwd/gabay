import 'package:flutter_riverpod/flutter_riverpod.dart';

/// One page as the API sends it (`{ items, totalCount, page, pageSize }`,
/// standard 3.11, `functions/src/utils/pagination.js`), with the rows already
/// parsed to [T] by the service.
class PageResult<T> {
  const PageResult({
    required this.items,
    required this.totalCount,
    required this.page,
    required this.pageSize,
  });

  final List<T> items;
  final int totalCount;
  final int page;
  final int pageSize;
}

/// What a list screen shows: the rows loaded so far, for the current search.
class PagedList<T> {
  const PagedList({
    required this.items,
    required this.search,
    required this.page,
    required this.totalCount,
    this.isLoadingMore = false,
    this.loadMoreFailed = false,
  });

  final List<T> items;

  /// The search these rows answer ('' for none).
  final String search;

  /// The last page loaded, from 1.
  final int page;

  final int totalCount;

  /// The next page is being fetched.
  final bool isLoadingMore;

  /// The last attempt at the next page failed; the rows above are still good.
  final bool loadMoreFailed;

  bool get hasMore => items.length < totalCount;

  PagedList<T> copyWith({
    List<T>? items,
    int? page,
    int? totalCount,
    bool? isLoadingMore,
    bool? loadMoreFailed,
  }) => PagedList(
    items: items ?? this.items,
    search: search,
    page: page ?? this.page,
    totalCount: totalCount ?? this.totalCount,
    isLoadingMore: isLoadingMore ?? this.isLoadingMore,
    loadMoreFailed: loadMoreFailed ?? this.loadMoreFailed,
  );
}

/// The fetch lifecycle of a list (standard 4.6): the first page, search, the
/// next page, reload, and an incrementing fetch ticket so an answer that
/// arrives after a newer request was made is dropped, never shown.
///
/// A list's ViewModel extends this and supplies [fetchPage] (a call to its
/// service); the view watches the provider and hands it to `ModuleListScaffold`.
///
///     class VenuesViewModel extends PagedListNotifier<Venue> {
///       @override
///       Future<PageResult<Venue>> fetchPage({required String search, required int page}) =>
///           ref.read(venueServiceProvider).list(search: search, page: page);
///     }
///
/// Not here (Phase 3): sort, filters, view modes, and refreshing when the user
/// comes back to the list.
abstract class PagedListNotifier<T> extends AsyncNotifier<PagedList<T>> {
  int _ticket = 0;

  /// The search the user last asked for, kept so a reload after an error
  /// (which has no rows to read it from) asks for the same thing.
  String _search = '';

  /// Fetches [page] (from 1) of the rows matching [search] ('' for all).
  Future<PageResult<T>> fetchPage({required String search, required int page});

  @override
  Future<PagedList<T>> build() async {
    final first = await _first('');
    // Superseded while loading: a newer request owns the state. Hand it back
    // as it is; while that request is still loading, `requireValue` throws
    // the loading exception, which Riverpod treats as "no result yet" and
    // leaves the state alone.
    return first ?? state.requireValue;
  }

  /// Page 1 for [search], or null when a newer request was made meanwhile.
  Future<PagedList<T>?> _first(String search) async {
    final ticket = ++_ticket;
    final result = await fetchPage(search: search, page: 1);
    if (ticket != _ticket) return null;
    return PagedList(
      items: result.items,
      search: search,
      page: 1,
      totalCount: result.totalCount,
    );
  }

  /// Starts again at page 1 for [search], showing the loading state. The same
  /// search as the one shown does nothing.
  Future<void> setSearch(String search) async {
    if (state.hasValue && _search == search) return;
    await _reloadFor(search);
  }

  /// Fetches the current search again from page 1 (retry after an error, or a
  /// refresh).
  Future<void> reload() => _reloadFor(_search);

  Future<void> _reloadFor(String search) async {
    _search = search;
    state = const AsyncLoading();
    final ticket = _ticket + 1;
    try {
      final first = await _first(search);
      if (first != null) state = AsyncData(first);
    } catch (error, stack) {
      // Only the newest request may report its failure.
      if (ticket == _ticket) state = AsyncError(error, stack);
    }
  }

  /// Appends the next page. Does nothing while one is loading or when there
  /// is no more. A failure keeps the rows and sets `loadMoreFailed`.
  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || current.isLoadingMore || !current.hasMore) return;
    final ticket = ++_ticket;
    state = AsyncData(
      current.copyWith(isLoadingMore: true, loadMoreFailed: false),
    );
    try {
      final result = await fetchPage(
        search: current.search,
        page: current.page + 1,
      );
      if (ticket != _ticket) return;
      state = AsyncData(
        current.copyWith(
          items: [...current.items, ...result.items],
          page: current.page + 1,
          totalCount: result.totalCount,
          isLoadingMore: false,
          loadMoreFailed: false,
        ),
      );
    } catch (_) {
      if (ticket != _ticket) return;
      state = AsyncData(
        current.copyWith(isLoadingMore: false, loadMoreFailed: true),
      );
    }
  }
}
