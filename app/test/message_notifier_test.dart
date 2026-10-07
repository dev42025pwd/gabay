import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gabay/core/copy/app_copy.dart';
import 'package:gabay/shared/components/messaging/app_message.dart';
import 'package:gabay/shared/components/messaging/message_notifier.dart';

void main() {
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
        );
    final message = container.read(messageProvider)!;
    expect(message.kind, AppMessageKind.error);
    expect(message.text, AppCopy.errorForbidden);
  });

  test('showError with a raw-looking string is sanitised, never shown raw', () {
    final container = make();
    container
        .read(messageProvider.notifier)
        .showError('SocketException: Failed host lookup');
    expect(container.read(messageProvider)!.text, AppCopy.errorGeneric);
  });

  test('a newer message gets a higher id and replaces the older one', () {
    final container = make();
    final notifier = container.read(messageProvider.notifier)
      ..showError('first');
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
    notifier.showError('second');
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
