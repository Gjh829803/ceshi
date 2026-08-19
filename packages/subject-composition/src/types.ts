export type Vec3 = readonly [x: number, y: number, z: number];

export type CompositionPrimitiveV1 =
  | { kind: "box"; sizeMetersXYZ: Vec3 }
  | { kind: "sphere"; radiusMeters: number }
  | { kind: "cylinder"; radiusMeters: number; heightMeters: number }
  | { kind: "capsule"; radiusMeters: number; heightMeters: number };

export interface ColliderSourcePartV1 {
  id: string;
  shape: CompositionPrimitiveV1;
  localPositionMetersXYZ: Vec3;
  localRotationEulerRadiansXYZ: Vec3;
}

export interface CompositionBoundsV1 {
  minimumMetersXYZ: Vec3;
  maximumMetersXYZ: Vec3;
}

export interface DerivedVerticalCharacterCapsuleV1 {
  kind: "capsule";
  radiusMeters: number;
  heightMeters: number;
  centerOffsetFromSubjectOriginMetersXYZ: Vec3;
}

export interface SubjectCompositionIssueV1 {
  code:
    | "SUBJECT_COMPOSITION_EMPTY"
    | "SUBJECT_PRIMITIVE_INVALID"
    | "SUBJECT_SUPPORT_ORIGIN_INVALID";
  message: string;
  partIds: readonly string[];
  details?: Readonly<Record<string, unknown>>;
}

export type DeriveVerticalCharacterCapsuleResultV1 =
  | {
      ok: true;
      collider: DerivedVerticalCharacterCapsuleV1;
      bounds: CompositionBoundsV1;
    }
  | { ok: false; issues: readonly SubjectCompositionIssueV1[] };

export interface PrimitiveResourceCostV1 {
  vertices: number;
  triangles: number;
  colliders: 1;
}
