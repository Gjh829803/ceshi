import type {
  ResolvedPlacementConstraintV1,
} from "@whitebox-world/layout-solver";
import type {
  AnchorNodeSpecV2,
  CameraNodeSpecV2,
  ObjectNodeSpecV2,
  TransformSpecV2,
  Vec2,
  WorldNodeSpecV2,
  NormalizedWorldNodeV2,
} from "./types.js";

export type TransformSpecV3 = TransformSpecV2;

export type PlacementSpecV1 =
  | Readonly<{
      kind: "fixed";
      transform: TransformSpecV3;
    }>
  | Readonly<{
      kind: "solved";
      initialTransform?: TransformSpecV3;
      placementConstraintIds: readonly string[];
    }>;

export type ObjectNodeSpecV3 = Omit<ObjectNodeSpecV2, "transform"> & {
  placement: PlacementSpecV1;
};

export type AnchorNodeSpecV3 = Omit<AnchorNodeSpecV2, "transform"> & {
  placement: PlacementSpecV1;
};

export interface CameraNodeSpecV3 extends Omit<CameraNodeSpecV2, "components"> {
  components: {
    cameraRig: Omit<CameraNodeSpecV2["components"]["cameraRig"], "thirdPerson"> & {
      thirdPerson: CameraNodeSpecV2["components"]["cameraRig"]["thirdPerson"] & {
        aspectRatio: number;
      };
    };
  };
}

export type WorldNodeSpecV3 =
  | Exclude<WorldNodeSpecV2, ObjectNodeSpecV2 | AnchorNodeSpecV2 | CameraNodeSpecV2>
  | ObjectNodeSpecV3
  | AnchorNodeSpecV3
  | CameraNodeSpecV3;

export interface SpatialRegionSpecV1 {
  readonly id: string;
  readonly kind: "polygon-xz";
  readonly pointsMetersXZ: readonly Vec2[];
  readonly minimumHeightMeters?: number;
  readonly maximumHeightMeters?: number;
  readonly semanticClassId: string;
}

export interface RouteSpecV1 {
  readonly id: string;
  readonly kind: "polyline-xz";
  readonly pointsMetersXZ: readonly Vec2[];
  readonly widthMeters: number;
  readonly locomotionProfileRef: string;
}

export interface ScreenRegionSpecV1 {
  readonly id: string;
  readonly kind: "rectangle-uv";
  readonly minimumUv: readonly [u: number, v: number];
  readonly maximumUv: readonly [u: number, v: number];
}

type RequiredConstraintV1 = Readonly<{
  requirement: "required";
  preferenceWeightRatio?: never;
}>;

type PreferredConstraintV1 = Readonly<{
  requirement: "preferred";
  preferenceWeightRatio: number;
}>;

type ConstraintRequirementV1 = RequiredConstraintV1 | PreferredConstraintV1;

type ConstraintBaseV1 = Readonly<{ id: string }> & ConstraintRequirementV1;

export type PlacementConstraintSpecV1 = ConstraintBaseV1 &
  (
    | Readonly<{
        kind: "inside-region";
        entityId: string;
        regionId: string;
        boundaryClearanceMeters: number;
      }>
    | Readonly<{
        kind: "outside-region";
        entityId: string;
        regionId: string;
        boundaryClearanceMeters: number;
      }>
    | Readonly<{
        kind: "distance-range";
        entityId: string;
        referenceEntityId: string;
        minimumDistanceMeters: number;
        maximumDistanceMeters: number;
      }>
    | Readonly<{
        kind: "faces-entity";
        facingEntityId: string;
        targetEntityId: string;
        maximumAngularDeviationDegrees: number;
      }>
    | Readonly<{
        kind: "supported-by";
        supportedEntityId: string;
        supportingEntityId: string;
        maximumSupportGapMeters: number;
        minimumSupportRatio: number;
      }>
    | (Readonly<{
        kind: "minimum-clearance";
        entityId: string;
        clearanceMeters: number;
      }> &
        (
          | Readonly<{
              otherEntityIds: readonly string[];
              semanticClassIds?: never;
            }>
          | Readonly<{
              semanticClassIds: readonly string[];
              otherEntityIds?: never;
            }>
        ))
    | (Readonly<{
        kind: "within-slope-limit";
        terrainEntityId: string;
        maximumSlopeDegrees: number;
      }> &
        (
          | Readonly<{ entityId: string; routeId?: never }>
          | Readonly<{ routeId: string; entityId?: never }>
        ))
    | Readonly<{
        kind: "visible-in-camera-region";
        visibleEntityId: string;
        cameraEntityId: string;
        screenRegionId: string;
        minimumVisibleRatio: number;
        minimumProjectedAreaRatio: number;
      }>
  );

export interface NormalizedPlacementProvenanceV1 {
  readonly kind: "fixed" | "solved";
  readonly candidateId: string;
  readonly placementConstraintIds: readonly string[];
  readonly solverProfileRef: string;
  readonly layoutSolveReportHash: `sha256:${string}`;
}

type NormalizeAssertionV1<Constraint> = Constraint extends {
  readonly id: string;
  readonly kind: string;
}
  ? Omit<Constraint, "id" | "requirement" | "preferenceWeightRatio"> &
      Readonly<{
        constraintId: string;
        evidenceEntityIds: readonly string[];
        measurements: Readonly<Record<string, number | boolean | string>>;
        tolerances: Readonly<Record<string, number>>;
      }>
  : never;

export type NormalizedLayoutAssertionV1 = NormalizeAssertionV1<
  ResolvedPlacementConstraintV1
>;

export type NormalizedWorldNodeV3 =
  | Exclude<
      NormalizedWorldNodeV2,
      Extract<NormalizedWorldNodeV2, { kind: "object" | "anchor" | "camera" }>
    >
  | (Extract<NormalizedWorldNodeV2, { kind: "object" | "anchor" }> & {
      placementProvenance: NormalizedPlacementProvenanceV1;
    })
  | CameraNodeSpecV3;
