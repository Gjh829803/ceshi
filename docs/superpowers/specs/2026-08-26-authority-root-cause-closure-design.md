# Authority Root-Cause Closure Design

**Status:** implementation authority

**Baseline:** `origin/main@749b594bb35830b5c92f8e6b7df1c645e36fc530`

**Finding authority:** `docs/reviews/2026-08-24-workspace-structure-authority-review.md`

## 1. Goal and selection rule

Close the findings that currently violate a frozen design rule, expose competing public authority, produce a false success receipt, or advertise an entrypoint that does not compose a runnable product. Preserve the current Babylon/RuntimeHost/Authoring architecture and defer broad reorganizations that have only maintainability evidence.

A finding is in the current implementation slice when all of the following hold:

1. the contradiction is reproduced on current `main`;
2. a project authority already decides the correct behavior or owner;
3. the fix has a bounded integration point and independent evidence; and
4. leaving it open can mislead an AI, CLI, Browser, Host, or release decision.

Large-file size, package count, or stylistic duplication alone are not admission criteria.

## 2. Current root-cause slice

### 2.1 Atomic Preview authority (`HSE-00`)

The design in `2026-08-25-atomic-preview-bootstrap-design.md` remains authoritative. HSE-00 is implemented first as a standalone reproducer, then updated after HSE-01 to consume the final current-only capture contract. One Studio request must bind attempt, attempt start, Canonical AuthoringSpec hash, complete final implementation map, and its visual capture groups.

### 2.2 Hosted visual contract clean break (`HSE-01`)

`@whitebox-world/runtime-contracts` is the only cross-process owner for hosted draft/final maps, visual groups, whitebox capture results, and the whitebox tri-view manifest.

The current-only contract is:

- `SceneBriefImplementationMapDraftV1`
  - `kind: "worldkit-scene-brief-implementation-map-draft"`
  - `schemaVersion: 1`
  - `sceneId`, `authoringSpecId`, `visualTargetMappings`
- `SceneBriefImplementationMapV1`
  - `kind: "worldkit-scene-brief-implementation-map"`
  - hashes plus `visualTargetMappings` and `visualCaptureGroups`
- `VisualCaptureGroupV1`
  - `visualTargetId`, `runtimeEntityIds`, `role`, `semanticClassId`, `identityColor`
  - no second `id`; Scene Brief `visualTargets[].id` is the semantic identity owner
- `WhiteboxTriviewCaptureV1`
  - `visualTargetId`, `runtimeEntityIds`, `views`, `imageDataUri`
- `WhiteboxTriviewManifestV1`
  - `kind: "worldkit-whitebox-triview-manifest"`
  - `executionPlanHash`, `whiteboxTriviews[]`, each with `imageUri`
  - artifact path `triviews/whitebox-triview-manifest.json`

Delete `CaptureTargetManifestV1`, its validator, `RuntimeTriviewManifestV1`, group `id`, and old `mappings`, `targets`, `targetId`, `imageDataUrl`, and `imagePath` fields in this contract family. Do not retain aliases, dual reads, or migration code because the workspace packages are unreleased private `0.0.0` packages.

All validators accept `unknown`, return stable diagnostics, and never throw for malformed wire input. Draft and final validators reject one another's discriminator and unknown fields. Builder self-check moves to its next current validator version and the tracked portable bundle is regenerated only by the explicit producer.

### 2.3 Runnable protected Studio (`HSE-02`)

`pnpm studio:public` owns a supervised two-process topology:

1. the parent alone receives `WORLDKIT_ACCESS_KEY` and public-wrapper settings;
2. it spawns an internal Studio on loopback port 4197 after removing the public key and public-wrapper variables from the child environment;
3. an identity-bearing private readiness handshake proves that the expected child, not an arbitrary process, owns the upstream;
4. only then does the Basic-auth public proxy listen on 4175;
5. child exit closes the public listener; parent shutdown sends process-group SIGTERM, waits a bounded grace period, then escalates to SIGKILL.

`public-proxy.mjs` remains an explicit low-level command for an externally supervised loopback upstream. The wrapper does not claim TLS, tunnel, external storage, or production hosting readiness.

### 2.4 Publication truth (`WS-00`)

Active docs must describe the current code without treating dated reviews as authority. Correct the M5/R1b completion contradiction and split Reset semantics:

- provider-neutral `RuntimeHost.reset()` creates a new World Session without possession;
- Browser Reset uses `resetWithInitialControlBinding()` and returns a publication whose initial `possessedBy` relationship is already committed;
- consumers read the returned Snapshot rather than issuing a blind rebind.

### 2.5 One Registry discovery authority and honest Catalog (`WS-01`)

`SubjectResourceRegistryV3` owns one immutable `resourcesByRef` view exposed through:

- `resolveResource(resourceRef)`; and
- `listDiscoverableResources(filter?)`.

Typed resolvers remain narrow projections, not separate discovery authorities. CLI, Browser, Authoring preview, promotion, and SubjectPreset closure consume the generic facade. Every discoverable resource is listed once in stable `resourceRef` order and identity-resolves through the same facade.

Delete Motion Kernel `parameterSchemaRef` and `runtimeParameterNames`. They have no production consumer, their names already drift from Control Feel/Physics owners, and the frozen P1.5 design prohibits restoring Motion parameter bags. Do not invent ten empty `motion-parameter-schema` resources.

Registry reference-edge enumeration distinguishes dependency edges from metadata/back-references. All public `...Ref` values must resolve to the expected closed kind; only dependency edges enter SubjectPreset transitive closure.

### 2.6 One Subject contract owner (`WS-02`)

Create the domain-specific, dependency-light `@whitebox-world/subject-contracts` package. It owns serialized SubjectPreset DTOs and the closed Subject resource kind, Action, Bone, and Body Topology vocabularies.

`subject-registry` owns only resolution algorithms; `subject-actions` owns automatic action selection behavior; Runtime, Authoring, Compiler, and adapters import or project the shared closed terms. The automatic ground resolver returns the narrow `idle | walk | run | jump` output union. Remove the obsolete permissive SubjectPreset definitions from Runtime Contracts and the unused legacy subject vocabulary from the generic `contracts` package.

The current schema must reject the stale Biped bone `root`; Runtime validators reject unknown Action, Bone, Topology, and SubjectPreset `resourceKind` values at admission.

### 2.7 Canonical negative zero (`WS-03`)

`@whitebox-world/protocol` owns Canonical JSON value admission. In-memory stringify/bytes/hash and Authoring text/direct-object admission reject `-0` with a stable code and JSON Pointer. SubjectPreset candidate numeric overrides also reject rather than repair it. Domain calculations may explicitly quantize a computed signed zero before entering a protocol boundary.

### 2.8 Production invariant owner (`WS-04`)

Move the deterministic spawn-safety algorithm and types from `@whitebox-world/testkit` to existing `@whitebox-world/terrain-surface`. Compiler, World, and relevant tests consume that owner. Preserve exact diagnostics, ordering, epsilon, 42-degree default, and geometric behavior. Remove all production dependencies on testkit and do not leave a compatibility re-export.

### 2.9 Portable Planner parity (`WS-07A`)

Create one source `scripts/agent-planner-self-check.ts` that consumes `parseSceneBriefV1`. Extend the existing explicit build/check mechanism to generate and byte-compare both Planner and Builder portable bundles. Source and tracked bundle must agree for positive and negative fixtures, including duplicate visual-target names, a second Subject, and a movement label longer than 48 characters.

The Planner receipt continues to hash raw Scene Brief bytes because Studio joins that exact artifact. Canonical parse diagnostics are adapted to the receipt shape; they are not reimplemented.

### 2.10 Workspace boundary floor (`WS-05A`)

Add a read-only boundary verifier that scans static, export, dynamic, and require imports across packages/apps/scripts. It rejects undeclared direct dependencies, private sibling source imports, production-to-devDependency edges, nonexistent exports, test-only exports used by production, and production manifest cycles.

Existing debt is recorded with exact importer, specifier, owner, reason, removal gate, and no wildcard. Missing debt and stale debt both fail. This task prevents new damage; it does not claim to eliminate all current deep imports or split every package tsconfig.

## 3. Explicitly deferred total work

Track but do not implement in this slice:

- `WS-05B/C`: burn all registered deep-import debt, add broad `/testing` subpaths, and roll out per-package tsconfig/test toolchains;
- `WS-07B`: broader Schema/generated parity outside Planner, Builder, and the HSE-01 wire family;
- `WS-08`: Hosted/LWDP package extraction, Playground Vite-to-scripts graph cleanup, and optional shell decomposition;
- line-count-driven splitting of `worldkit.ts`, Studio server, recording workbench, or modular asset tooling;
- vocabulary cleanup where exact parity tests show no drift and no competing public serialized shape;
- immutable per-attempt artifact directories, general retention, quotas, and provider production hardening;
- Camera, Relationship, Compound Collider, Ragdoll, interiors, vehicles, NPC behavior, and networking roadmap work.

The HSE-02 wrapper may use one small app-local owned-process helper because supervised cleanup is part of making the advertised entrypoint true. It must not become a generic Host god package.

## 4. Dependency-aware work graph

| ID | Goal and independently verifiable deliverable | depends_on | blocks | Exclusive ownership and integration point | Evidence | Mode |
|---|---|---|---|---|---|---|
| `ARC-00` | Classify root-cause vs deferred work and freeze this design | — | all | Main agent owns architecture and audit disposition | source census, exact reproductions, design diff | `main-agent-only` |
| `HSE-01` | One current Hosted visual wire contract and stable validators | `ARC-00` | `HSE-00R`, `WS-07A`, `ARC-INT` | Runtime Contracts schema; Builder/Host/capture consumers | draft/final negative, malformed diagnostics, source/bundle, consumer zero-census | `main-agent-only` |
| `HSE-00R` | Adapt atomic Preview to the frozen HSE-01 contract | `HSE-01` | `ARC-INT` | Studio bootstrap + Playground loader | stale/cross-attempt/hash/group HTTP and loader tests | `sequential` |
| `HSE-02` | Supervised public Studio topology | `ARC-00` | `ARC-INT` | Studio wrapper, proxy lifecycle, root command | secret isolation, readiness identity, crash/shutdown/port E2E | `main-agent-only` |
| `WS-00` | Active publication and Reset truth | `ARC-00` | `ARC-INT` | Main agent owns active docs | code links, claim census, Site test if Site changes | `main-agent-only` |
| `WS-01` | Generic Registry discovery and honest Catalog refs | `ARC-00` | `WS-02`, `ARC-INT` | Subject Registry facade and reference edges | CLI/Browser parity, every resource/ref closure | `main-agent-only` |
| `WS-02` | Subject contracts and closed vocabulary owner | `WS-01` | `ARC-INT` | New subject-contracts package; import-only consumers | exact sets, unknown admission, Schema/runtime parity | `sequential` |
| `WS-03` | Reject negative zero at all protocol admissions | `ARC-00` | `ARC-INT` | Protocol admission + Authoring/Candidate adapters | parser/object/hash/candidate negatives | `main-agent-only` |
| `WS-04` | Move spawn safety out of testkit | `ARC-00` | `WS-05A`, `ARC-INT` | Terrain Surface algorithm owner | exact diagnostic parity, zero production testkit imports | `parallel-safe` |
| `WS-07A` | Source-generated Planner checker with positive/negative parity | `ARC-00`, `HSE-01` | `ARC-INT` | Planner source/generator/bundle; main agent integrates package scripts | source/bundle byte reports, stale bundle negative | `sequential` |
| `WS-05A` | Read-only workspace boundary floor and exact debt ledger | `WS-04` | `ARC-INT` | Verifier and debt manifest only | six negative graph cases, stale debt, current tree check | `sequential` |
| `ARC-INT` | Final semantic integration, docs, gates, independent review and main push | all current tasks | — | Main agent owns merge/release evidence | relevant lanes once, mutation audit, Cursor read-only review | `main-agent-only` |

Architecture, cross-cutting names, generated artifacts, final integration, and main push remain main-agent-owned. No worker completion substitutes for integrated-tree evidence.

## 5. Verification policy

Every production fix begins with an observed failing reproducer. After each change, run the focused regression first. On the final unchanged tree, run each applicable aggregate once according to the current deduplicated gate policy:

- generated/check-only gates;
- `pnpm test:studio`;
- `pnpm test:independent` when Node/Python/Site manifests change;
- `pnpm typecheck`;
- root `pnpm test` once;
- `pnpm build` once;
- only the Browser verifier whose Runtime/capture inputs changed;
- `git diff --check` and tracked/untracked mutation fingerprint.

Rendered, manual interaction, public tunnel, and provider production claims remain separate. A source/test result must not be described as those evidence layers.
