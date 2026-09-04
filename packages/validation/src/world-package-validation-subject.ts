import type { Sha256HashV1 } from "@whitebox-world/protocol";

import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { hashCanonicalSceneExecutionPlanV1 } from "@whitebox-world/runtime-contracts";
import {
  assertWorldPackageBuildReceiptV1,
  assertCanonicalWorldPackageGameplayBootstrapMembershipV1,
  type VerifiedWorldPackageDirectoryV1,
} from "@whitebox-world/world-package";
import { isEqual, isNil, isPlainObject } from "lodash-es";

import type { WorldPackageValidationSubjectV1 } from "./world-package-validation-types.js";

function fail(message: string): never {
  throw new Error(`WORLD_PACKAGE_VALIDATION_SUBJECT_INPUT_INVALID: ${message}`);
}

function asHash(value: string): Sha256HashV1 {
  return value as Sha256HashV1;
}

/**
 * Projects Validation identity only from the provider-neutral verified package
 * result. Validation never accepts a caller-assembled Receipt/hash/artifact bag.
 */
export function createWorldPackageValidationSubjectV1(
  verified: VerifiedWorldPackageDirectoryV1,
): WorldPackageValidationSubjectV1 {
  if (isNil(verified) || !isPlainObject(verified)) {
    fail("VerifiedWorldPackageDirectoryV1 is required");
  }
  if (verified.kind !== "canonical-execution-plan") {
    fail("Canonical verified WorldPackage is required");
  }
  let receipt;
  try {
    receipt = assertWorldPackageBuildReceiptV1(verified.receipt);
    assertCanonicalWorldPackageGameplayBootstrapMembershipV1({
      canonicalSceneExecutionPlan: verified.executionPlan,
      gameplayBootstrap: verified.gameplayBootstrap,
      worldRuntimeBootstrap: verified.worldRuntimeBootstrap,
      worldPackageBuildReceipt: receipt,
    });
  } catch {
    return fail("verified Receipt, Scene Plan, Runtime Bootstrap, or Gameplay Bootstrap binding is invalid");
  }
  const manifest = verified.receipt.manifest;
  const sceneSource = manifest.sceneSource;
  if (
    hashCanonicalSceneExecutionPlanV1(verified.executionPlan) !== sceneSource.executionPlanHash ||
    sha256CanonicalJson(verified.normalizedWorldIr) !==
      sceneSource.normalizedWorldIrHash ||
    sha256CanonicalJson(verified.registryLock) !== manifest.registryLockHash ||
    !isEqual(verified.registryLock, manifest.lockedResources) ||
    verified.normalizedWorldIr.authoringSpecHash !== sceneSource.authoringSpecHash ||
    verified.executionPlan.normalizedWorldIrHash !==
      sceneSource.normalizedWorldIrHash ||
    verified.executionPlan.layout.layoutSolveReportHash !==
      sceneSource.layoutSolveReportHash
  ) {
    fail("verified package identity closure drifted");
  }
  return Object.freeze({
    kind: "world-package",
    worldPackageRootHash: receipt.worldPackageRootHash,
    authoringSpecHash: asHash(sceneSource.authoringSpecHash),
    normalizedWorldIrHash: asHash(sceneSource.normalizedWorldIrHash),
    worldBuildIdentityHash: receipt.worldBuildIdentityHash,
    resourceLockHash: asHash(manifest.registryLockHash),
    layoutSolveReportHash: asHash(sceneSource.layoutSolveReportHash),
  });
}
