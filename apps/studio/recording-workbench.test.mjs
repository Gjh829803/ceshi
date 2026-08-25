import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
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
  await mkdir(path.join(artifactRoot, "triviews", "hero"), { recursive: true });
  await mkdir(path.join(artifactRoot, "triviews", "tower"), { recursive: true });
  await writeFile(path.join(artifactRoot, "authoring.json"), "{}\n");
  await writeFile(path.join(artifactRoot, "styled-opening-frame.png"), "opening");
  await writeFile(path.join(artifactRoot, "triviews", "hero", "whitebox-triview.png"), "hero-whitebox");
  await writeFile(path.join(artifactRoot, "triviews", "hero", "styled-triview.png"), "hero");
  await writeFile(path.join(artifactRoot, "triviews", "tower", "whitebox-triview.png"), "tower-whitebox");
  await writeFile(path.join(artifactRoot, "triviews", "tower", "styled-triview.png"), "tower");
  await writeFile(path.join(artifactRoot, "styled-triviews-manifest.json"), JSON.stringify({
    targets: [
      {
        id: "hero",
        role: "primary-subject",
        semanticClassId: "complete-hero",
        styledTriview: { path: "triviews/hero/styled-triview.png" },
      },
      {
        id: "tower",
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
});

test("derives independent prompt and Seedance workflow states", () => {
  assert.equal(deriveRecordingWorkflowStatus({ prompt: { status: "not-started" }, video: { status: "not-started" } }), "recorded");
  assert.equal(deriveRecordingWorkflowStatus({ prompt: { status: "running" }, video: { status: "waiting-for-prompt" } }), "prompt-running");
  assert.equal(deriveRecordingWorkflowStatus({ prompt: { status: "succeeded" }, video: { status: "running" } }), "video-running");
  assert.equal(deriveRecordingWorkflowStatus({ prompt: { status: "succeeded" }, video: { status: "succeeded" } }), "ready");
});

test("pads odd browser canvas dimensions before H.264 normalization", async (context) => {
  const args = recordingNormalizationFfmpegArgs("capture.webm", "capture.mp4");
  assert.deepEqual(args.slice(args.indexOf("-vf"), args.indexOf("-vf") + 2), [
    "-vf",
    "pad=ceil(iw/2)*2:ceil(ih/2)*2:0:0,setsar=1",
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
    "-i", "color=c=blue:s=106x59:d=1,format=yuv444p",
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
          "x-worldkit-recording-duration-ms": "1000",
        },
        body: await readFile(oddWebmPath),
      },
    );
    assert.equal(createdResponse.status, 201, await createdResponse.text());
    const recordings = await fetch(
      `${http.origin}/api/recording-worlds/${fixture.sceneId}/recordings`,
    ).then((response) => response.json());
    assert.equal(recordings.recordings.length, 1);
    assert.equal(recordings.recordings[0].source.extension, "mp4");
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
      triviewComparisonLayout: "whitebox-left-styled-right",
      triviewPanelSizePixels: [1280, 720],
      triviewComparisonSizePixels: [2560, 720],
      triviews: [
        {
          index: 1,
          targetId: "hero",
          role: "primary-subject",
          semanticClassId: "complete-hero",
          layout: "whitebox-left-styled-right",
          whiteboxFile: "triview-01-whitebox.png",
          styledFile: "triview-01-styled.png",
          comparisonFile: "triview-01-comparison.png",
        },
        {
          index: 2,
          targetId: "tower",
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
