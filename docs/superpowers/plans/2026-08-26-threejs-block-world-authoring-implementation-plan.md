# Three.js Block World Authoring Implementation Plan

**Goal:** Implement the first experimental vertical slice frozen in
`docs/superpowers/specs/2026-08-26-threejs-block-world-authoring-design.md`
without changing any current Canonical or Babylon/Havok product route.

**Architecture:** Keep Registry/manifest/checking provider-neutral in
`@whitebox-world/block-world`. Isolate Three.js in
`@whitebox-world/block-world-three`. Agent modules create ordinary metric box
Meshes and bind only a preset identity. A trusted CLI extracts the Scene and
runs deterministic grid/connectivity checks.

**Tech stack:** TypeScript, Vitest, Three.js `0.185.1`, pnpm workspace.

## Task 1: Freeze design and package boundaries (`BW-00`)

**Files:**

- `docs/superpowers/specs/2026-08-26-threejs-block-world-authoring-design.md`
- this plan

**Verification:** exact baseline/ref statement, work graph completeness, links.

## Task 2: Provider-neutral Block Registry (`BW-01`)

**Files:**

- create `packages/block-world/package.json`
- create `packages/block-world/src/{types,preset-registry,index}.ts`
- create focused tests

**RED:** exact preset refs/colors, landmark shared physics, unknown ref,
immutability, unique colors.

**GREEN:** closed definitions and resolver/list APIs with no renderer import.

## Task 3: Three.js adapter (`BW-02`)

**Files:**

- create `packages/block-world-three/package.json`
- create `packages/block-world-three/src/{binding,extract,index}.ts`
- create focused tests

**RED:** unbound Mesh, non-box/deformed box, non-grid nested transform,
non-unit world scale, invalid rotation, duplicate ID/cell.

**GREEN:** immutable symbol binding and deterministic Scene extraction. Do not
store physics values in `userData` or accept Agent overrides.

## Task 4: Checker (`BW-03`)

**Files:**

- create `packages/block-world/src/check.ts`
- extend tests

**RED:** missing spawn, blocked two-cell clearance, unsupported footprint,
step too high/down, disconnected island, unreachable target, landmark
missing/mixed/reused color.

**GREEN:** deterministic stand-node graph and BFS report with stable ordering.

## Task 5: CLI and example (`BW-04`)

**Files:**

- create `scripts/cli/check-block-world.ts`
- create `examples/block-world/basic-world.mjs`
- add root `block-world:check` command and CLI test

The module exports `buildBlockWorld()` returning the Three Scene plus checker
inputs. It may use arbitrary Agent-authored loops/helpers but no WorldKit
semantic construction operations.

## Task 6: Integration and evidence (`BW-05`)

**Files:**

- root/new package manifests
- `pnpm-lock.yaml`
- `scripts/lib/test-gate-manifest.ts`
- active documentation links required to explain the narrow Three authoring exception

**Verification:**

```bash
pnpm install
pnpm exec vitest run packages/block-world/src packages/block-world-three/src scripts/cli/check-block-world.test.ts
pnpm block-world:check -- --world examples/block-world/basic-world.mjs
pnpm verify:workspace-boundaries
pnpm test:census
pnpm typecheck
pnpm test:contract
git diff --check
```

Do not run or mutate Studio data, generated scene artifacts, existing worktrees,
or another branch. Final Runtime/Browser/rendered claims are out of scope.

## BW2: Agent-facing clean break and runtime transport

BW2 follows the work graph in the authoritative design. Implement in dependency
order: extend the Block module contract, add a deterministic internal compiler,
replace the Builder Skill/self-check and Hosted launcher, then delete competing
Agent-facing authoring material. The deletion is gated by a passing replacement
launcher path; runtime and capture services are explicitly retained.

Required BW2 evidence:

```bash
pnpm block-world:check -- --world examples/block-world/basic-world.mjs
pnpm block-world:compile -- --world examples/block-world/basic-world.mjs \
  --output <temporary-authoring.json> --map-output <temporary-map.json>
pnpm typecheck
pnpm verify:workspace-boundaries
pnpm test:census
pnpm test:contract
pnpm test:studio
git diff --check
```

Do not retain aliases that let an Agent choose between the Block Builder and the
superseded Builder. Internal Canonical artifacts may remain only as Host-owned
runtime transport and must not be described as Agent output.

## BW3: shared block-whitebox planning images

Implement the `BW3-*` graph in the design: centralize the image/target palette
in `@whitebox-world/block-world`; update the Planner Skill, prompt, portable
checker and parity tests; enforce target-to-landmark preset order in Builder;
then update Studio trust checks, deliverable copy and the visible HTML legend.
Keep image semantics as intent and `world.mjs` as the only geometry authority.

Required BW3 evidence:

```bash
pnpm generate:agent-self-check
pnpm check:agent-self-check
pnpm exec vitest run scripts/agent-planner-self-check.test.ts scripts/planner-skill.test.ts scripts/builder-skill.test.ts packages/block-world/src/preset-registry.test.ts
pnpm test:studio
pnpm typecheck
pnpm test:contract
pnpm build
```

## BW4: scalable chunk-derived world

Implement `BW4-00` through `BW4-06` from the authoritative design in strict
dependency order. Do not add an Agent-facing chunk, terrain, fill, route, or
procedural-generation API.

### Task BW4-01: metrics and Host chunk compiler

- Extend the provider-neutral checker report with reachable stand-cell bounds,
  32-cell reachable chunk coverage, maximum spawn distance, and off-camera
  reachable counts.
- Partition admitted blocks by signed XZ chunk coordinate, immutable preset,
  visual group, and interaction identity.
- Deterministically coalesce occupied cells into axis-aligned cuboids without
  crossing a chunk boundary or semantic/interaction identity.
- Compile cuboids, not individual blocks, into internal Authoring/Execution
  transport and rebuild visual mappings from cluster membership.
- Preserve byte-identical output for identical input across repeated runs.

### Task BW4-02: Babylon batching and collision residency

- Detect only Host-owned chunk cluster IDs; generic Canonical objects retain
  their existing creation path.
- Build one thin-instance render batch per chunk and semantic/visual identity.
- Teach artifact capture to resolve a logical entity ID through batch metadata.
- Merge static block collider geometry per chunk and keep a bounded Subject-
  centered active ring. Update residency before fixed physics advances.
- Own every batch, aggregate, shape, and mesh exactly once through the Runtime
  disposer stack; exercise partial construction and throwing cleanup.

### Task BW4-03: lighting

- Enable lighting for block materials, retain a small emissive floor, remove
  specular highlights, and keep exact preset identity in material metadata.
- Keep uniform clear-day atmosphere for whitebox Runtime regardless of the
  uploaded reference's styled time of day.
- Verify near and far batches use the same material authority.

### Task BW4-04: Skills and exploration scale

- `world-plan.png` uses one small red spawn token and never a Subject silhouette;
  `entry-whitebox-target.png` keeps the complete centered rear Subject.
- Require reference-consistent traversable middle, side/rear, and remote areas
  outside the uploaded view.
- Add maintained movement-scale profiles to Builder self-check using logical
  reachability metrics. Do not infer scale from raw world bounds.
- Regenerate and parity-check the portable Planner/Builder bundles.

### Task BW4-05: Studio human review

- Persist a reviewer decision (`pending`, `approved`, or `rejected`) against
  the exact Planner artifact hashes.
- Expose read and mutation APIs plus details-page controls. A later Planner
  artifact hash invalidates an earlier decision.
- Do not add top-down marker pixel-area, shape, or recognition gates.

### Task BW4-06: integration evidence

Run focused regressions first. On the final tree run each affected complete lane
once:

```bash
pnpm generate:agent-self-check
pnpm check:agent-self-check
pnpm typecheck
pnpm test
pnpm test:studio
pnpm test:independent
pnpm build
git diff --check
```

Also capture and inspect one large block world, then manually traverse at least
one chunk seam. Record draw batches, active physics bodies, initial ready time,
far-landmark visibility, lighting, and any known warnings as separate automated,
rendered, and manual evidence.

## BW5: scale, mixed shapes, and smooth walkable surfaces

1. Replace the unmerged V1 unit-cell Manifest with a V2 meter-positioned,
   shape-explicit Manifest derived from four exact BoxGeometry sizes.
2. Rebuild occupancy, support, clearance, reachability, exploration metrics,
   adjacent-height admission, and composed-humanoid scale checks in meters.
3. Generalize deterministic chunk clustering and Babylon Thin Instance
   expansion to mixed base shapes while preserving visual/interaction identity.
4. Derive one deterministic chunked smoothable support topology and use it for
   both the visible overlay and live block-world Havok collision.
5. Update hosted Planner/Builder references, launcher prompt, portable bundle,
   examples, fixtures, and local evaluation cases without adding a second Agent
   construction surface.
6. Run focused contracts, typecheck, full root tests, Studio tests, production
   build, independent gates, real Havok seam traversal, and Browser visual/FPS
   evidence before delivery.

## BW6: sequential Planner images, linked spaces, and automatic cliff protection

Implement `BW6-00` through `BW6-05` from the authoritative design in dependency
order. Architecture, public contract choices, cross-package integration, and
final verification remain main-agent-owned.

### Task BW6-01: causal Planner image workflow

- Keep one Planner Codex task and its closed file-output contract.
- Generate and inspect `entry-whitebox-target.png` before calling image
  generation for `world-plan.png`.
- Supply the uploaded reference, exact entry PNG, and Brief to the top-down
  generation call.
- Allow a multi-panel complete overview only when non-contiguous spaces are
  planned; retain one small spawn marker and minimal paired transition IDs.
- Preserve receipt hashing and Host replay without adding brittle pixel-shape
  or geographic-recognition gates.

### Task BW6-02: directed space transitions

- Add one narrow provider-neutral transition row to the Block World authoring
  result/check input.
- Validate stable IDs, an `interactive-trigger` source with matching
  `interactionInstanceId`, a standable destination, and yaw quarter-turn.
- Add transition edges to logical reachability so separately built spaces can
  form one explorable world without fake ground between them.
- Compile trigger identity and destination placement into internal Block World
  transport only; keep the Agent surface free of generic rules or graph DSLs.
- Execute the nearest eligible transition on a `primary-action` press and cover
  debounce, reset, camera continuity, and deterministic output.

### Task BW6-03: automatic ground-only boundaries

- Add an exposed-edge boundary list to the reconstructed walkable topology,
  computed globally before chunk grouping.
- Build one invisible boundary mesh/shape per active collision chunk and own it
  in the existing residency lifecycle.
- Give that shape a dedicated membership bit and toggle only that bit on a
  Subject controller from its active locked motion-kernel implementation.
- Exercise world perimeter, obstacle adjacency, smooth neighbor, chunk seam,
  profile switch, jump, water/flight bypass, partial construction, and throwing
  disposal cases.

### Task BW6-04: Builder fidelity and content-led exploration

- Remove movement-mode minimum span/distance/chunk failures from the portable
  Builder checker; retain the measurements in its report.
- Require implementation of the Brief's named spaces and declared connections
  through Skill guidance and human review rather than arbitrary extent.
- Document evidence priority and forbid empty padding, displaced visible
  landmarks, decorative-only transitions, and Builder-authored air walls.
- Regenerate and byte-parity-check both portable self-check bundles.

### Task BW6-05: final integration evidence

Run focused regressions while implementing. On the final tree run each affected
complete lane once:

```bash
pnpm generate:agent-self-check
pnpm check:agent-self-check
pnpm typecheck
pnpm test
pnpm test:studio
pnpm test:independent
pnpm build
git diff --check
```

Also run one linked-space Block World through Builder/Host compilation, inspect
the entry and top-down artifacts, enter the world in the Browser, activate a
transition, and walk a protected cliff edge. Record automated, rendered, and
manual evidence separately.
