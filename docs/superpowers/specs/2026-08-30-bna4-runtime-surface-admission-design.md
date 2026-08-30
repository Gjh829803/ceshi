# BNA-4 Verified Native Runtime and Surface Admission Design

**Status:** implementation authority; code not yet accepted  
**Date:** 2026-08-30  
**Program:** WRC-1 / BNA-4  
**Baseline:** `origin/main@2fd8c1c2694a861e213ad2c72e9cb3aefec087ce`  
**Upstream authority:**

- `docs/superpowers/specs/2026-08-28-ai-friendly-babylon-native-world-authoring-design.md`
- `docs/superpowers/specs/2026-08-29-babylon-native-authoring-production-closure-design.md`
- `docs/superpowers/specs/2026-08-30-wrc1-world-reconstruction-and-control-milestone-design.md`
- `docs/reviews/runtime-deep-review-checklist.md`

## 1. Decision

BNA-4 admits a verified Babylon Native WorldPackage into the existing single
`RuntimeHost` and `BabylonWorldRuntime`. It does not add a Native Runtime, a Native Gameplay
Kernel, a third Scene Source, or a JSON/Babylon hybrid geometry path.

```text
VerifiedBabylonNativeWorldPackageDirectoryV1
  + Host-owned exact bundle loader
  + RuntimeWorldAdapterDescriptorV1
            |
            v
one Candidate Babylon Scene
  -> replay packaged Native Module once
  -> authority audit + actual Contribution
  -> byte-exact packaged Contribution match
  -> Profile-based spawn/surface admission
  -> SDK-private collision Meshes + Havok bodies
  -> existing Subject / Gameplay / Camera / fixed Tick
  -> RuntimeHost publication barrier
```

`RuntimeWorldConfigurationV1` remains a Babylon-free, serializable control-plane value. Its Native
Scene Source continues to contain only Bootstrap and content-addressed Module Bundle ref. Bundle
bytes, module functions, asset resolvers, Babylon handles and physics handles never enter that
contract. The Adapter composition root resolves `worldPackageRef` to the exact already-verified
package before it calls `BabylonWorldRuntime`.

## 2. Scope

BNA-4 delivers:

1. one source-neutral `RuntimeWorldAdapterDescriptorV1` accepted by the existing `RuntimeHost`;
2. a formal Babylon Native runtime input made only from a verified package plus a Host-owned module
   loader;
3. exact Package/Receipt/WorldBuildIdentity/Bundle/Bootstrap/Contribution checks before physics,
   Subject, Camera or publication;
4. profile-based static Surface admission and supported spawn validation;
5. SDK-private collision Mesh, `PhysicsShapeMesh`, `PhysicsAggregate`, stable Surface/Subshape
   metadata and real Havok support;
6. atomic initial create, replace, reset and dispose behavior with complete candidate cleanup; and
7. deletion of the experimental raw Native runtime input and the production-not-admitted guard.

BNA-4 does not deliver:

- arbitrary untrusted JavaScript isolation, tenant caps, timeout/kill or credential/network sandboxing
  (BNA-5);
- model success-rate or bounded AI repair evaluation (BNA-6);
- formal Capture, Route or navigation publication (BNA-7);
- Block Profile screenshots/corpus/optimization (BWB-3 through BWB-6); or
- product-level multi-floor navigation, caves, dynamic surfaces, NPC paths or `goTo`.

## 3. Current-tree evidence and gaps

The baseline already provides:

- `RuntimeSceneSourceV1` as an exact Canonical/Native union;
- a verified Native package containing exact bundle bytes, locks, Bootstrap, Contribution,
  Gameplay Bootstrap, World Runtime Bootstrap and World Build Identity;
- Native Candidate authority audit and deterministic dual replay in `@whitebox-world/native-babylon`;
- stable `colliderSubshapeId` and `traversalSurfaceId` derived in Runtime Contracts;
- an experimental Babylon path that can create private collision Meshes and Havok aggregates; and
- an atomic RuntimeHost replacement/publication mechanism.

The gaps are structural:

- RuntimeHost narrows the Adapter descriptor to Canonical and rejects Native in create/replace;
- Babylon runtime accepts raw `{ bootstrap, module, assets, budget }`, so Package identity and the
  frozen Contribution are not its authority;
- the actual runtime replay result is not compared with the packaged Contribution before Havok;
- spawn is only checked against world bounds, not supported by an admitted static Surface;
- initial RuntimeHost creation can lose an Adapter-created port if `WorldSession.create()` fails; and
- the Native Playground bypasses the formal RuntimeHost/verified-package route.

## 4. Alternatives considered

### 4.1 Accepted: verified-package resolver plus the shared Runtime

The Runtime Adapter resolves the descriptor's `worldPackageRef` to a
`VerifiedBabylonNativeWorldPackageDirectoryV1`, and passes that package with one Host loader into the
existing Babylon Runtime. This keeps persistent identity in JSON, executable capability at the Host
boundary, and Gameplay/physics authority in one Kernel.

### 4.2 Rejected: put bundle bytes, callbacks or Babylon handles in Runtime configuration

That would make the control plane non-serializable, mix Host capability with world identity, prevent
stable hashing, and expose provider details to RuntimeHost. It would also make replace/replay
semantics dependent on object identity rather than Package identity.

### 4.3 Rejected: retain raw Native create beside formal Package create

Two Native runtime inputs would be two admission authorities. Tests and examples would continue to
exercise the easier raw path, while production used Package admission. The repository is unreleased,
so BNA-4 performs a current-only clean break and removes the raw path and its callers.

### 4.4 Rejected: create a Native-specific RuntimeHost or Gameplay package

The Scene Source changes visual construction, not Gameplay truth. A separate Runtime would duplicate
Subject, Camera, input, fixed Tick, Havok queries, lifecycle and diagnostics. Native and Canonical
must converge immediately after Scene construction.

## 5. Authority and ownership

| Fact or resource | Sole owner | BNA-4 consumer | Forbidden shadow owner |
|---|---|---|---|
| Package bytes, manifest, receipt and identity | `@whitebox-world/world-package` verifier | Adapter/package resolver | Native Module or Babylon Scene |
| Module Bundle bytes and ref | verified WorldPackage | Host module loader | Runtime JSON or scene-local fetch |
| module build execution and registration audit | `@whitebox-world/native-babylon` Host API | Babylon Candidate | direct `module.build()` caller |
| frozen static collider/spawn Contribution | packaged Contribution | Runtime admission | visual Mesh inspection |
| actual Candidate Contribution | Native admission replay | exact-match gate | packaged data without replay |
| Surface/Profile membership | locked Contribution + Registry Lock | Surface admission | Mesh name/tag convention |
| collision Mesh/shape/body | `runtime-babylon` | Gameplay/Havok queries | Native Module |
| support and movement | Character BodyPort/Havok | Gameplay movement | height/visual inference |
| Subject, Camera, input, fixed Tick | existing SDK owners | shared Runtime | Native Module |
| create/replace/publication/dispose transaction | RuntimeHost | Adapter and WorldSession | scene-local loop/timer |

## 6. Contract changes

### 6.1 RuntimeHost remains source-neutral

`RuntimeWorldAdapterDescriptorV1.sceneSource` changes from the Canonical extraction to the full
`RuntimeSceneSourceV1` union. `parseRuntimeHostCreateOptions`, replacement parsing and `descriptor()`
stop calling the Canonical-only guard. No other RuntimeHost public field changes.

The Adapter must still fail closed if it cannot resolve the exact WorldPackage declared by
`worldBuildIdentity.worldPackageRef`. RuntimeHost never receives a package directory or Babylon
module object.

### 6.2 Formal Babylon Native input

The raw Native branch of `BabylonWorldRuntimeOptions.sceneSource` is replaced by:

```ts
export interface BabylonNativeSceneModuleLoadRequestV1 {
  readonly sceneModuleBundleRef: NativeSceneModuleBundleRefV1;
  readonly sceneModuleBundleManifest: BabylonNativeSceneModuleBundleManifestV1;
  readonly sceneModuleBundleBytes: Uint8Array;
  readonly dependencyLock: BabylonNativeDependencyLockV1;
}

export interface BabylonNativeSceneModuleLoaderV1 {
  load(
    request: BabylonNativeSceneModuleLoadRequestV1,
  ): Promise<BabylonNativeSceneModuleV1>;
}

type BabylonNativeRuntimeSceneSourceV1 = Readonly<{
  kind: "babylon-native-scene";
  verifiedWorldPackage: VerifiedBabylonNativeWorldPackageDirectoryV1;
  moduleLoader: BabylonNativeSceneModuleLoaderV1;
}>;
```

The loader is Host capability, not persistent world data. BNA-4 validates that it is called exactly
once with fresh bundle bytes and the exact locked manifest/ref/dependency lock. BNA-5 later constrains
where and how that loader executes; BNA-4 must not call trusted-local execution a security sandbox.

### 6.3 Package-derived assets and budget

Runtime derives the Native admission budget from `manifest.resourceBudget`; no caller-supplied budget
is accepted. The Package asset resolver:

- resolves only exact `assetResourceRef` rows in the locked Asset Lock;
- returns fresh byte copies from `immutableAssetBytesByResourceRef`;
- returns locked media type, hash, size and provenance metadata;
- rejects absent, duplicate or inconsistent entries; and
- performs no network or filesystem fallback.

Host/tenant caps remain additive work for BNA-5.

## 7. Admission transaction and failure cutoffs

The Native Candidate sequence is fixed:

1. parse and match Runtime descriptor, verified Package receipt and World Build Identity;
2. match Bootstrap, Module Bundle ref/hash, dependency/asset lock hashes and Registry membership;
3. call the Host module loader once with exact locked bytes;
4. allocate one Engine and one Candidate Scene;
5. invoke the existing Native Candidate admission once inside that Scene;
6. require a passed authority audit and obtain the actual Contribution;
7. compare canonical bytes and hash of the actual Contribution with the packaged Contribution,
   Package Manifest, Build Receipt and World Build Identity;
8. admit traversal bindings and supported spawn from the frozen Contribution;
9. only then enable Havok and create private collision Meshes/shapes/aggregates;
10. create the existing Subject, Gameplay and Camera owners;
11. cross the existing Candidate publication-ready barrier; and
12. atomically replace the previous WorldSession, then dispose the previous session.

Steps 1 through 8 must occur before any Native collider body, controlled Subject or SDK Camera is
created. Engine and Candidate Scene allocation is allowed before Module execution because the audited
module needs a Host-provided Candidate Scene. Any failure disposes everything allocated so far and
does not mutate the current published session.

## 8. Contribution and identity matching

Runtime does not trust a packaged Contribution without replay, and does not trust a replay result
without Package identity. Admission requires all of the following:

- `actualContributionHash === hash(packagedContribution)`;
- canonical bytes of actual and packaged Contributions are equal;
- both equal the contribution identity in the Native Package Manifest and Receipt;
- Bootstrap `sceneModuleRef`, `spawnMarkerId`, controlled entity, Gameplay Bootstrap, gravity and
  Camera values match the shared Runtime inputs;
- Module Bundle ref and hash match Bundle Manifest, Package Manifest and World Build Identity; and
- every traversal profile ref occurs exactly once in the verified Registry Lock with the locked hash.

Mismatch uses stable, stage-specific diagnostic codes and rejects before physics. It is never
repaired by choosing the packaged Contribution over runtime replay or vice versa.

## 9. Profile-based Surface and spawn admission

### 9.1 Stable identity

Each static collider retains the already-frozen:

- author-facing collider `id`;
- `colliderSubshapeId` derived from collider identity and geometry;
- optional `surfaceEntityId` and `traversalSurfaceId`; and
- locked `traversalSurfaceProfileRef`.

Private collision Mesh metadata carries those values read-only so existing Havok query adapters can
project support to stable Surface identity. Mesh names are debug labels only and never identity.

### 9.2 Traversable face selection

`worldkit://traversal-surface-profile/ground.static@1` has
`faceSelectionMode: "subject-slope-compatible"`. Runtime resolves the locked Profile and admits an
upward triangle as support only when its normal is compatible with the controlled Subject's locked
`collider.maxSlopeDegrees`. `not-traversable` colliders can block movement but cannot support spawn or
publish a Traversal Surface.

### 9.3 Supported spawn

The Native spawn marker is the controlled Subject origin/feet convention already consumed by the
Babylon Subject adapter. Admission projects the spawn XZ point onto eligible upward triangles and
requires:

- at least one eligible static Surface under the point;
- the selected topmost support Y to equal spawn Y within the existing Babylon character-controller
  collision tolerance (`0.0001 m`);
- no higher admitted blocking triangle intersects the initial capsule volume; and
- the initial capsule is inside Package world bounds.

The tolerance is numerical coherence, not authoring forgiveness. A marker intentionally above a
surface, below it, on a non-traversable collider, on a too-steep face or outside all triangles is
rejected. Native scenes must place feet on support; Runtime does not use “fall until landing” as
spawn repair.

## 10. Havok construction and lifecycle

For every admitted collider Runtime creates a private unrendered Mesh from the frozen world-space
positions and triangle indices, then a `PhysicsShapeMesh` and a mass-zero `PhysicsAggregate` using
the frozen friction/restitution ratios. The Native visual Mesh remains independent and may be
disposed without invalidating the SDK collision proxy.

The installed Babylon `@babylonjs/core@9.23.0` source establishes that
`PhysicsAggregate.dispose()` disposes its body and disposes only aggregate-owned shapes. When an
existing `PhysicsShape` is supplied, the aggregate sets `_disposeShapeWhenDisposed = false`.
Therefore BNA-4 owns and disposes in this order:

1. gameplay/runtime queries, Subject assets, entities and Camera components;
2. each `PhysicsAggregate` body;
3. each separately supplied `PhysicsShapeMesh`;
4. each private collision Mesh;
5. Candidate Scene; and
6. Engine.

Cleanup is idempotent at the SDK boundary. Partial construction and throwing cleanup retain the first
failure for diagnostics while still attempting all remaining owned disposers. Scene disposal is not
used as a substitute for explicit Host ownership.

RuntimeHost initial create receives the same cleanup guarantee as replacement: if the Adapter
created a port and `WorldSession.create()` or initial binding/readiness fails, the port/session is
disposed before the stable Host error is returned. Replacement failure preserves the old ready
session and disposes only the candidate.

## 11. Reset, replacement and concurrency

- Reset uses the existing WorldSession/Gameplay reset path; it does not rerun the Native module or
  create a second Scene. Static Surface identity is unchanged.
- World replacement creates a separate Candidate Scene and may temporarily require two complete
  Runtime instances. Existing Adapter residency preflight remains authoritative.
- Candidate readiness must prove physics, controlled Subject and Camera readiness before publication.
- Two RuntimeHost instances using the same verified Package receive distinct module execution,
  Engine, Scene, Havok bodies, input state, Camera and disposal ownership while producing the same
  locked Contribution hash.
- A stale or failed Candidate never changes the active session, generation, Camera, bodies or input.

## 12. Diagnostics and debug evidence

BNA-4 uses one stable Native runtime diagnostic family with at least these facts:

- package/descriptor identity mismatch;
- bundle loader failure or invalid module;
- runtime Contribution mismatch;
- unsupported/missing Surface Profile;
- unsupported spawn with collider/surface context;
- physics construction/readiness failure; and
- cleanup failure.

Diagnostics contain resource identities and stable collider/surface IDs, never Babylon handles,
absolute paths, credentials, stack traces or raw asset bytes. Existing collider overlay consumes the
same private proxy metadata; BNA-4 does not add a second debug geometry source.

## 13. Current-only deletions

The accepted tree must contain none of the following:

- `WORLDKIT_NATIVE_SCENE_PRODUCTION_NOT_ADMITTED`;
- Canonical-only `RuntimeWorldAdapterDescriptorV1.sceneSource` narrowing;
- raw Native runtime fields `module`, `assets` or caller-controlled `budget`;
- direct Native Playground calls that bypass RuntimeHost/verified Package admission;
- a second Native create API, compatibility alias, legacy parser or optional fallback; or
- a Native-owned Camera, physics body, input listener, render loop, timer or Gameplay state.

## 14. Verification contract

Focused RED-to-GREEN coverage must include:

1. RuntimeHost accepts exact Native configuration and rejects malformed/mismatched identity;
2. Package loader receives exact bytes once; failure happens before Scene allocation where possible;
3. actual Contribution drift/tamper fails before Havok, Subject and Camera;
4. asset bytes/metadata are exact, copied and closed to undeclared refs;
5. supported flat/asymmetric/sloped spawn succeeds; air, underground, non-traversable, steep and
   obstructed spawn fails;
6. stable Surface/Subshape metadata reaches real Havok support queries;
7. step traversal, ledge departure and visual-proxy disposal remain correct;
8. 30/60/120-like render cadence has identical fixed-Tick authoritative hashes;
9. two instances do not share Scene, body, Camera, input or disposal state;
10. initial create, replacement, reset, partial construction and throwing cleanup are atomic;
11. Canonical Runtime tests remain green; and
12. source census proves the old raw API and production guard are absent.

Before merge, run the affected package tests, `pnpm typecheck`, relevant Native/Havok Browser
verifier, production builds, then one exact-SHA Cursor Cloud full gate and one independent
full-dimension/runtime-deep review. Do not repeat an unchanged full gate locally.

## 15. Dependency-aware work graph

| ID | Goal and independently verifiable deliverable | depends_on | blocks | Exclusive ownership / stable input -> output | Evidence | Mode |
|---|---|---|---|---|---|---|
| BNA4-00 | Freeze this design and an executable plan | BNA-3 | all BNA4 tasks | BNA-4 docs only; merged BNA-3 tree -> approved contracts/tasks | link, diff, contradiction and placeholder review | `main-agent-only` |
| BNA4-10 | Generalize RuntimeHost Scene Source and close initial-candidate cleanup | BNA4-00 | BNA4-30/40 | `runtime-host`; pure configuration -> source-neutral descriptor/atomic port ownership | RED/GREEN create/replace/cleanup tests | `sequential` |
| BNA4-20 | Build formal verified-package/module/asset input and identity preflight | BNA4-00 | BNA4-30 | `runtime-babylon` Native input helpers; verified package + loader -> prepared locked admission | loader/asset/tamper/copy tests | `sequential` |
| BNA4-30 | Replay and exact-match the runtime Contribution before SDK allocation | BNA4-10/20 | BNA4-40/50 | Native branch in `runtime-babylon`; prepared package -> admitted Candidate Contribution | drift, authority, cutoff, two-instance tests | `main-agent-only` |
| BNA4-40 | Admit Profile-based Surface/spawn and attach private Havok proxies | BNA4-30 | BNA4-50/60 | Surface helper + Babylon collision construction; frozen Contribution/profile/Subject -> support-ready world | geometry, support, step, ledge, overlay, proxy drift tests | `sequential` |
| BNA4-50 | Migrate the formal Adapter/Playground path and delete raw APIs | BNA4-30/40 | BNA4-60/90 | composition roots, examples, exports and census; descriptor + verified package -> single RuntimeHost path | Browser readiness, clean-break census | `sequential` |
| BNA4-60 | Close create/replace/reset/dispose and cadence/isolation evidence | BNA4-40/50 | BNA4-90 | Runtime integration tests only; exact package -> atomic playable session | real Havok, 30/60/120, two-session, throw cleanup | `main-agent-only` |
| BNA4-90 | Exact-SHA gates, independent review, PR, merge and status switch | BNA4-10..60 | BNA-5, BNA-7, BWB-4 | review/status evidence only; candidate SHA -> scoped GO/NO-GO | affected gates, Cloud full gates, D1-D6/runtime review, ancestry | `main-agent-only` |

No task may weaken a preceding identity or admission gate to make a later test pass. A worker result,
passing build, Cloud success label or rendered scene is not integration proof without the exact
Package/Contribution/Surface/lifecycle evidence assigned above.

## 16. Completion definition

BNA-4 is complete only when the accepted `main` tree proves all of the following:

1. verified Native packages enter the same RuntimeHost used by Canonical worlds;
2. runtime replay exactly matches the Package-frozen Contribution before Havok/Subject/Camera;
3. Profile-compatible Surface identity and supported spawn are fail-closed;
4. SDK-owned private Havok collision supports the real controlled Subject;
5. create/replace/reset/dispose are atomic and leak-free under adversarial failure;
6. the raw Native runtime input and production guard are deleted;
7. Canonical behavior is not regressed; and
8. exact-SHA affected gates and independent review contain no open P0/P1/P2 finding.

