# Subject Foundation Visible Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Canonical JSON runtime from one hard-coded humanoid into a deterministic multi-subject foundation that resolves registered Subject Kits, derives each subject's whitebox visual, collider, and locomotion configuration, exposes plural runtime state, and lets the trusted default Controller switch between subjects.

**Architecture:** Keep `AuthoringSpecV1` source-compatible by adding an optional role-qualified `spawnAnchorEntityId` to subject nodes. Resolve built-in Kit definitions through an injectable engine-neutral Registry interface, materialize the resolved definitions into NormalizedWorldIR, compile all subjects into a versioned plural `ExecutionPlanV2`, and let Babylon own one visual root and one Havok character controller per subject. Replace the active Browser/Snapshot protocol with V2 rather than publishing singular and plural aliases; retain V1 types only as historical contracts and document the explicit migration.

**Tech Stack:** TypeScript 5.9, JSON Schema 2020-12, Ajv 8, Vitest, Babylon.js 9, Havok Physics V2, Vite, Playwright, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-19-extensible-subject-authoring-design.md` S0, with `docs/16-subject-assets-3c-integration.md` Phase 0 and `docs/superpowers/specs/2026-08-17-ai-first-lego-game-sdk-design.md` stages B-D as parent contracts.

## Progress Tracker

> This table is the human-readable progress summary. The checkboxes under each task are the execution truth and must be updated in the same commit as the corresponding implementation. Do not mark a task complete until its listed tests pass.

| Task | Deliverable | Status |
|---:|---|---|
| 0 | Extensible Subject Authoring dedicated design | Complete |
| 1 | Engine-neutral Subject Kit Registry | Not started |
| 2 | Multi-subject Authoring validation and normalization | Not started |
| 3 | Versioned plural Execution and Runtime contracts | Not started |
| 4 | Registered Subject compiler | Not started |
| 5 | Babylon multi-subject runtime and control binding | Not started |
| 6 | Browser Protocol V2 and Playground switching | Not started |
| 7 | Multi-subject fixture, CLI, Playwright, documentation | Not started |
| 8 | Completion audit and Relationship-slice handoff | Not started |

**Current milestone:** Dedicated design and implementation plan are complete; Task 1 waits for design review approval.

**Latest verified baseline before implementation:** `pnpm typecheck`, 125 tests, production build, and `pnpm verify:v1` all pass on commit `8ccd219`.

## Global Constraints

- Public names follow root `AGENTS.md`: current objects use `id`, entity references end in `EntityId`, Registry resources end in `Ref`, serialized shapes use `kind`, relationships/commands use `type`, and numeric units remain explicit.
- Do not rename `kitRef` in this slice. The future public naming review may introduce a new Authoring Schema version; compatibility must use an explicit migration rather than `kitRef`/`presetRef` aliases.
- `AuthoringSpecV1` remains valid for every existing example. A single existing subject with no `spawnAnchorEntityId` inherits `startup.spawnAnchorId`; every additional subject must declare its own valid Anchor reference.
- Built-in Kit definitions are immutable protocol data. Authoring JSON selects a `kitRef` but cannot embed Babylon meshes, Havok shapes, controller classes, or arbitrary scripts.
- The first two registered Kits are `worldkit://kit/humanoid.third-person@1` and `worldkit://kit/quadruped.ground-proxy@1`. The quadruped is a deliberate whitebox proxy, not a production animal asset or animation claim.
- Built-in Kit references are Registry data, not a TypeScript literal Union and not Compiler branches. The Registry accepts injected Definition sources so S1 Package Definitions can reuse the same resolution contract.
- Normalizer resolves referenced Subject Definitions into `NormalizedWorldIRV1.resources.subjectDefinitions`; Compiler consumes only that resolved deterministic data and never queries the host Registry.
- Automatic collider and locomotion values come from the resolved Kit, not from scene JSON.
- `ExecutionPlanV2.subjects` and `WorldRuntimeSnapshotV2.subjectStatesByEntityId` are deterministic and ID-addressed. Do not retain active `subject` aliases.
- Browser Protocol V2 exposes one trusted default Controller. Switching control must go through `bindControl`; fixed input must act through the committed binding and cannot accept a direct target Entity ID.
- Camera targeting follows the committed controlled Entity. Camera ownership, multi-camera Sessions, user-created Controllers, Relationships, mounting, towing, equipment, animation assets, and arbitrary custom Kit definitions are out of this slice.
- Logical Subject state, Babylon Transform hierarchy, and Havok controller resources remain separate. A visual parent-child link is never a gameplay Relationship.
- All simulation changes use fixed 60 Hz ticks. Rendering must not advance gameplay.
- The existing Three.js/Rapier scene path remains unchanged and runnable.

---

### Task 1: Engine-neutral Subject Kit Registry

**Files:**
- Create: `packages/subject-registry/package.json`
- Create: `packages/subject-registry/src/types.ts`
- Create: `packages/subject-registry/src/built-in-subject-kits.ts`
- Create: `packages/subject-registry/src/index.ts`
- Create: `packages/subject-registry/src/subject-registry.test.ts`

**Interfaces:**
- Produces: `SubjectDefinitionRef`, `SubjectKitDefinitionV1`, `SubjectVisualPartV1`, `SubjectDefinitionRegistryV1`, `createSubjectDefinitionRegistry(definitions)`, and `builtInSubjectDefinitionRegistry`.
- Consumers: authoring resolution only. Compiler must not query this Registry.
- Dependencies: protocol data only; this package must not import Babylon, Havok, Three, Rapier, DOM, or filesystem modules.

- [ ] **Step 1: Write failing registry tests**

```ts
import { describe, expect, it } from "vitest";
import { builtInSubjectDefinitionRegistry } from "./index";

describe("built-in subject registry", () => {
  it("returns definitions in stable ID and version order", () => {
    expect(builtInSubjectDefinitionRegistry.list().map((kit) => `${kit.id}@${kit.version}`)).toEqual([
      "humanoid.third-person@1",
      "quadruped.ground-proxy@1",
    ]);
  });

  it("resolves immutable automatic collider and movement profiles", () => {
    expect(builtInSubjectDefinitionRegistry.resolve("worldkit://kit/quadruped.ground-proxy@1")).toMatchObject({
      bodyTopology: "quadruped",
      collider: { kind: "capsule" },
      locomotion: { mode: "ground" },
    });
  });

  it("returns undefined for an unregistered resource reference", () => {
    expect(builtInSubjectDefinitionRegistry.resolve("worldkit://kit/unknown@1")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails because the package does not exist**

Run: `pnpm vitest run packages/subject-registry/src/subject-registry.test.ts`

Expected: FAIL because `packages/subject-registry` and its exports do not exist.

- [ ] **Step 3: Define the closed registry types**

```ts
export type SubjectDefinitionRef = string;

export type SubjectVisualPrimitiveV1 =
  | { kind: "capsule"; radiusMeters: number; heightMeters: number }
  | { kind: "box"; sizeMetersXYZ: readonly [number, number, number] }
  | { kind: "sphere"; radiusMeters: number }
  | { kind: "cylinder"; radiusMeters: number; heightMeters: number };

export interface SubjectVisualPartV1 {
  id: string;
  primitive: SubjectVisualPrimitiveV1;
  localPositionMeters: readonly [number, number, number];
  localRotationEulerRadiansXYZ: readonly [number, number, number];
}

export interface SubjectKitDefinitionV1 {
  id: "humanoid.third-person" | "quadruped.ground-proxy";
  version: 1;
  kitRef: SubjectDefinitionRef;
  category: "human" | "animal";
  bodyTopology: "biped" | "quadruped";
  semanticClassId: string;
  visualParts: readonly SubjectVisualPartV1[];
  collider: {
    kind: "capsule";
    radiusMeters: number;
    heightMeters: number;
    massKilograms: number;
    maxSlopeDegrees: number;
    maxStepHeightMeters: number;
  };
  locomotion: {
    mode: "ground";
    groundSpeedMetersPerSecond: number;
    waterSpeedMetersPerSecond: number;
    jumpSpeedMetersPerSecond: number;
  };
  resourceCost: { vertices: number; triangles: number; colliders: 1 };
}

export interface SubjectDefinitionRegistryV1 {
  resolve(subjectDefinitionRef: SubjectDefinitionRef): SubjectKitDefinitionV1 | undefined;
  list(): readonly SubjectKitDefinitionV1[];
}

export function createSubjectDefinitionRegistry(
  definitions: readonly SubjectKitDefinitionV1[],
): SubjectDefinitionRegistryV1;
```

- [ ] **Step 4: Implement two frozen built-in definitions and stable lookup**

Use a capsule for the humanoid visual. Build the quadruped proxy from a torso box, head box, four leg cylinders, and a tail cylinder. `createSubjectDefinitionRegistry` deep-freezes supplied definitions, indexes by `kitRef`, and returns definitions in `id`, then `version` order. Reject duplicate `kitRef` values with `SUBJECT_REGISTRY_DUPLICATE_REF`. Construct `builtInSubjectDefinitionRegistry` by passing the two first-party definitions through the same public constructor; do not special-case their IDs inside registry methods.

- [ ] **Step 5: Run registry tests and typecheck**

Run: `pnpm vitest run packages/subject-registry/src/subject-registry.test.ts`

Expected: PASS, 3 tests.

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 6: Commit the registry**

```bash
git add packages/subject-registry
git commit -m "feat: add built-in subject kit registry"
```

---

### Task 2: Multi-subject Authoring Validation and Normalization

**Files:**
- Modify: `packages/authoring/package.json`
- Modify: `packages/authoring/src/types.ts`
- Modify: `packages/authoring/src/authoring-spec-v1.schema.json`
- Modify: `packages/authoring/src/normalize.ts`
- Modify: `packages/authoring/src/test-fixture.ts`
- Modify: `packages/authoring/src/authoring.test.ts`
- Modify: `packages/authoring/src/normalize.test.ts`

**Interfaces:**
- Consumes: `SubjectDefinitionRegistryV1` and `builtInSubjectDefinitionRegistry` from Task 1.
- Produces: source-compatible `SubjectNodeSpecV1.spawnAnchorEntityId?: string`, `NormalizeAuthoringOptionsV1.subjectDefinitionRegistry?`, normalized subject nodes where `spawnAnchorEntityId` is always present, and `NormalizedWorldIRV1.resources.subjectDefinitions` containing each resolved definition once.
- Invariant: `NormalizedWorldIRV1` contains one or more subjects, each with a resolved Anchor Entity ID and a `kitRef` present in the normalized resource table.

- [ ] **Step 1: Add failing authoring tests**

```ts
it("normalizes multiple registered subjects with explicit spawn anchors", () => {
  const spec = createValidAuthoringSpec();
  spec.nodes.push(
    { id: "spawn-animal", kind: "anchor", transform: { positionMeters: [6, 0, 28] }, semantic: { classId: "spawn.subject" } },
    { id: "animal", kind: "subject", kitRef: "worldkit://kit/quadruped.ground-proxy@1", spawnAnchorEntityId: "spawn-animal" },
  );
  const result = normalizeAuthoringSpec(spec);
  expect(result.ok).toBe(true);
  expect(result.value?.nodes.filter((node) => node.kind === "subject")).toEqual([
    expect.objectContaining({ id: "animal", spawnAnchorEntityId: "spawn-animal" }),
    expect.objectContaining({ id: "player", spawnAnchorEntityId: "spawn-main" }),
  ]);
});

it("rejects an additional subject without a spawn anchor", () => {
  const spec = createValidAuthoringSpec();
  spec.nodes.push({ id: "animal", kind: "subject", kitRef: "worldkit://kit/quadruped.ground-proxy@1" });
  expect(normalizeAuthoringSpec(spec).diagnostics).toContainEqual(
    expect.objectContaining({ code: "AUTHORING_SUBJECT_SPAWN_REQUIRED", instancePath: expect.stringContaining("/spawnAnchorEntityId") }),
  );
});
```

- [ ] **Step 2: Run focused tests and confirm the new cases fail**

Run: `pnpm vitest run packages/authoring/src/authoring.test.ts packages/authoring/src/normalize.test.ts`

Expected: FAIL because `spawnAnchorEntityId` is not in the closed Schema and the quadruped Kit is not accepted.

- [ ] **Step 3: Extend the closed Schema without changing existing input**

Add optional `spawnAnchorEntityId` to `$defs.subjectNode`. Do not add `presetRef`, inline collider fields, movement fields, visual parts, or provider-specific handles.

- [ ] **Step 4: Resolve Kit and Anchor semantics**

For each subject:

1. Resolve `kitRef` through `options.subjectDefinitionRegistry ?? builtInSubjectDefinitionRegistry`. Emit `AUTHORING_RESOURCE_NOT_SUPPORTED` with `details.supportedKitRefs` when absent.
2. If `spawnAnchorEntityId` exists, require an `anchor` node with that ID.
3. If it is absent and the subject is `startup.controlledEntityId`, normalize it to `startup.spawnAnchorId`.
4. If it is absent on any other subject, emit `AUTHORING_SUBJECT_SPAWN_REQUIRED` at `/nodes/<index>/spawnAnchorEntityId`.
5. Copy every referenced Definition into `normalized.resources.subjectDefinitions`, deduplicate by `kitRef`, and sort by `kitRef` before hashing.
6. Preserve deterministic node sorting by `id`.

- [ ] **Step 5: Run authoring, normalization, and full type checks**

Run: `pnpm vitest run packages/authoring/src/authoring.test.ts packages/authoring/src/normalize.test.ts`

Expected: PASS.

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 6: Commit the Authoring extension**

```bash
git add packages/authoring
git commit -m "feat: validate multi-subject authoring"
```

---

### Task 3: Versioned Plural Execution and Runtime Contracts

**Files:**
- Modify: `packages/runtime-contracts/src/execution-plan.ts`
- Modify: `packages/runtime-contracts/src/runtime-session.ts`
- Modify: `packages/runtime-contracts/src/index.ts`
- Create: `packages/runtime-contracts/src/runtime-contracts.test.ts`

**Interfaces:**
- Produces: `ExecutionSubjectV2`, `ExecutionPlanV2`, `SubjectStateSnapshotV2`, `WorldRuntimeSnapshotV2`, `ControlBindingReceiptV2`, and `WorldRuntimeSessionV2`.
- Historical: retain exported V1 interfaces so old serialized artifacts remain identifiable, but the active compiler/runtime must produce only V2.
- Consumers: compiler, Babylon runtime, Playground adapter, Browser Protocol, CLI, tests.

- [ ] **Step 1: Write failing serialization-shape tests**

```ts
it("uses plural subject and ID-indexed runtime state in V2", () => {
  const snapshot: WorldRuntimeSnapshotV2 = createSnapshotFixtureV2();
  expect(snapshot.schemaVersion).toBe(2);
  expect(snapshot.controlledEntityId).toBe("player");
  expect(Object.keys(snapshot.subjectStatesByEntityId).sort()).toEqual(["animal", "player"]);
  expect("subject" in snapshot).toBe(false);
});
```

- [ ] **Step 2: Run the focused test and confirm V2 types/fixtures are missing**

Run: `pnpm vitest run packages/runtime-contracts/src/runtime-contracts.test.ts`

Expected: FAIL because V2 contracts are not defined.

- [ ] **Step 3: Define `ExecutionPlanV2`**

```ts
export interface ExecutionSubjectV2 {
  entityId: string;
  kitRef: string;
  bodyTopology: string;
  semanticClassId: string;
  spawnAnchorEntityId: string;
  spawnPositionMeters: Vec3;
  forwardDirection: "-z";
  visualParts: readonly SubjectVisualPartV2[];
  collider: {
    kind: "capsule";
    radiusMeters: number;
    heightMeters: number;
    massKilograms: number;
    maxSlopeDegrees: number;
    maxStepHeightMeters: number;
  };
  locomotion: {
    mode: "ground";
    groundSpeedMetersPerSecond: number;
    waterSpeedMetersPerSecond: number;
    jumpSpeedMetersPerSecond: number;
  };
}

export interface ExecutionPlanV2 {
  kind: "worldkit-execution-plan";
  schemaVersion: 2;
  controlledEntityId: string;
  subjects: readonly ExecutionSubjectV2[];
  // Existing V1 terrain, water, object, camera, environment, hash, and budget fields retain their canonical names.
}
```

- [ ] **Step 4: Define Browser/Runtime V2 state and control binding**

```ts
export interface SubjectStateSnapshotV2 {
  entityId: string;
  positionMeters: Vec3;
  velocityMetersPerSecond: Vec3;
  movementMedium: "ground" | "air" | "water";
}

export interface WorldRuntimeSnapshotV2 {
  kind: "worldkit-runtime-snapshot";
  schemaVersion: 2;
  runtimeBackend: "babylon-havok";
  tick: number;
  ready: boolean;
  controlledEntityId: string;
  controllersById: Record<string, { id: string; controlledEntityId: string }>;
  subjectStatesByEntityId: Record<string, SubjectStateSnapshotV2>;
  camera: { entityId: string; targetEntityId: string; positionMeters: Vec3 };
  physics: { backend: "havok"; ready: boolean; fixedTimeStepSeconds: number };
  resources: { meshes: number; bodies: number; terrainSamples: number };
}

export interface BindControlRequestV2 {
  controllerId: string;
  controlledEntityId: string;
  expectedControlledEntityId: string;
}

export interface ControlBindingReceiptV2 {
  kind: "worldkit-control-binding-receipt";
  schemaVersion: 2;
  status: "committed" | "rejected";
  controllerId: string;
  previousControlledEntityId: string;
  controlledEntityId: string;
  diagnostic?: { code: "CONTROL_BINDING_STALE" | "CONTROL_TARGET_NOT_FOUND"; message: string };
}
```

The trusted default Controller ID is `controller-primary`. `bindControl` must be atomic and idempotent when the requested binding is already committed.

- [ ] **Step 5: Run contract tests and typecheck**

Run: `pnpm vitest run packages/runtime-contracts/src/runtime-contracts.test.ts`

Expected: PASS.

Run: `pnpm typecheck`

Expected: FAIL only in downstream consumers that still require V1; use this failure list as the migration checklist for Tasks 4-7.

- [ ] **Step 6: Commit the V2 contracts**

```bash
git add packages/runtime-contracts
git commit -m "feat: define plural subject runtime contracts"
```

---

### Task 4: Compile Registered Subjects into `ExecutionPlanV2`

**Files:**
- Modify: `packages/compiler/package.json`
- Modify: `packages/compiler/src/compile.ts`
- Modify: `packages/compiler/src/compile.test.ts`

**Interfaces:**
- Consumes: normalized subjects and `NormalizedWorldIRV1.resources.subjectDefinitions` from Task 2, and `ExecutionPlanV2` from Task 3.
- Produces: stable `subjects` ordered by `entityId`, exact resource usage, and `controlledEntityId` copied from startup semantics.
- Failure boundary: authoring owns Registry and Anchor diagnostics; compiler performs no Registry lookup and treats absent normalized Definition references as invariant violations.

- [ ] **Step 1: Write failing compiler tests**

```ts
it("compiles every subject from its registered Kit in stable entity order", () => {
  const result = compileMultiSubjectFixture();
  expect(result.executionPlan?.schemaVersion).toBe(2);
  expect(result.executionPlan?.controlledEntityId).toBe("player");
  expect(result.executionPlan?.subjects.map((subject) => subject.entityId)).toEqual(["animal", "player"]);
  expect(result.executionPlan?.subjects[0]).toMatchObject({
    kitRef: "worldkit://kit/quadruped.ground-proxy@1",
    bodyTopology: "quadruped",
    collider: { kind: "capsule" },
  });
});

it("changes neither plan bytes nor hash when subject nodes are reordered", () => {
  expect(compileFixtureWithSubjectOrder(["player", "animal"]).executionPlanHash)
    .toBe(compileFixtureWithSubjectOrder(["animal", "player"]).executionPlanHash);
});
```

- [ ] **Step 2: Run compiler tests and confirm they fail on the singular plan**

Run: `pnpm vitest run packages/compiler/src/compile.test.ts`

Expected: FAIL because `ExecutionPlanV1.subject` is still singular and Kit data is hard-coded.

- [ ] **Step 3: Implement `compileSubjects`**

For each normalized subject:

1. Resolve its Definition from `NormalizedWorldIRV1.resources.subjectDefinitions`.
2. Resolve its own `spawnAnchorEntityId`.
3. Sample terrain at the Anchor XZ position.
4. Add half the resolved collider height to the authoritative ground height and the Anchor Y offset.
5. Clone Kit visual, collider, locomotion, topology, and semantic data into engine-neutral execution data.
6. Sort by `entityId` before hashing.

- [ ] **Step 4: Account for every subject resource**

Replace the fixed `34 vertices / 64 triangles / 1 subject collider` constants with the sum of every resolved Kit's `resourceCost`. Keep terrain and static object body costs unchanged.

- [ ] **Step 5: Run compiler tests, authoring tests, and typecheck**

Run: `pnpm vitest run packages/compiler/src/compile.test.ts packages/authoring/src/normalize.test.ts`

Expected: PASS.

Run: `pnpm typecheck`

Expected: remaining failures only in runtime/playground/CLI V1 consumers.

- [ ] **Step 6: Commit compiler migration**

```bash
git add packages/compiler
git commit -m "feat: compile registered subject kits"
```

---

### Task 5: Babylon Multi-subject Visuals, Controllers, and Control Binding

**Files:**
- Create: `packages/runtime-babylon/src/subject-visual.ts`
- Modify: `packages/runtime-babylon/src/subject-controller.ts`
- Modify: `packages/runtime-babylon/src/babylon-world-runtime.ts`
- Modify: `packages/runtime-babylon/src/index.ts`
- Modify: `packages/runtime-babylon/src/runtime.test.ts`

**Interfaces:**
- Consumes: `ExecutionPlanV2`, `ExecutionSubjectV2`, `BindControlRequestV2`.
- Produces: one `SubjectController` per subject, one visual root per subject, plural snapshots, and atomic `bindControl` receipts.
- Runtime invariant: `controller-primary` controls exactly one registered subject; only that subject receives fixed input; all subjects remain queryable and resettable.

- [ ] **Step 1: Write failing runtime tests**

```ts
it("creates and snapshots every compiled subject", async () => {
  const runtime = await createMultiSubjectRuntime();
  expect(Object.keys(runtime.snapshot().subjectStatesByEntityId).sort()).toEqual(["animal", "player"]);
  expect(runtime.snapshot().controlledEntityId).toBe("player");
  expect(runtime.snapshot().resources.meshes).toBeGreaterThan(8);
  await runtime.dispose();
});

it("switches the default Controller atomically and moves only the committed subject", async () => {
  const runtime = await createMultiSubjectRuntime();
  const before = runtime.snapshot();
  expect(runtime.bindControl({
    controllerId: "controller-primary",
    expectedControlledEntityId: "player",
    controlledEntityId: "animal",
  })).toMatchObject({ status: "committed", controlledEntityId: "animal" });
  const after = await runtime.runFixedInput({ actions: ["move-right"], ticks: 60 });
  expect(after.subjectStatesByEntityId.animal!.positionMeters[0]).toBeGreaterThan(before.subjectStatesByEntityId.animal!.positionMeters[0]);
  expect(after.subjectStatesByEntityId.player!.positionMeters).toEqual(before.subjectStatesByEntityId.player!.positionMeters);
  expect(after.camera.targetEntityId).toBe("animal");
  await runtime.dispose();
});

it("rejects a stale binding without changing control", async () => {
  const runtime = await createMultiSubjectRuntime();
  expect(runtime.bindControl({ controllerId: "controller-primary", expectedControlledEntityId: "animal", controlledEntityId: "player" }))
    .toMatchObject({ status: "rejected", diagnostic: { code: "CONTROL_BINDING_STALE" } });
  expect(runtime.snapshot().controlledEntityId).toBe("player");
  await runtime.dispose();
});
```

- [ ] **Step 2: Run runtime tests and confirm they fail on singular state**

Run: `pnpm vitest run packages/runtime-babylon/src/runtime.test.ts`

Expected: FAIL because the runtime constructs only `executionPlan.subject`.

- [ ] **Step 3: Build visuals from execution primitives**

`createSubjectVisual(subject, material, scene)` must:

- Create one named root `TransformNode` with metadata `{ worldkitEntityId, semanticClassId }`.
- Create child meshes for every `visualParts` entry using only the declared primitive and local transform.
- Return `{ root, meshes }` so ownership and disposal are explicit.
- Never derive collider or movement behavior from mesh bounds.

- [ ] **Step 4: Refactor `SubjectController` to one subject**

Change the constructor to:

```ts
constructor(
  private readonly subject: ExecutionSubjectV2,
  gravityMetersPerSecondSquaredXYZ: Vec3,
  private readonly visualRoot: TransformNode,
  scene: Scene,
)
```

Read capsule dimensions, mass, max slope, max step, and locomotion speeds from `subject`. Remove access to singular `plan.subject`.

- [ ] **Step 5: Manage controllers in an ID-indexed map**

Create all subjects in `ExecutionPlanV2.subjects`, then store `Map<EntityId, SubjectController>`. Track `controlledEntityId` separately. Each fixed tick:

- Step the controlled controller with semantic actions.
- Step every uncontrolled controller with an empty action set so gravity/support remains deterministic.
- Detect movement medium independently from each subject's position and collider foot height.
- Update the camera against the committed `controlledEntityId`.

- [ ] **Step 6: Implement `bindControl` and plural lifecycle operations**

Validate `controllerId === "controller-primary"`, stale expected binding, and target existence before mutation. On success, zero the previous controller velocity, commit the new ID, update camera targeting, and return a receipt. `reset` resets every subject and restores the initial controlled Entity. `dispose` disposes every controller and visual exactly once.

- [ ] **Step 7: Run runtime tests and leak-safe disposal tests**

Run: `pnpm vitest run packages/runtime-babylon/src/runtime.test.ts`

Expected: PASS, including double disposal.

Run: `pnpm typecheck`

Expected: remaining failures only in Playground/CLI V1 consumers.

- [ ] **Step 8: Commit runtime support**

```bash
git add packages/runtime-babylon
git commit -m "feat: run multiple registered subjects"
```

---

### Task 6: Browser Protocol V2 and Playground Control Switching

**Files:**
- Modify: `apps/playground/src/authoring-loader.ts`
- Modify: `apps/playground/src/authoring-loader.test.ts`
- Modify: `apps/playground/src/playground-world.ts`
- Modify: `apps/playground/src/babylon-world-adapter.ts`
- Modify: `apps/playground/src/main.ts`

**Interfaces:**
- Consumes: `ExecutionPlanV2`, `WorldRuntimeSnapshotV2`, `BindControlRequestV2`, and `ControlBindingReceiptV2`.
- Produces: active `WorldkitBrowserApiV2` with `version: 2`, plural Snapshot methods, and `bindControl(request)`.
- Migration: do not expose V1 and V2 fields together on the same object.

- [ ] **Step 1: Add failing adapter and Browser API tests**

```ts
expect(loaded.executionPlan).toMatchObject({
  schemaVersion: 2,
  subjects: [expect.objectContaining({ entityId: "player" })],
});
```

Add a browser-contract type test that constructs `WorldkitBrowserApiV2` and requires:

```ts
interface WorldkitBrowserApiV2 {
  version: 2;
  ready(): Promise<WorldRuntimeSnapshotV2>;
  getSnapshot(): WorldRuntimeSnapshotV2;
  getDiagnostics(): readonly Readonly<Record<string, unknown>>[];
  bindControl(request: BindControlRequestV2): ControlBindingReceiptV2;
  runFixedInput(steps: readonly FixedInputV1[]): Promise<WorldRuntimeSnapshotV2>;
  captureScreenshot(): string;
  reset(): WorldRuntimeSnapshotV2;
  setPaused(paused: boolean): WorldRuntimeSnapshotV2;
}
```

- [ ] **Step 2: Run focused Playground tests and confirm V1 type failures**

Run: `pnpm vitest run apps/playground/src/authoring-loader.test.ts`

Expected: FAIL until loader and adapter consume V2.

- [ ] **Step 3: Migrate loader, inspections, automation, and HUD**

- Return `ExecutionPlanV2` from `loadAuthoringScene`.
- Produce one Feature inspection per execution subject.
- Derive legacy Playground HUD `player` from `snapshot.subjectStatesByEntityId[snapshot.controlledEntityId]` only inside the adapter; do not re-export it as Canonical state.
- Make the HUD and camera follow control switches.

- [ ] **Step 4: Publish `window.__WORLDKIT__` V2**

Set `version: 2`, forward `bindControl`, and update the error-mode fallback so every method returns or rejects with the same stable diagnostic behavior. Update the global Window declaration to V2 only.

- [ ] **Step 5: Run Playground tests, typecheck, and production build**

Run: `pnpm vitest run apps/playground/src/authoring-loader.test.ts apps/playground/src/canvas-recorder.test.ts`

Expected: PASS.

Run: `pnpm typecheck`

Expected: remaining failures only in CLI verifier V1 consumers.

Run: `pnpm build`

Expected: PASS; existing large-chunk warning remains non-blocking.

- [ ] **Step 6: Commit Browser Protocol V2**

```bash
git add apps/playground
git commit -m "feat: expose multi-subject browser protocol"
```

---

### Task 7: Multi-subject Fixture, CLI Migration, and End-to-end Gate

**Files:**
- Create: `examples/authoring/multi-subject-world.json`
- Modify: `scripts/worldkit.ts`
- Modify: `scripts/worldkit.test.ts`
- Modify: `scripts/verify-canonical-world.ts`
- Modify: `docs/17-canonical-json-quickstart.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: Browser Protocol V2 and the existing CLI command surface.
- Produces: build artifact `schemaVersion: 2`, plural snapshot capture, and an E2E fixture that proves visual presence, physics, control switching, deterministic reset, and stable screenshot output.
- Compatibility: CLI command names and exit codes remain unchanged.

- [ ] **Step 1: Add the representative Canonical JSON fixture**

Create a world containing:

- `player` using `worldkit://kit/humanoid.third-person@1` and existing `spawn-main` fallback.
- `animal` using `worldkit://kit/quadruped.ground-proxy@1` with `spawnAnchorEntityId: "spawn-animal"`.
- At least one wall between or near the subjects, one swimmable water boundary, one third-person camera initially targeting `player`, and sufficient collider/vertex/triangle budgets.

- [ ] **Step 2: Migrate CLI serialization to V2**

Update CLI TypeScript imports, capture return type, and build artifact `schemaVersion` to 2. The CLI must not add a `--subject` shortcut; control still flows through Browser `bindControl` and the Controller binding.

- [ ] **Step 3: Extend the release verifier before implementation is considered complete**

The Playwright gate must assert:

```ts
expect(snapshot.schemaVersion).toBe(2);
expect(Object.keys(snapshot.subjectStatesByEntityId).sort()).toEqual(["animal", "player"]);

const receipt = await page.evaluate(() => window.__WORLDKIT__!.bindControl({
  controllerId: "controller-primary",
  expectedControlledEntityId: "player",
  controlledEntityId: "animal",
}));
expect(receipt.status).toBe("committed");

const moved = await page.evaluate(() => window.__WORLDKIT__!.runFixedInput([
  { actions: ["move-right"], ticks: 120 },
]));
expect(moved.controlledEntityId).toBe("animal");
expect(moved.camera.targetEntityId).toBe("animal");
```

Also retain strict invalid-input rejection, deterministic build hash, screenshot dimensions, Havok readiness, blocking wall collision, water transition, and reset coverage.

- [ ] **Step 4: Document the explicit V1 to V2 migration**

Add a migration table:

| V1 | V2 |
|---|---|
| `executionPlan.subject` | `executionPlan.subjects[]` |
| `snapshot.subject` | `snapshot.subjectStatesByEntityId[entityId]` |
| implicit controlled subject | `snapshot.controlledEntityId` plus `controllersById` |
| Browser `version: 1` | Browser `version: 2` plus `bindControl` |

State that `kitRef` is intentionally unchanged in this slice and is subject to a future versioned naming review.

- [ ] **Step 5: Run all release gates**

Run: `pnpm typecheck`

Expected: PASS.

Run: `pnpm test`

Expected: all tests PASS.

Run: `pnpm build`

Expected: PASS.

Run: `pnpm verify:v1`

Expected: PASS with strict parsing, deterministic V2 artifact, two subject IDs, Browser Protocol V2, Havok readiness, collision, water, control switching, reset, and screenshot gates. Keep the script name for command compatibility; document that it verifies Canonical Authoring V1 compiled to Runtime Protocol V2.

- [ ] **Step 6: Inspect the generated screenshot**

Open `artifacts/examples/basic-world/world.png` or the multi-subject output with the local image viewer. Confirm the humanoid and quadruped proxy are both visible, placed on terrain, not overlapping blockers, and framed by the controlled subject's camera. If composition fails, change only fixture placement or camera authoring values; do not add scene-specific runtime logic.

- [ ] **Step 7: Commit the vertical slice**

```bash
git add examples/authoring/multi-subject-world.json scripts docs/17-canonical-json-quickstart.md README.md
git commit -m "feat: ship multi-subject visible slice"
```

---

### Task 8: Completion Audit and Handoff to Relationship Slice

**Files:**
- Modify if evidence changed: `docs/superpowers/plans/2026-08-19-subject-foundation-visible-slice.md`
- Create: `artifacts/examples/multi-subject-world/.gitignore`
- Create: `artifacts/examples/multi-subject-world/.gitkeep`

**Interfaces:**
- Produces: an auditable completion statement and a clean boundary for the next `attachedTo` / `mountedOn` Relationship plan.
- Does not implement: Socket alignment, `mountedOn`, `towedBy`, control-transfer profiles, safe exit, joints, weapons, or animation variants.

- [ ] **Step 1: Audit every global constraint against code and tests**

Confirm:

- no engine types entered Authoring, Registry, Normalized IR, or Compiler contracts;
- every subject owns a stable Entity ID, Kit reference, Anchor reference, collider, visual definition, locomotion definition, runtime controller, and Snapshot entry;
- fixed input acts only through the committed default Controller binding;
- singular active protocol fields were removed rather than aliased;
- existing single-subject JSON remains valid;
- Three/Rapier catalog scenes still pass their tests.

- [ ] **Step 2: Run fresh verification from a clean process**

Run: `pnpm typecheck && pnpm test && pnpm build && pnpm verify:v1`

Expected: all commands exit 0. Record only actual counts and hashes from this run in the final handoff.

- [ ] **Step 3: Verify Git hygiene**

Run: `git status --short --branch`

Expected: only the intended Subject slice files are changed before final commit; generated PNG, Snapshot, build artifacts, server logs, and temporary files remain ignored.

- [ ] **Step 4: Prepare the next visible Relationship plan**

The next plan starts from the completed plural Subject/Controller base and implements one typed `attachedTo`/standing binding fixture for `person` and `skateboard`, including Socket alignment, transactional attach/detach, collider policy, camera context, and an E2E receipt. It must not encode a generic `sourceEntityId/targetEntityId/params` public relationship.
