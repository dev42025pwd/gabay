import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// STUB (Phase 1). The generic list scaffold of standard §4.6.
///
/// Phase 3 (the first admin list) fills in what the standard says this owns:
/// the search box with ~350 ms debounce, sort, filters, pagination, view mode,
/// a fetch lifecycle with an incrementing fetch-ticket against out-of-order
/// responses, and a skeleton shimmer for loading. Pages supply only the data
/// and `itemBuilder`.
///
/// Today it renders the four states from an [AsyncValue]: loading, error with
/// retry, empty, and rows. It takes its wording from the caller, so it holds
/// none of its own.
class ModuleListScaffold<T> extends StatelessWidget {
  const ModuleListScaffold({
    required this.title,
    required this.items,
    required this.itemBuilder,
    required this.emptyLabel,
    required this.retryLabel,
    required this.errorText,
    required this.onRetry,
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: items.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => _Centered(
          icon: Icons.error_outline,
          text: errorText,
          action: FilledButton(onPressed: onRetry, child: Text(retryLabel)),
        ),
        data: (rows) => rows.isEmpty
            ? _Centered(icon: Icons.inbox_outlined, text: emptyLabel)
            : ListView.builder(
                itemCount: rows.length,
                itemBuilder: (context, index) =>
                    itemBuilder(context, rows[index]),
              ),
      ),
    );
  }
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
