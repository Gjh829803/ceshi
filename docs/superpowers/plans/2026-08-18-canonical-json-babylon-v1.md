# Canonical JSON Babylon Vertical Slice Implementation Plan

> **状态：Superseded / Historical。** 本计划对应从未发布的 Authoring V1，已被
> Canonical Authoring V2、NormalizedWorldIR V2、ExecutionPlan V3 以及
> [`2026-08-19-package-subject-definition-visible-slice.md`](./2026-08-19-package-subject-definition-visible-slice.md)
> 取代。下方未勾选项只保留历史上下文，不属于当前 Backlog，也不得用于计算重构
> 进度；当前任务统一查看 [`../../18-refactor-progress-and-backlog.md`](../../18-refactor-progress-and-backlog.md)。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first production-shaped vertical slice in which a strict `AuthoringSpecV1` JSON file validates, normalizes, compiles, and runs as an interactive whitebox 3D world in a new Babylon.js + Havok runtime, with CLI validation/build/run/capture commands.

**Architecture:** Add engine-neutral authoring, normalized IR, execution-plan, and runtime-contract packages. The compiler resolves the closed V1 resource set into an `ExecutionPlanV1`; the Babylon runtime is the only layer that imports Babylon/Havok. The existing Three/Rapier runtime remains unchanged as a regression fixture and is not used to execute Canonical JSON.

**Tech Stack:** TypeScript 5.9, JSON Schema 2020-12, Ajv 8, `jsonc-parser`, RFC 8785-style canonical JSON, Babylon.js, Havok Physics V2, Vite, Playwright, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-17-ai-first-lego-game-sdk-design.md`

## Global Constraints

- Public names follow `AGENTS.md`: IDs, resource references, versions, discriminators, units, and coordinate domains remain explicit.
- Public JSON and normalized contracts contain no Babylon, Havok, Three, Rapier, DOM, mesh, WASM, or provider handle.
- Coordinate convention is right-handed, `+Y` up, `-Z` subject forward, meters for length, radians for rotation unless a field says `Degrees`.
- V1 is a closed capability set: procedural terrain, water body, primitive static object, one humanoid subject, one third-person camera, anchors, atmosphere, movement, collision, medium detection, snapshot, and capture.
- Unsupported relationship, rule, Kit, node, source, or camera mode returns a stable machine-readable Diagnostic; no unsupported input is silently ignored.
- The same valid JSON and seed produce byte-identical NormalizedWorldIR, normalized hash, and ExecutionPlan ordering.
- Old `OutdoorWorldSpec` and Three/Rapier scenes remain runnable but receive no new Canonical JSON behavior.

---

### Task 1: Canonical Authoring Protocol and Strict Parser

**Files:**
- Create: `packages/authoring/package.json`
- Create: `packages/authoring/src/types.ts`
- Create: `packages/authoring/src/authoring-spec-v1.schema.json`
- Create: `packages/authoring/src/parse.ts`
- Create: `packages/authoring/src/validate.ts`
- Create: `packages/authoring/src/index.ts`
- Test: `packages/authoring/src/authoring.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `AuthoringSpecV1`, typed node unions, `AuthoringDiagnostic`, `parseAuthoringSpecJson(sourceText)`, and `validateAuthoringSpec(value)`.
- Consumes: no runtime package and no engine type.

- [ ] **Step 1: Add failing parser and Schema tests**

```ts
const result = parseAuthoringSpecJson(validSource);
expect(result.ok).toBe(true);

const duplicate = parseAuthoringSpecJson('{"kind":"worldkit-authoring-spec","kind":"other"}');
expect(duplicate.diagnostics).toContainEqual(expect.objectContaining({
  code: "AUTHORING_JSON_DUPLICATE_KEY",
  instancePath: "/kind",
}));

expect(validateAuthoringSpec({ ...validSpec, unexpected: true }).diagnostics)
  .toContainEqual(expect.objectContaining({ code: "AUTHORING_SCHEMA_INVALID" }));
```

- [ ] **Step 2: Run the package test and verify it fails because the package does not exist**

Run: `pnpm vitest run packages/authoring/src/authoring.test.ts`

Expected: FAIL with a module/file-not-found error.

- [ ] **Step 3: Define the closed `AuthoringSpecV1` contract and JSON Schema**

The root contract is:

```ts
interface AuthoringSpecV1 {
  kind: "worldkit-authoring-spec";
  schemaVersion: 1;
  id: string;
  seed: number;
  provenance?: ProvenanceSpec;
  world: WorldSpecV1;
  resources: { prototypes: readonly PrimitivePrototypeSpec[] };
  nodes: readonly WorldNodeSpecV1[];
  relationships: readonly RelationshipSpecV1[];
  rules: readonly RuleSpecV1[];
  startup: StartupSpecV1;
  constraints: ConstraintSpecV1;
}
```

Every object in the Schema uses `additionalProperties: false`; node, source, primitive, and shape unions use required discriminators. V1 accepts `terrain`, `water`, `object`, `subject`, `camera`, and `anchor` nodes. `relationships` and `rules` remain structurally present but any non-empty value is reported as unsupported by normalization rather than discarded.

- [ ] **Step 4: Implement strict JSON parsing and Ajv validation**

Use `jsonc-parser` to reject syntax errors, comments, trailing commas, and duplicate keys before materializing the object. Compile the checked-in Schema with Ajv in strict/all-errors mode and map each Ajv error to:

```ts
interface AuthoringDiagnostic {
  severity: "info" | "warning" | "error";
  code: string;
  instancePath: string;
  message: string;
  details?: Readonly<Record<string, unknown>>;
  suggestions?: readonly AuthoringSuggestion[];
}
```

- [ ] **Step 5: Run the authoring tests and typecheck**

Run: `pnpm vitest run packages/authoring/src/authoring.test.ts && pnpm typecheck`

Expected: parser, duplicate-key, unknown-field, discriminator, unit-bound, and resource-reference tests PASS; typecheck exits 0.

- [ ] **Step 6: Commit Task 1**

```bash
git add package.json pnpm-lock.yaml packages/authoring
git commit -m "feat: add canonical authoring schema"
```

### Task 2: Deterministic NormalizedWorldIR

**Files:**
- Create: `packages/authoring/src/canonical-json.ts`
- Create: `packages/authoring/src/normalize.ts`
- Create: `packages/authoring/src/normalize.test.ts`
- Modify: `packages/authoring/src/types.ts`
- Modify: `packages/authoring/src/index.ts`
- Modify: `packages/authoring/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: validated `AuthoringSpecV1`.
- Produces: `NormalizedWorldIRV1`, `normalizeAuthoringSpec(spec)`, `canonicalizeJson(value)`, and `normalizedWorldIrHash`.

- [ ] **Step 1: Write failing normalization tests**

```ts
const first = normalizeAuthoringSpec(specWithShuffledNodes);
const second = normalizeAuthoringSpec(specWithCanonicalOrder);
expect(first.ok).toBe(true);
expect(first.value).toEqual(second.value);
expect(first.normalizedWorldIrHash).toBe(second.normalizedWorldIrHash);
expect(first.value?.nodes.map((node) => node.id)).toEqual([
  "camera-main", "player", "spawn-main", "terrain-main",
]);
```

Also test duplicate IDs, dangling `prototypeRef`, wrong node kind at `startup`, unsupported non-empty relationships/rules, unsupported Kit, water-to-terrain references, and spawn outside terrain bounds.

- [ ] **Step 2: Run the normalization test and verify it fails**

Run: `pnpm vitest run packages/authoring/src/normalize.test.ts`

Expected: FAIL because `normalizeAuthoringSpec` is missing.

- [ ] **Step 3: Implement canonical JSON and SHA-256 hashing**

Canonicalization recursively sorts object keys, preserves semantically ordered arrays, rejects non-finite numbers, and encodes UTF-8 bytes. Use `@noble/hashes` for the browser/Node-compatible SHA-256 implementation and emit lowercase `sha256:<64 hex>` strings.

- [ ] **Step 4: Implement semantic normalization**

Normalization must:

```text
validate root schema
  -> index prototypes and nodes by stable ID
  -> verify unique and typed references
  -> reject unsupported V1 behavior
  -> inject declared defaults
  -> resolve package://prototype/<id> references
  -> sort unordered collections by stable ID
  -> emit immutable NormalizedWorldIRV1
  -> canonicalize and hash the IR
```

Use stable Diagnostic codes including `AUTHORING_ID_DUPLICATE`, `AUTHORING_REFERENCE_NOT_FOUND`, `AUTHORING_REFERENCE_KIND_MISMATCH`, `AUTHORING_FEATURE_NOT_SUPPORTED`, `AUTHORING_SPAWN_OUT_OF_BOUNDS`, and `AUTHORING_KIT_NOT_SUPPORTED`.

- [ ] **Step 5: Run normalization, authoring, and type tests**

Run: `pnpm vitest run packages/authoring/src/authoring.test.ts packages/authoring/src/normalize.test.ts && pnpm typecheck`

Expected: all tests PASS and repeated normalization produces the same IR/hash.

- [ ] **Step 6: Commit Task 2**

```bash
git add package.json pnpm-lock.yaml packages/authoring
git commit -m "feat: normalize authoring specs deterministically"
```

### Task 3: Engine-neutral Execution Plan Compiler

**Files:**
- Create: `packages/runtime-contracts/package.json`
- Create: `packages/runtime-contracts/src/execution-plan.ts`
- Create: `packages/runtime-contracts/src/runtime-session.ts`
- Create: `packages/runtime-contracts/src/index.ts`
- Create: `packages/compiler/package.json`
- Create: `packages/compiler/src/compile.ts`
- Create: `packages/compiler/src/compile.test.ts`
- Create: `packages/compiler/src/index.ts`

**Interfaces:**
- Consumes: `NormalizedWorldIRV1` plus `normalizedWorldIrHash`.
- Produces: `compileWorld(normalized): CompileWorldResult`, `ExecutionPlanV1`, and the `WorldRuntimeSession` contract.

- [ ] **Step 1: Write a failing compiler Golden test**

```ts
const result = compileWorld(normalizedFixture);
expect(result.diagnostics).toEqual([]);
expect(result.executionPlan).toMatchObject({
  kind: "worldkit-execution-plan",
  schemaVersion: 1,
  runtimeBackend: "babylon-havok",
  subject: { entityId: "player" },
  camera: { cameraEntityId: "camera-main", targetEntityId: "player" },
});
expect(result.executionPlan?.objects.map((item) => item.entityId))
  .toEqual(["tower", "wall-east", "wall-west"]);
```

- [ ] **Step 2: Run the compiler test and verify it fails**

Run: `pnpm vitest run packages/compiler/src/compile.test.ts`

Expected: FAIL because compiler/runtime-contract packages are missing.

- [ ] **Step 3: Define engine-neutral runtime contracts**

`ExecutionPlanV1` contains fully resolved metric terrain samples, water shapes, primitive objects, subject spawn, third-person camera, gravity, atmosphere, budgets, stable IDs, and normalized hash. `WorldRuntimeSnapshotV1` contains runtime backend, tick, controlled subject state, camera state, medium, physics readiness, and resource counts. No member may reference an engine class.

- [ ] **Step 4: Compile IR into deterministic terrain and object data**

Use the existing deterministic terrain relief presets as a behavior reference, but copy the required engine-neutral math into the compiler rather than importing Three/Rapier scene builders. Produce one shared row-major height array used later by both Babylon mesh and Havok heightfield. Resolve primitive prototype dimensions/collision and transform data before runtime.

- [ ] **Step 5: Run compiler tests, typecheck, and determinism checks**

Run: `pnpm vitest run packages/compiler/src/compile.test.ts packages/authoring/src/normalize.test.ts && pnpm typecheck`

Expected: Golden plan, stable ordering, terrain sample hash, unsupported-resource diagnostics, and typecheck PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add packages/runtime-contracts packages/compiler
git commit -m "feat: compile normalized worlds into execution plans"
```

### Task 4: Babylon.js + Havok Runtime

**Files:**
- Create: `packages/runtime-babylon/package.json`
- Create: `packages/runtime-babylon/src/materials.ts`
- Create: `packages/runtime-babylon/src/terrain.ts`
- Create: `packages/runtime-babylon/src/physics.ts`
- Create: `packages/runtime-babylon/src/subject-controller.ts`
- Create: `packages/runtime-babylon/src/babylon-world-runtime.ts`
- Create: `packages/runtime-babylon/src/index.ts`
- Create: `packages/runtime-babylon/src/runtime.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `ExecutionPlanV1` and an `HTMLCanvasElement` or Babylon `NullEngine` factory for tests.
- Produces: `BabylonWorldRuntime.create(options)`, implementing `WorldRuntimeSession`.

- [ ] **Step 1: Add failing headless runtime tests**

```ts
const runtime = await BabylonWorldRuntime.create({
  executionPlan,
  engineFactory: () => new NullEngine({ renderWidth: 640, renderHeight: 360 }),
});
expect(runtime.snapshot()).toMatchObject({
  runtimeBackend: "babylon-havok",
  physics: { backend: "havok", ready: true },
  subject: { entityId: "player", movementMedium: "ground" },
});
await runtime.dispose();
```

Add an integration assertion that a forward command cannot move the capsule through a fixed wall and that entering a declared water boundary changes `movementMedium` to `water`.

- [ ] **Step 2: Run the runtime test and verify it fails**

Run: `pnpm vitest run packages/runtime-babylon/src/runtime.test.ts`

Expected: FAIL because the Babylon runtime is missing.

- [ ] **Step 3: Initialize Babylon and Havok behind the adapter**

Initialize `@babylonjs/havok` asynchronously, pass the result to Babylon `HavokPlugin`, enable Physics V2 using the plan gravity, set right-handed coordinates, and create fixed-step ownership inside the runtime. Tests use `NullEngine`; the browser uses `Engine`.

- [ ] **Step 4: Build render and physics resources from one ExecutionPlan**

- Terrain mesh vertices and `PhysicsShapeHeightField` consume the same plan height array.
- Water renders as a translucent semantic surface and registers a deterministic containment volume.
- Primitive objects create Babylon whitebox meshes and fixed Havok bodies when `collisionEnabled` is true.
- Subject uses a capsule body, locked rotation, semantic movement commands, ground detection, and a whitebox capsule/body visual.
- The third-person camera follows the subject using declared `distanceMeters`, `pitchRadians`, `targetHeightMeters`, and `fovDegrees`.

- [ ] **Step 5: Implement fixed input, snapshots, medium detection, capture, and disposal**

`runFixedInput` consumes semantic actions for exact tick counts. `snapshot` reports stable IDs and metric values. `dispose` releases render loops, observers, Babylon resources, Physics V2 bodies/shapes, the Havok plugin, and the engine exactly once.

- [ ] **Step 6: Run runtime tests and typecheck**

Run: `pnpm vitest run packages/runtime-babylon/src/runtime.test.ts && pnpm typecheck`

Expected: terrain/heightfield parity, wall collision, water detection, fixed input, snapshot, and idempotent disposal tests PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add package.json pnpm-lock.yaml packages/runtime-babylon
git commit -m "feat: add Babylon Havok world runtime"
```

### Task 5: Playground Browser Protocol and Dynamic JSON Loading

**Files:**
- Create: `apps/playground/src/babylon-world-adapter.ts`
- Create: `apps/playground/src/authoring-loader.ts`
- Create: `apps/playground/src/authoring-loader.test.ts`
- Modify: `apps/playground/src/playground-world.ts`
- Modify: `apps/playground/src/main.ts`
- Modify: `apps/playground/src/scenes/index.ts`
- Modify: `apps/playground/vite.config.mjs`
- Modify: `apps/playground/package.json`

**Interfaces:**
- Consumes: `/__worldkit/authoring-spec`, authoring/normalizer/compiler packages, and `BabylonWorldRuntime`.
- Produces: Browser Protocol V1 at `window.__WORLDKIT__`, while retaining `window.__WHITEBOX_PLAYGROUND__` for legacy scenes.

- [ ] **Step 1: Write failing loader and protocol tests**

```ts
const loaded = await loadAuthoringScene(async () => new Response(validJson));
expect(loaded.executionPlan.runtimeBackend).toBe("babylon-havok");

const invalid = await loadAuthoringScene(async () => new Response('{"kind":"bad"}'));
expect(invalid.diagnostics[0]?.code).toBe("AUTHORING_SCHEMA_INVALID");
```

- [ ] **Step 2: Run loader tests and verify failure**

Run: `pnpm vitest run apps/playground/src/authoring-loader.test.ts`

Expected: FAIL because the loader does not exist.

- [ ] **Step 3: Add a Vite development-only spec endpoint**

The server reads only the exact file path supplied in `WORLDKIT_AUTHORING_SPEC_PATH`, enforces a byte limit, returns JSON with `no-store`, and never exposes directory listing or arbitrary request paths. Missing configuration returns a structured 404 response.

- [ ] **Step 4: Route Canonical JSON to Babylon and catalog scenes to legacy runtime**

`?authoring=1` fetches, parses, validates, normalizes, compiles, and creates `BabylonWorldAdapter`. Existing `?scene=<id>` continues to create `SdkWorldAdapter`. Initialization failure renders machine-readable diagnostics in the inspector and rejects the Browser ready promise.

- [ ] **Step 5: Publish stable Browser Protocol V1**

Expose:

```ts
interface WorldkitBrowserApiV1 {
  version: 1;
  ready(): Promise<WorldRuntimeSnapshotV1>;
  getSnapshot(): WorldRuntimeSnapshotV1;
  runFixedInput(steps: readonly FixedInputStepV1[]): Promise<WorldRuntimeSnapshotV1>;
  captureScreenshot(): string;
  reset(): WorldRuntimeSnapshotV1;
  setPaused(paused: boolean): WorldRuntimeSnapshotV1;
}
```

- [ ] **Step 6: Run playground tests, build, and typecheck**

Run: `pnpm vitest run apps/playground/src/authoring-loader.test.ts apps/playground/src/scenes/scenes.test.ts && pnpm typecheck && pnpm build`

Expected: new loader tests PASS, all legacy scene tests remain green, typecheck and Vite build exit 0.

- [ ] **Step 7: Commit Task 5**

```bash
git add apps/playground
git commit -m "feat: load canonical JSON worlds in playground"
```

### Task 6: CLI Validate, Build, Run, and Playwright Capture

**Files:**
- Create: `scripts/worldkit.ts`
- Create: `scripts/worldkit.test.ts`
- Create: `scripts/lib/worldkit-server.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: public authoring/compiler APIs and Browser Protocol V1.
- Produces: `pnpm worldkit validate|build|run|capture` with structured stdout/stderr and stable exit codes.

- [ ] **Step 1: Write failing CLI tests**

```ts
expect(parseWorldkitArgs(["validate", "examples/authoring/basic-world.json"]))
  .toEqual({ command: "validate", inputPath: "examples/authoring/basic-world.json", json: false });
expect(await validateFile(validPath)).toMatchObject({ ok: true });
expect(await validateFile(invalidPath)).toMatchObject({ ok: false, exitCode: 2 });
```

- [ ] **Step 2: Run CLI tests and verify failure**

Run: `pnpm vitest run scripts/worldkit.test.ts`

Expected: FAIL because the CLI module is missing.

- [ ] **Step 3: Implement stateless commands**

- `validate <file> [--json]`: strict parse, validate, normalize, print diagnostics, exit 0/2.
- `build <file> --output <file>`: write canonical NormalizedWorldIR plus normalized hash atomically, never overwrite input.
- All output paths resolve explicitly; errors never echo file contents or environment secrets.

- [ ] **Step 4: Implement lifecycle commands**

- `run <file> [--port <port>]`: start the playground with the exact spec path and print the authoring URL; SIGINT/SIGTERM cleanly terminate the child.
- `capture <file> --output <png> [--snapshot <json>]`: start an ephemeral server, launch Playwright Chromium, wait for `window.__WORLDKIT__.ready()`, write an atomic PNG and optional Snapshot JSON, then close browser/server in `finally`.
- If Chromium is absent, return a Diagnostic instructing the user to run `pnpm exec playwright install chromium`.

- [ ] **Step 5: Run CLI tests, typecheck, and help smoke**

Run: `pnpm vitest run scripts/worldkit.test.ts && pnpm worldkit --help && pnpm typecheck`

Expected: tests PASS, help lists four commands, typecheck exits 0.

- [ ] **Step 6: Commit Task 6**

```bash
git add package.json pnpm-lock.yaml scripts
git commit -m "feat: add worldkit CLI and Playwright capture"
```

### Task 7: Basic World Fixture, End-to-End Gates, and Documentation

**Files:**
- Create: `examples/authoring/basic-world.json`
- Create: `examples/authoring/invalid-world.json`
- Create: `artifacts/examples/basic-world/.gitkeep`
- Create: `docs/17-canonical-json-quickstart.md`
- Create: `scripts/verify-canonical-world.ts`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: every public V1 layer.
- Produces: a reviewable JSON world, captured PNG/Snapshot, and one-command release gate.

- [ ] **Step 1: Add the representative basic world JSON**

The fixture contains one rolling terrain, one elliptical lake, three collision-enabled primitive objects (tower and two walls), one spawn anchor, one controllable humanoid subject, one third-person camera, clear-day atmosphere, and deterministic seed `1024`.

- [ ] **Step 2: Implement the release verifier**

`pnpm verify:v1` must execute:

```text
worldkit validate examples/authoring/basic-world.json
worldkit build examples/authoring/basic-world.json --output artifacts/examples/basic-world/world.normalized.json
worldkit capture examples/authoring/basic-world.json --output artifacts/examples/basic-world/world.png --snapshot artifacts/examples/basic-world/snapshot.json
assert PNG signature and non-trivial dimensions
assert runtimeBackend=babylon-havok
assert physics.backend=havok and physics.ready=true
assert terrain/water/object/subject/camera IDs are present
run fixed input and assert the subject moved but did not cross a blocking wall
assert a deterministic water-entry script reports movementMedium=water
```

- [ ] **Step 3: Write the quickstart and migration boundary**

Document the exact JSON contract entry point, commands, output examples, Browser Protocol, unsupported V1 capabilities, and that old `OutdoorWorldSpec` scenes are regression fixtures rather than the new public protocol.

- [ ] **Step 4: Run the complete V1 gate**

Run: `pnpm typecheck && pnpm test && pnpm build && pnpm verify:v1`

Expected: typecheck/build exit 0, all unit/integration tests PASS, V1 verifier produces valid PNG/JSON artifacts and reports every blocking gate as passed.

- [ ] **Step 5: Inspect the captured world visually**

Open `artifacts/examples/basic-world/world.png` and verify visible terrain relief, water surface, tower, two walls, whitebox subject, and third-person composition. If any required element is absent or materially occluded, adjust the fixture/compiler/runtime and rerun Step 4.

- [ ] **Step 6: Commit Task 7**

```bash
git add README.md package.json examples docs/17-canonical-json-quickstart.md scripts/verify-canonical-world.ts artifacts/examples/basic-world/.gitkeep
git commit -m "feat: ship canonical JSON world vertical slice"
```

### Task 8: Completion Audit and Main-branch Integration

**Files:**
- Review: every file changed by Tasks 1-7
- Review: `docs/superpowers/specs/2026-08-17-ai-first-lego-game-sdk-design.md`
- Review: `AGENTS.md`

**Interfaces:**
- Consumes: committed V1 branch.
- Produces: verified, reviewable, remotely synchronized implementation.

- [ ] **Step 1: Audit every explicit V1 requirement against evidence**

Create a table in the final handoff mapping strict JSON, validation, normalization, deterministic hash, engine-neutral plan, Babylon rendering, Havok collision, subject movement, water detection, camera, CLI commands, Browser Protocol, Playwright capture, and cleanup to tests or produced artifacts.

- [ ] **Step 2: Run fresh full verification**

Run: `pnpm typecheck && pnpm test && pnpm build && pnpm verify:v1 && git diff --check`

Expected: every command exits 0; no skipped V1 gate.

- [ ] **Step 3: Verify branch and commit hygiene**

Run: `git status --short && git log --oneline --decorate origin/main..HEAD`

Expected: clean worktree and only intentional V1 commits.

- [ ] **Step 4: Integrate and synchronize**

Fetch `origin`, rebase the feature branch if necessary, fast-forward `main`, push `main`, fetch again, and verify `git rev-list --left-right --count main...origin/main` returns `0 0` with matching local/remote hashes.
