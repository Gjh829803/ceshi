# Agent Whitebox World authoring rules

## Project documentation ownership

- Keep durable Superpowers specifications, implementation plans, and reusable project
  guidance under `docs/superpowers/specs/`, `docs/superpowers/plans/`, and
  `docs/superpowers/skills/`. Reserve `.superpowers/` for workflow state such as SDD
  ledgers or brainstorming sessions; it is not the durable documentation authority.
  Project-wide ADRs and reviews remain under `docs/decisions/` and `docs/reviews/`.
- Repository scripts belong in a named responsibility directory under `scripts/`.
  Keep stable developer entry names in the root `package.json`; do not add executable
  or test files directly under `scripts/`.

## Goal

Create playable outdoor whitebox scenes through a gated multi-agent workflow. Planning, whitebox implementation, and visual styling are separate responsibilities; never collapse their authority by improvising geometry or editing SDK internals.

## Terrain generation canonical entry points

- Deterministic Height Intent compilation is owned by `packages/terrain-compiler/` and
  imported as `@whitebox-world/terrain-compiler`.
- The stable developer command is `pnpm terrain:intent:compile`; package-private
  projection, filtering, constraint, and CLI files are not public subpath APIs.
- Canonical Planner Height Intent semantics are owned by
  `.codex/skills/worldkit-spatial-planner/references/terrain-height-intent-prompt.md`.
- Canonical accepted family-specific prompt references are indexed by
  `assets/terrain-height-intent/golden-exemplars.json`; never select an exemplar from an
  incompatible terrain family or treat it as a spatial authority.
- Development evidence belongs under `artifacts/terrain-experiments/<case-id>/` and is
  not accepted merely because it exists. Formal receipt-bound scene outputs belong under
  `artifacts/scenes/<scene-id>/` and `apps/playground/public/scene-plans/<scene-id>/`.
- A generated PNG is an untrusted macro-shape proposal. Runtime consumes only metric
  Authoring samples published by the trusted Host compiler path.

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
- A released or externally adopted public rename must update the authoritative Schema, examples, validation, migration, and conformance coverage together. Preserve that compatibility through explicit version migration, not permanent alias fields.
- This repository is currently unreleased. For every contract touched by current work, a current-only clean break is the default rather than an exception: the final accepted tree has one public name, one parser, one public entry point, and one authoritative state owner for each concept. Update all consumers, fixtures, generated artifacts, receipts, and examples together, then delete the replaced fields, types, parsers, packages, re-exports, adapters, and fallbacks. A `schemaVersion` or `V1` suffix identifies the sole current contract; it does not authorize parallel V1/V2/V3 implementations. Intermediate feature commits may be incomplete, but no GO decision, final handoff, or merge candidate may contain legacy/new compatibility paths.

### Single-authority and migration enforcement

- Select an authority from the canonical capability contract, never from presentation details
  such as a static or rigged visual binding. A distinct strategy is valid only when it has an
  explicit discriminator, disjoint admission rules, and cannot accept the canonical owner's
  inputs as a fallback.
- Do not expose optional old/new methods, accept legacy and current envelopes in one parser, or
  retain a renamed facade that computes the same semantic state. For fixed-step Runtime changes,
  one prepared transaction must own prepare, commit, abort, Snapshot, Replay, Reset, and Rollback.
- Providers must pass fresh-spawn placement into the movement owner and must not construct a
  Locomotion envelope or transition sequence themselves. A prepared Gameplay projection must use
  the same owner's non-mutating preview as commit; never copy its transition rules into Host or
  provider code, even when the copied result is currently byte-identical.
- Every temporary migration path must have a bounded ledger entry, deletion condition, and a
  structural gate that detects semantic equivalents rather than relying only on the old symbol
  spelling. A merge candidate must delete the replaced path when its current contract is touched;
  changing a class, field, or method name does not count as deletion.
- Run `pnpm verify:3c-migration` whenever movement authority, fixed input, Locomotion publication,
  or their provider/Host ports change. Keep its single-authority structural assertions current
  with the accepted architecture; weakening or deleting an assertion requires an explicit design
  update and independent review.
- When a live WorldKit Skill, bundled checker, or reference is frozen into a representative Case
  input, update the frozen copy byte-for-byte in the same change and run its focused drift check.
  In particular, Native Block Builder changes require `pnpm check:native-block-builder-skill`
  before broader gates.

## Dependency reuse and utility code

- Before writing a general-purpose helper, search the repository and check the language runtime, platform APIs, engine APIs, and existing dependencies. Prefer a mature, maintained implementation when it reduces custom code and edge-case risk.
- Use `lodash-es` for established collection and object operations such as grouping, ordering, deduplication, deep comparison, and debounce or throttle behavior. Do not reimplement these utilities without a domain-specific reason.
- Import only the functions that are used, for example `import { groupBy } from "lodash-es"`. Do not import the full `lodash-es` namespace.
- Prefer Babylon.js math and geometry APIs for vectors, matrices, quaternions, transforms, bounds, and other 3D calculations. `lodash-es` is not a replacement for engine math.
- Prefer a clear native JavaScript or TypeScript expression when it is simpler than a library call. Avoid dependencies or abstractions that do not materially improve correctness, readability, or maintenance.
- Every workspace package must declare the libraries it imports as direct dependencies. Do not rely on undeclared dependencies being available from the workspace root.
- Keep domain-specific algorithms local, deterministic, and covered by focused tests. Reuse libraries for generic mechanics; keep SDK semantics in SDK-owned code.

## Deep runtime review discipline

Apply `docs/reviews/runtime-deep-review-checklist.md` whenever changing or reviewing physics, movement, input, animation, camera, render scheduling, resource ownership, or Browser/CLI runtime behavior. For design-spec reviews, change reviews, or full-repository audits, follow `docs/reviews/full-dimension-review-protocol.md`; it selects the required dimensions per review mode and delegates runtime-specific items back to this checklist. `docs/superpowers/specs/2026-08-21-control-feel-physics-medium-state-resolver-design.md` is the frozen P1.5 implementation authority: use only `control-profile`, `control-feel-profile`, `locomotion-profile`, and `medium-profile`; keep speed in Feel, boolean capabilities in Locomotion, slope/step in Physics Body, and Character support in the single `checkSupport()` path. Do not restore Motion parameter bags, ray/AABB grounding, or a first-slice `movementMedium: "water"` through adapters or aliases.

- Identify one authoritative owner for every piece of state. In particular, ground support, movement medium, subject facing, camera orbit, active action, and fixed-step time must not be independently inferred by multiple layers.
- Before adding state that can affect movement, collision, Action, Camera, event outcome, or deterministic evidence, identify its one owner and its exact Snapshot, Hash, Reset, Replay, and Rollback representation. Provider packages may consume committed state, but they must not retain a private pending/active Gameplay state machine or rewrite normalized input.
- Verify engine-dependent assumptions against the installed dependency version and source. Do not rely on remembered Babylon or Havok behavior for coordinate order, controller gravity, collision data layout, animation timing, or disposal semantics.
- Require adversarial regression coverage in addition to happy paths: asymmetric geometry/data, unsupported spawn and ledge departure, held-versus-pressed input, reset and rebind transitions, 30/60/120 Hz-like render timing, multi-instance isolation, partial construction, and throwing cleanup.
- Review integrations as a semantic three-way merge. Compare the base, incoming branch, and target behavior for each authority; resolving textual conflicts is not sufficient evidence that behavior was preserved.
- Separate automated contract evidence, rendered visual evidence, and manual interaction evidence. State exactly which was run, and do not claim production support for an experimental capability from a smoke test alone.
- Every confirmed runtime bug fix needs a failing reproducer before the fix, a focused regression after it, and the repository's full relevant verification gates before completion.
- Treat verification evidence as scoped to the exact tree state and affected domain. After each edit, rerun the focused regression first; before integration, run each relevant full gate once. Do not rerun a command already covered by a broader passing command on the same tree: root `pnpm test` includes `pnpm test:scenes`, while `pnpm test:studio`, production builds, Browser verifiers, rendered inspection, and manual interaction remain separate evidence layers.
- A later change invalidates only evidence whose inputs or claimed behavior it can affect. Runtime/source changes invalidate the focused tests plus the relevant typecheck, test, build, or capability verifier; build/dependency changes invalidate affected builds; documentation-only truth updates require diff/link checks, not runtime replay. When an independent review finds a narrow defect after full gates passed, rerun the new reproducer and only the gates touched by that fix unless the fix changes a cross-cutting contract or shared runtime authority.

### Verification scope and stopping rules

- Before starting substantial verification, state which inputs changed, which prior evidence they invalidate, the smallest required rerun set, and whether this is the single final full-gate checkpoint.
- During implementation, run only the focused RED→GREEN reproducer and directly affected contract, typecheck, build, Browser, or capability gate. Do not run broad directory globs when a narrower owner test exists.
- Run repository-wide heavy gates and one independent exact-SHA review only after the final merge candidate is frozen and no known blocking changes remain. Do not restart them after every narrow follow-up.
- P0/P1 findings block completion and may require a new exact-SHA review after their fix. Batch or defer non-blocking P2/P3 findings; never create an edit → full test → review → edit loop for advisory cleanup.
- If unrelated commits land on `main` concurrently, determine whether they affect the claimed domain before invalidating evidence. Do not rerun Viewer or Runtime gates merely because an unrelated WRC, documentation, or contract-only commit changed the branch SHA.
- Never repeat a command already covered by a broader passing command on the same relevant tree state. Documentation-only corrections receive diff/link/truth checks only and never trigger Runtime, Browser, build, or full-suite replay.
- If the user asks to stop testing, cancel active verification immediately, run no further test or review commands, and report exactly which evidence exists and which final evidence is absent.

## Agent roles and frozen boundary

- **World Planner Agent** may create only `apps/playground/src/scenes/plans/<catalog-id>.ts` and its `world-plan.png` / `opening-shot.png`. It must define the complete WorldPrompt and Entity Catalog before geometry.
- The trusted host freezes those three inputs into `artifacts/scenes/<catalog-id>/plan-lock.json`. Do not create or edit the lock manually.
- **World Builder Agent** may implement and register the planned scene, but must not modify the frozen plan source, the two planning images, or the lock.
- **Visual Bible Agent** may create declared styled tri-views and `opening-frame-rendered.png` only after the whitebox implementation and SDK-derived tri-views are verified. It must not change geometry or the frozen plan.
- If a downstream stage cannot satisfy the contract, write `artifacts/scenes/<catalog-id>/change-request.json` using `defineWorldPlanChangeRequest` semantics. Do not repair the conflict by silently changing upstream artifacts.

## Scene workflow

1. Planner creates `apps/playground/src/scenes/plans/<catalog-id>.ts`, exporting one named `worldSpec = defineOutdoorWorldSpec(...)`.
2. Planner defines the whole playable world before geometry: bounds, relief, regions, water, landmarks, routes, assumptions, WorldPrompt, Entity Catalog and Opening Shot.
3. Planner uses Codex's built-in image generation tool to generate the World Plan and Opening Shot from the exact stored prompts. Save the real assets at `apps/playground/public/scene-plans/<world-spec-id>/world-plan.png` and `opening-shot.png`; never fabricate placeholders.
4. The host runs `pnpm plan:freeze -- --scene <catalog-id>` and `pnpm plan:check -- --scene <catalog-id>`.
5. Builder adds `apps/playground/src/scenes/<catalog-id>.ts`, exports `definePlannedOutdoorScene(...)`, implements stable matching Feature/Entity bindings, and registers it in `apps/playground/src/scenes/index.ts`.
6. Run `pnpm test:scenes`, `pnpm typecheck`, `pnpm build`, `pnpm plan:scene -- --scene <catalog-id>`, and `pnpm plan:scene:check -- --scene <catalog-id>`.
7. Open `http://127.0.0.1:5173/?scene=<catalog-id>&artifact=1` only for planning comparison and SDK-derived whitebox capture. This internal artifact route is not Gameplay and does not expose Browser V5. Test playability only from a Canonical Authoring JSON source through `worldkit run <world.json>` or a promoted curated preset; never restore the deleted catalog-gameplay route.
8. Visual Bible uses those tri-views and the verified manifest to create styled tri-views and the final rendered opening frame. Finish with `pnpm visual:finalize -- --scene <catalog-id>` and `pnpm visual:check -- --scene <catalog-id>`.

Do not modify Runtime, physics, camera, or rendering internals merely to create a scene.

### Hosted Scene Brief workflow

1. Invoke the Unified Planner once with `.codex/skills/worldkit-spatial-planner/SKILL.md`. In that same Codex job it writes the Scene Brief first, then uses built-in image generation to produce the minimal navigation world plan and palette-marked entry whitebox target.
2. In the same Planner Job, run the Skill-bundled `scripts/self-check.mjs`, repair the Brief and regenerate both images until it passes, and deliver `planner-self-check.json`. The red Subject mask center may deviate by at most 1.5% of image width. The host replays the same check once, compares the receipt, derives stable target IDs/colors, and never launches a separate Planner Repair Agent.
3. Invoke the Canonical Builder with `.codex/skills/worldkit-canonical-builder/SKILL.md`.
4. In the same Builder Job, run the Skill-bundled standalone `scripts/self-check.mjs`. It contains the current main V3/V4 Schemas, Normalizers, Layout Solver, V4/V5 Compilers, modular Subject Registry closure and implementation-map checks. Repair and rerun inside that Job until `builder-self-check.json` passes. The host replays the source-equivalent checker once and compares the receipt; it never launches a separate Builder Repair Agent.
5. The host finalizes `scene-implementation-map.json`, derives the declared visual groups, and builds `world.build.json`. If the receipt declares required trusted Route validation, it runs `worldkit verify route` with the frozen profile before capture. It then runs `worldkit capture` with `--triview-output` and the trusted implementation map, followed by `scripts/visual/validate-entry-third-person.py` with the opening PNG and Runtime Snapshot. Runtime-only or Route failure ends the case with diagnostics and is corrected in a new user/queue-triggered Builder run, not an automatic repair task.
6. If a user reference exists, use Gemini Flash to synthesize `visual-generation-prompts.json`, then directly and concurrently generate `styled-opening-frame.png` plus every grouped `styled-triview.png`; finalize both manifests after the batch completes. No playtest or recording is required.

The Playground Recording Workbench is a separate manual post-workflow tool. A user may record multiple runtime clips only after opening a playable world, then explicitly request Prompt synthesis and Seedance 2.5 reference-video generation for one clip. Never insert recording or final video generation into the automatic Planner/Builder/whitebox/first-frame/styled-triview workflow.

## Local Runtime startup

- When a user asks to view the product G Bot locally, run `pnpm dev` and open the URL printed by the command. It opens the unified Viewer with the `feel-flat` G Bot preset; `?scene=<preset-id>` may select another allowlisted tuning preset.
- `worldkit run <world.json>` opens the same Viewer with one Host-fixed Canonical source. Browser query parameters must not replace that fixed source. The removed `?authoring=1` route must not be restored.
- If the browser reports `504 Outdated Optimize Dep` after a branch or dependency change, stop the old server and run `pnpm dev:refresh` once. For a fixed `worldkit run` source, use its `--refresh-dependencies` option. Do not change Babylon, physics, camera, or runtime code to repair a stale Vite dependency cache.
- `pnpm dev`, `worldkit run`, and Studio Preview share the same Babylon/Havok Viewer shell and existing RuntimeHost path. `artifacts/scenes` remains WRC evidence, not a second application.

## Preferred APIs

- `world.terrain.landscape({ relief: ... })` for large terrain. Choose the relief from the user's scene: `flat` for cities and constructed ground, `plain` for gently rolling open land, `hills` for broad hill country, and `mountains` for intentionally steep regions.
- `world.terrain.rolling(...)` for small test terrain.
- `world.water.lake(...)` for elliptical lakes.
- `world.water.body(...)` for circle, ellipse, or polygon water boundaries.
- `world.landmark.compound(...)` for whitebox landmarks.
- `world.player.spawn(...)` exactly once.
- `world.atmosphere.set(...)` for sky/fog/sun semantics.

In the catalog scene workflow, `world.player.spawn(...)` uses the serialized authoring convention:
`facingRadians: 0` faces `-Z`, while `Math.PI` faces `+Z`. For a composition-critical opening view,
set `camera: { pitchRadians, distance, fovDegrees, targetHeight }`; a larger positive pitch looks
farther downward. Supported pitch is `-0.95..0.65`, distance is `1.8..8m`, and target height is
`0.5..4.5m`. Keep these as initial framing choices only—the SDK still owns runtime camera controls.

## Codex execution backend rule

Automatic Planner and Builder work runs through exactly one Codex task per stage, selected through `scripts/agents/run-codex-task.mjs`. `cloud` is the default and uses LWDP; `local` is allowed only after an explicit Studio or `WORLDKIT_CODEX_BACKEND=local` selection and uses the installed, authenticated local Codex CLI. The Studio freezes the selected backend into each new world or Seedance Prompt-rewrite job, so changing the switch never migrates queued or running work. Re-generating Seedance after changing the selected backend must invalidate a successful Prompt from the other backend and rewrite it through the newly selected backend; a same-backend Seedance retry may reuse that Prompt. Self-repair happens inside that same task through the bundled Skill checker; the host never creates Planner Repair or Builder Repair Jobs. Planner calls its own built-in image generation tool, so there is no separate planning-image T2I job. Post-whitebox visual prompt synthesis and image rendering call Google GenAI directly from the project-local runtime configuration. Never invoke either backend directly from workflow code; always use the router.

- Every formal generic Codex stage, including Planner and Builder self-repair cycles, must use model `gpt-5.6-sol` with reasoning effort `xhigh`. Formal execution rejects any other model or effort instead of silently downgrading. Lower-cost settings are allowed only through an explicitly selected `smoke` execution profile and must never be used by a real case.
- Local formal tasks run `codex exec` non-interactively with `workspace-write`, `approval_policy="never"`, `--ephemeral`, and `--ignore-user-config`. Authentication alone comes from `WORLDKIT_LOCAL_CODEX_HOME`, `CODEX_HOME`, or the local Codex default; credentials are never copied into the project, task workspace, prompt, logs, or artifacts.
- Local tasks receive only Host-selected contexts and assets copied into `.codex-tmp/local-codex/<task-run>`, reject symlink inputs, write only declared output paths, and atomically promote non-empty outputs before the temporary workspace is removed. Do not expose LWDP, Gemini, or unrelated process credentials to the local Codex child.
- Treat every LWDP job-creation `POST` as non-idempotent until the service guarantees `request_id` idempotency. Formal Codex and T2I stages submit a creation request exactly once; only read-only polling/download requests may retry automatically. A timeout after submission is an unknown outcome and must be reconciled by `request_id`, never by immediately creating another job.
- If reconciliation discovers multiple active jobs for one `request_id`, keep the earliest job and cancel later duplicates when the service exposes a supported cancellation operation. Never delete completed history merely to hide a duplicate.
- Every case/run/stage owns a unique S3 prefix under `WORLDKIT_LWDP_S3_ROOT/<scene-id>/<run-id>/<stage>`.
- Every generic Codex task receives a curated `workspace-context.tar.gz`, immutable input assets, a stable task ID, and an explicit closed list of output paths. It never receives the whole mutable checkout, credentials, or another case's artifacts.
- LWDP creates isolated task input/output directories and a temporary account home. Cloud tasks write only declared outputs. The local host downloads into a sibling temporary file and atomically promotes it into the scene directory.
- Planner and Builder use at most three self-repair cycles inside their original isolated cloud workspace. Every edit invalidates the previous receipt and requires rerunning the bundled checker. The Host replays the checker once and rejects a missing, failed, stale, or byte-different receipt without creating another Job.
- Final visual images use project-local Google GenAI configuration. Gemini Flash first creates one shared prompt bundle, then Direct ImageGen renders the opening frame and all complete visual groups concurrently into scene-owned paths without shared filenames.
- The Studio freezes the selected backend into each case and runs bounded backend-specific queues. Local scene paths, temporary roots, process handles, logs, and cloud S3 prefixes remain keyed by scene/run.
- Local CLI validation, Canonical compilation, implementation-map promotion, Babylon capture, artifact freshness checks, and evaluation outcome remain trusted-host responsibilities. A cloud success status never bypasses these gates.
- `LWDP_GENERATION_API_TOKEN` is loaded from the environment or the private configured env file. Never serialize it into payloads, S3 assets, runtime env, logs, or artifacts.

When built-ins are insufficient, define a local `defineWorldFeature(...)` and use only its tracked
`BuildContext`. Register custom terrain through `world.terrain.custom(...)`. Scene modules must not
add opaque renderer or physics objects directly; provider objects stay behind Runtime adapters. This
rule applies to the Canonical Catalog and Hosted Builder workflows.

ADR-0007 defines one strictly scoped authoring-time exception for the separate Babylon Native Scene
Lane. A Native Module may create Babylon visual objects only inside the Host-provided Candidate Scene
and may submit Spawn and static Collider intent only through the versioned registration boundary. It
must not create Engine, Scene, Render Loop, Havok/physics objects, the SDK main camera, Gameplay
entities, input, timers, or an independent tick. A world selects exactly one Scene Source, so a Native
Module must not overlay or mutate Canonical geometry. The current Native API remains a trusted-local
experiment until the BNA production gates in
`docs/superpowers/specs/2026-08-28-ai-friendly-babylon-native-world-authoring-design.md` pass; this
exception does not make it available to the current Catalog or Hosted Builder workflows.

## Required properties

- A valid `OutdoorWorldSpec` with exactly three artifact channels: Codex-imagegen World Plan, Codex-imagegen Opening Shot, and SDK-derived Height/Slope Plan.
- A complete `WorldPromptBundle` covering identity, spatial composition, environment, lighting, style, opening frame, invariants, and negative constraints.
- An Entity Catalog containing every meaningful subject, NPC, landmark, and object as a stable Prototype/Instance binding.
- Every Prototype must have a unique six-digit instance color, positive approximate size, `-Z` forward, a declared pivot, and canonical `front/right/back` whitebox and styled PNG paths.
- Explicit separation of user facts, visible reference evidence, inferred continuation, and optional render-layer ideas.
- A strict orthographic World Plan that communicates topology, not a decorative aerial perspective.
- An Opening Shot that records spawn, facing, pitch, distance, FOV, target height, and foreground/middleground/background composition. Reference-image scenes also require normalized semantic regions and runtime anchor targets in `composition.guide`.
- Primary routes declared in WorldSpec and kept at or below their slope limits.
- Stable, descriptive, unique IDs for every feature.
- A deterministic scene seed.
- A resource budget appropriate to terrain resolution.
- Semantic strings and appearance prompts for important terrain, water, and landmarks.
- A spawn point inside terrain and outside obvious water/landmark blockers.
- Large maps should use tiled terrain; preserve approximately 1.25–2.5 meters per heightfield cell unless the scene requires finer collision.
- Global noise is only the base surface. For reference-driven topology, prefer a tracked world-space `context.terrain.raster(...)` field plus `context.semantic.terrainLayer(...)` masks; shaped operations remain appropriate for simple local edits. Do not approximate a whole reference with a few broad circles.
- Shaped-operation `falloffWidth` fades across the inside of the shape toward its boundary; it does not spread outside the boundary. To author a long descent, include the whole descent inside the shape and place its boundary at the low end.
- Humanoids climb slopes up to 42°. Keep primary routes below 35° for margin, flatten the spawn area, and provide a continuous walkable corridor through hill or mountain scenes.
- For image references, reproduce the visible spatial composition and semantic silhouettes in whitebox form. Do not encode clouds, flowers, textures, painterly style, or other render-layer detail as collision geometry. A single view does not define hidden geometry, so create a coherent playable continuation and report important inferred areas.
- Treat the reference viewpoint as part of image matching: align spawn position, `facingRadians`, pitch, distance, FOV and target height before judging geometry. Browser-run the opening composition gate; feature presence and a passing overall score cannot override a failed required region or anchor.
- Do not ask image generation to invent the whitebox tri-view. It must be captured from the verified SDK runtime. The styled tri-view may be generated only from that structural reference.

### Hosted Scene Brief rules

The Planner Skill is the complete decision layer for the short Scene Brief. It must keep user facts, visible reference evidence, inferred world continuation, and visual-only ideas in four separate provenance sections, then name exactly one movement mode; the common land, water, and flight modes are references, and concise custom modes are valid. It describes a meaningful complete-world continuation and navigation intent in prose, with the opening frame treated only as an entry slice, and selects only 1–5 distinctive complete visual targets. Do not infer quality from a fixed duration or perimeter and do not satisfy completeness with empty padding. The first target is the whole controlled subject. Every entry whitebox target uses the same neutral clear daytime inspection lighting regardless of reference time, weather, exposure, or darkness; reference lighting belongs only to later styled outputs. Planner never chooses Subject Definition, Subject Asset, Runtime Bundle, Rig, animation, collider, or motion refs. Do not pad the target list, split a landmark into parts, or create separate targets for identical instances. The CLI validators remain the authority for malformed briefs.

## Current phase boundary

The formal catalog authoring workflow currently targets outdoor heightfield worlds. In that workflow, do not simulate interiors, vehicles, NPC behavior, caves, overhangs, or networking as if they were supported production features; report those requirements as capability gaps. The hosted Scene Brief workflow follows the separate Builder approximation policy below without claiming exact support.

The Builder Skill and its maintained references are the complete decision layer for subject composition, current motion-closure selection, camera framing, terrain, structures, placement, and JSON templates. A Registry Subject is a shortcut rather than a whitelist: use `humanoid.g-bot@2` for the ordinary modular rigged human, or compose a package-local controlled Subject from exact registered Subject Assets and primitive visual parts, then bind its shape-independent implemented motion/control/camera closure. Agent-authored complete Subject silhouettes remain supported. A missing named preset never justifies omitting outputs. Generated whitebox AuthoringSpec always uses `clear-day`. Ground-supported Subjects must spawn with capsule feet on an actual support surface: Terrain starts use a small-region S1 solved Anchor or exact fixed Y, while constructed starts require an exact support height plus a satisfied `supported-by` assertion. The Builder self-check rejects both below-ground and above-ground Terrain starts before capture. The CLI validator remains the authority for malformed output diagnostics.

Relationship mount, seat, and tether capabilities remain reserved and never enter production AuthoringSpec; rider/body/equipment that move as one are assembled as one Subject instead. A requested unsupported movement mode still receives its complete Subject silhouette and world topology, but uses the documented ground closure as an explicit approximation and never claims exact production support. Vertex, triangle and collider budgets remain hard compiler gates.

Per-scene Builder output remains data-only and must not add or modify SDK motion bases, Registry catalogs, Runtime, Compiler, protocols, Source Packages, Models, Clips, Material Sets, or Runtime Bundles. AuthoringSpec may use a public Subject Definition ref, or an exact registered Subject Asset ref inside one package-local Subject; it never contains lower-level modular refs, GLB paths, or asset-pipeline commands. When no named preset or exact current closure exists, the Builder still emits a playable world using the closest honest current behavior, preserves the planned complete shape and topology, and records the implementation choice in Subject metadata.

## Current capability boundary

Canonical AuthoringSpec V4 supports a procedural Heightfield base, circle/ellipse/polygon water, package-local box/sphere/cylinder/cone whitebox Prototypes, package-local Subjects assembled from asset/box/sphere/cylinder/capsule visual parts, Registry Subjects, configurable third-person entry framing, fixed or S1-solved placements, blocked traversal areas, and required `connected-by-route` constraints compiled into ExecutionPlan V5 with a Host-derived Gameplay Bootstrap. Trusted Route R1 covers a ribbon on one Heightfield. Route R1B additionally covers an unambiguous single-layer chain of ordinary static steps, decks, platforms, or ramps whose collision-enabled Prototypes declare exact `traversalSurfaceBindings` to `worldkit://traversal-surface-profile/ground.static@1`. Dynamic or overlapping/stacked walkable surfaces, bridge-underpass dual layers, caves, flight volumes, and underwater volumes remain outside trusted Route publication; keep their connectivity empty rather than claiming unsupported proof. Runtime/Route/Camera/Control stay on exact Browser Protocol V5; grouped whitebox tri-view configuration and capture use a separate Authoring Capture API and never add keys to Browser V5.
