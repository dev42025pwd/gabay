import 'package:flutter/material.dart';

/// STUB (Phase 1). The routed form scaffold of standard §4.6.
///
/// Phase 3 (the first admin form) fills in: the confirm-delete dialog (Cancel
/// is the default), the CRUD action bar gated per button on the permission
/// map, responsive form rows, and "Back" via `context.go(listRoute)` rather
/// than `pop()` so the address bar stays honest. Fields inside it are always
/// `FieldSpec` widgets, never a bare `TextFormField` (rule 7).
///
/// Today it is a titled, scrollable, width-limited [Form] with a submit
/// button. Wording comes from the caller.
class RoutedFormScaffold extends StatelessWidget {
  const RoutedFormScaffold({
    required this.title,
    required this.formKey,
    required this.children,
    required this.submitLabel,
    required this.onSubmit,
    this.isSubmitting = false,
    super.key,
  });

  final String title;
  final GlobalKey<FormState> formKey;
  final List<Widget> children;
  final String submitLabel;
  final VoidCallback onSubmit;
  final bool isSubmitting;

  /// Keeps form rows readable on a tablet or a wide browser window.
  static const double maxContentWidth = 720;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: maxContentWidth),
          child: Form(
            key: formKey,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                ...children,
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: isSubmitting ? null : onSubmit,
                  child: Text(submitLabel),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
