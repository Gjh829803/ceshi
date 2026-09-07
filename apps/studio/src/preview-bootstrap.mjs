import { createHash } from "node:crypto";
import { tsImport } from "tsx/esm/api";

const { validateSceneBriefImplementationMapV1 } = await tsImport(
  "@whitebox-world/runtime-contracts", { parentURL: import.meta.url },
);

const ID = /^[a-z0-9][a-z0-9-]{2,79}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;

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

function requireReadyRecord(worldId, record) {
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    fail("STUDIO_PREVIEW_NOT_FOUND", "Studio world record is missing.");
  }
  if (record.id !== worldId || !ID.test(record.id ?? "") || !ID.test(record.sceneId ?? "")) {
    fail("STUDIO_PREVIEW_AUTHORITY_MISMATCH", "Studio world identity is invalid.");
  }
  if (!Number.isInteger(record.attempt) || record.attempt < 1) {
    fail("STUDIO_PREVIEW_NOT_READY", "Studio world has no published attempt.");
  }
  if (record.captureStatus !== "passed") {
    fail("STUDIO_PREVIEW_NOT_READY", "Studio world has not published trusted capture.");
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


function validateEvaluationRun(record, source) {
  if (source === null && record.origin === "existing-scene-brief-world") return;
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
  recordBefore,
  recordAfter,
  authoringSource,
  implementationMapSource,
  evaluationRunSource,
}) {
  const startedAt = requireReadyRecord(worldId, recordBefore);
  requireReadyRecord(worldId, recordAfter);
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
    validateSceneBriefImplementationMapV1(implementationMap).length > 0 ||
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
