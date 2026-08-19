import type {
  AuthoringSpecV1,
  AuthoringSpecV2,
  PackageSubjectDefinitionV1,
} from "./types";

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

export function createValidAuthoringSpecV2(): AuthoringSpecV2 {
  return {
    kind: "worldkit-authoring-spec",
    schemaVersion: 2,
    id: "basic-world",
    seed: 1024,
    world: {
      coordinateSystem: "right-handed-y-up-minus-z-forward",
      bounds: {
        centerMetersXZ: [0, 0],
        sizeMetersXZ: [160, 160],
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
      subjectDefinitions: [],
    },
    nodes: [
      {
        id: "terrain-main",
        kind: "terrain",
        components: {
          terrain: {
            source: { kind: "procedural", relief: "plain" },
            grid: {
              centerMetersXZ: [0, 0],
              sizeMetersXZ: [160, 160],
              resolutionCellsXZ: [65, 65],
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
            boundary: {
              kind: "ellipse",
              centerMetersXZ: [25, 0],
              radiusMetersXZ: [12, 18],
            },
            depthMeters: 3,
            shoreWidthMeters: 4,
            traversalMode: "swimmable",
          },
        },
      },
      {
        id: "wall-east",
        kind: "object",
        prototypeRef: "package://prototype/wall@1",
        transform: { positionMetersXYZ: [12, 2, 10] },
      },
      {
        id: "spawn-main",
        kind: "anchor",
        transform: { positionMetersXYZ: [0, 0, 30] },
        semantic: { classId: "spawn" },
      },
      {
        id: "player",
        kind: "subject",
        subjectDefinitionRef:
          "worldkit://subject-definition/humanoid.third-person@1",
        spawnAnchorEntityId: "spawn-main",
      },
      {
        id: "camera-main",
        kind: "camera",
        components: {
          cameraRig: {
            defaultRigRef: "worldkit://camera/third-person.standard@1",
            allowedRigRefs: ["worldkit://camera/third-person.standard@1"],
            target: { targetEntityId: "player" },
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
      spawnAnchorEntityId: "spawn-main",
      controlledEntityId: "player",
      cameraEntityId: "camera-main",
    },
    constraints: {},
  };
}

function createPackageSubjectDefinition(
  bodyWidthMeters: number,
): PackageSubjectDefinitionV1 {
  return {
    id: "coastal-pack-animal",
    version: 1,
    kind: "subject-definition",
    category: "animal",
    bodyTopology: "quadruped",
    semanticClassId: "subject.animal.pack",
    coordinateConvention: {
      forwardAxis: "-Z",
      upAxis: "+Y",
      metersPerUnit: 1,
      pivot: "support-center",
    },
    visualParts: [
      {
        id: "body",
        kind: "primitive",
        shape: { kind: "box", sizeMetersXYZ: [bodyWidthMeters, 0.7, 1.4] },
        localTransform: { positionMetersXYZ: [0, 0.85, 0] },
        colliderContribution: "include",
        semanticTags: ["body", "torso"],
      },
      ...(["front-left", "front-right", "back-left", "back-right"] as const).map(
        (legId, index) => ({
          id: `leg.${legId}`,
          kind: "primitive" as const,
          shape: { kind: "cylinder" as const, radiusMeters: 0.1, heightMeters: 0.7 },
          localTransform: {
            positionMetersXYZ: [
              index % 2 === 0 ? -0.28 : 0.28,
              0.35,
              index < 2 ? -0.45 : 0.45,
            ] as const,
          },
          colliderContribution: "include" as const,
          semanticTags: ["leg", legId],
        }),
      ),
    ],
    sockets: [
      {
        id: "seat.mount",
        localTransform: { positionMetersXYZ: [0, 1.3, 0] },
        semanticTags: ["mount-seat"],
      },
      {
        id: "tow.rear",
        localTransform: { positionMetersXYZ: [0, 0.8, 0.8] },
        semanticTags: ["tow-point"],
      },
    ],
    colliderPolicy: {
      kind: "derive",
      colliderDerivationProfileRef:
        "worldkit://collider-derivation-profile/vertical-character-capsule@1",
    },
    capabilityRefs: ["worldkit://capability/locomotion.ground@1"],
    profiles: {
      physicsBodyProfileRef: "worldkit://physics-body-profile/character.medium@1",
      locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
    },
    aiMetadata: {
      displayName: "Coastal pack animal",
      description: "A controllable quadruped whitebox proxy for outdoor traversal tests.",
      semanticTags: ["animal", "ground", "quadruped"],
    },
  };
}

export function createValidPackageSubjectWorldV2(options: {
  reverseDefinitionCollections?: boolean;
  bodyWidthMeters?: number;
} = {}): AuthoringSpecV2 {
  const base = createValidAuthoringSpecV2();
  const sourceDefinition = createPackageSubjectDefinition(options.bodyWidthMeters ?? 0.8);
  const definition = options.reverseDefinitionCollections
    ? {
        ...sourceDefinition,
        visualParts: [...sourceDefinition.visualParts].reverse().map((part) =>
          part.semanticTags === undefined
            ? part
            : { ...part, semanticTags: [...part.semanticTags].reverse() },
        ),
        sockets: [...sourceDefinition.sockets].reverse().map((socket) => ({
          ...socket,
          semanticTags: [...socket.semanticTags].reverse(),
        })),
        capabilityRefs: [...sourceDefinition.capabilityRefs].reverse(),
        aiMetadata: {
          ...sourceDefinition.aiMetadata,
          semanticTags: [...sourceDefinition.aiMetadata.semanticTags].reverse(),
        },
      }
    : sourceDefinition;

  return {
    ...base,
    resources: {
      ...base.resources,
      subjectDefinitions: [definition],
    },
    nodes: [
      ...base.nodes,
      {
        id: "spawn-pack-animal-a",
        kind: "anchor",
        transform: { positionMetersXYZ: [-4, 0, 5] },
        semantic: { classId: "spawn" },
      },
      {
        id: "spawn-pack-animal-b",
        kind: "anchor",
        transform: { positionMetersXYZ: [4, 0, 5] },
        semantic: { classId: "spawn" },
      },
      {
        id: "pack-animal-a",
        kind: "subject",
        subjectDefinitionRef:
          "package://subject-definition/coastal-pack-animal@1",
        spawnAnchorEntityId: "spawn-pack-animal-a",
      },
      {
        id: "pack-animal-b",
        kind: "subject",
        subjectDefinitionRef:
          "package://subject-definition/coastal-pack-animal@1",
        spawnAnchorEntityId: "spawn-pack-animal-b",
      },
    ],
  };
}
