# Canonical AuthoringSpec V4 Template

Use this template as the structural starting point. Infer IDs, bounds, terrain, Prototypes, placements, semantics, and camera values from the Scene Brief and planner images. JSON is closed: do not add fields not shown by this skill.

Replace every `scene-id` placeholder with the exact Host-provided `--scene-id`. AuthoringSpec `id`, implementation-map `sceneId`, and implementation-map `authoringSpecId` are the same identity; never append `-authoring` or another suffix.

`maxVertices`, `maxTriangles`, and `maxColliders` are all enforced by the current compiler. Size every budget deliberately and reduce geometry when measured use exceeds it.

```json
{
  "kind": "worldkit-authoring-spec",
  "schemaVersion": 4,
  "id": "scene-id",
  "seed": 1001,
  "provenance": {
    "userPrompt": "Concise implementation intent."
  },
  "layout": {
    "solverProfileRef": "worldkit://layout-solver-profile/outdoor.s1@1"
  },
  "spatial": {
    "regions": [
      {
        "id": "spawn-support-zone",
        "kind": "polygon-xz",
        "pointsMetersXZ": [[0, 0], [1, 0], [1, 1], [0, 1]],
        "semanticClassId": "region.spawn-support"
      }
    ],
    "routes": [],
    "traversalAreas": [],
    "screenRegions": []
  },
  "world": {
    "coordinateSystem": "right-handed-y-up-minus-z-forward",
    "bounds": {
      "centerMetersXZ": [0, -40],
      "sizeMetersXZ": [160, 180],
      "heightRangeMeters": [-20, 80]
    },
    "gravityMetersPerSecondSquaredXYZ": [0, -9.81, 0],
    "environment": {
      "preset": "clear-day"
    },
    "resourceBudget": {
      "maxVertices": 120000,
      "maxTriangles": 180000,
      "maxColliders": 128
    }
  },
  "resources": {
    "prototypes": [
      {
        "id": "route-deck",
        "version": 1,
        "kind": "primitive",
        "primitive": "box",
        "sizeMetersXYZ": [6, 1, 18],
        "collisionEnabled": true,
        "semantic": {
          "classId": "bridge.route-deck"
        }
      }
    ],
    "subjectDefinitions": []
  },
  "nodes": [
    {
      "id": "terrain-main",
      "kind": "terrain",
      "components": {
        "terrain": {
          "source": {
            "kind": "procedural",
            "relief": "plain",
            "baseHeightMeters": 0,
            "amplitudeMeters": 2
          },
          "grid": {
            "centerMetersXZ": [0, -40],
            "sizeMetersXZ": [160, 180],
            "resolutionCellsXZ": [129, 129]
          },
          "semantic": {
            "classId": "terrain.playable-base"
          }
        }
      }
    },
    {
      "id": "route-deck-a",
      "kind": "object",
      "prototypeRef": "package://prototype/route-deck@1",
      "placement": {
        "kind": "fixed",
        "transform": {
          "positionMetersXYZ": [0, 1, -18],
          "rotationEulerRadiansXYZ": [0, 0, 0],
          "scaleXYZ": [1, 1, 1]
        }
      }
    },
    {
      "id": "spawn-main",
      "kind": "anchor",
      "semantic": {
        "classId": "spawn.player.primary"
      },
      "placement": {
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
    },
    {
      "id": "player",
      "kind": "subject",
      "subjectDefinitionRef": "worldkit://subject-definition/humanoid.g-bot@2",
      "spawnAnchorEntityId": "spawn-main"
    },
    {
      "id": "camera-main",
      "kind": "camera",
      "components": {
        "cameraRig": {
          "defaultRigRef": "worldkit://camera/third-person.standard@1",
          "allowedRigRefs": [
            "worldkit://camera/third-person.standard@1"
          ],
          "target": {
            "targetEntityId": "player",
            "targetHeightMeters": 1.25
          },
          "thirdPerson": {
            "pitchRadians": 0.12,
            "distanceMeters": 5,
            "targetHeightMeters": 1.25,
            "fovDegrees": 56,
            "aspectRatio": 1.7777777777777777
          },
          "manualSwitchAllowed": false
        }
      }
    }
  ],
  "relationships": [],
  "rules": [],
  "startup": {
    "spawnAnchorEntityId": "spawn-main",
    "controlledEntityId": "player",
    "cameraEntityId": "camera-main"
  },
  "constraints": {
    "placements": [
      {
        "id": "spawn-inside",
        "kind": "inside-region",
        "requirement": "required",
        "entityId": "spawn-main",
        "regionId": "spawn-support-zone",
        "boundaryClearanceMeters": 0
      },
      {
        "id": "spawn-supported",
        "kind": "supported-by",
        "requirement": "required",
        "supportedEntityId": "spawn-main",
        "supportingEntityId": "terrain-main",
        "maximumSupportGapMeters": 0,
        "minimumSupportRatio": 1
      },
      {
        "id": "spawn-slope",
        "kind": "within-slope-limit",
        "requirement": "required",
        "entityId": "spawn-main",
        "terrainEntityId": "terrain-main",
        "maximumSlopeDegrees": 35
      }
    ],
    "connectivity": []
  }
}
```

Fixed transforms may omit `rotationEulerRadiansXYZ` or `scaleXYZ` when their defaults are intended. Do not place `placement` on a Subject; its spawn comes from `spawnAnchorEntityId`.

`resources.subjectDefinitions` is the scene-local composition surface, not an
exceptional fallback. When no Registry Subject has the complete planned shape,
add one package-local definition assembled from registered asset and primitive
visual parts, then reference it from the Subject node. Use the compilable
composition example in `controlled-subjects.md`; shape parts never need
separate startup, control, camera, or implementation-map entities.

For the required opening composition, keep the spawn Anchor's `rotationEulerRadiansXYZ` exactly `[0, 0, 0]`: canonical Subject forward is `-Z`, and the main entry destination must therefore lie generally along `-Z`. Keep `cameraRig.target.targetEntityId` equal to `startup.controlledEntityId`, use the standard third-person rig with no manual switch, and configure pitch, distance, target height, and FOV from the assembled Subject bounds and movement speed. Do not create lateral or shoulder composition. The trusted runtime gate proves that the captured camera is directly behind the Subject and the primary visual mask is centered; a diagonal spawn facing is not an acceptable way to point at an off-axis landmark—rotate/lay out the world relationship instead.

The default shown above is an open world: empty routes and connectivity are correct. When the Brief explicitly requires a constrained ground connection and the complete route lies on `terrain-main`, add a destination Anchor, a `spatial.routes` row, and one required connectivity row:

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

For an eligible R1B connection across ordinary static steps, decks, platforms, or ramps, keep the same route and connectivity row and add the exact `traversalSurfaceBindings` shown in `resource-catalog.md` to every traversed collision-enabled Prototype. Do not add connectivity for dynamic/overlapping surfaces, bridge-underpass dual layers, caves, flight, or underwater movement.

If self-check reports `ROUTE_BUILD_WINDOW_BUDGET_EXCEEDED`, replace that single row with ordered rows such as `spawn-main -> route-seam-001` and `route-seam-001 -> destination-main`. Add one real Anchor node `route-seam-001`; use that exact ID as the first row's `destinationAnchorEntityId` and the second row's `startAnchorEntityId`. Each row references its own stable route ID and preserves the real polyline points for its portion. Do not increase `maximumTiles`, duplicate the seam Anchor, or use segmented routes for ordinary open ground.

## Implementation-map draft

Write:

```json
{
  "kind": "worldkit-scene-brief-implementation-map-draft",
  "schemaVersion": 1,
  "sceneId": "scene-id",
  "authoringSpecId": "scene-id",
  "visualTargetMappings": [
    {
      "visualTargetId": "visual-target-1",
      "runtimeEntityIds": ["player"]
    },
    {
      "visualTargetId": "visual-target-2",
      "runtimeEntityIds": ["complex-landmark-plan-id"]
    }
  ]
}
```

Map every target from `visual-identity-palette.json` exactly once and map nothing else. Runtime IDs must be real Subject or Object node IDs from `authoring.json`. The trusted host adds content hashes; never invent them in the draft.

Prefer one holistic runtime Object for a named landmark. When a few additional major masses are genuinely necessary, keep all of them in the same mapping. Map all intentionally identical complete instances of a `repeated-landmark` into its one mapping. Do not create a mapping per part or per identical instance. The trusted host derives the bounded visual capture groups and their colors from the finalized mappings.
