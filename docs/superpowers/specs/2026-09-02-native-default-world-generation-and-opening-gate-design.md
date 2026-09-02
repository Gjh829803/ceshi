# Native-default World Generation and Opening Gate Design

## Status and authority

This specification is the current-only WRC/NBR follow-up that changes the public
world-generation default after the NBR production transaction became available.
It does not create a third Scene Source, Runtime, WorldPackage format, Compiler,
Physics owner, Camera owner, or Browser protocol. The two mutually exclusive
sources remain Canonical JSON and Babylon Native; this specification changes only
Host selection and source-neutral Capture admission.

The NBR reconstruction specification continues to own Native generation,
checking, packaging, Runtime admission, Capture, evaluation, and repair. The WRC-1
specification continues to own the product capability graph. This document owns
only the atomic public-entry cutover and the Opening Composition Host Gate.

## 1. Decision

Every newly created world-generation job defaults to `babylon-native`. Canonical
authoring remains available only through the explicit
`--scene-source canonical` selection. Omitting `--scene-source` never selects
Canonical.

`agent:world` remains the one public generation entry. The repository must not
add `agent:world:native`, a Native-only Studio endpoint, or a second public parser.
The accepted source field is exactly:

```ts
type WorldGenerationSceneSourceKindV1 = "canonical" | "babylon-native";
```

Studio freezes `sceneSourceKind` when it creates a job. Local/cloud backend
selection is independent and freezes only where the Codex task executes. Changing
the selected backend or source after enqueue never migrates an existing job.

## 2. Unified source selection and Route ownership

One Host dispatcher parses the public source request. After that decision, each
mutually exclusive lane has exactly one trusted Route owner: the Canonical Host
adapter writes its Route after Planner validation and before Builder execution;
the existing reconstruction production owner derives and verifies the Native
Route from the frozen Case. No source-neutral helper may manufacture a second
Native Route. The selected Route is copied, by hash, into every downstream
Attempt, Package, Receipt, and evaluation artifact.

The current `record-scene-authoring-attempt.ts` canonical-only constructor loses
route-decision ownership. It becomes a consumer of already validated Route bytes.
No script may synthesize `canonical-default` after dispatch.

```text
Studio or CLI request
  -> Host parses sceneSourceKind (omitted = babylon-native)
  -> canonical: Planner -> Canonical Host Route -> retained Builder transaction
  -> babylon-native: Native Case preparation -> reconstruction Route/transaction
```

Native preparation first reuses the existing unified Planner task and bundled
self-check for the Scene Brief and planning/reference evidence, but never invokes
the Canonical Builder or Height Intent Compiler. A following Native Case Mapper
task may propose only the closed semantic Case fields from those frozen Planner
outputs. A trusted Host adapter derives and validates one Case, evaluation profile,
Capture intent, Gameplay Bootstrap, World Runtime Bootstrap, Bounds, and Native
Bootstrap closure, then calls the existing
`runWorldReconstructionProductionV1()` transaction. Model output cannot mint these
trusted identities.

The Native Case proposal may describe semantic targets, topology, composition,
Spawn/support, required blockers and scripted pass/block intent. The Host parses
the closed proposal, resolves stable IDs and profiles, binds fixed SDK Subject and
Runtime resources, hashes every input, and rejects incomplete or unsupported
requirements. It must not reuse a fixed Case from another scene or weaken a Case
until it passes.

## 3. Current-only public cutover

The public `agent:world` parser, Studio job DTO, Studio persistence, queue identity,
logs, status projection, Route receipt, and CLI tests migrate atomically. Final
accepted code has:

- one `sceneSourceKind` field and no aliases;
- `babylon-native` as the only omitted/default value;
- one public source parser and one trusted Route owner inside the selected lane;
- no canonical-default constructor inside Attempt recording;
- no Native shortcut that bypasses the Codex task router;
- no fallback from failed Native generation to Canonical;
- no source change during retry or repair.

The retained Canonical executor is an internal source-specific transaction. It is
not the public default and is reachable only after an explicit Canonical Route.

## 4. Opening Composition Host Gate

Every Canonical or Native opening image is first a Candidate Capture. The Host
publishes the formal Capture Receipt only after the same Capture transaction passes
one source-neutral `OpeningCompositionGateV1`.

The gate consumes identity-bound data, not best-effort image heuristics:

- expected Camera distance, pitch and FOV from the frozen WorldPackage Bootstrap;
- committed Camera and Subject state from the Runtime Snapshot;
- Camera collision/spring-arm requested and resolved distances;
- rendered projected bounds for the controlled Subject and identity-bound projected
  bounds for required landmark/visual targets;
- expected normalized regions and anchors from the frozen composition intent;
- viewport, DPR, Package, Attempt, Runtime session and Capture identities.

The stable result separates measurements and diagnostics for:

1. controlled Subject identity, centering, screen coverage and target binding;
2. requested versus resolved Camera distance (`camera-shrink`);
3. pitch and FOV drift;
4. near-field camera obstruction through requested-versus-effective SDK arm
   distance and committed collision-retracted state;
5. required landmark presence, visible coverage, region and anchor drift;
6. foreground/middle/remote ordering.

The current near-field signal is derived from committed SDK Camera collision state;
the gate does not infer geometry from arbitrary RGB colors. A later depth/semantic
occlusion measurement may extend this same formal Observation, but cannot become a
second post-Capture authority. Landmark checks use materializer identities and
semantic capture classes, never Mesh names or tags.

Any blocking diagnostic rejects the Candidate Capture before formal Receipt
publication. The failed candidate image and diagnostic result may remain as
development evidence, but Studio cannot label the world ready and styled-image
generation cannot consume it. A retry creates a new Candidate and Receipt identity;
it never overwrites a frozen accepted Capture.

## 5. Ownership boundaries

- Scene Source decision: Host route owner.
- Native visual authoring: Native Builder Module.
- Case/Profile/Capture intent freezing: trusted reconstruction Host.
- Camera state and collision shrink: SDK Camera Domain/Director.
- Subject and semantic projection evidence: existing Runtime/Capture provider.
- gate evaluation and diagnostic DTO: source-neutral Capture contract owner.
- Havok, Subject, Input, Action, Fixed Tick, Reset and lifecycle: existing SDK
  owners only.

The gate observes committed Camera state; it does not correct Camera state, move
geometry, or become a second Camera controller.

## 6. Failure behavior

- unsupported Native capability: fail closed with a Route capability-gap result;
- invalid Case proposal or identity mismatch: no generation task;
- Native Check failure: no Package Candidate;
- Package/admission failure: no Runtime Candidate;
- Opening gate failure: no formal Capture Receipt and no ready world;
- provider timeout/unknown outcome: reconcile the existing request identity; never
  submit a duplicate task immediately;
- retry/repair: same frozen Scene Source and owner inputs, new Attempt identity.

There is no automatic fallback to Canonical at any failure point.

## 7. Delivery checkpoints

### NDG-1: Source contract and public parser

Freeze `sceneSourceKind`, omitted-default Native behavior, CLI/Studio parsing and
Route identity. Remove the canonical-only Route constructor from Attempt recording.

### NDG-2: Native preparation adapter

Create the trusted prompt/reference-to-Case preparation path and connect it to the
existing reconstruction production transaction. Preserve explicit Canonical
dispatch without exposing a second public command.

### NDG-3: Studio atomic cutover

Persist and display the frozen source, default new jobs to Native, and route both
local and cloud jobs through the same public entry. Delete old source inference and
fallback behavior.

### OCG-1: Gate contracts and Capture measurements

Add the closed source-neutral intent/result DTO and have the trusted Capture
provider report camera shrink, semantic visibility and near-field obstruction.

### OCG-2: Admission and Studio integration

Evaluate inside the Capture transaction, publish Receipt only after GO, and make
Studio consume the same result rather than reinterpreting it.

### NDG/OCG-90: Clean break and evidence

Focused tests, source-selection census, one real local reference Case, one explicit
Canonical Case, rejected camera-shrink/occlusion/missing-landmark fixtures,
typecheck/build, exact-SHA review, and no open P0/P1.

## 8. Completion definition

The change is complete only when:

- Studio and `agent:world` omit-to-Native behavior is mechanically proven;
- another developer can submit a prompt/reference image locally without preparing
  an internal Case by hand;
- the resulting task runs through the existing Native Check, Package, Runtime,
  Capture, evaluation and repair transaction;
- explicit Canonical selection still runs only the retained Canonical transaction;
- every Route/Attempt/Package/Receipt agrees on the frozen source identity;
- unsafe Subject framing, camera shrink and missing/out-of-region landmarks reject
  formal Capture publication;
- no public alias, duplicate entry, fallback, third Scene Source, shadow Plan, or
  duplicate Runtime/Camera/Physics owner remains.
