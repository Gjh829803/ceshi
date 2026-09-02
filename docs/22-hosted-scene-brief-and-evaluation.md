# Hosted Scene Brief and Evaluation Workflow

## Positioning

This workflow is an optional hosted orchestration layer around the current SDK. It reduces Agent context and operational cost, but it does not replace the SDK's Canonical contracts or the formal repository scene workflow.

Two planning paths intentionally coexist:

- The formal repository workflow remains `OutdoorWorldSpec + World Plan + Opening Shot -> plan-lock -> scene implementation`. It is the authority for reviewed catalog scenes.
- The hosted evaluation workflow uses a compact `Scene Brief + two intent images -> AuthoringSpec V4`. Scene Brief is a non-Canonical intent summary; Authoring V4 is the first Canonical authority on this path.

Neither planning image is runtime evidence. Actual whitebox images and tri-views are produced only by the verified Babylon Runtime.

## Authority chain

```text
User prompt + optional reference image
  -> Scene Brief (intent and evidence classification)
  -> World plan + entry composition intent image
  -> Builder AuthoringSpec V4 + implementation-map draft
  -> Trusted Host validation and normalization
  -> NormalizedWorldIR V4
  -> ExecutionPlan V5
  -> Babylon/Havok runtime capture
  -> optional provider-neutral visual reconstruction
```

The trusted Host owns validation, Registry closure, Gameplay Bootstrap, compilation, Route evidence, final implementation-map promotion and runtime capture. Agents never emit Babylon/Havok handles or provider-specific fields into Canonical Schema.

## Scene Brief contract

`scene-brief.md` is deliberately short and has closed required sections:

- `场景` and `主体` define the requested semantic whole;
- `用户事实` records explicit user requirements;
- `可见参考证据` records only what the reference actually shows;
- `推断的世界延伸` separates playable continuation inferred from a partial view;
- `仅视觉层设想` prevents lighting, texture and style from becoming collision geometry;
- `运动模式`, `空间`, `通行`, `首帧`, and `视觉目标` describe requested behavior and composition.

Movement labels are requests, not proof of runtime support. Shape and behavior stay independent: the Builder may use a complete Registry Subject or assemble one package-local controlled silhouette from an exact registered Subject Asset plus primitive visual parts. It selects an exact implemented Registry closure when one compiles without reserved relationships. Otherwise the hosted workflow preserves the complete requested silhouette and world topology, uses the documented ground closure as an explicit playable approximation, and records requested versus implemented behavior in Subject metadata. A missing same-named preset never permits an Agent to omit the world, and per-scene Builder work never adds SDK motion bases or edits Registry/Runtime/Compiler code.

World size is derived from the request, visible evidence, inferred continuation, terrain-cell guidance and enforced resource budgets. Perimeter length divided by nominal speed is not a valid exploration-quality gate.

## Visual targets and implementation map

The Brief defines one to five complete visual targets. The first and only subject target is required. A target represents a semantic whole, not every mesh or structural part.

The Builder maps each `visualTargetId` to one or more runtime entity IDs. The trusted Host validates and promotes the draft into `scene-implementation-map.json`, bound to the Scene Brief and AuthoringSpec hashes. Babylon capture consumes the promoted groups through the existing runtime artifact-capture boundary; it does not mutate runtime camera/material ownership through a second capture implementation.

## Portable self-checkers

Planner and Builder skills include single-file checkers for isolated cloud workspaces. They are generated together from repository source, not manually maintained as second compilers. The Planner source directly adapts `parseSceneBriefV1` diagnostics while its receipt intentionally hashes the raw Scene Brief bytes consumed by Studio. `pnpm generate:agent-self-check` is the only explicit producer for both tracked bundles; `pnpm check:agent-self-check` builds both into a temporary skill tree and byte-compares without changing the repository. Parity coverage executes source and committed bundles against valid, duplicate-target, second-Subject and overlong-movement fixtures without rebuilding the committed bundle first.

The Builder checker covers current Authoring V4 parsing, layout, normalization, IR V4 / ExecutionPlan V5 compilation, Registry closure, Gameplay Bootstrap construction, resource budgets, spawn support and implementation-map integrity. `maxVertices`, `maxTriangles`, and `maxColliders` are all hard compiler gates.

## Studio workflow

Studio persists one unreleased current workflow contract instead of carrying V18-V23 branches:

1. input;
2. hosted planner and planner self-check;
3. Canonical Builder and Builder self-check;
4. trusted Canonical build;
5. real Babylon runtime capture;
6. Snapshot V4 plus opening-frame third-person alignment validation;
7. optional visual prompt synthesis;
8. optional visual image generation.

Each task is isolated, uses atomic artifact promotion, records stage receipts and can be retried without treating partial results as passed. Cloud and local Codex execution use independent bounded queues; local defaults to one slot. A queued or running case can be stopped without counting user cancellation as an evaluation failure. Cloud creation uses one single-task POST and recovers an uncertain response only through the same stable `request_id`, never by issuing a second creation request. External evaluation corpora belong outside ordinary Git history; their manifests must record source, license/provenance and content hashes.

## Current production boundary

The formal production authoring lane remains outdoor heightfield worlds with current static structures, water representation, subjects and R1/R1b traversability. Do not present interiors, caves, overhangs, NPC behavior, vehicles, flight, underwater navigation, dynamic platforms or networking as exact production support. The hosted approximation policy above may still return a complete playable silhouette and world, but it must disclose the implemented behavior and must not claim unsupported Route or motion evidence.

## Commands

```bash
pnpm generate:agent-self-check
pnpm check:agent-self-check
pnpm agent:world -- --scene-id <scene-id> --image /absolute/reference.png "<request>"
pnpm agent:world -- --scene-source canonical --scene-id <scene-id> --image /absolute/reference.png "<request>"
pnpm studio
```

The formal repository scene workflow and its `plan:freeze`, `plan:check`, scene, and visual gates remain unchanged.
