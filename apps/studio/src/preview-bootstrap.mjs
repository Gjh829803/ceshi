import { createHash } from "node:crypto";

const ID = /^[a-z0-9][a-z0-9-]{2,79}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const COLOR = /^#[a-fA-F0-9]{6}$/;
const MAXIMUM_VISUAL_CAPTURE_TARGETS = 5;
const VISUAL_CAPTURE_ROLES = new Set([
  "primary-subject",
  "key-object",
  "primary-landmark",
  "secondary-landmark",
  "background-identity",
]);

export class StudioPreviewBootstrapError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "StudioPreviewBootstrapError";
    this.code = code;
  }
}

function fail(code, message, options) {
  throw new StudioPreviewBootstrapError(code, message, options);
}

export function stringifyStudioCanonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical JSON requires finite numbers.");
    if (Object.is(value, -0)) {
      throw new TypeError("Negative zero is unsupported canonical JSON.");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stringifyStudioCanonicalJson(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stringifyStudioCanonicalJson(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  throw new TypeError("Canonical JSON does not support this value.");
}

function hashCanonical(value) {
  return `sha256:${createHash("sha256")
    .update(stringifyStudioCanonicalJson(value))
    .digest("hex")}`;
}

function parseJsonRecord(source, label) {
  if (typeof source !== "string") {
    fail("STUDIO_PREVIEW_NOT_FOUND", `${label} is missing.`);
  }
  try {
    const value = JSON.parse(source);
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      fail("STUDIO_PREVIEW_AUTHORITY_MISMATCH", `${label} must be a JSON object.`);
    }
    return value;
  } catch (error) {
    if (error instanceof StudioPreviewBootstrapError) throw error;
    fail("STUDIO_PREVIEW_AUTHORITY_MISMATCH", `${label} is not valid JSON.`, {
      cause: error,
    });
  }
}

function attemptStartedAt(record) {
  return record.origin === "existing-scene-brief-world"
    ? record.createdAt
    : record.startedAt;
}

function requireReadyRecord(worldId, record, whiteboxRuntimeAvailable) {
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    fail("STUDIO_PREVIEW_NOT_FOUND", "Studio world record is missing.");
  }
  if (record.id !== worldId || !ID.test(record.id ?? "") || !ID.test(record.sceneId ?? "")) {
    fail("STUDIO_PREVIEW_AUTHORITY_MISMATCH", "Studio world identity is invalid.");
  }
  if (!Number.isInteger(record.attempt) || record.attempt < 1) {
    fail("STUDIO_PREVIEW_NOT_READY", "Studio world has no published attempt.");
  }
  if (whiteboxRuntimeAvailable !== true) {
    fail("STUDIO_PREVIEW_NOT_READY", "Studio world has not published a playable whitebox runtime.");
  }
  if (
    !(
      (typeof record.workflowPolicyVersion === "string" &&
        record.workflowPolicyVersion.trim()) ||
      (Number.isInteger(record.workflowPolicyVersion) &&
        record.workflowPolicyVersion > 0)
    )
  ) {
    fail("STUDIO_PREVIEW_AUTHORITY_MISMATCH", "Studio workflow policy identity is invalid.");
  }
  const startedAt = attemptStartedAt(record);
  if (typeof startedAt !== "string" || !Number.isFinite(Date.parse(startedAt))) {
    fail("STUDIO_PREVIEW_ATTEMPT_DRIFT", "Studio attempt start identity is invalid.");
  }
  if (record.origin === "existing-scene-brief-world" && record.attempt !== 1) {
    fail("STUDIO_PREVIEW_ATTEMPT_DRIFT", "Imported Studio worlds must use synthetic attempt 1.");
  }
  return startedAt;
}

function requireStableRecord(before, after) {
  const stableFields = [
    "id",
    "sceneId",
    "origin",
    "attempt",
    "startedAt",
    "createdAt",
    "status",
    "captureStatus",
    "workflowPolicyVersion",
  ];
  if (stableFields.some((field) => before[field] !== after?.[field])) {
    fail("STUDIO_PREVIEW_ATTEMPT_DRIFT", "Studio attempt changed during Preview assembly.");
  }
}

function validStringArray(value) {
  return Array.isArray(value) && value.length > 0 &&
    value.every((item) => typeof item === "string" && ID.test(item)) &&
    new Set(value).size === value.length;
}

function sameStringSet(left, right) {
  return left.length === right.length &&
    [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function hasExactKeys(value, keys) {
  return Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function validateImplementationMap(value) {
  if (
    value.kind !== "worldkit-scene-brief-implementation-map" ||
    value.schemaVersion !== 1 ||
    !ID.test(value.sceneId ?? "") ||
    !ID.test(value.authoringSpecId ?? "") ||
    !HASH.test(value.sceneBriefHash ?? "") ||
    !HASH.test(value.authoringSpecHash ?? "") ||
    !hasExactKeys(value, [
      "kind",
      "schemaVersion",
      "sceneId",
      "sceneBriefHash",
      "authoringSpecId",
      "authoringSpecHash",
      "visualTargetMappings",
      "visualCaptureGroups",
    ]) ||
    !Array.isArray(value.visualTargetMappings) ||
    !Array.isArray(value.visualCaptureGroups)
  ) return false;

  if (
    value.visualTargetMappings.length < 1 ||
    value.visualTargetMappings.length > MAXIMUM_VISUAL_CAPTURE_TARGETS ||
    value.visualCaptureGroups.length < 1 ||
    value.visualCaptureGroups.length > MAXIMUM_VISUAL_CAPTURE_TARGETS
  ) return false;

  const mappingTargetIds = [];
  const mappedEntityIds = [];
  const mappingsByTargetId = new Map();
  for (const mapping of value.visualTargetMappings) {
    if (
      mapping === null || typeof mapping !== "object" || Array.isArray(mapping) ||
      !hasExactKeys(mapping, ["visualTargetId", "runtimeEntityIds"]) ||
      !ID.test(mapping.visualTargetId ?? "") ||
      !validStringArray(mapping.runtimeEntityIds)
    ) return false;
    mappingTargetIds.push(mapping.visualTargetId);
    mappedEntityIds.push(...mapping.runtimeEntityIds);
    mappingsByTargetId.set(mapping.visualTargetId, mapping.runtimeEntityIds);
  }
  if (
    new Set(mappingTargetIds).size !== mappingTargetIds.length ||
    new Set(mappedEntityIds).size !== mappedEntityIds.length
  ) return false;

  const groupTargetIds = [];
  const groupedEntityIds = [];
  let primarySubjectCount = 0;
  for (const group of value.visualCaptureGroups) {
    if (
      group === null || typeof group !== "object" || Array.isArray(group) ||
      !hasExactKeys(group, [
        "visualTargetId",
        "runtimeEntityIds",
        "role",
        "semanticClassId",
        "identityColor",
      ]) ||
      !ID.test(group.visualTargetId ?? "") ||
      !validStringArray(group.runtimeEntityIds) ||
      !VISUAL_CAPTURE_ROLES.has(group.role) ||
      typeof group.semanticClassId !== "string" || !group.semanticClassId.trim() ||
      !COLOR.test(group.identityColor ?? "")
    ) return false;
    groupTargetIds.push(group.visualTargetId);
    groupedEntityIds.push(...group.runtimeEntityIds);
    if (group.role === "primary-subject") primarySubjectCount += 1;
    const mappedIds = mappingsByTargetId.get(group.visualTargetId);
    if (mappedIds === undefined || !sameStringSet(mappedIds, group.runtimeEntityIds)) {
      return false;
    }
  }
  return new Set(groupTargetIds).size === groupTargetIds.length &&
    new Set(groupedEntityIds).size === groupedEntityIds.length &&
    primarySubjectCount === 1 &&
    sameStringSet(mappingTargetIds, groupTargetIds);
}

function validateEvaluationRun(record, source) {
  // Imported artifacts receive a synthetic local attempt identity. A source
  // evaluation-run describes its original environment, not that local import.
  if (record.origin === "existing-scene-brief-world") return;
  const evaluationRun = parseJsonRecord(source, "evaluation-run.json");
  if (
    evaluationRun.kind !== "worldkit-evaluation-run" ||
    evaluationRun.schemaVersion !== 1 ||
    evaluationRun.caseId !== record.id ||
    evaluationRun.sceneId !== record.sceneId ||
    evaluationRun.workflowPolicyVersion !== record.workflowPolicyVersion ||
    evaluationRun.attempt !== record.attempt ||
    evaluationRun.startedAt !== attemptStartedAt(record)
  ) {
    fail("STUDIO_PREVIEW_ATTEMPT_DRIFT", "Evaluation run does not match the current Studio attempt.");
  }
}

export function assembleStudioPreviewBootstrapV1({
  worldId,
  whiteboxRuntimeAvailable,
  recordBefore,
  recordAfter,
  authoringSource,
  implementationMapSource,
  evaluationRunSource,
}) {
  const startedAt = requireReadyRecord(worldId, recordBefore, whiteboxRuntimeAvailable);
  requireReadyRecord(worldId, recordAfter, whiteboxRuntimeAvailable);
  requireStableRecord(recordBefore, recordAfter);
  validateEvaluationRun(recordBefore, evaluationRunSource);

  const authoringSpec = parseJsonRecord(authoringSource, "authoring.json");
  const implementationMap = parseJsonRecord(
    implementationMapSource,
    "scene-implementation-map.json",
  );
  let authoringSpecHash;
  try {
    authoringSpecHash = hashCanonical(authoringSpec);
  } catch (error) {
    fail(
      "STUDIO_PREVIEW_AUTHORITY_MISMATCH",
      "AuthoringSpec is not valid Canonical JSON.",
      { cause: error },
    );
  }
  if (
    authoringSpec.kind !== "worldkit-authoring-spec" ||
    authoringSpec.schemaVersion !== 4 ||
    authoringSpec.id !== recordBefore.sceneId ||
    !validateImplementationMap(implementationMap) ||
    implementationMap.sceneId !== recordBefore.sceneId ||
    implementationMap.authoringSpecId !== authoringSpec.id ||
    implementationMap.authoringSpecHash !== authoringSpecHash
  ) {
    fail(
      "STUDIO_PREVIEW_AUTHORITY_MISMATCH",
      "AuthoringSpec and final implementation map do not form one closed Preview authority.",
    );
  }

  return structuredClone({
    kind: "worldkit-studio-preview-bootstrap",
    schemaVersion: 1,
    worldId,
    sceneId: recordBefore.sceneId,
    attempt: recordBefore.attempt,
    attemptStartedAt: startedAt,
    authoringSpecHash,
    authoringSpec,
    implementationMap,
  });
}
