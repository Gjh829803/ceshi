import type {
  LayoutHeightfieldV1,
  LayoutSolveReportV1,
  ResolvedPlacementConstraintV1,
} from "@whitebox-world/layout-solver";
import type { Sha256HashV1 } from "@whitebox-world/protocol";

import type {
  AnchorNodeSpecV2,
  AuthoringDocumentBase,
  AuthoringResult,
  CameraNodeSpecV2,
  NormalizeAuthoringOptions,
  NormalizedWorldBase,
  NormalizedWorldNodeV2,
  NormalizedWorldResourcesV2,
  ObjectNodeSpecV2,
  PrimitivePrototypeSpecV2,
  PrototypeTraversalSurfaceBindingV1,
  TransformSpecV2,
  Vec2,
  WorldNodeSpecV2,
} from "./types.js";

export type TransformSpecV4 = TransformSpecV2;

export type PlacementSpecV1 =
  | Readonly<{ kind: "fixed"; transform: TransformSpecV4 }>
  | Readonly<{
      kind: "solved";
      initialTransform?: TransformSpecV4;
      placementConstraintIds: readonly string[];
    }>;

export type ObjectNodeSpecV4 = Omit<ObjectNodeSpecV2, "transform"> & {
  placement: PlacementSpecV1;
};

export type AnchorNodeSpecV4 = Omit<AnchorNodeSpecV2, "transform"> & {
  placement: PlacementSpecV1;
};

export interface CameraNodeSpecV4 extends Omit<CameraNodeSpecV2, "components"> {
  components: {
    cameraRig: Omit<CameraNodeSpecV2["components"]["cameraRig"], "thirdPerson"> & {
      thirdPerson: CameraNodeSpecV2["components"]["cameraRig"]["thirdPerson"] & {
        aspectRatio: number;
      };
    };
  };
}

export type WorldNodeSpecV4 =
  | Exclude<WorldNodeSpecV2, ObjectNodeSpecV2 | AnchorNodeSpecV2 | CameraNodeSpecV2>
  | ObjectNodeSpecV4
  | AnchorNodeSpecV4
  | CameraNodeSpecV4;

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

type ConstraintBaseV1 = Readonly<{ id: string }> &
  (RequiredConstraintV1 | PreferredConstraintV1);

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
          | Readonly<{ otherEntityIds: readonly string[]; semanticClassIds?: never }>
          | Readonly<{ semanticClassIds: readonly string[]; otherEntityIds?: never }>
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

export type TraversalAreaSpecV1 = Readonly<{
  id: string;
  kind: "polygon-xz";
  pointsMetersXZ: readonly (readonly [number, number])[];
  surfaceEntityId: string;
  mode: "blocked";
}>;

export type ConnectedByRouteConstraintV1 = Readonly<{
  id: string;
  kind: "connected-by-route";
  requirement: "required";
  preferenceWeightRatio?: never;
  traversingEntityId: string;
  startAnchorEntityId: string;
  destinationAnchorEntityId: string;
  routeId: string;
}>;

export type ConnectivityConstraintSpecV1 = ConnectedByRouteConstraintV1;

export type PrimitivePrototypeSpecV4 = PrimitivePrototypeSpecV2 & Readonly<{
  traversalSurfaceBindings?: readonly PrototypeTraversalSurfaceBindingV1[];
}>;

export interface AuthoringSpecV4 extends AuthoringDocumentBase {
  schemaVersion: 4;
  layout: { solverProfileRef: string };
  spatial: {
    regions: SpatialRegionSpecV1[];
    routes: RouteSpecV1[];
    screenRegions: ScreenRegionSpecV1[];
    traversalAreas: TraversalAreaSpecV1[];
  };
  resources: Omit<AuthoringDocumentBase["resources"], "prototypes"> & {
    prototypes: readonly PrimitivePrototypeSpecV4[];
  };
  nodes: WorldNodeSpecV4[];
  constraints: {
    placements: PlacementConstraintSpecV1[];
    connectivity: ConnectivityConstraintSpecV1[];
  };
}

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

export type NormalizedWorldNodeV4 =
  | Exclude<
      NormalizedWorldNodeV2,
      Extract<NormalizedWorldNodeV2, { kind: "object" | "anchor" | "camera" }>
    >
  | (Extract<NormalizedWorldNodeV2, { kind: "object" | "anchor" }> & {
      placementProvenance: NormalizedPlacementProvenanceV1;
    })
  | CameraNodeSpecV4;

export interface NormalizedWorldResourcesV4
  extends Omit<NormalizedWorldResourcesV2, "prototypes"> {
  readonly prototypes: readonly PrimitivePrototypeSpecV4[];
}

export type NormalizedConnectivityRequirementV1 = Readonly<{
  constraintId: string;
  kind: "connected-by-route";
  traversingEntityId: string;
  startAnchorEntityId: string;
  destinationAnchorEntityId: string;
  routeId: string;
}>;

export interface NormalizedWorldIRV4 {
  readonly kind: "worldkit-normalized-world";
  readonly schemaVersion: 4;
  readonly id: string;
  readonly seed: number;
  readonly provenance?: AuthoringDocumentBase["provenance"];
  readonly world: AuthoringDocumentBase["world"];
  readonly authoringSpecHash: `sha256:${string}`;
  readonly resources: NormalizedWorldResourcesV4;
  readonly nodes: readonly NormalizedWorldNodeV4[];
  readonly relationships: NormalizedWorldBase["relationships"];
  readonly startup: AuthoringDocumentBase["startup"];
  readonly layout: Readonly<{
    solverProfileRef: string;
    resolvedVersion: string;
    solverProfileHash: `sha256:${string}`;
    layoutSolveReportHash: `sha256:${string}`;
    regions: readonly SpatialRegionSpecV1[];
    routes: readonly RouteSpecV1[];
    screenRegions: readonly ScreenRegionSpecV1[];
    heightfields: readonly LayoutHeightfieldV1[];
    assertions: readonly NormalizedLayoutAssertionV1[];
    traversalAreas: readonly TraversalAreaSpecV1[];
    connectivityRequirements: readonly NormalizedConnectivityRequirementV1[];
  }>;
}

export interface NormalizeAuthoringResultV4
  extends AuthoringResult<NormalizedWorldIRV4> {
  readonly normalizedWorldIrHash?: `sha256:${string}`;
  readonly layoutSolveReport?: LayoutSolveReportV1;
  readonly layoutSolveReportHash?: `sha256:${string}`;
}

export type NormalizeAuthoringOptionsV4 = NormalizeAuthoringOptions;

export interface NormalizeAuthoringBaseV4Result
  extends AuthoringResult<NormalizedWorldBase> {
  normalizedWorldIrHash?: Sha256HashV1;
}
