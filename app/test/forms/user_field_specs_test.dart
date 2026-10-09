import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gabay/features/admin/users/models/user_field_specs.dart';
import 'package:gabay/l10n/app_localizations.dart';
import 'package:gabay/shared/components/paged_list_notifier.dart';
import 'package:gabay/shared/components/routed_form_scaffold.dart';
import 'package:gabay/shared/forms/select_option.dart';
import 'package:gabay/shared/forms/spec_form_field.dart';

import '../support/forms_harness.dart';
import '../support/shell_harness.dart';

/// The real S11 specs resolve to working fields inside the routed form
/// scaffold. That each one matches db/schema.sql is `schema-forms`' job, proved
/// by tools/lint/test/schema-forms-real.test.js.
void main() {
  late AppLocalizations l10n;
  setUpAll(() async => l10n = await loadEnglish());

  test('labels come from ARB', () {
    expect(appUserEmail.label(l10n), l10n.fieldAppUserEmail);
    expect(appUserDisplayName.label(l10n), l10n.fieldAppUserDisplayName);
    expect(appUserIsActive.label(l10n), l10n.fieldAppUserIsActive);
    expect(userRoleRole.label(l10n), l10n.fieldUserRoleRole);
  });

  testWidgets('a user form built from the specs refuses bad input on submit', (
    tester,
  ) async {
    final key = GlobalKey<FormState>();
    var submitted = 0;
    await tester.pumpWidget(
      screenHarness(
        RoutedFormScaffold(
          title: 'New user',
          formKey: key,
          submitLabel: 'Save',
          onSubmit: () {
            if (key.currentState!.validate()) submitted++;
          },
          children: [
            SpecFormField(spec: appUserEmail, value: '', onChanged: (_) {}),
            SpecFormField(
              spec: appUserDisplayName,
              value: 'A' * 121,
              onChanged: (_) {},
            ),
            SpecFormField(
              spec: appUserIsActive,
              value: true,
              onChanged: (_) {},
            ),
            SpecFormField(
              spec: userRoleRole,
              value: null,
              onChanged: (_) {},
              lookupFetcher: ({required search, required page}) async =>
                  const PageResult(
                    items: [SelectOption(value: 1, label: 'Viewer')],
                    totalCount: 1,
                    page: 1,
                    pageSize: 25,
                  ),
            ),
          ],
        ),
      ),
    );
    await tester.tap(find.text('Save'));
    await tester.pump();
    expect(submitted, 0);
    expect(
      find.text(l10n.validatorRequired(l10n.fieldAppUserEmail)),
      findsOneWidget,
    );
    expect(
      find.text(l10n.validatorTooLong(l10n.fieldAppUserDisplayName, 120)),
      findsOneWidget,
    );
    expect(
      find.text(l10n.validatorRequired(l10n.fieldUserRoleRole)),
      findsOneWidget,
    );
    expect(tester.widget<Switch>(find.byType(Switch)).value, isTrue);
  });
}
