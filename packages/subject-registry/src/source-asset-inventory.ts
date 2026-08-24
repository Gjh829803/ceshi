import vehicleSourceFbxCatalog from "../../../assets/subjects/source-fbx/vehicles/catalog.json";
import xier120SourceFbxCatalog from "../../../assets/subjects/source-fbx/contributors/xier120/catalog.json";

export type SourceAssetCoarseClassV1 =
  | "aerial-vehicle"
  | "biped-animal"
  | "board-vehicle"
  | "four-wheel-vehicle"
  | "quadruped-animal"
  | "quadruped-reptile"
  | "quadruped-ridable"
  | "rider-aerial-composition"
  | "rider-animal-composition"
  | "rider-board-composition"
  | "snake-animal"
  | "three-wheel-vehicle"
  | "tracked-vehicle"
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

export interface ContributorSourceFbxAssetInventoryEntryV1
  extends SourceFbxAssetInventoryEntryV1 {
  readonly sourceId: `${string}.${string}`;
  readonly creatorId: string;
  readonly authorship: "independent-original-model";
}

const contributorCatalogs = [xier120SourceFbxCatalog] as const;

export const sourceFbxContributorAssetInventory = Object.freeze(
  contributorCatalogs.flatMap((catalog) =>
    catalog.map((entry) =>
      Object.freeze(entry as ContributorSourceFbxAssetInventoryEntryV1),
    ),
  ),
);
