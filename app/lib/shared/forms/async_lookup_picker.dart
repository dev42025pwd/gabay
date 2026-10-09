import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/api_error.dart';
import '../../l10n/app_localizations.dart';
import '../components/module_list_scaffold.dart';
import '../components/paged_list_notifier.dart';
import 'select_option.dart';

/// Fetches one page of the choices for [search] ('' for all), active rows only
/// and filtered by the server, never in memory (standard 4.10). The ViewModel
/// supplies it from its service, so the picker holds no list and calls no
/// route itself.
typedef LookupFetcher = Future<PageResult<SelectOption>> Function({
  required String search,
  required int page,
});

/// The `fk` field (standard 4.10): a tap target that shows the record's
/// current choice and opens [showLookupPicker]. Always the async server-search
/// picker, even when the lookup has eleven rows today.
///
/// The choice shown is the value the record holds now ([current], or the
/// value itself when no label is known), whether or not the fetched pages
/// contain it and even when it is inactive: it is marked inactive, and a
/// required field holding it is valid, so saving the record unchanged keeps it.
/// Only the user picking another row changes it.
class LookupPickerField extends StatefulWidget {
  const LookupPickerField({
    required this.label,
    required this.value,
    required this.onChanged,
    required this.fetcher,
    required this.validator,
    this.current,
    super.key,
  });

  final String label;

  /// The id the record holds, or null for none.
  final Object? value;

  /// The option [value] is, for its label and its active flag.
  final SelectOption? current;

  final ValueChanged<Object?> onChanged;
  final LookupFetcher fetcher;

  /// Runs on the held [value] (as text), not on the widget's own state, so a
  /// value the fetched rows never contained still counts.
  final String? Function(String? value) validator;

  @override
  State<LookupPickerField> createState() => _LookupPickerFieldState();
}

class _LookupPickerFieldState extends State<LookupPickerField> {
  /// What the user picked in this session, for its label: the caller only
  /// hears the id.
  SelectOption? _picked;

  SelectOption? get _shown {
    if (_picked != null && _picked!.value == widget.value) return _picked;
    if (widget.current != null && widget.current!.value == widget.value) {
      return widget.current;
    }
    return null;
  }

  Future<void> _open(FormFieldState<Object> field) async {
    final picked = await showLookupPicker(
      context,
      title: widget.label,
      fetcher: widget.fetcher,
    );
    if (picked == null) return;
    setState(() => _picked = picked);
    widget.onChanged(picked.value);
    field.didChange(picked.value);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final value = widget.value;
    return FormField<Object>(
      initialValue: value,
      autovalidateMode: AutovalidateMode.onUserInteraction,
      validator: (_) => widget.validator(value?.toString()),
      builder: (field) => Semantics(
        container: true,
        button: true,
        label: widget.label,
        value: lookupDisplayText(l10n, _shown, value),
        // The error text sits under ExcludeSemantics (the decorator is drawn
        // for the eye), so the same message goes here: a screen reader hears it
        // as the hint with an invalid state, as it does for a text field.
        hint: field.errorText,
        validationResult: field.hasError
            ? SemanticsValidationResult.invalid
            : SemanticsValidationResult.none,
        onTap: () => _open(field),
        child: ExcludeSemantics(
          child: InkWell(
            onTap: () => _open(field),
            child: InputDecorator(
              isEmpty: value == null,
              decoration: InputDecoration(
                labelText: widget.label,
                errorText: field.errorText,
                suffixIcon: const Icon(Icons.arrow_drop_down),
              ),
              child: Text(
                lookupDisplayText(l10n, _shown, value),
                overflow: TextOverflow.ellipsis,
                maxLines: 2,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// The text a choice is shown as: its label, marked inactive when it is, or
/// the raw id when no label is known, or nothing when there is no value.
String lookupDisplayText(
  AppLocalizations l10n,
  SelectOption? option,
  Object? value,
) {
  if (value == null) return '';
  if (option == null) return value.toString();
  return option.isActive ? option.label : l10n.pickerInactive(option.label);
}

/// Opens the picker as a full-screen dialog and returns the row the user chose,
/// or null when they closed it. It searches (debounced), pages with "Load more",
/// and shows the four list states, all through `ModuleListScaffold`.
Future<SelectOption?> showLookupPicker(
  BuildContext context, {
  required String title,
  required LookupFetcher fetcher,
}) {
  final provider =
      AsyncNotifierProvider.autoDispose<
        _LookupNotifier,
        PagedList<SelectOption>
      >(() => _LookupNotifier(fetcher));
  return Navigator.of(context).push<SelectOption>(
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) =>
          ProviderScope(child: _LookupPickerScreen(title, provider)),
    ),
  );
}

class _LookupNotifier extends PagedListNotifier<SelectOption> {
  _LookupNotifier(this._fetcher);

  final LookupFetcher _fetcher;

  @override
  Future<PageResult<SelectOption>> fetchPage({
    required String search,
    required int page,
  }) => _fetcher(search: search, page: page);
}

class _LookupPickerScreen extends ConsumerWidget {
  const _LookupPickerScreen(this.title, this.provider);

  final String title;
  final AsyncNotifierProvider<_LookupNotifier, PagedList<SelectOption>>
  provider;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final state = ref.watch(provider);
    final notifier = ref.read(provider.notifier);
    final list = state.value;
    return ModuleListScaffold<SelectOption>(
      title: title,
      items: state.whenData((page) => page.items),
      itemBuilder: (context, option) => ListTile(
        // Whatever the server returns is listed; an inactive row is marked.
        title: Text(lookupDisplayText(l10n, option, option.value)),
        onTap: () => Navigator.of(context).pop(option),
      ),
      emptyLabel: l10n.pickerEmpty,
      retryLabel: l10n.pickerRetry,
      // The footer shows it too, when only the next page failed.
      errorText: switch ((state.error, list?.loadMoreError)) {
        (final Object error, _) => formatApiError(error, l10n),
        (_, final Object error) => formatApiError(error, l10n),
        _ => l10n.errorGeneric,
      },
      onRetry: notifier.reload,
      search: ListSearch(
        label: l10n.pickerSearchLabel,
        onChanged: notifier.setSearch,
      ),
      paging: list == null
          ? null
          : ListPaging(
              hasMore: list.hasMore,
              isLoadingMore: list.isLoadingMore,
              loadMoreFailed: list.loadMoreFailed,
              loadMoreLabel: l10n.pickerLoadMore,
              onLoadMore: notifier.loadMore,
            ),
    );
  }
}
