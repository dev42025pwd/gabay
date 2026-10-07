import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[Locale('en')];

  /// The product name, shown in the app bar, the home heading and the OS task switcher.
  ///
  /// In en, this message translates to:
  /// **'Gabay'**
  String get appName;

  /// Subtitle on the placeholder home screen of the shopper (mobile) app.
  ///
  /// In en, this message translates to:
  /// **'Shopper app'**
  String get surfaceMobileName;

  /// Subtitle on the placeholder home screen of the admin web page.
  ///
  /// In en, this message translates to:
  /// **'Admin'**
  String get surfaceAdminName;

  /// Title of the About page's app bar.
  ///
  /// In en, this message translates to:
  /// **'About'**
  String get aboutTitle;

  /// Button on the home screen that opens the About page.
  ///
  /// In en, this message translates to:
  /// **'About this app'**
  String get aboutAction;

  /// Screen-reader name and tooltip of the back arrow in an app bar.
  ///
  /// In en, this message translates to:
  /// **'Back'**
  String get backAction;

  /// Heading above the list of changes (the changelog) on the About page.
  ///
  /// In en, this message translates to:
  /// **'What is new'**
  String get whatsNewTitle;

  /// Status note on the Phase 1 placeholder home screen, shown with an info icon.
  ///
  /// In en, this message translates to:
  /// **'Skeleton only: no features yet'**
  String get skeletonStatus;

  /// Placeholder-screen button that demonstrates the success banner.
  ///
  /// In en, this message translates to:
  /// **'Show a success message'**
  String get showSuccessAction;

  /// Placeholder-screen button that demonstrates the error banner.
  ///
  /// In en, this message translates to:
  /// **'Show an error message'**
  String get showErrorAction;

  /// Sample text shown in the success banner by the placeholder screen.
  ///
  /// In en, this message translates to:
  /// **'Saved. This is a sample message.'**
  String get sampleSuccess;

  /// Sample text shown in the error banner by the placeholder screen.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong. This is a sample message.'**
  String get sampleError;

  /// Version line on the home and About pages.
  ///
  /// In en, this message translates to:
  /// **'Version: {value}'**
  String versionLine(String value);

  /// Build-number line on the home and About pages.
  ///
  /// In en, this message translates to:
  /// **'Build: {value}'**
  String buildLine(String value);

  /// Source-control commit line on the home and About pages.
  ///
  /// In en, this message translates to:
  /// **'Commit: {value}'**
  String commitLine(String value);

  /// Build-time line on the home and About pages.
  ///
  /// In en, this message translates to:
  /// **'Built: {value}'**
  String builtLine(String value);

  /// Spoken and written prefix of an error banner, so status is never colour alone.
  ///
  /// In en, this message translates to:
  /// **'Error'**
  String get messageErrorPrefix;

  /// Spoken and written prefix of a success banner, so status is never colour alone.
  ///
  /// In en, this message translates to:
  /// **'Success'**
  String get messageSuccessPrefix;

  /// Screen-reader name of the close button on a banner.
  ///
  /// In en, this message translates to:
  /// **'Dismiss message'**
  String get messageDismissAction;

  /// Friendly copy for HTTP 400 when the server sent no message.
  ///
  /// In en, this message translates to:
  /// **'That request was not valid. Check what you entered and try again.'**
  String get errorBadRequest;

  /// Friendly copy for HTTP 401.
  ///
  /// In en, this message translates to:
  /// **'Your session has ended. Please sign in again.'**
  String get errorUnauthenticated;

  /// Friendly copy for HTTP 403.
  ///
  /// In en, this message translates to:
  /// **'You do not have permission to do that.'**
  String get errorForbidden;

  /// Friendly copy for HTTP 404.
  ///
  /// In en, this message translates to:
  /// **'We could not find that.'**
  String get errorNotFound;

  /// Friendly copy for HTTP 409 (for example a duplicate).
  ///
  /// In en, this message translates to:
  /// **'That conflicts with something that already exists.'**
  String get errorConflict;

  /// Friendly copy for HTTP 413.
  ///
  /// In en, this message translates to:
  /// **'That is too large to send.'**
  String get errorTooLarge;

  /// Friendly copy for HTTP 422.
  ///
  /// In en, this message translates to:
  /// **'Some of the details are not valid.'**
  String get errorInvalid;

  /// Friendly copy for HTTP 429.
  ///
  /// In en, this message translates to:
  /// **'Too many requests. Wait a moment and try again.'**
  String get errorTooManyRequests;

  /// Friendly copy for HTTP 5xx other than 503.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong on our side. Please try again shortly.'**
  String get errorServer;

  /// Friendly copy for HTTP 503.
  ///
  /// In en, this message translates to:
  /// **'The service is not available right now. Please try again shortly.'**
  String get errorUnavailable;

  /// Copy when a request timed out (no response).
  ///
  /// In en, this message translates to:
  /// **'The server took too long to answer. Please try again.'**
  String get errorTimeout;

  /// Copy when there is no network path to the server.
  ///
  /// In en, this message translates to:
  /// **'Cannot reach the server. Check your connection and try again.'**
  String get errorNoConnection;

  /// Copy when a request was cancelled before it finished.
  ///
  /// In en, this message translates to:
  /// **'The request was cancelled.'**
  String get errorCancelled;

  /// Copy when the server's reply was malformed.
  ///
  /// In en, this message translates to:
  /// **'The server sent a reply we could not read.'**
  String get errorUnexpectedReply;

  /// Last-resort copy; also replaces any text that looks like a raw exception or stack trace.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong. Please try again.'**
  String get errorGeneric;

  /// Form validation: a mandatory field is empty. The label is the field's own name.
  ///
  /// In en, this message translates to:
  /// **'{label} is required.'**
  String validatorRequired(String label);

  /// Form validation: the text is longer than the field allows.
  ///
  /// In en, this message translates to:
  /// **'{label} must be at most {max} characters.'**
  String validatorTooLong(String label, int max);

  /// Shopper-app changelog, entry e001, first bullet. Plain language for shoppers.
  ///
  /// In en, this message translates to:
  /// **'The Gabay shopper app now starts. It has no features yet.'**
  String get changelogMobile_e001_a;

  /// Admin changelog, entry e001, first bullet. Plain language for mall staff.
  ///
  /// In en, this message translates to:
  /// **'The Gabay admin page now starts. It has no features yet.'**
  String get changelogAdmin_e001_a;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
