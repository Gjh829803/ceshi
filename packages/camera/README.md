# Legacy Three.js camera package

This package currently belongs to the Legacy Three.js/Rapier catalog path. It is consumed by
`@whitebox-world/subjects` and is not part of the Canonical Babylon/Havok Camera system.

Do not add Camera Profile, Camera Context, View Preference, Camera Selection, Browser protocol,
or Babylon runtime APIs here. The approved target is an atomic clean break: first move the old
Three.js rig into an explicitly Legacy subject scope, then rebuild `@whitebox-world/camera` as the
provider-neutral Camera Domain package described in
[`2026-08-24-context-driven-gameplay-camera-composition-design.md`](../../docs/superpowers/specs/2026-08-24-context-driven-gameplay-camera-composition-design.md#51-canonical-package-boundary).

Do not delete this package by itself while `pnpm dev`, catalog scenes, `SdkWorldAdapter`, and the
Legacy scene gates still depend on it. Full Three.js/Rapier retirement is tracked by P3.2 in
[`docs/18-refactor-progress-and-backlog.md`](../../docs/18-refactor-progress-and-backlog.md#p32-默认实现切换).
