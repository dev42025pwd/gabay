import '../../l10n/app_localizations.dart';

/// A form-field validator: null means valid, otherwise the message to show.
typedef FieldValidator = String? Function(String? value);

/// Field-aware validators (standard §4.6): messages name the field, so
/// there is never a bare "Required". `FieldSpec` (Phase 3) builds its
/// validator list from these.
///
/// Wording comes from ARB through the [AppLocalizations] passed in. A
/// validator is built where a `BuildContext` exists (`AppLocalizations.of`),
/// so the message is in the language the screen shows.
abstract final class Validators {
  /// `"$label is required."` for null, empty or whitespace-only input.
  static FieldValidator required(AppLocalizations l10n, String label) =>
      (value) => (value == null || value.trim().isEmpty)
      ? l10n.validatorRequired(label)
      : null;

  /// Fails when the trimmed input is longer than [max] characters. Empty is
  /// valid: combine with [required] when the field is mandatory.
  static FieldValidator maxLength(
    AppLocalizations l10n,
    String label,
    int max,
  ) =>
      (value) => (value != null && value.trim().length > max)
      ? l10n.validatorTooLong(label, max)
      : null;

  /// Runs [validators] in order and returns the first message.
  static FieldValidator combine(List<FieldValidator> validators) => (value) {
    for (final validate in validators) {
      final message = validate(value);
      if (message != null) return message;
    }
    return null;
  };
}
