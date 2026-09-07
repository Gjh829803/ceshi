# 04 rerecord: remaining gait hesitation

> Historical source-bound review/verification record. Scope and results apply only
> to the source and artifacts identified below. For current behavior, use the
> [branch guide](../three-sdk-data-production.md); recheck findings against current code.

## Finding

The previous KCC/contact-state correction did not address animation timeline
semantics. All six full, hash-verified r2 traces show no unexpected same-action
time reset. Nevertheless two independently reproducible animation defects remain:

1. G-bot walk/run tracks start at 0.0333333351 seconds. Three clamps to the first
   sample before that timestamp; raw looping therefore holds the same pose for
   two 60Hz ticks every cycle. Walk's original duration is 1 second, run's is
   0.7666666508 seconds. Continuous walk with no state changes reproduces it.
2. The generic action player resets each new action to zero. Episode input
   routinely switches walk/run, so the new gait starts with the same foot instead
   of continuing the current phase. In actual segment-00, at 7.792 seconds run
   time 0.35 becomes walk time 0.05; at 9.417 seconds walk time 0.633 becomes run
   time 0.033. Both happen during real forward movement.

04's authored visual adapter follows the SDK skeleton. It has no periodic phase
reset of its own; it reads the preceding fixed tick. The distinct planned
observation stops in the recording remain intentional input behavior.

## Change

The internal automatic walk/run path uses per-instance cloned clips, removes the
common positive time origin, and transfers normalized phase directly between
automatic gaits. It shares the existing mixer and clock. Generic/manual actions,
idle, jump, reset and source GLB bytes keep their existing semantics.

The dispatch registry uses the owned mixer identity because WorldAssets supplies
a managed AssetInstance wrapper to the engine. A real-wrapper regression caught
and prevented a bypass that a raw loadAsset-only test would have missed.

The known G-bot walk/run pairing was checked over 360 effective-time phases;
left/right knee lead agreed in 359/360 samples. Running has different flexion and
airborne time, so equal foot height is not used as a phase test.

## Evidence

- Before: 10 fully frozen limb ticks in 300 ticks of uninterrupted walk at 60Hz.
- After: zero fully frozen ticks for walk and run over five seconds at 60/120Hz.
- Eighteen new real-asset tests cover constant gait, actual 24fps sampling, phase,
  source-clip preservation, manual playback, reset, clone/managed wrappers and
  the public World API with real Rapier motion.
- The complete affected Three closure passed: 32 files / 390 tests. Typecheck,
  381-file test census, workspace boundary check and runtime prebuild passed.

For the actual case, the exact previous Episode SDK was rebuilt byte-for-byte
(`4c43a5a0a77b7b6194b4c0c01e582d222d8983216ebfc338e8c3462db2383572`).
The new compatible bundle overlays only assets.ts and engine.ts; it retains the
original camera kernel and has SHA256
`d0a18fe8953a9a11a7adff09ee577c80a1fdf6f3e9c32382ae6b5c52485a4791`.

Both versions replayed the same first 12 seconds of the published segment-00
trace through the real browser/SDK: 288 frames each, 1280×720 at 24fps. Maximum
position difference was **0**, all camera states matched, and opening PNG bytes
were identical. Source modules, original reference and compiled scene stayed
unchanged. Paired rendered videos were inspected in the local comparison viewer.

Private evidence is under `.codex-tmp/gait04-recurrence` (six complete traces,
analysis, exact SDK builds, real case replay, video and identity proof), with
independent rig probes under `.codex-tmp/gait-recurrence-audit`.

This is a validated local correction and source-code fix. The existing r2
recordings, frozen capture package, queues and human reviews were not overwritten.
The 12-second comparison is diagnostic evidence, not six newly delivered full
production clips or a claim of universal visual quality.
