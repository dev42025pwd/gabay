/// TEMPORARY single home for the English wording of the Phase 1 skeleton.
///
/// Project rule: wording lives only in the ARB files in `lib/l10n/` (en and
/// tl), reviewed by the product owner. The skeleton's strings are collected
/// here, in one file and nowhere else, so that the localisation slice can move
/// every one of them into ARB in a single pass. Nothing outside this file may
/// hold user-facing text (plan/PH1-rails.md S3, DESIGN CHOICE).
abstract final class AppCopy {
  // Surfaces and screens.
  static const String appName = 'Gabay';
  static const String mobileSurfaceName = 'Shopper app';
  static const String adminSurfaceName = 'Admin';
  static const String aboutTitle = 'About';
  static const String aboutAction = 'About this app';
  static const String backAction = 'Back';
  static const String versionLabel = 'Version';
  static const String buildLabel = 'Build';
  static const String commitLabel = 'Commit';
  static const String builtLabel = 'Built';
  static const String whatsNewTitle = 'What is new';
  static const String skeletonStatus = 'Skeleton only: no features yet';
  static const String showSuccessAction = 'Show a success message';
  static const String showErrorAction = 'Show an error message';
  static const String sampleSuccess = 'Saved. This is a sample message.';
  static const String sampleError =
      'Something went wrong. This is a sample message.';

  // Messaging overlay.
  static const String errorPrefix = 'Error';
  static const String successPrefix = 'Success';
  static const String dismissAction = 'Dismiss message';

  // Changelog entries (plain language, no table names or endpoints).
  static const String mobileFirstChangelog =
      'The Gabay shopper app now starts. It has no features yet.';
  static const String adminFirstChangelog =
      'The Gabay admin page now starts. It has no features yet.';

  // formatApiError: friendly copy by status code, then by exception type.
  static const String errorBadRequest =
      'That request was not valid. Check what you entered and try again.';
  static const String errorUnauthenticated =
      'Your session has ended. Please sign in again.';
  static const String errorForbidden = 'You do not have permission to do that.';
  static const String errorNotFound = 'We could not find that.';
  static const String errorConflict =
      'That conflicts with something that already exists.';
  static const String errorTooLarge = 'That is too large to send.';
  static const String errorInvalid = 'Some of the details are not valid.';
  static const String errorTooManyRequests =
      'Too many requests. Wait a moment and try again.';
  static const String errorServer =
      'Something went wrong on our side. Please try again shortly.';
  static const String errorUnavailable =
      'The service is not available right now. Please try again shortly.';
  static const String errorTimeout =
      'The server took too long to answer. Please try again.';
  static const String errorNoConnection =
      'Cannot reach the server. Check your connection and try again.';
  static const String errorCancelled = 'The request was cancelled.';
  static const String errorUnexpectedReply =
      'The server sent a reply we could not read.';
  static const String errorGeneric = 'Something went wrong. Please try again.';

  // Validators.
  static String requiredField(String label) => '$label is required.';
  static String tooLongField(String label, int max) =>
      '$label must be at most $max characters.';
}
