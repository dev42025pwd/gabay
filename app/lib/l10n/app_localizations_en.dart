// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appName => 'Gabay';

  @override
  String get surfaceMobileName => 'Shopper app';

  @override
  String get surfaceAdminName => 'Admin';

  @override
  String get aboutTitle => 'About';

  @override
  String get aboutAction => 'About this app';

  @override
  String get backAction => 'Back';

  @override
  String get whatsNewTitle => 'What is new';

  @override
  String get skeletonStatus => 'Skeleton only: no features yet';

  @override
  String get showSuccessAction => 'Show a success message';

  @override
  String get showErrorAction => 'Show an error message';

  @override
  String get sampleSuccess => 'Saved. This is a sample message.';

  @override
  String get sampleError => 'Something went wrong. This is a sample message.';

  @override
  String versionLine(String value) {
    return 'Version: $value';
  }

  @override
  String buildLine(String value) {
    return 'Build: $value';
  }

  @override
  String commitLine(String value) {
    return 'Commit: $value';
  }

  @override
  String builtLine(String value) {
    return 'Built: $value';
  }

  @override
  String get messageErrorPrefix => 'Error';

  @override
  String get messageSuccessPrefix => 'Success';

  @override
  String get messageDismissAction => 'Dismiss message';

  @override
  String get errorBadRequest =>
      'That request was not valid. Check what you entered and try again.';

  @override
  String get errorUnauthenticated =>
      'Your session has ended. Please sign in again.';

  @override
  String get errorForbidden => 'You do not have permission to do that.';

  @override
  String get errorNotFound => 'We could not find that.';

  @override
  String get errorConflict =>
      'That conflicts with something that already exists.';

  @override
  String get errorTooLarge => 'That is too large to send.';

  @override
  String get errorInvalid => 'Some of the details are not valid.';

  @override
  String get errorTooManyRequests =>
      'Too many requests. Wait a moment and try again.';

  @override
  String get errorServer =>
      'Something went wrong on our side. Please try again shortly.';

  @override
  String get errorUnavailable =>
      'The service is not available right now. Please try again shortly.';

  @override
  String get errorTimeout =>
      'The server took too long to answer. Please try again.';

  @override
  String get errorNoConnection =>
      'Cannot reach the server. Check your connection and try again.';

  @override
  String get errorCancelled => 'The request was cancelled.';

  @override
  String get errorUnexpectedReply =>
      'The server sent a reply we could not read.';

  @override
  String get errorGeneric => 'Something went wrong. Please try again.';

  @override
  String validatorRequired(String label) {
    return '$label is required.';
  }

  @override
  String validatorTooLong(String label, int max) {
    return '$label must be at most $max characters.';
  }

  @override
  String get changelogMobile_e001_a =>
      'The Gabay shopper app now starts. It has no features yet.';

  @override
  String get changelogAdmin_e001_a =>
      'The Gabay admin page now starts. It has no features yet.';
}
