import { isEqual, isNil } from "lodash-es";

import {
  assembleWorldPackageDirectoryV2,
  verifyWorldPackageDirectoryV2,
  type VerifiedWorldPackageDirectoryV2,
  type WorldPackageDirectoryV2,
} from "./v2-directory.js";
import type { WorldPackageBuildReceiptV2 } from "./v2-types.js";
import type { WorldPackageSha256HashV1 } from "./types.js";

const WORLD_PACKAGE_REF_PATTERN =
  /^package:\/\/world-package\/sha256\/([a-f0-9]{64})$/;
const WORLD_PACKAGE_HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const ZERO_HASH = `sha256:${"0".repeat(64)}`;
const TRANSPORT_METADATA_PATHS = new Set([
  "integrity.json",
  "world-package-build-receipt.json",
]);

export type WorldPackageRefV1 =
  `package://world-package/sha256/${string}`;

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

function refFail(message: string): never {
  throw new Error(`WORLD_PACKAGE_REF_INVALID: ${message}`);
}

export function worldPackageRefFromRootHashV1(
  value: WorldPackageSha256HashV1,
): WorldPackageRefV1 {
  if (
    typeof value !== "string" ||
    !WORLD_PACKAGE_HASH_PATTERN.test(value) ||
    value === ZERO_HASH
  ) {
    refFail("Package Root must be one non-zero lowercase sha256 hash");
  }
  return `package://world-package/sha256/${value.slice(7)}`;
}

export function worldPackageRootHashFromRefV1(
  value: unknown,
): WorldPackageSha256HashV1 {
  if (typeof value !== "string") {
    refFail("Ref must be a canonical string");
  }
  const match = WORLD_PACKAGE_REF_PATTERN.exec(value);
  if (isNil(match) || match[1] === "0".repeat(64)) {
    refFail("Ref must use package://world-package/sha256/<64-lowercase-hex>");
  }
  return `sha256:${match[1]}` as WorldPackageSha256HashV1;
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
