import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { LwdpJobPendingError } from "../../../scripts/lib/lwdp-generation-client.mjs";

import {
  applyRecordPatch,
  createSceneId,
  createKeyedSerialExecutor,
  createStudio as createStudioProduction,
  defaultManagedPlaygroundPort,
  decodeImagePayload,
  deriveReliabilityMetrics,
  deriveWorldGenerationFailureReason,
  deriveWorkflowMetrics,
  deriveWorkflowTrajectory,
  evaluateRecordTransition,
  expectedCloudSceneManifestS3Uri,
  hasRemoteCloudHostResumeInputs,
  hasRemoteCloudPlannerResumeInputs,
  isAllowedSceneAsset,
  isAuthorizedHeader,
  isRecoverableVisualFinalizationFailure,
  normalizePrompt,
  normalizeTestSetName,
  normalizeTrustedCapturePublicKeyPaths,
  parseRemotePendingLwdpMarker,
  parseStageTokenUsage,
  resolveCloudBuilderRebuildSource,
  workflowPolicyVersion,
  writeJsonAtomic,
} from "./server.mjs";

// Unit tests below intentionally use compact artifact fixtures. The real
// closed-schema/build-identity verifier is covered by the Hosted Block World
// production-chain test and its dedicated adversarial contract tests.
const createStudio = (options = {}) => createStudioProduction({
  verifyHostedWhiteboxArtifactsImplementation: async () => true,
  cloudSceneExecutionEnabled: false,
  additionalTrustedCapturePublicKeyPaths: [],
  ...options,
});

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const temporaryRoots = [];

test("derives an isolated managed Playground port from each Studio port", () => {
  assert.equal(defaultManagedPlaygroundPort(4174), 5174);
  assert.equal(defaultManagedPlaygroundPort(4597), 5597);
  assert.throws(() => defaultManagedPlaygroundPort(64_536), /leave room/);
});

test("derives the only admissible terminal Scene manifest from the frozen output prefix", () => {
  assert.equal(
    expectedCloudSceneManifestS3Uri({
      remoteOutputS3Prefix: "s3://bucket/cloud-scenes/demo/attempt-1/",
    }),
    "s3://bucket/cloud-scenes/demo/attempt-1/stages/scene-production/cloud-artifact-manifest.json",
  );
  assert.equal(expectedCloudSceneManifestS3Uri({}), null);
});

test("normalizes and deduplicates additional capture trust public keys", () => {
  const primary = path.resolve("/tmp/worldkit-primary-trust.pem");
  const additional = path.resolve("/tmp/worldkit-cloud-trust.pem");
  assert.deepEqual(
    normalizeTrustedCapturePublicKeyPaths(primary, [additional, primary, additional]),
    [primary, additional],
  );
  assert.throws(
    () => normalizeTrustedCapturePublicKeyPaths(primary, [""]),
    /non-empty strings/,
  );
});

test("keeps ready as an absorbing lifecycle state and rejects stale remote writers", () => {
  const ready = {
    id: "absorbing-ready-world",
    status: "ready",
    stage: "ready",
    attempt: 2,
    recordRevision: 17,
    remoteExecutionId: "scene-execution-2",
    remoteJobId: "gen_current",
  };
  assert.deepEqual(
    evaluateRecordTransition(ready, {
      status: "failed",
      stage: "failed",
      error: "late recovery failed",
    }, {
      expectedAttempt: 2,
      expectedStatuses: ["remote-pending", "interrupted"],
    }),
    { allowed: false, reason: "already-complete" },
  );
  assert.deepEqual(
    evaluateRecordTransition({ ...ready, status: "remote-pending" }, {
      status: "failed",
    }, {
      expectedAttempt: 1,
    }),
    { allowed: false, reason: "attempt-drift" },
  );
  assert.deepEqual(
    evaluateRecordTransition({ ...ready, status: "remote-pending" }, {
      status: "failed",
    }, {
      expectedRemoteJobId: "gen_old",
    }),
    { allowed: false, reason: "job-drift" },
  );
  assert.deepEqual(
    evaluateRecordTransition(ready, { plannerReview: { status: "approved" } }),
    { allowed: true, reason: "applied" },
  );
  assert.deepEqual(
    evaluateRecordTransition(ready, {
      status: "queued",
      stage: "queued",
      resumeFromStage: "cloud-builder-rebuild",
    }, {
      allowReadyLifecycleTransition: true,
      expectedAttempt: 2,
      expectedStatuses: ["ready"],
    }),
    { allowed: true, reason: "applied" },
  );
});

test("recovers Builder rebuild authority from the latest complete prior Cloud attempt", async () => {
  const sceneId = "recover-builder-source";
  const calls = [];
  const source = await resolveCloudBuilderRebuildSource({
    sceneId,
    attempt: 3,
    referenceImage: { fileName: "reference.png" },
  }, {
    outputS3Root: "s3://worldkit-test/cloud-scenes",
    repoRoot: "/workspace/worldkit",
    readManifestImplementation: async (uri) => {
      calls.push(uri);
      if (!uri.includes("/attempt-1/")) throw new Error("missing attempt");
      return {
        executionId: "execution-source-1",
        artifacts: [
          "scene/scene-brief.md",
          "scene/planner-self-check.json",
          "scene/visual-identity-palette.json",
          "scene-plan/entry-whitebox-target.png",
          "scene-plan/world-plan.png",
          "scene-plan/reference-0.png",
        ].map((artifactPath) => ({ path: artifactPath })),
      };
    },
    readArtifactImplementation: async () => Buffer.from(JSON.stringify({
      kind: "worldkit-cloud-scene-request",
      schemaVersion: 1,
      sceneId,
      prompt: "Reuse this request.",
      references: [],
    })),
  });
  assert.equal(calls.length, 3);
  assert.deepEqual(source, {
    executionId: "execution-source-1",
    manifestS3Uri:
      `s3://worldkit-test/cloud-scenes/${sceneId}/attempt-1/stages/scene-production/cloud-artifact-manifest.json`,
    requestS3Uri:
      `s3://worldkit-test/cloud-scenes/${sceneId}/attempt-1/inputs/request.json`,
  });
});

test("applies Cloud run-index transitions without mutating frozen records", () => {
  const remote = Object.freeze({
    id: "frozen-cloud-world",
    status: "running",
    stage: "planner",
    recordRevision: 3,
  });
  const updated = applyRecordPatch(remote, { status: "ready", stage: "ready" });
  assert.deepEqual(remote, {
    id: "frozen-cloud-world",
    status: "running",
    stage: "planner",
    recordRevision: 3,
  });
  assert.deepEqual(updated, {
    id: "frozen-cloud-world",
    status: "ready",
    stage: "ready",
    recordRevision: 3,
  });
});

test("coalesces Cloud run-index reads across health and world-list polling", async () => {
  const dataRoot = await temporaryRoot(".test-cloud-index-cache-");
  let listCalls = 0;
  const now = new Date().toISOString();
  const remoteRecord = Object.freeze({
    id: "cached-cloud-world",
    sceneId: "cached-cloud-world",
    title: "Cached cloud world",
    prompt: "Read one remote record once.",
    codexBackend: "cloud",
    status: "ready",
    stage: "ready",
    attempt: 1,
    origin: "test-set",
    workflowPolicyVersion,
    recordRevision: 2,
    createdAt: now,
    updatedAt: now,
    remoteArtifacts: [],
  });
  const studio = createStudio({
    repoRoot,
    dataRoot,
    cloudControlPlane: true,
    cloudSceneExecutionEnabled: true,
    autoRunJobs: false,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    loadCloudSceneProductionConfigImplementation: async () => ({
      outputS3Root: "s3://bucket/cloud-scenes",
    }),
    listCloudSceneRunIndexRecordsImplementation: async () => {
      listCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 25));
      return [remoteRecord];
    },
  });
  const origin = await listen(studio);
  try {
    const [health, worlds] = await Promise.all([
      fetch(`${origin}/api/health`),
      fetch(`${origin}/api/worlds`),
    ]);
    assert.equal(health.status, 200);
    assert.equal(worlds.status, 200);
    assert.equal((await worlds.json()).worlds[0].id, remoteRecord.id);
    assert.equal(listCalls, 1);
    assert.equal((await fetch(`${origin}/api/worlds`)).status, 200);
    assert.equal(listCalls, 1);
  } finally {
    await studio.shutdown();
  }
});

test("allows Cloud Host-only recovery only after the complete Builder handoff exists", () => {
  const base = {
    remoteExecutionId: "execution-builder-complete",
    remoteArtifactManifestS3Uri: "s3://worldkit-test/manifest.json",
    remoteRequestS3Uri: "s3://worldkit-test/request.json",
    remoteOutputS3Prefix: "s3://worldkit-test/output",
    referenceImage: { fileName: "reference.png" },
  };
  const requiredPaths = [
    "scene/scene-brief.md",
    "scene/planner-self-check.json",
    "scene/visual-identity-palette.json",
    "scene/world.mjs",
    "scene/authoring.json",
    "scene/implementation-map.draft.json",
    "scene/builder-self-check.json",
    "scene/builder-top-down-comparison.png",
    "scene/builder-entry-comparison.png",
    "scene-plan/entry-whitebox-target.png",
    "scene-plan/world-plan.png",
    "scene-plan/reference-0.png",
  ];
  const remoteArtifacts = requiredPaths.map((artifactPath) => ({ path: artifactPath }));
  assert.equal(hasRemoteCloudHostResumeInputs({
    ...base,
    remoteArtifacts: remoteArtifacts.filter(({ path: artifactPath }) =>
      artifactPath !== "scene/world.mjs"),
  }), false);
  assert.equal(hasRemoteCloudHostResumeInputs({ ...base, remoteArtifacts }), true);
  assert.equal(hasRemoteCloudHostResumeInputs({
    ...base,
    remoteArtifacts: remoteArtifacts.filter(({ path: artifactPath }) =>
      artifactPath !== "scene-plan/reference-0.png"),
  }), false);
  const plannerArtifacts = remoteArtifacts.filter(({ path: artifactPath }) =>
    ![
      "scene/world.mjs",
      "scene/authoring.json",
      "scene/implementation-map.draft.json",
      "scene/builder-self-check.json",
      "scene/builder-top-down-comparison.png",
      "scene/builder-entry-comparison.png",
    ].includes(artifactPath));
  assert.equal(hasRemoteCloudPlannerResumeInputs({
    ...base,
    remoteArtifacts: plannerArtifacts,
  }), true);
  assert.equal(hasRemoteCloudHostResumeInputs({
    ...base,
    remoteArtifacts: plannerArtifacts,
  }), false);
});

test("admits only one Studio writer for a shared durable data root", async () => {
  const dataRoot = await temporaryRoot(".test-data-writer-lease-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-writer-lease-");
  const first = createStudio({
    repoRoot: fakeRepoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
  });
  await first.initialize();
  const second = createStudio({
    repoRoot: fakeRepoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
  });
  await assert.rejects(second.initialize(), /STUDIO_WRITER_ALREADY_ACTIVE/);
  await first.shutdown();
  const replacement = createStudio({
    repoRoot: fakeRepoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
  });
  await replacement.initialize();
  await replacement.shutdown();
});

test("reclaims a legacy Studio writer lease after a container reuses the same PID", async () => {
  const dataRoot = await temporaryRoot(".test-data-reused-pid-writer-lease-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-reused-pid-writer-lease-");
  await mkdir(dataRoot, { recursive: true });
  await writeFile(path.join(dataRoot, "studio-owner.json"), `${JSON.stringify({
    kind: "worldkit-studio-writer-lease",
    schemaVersion: 1,
    instanceId: `${process.pid}-dead-container-process`,
    pid: process.pid,
    startedAt: new Date(Date.now() - 60_000).toISOString(),
  })}\n`);
  const replacement = createStudio({
    repoRoot: fakeRepoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
  });
  await replacement.initialize();
  await replacement.shutdown();
});

test("releases the Studio writer lease when initialization fails", async () => {
  const dataRoot = await temporaryRoot(".test-data-writer-init-failure-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-writer-init-failure-");
  const builtinRoot = path.join(
    fakeRepoRoot,
    "apps/studio/builtin-test-sets/broken-test-set",
  );
  await mkdir(builtinRoot, { recursive: true });
  await writeFile(path.join(builtinRoot, "manifest.json"), `${JSON.stringify({
    kind: "worldkit-builtin-test-set",
    schemaVersion: 1,
    id: "broken-test-set",
    name: "Broken",
    prompt: "Broken fixture",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    images: [{
      id: "image-001-dead",
      extension: "png",
      sourceFile: "missing.png",
      contentSha256: "0".repeat(64),
      size: 1,
    }],
  })}\n`);
  const failing = createStudio({
    repoRoot: fakeRepoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    importBuiltinTestSets: true,
    importBuiltinResults: false,
  });
  await assert.rejects(failing.initialize(), /Built-in test image is missing/);
  await rm(path.join(fakeRepoRoot, "apps/studio/builtin-test-sets"), {
    recursive: true,
    force: true,
  });
  const replacement = createStudio({
    repoRoot: fakeRepoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
  });
  await replacement.initialize();
  await replacement.shutdown();
});

test("routes a cloud world through Cloud Scene Execution and serves remote Preview artifacts", async () => {
  const dataRoot = await temporaryRoot(".test-data-cloud-scene-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-cloud-scene-");
  const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
  let localSpawned = false;
  const executionId = "cloud-execution-001";
  const buffers = new Map();
  const studio = createStudioProduction({
    repoRoot: fakeRepoRoot,
    dataRoot,
    autoRunJobs: true,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    lwdpConfigured: true,
    verifyHostedWhiteboxArtifactsImplementation: async () => true,
    loadCloudSceneProductionConfigImplementation: async () => ({
      workerImage: `worker@sha256:${"a".repeat(64)}`,
      outputS3Root: "s3://worldkit-test/cloud-scenes",
      namespace: "lwdp",
    }),
    loadLwdpConfigImplementation: async () => ({
      baseUrl: "https://lwdp.test", token: "test", userId: "worldkit-test",
    }),
    worldSpawnImplementation: () => {
      localSpawned = true;
      throw new Error("cloud records must not spawn the local Scene pipeline");
    },
    executeStudioCloudSceneImplementation: async (input) => {
      await input.onSubmitted({
        executionId,
        outputS3Prefix: "s3://worldkit-test/cloud-scenes/scene/attempt-1",
      });
      return {
        execution: { execution_id: executionId, status: "succeeded" },
        stages: { stages: [{ stage_id: "scene-production", artifacts: [{
          role: "worldkit-cloud-artifact-manifest",
          s3_uri: "s3://worldkit-test/cloud-scenes/manifest.json",
        }] }] },
        manifestS3Uri: "s3://worldkit-test/cloud-scenes/manifest.json",
      };
    },
    readCloudArtifactManifestImplementation: async (_uri, { expectedSceneId }) => {
      const authoringSpec = {
        kind: "worldkit-authoring-spec", schemaVersion: 4,
        id: expectedSceneId, seed: 1,
      };
      const authoringSpecHash = `sha256:${createHash("sha256")
        .update(canonicalJson(authoringSpec)).digest("hex")}`;
      const implementationMap = {
        kind: "worldkit-scene-brief-implementation-map",
        schemaVersion: 1,
        sceneId: expectedSceneId,
        sceneBriefHash: `sha256:${"b".repeat(64)}`,
        authoringSpecId: expectedSceneId,
        authoringSpecHash,
        visualTargetMappings: [{
          visualTargetId: "player-subject",
          runtimeEntityIds: ["player"],
          frontDirectionWorldXZ: [0, -1],
        }],
        visualCaptureGroups: [{
          visualTargetId: "player-subject",
          runtimeEntityIds: ["player"],
          role: "primary-subject",
          semanticClassId: "subject.player",
          identityColor: "#E85D5D",
          frontDirectionWorldXZ: [0, -1],
        }],
      };
      const values = {
        "scene/authoring.json": Buffer.from(JSON.stringify(authoringSpec)),
        "scene/scene-implementation-map.json": Buffer.from(JSON.stringify(implementationMap)),
        "scene/world.build.json": Buffer.from("{}"),
        "scene/opening-frame.png": png,
        "scene/runtime-snapshot.json": Buffer.from("{}"),
        "scene/whitebox-capture-receipt.json": Buffer.from("{}"),
      };
      const artifacts = Object.entries(values).map(([artifactPath, bytes]) => {
        buffers.set(artifactPath, bytes);
        return {
          path: artifactPath,
          contentType: artifactPath.endsWith(".png") ? "image/png" : "application/json",
          byteSize: bytes.length,
          sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
          s3Uri: `s3://worldkit-test/cloud-scenes/${artifactPath}`,
          producerStage: "scene-production",
          required: true,
        };
      });
      return {
        kind: "worldkit-cloud-artifact-manifest",
        schemaVersion: 1,
        sceneId: expectedSceneId,
        executionId,
        stageId: "scene-production",
        artifacts,
      };
    },
    readVerifiedCloudArtifactImplementation: async (_record, artifactPath) =>
      buffers.get(artifactPath) ?? null,
    streamCloudArtifactImplementation: async (response, artifact) => {
      const bytes = buffers.get(artifact.path);
      response.writeHead(200, { "content-type": artifact.contentType });
      response.end(bytes);
      return true;
    },
  });
  const origin = await listen(studio);
  try {
    const created = (await (await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Cloud World", prompt: "Build in one Cloud Worker." }),
    })).json()).world;
    let detail;
    const deadline = Date.now() + 2_000;
    do {
      detail = await (await fetch(`${origin}/api/worlds/${created.id}`)).json();
      if (detail.world.status === "ready") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    } while (Date.now() < deadline);
    assert.equal(localSpawned, false);
    assert.equal(detail.world.status, "ready", JSON.stringify(detail.world));
    assert.equal(detail.world.whiteboxRuntimeAvailable, true);
    assert.equal(detail.world.remoteExecutionId, executionId);
    const preview = await fetch(`${origin}/api/worlds/${created.id}/preview-bootstrap`);
    assert.equal(preview.status, 200, await preview.text());
    const opening = await fetch(`${origin}/api/worlds/${created.id}/deliverables/opening-frame`);
    assert.equal(opening.status, 200);
    assert.deepEqual(Buffer.from(await opening.arrayBuffer()), png);
  } finally {
    await studio.shutdown();
  }
});

test("surfaces actionable World generation failures instead of only child exit codes", () => {
  assert.match(deriveWorldGenerationFailureReason(`
WORLDKIT_LWDP_PROGRESS planner-1 running {"total":1,"queued":1,"running":0,"succeeded":0,"failed":0}
Error: LWDP job gen_stalled timed out after 3600000ms.
`, { code: 1 }), /gen_stalled.*60 分钟.*queued=1.*没有重复提交 Job/);

  const pendingLog = `WORLDKIT_LWDP_REMOTE_PENDING visual-reconstruction visual-1 gen_pending request-1 s3://bucket/visual 7200000 running {"total":1,"queued":1,"running":0}`;
  assert.deepEqual(parseRemotePendingLwdpMarker(pendingLog), {
    stage: "visual-reconstruction",
    taskId: "visual-1",
    jobId: "gen_pending",
    requestId: "request-1",
    outputS3Prefix: "s3://bucket/visual",
    timeoutMs: 7_200_000,
    remoteStatus: "running",
    counters: { total: 1, queued: 1, running: 0 },
  });
  assert.match(
    deriveWorldGenerationFailureReason(pendingLog, { code: 4 }),
    /gen_pending.*120 分钟.*远端对账状态.*不会重复提交/,
  );

  assert.match(deriveWorldGenerationFailureReason(`
WORLDKIT_LWDP_JOB coding-agent builder-1 gen_capacity dispatch=single-task-fast-path
ERROR: Selected model is at capacity. Please try a different model.
`, { code: 1 }), /gen_capacity.*gpt-5\.6-sol 当前容量不足/);

  assert.equal(deriveWorldGenerationFailureReason(`
Error: LWDP task failures: builder-1: missing required outputs: artifacts/scenes/demo/authoring.json, artifacts/scenes/demo/map.json
`, { code: 1 }), "云端 Codex 已结束，但缺少声明的必需产物：artifacts/scenes/demo/authoring.json, artifacts/scenes/demo/map.json");

  assert.match(deriveWorldGenerationFailureReason(`
Error: LWDP task failures: builder-1: missing required outputs: artifacts/scenes/demo/world.mjs
{"status":"failed","diagnostics":[{"code":"BLOCK_WORLD_SUBJECT_MOVEMENT_UNSATISFIED"}]}
`, { code: 1 }), /当前 Agent Authoring Catalog.*阻止静默降级/);

  assert.match(deriveWorldGenerationFailureReason(
    "WORLDKIT_CAPTURE_VISIBLE_WORLD_MISSING",
    { code: 2 },
  ), /只得到背景或近乎单色画面/);

  assert.match(deriveWorldGenerationFailureReason(`
WorldKit Creator Studio
scene=demo
attempt=1
mode=full
Builder top-down visual review does not match trusted Host replay.

WorldKit Creator Studio
scene=demo
attempt=2
mode=host-resume
[stderr] scripts/finalize.sh: line 171: unexpected EOF while looking for matching '"'
`, { code: 2 }), /收尾脚本存在语法错误.*line 171/);
});

test("keeps a non-terminal LWDP timeout in remote-pending instead of failed", async () => {
  const dataRoot = await temporaryRoot(".test-data-remote-pending-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-remote-pending-");
  const studio = createStudio({
    repoRoot: fakeRepoRoot,
    dataRoot,
    autoRunJobs: true,
    autoRecoverLateLwdpJobs: false,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    lwdpConfigured: true,
    remotePendingGraceMs: 60_000,
    worldSpawnImplementation: () => {
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.killed = false;
      child.kill = () => true;
      process.nextTick(() => {
        child.stdout.write("WORLDKIT_STAGE planner\n");
        child.stdout.write("WORLDKIT_LWDP_JOB planner planner-test gen_capacity dispatch=single-task-fast-path taskAttempt=1/3\n");
        child.stdout.write("WORLDKIT_LWDP_STAGE_RETRY planner 2 3 reason=capacity previousJob=gen_capacity delayMs=30000\n");
        child.stdout.write("WORLDKIT_LWDP_JOB planner planner-test gen_pending dispatch=single-task-fast-path taskAttempt=2/3\n");
        child.stdout.write("WORLDKIT_LWDP_REMOTE_PENDING planner planner-test gen_pending request-test s3://bucket/worldkit/planner 2700000 running {\"total\":1,\"queued\":1,\"running\":0}\n");
        child.stdout.end();
        child.stderr.end();
        child.emit("close", 4, null);
      });
      return child;
    },
  });
  const origin = await listen(studio);
  try {
    const created = (await (await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Remote Pending", prompt: "Create a pending test world." }),
    })).json()).world;
    let detail = null;
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline) {
      detail = await (await fetch(`${origin}/api/worlds/${created.id}`)).json();
      if (detail.world.status === "remote-pending") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(detail?.world.status, "remote-pending");
    assert.equal(detail?.world.stage, "planner");
    assert.equal(detail?.world.failedStage, null);
    assert.equal(detail?.world.outcome, null);
    assert.equal(detail?.world.captureStatus, "pending");
    const persisted = JSON.parse(await readFile(
      path.join(dataRoot, "worlds", created.id, "record.json"),
      "utf8",
    ));
    assert.equal(persisted.remoteJobId, "gen_pending");
    assert.equal(persisted.remoteTaskId, "planner-test");
    assert.ok(Date.parse(persisted.remotePendingDeadlineAt) > Date.parse(persisted.remotePendingSince));
    let retryEvent = null;
    const retryEventDeadline = Date.now() + 2_000;
    while (Date.now() < retryEventDeadline) {
      const serializedEvents = await readFile(
        path.join(dataRoot, "worlds", created.id, "trajectory.jsonl"),
        "utf8",
      ).catch(() => "");
      retryEvent = serializedEvents.split(/\r?\n/).filter(Boolean)
        .map((line) => JSON.parse(line))
        .find((event) => event.kind === "retry" && event.reason === "capacity");
      if (retryEvent) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.deepEqual({
      stage: retryEvent?.stage,
      attempt: retryEvent?.attempt,
      limit: retryEvent?.limit,
      previousJobId: retryEvent?.previousJobId,
      delayMs: retryEvent?.delayMs,
    }, {
      stage: "planner",
      attempt: 2,
      limit: 3,
      previousJobId: "gen_capacity",
      delayMs: 30_000,
    });
  } finally {
    await studio.shutdown();
  }
});

test("migrates a legacy timeout failure back to remote-pending while its Job is active", async () => {
  const dataRoot = await temporaryRoot(".test-data-legacy-remote-pending-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-legacy-remote-pending-");
  const id = "legacy-remote-pending-world";
  const recordRoot = path.join(dataRoot, "worlds", id);
  await mkdir(recordRoot, { recursive: true });
  const timestamp = new Date().toISOString();
  await Promise.all([
    writeFile(path.join(recordRoot, "record.json"), JSON.stringify({
      id,
      sceneId: id,
      title: "Legacy remote pending",
      prompt: "Recover the old timeout state.",
      referenceImage: null,
      status: "failed",
      stage: "failed",
      failedStage: "coding-agent",
      codexBackend: "cloud",
      attempt: 1,
      origin: "test-set",
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: timestamp,
      finishedAt: timestamp,
      error: "LWDP 云端 Job gen_legacyactive 在 60 分钟内未进入终态。",
      captureRequired: true,
      captureStatus: "failed",
      triviewStatus: "not-run",
      whiteboxOutcome: "failed",
      outcome: "failed",
      styledOpeningFrameRequired: false,
      styledOpeningFrameStatus: "not-required",
      styledTriviewsRequired: false,
      styledTriviewsStatus: "not-required",
      workflowPolicyVersion,
    })),
    writeFile(path.join(recordRoot, "agent.log"), [
      "WorldKit Creator Studio",
      `scene=${id}`,
      "attempt=1",
      "mode=full",
      "",
      "WORLDKIT_LWDP_JOB coding-agent builder-legacy gen_legacyactive dispatch=single-task-fast-path",
      "Error: LWDP job gen_legacyactive timed out after 3600000ms.",
      "",
    ].join("\n")),
  ]);
  const studio = createStudio({
    repoRoot: fakeRepoRoot,
    dataRoot,
    autoRunJobs: true,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    lwdpConfigured: true,
    remotePendingGraceMs: 60_000,
    loadLwdpConfigImplementation: async () => ({
      baseUrl: "https://lwdp.test", token: "test", userId: "worldkit-test",
    }),
    lateLwdpRecoveryImplementation: async () => {
      throw new LwdpJobPendingError("gen_legacyactive", 0, {
        status: "running", counters: { total: 1, queued: 1, running: 0 },
      });
    },
  });
  const origin = await listen(studio);
  try {
    let detail = null;
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline) {
      detail = await (await fetch(`${origin}/api/worlds/${id}`)).json();
      if (detail.world.status === "remote-pending") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(detail?.world.status, "remote-pending");
    assert.equal(detail?.world.stage, "coding-agent");
    assert.equal(detail?.world.failedStage, null);
    assert.equal(detail?.world.outcome, null);
    assert.equal(detail?.world.captureStatus, "pending");
  } finally {
    await studio.shutdown();
  }
});

test("recovers a successful remote-pending Planner using its current stage", async () => {
  const dataRoot = await temporaryRoot(".test-data-current-stage-planner-recovery-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-current-stage-planner-recovery-");
  const id = "current-stage-planner-recovery";
  const recordRoot = path.join(dataRoot, "worlds", id);
  await mkdir(recordRoot, { recursive: true });
  await writeTrustedWhiteboxArtifacts(fakeRepoRoot, id);
  const timestamp = new Date().toISOString();
  await Promise.all([
    writeFile(path.join(recordRoot, "record.json"), JSON.stringify({
      id,
      sceneId: id,
      title: "Current-stage Planner recovery",
      prompt: "Recover the successful Planner delivery.",
      referenceImage: null,
      status: "remote-pending",
      stage: "planner",
      failedStage: null,
      codexBackend: "cloud",
      attempt: 1,
      origin: "test-set",
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: timestamp,
      finishedAt: null,
      error: "LWDP 云端 Job gen_plannerlate 在 45 分钟后仍为 running；已转入远端对账状态。",
      captureRequired: true,
      captureStatus: "pending",
      triviewStatus: "pending",
      whiteboxOutcome: null,
      outcome: null,
      styledOpeningFrameRequired: false,
      styledOpeningFrameStatus: "not-required",
      styledTriviewsRequired: false,
      styledTriviewsStatus: "not-required",
      workflowPolicyVersion,
      remoteJobId: "gen_plannerlate",
    })),
    writeFile(path.join(recordRoot, "agent.log"), [
      "WorldKit Creator Studio",
      `scene=${id}`,
      "attempt=1",
      "mode=full",
      "",
      "WORLDKIT_LWDP_JOB planner planner-late gen_plannerlate dispatch=single-task-fast-path taskAttempt=1/3",
      "WORLDKIT_LWDP_REMOTE_PENDING planner planner-late gen_plannerlate request-late s3://bucket/planner 2700000 running {\"total\":1,\"queued\":1,\"running\":0}",
      "",
    ].join("\n")),
  ]);
  const studio = createStudio({
    repoRoot: fakeRepoRoot,
    dataRoot,
    autoRunJobs: false,
    autoRecoverLateLwdpJobs: true,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    lwdpConfigured: true,
    remoteRecoveryIntervalMs: 60_000,
    loadLwdpConfigImplementation: async () => ({
      baseUrl: "https://lwdp.test", token: "test", userId: "worldkit-test",
    }),
    lateLwdpRecoveryImplementation: async () => ({
      jobId: "gen_plannerlate", stage: "planner",
    }),
  });
  const origin = await listen(studio);
  try {
    let detail = null;
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline) {
      detail = await fetch(`${origin}/api/worlds/${id}`).then((response) => response.json());
      if (detail.world.status === "queued") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(detail?.world.status, "queued", JSON.stringify(detail?.world));
    assert.equal(detail?.world.resumeFromStage, "planner");
    assert.equal(detail?.world.error, null);
  } finally {
    await studio.shutdown();
  }
});

test("reattaches an interrupted successful Builder and queues Host-only resume", async () => {
  const dataRoot = await temporaryRoot(".test-data-interrupted-builder-recovery-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-interrupted-builder-recovery-");
  const id = "interrupted-builder-recovery";
  const recordRoot = path.join(dataRoot, "worlds", id);
  await mkdir(recordRoot, { recursive: true });
  await writeTrustedWhiteboxArtifacts(fakeRepoRoot, id);
  const timestamp = new Date().toISOString();
  await Promise.all([
    writeFile(path.join(recordRoot, "record.json"), JSON.stringify({
      id,
      sceneId: id,
      title: "Interrupted Builder recovery",
      prompt: "Recover the successful Builder delivery.",
      referenceImage: null,
      status: "interrupted",
      stage: "interrupted",
      failedStage: "coding-agent",
      codexBackend: "cloud",
      attempt: 1,
      origin: "test-set",
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: timestamp,
      finishedAt: timestamp,
      error: "Creator Studio restarted before this task completed.",
      captureRequired: true,
      captureStatus: "pending",
      triviewStatus: "pending",
      whiteboxOutcome: null,
      outcome: "failed",
      styledOpeningFrameRequired: false,
      styledOpeningFrameStatus: "not-required",
      styledTriviewsRequired: false,
      styledTriviewsStatus: "not-required",
      workflowPolicyVersion,
    })),
    writeFile(path.join(recordRoot, "agent.log"), [
      "WorldKit Creator Studio",
      `scene=${id}`,
      "attempt=1",
      "mode=full",
      "",
      "WORLDKIT_LWDP_JOB coding-agent builder-late gen_builderlate dispatch=single-task-fast-path taskAttempt=1/3",
      "",
    ].join("\n")),
  ]);
  const studio = createStudio({
    repoRoot: fakeRepoRoot,
    dataRoot,
    autoRunJobs: false,
    autoRecoverLateLwdpJobs: true,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    lwdpConfigured: true,
    remoteRecoveryIntervalMs: 60_000,
    loadLwdpConfigImplementation: async () => ({
      baseUrl: "https://lwdp.test", token: "test", userId: "worldkit-test",
    }),
    lateLwdpRecoveryImplementation: async () => ({
      jobId: "gen_builderlate", stage: "builder",
    }),
  });
  const origin = await listen(studio);
  try {
    let detail = null;
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline) {
      detail = await fetch(`${origin}/api/worlds/${id}`).then((response) => response.json());
      if (detail.world.status === "queued") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(detail?.world.status, "queued", JSON.stringify(detail?.world));
    assert.equal(detail?.world.resumeFromStage, "block-build");
  } finally {
    await studio.shutdown();
  }
});

test("moves a persisted running cloud Job to remote reconciliation after restart", async () => {
  const dataRoot = await temporaryRoot(".test-data-restart-reattach-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-restart-reattach-");
  const id = "restart-reattach-world";
  const recordRoot = path.join(dataRoot, "worlds", id);
  await mkdir(recordRoot, { recursive: true });
  const timestamp = new Date().toISOString();
  await Promise.all([
    writeFile(path.join(recordRoot, "record.json"), JSON.stringify({
      id,
      sceneId: id,
      title: "Restart reattach",
      prompt: "Keep the submitted Builder Job attached.",
      referenceImage: null,
      status: "running",
      stage: "coding-agent",
      failedStage: null,
      codexBackend: "cloud",
      attempt: 1,
      origin: "test-set",
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: timestamp,
      finishedAt: null,
      error: null,
      captureRequired: true,
      captureStatus: "pending",
      triviewStatus: "pending",
      whiteboxOutcome: null,
      outcome: null,
      styledOpeningFrameRequired: false,
      styledOpeningFrameStatus: "not-required",
      styledTriviewsRequired: false,
      styledTriviewsStatus: "not-required",
      workflowPolicyVersion,
    })),
    writeFile(path.join(recordRoot, "agent.log"), [
      "WorldKit Creator Studio",
      `scene=${id}`,
      "attempt=1",
      "mode=full",
      "",
      "WORLDKIT_LWDP_JOB planner planner-old gen_plannerold dispatch=single-task-fast-path taskAttempt=1/3",
      "WORLDKIT_LWDP_REMOTE_PENDING planner planner-old gen_plannerold request-old s3://bucket/planner 2700000 running {\"total\":1,\"queued\":1,\"running\":0}",
      "WORLDKIT_LWDP_JOB coding-agent builder-restart gen_builderrestart dispatch=single-task-fast-path taskAttempt=1/3",
      "",
    ].join("\n")),
  ]);
  const studio = createStudio({
    repoRoot: fakeRepoRoot,
    dataRoot,
    autoRunJobs: false,
    autoRecoverLateLwdpJobs: false,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
  });
  const origin = await listen(studio);
  try {
    const detail = await fetch(`${origin}/api/worlds/${id}`).then((response) => response.json());
    assert.equal(detail.world.status, "remote-pending");
    assert.equal(detail.world.stage, "coding-agent");
    assert.equal(detail.world.failedStage, null);
    assert.equal(detail.world.remoteJobId, "gen_builderrestart");
    assert.equal(detail.world.outcome, null);
  } finally {
    await studio.shutdown();
  }
});

test("reattaches a submitted Cloud Execution by idempotently launching its missing Worker", async () => {
  const dataRoot = await temporaryRoot(".test-data-cloud-worker-reattach-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-cloud-worker-reattach-");
  const id = "cloud-worker-reattach-world";
  const executionId = "execution-worker-reattach-001";
  const recordRoot = path.join(dataRoot, "worlds", id);
  await mkdir(recordRoot, { recursive: true });
  const timestamp = new Date().toISOString();
  await writeFile(path.join(recordRoot, "record.json"), JSON.stringify({
    id,
    sceneId: id,
    title: "Cloud Worker reattach",
    prompt: "Continue the exact submitted Cloud Execution.",
    referenceImage: null,
    status: "running",
    stage: "preparing",
    failedStage: null,
    codexBackend: "cloud",
    attempt: 1,
    origin: "test-set",
    createdAt: timestamp,
    updatedAt: timestamp,
    startedAt: timestamp,
    finishedAt: null,
    error: null,
    captureRequired: true,
    captureStatus: "pending",
    triviewStatus: "pending",
    whiteboxOutcome: null,
    outcome: null,
    styledOpeningFrameRequired: false,
    styledOpeningFrameStatus: "not-required",
    styledTriviewsRequired: false,
    styledTriviewsStatus: "not-required",
    remoteExecutionId: executionId,
    remoteRequestS3Uri: "s3://worldkit-test/cloud-scenes/request.json",
    remoteOutputS3Prefix: "s3://worldkit-test/cloud-scenes/attempt-1",
    remoteWorkerLaunchStatus: null,
    workflowPolicyVersion,
  }));
  const launchCalls = [];
  const dispatchCalls = [];
  const studio = createStudioProduction({
    repoRoot: fakeRepoRoot,
    dataRoot,
    autoRunJobs: false,
    autoRecoverLateLwdpJobs: true,
    remoteRecoveryIntervalMs: 60_000,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    additionalTrustedCapturePublicKeyPaths: [],
    lwdpConfigured: true,
    loadLwdpConfigImplementation: async () => ({
      baseUrl: "https://lwdp.test", token: "test", userId: "worldkit-test",
    }),
    loadCloudSceneProductionConfigImplementation: async () => ({
      workerImage: `worker@sha256:${"a".repeat(64)}`,
      outputS3Root: "s3://worldkit-test/cloud-scenes",
      namespace: "lwdp",
    }),
    getCloudExecutionImplementation: async () => ({
      execution_id: executionId,
      status: "queued",
      current_stage_id: "scene-production",
    }),
    dispatchCloudExecutionImplementation: async (inputExecutionId) => {
      dispatchCalls.push(inputExecutionId);
      return { execution_id: inputExecutionId, status: "running" };
    },
    launchStudioCloudSceneWorkerImplementation: async (input) => {
      launchCalls.push(input);
      return { jobName: "worldkit-scene-execution-worker-reattach-001" };
    },
  });
  const origin = await listen(studio);
  try {
    let detail = null;
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline) {
      detail = await fetch(`${origin}/api/worlds/${id}`).then((response) => response.json());
      if (detail.world.remoteWorkerLaunchStatus === "launched") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.deepEqual(dispatchCalls, [executionId]);
    assert.equal(launchCalls.length, 1);
    assert.equal(launchCalls[0].executionId, executionId);
    assert.equal(detail?.world.status, "remote-pending");
    assert.equal(detail?.world.remoteWorkerLaunchStatus, "launched");
    assert.equal(detail?.world.remoteDispatchStatus, "dispatched");
    assert.equal(
      detail?.world.remoteWorkerJobName,
      "worldkit-scene-execution-worker-reattach-001",
    );
  } finally {
    await studio.shutdown();
  }
});

test("requeues a remote terminal Ray infrastructure failure from the trusted prior stage", async () => {
  const dataRoot = await temporaryRoot(".test-data-remote-terminal-retry-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-remote-terminal-retry-");
  const id = "remote-terminal-retry";
  const recordRoot = path.join(dataRoot, "worlds", id);
  await mkdir(recordRoot, { recursive: true });
  await writeTrustedWhiteboxArtifacts(fakeRepoRoot, id);
  const timestamp = new Date().toISOString();
  await Promise.all([
    writeFile(path.join(recordRoot, "record.json"), JSON.stringify({
      id,
      sceneId: id,
      title: "Remote terminal retry",
      prompt: "Retry the failed Builder infrastructure stage.",
      referenceImage: null,
      status: "remote-pending",
      stage: "coding-agent",
      failedStage: null,
      codexBackend: "cloud",
      attempt: 1,
      origin: "test-set",
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: timestamp,
      finishedAt: null,
      error: "LWDP 云端 Job gen_rayfailed 在 120 分钟后仍为 running；已转入远端对账状态。",
      captureRequired: true,
      captureStatus: "pending",
      triviewStatus: "pending",
      whiteboxOutcome: null,
      outcome: null,
      styledOpeningFrameRequired: false,
      styledOpeningFrameStatus: "not-required",
      styledTriviewsRequired: false,
      styledTriviewsStatus: "not-required",
      workflowPolicyVersion,
      remoteJobId: "gen_rayfailed",
    })),
    writeFile(path.join(recordRoot, "agent.log"), [
      "WorldKit Creator Studio",
      `scene=${id}`,
      "attempt=1",
      "mode=full",
      "",
      "WORLDKIT_LWDP_JOB coding-agent builder-ray gen_rayfailed dispatch=single-task-fast-path taskAttempt=1/3",
      "WORLDKIT_LWDP_REMOTE_PENDING coding-agent builder-ray gen_rayfailed request-ray s3://bucket/builder 7200000 running {\"total\":1,\"queued\":1,\"running\":0}",
      "",
    ].join("\n")),
  ]);
  const studio = createStudio({
    repoRoot: fakeRepoRoot,
    dataRoot,
    autoRunJobs: false,
    autoRecoverLateLwdpJobs: true,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    lwdpConfigured: true,
    remoteRecoveryIntervalMs: 60_000,
    loadLwdpConfigImplementation: async () => ({
      baseUrl: "https://lwdp.test", token: "test", userId: "worldkit-test",
    }),
    lateLwdpRecoveryImplementation: async () => {
      throw new Error("LWDP job did not succeed: Ray job FAILED: failed to get job supervisor");
    },
  });
  const origin = await listen(studio);
  try {
    let detail = null;
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline) {
      detail = await fetch(`${origin}/api/worlds/${id}`).then((response) => response.json());
      if (detail.world.status === "queued") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(detail?.world.status, "queued", JSON.stringify(detail?.world));
    assert.equal(detail?.world.resumeFromStage, "planner");
    const events = (await readFile(path.join(recordRoot, "trajectory.jsonl"), "utf8"))
      .trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.equal(events.some((event) =>
      event.kind === "retry" && event.reason === "transport" &&
      event.previousJobId === "gen_rayfailed"), true);
  } finally {
    await studio.shutdown();
  }
});

test("recovers only a post-success visual finalization syntax failure", () => {
  const record = {
    status: "failed",
    failedStage: "visual-reconstruction",
    captureStatus: "passed",
    triviewStatus: "passed",
    whiteboxOutcome: "passed",
  };
  const finalizationLog = `
WorldKit Creator Studio
scene=demo
attempt=2
mode=host-resume
WORLDKIT_LWDP_TASK_READY visual-demo
[stderr] scripts/finalize.sh: line 171: unexpected EOF while looking for matching '"'
`;
  assert.equal(isRecoverableVisualFinalizationFailure(record, finalizationLog), true);
  assert.equal(isRecoverableVisualFinalizationFailure(
    record,
    `${finalizationLog}\nError: Styled opening alignment failed.`,
  ), false);
  assert.equal(isRecoverableVisualFinalizationFailure(
    { ...record, captureStatus: "failed" },
    finalizationLog,
  ), false);
});

test("executes a frozen shell snapshot when the source changes during a long child step", async () => {
  const root = await temporaryRoot(".test-frozen-shell-");
  const sourcePath = path.join(root, "mutable-workflow.sh");
  const startedPath = path.join(root, "started");
  const releasePath = path.join(root, "release");
  await writeFile(sourcePath, `#!/usr/bin/env bash
set -euo pipefail
printf started > "$1"
while [[ ! -f "$2" ]]; do /bin/sleep 0.01; done
printf finished
`);
  const child = spawn(
    process.execPath,
    [path.join(repoRoot, "scripts/agents/run-frozen-shell-script.mjs"), sourcePath, startedPath, releasePath],
    { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    try {
      if ((await readFile(startedPath, "utf8")) === "started") break;
    } catch {
      // The immutable child has not reached its synchronization point yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(await readFile(startedPath, "utf8"), "started");
  await writeFile(sourcePath, "#!/usr/bin/env bash\nprintf 'unterminated\n");
  await writeFile(releasePath, "release");
  const exit = await new Promise((resolve) => child.once("close", (code, signal) =>
    resolve({ code, signal })));
  assert.deepEqual(exit, { code: 0, signal: null }, stderr);
  assert.equal(stdout, "finished");
});

async function temporaryRoot(prefix) {
  const root = await mkdtemp(path.join(repoRoot, "apps/studio", prefix));
  temporaryRoots.push(root);
  return root;
}

async function listen(studio) {
  await studio.initialize();
  await new Promise((resolve, reject) => {
    studio.server.once("error", reject);
    studio.server.listen(0, "127.0.0.1", resolve);
  });
  const address = studio.server.address();
  assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

async function writeTrustedWhiteboxArtifacts(
  fakeRepoRoot,
  sceneId,
  { requiresRouteValidation = false, routeReportMode = "exact" } = {},
) {
  const artifactRoot = path.join(fakeRepoRoot, "artifacts/scenes", sceneId);
  const planRoot = path.join(fakeRepoRoot, "apps/playground/public/scene-plans", sceneId);
  const triViewRoot = path.join(artifactRoot, "triviews", "player-subject");
  await Promise.all([
    mkdir(triViewRoot, { recursive: true }),
    mkdir(planRoot, { recursive: true }),
  ]);
  const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
  const brief = "# WorldKit Scene Brief\n\n## 场景\n可信导入场景\n";
  const worldModule = `export const blockWorldSceneId = ${JSON.stringify(sceneId)};\n`;
  const authoringSpecId = sceneId;
  const authoring = `${JSON.stringify({
    kind: "worldkit-authoring-spec",
    schemaVersion: 4,
    id: authoringSpecId,
  })}\n`;
  const mapDraft = `${JSON.stringify({
    kind: "worldkit-scene-brief-implementation-map-draft",
    schemaVersion: 1,
    sceneId,
    authoringSpecId,
    visualTargetMappings: [{ visualTargetId: "player-subject", runtimeEntityIds: ["player"], frontDirectionWorldXZ: [0, -1] }],
  })}\n`;
  const hash = (source) => `sha256:${createHash("sha256").update(source).digest("hex")}`;
  const resourceLockHash = `sha256:${"e".repeat(64)}`;
  const layoutSolveReportHash = `sha256:${"f".repeat(64)}`;
  const sceneBriefHash = `sha256:${"b".repeat(64)}`;
  const authoringSourceHash = hash(authoring);
  const authoringSpecHash = hash(canonicalJson(JSON.parse(authoring)));
  const executionPlanAuthoringSpecHash = authoringSpecHash;
  const normalizedWorldIr = {
    kind: "normalized-world-ir",
    schemaVersion: 4,
    resources: { resourceLockHash },
  };
  const normalizedWorldIrHash = hash(canonicalJson(normalizedWorldIr));
  const visualTarget = {
    visualTargetId: "player-subject",
    runtimeEntityIds: ["player"],
    role: "primary-subject",
    semanticClassId: "subject.player",
    identityColor: "#E85D5D",
    frontDirectionWorldXZ: [0, -1],
  };
  const implementationMap = {
    kind: "worldkit-scene-brief-implementation-map",
    schemaVersion: 1,
    sceneId,
    sceneBriefHash,
    authoringSpecId,
    authoringSpecHash,
    visualTargetMappings: [{ visualTargetId: "player-subject", runtimeEntityIds: ["player"], frontDirectionWorldXZ: [0, -1] }],
    visualCaptureGroups: [visualTarget],
  };
  const requiredRoutes = requiresRouteValidation
    ? [{
        constraintId: "player-to-goal",
        routeId: "main-route",
        traversingEntityId: "player",
        startAnchorEntityId: "spawn",
        destinationAnchorEntityId: "goal",
      }]
    : [];
  const executionPlan = {
    kind: "worldkit-canonical-scene-execution-plan",
    schemaVersion: 1,
    authoringSpecHash: executionPlanAuthoringSpecHash,
    normalizedWorldIrHash,
    resourceLockHash,
    layout: { layoutSolveReportHash },
    traversal: {
      connectivityRequirements: requiredRoutes.map((route) => ({
        ...route,
        kind: "connected-by-route",
      })),
    },
  };
  const executionPlanHash = hash(canonicalJson(executionPlan));
  const worldBuildIdentityHash = `sha256:${"d".repeat(64)}`;
  const captureTargets = {
    kind: "worldkit-whitebox-triview-manifest",
    schemaVersion: 1,
    worldBuildIdentityHash,
    whiteboxTriviews: [{
      ...visualTarget,
      views: ["front", "right", "back"],
      imageUri: "player-subject/whitebox-triview.png",
    }],
  };
  await Promise.all([
    writeFile(path.join(artifactRoot, "scene-brief.md"), brief),
    writeFile(path.join(artifactRoot, "planner-self-check.json"), JSON.stringify({
      kind: "worldkit-planner-self-check",
      schemaVersion: 1,
      validatorVersion: "worldkit-planner-self-check-v4",
      sceneId,
      status: "passed",
      inputs: {
        sceneBriefHash: hash(brief),
        worldPlanHash: hash(png),
        entryWhiteboxTargetHash: hash(png),
      },
      imageMeasurements: {
        worldPlan: { blockPaletteCoverageRatio: 0.5 },
        entryWhiteboxTarget: {
          blockPaletteCoverageRatio: 0.5,
          composition: { subjectCenterErrorRatio: 0 },
        },
      },
    })),
    writeFile(path.join(artifactRoot, "visual-identity-palette.json"), JSON.stringify({
      kind: "worldkit-visual-identity-palette",
      schemaVersion: 1,
      sceneId,
      sceneBriefHash,
      targets: [{ id: "player-subject" }],
    })),
    writeFile(path.join(artifactRoot, "world.mjs"), worldModule),
    writeFile(path.join(artifactRoot, "authoring.json"), authoring),
    writeFile(path.join(artifactRoot, "implementation-map.draft.json"), mapDraft),
    writeFile(path.join(artifactRoot, "builder-self-check.json"), JSON.stringify({
      kind: "worldkit-block-builder-self-check",
      schemaVersion: 1,
      validatorVersion: "worldkit-block-builder-self-check-v10",
      sceneId,
      status: "passed",
      requiresTrustedRouteValidation: requiresRouteValidation,
      inputs: {
        sceneBriefHash: hash(brief),
        worldModuleHash: hash(worldModule),
        authoringSpecHash: authoringSourceHash,
        implementationMapDraftHash: hash(mapDraft),
      },
    })),
    writeFile(path.join(artifactRoot, "builder-top-down-comparison.png"), png),
    writeFile(path.join(artifactRoot, "builder-entry-comparison.png"), png),
    writeFile(path.join(artifactRoot, "scene-implementation-map.json"), JSON.stringify(implementationMap)),
    writeFile(path.join(artifactRoot, "world.build.json"), JSON.stringify({
      kind: "worldkit-build-artifact",
      schemaVersion: 4,
      normalizedWorldIrHash,
      worldBuildIdentityHash,
      executionPlanHash,
      normalizedWorldIr,
      executionPlan,
    })),
    writeFile(path.join(artifactRoot, "opening-frame.png"), png),
    writeFile(path.join(artifactRoot, "runtime-snapshot.json"), JSON.stringify({
      kind: "worldkit-runtime-snapshot",
      schemaVersion: 4,
      runtime: { phase: "ready" },
      resources: { phase: "ready" },
    })),
    writeFile(path.join(artifactRoot, "whitebox-capture-receipt.json"), "{}"),
    writeFile(path.join(artifactRoot, "triviews/whitebox-triview-manifest.json"), JSON.stringify(captureTargets)),
    writeFile(path.join(triViewRoot, "whitebox-triview.png"), png),
    writeFile(path.join(planRoot, "world-plan.png"), png),
    writeFile(path.join(planRoot, "entry-whitebox-target.png"), png),
  ]);
  if (routeReportMode !== "missing") {
    const reportFileName = "route-validation.20260825-120000-123.json";
    const requiredRouteSetHash = `sha256:${createHash("sha256").update(
      canonicalJson({
        kind: "route-validation-required-route-set",
        schemaVersion: 1,
        executionPlanHash,
        requiredRoutes,
      }),
    ).digest("hex")}`;
    const report = {
      kind: "worldkit-validation-report",
      schemaVersion: 2,
      id: `${sceneId}.route-validation`,
      status: routeReportMode === "failed" ? "failed" : "passed",
      subject: {
        kind: "world-package",
        authoringSpecHash: executionPlanAuthoringSpecHash,
        normalizedWorldIrHash,
        worldBuildIdentityHash: routeReportMode === "mismatched"
          ? resourceLockHash
          : worldBuildIdentityHash,
        worldPackageRootHash: `sha256:${"a".repeat(64)}`,
        resourceLockHash,
        layoutSolveReportHash,
      },
      routeValidationSetReceipt: {
        kind: "route-validation-set-receipt",
        schemaVersion: 1,
        authoringSpecHash: executionPlanAuthoringSpecHash,
        normalizedWorldIrHash,
        executionPlanHash,
        resourceLockHash,
        layoutSolveReportHash,
        requiredRouteCount: requiredRoutes.length,
        requiredRouteSetHash,
        requiredRoutes,
        rows: requiredRoutes.map((route) => ({
          ...route,
          resolvedTraversalLockHash: `sha256:${"9".repeat(64)}`,
          connectivityStatus: "complete",
          runtimeStatus: "complete",
          evidenceArtifactRefs: [],
        })),
      },
      gateResultsById: {
        "route-connectivity": { status: "passed" },
        "route-runtime-conformance": { status: "passed" },
      },
      evidenceArtifactsById: {},
      diagnostics: [],
    };
    const reportBytes = Buffer.from(`${canonicalJson(report)}\n`);
    await Promise.all([
      writeFile(path.join(artifactRoot, reportFileName), reportBytes),
      writeFile(path.join(artifactRoot, "route-validation-manifest.json"), JSON.stringify({
        kind: "worldkit-route-validation-manifest",
        schemaVersion: 1,
        sceneId,
        reportFileName,
        reportContentHash:
          `sha256:${createHash("sha256").update(reportBytes).digest("hex")}`,
      })),
    ]);
  }
  return { artifactRoot, captureTargets, png };
}

test.afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("uses one current switchable Codex backend workflow contract", () => {
  assert.equal(workflowPolicyVersion, 6);
});

test("passes the frozen backend to world jobs and records local Codex markers without provider details", async () => {
  const source = await readFile(path.join(repoRoot, "apps/studio/src/server.mjs"), "utf8");
  assert.match(source, /WORLDKIT_CODEX_BACKEND: codexBackend/);
  assert.match(source, /WORLDKIT_LOCAL_CODEX_JOB \(\[a-z-\]\+\) \(\[a-zA-Z0-9\._:-\]\+\)/);
  assert.match(source, /kind: "local-job", taskId: localCodexJob\[2\]/);
  assert.doesNotMatch(source, /kind: "local-job"[^\n]+(?:credential|token|CODEX_HOME)/i);
});

test("keeps concurrent atomic writes isolated and serializes same-record mutations", async () => {
  const root = await temporaryRoot(".atomic-write-");
  const outputPath = path.join(root, "record.json");
  await Promise.all(Array.from({ length: 64 }, (_, index) =>
    writeJsonAtomic(outputPath, { index, payload: "x".repeat(256) })));
  const persisted = JSON.parse(await readFile(outputPath, "utf8"));
  assert.ok(Number.isInteger(persisted.index));
  assert.equal(persisted.payload.length, 256);
  assert.deepEqual(
    (await readdir(root)).filter((name) => name.endsWith(".tmp")),
    [],
  );

  const runSerially = createKeyedSerialExecutor();
  let activeForRecord = 0;
  let maximumActiveForRecord = 0;
  const completionOrder = [];
  await Promise.all(Array.from({ length: 32 }, (_, index) =>
    runSerially("same-record", async () => {
      activeForRecord += 1;
      maximumActiveForRecord = Math.max(maximumActiveForRecord, activeForRecord);
      await new Promise((resolve) => setImmediate(resolve));
      completionOrder.push(index);
      activeForRecord -= 1;
    })));
  assert.equal(maximumActiveForRecord, 1);
  assert.deepEqual(completionOrder, Array.from({ length: 32 }, (_, index) => index));

  let activeAcrossRecords = 0;
  let maximumActiveAcrossRecords = 0;
  await Promise.all(["record-a", "record-b"].map((key) =>
    runSerially(key, async () => {
      activeAcrossRecords += 1;
      maximumActiveAcrossRecords = Math.max(maximumActiveAcrossRecords, activeAcrossRecords);
      await new Promise((resolve) => setImmediate(resolve));
      activeAcrossRecords -= 1;
    })));
  assert.equal(maximumActiveAcrossRecords, 2);
});

 test("assembles the new agent pipeline without executing prompt text", () => {
  const result = spawnSync(
    "bash",
    [path.join(repoRoot, "scripts/agents/run-spatial-world-agent.sh"), "--", "--scene-id", "prompt-smoke", "$(touch should-not-run)"],
    { cwd: repoRoot, env: { ...process.env, WORLDKIT_PROMPT_SMOKE: "1" }, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /WORLDKIT_PROMPT_SMOKE_OK planner coding-agent block-build runtime-capture visual-reconstruction/);
});

test("routes Planner and Builder through the selected backend and visual reconstruction through one cloud Codex task", async () => {
  const [scripts, codexRouter, visualSkill] = await Promise.all([Promise.all([
    ["agents", "run-spatial-world-agent.sh"],
    ["agents", "run-lwdp-visual-reconstruction-agent.sh"],
    ["visual", "run-visual-reconstruction-agent.sh"],
  ].map((segments) => readFile(path.join(repoRoot, "scripts", ...segments), "utf8"))),
  readFile(path.join(repoRoot, "scripts/agents/run-codex-task.mjs"), "utf8"),
  readFile(path.join(repoRoot, ".codex/skills/worldkit-visual-reconstructor/SKILL.md"), "utf8")]);
  for (const source of scripts) {
    assert.doesNotMatch(source, /command -v codex|CODEX_HOME=|codex exec/);
  }
  assert.match(scripts[0], /codex_backend="\$\{WORLDKIT_CODEX_BACKEND:-cloud\}"/);
  assert.match(scripts[0], /run-codex-task\.mjs --backend "\$codex_backend"[^\n]*--execution-profile formal/);
  assert.match(codexRouter, /backend === "cloud"/);
  assert.match(codexRouter, /run-lwdp-codex-task\.mjs/);
  assert.match(codexRouter, /run-local-codex-task\.mjs/);
  assert.match(scripts[1], /run-codex-task\.mjs[\s\S]*--backend cloud/);
  assert.equal((scripts[1].match(/run-codex-task\.mjs/g) ?? []).length, 1);
  assert.equal((scripts[1].match(/--execution-profile formal/g) ?? []).length, 1);
  assert.doesNotMatch(scripts[1], /run-gemini-visual-pipeline|run-lwdp-t2i-job/);
  assert.match(scripts[2], /run-codex-task\.mjs --backend "\$codex_backend"/);
  assert.equal((scripts[2].match(/--execution-profile formal/g) ?? []).length, 2);
  assert.match(visualSkill, /actual-whitebox-opening.*edit target and sole spatial authority/s);
  assert.match(visualSkill, /Generate the styled opening first/);
});

test("keeps Planner prose and direct Block Builder authority separate", async () => {
  const [launcher, plannerSkill, plannerTemplate, plannerImageContract, builderSkill, blockApi, subjectCamera, studioApp, studioStyles, serverSource] = await Promise.all([
    readFile(path.join(repoRoot, "scripts/agents/run-spatial-world-agent.sh"), "utf8"),
    readFile(path.join(repoRoot, ".codex/skills/worldkit-spatial-planner/SKILL.md"), "utf8"),
    readFile(path.join(repoRoot, ".codex/skills/worldkit-spatial-planner/references/scene-brief-template.md"), "utf8"),
    readFile(path.join(repoRoot, ".codex/skills/worldkit-spatial-planner/references/block-whitebox-images.md"), "utf8"),
    readFile(path.join(repoRoot, ".codex/skills/worldkit-block-builder/SKILL.md"), "utf8"),
    readFile(path.join(repoRoot, ".codex/skills/worldkit-block-builder/references/block-api.md"), "utf8"),
    readFile(path.join(repoRoot, ".codex/skills/worldkit-block-builder/references/subject-camera.md"), "utf8"),
    readFile(path.join(repoRoot, "apps/studio/public/app.js"), "utf8"),
    readFile(path.join(repoRoot, "apps/studio/public/styles.css"), "utf8"),
    readFile(path.join(repoRoot, "apps/studio/src/server.mjs"), "utf8"),
  ]);
  assert.match(launcher, /worldkit brief validate/);
  assert.match(launcher, /worldkit-spatial-planner\/scripts\/self-check\.mjs/);
  assert.match(launcher, /worldkit-block-builder\/scripts\/self-check\.mjs/);
  assert.match(launcher, /non-authoritative composition intent/);
  assert.match(launcher, /\.codex\/skills\/worldkit-spatial-planner\/SKILL\.md/);
  assert.match(plannerSkill, /current Agent-facing hosted planning stage/);
  assert.doesNotMatch(plannerSkill, /WorldSpec|plan-lock/);
  assert.match(plannerSkill, /Name one or more movement modes/);
  assert.match(plannerSkill, /not a closed list/);
  assert.match(plannerSkill, /custom movement label/);
  assert.match(plannerSkill, /Write 1-5 entries total/);
  assert.match(plannerSkill, /no landmark merely to fill the list/);
  assert.match(plannerSkill, /several complete instances intentionally share the same appearance/);
  assert.match(plannerSkill, /both Planner images must already follow the same fixed target order/);
  assert.match(plannerImageContract, /ground-motion support/);
  assert.match(plannerImageContract, /interactive solid/);
  assert.match(plannerImageContract, /Air is empty space, not a block/);
  assert.match(plannerTemplate, /## 运动模式/);
  assert.match(plannerTemplate, /重复标志物/);
  assert.doesNotMatch(launcher, /Use packages\/authoring\/src\/spatial-world-plan-v1\.ts as the contract/);
  assert.doesNotMatch(launcher, /worldkit verify route/);
  assert.match(launcher, /Build the full explorable world/);
  assert.match(launcher, /Define 1-5 visual targets as whole targets/);
  assert.match(launcher, /four admitted undeformed BoxGeometry shapes/);
  assert.match(launcher, /quarter-volume \[0\.5,0\.5,1\]/);
  assert.match(launcher, /Reproduce terrain at macro silhouette/);
  assert.match(launcher, /The base may be any admitted person, animal, vehicle, giant, or custom Mesh; human is not special/);
  assert.match(launcher, /Agent-authored shapes never require bones/);
  assert.match(launcher, /Declare exactly one Subject Assembly/);
  assert.match(launcher, /Spring Arm hard collision/);
  assert.match(launcher, /no second semantic construction surface is available/);
  assert.match(launcher, /repair only world\.mjs/);
  assert.match(launcher, /Never edit the derived JSON outputs/);
  assert.match(launcher, /artifacts\/scenes\/\$scene_id\/world\.mjs/);
  assert.match(launcher, /implementation-map\.draft\.json/);
  assert.match(launcher, /finalize-spatial-build\.ts/);
  assert.match(launcher, /--triview-output/);
  assert.doesNotMatch(launcher, /WORLDKIT_PLANNER_REPAIR_LIMIT/);
  assert.doesNotMatch(launcher, /WORLDKIT_BUILDER_REPAIR_LIMIT/);
  assert.doesNotMatch(launcher, /WORLDKIT_PLANNER_REPAIR/);
  assert.doesNotMatch(launcher, /WORLDKIT_BUILDER_REPAIR/);
  assert.match(launcher, /planner-self-check\.json/);
  assert.match(launcher, /builder-self-check\.json/);
  assert.match(launcher, /--resume-host-only/);
  assert.match(launcher, /WORLDKIT_HOST_RESUME reuse=planner,builder/);
  assert.match(launcher, /WORLDKIT_HOST_RESUME_REPLAY_OK/);
  assert.match(launcher, /\.codex\/skills\/worldkit-block-builder\/SKILL\.md/);
  assert.doesNotMatch(launcher, /Read packages\/authoring\/src\/authoring-spec-v3\.schema\.json/);
  assert.match(builderSkill, /only world-geometry authority/);
  assert.match(builderSkill, /complete explorable world/);
  assert.match(builderSkill, /requireSingleReachableComponent/);
  assert.match(builderSkill, /requiredGroundTraversalBand/);
  assert.match(serverSource, /worldkit-block-builder-self-check-v10/);
  assert.match(blockApi, /BoxGeometry\(1, 1, 1\)/);
  assert.match(blockApi, /landmarkOrange/);
  assert.match(blockApi, /visual-target-3.*landmarkYellow/);
  assert.match(subjectCamera, /subjectPacks/);
  assert.match(subjectCamera, /humanoid\.g-bot/);
  assert.match(subjectCamera, /flight\.powered-standard/);
  assert.match(subjectCamera, /base-subject-socket/);
  assert.match(subjectCamera, /hard-collision Spring Arm/);
  assert.match(studioApp, /blockWhiteboxLegend/);
  assert.match(studioApp, /#00B8A9/);
  assert.match(studioApp, /规划图颜色覆盖/);
  assert.match(studioApp, /Block World V2 \/ Snapshot V4/);
  assert.match(studioApp, /从方块编译继续/);
  assert.match(studioStyles, /\.block-whitebox-legend/);
  assert.doesNotMatch(launcher, /plan:freeze/);
});

test("uses one formal LWDP Codex job for the styled opening and every tri-view", async () => {
  const result = spawnSync(
    "bash",
    [path.join(repoRoot, "scripts/agents/run-lwdp-visual-reconstruction-agent.sh"), "--", "--scene-id", "prompt-smoke"],
    { cwd: repoRoot, env: { ...process.env, WORLDKIT_PROMPT_SMOKE: "1" }, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /WORLDKIT_VISUAL_RECONSTRUCTION_SMOKE_OK lwdp-codex single-job gpt-5\.6-sol xhigh opening-and-all-triviews/);
  const [worldRunner, visualRunner, visualSkill, server] = await Promise.all([
    readFile(path.join(repoRoot, "scripts/agents/run-spatial-world-agent.sh"), "utf8"),
    readFile(path.join(repoRoot, "scripts/agents/run-lwdp-visual-reconstruction-agent.sh"), "utf8"),
    readFile(path.join(repoRoot, ".codex/skills/worldkit-visual-reconstructor/SKILL.md"), "utf8"),
    readFile(path.join(repoRoot, "apps/studio/src/server.mjs"), "utf8"),
  ]);
  assert.match(worldRunner, /run-lwdp-visual-reconstruction-agent\.sh/);
  assert.equal((visualRunner.match(/run-codex-task\.mjs/g) ?? []).length, 1);
  assert.match(visualRunner, /--backend cloud/);
  assert.match(visualRunner, /--execution-profile formal/);
  assert.match(visualRunner, /visual-generation-prompts\.json/);
  assert.match(visualRunner, /styled-opening-frame\.png/);
  assert.match(visualRunner, /styled-triview\.png/);
  assert.doesNotMatch(visualRunner, /Gemini|run-gemini|run-lwdp-t2i/);
  assert.match(visualSkill, /schemaVersion": 2/);
  assert.match(visualSkill, /provider": "lwdp-codex"/);
  assert.match(visualSkill, /Do not create a second Codex task/);
  assert.doesNotMatch(server, /whiteboxVideoMatch|enqueueVisual|runVisualJob/);
});

test("packages one visual Codex task with all named inputs and declared outputs", async () => {
  const sceneId = `visual-dispatch-smoke-${process.pid}`;
  const artifactRoot = path.join(repoRoot, "artifacts/scenes", sceneId);
  const targetRoot = path.join(artifactRoot, "triviews", "player-subject");
  const planRoot = path.join(repoRoot, "apps/playground/public/scene-plans", sceneId);
  const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
  await Promise.all([
    mkdir(targetRoot, { recursive: true }),
    mkdir(planRoot, { recursive: true }),
  ]);
  try {
    await Promise.all([
      writeFile(path.join(artifactRoot, "scene-brief.md"), "# WorldKit Scene Brief\n"),
      writeFile(path.join(artifactRoot, "visual-identity-palette.json"), JSON.stringify({
        targets: [{ visualTargetId: "player-subject", targetKind: "subject", name: "Player" }],
      })),
      writeFile(path.join(artifactRoot, "scene-implementation-map.json"), "{}"),
      writeFile(path.join(artifactRoot, "opening-frame.png"), png),
      writeFile(path.join(artifactRoot, "runtime-snapshot.json"), "{}"),
      writeFile(path.join(artifactRoot, "triviews/whitebox-triview-manifest.json"), JSON.stringify({
        whiteboxTriviews: [{
          visualTargetId: "player-subject",
          imageUri: "player-subject/whitebox-triview.png",
        }],
      })),
      writeFile(path.join(targetRoot, "whitebox-triview.png"), png),
      writeFile(path.join(planRoot, "reference-0.png"), png),
    ]);
    const result = spawnSync(
      "bash",
      [path.join(repoRoot, "scripts/agents/run-lwdp-visual-reconstruction-agent.sh"), "--", "--scene-id", sceneId],
      {
        cwd: repoRoot,
        env: { ...process.env, WORLDKIT_LWDP_CLIENT_SMOKE: "1" },
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /WORLDKIT_LWDP_CODEX_SMOKE visual-[^\s]+ dispatch=single-task-fast-path tasks=1 profile=formal model=gpt-5\.6-sol reasoning=xhigh submitAttempts=1 taskAttempts=3 priorTaskAttempts=0 timeoutMs=7200000 assets=4 outputs=3/);
    assert.match(result.stdout, /WORLDKIT_VISUAL_RECONSTRUCTION_DISPATCH_SMOKE targets=1 outputs=3/);
  } finally {
    await Promise.all([
      rm(artifactRoot, { recursive: true, force: true }),
      rm(planRoot, { recursive: true, force: true }),
    ]);
  }
});

test("renders current Babylon capture state without a legacy composition path", async () => {
  const app = await readFile(path.join(repoRoot, "apps/studio/public/app.js"), "utf8");
  assert.match(app, /Babylon Runtime/);
  assert.doesNotMatch(app, /hasLegacyGuide|capture-start|verify-entry/);
});

test("reuses one owned Playground window for every enter-world link", async () => {
  const [html, app] = await Promise.all([
    readFile(path.join(repoRoot, "apps/studio/public/index.html"), "utf8"),
    readFile(path.join(repoRoot, "apps/studio/public/app.js"), "utf8"),
  ]);
  assert.match(html, /class="play-button" target="worldkit-playground"/);
  assert.match(app, /target="worldkit-playground"[^>]*>进入白膜世界/);
  assert.doesNotMatch(html, /class="play-button" target="_blank"/);
  assert.doesNotMatch(app, /target="_blank"[^>]*>进入白膜世界/);
});

test("exposes a dedicated Seedance review tab with the reusable Playground target", async () => {
  const [html, app] = await Promise.all([
    readFile(path.join(repoRoot, "apps/studio/public/index.html"), "utf8"),
    readFile(path.join(repoRoot, "apps/studio/public/app.js"), "utf8"),
  ]);
  assert.match(html, /data-workspace-mode="seedance-review"/);
  assert.match(html, /id="seedance-review"[^>]*data-workspace-panel="seedance-review"/);
  assert.match(app, /\/api\/episode-workflows\?review=seedance/);
  assert.match(app, /productionOnly: true/);
  assert.match(app, /disposeEpisodeComparisonMedia/);
  assert.match(app, /window\.addEventListener\("pagehide", \(\) => disposeEpisodeComparisonMedia/);
  assert.match(app, /preload: comparison\.index === 0 \? "metadata" : "none"/);
  assert.match(app, /video\.preload = "auto"/);
  assert.match(app, /VISUAL RECONSTRUCTOR V5 · HUMAN REVIEW/);
  assert.match(app, /reviewStyledOpeningFrame/);
  assert.match(app, /target="worldkit-playground"[^>]*>进入世界试玩/);
});

test("normalizes input and validates image payloads", () => {
  const prompt = normalizePrompt("  一片围绕蓝色湖泊的多层山地  ");
  assert.equal(prompt, "一片围绕蓝色湖泊的多层山地");
  assert.equal(normalizeTestSetName("  复杂空间测试集  "), "复杂空间测试集");
  assert.match(createSceneId("Layered World", new Set()), /^layered-world-[a-f0-9]{4}$/);
  assert.throws(() => normalizePrompt(" "), /至少/);

  const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
  const decoded = decodeImagePayload({ name: "reference.png", dataUrl: `data:image/png;base64,${png.toString("base64")}` });
  assert.equal(decoded.extension, "png");
  assert.match(decoded.contentSha256, /^[a-f0-9]{64}$/);
  assert.throws(() => decodeImagePayload({ dataUrl: `data:image/png;base64,${Buffer.from("bad").toString("base64")}` }), /不匹配/);
});

test("allows only declared planning assets", () => {
  assert.equal(isAllowedSceneAsset("world-plan.png"), true);
  assert.equal(isAllowedSceneAsset("entry-whitebox-target.png"), true);
  assert.equal(isAllowedSceneAsset("reference-0.webp"), true);
  assert.equal(isAllowedSceneAsset("prototypes/tower/whitebox-triview.png"), true);
  assert.equal(isAllowedSceneAsset("../../package.json"), false);
});

test("proxies Playground subject assets through the Studio origin", async () => {
  const requestedUrls = [];
  const upstream = createServer((request, response) => {
    requestedUrls.push(request.url);
    response.writeHead(200, { "content-type": "model/gltf-binary" });
    response.end(Buffer.from("glb-through-playground"));
  });
  await new Promise((resolve, reject) => {
    upstream.once("error", reject);
    upstream.listen(0, "127.0.0.1", resolve);
  });
  const upstreamAddress = upstream.address();
  assert.ok(upstreamAddress && typeof upstreamAddress === "object");
  const playgroundInternalOrigin = `http://127.0.0.1:${upstreamAddress.port}`;
  const dataRoot = await temporaryRoot(".test-data-");
  const studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    playgroundOrigin: playgroundInternalOrigin,
    playgroundInternalOrigin,
  });
  const origin = await listen(studio);
  try {
    for (const assetPath of [
      "/subject-assets/humanoid/g-bot/v2/g-bot.glb?worldkit-content-hash=test",
      "/subject-assets/humanoid/golden/v2/golden-humanoid.glb",
    ]) {
      const response = await fetch(`${origin}${assetPath}`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), "model/gltf-binary");
      assert.equal(await response.text(), "glb-through-playground");
    }
    assert.deepEqual(requestedUrls, [
      "/subject-assets/humanoid/g-bot/v2/g-bot.glb?worldkit-content-hash=test",
      "/subject-assets/humanoid/golden/v2/golden-humanoid.glb",
    ]);
  } finally {
    await studio.shutdown();
    await new Promise((resolve, reject) => upstream.close((error) => error ? reject(error) : resolve()));
  }
});

test("protects public Studio instances with Basic access", () => {
  const valid = `Basic ${Buffer.from("worldkit:secret").toString("base64")}`;
  assert.equal(isAuthorizedHeader(undefined, ""), true);
  assert.equal(isAuthorizedHeader(undefined, "secret"), false);
  assert.equal(isAuthorizedHeader(valid, "secret"), true);
});

test("proves private readiness only to the parent that holds the child nonce", async () => {
  const dataRoot = await temporaryRoot(".readiness-nonce-");
  const readinessNonce = "0123456789abcdef0123456789abcdef";
  const studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    readinessNonce,
  });
  const origin = await listen(studio);
  try {
    const missing = await fetch(`${origin}/__worldkit/studio-ready`);
    assert.equal(missing.status, 404);

    const wrong = await fetch(`${origin}/__worldkit/studio-ready`, {
      headers: { "x-worldkit-readiness-nonce": "fedcba9876543210fedcba9876543210" },
    });
    assert.equal(wrong.status, 404);

    const ready = await fetch(`${origin}/__worldkit/studio-ready`, {
      headers: { "x-worldkit-readiness-nonce": readinessNonce },
    });
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), {
      status: "ready",
      nonce: readinessNonce,
      pid: process.pid,
    });
  } finally {
    await studio.shutdown();
  }
});

test("publishes bounded concurrent cloud-case capacity without starting queued work", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    maxConcurrentJobs: 6,
    lwdpConfigured: true,
  });
  const origin = await listen(studio);
  try {
    const health = await (await fetch(`${origin}/api/health`)).json();
    assert.equal(health.activeJob, null);
    assert.deepEqual(health.activeJobs, []);
    assert.equal(health.maxConcurrentJobs, 6);
    assert.deepEqual(health.maxConcurrentJobsByBackend, { cloud: 6, local: 1 });
    assert.equal(health.lwdpConfigured, true);
    assert.equal(health.codexBackend, "cloud");
    assert.equal(health.codexAvailable, true);
    assert.equal(health.codexBackends.cloud.available, true);
    assert.equal(typeof health.codexBackends.local.available, "boolean");
    assert.equal(health.visualReconstructionBackend, "lwdp-codex");
    assert.deepEqual(health.visualReconstructionExecutionProfile, {
      name: "formal",
      model: "gpt-5.6-sol",
      reasoningEffort: "xhigh",
    });
    assert.deepEqual(health.codexExecutionProfile, {
      name: "formal",
      model: "gpt-5.6-sol",
      reasoningEffort: "xhigh",
    });
    assert.equal(health.queued, 0);
  } finally {
    await studio.shutdown();
  }
});

test("caches health capability probes and force-refreshes them only for an explicit backend switch", async () => {
  const dataRoot = await temporaryRoot(".health-capability-cache-");
  let codexProbeCount = 0;
  const studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    lwdpConfigured: true,
    pnpmAvailable: true,
    codexAvailabilityTtlMs: 60_000,
    codexSpawnSync: () => {
      codexProbeCount += 1;
      return { status: 0 };
    },
  });
  const origin = await listen(studio);
  try {
    const first = await fetch(`${origin}/api/health`).then((response) => response.json());
    const second = await fetch(`${origin}/api/health`).then((response) => response.json());
    assert.equal(first.pnpmAvailable, true);
    assert.deepEqual(second.codexBackends, first.codexBackends);
    assert.equal(codexProbeCount, 2);

    const switched = await fetch(`${origin}/api/settings/codex-backend`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ backend: "local" }),
    });
    assert.equal(switched.status, 200);
    assert.equal(codexProbeCount, 4);
    await fetch(`${origin}/api/health`);
    assert.equal(codexProbeCount, 4);
  } finally {
    await studio.shutdown();
  }
});

test("uses the project-local LWDP runtime configuration for cloud availability", async () => {
  const dataRoot = await temporaryRoot(".project-local-lwdp-data-");
  const fakeRepoRoot = await temporaryRoot(".project-local-lwdp-repo-");
  const runtimeRoot = path.join(fakeRepoRoot, ".codex-tmp/runtime-config");
  await mkdir(runtimeRoot, { recursive: true });
  await writeFile(path.join(runtimeRoot, "lwdp.env"), "LWDP_GENERATION_API_TOKEN=test-only\n");
  const studio = createStudio({
    repoRoot: fakeRepoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    codexSpawnSync: () => ({ status: 1 }),
  });
  const origin = await listen(studio);
  try {
    const health = await fetch(`${origin}/api/health`).then((response) => response.json());
    assert.equal(health.codexBackends.cloud.available, true);
    assert.equal(health.lwdpConfigured, true);
  } finally {
    await studio.shutdown();
  }
});

test("defaults to cloud and atomically persists an available one-click Codex backend switch", async () => {
  const dataRoot = await temporaryRoot(".codex-backend-persistence-");
  const codexSpawnSync = (_command, args) => ({
    status: args[0] === "--version" || (args[0] === "login" && args[1] === "status") ? 0 : 1,
  });
  let studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    lwdpConfigured: true,
    codexSpawnSync,
  });
  let origin = await listen(studio);
  try {
    const initialHealth = await fetch(`${origin}/api/health`).then((response) => response.json());
    assert.equal(initialHealth.codexBackend, "cloud");
    assert.equal(initialHealth.maxConcurrentJobs, 24);
    assert.deepEqual(initialHealth.maxConcurrentJobsByBackend, { cloud: 24, local: 1 });
    assert.deepEqual(initialHealth.codexBackends, {
      cloud: { available: true },
      local: { available: true },
    });

    const switched = await fetch(`${origin}/api/settings/codex-backend`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ backend: "local" }),
    });
    assert.equal(switched.status, 200);
    assert.equal((await switched.json()).codexBackend, "local");
    const persisted = JSON.parse(await readFile(path.join(dataRoot, "runtime-settings.json"), "utf8"));
    assert.deepEqual(
      { kind: persisted.kind, schemaVersion: persisted.schemaVersion, codexBackend: persisted.codexBackend },
      { kind: "worldkit-studio-runtime-settings", schemaVersion: 1, codexBackend: "local" },
    );
    assert.deepEqual(
      (await readdir(dataRoot)).filter((name) => name.endsWith(".tmp")),
      [],
    );
  } finally {
    await studio.shutdown();
  }

  studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    initialCodexBackend: "cloud",
    lwdpConfigured: true,
    codexSpawnSync,
  });
  origin = await listen(studio);
  try {
    const health = await fetch(`${origin}/api/health`).then((response) => response.json());
    assert.equal(health.codexBackend, "local");
    assert.equal(health.codexAvailable, true);
  } finally {
    await studio.shutdown();
  }
});

test("rejects an unavailable backend without changing the selected or persisted backend", async () => {
  const dataRoot = await temporaryRoot(".codex-backend-unavailable-");
  const studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    lwdpConfigured: true,
    codexSpawnSync: (_command, args) => ({ status: args[0] === "--version" ? 0 : 1 }),
  });
  const origin = await listen(studio);
  try {
    const response = await fetch(`${origin}/api/settings/codex-backend`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ backend: "local" }),
    });
    assert.equal(response.status, 409);
    const payload = await response.json();
    assert.equal(payload.codexBackend, "cloud");
    assert.equal(payload.codexBackends.local.available, false);
    const health = await fetch(`${origin}/api/health`).then((result) => result.json());
    assert.equal(health.codexBackend, "cloud");
    assert.equal(health.codexAvailable, true);
    const persisted = JSON.parse(await readFile(path.join(dataRoot, "runtime-settings.json"), "utf8"));
    assert.equal(persisted.codexBackend, "cloud");
  } finally {
    await studio.shutdown();
  }
});

test("defaults legacy records without a frozen backend to cloud", async () => {
  const dataRoot = await temporaryRoot(".codex-backend-legacy-");
  const legacyId = "legacy-queued-world";
  const legacyRoot = path.join(dataRoot, "worlds", legacyId);
  await mkdir(legacyRoot, { recursive: true });
  await writeFile(path.join(legacyRoot, "record.json"), JSON.stringify({
    id: legacyId,
    sceneId: legacyId,
    title: "Legacy queued world",
    prompt: "Build the legacy queued world.",
    referenceImage: null,
    status: "queued",
    stage: "queued",
    attempt: 0,
    origin: "creator-studio",
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
    workflowPolicyVersion: 23,
  }));
  const studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    initialCodexBackend: "local",
    lwdpConfigured: true,
    codexSpawnSync: () => ({ status: 0 }),
  });
  const origin = await listen(studio);
  try {
    const world = await fetch(`${origin}/api/worlds/${legacyId}`).then((response) => response.json());
    assert.equal(world.world.codexBackend, "cloud");
    const health = await fetch(`${origin}/api/health`).then((response) => response.json());
    assert.equal(health.codexBackend, "local");
  } finally {
    await studio.shutdown();
  }
});

test("freezes each backend and gives cloud and local independent execution slots", async () => {
  const dataRoot = await temporaryRoot(".codex-backend-binding-");
  const pendingById = new Map();
  const started = [];
  const studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: true,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    maxConcurrentJobs: 1,
    lwdpConfigured: true,
    codexSpawnSync: () => ({ status: 0 }),
    jobRunner: (id) => new Promise((resolve) => {
      started.push(id);
      pendingById.set(id, resolve);
    }),
  });
  const origin = await listen(studio);
  try {
    const firstResponse = await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Cloud-bound", prompt: "Create the first backend-bound world." }),
    });
    const first = (await firstResponse.json()).world;
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(started, [first.id]);
    assert.equal(first.codexBackend, "cloud");

    const switchResponse = await fetch(`${origin}/api/settings/codex-backend`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ backend: "local" }),
    });
    assert.equal(switchResponse.status, 200);
    const firstAfterSwitch = await fetch(`${origin}/api/worlds/${first.id}`).then((response) => response.json());
    assert.equal(firstAfterSwitch.world.codexBackend, "cloud");

    const secondResponse = await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Local-bound", prompt: "Create the second backend-bound world." }),
    });
    const second = (await secondResponse.json()).world;
    assert.equal(second.codexBackend, "local");
    assert.equal((await fetch(`${origin}/api/worlds/${first.id}`).then((response) => response.json())).world.codexBackend, "cloud");
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(started, [first.id, second.id]);
    assert.equal(studio.activeJobs.length, 2);

    const thirdResponse = await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Local queued", prompt: "Create the queued local world." }),
    });
    const third = (await thirdResponse.json()).world;
    assert.equal(third.codexBackend, "local");
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(started, [first.id, second.id]);
    const health = await fetch(`${origin}/api/health`).then((response) => response.json());
    assert.deepEqual(health.maxConcurrentJobsByBackend, { cloud: 1, local: 1 });
    assert.deepEqual(health.queuedByBackend, { cloud: 0, local: 1 });

    pendingById.get(first.id)();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(started, [first.id, second.id]);
    pendingById.get(second.id)();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(started, [first.id, second.id, third.id]);
    pendingById.get(third.id)();
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    for (const resolve of pendingById.values()) resolve();
    await studio.shutdown();
  }
});

test("stops both queued and running worlds without counting user cancellation as failure", async () => {
  const dataRoot = await temporaryRoot(".world-stop-");
  const pendingById = new Map();
  const studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: true,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    maxConcurrentJobs: 1,
    jobRunner: (id) => new Promise((resolve) => pendingById.set(id, resolve)),
  });
  const origin = await listen(studio);
  try {
    const create = async (title) => (await (await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, prompt: `Build ${title}` }),
    })).json()).world;
    const running = await create("Running stop case");
    const queued = await create("Queued stop case");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(studio.activeJobs.length, 1);

    const queuedStop = await fetch(`${origin}/api/worlds/${queued.id}/stop`, { method: "POST" });
    assert.equal(queuedStop.status, 200);
    assert.equal((await queuedStop.json()).world.status, "interrupted");
    assert.equal((await fetch(`${origin}/api/health`).then((response) => response.json())).queued, 0);

    const runningStop = await fetch(`${origin}/api/worlds/${running.id}/stop`, { method: "POST" });
    assert.equal(runningStop.status, 200);
    const stopped = (await runningStop.json()).world;
    assert.equal(stopped.status, "interrupted");
    assert.equal(stopped.outcome, "cancelled");
    assert.match(stopped.error, /用户已停止/);
    pendingById.get(running.id)?.();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(studio.activeJobs.length, 0);

    const reliability = deriveReliabilityMetrics([
      { status: "interrupted", outcome: "cancelled", error: "用户已停止任务" },
    ]);
    assert.equal(reliability.terminalCount, 0);
    assert.equal(reliability.failureCount, 0);
  } finally {
    for (const resolve of pendingById.values()) resolve();
    await studio.shutdown();
  }
});

test("stops an active world before child registration without spawning the pipeline", async () => {
  const dataRoot = await temporaryRoot(".world-stop-before-spawn-");
  let markSpawnBoundaryReached;
  let releaseSpawnBoundary;
  const spawnBoundaryReached = new Promise((resolve) => { markSpawnBoundaryReached = resolve; });
  const spawnBoundaryRelease = new Promise((resolve) => { releaseSpawnBoundary = resolve; });
  let spawnCalls = 0;
  const studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: true,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    lwdpConfigured: true,
    beforeWorldSpawn: async () => {
      markSpawnBoundaryReached();
      await spawnBoundaryRelease;
    },
    worldSpawnImplementation: () => {
      spawnCalls += 1;
      throw new Error("world pipeline must not spawn after cancellation");
    },
  });
  const origin = await listen(studio);
  let created;
  try {
    created = (await (await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Stop before spawn", prompt: "Build a cancellable world." }),
    })).json()).world;
    await spawnBoundaryReached;
    assert.deepEqual(studio.activeJobs, [created.id]);
    assert.equal(spawnCalls, 0);

    const response = await fetch(`${origin}/api/worlds/${created.id}/stop`, { method: "POST" });
    const responseBody = await response.text();
    assert.equal(response.status, 200, responseBody);
    const stopped = JSON.parse(responseBody).world;
    assert.equal(stopped.status, "interrupted");
    assert.equal(stopped.outcome, "cancelled");

    releaseSpawnBoundary();
    for (let attempt = 0; attempt < 20 && studio.activeJobs.length > 0; attempt += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(spawnCalls, 0);
    assert.deepEqual(studio.activeJobs, []);
    const persisted = await fetch(`${origin}/api/worlds/${created.id}`).then((result) => result.json());
    assert.equal(persisted.world.status, "interrupted");
    assert.equal(persisted.world.outcome, "cancelled");
  } finally {
    releaseSpawnBoundary?.();
    await studio.shutdown();
    if (created?.sceneId) {
      await rm(path.join(repoRoot, "artifacts/scenes", created.sceneId), {
        recursive: true,
        force: true,
      });
    }
  }
});

test("publishes a playable whitebox when tri-view post-processing fails", async () => {
  const dataRoot = await temporaryRoot(".playable-whitebox-triview-failure-data-");
  const fakeRepoRoot = await temporaryRoot(".playable-whitebox-triview-failure-repo-");
  const studio = createStudio({
    repoRoot: fakeRepoRoot,
    dataRoot,
    autoRunJobs: true,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    lwdpConfigured: true,
    beforeWorldSpawn: async (id) => {
      const { artifactRoot } = await writeTrustedWhiteboxArtifacts(fakeRepoRoot, id);
      await rm(path.join(artifactRoot, "triviews"), { recursive: true, force: true });
    },
    worldSpawnImplementation: () => {
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.killed = false;
      child.kill = () => {
        child.killed = true;
        return true;
      };
      setImmediate(() => {
        child.stderr.end("WORLDKIT_CAPTURE_TRIVIEW_EMPTY: player-subject\n");
        child.stdout.end();
        child.emit("close", 1, null);
      });
      return child;
    },
  });
  const origin = await listen(studio);
  try {
    const created = (await (await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Playable whitebox",
        prompt: "Build a playable whitebox whose tri-view capture will fail.",
      }),
    })).json()).world;
    let detail;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      detail = await fetch(`${origin}/api/worlds/${created.id}`).then((response) => response.json());
      if (detail.world.status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    assert.equal(detail.world.status, "failed");
    assert.equal(detail.world.captureStatus, "passed");
    assert.equal(detail.world.triviewStatus, "failed");
    assert.equal(detail.world.whiteboxOutcome, "passed");
    assert.equal(detail.world.whiteboxRuntimeAvailable, true);
    assert.equal(detail.world.previewUrl, `/play?authoring=1&world=${created.id}`);
    assert.match(detail.world.error, /白膜世界已成功生成并可进入.*三视图后处理失败/);
    assert.equal(
      detail.media.trajectory.stages.find(({ id }) => id === "runtime-capture")?.status,
      "failed",
    );
    assert.equal(
      (await fetch(`${origin}/api/worlds/${created.id}/preview-bootstrap`)).status,
      200,
    );
    const report = JSON.parse(await readFile(
      path.join(fakeRepoRoot, "artifacts/scenes", created.sceneId, "evaluation-report.json"),
      "utf8",
    ));
    assert.equal(report.outcome, "failed");
    assert.equal(report.whiteboxOutcome, "passed");
    assert.equal(report.triviewStatus, "failed");
  } finally {
    await studio.shutdown();
  }
});

test("retries a trusted block-build failure from Host without launching Planner or Builder", async () => {
  const dataRoot = await temporaryRoot(".host-resume-data-");
  const fakeRepoRoot = await temporaryRoot(".host-resume-repo-");
  const sceneId = "host-resume-world";
  await writeTrustedWhiteboxArtifacts(fakeRepoRoot, sceneId);
  const legacyBuilderReportPath = path.join(
    fakeRepoRoot,
    "artifacts/scenes",
    sceneId,
    "builder-self-check.json",
  );
  const legacyBuilderReport = JSON.parse(await readFile(legacyBuilderReportPath, "utf8"));
  legacyBuilderReport.validatorVersion = "worldkit-block-builder-self-check-v2";
  await writeFile(legacyBuilderReportPath, JSON.stringify(legacyBuilderReport));
  const recordRoot = path.join(dataRoot, "worlds", sceneId);
  await mkdir(recordRoot, { recursive: true });
  const timestamp = new Date().toISOString();
  await writeFile(path.join(recordRoot, "record.json"), JSON.stringify({
    id: sceneId,
    sceneId,
    title: "Host resume world",
    prompt: "Do not submit this prompt again.",
    referenceImage: null,
    status: "failed",
    stage: "failed",
    failedStage: "block-build",
    codexBackend: "cloud",
    attempt: 1,
    origin: "test-set",
    createdAt: timestamp,
    updatedAt: timestamp,
    startedAt: timestamp,
    finishedAt: timestamp,
    error: "Maximum call stack size exceeded",
    captureRequired: true,
    captureStatus: "failed",
    triviewStatus: "not-run",
    outcome: "failed",
    styledOpeningFrameRequired: false,
    styledOpeningFrameStatus: "not-required",
    styledTriviewsRequired: false,
    styledTriviewsStatus: "not-required",
    workflowPolicyVersion,
  }));
  let spawnedArgs;
  let markSpawned;
  const spawned = new Promise((resolve) => { markSpawned = resolve; });
  const studio = createStudio({
    repoRoot: fakeRepoRoot,
    dataRoot,
    autoRunJobs: true,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    lwdpConfigured: true,
    worldSpawnImplementation: (_command, args) => {
      spawnedArgs = args;
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.killed = false;
      child.kill = () => true;
      markSpawned();
      setImmediate(() => {
        child.stdout.end();
        child.stderr.end();
        child.emit("close", 2, null);
      });
      return child;
    },
  });
  const origin = await listen(studio);
  try {
    const response = await fetch(`${origin}/api/worlds/${sceneId}/retry`, { method: "POST" });
    const payload = await response.json();
    assert.equal(response.status, 202);
    assert.deepEqual(payload, {
      ok: true,
      executionMode: "host-resume",
      resumeFromStage: "block-build",
    });
    await spawned;
    assert.deepEqual(spawnedArgs, [
      "agent:world:resume-host",
      "--",
      "--scene-id",
      sceneId,
    ]);
    assert.equal(spawnedArgs.includes("agent:world"), false);
    const log = await readFile(path.join(recordRoot, "agent.log"), "utf8");
    assert.match(log, /no Codex task will be submitted/);
    for (let attempt = 0; attempt < 100 && studio.activeJobs.length > 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.deepEqual(studio.activeJobs, []);
  } finally {
    await studio.shutdown();
  }
});

test("retries a trusted late Planner delivery from Builder without launching Planner", async () => {
  const dataRoot = await temporaryRoot(".builder-resume-data-");
  const fakeRepoRoot = await temporaryRoot(".builder-resume-repo-");
  const sceneId = "builder-resume-world";
  const { artifactRoot } = await writeTrustedWhiteboxArtifacts(fakeRepoRoot, sceneId);
  const brief = await readFile(path.join(artifactRoot, "scene-brief.md"));
  const palettePath = path.join(artifactRoot, "visual-identity-palette.json");
  const palette = JSON.parse(await readFile(palettePath, "utf8"));
  palette.sceneBriefHash = `sha256:${createHash("sha256").update(brief).digest("hex")}`;
  await writeFile(palettePath, JSON.stringify(palette));
  await Promise.all([
    "world.mjs",
    "authoring.json",
    "implementation-map.draft.json",
    "builder-self-check.json",
    "builder-top-down-comparison.png",
    "builder-entry-comparison.png",
  ].map((name) => rm(path.join(artifactRoot, name), { force: true })));
  const recordRoot = path.join(dataRoot, "worlds", sceneId);
  await mkdir(recordRoot, { recursive: true });
  const timestamp = new Date().toISOString();
  await writeFile(path.join(recordRoot, "record.json"), JSON.stringify({
    id: sceneId,
    sceneId,
    title: "Builder resume world",
    prompt: "Do not submit Planner again.",
    referenceImage: null,
    status: "failed",
    stage: "failed",
    failedStage: "planner",
    codexBackend: "cloud",
    attempt: 1,
    origin: "test-set",
    createdAt: timestamp,
    updatedAt: timestamp,
    startedAt: timestamp,
    finishedAt: timestamp,
    error: "LWDP Planner timed out after 60 分钟.",
    captureRequired: true,
    captureStatus: "failed",
    triviewStatus: "not-run",
    outcome: "failed",
    styledOpeningFrameRequired: false,
    styledOpeningFrameStatus: "not-required",
    styledTriviewsRequired: false,
    styledTriviewsStatus: "not-required",
    workflowPolicyVersion,
  }));
  let spawnedArgs;
  let markSpawned;
  const spawned = new Promise((resolve) => { markSpawned = resolve; });
  const studio = createStudio({
    repoRoot: fakeRepoRoot,
    dataRoot,
    autoRunJobs: true,
    autoRecoverLateLwdpJobs: false,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    lwdpConfigured: true,
    worldSpawnImplementation: (_command, args) => {
      spawnedArgs = args;
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.killed = false;
      child.kill = () => true;
      markSpawned();
      setImmediate(() => {
        child.stdout.end();
        child.stderr.end();
        child.emit("close", 2, null);
      });
      return child;
    },
  });
  const origin = await listen(studio);
  try {
    const response = await fetch(`${origin}/api/worlds/${sceneId}/retry`, { method: "POST" });
    const payload = await response.json();
    assert.equal(response.status, 202);
    assert.deepEqual(payload, {
      ok: true,
      executionMode: "builder-resume",
      resumeFromStage: "planner",
    });
    await spawned;
    assert.deepEqual(spawnedArgs, [
      "agent:world:build",
      "--",
      "--scene-id",
      sceneId,
    ]);
    assert.equal(spawnedArgs.includes("agent:world"), false);
    const log = await readFile(path.join(recordRoot, "agent.log"), "utf8");
    assert.match(log, /only Builder and downstream Host stages will run/);
  } finally {
    await studio.shutdown();
  }
});

test("rebuilds a ready Cloud Scene from its trusted Planner handoff", async () => {
  const dataRoot = await temporaryRoot(".ready-cloud-builder-rebuild-data-");
  const sceneId = "ready-cloud-builder-rebuild";
  const recordRoot = path.join(dataRoot, "worlds", sceneId);
  await mkdir(recordRoot, { recursive: true });
  const timestamp = new Date().toISOString();
  const plannerArtifacts = [
    "scene/scene-brief.md",
    "scene/planner-self-check.json",
    "scene/visual-identity-palette.json",
    "scene-plan/entry-whitebox-target.png",
    "scene-plan/world-plan.png",
  ].map((artifactPath) => ({
    path: artifactPath,
    s3_uri: `s3://worldkit-test/cloud-scenes/${sceneId}/${artifactPath}`,
  }));
  await writeFile(path.join(recordRoot, "record.json"), JSON.stringify({
    id: sceneId,
    sceneId,
    title: "Ready Cloud Builder rebuild",
    prompt: "Reuse this Planner handoff.",
    referenceImage: null,
    status: "ready",
    stage: "ready",
    failedStage: null,
    codexBackend: "cloud",
    attempt: 1,
    origin: "test-set",
    createdAt: timestamp,
    updatedAt: timestamp,
    startedAt: timestamp,
    finishedAt: timestamp,
    error: null,
    captureRequired: false,
    captureStatus: "passed",
    triviewStatus: "passed",
    outcome: "passed",
    whiteboxOutcome: "passed",
    styledOpeningFrameRequired: false,
    styledOpeningFrameStatus: "not-required",
    styledTriviewsRequired: false,
    styledTriviewsStatus: "not-required",
    workflowPolicyVersion,
    remoteExecutionId: "execution-ready-builder-rebuild",
    remoteRequestS3Uri: `s3://worldkit-test/cloud-scenes/${sceneId}/request.json`,
    remoteOutputS3Prefix: `s3://worldkit-test/cloud-scenes/${sceneId}/attempt-1`,
    remoteArtifactManifestS3Uri:
      `s3://worldkit-test/cloud-scenes/${sceneId}/attempt-1/cloud-artifact-manifest.json`,
    remoteArtifacts: plannerArtifacts,
  }));
  const studio = createStudio({
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    lwdpConfigured: true,
  });
  const origin = await listen(studio);
  try {
    const response = await fetch(
      `${origin}/api/worlds/${sceneId}/rebuild-builder`,
      { method: "POST" },
    );
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), {
      ok: true,
      executionMode: "cloud-builder-rebuild",
      resumeFromStage: "cloud-builder-rebuild",
    });
    const detail = JSON.parse(await readFile(path.join(recordRoot, "record.json"), "utf8"));
    assert.equal(detail.status, "queued");
    assert.equal(detail.resumeFromStage, "cloud-builder-rebuild");
    assert.equal(detail.attempt, 1);
    assert.equal(
      detail.cloudBuilderRebuildSourceExecutionId,
      "execution-ready-builder-rebuild",
    );
    assert.equal(
      detail.cloudBuilderRebuildSourceManifestS3Uri,
      `s3://worldkit-test/cloud-scenes/${sceneId}/attempt-1/cloud-artifact-manifest.json`,
    );
    assert.equal(
      detail.cloudBuilderRebuildSourceRequestS3Uri,
      `s3://worldkit-test/cloud-scenes/${sceneId}/request.json`,
    );
  } finally {
    await studio.shutdown();
  }
});

test("snapshots one selected Codex backend across every world in a test-set batch", async () => {
  const dataRoot = await temporaryRoot(".codex-backend-batch-");
  const studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    lwdpConfigured: true,
    codexSpawnSync: () => ({ status: 0 }),
  });
  const origin = await listen(studio);
  try {
    assert.equal((await fetch(`${origin}/api/settings/codex-backend`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ backend: "local" }),
    })).status, 200);
    const testSet = (await (await fetch(`${origin}/api/test-sets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Backend batch", prompt: "Build each complete reference world." }),
    })).json()).testSet;
    for (const suffix of [1, 2]) {
      const bytes = Buffer.from(`89504e470d0a1a0a0000000${suffix}`, "hex");
      const upload = await fetch(`${origin}/api/test-sets/${testSet.id}/images`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          image: {
            name: `case-${suffix}.png`,
            dataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
          },
        }),
      });
      assert.equal(upload.status, 201);
    }
    const run = await fetch(`${origin}/api/test-sets/${testSet.id}/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(run.status, 202);
    const worlds = (await run.json()).worlds;
    assert.equal(worlds.length, 2);
    assert.ok(worlds.every(({ codexBackend }) => codexBackend === "local"));
    assert.equal(new Set(worlds.map(({ batchId }) => batchId)).size, 1);
  } finally {
    await studio.shutdown();
  }
});

test("dispatches queued cloud cases up to the configured concurrency without sharing slots", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const pendingById = new Map();
  const started = [];
  let maximumActive = 0;
  let studio;
  const jobRunner = (id) => new Promise((resolve) => {
    started.push(id);
    pendingById.set(id, resolve);
    maximumActive = Math.max(maximumActive, studio.activeJobs.length);
  });
  studio = createStudio({
    repoRoot,
    dataRoot,
    autoRunJobs: true,
    importExistingArtifacts: false,
    maxConcurrentJobs: 2,
    jobRunner,
  });
  const origin = await listen(studio);
  try {
    for (const title of ["Cloud A", "Cloud B", "Cloud C"]) {
      const response = await fetch(`${origin}/api/worlds`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, prompt: `Build ${title}` }),
      });
      assert.equal(response.status, 202);
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(started.length, 2);
    assert.equal(studio.activeJobs.length, 2);
    assert.equal(maximumActive, 2);

    pendingById.get(started[0])();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(started.length, 3);
    assert.equal(studio.activeJobs.length, 2);
    assert.equal(new Set(started).size, 3);

    for (const resolve of pendingById.values()) resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(studio.activeJobs.length, 0);
  } finally {
    for (const resolve of pendingById.values()) resolve();
    await studio.shutdown();
  }
});

test("adapts the main Registry subject catalog for the Studio UI", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const studio = createStudio({ repoRoot, dataRoot, autoRunJobs: false });
  const origin = await listen(studio);
  try {
    const response = await fetch(`${origin}/api/subject-catalog`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(payload.presets.length >= 5);
    assert.ok(payload.presets.every(({ ref }) => ref.startsWith("worldkit://subject-definition/")));
    assert.ok(payload.productionRefs.includes("worldkit://subject-definition/humanoid.g-bot@2"));
    assert.ok(payload.advancedRefs.includes("worldkit://subject-definition/xier120.quadruped-animal@1"));
    assert.ok(payload.presets.some(({ packId }) =>
      packId === "animal.quadruped.forward-steer.v1"));
    assert.ok(!payload.presets.some(({ ref }) =>
      ref === "worldkit://subject-definition/humanoid.third-person@1"));
    assert.deepEqual(
      payload.motionPacks.map(({ id }) => id),
      [
        "flight.powered-standard",
        "ground.character-standard",
        "ground.root-standard",
      ],
    );
    assert.equal(payload.cameraPacks.length, 4);
  } finally {
    await studio.shutdown();
  }
});

test("derives the single current Scene Brief workflow", () => {
  const stages = deriveWorkflowTrajectory({
    record: {
      stage: "block-build", status: "running", captureStatus: "pending",
      styledOpeningFrameRequired: true, styledTriviewsRequired: true,
    },
    availableIds: [
      "scene-brief", "planner-self-check", "visual-identity-palette", "world-plan",
      "entry-whitebox-target", "world-module", "authoring-spec", "implementation-map-draft",
      "builder-self-check", "builder-top-down-comparison", "builder-entry-comparison",
    ],
  });
  assert.equal(stages.find(({ id }) => id === "planner")?.status, "complete");
  assert.equal(stages.find(({ id }) => id === "coding-agent")?.status, "complete");
  assert.equal(stages.find(({ id }) => id === "block-build")?.status, "active");
  assert.equal(stages.find(({ id }) => id === "runtime-capture")?.status, "pending");
  assert.equal(stages.find(({ id }) => id === "entry-alignment-validation")?.status, "pending");
  assert.equal(stages.some(({ id }) => ["spatial-planner", "image-planner", "styled-triviews"].includes(id)), false);
});

test("separates whitebox capture from Snapshot V4 entry-alignment validation", () => {
  const availableIds = [
    "scene-brief", "planner-self-check", "visual-identity-palette", "world-plan", "entry-whitebox-target",
    "world-module", "authoring-spec", "implementation-map-draft", "builder-self-check",
    "builder-top-down-comparison", "builder-entry-comparison", "implementation-map", "execution-plan",
    "opening-frame", "runtime-snapshot", "whitebox-capture-receipt",
    "whitebox-triview-manifest",
  ];
  const failedStages = deriveWorkflowTrajectory({
    record: {
      stage: "failed",
      failedStage: "entry-alignment-validation",
      status: "failed",
      captureStatus: "passed",
      workflowPolicyVersion,
      styledOpeningFrameRequired: true,
      styledTriviewsRequired: true,
    },
    availableIds,
  });
  assert.equal(failedStages.find(({ id }) => id === "runtime-capture")?.status, "complete");
  assert.equal(failedStages.find(({ id }) => id === "entry-alignment-validation")?.status, "failed");

  const passedStages = deriveWorkflowTrajectory({
    record: {
      stage: "visual-reconstruction",
      status: "running",
      captureStatus: "passed",
      workflowPolicyVersion,
      styledOpeningFrameRequired: true,
      styledTriviewsRequired: true,
    },
    availableIds: [...availableIds, "entry-third-person-validation"],
  });
  assert.equal(passedStages.find(({ id }) => id === "entry-alignment-validation")?.status, "complete");
  assert.equal(passedStages.find(({ id }) => id === "visual-reconstruction")?.status, "active");
});

test("keeps a tri-view post-processing failure separate from playable whitebox capture", () => {
  const stages = deriveWorkflowTrajectory({
    record: {
      stage: "failed",
      failedStage: "runtime-capture",
      status: "failed",
      captureStatus: "passed",
      triviewStatus: "failed",
      workflowPolicyVersion,
      styledOpeningFrameRequired: true,
      styledTriviewsRequired: true,
    },
    availableIds: [
      "scene-brief", "planner-self-check", "visual-identity-palette", "world-plan",
      "entry-whitebox-target", "world-module", "authoring-spec", "implementation-map-draft",
      "builder-self-check", "builder-top-down-comparison", "builder-entry-comparison",
      "implementation-map", "execution-plan", "opening-frame",
      "runtime-snapshot", "whitebox-capture-receipt",
    ],
  });

  assert.equal(stages.find(({ id }) => id === "block-build")?.status, "complete");
  assert.equal(stages.find(({ id }) => id === "runtime-capture")?.status, "failed");
  assert.equal(stages.find(({ id }) => id === "entry-alignment-validation")?.status, "pending");
});

test("records tokens per new agent stage and elapsed time", () => {
  const rawLog = [
    "WORLDKIT_STAGE planner",
    "WORLDKIT_STAGE_USAGE planner 2000",
    "WORLDKIT_STAGE coding-agent",
    "WORLDKIT_STAGE_USAGE coding-agent 2100",
  ].join("\n");
  assert.deepEqual(parseStageTokenUsage(rawLog), {
    planner: 2_000,
    "coding-agent": 2_100,
  });
  const record = {
    stage: "ready", status: "ready", outcome: "passed",
    workflowPolicyVersion,
    styledOpeningFrameRequired: false,
    createdAt: "2026-08-21T00:00:00.000Z",
    startedAt: "2026-08-21T00:00:00.000Z",
    finishedAt: "2026-08-21T00:03:00.000Z",
  };
  const stages = deriveWorkflowTrajectory({
    record,
    availableIds: [
      "scene-brief", "visual-identity-palette", "world-plan", "entry-whitebox-target", "world-module", "authoring-spec",
      "implementation-map-draft", "implementation-map", "execution-plan",
      "opening-frame", "runtime-snapshot", "whitebox-capture-receipt",
      "whitebox-triview-manifest",
    ],
  });
  const metrics = deriveWorkflowMetrics({ record, stages, rawLog, events: [] });
  assert.equal(metrics.summary.tokenCount, 4_100);
  assert.equal(metrics.summary.durationMs, 180_000);
});

test("never counts a failed runtime capture as evaluation success", () => {
  const metrics = deriveReliabilityMetrics([
    { workflowPolicyVersion, status: "ready", outcome: "passed", attempt: 1 },
    { workflowPolicyVersion, status: "failed", outcome: "failed", failedStage: "runtime-capture", captureStatus: "failed" },
    { workflowPolicyVersion, status: "ready", outcome: null, captureStatus: "failed", captureRequired: false },
  ], { minimumSampleSize: 1 });
  assert.equal(metrics.successCount, 1);
  assert.equal(metrics.failureCount, 1);
  assert.equal(metrics.terminalCount, 2);
  assert.equal(metrics.failureRate, 0.5);
});

test("persists image test sets, rejects duplicate bytes, and queues selected cases", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-");
  const studio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const origin = await listen(studio);
  try {
    const createResponse = await fetch(`${origin}/api/test-sets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "复杂山地", prompt: "依据每张图建立多层可行进白膜世界。" }),
    });
    assert.equal(createResponse.status, 201);
    const testSet = (await createResponse.json()).testSet;
    const png = Buffer.from("89504e470d0a1a0a0000000001", "hex");
    const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
    const upload = await fetch(`${origin}/api/test-sets/${testSet.id}/images`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image: { name: "mountain.png", dataUrl } }),
    });
    assert.equal(upload.status, 201);
    const duplicate = await fetch(`${origin}/api/test-sets/${testSet.id}/images`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image: { name: "duplicate.png", dataUrl } }),
    });
    assert.equal(duplicate.status, 400);
    const listed = (await (await fetch(`${origin}/api/test-sets`)).json()).testSets[0];
    assert.equal(listed.validation.runnableCount, 1);
    const run = await fetch(`${origin}/api/test-sets/${testSet.id}/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageIds: [listed.images[0].id] }),
    });
    assert.equal(run.status, 202);
    const payload = await run.json();
    assert.equal(payload.worlds.length, 1);
    assert.equal(payload.worlds[0].workflowPolicyVersion, workflowPolicyVersion);
    assert.equal(payload.worlds[0].captureStatus, "pending");
    assert.equal(payload.worlds[0].styledOpeningFrameRequired, true);
    assert.equal(payload.worlds[0].styledOpeningFrameStatus, "pending");
    assert.equal(payload.worlds[0].styledTriviewsRequired, true);
    assert.equal(payload.worlds[0].styledTriviewsStatus, "pending");
  } finally {
    await studio.shutdown();
  }
});

test("imports versioned built-in test sets with humanoid walking labels", async () => {
  const fakeRepoRoot = await temporaryRoot(".builtin-repo-");
  const dataRoot = await temporaryRoot(".builtin-data-");
  const builtinRoot = path.join(
    fakeRepoRoot,
    "apps/studio/builtin-test-sets/sample-v1",
  );
  const imageBytes = Buffer.from("builtin-test-image");
  const contentSha256 = createHash("sha256").update(imageBytes).digest("hex");
  await mkdir(path.join(builtinRoot, "images"), { recursive: true });
  await writeFile(path.join(builtinRoot, "images", "walker.png"), imageBytes);
  await writeFile(path.join(builtinRoot, "manifest.json"), JSON.stringify({
    kind: "worldkit-builtin-test-set",
    schemaVersion: 1,
    id: "test-set-sample-v1",
    name: "Sample Built-in",
    prompt: "Build the reference.",
    createdAt: "2026-08-21T00:00:00.000Z",
    updatedAt: "2026-08-21T00:00:00.000Z",
    review: { matchingCount: 1 },
    images: [{
      id: "image-001-abcd",
      sourceFile: "images/walker.png",
      extension: "png",
      mimeType: "image/png",
      contentSha256,
      originalName: "walker.png",
      size: imageBytes.length,
      labels: { humanoidWalking: true, primaryLocomotion: "walking" },
      tags: ["humanoid-walking"],
    }],
  }));
  const studio = createStudio({
    repoRoot: fakeRepoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    importBuiltinTestSets: true,
  });
  const origin = await listen(studio);
  try {
    const payload = await fetch(`${origin}/api/test-sets`).then((response) => response.json());
    assert.equal(payload.testSets.length, 1);
    assert.equal(payload.testSets[0].builtin, true);
    assert.equal(payload.testSets[0].validation.humanoidWalkingCount, 1);
    assert.equal(payload.testSets[0].images[0].labels.humanoidWalking, true);
    assert.deepEqual(payload.testSets[0].images[0].tags, ["humanoid-walking"]);
  } finally {
    await studio.shutdown();
  }
});

test("does not expose manual whitebox video upload in the automatic Studio workflow", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-");
  const studio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const origin = await listen(studio);
  try {
    const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
    const createResponse = await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Manual Capture",
        prompt: "Create a world for a manually recorded whitebox take.",
        image: { name: "first-frame.png", dataUrl: `data:image/png;base64,${png.toString("base64")}` },
      }),
    });
    const created = (await createResponse.json()).world;
    const upload = await fetch(`${origin}/api/worlds/${created.id}/whitebox-video`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: Buffer.from("manual video is outside the automatic flow"),
    });
    assert.equal(upload.status, 405);
  } finally {
    await studio.shutdown();
  }
});

test("does not recover an explicitly failed visual run from leftover output files", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-");
  const firstStudio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const firstOrigin = await listen(firstStudio);
  const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
  const created = (await (await fetch(`${firstOrigin}/api/worlds`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Recover Styled Frame",
      prompt: "Create a playable third-person world.",
      image: { name: "reference.png", dataUrl: `data:image/png;base64,${png.toString("base64")}` },
    }),
  })).json()).world;
  await firstStudio.shutdown();

  const { artifactRoot } = await writeTrustedWhiteboxArtifacts(fakeRepoRoot, created.sceneId);
  const recordPath = path.join(dataRoot, "worlds", created.id, "record.json");
  const record = JSON.parse(await readFile(recordPath, "utf8"));
  const startedAt = record.createdAt;
  await Promise.all([
    writeFile(path.join(artifactRoot, "evaluation-run.json"), JSON.stringify({
      kind: "worldkit-evaluation-run",
      schemaVersion: 1,
      caseId: created.id,
      sceneId: created.sceneId,
      workflowPolicyVersion,
      attempt: 1,
      startedAt,
    })),
    writeFile(path.join(artifactRoot, "visual-generation-prompts.json"), "{}"),
    writeFile(path.join(artifactRoot, "styled-opening-frame.png"), png),
    writeFile(path.join(artifactRoot, "triviews/player-subject/styled-triview.png"), png),
    writeFile(path.join(artifactRoot, "styled-triviews-manifest.json"), "{}"),
    writeFile(path.join(artifactRoot, "styled-triviews-report.json"), "{}"),
  ]);
  await writeFile(recordPath, JSON.stringify({
    ...record,
    status: "failed",
    stage: "failed",
    failedStage: "visual-reconstruction",
    captureStatus: "passed",
    triviewStatus: "passed",
    whiteboxOutcome: "passed",
    outcome: "failed",
    attempt: 1,
    startedAt,
    workflowPolicyVersion,
    error: "Legacy image alignment failed.",
  }));

  const recoveredStudio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const recoveredOrigin = await listen(recoveredStudio);
  try {
    const detail = await (await fetch(`${recoveredOrigin}/api/worlds/${created.id}`)).json();
    assert.equal(detail.world.status, "failed");
    assert.equal(detail.world.outcome, "failed");
    assert.equal(detail.world.error, "Legacy image alignment failed.");
    assert.equal(detail.world.previewUrl, `/play?authoring=1&world=${created.id}`);
    assert.equal(detail.world.whiteboxRuntimeAvailable, true);
    assert.equal(
      (await fetch(`${recoveredOrigin}/api/worlds/${created.id}/preview-bootstrap`)).status,
      200,
    );
    await assert.rejects(
      readFile(path.join(artifactRoot, "evaluation-report.json"), "utf8"),
      { code: "ENOENT" },
    );
  } finally {
    await recoveredStudio.shutdown();
  }
});

test("does not recover stale placeholder outputs left before the current visual attempt", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-");
  const firstStudio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const firstOrigin = await listen(firstStudio);
  const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
  const created = (await (await fetch(`${firstOrigin}/api/worlds`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Stale Visual Outputs",
      prompt: "Create a playable third-person world.",
      image: { name: "reference.png", dataUrl: `data:image/png;base64,${png.toString("base64")}` },
    }),
  })).json()).world;
  await firstStudio.shutdown();

  const artifactRoot = path.join(fakeRepoRoot, "artifacts/scenes", created.sceneId);
  await mkdir(path.join(artifactRoot, "triviews", "player-subject"), { recursive: true });
  await Promise.all([
    ...[
      "scene-brief.md", "visual-identity-palette.json", "authoring.json", "scene-implementation-map.json", "world.build.json",
      "runtime-snapshot.json", "evaluation-run.json", "planner-self-check.json", "builder-self-check.json",
    ].map((fileName) => writeFile(path.join(artifactRoot, fileName), "{}")),
    writeFile(path.join(artifactRoot, "triviews/whitebox-triview-manifest.json"), JSON.stringify({
      whiteboxTriviews: [{ visualTargetId: "player-subject" }],
    })),
    writeFile(path.join(artifactRoot, "opening-frame.png"), png),
    writeFile(path.join(artifactRoot, "visual-generation-prompts.json"), "{}"),
    writeFile(path.join(artifactRoot, "styled-opening-frame.png"), png),
    writeFile(path.join(artifactRoot, "triviews/player-subject/styled-triview.png"), png),
    writeFile(path.join(artifactRoot, "styled-triviews-manifest.json"), "{}"),
    writeFile(path.join(artifactRoot, "styled-triviews-report.json"), "{}"),
  ]);
  const recordPath = path.join(dataRoot, "worlds", created.id, "record.json");
  const record = JSON.parse(await readFile(recordPath, "utf8"));
  await writeFile(recordPath, JSON.stringify({
    ...record,
    status: "running",
    stage: "visual-reconstruction",
    failedStage: null,
    attempt: 1,
    startedAt: new Date(Date.now() + 60_000).toISOString(),
    captureStatus: "passed",
    outcome: null,
    error: null,
  }));

  const recoveredStudio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const recoveredOrigin = await listen(recoveredStudio);
  try {
    const detail = await (await fetch(`${recoveredOrigin}/api/worlds/${created.id}`)).json();
    assert.equal(detail.world.status, "interrupted");
    assert.notEqual(detail.world.outcome, "passed");
  } finally {
    await recoveredStudio.shutdown();
  }
});

test("does not import a three-file artifact fragment as a passed world", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-");
  const sceneId = "partial-import-world";
  const artifactRoot = path.join(fakeRepoRoot, "artifacts/scenes", sceneId);
  await mkdir(path.join(artifactRoot, "triviews"), { recursive: true });
  await Promise.all([
    writeFile(path.join(artifactRoot, "scene-brief.md"), "# WorldKit Scene Brief\n"),
    writeFile(path.join(artifactRoot, "authoring.json"), JSON.stringify({
      kind: "worldkit-authoring-spec",
      schemaVersion: 4,
      id: sceneId,
    })),
    writeFile(path.join(artifactRoot, "triviews/whitebox-triview-manifest.json"), JSON.stringify({
      kind: "worldkit-whitebox-triview-manifest",
      schemaVersion: 1,
      executionPlanHash: `sha256:${"a".repeat(64)}`,
      whiteboxTriviews: [],
    })),
  ]);

  const studio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const origin = await listen(studio);
  try {
    const payload = await (await fetch(`${origin}/api/worlds`)).json();
    assert.deepEqual(payload.worlds, []);
  } finally {
    await studio.shutdown();
  }
});

test("imports a complete current whitebox chain with passed trusted receipts", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-");
  const sceneId = "trusted-import-world";
  await writeTrustedWhiteboxArtifacts(fakeRepoRoot, sceneId);

  const studio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const origin = await listen(studio);
  try {
    const payload = await (await fetch(`${origin}/api/worlds`)).json();
    assert.equal(payload.worlds.length, 1);
    assert.equal(payload.worlds[0].sceneId, sceneId);
    assert.equal(payload.worlds[0].status, "ready");
    assert.equal(payload.worlds[0].outcome, "passed");
    const detail = await (await fetch(`${origin}/api/worlds/${payload.worlds[0].id}`)).json();
    assert.equal(detail.media.plannerValidation.status, "passed");
    assert.equal(detail.media.plannerValidation.worldPlan.blockPaletteCoverageRatio, 0.5);
    assert.equal(detail.media.plannerValidation.entryWhiteboxTarget.subjectCenterErrorRatio, 0);
  } finally {
    await studio.shutdown();
  }
});

test("persists Planner human review against exact artifact hashes and invalidates it after regeneration", async () => {
  const dataRoot = await temporaryRoot(".planner-human-review-data-");
  const fakeRepoRoot = await temporaryRoot(".planner-human-review-repo-");
  const sceneId = "planner-human-review-world";
  await writeTrustedWhiteboxArtifacts(fakeRepoRoot, sceneId);
  const studio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const origin = await listen(studio);
  try {
    const world = (await fetch(`${origin}/api/worlds`).then((response) =>
      response.json())).worlds[0];
    let detail = await fetch(`${origin}/api/worlds/${world.id}`).then((response) =>
      response.json());
    assert.equal(detail.media.plannerReview.status, "pending");

    const approved = await fetch(`${origin}/api/worlds/${world.id}/planner-review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });
    assert.equal(approved.status, 200, await approved.text());
    detail = await fetch(`${origin}/api/worlds/${world.id}`).then((response) =>
      response.json());
    assert.equal(detail.media.plannerReview.status, "approved");
    assert.match(detail.media.plannerReview.reviewedAt, /^\d{4}-/);

    const newWorldPlan = Buffer.from("89504e470d0a1a0a0000000002", "hex");
    const worldPlanPath = path.join(
      fakeRepoRoot,
      "apps/playground/public/scene-plans",
      sceneId,
      "world-plan.png",
    );
    const plannerCheckPath = path.join(
      fakeRepoRoot,
      "artifacts/scenes",
      sceneId,
      "planner-self-check.json",
    );
    const plannerCheck = JSON.parse(await readFile(plannerCheckPath, "utf8"));
    plannerCheck.inputs.worldPlanHash =
      `sha256:${createHash("sha256").update(newWorldPlan).digest("hex")}`;
    await Promise.all([
      writeFile(worldPlanPath, newWorldPlan),
      writeFile(plannerCheckPath, JSON.stringify(plannerCheck)),
    ]);
    detail = await fetch(`${origin}/api/worlds/${world.id}`).then((response) =>
      response.json());
    assert.equal(detail.media.plannerReview.status, "pending");
  } finally {
    await studio.shutdown();
  }
});

test("rejects a trusted-chain import when a Planner block-whitebox PNG changed after self-check", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-");
  const sceneId = "mutated-planner-image-world";
  await writeTrustedWhiteboxArtifacts(fakeRepoRoot, sceneId);
  await writeFile(
    path.join(fakeRepoRoot, "apps/playground/public/scene-plans", sceneId, "world-plan.png"),
    Buffer.from("89504e470d0a1a0a0000000001", "hex"),
  );

  const studio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const origin = await listen(studio);
  try {
    const payload = await (await fetch(`${origin}/api/worlds`)).json();
    assert.equal(payload.worlds.some((world) => world.sceneId === sceneId), false);
  } finally {
    await studio.shutdown();
  }
});

test("does not let optional Route reports block an otherwise complete Block whitebox import", async () => {
  for (const routeReportMode of ["missing", "mismatched", "failed", "exact"]) {
    const dataRoot = await temporaryRoot(`.test-data-route-${routeReportMode}-`);
    const fakeRepoRoot = await temporaryRoot(`.test-repo-route-${routeReportMode}-`);
    const sceneId = `route-${routeReportMode}-world`;
    await writeTrustedWhiteboxArtifacts(fakeRepoRoot, sceneId, {
      requiresRouteValidation: false,
      routeReportMode,
    });

    const studio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
    const origin = await listen(studio);
    try {
      const payload = await (await fetch(`${origin}/api/worlds`)).json();
      assert.equal(payload.worlds.some((world) => world.sceneId === sceneId), true);
    } finally {
      await studio.shutdown();
    }
  }
});

test("requires exact World Build-bound Route evidence when a workflow requests it", async () => {
  for (const routeReportMode of ["missing", "mismatched", "failed", "exact"]) {
    const dataRoot = await temporaryRoot(`.test-data-required-route-${routeReportMode}-`);
    const fakeRepoRoot = await temporaryRoot(`.test-repo-required-route-${routeReportMode}-`);
    const sceneId = `required-route-${routeReportMode}-world`;
    await writeTrustedWhiteboxArtifacts(fakeRepoRoot, sceneId, {
      requiresRouteValidation: true,
      routeReportMode,
    });

    const studio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
    const origin = await listen(studio);
    try {
      const payload = await (await fetch(`${origin}/api/worlds`)).json();
      assert.equal(
        payload.worlds.some((world) => world.sceneId === sceneId),
        routeReportMode === "exact",
      );
    } finally {
      await studio.shutdown();
    }
  }
});

test("recovers fresh visual outputs from active stages, Host resumes, and repaired tri-view-only failures", async () => {
  for (const recoveryMode of ["running-visual", "failed-triview", "failed-finalization-host-resume"]) {
  const dataRoot = await temporaryRoot(".test-data-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-");
  const firstStudio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const firstOrigin = await listen(firstStudio);
  const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
  const created = (await (await fetch(`${firstOrigin}/api/worlds`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: `Recover Fresh Visuals ${recoveryMode}`,
      prompt: "Create a playable third-person world.",
      image: { name: "reference.png", dataUrl: `data:image/png;base64,${png.toString("base64")}` },
    }),
  })).json()).world;
  await firstStudio.shutdown();

  const recordPath = path.join(dataRoot, "worlds", created.id, "record.json");
  const record = JSON.parse(await readFile(recordPath, "utf8"));
  const startedAt = new Date().toISOString();
  const currentRecord = recoveryMode === "running-visual"
    ? {
        ...record,
        status: "running",
        stage: "visual-reconstruction",
        failedStage: null,
        attempt: 1,
        startedAt,
        captureStatus: "passed",
        outcome: null,
        error: null,
      }
    : recoveryMode === "failed-triview"
      ? {
        ...record,
        status: "failed",
        stage: "failed",
        failedStage: "runtime-capture",
        attempt: 1,
        startedAt,
        captureStatus: "passed",
        triviewStatus: "failed",
        whiteboxOutcome: "passed",
        outcome: "failed",
        error: "白膜世界已成功生成并可进入，但白膜三视图后处理失败；可以直接进入世界，并按需重试三视图。",
      }
      : {
          ...record,
          status: "failed",
          stage: "failed",
          failedStage: "visual-reconstruction",
          attempt: 1,
          startedAt,
          captureStatus: "passed",
          triviewStatus: "passed",
          whiteboxOutcome: "passed",
          styledOpeningFrameStatus: "failed",
          styledTriviewsStatus: "failed",
          outcome: "failed",
          error: "工作流收尾脚本存在语法错误。",
        };
  await writeFile(recordPath, JSON.stringify(currentRecord));
  if (recoveryMode === "failed-finalization-host-resume") {
    await writeFile(path.join(dataRoot, "worlds", created.id, "agent.log"), `
WorldKit Creator Studio
scene=${created.sceneId}
attempt=1
mode=host-resume
WORLDKIT_LWDP_TASK_READY visual-demo
[stderr] scripts/finalize.sh: line 171: unexpected EOF while looking for matching '"'
`);
  }
  const { artifactRoot, captureTargets } = await writeTrustedWhiteboxArtifacts(fakeRepoRoot, created.sceneId);
  const finalizedVisualArtifacts = recoveryMode === "failed-finalization-host-resume"
    ? []
    : [
        writeFile(path.join(artifactRoot, "styled-opening-frame-manifest.json"), JSON.stringify({
          kind: "worldkit-styled-opening-frame-manifest",
          schemaVersion: 1,
          sceneId: created.sceneId,
          status: "passed",
        })),
        writeFile(path.join(artifactRoot, "styled-opening-frame-report.json"), JSON.stringify({
          kind: "worldkit-styled-opening-frame-report",
          schemaVersion: 1,
          sceneId: created.sceneId,
          status: "passed",
        })),
        writeFile(path.join(artifactRoot, "styled-triviews-manifest.json"), JSON.stringify({
          kind: "worldkit-styled-triview-manifest",
          schemaVersion: 1,
          sceneId: created.sceneId,
          status: "passed",
        })),
        writeFile(path.join(artifactRoot, "styled-triviews-report.json"), JSON.stringify({
          kind: "worldkit-styled-triview-report",
          schemaVersion: 1,
          sceneId: created.sceneId,
          status: "passed",
        })),
      ];
  await Promise.all([
    writeFile(path.join(artifactRoot, "evaluation-run.json"), JSON.stringify({
      kind: "worldkit-evaluation-run",
      schemaVersion: 1,
      caseId: created.id,
      sceneId: created.sceneId,
      workflowPolicyVersion,
      attempt: 1,
      startedAt,
      ...(recoveryMode === "failed-finalization-host-resume"
        ? { executionMode: "host-resume" }
        : {}),
    })),
    writeFile(path.join(artifactRoot, "visual-generation-prompts.json"), JSON.stringify({
      kind: "worldkit-visual-generation-prompts",
      schemaVersion: 2,
      provider: "lwdp-codex",
      sceneId: created.sceneId,
      openingFrame: {
        referenceRoles: ["actual-whitebox-opening", "user-first-frame"],
        prompt: "Preserve the exact whitebox camera, layout, pose, scale, depth, and occlusion while applying only the complete identity, materials, palette, lighting, and visual style from the user appearance reference. ".repeat(2),
      },
      styledTriviews: captureTargets.whiteboxTriviews.map(({ visualTargetId }) => ({
        visualTargetId,
        referenceRoles: ["target-whitebox-triview", "styled-opening-frame", "user-first-frame"],
        prompt: "Render this complete target as exactly Front, Right, and Back orthographic panels with the accepted opening-frame identity and appearance, no environment, text, or extra views. ".repeat(2),
      })),
    })),
    writeFile(path.join(artifactRoot, "styled-opening-frame.png"), png),
    ...finalizedVisualArtifacts,
    ...captureTargets.whiteboxTriviews.map((target) =>
      writeFile(path.join(artifactRoot, "triviews", target.visualTargetId, "styled-triview.png"), png)),
  ]);
  if (recoveryMode === "failed-finalization-host-resume") {
    const staleTime = new Date(Date.parse(startedAt) - 60_000);
    const planRoot = path.join(fakeRepoRoot, "apps/playground/public/scene-plans", created.sceneId);
    await Promise.all([
      "scene-brief.md",
      "planner-self-check.json",
      "visual-identity-palette.json",
      "world.mjs",
      "implementation-map.draft.json",
      "builder-self-check.json",
    ].map((name) => utimes(path.join(artifactRoot, name), staleTime, staleTime)));
    await Promise.all([
      "world-plan.png",
      "entry-whitebox-target.png",
    ].map((name) => utimes(path.join(planRoot, name), staleTime, staleTime)));
  }

  let replayedFinalization = false;
  const recoveredStudio = createStudio({
    repoRoot: fakeRepoRoot,
    dataRoot,
    autoRunJobs: false,
    ...(recoveryMode === "failed-finalization-host-resume"
      ? {
          visualRecoveryFinalizeImplementation: async () => {
            replayedFinalization = true;
            await Promise.all([
              writeFile(path.join(artifactRoot, "styled-opening-frame-manifest.json"), JSON.stringify({
                kind: "worldkit-styled-opening-frame-manifest", schemaVersion: 1,
                sceneId: created.sceneId, status: "passed",
              })),
              writeFile(path.join(artifactRoot, "styled-opening-frame-report.json"), JSON.stringify({
                kind: "worldkit-styled-opening-frame-report", schemaVersion: 1,
                sceneId: created.sceneId, status: "passed",
              })),
              writeFile(path.join(artifactRoot, "styled-triviews-manifest.json"), JSON.stringify({
                kind: "worldkit-styled-triview-manifest", schemaVersion: 1,
                sceneId: created.sceneId, status: "passed",
              })),
              writeFile(path.join(artifactRoot, "styled-triviews-report.json"), JSON.stringify({
                kind: "worldkit-styled-triview-report", schemaVersion: 1,
                sceneId: created.sceneId, status: "passed",
              })),
            ]);
          },
        }
      : {}),
  });
  const recoveredOrigin = await listen(recoveredStudio);
  try {
    const detail = await (await fetch(`${recoveredOrigin}/api/worlds/${created.id}`)).json();
    assert.equal(detail.world.status, "ready");
    assert.equal(detail.world.outcome, "passed");
    assert.equal(detail.world.error, null);
    assert.equal(
      replayedFinalization,
      recoveryMode === "failed-finalization-host-resume",
    );
  } finally {
    await recoveredStudio.shutdown();
  }
  }
});

test("downloads and finalizes a late successful visual Job without resubmitting it", async () => {
  const dataRoot = await temporaryRoot(".test-data-late-visual-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-late-visual-");
  const firstStudio = createStudio({
    repoRoot: fakeRepoRoot,
    dataRoot,
    autoRunJobs: false,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
  });
  const firstOrigin = await listen(firstStudio);
  const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
  const created = (await (await fetch(`${firstOrigin}/api/worlds`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Late Visual Delivery",
      prompt: "Create a world whose final visual arrives late.",
      image: { name: "reference.png", dataUrl: `data:image/png;base64,${png.toString("base64")}` },
    }),
  })).json()).world;
  await firstStudio.shutdown();

  const startedAt = new Date().toISOString();
  const { artifactRoot, captureTargets } = await writeTrustedWhiteboxArtifacts(
    fakeRepoRoot,
    created.sceneId,
  );
  await writeFile(path.join(artifactRoot, "evaluation-run.json"), JSON.stringify({
    kind: "worldkit-evaluation-run",
    schemaVersion: 1,
    caseId: created.id,
    caseHash: `sha256:${"a".repeat(64)}`,
    sceneId: created.sceneId,
    workflowPolicyVersion,
    attempt: 1,
    startedAt,
  }));
  const recordPath = path.join(dataRoot, "worlds", created.id, "record.json");
  const record = JSON.parse(await readFile(recordPath, "utf8"));
  await writeFile(recordPath, JSON.stringify({
    ...record,
    status: "remote-pending",
    stage: "visual-reconstruction",
    failedStage: null,
    attempt: 1,
    startedAt,
    finishedAt: null,
    error: "LWDP 云端 Job gen_visuallate 在 120 分钟后仍为 running；已转入远端对账状态。",
    captureRequired: false,
    captureStatus: "passed",
    triviewStatus: "passed",
    whiteboxOutcome: "passed",
    outcome: null,
    styledOpeningFrameStatus: "pending",
    styledTriviewsStatus: "pending",
    workflowPolicyVersion,
    remoteJobId: "gen_visuallate",
  }));
  await writeFile(path.join(dataRoot, "worlds", created.id, "agent.log"), [
    "WorldKit Creator Studio",
    `scene=${created.sceneId}`,
    "attempt=1",
    "mode=full",
    "",
    "WORLDKIT_LWDP_JOB visual-reconstruction visual-late gen_visuallate dispatch=single-task-fast-path taskAttempt=1/3",
    "WORLDKIT_LWDP_REMOTE_PENDING visual-reconstruction visual-late gen_visuallate request-late s3://bucket/visual 7200000 running {\"total\":1,\"queued\":1,\"running\":0}",
    "",
  ].join("\n"));

  let recoveredStage = null;
  let finalized = false;
  const recoveredStudio = createStudio({
    repoRoot: fakeRepoRoot,
    dataRoot,
    autoRunJobs: true,
    importExistingArtifacts: false,
    importBuiltinTestSets: false,
    importBuiltinResults: false,
    lwdpConfigured: true,
    loadLwdpConfigImplementation: async () => ({
      baseUrl: "https://lwdp.test", token: "test", userId: "worldkit-test",
    }),
    lateLwdpRecoveryImplementation: async ({ stage }) => {
      recoveredStage = stage;
      await Promise.all([
        writeFile(path.join(artifactRoot, "visual-generation-prompts.json"), JSON.stringify({
          kind: "worldkit-visual-generation-prompts",
          schemaVersion: 2,
          provider: "lwdp-codex",
          sceneId: created.sceneId,
          openingFrame: {
            referenceRoles: ["actual-whitebox-opening", "user-first-frame"],
            prompt: "Preserve the exact whitebox camera, layout, pose, scale, depth, and occlusion while applying only the complete identity, materials, palette, lighting, and visual style from the user appearance reference. ".repeat(2),
          },
          styledTriviews: captureTargets.whiteboxTriviews.map(({ visualTargetId }) => ({
            visualTargetId,
            referenceRoles: ["target-whitebox-triview", "styled-opening-frame", "user-first-frame"],
            prompt: "Render this complete target as exactly Front, Right, and Back orthographic panels with the accepted opening-frame identity and appearance, no environment, text, or extra views. ".repeat(2),
          })),
        })),
        writeFile(path.join(artifactRoot, "styled-opening-frame.png"), png),
        ...captureTargets.whiteboxTriviews.map(({ visualTargetId }) =>
          writeFile(path.join(artifactRoot, "triviews", visualTargetId, "styled-triview.png"), png)),
      ]);
      return { jobId: "gen_visuallate", stage: "visual" };
    },
    visualRecoveryFinalizeImplementation: async () => {
      finalized = true;
      await Promise.all([
        writeFile(path.join(artifactRoot, "styled-opening-frame-manifest.json"), JSON.stringify({
          kind: "worldkit-styled-opening-frame-manifest", schemaVersion: 1,
          sceneId: created.sceneId, status: "passed",
        })),
        writeFile(path.join(artifactRoot, "styled-opening-frame-report.json"), JSON.stringify({
          kind: "worldkit-styled-opening-frame-report", schemaVersion: 1,
          sceneId: created.sceneId, status: "passed",
        })),
        writeFile(path.join(artifactRoot, "styled-triviews-manifest.json"), JSON.stringify({
          kind: "worldkit-styled-triview-manifest", schemaVersion: 1,
          sceneId: created.sceneId, status: "passed",
        })),
        writeFile(path.join(artifactRoot, "styled-triviews-report.json"), JSON.stringify({
          kind: "worldkit-styled-triview-report", schemaVersion: 1,
          sceneId: created.sceneId, status: "passed",
        })),
      ]);
    },
  });
  const recoveredOrigin = await listen(recoveredStudio);
  try {
    let detail = null;
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline) {
      detail = await (await fetch(`${recoveredOrigin}/api/worlds/${created.id}`)).json();
      if (detail.world.status === "ready") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(recoveredStage, "visual", JSON.stringify(detail.world));
    assert.equal(finalized, true);
    assert.equal(detail.world.status, "ready");
    assert.equal(detail.world.outcome, "passed");
    assert.equal(detail.world.whiteboxOutcome, "passed");
    assert.equal(detail.world.styledOpeningFrameStatus, "passed");
    assert.equal(detail.world.styledTriviewsStatus, "passed");
  } finally {
    await recoveredStudio.shutdown();
  }
});

test("serves Scene Brief deliverables and runtime tri-views", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-");
  const studio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const origin = await listen(studio);
  try {
    const createResponse = await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Layered City", prompt: "Create bridges, towers, terrain and a continuous route." }),
    });
    const created = (await createResponse.json()).world;
    const artifactRoot = path.join(fakeRepoRoot, "artifacts/scenes", created.sceneId);
    const planRoot = path.join(fakeRepoRoot, "apps/playground/public/scene-plans", created.sceneId);
    await mkdir(path.join(artifactRoot, "triviews", "player-subject"), { recursive: true });
    await mkdir(planRoot, { recursive: true });
    await Promise.all([
      writeFile(path.join(artifactRoot, "scene-brief.md"), "# WorldKit Scene Brief\n\n## 场景\n分层城市\n"),
      writeFile(path.join(artifactRoot, "visual-identity-palette.json"), "{}"),
      writeFile(path.join(artifactRoot, "authoring.json"), "{}"),
      writeFile(path.join(artifactRoot, "scene-implementation-map.json"), JSON.stringify({
        visualCaptureGroups: [{
          visualTargetId: "player-subject",
          runtimeEntityIds: ["player", "player-accessory"],
          role: "primary-subject",
          semanticClassId: "subject.player",
          identityColor: "#E85D5D",
          frontDirectionWorldXZ: [0, -1],
        }],
      })),
      writeFile(path.join(artifactRoot, "world.build.json"), "{}"),
      writeFile(path.join(artifactRoot, "opening-frame.png"), Buffer.from("89504e470d0a1a0a", "hex")),
      writeFile(path.join(artifactRoot, "runtime-snapshot.json"), "{}"),
      writeFile(path.join(artifactRoot, "whitebox-capture-receipt.json"), "{}"),
      writeFile(path.join(artifactRoot, "triviews", "whitebox-triview-manifest.json"), JSON.stringify({
        whiteboxTriviews: [{
          visualTargetId: "player-subject",
          runtimeEntityIds: ["player", "player-accessory"],
          role: "primary-subject",
          semanticClassId: "subject.player",
          identityColor: "#E85D5D",
          frontDirectionWorldXZ: [0, -1],
        }],
      })),
      writeFile(path.join(artifactRoot, "triviews", "player-subject", "whitebox-triview.png"), Buffer.from("89504e470d0a1a0a", "hex")),
      writeFile(path.join(artifactRoot, "triviews", "player-subject", "styled-triview.png"), Buffer.from("89504e470d0a1a0a", "hex")),
      writeFile(path.join(planRoot, "world-plan.png"), Buffer.from("89504e470d0a1a0a", "hex")),
      writeFile(path.join(planRoot, "entry-whitebox-target.png"), Buffer.from("89504e470d0a1a0a", "hex")),
    ]);
    const recordPath = path.join(dataRoot, "worlds", created.id, "record.json");
    const record = JSON.parse(await readFile(recordPath, "utf8"));
    await writeFile(recordPath, JSON.stringify({
      ...record, status: "ready", stage: "ready", outcome: "passed",
      captureRequired: false, captureStatus: "passed", workflowPolicyVersion,
      styledOpeningFrameRequired: false,
      styledTriviewsRequired: false,
    }));

    const detail = await (await fetch(`${origin}/api/worlds/${created.id}`)).json();
    assert.equal(detail.world.previewUrl, null);
    assert.equal(detail.world.whiteboxRuntimeAvailable, false);
    assert.equal(detail.media.prototypes[0].id, "player-subject");
    assert.equal(detail.media.prototypes[0].memberCount, 2);
    assert.equal(detail.media.prototypes[0].role, "primary-subject");
    assert.equal(detail.media.prototypes[0].styledUrl, `/api/worlds/${created.id}/styled-triviews/player-subject`);
    assert.equal(detail.media.trajectory.stages.find(({ id }) => id === "runtime-capture").status, "complete");
    assert.ok(detail.media.deliverables.some(({ id, status }) => id === "scene-brief" && status === "available"));
    const triView = await fetch(`${origin}/api/worlds/${created.id}/triviews/player-subject`);
    assert.equal(triView.status, 200);
    assert.equal(triView.headers.get("content-type"), "image/png");
    const styledTriView = await fetch(`${origin}/api/worlds/${created.id}/styled-triviews/player-subject`);
    assert.equal(styledTriView.status, 200);
    assert.equal(styledTriView.headers.get("content-type"), "image/png");
  } finally {
    await studio.shutdown();
  }
});

test("serves one atomic Preview bootstrap and removes split Preview authority routes", async () => {
  const dataRoot = await temporaryRoot(".test-data-");
  const fakeRepoRoot = await temporaryRoot(".test-repo-");
  const studio = createStudio({ repoRoot: fakeRepoRoot, dataRoot, autoRunJobs: false });
  const origin = await listen(studio);
  try {
    const created = (await (await fetch(`${origin}/api/worlds`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Atomic Preview", prompt: "Create one closed Preview world." }),
    })).json()).world;
    const startedAt = "2026-08-25T09:00:00.000Z";
    const authoringSpec = {
      kind: "worldkit-authoring-spec",
      schemaVersion: 4,
      id: created.sceneId,
      seed: 25,
    };
    const authoringSpecHash = `sha256:${createHash("sha256")
      .update(canonicalJson(authoringSpec))
      .digest("hex")}`;
    const implementationMap = {
      kind: "worldkit-scene-brief-implementation-map",
      schemaVersion: 1,
      sceneId: created.sceneId,
      sceneBriefHash: `sha256:${"b".repeat(64)}`,
      authoringSpecId: created.sceneId,
      authoringSpecHash,
      visualTargetMappings: [{ visualTargetId: "player-subject", runtimeEntityIds: ["player"], frontDirectionWorldXZ: [0, -1] }],
      visualCaptureGroups: [{
        visualTargetId: "player-subject",
        runtimeEntityIds: ["player"],
        role: "primary-subject",
        semanticClassId: "subject.player",
        identityColor: "#E85D5D",
        frontDirectionWorldXZ: [0, -1],
      }],
    };
    const executionPlan = {
      kind: "worldkit-canonical-scene-execution-plan",
      schemaVersion: 1,
      authoringSpecHash,
    };
    const executionPlanHash = `sha256:${createHash("sha256")
      .update(canonicalJson(executionPlan))
      .digest("hex")}`;
    const normalizedWorldIr = {
      kind: "normalized-world-ir",
      schemaVersion: 4,
    };
    const normalizedWorldIrHash = `sha256:${createHash("sha256")
      .update(canonicalJson(normalizedWorldIr))
      .digest("hex")}`;
    const worldBuildIdentityHash = `sha256:${"d".repeat(64)}`;
    const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
    const artifactRoot = path.join(fakeRepoRoot, "artifacts/scenes", created.sceneId);
    const recordPath = path.join(dataRoot, "worlds", created.id, "record.json");
    const record = JSON.parse(await readFile(recordPath, "utf8"));
    await mkdir(artifactRoot, { recursive: true });
    await Promise.all([
      writeFile(path.join(artifactRoot, "authoring.json"), JSON.stringify(authoringSpec)),
      writeFile(
        path.join(artifactRoot, "scene-implementation-map.json"),
        JSON.stringify(implementationMap),
      ),
      writeFile(path.join(artifactRoot, "world.build.json"), JSON.stringify({
        kind: "worldkit-build-artifact",
        schemaVersion: 4,
        normalizedWorldIr,
        normalizedWorldIrHash,
        worldBuildIdentityHash,
        executionPlanHash,
        executionPlan,
      })),
      writeFile(path.join(artifactRoot, "opening-frame.png"), png),
      writeFile(path.join(artifactRoot, "runtime-snapshot.json"), JSON.stringify({
        kind: "worldkit-runtime-snapshot",
        schemaVersion: 4,
        runtime: { phase: "ready" },
        resources: { phase: "ready" },
      })),
      writeFile(path.join(artifactRoot, "whitebox-capture-receipt.json"), "{}"),
      writeFile(path.join(artifactRoot, "evaluation-run.json"), JSON.stringify({
        kind: "worldkit-evaluation-run",
        schemaVersion: 1,
        caseId: created.id,
        sceneId: created.sceneId,
        workflowPolicyVersion,
        attempt: 1,
        startedAt,
      })),
      writeFile(recordPath, JSON.stringify({
        ...record,
        status: "ready",
        stage: "ready",
        outcome: "passed",
        captureStatus: "passed",
        attempt: 1,
        startedAt,
        workflowPolicyVersion,
      })),
    ]);

    const bootstrapResponse = await fetch(
      `${origin}/api/worlds/${created.id}/preview-bootstrap`,
    );
    assert.equal(
      bootstrapResponse.status,
      200,
      JSON.stringify(await bootstrapResponse.clone().json()),
    );
    assert.equal(bootstrapResponse.headers.get("cache-control"), "no-store");
    assert.deepEqual(await bootstrapResponse.json(), {
      kind: "worldkit-studio-preview-bootstrap",
      schemaVersion: 1,
      worldId: created.id,
      sceneId: created.sceneId,
      attempt: 1,
      attemptStartedAt: startedAt,
      authoringSpecHash,
      authoringSpec,
      implementationMap,
    });

    await writeFile(path.join(artifactRoot, "evaluation-run.json"), JSON.stringify({
      kind: "worldkit-evaluation-run",
      schemaVersion: 1,
      caseId: created.id,
      sceneId: created.sceneId,
      workflowPolicyVersion,
      attempt: 2,
      startedAt,
    }));
    const staleResponse = await fetch(`${origin}/api/worlds/${created.id}/preview-bootstrap`);
    assert.equal(staleResponse.status, 409);
    assert.equal((await staleResponse.json()).code, "STUDIO_PREVIEW_ATTEMPT_DRIFT");

    await rm(path.join(artifactRoot, "scene-implementation-map.json"));
    const missingResponse = await fetch(`${origin}/api/worlds/${created.id}/preview-bootstrap`);
    assert.equal(missingResponse.status, 404);
    assert.equal((await missingResponse.json()).code, "STUDIO_PREVIEW_NOT_FOUND");

    assert.equal((await fetch(`${origin}/api/worlds/${created.id}/authoring-spec`)).status, 404);
    assert.equal(
      (await fetch(`${origin}/api/worlds/${created.id}/visual-capture-targets`)).status,
      404,
    );
  } finally {
    await studio.shutdown();
  }
});
