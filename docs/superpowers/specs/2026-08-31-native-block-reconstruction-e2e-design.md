# Babylon Native Block Reconstruction End-to-End Design

**Project code:** `NBR-1`  
**Chinese name:** 新版 Babylon 像素块场景还原纵向闭环  
**Status:** Approved for implementation; independent review GO with no open P0/P1  
**Date:** 2026-08-31  
**Source baseline:** `origin/main@1eec016022d18a0cab1eeed2feaafb62b2e5d155`
**Parent program:** [WRC-1 World Reconstruction & Control Milestone](./2026-08-30-wrc1-world-reconstruction-and-control-milestone-design.md)

## 1. Decision and priority

`NBR-1` is the only highest-priority WRC-1 implementation slice until one real reference-driven Babylon
Native Block world runs end to end through the formal production-shaped chain:

```text
reference image + Scene Brief + reconstruction Case/Profile + Case-bound Formal Capture Intent
  -> source-neutral SceneAuthoringRouteDecisionV1
  -> one formal Codex task through scripts/agents/run-codex-task.mjs
  -> Babylon Native Block source workspace
  -> worldkit native check/explain
  -> Bundle + locks + Frozen Contributions + WorldPackage + Build Receipt
  -> the existing RuntimeHost + BabylonWorldRuntime + SDK-owned Havok/Subject/Input/Action/Camera
  -> identity-bound formal Capture + runtime traversal evidence
  -> dimensioned reconstruction evaluation
  -> at most one diagnostic-driven repair task
  -> new Attempt + Candidate + Package + Receipt + Capture + evaluation
  -> one directly runnable final WorldPackage
```

This is a vertical production-shaped slice, not a Demo, a BWB fixture, or a claim that all BNA-6,
BNA-7, WRC-SR, or WRC-1 work is complete. BWB-6, full PHO-7/8, product Route/Nav/`goTo`, generalized
Action/Posture, complex Camera behavior, spatial events, full Golden Corpus, BNA-8 disposition, and
WRC-ACC-1 remain in the backlog and do not block `NBR-1`.

## 2. Alternatives considered

### 2.1 Recommended: one vertical slice over existing owners

Keep the two existing Scene Sources, add the missing source-authoring and evaluation orchestration, and
reuse BNA-2/3/4/5 without copying their contracts. This produces a real runnable Case quickly while
preserving the long-term architecture.

### 2.2 Rejected: extend the BWB-5 hand-written Corpus into a product Demo

BWB-5 proves block geometry, collider contribution, Havok, cadence, and cleanup, but it is hand-written
test evidence. Treating it as AI reconstruction would make BNA-6 evidence false and would still omit a
generic Package/run/Capture route.

### 2.3 Rejected: finish all WRC-1 horizontal infrastructure first

Completing BWB-6, PHO-7/8, general Action/Camera, events, formal Nav, and full evaluation breadth before a
real Case delays the highest-value learning and increases unused abstraction. Those work packages remain
valid but are deferred until the vertical slice exposes their actual needs.

## 3. Frozen architecture boundaries

### 3.1 Exactly two Scene Sources

`RuntimeSceneSourceV1` remains exactly:

- Canonical JSON Source;
- Babylon Native Source.

One World selects one Source. `NBR-1` does not add `generated`, `reconstruction`, `block`, `manifest`, or
another Scene Source kind. A generated Native Module is still a Babylon Native Source. It cannot overlay
Canonical geometry, create a shadow Plan, call the Canonical Compiler, or re-enter Runtime through a
third adapter.

### 3.2 Responsibility split

| Fact or operation | Sole owner | Forbidden alternative |
|---|---|---|
| Scene intent, reference identity, acceptance targets, budgets and Formal Capture Intent identity | `WorldReconstructionCaseV1` + Scene Brief + Case-bound `FormalWorldCaptureIntentV1` | Native Module private metadata or production-adapter constants |
| Source route | source-neutral route decision owner in `scene-authoring-contracts` Host adapter | model-selected hidden route |
| AI execution backend | `scripts/agents/run-codex-task.mjs` | direct LWDP/Codex call from reconstruction code |
| Native visual construction | admitted Native Module using `@whitebox-world/native-babylon` and Block Profile | JSON geometry DSL or Canonical overlay |
| Spawn and static collider intent | explicit Block Profile finalize/Frozen Contribution | Mesh/tag/name scan |
| Source audit/check | existing BNA-2 checker and Explain view | evaluator or Runtime repairing source |
| Bundle, locks, Package and Build Receipt | existing BNA-3 builders | Case-specific package format |
| Candidate/Runtime admission | existing BNA-4/5 Host and isolation owners | app-private Native Runtime host |
| Havok, support, Character, Input, Action, Camera and fixed Tick | SDK Runtime owners | Module-created Physics/Camera/Input/Timer/Tick |
| Formal Capture | existing Runtime Capture ports plus one source-neutral identity Receipt | BWB build-epoch screenshot masquerading as formal Capture |
| Reconstruction score and diagnostics | `@whitebox-world/validation` reconstruction evaluator | pixel-only or provider-authored score |
| Repair orchestration | one Host run journal creating a new Attempt | in-place edits to frozen Package/artifacts |

No new Native-specific Runtime, Gameplay, Camera, Physics, Package, or Browser protocol package is
allowed. The permitted durable extensions stay in three existing owners:

- `@whitebox-world/scene-authoring-contracts`: Native generation identity;
- `@whitebox-world/runtime-contracts`: Formal Capture Intent/request/receipt and Block capture inventory;
- `@whitebox-world/validation`: reconstruction Case/Profile/evaluation/repair receipt.

### 3.3 Native Module authority restrictions

The Module may use only the Host Candidate Scene and approved Native/Block APIs. It must not create or
own Engine, Scene, Render Loop, Havok/Physics, the SDK main Camera, Input, Gameplay entities, timers,
workers, network calls, or an independent Tick. BNA-2 authority audit and dual-Candidate replay remain
the admission truth; the reconstruction evaluator cannot waive a checker diagnostic.

## 4. Existing owners reused; narrowly extended only where declared

The implementation must adapt these owners rather than copy them:

- `scripts/agents/run-codex-task.mjs`: the only cloud/local Codex router;
- `@whitebox-world/native-babylon`: Native Module and registration API;
- `@whitebox-world/native-babylon-block-profile`: Block Session/Layout/finalize/check and explicit
  visual groups/collider inventory;
- `scripts/native-scene/native-scene-check.ts`: strict source, TypeScript, audit and replay checker;
- `scripts/native-scene/build-trusted-world-package.ts` and
  `prepareFrozenBabylonNativeWorldPackageBuildInputV1()`: BNA-3 build chain;
- `@whitebox-world/world-package`: Package/Root/WorldBuildIdentity/Build Receipt verification;
- `RuntimeHost`, `prepareBabylonNativeRuntimePackageV1()` and `BabylonWorldRuntime.create()`: BNA-4
  runtime chain;
- BNA-5 admission/isolation supervisor and cleanup receipts;
- `BabylonWorldRuntime.waitForRenderReady()`, `captureControlFrame()` and `captureArtifactView()` as
  primitives; NBR-45 adds the missing admitted Block identity, world-side request and hosted transaction;
- the existing Browser V5 installer and SDK Camera/Input/Action owners.

The Cloud Ridge-specific builder and fixed virtual module loader are not generic product owners.
`apps/native-scene-playground` remains the BNA-owned verification Web Harness until an applicable BNA
disposition permits a separate current-only Native Viewer cutover. NBR-1 may generalize that Harness to
load an admitted Package, but it must not route Native through the accepted Canonical-only Unified Scene
Viewer or treat the Harness as a product Viewer.

### 4.1 `codex/block-world-sdk-v2` is a migration source, not discarded research

The experimental branch `codex/block-world-sdk-v2@3c2e9826f0c91ef39675c27a6bbdc6238e6c0b05`
already proves valuable AI Block authoring mechanics: the `worldkit-block-builder` Skill and self-check,
spatial generation orchestration, Block structural checks, deterministic entry/top visual review rules and
bounded resume/retry behavior. NBR-1 must inspect and migrate those accepted algorithms/tests before writing
replacements. Its styled visual reconstruction and raw Browser keyboard/playthrough implementation are not
NBR structural-evaluation authorities; only their useful test intent may be retained.

Migration is a semantic port into current owners, not a branch merge. Skill prompt structure, deterministic
Block validation rules and selected recovery fixtures may be adapted where their contracts remain valid.
The old Three.js binding, Block Manifest/Compiler, raw keyboard capture, software PNG renderer,
shell-specific backend entry and any duplicate Runtime/Physics/Camera state must not return. Babylon Native
Block Profile, current Codex task router, BNA Check/Package/Receipt/Hosted admission and SDK-owned
RuntimeHost/Havok remain the destination authorities. Every reused file records its source commit in the
implementing PR and gains current-contract focused tests; copied compatibility packages or parallel
Three/Babylon paths are forbidden.

## 5. Source authoring contracts

### 5.1 Route decision

The Host adds one source-neutral `decideSceneAuthoringRouteV1()` around the existing
`SceneAuthoringRouteDecisionV1` parser. Its trusted inputs are parsed Scene Brief identity, reference
input hashes, required capabilities, trust profile, and explicit supported-lane selection.

The first Case produces:

```ts
decision: {
  kind: "babylon-native";
  authoringProfileRef: "worldkit://native-authoring-profile/whitebox.blocks@1";
  compositionStrategy: "ground-first";
  reasonCodes: readonly [
    "reference-driven-distinctive-silhouette",
    "user-selected-supported-lane"
  ];
}
```

The route owner rejects required World Change Set, product Route/Nav, dynamic multilayer surfaces, or
unadmitted trust profiles. The model cannot change the chosen lane.

### 5.2 Current-only Attempt correction

The current Native `SceneAuthoringAttemptV1.sourceInput.moduleGenerationInputRef/Hash` is semantically
wrong: active consumers compare it to the generated source graph hash. `NBR-1` replaces it in one clean
break with the actual generation request identity:

```ts
sourceInput: Readonly<{
  kind: "babylon-native";
  bootstrapInputRef: string;
  bootstrapInputHash: Sha256HashV1;
  generationRequestRef: string;
  generationRequestHash: Sha256HashV1;
}>;
```

The generated source is owned only by the completed Attempt Result `authoredSourceRef/Hash` and the BNA-3
source graph/bundle identity. All parsers, fixtures, package joins, Cloud Ridge inputs, and tests migrate
atomically; the old names, fallback reads, and aliases are deleted.

### 5.3 Native Block generation request and receipt

`scene-authoring-contracts` owns one closed, hashable pair:

```ts
interface NativeBlockGenerationRequestV1 {
  readonly kind: "native-block-generation-request";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly routeDecisionRef: string;
  readonly routeDecisionHash: Sha256HashV1;
  readonly sceneBriefRef: string;
  readonly sceneBriefHash: Sha256HashV1;
  readonly referenceInputs: readonly Readonly<{
    inputRef: string;
    contentHash: Sha256HashV1;
    mediaType: "image/png" | "image/jpeg";
  }>[];
  readonly codexExecutionProfileRef: string;
  readonly codexExecutionProfileHash: Sha256HashV1;
  readonly taskInstructionRef: string;
  readonly taskInstructionHash: Sha256HashV1;
  readonly builderSkillRef: string;
  readonly builderSkillHash: Sha256HashV1;
  readonly workspaceContextManifestRef: string;
  readonly workspaceContextManifestHash: Sha256HashV1;
  readonly contextInputs: readonly Readonly<{
    inputRef: string;
    contentHash: Sha256HashV1;
  }>[];
  readonly nativeSceneApiRef: string;
  readonly nativeSceneApiHash: Sha256HashV1;
  readonly nativeSceneProfileRef: string;
  readonly nativeSceneProfileHash: Sha256HashV1;
  readonly blockProfileRef: string;
  readonly blockProfileHash: Sha256HashV1;
  readonly bootstrapInputRef: string;
  readonly bootstrapInputHash: Sha256HashV1;
  readonly seed: number;
  readonly budgets: Readonly<{
    maximumBlockCount: number;
    maximumStaticColliderCount: number;
    maximumStaticColliderVertexCount: number;
    maximumStaticColliderTriangleCount: number;
    maximumOutputBytes: number;
    timeoutSeconds: number;
  }>;
  readonly declaredOutputPaths: readonly [
    "scene.ts",
    "native-block-authoring.json",
    "native-resources.json"
  ];
}
```

`NativeBlockGenerationReceiptV1` binds the Request hash, canonical provider-neutral router task payload
hash, exact
instruction/Skill/context manifest hashes, stable router request ID, selected backend, resolved formal
model/effort, outcome, output inventory/path/hash/bytes, diagnostic codes, and cleanup outcome. The
task-payload hash belongs only to the Receipt because the payload includes the already-hashed
Generation Request; putting it inside that Request would create a circular identity. Workspace context
identity is a canonical sorted path/content-hash inventory, never gzip bytes, mtime or
an absolute host path. It contains no credentials, provider payload, or mutable output directory.
Creation submission remains exactly once; an uncertain create outcome is reconciled by request ID.
The representative Native Block formal run freezes a 1,800-second task timeout. A provider-confirmed
task timeout is recorded only as the provider-neutral `task-timeout` diagnostic in the durable Generation
Receipt; provider stderr, payloads, credentials and trace details are never serialized. Submission
transport uncertainty remains the separate `creation-outcome-unknown` state and never permits a second
creation submission. Both Codex adapters project their private state into one request-ID-bound,
machine-readable `worldkit-codex-task-outcome` envelope. The Host process port consumes only that closed
envelope; it never classifies stderr. Local timeout is definitive only when the adapter's own frozen timer
expires. Cloud timeout is definitive only from a structured provider error code. An uncertain create
outcome reaches the Runner's reconciliation port, which invokes the same router in GET-only recovery mode;
it never repeats the creation POST. The durable Receipt permits `task-timeout` only as the sole diagnostic
of a rejected, output-empty attempt whose cleanup completed.

The representative `whitebox.blocks@1` Bootstrap uses the stable hyphen identity
`cloud-temple-t-gate-native-block-native`. Dotted Bootstrap identities are rejected before task creation
because that identity becomes the Block build epoch and Collider contribution owner during formal Check.

The Host accepts Native API, Native Scene Profile and Block Profile only through exact resolved-resource
descriptors containing `resourceKind`, canonical Registry `resourceRef`, `resolvedVersion`, and the resolved
resource `contentHash`. The Request's `...Ref/...Hash` fields bind that Registry resource identity; the
descriptor file path and descriptor-byte hash remain separate `contextInputs` and never replace it. The
current Case uses only `worldkit://native-scene-api/babylon@1`. The Host also reparses and recomputes the
Case-level Route Decision from the complete Case Scene Brief closure, rejects a caller-supplied shadow
decision, and durably publishes the exact Route bytes beside the Request and Attempt.

The formal profile uses `gpt-5.6-sol` with `xhigh`, as required by repository policy. Smoke profiles are
not valid BNA-6 evidence.

### 5.4 AI output workspace

Before task creation, the Host derives `BabylonNativeSceneBootstrapV1` as a read-only Native startup
projection from the Case-bound Spawn identity and seed, parsed `GameplayBootstrapV1`, parsed
`WorldRuntimeBootstrapV1`, and Host-selected Scene Module/API/Profile refs. The projection copies only the
startup values required by the closed Native Bootstrap contract: Gameplay Bootstrap ref, controlled entity
ID, gravity, numeric opening-camera values, seed and Spawn Marker ID. It does not become the owner of those
upstream facts.

`WorldPackageWorldBoundsV1` remains owned by the WorldPackage manifest boundary and is not added to the
Native Bootstrap. Subject closure, Camera resource refs, runtime resource locks and their canonical identity
remain owned by `WorldRuntimeBootstrapV1`; the Native Bootstrap contains no second Subject or Camera
resource closure. The Host must reject cross-wired Gameplay/World Runtime links, a controlled Subject not
closed by the World Runtime Bootstrap, a Case Spawn mismatch, or non-finite/invalid bounds before task
creation.

The Host canonicalizes and identity-binds the parsed Gameplay Bootstrap, World Runtime Bootstrap and
validated WorldPackage Bounds in the Generation Request context, then canonical-materializes
`native-scene.bootstrap.json` and freezes its bytes as `bootstrapInputRef/Hash`. The Builder receives that
file read-only and cannot rewrite it. The materialized file is a durable Attempt input: it is promoted out of
task staging before submission and is retained with the Attempt/Generation Receipt even after the isolated
task workspace is cleaned. This makes Route, Generation Request and Attempt identities fully knowable before
submission and prevents generated source from becoming a hidden Gameplay control plane.

The durable Attempt additionally retains the exact API/Profile/Block resolution descriptors and a typed
Host-closure descriptor. That descriptor binds the admitted World Runtime Bootstrap Registry ref, resolved
version and `contentHash` to the parsed Bootstrap's own `contentHash`, plus Gameplay Bootstrap, World Bounds
and initial controlled-entity identities. The complete Attempt directory is published from one sibling
staging directory by atomic rename; an existing Attempt or task root is rejected rather than overwritten.
Input and output ancestor chains must resolve without symbolic links. Generation Request, Attempt, router
request and cloud prefix identities include the stable run ID, while the immutable Case-level Route identity
does not change between runs.

The task writes only:

- `scene.ts`: a closed Native Module using Native API + Block Profile;
- `native-block-authoring.json`: entry module, Block Profile ref, visual target/group mappings and their
  semantic class/identity color; it contains no Gameplay, Camera, Physics, Subject or Spawn state;
- `native-resources.json`: a closed sorted list of optional Native visual Registry refs using the
  existing `worldkit://static-geometry-asset/<name>@<version>` Asset Lock dialect. Subject, Camera,
  Gameplay and Runtime refs are Host-owned and invalid in this list.

The checker must join every declared visual group to the checked Layout inventory and reject missing,
duplicate, unbound or undeclared groups. The first Case is asset-free, so `native-resources.json` is an
empty declared set; Gameplay/Subject/Camera Registry closure comes only from the Host-bound
`GameplayBootstrapV1` and `WorldRuntimeBootstrapV1`, never an implicit default, the Native Bootstrap, or
this resource list. The model cannot mint Resource publication/admission
receipts or Asset Locks. The Host resolves declared refs, creates selected asset rows and locks, and
rejects unknown or unadmitted resources.

A new durable Builder Skill may package the AI-facing rules and standalone self-check, but it cannot
become an authority. The trusted Host always replays `worldkit native check`; a task success status never
allocates a Runtime Candidate or bypasses BNA-2/3/4/5.

## 6. Host orchestration and stable commands

### 6.1 Commands

The stable surface is:

```text
worldkit reconstruct run <case.json> --output <run-directory> [--backend cloud|local] --json
worldkit native check <world-directory> --json
worldkit native explain <world-directory> [--json]
worldkit native package <world-directory> --case <case.json> --output <package-directory> --json
worldkit native run <package-directory> [--port <port>] [--refresh-dependencies] --json
worldkit capture <package-directory> --output <opening.png>
  --triview-output <directory> --json
```

`reconstruct run` is source-neutral at the Case/Route layer but `NBR-1` initially implements the admitted
Native Block route only; a Canonical decision fails with a stable unsupported-route diagnostic rather
than silently calling the old Builder. `native package` is the sole generic Native package adapter and
replaces the Cloud Ridge-specific production script. `native run <package-directory>` is an explicitly
BNA-owned verification Harness command: it uses the existing RuntimeHost and admitted Native isolation
path, but does not add Native to the accepted Viewer target Catalog/bootstrap or change the Canonical
`worldkit run` contract.

### 6.2 Check-before-Candidate order

The Host state machine is fixed:

```text
route/bootstrap/request/attempt frozen
  -> router task
  -> declared outputs atomically promoted
  -> Native workspace check/explain
  -> resource resolution
  -> BNA-3 Bundle/locks/Package/Receipt
  -> Package verification
  -> BNA-5 admission/isolation
  -> Runtime Candidate allocation
```

Any failed or incomplete stage publishes diagnostics and cleanup evidence but cannot create the next
identity. In particular, checker success is required before Package build, and verified Package plus
Host admission are required before Candidate allocation.

### 6.3 BNA verification Runtime route

The CLI verifies the Native Package before starting the retained BNA verification Web Harness. The Harness
delegates to the existing isolated runtime entry/`prepareBabylonNativeRuntimePackageV1()` and the same
`RuntimeHost`; it does not copy Gameplay, Physics, Camera or lifecycle ownership. Browser ready, Reset,
disposal and page exit remain owned by the existing Runtime/lifecycle modules. Cloud Ridge becomes a Case
consumer and its fixed loader is removed after the generic Harness route is accepted. The Canonical-only
`apps/playground` Viewer, its Catalog, Studio source selection and `worldkit run` remain unchanged.

## 7. Formal Capture core slice

`NBR-1` implements only the BNA-7 Capture slice. Product Route/Nav/`goTo` remains deferred. Existing
Capture primitives are reusable, but the current tree does not yet provide a formal Native Block Capture
seam: Block meshes lack admitted Runtime capture identities, artifact capture lacks a world-level side
request, and the hosted isolated session exposes no Capture transaction. NBR-45 must close those gaps;
they are not treated as already implemented.

### 7.1 Approved Scheme A: one Case-bound Formal Capture Intent

`WorldReconstructionCaseV1` gains exactly two required current fields:

```ts
readonly formalCaptureIntentRef: "inputs/formal-world-capture-intent.json";
readonly formalCaptureIntentHash: Sha256HashV1;
```

The fixed Case-root file `inputs/formal-world-capture-intent.json` is the only durable authored Capture
intent. `@whitebox-world/runtime-contracts` is the sole parser, canonical-bytes and hash owner for its closed
DTO:

```ts
interface FormalWorldCaptureIntentV1 {
  readonly kind: "formal-world-capture-intent";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly captureProfile: Readonly<{
    widthPixels: number;
    heightPixels: number;
    devicePixelRatio: number;
  }>;
  readonly semanticCaptureTargetBindings: readonly Readonly<{
    acceptanceTargetRef: string;
    compositionTargetRef: string;
    topologyNodeId: string;
    semanticLayerId: string;
    blockVisualGroupId: string;
  }>[];
  readonly topologyRelations: readonly FormalSemanticTopologyRelationBindingV1[];
  readonly checkpointSpatialCriteria: readonly FormalTraversalCheckpointSpatialCriterionV1[];
}
```

The Case hash binds the Intent ref/hash. The production transaction resolves the fixed ref beneath the
canonical Case root, rejects symbolic links and path escape, reads the bytes once, parses them through
`parseFormalWorldCaptureIntentV1()`, requires the stored bytes to equal the parser's canonical bytes, compares
their canonical hash with `formalCaptureIntentHash`, and verifies the Intent ID and complete
target/topology/checkpoint closure against the parsed Case before any Runtime or
Capture allocation. The representative Case uses the ID
`cloud-temple-t-gate-native-block.formal-world-capture-intent`; no consumer derives that identity from an
output directory or a bare slug.

`materializeFormalWorldCaptureRequestV1()` receives one already parsed `FormalWorldCaptureIntentV1`. It no
longer accepts `captureProfile`, `semanticCaptureTargetBindings`, `topologyRelations`, or
`checkpointSpatialCriteria` as four caller-supplied parameter groups. The materializer joins the parsed
Intent with the parsed Case and verified Package metadata to build the sole `FormalSemanticCaptureMapV1`
and `FormalWorldCaptureRequestV1`; it does not reparse or reinterpret Intent bytes.

This is a current-only atomic migration. The Case fields, runtime-contract parser/hash exports, Case fixture,
Formal Capture request materializer, Block semantic binder, production transaction and all focused fixtures
change together. The scattered parameter types/fields and every old call site are deleted in the same
accepted tree. There is no optional field, compatibility alias, fallback file, default Intent, Case-ID slug
mapping, expected-bounds inference, Block/group-name inference, Mesh metadata lookup, tag scan or
`scene.meshes` scan.

The Intent is Capture-only Host input. It does not add a model output, generation context field, authoring
Manifest field, Package member, Package parser, Package hash projection, Bundle input or Build Receipt field.
The Native generation declared outputs remain exactly `scene.ts`, `native-block-authoring.json` and
`native-resources.json`; BNA-3 Package creation/verification remains unchanged. Package metadata supplies
verified observed identities for the Intent join, never a replacement or inferred copy of the Intent.

### 7.2 Request materialization and Runtime evidence

`FormalWorldCaptureRequestV1` and `FormalWorldCaptureReceiptV1` are owned solely by
`@whitebox-world/runtime-contracts`. The checked `native-block-authoring.json`, checked Layout, Frozen
Contribution and profile settlement create one `BabylonNativeBlockMaterializerMetadataV1`. Its complete
bytes and hash are frozen into the WorldPackage Root and Build Receipt and verified by one parser. There is
no second Capture identity inventory. The metadata maps every accepted Block to the Host-derived
`runtimeEntityId` (`native-block:<blockId>`) and semantic capture class, every accepted visual group to its
Case target/class/identity color/bounds, and every Collider to its source Block. The metadata carries one
`nativeSceneProfileRef` bound to the selected Native Scene Profile; `blockProfileRef` remains solely the
authoring Manifest's Native Block Profile ref and is never an alias for the scene profile. The materializer
creates a Host-private explicit `runtimeEntityId -> Mesh` and `visualGroupId -> Mesh[]` live-handle registry
from the same checked records. NBR-45B may consume only those handles plus verified Package metadata; it
never scans Mesh metadata, names, tags or `scene.meshes`. `FormalSemanticCaptureMapV1` remains the sole
Case-to-Capture semantic mapping. It consumes verified Package metadata rather than raw Manifest or Layout
inputs and explicitly binds each accepted visual group to its Case acceptance target, opening-composition
target, topology node and semantic layer. Those bindings are authored Capture intent and are checked against
the complete Case target sets and Package metadata; no binding may be inferred from a URI suffix, Block/group
name, expected screen rectangle, Mesh metadata, tag or Scene scan. The map also freezes the topology relations
that Capture must verify from measured Package bounds, SDK support/collider state or scripted traversal. A
relation that the current Capture profile cannot measure is missing evidence rather than a copy of Case
expectations. This extends the existing semantic map; it is not a second Package identity inventory and does
not change the AI generation request already in flight.

The current trusted artifact `worldkit capture` evidence command is extended source-neutrally to accept a
verified WorldPackage directory. It starts the same admitted BNA Runtime session through the verification
Harness/isolated port, not the product Viewer shell, waits for Browser/Runtime ready, and produces:

- opening view through the SDK Camera opening state;
- top-down and side artifact views through bounded Host capture transactions;
- Profile-controlled collider overlay derived from Frozen Contribution/SDK collider inventory; it is
  required evidence for the representative Case;
- committed Runtime Snapshot and a scripted traversal evidence file.

The source-neutral artifact request union gains an explicit `world-side` orthographic pose. The hosted
isolated Runtime session gains one bounded Capture transaction that accepts only a parsed formal request,
executes ready, Host reset/rebind, render-ready, opening/top-down/world-side/overlay/support/traversal and
Camera rollback against the same admitted Package and Runtime session, and returns content bytes plus measured
identity data. Reset keeps `runtimeSessionId` stable, allocates a fresh `worldSessionId` through the existing
`RuntimeHost`, atomically publishes the reset Candidate and disposes the previous world only after publication.
The retained isolated Runtime entry may own at most the current and one reset Candidate handle while the swap
is in flight; it must not create a second RuntimeHost, Gameplay owner, Camera owner, Physics owner or product
Browser protocol. The transaction cannot expose a general Camera, Scene, Engine or input handle.

The Host capture transaction may temporarily request artifact-view Camera poses, but the Native Module
never owns a Camera. Capture rollback restores the SDK Camera state before session disposal.

The transaction publishes four immutable measured evidence documents in addition to the three view PNGs and
collider-overlay PNG:

- `opening-observation.json`: Package-frozen visual-group bounds projected through the SDK opening Camera,
  including normalized bounds/centres, coverage and Camera-depth order for every explicit semantic mapping;
- `spawn-support-observation.json`: the reset Snapshot plus the SDK `checkSupport()` contact identity/point,
  its unique Frozen Contribution collider join, capsule foot point and measured support gap;
- `collider-overlay-observation.json`: every Frozen Contribution collider joined to the SDK-owned live Havok
  body/subshape and overlay record, with no Native registry or Scene scan;
- `scripted-traversal.json`: ordered fixed-input ticks, committed Snapshot hashes/positions/media and measured
  checkpoint outcomes after an independent Host reset/bind for each check.

The formal Capture provider computes those observations inside the admitted Runtime. NBR-50B only verifies
their bytes and identity joins and projects them into the existing evaluator DTO; it must never recompute them
from PNG pixels, copy Case expectations, guess ref suffixes or scan Babylon objects.

`FormalWorldCaptureReceiptV1` binds:

- Case/Profile, Attempt/Result, WorldPackage Ref/Root, WorldBuildIdentity and Build Receipt hashes;
- Runtime session identity, ready Snapshot hash and SDK owner version identities;
- formal request hash, semantic Capture map hash and Package-frozen Native Block materializer metadata hash;
- view IDs, explicit artifact refs, viewport/DPR, Camera input, renderer/browser identity and PNG hashes;
- opening/support/overlay/traversal observation artifact refs and content hashes;
- collider-overlay PNG artifact ref and content hash;
- Reset/Camera rollback and final cleanup outcomes.

The Receipt is written last after every referenced artifact has been hashed and re-read. The Node orchestrator
owns final browser/server/session/temporary-resource cleanup and may publish `cleanupOutcome: "completed"` only
after all resources close. The Browser transaction reports rollback/reset results but cannot claim Host-process
cleanup.

BWB-3 `scope: "build-epoch-local"` screenshots remain authoring evidence only and cannot satisfy this
Receipt.

## 8. Reconstruction evaluation

### 8.1 Owner and DTOs

The existing `@whitebox-world/validation` package gains source-neutral reconstruction contracts and the
sole evaluator:

- `WorldReconstructionCaseV1`;
- `WorldReconstructionEvaluationProfileV1`;
- `WorldReconstructionEvidenceSetV1`;
- `WorldReconstructionEvaluationResultV1`;
- `WorldReconstructionDiagnosticV1`;
- `WorldReconstructionRunReceiptV1`.

The Case binds real Scene Brief/reference/opening-target hashes, the sole
`formalCaptureIntentRef/formalCaptureIntentHash`, acceptance target refs, expected topology, visual groups,
normalized composition regions/anchors, Spawn/Support requirements, collider requirements, and scripted
traversal checks. Each scripted traversal check binds checkpoint sampling identities plus a
non-empty, execution-ordered `fixedInputSequence` of runtime `FixedInputV1` steps into the Case canonical
hash; the Case never relies on an implicit Route, NavMesh, planner, or `goTo` route. Attempt `acceptanceTargetRefs` and
`requiredEvidenceProfileRefs` must reference the Case/Profile; empty placeholder arrays are rejected.

The Case is the sole owner of expected source-neutral facts; the Profile is the sole owner of
BasisPoints/Millimeters tolerances. Evidence stores one closed observed discriminator and evidence-ref
list per dimension (an empty list expresses missing evidence), bound through Attempt, formal Package
root, World Build Identity and Capture identities. It retains only evaluator inputs, never a raw Runtime
Snapshot: semantic graph/layers; visual-group target presence and normalized projections; opening
anchors/order/distances; spawn support/medium/XYZ/gap; collider contributions/roles/overlay;
reached/blocked/incomplete traversal checkpoints; and replay/Package/Build/Capture agreement.

### 8.2 Independent dimensions

The Result has no masking aggregate score. Each required dimension independently returns
`passed | failed | incomplete`, closed metrics, evidence refs and diagnostic IDs:

| Dimension | Evidence and metric |
|---|---|
| `topology` | required semantic nodes/relations/layers and graph presence |
| `semantic-silhouette` | visual-group presence plus normalized projected bounds/centers/coverage; pixel diff advisory only |
| `opening-composition` | normalized regions/anchors, subject/landmark ordering and framing distances |
| `spawn-support` | BNA-4 admitted Spawn support + settled Runtime medium/position |
| `collider` | required explicit Contribution IDs, overlay presence and blocker/ground roles |
| `critical-traversal` | committed fixed-input scripted checkpoints through Havok Runtime |
| `deterministic-build` | Candidate replay, Package/Receipt and Capture identity agreement |

`critical-traversal` is not formal Route/Nav Evidence. It proves only the frozen Case's scripted pass/block
expectations and must never publish Route Graph, NavMesh, path planning or `goTo` claims.

Metric unions are closed (`ratio-basis-points`, `normalized-distance-basis-points`, `distance-millimeters`,
`boolean-presence`, `identity-match`, `receipt-outcome`). Missing required evidence makes the Result
`incomplete`; it is never converted to zero or advisory success.

### 8.3 Diagnostics

Each diagnostic contains a closed code, dimension ID, acceptance target ref, evidence refs, message, and
one allowed repair action targeting only Native authoring source or resource selection. Diagnostic codes
cover missing/disconnected structure, silhouette/anchor drift, unsupported Spawn, missing/wrong collider,
blocked required traversal, passable required blocker, nondeterministic build, and stale evidence.

The evaluator does not edit files, run a model, mutate Runtime, or update a Package.

## 9. One-repair closure

The Profile fixes `maximumRepairAttemptCount: 1`. This means one initial generation plus at most one
external diagnostic-driven repair task; it is distinct from any internal Builder self-check. The first
NBR profile sets Builder self-repair to zero so BNA-6 can measure the initial result and the explicit repair.

```text
initial Attempt -> Package A -> Capture A -> Evaluation A
  -> if failed, repairable and budget remains:
       Repair Request(Evaluation A diagnostics)
       -> new Attempt
       -> new authored source
       -> Check -> Package B -> Capture B -> Evaluation B
       -> final Run Receipt(A -> B)
```

Repair writes only a new task workspace and may change `scene.ts`, bootstrap JSON, or requested Resource
refs within the frozen Case/Profile budgets. It cannot edit Package A, Capture A, Runtime, Physics, Camera,
Evaluator, Case, Profile, or acceptance thresholds. Package B is promoted only after every gate passes.

The run journal is content-addressed and fail-closed:

- same request ID + same request hash attaches/reuses the recorded outcome;
- same request ID + different hash rejects;
- create timeout is unknown outcome and reconciles by request ID, never immediately resubmits;
- input hashes are rechecked before repair submission and final publication;
- stale identity, no output, timeout, duplicate mismatch, missing Capture, cleanup failure or quarantine
  produces `incomplete` and cannot publish a final passed Receipt;
- old Package/Capture artifacts remain immutable;
- terminal Receipt publishes only after Candidate, Browser, Server, temp and provider cleanup join.

## 10. Representative real Case

The first Case is:

```text
id: cloud-temple-t-gate-native-block
reference: /Users/xiateng/Downloads/测试集/1.png (copied and hash-bound into the Case)
scene brief seed: artifacts/scenes/cloud-ridge-celestial-gate/scene-brief.md
```

The visible facts are foreground spawn platform, central ascending ridge/stairs, surrounding mountain and
cliff masses, and a top gate/building silhouette. The top platform's T junction and left/right playable
continuation are explicitly recorded as inferred continuation, not visible reference evidence.

Required checks:

- player spawns on admitted support and settles on ground;
- central route reaches the upper platform;
- side cliffs and gate columns/walls cannot be crossed;
- top T junction has two readable arms and at least one traversable overlook branch;
- opening/top/side views clearly show foreground, route, mountain layers, T junction and gate mass;
- SDK Subject can move and Reset through the normal Input/Action/Camera chain;
- initial and repaired outputs, when repair runs, have different Attempt/Package/Capture identities.

Run artifacts live under:

```text
artifacts/scenes/cloud-temple-t-gate-native-block/
  case.json
  inputs/
    formal-world-capture-intent.json
  runs/<run-id>/
    inputs/
    attempts/0/
    attempts/1/                 # only when repair runs
    run-receipt.json
```

The Case file stores the exact fixed Intent ref and canonical content hash. Every Attempt reuses that frozen
Case/Intent identity. The production transaction may materialize verified copies into run-owned evidence,
but no run or Attempt may author, default or mutate the Case-level Intent.

The single published result lives outside every immutable Run:

```text
artifacts/scenes/cloud-temple-t-gate-native-block/
  final/
    world-package/
    capture/
    evaluation.json
    launch.json
```

`runs/<run-id>/final` is not a supported alias or fallback. Publication copies the verified
terminal Attempt into the Case-root sibling `.final-staging`, verifies those copied bytes again,
then atomically renames that directory to `final`. Attempt artifacts remain immutable. A verifier
must distinguish the immutable Run candidate from the promoted `final` candidate and must verify
both against the same terminal Attempt and Run Receipt identities; validating the Attempt path a
second time is not promoted-byte evidence.

`final/launch.json` is the sole launch descriptor. Its closed current contract contains exactly
`kind: "native-block-reconstruction-launch"`, `schemaVersion: 1`, `caseId`, `runReceiptRef`,
`runReceiptHash`, `worldPackageRelativePath`, `worldPackageRef`, `worldPackageRootHash`,
`captureReceiptRelativePath`, `captureReceiptHash`, `evaluationRelativePath`, `evaluationHash`,
and `launchCommand`. Paths are Case-root-relative,
must stay inside `final`, and must not be symlinks. The command returns the exact final Package
path. The user launches that path with `worldkit native run`;
this is a BNA verification experience, not current Native Viewer support.

## 11. Delete ledger

No `NBR-1` checkpoint is accepted while both old and new production paths remain:

1. delete `moduleGenerationInputRef/Hash` and every parser/test/consumer/fallback;
2. delete Cloud Ridge's hand-written route/attempt/hash/package assembly after the generic Native package
   command owns it;
3. replace the Canonical-only attempt recorder with one source-neutral owner; do not add a parallel Native
   recorder;
4. move BWB-5 reconstruction Corpus factories out of the Block Profile production root into `/testing` or
   evidence-only exports; production orchestration cannot import them;
5. keep `worldkit run` Canonical-only; extend only the trusted artifact `capture` evidence command to a
   verified Package input after BNA admission, and add the explicit `worldkit native run` Harness command;
6. delete the fixed Cloud Ridge loader after the BNA verification Harness can load a verified Package, but
   retain `apps/native-scene-playground`, its identity-bound Harness fixtures and Native verification entry
   until BNA-7 evidence migration plus the applicable BNA-8 disposition and explicit BNA owner sign-off;
   NBR-1 does not authorize Native Viewer cutover or Native Web UI deletion;
7. delete Case-specific root scripts once stable `worldkit reconstruct`, `worldkit native package`,
   `worldkit native run` and `worldkit capture` commands replace them;
8. delete the four scattered Formal Capture materializer parameters and every caller-owned duplicate
   Capture Intent fixture once the Case-bound `FormalWorldCaptureIntentV1` cutover is green; retain no
   optional Case fields, alias DTO, fallback filename, default Intent or production constants;
9. never add alias DTOs, migration adapters, shadow Plan, third Source, Mesh scan, or Runtime fallback.

## 12. Dependency-aware work graph

| ID | Goal / independently verifiable deliverable | depends_on | blocks | Exclusive ownership / input -> output | Required evidence | Mode |
|---|---|---|---|---|---|---|
| NBR-00 | Freeze design, priority and delete ledger | BNA-5, BWB-5, PHO-6 | NBR-10 | specs/plans/backlog only | source census, links, independent design review | main-agent-only |
| NBR-10 | Correct Attempt identity and add Route/Generation/Case/Profile contracts | NBR-00 | NBR-20, NBR-45A, NBR-50A | `scene-authoring-contracts` + `validation` shared contracts | RED/GREEN parse/hash/adversarial tests | main-agent-only |
| NBR-20 | Add Builder Skill and router-only generation orchestrator | NBR-10 | NBR-30 | Skill + `scripts/reconstruction/generation-*` only | real task, timeout/reconcile/no-output/cleanup | sequential |
| NBR-30 | Add generic Native check/package command and clean break | NBR-20 | NBR-40 | checker/BNA-3 adapter + CLI integration | checker/package tamper/replay/no early Candidate | main-agent-only |
| NBR-40 | Add generic verified-Package BNA verification run route | NBR-30 | NBR-45B, NBR-70 | RuntimeHost/BNA Harness lifecycle only; no Unified Viewer changes | Havok, ready/reset/dispose/authority negatives | main-agent-only |
| NBR-45A | Add formal Capture and Block capture-identity contracts | NBR-10 | NBR-45P | `runtime-contracts` + Block capture inventory contracts only | parser/hash/join/asymmetric rejection tests | sequential |
| NBR-45P | Bind the complete capture inventory into Native Bundle/Package/Receipt | NBR-30, NBR-45A | NBR-45B | Block materializer/settlement + world-package/BNA-3 builder/verifier only | metadata drift, Package tamper, replay and Root/Receipt tests | main-agent-only |
| NBR-45B | Integrate world-side and hosted same-session Capture | NBR-40, NBR-45P | NBR-50B, NBR-70 | runtime-babylon/isolated bridge/Capture CLI only | semantic pass, PNG identity, Camera rollback, cleanup | main-agent-only |
| NBR-50A | Implement pure dimensioned evaluator | NBR-10 | NBR-50B | `validation/reconstruction-evaluator*` only | asymmetric/negative/missing evidence/no pixel-only GO | parallel-safe |
| NBR-50B | Adapt formal Capture/runtime evidence to evaluator | NBR-45B, NBR-50A | NBR-60, NBR-70 | `scripts/reconstruction/evaluate*` only | identity/stale/traversal evidence joins | main-agent-only |
| NBR-60 | Atomically cut over the Case-bound Formal Capture Intent, wire production ports, and add the one-repair journal/orchestrator | NBR-20, NBR-30, NBR-45B, NBR-50B | NBR-70 | temporary exclusive integration ownership of `runtime-contracts` Intent, `validation` Case fields, `formal-capture-request*`, production run ports and run journal; parsed Case/Intent/Package -> immutable run | Intent parser/hash and Case-closure RED/GREEN, no scattered args, max-one/stale/unknown/no-output/cleanup | main-agent-only |
| NBR-70 | Run the real Case with its frozen Formal Capture Intent and publish runnable artifacts | NBR-40, NBR-45B, NBR-50B, NBR-60 | NBR-80 | one Case artifact root only | real Intent hash/closure plus AI/Package/Runtime/Capture/score/repair/manual launch | main-agent-only |
| NBR-80 | Delete replaced/duplicate production and scattered Capture Intent paths | NBR-70 | NBR-90 | package exports, fixed Harness loader, root scripts and obsolete materializer call shape only | clean-break censuses, generic commands and final Package still green | main-agent-only |
| NBR-90 | Exact-SHA closure and docs truth | NBR-80 | later WRC work | review/evidence/docs only | Cloud gates, Mode B + runtime-deep, no P0/P1 | main-agent-only |

NBR-10 contracts are shared seams and land before parallel work. NBR-20, NBR-45A and NBR-50A may overlap
only after those contracts freeze and they own the non-overlapping files shown above. Runtime, Browser
lifecycle, shared exports, CLI dispatch, package manifests and final integration remain main-agent-only.
NBR-60 is the one explicit sequential integration cutover across the already-landed Case and Capture seams;
no NBR-45 or NBR-50 worker may change those files concurrently. Every worker uses an isolated worktree, runs
`pnpm install --frozen-lockfile`, and owns exact non-overlapping files.

## 13. Incremental integration checkpoints

The work does not wait for the full slice before merging:

1. contracts/priority/delete-ledger checkpoint;
2. router-only real AI generation checkpoint;
3. generic check/package checkpoint;
4. generic playable Runtime checkpoint;
5. formal Capture checkpoint;
6. evaluation checkpoint;
7. Case-bound Formal Capture Intent plus production one-repair checkpoint;
8. real Case/final and current-only deletion checkpoint;
9. final exact-SHA review/docs-truth checkpoint.

Each checkpoint runs focused RED/GREEN and necessary typecheck only. The final candidate receives Cursor
Cloud exact-SHA affected/full gates and a separate Mode B + runtime-deep review. GitHub CI queue state does
not block independent downstream work when equivalent exact-SHA Cloud evidence exists.

## 14. Completion definition

`NBR-1` is complete only when all are true:

- a real reference image/Scene Brief causes an AI task to generate a Babylon Native Block workspace;
- the task runs through the unified Codex router with frozen formal model/Profile/Prompt/budgets;
- formal checker, Package and Receipt accept the generated output before Runtime Candidate allocation;
- the existing RuntimeHost loads it and SDK-owned Havok/Subject/Input/Action/Camera make it playable;
- formal identity-bound opening/top/side Capture and collider/runtime evidence are published;
- the Case-bound `formal-world-capture-intent.json` bytes/hash close exactly to the Case, parsed Request and
  measured semantic/traversal evidence, with no scattered caller parameters or inferred fallback;
- the evaluator emits stable per-dimension results and explainable diagnostics;
- at least one bounded diagnostic-driven repair produces a new audited Package/Capture identity;
- `cloud-temple-t-gate-native-block` launches locally, spawns/grounds/moves, blocks walls and passes the
  required route;
- no third Scene Source, shadow Plan, Mesh scan, old API, alias, fallback, duplicate Host or fake formal
  evidence remains;
- focused gates plus final exact-SHA Cloud gates/review have no open P0/P1;
- design, plan, backlog and code status agree without claiming full BNA-6/7 or WRC-1 completion.
