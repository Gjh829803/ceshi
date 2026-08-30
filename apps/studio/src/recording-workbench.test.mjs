import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";

import {
  RECORDING_PROMPT_TEMPLATE,
  buildRecordingPromptInstruction,
  createRecordingWorkbenchService,
  deriveRecordingWorkflowStatus,
  recordingNormalizationFfmpegArgs,
  recordingTriviewComparisonFfmpegArgs,
} from "./recording-workbench.mjs";

const temporaryRoots = [];

test.afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function makeFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "recording-workbench-test-"));
  temporaryRoots.push(root);
  const repoRoot = path.join(root, "repo");
  const dataRoot = path.join(root, "data");
  const sceneId = "recording-test-world";
  const artifactRoot = path.join(repoRoot, "artifacts", "scenes", sceneId);
  const planRoot = path.join(repoRoot, "apps", "playground", "public", "scene-plans", sceneId);
  await mkdir(path.join(artifactRoot, "triviews", "hero"), { recursive: true });
  await mkdir(path.join(artifactRoot, "triviews", "tower"), { recursive: true });
  await mkdir(planRoot, { recursive: true });
  await writeFile(path.join(artifactRoot, "authoring.json"), "{}\n");
  await writeFile(path.join(artifactRoot, "styled-opening-frame.png"), "opening");
  await writeFile(path.join(planRoot, "world-plan.png"), "world-plan");
  await writeFile(path.join(artifactRoot, "triviews", "hero", "whitebox-triview.png"), "hero-whitebox");
  await writeFile(path.join(artifactRoot, "triviews", "hero", "styled-triview.png"), "hero");
  await writeFile(path.join(artifactRoot, "triviews", "tower", "whitebox-triview.png"), "tower-whitebox");
  await writeFile(path.join(artifactRoot, "triviews", "tower", "styled-triview.png"), "tower");
  await writeFile(path.join(artifactRoot, "styled-triviews-manifest.json"), JSON.stringify({
    targets: [
      {
        visualTargetId: "hero",
        role: "primary-subject",
        semanticClassId: "complete-hero",
        styledTriview: { path: "triviews/hero/styled-triview.png" },
      },
      {
        visualTargetId: "tower",
        role: "primary-landmark",
        semanticClassId: "complete-tower",
        styledTriview: { path: "triviews/tower/styled-triview.png" },
      },
    ],
  }));
  return { repoRoot, dataRoot, sceneId };
}

async function listen(service) {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    void service.handleApi(request, response, url).then((handled) => {
      if (!handled && !response.headersSent) {
        response.writeHead(404);
        response.end();
      }
    }).catch((error) => {
      response.writeHead(500, { "content-type": "text/plain" });
      response.end(String(error));
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function uploadRecording(origin, sceneId) {
  const mp4 = Buffer.concat([
    Buffer.from("0000001866747970", "hex"),
    Buffer.from("recording-body"),
  ]);
  const response = await fetch(`${origin}/api/recording-worlds/${sceneId}/recordings`, {
    method: "POST",
    headers: {
      "content-type": "video/mp4",
      "x-worldkit-recording-duration-ms": "9000",
    },
    body: mp4,
  });
  if (response.status !== 201) assert.fail(await response.text());
  return (await response.json()).recording;
}

async function fakeRecordingTranscode({ sourcePath, destinationPath, durationSeconds }) {
  await copyFile(sourcePath, destinationPath);
  return {
    width: 1280,
    height: 720,
    fps: 24,
    frameCount: durationSeconds * 24,
    durationSeconds,
  };
}

async function waitForRecording(origin, sceneId, predicate) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const payload = await fetch(
      `${origin}/api/recording-worlds/${sceneId}/recordings`,
    ).then((response) => response.json());
    const recording = payload.recordings[0];
    if (recording && predicate(recording)) return recording;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for recording state.");
}

function createGenerationSpawn({ holdCodex = Promise.resolve() } = {}) {
  const calls = [];
  const spawnImplementation = (command, args) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.killed = false;
    child.kill = () => {
      child.killed = true;
      return true;
    };
    calls.push({ command, args: [...args] });
    setImmediate(() => {
      void (async () => {
        const script = path.basename(args[0] ?? "");
        if (script === "run-codex-task.mjs") {
          await holdCodex;
          const taskId = args[args.indexOf("--task-id") + 1];
          const backend = args[args.indexOf("--backend") + 1];
          const output = args[args.indexOf("--output") + 1].split("::");
          await writeFile(output[1], "final prompt\n");
          child.stdout.write(backend === "cloud"
            ? `WORLDKIT_LWDP_JOB recording-prompt ${taskId} gen_cloud123 profile=formal model=gpt-5.6-sol reasoning=xhigh\n`
            : `WORLDKIT_CODEX_BACKEND local\nWORLDKIT_LOCAL_CODEX_JOB recording-prompt ${taskId} pid=123 profile=formal model=gpt-5.6-sol reasoning=xhigh\nWORLDKIT_LOCAL_CODEX_TASK_READY ${taskId}\n`);
        } else if (script === "run-seedance25-reference-video.py") {
          const requestPath = args[args.indexOf("--request") + 1];
          const resultPath = args[args.indexOf("--result") + 1];
          const request = JSON.parse(await readFile(requestPath, "utf8"));
          await writeFile(request.outputPath, "generated-video");
          await writeFile(resultPath, JSON.stringify({
            status: "succeeded",
            taskId: "ark_test",
            resolvedModel: "doubao-seedance-2-5-260628",
          }));
        } else {
          throw new Error(`Unexpected child script: ${script}`);
        }
        child.stdout.end();
        child.stderr.end();
        child.emit("close", 0, null);
      })().catch((error) => child.emit("error", error));
    });
    return child;
  };
  return { calls, spawnImplementation };
}

test("locks video, subject, opening-frame, and supplementary tri-view roles in the prompt", () => {
  const instruction = buildRecordingPromptInstruction({
    sceneId: "demo-world",
    triViews: [
      { id: "hero", role: "primary-subject" },
      { id: "palace", role: "primary-landmark" },
    ],
  });
  assert.match(instruction, /@视频1：浏览器直接录制的真实白膜游玩视频/);
  assert.match(instruction, /@图片1：hero 的渲染后三视图/);
  assert.match(instruction, /@图片2：最终样式化首帧/);
  assert.match(instruction, /@图片3：palace/);
  assert.match(instruction, /不得增加@视频1不存在的主要动作/);
  assert.match(RECORDING_PROMPT_TEMPLATE, /@视频1是本视频唯一且严格的运动/);
  assert.match(RECORDING_PROMPT_TEMPLATE, /环境音和动作音效/);
  assert.match(RECORDING_PROMPT_TEMPLATE, /不得加入背景音乐、配乐、歌曲、歌声、对白、旁白、解说或任何人类语音/);
  assert.match(instruction, /严禁音乐、配乐、歌曲、对白、旁白、解说、人声或语音/);
});

test("derives independent prompt and Seedance workflow states", () => {
  assert.equal(deriveRecordingWorkflowStatus({ prompt: { status: "not-started" }, video: { status: "not-started" } }), "recorded");
  assert.equal(deriveRecordingWorkflowStatus({ prompt: { status: "running" }, video: { status: "waiting-for-prompt" } }), "prompt-running");
  assert.equal(deriveRecordingWorkflowStatus({ prompt: { status: "succeeded" }, video: { status: "running" } }), "video-running");
  assert.equal(deriveRecordingWorkflowStatus({ prompt: { status: "succeeded" }, video: { status: "succeeded" } }), "ready");
});

test("requests Seedance audio at a fixed 16:9 delivery ratio", async () => {
  const config = JSON.parse(await readFile(
    new URL("../../../config/seedance25-reference-video.json", import.meta.url),
    "utf8",
  ));
  assert.deepEqual(config.videoEditingDefaults, {
    ratio: "16:9",
    duration: -1,
    generateAudio: true,
    watermark: false,
  });
});

test("routes legacy recording prompt metadata through the default cloud Codex backend", async () => {
  const fixture = await makeFixture();
  const fake = createGenerationSpawn();
  const service = createRecordingWorkbenchService({
    repoRoot: fixture.repoRoot,
    dataRoot: fixture.dataRoot,
    spawnImplementation: fake.spawnImplementation,
    transcodeRecording: fakeRecordingTranscode,
  });
  await service.initialize();
  const http = await listen(service);
  try {
    const created = await uploadRecording(http.origin, fixture.sceneId);
    assert.equal(created.prompt.backend, undefined);

    const response = await fetch(
      `${http.origin}/api/recording-worlds/${fixture.sceneId}/recordings/${created.id}/generate`,
      { method: "POST" },
    );
    assert.equal(response.status, 202, await response.text());
    const ready = await waitForRecording(
      http.origin,
      fixture.sceneId,
      (recording) => recording.workflowStatus === "ready",
    );
    const codexCall = fake.calls.find(({ args }) =>
      path.basename(args[0] ?? "") === "run-codex-task.mjs");
    assert.ok(codexCall);
    assert.equal(codexCall.args[codexCall.args.indexOf("--backend") + 1], "cloud");
    assert.equal(ready.prompt.backend, "cloud");
    assert.equal(ready.prompt.taskId, `prompt-${created.id}`);
    assert.equal(ready.prompt.jobId, "gen_cloud123");
    assert.equal(ready.video.provider, "Volcengine Ark");
    assert.equal(ready.video.taskId, "ark_test");
    const seedanceRequest = JSON.parse(await readFile(path.join(
      fixture.dataRoot, "recordings", fixture.sceneId, created.id, "seedance-request.json",
    ), "utf8"));
    assert.deepEqual({
      width: seedanceRequest.width,
      height: seedanceRequest.height,
      frameRate: seedanceRequest.frameRate,
      durationSeconds: seedanceRequest.durationSeconds,
      frameCount: seedanceRequest.frameCount,
      requireAudio: seedanceRequest.requireAudio,
    }, {
      width: 1280,
      height: 720,
      frameRate: 24,
      durationSeconds: 9,
      frameCount: 216,
      requireAudio: true,
    });
  } finally {
    await service.shutdown();
    await http.close();
  }
});

test("freezes a local Codex backend at enqueue and stores only its local task marker", async () => {
  const fixture = await makeFixture();
  let releaseCodex;
  const codexBarrier = new Promise((resolve) => { releaseCodex = resolve; });
  const fake = createGenerationSpawn({ holdCodex: codexBarrier });
  let selectedBackend = "local";
  let providerCalls = 0;
  const service = createRecordingWorkbenchService({
    repoRoot: fixture.repoRoot,
    dataRoot: fixture.dataRoot,
    spawnImplementation: fake.spawnImplementation,
    transcodeRecording: fakeRecordingTranscode,
    codexBackendProvider: () => {
      providerCalls += 1;
      return selectedBackend;
    },
  });
  await service.initialize();
  const http = await listen(service);
  try {
    const created = await uploadRecording(http.origin, fixture.sceneId);
    const firstResponse = await fetch(
      `${http.origin}/api/recording-worlds/${fixture.sceneId}/recordings/${created.id}/generate`,
      { method: "POST" },
    );
    if (firstResponse.status !== 202) assert.fail(await firstResponse.text());
    assert.equal((await firstResponse.json()).recording.prompt.backend, "local");

    selectedBackend = "cloud";
    const duplicateResponse = await fetch(
      `${http.origin}/api/recording-worlds/${fixture.sceneId}/recordings/${created.id}/generate`,
      { method: "POST" },
    );
    if (duplicateResponse.status !== 202) assert.fail(await duplicateResponse.text());
    assert.equal((await duplicateResponse.json()).recording.prompt.backend, "local");
    assert.equal(providerCalls, 1);

    releaseCodex();
    const ready = await waitForRecording(
      http.origin,
      fixture.sceneId,
      (recording) => recording.workflowStatus === "ready",
    );
    const codexCalls = fake.calls.filter(({ args }) =>
      path.basename(args[0] ?? "") === "run-codex-task.mjs");
    assert.equal(codexCalls.length, 1);
    assert.equal(codexCalls[0].args[codexCalls[0].args.indexOf("--backend") + 1], "local");
    assert.equal(ready.prompt.backend, "local");
    assert.equal(ready.prompt.taskId, `prompt-${created.id}`);
    assert.equal(ready.prompt.jobId, null);
    assert.equal(ready.video.provider, "Volcengine Ark");
    assert.equal(ready.video.taskId, "ark_test");
  } finally {
    releaseCodex();
    await service.shutdown();
    await http.close();
  }
});

test("rewrites an existing Seedance prompt when the selected Codex backend changes", async () => {
  const fixture = await makeFixture();
  const fake = createGenerationSpawn();
  let selectedBackend = "cloud";
  const service = createRecordingWorkbenchService({
    repoRoot: fixture.repoRoot,
    dataRoot: fixture.dataRoot,
    spawnImplementation: fake.spawnImplementation,
    transcodeRecording: fakeRecordingTranscode,
    codexBackendProvider: () => selectedBackend,
  });
  await service.initialize();
  const http = await listen(service);
  try {
    const created = await uploadRecording(http.origin, fixture.sceneId);
    const firstResponse = await fetch(
      `${http.origin}/api/recording-worlds/${fixture.sceneId}/recordings/${created.id}/generate`,
      { method: "POST" },
    );
    assert.equal(firstResponse.status, 202, await firstResponse.text());
    const cloudReady = await waitForRecording(
      http.origin,
      fixture.sceneId,
      (recording) => recording.workflowStatus === "ready",
    );
    assert.equal(cloudReady.prompt.backend, "cloud");

    selectedBackend = "local";
    const secondResponse = await fetch(
      `${http.origin}/api/recording-worlds/${fixture.sceneId}/recordings/${created.id}/generate`,
      { method: "POST" },
    );
    assert.equal(secondResponse.status, 202, await secondResponse.text());
    const localReady = await waitForRecording(
      http.origin,
      fixture.sceneId,
      (recording) => recording.workflowStatus === "ready" && recording.prompt.backend === "local",
    );
    const codexCalls = fake.calls.filter(({ args }) =>
      path.basename(args[0] ?? "") === "run-codex-task.mjs");
    assert.equal(codexCalls.length, 2);
    assert.equal(codexCalls[0].args[codexCalls[0].args.indexOf("--backend") + 1], "cloud");
    assert.equal(codexCalls[1].args[codexCalls[1].args.indexOf("--backend") + 1], "local");
    assert.equal(localReady.prompt.jobId, null);
  } finally {
    await service.shutdown();
    await http.close();
  }
});

test("normalizes whitebox capture to integer seconds at 1280x720 and exactly 24 fps", async (context) => {
  const args = recordingNormalizationFfmpegArgs("capture.webm", "capture.mp4", 3);
  assert.deepEqual(args.slice(args.indexOf("-vf"), args.indexOf("-vf") + 2), [
    "-vf",
    "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=24",
  ]);
  assert.deepEqual(args.slice(args.indexOf("-t"), args.indexOf("-t") + 4), [
    "-t", "3", "-frames:v", "72",
  ]);

  if (spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status !== 0) {
    context.skip("ffmpeg is not installed");
    return;
  }
  const fixture = await makeFixture();
  const oddWebmPath = path.join(fixture.dataRoot, "odd-canvas.webm");
  await mkdir(fixture.dataRoot, { recursive: true });
  const generated = spawnSync("ffmpeg", [
    "-y", "-v", "error",
    "-f", "lavfi",
    "-i", "color=c=blue:s=106x59:d=1.9,format=yuv444p",
    "-c:v", "libvpx-vp9",
    "-pix_fmt", "yuv444p",
    oddWebmPath,
  ], { encoding: "utf8" });
  assert.equal(generated.status, 0, generated.stderr);

  const service = createRecordingWorkbenchService({
    repoRoot: fixture.repoRoot,
    dataRoot: fixture.dataRoot,
    autoRunJobs: false,
  });
  await service.initialize();
  const http = await listen(service);
  try {
    const createdResponse = await fetch(
      `${http.origin}/api/recording-worlds/${fixture.sceneId}/recordings`,
      {
        method: "POST",
        headers: {
          "content-type": "video/webm",
          "x-worldkit-recording-duration-ms": "1900",
        },
        body: await readFile(oddWebmPath),
      },
    );
    assert.equal(createdResponse.status, 201, await createdResponse.text());
    const recordings = await fetch(
      `${http.origin}/api/recording-worlds/${fixture.sceneId}/recordings`,
    ).then((response) => response.json());
    assert.equal(recordings.recordings.length, 1);
    const source = recordings.recordings[0].source;
    assert.equal(source.extension, "mp4");
    assert.equal(source.durationMs, 1000);
    assert.deepEqual(
      { width: source.width, height: source.height, fps: source.fps, frameCount: source.frameCount },
      { width: 1280, height: 720, fps: 24, frameCount: 24 },
    );
  } finally {
    await service.shutdown();
    await http.close();
  }
});

test("normalizes both tri-view panels before composing one fixed-size comparison", () => {
  const args = recordingTriviewComparisonFfmpegArgs(
    "whitebox.png",
    "styled.png",
    "comparison.png",
  );
  assert.deepEqual(args.slice(0, 8), [
    "-y", "-v", "error", "-i", "whitebox.png", "-i", "styled.png", "-filter_complex",
  ]);
  const filter = args[8];
  assert.match(filter, /\[0:v\]scale=1280:720:force_original_aspect_ratio=decrease/);
  assert.match(filter, /\[1:v\]scale=1280:720:force_original_aspect_ratio=decrease/);
  assert.match(filter, /\[whitebox\]\[styled\]hstack=inputs=2\[comparison\]/);
  assert.equal(args.at(-1), "comparison.png");
});

test("persists browser recordings, lists them, generates independently, and serves a ZIP bundle", async () => {
  const fixture = await makeFixture();
  const service = createRecordingWorkbenchService({
    repoRoot: fixture.repoRoot,
    dataRoot: fixture.dataRoot,
    transcodeRecording: fakeRecordingTranscode,
    composeTriviewComparison: async ({ whiteboxPath, styledPath, destinationPath }) => {
      await writeFile(
        destinationPath,
        `${await readFile(whiteboxPath, "utf8")}|${await readFile(styledPath, "utf8")}`,
      );
    },
    generationRunner: async ({ root, updateRecord }) => {
      await updateRecord({ prompt: { status: "running" }, video: { status: "waiting-for-prompt" } });
      await writeFile(path.join(root, "final-prompt.txt"), "final prompt\n");
      await updateRecord({ prompt: { status: "succeeded", jobId: "gen_test" }, video: { status: "running" } });
      await writeFile(path.join(root, "seedance25.mp4"), "generated-video");
      await writeFile(path.join(root, "seedance-result.json"), JSON.stringify({ status: "succeeded", taskId: "ark_test" }));
      await updateRecord({ video: { status: "succeeded", taskId: "ark_test" }, error: null });
    },
  });
  await service.initialize();
  const http = await listen(service);
  try {
    const mp4 = Buffer.concat([Buffer.from("0000001866747970", "hex"), Buffer.from("recording-body")]);
    const createdResponse = await fetch(`${http.origin}/api/recording-worlds/${fixture.sceneId}/recordings`, {
      method: "POST",
      headers: {
        "content-type": "video/mp4",
        "x-worldkit-recording-duration-ms": "9000",
      },
      body: mp4,
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.equal(created.recording.workflowStatus, "recorded");
    assert.equal(created.recording.assets.bundleReady, true);
    assert.equal(created.recording.assets.styledTriviews.length, 2);
    assert.ok(created.recording.assets.styledTriviews.every(({ whiteboxUrl }) =>
      typeof whiteboxUrl === "string"));
    assert.deepEqual(
      created.recording.assets.styledTriviews.map(({ id }) => id),
      ["hero", "tower"],
    );
    assert.deepEqual(
      created.recording.assets.styledTriviews.map(({ url }) => url),
      [
        `/api/worlds/${fixture.sceneId}/styled-triviews/hero`,
        `/api/worlds/${fixture.sceneId}/styled-triviews/tower`,
      ],
    );

    const sourceResponse = await fetch(`${http.origin}${created.recording.sourceUrl}`, {
      headers: { range: "bytes=0-3" },
    });
    assert.equal(sourceResponse.status, 206);
    assert.equal(Buffer.from(await sourceResponse.arrayBuffer()).toString("hex"), "00000018");

    const generateResponse = await fetch(
      `${http.origin}/api/recording-worlds/${fixture.sceneId}/recordings/${created.recording.id}/generate`,
      { method: "POST" },
    );
    assert.equal(generateResponse.status, 202);
    let ready = null;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const list = await fetch(`${http.origin}/api/recording-worlds/${fixture.sceneId}/recordings`).then((response) => response.json());
      ready = list.recordings[0];
      if (ready.workflowStatus === "ready") break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(ready.workflowStatus, "ready");
    assert.equal(await fetch(`${http.origin}${ready.promptUrl}`).then((response) => response.text()), "final prompt\n");

    const bundleResponse = await fetch(`${http.origin}${ready.bundleUrl}`);
    assert.equal(bundleResponse.status, 200);
    assert.equal(bundleResponse.headers.get("content-type"), "application/zip");
    const bundleBytes = Buffer.from(await bundleResponse.arrayBuffer());
    assert.ok(bundleBytes.byteLength > 100);
    const bundlePath = path.join(fixture.dataRoot, "recording-bundle.zip");
    await writeFile(bundlePath, bundleBytes);
    const zipEntries = spawnSync("/usr/bin/unzip", ["-Z1", bundlePath], {
      encoding: "utf8",
    });
    assert.equal(zipEntries.status, 0, zipEntries.stderr);
    const prefix = `${fixture.sceneId}-${ready.id}/`;
    for (const name of [
      "world-plan.png",
      "triview-01-whitebox.png",
      "triview-01-styled.png",
      "triview-01-comparison.png",
      "triview-02-whitebox.png",
      "triview-02-styled.png",
      "triview-02-comparison.png",
    ]) {
      assert.match(zipEntries.stdout, new RegExp(`${prefix}${name.replaceAll(".", "\\.")}`));
    }
    const manifest = spawnSync(
      "/usr/bin/unzip",
      ["-p", bundlePath, `${prefix}recording-manifest.json`],
      { encoding: "utf8" },
    );
    assert.equal(manifest.status, 0, manifest.stderr);
    assert.deepEqual(JSON.parse(manifest.stdout).portableBundle, {
      schemaVersion: 1,
      worldPlan: {
        file: "world-plan.png",
        role: "planner-navigation-layout",
      },
      triviewComparisonLayout: "whitebox-left-styled-right",
      triviewPanelSizePixels: [1280, 720],
      triviewComparisonSizePixels: [2560, 720],
      triviews: [
        {
          index: 1,
          visualTargetId: "hero",
          role: "primary-subject",
          semanticClassId: "complete-hero",
          layout: "whitebox-left-styled-right",
          whiteboxFile: "triview-01-whitebox.png",
          styledFile: "triview-01-styled.png",
          comparisonFile: "triview-01-comparison.png",
        },
        {
          index: 2,
          visualTargetId: "tower",
          role: "primary-landmark",
          semanticClassId: "complete-tower",
          layout: "whitebox-left-styled-right",
          whiteboxFile: "triview-02-whitebox.png",
          styledFile: "triview-02-styled.png",
          comparisonFile: "triview-02-comparison.png",
        },
      ],
    });

    await writeFile(
      path.join(
        fixture.repoRoot,
        "artifacts",
        "scenes",
        fixture.sceneId,
        "styled-triviews-manifest.json",
      ),
      JSON.stringify({ targets: [] }),
    );
    const incompleteList = await fetch(
      `${http.origin}/api/recording-worlds/${fixture.sceneId}/recordings`,
    ).then((response) => response.json());
    assert.equal(incompleteList.recordings[0].assets.bundleReady, false);
    assert.equal(incompleteList.recordings[0].bundleUrl, null);
    const incompleteBundle = await fetch(`${http.origin}${ready.bundleUrl}`);
    assert.equal(incompleteBundle.status, 409);
    assert.match(await incompleteBundle.text(), /完整首帧和成对白膜\/渲染三视图尚未准备完成/);

    await writeFile(
      path.join(
        fixture.repoRoot,
        "artifacts",
        "scenes",
        fixture.sceneId,
        "styled-triviews-manifest.json",
      ),
      JSON.stringify({ targets: [{ id: "legacy-target-without-canonical-id" }] }),
    );
    const legacyListResponse = await fetch(
      `${http.origin}/api/recording-worlds/${fixture.sceneId}/recordings`,
    );
    assert.equal(legacyListResponse.status, 200);
    const legacyList = await legacyListResponse.json();
    assert.equal(legacyList.recordings[0].assets.bundleReady, false);
    assert.equal(legacyList.recordings[0].bundleUrl, null);

    const persisted = JSON.parse(await readFile(
      path.join(fixture.dataRoot, "recordings", fixture.sceneId, ready.id, "record.json"),
      "utf8",
    ));
    assert.equal(persisted.video.taskId, "ark_test");
  } finally {
    await service.shutdown();
    await http.close();
  }
});
