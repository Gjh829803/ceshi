# Agent Whitebox World authoring rules

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

Use the project-local [orchestrating-subagents skill](.agents/skills/orchestrating-subagents/SKILL.md) to construct and execute this handoff. After the host's own review, use the project-local [reviewing-with-cursor skill](.agents/skills/reviewing-with-cursor/SKILL.md) when an authenticated Cursor Agent CLI is available and an independent design, code, or completion review is valuable. Cursor remains read-only; every finding must be independently reproduced and dispositioned before any fix.

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

## Deep runtime review discipline

Apply `docs/reviews/runtime-deep-review-checklist.md` whenever changing or reviewing physics, movement, input, animation, camera, render scheduling, resource ownership, or Browser/CLI runtime behavior. For design-spec reviews, change reviews, or full-repository audits, follow `docs/reviews/full-dimension-review-protocol.md`; it selects the required dimensions per review mode and delegates runtime-specific items back to this checklist. `docs/superpowers/specs/2026-08-21-control-feel-physics-medium-state-resolver-design.md` is the frozen P1.5 implementation authority: use only `control-profile`, `control-feel-profile`, `locomotion-profile`, and `medium-profile`; keep speed in Feel, boolean capabilities in Locomotion, slope/step in Physics Body, and Character support in the single `checkSupport()` path. Do not restore Motion parameter bags, ray/AABB grounding, or a first-slice `movementMedium: "water"` through adapters or aliases.

- Identify one authoritative owner for every piece of state. In particular, ground support, movement medium, subject facing, camera orbit, active action, and fixed-step time must not be independently inferred by multiple layers.
- Verify engine-dependent assumptions against the installed dependency version and source. Do not rely on remembered Babylon or Havok behavior for coordinate order, controller gravity, collision data layout, animation timing, or disposal semantics.
- Require adversarial regression coverage in addition to happy paths: asymmetric geometry/data, unsupported spawn and ledge departure, held-versus-pressed input, reset and rebind transitions, 30/60/120 Hz-like render timing, multi-instance isolation, partial construction, and throwing cleanup.
- Review integrations as a semantic three-way merge. Compare the base, incoming branch, and target behavior for each authority; resolving textual conflicts is not sufficient evidence that behavior was preserved.
- Separate automated contract evidence, rendered visual evidence, and manual interaction evidence. State exactly which was run, and do not claim production support for an experimental capability from a smoke test alone.
- Every confirmed runtime bug fix needs a failing reproducer before the fix, a focused regression after it, and the repository's full relevant verification gates before completion.

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
7. Open `http://127.0.0.1:5173/?scene=<catalog-id>`. Compare the three planning captures with intent, test playability, then export every Prototype's SDK-derived whitebox tri-view.
8. Visual Bible uses those tri-views and the verified manifest to create styled tri-views and the final rendered opening frame. Finish with `pnpm visual:finalize -- --scene <catalog-id>` and `pnpm visual:check -- --scene <catalog-id>`.

Do not modify `sdk-world-adapter.ts`, physics, camera, or rendering code merely to create a scene.

## Local Runtime startup

- When a user asks to view the product G Bot locally, run `pnpm dev:g-bot` and open the URL printed by the command.
- `?authoring=1` requires an AuthoringSpec injected by `worldkit run <world.json>`. Never combine plain `pnpm dev` with `?authoring=1` or present that combination to a user.
- If the browser reports `504 Outdated Optimize Dep` after a branch or dependency change, stop the old server and run `pnpm dev:g-bot:refresh` once. Do not change Babylon, physics, camera, or runtime code to repair a stale Vite dependency cache.
- Use `pnpm dev` only for the Legacy/catalog Playground. Do not describe it as the Canonical Authoring Runtime entry.

## Preferred APIs

- `world.terrain.landscape({ relief: ... })` for large terrain. Choose the relief from the user's scene: `flat` for cities and constructed ground, `plain` for gently rolling open land, `hills` for broad hill country, and `mountains` for intentionally steep regions.
- `world.terrain.rolling(...)` for small test terrain.
- `world.water.lake(...)` for elliptical lakes.
- `world.water.body(...)` for circle, ellipse, or polygon water boundaries.
- `world.landmark.compound(...)` for whitebox landmarks.
- `world.player.spawn(...)` exactly once.
- `world.atmosphere.set(...)` for sky/fog/sun semantics.

In the **Legacy/catalog scene workflow only**, `world.player.spawn(...)` uses the old Three.js-facing convention: `facingRadians: 0` faces `-Z`, while `Math.PI` faces `+Z`. This is not a Canonical Babylon Runtime contract. For a composition-critical opening view in that Legacy workflow, set `camera: { pitchRadians, distance, fovDegrees, targetHeight }`; a larger positive pitch looks farther downward. Supported pitch is `-0.95..0.65`, distance is `1.8..8m`, and target height is `0.5..4.5m`. Keep these as initial framing choices only—the SDK still owns runtime camera controls.

When built-ins are insufficient, define a local `defineWorldFeature(...)` and use only its tracked `BuildContext`. Register custom terrain through `world.terrain.custom(...)`. Never add opaque objects directly to `THREE.Scene` from a scene module.

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

## Current phase boundary

The authoring SDK currently targets outdoor heightfield worlds. Do not simulate interiors, vehicles, NPC behavior, caves, overhangs, or networking as if they were supported production features. Report those requirements as capability gaps.
