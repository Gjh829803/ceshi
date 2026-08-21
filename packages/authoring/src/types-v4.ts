import type { AuthoringSpecV3, PlacementConstraintSpecV1 } from "./types-v3.js";

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
