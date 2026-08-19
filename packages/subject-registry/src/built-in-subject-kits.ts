import type { SubjectKitDefinitionV1 } from "./types";

const HUMANOID_THIRD_PERSON_DEFINITION: SubjectKitDefinitionV1 = {
  id: "humanoid.third-person",
  version: 1,
  kitRef: "worldkit://kit/humanoid.third-person@1",
  category: "human",
  bodyTopology: "biped",
  semanticClassId: "subject.humanoid",
  visualParts: [
    {
      id: "body",
      primitive: { kind: "capsule", radiusMeters: 0.35, heightMeters: 1.8 },
      localPositionMeters: [0, 0, 0],
      localRotationEulerRadiansXYZ: [0, 0, 0],
    },
  ],
  collider: {
    kind: "capsule",
    radiusMeters: 0.35,
    heightMeters: 1.8,
    massKilograms: 75,
    maxSlopeDegrees: 42,
    maxStepHeightMeters: 0.3,
  },
  locomotion: {
    mode: "ground",
    groundSpeedMetersPerSecond: 4,
    waterSpeedMetersPerSecond: 2.2,
    jumpSpeedMetersPerSecond: 5.5,
  },
  resourceCost: { vertices: 34, triangles: 64, colliders: 1 },
};

const QUADRUPED_GROUND_PROXY_DEFINITION: SubjectKitDefinitionV1 = {
  id: "quadruped.ground-proxy",
  version: 1,
  kitRef: "worldkit://kit/quadruped.ground-proxy@1",
  category: "animal",
  bodyTopology: "quadruped",
  semanticClassId: "subject.animal.quadruped",
  visualParts: [
    {
      id: "torso",
      primitive: { kind: "box", sizeMetersXYZ: [0.8, 0.7, 1.5] },
      localPositionMeters: [0, 0.15, 0],
      localRotationEulerRadiansXYZ: [0, 0, 0],
    },
    {
      id: "head",
      primitive: { kind: "box", sizeMetersXYZ: [0.55, 0.55, 0.65] },
      localPositionMeters: [0, 0.4, -0.9],
      localRotationEulerRadiansXYZ: [0, 0, 0],
    },
    ...(["front-left", "front-right", "back-left", "back-right"] as const).map((id, index) => ({
      id: `${id}-leg`,
      primitive: { kind: "cylinder" as const, radiusMeters: 0.11, heightMeters: 0.7 },
      localPositionMeters: [
        index % 2 === 0 ? -0.28 : 0.28,
        -0.48,
        index < 2 ? -0.48 : 0.48,
      ] as const,
      localRotationEulerRadiansXYZ: [0, 0, 0] as const,
    })),
    {
      id: "tail",
      primitive: { kind: "cylinder", radiusMeters: 0.08, heightMeters: 0.7 },
      localPositionMeters: [0, 0.25, 0.95],
      localRotationEulerRadiansXYZ: [Math.PI / 3, 0, 0],
    },
  ],
  collider: {
    kind: "capsule",
    radiusMeters: 0.48,
    heightMeters: 1.45,
    massKilograms: 450,
    maxSlopeDegrees: 35,
    maxStepHeightMeters: 0.25,
  },
  locomotion: {
    mode: "ground",
    groundSpeedMetersPerSecond: 5.5,
    waterSpeedMetersPerSecond: 1.8,
    jumpSpeedMetersPerSecond: 4.2,
  },
  resourceCost: { vertices: 398, triangles: 664, colliders: 1 },
};

export const BUILT_IN_SUBJECT_KIT_DEFINITIONS: readonly SubjectKitDefinitionV1[] = [
  HUMANOID_THIRD_PERSON_DEFINITION,
  QUADRUPED_GROUND_PROXY_DEFINITION,
];
