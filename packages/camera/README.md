# `@whitebox-world/camera`

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
provider-neutral Camera Geometry Query V2 port. The locked Babylon 9.23.0 / Havok adapter performs
an exact closest sphere sweep, reports contact normals and start overlap, and truthfully caps exclusion
at one registered physical body. Task 6 replaces the isolated live-V1 WorldRuntime projection seam
with the committed CharacterMovement transaction output.

Deep third-person retraction uses one capability-driven composition rule rather than scene labels:
when the safe arm becomes short relative to the Subject's authored `FootAlignment` to
`FirstPersonView` span, Babylon gradually aims at that span's visual center and widens the vertical
FOV only as much as the short arm requires (capped at 80 degrees). The safe collision pose remains
unchanged, and the composition naturally unwinds at the Spring Arm's bounded recovery rate.

The authoritative ownership and selection rules are in
[`2026-08-24-context-driven-gameplay-camera-composition-design.md`](../../docs/superpowers/specs/2026-08-24-context-driven-gameplay-camera-composition-design.md#51-canonical-package-boundary).
