# Native Block Walkable Surface Closure Design

**Project:** WRC-1 / NBR-1
**Stable task:** `NBR-65`
**Status:** accepted current-only implementation authority
**Date:** 2026-09-02
**Implementation baseline:** `origin/main@c67bb5bf480d8789d9a7a757121526d010205e6d`

## 1. Decision

The Babylon Native Block lane must preserve the useful playability behavior proven by
`origin/codex/block-world-sdk-v2@3c2e9826f0c91ef39675c27a6bbdc6238e6c0b05`, not only its visual
block-building style. `NBR-65` therefore closes semantic walkable surfaces, whole-surface support,
connectivity, exact collision aggregation, and exposed-edge protection before `NBR-70` may be
completed.

This is a capability migration, not a source-architecture migration:

```text
Babylon Native Block calls
  -> Build-Epoch-local Block Layout
  -> explicit Collider Group declarations
  -> Profile structural and walkable-surface check
  -> Host-frozen Static Collider Contributions
  -> verified WorldPackage / Receipt
  -> the existing RuntimeHost and SDK-owned Havok
```

The accepted tree still has exactly two mutually exclusive Scene Sources. It does not restore the
old Block Manifest, Block Compiler, Three.js adapter, Canonical overlay, second Runtime, or a Runtime
height sampler.

`NBR-65` is a required NBR-1 vertical-slice follow-up under the existing BWB-2/BWB-4/BWB-6 and BNA-4
owners. It is not a thirty-fourth WRC-1 work package and does not reopen the truthful historical
completion of BWB-6's read-only optimization assessment.

## 2. Why the current implementation is incomplete

The current Profile already migrated fixed shapes, lattice placement, occupancy, structural support,
visual groups, explicit single-Block Collider registration, and deterministic optimization
assessment. It did not migrate the v2 ground closure:

- v2 gave every support Block a semantic support mode and derived standable positions;
- its checker tested Subject footprint union, clearance, Spawn, targets, connected components, and
  bounded traversal bands;
- its runtime merged admitted Block collision by Chunk and built a continuous walkable surface;
- exposed walkable edges produced ground-kernel-only safety boundaries;
- therefore a semantically walkable floor could not silently remain mostly visual-only.

The current Native Builder contract instead asks the Agent to register the Spawn support, a narrow
scripted corridor, and selected blockers while keeping most floor Blocks visual-only. That can pass a
fixed-input route and still let a human walk through an apparently solid floor. BWB-6 reports possible
coalescing, but explicitly does not instantiate merged collision or change Runtime behavior.

The defect is not repaired by lowering a score threshold, adding an invisible infinite foundation,
increasing Collider count until every Block is registered, or scanning Babylon Mesh names after the
build. Those choices would respectively hide the defect, falsify the scene, exceed budgets, or create
a second physics authority.

## 3. Fixed migration ledger

| v2 capability | Current disposition | `NBR-65` result |
|---|---|---|
| fixed shapes, lattice, occupancy | already migrated | retain current Profile types and tests |
| semantic support versus obstacle versus visual-only | missing as an explicit construction-to-contribution join | add explicit Collider Group membership, independent of palette/color |
| footprint-union and clearance check | missing | port the algorithm behind current Profile/Host types |
| Spawn and required target standability | only narrow Case checks exist | validate against the same checked surface graph |
| connected standable components | missing for Native production | produce deterministic metrics and fail according to the frozen ground-only policy |
| required traversal bands | represented only by scripted runtime checks | add bounded structural graph evidence; do not claim product Route/Nav |
| continuous support geometry | only one box per selected Block | emit exact union geometry from declared Collider Groups |
| Collider coalescing and Chunk policy | BWB-6 assessment only | consume the assessment or the same frozen rules in a BNA-owned materializer |
| exposed-edge ground boundary | missing | add explicit, identity-bound ground-only boundary contribution and Runtime filter behavior |
| Three.js binding/extraction | rejected | do not migrate |
| persistent Block Manifest/Compiler | rejected | do not migrate |
| old Subject, Motion, Camera, transition Runtime | rejected | keep current SDK owners; space transitions remain WRC-EVT/Route work |

## 4. One explicit authoring model

Palette is visual. It must never imply collision or walkability. Instead, each Profile-created Block
may opt into one stable `colliderGroupId`. A Block without that field remains visual-only. A dense Grid
applies the explicitly supplied group to every child it creates.

Finalization declares each group exactly once through the existing `staticColliders` collection. The
current-only selection contract replaces the single `blockId` field with one discriminated geometry
source:

```ts
type BabylonNativeBlockColliderGeometrySourceV1 =
  | Readonly<{ kind: "block"; blockId: string }>
  | Readonly<{ kind: "block-group"; colliderGroupId: string }>;

interface BabylonNativeBlockStaticColliderSelectionV1 {
  readonly id: string;
  readonly colliderGeometrySource: BabylonNativeBlockColliderGeometrySourceV1;
  readonly traversalBinding: BabylonNativeTraversalBindingV1;
  readonly exposedEdgePolicy: "none" | "protect-ground-subject";
  readonly frictionRatio?: number;
  readonly restitutionRatio?: number;
}
```

There is one parser and no `blockId` compatibility alias. All active Modules, fixtures, tests, Skill
copies, and generated examples migrate atomically. `kind: "block"` preserves exact evidence Colliders;
`kind: "block-group"` is the normal whole-surface path.

`colliderGroupId` is explicit authoring intent recorded when the Block is created. The Profile may
join only Blocks created through the current Session. It must not infer membership from palette,
material, visual group, ID prefix, Mesh name, tag, hierarchy, or a Scene scan.

## 5. Exact union geometry and identity

For one declared Block Group, the Profile builds collision from the checked occupancy union:

1. every source Block and occupied microcell appears exactly once;
2. shared internal faces are removed;
3. remaining faces keep deterministic axis/winding/order;
4. adjacent coplanar faces may be merged only when the occupied union is unchanged;
5. no convex hull, filled gap, bounding-box substitution, or cross-semantic merge is allowed;
6. the resulting Mesh is invisible, Candidate-Scene-owned, and registered through the existing core
   `registerStaticCollider()` boundary;
7. the frozen inventory retains all sorted `sourceBlockIds`, the group ID, exact traversal/material
   semantics, proxy kind, bounds, and geometry identity.

One group produces one contribution Collider in the first implementation. If a group exceeds the
frozen vertex/triangle budget, it fails closed. Later Chunk splitting may produce deterministic
sub-Colliders only after the Package identity and evidence contracts include their stable identities;
it must not silently change one accepted Collider into multiple runtime objects.

The exact-union Mesh is ordinary static collision input. Havok shape construction, PhysicsAggregate,
support queries, movement, fixed Tick, and lifecycle remain owned by the existing Runtime.

## 6. Walkable-surface graph

A Collider Group is a support source only when its finalized `traversalBinding.kind` is
`static-surface` and its locked traversal surface is compatible with the controlled Subject. Obstacle
and visual groups never become support.

The trusted Host evaluates the checked group geometry with the controlled Subject's already resolved
Capsule and Physics Body limits. The Agent does not author radius, clearance, slope, or step policy.
The graph uses:

- footprint radius over the union of exposed top microcells;
- Capsule clearance against all declared solid Collider Groups;
- the current Physics Body maximum step-up/down and slope constraints;
- deterministic adjacency over shared edges and admitted step transitions;
- the registered Spawn Marker and Case-declared acceptance target positions;
- optional required ground traversal bands as evaluation input, not Runtime geometry.

The result reports standable count, Spawn support, reachable count, disconnected components, target
reachability, traversal-band reachability, exposed edges, and coverage bounds. A ground-only Case
fails when its frozen policy requires one component and declared playable support is disconnected.
A flight/water Case may report disconnected ground without pretending the ground graph models that
movement mode.

This graph is admission/evaluation evidence. Runtime never queries it as a second ground owner;
Runtime support remains the single SDK `checkSupport()` path over the frozen Havok geometry.

## 7. Exposed-edge protection

An author may request `protect-ground-subject` only on a `static-surface` group. The Host derives edge
segments from that group's checked exposed top surface. It creates no visible Babylon object and no
author-authored wall.

The boundary must be represented by an explicit frozen contribution role so Runtime never recognizes
it from an ID or Mesh name. The current-only contribution/runtime contract adds the minimum internal
role needed to apply a collision membership mask that is enabled only for ground movement kernels.
Flight, swimming, camera collision, and unrelated physics queries must not inherit the ground safety
wall. Reset, replay, dual-session isolation, and throwing cleanup restore the exact filter state.

Until that role and its engine-backed gates land, `protect-ground-subject` fails closed; it must never
degrade to an ordinary invisible wall.

## 8. Budgets and performance

The formal budget remains Host-frozen. The Builder cannot raise it. Whole-surface coverage is achieved
by exact aggregation, not by one Collider per visual Block.

The first accepted implementation records baseline versus actual:

- source Block and occupied-cell count;
- registered Collider count;
- collision vertices and triangles;
- removed internal-face count;
- standable/reachable/disconnected positions;
- boundary source and merged segment counts;
- deterministic contribution and Package hashes.

BWB-6 Thin Instance eligibility remains a visual optimization proposal. `NBR-65` may consume its
Collider grouping rules, but does not make Thin Instances a prerequisite for correct support.

## 9. Failure and cleanup

Group declaration, graph check, union materialization, boundary materialization, core registration,
or Host replay failure rejects the Build Epoch before Package publication. Partial proxy Meshes are
disposed in reverse order. A cleanup throw remains a failure and publishes no contribution.

An evaluation rejection may still preserve the already verified Package and Capture for human preview
under the separate rejected-evidence contract. A Native check, Package, or Runtime-admission failure
must never be made previewable as if it were trusted.

## 10. Required evidence

Completion requires all of the following on one candidate:

- asymmetric group union, holes, stairs, negative coordinates, and creation-order determinism;
- palette changes that do not change physics membership;
- visual Blocks omitted from Collider Groups remain non-colliding;
- no duplicate/missing group, block, cell, Collider, or source identity;
- footprint, clearance, Spawn, target, component, and traversal-band adversarial fixtures;
- group collision under the frozen count/vertex/triangle budget;
- real Havok walk, step, blocker, edge-boundary, ledge opt-out, reset, cadence, two-session, and cleanup;
- Package/Receipt replay identity and Collider overlay equivalence;
- the petrified-forest Case permits free movement over all declared visible playable floor and does not
  fall through a visual-only seam;
- no Three.js, Block Manifest, Block Compiler, Scene scan, hidden foundation, second support sampler,
  or legacy `blockId` selection path remains.

## 11. Completion boundary

`NBR-65` is complete only after the current-only API migration, trusted graph check, exact aggregate
collision, Runtime boundary filtering, real Case evidence, focused gates, and an independent exact-SHA
review have no open P0/P1. Only then may `NBR-70` use the representative Case as playability evidence.

This does not complete product Route/Nav/`goTo`, flight/water traversal, complex Room semantics,
general events, full BNA-6 Golden Corpus, BNA-8, or WRC-ACC-1.
