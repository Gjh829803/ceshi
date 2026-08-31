# BWB-3 Babylon Block Visual Capture Implementation

**Status:** Implementation candidate on `codex/bwb3-block-capture`. Main-agent integration and
BWB-4 same-Layout review remain required.

**Goal:** Render Profile-created Babylon block Meshes with stable semantic visual groups and produce
real local Opening, Top and Side screenshots without creating a second Runtime, Camera, physics,
input or tick authority.

## Authority and data flow

```text
Babylon Native Module
  -> BabylonNativeBlockProfileSessionV1.createBlock(...)
  -> session.finalize()
  -> BabylonNativeBlockCheckedLayoutV1
       - layout
       - checkResult
       - matching Mesh records
       |
       +-> createBabylonNativeBlockVisualsV1(...)
       +-> createBabylonNativeBlockAuthoringCaptureV1(...)
       +-> BWB-4 collider contribution adapter (next integration owner)
```

`BabylonNativeBlockCheckedLayoutV1` is the only handoff after finalization. Visual grouping,
authoring views and BWB-4 must not independently re-derive a Layout or combine a Layout,
CheckResult and Mesh list from different sessions. The CheckResult remains the serializable
diagnostic evidence; the CheckedLayout is Build-Epoch-local because it contains live Babylon Mesh
handles.

The Profile session owns its created Meshes and releases them in reverse creation order through
`session.dispose()`. The visual adapter owns only its palette materials: its idempotent `dispose()`
detaches those materials in reverse node order and then releases the materials in reverse creation
order. This avoids two competing Mesh lifecycle owners.

## Scope boundaries

- This task adds ordinary Babylon Mesh presentation, palette materials, stable visual groups and
  local authoring-time view descriptors.
- The local verifier may create temporary capture Cameras in its isolated fixture. The package API
  itself creates no Camera and never changes `scene.activeCamera`.
- No RuntimeHost, Gameplay, Havok, input, render loop or SDK Camera authority changes are part of
  BWB-3.
- The screenshots are local BWB-3 structural/visual evidence. They are not BNA-7 formal Capture,
  Route/Nav evidence, collision proof or Character passability evidence.

## Implemented acceptance

- [x] `session.finalize()` publishes one frozen CheckedLayout and is idempotent.
- [x] Visual and authoring-capture adapters accept only that CheckedLayout.
- [x] Stable block ordering, visual-group inventory, transforms and palette assignment are tested.
- [x] Candidate instances do not share Meshes or materials.
- [x] Session Mesh cleanup and visual material cleanup are idempotent and reverse ordered.
- [x] The two new test files are registered in the root test census and the APIs are root-exported.
- [x] A real Chromium/WebGL fixture renders Opening, Top and Side at 800×600.
- [x] The verifier rejects missing, duplicate, solid-color or duplicate-view screenshots.

## Evidence

Developer entry:

```bash
pnpm verify:bwb3-block-capture
```

Tracked evidence:

- `examples/evidence/native-block-capture/opening.png`
- `examples/evidence/native-block-capture/top-down.png`
- `examples/evidence/native-block-capture/side.png`
- `examples/evidence/native-block-capture/evidence.json`

The current images have distinct content hashes and expose the same three semantic groups in all
views: `cliff-mass`, `ridge-gate`, and `route-spine`. The fixture intentionally includes an
asymmetric T route, a block gate and a side mass so a mirrored/duplicated view cannot satisfy the
rendered evidence check accidentally.

Focused closure commands for this branch are the Profile package tests, the rendered Capture
verifier, `pnpm typecheck`, `pnpm test:census`, and `git diff --check`. Repository-wide gates and
independent exact-SHA review belong to the main-agent integration checkpoint.

## BWB-4 handoff

BWB-4 should accept `BabylonNativeBlockCheckedLayoutV1` directly and derive collider contributions
from `checkedLayout.layout` joined to `checkedLayout.records`. It must not call
`deriveBabylonNativeBlockLayoutV1` again, must not apply display-gap scaling to collision geometry,
and must not publish Character support/passability until the Host freezes contributions and the real
Havok traversal evidence passes. BWB-3 and BWB-4 therefore share one checked Layout but retain
separate presentation-material and Host-collider ownership.
