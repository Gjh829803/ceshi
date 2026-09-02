---
name: worldkit-native-block-builder
description: Build or repair one deterministic Babylon Native Block authoring workspace from a frozen Native Block generation request, Scene Brief, and reference inputs. Use only for the Babylon Native Source Builder stage; never use for Canonical authoring, planning, runtime ownership, or styling.
---

# WorldKit Native Block Builder

Create one closed Babylon Native Source workspace. Read the complete frozen inputs before authoring, including the Generation Request, Scene Brief, reference images, API/Profile context, and read-only `native-scene.bootstrap.json`. Do not edit, replace, or derive a second Bootstrap.

Attempt 0 has no repair instruction. Attempt 1 always includes the Host-authored `.task/context/repair-instruction.json`; read it as immutable diagnostic context, preserve every frozen owner identity and prior Attempt artifact, and revise only the same three declared output files.

For Attempt 1, repair the visible Block geometry named by each diagnostic. A screen-space `move` or `resize` instruction means moving, adding, or removing actual Blocks in that semantic target while checking the referenced prior Capture; it never means relabeling unchanged geometry. Do not reassign an existing Block's `visualGroupId` merely to alter measured bounds, coverage, or ordering, and do not change names, identity colors, bindings, or metadata as a substitute for a visible change. Existing group membership stays stable unless the diagnostic explicitly reports a missing or incorrect semantic binding.

## Authority boundary

JSON/Case/Scene Brief owns identity, intent, Subject, Spawn target, budgets, and evidence requirements.

scene.ts owns Babylon Native Block visual construction and explicit registration calls only.

The Host owns Check, Package, Receipt, Runtime Candidate, Havok, Character, Input, Action, Camera, Reset, Capture, and evaluation.

The Formal Capture Intent remains Capture-only Host input and is not part of the generation context or any Builder output. Do not predict `sourceBoundsMeters` or `planeMeters`; after Package verification, the Host resolves those values from checked visual-group bounds or exact frozen Collider geometry.

This is one of exactly two Scene Sources. Do not emit Canonical geometry, overlay a Canonical world, introduce a third Source, or route Native output through a Manifest or Compiler. The Host-selected route and Bootstrap are immutable. A successful task or Skill self-check is not Native admission.

The formal Builder task uses `gpt-5.6-sol` with reasoning effort `xhigh`. Never downgrade a formal run or describe a smoke run as reconstruction evidence.

## Closed output set

You must write exactly these three declared outputs at the task output root:

- `scene.ts`
- `native-block-authoring.json`
- `native-resources.json`

Do not write logs, screenshots, receipts, locks, generated JavaScript, source maps, temporary files, or a copy of `native-scene.bootstrap.json` into the output root. Read [references/native-block-output-contract.md](references/native-block-output-contract.md) completely before writing any output.

## Reconstruction method

1. Establish the complete metric footprint before detail. Reconstruct the reference as coherent volumes seen from opening, top, side, and exploration views—not camera-facing facades.
2. Use the fixed Block Profile shapes and palette. One block is metric geometry; keep the fixed lattice, undeformed meshes, Y-only quarter turns, stable IDs, and deterministic insertion order. Read the exact shape dimensions, shape-specific legal center residues, occupancy grid, support rule, route adjacency rule, and safe stair recipe in the output contract before choosing any coordinates; never infer a Minecraft-like 2 m block scale. A center that is merely a multiple of the broad `[0.25, 0.125, 0.25]` lattice is not automatically valid for every shape.
3. Use `context.random` and the frozen seed for every variation. Never use ambient randomness, wall-clock time, locale-sensitive ordering, or network input.
4. Build ground/support first, then the central ascent, the T-shaped upper platform, the gate/building silhouette, side masses, and blocker walls. Keep the opening composition and the hidden continuation consistent with the Scene Brief.
5. Give mountains, cliffs, stairs, platforms, and buildings real plan depth, cross-section, support, and rear mass. Small blocks express exposed detail; they do not replace structural volume.
6. Give every row of `context/case.json.expected.semanticSilhouetteTargets` exactly its declared `visualGroupId`, with no additional visual group. Do not split a complete gate, building, mountain mass, or repeated identity into decorative part groups. Acceptance targets used only by Spawn support, Collider, traversal, topology, or deterministic evidence remain evidence bindings and must not become visual groups.
7. Register the Host-declared Spawn Marker explicitly at a ground-supported Spawn with clearance. The marker identifies the support-top position; it does not create a Character or control state.
8. Select every static collider explicitly during Block Profile finalization. Include the Spawn support, continuous playable corridor, required Case IDs, and necessary blocker walls, but do not register every visual Block. Keep the final selection below the frozen Generation Request Collider budget. Never infer collision from mesh names, tags, materials, or a later scene scan.
   Every scripted fixed-input check must remain supported for its complete declared approach unless the Case explicitly expects a ledge departure. Before placing its geometry, read the exact actions, axes, and Tick count from `context/case.json`, then resolve the controlled Subject's forward direction, walk/run speeds, acceleration, Capsule, step, and slope limits from `inputs/world-runtime-bootstrap.json`. The formal Runtime advances at exactly 60 fixed Ticks per second. Treat `speed * ticks / 60` only as a theoretical flat-ground ceiling: leave material reserve for acceleration, stairs, slopes, support contacts, and Capsule entry into the Host-resolved checkpoint bounds. A pass check must enter its final checkpoint before the last Tick using only its declared inputs; if the sequence has no turn, lateral, jump, or run action, the route must not require one. A blocker check must reach the blocker on registered support; falling from a visual-only platform edge is not evidence that the blocker works.
9. The first reconstruction Case has no Route/Nav claim. Static traversal intent is only an explicit collider contribution where admitted; do not emit product Route, NavMesh, `goTo`, or reachability evidence.

Host TypeScript checking is strict. When an `as const` tuple supplies a mutable numeric loop bound, explicitly widen the loop variable to `number`; otherwise literal-union inference can make later valid numeric comparisons fail admission.

Before returning, verify this closure:

- every `context/case.json` required Collider ID appears exactly once in `session.finalize().staticColliders`;
- each required Collider selects one explicit Block in its corresponding acceptance visual group, including Spawn/support, step, and blocker roles;
- each Collider selection uses only `id`, `blockId`, `traversalBinding`, and the optional friction/restitution ratios; never add `role` (the Host derives step from the selected checked Block shape and blocker from the binding);
- the final Collider rows remain one-row-per-Collider, deterministic, and below the frozen budget; and
- no Capture bounds, planes, Package fields, receipts, or extra outputs were authored.

## Forbidden ownership

The module receives one Host Candidate `context.scene`; it must not create or replace an Engine, Scene, render loop, physics plugin/body/shape/aggregate, Camera, input listener/manager, timer, gameplay entity, independent tick, or network request. It must not mutate the Host Bootstrap, attach global state, inspect DOM/window, or retain handles after disposal.

Use only `@whitebox-world/native-babylon`, `@whitebox-world/native-babylon-block-profile`, and the exact admitted Babylon subpaths declared by the frozen Native dependency lock. Do not use Three.js, a scene Manifest, Canonical Compiler APIs, Runtime internals, raw Havok, browser APIs, or undeclared dependencies.

## Completion and frozen repair budget

Run the bundled advisory output-shape checker inside this same Builder task:

```bash
node .codex/skills/worldkit-native-block-builder/scripts/self-check.mjs \
  --workspace <declared-output-directory>
```

The checker verifies only the closed output inventory, file safety, JSON plain-data shape, sorted unique visual resource refs, and obvious forbidden authority tokens. The self-check reports only; it does not edit generated files, retry the Builder, typecheck Babylon, instantiate a Candidate, validate a Layout, infer colliders, produce a Package/Receipt, or grant admission.

Obey the frozen Request/Profile `builderSelfRepairAttemptCount`; never invent a retry budget. The representative NBR Case freezes `builderSelfRepairAttemptCount` to `0`, so run this checker once and return its diagnostics without editing or retrying on failure. A future nonzero Host-selected budget still owns the exact attempt count and every new attempt identity. Only a passing fresh report may proceed to trusted Host replay and `worldkit native check`, which run before any Package or Runtime Candidate exists.
