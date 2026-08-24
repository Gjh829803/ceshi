import type {
  AuthoringResult,
  NormalizedWorldResourcesV2,
  PrimitivePrototypeSpecV2,
  PrototypeTraversalSurfaceBindingV1,
} from "./types.js";
import type {
  AuthoringSpecV3,
  NormalizeAuthoringOptionsV3,
  NormalizeAuthoringResultV3,
  NormalizedWorldIRV3,
  PlacementConstraintSpecV1,
} from "./types-v3.js";

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

export interface NormalizedWorldResourcesV4
  extends Omit<NormalizedWorldResourcesV2, "prototypes"> {
  readonly prototypes: readonly PrimitivePrototypeSpecV4[];
}

export interface AuthoringSpecV4 extends Omit<
  AuthoringSpecV3,
  "schemaVersion" | "resources" | "spatial" | "constraints"
> {
  readonly schemaVersion: 4;
  readonly resources: Omit<AuthoringSpecV3["resources"], "prototypes"> & {
    readonly prototypes: readonly PrimitivePrototypeSpecV4[];
  };
  readonly spatial: AuthoringSpecV3["spatial"] & Readonly<{
    traversalAreas: readonly TraversalAreaSpecV1[];
  }>;
  readonly constraints: {
    readonly placements: readonly PlacementConstraintSpecV1[];
    readonly connectivity: readonly ConnectivityConstraintSpecV1[];
  };
}

export type NormalizedConnectivityRequirementV1 = Readonly<{
  constraintId: string;
  kind: "connected-by-route";
  traversingEntityId: string;
  startAnchorEntityId: string;
  destinationAnchorEntityId: string;
  routeId: string;
}>;

export interface NormalizedWorldIRV4
  extends Omit<NormalizedWorldIRV3, "schemaVersion" | "resources" | "layout"> {
  readonly schemaVersion: 4;
  readonly authoringSpecHash: `sha256:${string}`;
  readonly resources: NormalizedWorldResourcesV4;
  readonly layout: NormalizedWorldIRV3["layout"] & Readonly<{
    traversalAreas: readonly TraversalAreaSpecV1[];
    connectivityRequirements: readonly NormalizedConnectivityRequirementV1[];
  }>;
}

export interface NormalizeAuthoringResultV4
  extends AuthoringResult<NormalizedWorldIRV4> {
  readonly normalizedWorldIrHash?: `sha256:${string}`;
  readonly layoutSolveReport?: NormalizeAuthoringResultV3["layoutSolveReport"];
  readonly layoutSolveReportHash?: `sha256:${string}`;
}

export type NormalizeAuthoringOptionsV4 = NormalizeAuthoringOptionsV3;
