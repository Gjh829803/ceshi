import { isEqual, isNil } from "lodash-es";

import {
  worldPackageRootHashFromRefV1,
  type WorldPackageRefV1,
} from "@whitebox-world/world-identity";

import {
  assembleWorldPackageDirectoryV1,
  verifyWorldPackageDirectoryV1,
  type VerifiedWorldPackageDirectoryV1,
  type WorldPackageDirectoryV1,
} from "./package-directory.js";
import type { WorldPackageBuildReceiptV1 } from "./package-types.js";
const TRANSPORT_METADATA_PATHS = new Set([
  "integrity.json",
  "world-package-build-receipt.json",
  "world-build-identity.json",
]);

export interface WorldPackageStorePutResultV1 {
  readonly worldPackageRef: WorldPackageRefV1;
  readonly receipt: WorldPackageBuildReceiptV1;
}

export interface WorldPackageStoreV1 {
  readonly brand: "WorldPackageStoreV1";
  put(directory: WorldPackageDirectoryV1): Promise<WorldPackageStorePutResultV1>;
  get(
    worldPackageRef: WorldPackageRefV1,
  ): Promise<VerifiedWorldPackageDirectoryV1 | undefined>;
}

export function canonicalizeWorldPackageDirectoryForStoreV1(
  directory: WorldPackageDirectoryV1,
): WorldPackageDirectoryV1 {
  try {
    return assembleWorldPackageDirectoryV1({
      receipt: directory.receipt,
      files: directory.files.filter((file) =>
        !TRANSPORT_METADATA_PATHS.has(file.path)
      ),
      signatureFiles: directory.signatureFiles,
    });
  } catch {
    throw new Error(
      "WORLD_PACKAGE_STORE_CORRUPT: directory failed trusted verification",
    );
  }
}

export function assertWorldPackageStoreRefMatchesDirectoryV1(
  worldPackageRef: WorldPackageRefV1,
  directory: WorldPackageDirectoryV1,
): void {
  const expectedRoot = worldPackageRootHashFromRefV1(worldPackageRef);
  if (directory.receipt.worldPackageRootHash !== expectedRoot) {
    throw new Error(
      "WORLD_PACKAGE_STORE_REF_MISMATCH: Ref does not match the verified Package Root",
    );
  }
}

export function equalWorldPackageDirectoryBytesV1(
  left: WorldPackageDirectoryV1,
  right: WorldPackageDirectoryV1,
): boolean {
  return isEqual(left, right);
}
