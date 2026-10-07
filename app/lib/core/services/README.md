# core/services/

App-wide, stateless, framework-light services that more than one feature uses
(for example the platform voice channel, local storage wrappers). Empty in
Phase 1. A service takes its collaborators (an `ApiClient`, a plugin) in its
constructor and never takes a Riverpod `ref`.

Feature-specific services live in `features/<domain>/services/`.
