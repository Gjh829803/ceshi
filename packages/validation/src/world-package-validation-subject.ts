import {
  hashAuthoringDocumentV4,
  hashAuthoringLayoutInputV4,
  normalizeAuthoringSpecV4,
  projectNormalizedWorldResourcesToLayoutIdentityV4,
  validateAuthoringSpecV4,
  type AuthoringSpecV4,
  type NormalizedWorldIRV4,
} from "@whitebox-world/authoring";
import { compileWorldV5 } from "@whitebox-world/compiler";
import {
  createGameplayBootstrapResourceLockEntryV1,
  parseGameplayBootstrapV1,
  type GameplayBootstrapV1,
} from "@whitebox-world/gameplay-contracts";
import {
  hashLayoutSolveReportV1,
  type LayoutSolveResultV1,
} from "@whitebox-world/layout-solver";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import {
  canonicalExecutionResourceLockEntriesV1,
  type ExecutionPlanV5,
} from "@whitebox-world/runtime-contracts";
import {
  assertWorldPackageAccessorFreeDataGraphV1,
  assertWorldPackageBuildReceiptClosureV1,
  assertWorldPackageBuildReceiptV1,
  assertWorldPackageGameplayBootstrapMembershipV1,
  type WorldPackageBuildReceiptV1,
  type WorldPackageSha256HashV1,
} from "@whitebox-world/world-package";
import { isEqual, isNil, isPlainObject } from "lodash-es";

import type { WorldPackageValidationSubjectV1 } from "./types-v2.js";

type UnknownRecord = Record<string, unknown>;

const INPUT_FIELDS = [
  "worldPackageBuildReceipt",
  "authoringSpec",
  "normalizedWorldIr",
  "layoutSolveResult",
  "executionPlan",
  "gameplayBootstrap",
] as const;

export interface CreateWorldPackageValidationSubjectInputV1 {
  readonly worldPackageBuildReceipt: WorldPackageBuildReceiptV1;
  readonly authoringSpec: AuthoringSpecV4;
  readonly normalizedWorldIr: NormalizedWorldIRV4;
  readonly layoutSolveResult: LayoutSolveResultV1;
  readonly executionPlan: ExecutionPlanV5;
  readonly gameplayBootstrap: GameplayBootstrapV1;
}

function fail(path: string, message: string): never {
  throw new Error(
    `WORLD_PACKAGE_VALIDATION_SUBJECT_INPUT_INVALID: ${
      path.length === 0 ? message : `${path}: ${message}`
    }`,
  );
}

function exactInputRecord(value: unknown): UnknownRecord {
  if (isNil(value) || !isPlainObject(value)) {
    fail("", "expected a plain object");
  }
  const record = value as UnknownRecord;
  const allowedFields = new Set<string>(INPUT_FIELDS);
  const unknownField = Object.keys(record).find(
    (field) => !allowedFields.has(field),
  );
  if (!isNil(unknownField)) {
    fail("", `unknown field '${unknownField}'`);
  }
  for (const field of INPUT_FIELDS) {
    if (!Object.hasOwn(record, field) || isNil(record[field])) {
      fail("", `missing field '${field}'`);
    }
  }
  return record;
}

function requireEqual(actual: unknown, expected: unknown, path: string): void {
  if (!isEqual(actual, expected)) {
    fail(path, "canonical binding mismatch");
  }
}

function asHash(value: string): WorldPackageSha256HashV1 {
  return value as WorldPackageSha256HashV1;
}

function snapshotInput(
  input: CreateWorldPackageValidationSubjectInputV1,
): CreateWorldPackageValidationSubjectInputV1 {
  assertWorldPackageAccessorFreeDataGraphV1(
    input,
    "WORLD_PACKAGE_VALIDATION_SUBJECT_INPUT_ACCESSOR_FORBIDDEN",
  );
  exactInputRecord(input);
  try {
    return structuredClone(input);
  } catch {
    fail("", "input must be a cloneable canonical data graph");
  }
}

/**
 * Joins one validated WorldPackage build receipt to the real V4/V5 build
 * artifacts that produced it. This is the only supported assembly boundary for
 * a WorldPackageValidationSubjectV1; callers cannot supply a root or hash bag.
 */
export function createWorldPackageValidationSubjectV1(
  input: CreateWorldPackageValidationSubjectInputV1,
): WorldPackageValidationSubjectV1 {
  const snapshot = snapshotInput(input);

  let receipt: WorldPackageBuildReceiptV1;
  try {
    receipt = assertWorldPackageBuildReceiptV1(
      snapshot.worldPackageBuildReceipt,
    );
  } catch {
    fail(
      "worldPackageBuildReceipt",
      "must be a canonical WorldPackageBuildReceiptV1",
    );
  }

  const validated = validateAuthoringSpecV4(snapshot.authoringSpec);
  if (!validated.ok || isNil(validated.value)) {
    fail("authoringSpec", "must be a valid AuthoringSpecV4");
  }
  requireEqual(
    snapshot.authoringSpec,
    validated.value,
    "authoringSpec",
  );

  const normalized = normalizeAuthoringSpecV4(validated.value);
  if (
    !normalized.ok ||
    isNil(normalized.value) ||
    isNil(normalized.normalizedWorldIrHash) ||
    isNil(normalized.layoutSolveReport) ||
    isNil(normalized.layoutSolveReportHash)
  ) {
    fail("normalizedWorldIr", "AuthoringSpecV4 could not be normalized");
  }
  requireEqual(
    snapshot.normalizedWorldIr,
    normalized.value,
    "normalizedWorldIr",
  );
  const expectedLayoutSolveResult: LayoutSolveResultV1 = {
    status: normalized.layoutSolveReport.status,
    report: normalized.layoutSolveReport,
    layoutSolveReportHash: normalized.layoutSolveReportHash,
  };
  requireEqual(
    snapshot.layoutSolveResult,
    expectedLayoutSolveResult,
    "layoutSolveResult",
  );

  const authoringSpecHash = hashAuthoringDocumentV4(validated.value);
  const normalizedWorldIrHash = asHash(
    sha256CanonicalJson(snapshot.normalizedWorldIr),
  );
  const layoutSolveReportHash = asHash(
    hashLayoutSolveReportV1(snapshot.layoutSolveResult.report),
  );

  let gameplayBootstrap: GameplayBootstrapV1;
  try {
    gameplayBootstrap = parseGameplayBootstrapV1(snapshot.gameplayBootstrap);
  } catch {
    fail("gameplayBootstrap", "must be a canonical GameplayBootstrapV1");
  }
  requireEqual(
    snapshot.gameplayBootstrap,
    gameplayBootstrap,
    "gameplayBootstrap",
  );
  const gameplayBootstrapResourceLock =
    createGameplayBootstrapResourceLockEntryV1(gameplayBootstrap);

  let canonicalResourceLock: ReturnType<
    typeof canonicalExecutionResourceLockEntriesV1
  >;
  let canonicalPlanResourceLock: ReturnType<
    typeof canonicalExecutionResourceLockEntriesV1
  >;
  try {
    canonicalResourceLock = canonicalExecutionResourceLockEntriesV1(
      snapshot.normalizedWorldIr.resources.resourceLock,
    );
    canonicalPlanResourceLock = canonicalExecutionResourceLockEntriesV1(
      snapshot.executionPlan.resourceLockEntries,
    );
  } catch {
    fail("resourceLock", "must be a canonical Execution Resource Lock");
  }
  requireEqual(
    snapshot.normalizedWorldIr.resources.resourceLock,
    canonicalResourceLock,
    "normalizedWorldIr/resources/resourceLock",
  );
  requireEqual(
    snapshot.executionPlan.resourceLockEntries,
    canonicalPlanResourceLock,
    "executionPlan/resourceLockEntries",
  );
  const expectedPlanResourceLock = canonicalExecutionResourceLockEntriesV1([
    ...canonicalResourceLock,
    gameplayBootstrapResourceLock,
  ]);
  requireEqual(
    canonicalPlanResourceLock,
    expectedPlanResourceLock,
    "executionPlan/resourceLockEntries",
  );
  const normalizedResourceLockHash = asHash(
    sha256CanonicalJson(canonicalResourceLock),
  );
  const resourceLockHash = asHash(
    sha256CanonicalJson(canonicalPlanResourceLock),
  );

  const compiled = compileWorldV5({
    normalizedWorldIr: snapshot.normalizedWorldIr,
    normalizedWorldIrHash,
    gameplayBootstrapResourceLock,
  });
  if (
    !compiled.ok ||
    isNil(compiled.executionPlan) ||
    isNil(compiled.executionPlanHash)
  ) {
    fail("executionPlan", "NormalizedWorldIRV4 could not be compiled");
  }
  requireEqual(
    snapshot.executionPlan,
    compiled.executionPlan,
    "executionPlan",
  );
  const executionPlanHash = asHash(
    sha256CanonicalJson(snapshot.executionPlan),
  );
  requireEqual(
    executionPlanHash,
    compiled.executionPlanHash,
    "executionPlanHash",
  );

  requireEqual(
    snapshot.normalizedWorldIr.authoringSpecHash,
    authoringSpecHash,
    "normalizedWorldIr/authoringSpecHash",
  );
  requireEqual(
    snapshot.executionPlan.authoringSpecHash,
    authoringSpecHash,
    "executionPlan/authoringSpecHash",
  );
  requireEqual(
    snapshot.executionPlan.normalizedWorldIrHash,
    normalizedWorldIrHash,
    "executionPlan/normalizedWorldIrHash",
  );
  requireEqual(
    snapshot.normalizedWorldIr.resources.resourceLockHash,
    normalizedResourceLockHash,
    "normalizedWorldIr/resources/resourceLockHash",
  );
  requireEqual(
    snapshot.executionPlan.resourceLockHash,
    resourceLockHash,
    "executionPlan/resourceLockHash",
  );
  requireEqual(
    snapshot.layoutSolveResult.layoutSolveReportHash,
    layoutSolveReportHash,
    "layoutSolveResult/layoutSolveReportHash",
  );
  requireEqual(
    snapshot.normalizedWorldIr.layout.layoutSolveReportHash,
    layoutSolveReportHash,
    "normalizedWorldIr/layout/layoutSolveReportHash",
  );
  requireEqual(
    snapshot.executionPlan.layout.layoutSolveReportHash,
    layoutSolveReportHash,
    "executionPlan/layout/layoutSolveReportHash",
  );
  requireEqual(
    snapshot.layoutSolveResult.report.authoringSpecHash,
    authoringSpecHash,
    "layoutSolveResult/report/authoringSpecHash",
  );
  requireEqual(
    snapshot.layoutSolveResult.report.layoutInputHash,
    hashAuthoringLayoutInputV4(validated.value, {
      ...snapshot.normalizedWorldIr,
      resources: projectNormalizedWorldResourcesToLayoutIdentityV4(
        snapshot.normalizedWorldIr.resources,
      ),
    }),
    "layoutSolveResult/report/layoutInputHash",
  );
  requireEqual(
    snapshot.layoutSolveResult.report.registryLockHash,
    projectNormalizedWorldResourcesToLayoutIdentityV4(
      snapshot.normalizedWorldIr.resources,
    ).resourceLockHash,
    "layoutSolveResult/report/registryLockHash",
  );

  const manifest = receipt.manifest;
  requireEqual(manifest.worldId, validated.value.id, "manifest/worldId");
  requireEqual(manifest.seed, validated.value.seed, "manifest/seed");
  requireEqual(
    manifest.initialControlledEntityId,
    snapshot.executionPlan.initialControlledEntityId,
    "manifest/initialControlledEntityId",
  );
  requireEqual(
    manifest.authoringSpecHash,
    authoringSpecHash,
    "manifest/authoringSpecHash",
  );
  requireEqual(
    manifest.normalizedWorldIrHash,
    normalizedWorldIrHash,
    "manifest/normalizedWorldIrHash",
  );
  requireEqual(
    manifest.executionPlanHash,
    executionPlanHash,
    "manifest/executionPlanHash",
  );
  requireEqual(
    manifest.resourceLockHash,
    resourceLockHash,
    "manifest/resourceLockHash",
  );
  requireEqual(
    manifest.layoutSolveReportHash,
    layoutSolveReportHash,
    "manifest/layoutSolveReportHash",
  );

  try {
    receipt = assertWorldPackageBuildReceiptClosureV1(receipt, {
      authoringSpec: validated.value,
      normalizedWorldIr: snapshot.normalizedWorldIr,
      layoutSolveResult: snapshot.layoutSolveResult,
      executionPlan: snapshot.executionPlan,
      gameplayBootstrap,
    });
  } catch {
    fail(
      "worldPackageBuildReceipt",
      "must match the canonical V4/V5 build artifact closure",
    );
  }

  try {
    assertWorldPackageGameplayBootstrapMembershipV1({
      executionPlan: snapshot.executionPlan,
      gameplayBootstrap,
      worldPackageBuildReceipt: receipt,
    });
  } catch {
    fail(
      "gameplayBootstrap",
      "must match the Plan lock and WorldPackage byte inventory",
    );
  }

  return Object.freeze({
    kind: "world-package",
    worldPackageRootHash: receipt.worldPackageRootHash,
    authoringSpecHash,
    normalizedWorldIrHash,
    executionPlanHash,
    resourceLockHash,
    layoutSolveReportHash,
  });
}
