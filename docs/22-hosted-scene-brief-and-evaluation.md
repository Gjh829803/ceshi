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

Movement labels are requests, not proof of runtime support. The Builder must select a compatible implemented Registry closure or return a capability-gap diagnostic. It must not substitute a different motion model. Experimental resources may be exercised in an explicitly experimental evaluation lane, but are not production support.

World size is derived from the request, visible evidence, inferred continuation, terrain-cell guidance and enforced resource budgets. Perimeter length divided by nominal speed is not a valid exploration-quality gate.

## Visual targets and implementation map

The Brief defines one to five complete visual targets. The first and only subject target is required. A target represents a semantic whole, not every mesh or structural part.

The Builder maps each `visualTargetId` to one or more runtime entity IDs. The trusted Host validates and promotes the draft into `scene-implementation-map.json`, bound to the Scene Brief and AuthoringSpec hashes. Babylon capture consumes the promoted groups through the existing runtime artifact-capture boundary; it does not mutate runtime camera/material ownership through a second capture implementation.

## Portable self-checkers

Planner and Builder skills include single-file checkers for isolated cloud workspaces. They are generated from repository source, not manually maintained as a second compiler. `pnpm build:agent-self-check` rebuilds the Builder checker, and the parity test verifies the bundled checker against source behavior.

The Builder checker covers current Authoring V4 parsing, layout, normalization, IR V4 / ExecutionPlan V5 compilation, Registry closure, Gameplay Bootstrap construction, resource budgets, spawn support and implementation-map integrity. `maxVertices`, `maxTriangles`, and `maxColliders` are all hard compiler gates.

## Studio workflow

Studio persists one unreleased current workflow contract instead of carrying V18-V23 branches:

1. input;
2. hosted planner and planner self-check;
3. Canonical Builder and Builder self-check;
4. trusted Canonical build;
5. real Babylon runtime capture;
6. optional visual prompt synthesis;
7. optional visual image generation.

Each task is isolated, uses atomic artifact promotion, records stage receipts and can be retried without treating partial results as passed. External evaluation corpora belong outside ordinary Git history; their manifests must record source, license/provenance and content hashes.

## Current production boundary

The production authoring lane remains outdoor heightfield worlds with current static structures, water representation, subjects and R1/R1b traversability. Do not present interiors, caves, overhangs, NPC behavior, vehicles, flight, underwater navigation, dynamic platforms or networking as production support. Requests outside that boundary remain explicit capability gaps or separately labelled experiments.

## Commands

```bash
pnpm agent:world -- --scene-id <scene-id> --image /absolute/reference.png "<request>"
pnpm agent:world:plan -- --scene-id <scene-id> --image /absolute/reference.png "<request>"
pnpm agent:world:build -- --scene-id <scene-id>
pnpm studio
```

The formal repository scene workflow and its `plan:freeze`, `plan:check`, scene, and visual gates remain unchanged.
