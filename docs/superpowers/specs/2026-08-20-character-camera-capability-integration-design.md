# Character, Camera, and Capability Runtime Integration Design

- Status: Implemented and verified
- Date: 2026-08-20
- Target branch: `main`
- Integration branch: `codex/integrate-character-camera-decoupling`
- Current-main baseline: `8f86c9581e2850889021217d5715fd33f6026724`
- Incoming tip: `7d8962c13c638dfe098e5d36f6a698ee5fe29449`
- Incoming fork point: `7f8a48ba960088ba5a99305014b0afca0add7cec`
- Upstream architecture: [`2026-08-17-ai-first-lego-game-sdk-design.md`](./2026-08-17-ai-first-lego-game-sdk-design.md)
- Runtime review evidence: [`../../reviews/2026-08-20-babylon-runtime-deep-check-findings.md`](../../reviews/2026-08-20-babylon-runtime-deep-check-findings.md)

## 1. Decision

Integrate the incoming Capability Registry, Motion Kernel, Camera Director, Browser controls, and Playground workbench, while retaining current `main` as the correctness authority for physics support, gravity, jump input, terrain mapping, fixed-step scheduling, cleanup, and conformance evidence.

This is a semantic three-way integration. A textual merge that selects one complete version of `SubjectController`, `BabylonWorldRuntime`, or `BabylonWorldAdapter` is not acceptable because each side contains required behavior that the other side lacks.

## 2. Goals

1. Make Subject movement configurable through Registry-locked Motion, Control, Camera, Medium, and Harness resources.
2. Keep character facing independent from orbit-camera yaw.
3. Preserve the verified Babylon/Havok behavior already present on `main`.
4. Preserve deterministic CLI and Browser fixed-input behavior.
5. Keep AI-facing Authoring data engine-neutral and free of Babylon/Havok handles.
6. Expose one canonical public term for each capability concept.
7. Land the incoming Playground workbench without weakening initialization failure recovery or runtime diagnostics.

## 3. Non-goals and phase boundary

- This integration does not declare vehicles, gliders, swimming, mounts, or relationships production-ready.
- Vehicle, slide, glide, and water profiles may be discoverable in the internal workbench and conformance harness, but outdoor Authoring must not present them as supported production scene capabilities until their phase gates are complete.
- This integration does not implement dynamic Capability installation/removal, transactional Relationship binding, or networking.
- This integration does not add a second AI-facing schema dialect for compatibility. Any compatibility projection needed by existing tests stays internal and must not create synonymous public fields.

## 4. Three-way authority matrix

| Domain | Authority | Required integration |
|---|---|---|
| Capability resource types and Registry catalogs | Incoming branch | Adopt after naming, closed-union, Hash, and resource-lock audit. |
| Subject Capability normalization and compilation | Incoming branch | Preserve explicit projections and URI/provider privacy from current main. |
| Motion implementation boundary | Incoming branch | Keep `SubjectController` as a thin facade over `MotionKernelRuntimeV1`. |
| Ground/air support truth | Current main | Havok `checkSupport()` is the sole ground/air authority. Terrain sampling must not independently infer groundedness. |
| Gravity and falling | Current main | Apply gravity whenever physically unsupported, regardless of jump history or active profile. |
| Jump input | Current main | Rising-edge trigger; release is required before re-arming. |
| Terrain mesh, heightfield, and sampling | Current main | Keep centered mesh coordinates, square heightfield X/Z correction, rectangular triangle-mesh fallback, and triangle interpolation in Compiler and Runtime. |
| Layout rotation math | Current main | Keep Babylon `Ry * Rx * Rz` parity and multi-axis conformance coverage. |
| Camera architecture | Incoming branch | `CameraDirectorV1` is the only runtime owner of camera preference, orbit offsets, damping, collision shortening, and active Camera Profile. |
| Character facing | Incoming branch plus current tests | Motion Kernel owns Subject yaw. Camera orbit must never mutate Subject yaw. |
| Camera input | Combined | Adapter converts keys, pointer drag, wheel, CLI, and Browser requests into Camera Director commands; it does not store a competing runtime camera state. |
| Display scheduling | Current main | Keep fixed-step accumulator, five-tick suspension cap, real measured display FPS, and safe frame-loop diagnostic. |
| Initialization stages and Playground workbench | Incoming branch | Preserve staged recovery, package switching, tuning controls, and diagnostics without coupling UI state to Babylon internals. |
| Asset cache, rig, animation, socket, and disposal | Current main | No regression to typed errors, privacy, instance isolation, or all-resource cleanup. |
| Generated artifacts | Merged result | Regenerate transactionally with the canonical verifiers and synchronize exact evidence docs. |

## 5. Runtime state ownership

### 5.1 Input and movement

The Adapter owns physical input state. `ControlProfileRuntime` converts semantic actions and the current horizontal camera basis into a typed Motion Command. `MotionKernelRuntimeV1` owns active profile selection, tuning, velocity, yaw, and fixed-tick motion execution. `SubjectController` only coordinates that command with the visual and physics runtime.

For camera-relative planar control, the horizontal camera basis affects requested movement direction only. It must not directly rotate the Subject or replace the Motion Kernel's forward vector.

### 5.2 Support, medium, and gravity

The physical support result is sampled once per motion tick and drives jump admission, falling, landing, and the ground/air snapshot. Water membership is a separate semantic sensor and may select a water Medium/Profile, but it cannot fabricate ground support.

An initially supported spawn may use a bounded physical ray bootstrap before the first Havok support result. After that first tick, only Havok support is authoritative.

Every unsupported kernel except an explicitly powered flight kernel integrates its declared gravity. Ground, forward-steer, wheeled, and slide kernels cannot hover merely because no jump was initiated.

### 5.3 Jump lifecycle

Jump starts only when all conditions are true:

1. the semantic jump action is active now;
2. it was inactive on the previous fixed tick;
3. the Subject is physically supported;
4. the active Motion Profile admits jumping.

Landing clears in-progress jump state but does not re-arm a still-held action. Reset clears both jump state and the previous-action latch.

### 5.4 Camera

`CameraDirectorV1` owns camera state. Its camera-relative third-person orbit uses a stable orbit reference that is initialized on control/profile changes and adjusted only by camera input. Subject yaw follows motion. First-person rigs may use an authored Bone Socket; third-person rigs use target height or an allowed Socket.

Camera collision queries exclude the controlled Subject and shorten distance without modifying the requested orbit state. Reset restores the selected default profile, view offsets, tuning, smoothing state, and stable orbit reference.

## 6. Public contract and compatibility policy

- Registry resources use `...Ref`; raw locations use `...Uri`; Babylon/Havok identifiers remain adapter-internal.
- Persistent definitions use `kind`; Commands and Events use `type`; runtime exclusivity uses `mode`.
- Capability resource unions are closed and Registry Hashes cover every canonical field.
- Every Kernel reachable from the default, optional, or fallback Motion Profiles is resolved, locked, and projected with an explicit `implementationId`. Runtime selection never infers an implementation from a resource-ref substring.
- `listCapabilityResources` and `listCapabilitySubjectDefinitions` are the capability-oriented AI discovery surface. The older `listResources` and `listSubjectDefinitions` methods remain the Canonical V2 authoring view during repository migration; neither method returns a mixed V2/V3 union or aliases the other dialect.
- A capability fallback profile is an explicit locked resource, not a fabricated `legacy` public profile. Primitive/older fixtures may use a deterministic internal compatibility projection while migration remains, but their snapshots omit capability-profile refs rather than publishing an unregistered resource identity. Capability-enabled snapshots identify the resolved canonical profile.
- Public discovery uses the descriptive `authoringAvailability` field with `recommended`, `advanced`, and `experimental`; Registry-only resources may additionally use `internal`. Numeric tier aliases are not exposed to AI callers.

## 7. Failure and ownership behavior

- Invalid Capability refs, incompatible profiles, unsafe tuning, and non-finite state fail closed with stable codes and no provider cause text.
- A pending profile change commits only on a fixed-tick boundary; failure preserves or activates the declared fallback profile.
- Adapter frame failures pause simulation, retain rendering, append one safe diagnostic, and keep the requestAnimationFrame lifecycle alive.
- Runtime construction and disposal retain reverse-order, all-settled, exactly-once cleanup across camera, controllers, visuals, cache leases, physics aggregates, terrain shapes, scene, and engine.
- Initialization stage callbacks are observational only and cannot acquire ownership of runtime resources.

## 8. Required adversarial tests

### Physics and Motion

- unsupported airborne spawn falls and lands;
- controlled Subject walks off a raised collider and lands below;
- uncontrolled airborne Subject falls while its visual remains Idle;
- held jump input triggers once and requires release;
- support-state result wins where bilinear and triangle terrain heights differ;
- square asymmetric and rectangular terrain physical raycasts match rendered X/Z samples;
- every non-flight Motion Kernel inherits the unsupported-gravity contract;
- camera-relative input changes motion direction without coupling orbit yaw to Subject yaw;
- identical fixed input and locked resources produce identical snapshots.

### Camera and Adapter

- orbit input changes camera yaw without changing a stationary Subject yaw;
- Subject turns with movement while camera orbit reference remains stable;
- control rebinding resets camera reference to the new Subject without moving the old Subject;
- pointer, wheel, keyboard, CLI, and Browser camera commands converge on the same Director state;
- 120 Hz-like and 30 Hz-like timestamps advance equivalent fixed ticks;
- tab-suspension delta is capped at five ticks;
- frame-loop failure produces the safe diagnostic and schedules the next render frame;
- both reset paths clear movement, camera, timing, tuning, and diagnostic state.

### Schema, Registry, and Compiler

- every capability resource has an exact canonical Hash lock;
- Registry resolution rejects missing, duplicate, incompatible, and cyclic references;
- Normalized IR and ExecutionPlan contain no URI, provider handle, or Registry-only metadata;
- forged nested objects are projected explicitly rather than cloned;
- AI-facing examples use only the canonical V3 vocabulary;
- production discovery excludes preview-only vehicle, glide, and swimming capabilities.

### Runtime ownership and visual evidence

- two instances keep independent Controller, Motion Profile, Skeleton, Clip, Socket, Camera target, and disposal state;
- rigged Golden and G Bot worlds retain distinct visible action poses;
- all four canonical verifiers pass without temporary, backup, server, or browser residue.

## 9. Review protocol change

The root `AGENTS.md` will contain a compact, stable deep-review policy. Detailed operational checks live in `docs/reviews/runtime-deep-review-checklist.md` so the root instruction file remains readable.

The policy requires reviewers to:

1. identify the single authority for every runtime state;
2. verify dependency-sensitive claims against the installed dependency version;
3. test asymmetric data, state transitions, failure paths, refresh-rate variation, reset, disposal, and multiple instances;
4. compare current main, incoming branch, and intended merged semantics during integration;
5. distinguish automated evidence, visual inspection, and unperformed manual checks;
6. state capability gaps explicitly instead of treating partial behavior as production support.

## 10. Integration and acceptance

1. Preserve the verified current-main baseline in commits.
2. Merge the incoming branch into the isolated integration branch without auto-committing.
3. Resolve conflicts according to the authority matrix, not file-level preference.
4. Add or adapt tests before changing merged behavior whenever a required invariant is not already locked.
5. Run focused suites while resolving each subsystem.
6. Run `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm verify:canonical`, `pnpm verify:placement-layout`, `pnpm verify:rigged-subject`, and `pnpm verify:g-bot-subject` on the final tree.
7. Inspect regenerated screenshots and check Hash/document consistency.
8. Merge the validated integration branch into local `main` only after all gates pass.
9. Remove the integration worktree only after proving its commit is an ancestor of `main` and the worktree is clean.

Acceptance requires no unresolved conflict markers, no uncommitted files, no verifier residue, and no known P0-P2 finding in the integrated scope.

## 11. Final verification record

- `pnpm typecheck`: passed.
- `pnpm test`: 55 files and 490 tests passed.
- `pnpm build`: passed with 2,103 transformed modules; the existing large-chunk advisory remains a separate bundle-splitting concern.
- `pnpm verify:canonical`: passed; Normalized IR `sha256:e5b53f5d853c33e07e4d09c960d01210ad951b3666dcd41faf2c442d9d698d83`, ExecutionPlan `sha256:39925981aac70d61b5056259c384346fb0db4fde628499dbf6799e098c15ba0d`.
- `pnpm verify:placement-layout`: passed; Normalized IR `sha256:869fbf4e48fc6200d8512a643914d091358e3f8e254e705dffd315233e7c7190`, ExecutionPlan `sha256:e55aa781caa92af917b5224a3846e0ddd5e672b1ab9f3613fcb62645b3b98b6d`.
- `pnpm verify:rigged-subject`: passed; Normalized IR `sha256:ffe2240f2fa90931d7d7cb3863c0d1068b0984dd2b4897f2ffbc9473ca76a1f9`, ExecutionPlan `sha256:df3a35b3ff935c0ddc1f9c68a8dfca6395193b02c92b1db6e63b20429f55f994`.
- `pnpm verify:g-bot-subject`: passed; Normalized IR `sha256:bcf0c81f14450cb2f7c875b87f645f9fcd5d930ddbc96d5524bebd1e4b1e4123`, ExecutionPlan `sha256:058035c1f897e78ac6af4b9905ce934beb492812795f3186291053c10232848e`.
- Generated screenshots were inspected after the final verifier run. G Bot walk/run poses are visibly distinct, the Golden rigged walk remains visible, and no verifier temporary or backup directory remains.
