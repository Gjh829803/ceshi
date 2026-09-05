---
name: worldkit-native-block-builder
description: Build or repair one deterministic Babylon Native Block authoring workspace from a frozen Native Block generation request, Scene Brief, and reference inputs. Use only for the Babylon Native Source Builder stage; never use for Canonical authoring, planning, runtime ownership, or styling.
---

# WorldKit Native Block Builder

Create one closed Babylon Native Source workspace. Read the complete frozen inputs before authoring, including the Generation Request, Scene Brief, reference images, API/Profile context, and read-only `native-scene.bootstrap.json`. Do not edit, replace, or derive a second Bootstrap.

The named planning images are not decorative attachments. Inspect `inputs/world-plan.png` before choosing coordinates: it owns world orientation, complete-world footprint, route and junction topology, and coherent hidden continuation. Inspect `inputs/entry-whitebox-target.png` before composing visual groups: it owns the opening framing, left/right and near/far placement, silhouette scale, depth order, and occlusion intent. Uploaded `inputs/reference-<index>.*` images remain the strongest source for directly visible subject and environment evidence. Reconcile all three sources in that order of responsibility; never silently ignore either planning image or treat an anonymous reference index as its semantic role.

The isolated Builder workspace mounts the Host-selected task inputs directly at `context/` and `inputs/`; never depend on a Host-private staging prefix such as `.task/`. Attempt 0 has no repair instruction. Repair Attempts 1–3 always include the Host-authored `context/repair-instruction.json`; read its exact `priorAttemptIndex` and `nextAttemptIndex` as immutable diagnostic identity, preserve every frozen owner and prior Attempt artifact, and revise only the same three Native Source files before regenerating the two advisory PNGs. The selected prior evidence identifies the defect to repair; it does not replace or suspend any other frozen Case expectation. Reread `context/case.json` before editing and preserve every still-valid semantic silhouette, opening-composition region, anchor, depth order, Spawn/support, Collider, topology, and fixed-input traversal constraint.

For every repair Attempt, repair the Block geometry named by each blocking diagnostic. For `native-check-result` evidence, fix only the source-repairable structural issue named by the Host and then expect the complete Check/Ground/Package/Capture/Evaluation sequence to replay. `WORLDKIT_NATIVE_BLOCK_ROUTE_DISCONNECTED` is advisory only: it counts palette-only components and may be expected when ordinary ground connects marked segments or when the world contains multiple courses. Do not spend repair budget solely to eliminate that warning; Case-declared Ground Analysis and traversal diagnostics own actual required connectivity. For Capture/evaluation evidence, a screen-space `move` or `resize` instruction means moving, adding, or removing actual Blocks in that semantic target while checking the referenced prior Capture; it never means relabeling unchanged geometry. For `ground-analysis-report` evidence, no prior Capture or Package exists: read the frozen logical-ground model, Ground Analysis report and diagnostics, then repair the named footprint, clearance, connectivity, traversal or standability failure directly in the three Native outputs while also preserving `context/case.json.expected.openingComposition`. Use the correct existing ground or route visual group for support repair. Never extend a ridge, cliff, landmark, structure, or background visual group toward Spawn merely to connect ground. Do not reassign an existing Block's `visualGroupId` merely to alter measured bounds, coverage, or ordering, and do not change names, identity colors, bindings, or metadata as a substitute for a geometric change. Existing group membership stays stable unless the diagnostic explicitly reports a missing or incorrect semantic binding.

For an Opening repair, group diagnostics by `targetId` before editing. Build one constraint table from the complete expected region bounds, anchor and depth order in `context/case.json` and the complete observed `normalizedBounds`, `normalizedCenter` and depth order under `inputs/attempts/<priorAttemptIndex>/rejected-capture/opening-observation.json`. Solve every reported axis together and preserve all axes already inside tolerance. A projection edge clipped at `0` or `10000` means the group extends beyond the frame: for vertical clipping, adjust near-camera footprint/depth and height together instead of only raising or lowering the crown. When widening a group, add mass at comparable Camera depth and height so the horizontal repair does not create a new vertical or anchor failure. Do not treat the largest diagnostic as the whole target envelope.

## Authority boundary

JSON/Case/Scene Brief owns identity, intent, Subject, Spawn target, budgets, and evidence requirements.

scene.ts owns Babylon Native Block visual construction and explicit registration calls only.

The Host owns Check, Package, Receipt, Runtime Candidate, Havok, Character, Input, Action, Camera, Reset, Capture, and evaluation. The sidecar owns only the closed openingCamera numeric intent and groundExploration validation intent described below; scene.ts cannot create or operate a Camera or Runtime route.

The Formal Capture Intent remains Capture-only Host input and is not part of the generation context or any Builder output. Do not predict `sourceBoundsMeters` or `planeMeters`; after Package verification, the Host resolves those values from checked visual-group bounds or exact frozen Collider geometry.

This is one of exactly two Scene Sources. Do not emit Canonical geometry, overlay a Canonical world, introduce a third Source, or route Native output through a Manifest or Compiler. The Host-selected route and Bootstrap are immutable. A successful task or Skill self-check is not Native admission.

The formal Builder task uses `gpt-5.6-sol` with reasoning effort `xhigh`. Never downgrade a formal run or describe a smoke run as reconstruction evidence.

## Closed Native Source and task-level visual-review outputs

You must write exactly these three Native Source outputs at the task output root:

- `scene.ts`
- `native-block-authoring.json`
- `native-resources.json`

Do not write logs, screenshots, receipts, locks, generated JavaScript, source maps, temporary files, or a copy of `native-scene.bootstrap.json` into the output root. Read [references/native-block-output-contract.md](references/native-block-output-contract.md) completely before writing any output.

The formal task protocol also declares exactly two advisory visual-review files outside that Native Source root:

- `attempts/advisory/builder-top-down-comparison.png`
- `attempts/advisory/builder-entry-comparison.png`

These PNGs are temporary task feedback, not a fourth Scene Source, geometry manifest, Package input, Receipt field, Capture, or admission result. Generate them from the current `scene.ts` every time; never author a parallel block list or review manifest. The Host may replay the same renderer after Native Check and compare decoded RGBA pixels for identity, but neither the renderer nor the Host may score semantic similarity. Visual judgment and source repair stay inside this Builder task.

The top-down comparison is exactly `1544x768`; the entry comparison is exactly `1928x540`. Their encoded bytes count together with the three Native Source outputs against `budgets.maximumOutputBytes`.

## Reconstruction method

### Ground exploration ownership

Read `context/case.json.expected.groundConnectivity.mode` first. Write required
`groundExploration` in the existing `native-block-authoring.json` using that exact
mode; it is pure validation intent, not a new Source, Route/Nav product, visible
object, Collider, success report or executable behavior.

For `source-authored`, choose metric anchors from the Brief's actual exploration
regions while constructing the world. Declare at least one `middle` and one
`remote` required target at distinct real stand positions, neither equal to Spawn.
Use stable sorted unique IDs. Declare ordered `requiredTraversalBands` with honest
`halfWidthMeters`, preserving actual bends and elevations. At least one band starts
at the exact registered Spawn and ends at a middle anchor. Add bands for Brief-required
bridges, corridors, staircase courses, narrow saddles and other restricted connections.
The current admitted ground graph is bidirectional; do not add one-way fields.
There are no minimum meter spans or chunk counts: do not add empty ground, stretch
a road or erase a planned region to influence those measurements. Never invent a
path in open scenery or widen a band to admit a distant detour. A failed anchor or
band means repairing the real support/clearance/course, not moving the validation
point to hide missing ground. These invisible anchors do not need visual groups.

For `case-defined`, write exactly `groundExploration: { "mode": "case-defined" }`.
The frozen Case owns its metric bands and scripted constraints; do not duplicate
or override them in the sidecar. The fixed-waypoint/fixed-input instructions below
apply to this mode. For `source-authored`, Ground consumes the authored anchors and
bands instead; the remaining generic fixed-input Capture template is strict
diagnostic only and must not force a straight replacement for the Brief's geography.
Both modes keep the Case's single-component policy and exact registered Spawn.
Only the existing Host Ground analyzer proves support and connectivity; the task
self-check checks syntax and the Spawn/middle/remote policy join, not geometry.

### Construction priorities

Read immutable `inputs/world-bounds-policy.json`. In `checked-block-layout` mode,
the trusted Host derives final Package bounds from every checked Block, including
ungrouped off-camera scenery; there is no fixed 128m box. Preserve the actual
Brief/World Plan extent rather than shrinking it to a remembered sample boundary.
Legacy container margins are not required empty ground and do not authorize a
hidden foundation. In `fixed` mode, honor the declared `worldBounds`. Never edit
the policy or emit final bounds; the existing Block and Collider budgets still apply.

Before authoring, make one internal construction-and-budget inventory from the complete Brief,
uploaded reference and both planning views. Include important non-target scenery as well as the
selected visual targets: for each complete form or repeated formation, retain its geographic region,
footprint/course, elevation, supporting mass, and neighboring openings/negative space. The Case's
generic entry/remote ground checks are minimum evidence anchors, not a replacement world-design brief.
Do not reduce a complete bridge/stair network to the one straight scripted approach, or omit planned
side/rear/remote regions because the fixed check does not visit them. Do not invent forms absent from
this Case, promote ordinary decoration to identity targets, or output this internal inventory as a
second geometry file.

Read the exact Generation Request budget before allocating geometry. Reserve and count Blocks for
the complete floor/support volume, major terrain, complete landmarks and actual connecting courses
before spending the remainder on exposed detail. Use deterministic loops/Grid counts to check that
allocation, and keep reserve for the existing shared repair cycles. A maximum is not a target: do not
add filler to reach it, and do not reuse a remembered 2,000-Block cap. If detail would crowd out the
world, simplify repeated ornament first while retaining meaningful complete forms, thickness, scale
and geography. This does not relax overlap, explicit Collider, support, lattice or output-byte limits.

1. Establish the complete metric footprint before detail. Reconstruct the reference as coherent volumes seen from opening, top, side, and exploration views—not camera-facing facades.
2. Use the fixed Block Profile shapes and palette. One block is metric geometry; keep the fixed lattice, undeformed meshes, Y-only quarter turns, stable IDs, and deterministic insertion order. Read the exact shape dimensions, shape-specific legal center residues, occupancy grid, support rule, route adjacency rule, and safe stair recipe in the output contract before choosing any coordinates; never infer a Minecraft-like 2 m block scale. A center that is merely a multiple of the broad `[0.25, 0.125, 0.25]` lattice is not automatically valid for every shape.
3. Use `context.random` and the frozen seed for every variation. Never use ambient randomness, wall-clock time, locale-sensitive ordering, or network input.
4. Build ground/support first, then construct the Case-declared routes, elevations, semantic targets, side/rear continuation, and blocker masses in the order implied by the frozen Scene Brief and planning views. Do not import a T-shaped platform, gate, building, mountain, forest, or any other sample-scene layout unless it is present in this Case's frozen inputs.
5. Give mountains, cliffs, stairs, platforms, and buildings real plan depth, cross-section, support, and rear mass. Small blocks express exposed detail; they do not replace structural volume.
   Reconstruct terrain evidence at four scales: macro silhouette and horizon; ridges, valleys, shorelines, ledges, and constructed surfaces; complete semantic landmarks; then exposed rock, foliage, eaves, rails, and edge detail. Full blocks own structural mass, half blocks own major transitions, and quarter/small blocks own exposed silhouette detail. Never turn decorative detail into hidden bulk fill or a separate semantic target.
   Three-dimensional fidelity is required: preserve footprint, longitudinal profile, cross-section, thickness, vertical endpoints, and over/under relationships. Valleys need a floor and containing sides; cliffs need a rim, face, base, and mass behind the rim. Do not substitute camera-facing mountain walls, facade-only buildings, shallow scenery strips, or oversized flat platforms for coherent reference volumes.
   Build complete playable floor groups across the whole intended exploration domain, not a narrow strip that only satisfies one scripted input. Every floor needs visible support depth down to the shared root stratum, enough horizontal clearance for the controlled Capsule, and a continuous explicitly contributed support surface. Stairs are real supported tread columns joining two support levels. A ledge is allowed only when the Scene Brief or visible reference makes that drop intentional; otherwise close the floor. Never place an invisible or visual-only air wall to force a test outcome.
   Preserve every visually important road, trail, bridge approach, corridor, and other route as a metric course: keep its endpoints, ordered bends, junctions, switchbacks, width changes, elevation changes, and relationship to nearby landmarks. Approximate curves on the admitted Block lattice without replacing a winding route with a convenient straight or axis-aligned shortcut. A staircase must preserve its lower and upper support elevations, total rise, tread rhythm, width, course, major landings, side containment or intentional drop, and visible supporting mass; flat support with colored cross-bands is not a staircase.
   Before detailing each non-Subject semantic visual group, lock its footprint center, long axis, semantic front, and relationship to nearby routes and structures from the reference and frozen planning views. The opening Camera does not define an object's front. Do not mirror, quarter-turn, front/back reverse, or relocate a target merely because its silhouette remains visible from the opening view.
   Formal opening depth order is measured from each declared visual group's complete checked bounds center. Extending a midground ridge or landmark group toward Spawn changes that measurement even when its distant mass remains in place. Keep support connections in the ground/route group and preserve the complete footprint of every composition target during every repair.
   Resolve evidence in this order when inputs are incomplete: uploaded reference evidence, frozen entry composition, frozen top-down continuation, then the smallest coherent hidden geometry consistent with all three. Do not let a convenient scripted route override stronger visible or planned structure.
6. Give every row of `context/case.json.expected.semanticSilhouetteTargets` exactly its declared `visualGroupId`, with no additional visual group. Never reconstruct the controlled Subject as Native Block geometry, even when the Scene Brief or planning image shows a rider, mount, avatar, character, or body parts; RuntimeHost creates the SDK Subject and keeps it visible in Capture. A Case that asks for a Subject visual group is invalid rather than permission to duplicate that authority. Do not split a complete gate, building, mountain mass, or repeated identity into decorative part groups. Acceptance targets used only by Spawn support, Collider, traversal, topology, or deterministic evidence remain evidence bindings and must not become visual groups.
   Identity grouping is not required for every functional Block. Ordinary non-target structure,
   support, water, hazard and background scenery may omit `visualGroupId` and retain their Profile
   colors. Do not invent a Case target, add a manifest row, or attach unrelated scenery to a landmark
   just to color/group it. Every declared target still needs actual member Blocks carrying its exact
   group, and every used visual group must be declared. Collider Groups remain independent explicit
   membership; an ungrouped visual Block never receives automatic collision or Gameplay identity.
7. Register the Host-declared Spawn Marker explicitly at a ground-supported Spawn with clearance. The marker identifies the support-top position; it does not create a Character or control state.
8. Select every static collider explicitly during Block Profile finalization. Include the Spawn support, continuous playable corridor, required Case IDs, and necessary blocker walls, but do not register every visual Block. Keep the final selection below the frozen Generation Request Collider budget. Never infer collision from mesh names, tags, materials, or a later scene scan.
   Preserve the validated block-world solid-landmark behavior at this explicit authoring boundary: every non-Subject semantic target represented with `paletteRole: "structure"` is a solid world landmark. Put every solid Block of that target in one stable `colliderGroupId`, and bind that complete group to the target's required `role: "blocker"` Case Collider using exactly `{ kind: "not-traversable" }` and `exposedEdgePolicy: "none"`. A doorway remains passable by leaving its opening empty, not by making the surrounding pillars visual-only. If a mass is intentionally non-colliding or unreachable scenery, classify it as `background-mass` or another honest visual-only role instead of `structure`. This rule produces an explicit Frozen Contribution; it never authorizes the Host or Runtime to infer physics from palette color.
   For every `static-surface` selection, explicitly write `exposedEdgePolicy: "protect-ground-subject"` by default. Use `"none"` only when the Scene Brief or visible reference explicitly requires an intentional fall from every exposed edge owned by that selection. If one playable area contains both protected edges and an intentional drop, partition it into honest Collider Groups instead of disabling protection for the whole floor. This is a Builder authoring default, not a parser fallback: `exposedEdgePolicy` remains a required exact field, and the Host must preserve the authored value.
   `context/case.json.expected.groundConnectivity` is frozen Host intent, not Builder-owned policy. For a `case-defined` ground Spawn, make every declared traversal-band waypoint a real stand position and keep each consecutive segment traversable inside its honest `halfWidthMeters`. Current ground surfaces are bidirectional by construction; do not add an `isBidirectional` or one-way field. At least one band begins at the exact registered Spawn support position, and bands form a one-to-one binding with ground pass targets by `acceptanceTargetRef`. When `requireSingleReachableComponent` is `true`, every explicitly contributed standable floor must belong to the Spawn-reachable component; do not hide a disconnected island by relabeling it visual-only or blocker. Do not move, widen, omit, duplicate, or invent bands to make the checker pass. For an air Spawn, an empty band list and `false` single-component policy make ground analysis measurement-only; they do not authorize claiming flight/water reachability from the current ground-only Traversal Envelope.
   The checker samples the final smoothed collision triangles, not only raw Block tops. Put the exact Spawn, every pass target, and every declared band waypoint on a flat landing with full Capsule-footprint support plus at least one surrounding Profile microcell at the same top height; place stair and slope transitions outside that landing. If smoothing changes the final triangle height at a frozen point, repair the nearby explicit surface Blocks—never move the point or relax the threshold.
   Preserve the old block-world ability to cross an intended walkable rise of up to one meter by authoring it through the current Profile contract, not by restoring the old one-meter smoothing constant. Decompose the total rise into four or fewer face-connected, visibly supported `0.25m` tread transitions with flat endpoint landings. The trusted topology may smooth each quarter-meter join, while Ground Analysis still validates the resulting surface against the Subject's `0.3m` step and `42°` slope authorities. Never join two walkable levels `0.5m`–`1m` apart directly and assume smoothing will make them traversable.
   In `case-defined` mode every scripted fixed-input check must remain supported for its complete declared approach unless the Case explicitly expects a ledge departure. Before placing its geometry, read the exact actions, axes, and Tick count from `context/case.json`, then resolve the controlled Subject's forward direction, walk/run speeds, acceleration, Capsule, step, and slope limits from `inputs/world-runtime-bootstrap.json`. The formal Runtime advances at exactly 60 fixed Ticks per second. Treat `speed * ticks / 60` only as a theoretical flat-ground ceiling: leave material reserve for acceleration, stairs, slopes, support contacts, and Capsule entry into the Host-resolved checkpoint bounds. A pass check's `acceptanceTargetRef` must bind a declared ground/step Collider and must enter its final checkpoint before the last Tick using only its declared inputs; if the sequence has no turn, lateral, jump, or run action, the route must not require one. A block check's `acceptanceTargetRef` must bind a declared blocker Collider, and the supported approach must let the Capsule reach that blocker; falling from a visual-only platform edge is not evidence that the blocker works.
9. Ground-connectivity and fixed-input checks are structural admission evidence, not a Route/Nav product claim. Static traversal intent is only an explicit collider contribution where admitted; do not emit product Route, NavMesh, `goTo`, or reachability evidence.

## Mandatory visual feedback

### Opening Camera intent inside this task

Write required `openingCamera` in `native-block-authoring.json` with exactly
`mode: "third-person"`, `distanceMeters`, `targetHeightMeters`, `pitchRadians`,
and `fovDegrees`. Start from the frozen Bootstrap's numeric values, then tune
these four values against the reference and Entry Whitebox Target in the same
check/render/view/repair loop. Do not scale the SDK Subject to fill the frame.
Keep the rear-view centerline and 16:9 frame; do not add entity IDs, Profile refs,
shoulder/lateral/yaw offsets, or a second Bootstrap. The existing selectable
third-person Profile ranges in `inputs/world-runtime-bootstrap.json` apply.

The Host independently validates this data and binds it through the existing
authoring manifest, compiled metadata and Package hashes. The frozen Request,
Bootstrap, WRT and Registry files remain untouched. Camera-only repairs use the
same shared repair counter and invalidate both comparison PNGs; they do not
allocate another task, output, or external repair attempt. Runtime target sockets
and Context Modifiers retain their existing precedence; do not claim an advisory
projection proves exact Runtime pixels or override Subject sockets from source.

After the structural self-check passes for the current source, resolve `scripts/render-visual-review.mjs` relative to this exact `SKILL.md` copy and run:

```bash
node <resolved-bundled-renderer-path> \
  --workspace . \
  --top-down-output attempts/advisory/builder-top-down-comparison.png \
  --entry-output attempts/advisory/builder-entry-comparison.png
```

The renderer performs a source-only restricted mock capture of the Block Profile calls. It reads the frozen Native Bootstrap, Host-owned `subject-visual-review-proxy.json`, `native-block-authoring.json`, World Plan, and Entry Whitebox Target; it never derives the Subject from Native Source or reinterprets Runtime resources, and it does not instantiate Babylon, Engine, Scene, Runtime, Physics, Camera, Package, or Formal Capture. A passing renderer report proves only that the current source produced deterministic advisory pixels.

Before emitting comparisons, it uses the Profile's shared shape-size, lattice and occupied-microcell
functions to reject off-grid or overlapping Blocks. Its error names both overlapping Block IDs and
the occupied cell. Repair that geometry inside this task using the same shared repair counter;
do not ignore a renderer failure or return stale PNGs. This is disposable authoring feedback, not
full Native admission, support/Collider validation or a Runtime collision owner.

You must actually open and inspect both PNGs with the available image-viewing tool. Do not infer visual success from exit status, hashes, file size, or the fact that the renderer produced images. In each comparison the Planner target is on the left and the current Builder projection is on the right.

Inspect in this priority order:

1. top-down complete-world footprint, geographic extent, major terrain/water masses, target placement, route endpoints, bends, junctions, width changes, elevation transitions, and side/rear/remote continuation;
2. entry-frame subject-to-world scale, main-target screen footprint and silhouette, left/right and near/far placement, opening visibility, depth order, occlusion, structural thickness, and visible supporting mass; then
3. exposed detail only after both structural readings agree with the frozen planning images and uploaded reference evidence.

Use these comparisons as the primary repair feedback, not as files to acknowledge. Check the
construction inventory against both images, including important scenery that has no visual-target
identity. Within the largest geographic mismatch, repair complete landmark position and semantic
front/course first, then footprint and scale, then depth order and occlusion. Mere target presence is
not alignment. Before each source repair, recount its Block cost and remove low-value ornament if
needed; never erase a major region or flatten a required rise to free budget.

If either comparison is materially wrong, repair only `scene.ts`, `native-block-authoring.json`, or `native-resources.json`; do not edit the frozen inputs, Bootstrap, Case, Planner images, thresholds, renderer, or task protocol. Then rerun both the structural self-check and both comparisons and inspect the fresh pixels again. A source or openingCamera edit invalidates both prior reports.

Host TypeScript checking is strict. Coordinate rows must be fixed tuples (`as const` on a literal table, or `readonly [number, number]` rows); destructuring an inferred `number[][]` does not prove its members exist. Never silence diagnostics with `any`, `@ts-ignore`, `@ts-nocheck`, or unchecked non-null assertions. When an `as const` tuple supplies a mutable numeric loop bound, explicitly widen the loop variable to `number`; otherwise literal-union inference can make later valid numeric comparisons fail admission.

Before returning, verify this closure:

- every `context/case.json` required Collider ID appears exactly once in `session.finalize().staticColliders`;
- every required `role: "blocker"` landmark selects the complete `colliderGroupId` carried by all of its solid `structure` Blocks, while intended openings contain no Blocks;
- each required Collider uses the closed `colliderGeometrySource` union; use `kind: "block-group"` plus the exact `colliderGroupId` on every member for a complete floor or structural mass, and use `kind: "block"` only for a genuine singleton tread or blocker; never infer group membership from visual metadata;
- each Collider selection uses only `id`, `colliderGeometrySource`, `traversalBinding`, required `exposedEdgePolicy`, and the optional friction/restitution ratios; the retired top-level `blockId` field and any `role` field are invalid;
- the final Collider rows remain one-row-per-Collider, deterministic, and below the frozen budget; and
- no Capture bounds, planes, Package fields, receipts, or extra outputs were authored.

## Forbidden ownership

The module receives one Host Candidate `context.scene`; it must not create or replace an Engine, Scene, render loop, physics plugin/body/shape/aggregate, Light, Camera, input listener/manager, timer, gameplay entity, independent tick, or network request. Runtime owns the neutral whitebox inspection lights. It must not mutate the Host Bootstrap, attach global state, inspect DOM/window, or retain handles after disposal.

Import exactly `@whitebox-world/native-babylon` and `@whitebox-world/native-babylon-block-profile`. Direct Babylon subpaths, Three.js, a scene Manifest, Canonical Compiler APIs, Runtime internals, raw Havok, browser APIs, and every other dependency are forbidden in this current-only Block lane.

## Completion and one shared frozen repair budget

Resolve `scripts/self-check.mjs` relative to this exact `SKILL.md` copy and run the bundled advisory source preflight checker inside this same Builder task:

```bash
node <resolved-bundled-self-check-path> \
  --workspace . \
  --case context/case.json \
  --scene-brief inputs/scene-brief.md \
  --visual-identity-palette inputs/visual-identity-palette.json
```

Case and Request bind the raw Scene Brief file bytes; the identity palette binds
the shared parser's semantic Scene Brief hash. These hashes need not be equal.
Use the frozen Brief with the bundled checker; never rewrite either hash to make
them match. The portable checker is built from the Host's current Brief/Palette
parsers, not an independently maintained schema copy.

The checker runs semantic TypeScript checking with the exact Host compiler policy and a build-generated frozen SDK/type-library graph; it does not use transpilation as a substitute. It reports bounded `typecheckDiagnostics` with the TypeScript code, concrete message and source location. Fix these inside this same task and rerun after every source edit. The checker also verifies the three declared Native Source root outputs, file safety, JSON plain-data shape, sorted unique visual resource refs, obvious forbidden authority tokens, and the portable Case visual-group/identity-color join. For every Case `acceptanceTargetRef` that identifies `visual-target-N`, copy the exact `visualGroupId`, `semanticClassId`, and Native fixed color from `inputs/visual-identity-palette.json`; target 3 is `#D9A514`, not the Canonical-lane purple. A palette target omitted from the Case is not permission to invent a visual group or opening bounds. It ignores the task runner's reserved root entries `context/`, `inputs/`, `attempts/`, and `.codex-last-message.txt`; the trusted Host promotes the three Native Source files separately from the two declared advisory PNGs and rejects every other output. The portable self-check reports only and can trigger repair inside this one Builder task; Host admission independently repeats the identity join and remains the sole trusted gate. The checker does not edit generated files, retry the Builder, execute Babylon, instantiate a Candidate, validate a Layout, infer colliders, produce a Package/Receipt, or grant admission.

Obey the frozen Request/Profile `builderSelfRepairAttemptCount`; never invent a retry budget. The representative NBR Profile freezes `builderSelfRepairAttemptCount` to `3`. Type, structural and visual feedback share this one counter: after the initial output, any source repair consumes one cycle, and there are at most three combined self-repair cycles inside this same Builder task. Do not allocate separate structural and visual retry budgets. Every edit invalidates both preceding reports. Finish after a fresh structural report passes and both latest comparison PNGs have been actually opened and visually reviewed, as in the legacy Builder. If a comparison is materially wrong and budget remains, perform the source repair and fresh-image review described above. Do not withhold otherwise valid declared outputs solely because visual differences remain when that shared budget is exhausted; disclose those differences in the normal final response, without claiming perfect alignment or writing an additional report. Structural failures still require their actual diagnostics, not a false passing claim. Neither a renderer success nor a self-reported similarity judgment is an additional Host production gate.

Ordinary Scene production has no external diagnostic-repair Attempts, independent of the Evaluation Profile's `qualityGateMode`. A failed Host replay ends that production execution; it never implicitly buys another source-repair task. These in-task source repairs do not allocate a Package or Runtime Candidate and do not replace the separate Host-owned bounded external repair Attempts available only to explicit strict-acceptance runs. A Host-owned external repair is never another self-repair cycle: only that explicit workflow, within the frozen Profile budget, creates a fresh identity-bearing Native generation Attempt with a new request and task ID plus exactly the preceding trusted evidence. A stricter Profile alone is not authorization for external repair. Provider-task retry accounting is separate from this structural/visual self-repair budget and belongs to the task router; the Builder never requests or implements provider retries.

Only a passing fresh structural report plus inspected advisory comparisons may proceed to trusted `worldkit native check`. After that Native Check passes, the Host replays the same renderer and compares decoded RGBA identity before WorldPackage publication. Native Check itself owns its isolated Host replay Candidates; the Builder never creates a Candidate.
