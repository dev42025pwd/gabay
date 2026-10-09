import 'dart:async';

import 'package:flutter/material.dart';

/// How long the box waits after the last keystroke before it reports
/// (standard 4.6: "~350ms").
const Duration kSearchDebounce = Duration(milliseconds: 350);

/// The list's search box. It reports the trimmed text once the user has
/// stopped typing for [kSearchDebounce], at once on the keyboard's search key,
/// and never the same text twice in a row. The text field is built here, the
/// one folder allowed to build one (rule 7), not in the list scaffold.
///
/// [label] is the visible and screen-reader name; the caller supplies it from
/// ARB.
class DebouncedSearchField extends StatefulWidget {
  const DebouncedSearchField({
    required this.label,
    required this.onChanged,
    super.key,
  });

  final String label;
  final ValueChanged<String> onChanged;

  @override
  State<DebouncedSearchField> createState() => _DebouncedSearchFieldState();
}

class _DebouncedSearchFieldState extends State<DebouncedSearchField> {
  Timer? _timer;
  String _reported = '';

  void _typed(String text) {
    _timer?.cancel();
    _timer = Timer(kSearchDebounce, () => _report(text));
  }

  void _submitted(String text) {
    _timer?.cancel();
    _report(text);
  }

  void _report(String text) {
    final search = text.trim();
    if (search == _reported) return;
    _reported = search;
    widget.onChanged(search);
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return TextField(
      decoration: InputDecoration(
        labelText: widget.label,
        prefixIcon: const Icon(Icons.search),
      ),
      textInputAction: TextInputAction.search,
      onChanged: _typed,
      onSubmitted: _submitted,
    );
  }
}
