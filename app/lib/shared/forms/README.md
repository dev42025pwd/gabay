# shared/forms/

The one place a form field is built (rule 7, standard 4.10, Appendix A.13). A view declares a `FieldSpec` per column and places a `SpecFormField`; it never builds a `TextFormField`. `tools/lint/no-bare-textfield.js` allows a text field in this folder only.

| File | What it is |
|---|---|
| `field_spec.dart` | `FieldSpec` (`table`, `name`, `label`, `kind`, `required`, `maxLength`, `scale`, `readOnly`, `format`) and `ColKind` |
| `spec_form_field.dart` | `SpecFormField`: the resolver, one spec in, one widget and its validators out |
| `field_validators.dart` | `validatorFor(spec, l10n)`: required, maxLength, integer and email checks derived from the spec |
| `async_lookup_picker.dart` | the `fk` field: `LookupPickerField` and `showLookupPicker`, the async server-search picker (search with debounce, "Load more", the four states); `LookupFetcher`, the function the ViewModel supplies to fetch a page |
| `select_option.dart` | `SelectOption`: a choice (value, label, `isActive`) |
| `lookup_names.dart` | `LookupName`: the lookups the client may read (`building-types`, `amenity-types`, `transit-types`), one enum value per entry of the server allow-list; a call site never spells a name |
| `lookup_service.dart` | `LookupService`: stateless, over `ApiClient`. `lookupFetcher(name)` gives the `LookupFetcher` for the picker (`GET /api/lookups/:name`, rows to `SelectOption`); `lookupOption(name, id)` gives the `currentOption` of a held value, inactive or not (`GET /api/lookups/:name/:id`). Errors are rethrown for `formatApiError`; a reply of the wrong shape is a `FormatException` |
| `lookup_providers.dart` | `lookupServiceProvider`: a ViewModel reads it to build its field fetcher |
| `debounced_search_field.dart` | the list's search box (350 ms debounce) |

## The schema decides

`tools/lint/schema-forms.js` reads every `FieldSpec(...)` in `app/lib` and fails when it disagrees with `db/schema.sql` on kind, `required`, `maxLength` or `scale`. So `table`, `name` and `kind` are literals, and `required`, `maxLength`, `scale` and `readOnly` are literals too. The kind names are the linter's: a BOOLEAN column is `ColKind.flag`, a foreign key `ColKind.fk`, and an email is a `text` column with `format: FieldFormat.email`.

## What exists (Phase 2, slice S9) and what waits for Phase 3

| Now | Phase 3 |
|---|---|
| `ColKind.text`, `integer`, `flag`, `fk` (the async picker over a fetch function the caller passes in; the current value is shown, marked inactive when it is, and never cleared) | `memo`, `decimal`, `money`, `date`, `datetime`, `fkMulti`; the `lookup` argument and `/api/lookups/:name` (the options controller) |
| required, maxLength, integer and email validators | decimal scale and CHECK ranges |
| read-only rendering | audit-stamp display helpers |
| a search box with debounce, paging by "Load more" (`ModuleListScaffold`, `PagedListNotifier`) | sort, filters, view modes, cascading pickers (`dependsOn`), refresh on return |

The audit viewer formats its dates in its list `itemBuilder`: a list row is not a form field, and `ColKind` has no `datetime` until Phase 3.

Wording comes from ARB: `FieldSpec.label` is a function of `AppLocalizations`, so a spec is a `final`, not a `const`.
