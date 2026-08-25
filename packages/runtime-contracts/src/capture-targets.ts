export type WhiteboxCaptureViewV1 = "front" | "right" | "back";

export const MAXIMUM_VISUAL_CAPTURE_TARGETS_V1 = 5 as const;

export type VisualCaptureTargetRoleV1 =
  | "primary-subject"
  | "key-object"
  | "primary-landmark"
  | "secondary-landmark"
  | "background-identity";

export interface RuntimeCaptureTargetV1 {
  id: string;
  visualTargetId: string;
  runtimeEntityIds: readonly string[];
  role: VisualCaptureTargetRoleV1;
  semanticClassId: string;
  identityColor: `#${string}`;
}

export interface SceneBriefImplementationMapV1 {
  kind: "worldkit-scene-brief-implementation-map";
  schemaVersion: 1;
  sceneId: string;
  sceneBriefHash: `sha256:${string}`;
  authoringSpecId: string;
  authoringSpecHash: `sha256:${string}`;
  mappings: readonly {
    visualTargetId: string;
    runtimeEntityIds: readonly string[];
  }[];
  visualCaptureGroups: readonly RuntimeCaptureTargetV1[];
}

export interface CaptureTargetManifestV1 {
  kind: "worldkit-capture-target-manifest";
  schemaVersion: 1;
  sceneId: string;
  sceneBriefHash: `sha256:${string}`;
  executionPlanHash: `sha256:${string}`;
  targets: readonly {
    id: string;
    visualTargetId: string;
    runtimeEntityIds: readonly string[];
    role: VisualCaptureTargetRoleV1;
    semanticClassId: string;
    identityColor: `#${string}`;
    views: readonly WhiteboxCaptureViewV1[];
  }[];
}

export interface WhiteboxTriviewCaptureV1 {
  kind: "worldkit-whitebox-triview-capture";
  schemaVersion: 1;
  targetId: string;
  runtimeEntityIds: readonly string[];
  views: readonly WhiteboxCaptureViewV1[];
  imageDataUrl: string;
}

export const WORLDKIT_AUTHORING_CAPTURE_PROTOCOL_VERSION = 1 as const;

/**
 * Authoring-only structural capture surface. This intentionally remains
 * separate from the exact public Worldkit Browser API used for Runtime,
 * Route, Camera, and Control contracts.
 */
export interface WorldkitAuthoringCaptureApiV1 {
  readonly version: typeof WORLDKIT_AUTHORING_CAPTURE_PROTOCOL_VERSION;
  configureVisualCaptureTargets(
    targets: readonly RuntimeCaptureTargetV1[],
  ): readonly RuntimeCaptureTargetV1[];
  listCaptureTargets(): readonly RuntimeCaptureTargetV1[];
  captureWhiteboxTriview(targetId: string): WhiteboxTriviewCaptureV1;
}

export interface RuntimeTriviewManifestV1 {
  kind: "worldkit-runtime-triview-manifest";
  schemaVersion: 1;
  executionPlanHash: `sha256:${string}`;
  targets: readonly (RuntimeCaptureTargetV1 & {
    views: readonly ["front", "right", "back"];
    imagePath: string;
  })[];
}

const ID = /^[a-z0-9][a-z0-9-]{2,79}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const COLOR = /^#[a-fA-F0-9]{6}$/;

const VISUAL_CAPTURE_ROLES = new Set<VisualCaptureTargetRoleV1>([
  "primary-subject",
  "key-object",
  "primary-landmark",
  "secondary-landmark",
  "background-identity",
]);

export function validateRuntimeCaptureTargetsV1(
  targets: readonly RuntimeCaptureTargetV1[],
): readonly string[] {
  const errors: string[] = [];
  if (targets.length === 0 || targets.length > MAXIMUM_VISUAL_CAPTURE_TARGETS_V1) {
    errors.push(`Visual capture groups must contain 1-${MAXIMUM_VISUAL_CAPTURE_TARGETS_V1} targets including the primary subject.`);
  }
  if (uniq(targets.map(({ id }) => id)).length !== targets.length ||
      uniq(targets.map(({ visualTargetId }) => visualTargetId)).length !== targets.length) {
    errors.push("Visual capture group ids and visualTargetIds must be unique.");
  }
  const allRuntimeEntityIds = targets.flatMap(({ runtimeEntityIds }) => runtimeEntityIds);
  if (uniq(allRuntimeEntityIds).length !== allRuntimeEntityIds.length) {
    errors.push("A runtime entity may belong to only one visual capture group.");
  }
  if (targets.filter(({ role }) => role === "primary-subject").length !== 1) {
    errors.push("Visual capture groups must contain exactly one primary subject.");
  }
  for (const target of targets) {
    if (!ID.test(target.id) || !ID.test(target.visualTargetId) ||
        target.runtimeEntityIds.length === 0 ||
        uniq(target.runtimeEntityIds).length !== target.runtimeEntityIds.length ||
        target.runtimeEntityIds.some((id) => !ID.test(id)) ||
        !VISUAL_CAPTURE_ROLES.has(target.role) || !target.semanticClassId.trim() ||
        !COLOR.test(target.identityColor)) {
      errors.push(`Visual capture group '${target.id}' is invalid.`);
    }
  }
  return errors;
}

export function validateSceneBriefImplementationMapV1(
  value: SceneBriefImplementationMapV1,
): readonly string[] {
  const errors: string[] = [];
  if (value.kind !== "worldkit-scene-brief-implementation-map" || value.schemaVersion !== 1) {
    errors.push("Scene Brief implementation map kind/schemaVersion is invalid.");
  }
  if (!ID.test(value.sceneId) || !ID.test(value.authoringSpecId) ||
      !HASH.test(value.sceneBriefHash) || !HASH.test(value.authoringSpecHash)) {
    errors.push("Scene Brief implementation map identities or hashes are invalid.");
  }
  const targetIds = value.mappings.map(({ visualTargetId }) => visualTargetId);
  if (targetIds.length < 1 || targetIds.length > MAXIMUM_VISUAL_CAPTURE_TARGETS_V1) {
    errors.push(`Scene Brief implementation mappings must contain 1-${MAXIMUM_VISUAL_CAPTURE_TARGETS_V1} targets.`);
  }
  if (uniq(targetIds).length !== targetIds.length) {
    errors.push("Scene Brief implementation target ids must be unique.");
  }
  const mappedRuntimeEntityIds = value.mappings.flatMap(({ runtimeEntityIds }) => runtimeEntityIds);
  if (uniq(mappedRuntimeEntityIds).length !== mappedRuntimeEntityIds.length) {
    errors.push("A runtime entity may belong to only one Scene Brief implementation mapping.");
  }
  for (const mapping of value.mappings) {
    if (!ID.test(mapping.visualTargetId) || mapping.runtimeEntityIds.length === 0 ||
        uniq(mapping.runtimeEntityIds).length !== mapping.runtimeEntityIds.length ||
        mapping.runtimeEntityIds.some((id) => !ID.test(id))) {
      errors.push(`Scene Brief implementation mapping '${mapping.visualTargetId}' is invalid.`);
    }
  }
  errors.push(...validateRuntimeCaptureTargetsV1(value.visualCaptureGroups));
  const captureVisualTargetIds = value.visualCaptureGroups.map(({ visualTargetId }) => visualTargetId);
  if (!isEqual(sortBy(targetIds), sortBy(captureVisualTargetIds))) {
    errors.push("Scene Brief implementation mappings and visual capture groups must contain the same visualTargetIds.");
  }
  const mappingsByTargetId = new Map(
    value.mappings.map((mapping) => [mapping.visualTargetId, mapping.runtimeEntityIds] as const),
  );
  for (const group of value.visualCaptureGroups) {
    const mappedRuntimeEntityIds = mappingsByTargetId.get(group.visualTargetId);
    if (mappedRuntimeEntityIds === undefined ||
        !isEqual(sortBy(mappedRuntimeEntityIds), sortBy(group.runtimeEntityIds))) {
      errors.push(`Visual capture group '${group.id}' must contain the complete Scene Brief target mapping for '${group.visualTargetId}'.`);
    }
  }
  return errors;
}

export function validateCaptureTargetManifestV1(
  value: CaptureTargetManifestV1,
): readonly string[] {
  const errors: string[] = [];
  if (value.kind !== "worldkit-capture-target-manifest" || value.schemaVersion !== 1) {
    errors.push("Capture target manifest kind/schemaVersion is invalid.");
  }
  if (!ID.test(value.sceneId) || !HASH.test(value.sceneBriefHash) || !HASH.test(value.executionPlanHash)) {
    errors.push("Capture target manifest identities or hashes are invalid.");
  }
  errors.push(...validateRuntimeCaptureTargetsV1(value.targets));
  for (const target of value.targets) {
    if (!ID.test(target.id) || !ID.test(target.visualTargetId) ||
        !target.semanticClassId.trim() ||
        !VISUAL_CAPTURE_ROLES.has(target.role) ||
        !COLOR.test(target.identityColor) ||
        target.views.join(",") !== "front,right,back") {
      errors.push(`Capture target '${target.id}' is invalid.`);
    }
  }
  return errors;
}

export function validateRuntimeTriviewManifestV1(
  value: RuntimeTriviewManifestV1,
): readonly string[] {
  const errors: string[] = [];
  if (value.kind !== "worldkit-runtime-triview-manifest" || value.schemaVersion !== 1 ||
      !HASH.test(value.executionPlanHash)) {
    errors.push("Runtime tri-view manifest identity is invalid.");
  }
  errors.push(...validateRuntimeCaptureTargetsV1(value.targets));
  for (const target of value.targets) {
    if (!ID.test(target.id) || !target.semanticClassId.trim() ||
        target.views.join(",") !== "front,right,back" ||
        target.imagePath !== `${target.id}/whitebox-triview.png`) {
      errors.push(`Runtime tri-view target '${target.id}' is invalid.`);
    }
  }
  return errors;
}
import { isEqual, sortBy, uniq } from "lodash-es";
