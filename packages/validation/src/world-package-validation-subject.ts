import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { hashExecutionPlanV5 } from "@whitebox-world/runtime-contracts";
import {
  assertWorldPackageBuildReceiptV2,
  assertWorldPackageGameplayBootstrapMembershipV2,
  type VerifiedWorldPackageDirectoryV2,
  type WorldPackageSha256HashV1,
} from "@whitebox-world/world-package";
import { isEqual, isNil, isPlainObject } from "lodash-es";

import type { WorldPackageValidationSubjectV1 } from "./types-v2.js";

function fail(message: string): never {
  throw new Error(`WORLD_PACKAGE_VALIDATION_SUBJECT_INPUT_INVALID: ${message}`);
}

function asHash(value: string): WorldPackageSha256HashV1 {
  return value as WorldPackageSha256HashV1;
}

/**
 * Projects Validation identity only from the provider-neutral verified package
 * result. Validation never accepts a caller-assembled Receipt/hash/artifact bag.
 */
export function createWorldPackageValidationSubjectV1(
  verified: VerifiedWorldPackageDirectoryV2,
): WorldPackageValidationSubjectV1 {
  if (isNil(verified) || !isPlainObject(verified)) {
    fail("VerifiedWorldPackageDirectoryV2 is required");
  }
  const possibleLegacy = verified as unknown as Record<string, unknown>;
  const legacyReceipt = possibleLegacy.worldPackageBuildReceipt;
  if (
    !isNil(legacyReceipt) &&
    isPlainObject(legacyReceipt) &&
    (legacyReceipt as Record<string, unknown>).schemaVersion === 1
  ) {
    throw new Error(
      "WORLD_PACKAGE_VERSION_UNSUPPORTED: Validation requires WorldPackage V2",
    );
  }
  let receipt;
  try {
    receipt = assertWorldPackageBuildReceiptV2(verified.receipt);
    assertWorldPackageGameplayBootstrapMembershipV2({
      executionPlan: verified.executionPlan,
      gameplayBootstrap: verified.gameplayBootstrap,
      worldPackageBuildReceipt: receipt,
    });
  } catch {
    return fail("verified Receipt, Plan, or Gameplay Bootstrap binding is invalid");
  }
  const manifest = receipt.manifest;
  if (
    hashExecutionPlanV5(verified.executionPlan) !== manifest.executionPlanHash ||
    sha256CanonicalJson(verified.normalizedWorldIr) !==
      manifest.normalizedWorldIrHash ||
    sha256CanonicalJson(verified.registryLock) !== manifest.registryLockHash ||
    !isEqual(verified.registryLock, manifest.lockedResources) ||
    verified.normalizedWorldIr.authoringSpecHash !== manifest.authoringSpecHash ||
    verified.executionPlan.normalizedWorldIrHash !==
      manifest.normalizedWorldIrHash ||
    verified.executionPlan.layout.layoutSolveReportHash !==
      manifest.layoutSolveReportHash
  ) {
    fail("verified package identity closure drifted");
  }
  return Object.freeze({
    kind: "world-package",
    worldPackageRootHash: receipt.worldPackageRootHash,
    authoringSpecHash: asHash(manifest.authoringSpecHash),
    normalizedWorldIrHash: asHash(manifest.normalizedWorldIrHash),
    executionPlanHash: asHash(manifest.executionPlanHash),
    resourceLockHash: asHash(manifest.registryLockHash),
    layoutSolveReportHash: asHash(manifest.layoutSolveReportHash),
  });
}
