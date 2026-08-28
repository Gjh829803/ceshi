import { isEqual, isNil } from "lodash-es";

import {
  worldPackageRootHashFromRefV1,
  type WorldPackageRefV1,
} from "@whitebox-world/world-identity";

import {
  assembleWorldPackageDirectoryV2,
  verifyWorldPackageDirectoryV2,
  type VerifiedWorldPackageDirectoryV2,
  type WorldPackageDirectoryV2,
} from "./v2-directory.js";
import type { WorldPackageBuildReceiptV2 } from "./v2-types.js";
const TRANSPORT_METADATA_PATHS = new Set([
  "integrity.json",
  "world-package-build-receipt.json",
]);

export interface WorldPackageStorePutResultV1 {
  readonly worldPackageRef: WorldPackageRefV1;
  readonly receipt: WorldPackageBuildReceiptV2;
}

export interface WorldPackageStoreV1 {
  readonly brand: "WorldPackageStoreV1";
  put(directory: WorldPackageDirectoryV2): Promise<WorldPackageStorePutResultV1>;
  get(
    worldPackageRef: WorldPackageRefV1,
  ): Promise<VerifiedWorldPackageDirectoryV2 | undefined>;
}

export function canonicalWorldPackageDirectoryForStoreV1(
  directory: WorldPackageDirectoryV2,
): WorldPackageDirectoryV2 {
  try {
    return assembleWorldPackageDirectoryV2({
      receipt: directory.receipt,
      files: directory.files.filter((file) =>
        !TRANSPORT_METADATA_PATHS.has(file.path)
      ),
      signatureFiles: directory.signatureFiles,
    });
  } catch {
    throw new Error(
      "WORLD_PACKAGE_STORE_CORRUPT: directory failed trusted V2 verification",
    );
  }
}

export function assertWorldPackageStoreRefMatchesDirectoryV1(
  worldPackageRef: WorldPackageRefV1,
  directory: WorldPackageDirectoryV2,
): void {
  const expectedRoot = worldPackageRootHashFromRefV1(worldPackageRef);
  if (directory.receipt.worldPackageRootHash !== expectedRoot) {
    throw new Error(
      "WORLD_PACKAGE_STORE_REF_MISMATCH: Ref does not match the verified Package Root",
    );
  }
}

export function equalWorldPackageDirectoryBytesV1(
  left: WorldPackageDirectoryV2,
  right: WorldPackageDirectoryV2,
): boolean {
  return isEqual(left, right);
}
