import '../../l10n/app_localizations.dart';
import '../utils/validators.dart';
import 'field_spec.dart';

/// The validator of a field, derived from its spec and never authored by hand
/// (standard 4.10): `required` mirrors NOT NULL, `maxLength` the column width,
/// the kind and format the type of value. Messages name the field
/// (`Validators`, standard 4.6). Required runs first, so an empty field says
/// "is required" and not "is not a number".
///
/// A read-only field is displayed, never typed, so it has nothing to validate.
FieldValidator validatorFor(FieldSpec spec, AppLocalizations l10n) {
  if (spec.readOnly) return (_) => null;
  final label = spec.label(l10n);
  return Validators.combine([
    if (spec.required) Validators.required(l10n, label),
    if (spec.maxLength != null)
      Validators.maxLength(l10n, label, spec.maxLength!),
    if (spec.kind == ColKind.integer) Validators.integer(l10n, label),
    if (spec.format == FieldFormat.email) Validators.email(l10n, label),
  ]);
}
