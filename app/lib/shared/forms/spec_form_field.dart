import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../l10n/app_localizations.dart';
import '../utils/validators.dart';
import 'async_lookup_picker.dart';
import 'field_spec.dart';
import 'field_validators.dart';
import 'select_option.dart';

/// The ONE resolver (standard 4.10, A.13): turns a [FieldSpec] into its widget
/// and validators. This folder is the only place a `TextFormField` may be
/// built (rule 7, `no-bare-textfield`); a view declares specs and places this.
///
/// The value is held by the caller's ViewModel, not here: it goes in through
/// [value] and comes out through [onChanged], typed by kind, and a later
/// [value] from the ViewModel (a reset, a record loaded after the first frame)
/// is shown:
///
/// | kind | value | widget |
/// |---|---|---|
/// | `text` | `String` | single-line text (email keyboard for `FieldFormat.email`) |
/// | `integer` | `int?` (`null` when blank or malformed) | digits-only text, number keyboard |
/// | `flag` | `bool` | a switch |
/// | `fk` | the chosen [SelectOption.value] | [LookupPickerField], the async server-search picker |
///
/// **The ViewModel must echo [onChanged] back verbatim** as the next [value]
/// (store what it was given, never a trimmed or normalised copy). A value that
/// differs from what the box says is taken as a reset: the box is rebuilt with
/// it and loses its focus and cursor.
///
/// An `integer` field keeps what the user typed while the value it reports is
/// `null` (a lone minus sign), and shows the validator's message instead of
/// clearing the text under their fingers.
///
/// A `readOnly` spec renders its value as plain text (a disabled switch for a
/// flag), builds no input, and is never validated.
class SpecFormField extends StatelessWidget {
  // Not const: the assert below reads the spec.
  SpecFormField({
    required this.spec,
    required this.value,
    required this.onChanged,
    this.lookupFetcher,
    this.currentOption,
    super.key,
  }) : assert(
         spec.kind != ColKind.fk || spec.readOnly || lookupFetcher != null,
         'an editable fk field needs a lookupFetcher: the ViewModel supplies '
         'the function that fetches its choices',
       );

  final FieldSpec spec;
  final Object? value;
  final ValueChanged<Object?> onChanged;

  /// An `fk` field's source of choices, supplied by the ViewModel from its
  /// service: one page of active rows for a search. Required unless the spec
  /// is read-only.
  final LookupFetcher? lookupFetcher;

  /// An `fk` field's current choice as the record holds it (its label, and
  /// whether it is still active), so it is shown even when the fetched rows
  /// do not contain it, marked inactive when it is, and never cleared.
  final SelectOption? currentOption;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final label = spec.label(l10n);
    final validator = validatorFor(spec, l10n);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: switch (spec.kind) {
        ColKind.flag => _flag(label),
        _ when spec.readOnly => _readOnly(context, label),
        ColKind.text || ColKind.integer => _SpecTextField(
          label: label,
          value: value,
          integer: spec.kind == ColKind.integer,
          email: spec.format == FieldFormat.email,
          validator: validator,
          onChanged: onChanged,
        ),
        ColKind.fk => LookupPickerField(
          label: label,
          value: value,
          current: currentOption,
          fetcher: lookupFetcher!,
          validator: validator,
          onChanged: onChanged,
        ),
      },
    );
  }

  Widget _flag(String label) => SwitchListTile(
    contentPadding: EdgeInsets.zero,
    title: Text(label),
    value: value == true,
    // Null disables the switch: a read-only flag is shown, never toggled.
    onChanged: spec.readOnly ? null : onChanged,
  );

  Widget _readOnly(BuildContext context, String label) {
    final text = spec.kind == ColKind.fk
        ? lookupDisplayText(
            AppLocalizations.of(context),
            currentOption?.value == value ? currentOption : null,
            value,
          )
        : value?.toString() ?? '';
    return Semantics(
      container: true,
      readOnly: true,
      label: label,
      value: text,
      child: ExcludeSemantics(
        child: InputDecorator(
          decoration: InputDecoration(labelText: label),
          child: Text(text),
        ),
      ),
    );
  }
}

/// A `text` or `integer` field. It owns a controller so the value can change
/// under it: when the ViewModel hands a [value] that is not what the box says,
/// the box shows it. What the user typed is never undone when the ViewModel
/// merely echoes it back verbatim; one that does not (trims, normalises, or
/// drops it) makes the box reset and lose focus (see [SpecFormField]).
class _SpecTextField extends StatefulWidget {
  const _SpecTextField({
    required this.label,
    required this.value,
    required this.integer,
    required this.email,
    required this.validator,
    required this.onChanged,
  });

  final String label;
  final Object? value;
  final bool integer;
  final bool email;
  final FieldValidator validator;
  final ValueChanged<Object?> onChanged;

  @override
  State<_SpecTextField> createState() => _SpecTextFieldState();
}

class _SpecTextFieldState extends State<_SpecTextField> {
  late TextEditingController _controller = _controllerFor(widget.value);

  /// Bumped when the box is rebuilt around a new controller.
  int _revision = 0;

  TextEditingController _controllerFor(Object? value) {
    final text = value?.toString() ?? '';
    return TextEditingController.fromValue(
      TextEditingValue(
        text: text,
        selection: TextSelection.collapsed(offset: text.length),
      ),
    );
  }

  @override
  void didUpdateWidget(_SpecTextField oldWidget) {
    super.didUpdateWidget(oldWidget);
    final typed = _controller.text;
    // An integer box holding "-" reports null: that is the same value as null,
    // so the text stays.
    final sameValue = widget.integer
        ? int.tryParse(typed.trim()) == widget.value
        : typed == (widget.value?.toString() ?? '');
    if (!sameValue) {
      // Not `_controller.text = ...`: that notifies the field while the tree
      // is building. A new controller under a new key is built with the value.
      final old = _controller;
      _controller = _controllerFor(widget.value);
      _revision++;
      WidgetsBinding.instance.addPostFrameCallback((_) => old.dispose());
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => TextFormField(
    key: ValueKey(_revision),
    controller: _controller,
    decoration: InputDecoration(labelText: widget.label),
    keyboardType: widget.integer
        ? const TextInputType.numberWithOptions(signed: true)
        : widget.email
        ? TextInputType.emailAddress
        : TextInputType.text,
    // Digits and a minus sign only: nothing can throw on what the user types.
    inputFormatters: widget.integer
        ? [FilteringTextInputFormatter.allow(RegExp('[0-9-]'))]
        : null,
    autovalidateMode: AutovalidateMode.onUserInteraction,
    validator: widget.validator,
    onChanged: (text) =>
        widget.onChanged(widget.integer ? int.tryParse(text.trim()) : text),
  );
}
