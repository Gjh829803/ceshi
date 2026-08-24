import type {
  PackageSubjectDefinitionV1,
} from "./types";
import type { AuthoringSpecV4 } from "./types-v4.js";

export function createValidAuthoringSpec(): AuthoringSpecV4 {
  return {
    kind: "worldkit-authoring-spec",
    schemaVersion: 4,
    layout: {
      solverProfileRef: "worldkit://layout-solver-profile/outdoor.s1@1",
    },
    spatial: { regions: [], routes: [], screenRegions: [], traversalAreas: [] },
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
        placement: { kind: "fixed", transform: { positionMetersXYZ: [12, 2, 10] } },
      },
      {
        id: "spawn-main",
        kind: "anchor",
        placement: { kind: "fixed", transform: { positionMetersXYZ: [0, 0, 30] } },
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
              aspectRatio: 16 / 9,
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
    constraints: { placements: [], connectivity: [] },
  };
}

export function createValidAuthoringSpecV4(): AuthoringSpecV4 {
  return createValidAuthoringSpec();
}

function createPackageSubjectDefinition(
  bodyWidthMeters: number,
): PackageSubjectDefinitionV1 {
  return {
    id: "coastal-pack-animal",
    version: 1,
    kind: "subject-definition",
    authoringAvailability: "recommended",
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
    visualBinding: { mode: "static" },
    sockets: [
      {
        id: "seat.mount",
        kind: "local",
        localTransform: { positionMetersXYZ: [0, 1.3, 0] },
        semanticTags: ["mount-seat"],
      },
      {
        id: "tow.rear",
        kind: "local",
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
      physicsBodyProfileRef:
        "worldkit://physics-body-profile/character.capability-medium@1",
      locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
      controlFeelProfileRef:
        "worldkit://control-feel-profile/humanoid.medium-ground@1",
      allowedControlFeelProfileRefs: [
        "worldkit://control-feel-profile/humanoid.medium-ground@1",
        "worldkit://control-feel-profile/humanoid.heavy-ground@1",
      ],
      motion: {
        defaultMotionProfileRef:
          "worldkit://motion-profile/free-ground.humanoid-medium@1",
        optionalMotionProfileRefs: ["worldkit://motion-profile/safe-ground@1"],
        fallbackMotionProfileRef: "worldkit://motion-profile/safe-ground@1",
      },
      controlProfileRef:
        "worldkit://control-profile/planar.camera-relative@1",
      cameraContextProfileRef:
        "worldkit://camera-context/capability-driven.default@1",
      mediumProfileRef: "worldkit://medium-profile/ground-air.standard@1",
      harnessProfileRef: "worldkit://harness-profile/subject.standard@1",
    },
    relationshipCapabilityRefs: [],
    actionOrPoseSetRef: "worldkit://pose-set/static.whitebox@1",
    renderBindingProfileRef: "worldkit://render-binding/subject.standard@1",
    aiMetadata: {
      displayName: "Coastal pack animal",
      description: "A controllable quadruped whitebox proxy for outdoor traversal tests.",
      semanticTags: ["animal", "ground", "quadruped"],
    },
  };
}

export function createValidPackageSubjectWorld(options: {
  reverseDefinitionCollections?: boolean;
  bodyWidthMeters?: number;
} = {}): AuthoringSpecV4 {
  const base = createValidAuthoringSpec();
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
        placement: { kind: "fixed", transform: { positionMetersXYZ: [-4, 0, 5] } },
        semantic: { classId: "spawn" },
      },
      {
        id: "spawn-pack-animal-b",
        kind: "anchor",
        placement: { kind: "fixed", transform: { positionMetersXYZ: [4, 0, 5] } },
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

export function createValidRiggedPackageDefinition(): PackageSubjectDefinitionV1 {
  return {
    id: "rigged-golden-package",
    version: 1,
    kind: "subject-definition",
    authoringAvailability: "recommended",
    category: "human",
    bodyTopology: "biped",
    semanticClassId: "subject.humanoid.rigged",
    coordinateConvention: {
      forwardAxis: "-Z",
      upAxis: "+Y",
      metersPerUnit: 1,
      pivot: "support-center",
    },
    visualParts: [
      {
        id: "body.asset",
        kind: "asset",
        subjectAssetRef: "worldkit://subject-asset/humanoid.golden@1",
        localTransform: {
          positionMetersXYZ: [0, 0, 0],
          rotationEulerRadiansXYZ: [0, 0, 0],
          scaleXYZ: [1, 1, 1],
        },
        appearance: { mode: "whitebox-neutral" },
        semanticTags: ["body", "golden", "rigged"],
      },
    ],
    visualBinding: {
      mode: "rigged",
      rigProfileRef: "worldkit://rig-profile/biped.golden@1",
      animationSetRef: "worldkit://animation-set/humanoid.ground.golden@1",
    },
    sockets: [
      {
        id: "hand.right",
        kind: "bone",
        boneId: "hand.right",
        offsetTransform: {
          positionMetersXYZ: [0, 0, 0],
          rotationEulerRadiansXYZ: [0, 0, 0],
        },
        semanticTags: ["equipment-grip", "hand"],
      },
    ],
    colliderPolicy: {
      kind: "profile",
      colliderProfileRef:
        "worldkit://collider-profile/humanoid.medium-capsule@1",
    },
    capabilityRefs: ["worldkit://capability/locomotion.ground@1"],
    profiles: {
      physicsBodyProfileRef:
        "worldkit://physics-body-profile/character.capability-medium@1",
      locomotionProfileRef: "worldkit://locomotion-profile/ground.standard@1",
      controlFeelProfileRef:
        "worldkit://control-feel-profile/humanoid.medium-ground@1",
      allowedControlFeelProfileRefs: [
        "worldkit://control-feel-profile/humanoid.medium-ground@1",
        "worldkit://control-feel-profile/humanoid.heavy-ground@1",
      ],
      motion: {
        defaultMotionProfileRef:
          "worldkit://motion-profile/free-ground.humanoid-medium@1",
        optionalMotionProfileRefs: ["worldkit://motion-profile/safe-ground@1"],
        fallbackMotionProfileRef: "worldkit://motion-profile/safe-ground@1",
      },
      controlProfileRef:
        "worldkit://control-profile/planar.camera-relative@1",
      cameraContextProfileRef:
        "worldkit://camera-context/capability-driven.default@1",
      mediumProfileRef: "worldkit://medium-profile/ground-air.standard@1",
      harnessProfileRef: "worldkit://harness-profile/subject.standard@1",
    },
    relationshipCapabilityRefs: [],
    actionOrPoseSetRef:
      "worldkit://animation-set/humanoid.ground.golden@1",
    renderBindingProfileRef: "worldkit://render-binding/subject.standard@1",
    aiMetadata: {
      displayName: "Package rigged Golden humanoid",
      description: "A package definition that exercises the complete rigged asset graph.",
      semanticTags: ["golden", "human", "rigged"],
    },
  };
}

export function createValidPackageSubjectWorldV4(options: {
  reverseDefinitionCollections?: boolean;
  bodyWidthMeters?: number;
} = {}): AuthoringSpecV4 {
  return createValidPackageSubjectWorld(options);
}

export function createValidRiggedPackageSubjectWorld(): AuthoringSpecV4 {
  const base = createValidAuthoringSpec();
  return {
    ...base,
    resources: {
      ...base.resources,
      subjectDefinitions: [createValidRiggedPackageDefinition()],
    },
    nodes: base.nodes.map((node) =>
      node.kind === "subject" && node.id === "player"
        ? {
            ...node,
            subjectDefinitionRef:
              "package://subject-definition/rigged-golden-package@1",
          }
        : node,
    ),
  };
}

export function createValidRiggedPackageSubjectWorldV4(): AuthoringSpecV4 {
  return createValidRiggedPackageSubjectWorld();
}
