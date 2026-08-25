# `@whitebox-world/camera`

Provider-neutral Camera Domain for the Canonical runtime.

Named camera presets are modeled as stable `cameraRigProfileRef` values plus a closed `baseMode`
(`first-person`, `free-orbit`, `stable-follow`, `speed-chase`, or `flight-horizon`). AI-facing
callers select these named resources or request `auto`; they do not construct renderer cameras.

This package owns:

- closed Camera Rig parameter names and provider-neutral Rig/Modifier/Context Profile content;
- `CameraViewPreferenceV1` and the committed-tick `CameraContextSampleV1` projection contract;
- Camera Context admission, command-time View Preference admission, deterministic selection, fallback diagnostics, and explain output.

It intentionally does not own a renderer camera, collision query, Runtime Session, Registry envelope,
Browser command, or Gameplay state. The intended integration dependency points toward this package:

```text
subject-registry / compiler / runtime-host / runtime-babylon
                         └──→ @whitebox-world/camera
```

`selectCameraViewV1(...)` is pure. It reads one admitted Context Profile, one immutable sample from a
single committed simulation tick, and one View Preference. It returns resource refs plus explain and
diagnostic data; it never calculates an engine pose or changes World State.

Command-time Preference checks use `admitCameraViewPreferenceV1(...)`. A rejected command leaves the
current Preference and View unchanged. `selectCameraViewV1(...)` handles the separate case where a
previously accepted Preference becomes incompatible after a committed Context change: it preserves the
Preference intent, selects the Context's locked default Safe View, and sets `fallbackActive: true` with
`CAMERA_PREFERENCE_CONTEXT_INCOMPATIBLE`.

Current delivery boundary: the provider-neutral contracts, admission, pure selection, diagnostics,
and explain output are implemented and tested in this package. Committed Gameplay Context projection,
Registry locking, Browser preference commands, and Babylon CameraDirector consumption of the resulting
Selection Decision are not yet integrated; this README does not claim those runtime surfaces.

The authoritative ownership and selection rules are in
[`2026-08-24-context-driven-gameplay-camera-composition-design.md`](../../docs/superpowers/specs/2026-08-24-context-driven-gameplay-camera-composition-design.md#51-canonical-package-boundary).
