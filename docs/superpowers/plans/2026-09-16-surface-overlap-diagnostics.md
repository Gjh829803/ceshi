# Surface overlap diagnostics

User approved implementing AI-facing, advisory geometry feedback using the pool
stair and stone arch failures as regression cases. Extend the existing feature
worktree; do not change old downloaded cases or run external production jobs.

## Design

`world_inspect({sections:['surface-overlaps'], entityIds:[...]})` explicitly scans
visible non-deformed triangle meshes at the sampled pose. Default inspections and
playtests do not scan. Selection uses existing SDK entity filters; unrestricted
inspection includes unregistered scene meshes. Exclude known actors/moving physics,
skinned/morphed/instanced geometry with explicit coverage counts. Hidden geometry
and configured depth-biased overlays are omitted from the applicable comparisons.

Compare world-space triangle planes and positive projected overlap area, including
triangle pairs inside the same merged geometry. Adjacent shared edges, crossings
without coplanar area and separated surfaces are not findings. Report exact/near
coplanar risk, never assert observed flicker from geometry alone. Return object
identity, entity ID when available, triangle references, world/local bounds and
overlap polygon. Do not guess original source components after merging.

Bound triangle collection, comparisons and findings. Coverage explicitly lists
limits, unsupported geometry and truncation. Optional diagnostics fail locally.
Observation does not advance simulation, change input or alter meshes/materials.

Optional `surfaceOverlaps.highlight` captures the first reported overlap using a
temporary camera and overlay in the existing presentation transaction. Preserve
renderer state, original camera, scene and lifecycle even on failure. Host saves
the diagnostic PNG with source/runtime/sample identity through the existing image
reply path. It is labeled diagnostic, not formal delivery media.

## Tasks

- [x] Geometry module and focused pure Three tests: exact pool stair/water,
  overlapping arch/pillar, merged-mesh internal overlap, normal shared edges,
  offset decals, transforms, material groups, and bounded/partial diagnostics.
- [x] Bridge opt-in selection, local failure handling and read-only integration.
- [x] Temporary local highlight capture and Host evidence/image transport.
- [x] MCP schema, one authoritative programming-guide entry, actual tool tests.
- [x] Focused tests, source/typecheck/lint/census/prebuild, local case scans,
  browser capture restoration and independent code review.

No new scene-authoring DSL, geometry mutation, universal automatic fix or
production acceptance gate is introduced. Detection parameters are tolerances
and resource budgets, not certification of visual quality.

## Validation outcome

- 25 geometry regressions and 22 bridge/browser integration checks passed.
- 43 authoring-discovery/Episode contract checks and 45 existing tool-usability
  checks passed; actual MCP dispatch returns the diagnostic image and source identity.
- Full typecheck, changed-file ESLint, test census, workspace boundaries,
  programming-guide local links and runtime prebuild passed.
- Isolated copies of the supplied cases reproduce the water/stair and merged
  arch/pillar overlaps. The full staircase scan returns three water overlaps and
  completes within its default pair budget. Separating water by 5 cm in the copy
  removes those findings. Gate findings explicitly report truncation at the cap.
- Geometry and integration reviews passed after correcting opposing-face false
  positives, local bounds, moving-entity exclusions and presentation failure
  containment. A running SDK world's state is preserved when capture or its
  framebuffer restoration fails.

These checks establish diagnostic behavior, not semantic acceptance of generated
worlds or a guarantee that every visible flicker has this cause. Original case
files and external deployments were not modified.
