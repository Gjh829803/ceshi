import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  StudioPreviewBootstrapError,
  assembleStudioPreviewBootstrapV1,
  stringifyStudioCanonicalJson,
} from "./preview-bootstrap.mjs";

const WORLD_ID = "preview-world";
const SCENE_ID = "preview-scene";
const STARTED_AT = "2026-08-25T08:00:00.000Z";
const POLICY_VERSION = "studio-world-pipeline-v12";

function hashCanonical(value) {
  return `sha256:${createHash("sha256")
    .update(stringifyStudioCanonicalJson(value))
    .digest("hex")}`;
}

function validInput() {
  const authoringSpec = {
    kind: "worldkit-authoring-spec",
    schemaVersion: 4,
    id: SCENE_ID,
    seed: 17,
  };
  const authoringSpecHash = hashCanonical(authoringSpec);
  const implementationMap = {
    kind: "worldkit-scene-brief-implementation-map",
    schemaVersion: 1,
    sceneId: SCENE_ID,
    sceneBriefHash: `sha256:${"b".repeat(64)}`,
    authoringSpecId: SCENE_ID,
    authoringSpecHash,
    visualTargetMappings: [{
      visualTargetId: "player-subject",
      runtimeEntityIds: ["player", "player-hat"],
    }],
    visualCaptureGroups: [{
      visualTargetId: "player-subject",
      runtimeEntityIds: ["player", "player-hat"],
      role: "primary-subject",
      semanticClassId: "subject.player",
      identityColor: "#E85D5D",
    }],
  };
  const record = {
    id: WORLD_ID,
    sceneId: SCENE_ID,
    origin: "creator-studio",
    status: "ready",
    captureStatus: "passed",
    attempt: 2,
    startedAt: STARTED_AT,
    createdAt: "2026-08-25T07:00:00.000Z",
    workflowPolicyVersion: POLICY_VERSION,
  };
  const evaluationRun = {
    kind: "worldkit-evaluation-run",
    schemaVersion: 1,
    caseId: WORLD_ID,
    sceneId: SCENE_ID,
    workflowPolicyVersion: POLICY_VERSION,
    attempt: 2,
    startedAt: STARTED_AT,
  };
  return {
    worldId: WORLD_ID,
    recordBefore: structuredClone(record),
    recordAfter: structuredClone(record),
    authoringSource: JSON.stringify(authoringSpec),
    implementationMapSource: JSON.stringify(implementationMap),
    evaluationRunSource: JSON.stringify(evaluationRun),
  };
}

function expectCode(code, mutate) {
  const input = validInput();
  mutate(input);
  assert.throws(
    () => assembleStudioPreviewBootstrapV1(input),
    (error) => error instanceof StudioPreviewBootstrapError && error.code === code,
  );
}

test("assembles one coherent generated Preview attempt", () => {
  const input = validInput();
  const result = assembleStudioPreviewBootstrapV1(input);
  const authoringSpec = JSON.parse(input.authoringSource);
  const implementationMap = JSON.parse(input.implementationMapSource);

  assert.deepEqual(result, {
    kind: "worldkit-studio-preview-bootstrap",
    schemaVersion: 1,
    worldId: WORLD_ID,
    sceneId: SCENE_ID,
    attempt: 2,
    attemptStartedAt: STARTED_AT,
    authoringSpecHash: hashCanonical(authoringSpec),
    authoringSpec,
    implementationMap,
  });

  authoringSpec.seed = 99;
  implementationMap.visualCaptureGroups[0].runtimeEntityIds.push("intruder");
  assert.equal(result.authoringSpec.seed, 17);
  assert.deepEqual(result.implementationMap.visualCaptureGroups[0].runtimeEntityIds, [
    "player",
    "player-hat",
  ]);
});

test("fails closed when the Studio record changes during the artifact read", () => {
  expectCode("STUDIO_PREVIEW_ATTEMPT_DRIFT", (input) => {
    input.recordAfter.attempt = 3;
  });
});

test("fails closed when evaluation identity belongs to another attempt", () => {
  expectCode("STUDIO_PREVIEW_ATTEMPT_DRIFT", (input) => {
    const evaluationRun = JSON.parse(input.evaluationRunSource);
    evaluationRun.attempt = 1;
    input.evaluationRunSource = JSON.stringify(evaluationRun);
  });
});

test("fails closed for cross-scene and wrong-hash artifacts", () => {
  expectCode("STUDIO_PREVIEW_AUTHORITY_MISMATCH", (input) => {
    const implementationMap = JSON.parse(input.implementationMapSource);
    implementationMap.sceneId = "another-scene";
    input.implementationMapSource = JSON.stringify(implementationMap);
  });
  expectCode("STUDIO_PREVIEW_AUTHORITY_MISMATCH", (input) => {
    const implementationMap = JSON.parse(input.implementationMapSource);
    implementationMap.authoringSpecHash = `sha256:${"0".repeat(64)}`;
    input.implementationMapSource = JSON.stringify(implementationMap);
  });
});

test("fails closed when Preview artifacts contain forbidden negative zero", () => {
  assert.throws(
    () => stringifyStudioCanonicalJson({ value: -0 }),
    /Negative zero/,
  );
  expectCode("STUDIO_PREVIEW_AUTHORITY_MISMATCH", (input) => {
    input.authoringSource = input.authoringSource.replace('"seed":17', '"seed":-0');
  });
});

test("fails closed when implementation mappings and capture groups do not close", () => {
  expectCode("STUDIO_PREVIEW_AUTHORITY_MISMATCH", (input) => {
    const implementationMap = JSON.parse(input.implementationMapSource);
    implementationMap.visualCaptureGroups[0].runtimeEntityIds = ["player"];
    input.implementationMapSource = JSON.stringify(implementationMap);
  });
});

test("rejects the retired mappings field and competing capture-group id", () => {
  expectCode("STUDIO_PREVIEW_AUTHORITY_MISMATCH", (input) => {
    const implementationMap = JSON.parse(input.implementationMapSource);
    implementationMap.mappings = implementationMap.visualTargetMappings;
    delete implementationMap.visualTargetMappings;
    input.implementationMapSource = JSON.stringify(implementationMap);
  });
  expectCode("STUDIO_PREVIEW_AUTHORITY_MISMATCH", (input) => {
    const implementationMap = JSON.parse(input.implementationMapSource);
    implementationMap.visualCaptureGroups[0].id = "competing-id";
    input.implementationMapSource = JSON.stringify(implementationMap);
  });
});

test("rejects an attempt that has not published trusted capture", () => {
  expectCode("STUDIO_PREVIEW_NOT_READY", (input) => {
    input.recordBefore.captureStatus = "pending";
    input.recordAfter.captureStatus = "pending";
  });
});

test("uses createdAt as the stable identity for an imported trusted world", () => {
  const input = validInput();
  input.recordBefore.origin = "existing-scene-brief-world";
  input.recordAfter.origin = "existing-scene-brief-world";
  input.recordBefore.attempt = 1;
  input.recordAfter.attempt = 1;
  input.recordBefore.startedAt = null;
  input.recordAfter.startedAt = null;
  input.evaluationRunSource = null;

  const result = assembleStudioPreviewBootstrapV1(input);
  assert.equal(result.attempt, 1);
  assert.equal(result.attemptStartedAt, input.recordBefore.createdAt);
});
