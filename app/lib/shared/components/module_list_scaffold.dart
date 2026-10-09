import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/app_localizations.dart';
import '../forms/debounced_search_field.dart';

/// The search box of a list: [label] names it (ARB), [onChanged] gets the
/// trimmed text after the debounce (`DebouncedSearchField`).
class ListSearch {
  const ListSearch({required this.label, required this.onChanged});

  final String label;
  final ValueChanged<String> onChanged;
}

/// The footer of a paged list. Build it from a `PagedList` (see
/// `PagedListNotifier`): [hasMore], [isLoadingMore] and [loadMoreFailed] are
/// its fields of the same names.
class ListPaging {
  const ListPaging({
    required this.hasMore,
    required this.loadMoreLabel,
    required this.onLoadMore,
    this.isLoadingMore = false,
    this.loadMoreFailed = false,
  });

  final bool hasMore;
  final bool isLoadingMore;
  final bool loadMoreFailed;

  /// The button's text (ARB), for example "Load more".
  final String loadMoreLabel;

  final VoidCallback onLoadMore;
}

/// The generic list scaffold of standard §4.6.
///
/// Owns the four states (loading, error with retry, empty, rows), an optional
/// search box above them with the ~350 ms debounce ([search]), and an optional
/// footer for the next page ([paging]). Pages supply the data and
/// `itemBuilder`. The box sits outside the states, so it keeps its text and
/// focus while the list reloads.
///
/// Phase 3 adds what the standard lists beyond this: sort, filters, view
/// modes, a skeleton shimmer and refresh when the user comes back.
///
/// It takes its wording from the caller, so it holds none of its own, except
/// the screen-reader name of its two progress spinners, which it reads from
/// ARB when the app has localisation (a bare MaterialApp in a test does not).
class ModuleListScaffold<T> extends StatelessWidget {
  const ModuleListScaffold({
    required this.title,
    required this.items,
    required this.itemBuilder,
    required this.emptyLabel,
    required this.retryLabel,
    required this.errorText,
    required this.onRetry,
    this.search,
    this.paging,
    super.key,
  });

  final String title;
  final AsyncValue<List<T>> items;
  final Widget Function(BuildContext context, T item) itemBuilder;
  final String emptyLabel;
  final String retryLabel;

  /// Already passed through `formatApiError` by the caller's ViewModel.
  final String errorText;
  final VoidCallback onRetry;

  /// Null: no search box.
  final ListSearch? search;

  /// Null: no footer, the list is whatever [items] holds.
  final ListPaging? paging;

  @override
  Widget build(BuildContext context) {
    final search = this.search;
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Column(
        children: [
          if (search != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
              child: DebouncedSearchField(
                label: search.label,
                onChanged: search.onChanged,
              ),
            ),
          Expanded(child: _states()),
        ],
      ),
    );
  }

  Widget _states() => items.when(
    loading: () => const Center(child: _Spinner()),
    error: (_, _) => _Centered(
      icon: Icons.error_outline,
      text: errorText,
      action: FilledButton(onPressed: onRetry, child: Text(retryLabel)),
    ),
    data: (rows) => rows.isEmpty
        ? _Centered(icon: Icons.inbox_outlined, text: emptyLabel)
        : _rows(rows),
  );

  Widget _rows(List<T> rows) {
    final footer = paging;
    final hasFooter =
        footer != null &&
        (footer.hasMore || footer.isLoadingMore || footer.loadMoreFailed);
    return ListView.builder(
      itemCount: rows.length + (hasFooter ? 1 : 0),
      itemBuilder: (context, index) => index < rows.length
          ? itemBuilder(context, rows[index])
          : _Footer(
              paging: footer!,
              errorText: errorText,
              retryLabel: retryLabel,
            ),
    );
  }
}

/// The row after the last: a progress ring while the next page loads, the
/// error with a retry when it failed, otherwise the Load more button.
class _Footer extends StatelessWidget {
  const _Footer({
    required this.paging,
    required this.errorText,
    required this.retryLabel,
  });

  final ListPaging paging;
  final String errorText;
  final String retryLabel;

  @override
  Widget build(BuildContext context) {
    final Widget child;
    if (paging.isLoadingMore) {
      child = const _Spinner();
    } else if (paging.loadMoreFailed) {
      child = Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(errorText, textAlign: TextAlign.center),
          const SizedBox(height: 8),
          FilledButton(onPressed: paging.onLoadMore, child: Text(retryLabel)),
        ],
      );
    } else {
      child = OutlinedButton(
        onPressed: paging.onLoadMore,
        child: Text(paging.loadMoreLabel),
      );
    }
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Center(child: child),
    );
  }
}

/// A progress ring that a screen reader announces as "Loading".
class _Spinner extends StatelessWidget {
  const _Spinner();

  @override
  Widget build(BuildContext context) => CircularProgressIndicator(
    semanticsLabel: Localizations.of<AppLocalizations>(
      context,
      AppLocalizations,
    )?.loadingLabel,
  );
}

class _Centered extends StatelessWidget {
  const _Centered({required this.icon, required this.text, this.action});

  final IconData icon;
  final String text;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 48),
            const SizedBox(height: 12),
            Text(text, textAlign: TextAlign.center),
            if (action != null) ...[const SizedBox(height: 16), action!],
          ],
        ),
      ),
    );
  }
}
