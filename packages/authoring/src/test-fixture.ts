import type { AuthoringSpecV1 } from "./types";

export function createValidAuthoringSpec(): AuthoringSpecV1 {
  return {
    kind: "worldkit-authoring-spec",
    schemaVersion: 1,
    id: "basic-world",
    seed: 1024,
    world: {
      coordinateSystem: "right-handed-y-up-minus-z-forward",
      bounds: {
        centerXZ: [0, 0],
        sizeXZ: [160, 160],
        heightRangeMeters: [-10, 30],
      },
      gravityMetersPerSecondSquaredXYZ: [0, -9.81, 0],
      environment: { preset: "clear-day" },
      resourceBudget: {
        maxVertices: 200_000,
        maxTriangles: 300_000,
        maxColliders: 128,
      },
    },
    resources: {
      prototypes: [
        {
          id: "wall",
          version: 1,
          kind: "primitive",
          primitive: "box",
          sizeMetersXYZ: [2, 4, 14],
          collisionEnabled: true,
          semantic: { classId: "obstacle.wall" },
        },
      ],
    },
    nodes: [
      {
        id: "terrain-main",
        kind: "terrain",
        components: {
          terrain: {
            source: { kind: "procedural", relief: "plain" },
            grid: {
              centerXZ: [0, 0],
              sizeXZ: [160, 160],
              resolutionXZ: [65, 65],
            },
          },
        },
      },
      {
        id: "lake-main",
        kind: "water",
        components: {
          water: {
            terrainEntityId: "terrain-main",
            boundary: { kind: "ellipse", centerXZ: [25, 0], radiusMetersXZ: [12, 18] },
            depthMeters: 3,
            shoreWidthMeters: 4,
            traversalMode: "swimmable",
          },
        },
      },
      {
        id: "wall-east",
        kind: "object",
        prototypeRef: "package://prototype/wall",
        transform: { positionMeters: [12, 2, 10] },
      },
      {
        id: "spawn-main",
        kind: "anchor",
        transform: { positionMeters: [0, 0, 30] },
        semantic: { classId: "spawn" },
      },
      {
        id: "player",
        kind: "subject",
        kitRef: "worldkit://kit/humanoid.third-person@1",
      },
      {
        id: "camera-main",
        kind: "camera",
        components: {
          cameraRig: {
            defaultRigRef: "worldkit://camera/third-person.standard@1",
            allowedRigRefs: ["worldkit://camera/third-person.standard@1"],
            target: { entityId: "player" },
            thirdPerson: {
              pitchRadians: 0.3,
              distanceMeters: 5,
              targetHeightMeters: 1,
              fovDegrees: 56,
            },
            manualSwitchAllowed: false,
          },
        },
      },
    ],
    relationships: [],
    rules: [],
    startup: {
      spawnAnchorId: "spawn-main",
      controlledEntityId: "player",
      cameraEntityId: "camera-main",
    },
    constraints: {},
  };
}
