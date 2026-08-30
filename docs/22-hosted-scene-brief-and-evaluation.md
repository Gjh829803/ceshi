# Hosted Scene Brief and Evaluation Workflow

## Positioning

This workflow is the current Agent-facing hosted authoring path on the Block World branch. The Planner writes compact intent; the Builder directly writes one portable Three.js `world.mjs` module. Internal Canonical data remains Host-owned runtime transport and is not a competing Agent contract.

Neither planning image is runtime evidence. Actual whitebox images and tri-views are produced only by the verified Babylon Runtime.

## Authority chain

```text
User prompt + optional reference image
  -> Scene Brief (intent and evidence classification)
  -> 16:9 block-whitebox entry intent
  -> complete top-down plan derived from that exact entry image
  -> Block Builder world.mjs
  -> Three.js extraction + Block Manifest/check
  -> Builder top-down and entry comparison images + in-job visual review
  -> Trusted Host-derived implementation map and runtime transport
  -> NormalizedWorldIR V4
  -> ExecutionPlan V5
  -> Babylon/Havok runtime capture
  -> optional provider-neutral visual reconstruction
```

The trusted Host owns extraction, block/preset admission, Subject-relative connectivity, Registry closure, Gameplay Bootstrap, internal compilation, final implementation-map promotion and runtime capture. The Builder never writes a second JSON world description or Babylon/Havok handles.

## Scene Brief contract

`scene-brief.md` is deliberately short and has closed required sections:

- `场景` and `主体` define the requested semantic whole;
- `用户事实` records explicit user requirements;
- `可见参考证据` records only what the reference actually shows;
- `推断的世界延伸` separates playable continuation inferred from a partial view;
- `仅视觉层设想` prevents lighting, texture and style from becoming collision geometry;
- `运动模式`, `空间`, `通行`, `首帧`, and `视觉目标` describe requested behavior and composition.

Movement rows are ordered requests, not proof of runtime support. The first row
is the startup/default mode and later rows are alternate modes of the same
controlled Subject. Block World accepts a registered or composed controlled
Subject and movement-aware ground connectivity. Movement capabilities absent from the selected Subject and
general interactive state search remain explicit gaps rather than hidden
fallbacks.

World content is derived from visible evidence and inferred continuation. The
Planner must produce one continuous geographic world with meaningful middle,
side/rear, and remote regions whose total top-down footprint is at least four
times the reference-visible area. It does not split the plan into panels,
portals, teleports, or hidden scenes. Builder reports logical span, spawn distance,
32-meter chunk coverage, and off-camera reachability for review, but none is a
replacement for the four-times visual plan. Ground support connectivity is
blocking only when every movement row is ground-based; hybrid/free-space modes
leave disconnected ground as a metric because the ground graph is not their
complete reachability authority. Raw bounds padding is not exploration.

## Visual targets and implementation map

The Brief defines one to five complete visual targets. The first and only subject target is required. A target represents a semantic whole, not every mesh or structural part.

The controlled Subject declares the primary target ID. Every other complete target is a shared `visualGroupId` on its blocks. The Host derives the one-to-many runtime mapping and promotes it into `scene-implementation-map.json`; the Builder never writes that map.

Both planning images use the same functional block colors as `world.mjs`:
walkable `#B7E4C7`, obstacle `#5F6368`, interactive solid `#00B8A9`,
interactive trigger `#B8DE6F`, water `#8ECDF4`, cloud support `#D8D4F2`,
passable cloud `#EEF6FF`, and visual-only `#D6D3D1`. Target 1 is only a small
red spawn-position token in the top-down plan and the complete red controlled
Subject mask in the entry image; targets 2-5 use orange, yellow, blue, and purple
landmark blocks. Studio renders the legend outside the PNGs. Flight, swimming,
and water-surface navigable domains are not painted; water remains blue only as
medium. The one continuous plan contains no text overlays. Both planning images
remain non-authoritative intent.

## Portable self-checkers

The Planner keeps its generated portable checker. It checks both PNG structures,
block-palette coverage, movement-appropriate support color, all target colors in
the complete top-down plan, the entry's 16:9 ratio, and the centered Subject
mask. It does not guess top-down marker shape or geography; Studio persists a
human approval/rejection against exact Planner artifact hashes. The Block Builder checker is a portable bundle around
`agent-block-builder-self-check.ts`; it covers Mesh admission, immutable
materials, grid transforms, preset identity, spawn/clearance, movement-aware
ground connectivity,
ordered target colors, visual grouping, Subject/camera metadata, internal
compilation, report-only exploration measurements and derived-map integrity.
The Skill's separate `render-visual-review.mjs` produces a top-down comparison
and an entry comparison with Planner intent on the left and current `world.mjs`
on the right. Builder must open both and iterate; Host replay compares exact
decoded RGBA pixels while ignoring PNG compression-byte differences, but does
not score visual similarity. Host replay still byte-compares
current receipts and derived transport; V2/V3-to-V4 Host-only recovery admits a
target-preserving map migration from original block IDs to Host chunk-cluster IDs.

## Studio workflow

Studio persists one unreleased current workflow contract instead of carrying V18-V23 branches:

1. input;
2. hosted planner and planner self-check;
3. Block Builder `world.mjs`, Builder self-check, and two inspected comparison PNGs;
4. trusted Block compilation and runtime build;
5. real Babylon runtime capture;
6. Snapshot V4 plus opening-frame third-person alignment validation;
7. optional visual prompt synthesis;
8. optional visual image generation.

Each task is isolated, uses atomic artifact promotion, records stage receipts and can be retried without treating partial results as passed. Cloud and local Codex execution use independent bounded queues; local defaults to one slot. A queued, running, or remote-pending case can be stopped without counting user cancellation as an evaluation failure. Each cloud attempt uses one single-task POST and recovers an uncertain response only through the same stable `request_id`, never by issuing a duplicate creation request.

Planner's ordinary wait window is 45 minutes; Builder and final visual reconstruction each wait 120 minutes. A Job that remains non-terminal after its stage window becomes `remote-pending` rather than failed. It releases the local Studio slot while the Studio reconciles the exact Job for a further 60 minutes. A late successful Planner/Builder delivery resumes from the next trusted stage; a late successful visual delivery downloads only the declared outputs, runs local finalizers, and preserves the already-playable whitebox boundary. Terminal visual auth, account/model incompatibility, capacity, or transport failures may use at most two new whole-task attempts with distinct request IDs and S3 prefixes; a terminal Codex task timeout may retry once. Account/model retries keep the formal model and effort unchanged and rely on the new Job identity to select another eligible account. Deterministic output-contract failures do not retry blindly. External evaluation corpora belong outside ordinary Git history; their manifests must record source, license/provenance and content hashes.

## Current production boundary

Block World V2 supports direct metric mixed-shape construction, fixed preset semantics,
registered or Agent-composed Subjects, centered third-person framing,
movement-aware ground connectivity,
deterministic 32-meter chunk clusters, reconstructed walkable surfaces,
automatic ground-only cliff boundaries, lit semantic block materials, Thin Instance
render batches, far-geometry visibility and Subject-centered static-collision
residency. The current hosted workflow leaves space transitions unused and
keeps one continuous world; the underlying primary-action transition capability remains internal/experimental.
general stateful door animation, complete flight/water movement, infinite
procedural generation and networking are not yet complete.

## Commands

```bash
pnpm generate:agent-self-check
pnpm check:agent-self-check
pnpm agent:world -- --scene-id <scene-id> --image /absolute/reference.png "<request>"
pnpm agent:world:plan -- --scene-id <scene-id> --image /absolute/reference.png "<request>"
pnpm agent:world:build -- --scene-id <scene-id>
pnpm studio
```

`world.mjs` is the single current Builder geometry authority on this branch.
