# Babylon Native Runtime Scene Source and Identity Clean-Break Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` for this main-agent-only migration. Do not delegate implementation tasks or parallelize shared contract edits. Every production change follows RED -> verified failure -> minimal GREEN -> refactor, and every task ends in its own commit.

**Goal:** Complete BNA-1 by replacing the Canonical-only Runtime input and generic `executionPlanHash` identity with one closed Scene Source union, one Plan-independent Runtime Bootstrap, and one source-neutral World Build Identity, while deleting the Native shadow ExecutionPlan and every touched legacy/current compatibility path. BNA-1 freezes but does not activate formal Native RuntimeHost admission; that branch remains fail-closed until BNA-3 Package identity and BNA-4 Gameplay Surface Admission exist.

**Architecture:** Canonical and Babylon Native remain mutually exclusive geometry sources. `CanonicalSceneExecutionPlanV1` owns only Canonical scene geometry, placements, traversal, and layout. `WorldRuntimeBootstrapV1` owns the shared Subject/Physics/Control/Camera startup closure. `WorldBuildIdentityV1` binds Package Root, Gameplay Bootstrap, Runtime Bootstrap, and the selected Scene Source. BNA-1 migrates the formal Canonical RuntimeHost path to these source-neutral contracts and makes the Native union member a stable capability rejection before Candidate allocation. The trusted-local Cloud Ridge experiment separately proves that Native construction can consume the same Kernel input without a shadow Plan; BNA-4 is the only task allowed to connect the formally packaged/admitted Native member to RuntimeHost.

**Tech Stack:** Declared ranges are TypeScript `^5.9.2`, Vitest `^3.2.4`, and Vite `^7.1.2`; the lock-resolved versions at plan review are TypeScript 5.9.3, Vitest 3.2.7, and Vite 7.3.6. Runtime pins are Babylon.js 9.23.0 and Havok 1.3.14; the package manager is pnpm 10.14.0. Execution evidence must record the then-current lock-resolved versions rather than copying this snapshot blindly.

**Spec:** `docs/superpowers/specs/2026-08-28-ai-friendly-babylon-native-world-authoring-design.md`

**Foundation Review:** `docs/reviews/2026-08-28-babylon-native-authoring-foundation-review.md`

**Required Review Protocols:** `docs/reviews/full-dimension-review-protocol.md` and `docs/reviews/runtime-deep-review-checklist.md`

## Scope and terminal acceptance state

This plan implements BNA-1 only. It does not implement the BNA-3 Native WorldPackage format, BNA-4 production Gameplay Surface Admission, BNA-5 Hosted isolation, BNA-6 model benchmark, BNA-7 Route/Nav publication, or the Block Whitebox Profile package.

The terminal tree must satisfy all of the following:

- Runtime contracts represent exactly one `RuntimeSceneSourceV1` member: Canonical Scene Plan or Babylon Native Scene. During BNA-1, formal RuntimeHost admits only the Canonical member and rejects the Native member before adapter/Candidate allocation with `WORLDKIT_NATIVE_SCENE_PRODUCTION_NOT_ADMITTED`.
- The trusted-local Native experiment receives no `ExecutionPlanV5`, no empty/fake Canonical Plan, and no Plan hash synthesized from Native data.
- Canonical Runtime and the trusted-local Native experiment consume the same parsed `GameplayBootstrapV1` and `WorldRuntimeBootstrapV1`; this does not constitute formal Native RuntimeHost admission.
- The checked-in `BabylonNativeSceneBootstrapV1` JSON Schema, package export, exact Parser, and schema/parser parity tests remain one closed wire contract. Signed zero remains an explicit exact-Parser invariant because JSON Schema numeric equality cannot distinguish `-0` from `0`.
- `CanonicalSceneExecutionPlanV1` contains no gravity, initial camera, Subject runtime closure, Subject asset/rig/animation/collider catalogs, action presentation registry, or initial Gameplay relationships.
- `WorldRuntimeBootstrapV1` contains no Terrain, Water, Structure, static scene Mesh, scene layout, traversal topology, Provider handle, Babylon handle, or Havok handle.
- Generic Runtime, Gameplay, Snapshot, Browser, Capture, Take, and Validation contracts use `worldBuildIdentityHash`; only explicitly Plan-specific Canonical Authoring, Route, and Plan validation contracts retain `executionPlanHash`.
- World Build Identity is derived after Package Root. Its canonical bytes, hash, and receipt transport files are excluded from the root-bound inventory and cannot create a self-reference.
- A Scene Authoring lane, composition strategy, selected published assets, Seed, Profile, or acceptance target change produces a different immutable Attempt identity and invalidates scene-level evidence from the first affected gate.
- The final tree has no `ExecutionPlanV5`, `compileWorldV5`, `parseExecutionPlanV5`, `hashExecutionPlanV5`, WorldPackage V1-to-V2 migration, V1/V2 Package implementation pair, deprecated re-export, alias field, optional dual identity, compatibility adapter, or legacy/new Runtime switch.
- Canonical behavior, experimental Native Cloud Ridge behavior, fixed-Tick movement, collision, camera, Reset, state publication, and atomic Candidate rollback remain behaviorally intact without claiming Native production admission.

## Frozen public contracts

### 0. Existing Babylon Native Bootstrap wire contract

`packages/runtime-contracts/src/babylon-native-scene-bootstrap-v1.schema.json` is the published Draft 2020-12 wire schema and is exported as `@whitebox-world/runtime-contracts/babylon-native-scene-bootstrap-schema`. BNA-1 must preserve its closed key set, resource-family patterns, uint32 Seed, camera bounds, package export, and schema/parser parity tests. The exact in-memory Parser additionally rejects accessors, symbols, custom prototypes, non-finite numbers, and signed zero; the Schema carries an explicit `$comment` for the signed-zero limitation instead of pretending JSON Schema can distinguish mathematically equal zero values.

### 1. Low-level source-neutral identity package

First make `@whitebox-world/protocol` the sole low-level owner of `Sha256HashV1`; remove its current ownership from `@whitebox-world/control-capture` and update every consumer directly without a re-export. Then create `@whitebox-world/world-identity` with only `@whitebox-world/protocol` and `lodash-es` as direct dependencies. Move the content-addressed World Package Ref type and its two conversion functions out of `@whitebox-world/world-package`; update every consumer to import the sole owner directly.

```ts
export type WorldPackageRefV1 =
  `package://world-package/sha256/${string}`;

export interface WorldBuildIdentityV1 {
  readonly kind: "world-build-identity";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly worldPackageRef: WorldPackageRefV1;
  readonly worldPackageRootHash: Sha256HashV1;
  readonly gameplayBootstrapHash: Sha256HashV1;
  readonly worldRuntimeBootstrapHash: Sha256HashV1;
  readonly sceneSourceIdentity:
    | Readonly<{
        kind: "canonical-execution-plan";
        executionPlanHash: Sha256HashV1;
      }>
    | Readonly<{
        kind: "babylon-native-scene";
        nativeSceneBootstrapHash: Sha256HashV1;
        sceneModuleBundleHash: Sha256HashV1;
        nativeSceneContributionHash: Sha256HashV1;
      }>;
}
```

The identity package exports exactly:

- `parseWorldBuildIdentityV1(input)`;
- `worldBuildIdentityCanonicalBytesV1(input)`;
- `hashWorldBuildIdentityV1(input)`;
- `worldPackageRefFromRootHashV1(hash)`;
- `worldPackageRootHashFromRefV1(ref)`.

`Sha256HashV1` is imported from `@whitebox-world/protocol` everywhere; neither World Identity nor Control Capture owns or re-exports a competing alias. `WorldBuildIdentityV1` has no embedded `contentHash`; `hashWorldBuildIdentityV1` hashes the complete parsed object. Parsing requires exact own keys, accessor-free ordinary data, a non-zero lower-case SHA-256 Package Ref whose decoded hash equals `worldPackageRootHash`, and a closed source discriminator.

### 2. Gameplay startup and Plan-independent Runtime Bootstrap

`GameplayBootstrapV1` gains one required canonical field:

```ts
readonly initialRelationshipStates:
  readonly GameplayRelationshipStateV1[];
```

The field is canonicalized by relationship `id`, rejects duplicate IDs, is included in the Gameplay Bootstrap body hash, and becomes the only owner of initial Gameplay relationship state.

Create the following sole current Runtime contract in `@whitebox-world/runtime-contracts`:

```ts
export interface WorldRuntimeInitialCameraV1 {
  readonly mode: "third-person";
  readonly cameraEntityId: string;
  readonly targetEntityId: string;
  readonly cameraRigProfileRef: string;
  readonly pitchRadians: number;
  readonly distanceMeters: number;
  readonly targetHeightMeters: number;
  readonly fovDegrees: number;
  readonly manualSwitchAllowed: boolean;
}

export interface RuntimeSubjectDescriptorV1 {
  readonly entityId: string;
  readonly subjectDefinitionRef: string;
  readonly subjectDefinitionHash: Sha256HashV1;
  readonly bodyTopology: SubjectBodyTopologyV2;
  readonly semanticClassId: string;
  readonly forwardDirection: "-z";
  readonly visualParts: readonly RuntimeSubjectVisualPartV1[];
  readonly visualBinding: RuntimeSubjectVisualBindingV1;
  readonly sockets: readonly RuntimeSubjectSocketV1[];
  readonly mountSlots: readonly RuntimeSubjectMountSlotV1[];
  readonly collider: RuntimeSubjectColliderV1;
  readonly locomotion: RuntimeSubjectLocomotionV1;
  readonly locomotionCapabilityRef: string;
  readonly locomotionCapabilityHash: Sha256HashV1;
  readonly physicsBodyProfileRef: string;
  readonly locomotionProfileRef: string;
  readonly controlFeel: RuntimeControlFeelV1;
  readonly availableControlFeels: readonly RuntimeControlFeelV1[];
  readonly capabilityAssembly: RuntimeSubjectCapabilityAssemblyV1;
}

export interface WorldRuntimeBootstrapBodyV1 {
  readonly kind: "world-runtime-bootstrap";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly gameplayBootstrapRef: string;
  readonly gameplayBootstrapHash: Sha256HashV1;
  readonly initialControlledEntityId: string;
  readonly gravityMetersPerSecondSquaredXYZ:
    readonly [number, number, number];
  readonly initialCamera: WorldRuntimeInitialCameraV1;
  readonly subjectAssets: readonly RuntimeSubjectAssetV1[];
  readonly rigProfiles: readonly RuntimeRigProfileV1[];
  readonly animationSets: readonly RuntimeAnimationSetV1[];
  readonly colliderProfiles: readonly RuntimeColliderProfileV1[];
  readonly actionPresentationRegistry:
    RuntimeActionPresentationRegistryV1;
  readonly subjectRuntimeDescriptors:
    readonly RuntimeSubjectDescriptorV1[];
  readonly runtimeResourceLockEntries:
    readonly RuntimeResourceLockEntryV1[];
}

export interface WorldRuntimeBootstrapV1
  extends WorldRuntimeBootstrapBodyV1 {
  readonly contentHash: Sha256HashV1;
}
```

The Runtime DTO names above replace the corresponding current `Execution*` Runtime-closure names with the same closed nested fields. `RuntimeSubjectDescriptorV1` is the current `ExecutionSubjectV3` field set minus `spawnAnchorEntityId`, `spawnSubjectOriginPositionMetersXYZ`, and `spawnSubjectFacingRadians`. Those three fields become Scene Source placement data. `WorldRuntimeInitialCameraV1` deliberately excludes viewport `aspectRatio`; the Babylon adapter derives aspect ratio from the active render target.

The Runtime contract exports `createWorldRuntimeBootstrapV1(body)`, `parseWorldRuntimeBootstrapV1(input)`, `hashWorldRuntimeBootstrapBodyV1(body)`, and `worldRuntimeBootstrapCanonicalBytesV1(input)`. `contentHash` is exactly the canonical body hash with `contentHash` absent. The Parser recomputes it and rejects any mismatch. Package file integrity separately hashes the full canonical artifact bytes.

### 3. Terminal Canonical Scene Plan

Replace `ExecutionPlanV5` with one current `CanonicalSceneExecutionPlanV1`:

```ts
export interface CanonicalSceneSubjectInstanceV1 {
  readonly entityId: string;
  readonly spawnAnchorEntityId: string;
  readonly subjectOriginPositionMetersXYZ:
    readonly [number, number, number];
  readonly subjectFacingRadians: number;
}

export interface CanonicalSceneExecutionPlanV1 {
  readonly kind: "worldkit-canonical-scene-execution-plan";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly seed: number;
  readonly authoringSpecHash: Sha256HashV1;
  readonly normalizedWorldIrHash: Sha256HashV1;
  readonly coordinateSystem:
    "right-handed-y-up-minus-z-forward";
  readonly atmospherePreset:
    "clear-day" | "golden-hour" | "overcast" | "night";
  readonly worldRuntimeBootstrapRef: string;
  readonly worldRuntimeBootstrapHash: Sha256HashV1;
  readonly sceneResourceLockHash: Sha256HashV1;
  readonly sceneResourceLockEntries:
    readonly CanonicalSceneResourceLockEntryV1[];
  readonly terrain: CanonicalSceneTerrainV1;
  readonly waters: readonly CanonicalSceneWaterV1[];
  readonly objects: readonly CanonicalSceneObjectV1[];
  readonly subjectInstances:
    readonly CanonicalSceneSubjectInstanceV1[];
  readonly sceneResourceUsage: Readonly<{
    vertices: number;
    triangles: number;
    colliders: number;
  }>;
  readonly layout: CanonicalSceneLayoutV1;
  readonly traversal: CanonicalSceneTraversalV1;
  readonly staticColliders:
    readonly CanonicalSceneStaticColliderV1[];
}
```

Scene resource locks retain only resources consumed by the Canonical Scene Source, currently traversal-surface profiles. Gameplay Bootstrap, Subject, Rig, Animation, Collider, Physics, Motion, Control, Feel, Locomotion, Medium, Camera, render-binding, and action-presentation locks belong only to `WorldRuntimeBootstrapV1`.

The Compiler's sole public entry becomes:

```ts
export interface CompileCanonicalWorldInputV1 {
  readonly normalizedWorldIr: NormalizedWorldIRV4;
  readonly normalizedWorldIrHash: Sha256HashV1;
  readonly gameplayBootstrap: GameplayBootstrapV1;
  readonly worldRuntimeBootstrapRef: string;
}

export type CompileCanonicalWorldResultV1 =
  | Readonly<{
      ok: true;
      canonicalSceneExecutionPlan:
        CanonicalSceneExecutionPlanV1;
      executionPlanHash: Sha256HashV1;
      worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
      diagnostics: readonly CompileDiagnostic[];
    }>
  | Readonly<{
      ok: false;
      diagnostics: readonly CompileDiagnostic[];
    }>;
```

Only `executionPlanHash` remains the Plan-specific hash name. `WorldRuntimeBootstrapV1.contentHash` is its body hash and is what `WorldBuildIdentityV1.worldRuntimeBootstrapHash` binds.

### 4. Closed Runtime Scene Source and Host input

```ts
export type NativeSceneModuleBundleRefV1 =
  `package://native-scene-module/sha256/${string}`;

export type RuntimeSceneSourceV1 =
  | Readonly<{
      kind: "canonical-execution-plan";
      executionPlan: CanonicalSceneExecutionPlanV1;
      executionPlanHash: Sha256HashV1;
    }>
  | Readonly<{
      kind: "babylon-native-scene";
      bootstrap: BabylonNativeSceneBootstrapV1;
      sceneModuleBundleRef: NativeSceneModuleBundleRefV1;
    }>;

export interface RuntimeWorldConfigurationV1 {
  readonly worldBuildIdentity: WorldBuildIdentityV1;
  readonly gameplayBootstrap: GameplayBootstrapV1;
  readonly worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
  readonly sceneSource: RuntimeSceneSourceV1;
}
```

Runtime configuration parsing closes both union members and rejects cross-source fields. BNA-1 formal admission then checks the common and Canonical links it can authoritatively prove:

- Package Ref decodes to `worldPackageRootHash`;
- Gameplay Bootstrap ref/hash equals the Runtime Bootstrap link and World Build Identity hash;
- `initialControlledEntityId` names exactly one Runtime Subject;
- Canonical Plan ref/hash equals the Runtime Bootstrap ref/hash and Canonical source identity;
- no Scene Source can carry fields from the other union member.

For `kind: "babylon-native-scene"`, BNA-1 returns `WORLDKIT_NATIVE_SCENE_PRODUCTION_NOT_ADMITTED` before Bundle resolution, adapter invocation, or Candidate allocation. BNA-4, after BNA-3, must add the deferred checks: Native Bootstrap/Module Bundle hashes equal the Native source identity; Native Bootstrap controlled entity, gravity, and camera composition equal Runtime Bootstrap; final Contribution hash equals the receipt-bound World Build Identity; and every admitted surface passes the frozen Gameplay Surface policy. BNA-1 tests these as future contract fixtures only, not as live admission behavior.

`RuntimeWorldAdapterDescriptorV1` no longer carries a mandatory Plan. During BNA-1, RuntimeHost creates it only from the admitted Canonical member and carries the same parsed `worldBuildIdentity`, `worldRuntimeBootstrap`, and Canonical source. `WorldSessionCreateOptionsV1` carries the full `worldBuildIdentity`. `WorldStateSnapshotV1` and other durable generic output contracts carry `worldPackageRef`, `worldPackageRootHash`, and `worldBuildIdentityHash`, not a generic Plan hash.

### 5. Scene Authoring Route and Attempt contracts

Create `@whitebox-world/scene-authoring-contracts`, depending only on `@whitebox-world/protocol` and `lodash-es`.

```ts
export interface SceneAuthoringRouteDecisionV1 {
  readonly kind: "scene-authoring-route-decision";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly sceneBriefRef: string;
  readonly sceneBriefHash: Sha256HashV1;
  readonly trustProfileRef: string;
  readonly trustProfileHash: Sha256HashV1;
  readonly requiredCapabilityRefs: readonly string[];
  readonly decision:
    | Readonly<{
        kind: "canonical";
        authoringProfileRef: string;
        reasonCodes: readonly SceneAuthoringRouteReasonCodeV1[];
      }>
    | Readonly<{
        kind: "babylon-native";
        authoringProfileRef: string;
        compositionStrategy:
          | "ground-first"
          | "ground-first-with-locked-assets";
        reasonCodes: readonly SceneAuthoringRouteReasonCodeV1[];
      }>
    | Readonly<{
        kind: "capability-gap";
        unsupportedCapabilityRefs: readonly string[];
        reasonCodes: readonly SceneAuthoringRouteReasonCodeV1[];
      }>;
}

export type SceneAuthoringRouteReasonCodeV1 =
  | "canonical-default"
  | "native-production-not-released"
  | "hosted-native-not-admitted"
  | "requires-canonical-route"
  | "requires-world-change-set"
  | "requires-deterministic-layout"
  | "reference-driven-distinctive-silhouette"
  | "unsupported-enclosed-topology"
  | "unsupported-dynamic-multilayer-surface"
  | "user-selected-supported-lane";
```

`SceneAuthoringAttemptV1` and `SceneAuthoringAttemptResultV1` use the exact field shapes in Spec section 6.5, with every `...Hash` typed as `Sha256HashV1`, Seed restricted to unsigned 32-bit without signed zero, exact-key discriminated unions, canonical sorted/deduplicated assets and refs, and completed versus rejected/tool-error result members that cannot share output fields.

Route parsing also enforces branch semantics: `capability-gap` requires at least one unsupported capability; Native-only composition strategies cannot appear outside the Native member; `native-production-not-released` and `hosted-native-not-admitted` cannot accompany a Native selection; and `requires-canonical-route`, `requires-world-change-set`, or `requires-deterministic-layout` cannot accompany a Native selection.

The package exports strict parsers, canonical byte functions, and whole-object hash functions for all three contracts. It also exports `firstInvalidatedSceneAuthoringGateV1(previous, next)`, returning exactly one of:

```ts
type SceneAuthoringInvalidatedGateV1 =
  | "none"
  | "route-decision"
  | "source-authoring";
```

The comparison is fail-closed. A changed Route Decision returns `route-decision`. A changed Canonical/Native source input, selected published asset, Seed, authoring Profile, acceptance target, or required evidence Profile returns `source-authoring`. Evidence Profiles do not yet declare a machine-readable earliest safe replay gate, so BNA-1 must not infer `runtime-replay`; that optimization requires a later closed Profile contract and a new reviewed change. Identical parsed attempts return `none`. Any non-`none` result invalidates Package build and all later scene evidence; `source-authoring` also invalidates the previous authored Source. Independently published asset receipts remain reusable only when their exact ref/hash tuple is unchanged.

## Dependency-aware work graph

| ID | Goal and independently verifiable deliverable | depends_on | blocks | Exclusive owner | Execution mode |
|---|---|---|---|---|---|
| BNA1-00 | Freeze baseline and exact generic-vs-Plan-specific hash census | accepted Foundation plus its review-fix checkpoint | BNA1-01, BNA1-02, BNA1-03, BNA1-04, BNA1-05, BNA1-06, BNA1-07, BNA1-08, BNA1-09A, BNA1-09B, BNA1-09C, BNA1-09D, BNA1-10 | census review and BNA-1 ledger | `main-agent-only` |
| BNA1-01 | Move SHA-256 type and Package Ref to their source-neutral owners; add World Build Identity | BNA1-00 | BNA1-02, 06, 07, 09A | `packages/protocol/`, `packages/world-identity/`, and the migrated hash/ref symbols | `main-agent-only` |
| BNA1-02 | Freeze Gameplay startup and World Runtime Bootstrap contracts | BNA1-01 | BNA1-04, BNA1-05, BNA1-06, BNA1-07, BNA1-08, BNA1-09A, BNA1-09B, BNA1-09C, BNA1-09D | Gameplay startup fields and Runtime Bootstrap DTOs | `main-agent-only` |
| BNA1-03 | Freeze Route Decision and fail-closed Authoring Attempt invalidation | BNA1-01 | BNA1-09D, 10 | `packages/scene-authoring-contracts/` | `main-agent-only` |
| BNA1-04 | Prove exact V5-to-Bootstrap/Scene projection on the feature branch | BNA1-02 | BNA1-05 | temporary migration projector and receipt evidence | `main-agent-only` |
| BNA1-05 | Replace ExecutionPlanV5 with the terminal Canonical Scene Plan and compiler result | BNA1-04 | BNA1-06, BNA1-07, BNA1-08, BNA1-09A, BNA1-09B, BNA1-09C, BNA1-09D, BNA1-10 | Compiler and Canonical Scene Plan contract | `main-agent-only` |
| BNA1-06 | Collapse WorldPackage to one current Canonical contract and post-root identity receipt | BNA1-01, BNA1-05 | BNA1-07, 09A..09D, 10 | `packages/world-package/` | `main-agent-only` |
| BNA1-07 | Migrate Canonical RuntimeHost/WorldSession identity and reject formal Native admission before allocation | BNA1-02, BNA1-05, BNA1-06 | BNA1-08, BNA1-09A, BNA1-09B, BNA1-09C, BNA1-09D, BNA1-10 | RuntimeHost/Session and generic state identity | `main-agent-only` |
| BNA1-08 | Split Babylon scene construction from the shared Kernel and remove the experimental Native shadow Plan without activating RuntimeHost Native admission | BNA1-07 | BNA1-09A, 10 | Runtime Babylon construction/Kernel boundary and Native playground experiment | `main-agent-only` |
| BNA1-09A | Migrate generic Runtime, Browser, Capture, and Take protocol identities | BNA1-05..08 | BNA1-09B | `runtime-contracts`, Control Capture, Simulation Take, and generic browser DTOs | `main-agent-only` |
| BNA1-09B | Migrate generic Validation, CLI, and Studio transports | BNA1-09A | BNA1-09C | Validation DTOs, CLI serializers, and Studio persistence | `main-agent-only` |
| BNA1-09C | Migrate Canonical Route/Edit consumers while retaining explicit Plan identity | BNA1-09B | BNA1-09D | Authoring Edit/Host and Route-specific contracts/orchestration | `main-agent-only` |
| BNA1-09D | Integrate Playground/orchestration call sites and regenerate classified fixtures | BNA1-03, BNA1-09C | BNA1-10 | app adapters, workflow orchestration, verification fixtures, and generated consumer evidence | `main-agent-only` |
| BNA1-10 | Rebuild evidence, run all gates, prove zero legacy census, review, and publish the BNA-1 checkpoint | BNA1-03, BNA1-08, BNA1-09D | BNA-3, BNA-4, BNA-7, BNA-8 | generated evidence and final review truth | `main-agent-only` |

Shared resources (`pnpm-lock.yaml`, root `package.json`, `tsconfig.json`, and `scripts/lib/test-gate-manifest.ts`) are owned by the main agent for the entire sequence. No task may overlap another task's edits, generated artifacts, Vite process, Browser session, or Git index.

---

### Task BNA1-00: Freeze the baseline and migration census

**Goal:** Make the migration scope auditable before changing contracts.

**Deliverable:** A review that classifies every current `executionPlanHash`, `ExecutionPlanV5`, compiler, Package, Runtime, Browser, Capture, Take, Validation, CLI, Studio, artifact, and fixture consumer as either Plan-specific-retain, generic-migrate, or legacy-delete.

**Files:**

- Create: `docs/reviews/2026-08-29-bna1-runtime-identity-consumer-census.md`
- Create: `.superpowers/sdd/2026-08-29-babylon-native-runtime-identity-clean-break/progress.md`
- Inspect only: `packages/**`, `apps/**`, `scripts/**`, `examples/**`, `artifacts/scenes/**`

**Input / output contract:** Exact accepted Foundation plus review-fix tree at BNA1-00 execution start -> source and generated-evidence census with an owner and terminal field disposition for every hit. Record the actual starting SHA; `1054f49` is the Foundation acceptance commit, not a substitute for the later reviewed tree.

**Integration point:** This review becomes the checklist consumed by BNA1-09A through BNA1-09D and the zero-census verifier in BNA1-10.

- [ ] Record `git status --short --branch`, `git rev-parse HEAD`, `git merge-base --is-ancestor origin/main HEAD`, and the retained Task 5 stash hash without modifying the stash.
- [ ] Run `rg -n` for `ExecutionPlanV5`, `compileWorldV5`, `parseExecutionPlanV5`, `hashExecutionPlanV5`, `executionPlanHash`, `RuntimeWorldConfigurationV1`, `WorldStateSnapshotV1`, `WorldPackageBuildReceiptV1`, and `WorldPackageBuildReceiptV2` across the scoped roots.
- [ ] Classify Plan-specific retention narrowly: Canonical Authoring Edit, Canonical Plan/Package verification, Route R1/R1B inputs and evidence, and Canonical Plan compiler outputs. Everything else migrates to `worldBuildIdentity` or `worldBuildIdentityHash`.
- [ ] Record the exact generated artifacts that must be regenerated rather than hand-edited.
- [ ] Verify the exported `babylon-native-scene-bootstrap-v1.schema.json` compiles under Draft 2020-12, its parity/signed-zero tests pass, and no second Native Bootstrap wire schema exists.
- [ ] Record both declared dependency ranges and lock-resolved TypeScript/Vite/Vitest/Babylon/Havok versions.
- [ ] Review the work graph for ownership overlap and append any main-agent ruling to the SDD ledger before implementation.
- [ ] Run `git diff --check` and commit:

```bash
git add docs/reviews/2026-08-29-bna1-runtime-identity-consumer-census.md .superpowers/sdd/2026-08-29-babylon-native-runtime-identity-clean-break/progress.md
git commit -m "docs: freeze BNA-1 identity migration census"
```

---

### Task BNA1-01: Add the source-neutral World Build Identity owner

**Goal:** Give Package, Runtime, Gameplay, and output protocols one dependency-safe world identity.

**Deliverable:** `@whitebox-world/world-identity` with the exact contracts and functions frozen above; all World Package Ref consumers import this sole owner.

**Files:**

- Create: `packages/protocol/src/hash.ts`
- Modify: `packages/protocol/src/index.ts`
- Modify: `packages/control-capture/src/types.ts`
- Modify: every current `Sha256HashV1` consumer found by BNA1-00
- Create: `packages/world-identity/package.json`
- Create: `packages/world-identity/src/index.ts`
- Create: `packages/world-identity/src/world-build-identity.ts`
- Create: `packages/world-identity/src/world-build-identity.test.ts`
- Modify: every current `WorldPackageRefV1`, `worldPackageRefFromRootHashV1`, and `worldPackageRootHashFromRefV1` consumer found by BNA1-00
- Modify: package manifests for direct dependency declarations
- Modify: `pnpm-lock.yaml`
- Modify: `scripts/lib/test-gate-manifest.ts`
- Delete ownership from: `packages/world-package/src/store.ts` and `packages/world-package/src/index.ts`

**Input / output contract:** One protocol-owned SHA-256 branded string type plus accessor-free unknown data -> frozen `WorldBuildIdentityV1`, canonical bytes, or stable rejection; Package Root hash <-> content-addressed Package Ref.

**Integration point:** WorldPackage receipt derivation and Runtime Candidate configuration.

- [ ] Write a RED ownership test proving `Sha256HashV1` is exported only by Protocol and that Control Capture has no local definition or re-export. Write Identity RED tests for exact keys, both source members, canonical hashes, deep freeze, Package Ref/root equality, unknown/missing keys, accessor/symbol/prototype objects, zero/upper-case/malformed hashes, wrong discriminators, cross-source fields, and Native contribution hash mismatch data.
- [ ] Run `pnpm vitest run packages/world-identity/src/world-build-identity.test.ts` and record the missing-package RED.
- [ ] Move `Sha256HashV1` to Protocol and update all imports in one current-only pass; delete the Control Capture definition without an alias. Implement the minimal identity package and parser without importing WorldPackage, Runtime, Gameplay, Babylon, Havok, DOM, Node file-system, or network modules.
- [ ] Update every Package Ref import in the same commit; remove its public export from WorldPackage rather than re-exporting it.
- [ ] Add a package-boundary test proving the low-level dependency direction and register both tests as contract tests.
- [ ] Run the focused tests, `pnpm verify:workspace-boundaries`, and `pnpm typecheck`.
- [ ] Commit:

```bash
git add packages/protocol packages/control-capture packages/world-identity packages/world-package packages/runtime-host packages/authoring-host apps scripts pnpm-lock.yaml
git commit -m "feat(identity): add source-neutral world build identity"
```

---

### Task BNA1-02: Separate Gameplay startup from Runtime closure

**Goal:** Freeze the one shared Kernel input before changing either Scene Source.

**Deliverable:** `GameplayBootstrapV1.initialRelationshipStates`, `WorldRuntimeBootstrapV1`, its nested Runtime DTOs, exact Parser/body hash/canonical bytes, and no Scene geometry fields.

**Files:**

- Modify: `packages/gameplay-contracts/src/gameplay-artifacts.ts`
- Modify: `packages/gameplay-contracts/src/gameplay-contracts.test.ts`
- Modify: `packages/gameplay-contracts/src/index.ts`
- Create: `packages/runtime-contracts/src/world-runtime-bootstrap.ts`
- Create: `packages/runtime-contracts/src/world-runtime-bootstrap.test.ts`
- Create: `packages/runtime-contracts/src/world-runtime-bootstrap-v1.schema.json`
- Modify: `packages/runtime-contracts/src/index.ts`
- Modify: `packages/runtime-contracts/package.json`
- Modify: all Gameplay Bootstrap fixture factories found by BNA1-00
- Modify: `scripts/lib/test-gate-manifest.ts`

**Input / output contract:** Parsed Gameplay Bootstrap + closed Runtime Bootstrap body -> content-hashed, deeply frozen Runtime Bootstrap whose Gameplay ref/hash and controlled entity are exact.

**Integration point:** Compiler output, formal Canonical RuntimeHost admission, and Babylon Gameplay Kernel construction; the trusted-local Native experiment consumes the same artifact outside RuntimeHost until BNA-4.

- [ ] Add Gameplay Bootstrap RED cases for missing/unknown `initialRelationshipStates`, duplicate IDs, noncanonical order, relationship accessors, and body-hash mismatch. Prove `createGameplayBootstrapV1` includes the field in `contentHash`.
- [ ] Add Runtime Bootstrap RED tests for the frozen top-level JSON Schema and every nested DTO; compile the Schema under Draft 2020-12 and require schema/parser parity over accepted and rejected serialized cases. Explicitly reject `terrain`, `waters`, `objects`, `staticColliders`, `layout`, `traversal`, Provider handles, Babylon objects, Havok objects, duplicate Subject IDs, an absent controlled Subject, and a mismatched Gameplay ref/hash.
- [ ] Run both focused files and record the expected RED.
- [ ] Move/rename the Runtime-owned nested DTO definitions from `execution-plan.ts` into `world-runtime-bootstrap.ts` without temporary re-exports. Keep current behavior fields byte-equivalent except the three placement fields and camera aspect ratio removed by the frozen contract.
- [ ] Implement exact parser/canonical ordering, `hashWorldRuntimeBootstrapBodyV1`, `createWorldRuntimeBootstrapV1`, and full-artifact canonical bytes. Recompute and reject a stale `contentHash`.
- [ ] Update fixture factories in one mechanical pass; initial relationships come from the previous Plan fixture relationship list, not an empty default unless that fixture truly has none.
- [ ] Run focused tests, Runtime contract tests, Gameplay contract tests, workspace boundaries, and typecheck.
- [ ] Commit:

```bash
git add packages/gameplay-contracts packages/runtime-contracts scripts apps packages pnpm-lock.yaml
git commit -m "feat(runtime-contracts): add plan-independent runtime bootstrap"
```

---

### Task BNA1-03: Freeze Scene Authoring route and attempt identity

**Goal:** Prevent silent Lane/strategy/asset switching from reusing stale world evidence.

**Deliverable:** `@whitebox-world/scene-authoring-contracts` with the exact Route Decision, Attempt, Result, hashing, and invalidation contracts frozen above.

**Files:**

- Create: `packages/scene-authoring-contracts/package.json`
- Create: `packages/scene-authoring-contracts/src/index.ts`
- Create: `packages/scene-authoring-contracts/src/scene-authoring-contracts.ts`
- Create: `packages/scene-authoring-contracts/src/scene-authoring-contracts.test.ts`
- Create: `packages/scene-authoring-contracts/src/package-boundary.test.ts`
- Modify: `pnpm-lock.yaml`
- Modify: `scripts/lib/test-gate-manifest.ts`

**Input / output contract:** Scene Brief/trust/capability decision and immutable source inputs -> canonical Route/Attempt/Result hashes and the first invalidated scene gate.

**Integration point:** BNA-1 records the contracts; orchestration consumes them in BNA-3/BNA-6. They do not enter Runtime Scene construction.

- [ ] Write RED tests for all discriminators, exact keys, canonical sorting, duplicate asset/ref rejection, uint32 Seed, completed-versus-failure exclusivity, and accessor/symbol/prototype rejection.
- [ ] Add table-driven invalidation RED tests proving: Lane decision -> `route-decision`; Canonical input, Native Bootstrap input, Native module-generation input, published asset selection, Seed, Profile, acceptance target, or evidence-profile-only change -> `source-authoring`; exact equality -> `none`. Assert that `runtime-replay` is not a public member until a future evidence Profile declares its earliest safe gate.
- [ ] Run the focused tests and record the missing-package RED.
- [ ] Implement without importing Authoring, Compiler, Runtime, Babylon, WorldPackage, Provider, or Asset Production packages.
- [ ] Assert a rejected/tool-error result cannot carry `authoredSourceRef`, `authoredSourceHash`, or `evidenceRefs`; a completed result cannot carry diagnostics.
- [ ] Run focused tests, workspace boundaries, and typecheck.
- [ ] Commit:

```bash
git add packages/scene-authoring-contracts scripts/lib/test-gate-manifest.ts pnpm-lock.yaml
git commit -m "feat(authoring): add scene route and attempt identity"
```

---

### Task BNA1-04: Establish the one-time V5 exact-equality projection gate

**Goal:** Prove the contract split preserves every existing Canonical Runtime fact before deleting the old owner.

**Deliverable:** A feature-branch-only projector plus a durable receipt showing that every current V5 Runtime closure and Scene field maps exactly once into the two terminal artifacts.

**Files:**

- Create temporarily: `packages/compiler/src/project-execution-plan-v5.ts`
- Create temporarily: `packages/compiler/src/project-execution-plan-v5.test.ts`
- Create: `artifacts/bna-1/execution-plan-v5-projection-receipt.json`
- Create: `docs/reviews/2026-08-29-bna1-v5-projection-review.md`
- Modify: `scripts/lib/test-gate-manifest.ts`

**Input / output contract:** Parsed `ExecutionPlanV5` + exact Gameplay Bootstrap -> projected `CanonicalSceneExecutionPlanV1` + `WorldRuntimeBootstrapV1`, with a field-accounting map and no dropped/duplicated authority.

**Integration point:** Migration evidence only. The projector and its test are deleted in BNA1-05; only the receipt and review remain.

- [ ] Write a RED projection test over asymmetric fixtures: nonzero gravity, nondefault camera, rigged Subject, multiple control feels, relationship state, water, static collider, traversal surface, layout placement, and resource locks.
- [ ] Require an explicit field-accounting table in the test: each V5 top-level field maps to Scene Plan, Runtime Bootstrap, Gameplay Bootstrap, derived metadata, or deliberate deletion (`runtimeBackend`, viewport `aspectRatio`) with a reason.
- [ ] Run the focused test and record the missing-projector RED.
- [ ] Implement the smallest internal projector and prove exact equality for nested Runtime DTOs, Subject placement, initial relationships, lock partitioning, and canonical hashes.
- [ ] Generate the receipt from the passing test inputs. Record source commit, V5 hash, projected hashes, field accounting, fixture IDs, and command output; do not invent values.
- [ ] Run focused tests, compiler tests, Runtime contract tests, and typecheck.
- [ ] Commit the intermediate migration checkpoint with an explicit non-acceptance note in the review:

```bash
git add packages/compiler artifacts/bna-1 docs/reviews/2026-08-29-bna1-v5-projection-review.md scripts/lib/test-gate-manifest.ts
git commit -m "test(compiler): prove BNA-1 V5 projection equality"
```

---

### Task BNA1-05: Replace V5 with the terminal Canonical Scene Plan

**Goal:** Make the compiler emit two non-overlapping current artifacts and delete the transitional/legacy contract.

**Deliverable:** `compileCanonicalWorldV1`, `CanonicalSceneExecutionPlanV1`, and no executable V5 type/parser/compiler/projector.

**Files:**

- Create: `packages/runtime-contracts/src/canonical-scene-execution-plan.ts`
- Create: `packages/runtime-contracts/src/canonical-scene-execution-plan.test.ts`
- Modify: `packages/runtime-contracts/src/index.ts`
- Modify: `packages/compiler/src/compile.ts`
- Modify: `packages/compiler/src/compile.test.ts`
- Modify: `packages/compiler/src/compile-traversal-lock.ts`
- Modify: all compiler and Canonical Plan test fixtures from the BNA1-00 census
- Delete: `packages/runtime-contracts/src/execution-plan.ts`
- Delete: `packages/compiler/src/compile-v5.test.ts`
- Delete: `packages/compiler/src/project-execution-plan-v5.ts`
- Delete: `packages/compiler/src/project-execution-plan-v5.test.ts`
- Modify: `scripts/lib/test-gate-manifest.ts`

**Input / output contract:** `NormalizedWorldIRV4` + exact Gameplay Bootstrap + Runtime Bootstrap ref -> one Scene Plan, one Runtime Bootstrap, their independent hashes, or closed diagnostics.

**Integration point:** Canonical pipeline and WorldPackage build input.

- [ ] Write terminal RED tests asserting the exact Scene Plan key set, the exact Runtime Bootstrap key set, matching bootstrap ref/hash, relationship ownership in Gameplay Bootstrap, placement ownership in Scene Plan, and the absence of all forbidden duplicate fields.
- [ ] Add asymmetric compiler regressions matching BNA1-04 and assert the new artifacts' canonical hashes equal the projection receipt.
- [ ] Run focused tests and record RED against `compileWorldV5`/old Plan output.
- [ ] Refactor the compiler to build a Runtime descriptor and Scene placement from the same normalized Subject in one pass; no later adapter may rejoin them into a serialized shadow Plan.
- [ ] Partition resource locks by owner, recompute both lock hashes, and fail on a resource present in both partitions or neither required partition.
- [ ] Rename all Runtime nested types to their sole Runtime DTO names and all Scene nested types to their sole Canonical Scene names. Update consumers directly; add no alias/re-export.
- [ ] Delete V5 compiler/types/parser/hash/projector and remove their test-gate entries in the same commit.
- [ ] Run Canonical Scene Plan, Runtime Bootstrap, compiler, traversal-lock, authoring-normalization, and typecheck gates.
- [ ] Run a source census proving `ExecutionPlanV5|compileWorldV5|parseExecutionPlanV5|hashExecutionPlanV5|projectExecutionPlanV5` appears only in historical docs/reviews and the immutable projection receipt.
- [ ] Commit:

```bash
git add packages/runtime-contracts packages/compiler packages/authoring packages/traversal scripts artifacts/bna-1
git commit -m "refactor(compiler): split scene plan from runtime bootstrap"
```

---

### Task BNA1-06: Collapse WorldPackage and bind post-root identity

**Goal:** Package the two Canonical artifacts without self-referential identity metadata or parallel Package versions.

**Deliverable:** One current Canonical WorldPackage contract, directory verifier, store, and receipt with post-root `worldBuildIdentity`/hash.

**Files:**

- Create: `packages/world-package/src/package-contract.ts`
- Create: `packages/world-package/src/package-contract.test.ts`
- Create: `packages/world-package/src/package-build.ts`
- Create: `packages/world-package/src/package-build.test.ts`
- Create: `packages/world-package/src/package-directory.ts`
- Create: `packages/world-package/src/package-directory.test.ts`
- Modify: `packages/world-package/src/index.ts`
- Modify: `packages/world-package/src/store.ts`
- Modify: `packages/world-package/src/store.test.ts`
- Modify: `packages/world-package/src/testing.ts`
- Delete: `packages/world-package/src/types.ts`
- Delete: `packages/world-package/src/build-receipt.ts`
- Delete: `packages/world-package/src/build-receipt.test.ts`
- Delete: `packages/world-package/src/manifest.ts`
- Delete: `packages/world-package/src/manifest.test.ts`
- Delete: `packages/world-package/src/v2-types.ts`
- Delete: `packages/world-package/src/v2-contract.ts`
- Delete: `packages/world-package/src/v2-contract.test.ts`
- Delete: `packages/world-package/src/v2-build.ts`
- Delete: `packages/world-package/src/v2-build.test.ts`
- Delete: `packages/world-package/src/v2-directory.ts`
- Delete: `packages/world-package/src/v2-directory.test.ts`
- Modify: all WorldPackage consumers and fixtures from BNA1-00
- Modify: `scripts/lib/test-gate-manifest.ts`

**Input / output contract:** Canonical Authoring/IR/Scene Plan, Gameplay Bootstrap, Runtime Bootstrap, Registry/resource files, and legal/host policy -> root-bound Package directory -> Package Root/Ref -> post-root World Build Identity -> receipt transport metadata.

**Integration point:** File/IndexedDB stores, Runtime load, authoring publication, CLI build, and validation subject.

- [ ] Write RED tests for one current manifest/receipt key set and entry points `targets/babylon-web/canonical-scene-execution-plan.json`, `gameplay/bootstrap.json`, and `runtime/world-runtime-bootstrap.json`.
- [ ] Assert manifest hashes match parsed files, Plan-to-Runtime-Bootstrap links match, Gameplay-to-Runtime links match, and the Canonical `sceneSourceIdentity.executionPlanHash` matches the Plan file.
- [ ] Assert root inventory excludes exactly `integrity.json`, `world-package-build-receipt.json`, and `world-build-identity.json`; adding any of them to the root inventory must fail.
- [ ] Assert verifier recomputes root, Package Ref, component hashes, World Build Identity, and identity hash from root-bound files and compares byte-exact transport metadata.
- [ ] Run focused tests and record RED against the current V1/V2 split.
- [ ] Implement one current contract using `schemaVersion: 1` and `packageFormatVersion: 1`. This is the sole unreleased contract, not a migration target.
- [ ] Delete V1-to-V2 migration types/functions/tests and all old/v2 public exports. Update all consumers directly in the same commit.
- [ ] Keep Native WorldPackage rejected with a stable capability diagnostic; BNA-3 adds its formal package member later.
- [ ] Run WorldPackage focused tests, stores, authoring-host publication/recovery tests, validation-subject tests, workspace boundaries, and typecheck.
- [ ] Run a source census proving the deleted Package versions, migration, and old paths have zero executable/source consumers.
- [ ] Commit:

```bash
git add packages/world-package packages/authoring-host packages/validation apps scripts pnpm-lock.yaml
git commit -m "refactor(package): bind source-neutral world identity"
```

---

### Task BNA1-07: Make Canonical RuntimeHost and WorldSession identity source-neutral

**Goal:** Validate one identity/Bootstrap closure for the Canonical member at Candidate creation, remove Plan identity from generic state, and keep formal Native admission fail-closed until BNA-3/BNA-4.

**Deliverable:** Closed `RuntimeWorldConfigurationV1`, Canonical adapter descriptor, WorldSession identity, Snapshot identity hash, atomic mismatch rejection, and a stable pre-allocation capability rejection for the parsed Native member.

**Files:**

- Modify: `packages/runtime-host/src/runtime-host.ts`
- Modify: `packages/runtime-host/src/runtime-host-lifecycle.test.ts`
- Modify: `packages/runtime-host/src/world-session.ts`
- Modify: `packages/runtime-host/src/world-session.test.ts`
- Modify: `packages/runtime-host/src/world-session-fixed-actions.test.ts`
- Modify: `packages/runtime-host/src/world-session-mounted.test.ts`
- Modify: `packages/runtime-host/src/world-state-artifact-store.ts`
- Modify: `packages/runtime-host/src/world-state-artifact-store.test.ts`
- Modify: `packages/runtime-host/src/gameplay-world-port.ts`
- Modify: `packages/gameplay/src/gameplay-state.ts`
- Modify: `packages/gameplay/src/gameplay-state.test.ts`
- Modify: `packages/gameplay-contracts/src/gameplay-contracts.ts`
- Modify: `packages/gameplay-contracts/src/gameplay-contracts.test.ts`
- Modify: RuntimeHost lifecycle harnesses and direct package manifests

**Input / output contract:** Parsed World Build Identity + Gameplay Bootstrap + Runtime Bootstrap + exactly one Scene Source -> Canonical Candidate descriptor and WorldSession publication, or stable rejection before current-world mutation. A Native member always returns `WORLDKIT_NATIVE_SCENE_PRODUCTION_NOT_ADMITTED` before adapter invocation or Candidate allocation in BNA-1.

**Integration point:** `RuntimeHost.create`, Candidate load/create, replacement preflight, publication barrier, rollback, Snapshot publication, and activity fencing.

- [ ] Add Canonical Runtime admission RED tests for every cross-hash/ref mismatch, wrong source member, missing controlled Subject, duplicate Runtime Subject, mismatched Gameplay entity definition, and forged Package Ref/root. Add a Native member RED proving stable `WORLDKIT_NATIVE_SCENE_PRODUCTION_NOT_ADMITTED`, zero adapter calls, zero Candidate allocation, and no fake Plan hash.
- [ ] Add WorldSession/Snapshot RED tests proving `executionPlanHash` is rejected as an unknown generic field and `worldBuildIdentityHash` is required and immutable.
- [ ] Add atomic replacement regressions: malformed identity, Canonical adapter throw, and publication-gate throw must dispose only the Candidate and preserve current Session identity/state. Native contribution/Receipt mismatch belongs to BNA-4 after BNA-3 provides formal identity.
- [ ] Run focused tests and record RED.
- [ ] Parse/freeze the three inputs once; publish `worldBuildIdentityHash` from the parsed identity. Do not let adapter or gameplay layers independently reconstruct identity.
- [ ] Initialize Session relationships only from parsed `gameplayBootstrap.initialRelationshipStates`.
- [ ] Pass full identity to admitted Canonical session creation and only its canonical hash to generic durable state/projection fields. Parse the Native union member but terminate at the explicit capability gate; do not construct a partial Native adapter descriptor.
- [ ] Preserve fixed-Tick, action, camera, support, reset, activity lease, and rollback owners exactly; apply the runtime deep-review checklist.
- [ ] Run RuntimeHost, WorldSession, Gameplay state, character transaction, activity, state store, workspace boundaries, and typecheck gates.
- [ ] Commit:

```bash
git add packages/runtime-host packages/gameplay packages/gameplay-contracts packages/world-identity scripts/lib/test-gate-manifest.ts pnpm-lock.yaml
git commit -m "refactor(runtime): admit source-neutral world configuration"
```

---

### Task BNA1-08: Remove the experimental Babylon Native shadow Plan

**Goal:** Use one shared Gameplay Kernel while keeping Scene Source-specific construction isolated, without turning the trusted-local experiment into formal RuntimeHost admission.

**Deliverable:** Canonical scene construction consumes only Canonical Scene Plan; Kernel/Subject/Physics/Control/Camera consume only Runtime Bootstrap; the trusted-local Native playground experiment consumes parsed Native Bootstrap and admitted Contribution without a shadow Plan. Formal RuntimeHost Native admission remains the BNA1-07 capability rejection.

**Files:**

- Modify: `packages/runtime-babylon/src/babylon-world-runtime.ts`
- Modify: `packages/runtime-babylon/src/runtime.test.ts`
- Modify: `packages/runtime-babylon/src/subject-visual.ts`
- Modify: `packages/runtime-babylon/src/babylon-character-entity.ts`
- Modify: `packages/runtime-babylon/src/character-movement-component.ts`
- Modify: `packages/runtime-babylon/src/motion-kernel-runtime.ts`
- Modify: `packages/runtime-babylon/src/traversal-runtime-port.ts`
- Modify: `packages/runtime-babylon/src/camera-preview-channel.ts`
- Modify: all affected Runtime Babylon conformance tests
- Modify: `apps/native-scene-playground/src/main.ts`
- Create: `apps/native-scene-playground/src/cloud-ridge-world-runtime-bootstrap.json`
- Create: `apps/native-scene-playground/src/native-scene-source-clean-break.test.ts`
- Modify: `apps/native-scene-playground/src/cloud-ridge-scene.test.ts`
- Modify: `apps/native-scene-playground/package.json`
- Modify: `scripts/lib/test-gate-manifest.ts`

**Input / output contract:** Canonical Runtime adapter descriptor -> Candidate Babylon Scene plus shared Kernel. Separately, the explicit trusted-local playground harness -> experimental Native Candidate plus the same Kernel input. Neither path serializes a combined shadow Plan, and the experiment cannot produce a formal WorldPackage/WorldBuild admission result.

**Integration point:** `BabylonWorldRuntime.create`, Candidate Scene construction, the existing experimental Native option, and SDK-owned Havok/Subject/Camera attachment. RuntimeHost Native activation is explicitly outside this task.

- [ ] Write a structural RED test proving Native playground/runtime source files contain no `ExecutionPlan`, Canonical compiler import, fake Plan factory, or Plan hash; Canonical builder contains no Runtime Subject/Camera/Gravity reads.
- [ ] Add behavior RED tests for Canonical placement + Runtime descriptor assembly and experimental Native Spawn Marker + the same Runtime descriptor assembly.
- [ ] Add a boundary RED proving RuntimeHost still rejects the Native member before reaching Babylon, while the explicitly labeled trusted-local playground harness can exercise the existing Host contribution path. Do not add WorldBuild contribution-hash admission before BNA-3/BNA-4.
- [ ] Run focused tests and record RED.
- [ ] Split environment building from Kernel initialization. The Kernel stores `worldRuntimeBootstrap`, not a Plan. Canonical placement is joined by `entityId` at construction time without serializing a combined object; Native V1 placement comes from its one registered Spawn Marker.
- [ ] Replace Cloud Ridge's cloned G Bot Plan with a checked-in, parsed Runtime Bootstrap artifact plus its exact Gameplay Bootstrap. Generate it through the accepted Canonical compiler projection once; do not load a Canonical Plan at Native runtime and do not route the experiment through formal RuntimeHost.
- [ ] Keep the existing Native API, Host registration, Contribution, SDK Havok, collision proxy, and Cloud Ridge visual geometry unchanged except for required type names/wiring.
- [ ] Prove experimental movement, collision, jump/landing, camera orbit/reset, deterministic geometry, contribution hash, partial construction cleanup, and two-instance isolation. Label this as experiment preservation evidence, not BNA-4 admission evidence.
- [ ] Run all Runtime Babylon tests, Native package tests, Native playground tests, typecheck, `pnpm build`, and `pnpm build:native-scene`.
- [ ] Commit:

```bash
git add packages/runtime-babylon apps/native-scene-playground packages/runtime-contracts scripts/lib/test-gate-manifest.ts
git commit -m "refactor(babylon): share kernel across scene sources"
```

---

### Task BNA1-09A: Migrate generic Runtime, Browser, Capture, and Take protocols

**Goal:** Remove generic Plan identity from protocol DTOs before touching transports or Canonical-only operations.

**Deliverable:** Runtime Session, Browser state, Capture targets/results, Control Capture, and Simulation Take value contracts require `worldBuildIdentityHash`; their parsers reject generic `executionPlanHash`.

**Files:**

- Modify: `packages/runtime-contracts/src/runtime-session.ts`
- Modify: `packages/runtime-contracts/src/runtime-session-protocol.ts`
- Modify: `packages/runtime-contracts/src/capture-targets.ts`
- Modify: `packages/runtime-contracts/src/browser-route-evidence.ts` only for generic Browser evidence envelopes
- Modify: corresponding Runtime contract tests
- Modify: `packages/control-capture/**`
- Modify: `scripts/lib/control-capture-bundle.ts`
- Modify: `scripts/lib/headless-runtime-session.ts`
- Modify: Simulation Take value-contract helpers identified by BNA1-00; exclude CLI framing
- Modify: `scripts/lib/test-gate-manifest.ts`

**Input / output contract:** Generic Runtime publication -> exact `worldBuildIdentityHash` protocol fields and canonical bytes.

**Integration point:** Browser Protocol V5 DTOs, Authoring Capture API DTOs, Control Capture bundle, and Simulation Take data model. This task changes no Studio server, CLI framing, Playground caller, Route evaluator, or Authoring Edit code.

- [ ] Add RED protocol tests that reject `executionPlanHash` in generic Snapshot/Browser/Capture/Take payloads, require `worldBuildIdentityHash`, and preserve exact schemaVersion/discriminator/unknown-key behavior.
- [ ] Run only the focused protocol/Control Capture/Take files and record RED.
- [ ] Migrate exact keys and canonical hash inputs in one current-only pass; keep Browser Protocol V5 and add no optional alias, fallback inference, or parallel DTO.
- [ ] Run focused tests, workspace boundaries, test census, and typecheck.
- [ ] Commit:

```bash
git add packages/runtime-contracts packages/control-capture scripts/lib/control-capture-bundle.ts scripts/lib/headless-runtime-session.ts scripts/lib/test-gate-manifest.ts pnpm-lock.yaml
git commit -m "refactor(protocols): migrate generic runtime identity"
```

---

### Task BNA1-09B: Migrate generic Validation, CLI, and Studio transports

**Goal:** Carry the new generic identity through user-facing transport/storage surfaces without altering Canonical Route semantics.

**Deliverable:** Generic WorldPackage validation subject/results, non-Route CLI JSON, Simulation Take CLI, and Studio persistence use `worldBuildIdentityHash`; no transport accepts both names.

**Files:**

- Modify: `packages/validation/src/world-package-validation-subject.ts`
- Modify: `packages/validation/src/world-package-validation-subject.test.ts`
- Modify: generic Validation DTOs/tests classified by BNA1-00; exclude Route evaluator/publication/probe contracts
- Modify: `apps/studio/src/server.mjs`
- Modify: `apps/studio/src/server.test.mjs`
- Modify: non-Route `scripts/cli/**` files classified by BNA1-00
- Modify: `scripts/lib/simulation-take-cli.ts`
- Modify: generic portions of `scripts/lib/world-package-cli.ts` and corresponding tests
- Modify: `scripts/lib/test-gate-manifest.ts`

**Input / output contract:** Parsed BNA1-09A DTOs -> byte-exact CLI/Studio persistence and generic Validation evidence using only World Build identity.

**Integration point:** CLI stdout/receipts, Studio persisted job state, generic WorldPackage validation, and Simulation Take commands. Route/Edit endpoints remain untouched for BNA1-09C.

- [ ] Add RED tests for exact CLI/Studio/Validation payloads, stale stored rows, unknown `executionPlanHash`, and absence of inferred aliases.
- [ ] Run focused transport tests and record RED.
- [ ] Migrate serializers, parsers, persistence, and fixtures together; no reader may accept the removed generic field.
- [ ] Run generic Validation/CLI tests, `pnpm test:studio`, workspace boundaries, test census, and typecheck.
- [ ] Commit:

```bash
git add packages/validation apps/studio scripts/cli scripts/lib/simulation-take-cli.ts scripts/lib/world-package-cli.ts scripts/lib/test-gate-manifest.ts pnpm-lock.yaml
git commit -m "refactor(transports): publish world build identity"
```

---

### Task BNA1-09C: Migrate Canonical Route and Authoring Edit consumers

**Goal:** Update Canonical-only consumers to the terminal Plan type while proving that their Plan identity does not become generic World identity.

**Deliverable:** Authoring Edit/Host and Route R1/R1B contracts retain required `executionPlanHash`, consume `CanonicalSceneExecutionPlanV1`, and reject Native sources with stable capability diagnostics.

**Files:**

- Modify: `packages/authoring-edit/**`
- Modify: `packages/authoring-host/**` only for Canonical Edit/Plan publication
- Modify: Route-specific `packages/validation/**` files classified by BNA1-00
- Modify: Route-specific `packages/runtime-contracts/src/browser-route-evidence.ts` fields/tests
- Modify: Route/Authoring Edit `scripts/cli/**` and `scripts/lib/**` files classified by BNA1-00
- Modify: `scripts/lib/test-gate-manifest.ts`

**Input / output contract:** Canonical Scene Plan operation -> explicit `executionPlanHash`; Native Scene Source -> closed unsupported capability result, never a fabricated Plan or substituted World Build hash.

**Integration point:** Canonical Authoring Edit, Plan validation, Route R1/R1B evaluator/publication/probe, Incremental Change, and their receipts.

- [ ] Add RED tests that reject `worldBuildIdentityHash` as a substitute in Plan-specific Route/Edit payloads and reject Native Authoring Edit, Route, Plan validation, and Incremental Change before execution.
- [ ] Run focused Route/Edit tests and record RED.
- [ ] Update the imported Plan type and component links while preserving Route receipts' `executionPlanHash`; do not add a Native empty topology, fake Plan, or generic fallback.
- [ ] Run Authoring Edit/Host and Route verification gates, workspace boundaries, test census, and typecheck.
- [ ] Commit:

```bash
git add packages/authoring-edit packages/authoring-host packages/validation packages/runtime-contracts scripts/cli scripts/lib scripts/lib/test-gate-manifest.ts pnpm-lock.yaml
git commit -m "refactor(canonical): retain explicit plan identity"
```

---

### Task BNA1-09D: Integrate app/orchestration callers and regenerate classified fixtures

**Goal:** Finish the consumer migration only after protocol, transport, and Canonical-only boundaries are independently green.

**Deliverable:** Playground adapters, workflow orchestration, verification scripts, and all BNA1-00 fixtures/artifacts call the correct prior-task contract with no stale generic Plan identity.

**Files:**

- Modify: `apps/playground/src/authoring-loader.ts`
- Modify: `apps/playground/src/babylon-world-adapter.ts`
- Modify: `apps/playground/src/gameplay-babylon-runtime-coordinator.ts`
- Modify: `apps/playground/src/outdoor-scene-gameplay-loader.ts`
- Modify: `apps/playground/src/worldkit-browser-api.ts`
- Modify: corresponding Playground tests
- Modify: `scripts/lib/worldkit-pipeline.ts` and orchestration callers classified by BNA1-00
- Modify: verification scripts and test fixtures classified by BNA1-00
- Regenerate: only generated consumer evidence owned by the classified commands
- Modify: `scripts/lib/test-gate-manifest.ts`

**Input / output contract:** Green BNA1-09A/B/C surfaces + completed Scene Authoring Attempt records -> integrated app/workflow state and regenerated fixtures with the correct identity owner.

**Integration point:** Playground runtime orchestration, Browser implementation, authoring publication jobs, and verification fixture generation.

- [ ] Add caller-level RED tests proving each app/workflow forwards one identity dialect and that production Native decisions remain rejected/capability-gap before BNA-8.
- [ ] Run focused callers and record RED.
- [ ] Apply `SceneAuthoringAttemptResultV1` to orchestration records without enabling Native production or creating a Native WorldPackage identity.
- [ ] Regenerate fixtures through their owners; do not hand-edit hashes.
- [ ] Run Playground tests, affected verification commands, typecheck, `pnpm build`, and `pnpm build:native-scene`.
- [ ] Commit:

```bash
git add apps/playground scripts examples/evidence artifacts/scenes pnpm-lock.yaml
git commit -m "refactor(orchestration): integrate source-neutral identity"
```

---

### Task BNA1-10: Rebuild evidence and close BNA-1

**Goal:** Prove the exact terminal tree is clean, behaviorally preserved, and ready to unblock later BNA work without claiming Native production support.

**Deliverable:** Regenerated tracked artifacts, permanent clean-break verifier, browser/manual evidence, full gate results, and an independent Mode B completion review with no open blocking findings.

**Files:**

- Create: `scripts/verification/verify-bna1-clean-break.ts`
- Create: `docs/reviews/2026-08-29-babylon-native-runtime-identity-clean-break-review.md`
- Modify: `package.json`
- Modify: `scripts/lib/test-gate-manifest.ts`
- Regenerate: `examples/evidence/**/world.build.json`
- Regenerate: affected `examples/evidence/**/{verification,explain}.json`
- Regenerate: affected `artifacts/scenes/**/world.build.json`
- Regenerate: generic Whitebox Tri-view manifests, Capture manifests, Simulation Takes, and Control Capture evidence identified by BNA1-00
- Modify: `docs/18-refactor-progress-and-backlog.md`
- Modify: `docs/superpowers/specs/2026-08-28-ai-friendly-babylon-native-world-authoring-design.md`
- Modify: `.superpowers/sdd/2026-08-29-babylon-native-runtime-identity-clean-break/progress.md`

**Input / output contract:** Exact final source tree and regenerated artifacts -> reproducible automated/manual evidence and honest BNA-1 completion status.

**Integration point:** BNA-3/BNA-4 dependency boundary and project backlog truth.

- [ ] Write the clean-break verifier RED first. It must fail on executable/source occurrences of deleted V5/compiler/Package migration symbols, Runtime Native Plan imports, generic `executionPlanHash`, old Package entry paths, old public exports, alias fields, dual parsers, legacy switches, a second `Sha256HashV1` owner, or any formal Native RuntimeHost adapter allocation. It must enforce an exact reviewed allowlist for Plan-specific `executionPlanHash` files.
- [ ] Run `pnpm verify:bna1-clean-break` and record the expected remaining offenders.
- [ ] Repair only offenders classified by BNA1-00; do not weaken the verifier or broaden the allowlist to make it pass.
- [ ] Regenerate artifacts through their owning commands. Never hand-edit hashes or receipts. Confirm World Build Identity transport metadata is excluded from Package Root and reproducible across two builds.
- [ ] Run focused gates after each repair, then once on the final tree run:

```bash
pnpm verify:workspace-boundaries
pnpm test:census
pnpm typecheck
pnpm test
pnpm test:studio
pnpm build
pnpm build:native-scene
pnpm verify:canonical
pnpm verify:placement-layout
pnpm verify:rigged-subject
pnpm verify:g-bot-subject
pnpm verify:control-capture
pnpm verify:validation-capture
pnpm verify:route-r1-heightfield
pnpm verify:route-r1b-static-platform
pnpm verify:outdoor-gameplay
pnpm verify:3c-migration
pnpm verify:unreleased-clean-break
pnpm verify:bna1-clean-break
```

- [ ] Start the Canonical catalog with `pnpm dev`, open the printed URL without `?authoring=1`, and verify a representative outdoor case loads, moves, collides, jumps/lands, orbits/resets the SDK camera, and publishes a stable `worldBuildIdentityHash`.
- [ ] Stop that server. Start `pnpm dev:native-scene`, open the printed URL, and verify the explicitly experimental Cloud Ridge harness preserves visual continuity, one Spawn, three collision proxies, movement through the intended route, jump/landing, camera orbit/reset, collision overlay, stable Contribution identity, and zero browser/page errors. Separately assert formal RuntimeHost still rejects Native before allocation.
- [ ] Record automated contract evidence, rendered visual evidence, and manual interaction evidence separately. Do not convert the experimental manual evidence into RuntimeHost admission, WorldPackage, Route/Nav, or production-support claims.
- [ ] Apply the full-dimension review protocol in change-review Mode B and the full runtime deep-review checklist. Require independent review of the actual `BNA1-00..09D` plus BNA1-10 diff, not only the reports.
- [ ] Update the Spec/backlog truth: BNA-1 contracts, Canonical identity migration, and experimental shadow-Plan removal are complete; formal Native RuntimeHost admission, Native WorldPackage, Gameplay Surface Admission, Hosted, Route/Nav, WorldChangeSet, and Block Profile remain open under BNA-3/BNA-4 and their owning later tasks.
- [ ] Run `git diff --check`, link checks, and a final `git status --short`. Commit:

```bash
git add package.json packages apps scripts examples/evidence artifacts/scenes docs .superpowers/sdd/2026-08-29-babylon-native-runtime-identity-clean-break/progress.md
git commit -m "feat(runtime): complete BNA-1 scene source identity"
```

## Final handoff boundary

After BNA1-10 passes and review has no open blocking findings:

- BNA-3 may define and verify the formal Native WorldPackage/Receipt member against the frozen Identity and Bootstrap contracts.
- BNA-4, only after BNA-3, may remove the BNA-1 capability rejection and connect production Native Source/Contribution/Gameplay Surface Admission to RuntimeHost and the unified Kernel.
- BNA-7 may design Native Route/Nav evidence only from the same frozen Contribution/Surface identity; it may not recreate a Plan.
- BNA-8 remains the only production Go/No-Go authority.
- No code from `codex/block-world-sdk-v2` is cherry-picked by this plan. The Block Whitebox construction method remains a later Profile consumer of the accepted Native API and Runtime boundary.
