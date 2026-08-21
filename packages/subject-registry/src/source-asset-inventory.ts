import vehicleSourceFbxCatalog from "../../../assets/subjects/source-fbx/vehicles/catalog.json";

export type SourceAssetCoarseClassV1 =
  | "aerial-vehicle"
  | "board-vehicle"
  | "four-wheel-vehicle"
  | "quadruped-ridable"
  | "two-wheel-vehicle";

export interface SourceFbxAssetInventoryEntryV1 {
  readonly sourceId: string;
  readonly originalRelativePath: string;
  readonly repositoryRelativePath: string;
  readonly byteLength: number;
  readonly contentHash: `sha256:${string}`;
  readonly coarseClass: SourceAssetCoarseClassV1;
  readonly format: "fbx";
  readonly runtimeStatus: "source-only";
  readonly conversionRequired: true;
}

export const sourceFbxVehicleAssetInventory = Object.freeze(
  vehicleSourceFbxCatalog.map((entry) =>
    Object.freeze(entry as SourceFbxAssetInventoryEntryV1),
  ),
);
