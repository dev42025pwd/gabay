/// One choice of an `fk` field: the [value] the form saves (the row's id) and
/// the [label] the user reads. The ViewModel builds the list from
/// `/api/lookups/:name` (rule 5); the field never holds an option list itself.
class SelectOption {
  const SelectOption({required this.value, required this.label});

  final Object value;
  final String label;
}
