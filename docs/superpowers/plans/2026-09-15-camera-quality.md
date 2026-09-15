# Camera quality and authoring completion

Base: dev `1f3d7d5037d6197696cb56afd086b568a2456ccc`. User acceptance is
required before merge. Preserve calibrated presets and the existing single camera
owner, fixed input transaction, collision solver and production workflow.

## Implementation boundaries

- Remove unused observation declarations and correct current guides. Historical
  reviews and frozen source/recording identities remain historical evidence.
- Keep automatic selection's fallback behavior. Carry the original configuration
  error, field path and candidate view through inspection to Playground/Creator.
- Put short parameter descriptions in the authoritative schema. The generated
  discovery artifact and existing editor consume the same descriptions.
- Add an optional `orientation.recenter.yawTarget`: subject-forward (the default),
  movement-direction, or a configured world-forward yaw. Movement uses measured
  horizontal world velocity; missing/zero horizontal velocity holds orbit, and
  reverse motion deliberately aims behind the reverse travel direction. Existing
  delay, minimum speed and half-life remain authoritative. Convert world direction
  into the view reference frame; no changes to the default formula or preset data.
- Add opt-in, bounded camera performance samples for input, fixed evaluation,
  presentation and collision queries. Wall time measures cost only, never drives
  simulation. Disabled diagnostics perform no clock reads or per-query allocations;
  failures in auxiliary timing degrade locally. Inspection does not measure itself.
- Extend existing maintenance harnesses with repeatable routes, frame/pose/input
  records and baseline comparisons. Include dense scenes and real Creator/Episode
  consumers. No new production gate; no performance promise from average FPS.

## Acceptance checklist

- [x] Legacy declarations and conflicting current documentation removed.
- [x] Unavailable automatic views report source error and active fallback.
- [x] Schema descriptions reach real discovery and visual controls.
- [x] Recenter targets handle forward/reverse/drift, vertical/zero motion,
      reference frames, manual orbit delay and unchanged defaults.
- [x] Timing is bounded, opt-in, read-only and separates query cost from stages.
- [x] Continuous routes and performance comparisons have reusable commands.
- [x] Affected suite, typecheck, lint, census, prebuild and Playground build pass.
- [x] Actual browser and local production-path evidence reviewed; limits recorded.
- [x] Branch ready for user acceptance; not merged.

## Industry references

- [Cinemachine Orbital Follow](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineOrbitalFollow.html): reference frame and recenter target are separate from timing.
- [Cinemachine Orbital Transposer](https://docs.unity3d.com/Packages/com.unity.cinemachine@2.10/manual/CinemachineBodyOrbitalTransposer.html): subject forward and movement direction have distinct semantics.
- [Cinemachine Deoccluder](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineDeoccluder.html): obstacle work has measurable cost. This task does not replace our calibrated collision algorithm.

Verification evidence and user acceptance boundary: [review record](../../reviews/2026-09-15-camera-quality.md).
