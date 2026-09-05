export type WhiteboxCaptureViewV1 = "front" | "right" | "back";

export const MAXIMUM_VISUAL_CAPTURE_GROUPS_V1 = 5 as const;
export const WHITEBOX_TRIVIEW_BACKGROUND_COLOR_V1 = "#DDE8EE" as const;
export const WHITEBOX_TRIVIEW_BACKGROUND_RGB_V1 = [221, 232, 238] as const;
export const WHITEBOX_TRIVIEW_BACKGROUND_TOLERANCE_V1 = 12 as const;

export type VisualCaptureGroupRoleV1 =
  | "primary-subject"
  | "key-object"
  | "primary-landmark"
  | "secondary-landmark"
  | "background-identity";

export interface VisualTargetMappingV1 {
  readonly visualTargetId: string;
  readonly runtimeEntityIds: readonly string[];
  readonly frontDirectionWorldXZ: readonly [number, number];
}

export interface VisualCaptureGroupV1 extends VisualTargetMappingV1 {
  readonly role: VisualCaptureGroupRoleV1;
  readonly semanticClassId: string;
  readonly identityColor: `#${string}`;
}

export interface SceneBriefImplementationMapDraftV1 {
  readonly kind: "worldkit-scene-brief-implementation-map-draft";
  readonly schemaVersion: 1;
  readonly sceneId: string;
  readonly authoringSpecId: string;
  readonly visualTargetMappings: readonly VisualTargetMappingV1[];
}

export interface SceneBriefImplementationMapV1 {
  readonly kind: "worldkit-scene-brief-implementation-map";
  readonly schemaVersion: 1;
  readonly sceneId: string;
  readonly sceneBriefHash: `sha256:${string}`;
  readonly authoringSpecId: string;
  readonly authoringSpecHash: `sha256:${string}`;
  readonly visualTargetMappings: readonly VisualTargetMappingV1[];
  readonly visualCaptureGroups: readonly VisualCaptureGroupV1[];
}

export interface WhiteboxTriviewCaptureV1 {
  readonly kind: "worldkit-whitebox-triview-capture";
  readonly schemaVersion: 1;
  readonly visualTargetId: string;
  readonly runtimeEntityIds: readonly string[];
  readonly views: readonly ["front", "right", "back"];
  readonly imageDataUri: string;
  readonly inspection: WhiteboxTriviewInspectionV1;
}

export interface WhiteboxTriviewInspectionV1 {
  readonly widthPixels: number;
  readonly heightPixels: number;
  readonly foregroundPixelCount: number;
  readonly minimumForegroundPixelCount: number;
  readonly foregroundBoundsPixels: Readonly<{
    minimumPixelsXY: readonly [number, number];
    maximumPixelsXY: readonly [number, number];
  }> | null;
  readonly viewInspections: readonly [
    WhiteboxTriviewViewInspectionV1,
    WhiteboxTriviewViewInspectionV1,
    WhiteboxTriviewViewInspectionV1,
  ];
  readonly isRenderable: boolean;
}

export interface WhiteboxTriviewViewInspectionV1 {
  readonly view: WhiteboxCaptureViewV1;
  readonly foregroundPixelCount: number;
  readonly minimumForegroundPixelCount: number;
  readonly foregroundBoundsPixels: Readonly<{
    minimumPixelsXY: readonly [number, number];
    maximumPixelsXY: readonly [number, number];
  }> | null;
  readonly isRenderable: boolean;
}

/**
 * Measures actual target coverage against the fixed review background instead
 * of sampling a few RGB values. The fixed tolerance excludes antialiasing noise
 * and the effectively invisible dependency meshes retained by the Babylon
 * tri-view renderer.
 */
export function inspectWhiteboxTriviewPixelsV1(
  pixelsRgba: Uint8ClampedArray,
  widthPixels: number,
  heightPixels: number,
): WhiteboxTriviewInspectionV1 {
  if (!Number.isSafeInteger(widthPixels) || widthPixels < 1 ||
      !Number.isSafeInteger(heightPixels) || heightPixels < 1) {
    throw new RangeError("Whitebox tri-view dimensions must be positive safe integers.");
  }
  const totalPixelCount = widthPixels * heightPixels;
  if (pixelsRgba.length !== totalPixelCount * 4) {
    throw new RangeError("Whitebox tri-view RGBA byte length does not match its dimensions.");
  }
  if (widthPixels % 3 !== 0) {
    throw new RangeError("Whitebox tri-view width must contain three equal panels.");
  }
  const panelWidthPixels = widthPixels / 3;
  const panelPixelCount = panelWidthPixels * heightPixels;
  const minimumPanelForegroundPixelCount = Math.min(
    panelPixelCount,
    Math.max(64, Math.ceil(panelPixelCount * 0.0001)),
  );
  const panelForegroundPixelCounts = [0, 0, 0];
  const panelMinimumX = [panelWidthPixels, panelWidthPixels, panelWidthPixels];
  const panelMinimumY = [heightPixels, heightPixels, heightPixels];
  const panelMaximumX = [-1, -1, -1];
  const panelMaximumY = [-1, -1, -1];
  let foregroundPixelCount = 0;
  let minimumX = widthPixels;
  let minimumY = heightPixels;
  let maximumX = -1;
  let maximumY = -1;
  for (let pixel = 0; pixel < totalPixelCount; pixel += 1) {
    const offset = pixel * 4;
    if (pixelsRgba[offset + 3]! < 128) continue;
    const differsFromBackground = Math.max(
      Math.abs(pixelsRgba[offset]! - WHITEBOX_TRIVIEW_BACKGROUND_RGB_V1[0]),
      Math.abs(pixelsRgba[offset + 1]! - WHITEBOX_TRIVIEW_BACKGROUND_RGB_V1[1]),
      Math.abs(pixelsRgba[offset + 2]! - WHITEBOX_TRIVIEW_BACKGROUND_RGB_V1[2]),
    ) >= WHITEBOX_TRIVIEW_BACKGROUND_TOLERANCE_V1;
    if (!differsFromBackground) continue;
    foregroundPixelCount += 1;
    const x = pixel % widthPixels;
    const y = Math.floor(pixel / widthPixels);
    const panelIndex = Math.min(2, Math.floor(x / panelWidthPixels));
    const panelX = x - panelIndex * panelWidthPixels;
    panelForegroundPixelCounts[panelIndex]! += 1;
    panelMinimumX[panelIndex] = Math.min(panelMinimumX[panelIndex]!, panelX);
    panelMinimumY[panelIndex] = Math.min(panelMinimumY[panelIndex]!, y);
    panelMaximumX[panelIndex] = Math.max(panelMaximumX[panelIndex]!, panelX);
    panelMaximumY[panelIndex] = Math.max(panelMaximumY[panelIndex]!, y);
    minimumX = Math.min(minimumX, x);
    minimumY = Math.min(minimumY, y);
    maximumX = Math.max(maximumX, x);
    maximumY = Math.max(maximumY, y);
  }
  const inspectPanel = (
    view: WhiteboxCaptureViewV1,
    panelIndex: number,
  ): WhiteboxTriviewViewInspectionV1 => ({
    view,
    foregroundPixelCount: panelForegroundPixelCounts[panelIndex]!,
    minimumForegroundPixelCount: minimumPanelForegroundPixelCount,
    foregroundBoundsPixels: panelForegroundPixelCounts[panelIndex] === 0
      ? null
      : {
          minimumPixelsXY: [panelMinimumX[panelIndex]!, panelMinimumY[panelIndex]!],
          maximumPixelsXY: [panelMaximumX[panelIndex]!, panelMaximumY[panelIndex]!],
        },
    isRenderable: panelForegroundPixelCounts[panelIndex]! >= minimumPanelForegroundPixelCount,
  });
  const viewInspections = [
    inspectPanel("front", 0),
    inspectPanel("right", 1),
    inspectPanel("back", 2),
  ] as const;
  return {
    widthPixels,
    heightPixels,
    foregroundPixelCount,
    minimumForegroundPixelCount: minimumPanelForegroundPixelCount * 3,
    foregroundBoundsPixels: foregroundPixelCount === 0
      ? null
      : {
          minimumPixelsXY: [minimumX, minimumY],
          maximumPixelsXY: [maximumX, maximumY],
        },
    viewInspections,
    isRenderable: viewInspections.every(({ isRenderable }) => isRenderable),
  };
}

export const WORLDKIT_AUTHORING_CAPTURE_PROTOCOL_VERSION = 1 as const;

/**
 * Authoring-only structural capture surface. This intentionally remains
 * separate from the public Runtime/Route/Camera/Control Browser DTO.
 */
export interface WorldkitAuthoringCaptureApiV1 {
  readonly version: typeof WORLDKIT_AUTHORING_CAPTURE_PROTOCOL_VERSION;
  configureVisualCaptureGroups(
    groups: readonly VisualCaptureGroupV1[],
  ): readonly VisualCaptureGroupV1[];
  listVisualCaptureGroups(): readonly VisualCaptureGroupV1[];
  captureWhiteboxTriview(visualTargetId: string): WhiteboxTriviewCaptureV1;
}

export interface WhiteboxTriviewManifestV1 {
  readonly kind: "worldkit-whitebox-triview-manifest";
  readonly schemaVersion: 1;
  readonly worldBuildIdentityHash: `sha256:${string}`;
  readonly whiteboxTriviews: readonly (VisualCaptureGroupV1 & {
    readonly views: readonly ["front", "right", "back"];
    readonly imageUri: string;
  })[];
}

export interface HostedVisualContractDiagnosticV1 {
  readonly code: string;
  readonly instancePath: string;
  readonly message: string;
}

const ID = /^[a-z0-9][a-z0-9-]{2,79}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const COLOR = /^#[a-fA-F0-9]{6}$/;
const VISUAL_CAPTURE_ROLES = new Set<VisualCaptureGroupRoleV1>([
  "primary-subject",
  "key-object",
  "primary-landmark",
  "secondary-landmark",
  "background-identity",
]);

function diagnostic(
  code: string,
  instancePath: string,
  message: string,
): HostedVisualContractDiagnosticV1 {
  return { code, instancePath, message };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function exactKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  instancePath: string,
): HostedVisualContractDiagnosticV1[] {
  const allowed = new Set(allowedKeys);
  return Object.keys(value)
    .filter((key) => !allowed.has(key))
    .sort()
    .map((key) => diagnostic(
      "HOSTED_VISUAL_UNKNOWN_FIELD",
      `${instancePath}/${key}`,
      `Unknown Hosted visual contract field '${key}'.`,
    ));
}

function validIdArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length > 0 &&
    value.every((item) => typeof item === "string" && ID.test(item)) &&
    new Set(value).size === value.length;
}

export function isValidVisualTargetFrontDirectionWorldXZV1(value: unknown): value is readonly [number, number] {
  return Array.isArray(value) && value.length === 2 &&
    [[0, -1], [-1, 0], [0, 1], [1, 0]].some(
      ([x, z]) => value[0] === x && value[1] === z,
    );
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function validateVisualTargetMappings(
  value: unknown,
  instancePath: string,
): HostedVisualContractDiagnosticV1[] {
  if (!Array.isArray(value)) {
    return [diagnostic(
      "HOSTED_VISUAL_MAPPINGS_REQUIRED",
      instancePath,
      "visualTargetMappings must be an array.",
    )];
  }
  const diagnostics: HostedVisualContractDiagnosticV1[] = [];
  if (value.length < 1 || value.length > MAXIMUM_VISUAL_CAPTURE_GROUPS_V1) {
    diagnostics.push(diagnostic(
      "HOSTED_VISUAL_MAPPING_COUNT_INVALID",
      instancePath,
      `visualTargetMappings must contain 1-${MAXIMUM_VISUAL_CAPTURE_GROUPS_V1} entries.`,
    ));
  }
  const visualTargetIds: string[] = [];
  const runtimeEntityIds: string[] = [];
  value.forEach((candidate, index) => {
    const path = `${instancePath}/${index}`;
    const mapping = record(candidate);
    if (mapping === undefined) {
      diagnostics.push(diagnostic(
        "HOSTED_VISUAL_MAPPING_INVALID",
        path,
        "Visual target mapping must be an object.",
      ));
      return;
    }
    diagnostics.push(...exactKeys(mapping, ["visualTargetId", "runtimeEntityIds", "frontDirectionWorldXZ"], path));
    if (typeof mapping.visualTargetId !== "string" || !ID.test(mapping.visualTargetId)) {
      diagnostics.push(diagnostic(
        "HOSTED_VISUAL_TARGET_ID_INVALID",
        `${path}/visualTargetId`,
        "visualTargetId is invalid.",
      ));
    } else {
      visualTargetIds.push(mapping.visualTargetId);
    }
    if (!validIdArray(mapping.runtimeEntityIds)) {
      diagnostics.push(diagnostic(
        "HOSTED_VISUAL_RUNTIME_ENTITY_IDS_INVALID",
        `${path}/runtimeEntityIds`,
        "runtimeEntityIds must be a non-empty unique ID array.",
      ));
    } else {
      runtimeEntityIds.push(...mapping.runtimeEntityIds);
    }
    if (!isValidVisualTargetFrontDirectionWorldXZV1(mapping.frontDirectionWorldXZ)) {
      diagnostics.push(diagnostic(
        "HOSTED_VISUAL_FRONT_DIRECTION_INVALID",
        `${path}/frontDirectionWorldXZ`,
        "frontDirectionWorldXZ must be one cardinal unit direction in world XZ coordinates.",
      ));
    }
  });
  if (new Set(visualTargetIds).size !== visualTargetIds.length) {
    diagnostics.push(diagnostic(
      "HOSTED_VISUAL_TARGET_ID_REUSED",
      instancePath,
      "visualTargetId may appear in only one mapping.",
    ));
  }
  if (new Set(runtimeEntityIds).size !== runtimeEntityIds.length) {
    diagnostics.push(diagnostic(
      "HOSTED_VISUAL_RUNTIME_ENTITY_REUSED",
      instancePath,
      "A runtime entity may appear in only one visual target mapping.",
    ));
  }
  return diagnostics;
}

function validateVisualCaptureGroup(
  value: unknown,
  instancePath: string,
  allowedExtraKeys: readonly string[] = [],
): HostedVisualContractDiagnosticV1[] {
  const group = record(value);
  if (group === undefined) {
    return [diagnostic(
      "HOSTED_VISUAL_GROUP_INVALID",
      instancePath,
      "Visual capture group must be an object.",
    )];
  }
  const diagnostics = exactKeys(group, [
    "visualTargetId",
    "runtimeEntityIds",
    "role",
    "semanticClassId",
    "identityColor",
    "frontDirectionWorldXZ",
    ...allowedExtraKeys,
  ], instancePath);
  if (typeof group.visualTargetId !== "string" || !ID.test(group.visualTargetId)) {
    diagnostics.push(diagnostic(
      "HOSTED_VISUAL_TARGET_ID_INVALID",
      `${instancePath}/visualTargetId`,
      "visualTargetId is invalid.",
    ));
  }
  if (!validIdArray(group.runtimeEntityIds)) {
    diagnostics.push(diagnostic(
      "HOSTED_VISUAL_RUNTIME_ENTITY_IDS_INVALID",
      `${instancePath}/runtimeEntityIds`,
      "runtimeEntityIds must be a non-empty unique ID array.",
    ));
  }
  if (typeof group.role !== "string" ||
      !VISUAL_CAPTURE_ROLES.has(group.role as VisualCaptureGroupRoleV1)) {
    diagnostics.push(diagnostic(
      "HOSTED_VISUAL_ROLE_INVALID",
      `${instancePath}/role`,
      "Visual capture role is invalid.",
    ));
  }
  if (typeof group.semanticClassId !== "string" || !group.semanticClassId.trim()) {
    diagnostics.push(diagnostic(
      "HOSTED_VISUAL_SEMANTIC_CLASS_INVALID",
      `${instancePath}/semanticClassId`,
      "semanticClassId is invalid.",
    ));
  }
  if (typeof group.identityColor !== "string" || !COLOR.test(group.identityColor)) {
    diagnostics.push(diagnostic(
      "HOSTED_VISUAL_IDENTITY_COLOR_INVALID",
      `${instancePath}/identityColor`,
      "identityColor must be a six-digit hex color.",
    ));
  }
  if (!isValidVisualTargetFrontDirectionWorldXZV1(group.frontDirectionWorldXZ)) {
    diagnostics.push(diagnostic(
      "HOSTED_VISUAL_FRONT_DIRECTION_INVALID",
      `${instancePath}/frontDirectionWorldXZ`,
      "frontDirectionWorldXZ must be one cardinal unit direction in world XZ coordinates.",
    ));
  }
  return diagnostics;
}

export function validateVisualCaptureGroupsV1(
  value: unknown,
): readonly HostedVisualContractDiagnosticV1[] {
  if (!Array.isArray(value)) {
    return [diagnostic(
      "HOSTED_VISUAL_GROUPS_REQUIRED",
      "",
      "Visual capture groups must be an array.",
    )];
  }
  const diagnostics: HostedVisualContractDiagnosticV1[] = [];
  if (value.length < 1 || value.length > MAXIMUM_VISUAL_CAPTURE_GROUPS_V1) {
    diagnostics.push(diagnostic(
      "HOSTED_VISUAL_GROUP_COUNT_INVALID",
      "",
      `Visual capture groups must contain 1-${MAXIMUM_VISUAL_CAPTURE_GROUPS_V1} entries.`,
    ));
  }
  const visualTargetIds: string[] = [];
  const runtimeEntityIds: string[] = [];
  let primarySubjectCount = 0;
  value.forEach((group, index) => {
    diagnostics.push(...validateVisualCaptureGroup(group, `/${index}`));
    const source = record(group);
    if (typeof source?.visualTargetId === "string" && ID.test(source.visualTargetId)) {
      visualTargetIds.push(source.visualTargetId);
    }
    if (validIdArray(source?.runtimeEntityIds)) runtimeEntityIds.push(...source.runtimeEntityIds);
    if (source?.role === "primary-subject") primarySubjectCount += 1;
  });
  if (new Set(visualTargetIds).size !== visualTargetIds.length) {
    diagnostics.push(diagnostic(
      "HOSTED_VISUAL_TARGET_ID_REUSED",
      "",
      "visualTargetId may appear in only one visual capture group.",
    ));
  }
  if (new Set(runtimeEntityIds).size !== runtimeEntityIds.length) {
    diagnostics.push(diagnostic(
      "HOSTED_VISUAL_RUNTIME_ENTITY_REUSED",
      "",
      "A runtime entity may appear in only one visual capture group.",
    ));
  }
  if (primarySubjectCount !== 1) {
    diagnostics.push(diagnostic(
      "HOSTED_VISUAL_PRIMARY_SUBJECT_COUNT_INVALID",
      "",
      "Visual capture groups must contain exactly one primary subject.",
    ));
  }
  return diagnostics;
}

const DRAFT_KEYS = [
  "kind",
  "schemaVersion",
  "sceneId",
  "authoringSpecId",
  "visualTargetMappings",
] as const;

const FINAL_KEYS = [
  "kind",
  "schemaVersion",
  "sceneId",
  "sceneBriefHash",
  "authoringSpecId",
  "authoringSpecHash",
  "visualTargetMappings",
  "visualCaptureGroups",
] as const;

export function validateSceneBriefImplementationMapDraftV1(
  value: unknown,
): readonly HostedVisualContractDiagnosticV1[] {
  const draft = record(value);
  if (draft === undefined) {
    return [diagnostic(
      "HOSTED_VISUAL_DRAFT_OBJECT_REQUIRED",
      "",
      "Scene Brief implementation-map draft must be an object.",
    )];
  }
  const diagnostics = exactKeys(draft, DRAFT_KEYS, "");
  if (draft.kind !== "worldkit-scene-brief-implementation-map-draft") {
    diagnostics.push(diagnostic(
      "HOSTED_VISUAL_DRAFT_KIND_INVALID",
      "/kind",
      "Scene Brief implementation-map draft kind is invalid.",
    ));
  }
  if (draft.schemaVersion !== 1) {
    diagnostics.push(diagnostic(
      "HOSTED_VISUAL_SCHEMA_VERSION_INVALID",
      "/schemaVersion",
      "Scene Brief implementation-map draft schemaVersion is invalid.",
    ));
  }
  if (typeof draft.sceneId !== "string" || !ID.test(draft.sceneId)) {
    diagnostics.push(diagnostic("HOSTED_VISUAL_SCENE_ID_INVALID", "/sceneId", "sceneId is invalid."));
  }
  if (typeof draft.authoringSpecId !== "string" || !ID.test(draft.authoringSpecId)) {
    diagnostics.push(diagnostic(
      "HOSTED_VISUAL_AUTHORING_SPEC_ID_INVALID",
      "/authoringSpecId",
      "authoringSpecId is invalid.",
    ));
  }
  diagnostics.push(...validateVisualTargetMappings(
    draft.visualTargetMappings,
    "/visualTargetMappings",
  ));
  return diagnostics;
}

export function validateSceneBriefImplementationMapV1(
  value: unknown,
): readonly HostedVisualContractDiagnosticV1[] {
  const finalMap = record(value);
  if (finalMap === undefined) {
    return [diagnostic(
      "HOSTED_VISUAL_FINAL_OBJECT_REQUIRED",
      "",
      "Final Scene Brief implementation map must be an object.",
    )];
  }
  const diagnostics = exactKeys(finalMap, FINAL_KEYS, "");
  if (finalMap.kind !== "worldkit-scene-brief-implementation-map") {
    diagnostics.push(diagnostic(
      "HOSTED_VISUAL_FINAL_KIND_INVALID",
      "/kind",
      "Final Scene Brief implementation map kind is invalid.",
    ));
  }
  if (finalMap.schemaVersion !== 1) {
    diagnostics.push(diagnostic(
      "HOSTED_VISUAL_SCHEMA_VERSION_INVALID",
      "/schemaVersion",
      "Final Scene Brief implementation map schemaVersion is invalid.",
    ));
  }
  if (typeof finalMap.sceneId !== "string" || !ID.test(finalMap.sceneId)) {
    diagnostics.push(diagnostic("HOSTED_VISUAL_SCENE_ID_INVALID", "/sceneId", "sceneId is invalid."));
  }
  if (typeof finalMap.authoringSpecId !== "string" || !ID.test(finalMap.authoringSpecId)) {
    diagnostics.push(diagnostic(
      "HOSTED_VISUAL_AUTHORING_SPEC_ID_INVALID",
      "/authoringSpecId",
      "authoringSpecId is invalid.",
    ));
  }
  if (typeof finalMap.sceneBriefHash !== "string" || !HASH.test(finalMap.sceneBriefHash)) {
    diagnostics.push(diagnostic(
      "HOSTED_VISUAL_SCENE_BRIEF_HASH_INVALID",
      "/sceneBriefHash",
      "sceneBriefHash is invalid.",
    ));
  }
  if (typeof finalMap.authoringSpecHash !== "string" || !HASH.test(finalMap.authoringSpecHash)) {
    diagnostics.push(diagnostic(
      "HOSTED_VISUAL_AUTHORING_SPEC_HASH_INVALID",
      "/authoringSpecHash",
      "authoringSpecHash is invalid.",
    ));
  }
  diagnostics.push(...validateVisualTargetMappings(
    finalMap.visualTargetMappings,
    "/visualTargetMappings",
  ));
  const groupDiagnostics = validateVisualCaptureGroupsV1(finalMap.visualCaptureGroups)
    .map((entry) => ({
      ...entry,
      instancePath: `/visualCaptureGroups${entry.instancePath}`,
    }));
  diagnostics.push(...groupDiagnostics);

  if (Array.isArray(finalMap.visualTargetMappings) &&
      Array.isArray(finalMap.visualCaptureGroups)) {
    const mappings = finalMap.visualTargetMappings
      .map(record)
      .filter((entry): entry is Record<string, unknown> => entry !== undefined);
    const groups = finalMap.visualCaptureGroups
      .map(record)
      .filter((entry): entry is Record<string, unknown> => entry !== undefined);
    const groupsByVisualTargetId = new Map(
      groups
        .filter((entry) => typeof entry.visualTargetId === "string")
        .map((entry) => [entry.visualTargetId as string, entry]),
    );
    mappings.forEach((mapping, index) => {
      if (typeof mapping.visualTargetId !== "string" ||
          !validIdArray(mapping.runtimeEntityIds)) return;
      const group = groupsByVisualTargetId.get(mapping.visualTargetId);
      if (group === undefined || !validIdArray(group.runtimeEntityIds) ||
          !sameStringSet(mapping.runtimeEntityIds, group.runtimeEntityIds) ||
          !isValidVisualTargetFrontDirectionWorldXZV1(mapping.frontDirectionWorldXZ) ||
          !isValidVisualTargetFrontDirectionWorldXZV1(group.frontDirectionWorldXZ) ||
          mapping.frontDirectionWorldXZ[0] !== group.frontDirectionWorldXZ[0] ||
          mapping.frontDirectionWorldXZ[1] !== group.frontDirectionWorldXZ[1]) {
        const groupIndex = groups.findIndex((candidate) =>
          candidate.visualTargetId === mapping.visualTargetId);
        diagnostics.push(diagnostic(
          "HOSTED_VISUAL_MAPPING_GROUP_MISMATCH",
          groupIndex < 0
            ? `/visualTargetMappings/${index}/visualTargetId`
            : `/visualCaptureGroups/${groupIndex}`,
          `Visual target '${mapping.visualTargetId}' mapping and capture group must contain the same runtime entities and front direction.`,
        ));
      }
    });
    const mappingIds = mappings
      .map((entry) => entry.visualTargetId)
      .filter((entry): entry is string => typeof entry === "string");
    const groupIds = groups
      .map((entry) => entry.visualTargetId)
      .filter((entry): entry is string => typeof entry === "string");
    if (!sameStringSet(mappingIds, groupIds)) {
      diagnostics.push(diagnostic(
        "HOSTED_VISUAL_MAPPING_GROUP_SET_MISMATCH",
        "/visualCaptureGroups",
        "visualTargetMappings and visualCaptureGroups must contain the same visualTargetIds.",
      ));
    }
  }
  return diagnostics;
}

export function validateWhiteboxTriviewManifestV1(
  value: unknown,
): readonly HostedVisualContractDiagnosticV1[] {
  const manifest = record(value);
  if (manifest === undefined) {
    return [diagnostic(
      "HOSTED_VISUAL_TRIVIEW_MANIFEST_OBJECT_REQUIRED",
      "",
      "Whitebox tri-view manifest must be an object.",
    )];
  }
  const diagnostics = exactKeys(
    manifest,
    ["kind", "schemaVersion", "worldBuildIdentityHash", "whiteboxTriviews"],
    "",
  );
  if (manifest.kind !== "worldkit-whitebox-triview-manifest") {
    diagnostics.push(diagnostic(
      "HOSTED_VISUAL_TRIVIEW_KIND_INVALID",
      "/kind",
      "Whitebox tri-view manifest kind is invalid.",
    ));
  }
  if (manifest.schemaVersion !== 1) {
    diagnostics.push(diagnostic(
      "HOSTED_VISUAL_SCHEMA_VERSION_INVALID",
      "/schemaVersion",
      "Whitebox tri-view manifest schemaVersion is invalid.",
    ));
  }
  if (
    typeof manifest.worldBuildIdentityHash !== "string" ||
    !HASH.test(manifest.worldBuildIdentityHash)
  ) {
    diagnostics.push(diagnostic(
      "HOSTED_VISUAL_WORLD_BUILD_IDENTITY_HASH_INVALID",
      "/worldBuildIdentityHash",
      "worldBuildIdentityHash is invalid.",
    ));
  }
  if (!Array.isArray(manifest.whiteboxTriviews)) {
    diagnostics.push(diagnostic(
      "HOSTED_VISUAL_TRIVIEWS_REQUIRED",
      "/whiteboxTriviews",
      "whiteboxTriviews must be an array.",
    ));
    return diagnostics;
  }
  const groupDiagnostics = validateVisualCaptureGroupsV1(
    manifest.whiteboxTriviews.map((entry) => {
      const source = record(entry);
      if (source === undefined) return entry;
      const { views: _views, imageUri: _imageUri, ...group } = source;
      return group;
    }),
  ).map((entry) => ({
    ...entry,
    instancePath: `/whiteboxTriviews${entry.instancePath}`,
  }));
  diagnostics.push(...groupDiagnostics);
  manifest.whiteboxTriviews.forEach((entry, index) => {
    const path = `/whiteboxTriviews/${index}`;
    diagnostics.push(...validateVisualCaptureGroup(entry, path, ["views", "imageUri"]));
    const source = record(entry);
    if (source === undefined) return;
    if (!Array.isArray(source.views) || source.views.join(",") !== "front,right,back") {
      diagnostics.push(diagnostic(
        "HOSTED_VISUAL_TRIVIEW_ORDER_INVALID",
        `${path}/views`,
        "Tri-view views must be front, right, back in that order.",
      ));
    }
    const expectedImageUri = typeof source.visualTargetId === "string"
      ? `${source.visualTargetId}/whitebox-triview.png`
      : null;
    if (typeof source.imageUri !== "string" || source.imageUri !== expectedImageUri) {
      diagnostics.push(diagnostic(
        "HOSTED_VISUAL_TRIVIEW_URI_INVALID",
        `${path}/imageUri`,
        "imageUri must be the canonical relative whitebox tri-view PNG URI.",
      ));
    }
  });
  return diagnostics;
}
