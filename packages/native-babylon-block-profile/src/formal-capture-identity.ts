import { sha256CanonicalJson, type Sha256HashV1 } from "@whitebox-world/protocol";
import {
  hashBabylonNativeSceneContributionV1,
  parseBabylonNativeSceneContributionV1,
  parseFormalSemanticCaptureMapV1,
  type FormalSemanticCaptureMapV1,
} from "@whitebox-world/runtime-contracts";
import {
  hashWorldReconstructionCaseV1,
  parseWorldReconstructionCaseV1,
  type WorldReconstructionCaseV1,
} from "@whitebox-world/validation";
import { isEmpty, isNil } from "lodash-es";

import type { BabylonNativeBlockVisualGroupInventoryV1 } from "./check.js";
import {
  BABYLON_NATIVE_BLOCK_PALETTE_ROLES_V1,
  BABYLON_NATIVE_BLOCK_PROFILE_REF_V1,
  type BabylonNativeBlockPaletteRoleV1,
} from "./profile.js";

export interface BindBlockVisualGroupsToSemanticCaptureTargetsInputV1 {
  readonly case: WorldReconstructionCaseV1;
  readonly blockVisualGroups: readonly BabylonNativeBlockVisualGroupInventoryV1[];
  readonly contributionHash: Sha256HashV1;
  readonly authoringManifestHash: Sha256HashV1;
  readonly layoutInventoryHash: Sha256HashV1;
  readonly authoringManifest: unknown;
  readonly contribution: unknown;
}

const CONTRACT = "FORMAL_BLOCK_SEMANTIC_CAPTURE_IDENTITY_INVALID";
const INPUT_FIELDS = [
  "case",
  "blockVisualGroups",
  "contributionHash",
  "authoringManifestHash",
  "layoutInventoryHash",
  "authoringManifest",
  "contribution",
] as const;
const AUTHORING_FIELDS = [
  "kind",
  "schemaVersion",
  "entryModulePath",
  "blockProfileRef",
  "visualGroups",
] as const;
const AUTHORING_GROUP_FIELDS = [
  "visualGroupId",
  "acceptanceTargetRef",
  "semanticClassId",
  "identityColorHex",
] as const;
const INVENTORY_FIELDS = [
  "id",
  "blockIds",
  "paletteRoles",
  "minimumMetersXYZ",
  "maximumMetersXYZ",
] as const;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/;
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const ZERO_HASH = `sha256:${"0".repeat(64)}`;

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

function object(value: unknown, path: string): Readonly<Record<string, unknown>> {
  if (
    isNil(value) ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Reflect.getPrototypeOf(value) !== Object.prototype
  ) {
    fail(path, "expected an ordinary plain object");
  }
  return value as Readonly<Record<string, unknown>>;
}

function exactFields(
  value: Readonly<Record<string, unknown>>,
  fields: readonly string[],
  path: string,
): void {
  const allowed = new Set(fields);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (!isNil(unknown)) fail(`${path}/${unknown}`, "unknown field");
  const missing = fields.find((key) => !Object.hasOwn(value, key));
  if (!isNil(missing)) fail(`${path}/${missing}`, "required field is missing");
}

function text(value: unknown, path: string): string {
  if (
    typeof value !== "string" ||
    isEmpty(value) ||
    value.trim() !== value ||
    value.normalize("NFC") !== value
  ) {
    fail(path, "expected a non-empty trimmed NFC string");
  }
  return value;
}

function hash(value: unknown, path: string): Sha256HashV1 {
  const parsed = text(value, path);
  if (!HASH_PATTERN.test(parsed) || parsed === ZERO_HASH) {
    fail(path, "expected a non-zero SHA-256 hash");
  }
  return parsed as Sha256HashV1;
}

function array(value: unknown, path: string): readonly unknown[] {
  if (
    !Array.isArray(value) ||
    Reflect.getPrototypeOf(value) !== Array.prototype ||
    Object.getOwnPropertyNames(value).length !== value.length + 1
  ) {
    fail(path, "expected an ordinary array");
  }
  return value;
}

function metersXYZ(
  value: unknown,
  path: string,
): readonly [number, number, number] {
  const parsed = array(value, path);
  if (parsed.length !== 3) fail(path, "expected a 3-tuple of meters");
  return Object.freeze(parsed.map((entry, index) => {
    if (
      typeof entry !== "number" ||
      !Number.isFinite(entry) ||
      Object.is(entry, -0)
    ) {
      fail(`${path}/${index}`, "expected a finite number of meters");
    }
    return entry;
  }) as [number, number, number]);
}

function uniqueSortedStrings(value: unknown, path: string): readonly string[] {
  const parsed = array(value, path).map((entry, index) => text(entry, `${path}/${index}`));
  if (isEmpty(parsed)) fail(path, "must not be empty");
  if (parsed.some((entry, index) => index > 0 && parsed[index - 1]! >= entry)) {
    fail(path, "must be unique and strictly sorted");
  }
  return Object.freeze(parsed);
}

function parseInventoryGroup(
  value: unknown,
  path: string,
): BabylonNativeBlockVisualGroupInventoryV1 {
  const source = object(value, path);
  exactFields(source, INVENTORY_FIELDS, path);
  const minimumMetersXYZ = metersXYZ(source.minimumMetersXYZ, `${path}/minimumMetersXYZ`);
  const maximumMetersXYZ = metersXYZ(source.maximumMetersXYZ, `${path}/maximumMetersXYZ`);
  if (
    minimumMetersXYZ[0] >= maximumMetersXYZ[0] ||
    minimumMetersXYZ[1] >= maximumMetersXYZ[1] ||
    minimumMetersXYZ[2] >= maximumMetersXYZ[2]
  ) {
    fail(path, "inventory bounds must have positive volume");
  }
  return Object.freeze({
    id: text(source.id, `${path}/id`),
    blockIds: uniqueSortedStrings(source.blockIds, `${path}/blockIds`),
    paletteRoles: Object.freeze(uniqueSortedStrings(
      source.paletteRoles,
      `${path}/paletteRoles`,
    ).map((role) => {
      if (!BABYLON_NATIVE_BLOCK_PALETTE_ROLES_V1.includes(
        role as BabylonNativeBlockPaletteRoleV1,
      )) {
        fail(`${path}/paletteRoles`, "palette role is outside the closed Profile");
      }
      return role as BabylonNativeBlockPaletteRoleV1;
    })),
    minimumMetersXYZ,
    maximumMetersXYZ,
  });
}

function parseAuthoringGroup(value: unknown, path: string): Readonly<{
  visualGroupId: string;
  acceptanceTargetRef: string;
  semanticClassId: string;
  identityColorHex: `#${string}`;
}> {
  const source = object(value, path);
  exactFields(source, AUTHORING_GROUP_FIELDS, path);
  const identityColorHex = text(source.identityColorHex, `${path}/identityColorHex`);
  if (!COLOR_PATTERN.test(identityColorHex)) {
    fail(`${path}/identityColorHex`, "expected a lowercase six-digit hex color");
  }
  return Object.freeze({
    visualGroupId: text(source.visualGroupId, `${path}/visualGroupId`),
    acceptanceTargetRef: text(
      source.acceptanceTargetRef,
      `${path}/acceptanceTargetRef`,
    ),
    semanticClassId: text(source.semanticClassId, `${path}/semanticClassId`),
    identityColorHex: identityColorHex as `#${string}`,
  });
}

function parseAuthoringManifest(value: unknown): Readonly<{
  kind: "native-block-authoring";
  schemaVersion: 1;
  entryModulePath: "scene.ts";
  blockProfileRef: typeof BABYLON_NATIVE_BLOCK_PROFILE_REF_V1;
  visualGroups: readonly Readonly<{
    visualGroupId: string;
    acceptanceTargetRef: string;
    semanticClassId: string;
    identityColorHex: `#${string}`;
  }>[];
}> {
  const source = object(value, "authoringManifest");
  exactFields(source, AUTHORING_FIELDS, "authoringManifest");
  if (
    source.kind !== "native-block-authoring" ||
    source.schemaVersion !== 1 ||
    source.entryModulePath !== "scene.ts" ||
    source.blockProfileRef !== BABYLON_NATIVE_BLOCK_PROFILE_REF_V1
  ) {
    fail("authoringManifest", "must be the checked native-block-authoring mapping");
  }
  const visualGroups = array(
    source.visualGroups,
    "authoringManifest/visualGroups",
  ).map((entry, index) => parseAuthoringGroup(
    entry,
    `authoringManifest/visualGroups/${index}`,
  ));
  if (
    visualGroups.some((row, index) =>
      index > 0 && visualGroups[index - 1]!.visualGroupId >= row.visualGroupId)
  ) {
    fail(
      "authoringManifest/visualGroups",
      "must be unique and strictly sorted by visualGroupId",
    );
  }
  return Object.freeze({
    kind: "native-block-authoring",
    schemaVersion: 1,
    entryModulePath: "scene.ts",
    blockProfileRef: BABYLON_NATIVE_BLOCK_PROFILE_REF_V1,
    visualGroups: Object.freeze(visualGroups),
  });
}

function parseCase(value: unknown): WorldReconstructionCaseV1 {
  try {
    return parseWorldReconstructionCaseV1(value);
  } catch {
    fail("case", "must be a closed WorldReconstructionCaseV1");
  }
}

function parseContributionHash(value: unknown): Sha256HashV1 {
  try {
    return hashBabylonNativeSceneContributionV1(
      parseBabylonNativeSceneContributionV1(value),
    );
  } catch {
    fail("contribution", "must be a closed BabylonNativeSceneContributionV1");
  }
}

export function bindBlockVisualGroupsToSemanticCaptureTargetsV1(
  input: BindBlockVisualGroupsToSemanticCaptureTargetsInputV1,
): FormalSemanticCaptureMapV1 {
  assertAccessorFree(input);
  const source = object(input, "");
  exactFields(source, INPUT_FIELDS, "");
  const reconstructionCase = parseCase(source.case);
  const claimedContributionHash = hash(source.contributionHash, "contributionHash");
  const claimedAuthoringManifestHash = hash(
    source.authoringManifestHash,
    "authoringManifestHash",
  );
  const claimedLayoutInventoryHash = hash(
    source.layoutInventoryHash,
    "layoutInventoryHash",
  );
  const authoringManifest = parseAuthoringManifest(source.authoringManifest);
  const authoringManifestHash = sha256CanonicalJson(authoringManifest) as Sha256HashV1;
  if (authoringManifestHash !== claimedAuthoringManifestHash) {
    fail("authoringManifestHash", "does not match the checked authoring manifest");
  }
  const blockVisualGroups = array(
    source.blockVisualGroups,
    "blockVisualGroups",
  ).map((entry, index) => parseInventoryGroup(entry, `blockVisualGroups/${index}`));
  const sortedInventory = Object.freeze([...blockVisualGroups].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  if (new Set(sortedInventory.map((group) => group.id)).size !== sortedInventory.length) {
    fail("blockVisualGroups", "visual group ids must be unique");
  }
  const layoutInventoryHash = sha256CanonicalJson(sortedInventory) as Sha256HashV1;
  if (layoutInventoryHash !== claimedLayoutInventoryHash) {
    fail("layoutInventoryHash", "does not match the checked Layout inventory");
  }
  const contributionHash = parseContributionHash(source.contribution);
  if (contributionHash !== claimedContributionHash) {
    fail("contributionHash", "does not match the frozen Contribution");
  }
  const inventoryById = new Map(sortedInventory.map((group) => [group.id, group]));
  const targetRefs = reconstructionCase.acceptanceTargetRefs;
  const authoringTargets = authoringManifest.visualGroups.map((row) =>
    row.acceptanceTargetRef);
  const authoringGroups = authoringManifest.visualGroups.map((row) => row.visualGroupId);
  const authoringColors = authoringManifest.visualGroups.map((row) =>
    row.identityColorHex);
  if (new Set(authoringTargets).size !== authoringTargets.length) {
    fail("authoringManifest/visualGroups", "acceptance targets must be unique");
  }
  if (new Set(authoringGroups).size !== authoringGroups.length) {
    fail(
      "authoringManifest/visualGroups",
      "a visual group may bind only one semantic target",
    );
  }
  if (new Set(authoringColors).size !== authoringColors.length) {
    fail("authoringManifest/visualGroups", "identity colors must be unique");
  }
  const extraTarget = authoringTargets.find((targetRef) => !targetRefs.includes(targetRef));
  if (!isNil(extraTarget)) {
    fail("authoringManifest/visualGroups", "contains a target outside the Case");
  }
  const missingTarget = targetRefs.find((targetRef) => !authoringTargets.includes(targetRef));
  if (!isNil(missingTarget)) {
    fail("authoringManifest/visualGroups", "missing a required Case target binding");
  }
  const undeclaredGroup = authoringGroups.find((groupId) => !inventoryById.has(groupId));
  if (!isNil(undeclaredGroup)) {
    fail("authoringManifest/visualGroups", "references an undeclared Layout visual group");
  }
  for (const silhouette of reconstructionCase.expected.semanticSilhouetteTargets) {
    const row = authoringManifest.visualGroups.find((candidate) =>
      candidate.acceptanceTargetRef === silhouette.acceptanceTargetRef);
    if (isNil(row) || row.visualGroupId !== silhouette.visualGroupId) {
      fail(
        "authoringManifest/visualGroups",
        "Case silhouette visualGroupId must match the checked authoring binding",
      );
    }
  }
  const bindings = Object.freeze([...authoringManifest.visualGroups]
    .sort((left, right) =>
      left.acceptanceTargetRef < right.acceptanceTargetRef
        ? -1
        : left.acceptanceTargetRef > right.acceptanceTargetRef ? 1 : 0)
    .map((row) => Object.freeze({
      acceptanceTargetRef: row.acceptanceTargetRef,
      blockVisualGroupId: row.visualGroupId,
      semanticClassId: row.semanticClassId,
      identityColor: row.identityColorHex,
      projectedBoundsSource: "checked-layout-visual-group" as const,
      requiredWorldViewIds: ["opening", "world-side", "world-top-down"] as const,
      authoringManifestHash,
      layoutInventoryHash,
      contributionHash,
    })));
  return parseFormalSemanticCaptureMapV1({
    kind: "formal-semantic-capture-map",
    schemaVersion: 1,
    id: `${reconstructionCase.id}.semantic-capture-map`,
    caseRef: `worldkit://world-reconstruction-case/${reconstructionCase.id}`,
    caseHash: hashWorldReconstructionCaseV1(reconstructionCase),
    authoringManifestHash,
    layoutInventoryHash,
    contributionHash,
    bindings,
  });
}
