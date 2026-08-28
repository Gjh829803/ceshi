# SDD ledger — plan: docs/superpowers/plans/2026-08-29-babylon-native-runtime-scene-source-identity-clean-break.md

Execution baseline: `8ae4249cb53de0ce91643540a64dac7121fcfc60` on `explore/scene-reconstruction-api`; `origin/main` at `febba985255b77a180b54b3b88be7f36601ff9c5` is an ancestor; worktree was clean; Task 5 checkpoint stash `4ef4c2e25fceaa5b12ae3fd543450af9ed1cbd9b` retained unchanged.

Foundation regression ruling: the full gate initially exposed the proportional padded step-up regression. The final behavior-level reproducer used the actual medium Subject capsule, exact 0.04 m Tick proposal, and 0.2 m step. Old behavior failed with only 0.029411766108344617 m vertical progress; the accepted implementation uses a full legal height only after strict static/walkable contact settlement, keeps horizontal progress inside the Tick proposal, and falls back to the proportional supported candidate. Focused Babylon/Havok conformance (22), Character Body contracts (63), Runtime integration (131), and typecheck passed at `8ae4249`.

## Preflight consistency and ownership rulings

| Tasks | Producer -> consumer / shared owner | Ruling |
|---|---|---|
| 00 -> 01 | hash/type census -> Protocol and World Identity | The recorded 629/91 type-symbol hits are a closed migration input; the ownership test scans all packages and admits no alias/re-export. |
| 01 -> 02/03/06/07 | Protocol hash + Package Ref -> identity/bootstrap/package/runtime | World Identity depends only on Protocol and lodash-es; WorldPackage must not re-export moved ownership. |
| 02 -> 04/05/07/08/09 | Gameplay + Runtime Bootstrap -> compiler/runtime/kernel/protocols | Runtime Bootstrap is frozen before Scene Plan deletion so no adapter reconstructs Runtime closure from scene data. |
| 03 -> 09D/10 | Route/Attempt identity -> orchestration and verifier | Contracts are recorded without enabling Native production. Evidence-profile-only changes invalidate `source-authoring`. |
| 04 -> 05 | temporary V5 projector -> terminal split | The projector is migration evidence only and is deleted by Task 05. |
| 05 -> 06/07/08/09 | Scene Plan + Runtime Bootstrap -> Package/Runtime/consumers | Compiler creates both artifacts in one pass; no serialized rejoin or shadow Plan. |
| 06 -> 07 | Package Root -> post-root World Build Identity | Identity transport files are excluded from root inventory to avoid self-reference. |
| 07 -> 08 | formal source-neutral RuntimeHost -> Babylon split | Formal Native remains `WORLDKIT_NATIVE_SCENE_PRODUCTION_NOT_ADMITTED` before allocation. |
| 08 -> 09A..D | shared Kernel -> protocols/transports/callers | Experimental Cloud Ridge is preservation evidence only, never BNA-4 admission evidence. |
| 09A -> 09B -> 09C -> 09D | value contracts -> transports -> Canonical-only operations -> callers | Serialized because files and generated fixtures overlap; generic identity and Plan identity must not be substituted for one another. |
| all -> 10 | exact terminal tree -> evidence/review | Final review uses the actual diff and complete gate matrix; worker/focused success is not integration proof. |

Ruling: execute every task sequentially in this main checkout. Although BNA1-02 and BNA1-03 are dependency-independent after BNA1-01, they share `pnpm-lock.yaml` and `scripts/lib/test-gate-manifest.ts`; Runtime Bootstrap executes first. Cost if wrong: less concurrency, but no ambiguous shared-contract ownership.

Ruling: the branch already contains the reviewed Foundation and its retained stash, so do not move the active task into another worktree. Cost if wrong: branch isolation exists without a second filesystem checkout.

Ruling: `executionPlanHash` is retained only for Canonical compiler/Plan/Package/Edit/Route members. Mixed DTO files must migrate their generic envelopes and keep the Plan field only in the closed Canonical/Route member. Cost if wrong: affected mixed files require a narrower follow-up, never a compatibility alias.

Ruling: BNA1-07 may parse the Native Scene Source discriminator but must terminate before Bundle resolution, Babylon adapter invocation, or Candidate allocation. BNA1-08 may exercise only the explicitly trusted-local harness. Cost if wrong: formal Native admission remains unavailable until BNA-3/BNA-4, as designed.

Ruling: generated examples and scene evidence are regenerated only through their recorded owners. Existing JSON is not an authority for the new hashes. Cost if wrong: expensive evidence replay, but no hand-authored false receipt.

## Progress

- BNA1-00: complete in the census commit; baseline, retained stash, versions, schema/parity gate, generated files, ownership graph, and terminal dispositions recorded.
- BNA1-01: complete. RED failed because `world-build-identity.js` did not exist. GREEN owns `Sha256HashV1` only in Protocol, moves Package Ref ownership out of WorldPackage, adds the closed source-neutral identity parser/canonical bytes/hash, and registers identity plus dependency/ownership tests. Focused Identity/Package Store tests passed (13), the broader migrated contract sample passed (323), workspace boundary and test census passed, and typecheck passed.
- BNA1-02: complete in `886a3d3`. Gameplay RED produced 13
  Bootstrap failures before `initialRelationshipStates` became a required,
  ID-canonical, accessor-free, body-hashed field. Runtime Bootstrap RED then
  rejected the asymmetric full-closure fixture until the asset Transform and
  Subject collider schemas were closed over their exact current fields. GREEN
  adds the Draft 2020-12 Schema/export, exact detached Parser, canonical body
  hash/full bytes, Gameplay-lock and controlled/Camera Subject closure, nested
  DTO closure coverage, signed-zero rejection, and production schema validation
  through the package-declared Ajv dependency. Runtime-owned DTO names moved out
  of `execution-plan.ts`; the temporary V5 Plan retains only an internal
  descriptor-plus-placement composition for migration evidence. All Bootstrap
  factories now publish initial relationships explicitly; normalized-world
  callers preserve the prior Plan relationships and genuinely relationship-free
  fixtures use `[]`. Evidence: focused Bootstrap tests 28/28, broad affected
  Runtime/Gameplay/Compiler/Babylon tests 531/531, workspace boundary floor,
  test census (304 total / 272 contract / 32 resource-heavy), typecheck, and
  `git diff --check` passed.
- BNA1-03: complete in `8410cb3`. The focused RED failed on
  the intentionally missing package and implementation. GREEN adds the closed
  Canonical / Babylon Native / Capability Gap Route union, immutable Canonical
  / Native Attempt inputs, mutually exclusive completed / rejected / tool-error
  Results, direct Protocol hash ownership, canonical bytes and whole-object
  hashes, uint32 Seed rejection including signed zero, recursively accessor-free
  parsing, sorted set-like refs/assets/reason codes with duplicate rejection,
  and fail-closed `route-decision` / `source-authoring` invalidation without a
  speculative `runtime-replay` member. The package depends only on Protocol and
  lodash-es and does not enter Authoring, Compiler, Runtime, Babylon,
  WorldPackage, provider, or asset-production layers. Evidence: focused tests
  17/17, workspace boundary floor, test census (306 total / 274 contract / 32
  resource-heavy), typecheck, and `git diff --check` passed.
- BNA1-04: complete in the current pending commit. The missing-projector RED
  failed before the temporary migration implementation existed. GREEN uses one
  asymmetric parsed V5 fixture with nondefault gravity/Camera, a rigged Subject,
  multiple Control Feels, mounted relationship state, water, static Collider,
  Heightfield and static Traversal Surfaces, layout placements, and a full
  mixed Resource Lock. Machine-checked field accounting covers every actual V5
  top-level key exactly once and explicitly deletes only Host-owned
  `runtimeBackend` and render-target-owned Camera `aspectRatio`. The projector
  requires exact Gameplay lock and relationship equality, partitions Subject
  placement from Runtime descriptors and Scene locks from Runtime locks, and
  recomputes independent hashes. The same fixture generated the durable receipt
  with source commit and exact four-artifact hashes; normal test mode revalidates
  it without rewriting. The Compiler gate exposed two stale golden V5 hashes
  left by BNA1-02's new required empty relationship field changing the Gameplay
  Bootstrap/full-lock hash; only those two deterministic expectations changed.
  Evidence: projection 5/5, Compiler 84/84, Runtime Contracts 79/79, workspace
  boundary floor, test census (307 total / 275 contract / 32 resource-heavy),
  typecheck, and `git diff --check` passed. The review explicitly marks this as
  migration-only, non-production-admission evidence and requires the temporary
  projector/test to be deleted by BNA1-05.
- BNA1-05: complete in the pending terminal-compiler commit. The Canonical
  compiler now emits exactly one `CanonicalSceneExecutionPlanV1` plus one
  `WorldRuntimeBootstrapV1`; Scene placement/traversal/static geometry and
  Runtime Subject/physics/control/camera closure have disjoint owners. The V5
  Plan parser/compiler/projector and their executable tests are deleted, and
  direct consumers use the new current-only names without aliases. Evidence:
  Canonical Plan, Runtime Contracts, Compiler, Traversal Lock, Capability
  Compile, and Authoring normalization focused gates passed 95/95; the
  executable/source V5 symbol census, typecheck, and `git diff --check` passed.
- BNA1-06: complete in the pending Package commit. WorldPackage now has one
  current schema/format pair, three explicit Canonical entry artifacts, and a
  post-root World Build Identity whose transport file is excluded from the
  Root inventory. The directory verifier, memory/file/IndexedDB stores,
  signing, resource resolution, Authoring Host preparation/recovery, and
  Validation projection were migrated without V1/V2 aliases. The file adapter
  additionally verifies byte-exact integrity, receipt, and identity transport
  metadata instead of reconstructing past tampering. Evidence: Package,
  Authoring Host, Validation subject, store/resolver/signing focused gates
  passed 150/150 after the boundary dependency assertion was updated; file
  adapter/signing security regressions passed 17/17; typecheck, old Package
  symbol/path census, and `git diff --check` passed.
- BNA1-07: complete in the pending RuntimeHost commit. The Host parses one
  exact World Build Identity, Gameplay Bootstrap, Runtime Bootstrap, and closed
  Scene Source. Canonical admission cross-checks the full closure and publishes
  only `worldBuildIdentityHash` to generic Session/Gameplay/Snapshot state;
  initial relationships come only from Gameplay Bootstrap. The Native member
  is parsed but fails with
  `WORLDKIT_NATIVE_SCENE_PRODUCTION_NOT_ADMITTED` before adapter invocation or
  Candidate allocation. Atomic Canonical rollback and current-session state
  ownership remain unchanged. Evidence: RuntimeHost, WorldSession, Gameplay
  state/contracts, character transaction, state store, and lifecycle tests
  passed 494/494; typecheck and `git diff --check` passed.
- BNA1-08: complete in the pending Babylon shared-kernel commit. Canonical
  construction now consumes only `CanonicalSceneExecutionPlanV1`, while
  Subject, physics, control, Camera, and fixed-Tick initialization consume the
  independently parsed `WorldRuntimeBootstrapV1`. The explicitly trusted-local
  Native playground parses checked-in Gameplay and Runtime Bootstrap artifacts,
  registers its existing Spawn Marker/static Collider contribution, and enters
  the same Kernel without compiling, loading, hashing, or fabricating a
  Canonical Plan. Formal RuntimeHost Native admission remains rejected before
  allocation by BNA1-07. Structural coverage scans the Native runtime sources
  for forbidden Plan/compiler names; behavioral coverage preserves Native
  geometry, contribution, movement/collision/jump/Camera/reset, cleanup, and
  isolation while exercising Canonical placement separately. Evidence: all
  Runtime Babylon and Native playground tests passed 495/495 across 31 files;
  `pnpm typecheck`, `pnpm build`, `pnpm build:native-scene`, the Native-source
  forbidden-symbol census, and `git diff --check` passed.
- BNA1-09A: complete in the pending generic-protocol commit. Runtime Session
  ready events, Simulation Takes, Whitebox tri-view manifests, Control Capture
  bundle identity files/manifests/inspection, and the headless Session boundary
  now require `worldBuildIdentityHash`. Their closed parsers reject the former
  generic `executionPlanHash`; Route Browser evidence and Canonical staging
  retain explicit Plan identity. The Control Capture reader additionally checks
  exact current manifest/identity key sets, and Runtime Session durable binding
  compares World Build identity before resume. One trusted Canonical
  WorldPackage builder now supplies the same deterministic package/root/build
  identity to build, capture, and Take callers instead of reconstructing
  task-specific roots. Evidence: focused Runtime Contracts, Control Capture,
  Take, WAL, and Session tests passed 112/112 across 16 files; typecheck,
  workspace boundary floor (49 registered debt entries), test census (304
  total / 272 contract / 32 resource-heavy), and `git diff --check` passed.
- BNA1-09B: complete in the pending transport checkpoint. Generic
  WorldPackage Validation subjects, non-Route CLI results, build artifacts,
  Package summaries, Studio trusted-import persistence, Runtime Snapshots, and
  Whitebox tri-view manifests now carry `worldBuildIdentityHash`; closed
  generic readers reject the former Plan field instead of accepting an alias.
  The trusted build-artifact command derives the same deterministic identity
  as `worldkit validate` from the complete Canonical WorldPackage and includes
  the independent Gameplay Bootstrap needed by the runtime configuration.
  Evidence: Validation/Route focused tests 144/144, Studio 75/75, CLI and
  Package command tests 41/41, typecheck, workspace boundary floor, test census
  (304 total / 272 contract / 32 resource-heavy), and `git diff --check`
  passed.
- BNA1-09C: complete in the pending Canonical-consumer checkpoint. Route,
  Authoring Edit, Full Reload, and World Change remain explicitly bound to the
  terminal `CanonicalSceneExecutionPlanV1` and `executionPlanHash`; no generic
  World Build hash substitutes for Plan identity. Route resources now use the
  existing authoring/runtime traversal closure (excluding Gameplay Bootstrap),
  rather than incorrectly comparing either the complete WorldPackage lock or
  the Scene-only lock. Browser Route publication uses the Route receipt lock,
  while its generic Validation subject uses World Build identity. Evidence:
  Authoring Edit/Host and World Change tests 62/62, Route evaluator/publication
  tests within the 144-test Validation gate, Heightfield source 22/22, trusted
  Route runner 12/12, and real `worldkit run` Route transport 1/1 passed.
- BNA1-09D: not started.
- BNA1-10: not started.
