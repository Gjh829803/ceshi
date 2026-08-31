import { sha256CanonicalJson, type Sha256HashV1 } from "@whitebox-world/protocol";
import {
  hashBabylonNativeSceneContributionV1,
  parseBabylonNativeSceneContributionV1,
  parseFormalSemanticCaptureMapV1,
  parseFormalTraversalCheckpointSpatialCriteriaV1,
  type BabylonNativeSceneContributionV1,
  type FormalSemanticCaptureMapV1,
  type FormalTraversalCheckpointSpatialCriterionV1,
} from "@whitebox-world/runtime-contracts";
import {
  hashWorldReconstructionCaseV1,
  parseWorldReconstructionCaseV1,
  type WorldReconstructionCaseV1,
} from "@whitebox-world/validation";
import { isEqual, isNil } from "lodash-es";

import {
  bindNativeBlockAuthoringManifestToCheckedLayoutV1,
  parseNativeBlockAuthoringManifestV1,
  type NativeBlockAuthoringLayoutBindingV1,
  type NativeBlockAuthoringManifestV1,
} from "./authoring-manifest.js";
import type { BabylonNativeBlockCheckedLayoutV1 } from "./session.js";

export interface BindBlockVisualGroupsToSemanticCaptureTargetsInputV1 {
  readonly case: WorldReconstructionCaseV1;
  readonly authoringManifest: NativeBlockAuthoringManifestV1;
  readonly authoringManifestHash: Sha256HashV1;
  readonly checkedLayout: Pick<
    BabylonNativeBlockCheckedLayoutV1,
    "kind" | "schemaVersion" | "layout" | "checkResult"
  >;
  readonly checkedLayoutInventoryHash: Sha256HashV1;
  readonly contribution: unknown;
  readonly contributionHash: Sha256HashV1;
  readonly checkpointSpatialCriteria:
    readonly FormalTraversalCheckpointSpatialCriterionV1[];
}

const CONTRACT = "FORMAL_BLOCK_SEMANTIC_CAPTURE_IDENTITY_INVALID";
const INPUT_FIELDS = [
  "case",
  "authoringManifest",
  "authoringManifestHash",
  "checkedLayout",
  "checkedLayoutInventoryHash",
  "contribution",
  "contributionHash",
  "checkpointSpatialCriteria",
] as const;

function fail(path: string, message: string): never {
  throw new Error(`${CONTRACT}:${path.length === 0 ? "" : ` ${path}:`} ${message}`);
}

function assertAccessorFree(
  value: unknown,
  path = "",
  seen = new Set<object>(),
): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") fail(path, "symbol keys are forbidden");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!isNil(descriptor?.get) || !isNil(descriptor?.set)) {
      fail(`${path}/${key}`, "accessors are forbidden");
    }
    assertAccessorFree(descriptor?.value, `${path}/${key}`, seen);
  }
}

function exactInput(value: unknown): Readonly<Record<string, unknown>> {
  if (
    isNil(value) ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Reflect.getPrototypeOf(value) !== Object.prototype
  ) {
    fail("", "expected an ordinary plain object");
  }
  const allowed = new Set<string>(INPUT_FIELDS);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (!isNil(unknown)) fail(`/${unknown}`, "unknown field");
  const missing = INPUT_FIELDS.find((key) => !Object.hasOwn(value, key));
  if (!isNil(missing)) fail(`/${missing}`, "required field is missing");
  return value as Readonly<Record<string, unknown>>;
}

function parseCase(value: unknown): WorldReconstructionCaseV1 {
  try {
    return parseWorldReconstructionCaseV1(value);
  } catch {
    fail("case", "must be a closed WorldReconstructionCaseV1");
  }
}

function parseContribution(value: unknown): BabylonNativeSceneContributionV1 {
  try {
    return parseBabylonNativeSceneContributionV1(value);
  } catch {
    fail("contribution", "must be a closed BabylonNativeSceneContributionV1");
  }
}

function parseCheckpointSpatialCriteria(
  value: unknown,
): readonly FormalTraversalCheckpointSpatialCriterionV1[] {
  try {
    return parseFormalTraversalCheckpointSpatialCriteriaV1(value);
  } catch {
    fail(
      "checkpointSpatialCriteria",
      "must be closed package-derived spatial criteria",
    );
  }
}

export function bindBlockVisualGroupsToSemanticCaptureTargetsV1(
  input: BindBlockVisualGroupsToSemanticCaptureTargetsInputV1,
): FormalSemanticCaptureMapV1 {
  assertAccessorFree(input);
  const source = exactInput(input);
  const reconstructionCase = parseCase(source.case);
  const contribution = parseContribution(source.contribution);
  const frozenContributionHash = hashBabylonNativeSceneContributionV1(
    contribution,
  );
  let authoringManifest: NativeBlockAuthoringManifestV1;
  try {
    authoringManifest = parseNativeBlockAuthoringManifestV1(
      source.authoringManifest,
    );
  } catch {
    fail(
      "authoringManifest",
      "must satisfy the canonical Native Block Authoring Manifest parser",
    );
  }
  let authoringLayoutBinding: NativeBlockAuthoringLayoutBindingV1;
  try {
    authoringLayoutBinding =
      bindNativeBlockAuthoringManifestToCheckedLayoutV1({
        reconstructionCase,
        authoringManifest,
        authoringManifestHash: source.authoringManifestHash as Sha256HashV1,
        checkedLayout: source.checkedLayout as
          BindBlockVisualGroupsToSemanticCaptureTargetsInputV1["checkedLayout"],
        checkedLayoutInventoryHash:
          source.checkedLayoutInventoryHash as Sha256HashV1,
        contributionHash: source.contributionHash as Sha256HashV1,
        frozenContributionHash,
      });
  } catch {
    fail(
      "authoringLayoutBinding",
      "must satisfy the canonical Manifest-to-checked-Layout binding",
    );
  }
  const groupById = new Map(
    authoringLayoutBinding.visualGroups.map((group) => [
      group.visualGroupId,
      group,
    ]),
  );
  const checkpointSpatialCriteria = parseCheckpointSpatialCriteria(
    source.checkpointSpatialCriteria,
  );
  const criteriaByCheckpointId = new Map(
    checkpointSpatialCriteria.map((criterion) => [
      criterion.checkpointId,
      criterion,
    ]),
  );
  for (const criterion of checkpointSpatialCriteria) {
    const group = groupById.get(criterion.sourceVisualGroupId);
    if (isNil(group)) {
      fail(
        "checkpointSpatialCriteria",
        "criterion references a visual group outside the formal Layout binding",
      );
    }
    if (!isEqual(criterion.sourceBoundsMeters, {
      minimumMetersXYZ: group.minimumMetersXYZ,
      maximumMetersXYZ: group.maximumMetersXYZ,
    })) {
      fail(
        "checkpointSpatialCriteria",
        "criterion bounds must equal the formal checked Layout group bounds",
      );
    }
    if (
      criterion.kind === "block-plane" &&
      !contribution.staticColliders.some(({ id }) => id === criterion.colliderId)
    ) {
      fail(
        "checkpointSpatialCriteria",
        "block criterion colliderId must exist in the frozen Contribution",
      );
    }
  }
  const expectedCheckpointIds = reconstructionCase.expected.criticalTraversalChecks
    .flatMap(({ checkpointIds }) => checkpointIds)
    .sort();
  const criterionCheckpointIds = checkpointSpatialCriteria
    .map(({ checkpointId }) => checkpointId)
    .sort();
  if (!isEqual(criterionCheckpointIds, expectedCheckpointIds)) {
    fail(
      "checkpointSpatialCriteria",
      "must bind every Case checkpoint exactly once without extras",
    );
  }
  const bindings = Object.freeze(authoringLayoutBinding.visualGroups.map(
    (group) => Object.freeze({
      acceptanceTargetRef: group.acceptanceTargetRef,
      blockVisualGroupId: group.visualGroupId,
      semanticClassId: group.semanticClassId,
      identityColor: group.identityColorHex,
      projectedBoundsSource: "checked-layout-visual-group" as const,
      requiredWorldViewIds:
        ["opening", "world-side", "world-top-down"] as const,
      authoringManifestHash: authoringLayoutBinding.authoringManifestHash,
      layoutInventoryHash: authoringLayoutBinding.checkedLayoutInventoryHash,
      contributionHash: authoringLayoutBinding.contributionHash,
    })),
  );
  const traversalCheckBindings = Object.freeze(
    reconstructionCase.expected.criticalTraversalChecks.map((check) =>
      Object.freeze({
        traversalCheckId: check.id,
        acceptanceTargetRef: check.acceptanceTargetRef,
        checkExpectation: check.expectation,
        fixedInputSequenceHash: sha256CanonicalJson(
          check.fixedInputSequence,
        ) as Sha256HashV1,
        checkpointCriteria: Object.freeze(check.checkpointIds.map(
          (checkpointId) => criteriaByCheckpointId.get(checkpointId)!,
        )),
      })),
  );
  return parseFormalSemanticCaptureMapV1({
    kind: "formal-semantic-capture-map",
    schemaVersion: 1,
    id: `${reconstructionCase.id}.semantic-capture-map`,
    caseRef: `worldkit://world-reconstruction-case/${reconstructionCase.id}`,
    caseHash: hashWorldReconstructionCaseV1(reconstructionCase),
    authoringManifestHash: authoringLayoutBinding.authoringManifestHash,
    layoutInventoryHash: authoringLayoutBinding.checkedLayoutInventoryHash,
    contributionHash: authoringLayoutBinding.contributionHash,
    bindings,
    traversalCheckBindings,
  });
}
