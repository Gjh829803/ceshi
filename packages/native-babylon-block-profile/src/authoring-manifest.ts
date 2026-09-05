import type { Sha256HashV1 } from "@whitebox-world/protocol";

import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { parseBabylonNativeInitialCameraV1, type BabylonNativeInitialCameraV1 } from "@whitebox-world/runtime-contracts";
import {
  hashWorldReconstructionCaseV1,
  parseWorldReconstructionCaseV1,
  type WorldReconstructionCaseV1,
} from "@whitebox-world/validation/reconstruction-contracts";
import { isEqual, isNil } from "lodash-es";

import type {
  BabylonNativeBlockVisualGroupInventoryV1,
} from "./check.js";
import type {
  BabylonNativeBlockLayoutEntryV1,
} from "./layout.js";
import type {
  BabylonNativeBlockCheckedLayoutV1,
} from "./session.js";

export const BABYLON_NATIVE_BLOCK_AUTHORING_PROFILE_REF_V1 =
  "worldkit://native-block-profile/whitebox.blocks@1" as const;

export interface NativeBlockAuthoringVisualGroupV1 {
  readonly visualGroupId: string;
  readonly acceptanceTargetRef: string;
  readonly semanticClassId: string;
  readonly identityColorHex: `#${string}`;
}

export interface NativeBlockAuthoringManifestV1 {
  readonly kind: "native-block-authoring";
  readonly schemaVersion: 1;
  readonly entryModulePath: "scene.ts";
  readonly blockProfileRef:
    typeof BABYLON_NATIVE_BLOCK_AUTHORING_PROFILE_REF_V1;
  readonly visualGroups: readonly NativeBlockAuthoringVisualGroupV1[];
  readonly openingCamera: BabylonNativeInitialCameraV1;
}

export interface NativeBlockVisualResourceListV1 {
  readonly kind: "native-visual-resource-list";
  readonly schemaVersion: 1;
  readonly resourceRefs: readonly string[];
}

export interface NativeBlockAuthoringLayoutBindingV1 {
  readonly openingCamera: BabylonNativeInitialCameraV1;
  readonly kind: "native-block-authoring-layout-binding";
  readonly schemaVersion: 1;
  readonly caseHash: Sha256HashV1;
  readonly authoringManifestHash: Sha256HashV1;
  readonly checkedLayoutInventoryHash: Sha256HashV1;
  readonly contributionHash: Sha256HashV1;
  readonly visualGroups: readonly Readonly<{
    acceptanceTargetRef: string;
    visualGroupId: string;
    semanticClassId: string;
    identityColorHex: `#${string}`;
    blockIds: readonly string[];
    paletteRoles: BabylonNativeBlockVisualGroupInventoryV1["paletteRoles"];
    minimumMetersXYZ: BabylonNativeBlockVisualGroupInventoryV1["minimumMetersXYZ"];
    maximumMetersXYZ: BabylonNativeBlockVisualGroupInventoryV1["maximumMetersXYZ"];
  }>[];
}

const STABLE_ID = /^[a-z0-9][a-z0-9-]{2,79}$/;
const STABLE_REF = /^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/;
const NATIVE_VISUAL_RESOURCE_REF =
  /^worldkit:\/\/static-geometry-asset\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?@[1-9][0-9]*$/;
const SEMANTIC_CLASS_ID = /^[a-z][a-z0-9.-]{2,127}$/;
const HOST_SUBJECT_SEMANTIC_CLASS_ID = /^subject(?:\.|$)/;
const IDENTITY_COLOR_HEX = /^#[0-9A-F]{6}$/;
const SHA256_HASH = /^sha256:[0-9a-f]{64}$/;
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const AUTHORITY_FIELD_TOKENS = Object.freeze([
  "action",
  "camera",
  "gameplay",
  "input",
  "physics",
  "runtime",
  "spawn",
  "subject",
] as const);

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(code: string, message: string): never {
  throw new TypeError(`${code}: ${message}`);
}

function assertPlainData(input: unknown, code: string): void {
  const seen = new Set<object>();
  const visit = (value: unknown, path: string): void => {
    if (
      isNil(value) ||
      typeof value === "string" ||
      typeof value === "boolean"
    ) return;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) fail(code, `${path} must be finite`);
      return;
    }
    if (typeof value !== "object" || seen.has(value)) {
      return fail(code, `${path} must be acyclic plain data`);
    }
    seen.add(value);
    const prototype = Reflect.getPrototypeOf(value);
    if (Array.isArray(value)) {
      if (prototype !== Array.prototype) {
        return fail(code, `${path} must use the ordinary Array prototype`);
      }
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const expectedKeys = [
        ...Array.from({ length: value.length }, (_entry, index) => String(index)),
        "length",
      ];
      if (
        Reflect.ownKeys(descriptors).some((key) => typeof key !== "string") ||
        Object.keys(descriptors).length !== expectedKeys.length ||
        expectedKeys.some((key) => !Object.hasOwn(descriptors, key))
      ) return fail(code, `${path} must be a dense ordinary Array`);
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (
          isNil(descriptor) ||
          !("value" in descriptor) ||
          descriptor.enumerable !== true
        ) return fail(code, `${path}/${index} must be an enumerable data field`);
        visit(descriptor.value, `${path}/${index}`);
      }
      return;
    }
    if (prototype !== Object.prototype) {
      return fail(code, `${path} must use the ordinary Object prototype`);
    }
    for (const [key, descriptor] of Object.entries(
      Object.getOwnPropertyDescriptors(value),
    )) {
      if (
        DANGEROUS_KEYS.has(key) ||
        !("value" in descriptor) ||
        descriptor.enumerable !== true
      ) return fail(code, `${path}/${key} must be a safe enumerable data field`);
      visit(descriptor.value, `${path}/${key}`);
    }
    if (Reflect.ownKeys(value).some((key) => typeof key !== "string")) {
      return fail(code, `${path} must not contain symbol fields`);
    }
  };
  visit(input, "value");
}

function exactRecord(
  input: unknown,
  expectedKeys: readonly string[],
  code: string,
  path: string,
): Record<string, unknown> {
  if (
    typeof input !== "object" ||
    isNil(input) ||
    Array.isArray(input) ||
    Reflect.getPrototypeOf(input) !== Object.prototype
  ) return fail(code, `${path} must be an ordinary object`);
  const keys = Reflect.ownKeys(input);
  if (
    keys.some((key) => typeof key !== "string") ||
    keys.length !== expectedKeys.length ||
    expectedKeys.some((key) => !keys.includes(key))
  ) return fail(code, `${path} must use the exact closed field set`);
  return input as Record<string, unknown>;
}

function text(input: unknown, code: string, path: string): string {
  if (typeof input !== "string" || input.length === 0) {
    return fail(code, `${path} must be a non-empty string`);
  }
  return input;
}

function stableRef(input: unknown, code: string, path: string): string {
  const value = text(input, code, path);
  if (!STABLE_REF.test(value)) return fail(code, `${path} must be a stable ref`);
  return value;
}

function hash(input: unknown, code: string, path: string): Sha256HashV1 {
  const value = text(input, code, path);
  if (!SHA256_HASH.test(value)) return fail(code, `${path} must be a sha256 hash`);
  return value as Sha256HashV1;
}

function containsAuthorityField(input: unknown): boolean {
  if (typeof input !== "object" || isNil(input)) return false;
  if (Array.isArray(input)) return input.some(containsAuthorityField);
  return Object.entries(input).some(([key, value]) => {
    const normalized = key.toLowerCase();
    return AUTHORITY_FIELD_TOKENS.some((token) => normalized.includes(token)) ||
      containsAuthorityField(value);
  });
}

function requireStrictlySortedUnique(
  values: readonly string[],
  code: string,
  path: string,
): void {
  if (values.some((value, index) =>
    index > 0 && stableCompare(values[index - 1]!, value) >= 0)) {
    return fail(code, `${path} must be strictly sorted and unique`);
  }
}

function requireUnique(
  values: readonly string[],
  code: string,
  path: string,
): void {
  if (new Set(values).size !== values.length) {
    return fail(code, `${path} must be unique`);
  }
}

export function parseNativeBlockAuthoringManifestV1(
  input: unknown,
): NativeBlockAuthoringManifestV1 {
  const code = "WORLDKIT_NATIVE_BLOCK_AUTHORING_MANIFEST_INVALID";
  assertPlainData(input, code);
  const source = exactRecord(input, [
    "kind",
    "schemaVersion",
    "entryModulePath",
    "blockProfileRef",
    "visualGroups",
    "openingCamera",
  ], code, "manifest");
  const { openingCamera: cameraIntent, ...declarations } = source;
  if (containsAuthorityField(declarations)) {
    return fail(code, "Subject, Camera, Physics, Runtime and Gameplay authority fields are forbidden");
  }
  let openingCamera: BabylonNativeInitialCameraV1;
  try { openingCamera = parseBabylonNativeInitialCameraV1(cameraIntent); }
  catch { return fail(code, "openingCamera must contain only the closed third-person numeric intent"); }
  if (
    source.kind !== "native-block-authoring" ||
    source.schemaVersion !== 1 ||
    source.entryModulePath !== "scene.ts" ||
    source.blockProfileRef !== BABYLON_NATIVE_BLOCK_AUTHORING_PROFILE_REF_V1 ||
    !Array.isArray(source.visualGroups)
  ) return fail(code, "manifest identity or Block Profile is invalid");
  const visualGroups = source.visualGroups.map((entry, index) => {
    const path = `visualGroups/${index}`;
    const row = exactRecord(entry, [
      "visualGroupId",
      "acceptanceTargetRef",
      "semanticClassId",
      "identityColorHex",
    ], code, path);
    const visualGroupId = text(row.visualGroupId, code, `${path}/visualGroupId`);
    const semanticClassId = text(row.semanticClassId, code, `${path}/semanticClassId`);
    const identityColorHex = text(row.identityColorHex, code, `${path}/identityColorHex`);
    if (!STABLE_ID.test(visualGroupId)) {
      return fail(code, `${path}/visualGroupId is invalid`);
    }
    if (!SEMANTIC_CLASS_ID.test(semanticClassId)) {
      return fail(code, `${path}/semanticClassId is invalid`);
    }
    if (HOST_SUBJECT_SEMANTIC_CLASS_ID.test(semanticClassId)) {
      return fail(code, `${path}/semanticClassId belongs to the Host-owned Subject`);
    }
    if (!IDENTITY_COLOR_HEX.test(identityColorHex)) {
      return fail(code, `${path}/identityColorHex must be uppercase #RRGGBB`);
    }
    return Object.freeze({
      visualGroupId,
      acceptanceTargetRef: stableRef(
        row.acceptanceTargetRef,
        code,
        `${path}/acceptanceTargetRef`,
      ),
      semanticClassId,
      identityColorHex: identityColorHex as `#${string}`,
    });
  });
  requireStrictlySortedUnique(
    visualGroups.map(({ visualGroupId }) => visualGroupId),
    code,
    "visualGroups/visualGroupId",
  );
  requireUnique(
    visualGroups.map(({ acceptanceTargetRef }) => acceptanceTargetRef),
    code,
    "visualGroups/acceptanceTargetRef",
  );
  requireUnique(
    visualGroups.map(({ identityColorHex }) => identityColorHex),
    code,
    "visualGroups/identityColorHex",
  );
  return Object.freeze({
    kind: "native-block-authoring",
    schemaVersion: 1,
    entryModulePath: "scene.ts",
    blockProfileRef: BABYLON_NATIVE_BLOCK_AUTHORING_PROFILE_REF_V1,
    openingCamera,
    visualGroups: Object.freeze(visualGroups),
  });
}

export function hashNativeBlockAuthoringManifestV1(
  input: unknown,
): Sha256HashV1 {
  return sha256CanonicalJson(
    parseNativeBlockAuthoringManifestV1(input),
  ) as Sha256HashV1;
}

export function parseNativeBlockVisualResourceListV1(
  input: unknown,
): NativeBlockVisualResourceListV1 {
  const code = "WORLDKIT_NATIVE_BLOCK_VISUAL_RESOURCES_INVALID";
  assertPlainData(input, code);
  if (containsAuthorityField(input)) {
    return fail(code, "Host authority fields are forbidden in visual resources");
  }
  const source = exactRecord(
    input,
    ["kind", "schemaVersion", "resourceRefs"],
    code,
    "resources",
  );
  if (
    source.kind !== "native-visual-resource-list" ||
    source.schemaVersion !== 1 ||
    !Array.isArray(source.resourceRefs)
  ) return fail(code, "visual resource list identity is invalid");
  const resourceRefs = source.resourceRefs.map((entry, index) => {
    const resourceRef = stableRef(entry, code, `resourceRefs/${index}`);
    if (!NATIVE_VISUAL_RESOURCE_REF.test(resourceRef)) {
      return fail(
        code,
        `resourceRefs/${index} must be a static-geometry-asset Registry ref`,
      );
    }
    return resourceRef;
  });
  requireStrictlySortedUnique(resourceRefs, code, "resourceRefs");
  return Object.freeze({
    kind: "native-visual-resource-list",
    schemaVersion: 1,
    resourceRefs: Object.freeze(resourceRefs),
  });
}

export function hashNativeBlockVisualResourceListV1(
  input: unknown,
): Sha256HashV1 {
  return sha256CanonicalJson(
    parseNativeBlockVisualResourceListV1(input),
  ) as Sha256HashV1;
}

function derivedVisualGroups(
  blocks: readonly BabylonNativeBlockLayoutEntryV1[],
): readonly BabylonNativeBlockVisualGroupInventoryV1[] {
  const blocksByGroup = new Map<string, BabylonNativeBlockLayoutEntryV1[]>();
  for (const block of blocks) {
    if (isNil(block.visualGroupId)) continue;
    const group = blocksByGroup.get(block.visualGroupId) ?? [];
    group.push(block);
    blocksByGroup.set(block.visualGroupId, group);
  }
  return Object.freeze([...blocksByGroup.entries()]
    .sort(([left], [right]) => stableCompare(left, right))
    .map(([id, group]) => {
      const sortedBlocks = [...group].sort((left, right) =>
        stableCompare(left.id, right.id));
      return Object.freeze({
        id,
        blockIds: Object.freeze(sortedBlocks.map(({ id: blockId }) => blockId)),
        paletteRoles: Object.freeze([...new Set(
          sortedBlocks.map(({ paletteRole }) => paletteRole),
        )].sort(stableCompare)),
        minimumMetersXYZ: Object.freeze([0, 1, 2].map((axis) =>
          Math.min(...sortedBlocks.map((block) => block.minimumMetersXYZ[axis]!)),
        ) as [number, number, number]),
        maximumMetersXYZ: Object.freeze([0, 1, 2].map((axis) =>
          Math.max(...sortedBlocks.map((block) => block.maximumMetersXYZ[axis]!)),
        ) as [number, number, number]),
      });
    }));
}

function checkedLayoutInventory(
  input: Pick<BabylonNativeBlockCheckedLayoutV1, "kind" | "schemaVersion" | "layout" | "checkResult">,
): Readonly<{
  kind: "babylon-native-block-checked-layout-inventory";
  schemaVersion: 1;
  blocks: readonly BabylonNativeBlockLayoutEntryV1[];
  visualGroups: readonly BabylonNativeBlockVisualGroupInventoryV1[];
}> {
  const code = "WORLDKIT_NATIVE_BLOCK_CHECKED_LAYOUT_INVENTORY_INVALID";
  if (
    input.kind !== "babylon-native-block-checked-layout" ||
    input.schemaVersion !== 1 ||
    input.checkResult.kind !== "babylon-native-block-profile-check-result" ||
    input.checkResult.schemaVersion !== 1 ||
    input.checkResult.outcome !== "passed" ||
    input.checkResult.diagnostics.some(({ severity }) => severity !== "warning") ||
    input.layout.issues.length !== 0
  ) return fail(code, "Layout must be the passed checked Profile Layout");
  requireStrictlySortedUnique(
    input.layout.blocks.map(({ id }) => id),
    code,
    "layout.blocks/id",
  );
  requireStrictlySortedUnique(
    input.checkResult.visualGroups.map(({ id }) => id),
    code,
    "checkResult.visualGroups/id",
  );
  const derived = derivedVisualGroups(input.layout.blocks);
  if (!isEqual(derived, input.checkResult.visualGroups)) {
    return fail(code, "checked visual-group inventory is stale relative to Layout blocks");
  }
  return Object.freeze({
    kind: "babylon-native-block-checked-layout-inventory",
    schemaVersion: 1,
    blocks: input.layout.blocks,
    visualGroups: input.checkResult.visualGroups,
  });
}

export function hashBabylonNativeBlockCheckedLayoutInventoryV1(
  input: Pick<BabylonNativeBlockCheckedLayoutV1, "kind" | "schemaVersion" | "layout" | "checkResult">,
): Sha256HashV1 {
  return sha256CanonicalJson(checkedLayoutInventory(input)) as Sha256HashV1;
}

export function bindNativeBlockAuthoringManifestToCheckedLayoutV1(
  input: Readonly<{
    reconstructionCase: WorldReconstructionCaseV1;
    authoringManifest: NativeBlockAuthoringManifestV1;
    authoringManifestHash: Sha256HashV1;
    checkedLayout: Pick<
      BabylonNativeBlockCheckedLayoutV1,
      "kind" | "schemaVersion" | "layout" | "checkResult"
    >;
    checkedLayoutInventoryHash: Sha256HashV1;
    contributionHash: Sha256HashV1;
    frozenContributionHash: Sha256HashV1;
  }>,
): NativeBlockAuthoringLayoutBindingV1 {
  const code = "WORLDKIT_NATIVE_BLOCK_AUTHORING_LAYOUT_BINDING_INVALID";
  const authoringManifest = parseNativeBlockAuthoringManifestV1(
    input.authoringManifest,
  );
  let reconstructionCase: WorldReconstructionCaseV1;
  try {
    reconstructionCase = parseWorldReconstructionCaseV1(
      input.reconstructionCase,
    );
  } catch {
    return fail(code, "reconstructionCase must be a closed WorldReconstructionCaseV1");
  }
  const semanticTargetRefs = reconstructionCase.expected.semanticSilhouetteTargets
    .map(({ acceptanceTargetRef }) => acceptanceTargetRef);
  const caseHash = hashWorldReconstructionCaseV1(
    reconstructionCase,
  ) as Sha256HashV1;
  const authoringManifestHash = hash(
    input.authoringManifestHash,
    code,
    "authoringManifestHash",
  );
  const checkedLayoutInventoryHash = hash(
    input.checkedLayoutInventoryHash,
    code,
    "checkedLayoutInventoryHash",
  );
  const contributionHash = hash(
    input.contributionHash,
    code,
    "contributionHash",
  );
  const frozenContributionHash = hash(
    input.frozenContributionHash,
    code,
    "frozenContributionHash",
  );
  let actualCheckedLayoutInventoryHash: Sha256HashV1;
  try {
    actualCheckedLayoutInventoryHash =
      hashBabylonNativeBlockCheckedLayoutInventoryV1(input.checkedLayout);
  } catch {
    return fail(code, "checked Layout inventory is invalid or stale");
  }
  if (
    authoringManifestHash !== hashNativeBlockAuthoringManifestV1(authoringManifest) ||
    checkedLayoutInventoryHash !== actualCheckedLayoutInventoryHash ||
    contributionHash !== frozenContributionHash
  ) return fail(code, "authoring, Layout or Contribution identity is stale");
  const manifestTargetRefs = [...authoringManifest.visualGroups]
    .map(({ acceptanceTargetRef }) => acceptanceTargetRef)
    .sort(stableCompare);
  if (!isEqual(semanticTargetRefs, manifestTargetRefs)) {
    return fail(
      code,
      "Manifest must bind every Case semantic silhouette target exactly once",
    );
  }
  const manifestGroupIds = authoringManifest.visualGroups.map(
    ({ visualGroupId }) => visualGroupId,
  );
  const checkedGroupIds = input.checkedLayout.checkResult.visualGroups.map(
    ({ id }) => id,
  );
  if (!isEqual(manifestGroupIds, checkedGroupIds)) {
    return fail(code, "Manifest and checked Layout visual groups must be a bijection");
  }
  const manifestGroupIdByTargetRef = new Map(
    authoringManifest.visualGroups.map(({ acceptanceTargetRef, visualGroupId }) =>
      [acceptanceTargetRef, visualGroupId] as const),
  );
  if (reconstructionCase.expected.semanticSilhouetteTargets.some(
    ({ acceptanceTargetRef, visualGroupId }) =>
      manifestGroupIdByTargetRef.get(acceptanceTargetRef) !== visualGroupId,
  )) {
    return fail(
      code,
      "Manifest target-to-group mapping must match the Case semantic silhouette mapping",
    );
  }
  const checkedGroupById = new Map(
    input.checkedLayout.checkResult.visualGroups.map((group) =>
      [group.id, group] as const),
  );
  const visualGroups = [...authoringManifest.visualGroups]
    .sort((left, right) => stableCompare(
      left.acceptanceTargetRef,
      right.acceptanceTargetRef,
    ))
    .map((row) => {
      const checkedGroup = checkedGroupById.get(row.visualGroupId);
      if (isNil(checkedGroup)) {
        return fail(code, "checked Layout visual group is missing");
      }
      return Object.freeze({
        acceptanceTargetRef: row.acceptanceTargetRef,
        visualGroupId: row.visualGroupId,
        semanticClassId: row.semanticClassId,
        identityColorHex: row.identityColorHex,
        blockIds: Object.freeze([...checkedGroup.blockIds]),
        paletteRoles: Object.freeze([...checkedGroup.paletteRoles]),
        minimumMetersXYZ: Object.freeze([...checkedGroup.minimumMetersXYZ]) as
          BabylonNativeBlockVisualGroupInventoryV1["minimumMetersXYZ"],
        maximumMetersXYZ: Object.freeze([...checkedGroup.maximumMetersXYZ]) as
          BabylonNativeBlockVisualGroupInventoryV1["maximumMetersXYZ"],
      });
    });
  return Object.freeze({
    kind: "native-block-authoring-layout-binding",
    openingCamera: authoringManifest.openingCamera,
    schemaVersion: 1,
    caseHash,
    authoringManifestHash,
    checkedLayoutInventoryHash,
    contributionHash,
    visualGroups: Object.freeze(visualGroups),
  });
}
