# Hosted Scene Brief and Evaluation Workflow

## Positioning

This workflow is the current Agent-facing hosted authoring path on the Block World branch. The Planner writes compact intent; the Builder directly writes one portable Three.js `world.mjs` module. Internal Canonical data remains Host-owned runtime transport and is not a competing Agent contract.

Neither planning image is runtime evidence. Actual whitebox images and tri-views are produced only by the verified Babylon Runtime.

For tri-views, Builder declares the semantic front of each non-subject complete
target once; the Subject reuses its authored yaw. The Host carries that local
direction into Runtime capture, and all Front / Right / Back panels share one
orthographic meter-to-pixel scale and vertical baseline. Visual reconstruction
must preserve those panels rather than infer orientation from the opening
Camera or refit each view independently.

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

The trusted Host owns extraction, block/preset admission, Subject-relative connectivity, Registry closure, Gameplay Bootstrap, internal compilation, final implementation-map promotion and runtime capture. In the default cloud lane that Host runs inside one isolated, digest-pinned Cloud Scene Worker; the local Host exists only for explicit developer runs. The Builder never writes a second JSON world description or Babylon/Havok handles.

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

Hosted Builder registration is narrower than Runtime Registry availability.
Ordinary human/biped authoring requires an admitted asset-backed rigged Subject
such as `humanoid.g-bot@2`; primitive humanoid capsules remain SDK test/runtime
fixtures and appear only in the Agent Catalog's `rejectedSubjects`. Builder
self-check rejects a registered ref that is absent from `subjects`.

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

The Brief defines one to five complete visual targets. The first and only
controlled Subject target is required. A target represents a semantic whole,
not every mesh or structural part. Non-controlled people, animals, creatures,
vehicles, machines, sculptures, and distinctive props count as landmark targets
when they are identity-critical to the reference; repeated identical important
objects share one repeated-landmark target. Ordinary background crowds, herds,
traffic, and decoration do not consume slots.

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

Each task is isolated, uses atomic artifact promotion, records stage receipts and can be retried without treating partial results as passed. The Studio `cloud` selection routes the complete unchanged workflow through Cloud Execution, including trusted Host capture, while `local` remains a one-slot developer lane. One Kubernetes Worker owns one ephemeral Scene workspace, so concurrent cases do not share Vite watchers, Chromium state, or output directories. Large artifacts stay in S3; Studio persists a bounded hash index and streams or verifies bytes on demand. A queued, running, or remote-pending case can be stopped without counting user cancellation as an evaluation failure. Each cloud attempt uses one idempotent Cloud Execution request and reconciles that exact execution identity instead of starting a local fallback.

Planner's ordinary wait window is 45 minutes; Builder and final visual reconstruction each wait 120 minutes inside the Worker. Studio heartbeats the enclosing Cloud Execution and resumes reconciliation by `execution_id` after a restart. Execution creation, dispatch, and pinned Worker launch are distinct persisted recovery points, so a response loss between them advances the same execution instead of creating another one. `ready` is absorbing for one attempt, and every lifecycle write is conditional on attempt, revision, execution and Job identity. A transient browser navigation/startup capture failure receives one Host-only retry in the same ephemeral workspace. A later manual Host recovery retries the same Cloud Execution stage from its exact S3 manifest only when that manifest closes the full Planner and Builder handoff; it never reruns an admitted Planner or Builder. Early failures use a full attempt. Nested Codex capacity and transport failures use at most three isolated Stage attempts. When Ray delivery succeeded but LWDP progress is stale, a Worker may proceed only from an exact 1/1-success delivery report and single-task manifest whose output URIs exactly match the declared current task. Terminal Agent failures continue to follow the bounded stage-specific retry rules inside the existing pipeline. External evaluation corpora belong outside ordinary Git history; their manifests must record source, license/provenance and content hashes.

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
