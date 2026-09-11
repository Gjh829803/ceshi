# Preset content maintenance

This package contains reusable models, handling presets, calibration scenes and
profiles used by the SDK Playground and Creator tooling. It depends on the SDK;
it must not depend on Creator or Episode Hosts. Asset registration scripts that
connect packages live under repository `scripts/assets`.

Read [content usage](README.md) and [asset integration](../../docs/asset-production-integration.md).
Preserve shared configuration ownership, parameter units, asset identities and
actual model/rig/action bindings. The library is not an exhaustive scene template.
Vehicles offered to production Agents use model-free handling and Agent-authored
geometry; development models do not expand production asset permissions.

Keep source in domain folders under `src/`, pairing each vehicle model and spec.
Persisted defaults belong in `config/`; keep package-root files to metadata/docs.
