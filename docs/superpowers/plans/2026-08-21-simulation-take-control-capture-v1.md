# Simulation Take / Control Capture V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Every production change follows RED-GREEN-REFACTOR.

**Goal:** Deliver the first production-shaped P0.2 vertical slice: an immutable `SimulationTake` compiles into an exact fixed-tick capture schedule, runs through the canonical Babylon/Havok runtime, emits five truthful control passes, and produces a hash-verified `ControlCaptureBundle` that Browser and CLI consumers can validate and inspect.

**Status:** Complete on 2026-08-21. The V1 slice is implemented and covered by the fresh verification matrix recorded in `docs/reviews/2026-08-21-control-capture-v1-review.md`.

**Architecture:** Keep world truth, take intent, mutable session state, and captured evidence separate. A new isomorphic capture package owns AI-facing contracts, strict validation, schedule compilation, profiles, and canonical hashes. Babylon owns engine-specific pass capture behind the runtime adapter. The Browser API exposes deterministic tick/render/capture operations without filesystem authority. The Node CLI owns atomic bundle assembly and integrity validation. The current Authoring → IR → ExecutionPlan pipeline supplies the first slice's world identity; this task does not pretend the later full WorldPackage packaging milestone is complete.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, Babylon.js 9.21.2, Havok, Vite, Playwright, canonical SHA-256.

**Spec:** `docs/superpowers/specs/2026-08-19-simulation-take-control-capture-design.md`

## Frozen Scope

- Required passes are exactly `neutral-color`, `linear-depth-meters`, `semantic-class-id`, `instance-id`, and `world-normal`.
- Simulation is fixed at the runtime's supported 60 ticks/second. Capture schedules may be constant-rate or explicit ticks and compile with integer/rational arithmetic.
- `simulationTick`, `renderFrameIndex`, and `captureFrameIndex` are distinct counters. No unqualified public `frame` field is introduced.
- Capture waits for the requested committed simulation tick and a render-ready receipt. Arbitrary sleeps are not protocol evidence.
- First encoding profile: top-left rows; neutral color is lossless PNG; depth and normals are little-endian float32 binary; semantic and instance IDs are little-endian uint32 binary; background ID is zero; depth no-hit value is zero meters.
- Babylon/WebGL implementation details stay behind runtime adapters. AI-facing Schema contains no Babylon, Havok, Canvas, Playwright, render-target, or provider fields.
- No video-provider adapter, motion vectors, swimming, new camera algorithm, schema migration, full WorldPackage directory format, or special-terrain implementation is part of this slice.
- Browser capture dimensions are explicit and bounded. Tests use small deterministic resolutions; public defaults are profile-owned.
- The two acceptance Takes both describe 10 seconds at 60 Hz simulation / 24 fps capture and share one world identity, while their control/camera tracks and resulting hashes differ.

## Runtime authority map

| State | Authority | Capture consumer |
| --- | --- | --- |
| Simulation tick | `BabylonWorldRuntime.runFixedInput` | Take runner and frame metadata |
| Subject transform/action | Havok controller + subject visual | snapshots and all render passes |
| Camera rig/orbit | `CameraDirectorV1` | camera metadata and all render passes |
| Render submission index | Babylon runtime | render-ready receipt |
| Capture schedule | pure Take compiler | take runner |
| Capture frame index | take runner | bundle frame directory/manifest |
| Pass bytes | Babylon capture provider | Node bundle writer |
| Bundle root hash | Node bundle finalizer | validator/adapters |

---

### Task 1: Add strict Take, profile, schedule, and bundle contracts

**Files:**
- Create: `packages/control-capture/package.json`
- Create: `packages/control-capture/src/index.ts`
- Create: `packages/control-capture/src/types.ts`
- Create: `packages/control-capture/src/validate.ts`
- Create: `packages/control-capture/src/schedule.ts`
- Create: `packages/control-capture/src/profiles.ts`
- Create: `packages/control-capture/src/control-capture.test.ts`
- Modify: `pnpm-lock.yaml`

- [x] Write RED tests for strict discriminators, closed pass IDs, unit-bearing numeric fields, duplicate IDs/ticks, out-of-range ticks, conflicting tracks, unsupported tick rates, and malformed SHA-256 values.
- [x] Write RED schedule tests proving 60 Hz simulation to 24 fps yields exactly 240 entries over 600 ticks, begins at tick 0, ends below tick 600, is monotonic, and is byte-for-byte deterministic without accumulated floating-point time.
- [x] Write RED hash tests proving identical Takes hash identically, camera/control changes alter the Take hash, and serialized runtime/session-only fields are rejected.
- [x] Implement the minimal discriminated unions, validators, canonical profile locks, rational schedule compiler, and hash functions.
- [x] Run `pnpm vitest run packages/control-capture/src/control-capture.test.ts`, `pnpm typecheck`, and `git diff --check`.
- [x] Commit as `feat: add simulation take contracts`.

### Task 2: Add atomic bundle assembly and integrity validation

**Files:**
- Create: `scripts/lib/control-capture-bundle.ts`
- Create: `scripts/lib/control-capture-bundle.test.ts`
- Modify: `package.json` only if a direct runtime dependency is required.

- [x] Write RED tests for deterministic directory names, required profile/table/track files, per-pass hashes, frame hashes, manifest hash, root hash, atomic finalize, and cleanup after a failed write.
- [x] Write RED tamper tests for changed bytes, missing required pass, duplicate frame index, mixed Take hash, mixed session ID, mixed world hash, non-monotonic ticks, and a stale integrity manifest.
- [x] Implement a Node-only bundle writer that stages in a sibling temporary directory, writes canonical JSON/NDJSON and binary bytes, verifies its own result, then atomically renames to the requested output.
- [x] Implement a reader/inspector and a validator whose diagnostics use stable codes and never trust hashes declared by the input without recomputing bytes.
- [x] Run `pnpm vitest run scripts/lib/control-capture-bundle.test.ts`, `pnpm typecheck`, and `git diff --check`.
- [x] Commit as `feat: add control capture bundle integrity`.

### Task 3: Implement Babylon five-pass capture with version-verified semantics

**Files:**
- Create: `packages/runtime-babylon/src/control-capture.ts`
- Create: `packages/runtime-babylon/src/control-capture.test.ts`
- Modify: `packages/runtime-babylon/src/babylon-world-runtime.ts`
- Modify: `packages/runtime-babylon/src/index.ts`
- Modify: `packages/runtime-babylon/package.json`
- Modify: `packages/runtime-contracts/src/runtime-session.ts`
- Modify: `packages/runtime-contracts/src/runtime-contracts.test.ts`

- [x] Record and test installed Babylon 9.21.2 assumptions: `DepthRenderer` camera-space Z semantics, render-target `readPixels` type/origin, G-buffer world/view normal semantics, material override behavior with skinned meshes, and render-target disposal.
- [x] Write RED pure codec tests for vertical row flipping, float32/uint32 little-endian layout, background zero, finite depth/normal values, stable entity table assignment independent of mesh draw order, and non-overlapping semantic/instance IDs.
- [x] Write RED runtime tests for distinct `simulationTick`/`renderFrameIndex`, render-ready receipts, capture rejection before the requested tick, dimension bounds, disposal, and no mutation of gameplay materials/camera/session state.
- [x] Implement one runtime-owned capture provider. Use Babylon's supported depth/G-buffer paths where their installed semantics match the profile; use isolated offscreen material overrides for semantic/instance IDs; restore every touched resource in `finally`.
- [x] Ensure animated/skinned subjects participate in every pass and all five pass payloads are real independently rendered/derived data, not copied screenshots.
- [x] Run focused runtime tests, `pnpm typecheck`, `pnpm verify:rigged-subject`, `pnpm verify:g-bot-subject`, and `git diff --check`.
- [x] Commit as `feat: capture babylon control passes`.

### Task 4: Expose deterministic Browser capture protocol

**Files:**
- Modify: `apps/playground/src/babylon-world-adapter.ts`
- Modify: `apps/playground/src/babylon-world-adapter.test.ts`
- Modify: `apps/playground/src/worldkit-browser-api.ts`
- Modify: `apps/playground/src/worldkit-browser-api.test.ts`

- [x] Write RED API tests for capability discovery, requested-tick matching, one render-ready receipt per captured frame, base64 payload metadata, session/reset invalidation, pause-safe capture, and stable public names shared with package contracts.
- [x] Extend the deferred adapter and `WorldkitBrowserApiV3` additively with `getControlCaptureCapabilities`, `waitForSimulationTick`, `waitForRenderReady`, and `captureControlFrame`.
- [x] Do not expose scene, engine, canvas, render targets, or Babylon handles. Do not advance simulation from a render call.
- [x] Run focused Browser/adapter suites, `pnpm typecheck`, `pnpm build`, and `git diff --check`.
- [x] Commit as `feat: expose deterministic control capture api`.

### Task 5: Add CLI Take runner, bundle commands, and two acceptance Takes

**Files:**
- Modify: `scripts/worldkit.ts`
- Modify: `scripts/worldkit.test.ts`
- Create: `scripts/lib/simulation-take-runner.ts`
- Create: `scripts/lib/simulation-take-runner.test.ts`
- Create: `scripts/verify-control-capture.ts`
- Create: `examples/takes/coastal-walk-opening.take.json`
- Create: `examples/takes/coastal-orbit-run.take.json`
- Modify: `package.json`

- [x] Write RED parser/command tests for `worldkit take validate|inspect|run` and `worldkit capture validate|inspect`, including exact required options and deterministic JSON output.
- [x] Write RED runner tests proving command keyframes are applied on declared ticks, discrete actions fire once, camera keyframes affect Take identity, capture occurs only at compiled ticks, cancellation cleans staging output, and no sleep is used for readiness.
- [x] Implement the Playwright runner as a protocol client: load the current world input, verify its execution identity against the Take, reset/bind, advance exact fixed ticks, wait for render readiness, capture each scheduled frame, stream it to the bundle writer, and finalize only after validation.
- [x] Add two 600-tick / 240-frame Takes sharing one world identity but using different control/camera tracks. Keep their source small and AI-readable.
- [x] Add `pnpm verify:control-capture` to run a bounded real-browser conformance probe that validates all five passes, frame metadata, hash integrity, distinct Take hashes, and same-world identity. Full 240-frame artifact generation remains available through CLI and is not required on every unit-test run.
- [x] Run focused CLI/runner tests, `pnpm typecheck`, `pnpm build`, `pnpm verify:control-capture`, and `git diff --check`.
- [x] Commit as `feat: run simulation takes from cli`.

### Task 6: Close documentation, review the combined slice, and integrate

**Files:**
- Modify: `docs/superpowers/specs/2026-08-19-simulation-take-control-capture-design.md`
- Modify: `docs/18-refactor-progress-and-backlog.md`
- Modify: `README.md`
- Create: `docs/reviews/2026-08-21-control-capture-v1-review.md`

- [x] Update the design from Proposed to the implemented V1 profile, documenting exact encodings, limits, Browser/CLI surface, evidence boundary, and explicitly deferred full WorldPackage/video-adapter work.
- [x] Update the backlog and README entry points with evidence-backed status; do not mark the broader video pipeline complete.
- [x] Review the exact base-to-head diff against the accepted spec, `AGENTS.md`, AI naming rules, and `docs/reviews/runtime-deep-review-checklist.md`. Record authority, engine-source evidence, adversarial tests, and any residual experimental limitations.
- [x] Run the fresh final matrix: `pnpm typecheck`, `pnpm test`, `pnpm test:scenes`, `pnpm build`, `pnpm verify:canonical`, `pnpm verify:placement-layout`, `pnpm verify:rigged-subject`, `pnpm verify:g-bot-subject`, `pnpm verify:control-capture`, and `git diff --check`.
- [x] Inspect representative neutral/depth/semantic/instance/normal artifacts from the real browser verifier and record their dimensions/hashes in the review.
- [x] Commit final docs/review, merge the feature work to `main` only after the merged tree passes the full matrix, push `main`, and remove only the worktree created for this plan after proving it is clean and merged.
