# Babylon Native Scene Lane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one isolated Babylon-native cloud-ridge scene that bypasses the Authoring/IR/ExecutionPlan geometry compiler while reusing SDK-owned Havok collision, subject movement, input, and camera behavior.

**Architecture:** Add a provider-specific Native Scene Module admission boundary inside `@whitebox-world/runtime-babylon`. An explicit experimental Runtime option selects native geometry, invokes one module, validates spawn/collider registrations, creates SDK-owned Havok shapes, and skips ExecutionPlan terrain/object/water construction; a separate Vite app supplies the cloud-ridge Babylon scene and a frozen gameplay bootstrap without invoking the Compiler.

**Tech Stack:** TypeScript 5.9, Babylon.js 9.23.0, Havok 1.3.14, Vitest, Vite 7, Playwright/Chromium for final browser evidence, Diversion source control.

**Spec:** `docs/superpowers/specs/2026-08-27-babylon-native-scene-lane-design.md`

## Execution Result

Implemented on `explore/scene-reconstruction-api` as an experimental vertical
slice. The final affected verification evidence is:

- Native admission, Runtime regression, and scene contract: 125 tests passed.
- Root TypeScript check, catalog Playground build, and Native Playground build:
  passed.
- Resource-heavy gate: 31 files / 463 tests passed.
- Browser fixed-input probe: the Subject moved from `(0.0, 0.1, 18.0)` to
  `(-0.0, 14.0, -36.1)`, stopped `IDLE`, remained `GROUND`, and published
  `主路径通过 ✓`; browser warnings and errors were empty.
- Root `pnpm test` executed 2,480 tests: 2,478 passed. One 20-second
  `subject-preset-promotion` timeout passed in isolation (21/21) and was caused
  by concurrent resource pressure. One ownership-only test shells out to
  `git ls-files` and cannot run in this Diversion workspace; its spawn-safety
  business tests passed separately (10 passed). Neither failure touches the
  Native lane. This exception is retained as evidence rather than hidden by
  changing an unrelated repository test.

The checkboxes below preserve the implementation procedure and RED/GREEN order;
the execution evidence above is the completion record.

## Global Constraints

- The Native visual scene does not call `@whitebox-world/authoring`, `@whitebox-world/compiler`, `@whitebox-world/terrain-compiler`, or `@whitebox-world/world`.
- Existing Canonical Runtime behavior remains the default and retains all current tests.
- AI scene code never creates Havok `PhysicsShape`, `PhysicsAggregate`, character controller, SDK Camera, or a second render loop.
- Babylon types remain inside `@whitebox-world/runtime-babylon` and `apps/native-scene-playground`; no engine-neutral protocol changes.
- Unregistered meshes are visual-only; collision is always explicit and fail-closed.
- Current Route R1/R1b and WorldPackage evidence never consume or claim Native Scene output.
- All local repository edits use `apply_patch`; dependency lock updates use the package manager.

---

### Task 1: Native Scene registration contract

**Files:**
- Create: `packages/runtime-babylon/src/native-scene-module.ts`
- Create: `packages/runtime-babylon/src/native-scene-module.test.ts`
- Modify: `packages/runtime-babylon/src/index.ts`
- Modify: `scripts/lib/test-gate-manifest.ts`

**Interfaces:**
- Consumes: Babylon `Scene` and `Mesh` from the Host-owned Scene.
- Produces: `BabylonNativeSceneModuleV1`, `BabylonNativeSceneContributionV1`, `buildBabylonNativeSceneContributionV1()`.

- [ ] **Step 1: Write failing admission tests**

Add tests proving a valid module returns one spawn and one collider, while duplicate IDs, a foreign-scene Mesh, a disposed Mesh, non-finite spawn values, and exceeded collider budget throw stable `WORLDKIT_NATIVE_SCENE_*` errors.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm vitest run packages/runtime-babylon/src/native-scene-module.test.ts`

Expected: FAIL because `native-scene-module.ts` and its exports do not exist.

- [ ] **Step 3: Implement the minimal collector**

Implement closed registration inputs, copy/freeze numeric data, validate exact Scene ownership, finite geometry and transforms both at registration and after `build()` closes, require exactly one Spawn Marker, enforce unique non-empty IDs and `{ maximumStaticColliderCount, maximumStaticColliderVertexCount, maximumStaticColliderTriangleCount }`, reject Thin Instances and provider-owned Physics Bodies, and return immutable arrays without exposing mutable collector state.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `pnpm vitest run packages/runtime-babylon/src/native-scene-module.test.ts`

Expected: PASS with no warnings.

- [ ] **Step 5: Register the test lane and public adapter export**

Add the test as a `contract` entry in `TEST_GATE_MANIFEST_V1` and export only the provider-specific API from `packages/runtime-babylon/src/index.ts`.

### Task 2: Runtime native-geometry branch and SDK-owned physics

**Files:**
- Modify: `packages/runtime-babylon/src/babylon-world-runtime.ts`
- Modify: `packages/runtime-babylon/src/runtime.test.ts`

**Interfaces:**
- Consumes: `BabylonNativeSceneRuntimeOptionsV1` containing one module and admission budget.
- Produces: an explicit `nativeScene` option on `BabylonWorldRuntimeOptions`; default omission preserves ExecutionPlan geometry.

- [ ] **Step 1: Write the failing Native Runtime integration test**

Create a flat test plan only as a frozen gameplay bootstrap. Supply `nativeScene` whose module creates a broad platform and a raised destination, registers both collision meshes, and returns a spawn above the first platform. Assert that the module runs, Plan terrain/object/water Meshes are absent, registered Mesh metadata has stable entity IDs, and the player settles on the Native platform.

- [ ] **Step 2: Run the focused Runtime test and verify RED**

Run: `pnpm vitest run packages/runtime-babylon/src/runtime.test.ts -t "runs native scene geometry without constructing ExecutionPlan world geometry"`

Expected: FAIL because `BabylonWorldRuntimeOptions.nativeScene` is not consumed and Plan terrain still exists.

- [ ] **Step 3: Implement Native initialization**

In the explicit branch, keep Host Engine/Scene/Havok creation, invoke the module before Subjects, skip `configureAtmosphere`, Plan Terrain/Water/Object/StaticCollider and layout assertion construction, create one Host-private collision Mesh from every admitted world-coordinate geometry snapshot, create its `PhysicsShapeMesh` plus zero-mass `PhysicsAggregate`, set collision Mesh metadata, and add Mesh/Shape/Aggregate cleanup to the existing reverse disposer stack. Require the admitted Spawn Marker ID to match the Bootstrap binding.

- [ ] **Step 4: Bind Spawn without a second state owner**

Create an immutable effective runtime bootstrap before Subject construction by replacing only the initially controlled Subject's spawn position/facing from the admitted marker. Keep the original input plan untouched and mark the runtime projection as experimental Native evidence; do not publish Route surfaces.

- [ ] **Step 5: Verify GREEN and default regression**

Run the focused Native test, then:

`pnpm vitest run packages/runtime-babylon/src/runtime.test.ts -t "runs native scene geometry|creates terrain|moves"`

Expected: Native test passes and representative Canonical terrain/movement tests remain green.

### Task 3: Cloud-ridge Babylon Native app

**Files:**
- Create: `apps/native-scene-playground/package.json`
- Create: `apps/native-scene-playground/index.html`
- Create: `apps/native-scene-playground/vite.config.ts`
- Create: `apps/native-scene-playground/src/style.css`
- Create: `apps/native-scene-playground/src/cloud-ridge-scene.ts`
- Create: `apps/native-scene-playground/src/cloud-ridge-scene.test.ts`
- Create: `apps/native-scene-playground/src/native-bootstrap.ts`
- Create: `apps/native-scene-playground/src/main.ts`
- Modify: `scripts/lib/test-gate-manifest.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `BabylonNativeSceneModuleV1`, existing frozen G Bot execution resource data, `BabylonWorldRuntime` Native option, and the existing Playground public Subject assets.
- Produces: `createCloudRidgeNativeSceneControllerV1()`, a browser entry at the app's Vite URL, and `window.__WORLDKIT_NATIVE_SPIKE__` with `snapshot()`, `runFixedInput()` and `setColliderDebugVisible()`.

- [ ] **Step 1: Write the failing scene contract test**

Build the module against a Babylon `NullEngine` Scene and assert literal outcomes: marker `player-spawn`; collider IDs `foreground-platform`, `primary-path`, `gate-platform`; Meshes named `gate-main-beam`, `mountain-left-primary`, and `mountain-right-primary`; no collision registration for cloud or distant mountain Meshes.

- [ ] **Step 2: Run the scene test and verify RED**

Run: `pnpm vitest run apps/native-scene-playground/src/cloud-ridge-scene.test.ts`

Expected: FAIL because the app and scene module do not exist.

- [ ] **Step 3: Implement the Babylon scene**

Create deterministic helpers for layered rock spires, irregular stone slabs, the T-shaped gate, trees, clouds and waterfalls. Create separate invisible low-triangle collision proxies for foreground, ascent and gate platform; register only those three. Configure scene lights, fog, background and image processing inside the Native module.

- [ ] **Step 4: Verify the scene test GREEN**

Run: `pnpm vitest run apps/native-scene-playground/src/cloud-ridge-scene.test.ts`

Expected: PASS.

- [ ] **Step 5: Implement Bootstrap and browser controls**

Load a frozen execution resource snapshot without importing or calling Authoring/Compiler/Terrain packages, retain one G Bot Subject and its locked resources, start `BabylonWorldRuntime` with the Native option, bind initial possession using the app-level Runtime port, map WASD/Shift/Space and mouse camera input to fixed SDK commands, expose the automation probe, and render a compact Native/SDK ownership HUD.

- [ ] **Step 6: Add stable package commands**

Add root `dev:native-scene` and `build:native-scene` scripts. Configure the app's Vite `publicDir` to reuse `apps/playground/public` without duplicating GLB assets.

### Task 4: Verification and runnable handoff

**Files:**
- Modify only files required by defects reproduced during verification; every defect receives a failing regression first.

**Interfaces:**
- Consumes: completed Native app and Runtime integration.
- Produces: fresh contract/build/browser/manual evidence and a live local URL.

- [ ] **Step 1: Run focused tests**

Run:

```text
pnpm vitest run packages/runtime-babylon/src/native-scene-module.test.ts
pnpm vitest run packages/runtime-babylon/src/runtime.test.ts -t "runs native scene geometry"
pnpm vitest run apps/native-scene-playground/src/cloud-ridge-scene.test.ts
```

Expected: all selected tests pass.

- [ ] **Step 2: Run affected full gates**

Run:

```text
pnpm typecheck
pnpm test
pnpm build
pnpm build:native-scene
```

Expected: all commands exit 0; root `pnpm test` includes both newly registered tests.

- [ ] **Step 3: Start the Native app**

Run `pnpm dev:native-scene -- --host 127.0.0.1` in a persistent session and use the printed URL. Do not append `?authoring=1`.

- [ ] **Step 4: Browser visual and fixed-input probe**

Open the real page, wait for `window.__WORLDKIT_NATIVE_SPIKE__`, capture the viewport, run forward input until the destination marker, and record starting/ending positions plus grounded state. Verify the T gate and both primary mountain silhouettes are visible.

- [ ] **Step 5: Manual interaction handoff**

Leave the server running and provide the exact URL. State separately what automated evidence passed and what remains for the user's visual/manual judgment.

- [ ] **Step 6: Commit the experimental vertical slice**

Inspect `dv status` and `dv diff`, ensure only this experiment and its docs changed, then commit with `dv commit -m "feat: add Babylon native scene reconstruction spike"` and verify the resulting commit plus clean workspace.
