# Three.js Block World Authoring Design

> Sections 1-14 record the original unmerged unit-block exploration. Section 16
> is the authoritative Agent-facing V2 contract for metric scale, mixed shapes,
> and reconstructed walkable surfaces.

**Status:** active branch implementation authority

**Baseline:** PR #34 head `0ada3088b797a414bbaef79cb978a6a66182effe`

## 1. Goal

Give an Agent one deliberately small world-building surface: ordinary unit-cube
`THREE.Mesh` instances bound to immutable WorldKit block presets. The Agent owns
all Three.js code, loops, helper functions, placement, and composition. WorldKit
does not provide semantic construction operations such as roads, bridges,
buildings, paths, fills, stamps, or scatter.

BW1 first made authored blocks mechanically inspectable before runtime
integration. It froze preset physics/traversal/color semantics,
extracts a provider-neutral manifest from a Three.js Scene, and deterministically
checks grid admission, spawn clearance, landmark-color discipline, and
subject-relative ground connectivity.

## 2. Provider boundary and prior Babylon-only decision

The completed Babylon-only Runtime migration remains authoritative for gameplay,
physics, camera, Browser Protocol, capture, and Studio Preview. This design
supersedes its zero-Three-dependency acceptance only for one new authoring
adapter package:

```text
Agent world module
  -> @whitebox-world/block-world-three (Three.js binding/extraction only)
  -> @whitebox-world/block-world (provider-neutral manifest/checker)
  -> @whitebox-world/block-world-compiler
  -> existing ExecutionPlan / Babylon-Havok Runtime
```

`three` must not enter Runtime Contracts, the existing Canonical Compiler,
Camera, Runtime Host, Runtime Babylon, Browser Protocol, or internal Canonical
transport. The Hosted Builder consumes the adapter only for trusted extraction;
the Block Compiler then translates the provider-neutral Manifest for Runtime.

## 3. Authority split

| Owner | Authority | Must not own |
| --- | --- | --- |
| Agent world module | Three.js Scene, cube placement, IDs, visual grouping | physics values, traversal flags, colors |
| Block Registry | exact preset refs, colors, opacity, physics/traversal/interaction traits | Three.js objects, scene placement |
| Three adapter | bind immutable metadata to `THREE.Mesh`; derive world-space grid instances | connectivity policy, runtime physics |
| Block checker | manifest validity, occupancy, landmark colors, spawn and ground reachability | rendering, NavMesh, runtime motion |
| Future Block Compiler | chunking and translation to existing runtime contracts | Agent authoring logic |

## 4. Unit block admission

- Each authored block is a unit `BoxGeometry(1, 1, 1)` Mesh.
- Final world position is integer-aligned in meters.
- Final world scale is exactly `[1, 1, 1]`.
- Final rotation is Y-only in quarter turns.
- One physical cell has at most one block.
- Air is the absence of a block and has no Mesh or preset.
- Provider metadata is bound through a non-writable symbol property; arbitrary
  `userData` fields never become physics authority.

## 5. Frozen V1 presets and colors

All refs use schema-independent Registry identity. Functional colors are muted;
high-saturation common colors are reserved for complete visual landmarks.

| Ref suffix | Color | Collision | Ground support | Medium / role |
| --- | --- | --- | --- | --- |
| `walkable@1` | `#B7E4C7` | solid static | yes | solid ground |
| `obstacle@1` | `#5F6368` | solid static | no | blocker |
| `interactive-solid@1` | `#00B8A9` | solid kinematic | no | interactive blocker |
| `interactive-trigger@1` | `#B8DE6F` | trigger | no | non-blocking interaction |
| `water@1` | `#8ECDF4` | trigger | no | water volume |
| `cloud-walkable@1` | `#D8D4F2` | solid static | yes | cloud support |
| `cloud-passable@1` | `#EEF6FF` | none | no | cloud volume |
| `visual-only@1` | `#D6D3D1` | none | no | render-only |
| `landmark-red@1` | `#E15759` | solid static | no | visual identity |
| `landmark-orange@1` | `#F28E2B` | solid static | no | visual identity |
| `landmark-yellow@1` | `#D9A514` | solid static | no | visual identity |
| `landmark-blue@1` | `#4E79A7` | solid static | no | visual identity |
| `landmark-purple@1` | `#9C6ADE` | solid static | no | visual identity |
| `landmark-pink@1` | `#E66AA5` | solid static | no | visual identity |

Every landmark preset shares the exact obstacle physics/traversal traits. A
walkable surface inside a landmark remains a `walkable@1` block and joins the
same `visualGroupId`; capture may later recolor the complete group.

## 6. Provider-neutral manifest

The Three adapter derives immutable instances containing `id`, `presetRef`,
integer `gridCellXYZ`, `rotationQuarterTurnsY`, and optional
`visualGroupId`/interaction identity. The Agent never writes a manifest file.
Instances are sorted by ID. Duplicate IDs, cells, unknown refs, invalid geometry,
and invalid world transforms are stable diagnostics rather than silent repair.

## 7. Ground connectivity V1

Connectivity is computed from logical block cells, never rendered triangles or
Recast rasterization.

1. Candidate stand cells are directly above admitted ground-support blocks.
2. The trusted Host derives the subject traversal profile from the exact
   compiled Runtime collider and step capability. The Agent copies that catalog
   envelope byte-for-byte; smaller or otherwise divergent self-authored values
   fail before connectivity evidence can publish.
3. A stand cell is admitted only when every footprint support cell is valid and
   every occupied body cell is free of solid collision.
4. Cardinal neighboring stand cells connect when their height delta is within
   the subject step envelope.
5. BFS from the declared spawn returns reachable count, disconnected count, and
   required-target reachability. Ground-only worlds declare separate `middle`
   and `remote` navigation targets so intended exploration regions cannot vanish
   from the checked domain.
6. A required ground traversal band performs segment-by-segment graph search
   inside an Agent-declared XZ width. At least one band starts at spawn and ends
   at a middle target. It proves the intended entry movement area directly,
   even when a distant detour keeps the global component connected.
7. Navigation targets and bands are validation-only data. They create no route
   geometry, overlay, collider, or Runtime entity, so open worlds remain open.

Water, swimming, flight, interaction-state search, diagonal jumps, half blocks,
and runtime physics are explicit later slices.

## 8. Landmark rules

- Every landmark-colored block has a non-empty `visualGroupId`.
- One group uses at most one landmark color.
- One landmark color maps to at most one group in a world.
- Functional blocks may join a landmark group without changing their preset.
- Repeated identical landmarks share one visual group and color.

## 9. Automated checker contract

The checker returns an immutable report with stable diagnostics and metrics. It
does not mutate the Scene or authored meshes. Initial codes cover:

- unbound or non-unit block Mesh;
- non-grid position, non-unit scale, invalid rotation;
- duplicate ID/cell and unknown preset;
- missing/mixed/reused landmark color grouping;
- missing spawn stand cell, blocked clearance, unsupported footprint;
- disconnected walkable component and unreachable required target.

The Host CLI exits `0` only for `status: "passed"`, otherwise `2`.

## 10. First-slice non-goals

- no replacement or adapter for AuthoringSpec V4;
- no Babylon/Havok or Studio integration;
- no semantic construction DSL or macros;
- no chunk mesh/collider compiler;
- no arbitrary Agent physics, colors, sizes, scaling, or rotation;
- no claim that water, flight, or interactive-state connectivity is complete.

## 11. Dependency-aware work graph

| ID | Goal and independently verifiable deliverable | depends_on | blocks | Exclusive ownership / integration | Evidence | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| `BW-00` | Freeze this design and implementation plan | — | all | design/plan docs | diff and link check | `main-agent-only` |
| `BW-01` | Provider-neutral preset Registry and manifest contracts | `BW-00` | `BW-02`, `BW-03` | new `block-world` package contracts | exact registry and immutability tests | `sequential` |
| `BW-02` | Three.js unit-block binding and Scene extraction | `BW-01` | `BW-04` | new `block-world-three` package | nested world transform, geometry, duplicate negatives | `sequential` |
| `BW-03` | Deterministic ground connectivity checker | `BW-01` | `BW-04` | `block-world` checker | clearance, step, footprint, components, target tests | `sequential` |
| `BW-04` | CLI and direct Three.js example | `BW-02`, `BW-03` | `BW-05` | root script, example, package command | pass/fail CLI fixtures | `sequential` |
| `BW-05` | Integrate dependencies, census, docs and verification | all | — | root manifests, lockfile, test census | focused tests, boundaries, typecheck, contract lane | `main-agent-only` |

## 12. BW2 clean-break continuation

The second slice makes the Block World module the only Agent-facing Builder
authority on this branch. Canonical Authoring remains an internal compiler and
runtime transport until it can be replaced safely; the Agent does not write or
repair that transport. Existing Babylon/Havok gameplay, subject control, camera,
capture, and Browser behavior remain execution services rather than competing
world-authoring APIs.

The Agent module owns:

- direct Three.js unit-block construction and visual grouping;
- one stable world ID and seed;
- one registered controlled Subject choice, its spawn-facing quarter turn, and
  strict third-person camera framing; and
- the primary Subject visual-target ID.

The Host owns extraction, `checkBlockWorldV1`, internal compilation, resource
budgets, implementation-map derivation, Runtime capture, and artifact promotion.
An Agent cannot submit a second JSON world description or override a preset's
physics during compilation.

### Internal Block Compiler

The compiler accepts only an extracted Manifest whose source diagnostics and
Block check report pass. It deterministically creates:

1. one unit box Object per block, preserving the block ID as runtime entity ID;
2. one internal Prototype per actually used preset;
3. a low hidden runtime foundation required by the current execution transport,
   placed far below every authored block so it cannot create checked traversal;
4. one spawn Anchor at the top face of the declared support block;
5. one registered controlled Subject and one centered third-person Camera; and
6. implementation mappings derived from `visualGroupId`, never hand-authored by
   the Agent.

The hidden foundation is compiler-owned compatibility infrastructure, not an
Agent terrain surface and not connectivity evidence. Block connectivity remains
authoritative for admission.

### Clean deletion boundary

After the Block Compiler and Host self-check can reproduce the required runtime
artifacts, remove the competing Agent-facing Builder Skill, its schema templates,
its generated self-check, its launcher prompt, and the old world-construction
instructions. Do not delete Runtime, Compiler, Subject Registry, capture, or
evaluation components merely because their current transport still consumes an
internal Canonical document.

## 13. BW2 dependency-aware work graph

| ID | Goal and independently verifiable deliverable | depends_on | blocks | Exclusive ownership / integration | Evidence | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| `BW2-00` | Freeze clean-break authority and deletion boundary | `BW-05` | all BW2 | design/plan and conflict census | link/diff review | `main-agent-only` |
| `BW2-01` | Add world/Subject/camera metadata to the Block module contract | `BW2-00` | `BW2-02`, `BW2-03` | `block-world` and Three adapter types | closed validation and extraction tests | `sequential` |
| `BW2-02` | Compile a passed Manifest to the existing runtime transport | `BW2-01` | `BW2-03`, `BW2-04` | new Block Compiler package | deterministic output, normalize/compile tests | `sequential` |
| `BW2-03` | Replace Builder Skill and self-check with Block World authoring | `BW2-01`, `BW2-02` | `BW2-04`, `BW2-05` | `.codex/skills/worldkit-block-builder` | skill validation and realistic fixture | `sequential` |
| `BW2-04` | Migrate Hosted launcher and artifact promotion | `BW2-02`, `BW2-03` | `BW2-05`, `BW2-06` | world-agent launcher/Host scripts | launcher and Studio integration tests | `sequential` |
| `BW2-05` | Delete competing Builder Skill, references, prompts, and instructions | `BW2-04` | `BW2-06` | Agent-facing census | zero old Builder consumers | `main-agent-only` |
| `BW2-06` | Run final boundaries, contract, capture, and clean-tree review | all BW2 | — | integration only | focused/full gates and rendered evidence | `main-agent-only` |

## 14. BW3 shared Planner-image semantics

The Planner's two images use the immutable Block World palette as a shared
semantic view of the planned world. `world-plan.png` is a complete top-down
block-whitebox view; `entry-whitebox-target.png` is a 16:9 centered rear
third-person block-whitebox view. The Planner chooses no preset refs or grid
coordinates: color communicates intended function, while Builder owns the final
block selection and placement in `world.mjs`.

Target 1 remains the non-block controlled-Subject mask `#E85D5D`. Targets 2-5
map to landmark orange, yellow, blue, and purple in Planner images, Builder
groups, capture metadata, tri-views, and Studio. The Planner checker proves PNG
hashes and measurable palette/composition properties. Builder self-check proves
that the authored complete targets use the same ordered presets. Pixel color
cannot prove geographic correctness; Runtime block admission and connectivity
remain the physical authority.

| ID | Goal and independently verifiable deliverable | depends_on | blocks | Exclusive ownership / integration | Evidence | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| `BW3-01` | Freeze shared functional/target color constants | `BW2-06` | `BW3-02`, `BW3-03` | `block-world` Registry | exact palette tests | `sequential` |
| `BW3-02` | Generate and self-check two block-whitebox Planner PNGs | `BW3-01` | `BW3-04` | Planner Skill, prompt and checker | source/bundle parity plus negative image tests | `sequential` |
| `BW3-03` | Consume and enforce ordered target colors in Builder | `BW3-01` | `BW3-04` | Builder Skill and checker | wrong-color negative fixture | `sequential` |
| `BW3-04` | Surface legend and trust hashes in Studio | `BW3-02`, `BW3-03` | `BW3-05` | Studio server/public UI | server trust and static UI tests | `sequential` |
| `BW3-05` | Run contract, Studio, build and skill validation | all BW3 | — | integration only | full relevant gates | `main-agent-only` |

## 15. BW4 scalable block-world runtime and exploration

BW4 replaces the temporary one-block/one-runtime-object transport with a
deterministic chunk-derived transport while keeping the Agent surface exactly
the same. `world.mjs` remains the only Agent-authored geometry authority. The
Agent still creates bound unit `THREE.Mesh` blocks; chunking, coalescing,
render batching, collider residency, and lighting are trusted Host/Runtime
responsibilities.

### 15.1 Authority and data flow

```text
world.mjs unit blocks
  -> provider-neutral BlockWorldManifestV1
  -> complete-world connectivity and exploration measurement
  -> 32 x 32 XZ chunk partition
  -> deterministic same-semantics cuboid clusters
  -> internal Authoring V4
  -> Canonical Scene Plan V1 + World Build Identity
  -> Babylon chunk batches plus chunk-resident static collision
```

The coalesced transport is derived data, not another authoring API. It may
replace many logical block IDs with stable Host-owned cluster entity IDs.
Visual-target mappings are rebuilt from `visualGroupId` to those cluster IDs.
Blocks carrying an interaction identity remain independently addressable.

### 15.2 Runtime residency and far visibility

- Every chunk's render batch is available from the frozen Execution Plan and
  remains renderable at distance. The Runtime must not hide reference-visible
  mountains, structures, islands, or complete landmarks merely because their
  physics chunk is not resident.
- Static collision is grouped and owned by chunk. The Runtime keeps a bounded
  ring around every active Subject resident and updates it before the fixed
  physics step. Non-block worlds retain their existing collider ownership.
- Block batches use a shared unit box with thin-instance transforms. A batch
  contains only one semantic/material identity and at most one complete visual
  group, so capture visibility and tinting never include an unrelated target.
- Opening-frame readiness includes all render batches. Physics readiness
  requires only the spawn-resident ring because distant visual batches do not
  participate in support or collision until approached.

This slice streams Runtime residency from a finite, frozen world. Infinite AI
generation and an Agent-facing chunk DSL are non-goals. Builder-authored loops
may create a large deterministic finite world; future procedural continuation
must be a separately frozen design and cannot rewrite the reference-critical
core.

### 15.3 Whitebox lighting

Immutable preset colors remain semantic base colors, not unlit framebuffer
colors. Block materials receive the SDK-owned clear-day hemispheric and
directional lights, retain only a small emissive floor for readability, and use
no specular highlight. Far and near batches use the same lighting owner. Styled
reference lighting remains downstream visual-generation authority.

### 15.4 Planner image and human review boundary

`world-plan.png` represents the initial Subject only as a small red spawn
position token. It must not show a humanoid, vehicle, equipment, pose, facing
arrow, or camera cone. `entry-whitebox-target.png` remains the only Planner
image that shows the complete controlled Subject.

Do not add subject-area, bounding-box, connected-component, or image-recognition
heuristics for the top-down token. Automated Planner admission proves file
integrity, freshness, fixed palette presence, and entry aspect/composition
properties already owned by the portable checker. Geographic continuation,
spawn-token meaning, landmark completeness, and image quality are human-review
evidence surfaced by Studio, not blocking pixel guesses.

### 15.5 Exploration scale

The uploaded frame is an entry slice, not a world boundary. Planner prose and
the top-down image must include reference-consistent traversable continuation
outside the uploaded camera view: a connected middle area, side or rear
exploration, and at least one remote area or destination. Those inferred areas
remain explicitly separated from visible reference evidence in the Brief.

Builder derives concrete scale from movement mode. The checker publishes
reachable bounds, chunk coverage, maximum spawn distance, and off-camera
reachable coverage from logical stand cells. Builder self-check applies the
maintained movement-scale profile; it never asks Planner for coordinates or
dimensions and never accepts empty non-traversable bounds padding as scale.

### 15.6 Player-facing pastel voxel render style

Block preset colors remain immutable semantic identities for Planner/Builder
communication, validation, capture metadata, and physics selection. Babylon may
map those identities to a separate display palette: ice-white and pale-blue
neutral masses, pale-mint walkable surfaces, and low-saturation peach, lavender,
blue, yellow, and pink landmarks. Clear-day rendering adds soft cool ambient
light, a warm directional key, visible face shading, and very long-range linear
aerial perspective. The atmosphere must preserve distant reference silhouettes;
it is not a distance-culling mechanism. UI, labels, loading cards, and typography
from visual references are never world geometry.

### 15.7 BW4 dependency-aware work graph

| ID | Goal and independently verifiable deliverable | depends_on | blocks | Exclusive ownership / integration | Stable input/output contract | Evidence | Mode |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `BW4-00` | Freeze scalable-runtime, review, and exploration boundaries | `BW3-05` | all BW4 | this design, implementation plan, AGENTS truth | existing Block module remains sole Agent input | diff/link review | `main-agent-only` |
| `BW4-01` | Publish complete-world exploration metrics and deterministic 32-cell chunk cuboids | `BW4-00` | `BW4-02`, `BW4-04` | `block-world` checker and `block-world-compiler` | passing Manifest + metadata -> check metrics + coalesced Authoring/Plan + remapped targets | adversarial negative coordinates, grouping, interaction, determinism, and large-flat-world tests | `sequential` |
| `BW4-02` | Render block clusters in semantic thin-instance batches and own chunk collision residency | `BW4-01` | `BW4-03`, `BW4-06` | `runtime-babylon` scene geometry and runtime lifetime | chunk-encoded Execution objects/colliders -> always-visible batches + bounded active physics chunks | NullEngine batching, real Havok movement across chunk seams, cleanup, and capture grouping tests | `sequential` |
| `BW4-03` | Replace unlit emissive blocks with one clear-day lit material authority | `BW4-02` | `BW4-06` | `runtime-babylon/materials.ts` and rendered evidence | immutable preset base color -> lit StandardMaterial | material contract tests and rendered screenshot inspection | `sequential` |
| `BW4-04` | Make Planner continuation/spawn-token and Builder movement-scale duties executable | `BW4-01` | `BW4-05`, `BW4-06` | both hosted Skills, launcher prompts, portable bundles, Builder checker | Brief/images -> large direct-block world satisfying exploration metrics | skill/parity tests and a large generated fixture | `sequential` |
| `BW4-05` | Surface durable human Planner review without heuristic image rejection | `BW4-04` | `BW4-06` | Studio record/API/UI only | planner artifacts + reviewer decision -> persisted review state visible in details | server persistence/API/static UI tests | `sequential` |
| `BW4-06` | Integrate capture, existing worlds, docs, and end-to-end evidence | `BW4-02`, `BW4-03`, `BW4-04`, `BW4-05` | — | cross-cutting integration only | current hosted workflow -> playable large lit world with visible far geometry | focused tests, typecheck, root test, Studio, build, Browser capture, rendered and manual evidence | `main-agent-only` |

## 16. BW5 metric scale, mixed block shapes, and reconstructed walkable surfaces

BW5 is a clean break for the unmerged Block World authoring surface. World
space remains meters. One full block is exactly `1 x 1 x 1` meter, and a normal
adult humanoid is approximately 1.8 meters tall. Builder-authored Three.js is
still the only Agent geometry authority; no semantic construction DSL is added.

### 16.1 Closed shape palette and lattice

The only admitted undeformed boxes are:

| shape | meters XYZ before Y rotation | volume |
| --- | --- | --- |
| `full` | `[1, 1, 1]` | `1` |
| `half` | `[1, 0.5, 1]` | `1/2` |
| `quarter` | `[0.5, 0.5, 1]` | `1/4` |
| `small` | `[0.5, 0.5, 0.5]` | `1/8` |

An exact quarter-volume cube would require an irrational edge and is not
admitted. All block faces align to the 0.5-meter micro-grid, so Mesh centers
align to the 0.25-meter center lattice. The Three.js extractor derives shape,
meter position, and occupied micro-cells from exact BoxGeometry and transform
bytes. Scale stays `[1,1,1]`; Y-only quarter turns remain the only rotation.

Physics and semantic identity remain preset-owned and are independent from
shape. Small shapes can express detail, but a controlled Subject may stand only
where the union of same-height support tops covers its footprint and provides
full vertical clearance.

### 16.2 Subject scale

Registered Definitions retain Registry scale. A composed ordinary humanoid must
have a complete visual AABB between 1.6 and 2.1 meters high unless its Definition
is non-human or the Scene Brief states a giant-scale exception. Camera distance
follows Subject bounds; Builder never scales a Subject merely to fill the frame.
Parts excluded from collider contribution may extend the silhouette, but they do
not enlarge the ground capsule.

### 16.3 Walkable height and smoothing contract

Walkable support blocks publish top rectangles in meters. Horizontally adjacent
walkable tops may differ by at most 2 meters. A difference of at most 1 meter is
an auto-smooth edge and is connected by the checker. A difference greater than
1 meter is not connected automatically; Builder must add half/full intermediate
support or another explicit connection. A difference greater than 2 meters
between adjacent walkable tops is invalid and must be represented as a blocked
cliff/obstacle boundary instead.

The Host derives one chunked walkable surface from those rectangles. Shared
corners whose contributing heights span at most 1 meter are averaged; larger
discontinuities retain duplicate vertices and a cliff edge. The same derived
triangle topology owns the visible pastel overlay and live Havok support.
Underlying authored blocks remain semantic/capture evidence and supply cliff
side volume, but their walkable box colliders are replaced by the reconstructed
surface so an invisible stair cannot block a visible ramp. Chunk borders use a
one-cell halo and deterministic world-coordinate corner keys.

Within each chunk/material group, adjacent top tiles share indexed vertices.
Non-coplanar quads choose the diagonal with the smaller height discontinuity;
cliff skirts remain separate faces. The Host also derives a micro-cell-indexed
height sampler from upward-facing triangles only. That sampler cannot publish
support, ground medium, coyote time, or jump eligibility: Havok `checkSupport`
remains their sole authority. It only proves that an unsupported capsule is
still vertically close to the exact reconstructed top footprint, allowing the
motion kernel to continue the last legal slope tangent. Leaving that footprint
immediately restores ordinary airborne gravity.

For the `free-ground` motion kernel, configured walk/run speed is measured
along the reconstructed walkable surface, not only in the horizontal XZ plane.
Runtime projects planar intent onto a stable walkable tangent and preserves its
magnitude, including the tangent Y component supplied to Havok. Brief support
gaps at triangle boundaries may publish the physical `air` medium, but the
ground-humanoid action keeps its grounded locomotion pose while vertical motion
remains consistent with the last walkable tangent. Explicit jumps still enter
the jump action immediately, and a true unsupported fall enters it after the
tangent-consistent grace is exceeded.

Down-snap casts choose the closest upward-facing walkable hit rather than a
nearer cliff skirt. On reconstructed Block World surfaces, snap correction is
bounded to 2 millimeters per fixed tick; tangent motion owns the intended
vertical travel, so snap closes contact error instead of creating a second,
step-like drop.

### 16.4 Detail ownership

Builder implements reference evidence at macro, terrain-feature,
complete-target, and exposed-detail scales. Full blocks own mass; half blocks
own transitions and ledges; quarter and small blocks own exposed silhouette
detail. Small blocks are not bulk underground fill and are not separate visual
targets. Visual richness is human-reviewed rather than enforced through
arbitrary detail-count or image-recognition gates.

### 16.5 BW5 work graph

| ID | Goal | depends_on | Evidence |
| --- | --- | --- | --- |
| `BW5-00` | Freeze meters, shapes, scale, smoothing, and detail authority | `BW4-06` | design and plan review |
| `BW5-01` | Publish V2 manifest/extractor/checker on the 0.5m lattice | `BW5-00` | shape, overlap, support, height-delta, scale tests |
| `BW5-02` | Compile and batch mixed shapes without losing semantic identity | `BW5-01` | cluster determinism and Runtime mesh tests |
| `BW5-03` | Derive shared render/Havok walkable surface per chunk | `BW5-02` | topology, seam, slope, and real Havok traversal tests |
| `BW5-04` | Upgrade Builder guidance and portable self-check | `BW5-01` | skill/parity and adversarial Builder tests |
| `BW5-05` | Migrate fixtures and integrate end-to-end evidence | all BW5 | root gates, Studio, build, capture, Browser gameplay |

## 17. BW6 sequential planning, linked spaces, and automatic ground boundaries

BW6 makes the Planner images a causal sequence and moves cliff protection out
of Agent-authored geometry. It also adds the smallest behavior contract needed
for a complete world to contain separately built spaces joined by an actual
door or portal interaction. It does not add a terrain DSL, procedural world
API, or a second geometry description.

### 17.1 Planner image lineage

The Unified Planner remains one Codex task. It writes the short Scene Brief,
then generates `entry-whitebox-target.png` first. Only after that file exists
and has been inspected may it generate `world-plan.png`, supplying the uploaded
reference, the exact generated entry image, and the Brief as inputs. The
top-down plan is therefore a projection and completion of the locked entry
space, not an independent redesign.

The entry image owns the opening camera composition and visible depth order.
The uploaded reference owns visible geographic evidence. The top-down plan
owns hidden continuation, traversable-domain layout, and space connections. A
conflict among those authorities is repaired in the Planner task before the
Builder starts.

`world-plan.png` always remains the complete overview delivered through the
closed Codex output contract. A continuous world uses one continuous map. A
world with non-contiguous spaces uses a clean multi-panel overview whose panels
preserve each space's internal geography and whose paired transition tokens
show every cross-space connection. Minimal space/transition identifiers are
allowed only in that multi-space case; character silhouettes, camera cones,
decorative labels, and route diagrams remain forbidden. The top-down Subject is
still only a small spawn token.

### 17.2 Exploration authority

Planner, not a movement-mode numeric minimum, decides what the complete world
contains. The Brief names meaningful entry, middle, off-camera, and remote
areas. If reference-consistent continuous extension would become empty padding
or distort visible geography, Planner may add separately built spaces reached
through a plausible door, cave entrance, lift, hatch, or portal. Physical
continuations remain preferred; portals are used only when the world fiction
supports them.

Builder realizes those named spaces at reference-consistent scale. Fixed
192/320/512-meter spans, fixed farthest-point distances, and fixed chunk counts
are report-only observations and never admission failures. Structural admission
still requires safe spawn, valid support, complete selected visual targets,
and reachability through physical support edges plus declared space
transitions. Human review owns geographic fidelity and whether the planned
exploration is meaningful rather than padded.

### 17.3 Space-transition contract

An Agent-authored Block World may declare zero or more primary-action space
transitions. Each transition has one stable ID, one `interactive-trigger`
source block carrying the same `interactionInstanceId`, one standable
destination position, and one destination yaw quarter-turn. Each direction is
declared independently; a two-way doorway or portal has two triggers and two
transition rows.

The checker validates IDs, trigger identity/preset, destination support, and
adds each transition as a directed edge in the subject-relative reachability
graph. The Host compiler creates internal destination anchors and preserves the
trigger identity in internal semantic transport. Runtime activates the nearest
eligible trigger on the rising edge of `primary-action`, resets the controlled
Subject to the checked destination, clears motion, and lets the existing Camera
teleport-snap contract preserve view continuity. The internal transport is not
a second Agent-facing interaction API.

### 17.4 Automatic ground-only cliff boundary

Builder never authors air-wall blocks. The SDK derives boundary segments from
the same global walkable-tile topology that owns smoothing and support. An edge
with no same-height or auto-smooth neighboring support becomes a ground
boundary; global edge ownership prevents a loaded 32-meter chunk seam from
becoming a false cliff. Each segment rises invisibly above the reconstructed
surface and is merged into the owning physics chunk.

Ground boundaries have a dedicated Havok collision-membership bit. Ground
kernels (`free-ground`, `forward-steer`, `wheeled-arcade`, and
`surface-slide`) include that bit in their collide mask. Water-surface and
flight/glide kernels exclude it while retaining every unrelated collision bit.
The filter follows the active locked motion kernel, not the instantaneous
published `ground`/`air` support state, so a jumping ground Subject cannot pass
through the boundary while a real air or water Subject is never fenced by it.

Boundary meshes are invisible, cast no shadow, do not enter capture mappings,
and are created/disposed with the same chunk collision residency owner. Since
all topology is frozen in the Execution Plan, an absent neighboring authored
chunk is a real world edge; future procedural streaming must provide a pending
neighbor state before it may reuse this derivation.

### 17.5 Builder evidence priority

Builder uses the uploaded reference for visible meaning, the entry target for
opening composition and visible block silhouettes, and the top-down overview
for hidden geography, traversable domains, and transitions. It implements every
named space and connection and may not create empty extent merely to increase a
metric. If those inputs disagree, Builder stops with a diagnostic rather than
inventing a fourth layout.

### 17.6 BW6 dependency-aware work graph

| ID | Goal and independently verifiable deliverable | depends_on | blocks | Exclusive ownership / integration | Evidence | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| `BW6-00` | Freeze image lineage, transition, exploration, and boundary authority | `BW5-05` | all BW6 | design, plan, AGENTS truth | diff/link and authority review | `main-agent-only` |
| `BW6-01` | Make one Planner task generate entry first and derive the complete overview from it | `BW6-00` | `BW6-04` | Planner Skill/references, launcher prompt, portable receipt | skill tests, output contract, receipt parity | `sequential` |
| `BW6-02` | Admit checked directed space transitions and compile internal trigger/anchor transport | `BW6-00` | `BW6-04`, `BW6-05` | Block World types/checker, Three result, Block Compiler | invalid trigger/destination, directed reachability, deterministic compile tests | `sequential` |
| `BW6-03` | Derive invisible chunk-resident ground-only boundaries and kernel collision filtering | `BW6-00` | `BW6-05` | walkable topology, chunk collision, motion kernel | seam/exposed-edge topology, mask, real Havok ground/flight behavior, cleanup | `sequential` |
| `BW6-04` | Teach Builder exact evidence priority, linked-space construction, and content-led scale | `BW6-01`, `BW6-02` | `BW6-05` | Builder Skill/reference, self-check, launcher prompt | skill/parity and small meaningful-world regression | `sequential` |
| `BW6-05` | Integrate hosted pipeline, Studio artifacts, Runtime, and complete verification | `BW6-02`, `BW6-03`, `BW6-04` | — | cross-cutting integration and evidence | focused tests, typecheck, root/Studio/independent tests, build, Browser play | `main-agent-only` |

## 18. BW7 continuous four-times plan and Builder visual review

BW7 narrows the current hosted workflow without deleting the underlying BW6
transition capability. Planner and Builder now use exactly one continuous
geographic world. `world-plan.png` covers at least four times the geographic
area visible in the uploaded reference, normally through about two times the
visible width and two times the visible depth. Meaningful terrain continuation,
not blank padding, owns that area. Hosted `world.mjs` leaves
`spaceTransitions` empty; multi-panel plans, portals, teleports, and hidden
destination scenes are out of scope for this workflow.

The Brief contains one or more ordered movement rows. The first is the startup
mode and later rows are alternate modes of the same Subject. Only ground-motion
support is marked as a traversable region. Air, underwater, and water-surface
reachability have no colored path/domain overlay. The ground checker requires a
single connected reachable component only when every movement row is one of the
four ground modes. If any row is flight, underwater, water-surface, or custom
free-space motion, disconnected standable ground remains observable but is not
blocking, and unreachable ground targets are not used as proof that the complete
Subject is unreachable.

Builder structural admission and Builder visual judgment are separate. The
portable `self-check.mjs` owns extraction, block semantics, movement-aware
ground connectivity, Subject/camera metadata, compilation, and derived maps.
The portable `render-visual-review.mjs` then renders current `world.mjs` into:

- `builder-top-down-comparison.png`: Planner top-down left, Builder top-down right;
- `builder-entry-comparison.png`: Planner entry intent left, Builder entry render right.

Builder must open both images and repair only `world.mjs` before finishing. Host
replays the two scripts, byte-compares canonical JSON, and compares exact decoded
RGBA pixels for PNG reviews so encoder/compression drift is not mistaken for
semantic drift. It does not score visual similarity, replace human/Agent judgment with pixel heuristics, or
promote the software preview to Runtime evidence. Actual whitebox authority
still begins with Babylon capture after Builder completes.

| ID | Goal and independently verifiable deliverable | depends_on | blocks | Exclusive ownership / integration | Evidence | Mode |
| --- | --- | --- | --- | --- | --- | --- |
| `BW7-01` | Freeze one continuous four-times-area Planner contract and plural movement rows | `BW6-05` | `BW7-02`, `BW7-03` | Scene Brief parser, Planner Skill/references/prompt | parser, skill and image-checker tests | `sequential` |
| `BW7-02` | Make ground connectivity conditional on a ground-only movement set | `BW7-01` | `BW7-04` | Block checker and Builder self-check | hybrid disconnected-ground regression | `sequential` |
| `BW7-03` | Add a portable deterministic Builder visual-review script and instructions | `BW7-01` | `BW7-04` | Builder Skill script/source and two PNG artifacts | source/bundle parity, deterministic render and visual inspection | `sequential` |
| `BW7-04` | Integrate closed Codex outputs, Host replay, Studio deliverables and complete verification | `BW7-02`, `BW7-03` | — | launcher, Studio and documentation | focused/full gates and rendered review evidence | `main-agent-only` |

## 19. Hosted trust and Agent-facing capability closure

Registry registration, Hosted Builder admission, and Agent advertisement are
different facts. The trusted Host generates one `AgentAuthoringCatalogV1` by
running every exact Subject Definition through the real Block compiler. Studio,
Builder Prompt, Builder Skill, self-check, and software visual review consume
that same catalog. An admitted row records the actual executable movement-mode
closure, body topology, asset/proxy bounds, Camera Context, and the one Builder
opening rig. A Registry row that fails the probe remains diagnostic-only and is
never advertised. Visual topology does not imply behavior: an asset that looks
like a vehicle or glider but exposes only the ground Character closure remains
ground walking.

The Scene Brief movement set is a required capability contract, independent of
ground-connectivity policy. Self-check rejects a controlled Subject unless all
Brief modes exist in its admitted executable closure. The current Agent-composed
Subject closure is ground walking only; scene code cannot invent or reserve a
Runtime kernel.

The strict Authoring third-person rig owns deterministic opening composition.
Runtime Camera Profiles are not Builder-selectable rig refs: the admitted
Subject's Camera Context chooses the opening Profile automatically. Runtime then
validates and projects Builder distance, target height, pitch, and FOV onto that
  selected Profile, so software review and actual Babylon opening capture share
  one authored tuning. Explicit Preview tuning may override it later, while a
  later context-selected Profile and active context Modifiers retain their own
  authoritative parameters.

Studio does not trust equal artifact strings. It reconstructs the expected
World Build from admitted AuthoringSpec, formally parses Runtime Snapshot V4,
and verifies a cryptographically Host-signed capture receipt. The project-local
Ed25519 private key is external to the artifact bundle and only its separately
trusted public key is used for import. The receipt first binds World Build
Identity, AuthoringSpec, opening PNG bytes, and Snapshot bytes at
`runtime-ready`; only successful tri-view completion advances it to
`triview-ready` and binds the manifest plus every image. Therefore tri-view
failure never revokes a valid playable whitebox, while forged Build identity,
partial Snapshot, cross-world Snapshot, and swapped capture bytes fail closed.
