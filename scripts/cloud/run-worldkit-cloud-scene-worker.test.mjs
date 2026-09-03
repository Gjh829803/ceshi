import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";

import {
  claimCloudSceneStageWithWait,
  hasPlayableCloudWhitebox,
  isRetryableCloudHostCaptureFailure,
  materializeCloudWorkerLwdpConfig,
  runCloudSceneWorker,
} from "./run-worldkit-cloud-scene-worker.mjs";
import {
  hydrateCloudArtifactManifest,
  sha256File,
} from "../lib/worldkit-cloud-artifacts.mjs";

const config = {
  baseUrl: "https://lwdp.example.test",
  token: "secret",
  userId: "worldkit-studio",
};

test("materializes the K8s Secret as ephemeral project-local LWDP config", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "worldkit-cloud-worker-config-test-"));
  try {
    const value = await materializeCloudWorkerLwdpConfig({
      repoRoot,
      environment: {
        LWDP_API_BASE: "https://lwdp.example.test/",
        LWDP_USER_ID: "worldkit-cloud-worker",
        LWDP_GENERATION_API_TOKEN: "secret-token",
      },
    });
    const configPath = join(repoRoot, ".codex-tmp/runtime-config/lwdp.env");
    const contents = await readFile(configPath, "utf8");
    assert.deepEqual(value, {
      baseUrl: "https://lwdp.example.test",
      userId: "worldkit-cloud-worker",
      token: "secret-token",
    });
    assert.match(contents, /^LWDP_API_BASE=https:\/\/lwdp\.example\.test$/m);
    assert.match(contents, /^LWDP_GENERATION_API_TOKEN=secret-token$/m);
    assert.equal((await stat(configPath)).mode & 0o777, 0o600);
    await assert.rejects(
      materializeCloudWorkerLwdpConfig({
        repoRoot,
        environment: { LWDP_GENERATION_API_TOKEN: "bad\nvalue" },
      }),
      /must be one line/,
    );
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("retries only transient Host browser capture failures", () => {
  assert.equal(isRetryableCloudHostCaptureFailure(
    'CLI_CAPTURE_FAILED cause="page.evaluate: Execution context was destroyed, most likely because of a navigation"',
  ), true);
  assert.equal(isRetryableCloudHostCaptureFailure(
    "CLI_CAPTURE_FAILED WORLDKIT_CAPTURE_VISIBLE_WORLD_MISSING",
  ), false);
  assert.equal(isRetryableCloudHostCaptureFailure(
    "BLOCK_WORLD_SUBJECT_MOVEMENT_UNSATISFIED",
  ), false);
});

function completedChild(run) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.pid = 12345;
  child.exitCode = null;
  setImmediate(() => {
    run();
    child.stdout.write("WORLDKIT_STAGE planner\n");
    child.stdout.write("WORLDKIT_LWDP_JOB planner planner-task gen_planner profile=formal\n");
    child.stdout.write("WORLDKIT_LWDP_TASK_READY planner-task\n");
    child.stdout.write("WORLDKIT_STAGE runtime-capture\n");
    child.stdout.end("WORLDKIT_STAGE ready\n");
    child.stderr.end();
    child.exitCode = 0;
    child.emit("close", 0, null);
  });
  return child;
}

test("runs the unchanged Scene command and publishes one hash-closed manifest", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "worldkit-cloud-worker-test-"));
  const imageBytes = Buffer.from("reference-image");
  const referencePath = join(repoRoot, "reference.png");
  writeFileSync(referencePath, imageBytes);
  const referenceSha = await sha256File(referencePath);
  const request = {
    kind: "worldkit-cloud-scene-request",
    schemaVersion: 1,
    sceneId: "cloud-scene-001",
    prompt: "Build the same world.",
    references: [{
      fileName: "reference-0.png",
      contentType: "image/png",
      sha256: referenceSha,
      s3Uri: "s3://bucket/inputs/reference-0.png",
    }],
  };
  const requests = [];
  const uploads = [];
  let spawnCall;
  try {
    const result = await runCloudSceneWorker({
      executionId: "exec-001",
      requestS3Uri: "s3://bucket/inputs/request.json",
      outputS3Prefix: "s3://bucket/output",
      workerId: "worker-001",
      repoRoot,
      heartbeatIntervalMs: 60_000,
      cloudConfig: config,
      fetchImplementation: async (url, init) => {
        requests.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null });
        if (url.endsWith("/claim")) {
          return new Response(JSON.stringify({ lease_id: "lease-001" }), { status: 200 });
        }
        return new Response(JSON.stringify({ accepted: true }), { status: 200 });
      },
      downloadImplementation: async (s3Uri, localPath) => {
        mkdirSync(join(localPath, ".."), { recursive: true });
        writeFileSync(
          localPath,
          s3Uri.endsWith("request.json") ? `${JSON.stringify(request)}\n` : imageBytes,
        );
      },
      spawnImplementation: (command, args, options) => {
        spawnCall = { command, args, options };
        return completedChild(() => {
          const sceneRoot = join(repoRoot, "artifacts/scenes/cloud-scene-001");
          const planRoot = join(repoRoot, "apps/playground/public/scene-plans/cloud-scene-001");
          mkdirSync(join(sceneRoot, "world.build.json"), { recursive: true });
          mkdirSync(planRoot, { recursive: true });
          for (const [name, contents] of [
            ["world.mjs", "export default {};"],
            ["authoring.json", "{}"],
            ["scene-implementation-map.json", "{}"],
            ["runtime-snapshot.json", "{}"],
            ["whitebox-capture-receipt.json", "{}"],
            ["entry-third-person-validation.json", "{}"],
            ["opening-frame.png", "png"],
          ]) writeFileSync(join(sceneRoot, name), contents);
          writeFileSync(join(sceneRoot, "world.build.json/manifest.json"), "{}");
          writeFileSync(join(planRoot, "entry-whitebox-target.png"), "entry");
          writeFileSync(join(planRoot, "world-plan.png"), "plan");
        });
      },
      uploadOptions: {
        execFileImplementation: (_command, args, _options, callback) => {
          uploads.push(args);
          callback(null, "", "");
        },
      },
      trustedCapturePublicKeyPath: "/trusted/public.pem",
      verifyPlayableImplementation: async () => ({
        ok: true,
        output: '{"ok":true}\n',
        code: 0,
        signal: null,
      }),
    });
    assert.equal(result.status, "succeeded");
    assert.equal(spawnCall.command, "pnpm");
    assert.deepEqual(spawnCall.args.slice(0, 5), [
      "agent:world", "--", "--scene-id", "cloud-scene-001", "--image",
    ]);
    assert.equal(spawnCall.args.at(-1), "Build the same world.");
    assert.equal(spawnCall.options.env.WORLDKIT_CODEX_BACKEND, "cloud");
    const progressBodies = requests
      .filter((requestEntry) => requestEntry.method === "PUT")
      .map((requestEntry) => requestEntry.body);
    assert.equal(progressBodies[0].status, "running");
    assert.equal(progressBodies.at(-1).status, "succeeded");
    assert.equal(progressBodies.at(-1).diagnostics.error, null);
    assert.deepEqual(progressBodies.at(-1).diagnostics.trusted_whitebox_verification, {
      ok: true,
      code: 0,
      signal: null,
    });
    assert.equal(progressBodies.at(-1).diagnostics.whitebox_outcome, "passed");
    assert.equal(progressBodies.at(-1).artifacts[0].role, "worldkit-cloud-artifact-manifest");
    assert.deepEqual(progressBodies.at(-1).diagnostics.inner_generation_jobs, [{
      jobId: "gen_planner",
      taskId: "planner-task",
      elapsedSeconds: 0,
      outcome: "succeeded",
    }]);
    assert.ok(uploads.some((args) => args.at(-1).endsWith("cloud-artifact-manifest.json")));
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("waits for asynchronous dispatch before claiming the single worker stage", async () => {
  let claims = 0;
  let sleeps = 0;
  const claim = await claimCloudSceneStageWithWait({
    executionId: "exec-wait",
    stageId: "scene-production",
    workerId: "worker-wait",
    leaseSeconds: 900,
    apiOptions: {},
    maximumAttempts: 3,
    delayMs: 1,
    claimImplementation: async () => {
      claims += 1;
      if (claims === 1) {
        const error = new Error("stage is not ready");
        error.status = 409;
        throw error;
      }
      return { lease_id: "lease-wait" };
    },
    getExecutionImplementation: async () => ({
      execution: { execution_id: "exec-wait", status: "queued" },
    }),
    sleepImplementation: async () => { sleeps += 1; },
  });
  assert.equal(claim.lease_id, "lease-wait");
  assert.equal(claims, 2);
  assert.equal(sleeps, 1);
});

test("recognizes a playable whitebox independently from optional styled outputs", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "worldkit-cloud-playable-test-"));
  const sceneRoot = join(repoRoot, "scene");
  const planRoot = join(repoRoot, "plan");
  try {
    mkdirSync(join(sceneRoot, "world.build.json"), { recursive: true });
    mkdirSync(planRoot, { recursive: true });
    for (const name of [
      "world.mjs",
      "authoring.json",
      "scene-implementation-map.json",
      "opening-frame.png",
      "runtime-snapshot.json",
      "whitebox-capture-receipt.json",
      "entry-third-person-validation.json",
    ]) writeFileSync(join(sceneRoot, name), "x");
    writeFileSync(join(sceneRoot, "world.build.json/manifest.json"), "x");
    writeFileSync(join(planRoot, "entry-whitebox-target.png"), "x");
    writeFileSync(join(planRoot, "world-plan.png"), "x");
    assert.equal(await hasPlayableCloudWhitebox(sceneRoot, planRoot), true);
    assert.equal(await hasPlayableCloudWhitebox(join(repoRoot, "missing"), planRoot), false);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("rejects a downloaded reference whose bytes do not match the request", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "worldkit-cloud-worker-integrity-"));
  const request = {
    kind: "worldkit-cloud-scene-request",
    schemaVersion: 1,
    sceneId: "cloud-scene-002",
    prompt: "Build.",
    references: [{
      fileName: "reference-0.png",
      sha256: `sha256:${"0".repeat(64)}`,
      s3Uri: "s3://bucket/inputs/reference-0.png",
    }],
  };
  const reports = [];
  try {
    await assert.rejects(
      runCloudSceneWorker({
        executionId: "exec-002",
        requestS3Uri: "s3://bucket/inputs/request.json",
        outputS3Prefix: "s3://bucket/output",
        workerId: "worker-002",
        repoRoot,
        cloudConfig: config,
        fetchImplementation: async (url, init) => {
          if (url.endsWith("/claim")) {
            return new Response(JSON.stringify({ lease_id: "lease-002" }), { status: 200 });
          }
          reports.push(JSON.parse(init.body));
          return new Response(JSON.stringify({ accepted: true }), { status: 200 });
        },
        downloadImplementation: async (s3Uri, localPath) => {
          mkdirSync(join(localPath, ".."), { recursive: true });
          writeFileSync(localPath, s3Uri.endsWith("request.json") ? JSON.stringify(request) : "wrong");
        },
      }),
      /Reference integrity mismatch/,
    );
    assert.equal(reports.at(-1).status, "failed");
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("rehydrates a hash-closed retry without rerunning an Agent", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "worldkit-cloud-resume-test-"));
  const sceneBytes = Buffer.from("export default {};\n");
  const logBytes = Buffer.from("WORLDKIT_STAGE ready\n");
  const sceneSource = join(repoRoot, "scene-source.mjs");
  const logSource = join(repoRoot, "log-source.txt");
  writeFileSync(sceneSource, sceneBytes);
  writeFileSync(logSource, logBytes);
  const manifest = {
    kind: "worldkit-cloud-artifact-manifest",
    schemaVersion: 1,
    sceneId: "resume-scene",
    executionId: "exec-resume",
    artifacts: [
      {
        path: "scene/world.mjs",
        byteSize: sceneBytes.length,
        sha256: await sha256File(sceneSource),
        s3Uri: "s3://bucket/scene/world.mjs",
      },
      {
        path: "logs/pipeline.log",
        byteSize: logBytes.length,
        sha256: await sha256File(logSource),
        s3Uri: "s3://bucket/logs/pipeline.log",
      },
    ],
  };
  const manifestUri = "s3://bucket/cloud-artifact-manifest.json";
  try {
    const hydrated = await hydrateCloudArtifactManifest({
      manifestS3Uri: manifestUri,
      manifestPath: join(repoRoot, "manifest.json"),
      expectedSceneId: "resume-scene",
      expectedExecutionId: "exec-resume",
      sceneRoot: join(repoRoot, "scene"),
      scenePlanRoot: join(repoRoot, "plan"),
      logPath: join(repoRoot, "pipeline.log"),
      downloadImplementation: async (s3Uri, localPath) => {
        mkdirSync(join(localPath, ".."), { recursive: true });
        const bytes = s3Uri === manifestUri
          ? Buffer.from(JSON.stringify(manifest))
          : s3Uri.endsWith("world.mjs") ? sceneBytes : logBytes;
        writeFileSync(localPath, bytes);
      },
    });
    assert.equal(hydrated.sceneId, "resume-scene");
    assert.equal(await readFile(join(repoRoot, "scene/world.mjs"), "utf8"), sceneBytes.toString());
    assert.equal(await readFile(join(repoRoot, "pipeline.log"), "utf8"), logBytes.toString());
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("host resume reuses Agent outputs and runs only the existing Host continuation", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "worldkit-cloud-host-resume-test-"));
  const sceneId = "host-resume-scene";
  const executionId = "exec-host-resume";
  const requestUri = "s3://bucket/inputs/request.json";
  const manifestUri = "s3://bucket/output/cloud-artifact-manifest.json";
  const worldBytes = Buffer.from("export default {};\n");
  const logBytes = Buffer.from("WORLDKIT_STAGE block-build\n");
  const worldSource = join(repoRoot, "world-source.mjs");
  const logSource = join(repoRoot, "log-source.txt");
  writeFileSync(worldSource, worldBytes);
  writeFileSync(logSource, logBytes);
  const request = {
    kind: "worldkit-cloud-scene-request",
    schemaVersion: 1,
    sceneId,
    prompt: "Original prompt must not run again.",
    references: [],
  };
  const manifest = {
    kind: "worldkit-cloud-artifact-manifest",
    schemaVersion: 1,
    sceneId,
    executionId,
    artifacts: [
      {
        path: "scene/world.mjs",
        byteSize: worldBytes.length,
        sha256: await sha256File(worldSource),
        s3Uri: "s3://bucket/output/scene/world.mjs",
      },
      {
        path: "logs/pipeline.log",
        byteSize: logBytes.length,
        sha256: await sha256File(logSource),
        s3Uri: "s3://bucket/output/logs/pipeline.log",
      },
    ],
  };
  let spawnCall;
  try {
    const result = await runCloudSceneWorker({
      executionId,
      requestS3Uri: requestUri,
      outputS3Prefix: "s3://bucket/output",
      workerId: "worker-host-resume",
      repoRoot,
      heartbeatIntervalMs: 60_000,
      cloudConfig: config,
      resumeManifestS3Uri: manifestUri,
      resumeMode: "host",
      fetchImplementation: async (url) => new Response(JSON.stringify(
        url.endsWith("/claim") ? { lease_id: "lease-host-resume" } : { accepted: true },
      ), { status: 200 }),
      downloadImplementation: async (s3Uri, localPath) => {
        mkdirSync(join(localPath, ".."), { recursive: true });
        const bytes = s3Uri === requestUri
          ? Buffer.from(JSON.stringify(request))
          : s3Uri === manifestUri
            ? Buffer.from(JSON.stringify(manifest))
            : s3Uri.endsWith("world.mjs") ? worldBytes : logBytes;
        writeFileSync(localPath, bytes);
      },
      spawnImplementation: (command, args, options) => {
        spawnCall = { command, args, options };
        return completedChild(() => {
          const sceneRoot = join(repoRoot, "artifacts/scenes", sceneId);
          const planRoot = join(repoRoot, "apps/playground/public/scene-plans", sceneId);
          mkdirSync(join(sceneRoot, "world.build.json"), { recursive: true });
          mkdirSync(planRoot, { recursive: true });
          for (const [name, contents] of [
            ["authoring.json", "{}"],
            ["scene-implementation-map.json", "{}"],
            ["runtime-snapshot.json", "{}"],
            ["whitebox-capture-receipt.json", "{}"],
            ["entry-third-person-validation.json", "{}"],
            ["opening-frame.png", "png"],
          ]) writeFileSync(join(sceneRoot, name), contents);
          writeFileSync(join(sceneRoot, "world.build.json/manifest.json"), "{}");
          writeFileSync(join(planRoot, "entry-whitebox-target.png"), "entry");
          writeFileSync(join(planRoot, "world-plan.png"), "plan");
        });
      },
      uploadOptions: {
        execFileImplementation: (_command, _args, _options, callback) => callback(null, "", ""),
      },
      trustedCapturePublicKeyPath: "/trusted/public.pem",
      verifyPlayableImplementation: async () => ({ ok: true, output: "", code: 0, signal: null }),
    });
    assert.equal(result.status, "succeeded");
    assert.equal(spawnCall.command, "pnpm");
    assert.deepEqual(spawnCall.args, [
      "agent:world", "--", "--scene-id", sceneId, "--resume-host-only",
    ]);
    assert.equal(spawnCall.args.includes("Original prompt must not run again."), false);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("builder resume reuses the Planner handoff and runs build-only", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "worldkit-cloud-builder-resume-test-"));
  const sceneId = "builder-resume-scene";
  const executionId = "exec-builder-resume";
  const requestUri = "s3://bucket/inputs/request.json";
  const manifestUri = "s3://bucket/output/cloud-artifact-manifest.json";
  const briefBytes = Buffer.from("# Scene Brief\n");
  const briefSource = join(repoRoot, "brief-source.md");
  writeFileSync(briefSource, briefBytes);
  const request = {
    kind: "worldkit-cloud-scene-request",
    schemaVersion: 1,
    sceneId,
    prompt: "Original Planner prompt must not run again.",
    references: [],
  };
  const manifest = {
    kind: "worldkit-cloud-artifact-manifest",
    schemaVersion: 1,
    sceneId,
    executionId,
    artifacts: [{
      path: "scene/scene-brief.md",
      byteSize: briefBytes.length,
      sha256: await sha256File(briefSource),
      s3Uri: "s3://bucket/output/scene/scene-brief.md",
    }],
  };
  let spawnCall;
  try {
    const result = await runCloudSceneWorker({
      executionId,
      requestS3Uri: requestUri,
      outputS3Prefix: "s3://bucket/output",
      workerId: "worker-builder-resume",
      repoRoot,
      heartbeatIntervalMs: 60_000,
      cloudConfig: config,
      resumeManifestS3Uri: manifestUri,
      resumeMode: "builder",
      fetchImplementation: async (url) => new Response(JSON.stringify(
        url.endsWith("/claim") ? { lease_id: "lease-builder-resume" } : { accepted: true },
      ), { status: 200 }),
      downloadImplementation: async (s3Uri, localPath) => {
        mkdirSync(join(localPath, ".."), { recursive: true });
        writeFileSync(localPath, s3Uri === requestUri
          ? Buffer.from(JSON.stringify(request))
          : s3Uri === manifestUri ? Buffer.from(JSON.stringify(manifest)) : briefBytes);
      },
      spawnImplementation: (command, args, options) => {
        spawnCall = { command, args, options };
        return completedChild(() => {
          const sceneRoot = join(repoRoot, "artifacts/scenes", sceneId);
          const planRoot = join(repoRoot, "apps/playground/public/scene-plans", sceneId);
          mkdirSync(join(sceneRoot, "world.build.json"), { recursive: true });
          mkdirSync(planRoot, { recursive: true });
          for (const [name, contents] of [
            ["world.mjs", "export default {};"],
            ["authoring.json", "{}"],
            ["scene-implementation-map.json", "{}"],
            ["runtime-snapshot.json", "{}"],
            ["whitebox-capture-receipt.json", "{}"],
            ["entry-third-person-validation.json", "{}"],
            ["opening-frame.png", "png"],
          ]) writeFileSync(join(sceneRoot, name), contents);
          writeFileSync(join(sceneRoot, "world.build.json/manifest.json"), "{}");
          writeFileSync(join(planRoot, "entry-whitebox-target.png"), "entry");
          writeFileSync(join(planRoot, "world-plan.png"), "plan");
        });
      },
      uploadOptions: {
        execFileImplementation: (_command, _args, _options, callback) => callback(null, "", ""),
      },
      trustedCapturePublicKeyPath: "/trusted/public.pem",
      verifyPlayableImplementation: async () => ({ ok: true, output: "", code: 0, signal: null }),
    });
    assert.equal(result.status, "succeeded");
    assert.deepEqual(spawnCall.args, [
      "agent:world", "--", "--scene-id", sceneId, "--build-only",
    ]);
    assert.equal(spawnCall.args.includes("Original Planner prompt must not run again."), false);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("builder rebuild accepts a Planner manifest from a prior Cloud Execution", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "worldkit-cloud-builder-rebuild-test-"));
  const sceneId = "builder-rebuild-scene";
  const executionId = "exec-builder-rebuild-current";
  const sourceExecutionId = "exec-builder-rebuild-source";
  const requestUri = "s3://bucket/current/request.json";
  const manifestUri = "s3://bucket/source/cloud-artifact-manifest.json";
  const briefBytes = Buffer.from("# Scene Brief\n");
  const briefSource = join(repoRoot, "brief-source.md");
  writeFileSync(briefSource, briefBytes);
  const request = {
    kind: "worldkit-cloud-scene-request",
    schemaVersion: 1,
    sceneId,
    prompt: "The new execution must reuse the prior Planner handoff.",
    references: [],
  };
  const manifest = {
    kind: "worldkit-cloud-artifact-manifest",
    schemaVersion: 1,
    sceneId,
    executionId: sourceExecutionId,
    artifacts: [{
      path: "scene/scene-brief.md",
      byteSize: briefBytes.length,
      sha256: await sha256File(briefSource),
      s3Uri: "s3://bucket/source/scene/scene-brief.md",
    }],
  };
  let spawnCall;
  try {
    const result = await runCloudSceneWorker({
      executionId,
      requestS3Uri: requestUri,
      outputS3Prefix: "s3://bucket/current",
      workerId: "worker-builder-rebuild",
      repoRoot,
      heartbeatIntervalMs: 60_000,
      cloudConfig: config,
      resumeManifestS3Uri: manifestUri,
      resumeSourceExecutionId: sourceExecutionId,
      resumeMode: "builder",
      fetchImplementation: async (url) => new Response(JSON.stringify(
        url.endsWith("/claim") ? { lease_id: "lease-builder-rebuild" } : { accepted: true },
      ), { status: 200 }),
      downloadImplementation: async (s3Uri, localPath) => {
        mkdirSync(join(localPath, ".."), { recursive: true });
        writeFileSync(localPath, s3Uri === requestUri
          ? Buffer.from(JSON.stringify(request))
          : s3Uri === manifestUri ? Buffer.from(JSON.stringify(manifest)) : briefBytes);
      },
      spawnImplementation: (command, args, options) => {
        spawnCall = { command, args, options };
        return completedChild(() => {
          const sceneRoot = join(repoRoot, "artifacts/scenes", sceneId);
          const planRoot = join(repoRoot, "apps/playground/public/scene-plans", sceneId);
          mkdirSync(join(sceneRoot, "world.build.json"), { recursive: true });
          mkdirSync(planRoot, { recursive: true });
          for (const [name, contents] of [
            ["world.mjs", "export default {};"],
            ["authoring.json", "{}"],
            ["scene-implementation-map.json", "{}"],
            ["runtime-snapshot.json", "{}"],
            ["whitebox-capture-receipt.json", "{}"],
            ["entry-third-person-validation.json", "{}"],
            ["opening-frame.png", "png"],
          ]) writeFileSync(join(sceneRoot, name), contents);
          writeFileSync(join(sceneRoot, "world.build.json/manifest.json"), "{}");
          writeFileSync(join(planRoot, "entry-whitebox-target.png"), "entry");
          writeFileSync(join(planRoot, "world-plan.png"), "plan");
        });
      },
      uploadOptions: {
        execFileImplementation: (_command, _args, _options, callback) => callback(null, "", ""),
      },
      trustedCapturePublicKeyPath: "/trusted/public.pem",
      verifyPlayableImplementation: async () => ({ ok: true, output: "", code: 0, signal: null }),
    });
    assert.equal(result.status, "succeeded");
    assert.deepEqual(spawnCall.args, [
      "agent:world", "--", "--scene-id", sceneId, "--build-only",
    ]);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});
