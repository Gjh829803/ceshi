export type SubjectDefinitionRef = string;

export type SubjectVisualPrimitiveV1 =
  | { kind: "capsule"; radiusMeters: number; heightMeters: number }
  | { kind: "box"; sizeMetersXYZ: readonly [number, number, number] }
  | { kind: "sphere"; radiusMeters: number }
  | { kind: "cylinder"; radiusMeters: number; heightMeters: number };

export interface SubjectVisualPartV1 {
  id: string;
  primitive: SubjectVisualPrimitiveV1;
  localPositionMeters: readonly [number, number, number];
  localRotationEulerRadiansXYZ: readonly [number, number, number];
}

export interface SubjectKitDefinitionV1 {
  id: string;
  version: number;
  kitRef: SubjectDefinitionRef;
  category: "human" | "animal" | "vehicle" | "furniture" | "machine" | "custom";
  bodyTopology: string;
  semanticClassId: string;
  visualParts: readonly SubjectVisualPartV1[];
  collider: {
    kind: "capsule";
    radiusMeters: number;
    heightMeters: number;
    massKilograms: number;
    maxSlopeDegrees: number;
    maxStepHeightMeters: number;
  };
  locomotion: {
    mode: "ground";
    groundSpeedMetersPerSecond: number;
    waterSpeedMetersPerSecond: number;
    jumpSpeedMetersPerSecond: number;
  };
  resourceCost: {
    vertices: number;
    triangles: number;
    colliders: number;
  };
}

export interface SubjectDefinitionRegistryV1 {
  resolve(subjectDefinitionRef: SubjectDefinitionRef): SubjectKitDefinitionV1 | undefined;
  list(): readonly SubjectKitDefinitionV1[];
}
