import '../../core/network/api_client.dart';
import '../components/paged_list_notifier.dart';
import 'async_lookup_picker.dart';
import 'lookup_names.dart';
import 'select_option.dart';

/// Reads the lookups for the `fk` picker (rule 5: the options are rows, never
/// a list in the client). Stateless: it takes the [ApiClient] and nothing else,
/// and rethrows what the client throws, so the ViewModel words an error with
/// `formatApiError`. A reply that does not have the documented shape is a
/// [FormatException], which `formatApiError` words as an unexpected reply.
///
/// The routes (plan/FF0-dev-stub-lookups.md section 3; Blueprint 4.15):
///   `GET /api/lookups/:name?search=&page=` -> `{ items, totalCount, page, pageSize }`
///   `GET /api/lookups/:name/:id`           -> one row, active or not
/// A row is `{ id, code, label, isActive }`. The list holds active rows only;
/// the single read returns an inactive row too, for the field that still holds
/// it. The tenant is the server's business: the client sends no `X-Tenant-Id`
/// in FF-0 (the development stub picks the default tenant).
class LookupService {
  const LookupService(this._api);

  final ApiClient _api;

  /// The fetch function for [LookupPickerField] and `SpecFormField`'s
  /// `lookupFetcher`: one page of [name], filtered by the server.
  LookupFetcher lookupFetcher(LookupName name) =>
      ({required String search, required int page}) async {
        final response = await _api.get<Object?>(
          '/api/lookups/${name.path}',
          queryParameters: {
            if (search.isNotEmpty) 'search': search,
            'page': page,
          },
        );
        return _pageOf(response.data);
      };

  /// The row a record holds, for `currentOption`: its label, and whether it
  /// has since been switched off (the picker then marks it inactive and keeps
  /// it on save, standard 4.10).
  Future<SelectOption> lookupOption(LookupName name, Object id) async {
    final response = await _api.get<Object?>(
      '/api/lookups/${name.path}/${Uri.encodeComponent('$id')}',
    );
    return _optionOf(response.data);
  }
}

PageResult<SelectOption> _pageOf(Object? body) {
  final map = _asMap(body, 'the lookup page');
  final items = map['items'];
  if (items is! List) {
    throw const FormatException('The lookup page has no items list.');
  }
  return PageResult(
    items: [for (final row in items) _optionOf(row)],
    totalCount: _int(map, 'totalCount'),
    page: _int(map, 'page'),
    pageSize: _int(map, 'pageSize'),
  );
}

SelectOption _optionOf(Object? row) {
  final map = _asMap(row, 'a lookup row');
  final label = map['label'];
  final isActive = map['isActive'];
  if (label is! String) {
    throw const FormatException('A lookup row has no label.');
  }
  if (isActive is! bool) {
    throw const FormatException('A lookup row has no isActive.');
  }
  return SelectOption(value: _int(map, 'id'), label: label, isActive: isActive);
}

Map<String, Object?> _asMap(Object? value, String what) {
  if (value is Map) return value.cast<String, Object?>();
  throw FormatException('Expected $what as an object.');
}

int _int(Map<String, Object?> map, String key) {
  final value = map[key];
  if (value is int) return value;
  throw FormatException('Expected "$key" as a whole number.');
}
