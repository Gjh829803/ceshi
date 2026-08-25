# Modular Subject Source Assets Design

- Status: Frozen for the source-migration slice
- Date: 2026-08-25
- Scope: product-authoritative Subject source packages and recovery of existing merged GLBs
- Runtime behavior: unchanged in this slice

## 1. Decision

Every product-authoritative Subject package uses independently versioned source resources:

```text
Subject source package
├── Model Asset       Mesh + Skin + zero-or-one Skeleton + Bind Pose
├── Rig Profile       semantic bone mapping and exact compatibility signature
├── Material Set      stable material slots and texture resource references
├── Animation Clips   one semantic action per GLB
└── Animation Set     actionId -> animationClipRef
```

The Model Asset and its Skeleton remain in one GLB because skin weights, joints, inverse bind
matrices, and the bind pose form one structural unit. The Rig Profile remains a separate Registry
contract: it maps provider node names to stable semantic bone IDs and defines compatibility.

Material/texture facts and Animation Clips are source resources, not embedded source authority in
the Model Asset. The first implementation slice creates and validates these modular source
artifacts without changing Canonical Authoring, Normalized IR, ExecutionPlan, WorldPackage, or
Babylon Runtime behavior. Existing self-contained Runtime GLBs remain the compatibility and
rendered-regression baseline.

## 2. Why the source and Runtime layers remain separate

glTF animations target node indices in the same glTF document. Splitting an animation into a
separate GLB therefore does not, by itself, define safe cross-file binding. Current WorldKit also
loads one Subject Asset container and obtains its Skeleton and Animation Groups from that same
container.

This slice establishes the durable product source boundary first. A later approved Runtime slice
may choose either:

1. deterministically assemble the locked Model, Material Set, and Animation Clips into a derived
   self-contained Runtime GLB; or
2. add independent caches and explicit target conversion for Model, Material, Texture, and
   Animation Clip resources.

The source package must support both choices. Derived Runtime bundles are rebuildable outputs and
must never become the editable product source truth.

## 3. Canonical package layout

Recovered and newly accepted packages use:

```text
assets/subjects/packages/<creator-id>/<subject-id>/v<version>/
├── package.manifest.json
├── model/
│   ├── model.glb
│   └── model.manifest.json
├── materials/
│   └── default/
│       └── material-set.manifest.json
└── animations/
    └── <action-id>/
        ├── clip.glb
        └── clip.manifest.json
```

Texture artifacts, when present, live below the owning Material Set at
`materials/<variant-id>/textures/`. No current G Bot, Golden, or xier120 Runtime GLB contains image
or texture resources, so this migration must not fabricate texture files.

All paths are immutable after publication. Changed bytes require a new exact resource version and
content hash.

## 4. Artifact contracts for this slice

### 4.1 Model Asset

A rigged `model.glb` must contain:

- one or more Meshes;
- Skin weights and exactly one Skeleton;
- the complete joint hierarchy and Bind Pose;
- zero Animations;
- no Camera or Light;
- no external Buffer or Image URI;
- meter units, `+Y` up, `-Z` forward, and `support-center` pivot.

A static `model.glb` has zero Skin, zero Skeleton, and zero Animations.

`model.manifest.json` records `kind: "subject-model-asset"`, `schemaVersion`, `id`, `version`,
`resourceRef`, artifact byte length/hash, provenance, coordinates, inventory, material slot IDs, and
the exact Rig signature for rigged assets. Numeric fields include units, for example
`byteLengthBytes`.

### 4.2 Rig Profile

The Registry Rig Profile is not copied into the GLB. It owns:

- `rigProfileRef`;
- body topology;
- the unique Skeleton root;
- semantic bone IDs and provider node names;
- Socket definitions;
- the Rig signature algorithm and expected value.

For this recovery slice, the Rig signature is a deterministic hash of the ordered full joint paths,
parent relationships, and local Bind Pose transforms. Exact signature compatibility is required;
automatic retargeting is out of scope.

### 4.3 Material Set

`material-set.manifest.json` records `kind: "material-set"`, exact version/ref/hash-bearing texture
bindings, and PBR values by stable `materialSlotId`. Slot identity is derived once during recovery
and then frozen in the Model manifest. Runtime inference from provider material names is forbidden.

The Model GLB may retain named placeholder material slots so primitive-to-slot assignment remains
self-describing, but authored PBR values are owned by the Material Set. The existing whitebox
Runtime continues to replace imported materials in this slice.

### 4.4 Animation Clip Asset

Each `clip.glb` contains:

- exactly one Animation;
- the complete target joint hierarchy needed for deterministic Rig signature validation;
- zero Mesh, Material, Texture, Image, Camera, and Light resources;
- a positive duration;
- a stable semantic action ID declared by its manifest;
- no external Buffer or Image URI.

`clip.manifest.json` records `kind: "animation-clip"`, exact version/ref, artifact byte length/hash,
`rigProfileRef`, Rig signature, `actionId`, source Clip identity, duration in seconds, loop mode,
playback speed ratio, blend duration in seconds, Root Motion mode, and provenance.

The GLB Clip name is provider data. Gameplay and Authoring use the stable semantic `actionId`.

## 5. Existing asset migration

### 5.1 G Bot

The only tracked G Bot binary is the merged Runtime GLB. Its Manifest names the original per-action
files, but those files are not present in the repository.

The deterministic recovery tool therefore produces:

- one rigged Model GLB with two Meshes, one 65-joint Skeleton, and zero Animations;
- one default Material Set representing the two factor-only source materials;
- twenty-five one-Clip Animation GLBs mapped through the existing action manifest;
- package/model/material/clip manifests with `provenance.mode: "derived-recovery"` and the merged
  GLB hash as the source identity.

Recovery does not claim byte identity with the missing original action files. The existing merged
GLB remains unchanged and remains the Runtime input. G Bot orientation requires rendered old/new
comparison because the current Definition applies a local yaw correction while its sidecar declares
canonical `-Z` forward.

### 5.2 Golden humanoid Fixture

The generated Golden GLB is split by the same tool into one Model, its Material Set, and the four
fixture actions. Its package provenance is `generated-fixture`. Existing fixture generation and
Runtime paths remain unchanged.

### 5.3 xier120

The nineteen committed xier120 GLBs are already static Model Assets: they contain no Skin,
Skeleton, Animation, Texture, or Image. This slice inventories them as valid static-model inputs
without duplicating their bytes or inventing Animation Clips.

Any animated xier120 delivery requires product re-export:

- all animal assets need an approved non-human Canonical Rig plus one clean Skeleton and explicit
  semantic actions;
- `quadruped-animal` currently exposes eighteen Skeletons;
- `quadruped-ridable` currently exposes two Skeletons and no declared rider/animal control owner;
- rider/vehicle compositions must either be split into independently owned Subjects/attachments or
  wait for an approved multi-Rig mount/composite contract;
- vehicle, flight, mount, and NPC behavior remain capability gaps even when a static visual exists.

The migration report must name every xier120 asset, its current usable mode, the blocker for rigged
use, and the exact product-team correction.

## 6. Deterministic recovery tool

The repository provides one CLI with `write` and `check` modes. It consumes committed GLB bytes plus
an explicit package configuration; it never guesses semantic action IDs from Clip names.

Required behavior:

1. validate the input content hash and expected inventory;
2. validate the configured action mapping is complete, unique, and exact;
3. write the Model, Material Set, Animation Clips, and canonical JSON manifests to a staging
   directory;
4. validate every staged artifact against the contracts above;
5. atomically replace the owned package output only after every artifact passes;
6. in `check` mode, regenerate in a temporary directory and require byte-for-byte equality with the
   committed outputs;
7. reject missing/duplicate Clips, external URIs, unsupported interpolation/targets, non-finite
   transforms, ambiguous Skeletons, and stale expected hashes with stable error codes.

The tool uses a maintained glTF transformation library rather than custom binary GLB rewriting.
Generated JSON is canonical and stably ordered. Output GLBs must be byte-stable for the locked tool
version.

## 7. Compatibility and rollback

- No current Subject Definition, Registry Ref, Resolver mapping, Runtime URL, or example changes.
- Existing merged GLBs are never overwritten or deleted in this slice.
- New modular source outputs live only under `assets/subjects/packages/**`.
- If regenerated bytes drift, `check` fails and preserves the last committed package.
- Removing the new package directory and tool commit restores the exact previous Runtime state.

## 8. Verification evidence

Automated contract evidence must prove:

- recovery tests fail before implementation and pass afterward;
- exact input hash/inventory binding;
- Model inventory and zero-Animation rule;
- one Clip per action and zero render resources in Clip GLBs;
- identical Rig signature across Model and every Clip;
- exact action coverage and unique semantic IDs;
- deterministic bytes across two independent output directories;
- `check` rejects tampered output;
- all nineteen xier120 runtime GLBs remain byte-identical and statically usable;
- focused existing G Bot, Golden, and xier120 Registry/Runtime verifiers still pass.

Rendered evidence is required before any recovered modular package replaces a Runtime artifact. That
future gate compares old/new front, right, back, and every required action. This slice does not claim
rendered equivalence from structural tests alone.

## 9. Failure report

`docs/20-modular-subject-source-assets.md` is the human handoff. It contains:

- the final package convention;
- exact commands for product teams;
- the generated migration inventory;
- one row per existing asset;
- `ready-static`, `recovered-modular`, `needs-visual-review`, or `requires-product-reexport` status;
- concrete correction requirements and capability gaps.

## 10. Dependency-aware work graph

| ID | Goal and independently verifiable deliverable | depends_on | blocks | Exclusive ownership | Stable I/O and integration point | Required evidence | Mode |
|---|---|---|---|---|---|---|---|
| MSA-01 | Freeze this source-package contract and the exact recovery scope | — | MSA-02, MSA-03, MSA-04 | this design spec and implementation plan | audit evidence -> frozen contract | self-review; no placeholders or contradictory Runtime claims | `main-agent-only` |
| MSA-02 | Add the tested deterministic GLB recovery library and CLI | MSA-01 | MSA-03, MSA-04 | recovery source, focused tests, root script/dependencies | committed GLB + explicit config -> staged modular package or stable diagnostic | red/green focused tests; deterministic/tamper cases | `sequential` |
| MSA-03 | Generate and validate G Bot and Golden modular packages | MSA-02 | MSA-05 | `assets/subjects/packages/seedleap/{g-bot,golden-humanoid}/**` | recovery CLI -> exact committed artifacts | check mode exact match; inventory/signature/action coverage | `sequential` |
| MSA-04 | Audit all xier120 assets without changing their Runtime bytes | MSA-02 | MSA-05 | generated audit data consumed by the handoff doc | source/runtime inventory -> per-asset classification | 19/19 hashes and classifications; no invented Rig/Clip | `parallel-safe` after MSA-02 |
| MSA-05 | Publish the product handoff and migration report | MSA-03, MSA-04 | MSA-06 | `docs/20-modular-subject-source-assets.md` | validated outputs + audit -> human correction guide | link/command inspection; every current asset covered | `sequential` |
| MSA-06 | Integrate and review the source-migration slice | MSA-05 | — | branch integration and verification evidence | final tree -> reviewed commit series | focused tests, typecheck/build, named verifiers, independent review | `main-agent-only` |

Architecture, public-contract decisions, dependency rulings, and final integration remain owned by
the main agent. MSA-04 may be delegated only after the recovery report schema from MSA-02 is stable.

## 11. Non-goals

- changing public Authoring/Registry/ExecutionPlan fields;
- loading independent Animation Clips or Material Sets in Babylon Runtime;
- replacing current Runtime GLBs;
- automatic cross-Rig retargeting;
- repairing non-human Skin weights or inventing semantic Bone mappings;
- enabling vehicles, flight, mounts, composites, or NPC behavior;
- adding texture files that are absent from the current assets.
