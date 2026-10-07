import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gabay/l10n/app_localizations.dart';
import 'package:gabay/shared/components/messaging/app_message.dart';
import 'package:gabay/shared/components/messaging/message_notifier.dart';

import 'support/shell_harness.dart';

void main() {
  late AppLocalizations l10n;
  setUpAll(() async => l10n = await loadEnglish());

  ProviderContainer make() {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    return container;
  }

  test('showError with a caught exception goes through formatApiError', () {
    final container = make();
    final request = RequestOptions(path: '/x');
    container
        .read(messageProvider.notifier)
        .showError(
          DioException(
            requestOptions: request,
            response: Response<Object?>(
              requestOptions: request,
              statusCode: 403,
            ),
          ),
          l10n,
        );
    final message = container.read(messageProvider)!;
    expect(message.kind, AppMessageKind.error);
    expect(message.text, l10n.errorForbidden);
  });

  test('showError with a raw-looking string is sanitised, never shown raw', () {
    final container = make();
    container
        .read(messageProvider.notifier)
        .showError('SocketException: Failed host lookup', l10n);
    expect(container.read(messageProvider)!.text, l10n.errorGeneric);
  });

  test('a newer message gets a higher id and replaces the older one', () {
    final container = make();
    final notifier = container.read(messageProvider.notifier)
      ..showError('first', l10n);
    final first = container.read(messageProvider)!;
    notifier.showSuccess('second');
    final second = container.read(messageProvider)!;
    expect(second.id, greaterThan(first.id));
    expect(second.kind, AppMessageKind.success);
  });

  testWidgets('an old timer never clears a newer message', (tester) async {
    final container = make();
    final notifier = container.read(messageProvider.notifier)
      ..showSuccess('first');
    await tester.pump(const Duration(seconds: 3));
    notifier.showError('second', l10n);
    // The success message's own timer (5 s) fires here if it was not cancelled.
    await tester.pump(const Duration(seconds: 3));
    expect(container.read(messageProvider)?.text, 'second');
    await tester.pump(kErrorMessageDuration);
    expect(container.read(messageProvider), isNull);
  });

  test('dismiss clears the message', () {
    final container = make();
    final notifier = container.read(messageProvider.notifier)
      ..showSuccess('ok');
    notifier.dismiss();
    expect(container.read(messageProvider), isNull);
  });
}
