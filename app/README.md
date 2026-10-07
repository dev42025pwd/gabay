# Gabay app

One Flutter project, two entry points (Blueprint §2.3):

- `lib/main_mobile.dart`: the shopper app (Android 7.0+, iOS 15+).
- `lib/main_admin.dart`: the admin web page.

How to run, test, build and render the screenshots: **`INSTALL.md` in the
repository root, section A.3**. The layout of `lib/` (`core/`, `shared/`,
`features/`) and the rules it follows are in the Engineering Standards §4 and
`CLAUDE.md` at the root. Wording is in `lib/l10n/*.arb`, never in Dart.

Web manifest colours (`web/manifest.json` sits outside the Dart colour-token
rule): `theme_color` is the brand seed `#C1623D` (`GabayTokens.seed`), and
`background_color` is the light scheme's `surface` colour derived from that
seed (`#FFF8F6`), so the splash screen matches the first frame.
