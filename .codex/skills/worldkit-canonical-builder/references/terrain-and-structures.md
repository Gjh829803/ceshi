# Terrain and Structure Decisions

## Current Canonical terrain capability

Canonical AuthoringSpec V4 supports a procedural Heightfield source:

```json
{
  "kind": "procedural",
  "relief": "flat",
  "baseHeightMeters": 0,
  "amplitudeMeters": 0,
  "frequencyPerMeter": 0.01,
  "octaves": 4,
  "lacunarityRatio": 2,
  "persistenceRatio": 0.5
}
```

`relief` is one of:

- `flat`: cities, constructed worlds, distant chasm floors, or intentionally level bases
- `plain`: gently rolling open ground, deserts, beaches, or basins
- `hills`: broad hill country or cloud/land masses with moderate relief
- `mountains`: intentionally steep large-scale relief

The terrain grid requires `centerMetersXZ`, positive `sizeMetersXZ`, and integer `resolutionCellsXZ` values between 2 and 1025. Use enough cells to preserve collision shape without spending the whole vertex budget. A practical starting density is roughly 1.25–2.5 meters per cell for a gameplay-critical base surface. For the current explicitly large `1–2km` operational profile, use at most `1024` vertices per axis so explicit generated samples remain inside the existing item contract; `801 x 801` over `2000m x 2000m` gives `2.5m` cells. This remains one fully resident Heightfield, not streaming.

## Deriving world surfaces

Use this decision order:

1. **Continuous natural base** → one Terrain node.
2. **Constructed ground, bridge, deck, terrace, platform, stairs, elevated route** → collision-enabled Object nodes using box/cylinder Prototypes.
3. **Ramp or sloped route connector** → a rotated collision-enabled box Object; keep slope compatible with the controlled Subject.
4. **Cliff, tower, arch, palace mass, mountain silhouette not suitable for the base Heightfield** → prefer one holistic Object; add only the few major masses required to preserve the defining silhouette. Enable collision only when gameplay can contact them.
5. **Distant background identity mass** → collision-disabled Object proxy.
6. **Water** → a Water node whose boundary is a supported circle, ellipse, or polygon and whose `terrainEntityId` identifies the base Terrain.

Water node template:

```json
{
  "id": "water-main",
  "kind": "water",
  "components": {
    "water": {
      "terrainEntityId": "terrain-main",
      "boundary": {
        "kind": "ellipse",
        "centerMetersXZ": [0, -20],
        "radiusMetersXZ": [12, 18]
      },
      "depthMeters": 4,
      "shoreWidthMeters": 2,
      "waterLevelMeters": 0,
      "traversalMode": "blocked",
      "semantic": {
        "classId": "water.lake"
      }
    }
  }
}
```

Circle boundaries use `centerMetersXZ` plus `radiusMeters`; polygon boundaries use at least three `pointsMetersXZ` pairs. `traversalMode` is `blocked`, `swimmable`, or `walkable`.

Do not force every semantic surface into the Heightfield. A complex world is normally one base Terrain plus many explicit constructed support Objects.

## Traversal and support

- Implement the full described world rather than only geometry visible from the entry Camera. Infer bounds that cover every meaningful level, side/rear area, destination, and named landmark.
- Size the playable domain from the request, visible reference evidence, inferred continuation, terrain-cell guidance and the enforced resource budget. Do not use a fixed duration, perimeter length or movement-speed formula as a quality gate.
- Flight, underwater, vehicles, caves, interiors, and other unsupported production movement or topology requests are capability gaps. Stop with an explicit diagnostic instead of authoring a production recipe or substituting ordinary ground movement.
- Branch on the brief's movement mode and navigation prose before authoring Canonical routes.
- Open land: use broad collision-enabled Terrain or constructed ground to cover the complete playable footprint. Everything outside collision blockers is traversable. Do not add route polylines, road strips, fences, corridors, or ramps unless the world itself explicitly contains them.
- Explicit restricted connection: preserve a continuous path from spawn to every named destination. Give every traversable level actual collision-enabled support, describe the connection with Canonical routes, and ensure transitions overlap within the Subject's step/slope envelope. When self-check reports `ROUTE_BUILD_WINDOW_BUDGET_EXCEEDED`, split only that connection into ordered route rows and reuse the exact same seam Anchor as the previous destination and next start.
- Only constrained ground routes use route-width and route-slope rules; keep ordinary ground-humanoid route slopes below about 35° for margin against the 42° maximum.
- Flatten or explicitly support the spawn footprint. For every ground-supported Subject, prefer an S1-solved spawn Anchor with a small `inside-region` zone plus required `supported-by` Terrain and `within-slope-limit` constraints. The region must include the exact intended entry X/Z and remain small enough that solving cannot relocate the composition.
- Place the spawn Anchor at the Subject support origin, not at capsule center height. On procedural relief, never assume that `baseHeightMeters` is the local support height and never guess Y. Let the supported solved placement sample the Heightfield, or use the Builder self-check's reported `requiredSubjectOriginYMeters` to correct an exact fixed Anchor.
- A ground Subject must start in stable support contact: neither below terrain nor suspended above it. Runtime falling or collision recovery is not an acceptable spawn-placement strategy.
- When the intended start is on a constructed deck, bridge, platform, or terrace instead of Terrain, use a collision-enabled supporting Object, set the Anchor to the exact top support height, and add a required `supported-by` constraint from the spawn Anchor to that Object. Do not validate it against the hidden Terrain below the structure.
- World forward is `-Z`. Face the controlled Subject toward the primary destination when one exists; only constrained plans have a first route segment.

## Geometry complexity

- Reuse Prototypes for repeated structure.
- `maxVertices`, `maxTriangles`, and `maxColliders` are required hard budgets; the current compiler rejects every overrun. Preserve world completeness by choosing an appropriate budget up front, then reduce non-essential complexity when measured output exceeds any limit.
- For ordinary worlds, retain the existing target below about `100000` compiled vertices and normally declare no more than `120000`. For an explicitly large `1–2km` world, derive Terrain cost as `columns * rows` vertices and `2 * (columns - 1) * (rows - 1)` triangles, add the actual other geometry plus deliberate headroom, and declare those blocking totals. Do not spend the enlarged budget on decorative repetition.
- Use a `65x65` or similarly modest Terrain grid for background-dominant scenes; use `129x129` only when gameplay-critical ground relief justifies it. Never spend dense Terrain resolution on distant scenery.
- Keep background silhouettes collision-disabled and reuse a small Prototype set. When validation reports `COMPILER_RESOURCE_BUDGET_EXCEEDED` for vertices, triangles, or colliders, reduce Terrain resolution, repeated geometry, unique masses, or unnecessary collision as appropriate to the measured cause.
- Prefer one Prototype/Object per named landmark when it preserves the recognizable whole shape.
- If one primitive loses the defining silhouette, use the minimum few major masses—normally body/base plus at most a small number of silhouette-defining additions. Do not model windows, columns, roof tiles, rings, braces, trim, or other decorative repetition as separate Objects.
- Use descriptive Object IDs. Necessary extra masses use short structural suffixes and remain in the same visual-target mapping.
- Major visible counts, relative scale, depth order, and any evidence-backed route width come from the brief and planner images.
- Fine materials, carvings, foliage density, cloud texture, lighting effects, and final style belong to post-whitebox generation, not Canonical collision geometry.

When the plan requests geometry outside current capability, create the minimum honest whitebox proxy that preserves playability and identity silhouette. Do not claim true caves, overhangs, arbitrary architecture meshes, or interior navigation.

## Route R1/R1B boundary

- Authoring V4 compiles to ExecutionPlan V5 with a Host-derived Gameplay Bootstrap. A required `connected-by-route` constraint is eligible for trusted validation when its complete ribbon lies on one Heightfield (R1) or on an unambiguous connected chain of the Heightfield plus explicitly bound ordinary static surfaces (R1B).
- An R1B step, deck, platform, or ramp must be a collision-enabled Object whose Prototype declares one exact `collider-subshape` traversal binding for logical subshape `primary` using `worldkit://traversal-surface-profile/ground.static@1`.
- Collision-enabled Objects without that binding remain static blockers. Never promote every collider to a navigable surface.
- Dynamic platforms, overlapping/stacked walkable surfaces, bridge-underpass dual layers, caves, unsupported multi-level structures, flight volumes, and underwater volumes remain outside trusted Route publication. Keep connectivity empty for those cases.
- A `blocked` traversal area excludes a polygon from its declared traversal surface. It does not create or remove Babylon collision and must correspond to a real semantic exclusion.
