import type { AuthoringResult } from "./types.js";
import type {
  AuthoringSpecV3,
  NormalizeAuthoringOptionsV3,
  NormalizeAuthoringResultV3,
  NormalizedWorldIRV3,
  PlacementConstraintSpecV1,
} from "./types-v3.js";

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

export interface AuthoringSpecV4 extends Omit<AuthoringSpecV3, "schemaVersion" | "constraints"> {
  readonly schemaVersion: 4;
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
  extends Omit<NormalizedWorldIRV3, "schemaVersion" | "layout"> {
  readonly schemaVersion: 4;
  readonly authoringSpecHash: `sha256:${string}`;
  readonly layout: NormalizedWorldIRV3["layout"] & Readonly<{
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
