# `@whitebox-world/camera`

> Historical package documentation. This package remains pending a separate code
> dependency review; it does not define the current Three SDK. See the
> [current architecture](../../docs/three-sdk-architecture.md).

Provider-neutral Camera Domain for the Canonical runtime.

Named camera presets are modeled as stable `cameraRigProfileRef` values plus a closed `baseMode`
(`first-person`, `free-orbit`, `stable-follow`, `speed-chase`, or `flight-horizon`). AI-facing
callers select these named resources or request `auto`; they do not construct renderer cameras.

This package owns:

- closed Camera Rig parameter names and provider-neutral Rig/Modifier/Context Profile content;
- `CameraViewPreferenceV1`, the committed `CameraContextSampleV2`, and the provider-neutral collision-query port contract;
- Camera Context admission, command-time View Preference admission, deterministic selection, fallback diagnostics, and explain output.

It intentionally does not own a renderer camera, collision query, Runtime Session, Registry envelope,
Browser command, or Gameplay state. The intended integration dependency points toward this package:

```text
subject-registry / compiler / runtime-host / runtime-babylon
                         └──→ @whitebox-world/camera
```

`selectCameraViewV2(...)` is pure. It reads one admitted Context Profile, one immutable sample from a
single committed simulation tick, and one View Preference. It returns resource refs plus explain and
diagnostic data; it never calculates an engine pose or changes World State.

Command-time Preference checks use `admitCameraViewPreferenceV1(...)`. A rejected command leaves the
current Preference and View unchanged. `selectCameraViewV2(...)` handles the separate case where a
previously accepted Preference becomes incompatible after a committed Context change: it preserves the
Preference intent, selects the Context's locked default Safe View, and sets `fallbackActive: true` with
`CAMERA_PREFERENCE_CONTEXT_INCOMPATIBLE`.

Current delivery boundary: Camera Domain consumes only a closed, deeply frozen committed V2 sample.
Babylon CameraDirector consumes the resulting V2 Selection Decision and delegates collision to the
provider-neutral query port. The Babylon 9.21.2 adapter currently declares
`ray-fan-approximation`; it does not claim an exact sphere sweep. Task 6 replaces the isolated live-V1
WorldRuntime projection seam with the committed CharacterMovement transaction output.

The authoritative ownership and selection rules are in
[`2026-08-24-context-driven-gameplay-camera-composition-design.md`](https://github.com/seedleap/agent-whitebox-world-sdk/blob/4256b6fdf06c7ba732e13a7c9aeee553544438e9/docs/superpowers/specs/2026-08-24-context-driven-gameplay-camera-composition-design.md#51-canonical-package-boundary).
