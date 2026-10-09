/// One choice of an `fk` field: the [value] the form saves (the row's id) and
/// the [label] the user reads. The caller's fetch function builds these from
/// its service (see `LookupFetcher`); a field never holds an option list.
class SelectOption {
  const SelectOption({
    required this.value,
    required this.label,
    this.isActive = true,
  });

  final Object value;
  final String label;

  /// False for a row that was switched off after a record chose it. Such a
  /// row is never offered, but a record that holds it still shows it, marked
  /// inactive, and keeps it on save (standard 4.10).
  final bool isActive;
}
