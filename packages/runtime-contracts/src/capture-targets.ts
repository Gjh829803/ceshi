export type WhiteboxCaptureViewV1 = "front" | "right" | "back";

export const MAXIMUM_VISUAL_CAPTURE_GROUPS_V1 = 5 as const;

export type VisualCaptureGroupRoleV1 =
  | "primary-subject"
  | "key-object"
  | "primary-landmark"
  | "secondary-landmark"
  | "background-identity";

export interface VisualTargetMappingV1 {
  readonly visualTargetId: string;
  readonly runtimeEntityIds: readonly string[];
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
    diagnostics.push(...exactKeys(mapping, ["visualTargetId", "runtimeEntityIds"], path));
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
          !sameStringSet(mapping.runtimeEntityIds, group.runtimeEntityIds)) {
        const groupIndex = groups.findIndex((candidate) =>
          candidate.visualTargetId === mapping.visualTargetId);
        diagnostics.push(diagnostic(
          "HOSTED_VISUAL_MAPPING_GROUP_MISMATCH",
          groupIndex < 0
            ? `/visualTargetMappings/${index}/visualTargetId`
            : `/visualCaptureGroups/${groupIndex}/runtimeEntityIds`,
          `Visual target '${mapping.visualTargetId}' mapping and capture group must contain the same runtime entities.`,
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
