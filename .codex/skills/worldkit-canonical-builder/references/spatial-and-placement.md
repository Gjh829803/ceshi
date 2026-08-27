# Spatial and Placement Reference

## Spatial declarations

Use Canonical spatial declarations when they materially preserve the Scene Brief and planner-image intent or drive solved placement.

Create a polyline route only when the brief explicitly describes a restricted connection. For ordinary open ground, polygon regions may describe the broad playable footprint but must not become a preferred lane. For flight or underwater movement, world bounds and collision geometry define free space; do not author aerial or underwater rails.

Emit AuthoringSpec V4. Open worlds keep `spatial.routes`, `spatial.traversalAreas`, and `constraints.connectivity` empty. For an explicitly constrained ground connection, use Route R1 when its ribbon lies on one Heightfield, or R1B when it crosses an unambiguous single-layer chain of explicitly bound ordinary static steps, decks, platforms, or ramps. The trusted Host then runs the frozen Recast Graph/Path and real Babylon/Havok controller probe. Dynamic/overlapping surfaces, bridge-underpass dual layers, caves, flight volumes, and underwater volumes do not receive connectivity claims.

`maximumTiles` limits one required Route build window, not world bounds. The Builder self-check records the conservative window estimate. If one long diagonal or bent route exceeds it, author stable ordered route segments. The destination Anchor entity of segment N must be the same entity as the start Anchor of segment N+1; do not duplicate co-located seam Anchors or ask the Host to invent them.

Polygon region:

```json
{
  "id": "region-entry",
  "kind": "polygon-xz",
  "pointsMetersXZ": [[-12, 8], [12, 8], [12, -24], [-12, -24]],
  "minimumHeightMeters": -2,
  "maximumHeightMeters": 12,
  "semanticClassId": "region.entry"
}
```

Polyline route:

```json
{
  "id": "route-primary",
  "kind": "polyline-xz",
  "pointsMetersXZ": [[0, 0], [0, -20], [8, -42]],
  "widthMeters": 5,
  "locomotionProfileRef": "worldkit://locomotion-profile/ground.standard@1"
}
```

Required Heightfield connectivity:

```json
{
  "id": "player-to-destination",
  "kind": "connected-by-route",
  "requirement": "required",
  "traversingEntityId": "player",
  "startAnchorEntityId": "spawn-main",
  "destinationAnchorEntityId": "destination-main",
  "routeId": "route-primary"
}
```

A V4 world also contains `spatial.traversalAreas`. Each row is a `polygon-xz` with `pointsMetersXZ`, the Heightfield `surfaceEntityId`, and `mode: "blocked"`. Use it only for a real non-traversable portion of that Heightfield; it is navigation evidence, not physical collision geometry.

Screen region uses normalized UV coordinates:

```json
{
  "id": "opening-center",
  "kind": "rectangle-uv",
  "minimumUv": [0.3, 0.2],
  "maximumUv": [0.7, 0.85]
}
```

## Placement

Use fixed placement when the brief or planner images provide a meaningful spatial relationship:

```json
{
  "kind": "fixed",
  "transform": {
    "positionMetersXYZ": [0, 2, -20],
    "rotationEulerRadiansXYZ": [0, 0, 0],
    "scaleXYZ": [1, 1, 1]
  }
}
```

Use solved placement only when the result should be selected by S1 constraints:

```json
{
  "kind": "solved",
  "initialTransform": {
    "positionMetersXYZ": [12, 0, -40]
  },
  "placementConstraintIds": ["landmark-inside", "landmark-visible"]
}
```

Ground-supported spawn Anchors are the important default solved-placement case. Give the Anchor a small region that contains the exact intended X/Z, then require terrain support and a walkable slope:

```json
{
  "kind": "solved",
  "initialTransform": {
    "positionMetersXYZ": [0, 0, 0],
    "rotationEulerRadiansXYZ": [0, 0, 0]
  },
  "placementConstraintIds": [
    "spawn-inside",
    "spawn-supported",
    "spawn-slope"
  ]
}
```

The matching placement constraints use `inside-region` for the small spawn zone, `supported-by` with `maximumSupportGapMeters: 0` and `minimumSupportRatio: 1`, and `within-slope-limit` for the Anchor and Terrain. The spawn zone is a solver candidate source, not a route or preferred lane. It must include the intended entry point and be small enough that another candidate cannot change the opening composition. This lets S1 calculate the exact Heightfield Y. A fixed ground spawn is valid only when its Y already equals the compiled support height.

For a constructed start surface, use a collision-enabled Object as `supportingEntityId`, author the Anchor at the exact object-top height, and attach a required `supported-by` constraint. The constraint must pass S1 and appear in the compiled layout assertions; do not compare that elevated spawn to the Terrain beneath it.

A constraint has `id`, its exact `kind`, and `requirement: "required" | "preferred"`. A preferred constraint also uses a positive `preferenceWeightRatio`.

Supported S1 constraints and exact domain fields:

| kind | Required fields after `id/kind/requirement` |
|---|---|
| `inside-region` | `entityId`, `regionId`, `boundaryClearanceMeters` |
| `outside-region` | `entityId`, `regionId`, `boundaryClearanceMeters` |
| `distance-range` | `entityId`, `referenceEntityId`, `minimumDistanceMeters`, `maximumDistanceMeters` |
| `faces-entity` | `facingEntityId`, `targetEntityId`, `maximumAngularDeviationDegrees` |
| `supported-by` | `supportedEntityId`, `supportingEntityId`, `maximumSupportGapMeters`, `minimumSupportRatio` |
| `minimum-clearance` | `entityId`, `clearanceMeters`; optionally `otherEntityIds` and/or `semanticClassIds` |
| `within-slope-limit` | `terrainEntityId`, `maximumSlopeDegrees`, plus `entityId` or `routeId` as appropriate |
| `visible-in-camera-region` | `visibleEntityId`, `cameraEntityId`, `screenRegionId`, `minimumVisibleRatio`, `minimumProjectedAreaRatio` |

Example:

```json
{
  "id": "landmark-visible",
  "kind": "visible-in-camera-region",
  "requirement": "preferred",
  "preferenceWeightRatio": 0.4,
  "visibleEntityId": "landmark-main",
  "cameraEntityId": "camera-main",
  "screenRegionId": "opening-center",
  "minimumVisibleRatio": 0.4,
  "minimumProjectedAreaRatio": 0.001
}
```

Keep Required constraints satisfiable. Do not add solved placement merely to appear sophisticated; fixed placement is preferable when the planner images already provide the intended composition.
