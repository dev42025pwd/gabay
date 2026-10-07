# features/

One folder per domain, `features/<domain>/`, each with the same fixed shape
(standard §4.1):

```
features/<domain>/
  models/       plain data classes and parsing (no Flutter widgets)
  services/     stateless; talk to the API through ApiClient; take no `ref`
  viewmodels/   Riverpod Notifiers / AsyncNotifiers; call services; own state
  views/        screens; read a ViewModel with ref.watch; no bare TextFormField
  widgets/      (optional) widgets used only by this feature
```

Phase 1 ships this folder empty on purpose: the skeleton has zero features.
A feature's first file arrives with its pipeline entry (P0-01 onward).

Shared building blocks live in `lib/shared/`, never inside a feature. App-wide
wiring (config, network, theme) lives in `lib/core/`.
