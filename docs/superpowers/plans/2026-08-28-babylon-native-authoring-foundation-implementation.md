# Babylon Native Authoring Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the production-shaped Babylon Native authoring contract and dedicated Provider package that the Block Whitebox Profile can safely build on, without yet changing Runtime world identity or claiming Native production support.

**Architecture:** Add the closed `BabylonNativeSceneBootstrapV1` data contract to the engine-neutral Runtime contract package, then extract and harden the experimental Native Module API into `@whitebox-world/native-babylon`. The new package exposes one AI-facing root entry and one Host-only subpath; `@whitebox-world/runtime-babylon` remains the sole Havok/Character/Camera adapter and consumes admitted Native contributions without re-exporting the authoring API.

**Tech Stack:** TypeScript 5.9.2, Babylon.js 9.23.0, Vitest 3.2.4, Vite 7.1.2, pnpm 10.14.0.

**Spec:** `docs/superpowers/specs/2026-08-28-ai-friendly-babylon-native-world-authoring-design.md`

**Dependent Spec:** `docs/superpowers/specs/2026-08-28-babylon-native-block-whitebox-profile-design.md`

## Scope boundary

This plan implements the first independently reviewable slice of BNA-1 and BNA-2:

- the exact Native Bootstrap parser/hash contract;
- the Babylon Import Profile decision evidence;
- `@whitebox-world/native-babylon` root and Host boundaries;
- deterministic build context, explicit Spawn/Static Collider registration, immutable contribution snapshots, and structured diagnostics;
- migration of the existing Native spike to the new package without changing its visual or interaction behavior.

This plan does **not** complete `WorldRuntimeBootstrapV1`, `WorldBuildIdentityV1`, the Runtime `sceneSource` Union, Native WorldPackage/Receipt, Hosted isolation, Block Profile algorithms, Route/Nav, or generated-asset production. Those remain separate dependency plans after this API boundary is accepted.

The Foundation review is an internal engineering checkpoint, not a supported compatibility surface. Implementation continues directly into the BNA-1 identity clean break before a Native production GO or the final Block Profile integration is accepted; no later plan may preserve this slice's temporary shadow ExecutionPlan as a fallback.

## Global constraints

- Execution starts only when `origin/main` is an ancestor of the implementation branch and the worktree is clean. If `origin/main` moved after `febba985255b77a180b54b3b88be7f36601ff9c5`, merge it first and repeat the design-impact census.
- Keep Canonical Authoring V4 -> IR V4 -> ExecutionPlan V5 behavior and public field names unchanged in this slice.
- `@whitebox-world/native-babylon` depends directly on `@babylonjs/core@9.23.0`; it must not depend on `@whitebox-world/runtime-babylon`, Havok, Character Movement, Camera Runtime, Authoring, Compiler, Terrain Compiler, or World.
- The AI-facing root export contains only `defineBabylonNativeScene`, BuildContext/Registration types, deterministic random and locked-asset interfaces, plus diagnostic types. Host build/admission functions live under `@whitebox-world/native-babylon/host`.
- The Module may create Babylon visual objects only in the Host-provided Candidate Scene. It cannot create Engine, Scene, Render Loop, Physics, Camera, Subject, Input, Timer, or Tick ownership.
- JSON contains no per-Mesh or per-block geometry. Unregistered Meshes are visual-only.
- Static Collider registration uses a required closed `traversalBinding`; it never restores the experimental `surfaceKind` field.
- Frozen contribution data contains canonical world-space numbers and no Babylon, Havok, Browser, file-system, or Provider handles.
- The repository is unreleased. The accepted tree contains no deprecated re-export, alias field, dual Parser, legacy/new Runtime switch, compatibility Adapter, old Native Bootstrap, old `surfaceKind`, or parallel old/new Package. `schemaVersion: 1` and `V1` suffixes identify the sole current contract; they do not authorize parallel versions.
- Task commits may expose an incomplete migration inside this feature branch, but they are not accepted capability states. Before any production GO, the entire affected consumer graph, Fixture set, generated evidence and docs must be migrated and the old contract census must be zero.
- Every production behavior follows RED -> verified failure -> minimal GREEN -> refactor. No implementation is copied into a new owner before its new-owner test has failed for the expected missing-contract reason.
- Each task is committed independently after its focused tests pass. Full gates run only after the complete slice is integrated.

---

### Task 1: Freeze the Babylon Import Profile with reproducible evidence

**Files:**
- Create: `docs/reviews/2026-08-28-babylon-native-import-profile-bakeoff.md`
- Create: `artifacts/native-import-profile/bakeoff.json`
- Modify: `docs/superpowers/specs/2026-08-28-ai-friendly-babylon-native-world-authoring-design.md`

**Interfaces:**
- Consumes: the installed `@babylonjs/core@9.23.0`, its package side-effect declaration, Vite's programmatic build API, and two source-equivalent temporary scene fixtures.
- Produces: immutable decision evidence selecting exactly one public Import Profile. The rejected candidate is not retained as a recurring repository test or supported dialect.

- [x] **Step 1: Run the source-equivalent one-time bake-off**

Use equivalent temporary fixtures that reference exactly `Color3`, `MeshBuilder`, `StandardMaterial`, `TransformNode`, and `Vector3`. Build with the installed Vite API, `minify: false`, `sourcemap: false`, `write: false`, ES output, and no external imports. Record exact environment, bytes, module count, elapsed time and any bounded rejection.

- [x] **Step 2: Reject an unbounded candidate honestly**

Do not turn a rejected Import Profile into a permanent resource-heavy contract test. If the candidate does not complete within the engineering observation budget, stop it, record the elapsed lower bound and `null` for unavailable bytes/module count, and reject it. Never synthesize measurement values.

- [x] **Step 3: Freeze Deep ESM as the only current dialect**

Update the authoritative Spec and review with the selected exact deep module paths. Root barrel, namespace imports, and mixed import styles are forbidden in Native modules and examples.

- [x] **Step 4: Bind the decision to permanent enforcement**

Task 3's package-boundary test must fail on bare `@babylonjs/core`, namespace imports, old `babylonjs`, or imports outside the frozen deep-path allowlist. That behavior test, not rerunning the discarded candidate, is the durable regression gate.

- [x] **Step 5: Commit the decision evidence**

Run `git diff --check`, verify the JSON parses, and commit:

```bash
git add artifacts/native-import-profile/bakeoff.json docs/reviews/2026-08-28-babylon-native-import-profile-bakeoff.md docs/superpowers/specs/2026-08-28-ai-friendly-babylon-native-world-authoring-design.md docs/superpowers/plans/2026-08-28-babylon-native-authoring-foundation-implementation.md
git commit -m "docs: freeze Babylon native import profile"
```

---

### Task 2: Add the closed Native Bootstrap contract

**Files:**
- Create: `packages/runtime-contracts/src/babylon-native-scene-bootstrap.test.ts`
- Create: `packages/runtime-contracts/src/babylon-native-scene-bootstrap.ts`
- Modify: `packages/runtime-contracts/src/index.ts`
- Modify: `scripts/lib/test-gate-manifest.ts`

**Interfaces:**
- Consumes: `sha256CanonicalJson` from `@whitebox-world/protocol` and the project `Sha256HashV1` convention.
- Produces: `BabylonNativeSceneBootstrapV1`, `parseBabylonNativeSceneBootstrapV1(input)`, and `hashBabylonNativeSceneBootstrapV1(input)`.

The exact public contract is:

```ts
export interface BabylonNativeInitialCameraV1 {
  readonly mode: "third-person";
  readonly pitchRadians: number;
  readonly distanceMeters: number;
  readonly fovDegrees: number;
  readonly targetHeightMeters: number;
}

export interface BabylonNativeSceneBootstrapV1 {
  readonly kind: "babylon-native-scene-bootstrap";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly sceneModuleRef: string;
  readonly nativeSceneApiRef: string;
  readonly nativeSceneProfileRef: string;
  readonly gameplayBootstrapRef: string;
  readonly initialControlledEntityId: string;
  readonly gravityMetersPerSecondSquaredXYZ: readonly [number, number, number];
  readonly initialCamera: BabylonNativeInitialCameraV1;
  readonly seed: number;
  readonly spawnMarkerId: string;
}
```

- [x] **Step 1: Write exact-schema RED tests**

The passing fixture uses the `cloud-ridge-native` values from Spec section 6.1. Add table-driven rejection cases for unknown/missing keys, accessor/symbol/prototype objects, wrong discriminators, invalid refs, duplicate semantic identity expressed through aliases, non-finite numbers, signed zero, unsafe/negative seed, non-positive distance, FOV outside `(0, 180)`, and empty IDs. Assert parsed output and nested arrays/objects are frozen.

```ts
it("rejects geometry fields in the Native Bootstrap", () => {
  expect(() => parseBabylonNativeSceneBootstrapV1({
    ...VALID_BOOTSTRAP,
    meshes: [],
  })).toThrow(/BabylonNativeSceneBootstrapV1/);
});

it("hashes canonical parsed Bootstrap data", () => {
  expect(hashBabylonNativeSceneBootstrapV1(VALID_BOOTSTRAP)).toMatch(
    /^sha256:[0-9a-f]{64}$/,
  );
});
```

- [x] **Step 2: Run tests and verify RED**

Run:

```bash
pnpm vitest run packages/runtime-contracts/src/babylon-native-scene-bootstrap.test.ts
```

Expected: FAIL because the module and exports do not exist.

- [x] **Step 3: Implement the minimal parser and hash**

Use exact own-key checks, accessor-free snapshots, explicit WorldKit Ref patterns, finite no-signed-zero tuples, and recursive freezing. The Parser performs structural validation only; Camera Profile compatibility and Host budget authorization remain later Admission gates.

- [x] **Step 4: Verify GREEN, export, and commit**

Run the focused test and `pnpm typecheck`. Register the test as `contract`, then commit:

```bash
git add packages/runtime-contracts/src/babylon-native-scene-bootstrap.ts packages/runtime-contracts/src/babylon-native-scene-bootstrap.test.ts packages/runtime-contracts/src/index.ts scripts/lib/test-gate-manifest.ts
git commit -m "feat(contracts): add Babylon native bootstrap"
```

---

### Task 3: Create the dedicated AI-facing Native Babylon package

**Files:**
- Create: `packages/native-babylon/package.json`
- Create: `packages/native-babylon/src/index.ts`
- Create: `packages/native-babylon/src/module.ts`
- Create: `packages/native-babylon/src/random.ts`
- Create: `packages/native-babylon/src/assets.ts`
- Create: `packages/native-babylon/src/diagnostics.ts`
- Create: `packages/native-babylon/src/package-boundary.test.ts`
- Create: `packages/native-babylon/src/module.test.ts`
- Modify: `scripts/lib/test-gate-manifest.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `Scene`/`Mesh` from the selected Babylon Import Profile and `BabylonNativeSceneBootstrapV1` from Runtime Contracts.
- Produces: `defineBabylonNativeScene()`, `BabylonNativeSceneBuildContextV1`, `BabylonNativeSceneRegistrationV1`, `BabylonNativeHostRandomV1`, `BabylonNativeLockedAssetResolverV1`, and the diagnostic DTOs frozen in Spec section 12.2.

The root API shape is:

```ts
export interface BabylonNativeSceneModuleV1 {
  readonly kind: "babylon-native-scene-module";
  readonly id: string;
  build(context: BabylonNativeSceneBuildContextV1): void | Promise<void>;
}

export function defineBabylonNativeScene(
  module: BabylonNativeSceneModuleV1,
): BabylonNativeSceneModuleV1;
```

`BabylonNativeSceneBuildContextV1` contains only `scene`, parsed `bootstrap`, deterministic `random`, locked `assets`, and `registration`. `registration` exposes only `registerSpawnMarker()` and `registerStaticCollider()`.

- [ ] **Step 1: Write the package-boundary RED test**

Read the package manifest and root index source. Assert direct dependencies contain exactly the used packages, Babylon is exactly `9.23.0`, and the source tree has no imports from Runtime Babylon, Havok, Camera, Character Movement, Authoring, Compiler, Terrain Compiler, World, DOM, Node file-system, or network modules.

```ts
it("keeps the AI-facing package outside Runtime ownership", async () => {
  const source = await readFile(new URL("./index.ts", import.meta.url), "utf8");
  expect(source).not.toMatch(/runtime-babylon|havok|character-movement|camera/);
});
```

- [ ] **Step 2: Run the boundary test and verify RED**

Run:

```bash
pnpm vitest run packages/native-babylon/src/package-boundary.test.ts
```

Expected: FAIL because the package does not exist.

- [ ] **Step 3: Add the package and minimal root API**

Create the package with only the root export `.`. Implement `defineBabylonNativeScene()` as an exact immutable definition guard: canonical non-empty `id`, required `kind`, callable `build`, no extra own keys, no accessor/symbol fields, and no retained mutable wrapper. Declare only the dependencies used by this task: `@babylonjs/core@9.23.0` and `@whitebox-world/runtime-contracts`; Task 4 adds the Host subpath and Protocol dependency when they first have production consumers.

- [ ] **Step 4: Add deterministic random and locked-asset interfaces**

Implement a seed-derived PRNG with `nextRatio()`, `range(minimum, maximum)`, and `pick(values)`; test equal seeds produce byte-equal sequences, different seeds differ, empty `pick` rejects, and no `Math.random` call occurs. Define the locked resolver request/result interface using only `assetResourceRef`, locked Hash/Receipt identity, immutable bytes, and semantic import metadata; do not add URL/path/cache/provider fields.

- [ ] **Step 5: Add closed diagnostic types and parser tests**

Implement the exact `NativeSceneDiagnosticMeasurementV1`, `NativeSceneDiagnosticV1`, and `NativeSceneCheckResultV1` unions from Spec section 12.2. Tests reject `passed + error`, `rejected + warnings-only`, `tool-error` without a tooling Error, absolute source paths, unknown stages/location kinds, unqualified numeric measurements, and asset identities in `checkedInput`.

- [ ] **Step 6: Verify GREEN and commit**

Run:

```bash
pnpm install --lockfile-only
pnpm vitest run packages/native-babylon/src/package-boundary.test.ts packages/native-babylon/src/module.test.ts
pnpm typecheck
pnpm test:census
```

Register both tests as `contract`, then commit:

```bash
git add packages/native-babylon pnpm-lock.yaml scripts/lib/test-gate-manifest.ts
git commit -m "feat: add Babylon native authoring package"
```

---

### Task 4: Move registration and contribution admission behind the Host subpath

**Files:**
- Create: `packages/native-babylon/src/host.ts`
- Create: `packages/native-babylon/src/host.test.ts`
- Create: `packages/native-babylon/src/contribution.ts`
- Create: `packages/native-babylon/src/contribution.test.ts`
- Modify: `packages/native-babylon/package.json`
- Modify: `scripts/lib/test-gate-manifest.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: one parsed Bootstrap, Host Candidate `Scene`, one defined Native Module, one Host random instance, one locked asset resolver, and an authorized admission budget.
- Produces: `buildBabylonNativeSceneCandidateV1()` returning a structured Check Result plus an immutable serializable `BabylonNativeSceneContributionV1` only when `outcome === "passed"`.

The required static collider registration is:

```ts
export type BabylonNativeTraversalBindingV1 =
  | Readonly<{ kind: "not-traversable" }>
  | Readonly<{
      kind: "static-surface";
      surfaceEntityId: string;
      logicalSubshapeId: string;
      traversalSurfaceProfileRef: string;
    }>;

export interface BabylonNativeStaticColliderRegistrationV1 {
  readonly id: string;
  readonly mesh: Mesh;
  readonly traversalBinding: BabylonNativeTraversalBindingV1;
  readonly frictionRatio?: number;
  readonly restitutionRatio?: number;
}
```

The frozen Contribution stores Spawn, collider ID, canonical world positions, triangle indices, material ratios, and the closed traversal binding. It stores neither `Mesh` nor another Babylon handle. The Host build result may retain a provider-local debug map separately, but that map never enters canonical bytes or the Contribution Hash.

- [ ] **Step 1: Port the experimental behavior into new-owner RED tests**

Copy the behavior matrix, not the implementation, from `packages/runtime-babylon/src/native-scene-module.test.ts`. The new tests must cover exactly-one Spawn, duplicate IDs, foreign/disposed Mesh, finite indexed triangles, world transforms, build-time and post-build mutation, Thin Instances, provider Physics, late registration, Collider count/vertex/triangle budgets, deterministic registration sorting, required closed traversal binding, and immutable no-handle output.

```ts
expect(Object.hasOwn(
  result.contribution.staticColliders[0]!,
  "mesh",
)).toBe(false);
expect(result.contributionHash).toBe(
  hashBabylonNativeSceneContributionV1(result.contribution),
);
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
pnpm vitest run packages/native-babylon/src/host.test.ts packages/native-babylon/src/contribution.test.ts
```

Expected: FAIL because the Host builder and Contribution contract do not exist.

- [ ] **Step 3: Extract the validated geometry mechanics**

Add the `./host` package export and direct `@whitebox-world/protocol` dependency. Move the already-tested finite/index/world-transform mechanics from the experimental Runtime file into the new Host owner, adapting inputs to `registration.registerStaticCollider()` and outputs to the handle-free Contribution. Preserve stable error codes as structured diagnostics and use the new measurement/location unions rather than arbitrary error details.

- [ ] **Step 4: Add deterministic canonicalization and hash**

Sort Spawn/Collider data by stable ID, canonicalize signed zero at the Babylon provider publication boundary, hash only parsed handle-free Contribution data, and prove registration call order does not change bytes or Hash. Reject any geometry or binding drift after Build closure.

- [ ] **Step 5: Verify GREEN and commit**

Run the focused tests, `pnpm typecheck`, and `pnpm test:census`. Register both tests as `contract`, then commit:

```bash
git add packages/native-babylon pnpm-lock.yaml scripts/lib/test-gate-manifest.ts
git commit -m "feat(native): freeze scene contributions"
```

---

### Task 5: Migrate the Runtime and cloud-ridge spike to the new owner

**Files:**
- Modify: `packages/runtime-babylon/package.json`
- Modify: `packages/runtime-babylon/src/babylon-world-runtime.ts`
- Modify: `packages/runtime-babylon/src/runtime.test.ts`
- Modify: `packages/runtime-babylon/src/index.ts`
- Delete: `packages/runtime-babylon/src/native-scene-module.ts`
- Delete: `packages/runtime-babylon/src/native-scene-module.test.ts`
- Modify: `apps/native-scene-playground/package.json`
- Modify: `apps/native-scene-playground/src/cloud-ridge-scene.ts`
- Modify: `apps/native-scene-playground/src/cloud-ridge-scene.test.ts`
- Modify: `apps/native-scene-playground/src/native-bootstrap.ts`
- Create: `apps/native-scene-playground/src/native-package-migration.test.ts`
- Modify: `scripts/lib/test-gate-manifest.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `@whitebox-world/native-babylon` root from scene code and `@whitebox-world/native-babylon/host` from Runtime Babylon.
- Produces: unchanged cloud-ridge visuals/controls and SDK-owned Havok behavior with no remaining Runtime Babylon authoring re-export.

- [ ] **Step 1: Write the migration RED test**

Assert the cloud-ridge module imports `defineBabylonNativeScene` from the new root, Runtime Babylon imports only the Host subpath, `runtime-babylon/src/index.ts` no longer exports Native authoring types, and no tracked source imports `native-scene-module` from Runtime Babylon.

```ts
expect(cloudRidgeSource).toContain(
  'from "@whitebox-world/native-babylon"',
);
expect(runtimeSource).toContain(
  'from "@whitebox-world/native-babylon/host"',
);
```

- [ ] **Step 2: Run the migration test and verify RED**

Run:

```bash
pnpm vitest run apps/native-scene-playground/src/native-package-migration.test.ts
```

Expected: FAIL because the spike still imports the experimental Runtime Babylon API.

- [ ] **Step 3: Switch the consumers and remove the old owner**

Add direct workspace dependencies, update the cloud-ridge module to `defineBabylonNativeScene()`, replace `BabylonNativeWorldBootstrapV1` with the sole parsed `BabylonNativeSceneBootstrapV1`, and change every collider registration from `surfaceKind` to the closed traversal binding. Runtime Babylon consumes the Host result, creates the same private collision Mesh/Havok objects, and retains Physics/Character/Camera ownership. Delete the old source, test, types and Runtime Babylon exports after all new-owner tests are green; do not leave a deprecated re-export, alias field, fallback Parser or adapter shim.

- [ ] **Step 4: Prove no visual or gameplay regression**

Run:

```bash
pnpm vitest run packages/native-babylon/src/host.test.ts packages/native-babylon/src/contribution.test.ts
pnpm vitest run packages/runtime-babylon/src/runtime.test.ts -t "runs native scene geometry"
pnpm vitest run apps/native-scene-playground/src/cloud-ridge-scene.test.ts apps/native-scene-playground/src/native-package-migration.test.ts
pnpm build:native-scene
```

Expected: all commands pass; the scene test still finds `player-spawn`, the three explicit collision proxies, the T gate, and both primary mountain silhouettes.

- [ ] **Step 5: Update the test census and commit**

Remove the deleted test from the census, register the migration test, update the lockfile using pnpm, and commit:

```bash
git add packages/runtime-babylon apps/native-scene-playground packages/native-babylon pnpm-lock.yaml scripts/lib/test-gate-manifest.ts
git commit -m "refactor(native): move authoring API out of runtime"
```

---

### Task 6: Foundation integration gate and next-plan handoff

**Files:**
- Modify only files required by defects reproduced during these gates; every defect receives a focused failing regression first.
- Modify: `docs/18-refactor-progress-and-backlog.md`
- Create: `docs/reviews/2026-08-28-babylon-native-authoring-foundation-review.md`

**Interfaces:**
- Consumes: Tasks 1-5 on one exact tree.
- Produces: accepted/rejected BNA-2 foundation evidence and the stable dependency boundary for the Block Profile implementation plan.

- [ ] **Step 1: Run focused contract gates**

```bash
pnpm vitest run packages/runtime-contracts/src/babylon-native-scene-bootstrap.test.ts
pnpm vitest run packages/native-babylon/src
pnpm vitest run packages/runtime-babylon/src/runtime.test.ts -t "runs native scene geometry"
pnpm vitest run apps/native-scene-playground/src/cloud-ridge-scene.test.ts apps/native-scene-playground/src/native-package-migration.test.ts
```

Expected: all selected tests pass without warnings.

- [ ] **Step 2: Run affected repository gates once**

```bash
pnpm verify:workspace-boundaries
pnpm test:census
pnpm typecheck
pnpm test:contract
pnpm test:resource-heavy
pnpm build
pnpm build:native-scene
pnpm verify:3c-migration
```

Expected: every command exits `0`. `pnpm test:contract` subsumes the focused contract files on the same tree; do not rerun `pnpm test` afterward unless the test-gate census proves an uncovered lane.

- [ ] **Step 3: Run the real browser/manual preservation check**

Start `pnpm dev:native-scene -- --host 127.0.0.1`, open the printed URL without `?authoring=1`, enable the collision overlay, and verify movement, jump, camera orbit/recenter, reset, T-gate visibility, and the three registered proxies. Record the exact URL, starting/ending position, grounded state, browser errors, and screenshot path in the review.

- [ ] **Step 4: Perform the full-dimension change review**

Apply `docs/reviews/full-dimension-review-protocol.md` in change-review mode and `docs/reviews/runtime-deep-review-checklist.md` for the Runtime migration. The review must separately report automated contracts, rendered evidence, and manual interaction evidence, and must not claim WorldPackage, Route, Hosted, Block Profile, or Native production completion.

- [ ] **Step 5: Update backlog truth and commit**

Mark only the BNA-2 foundation and narrow Bootstrap slice complete as an internal checkpoint. Keep BNA-1 identity clean break, BNA-3+, and BWB-1+ open; do not call the Native Lane production-ready or introduce compatibility promises. Commit:

```bash
git add docs/18-refactor-progress-and-backlog.md docs/reviews/2026-08-28-babylon-native-authoring-foundation-review.md
git commit -m "docs: record native authoring foundation evidence"
```

- [ ] **Step 6: Write the BNA-1 identity clean-break plan**

Immediately after this internal review, invoke `superpowers:writing-plans` for BNA-1. That plan must replace the shadow ExecutionPlan and generic `executionPlanHash` assumptions across the complete consumer census, rebuild all affected fixtures/artifacts, and delete old fields, Parsers and adapters in the accepted tree. Only after the BNA-1/BNA-4 boundaries are stable should a separate BWB-1 through BWB-5 plan port engine-neutral algorithms from `codex/block-world-sdk-v2@618d96b4e297d90d13ee6d1bf9be1e0b83423dbe`; it must not merge/cherry-pick the old branch or restore Block Manifest/Compiler/Runtime packages.
