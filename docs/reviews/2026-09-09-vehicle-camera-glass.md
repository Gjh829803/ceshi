# Vehicle camera and whitebox glass verification

Base: `8bfe77f1` on `main`. The whale-fall-valley-028 report was reproduced on the
earlier `80e0d255` main baseline: a player touching the rover envelope stayed
outside it at x≈1.645 m, but a low side orbit collapsed an 11 m arm to 0.005367 m.
The original scene also replaced its opacity-.25, double-sided windshield with
an opaque material.

## Result

Training camera queries now refine vehicle movement envelopes with rigid mesh
geometry, preserving open cabins, solid panels and separate glass sight/camera
collision behavior. Character movement envelopes are unchanged. Empty or
unsupported meshes keep the conservative envelope fallback. The current carrier
is excluded from its own camera arm; other vehicles remain obstacles.

Native Rapier mesh shapes are retained and freed on geometry replacement or
runtime disposal. Closed-volume recognition welds numerical primitive seams
within a capped tolerance; the original surface triangles are unchanged and
intentionally open shells stay hollow. No extra physics world or clock is added.

The [vehicle-camera example](../../examples/three-creator/vehicle-camera/README.md)
preserves transparency and material-array slots with a local native-Three helper,
retains the preset rider, and uses SDK T/reset controls. Creator discovery returns
its complete source graph under a policy allowing only its two required assets.
The existing bridge-inspection renderer fixture now supplies the shadowMap state
required by main; its six tests previously failed before reaching their assertions.

## Evidence

| Check | Result |
| --- | --- |
| Final local SDK, Playground and affected Creator/Episode closure | 585 tests passed in 42 files |
| Typecheck and test census | Passed; 72 files, 25 contract, 47 resource-heavy |
| Runtime prebuild | `0f545379a89d2cadc4d31d8d7aec0aeda417faec07ecaf405b4f9bc57ab0db29` |
| Corrected local whale candidate | `3d5ae77137dea65fa4abd7f72c8e4be46f73452d80f594b83ddbea72cdcd47ee` |
| Actual whale 315-tick low orbit | Minimum arm ≈11 m; player contact still reports `rover:0` |
| Real browser controls | F enter/exit, T modes 1→2→0, R authored opening restored; no page errors |
| Windshield | transparent=true, opacity=.25, DoubleSide; first-person pixels inspected |
| Independent Episode capture | 11 m arm, repeated PNG and reset/replay PNG identical, temporal solver state unchanged |
| Independent review | Both native-query performance and primitive-interior findings fixed and rechecked |

Review measured the same 4,800-triangle obstructing panel at 0.343 ms/fixed step
after native caching, versus 124.358 ms before; this is a local Node benchmark,
not a browser frame-rate claim. Native lifetime probes freed all 127 observed
handles exactly once across queries, failed construction, replacement and disposal.

Artifacts and scripts are retained outside Git under
`outputs/vehicle-camera/`: `runtime/`, `case-candidate.json`, `browser/report.json`,
screenshots, the exact-case preparation/check scripts and review reports. The
Episode world PNG SHA-256 is
`6cc865b2eb821fa679b25988e7326cd7199f30b59bbe6a99af2bc3a56317c854`.
The original ZIP SHA-256 is
`526f490430fcca58a1c7ee1607f405cdbe69559ea03b5f28b5d5a77be76bf871`.

The local case copy uses the example material helper, native SDK T cycling and
an authored opening in the user reset action. It avoids an unconditional camera
write from `onReset` while Episode owns capture. The original ZIP and published
page were not overwritten, and no external production job was started.

## Validation scope

The local command covers all `packages/three-world`, `packages/camera-collision`,
`apps/three-creator-playground`, plus Creator vehicle-camera, example-files,
authoring-schema, custom-vehicle, training-families, training-workspace,
training-seating and Episode adapter/contracts tests. The repository Linux CI is
the full cross-platform gate. An earlier Windows full-closure attempt encountered
missing FFmpeg, restricted symbolic-link creation, missing `python3`, and a
Windows command-runner native abort in a cloud-contract test. These were not
suppressed or relabelled as passing. Main's stale T expectation was resolved by
syncing its subsequent correction; the renderer fixture was repaired explicitly.

Geometry queries conservatively treat texture alpha cutouts/custom shader
transparency as opaque. This change does not automatically fit arbitrary rider
seats or provide a detailed collision rig for skinned vehicle subjects.
