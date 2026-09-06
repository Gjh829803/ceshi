## Known-good historical Creator baseline — 2026-09-06

The user subsequently authorized migrating the selected camera interpolation and
collision recovery fixes, input focus/release, source save/checkpoint/continuation,
cloud reliability, prioritized representative tri-views, asset search and bounded
image transport together, then comparing the same canyon/ring cloud cases.
Implementation authority: `docs/superpowers/plans/2026-09-06-selected-migration.md`.
Keep the historical normal-task instruction byte-identical, authored opening and
follow configuration semantics, recorded self-test contract and examples unchanged.
Do not migrate UI presentation, framing inheritance, static batching, budget advice
or mandatory planning instructions. The below historical freeze is superseded only
for these explicitly selected changes. Do not give generated cases repair hints.

The user requested restoring the exact version that generated the canyon courier
and hollow-ring worlds, then adding later improvements one at a time. This branch
is based on `03b8cb656c2e4ccf0770f50d8c09872c39259a48`. Keep SDK, Creator tools,
prompt and launcher at this baseline until a specific next change is requested.
The pinned cloud runtime and restoration evidence are documented in
`docs/evaluations/gpt6-three/known-good-baseline/README.md`.

The historical Agent playtest mechanism belongs to this baseline. The production
evaluation viewer remains separate: do not reintroduce assistant/human review as a
playability gate. Later camera, UI, capture, budget, continuation and prompt changes
remain preserved on `codex/gpt6-world-agent-refactor`, not silently mixed in here.
The user subsequently authorized submitting and testing that exact two-case replay.
Run `known-good-baseline-two-20260906` selects only the canyon and hollow-ring cases;
keep `--case-limit 2` explicit when using this historical runner for run/resume.
Do not add optimizations or send case-specific repair hints during the comparison.

# Agent Whitebox World authoring rules

## GPT-6 Creator reconstruction branch — 2026-09-05

### SDK v2 extension and cloud five-case authorization

The user has now authorized implementing the aligned SDK v2 and its movement,
state/environment and prepared-geometry extensions, followed by five concurrent
cloud cases. The D0-only implementation pause is lifted. Current integration
work graph: [SDK v2 extension and cloud five](docs/superpowers/plans/2026-09-05-sdk-v2-extension-and-cloud-five.md).
The public implemented contract is `packages/three-world/src/contracts.ts`;
`engine.ts` / `engine-contracts.ts` are private adapters for the same single
Three scene, renderer, Rapier world and clock, not a second public dialect.
Cloud tasks use gpt-6-astra/xhigh, one frozen SDK/tool capsule and up to five
actual concurrent SDK-only cases. Preserve the older design-only review and
failed evidence as history; do not call new API typechecks runtime/cloud proof.


### Authorized Three Creator SDK refactor

The user subsequently authorized verifying native Three.js creation with a thin
SDK and refactoring the SDK. For this new implementation, the current authority
is [Three Creator SDK refactor](docs/superpowers/specs/2026-09-05-three-creator-sdk-refactor.md)
and its [work graph](docs/superpowers/plans/2026-09-05-three-creator-sdk-refactor.md).
This explicitly supersedes the Native-only D01 and old Three import restrictions
for `packages/three-world`, its Creator tools/apps and authored experimental
worlds. Normal Three scene graphs, cameras and sanctioned update/interaction
hooks are intended. Use one Three scene and one verified physics world; do not
bridge through a second Babylon world or fake ground with ray/AABB checks.
Preserve existing production guards, old V3 artifacts, credentials isolation,
single state ownership and truthful evidence. This user authorization does not
require another approval solely because old documents prescribe Babylon.

The user explicitly authorized a new branch and a complete Agent redesign for
reference-faithful playable low-poly worlds, cloud Codex tools/plugins, reusable
subjects/actions, and clear low-latency world/NPC control. This branch is
`codex/gpt6-world-agent-refactor`; its inherited source baseline is `50a1e14a`.

The current design authority for that work is
[`2026-09-05-gpt6-controllable-world-agent-design.md`](docs/superpowers/specs/2026-09-05-gpt6-controllable-world-agent-design.md),
with its [implementation graph](docs/superpowers/plans/2026-09-05-gpt6-world-agent-implementation-plan.md)
and [cloud Runtime specification](docs/superpowers/specs/2026-09-05-gpt6-cloud-creator-runtime-design.md).
These are design documents, not claims that their proposed APIs or deployment
already exist.

For the new Creator, the old mandatory Planner/Builder split, two planning
images, four block shapes, five visual target slots, centered-rear opening and
`gpt-5.6-sol` lock below describe the inherited workflow; do not copy them into
the new Creator contract. The new design targets `gpt-6-astra / xhigh`, Native
authoring, real Runtime feedback, and explicit SDK-owned control. The user has
already authorized changing those old constraints; do not request permission
again solely because an inherited document contains them.

Keep naming rules, exact resource identity, physics/movement/camera/tick
ownership, credential isolation, truthful validation and dependency-aware
integration. Existing production paths remain governed by their implemented
contracts until the explicit cutover gate. Do not silently bypass a validator,
declare an unimplemented capability, import the whole donor branch, expose
production credentials to generated code, or call a local/mock run cloud GO.

## Goal

Create playable outdoor whitebox scenes through a gated multi-agent workflow. Planning, whitebox implementation, and visual styling are separate responsibilities; never collapse their authority by improvising geometry or editing SDK internals.

## Design-stage responsibility decomposition

For complex SDK or runtime work, define responsibility boundaries during technical design, before implementation begins. The design or implementation plan must provide a dependency-aware work graph whose tasks each state:

- a stable ID, goal, and independently verifiable deliverable;
- `depends_on` and `blocks` relationships;
- exclusive ownership of files, interfaces, generated artifacts, processes, and other shared resources;
- stable input/output contracts and the exact integration point;
- required verification evidence; and
- an execution mode: `parallel-safe`, `sequential`, or `main-agent-only`.

Keep architecture, cross-cutting interfaces, dependency decisions, and final integration owned by the main agent until their contracts are stable. Parallelize only ready workstreams that are materially independent and whose time savings exceed coordination costs. Do not distort the architecture, invent work, or split tightly coupled edits merely to occupy more agents. Successful worker reports are not integration proof: review the actual changes, reconcile assumptions, and run end-to-end gates after integration.

## Schema naming and AI friendliness

Apply these rules whenever adding or changing public Authoring Schema, Registry manifests, Commands, Events, Snapshots, CLI/Browser protocols, examples, or generated types. The authoritative detailed rules live in `docs/superpowers/specs/2026-08-17-ai-first-lego-game-sdk-design.md`.

- Use one canonical term for each concept. Do not keep synonymous public fields or ask adapters to translate between competing dialects.
- Use `id` for the current object. Use role-qualified local references such as `...EntityId`, `...ControllerId`, `...SessionId`, `...SlotId`, and `...SocketId`.
- Use `...Ref` for Registry, WorldPackage, or content-addressed resources, and `...Uri` only for raw locations. A resource-valued field must not use a bare name such as `rig`, `prototype`, `asset`, or `profile`.
- Use `schemaVersion` for serialized protocol structure, `version` for Registry resource versions, and `resolvedVersion` only for locked implementations.
- Use `kind` as the discriminator for persistent definitions and nodes, `type` for Commands, Events, Relationships, and Change Operations, and `mode` for mutually exclusive runtime state.
- Use role-specific Relationship endpoints such as `riderEntityId`, `mountEntityId`, `itemEntityId`, and `wearerEntityId`. Do not expose generic `subject/target/params` triples in AI-facing Schema; generic graph endpoints are internal to Normalized IR.
- Put units and coordinate domains in numeric field names, including `Meters`, `Seconds`, `Radians`, `Degrees`, `Ticks`, `Ratio`, `Bytes`, `XYZ`, `XZ`, and `Uv`. Do not rely on surrounding prose to disambiguate units.
- Prefer required discriminators, closed enums, and discriminated unions over combinations of overlapping optional flags. Collections use plural names, ID-indexed maps use `...ById`, and booleans use `is...`, `has...`, `allow...`, or an explicit `...Enabled` suffix.
- Canonical Schema, AI Schema Profile, CLI, Browser Protocol, examples, and generated types use the same public field names. Babylon, Havok, renderer handles, and provider-specific terminology stay behind adapters.
- A released or externally adopted public rename must update the authoritative Schema, examples, validation, migration, and conformance coverage together. Preserve that compatibility through explicit version migration, not permanent alias fields. For an unreleased private Schema, an explicitly approved clean break may delete the old version and rewrite all local fixtures/artifacts instead of creating migration code solely for development history.

## Dependency reuse and utility code

- Before writing a general-purpose helper, search the repository and check the language runtime, platform APIs, engine APIs, and existing dependencies. Prefer a mature, maintained implementation when it reduces custom code and edge-case risk.
- Use `lodash-es` for established collection and object operations such as grouping, ordering, deduplication, deep comparison, and debounce or throttle behavior. Do not reimplement these utilities without a domain-specific reason.
- Import only the functions that are used, for example `import { groupBy } from "lodash-es"`. Do not import the full `lodash-es` namespace.
- Prefer Babylon.js math and geometry APIs for vectors, matrices, quaternions, transforms, bounds, and other 3D calculations. `lodash-es` is not a replacement for engine math.
- Prefer a clear native JavaScript or TypeScript expression when it is simpler than a library call. Avoid dependencies or abstractions that do not materially improve correctness, readability, or maintenance.
- Every workspace package must declare the libraries it imports as direct dependencies. Do not rely on undeclared dependencies being available from the workspace root.
- Keep domain-specific algorithms local, deterministic, and covered by focused tests. Reuse libraries for generic mechanics; keep SDK semantics in SDK-owned code.

## Experimental Three.js Block World authoring

The experimental Block World slice is a narrow authoring exception to the Babylon-only Runtime rule. Its authority is frozen in
`docs/superpowers/specs/2026-08-26-threejs-block-world-authoring-design.md` and its dependency graph in
`docs/superpowers/plans/2026-08-26-threejs-block-world-authoring-implementation-plan.md`.

- Three.js may be imported only by `@whitebox-world/block-world-three` and direct Agent-authored Block World modules or examples that target that adapter. It must not enter Canonical Authoring, Compiler, Runtime Contracts, Camera, Runtime Host, Runtime Babylon, Browser Protocol, capture, or Studio.
- The Agent creates ordinary metric `THREE.Mesh` world boxes and rigid Subject box/sphere/cylinder shapes directly and may write its own TypeScript loops and helpers. Keep geometry authority in those direct mesh placements; do not add a second semantic construction surface.
- The Agent selects one immutable preset ref and placement per block. It must not choose or override collision values, traversal traits, opacity, or preset colors. Bind blocks with `bindWorldkitBlockV1(...)`; provider metadata, not `userData`, is authoritative.
- Admit world blocks only as undeformed full `[1,1,1]`, half `[1,0.5,1]`, quarter-volume `[0.5,0.5,1]`, and small `[0.5,0.5,0.5]` BoxGeometry with faces on the 0.5-meter micro-grid, centers on the 0.25-meter lattice, unit world scale, and Y-only quarter turns. Subject Mesh bindings separately admit centered undeformed BoxGeometry, SphereGeometry, and equal-radius full CylinderGeometry with unit world scale; they flatten into rigid Subject visual parts and never become world blocks. Extract with `extractThreeBlockWorldV2(...)`, then run `checkBlockWorldV2(...)` or `pnpm block-world:check` before claiming the authored Block World passes.
- Use `visualGroupId` for a complete landmark identity. Landmark-colored blocks are obstacle-physical and one group uses one reserved landmark color; functional walkable blocks may share the group without changing their functional preset.
- The Hosted Builder uses this Block World contract exclusively. The Host-owned Block Compiler may translate a passing Manifest into the existing Runtime transport; Agent code must not bypass extraction/checking or write that transport directly.

## Deep runtime review discipline

Apply `docs/reviews/runtime-deep-review-checklist.md` whenever changing or reviewing physics, movement, input, animation, camera, render scheduling, resource ownership, or Browser/CLI runtime behavior. For design-spec reviews, change reviews, or full-repository audits, follow `docs/reviews/full-dimension-review-protocol.md`; it selects the required dimensions per review mode and delegates runtime-specific items back to this checklist. `docs/superpowers/specs/2026-08-21-control-feel-physics-medium-state-resolver-design.md` is the frozen P1.5 implementation authority: use only `control-profile`, `control-feel-profile`, `locomotion-profile`, and `medium-profile`; keep speed in Feel, boolean capabilities in Locomotion, slope/step in Physics Body, and Character support in the single `checkSupport()` path. Do not restore Motion parameter bags, ray/AABB grounding, or a first-slice `movementMedium: "water"` through adapters or aliases.

- Identify one authoritative owner for every piece of state. In particular, ground support, movement medium, subject facing, camera orbit, active action, and fixed-step time must not be independently inferred by multiple layers.
- Verify engine-dependent assumptions against the installed dependency version and source. Do not rely on remembered Babylon or Havok behavior for coordinate order, controller gravity, collision data layout, animation timing, or disposal semantics.
- Require adversarial regression coverage in addition to happy paths: asymmetric geometry/data, unsupported spawn and ledge departure, held-versus-pressed input, reset and rebind transitions, 30/60/120 Hz-like render timing, multi-instance isolation, partial construction, and throwing cleanup.
- Review integrations as a semantic three-way merge. Compare the base, incoming branch, and target behavior for each authority; resolving textual conflicts is not sufficient evidence that behavior was preserved.
- Separate automated contract evidence, rendered visual evidence, and manual interaction evidence. State exactly which was run, and do not claim production support for an experimental capability from a smoke test alone.
- Every confirmed runtime bug fix needs a failing reproducer before the fix, a focused regression after it, and the repository's full relevant verification gates before completion.
- Treat verification evidence as scoped to the exact tree state and affected domain. After each edit, rerun the focused regression first; before integration, run each relevant full gate once. Do not rerun a command already covered by a broader passing command on the same tree: root `pnpm test` includes `pnpm test:scenes`, while `pnpm test:studio`, production builds, Browser verifiers, rendered inspection, and manual interaction remain separate evidence layers.
- A later change invalidates only evidence whose inputs or claimed behavior it can affect. Runtime/source changes invalidate the focused tests plus the relevant typecheck, test, build, or capability verifier; build/dependency changes invalidate affected builds; documentation-only truth updates require diff/link checks, not runtime replay. When an independent review finds a narrow defect after full gates passed, rerun the new reproducer and only the gates touched by that fix unless the fix changes a cross-cutting contract or shared runtime authority.

## Agent roles and frozen boundary

- **World Planner Agent** writes the Scene Brief and two intent images. It never writes geometry, block coordinates, Subject refs, camera numbers, or runtime data.
- **Block Builder Agent** writes only `artifacts/scenes/<scene-id>/world.mjs` through `.codex/skills/worldkit-block-builder/SKILL.md`. It does not edit Planner inputs or Host-derived JSON.
- **Trusted Host** extracts and checks the Three.js Scene, derives the internal runtime transport and visual mappings, compiles, captures, validates entry alignment, and promotes artifacts.
- **Visual generation** consumes only verified whitebox evidence. It never changes block placement, Subject identity, camera path, collision, or connectivity.

### Hosted Scene Brief workflow

1. Invoke the Unified Planner once with `.codex/skills/worldkit-spatial-planner/SKILL.md`. In that same Codex job it writes the Scene Brief, generates and inspects the 16:9 entry target first, then supplies that exact PNG with the uploaded reference and Brief to image generation for the complete top-down world plan. Both use the immutable Block World functional colors; ordered complete visual targets use the shared target palette. Planner must preserve volumetric evidence as well as screen layout: terrain, stairs, bridges, platforms, and buildings carry consistent footprints, elevation profiles, cross-sections, thickness, and over/under relationships. The current workflow always plans one continuous geographic world whose top-down explorable footprint is at least four times the reference-visible area; it does not use multi-panel spaces, portals, or teleports.
2. In the same Planner Job, run the Skill-bundled `scripts/self-check.mjs`, repair the Brief and regenerate both images until it passes, and deliver `planner-self-check.json`. The top-down plan uses only a small red spawn-position token; the complete red Subject exists only in the 16:9 entry image, whose center may deviate by at most 1.5% of image width. The checker measures palette coverage, movement-appropriate support colors, ordered landmark colors, file integrity, entry ratio, and the centered entry Subject silhouette. Do not add top-down token area/shape/recognition heuristics: geography, inferred continuation, spawn-token meaning, and visual quality are surfaced for human Studio review. The host replays the same check once, compares all three input hashes, and never launches a separate Planner Repair Agent.
3. Invoke the Block Builder once with `.codex/skills/worldkit-block-builder/SKILL.md`. It creates `world.mjs` by directly placing bound metric Three.js world boxes and declares one controlled Subject Assembly plus one exact 16:9 Camera Pack. The world must remain faithful from side/top/rear exploration, not merely reproduce one projected silhouette; visible stairs connect real endpoint elevations and terrain/structures have reference-consistent depth and mass. Subject selection is behavior-first and uses the Host-generated `agent-authoring-catalog.json` shared by Studio, Prompt, Skill, and self-check. The Agent selects a reusable `subjectPacks` base or a rigid custom Mesh base, one compatible `motionPacks` entry for the complete assembly, automatic or compatible fixed presentation, optional rigid attachments, and one `cameraPacks` entry with an explicit Socket/bounds/local-point target. Human is only one rigged pack and is not an architectural special case. Primitive capsules, Golden fixtures, and traversal proxies are absent from the Agent catalog. The selected base row owns the exact Host-derived Runtime-collider traversal envelope; Agent-authored estimates are rejected. Appearance-only weapons, clothing, armor, backpacks, headwear, colors, faces, and hair never justify custom Subject parts, while a major movement-identifying board, mount, hull, wing, or flying sword may be a rigid attachment. Third-person Camera Packs retain the hard-collision Spring Arm and never use subject fade.
4. In the same Builder Job, run the Skill checker. Repair only `world.mjs` until block admission, movement-aware ground connectivity, spawn, camera, visual grouping, and internal compilation pass. Then run the Skill-owned `render-visual-review.mjs`, open both left-Planner/right-Builder comparison PNGs, and repair `world.mjs` until the continuous top-down layout and entry composition are visually faithful. Those portable software renders are approximate layout feedback, not the actual Babylon Runtime view. When Codex works in a full SDK checkout, it should also run `pnpm agent:world:preview` in the same task, inspect the real Babylon/Havok opening PNG and compact Camera report, and iterate on `world.mjs`; this is feedback, not an image-similarity Gate or a second Agent. The checker derives `authoring.json` and `implementation-map.draft.json`; the Agent must never edit those outputs. The Host replays both portable scripts, byte-compares canonical JSON, and compares exact decoded RGBA pixels for the PNG reviews so cross-environment compression differences are ignored. It does not create an image-similarity Gate.
5. The host finalizes `scene-implementation-map.json` and builds `world.build.json`. Block connectivity is the Builder admission authority; the hosted path does not require a second Route graph. The host runs `worldkit capture` with `--snapshot`, `--receipt`, and `--triview-output`, followed by `scripts/visual/validate-entry-third-person.py`. Formal whitebox tri-views use the exact Runtime meshes and their whitebox materials under the shared daylight rig, preserve Front / Right / Back azimuths and a shared orthographic scale, and add only a fixed 10-degree review elevation so block faces and volume remain legible; they are not flat emissive identity masks. The capture receipt first binds the recomputed World Build Identity to the opening PNG and formally parsed Runtime Snapshot V4, then advances to bind the manifest and every tri-view image only after those captures succeed. Studio signs each receipt with its project-local Host Ed25519 key; the private key never enters the artifact bundle, and admission verifies against the separately trusted public key. Studio also recomputes the Build from AuthoringSpec rather than trusting artifact self-reports. A fresh valid opening PNG plus Runtime Snapshot and runtime-ready receipt publishes the playable whitebox boundary immediately: later tri-view, entry-validation, or styled-output failure blocks only its own downstream result.
6. If a user reference exists, invoke one active formal LWDP Codex visual task attempt with `.codex/skills/worldkit-visual-reconstructor/SKILL.md`. In that one isolated workspace, Codex writes `visual-generation-prompts.json`, uses its built-in image generation tool to create `styled-opening-frame.png`, inspects it, then uses the accepted opening as the shared appearance anchor while generating every grouped `styled-triview.png`. The actual Babylon whitebox opening is the sole opening-frame spatial canvas; the uploaded user image is a direct high-fidelity appearance reference only. Target whitebox tri-views constrain complete-target geometry, proportions, and Front / Right / Back order. The Host declares every output up front and finalizes both manifests after the task returns. A terminal transient auth, account/model incompatibility, capacity, transport, or Codex-task-timeout failure may create a bounded whole-task retry with a new request ID and isolated attempt prefix; a non-terminal/unknown outcome must only be reconciled and never resubmitted. Do not create separate prompt, opening-frame, per-target, or repair Jobs. No playtest or recording is required.

The Playground Recording Workbench is a separate manual post-workflow tool. A user may record multiple runtime clips only after opening a playable world, then explicitly request Prompt synthesis and Seedance 2.5 reference-video generation for one clip. Never insert recording or final video generation into the automatic Planner/Builder/whitebox/first-frame/styled-triview workflow.

### Episode data-production boundary

- The Playthrough Planner model owns exploration intentions, WASD/Shift/Space timing and I/J/K/L camera creativity. Navigation evidence is context, not a Host-scored route puzzle.
- `scripts/lib/deterministic-playthrough-capture.ts` is the only automatic Episode whitebox capture implementation. Formal capture and review capture both call it; do not add a second MediaRecorder, realtime, adaptive-controller, preflight, or frame-normalization path.
- Automatic capture advances Runtime at 60Hz and submits one real rendered screenshot for every 24fps output frame. It never duplicates, interpolates, pads or synthesizes missing frames.
- The Episode Host validates only executable structure, exact membership of six distinct starts in the Host-derived collision-clear stand-position catalog, Runtime Tick health, non-stationary Subject motion, absence of prolonged unsupported ground falling, and exact media dimensions/frame rate/frame count. It does not reject destination misses, route choices, key counts, opposite-key transitions, camera style, or exploration quality; those remain model output for human review.
- I/J/K/L are the canonical Episode camera keys: I up, K down, J left, L right. Legacy Arrow-key traces may be normalized only at the Studio read boundary and are never produced by new capture.
- New full cloud Episodes use one durable streaming execution: `episode-prepare -> whitebox-capture -> style-plan -> style-openings -> style-visuals -> style-diversity -> style-events -> style-prompts -> seedance -> conformance -> publication`. These are engineering checkpoints around the existing content producers, never replacement Agent or prompt boundaries. Every succeeded stage publishes a hash-closed S3 manifest; retry starts at the failed stage and hydrates its direct predecessor. Historical executions and visual-sample runs retain `episode-prepare -> whitebox-capture -> episode-render` for replay compatibility. The capture stage is admitted only through the shared GPU queue. The current Worker digest dispatches every durable ready set immediately as a `ready-wave`; a slow Planner therefore cannot block already-ready captures. An admitted wave runs as an Indexed Kubernetes Job with one isolated Pod per Case and at most 16 concurrent capture Pods; each Pod keeps its own ephemeral workspace, browser, ports, and failure boundary. Older frozen Worker images retain the historical 100-task or closed-producer-tail rule and remain serial for replay compatibility. This scheduling split must not change Agent prompts, capture bytes, camera, Runtime, Gemini, Seedance, or conformance behavior.
- Ten-style Episode rendering first uses one cloud Style Director and one cloud T2I batch to produce ten Segment-00 candidates, then a cloud Codex Reviewer admits and hash-locks the accepted anchors. Only after all ten anchors are admitted may the Host fan out ten independent cloud Style Variant Visual Reconstructor tasks. Each task receives one immutable Segment-00 anchor, the five remaining Segment whitebox frames, and every Runtime whitebox tri-view; it may output only Segments 01-05, its prompt bundle, and target tri-views. The Host rejects any changed anchor, reviews each completed variant independently, performs one final ten-style diversity review, and only then launches the sixty Seedance Segment jobs. Local Codex and local media paths are developer-test lanes and never participate in a cloud Episode execution.
- Each stage and long-running internal producer uploads a hash-closed S3 checkpoint. Unchanged files retain their existing content-addressed S3 objects instead of being uploaded again. Seedance request and Job identity are checkpointed immediately around provider submission, with paths namespaced by Episode, Style Variant, and Segment. Local Studio files are compatibility caches; LWDP execution state, S3 Run Index, phase manifests, provider journals, and final releases are the cloud production authority.
- LWDP admission is batch-based. A Codex/T2I batch may contain up to 1000 tasks/items but occupies one non-terminal LWDP batch slot; item count is never mistaken for caller-side job concurrency. The production caller allows at most 24 simultaneous create HTTP requests and 120 known non-terminal batches. Compatible T2I work should stay batched. Single-task formal Agents retain the service fast path until a producer explicitly supports output-safe multi-task aggregation.
- Infrastructure and unknown-provider outcomes enter durable retry/reconciliation pools with bounded backoff and do not consume content-repair attempts. A content or contract failure remains attached to its exact failed stage. Success in one Case immediately advances to the next stage and is never held behind failures in sibling Cases.

## Project-local provider credentials

- Every production provider credential is read only from `.codex-tmp/runtime-config/` in this checkout. The required closed set is declared by `config/project-runtime-credentials.json` and verified with `pnpm verify:runtime-config`.
- LWDP, MG Seedance, AI MediaKit, Gemini/Google, S3 upload, and public Studio must not use a credential path, token, profile, or service-account file from the user home directory, another checkout, or ambient process environment. Provider launchers clear conflicting credential variables before loading the project-local files.
- Credential files are regular non-symlink files, Git-ignored, and readable only by the current user. Never place their values in prompts, logs, artifacts, ZIP bundles, source files, tests, or responses.
- The optional local Codex developer lane remains the explicit exception described above: its login is owned by Codex itself and is never copied into the repository or exposed to an Agent task. It is not used by the cloud production chain.

## Local Runtime startup

- When a user asks to view the product G Bot locally, run `pnpm dev:g-bot` and open the URL printed by the command.
- Block Builder modules are checked with `pnpm block-world:check` and compiled by the trusted Host before the existing Runtime starts.
- If the browser reports `504 Outdated Optimize Dep` after a branch or dependency change, stop the old server and run `pnpm dev:g-bot:refresh` once. Do not change Babylon, physics, camera, or runtime code to repair a stale Vite dependency cache.
- Use `pnpm dev` for the Babylon-backed catalog Playground. It is a scene workflow and artifact
  surface, not the Canonical Authoring Runtime entry supplied by `worldkit run`.

## Codex execution backend rule

Automatic Scene production has one backend router. `cloud` is the default and means the complete unchanged Scene pipeline runs inside one digest-pinned Cloud Scene Worker: Planner, Builder, trusted Host replay, Babylon capture, entry validation, Visual Reconstructor, signed artifact publication, and S3 delivery. A cloud Studio record must never spawn the local Scene command or local Capture process. `local` is allowed only after an explicit Studio or `WORLDKIT_CODEX_BACKEND=local` selection and runs the same pipeline locally with the installed, authenticated local Codex CLI. The Studio freezes the selected backend into each new world or Seedance Prompt-rewrite job, so changing the switch never migrates queued or running work. Re-generating Seedance after changing the selected backend must invalidate a successful Prompt from the other backend and rewrite it through the newly selected backend; a same-backend Seedance retry may reuse that Prompt. Self-repair happens inside that same task through the bundled Skill checker; the host never creates Planner Repair or Builder Repair Jobs. Planner calls its own built-in image generation tool, so there is no separate planning-image T2I job. Post-whitebox visual reconstruction remains one task inside the selected Scene pipeline and never invokes Gemini or an LWDP T2I batch. Never invoke a Codex backend directly from workflow code; always use the router.

- Every formal generic Codex stage, including Planner and Builder self-repair cycles, must use model `gpt-5.6-sol` with reasoning effort `xhigh`. Formal execution rejects any other model or effort instead of silently downgrading. Lower-cost settings are allowed only through an explicitly selected `smoke` execution profile and must never be used by a real case.
- Local formal tasks run `codex exec` non-interactively with `workspace-write`, `approval_policy="never"`, `--ephemeral`, and `--ignore-user-config`. Authentication alone comes from `WORLDKIT_LOCAL_CODEX_HOME`, `CODEX_HOME`, or the local Codex default; credentials are never copied into the project, task workspace, prompt, logs, or artifacts.
- Local tasks receive only Host-selected contexts and assets copied into `.codex-tmp/local-codex/<task-run>`, reject symlink inputs, write only declared output paths, and atomically promote non-empty outputs before the temporary workspace is removed. Do not expose LWDP, Gemini, or unrelated process credentials to the local Codex child.
- Treat every LWDP job-creation `POST` as non-idempotent until the service guarantees `request_id` idempotency. Each formal Codex/T2I attempt submits its creation request exactly once; only read-only polling/download requests may retry automatically. A timeout after submission is an unknown outcome and must be reconciled by `request_id`, never by immediately creating another job. Planner waits 45 minutes; Builder and final visual reconstruction wait 120 minutes. A still-non-terminal Job then becomes `remote-pending` for up to 60 additional minutes without occupying a Studio execution slot or counting as a failure. Studio periodically reconciles that exact Job and atomically resumes trusted downstream work when it succeeds.
- If reconciliation discovers multiple active jobs for one `request_id`, keep the earliest job and cancel later duplicates when the service exposes a supported cancellation operation. Never delete completed history merely to hide a duplicate.
- Every case/run/stage owns a unique S3 prefix under `WORLDKIT_LWDP_S3_ROOT/<scene-id>/<run-id>/<stage>`.
- Every generic Codex task receives a curated `workspace-context.tar.gz`, immutable input assets, a stable task ID, and an explicit closed list of output paths. It never receives the whole mutable checkout, credentials, or another case's artifacts.
- LWDP creates isolated task input/output directories and a temporary account home. Cloud tasks write only declared outputs. The local host downloads into a sibling temporary file and atomically promotes it into the scene directory.
- Planner and Builder use at most three self-repair cycles inside their original isolated cloud workspace. Every edit invalidates the previous receipt and requires rerunning the bundled checker. The Host replays the checker once and rejects a missing, failed, stale, or byte-different receipt without creating another Job.
- Planner and Builder may use at most two new isolated task attempts after a terminal auth, account/model incompatibility, capacity, or transport failure; a terminal Codex task timeout may retry once. Attempts are strictly sequential, keep `gpt-5.6-sol` / `xhigh`, reuse the same immutable inputs and declared outputs, and use a new `request_id` plus S3 attempt prefix so LWDP can select another eligible account. A submitted, running, remote-pending, cancelled, stopped, unknown-submission, deterministic output-contract, self-check, or Gate result never creates a new attempt. Failed-attempt outputs remain isolated and are never promoted.
- Final visual images are produced by one active formal `gpt-5.6-sol` / `xhigh` LWDP Codex task attempt using the project-local LWDP configuration and the built-in image generation tool. The task receives only Host-selected context plus named, immutable images; it writes only the declared prompt bundle, styled opening, and complete-target styled tri-views. It generates and accepts the opening before deriving tri-views, so all target views share one final appearance anchor. Terminal auth, account/model incompatibility, capacity, or transport failures may retry on at most two new isolated attempts; a Codex task timeout may retry once. Retries keep the formal model and effort unchanged, reuse the same immutable inputs and output contract, and use a new `request_id` plus S3 attempt prefix so LWDP can select another eligible account. The Host validates prompt-bundle identity, target closure, PNG integrity, and content hashes after delivery. Final visual failure never revokes an already playable whitebox boundary.
- The Studio freezes the selected backend into each case and runs bounded backend-specific queues. Cloud Codex defaults to `20` concurrent cases through `WORLDKIT_STUDIO_MAX_CONCURRENT_CLOUD_JOBS` (with legacy `WORLDKIT_STUDIO_MAX_CONCURRENT_JOBS` as fallback), while local Codex remains independently limited to `1` by default. Local scene paths, temporary roots, process handles, logs, and cloud S3 prefixes remain keyed by scene/run.
- CLI validation, Canonical compilation, implementation-map promotion, Babylon capture, artifact freshness checks, and evaluation outcome remain trusted-host responsibilities. In cloud production that trusted Host runs inside the isolated Cloud Scene Worker, signs capture evidence with the Kubernetes-mounted Host key, publishes a hash-closed S3 manifest, and is independently admitted by Studio against the separate cloud public key. A cloud success status never bypasses these gates.
- Studio persists only Cloud Execution identity, bounded status/diagnostic fields, the admitted remote artifact index, and small user/test metadata. Large production artifacts remain in S3 and are hash-verified or streamed on demand. Capture-only recovery retries the same Cloud Execution stage from its exact prior manifest with `resumeMode=host`; it never resubmits Planner or Builder.
- Cloud Episode production uses the formal stage DAG defined above. Only `episode-prepare` and `whitebox-capture` start the Babylon/Studio/Playwright Runtime services; style planning, image generation/review, Gemini events, Prompt assembly, Seedance, conformance and publication are S3-checkpointed post-processing stages and must not boot those heavy services. Each stage is independently retryable from its direct predecessor manifest. Seedance defaults to the direct `seedance-2.5` API defined by the project provider contract. A provider-confirmed terminal `failed` or `refunded` result routes that exact Segment once to MG Seedance 2.5 480p plus CF 720p; an unknown submission, timeout or transport error keeps reconciling the original idempotency key and must not trigger fallback. Primary and fallback journals remain separate.
- Every Cloud Episode publishes `episode-source-receipt.json`, binding the admitted Scene execution and manifest, World Build identity, Scene capture receipt, Worker digest, and production mode. Reconnaissance, navigation, Planner, whitebox media, visual reconstruction, Gemini events, Segment Prompts, provider requests, and final media form one content-hash chain. A changed input invalidates only its downstream stages; it must never silently reuse a stale artifact.
- Episode videos, images, JSON, logs and portable ZIP remain in S3. Studio may persist only the Episode record, admitted remote artifact index and bounded JSON metadata; media playback and downloads use short-lived signed S3 URLs. A retry reuses the exact Episode request and Scene manifest, creates a new attempt of the same coarse stage, and never regenerates the Scene.
- `ready` is an absorbing lifecycle state within one attempt. Studio record writes are revision/attempt/execution/job conditional, and only one Studio process may own the durable data-root writer lease. A stale worker, old Job, old attempt, or late reconciler may append audit evidence but cannot regress or replace newer authority.
- `LWDP_GENERATION_API_TOKEN` is loaded from the environment or the private configured env file. Never serialize it into payloads, S3 assets, runtime env, logs, or artifacts.

## Required properties

- One `world.mjs` module is the only Agent-authored geometry source.
- Every world Mesh uses one of the four undeformed metric BoxGeometry shapes, is bound to one immutable preset, and aligns to the 0.5-meter micro-grid.
- The module declares a stable world ID/seed, one controlled Subject Assembly, one meter-valued spawn stand position, and one exact 16:9 Camera Pack with an explicit target binding.
- The complete ground support domain is connected only when every declared movement mode is ground-based. If the Subject also supports flight, swimming, water-surface, or custom free-space motion, disconnected ground islands are allowed and remain metrics rather than failures.
- Every all-ground Block World declares real middle/remote navigation targets and an invisible honest-width traversal band from spawn through the intended entry movement area to the middle target. The checker validates both the global component and the local band; these declarations create no path geometry or Runtime entities. Builder must repair support geometry instead of relabeling unreachable intended ground as obstacle or empty space.
- `visualGroupId` identifies complete visual targets, never parts. The primary target belongs only to the controlled Subject.
- Every non-subject `visualGroupId` declares one semantic front quarter-turn; the Host carries that direction into true Front / Right / Back capture with one shared orthographic scale.
- Planner and Builder share one target order: target 2/3/4/5 uses landmark orange/yellow/blue/purple respectively. Builder self-check rejects color drift.
- The Builder self-check must pass and derive byte-identical Host transport on replay. Hand-edited derived JSON is invalid.
- Whitebox tri-views come from the verified Runtime; image generation never invents structural views.

### Hosted Scene Brief rules

The Planner Skill is the complete decision layer for the short Scene Brief. It must keep user facts, visible reference evidence, inferred world continuation, and visual-only ideas separate, name one or more ordered standard/custom movement modes, describe one continuous world whose top-down area is at least four times the reference-visible geography, and select only 1–5 distinctive complete visual targets. The first target is the whole controlled Subject. Planner marks ground-motion support only; flight, swimming, and water-surface domains receive no navigable-area overlay. Planner uses frozen block colors only to annotate its two block-whitebox images; it never chooses block coordinates, preset refs, Subject refs, camera numbers, or runtime data.

## Current phase boundary

Subject/Camera authoring conveniences live in the Builder Skill's generated
`scripts/subject-setup.mjs`. `createSubjectSetup` expands `recommendedSetup` into
the existing Assembly/Camera/envelope fields; it does not construct geometry.
Explicit movement, presentation, attachments, and Camera choices override the
recommendation. The catalog distinguishes technical compatibility from normal
recommendations and labels legacy primitive proxies as explicit choices.
`fixed-action` selects an exact published base Animation Set action, starts at
tick zero, and resets deterministically. It replaces locomotion visuals only;
explicit gameplay actions retain priority and movement is unaffected. Static
bases and Agent-drawn meshes have no skeletal actions.

The Block Builder may directly author arbitrary block arrangements, including open ground, multi-level structures, bridges, obstacles, water/cloud volumes, and complete landmark silhouettes. It may assemble one controlled Subject from any admitted reusable Subject Pack or a custom rigid Three.js Mesh base, zero or more rigid Mesh attachments, one compatible Motion Pack, one Presentation Policy, and one Camera Pack. It never authors bones, skinning, morphs, animation retargeting, or independent attachment controllers. It may not change SDK preset semantics, Registry resources, motion implementations, Runtime, Compiler, protocols, or capture code during a scene task. The current hosted workflow keeps one continuous world and leaves `spaceTransitions` empty. Flight-volume navigation, water movement, and interactive state search remain explicit subsequent slices rather than silent approximations.

## Current capability boundary

The Agent-facing world contract is Block World V2. Its Host adapter translates a passing block Manifest into internal Authoring V4, then the current Canonical pipeline produces Canonical Scene Plan V1, Gameplay Bootstrap V1, World Runtime Bootstrap V1, and the closed World Build identity consumed by Babylon/Havok Runtime, Camera, Browser Protocol V5, Snapshot V4, capture, and evaluation. Block World is the Hosted Builder's exclusive Agent authoring surface, not a second production Runtime or identity lane. The scalable Block World slice partitions blocks into 32-meter XZ chunks and deterministically coalesces same-semantics, same-shape blocks before internal compilation; Runtime render batching, reconstructed walkable surfaces, automatic ground-only cliff boundaries, and static collision residency are derived from those Host-owned chunk clusters. Far render batches stay visible while a bounded Subject-centered physics ring is resident. Block World supports checked primary-action transitions between authored spaces; general interactive state search, full door animation, infinite procedural generation, and movement capabilities absent from a selected Subject remain separate capabilities rather than silent approximations.
