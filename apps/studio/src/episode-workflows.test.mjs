import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer, get as httpGet } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

import { createEpisodeWorkflowService } from "./episode-workflows.mjs";

test("destroys an artifact stream when the browser aborts a video request", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "worldkit-episode-abort-"));
  const episodeId = "episode-demo-world-abort1";
  const episodeRoot = path.join(repoRoot, "artifacts/episodes", episodeId);
  const artifactPath = path.join(episodeRoot, "whitebox/segment-00.mp4");
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, Buffer.alloc(1024 * 1024, 1));

  let resolveDestroyed;
  const destroyed = new Promise((resolve) => { resolveDestroyed = resolve; });
  class SlowArtifactStream extends Readable {
    #timer = null;
    _read() {
      if (this.#timer) return;
      this.#timer = setInterval(() => this.push(Buffer.alloc(1024, 1)), 5);
    }
    _destroy(error, callback) {
      clearInterval(this.#timer);
      resolveDestroyed();
      callback(error);
    }
  }

  const service = createEpisodeWorkflowService({
    repoRoot,
    studioOrigin: () => "http://127.0.0.1:4297",
    spawnImplementation: () => new EventEmitter(),
    createReadStreamImplementation: () => new SlowArtifactStream(),
  });
  const server = createServer((request, response) => {
    void service.handleApi(request, response, new URL(request.url, "http://127.0.0.1"));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    await new Promise((resolve, reject) => {
      const request = httpGet({
        host: "127.0.0.1",
        port: address.port,
        path: `/api/episode-workflows/${episodeId}/artifacts/whitebox/segment-00.mp4`,
      }, (response) => {
        response.once("data", () => {
          response.destroy();
          resolve();
        });
      });
      request.once("error", (error) => {
        if (error.code === "ECONNRESET") resolve();
        else reject(error);
      });
    });
    await Promise.race([
      destroyed,
      new Promise((_, reject) => setTimeout(() => reject(new Error("artifact stream was not destroyed")), 500)),
    ]);
  } finally {
    await service.shutdown();
    await new Promise((resolve) => server.close(resolve));
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("lists only the selected scene and exposes every completed stage artifact", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "worldkit-episode-service-"));
  const root = path.join(repoRoot, "artifacts/episodes/episode-demo-world-abc123");
  await mkdir(path.join(root, "whitebox"), { recursive: true });
  await writeFile(path.join(root, "episode-record.json"), JSON.stringify({
    kind: "worldkit-episode-workflow-record",
    schemaVersion: 1,
    sceneId: "demo-world",
    episodeId: "episode-demo-world-abc123",
    status: "running",
    currentStage: "whitebox-capture",
    createdAt: "2026-08-28T00:00:00.000Z",
    updatedAt: "2026-08-28T00:01:00.000Z",
    stages: [{ id: "whitebox-capture", title: "白膜视频", status: "running" }],
  }));
  await writeFile(path.join(root, "whitebox/episode-90s.mp4"), Buffer.alloc(128, 1));
  const service = createEpisodeWorkflowService({
    repoRoot,
    studioOrigin: () => "http://127.0.0.1:4297",
    spawnImplementation: () => new EventEmitter(),
  });
  try {
    const records = await service.listForScene("demo-world");
    assert.equal(records.length, 1);
    assert.equal(records[0].episodeId, "episode-demo-world-abc123");
    assert.deepEqual(records[0].artifacts.map(({ relativePath }) => relativePath), [
      "whitebox/episode-90s.mp4",
    ]);
    assert.deepEqual(await service.listForScene("another-world"), []);
    assert.deepEqual((await service.listAll()).map(({ episodeId }) => episodeId), [
      "episode-demo-world-abc123",
    ]);
    assert.deepEqual(await service.listAll({ requireFinalVideo: true }), []);
  } finally {
    await service.shutdown();
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("derives three synchronized comparison stages from executed input and prompt artifacts", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "worldkit-episode-comparison-"));
  const episodeId = "episode-demo-world-compare123";
  const root = path.join(repoRoot, "artifacts/episodes", episodeId);
  await Promise.all([
    mkdir(path.join(root, "planning"), { recursive: true }),
    mkdir(path.join(root, "whitebox"), { recursive: true }),
    mkdir(path.join(root, "prompts"), { recursive: true }),
    mkdir(path.join(root, "video/segment-00"), { recursive: true }),
    mkdir(path.join(root, "visual-reviews/visual-reconstructor-v5"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(root, "episode-record.json"), JSON.stringify({
      kind: "worldkit-episode-workflow-record",
      schemaVersion: 1,
      sceneId: "demo-world",
      episodeId,
      status: "succeeded",
      currentStage: null,
      createdAt: "2026-08-28T00:00:00.000Z",
      updatedAt: "2026-08-28T00:10:00.000Z",
      stages: [],
    })),
    writeFile(path.join(root, "planning/playthrough-plan.json"), JSON.stringify({
      seedancePromptEvents: [{
        id: "prompt-event-00",
        segmentId: "segment-00",
        globalSeconds: 15.2,
        segmentRelativeSeconds: 15.2,
        targetNames: ["完整主体"],
        eventClass: "environment-transformation",
        dominantChange: "整片可见地表在保持碰撞不变的前提下转化为高对比发光环境。",
        eventPrompt: "在真实接触点生成一阵低矮尘流。",
        timing: { transitionDurationSeconds: 2.5, endingDurationSeconds: 1.5 },
      }],
    })),
    writeFile(path.join(root, "whitebox/executed-playthrough-trace.json"), JSON.stringify({
      events: [
        { id: "input-00", kind: "input-start", actualSeconds: 0.1, rawKeys: ["W", "Shift"] },
        { id: "camera-00", kind: "camera", actualSeconds: 2, durationMs: 250, cameraKeys: ["ArrowUp", "ArrowRight"] },
        { id: "input-00", kind: "input-end", actualSeconds: 3.5 },
        { id: "prompt-event-00", kind: "prompt-marker", segmentId: "segment-00", actualSeconds: 15.205 },
        { id: "input-01", kind: "input-start", actualSeconds: 30.2, rawKeys: ["S"] },
        { id: "input-01", kind: "input-end", actualSeconds: 31 },
      ],
    })),
    writeFile(path.join(root, "prompts/segment-00.json"), JSON.stringify({
      eventId: "prompt-event-00",
      executedEventSeconds: 15.205,
      prompt: "完整的 Seedance Provider Prompt",
    })),
    writeFile(path.join(root, "whitebox/segment-00.mp4"), Buffer.alloc(128, 1)),
    writeFile(path.join(root, "video/segment-00/mg-seedance-2.5-480p.mp4"), Buffer.alloc(192, 3)),
    writeFile(path.join(root, "video/segment-00/final-854x480-24fps-720f.mp4"), Buffer.alloc(256, 2)),
    writeFile(path.join(root, "visual-reviews/visual-reconstructor-v5/segment-00-styled-opening-frame.png"), Buffer.alloc(320, 4)),
  ]);
  const service = createEpisodeWorkflowService({
    repoRoot,
    studioOrigin: () => "http://127.0.0.1:4297",
    spawnImplementation: () => new EventEmitter(),
  });
  try {
    const [record] = await service.listForScene("demo-world");
    assert.equal(record.playbackComparisons.length, 3);
    const first = record.playbackComparisons[0];
    assert.equal(first.segmentId, "segment-00");
    assert.equal(first.whiteboxVideo.url, `/api/episode-workflows/${episodeId}/artifacts/whitebox/segment-00.mp4`);
    assert.equal(first.finalVideo.url, `/api/episode-workflows/${episodeId}/artifacts/video/segment-00/final-854x480-24fps-720f.mp4`);
    assert.equal(first.publicPreviewVideo.url, `/api/episode-workflows/${episodeId}/artifacts/video/segment-00/final-854x480-24fps-720f.mp4`);
    assert.equal(first.baseStyledOpeningFrame.url, "/api/worlds/demo-world/deliverables/styled-opening-frame");
    assert.equal(first.reviewStyledOpeningFrame.url, `/api/episode-workflows/${episodeId}/artifacts/visual-reviews/visual-reconstructor-v5/segment-00-styled-opening-frame.png`);
    assert.deepEqual(first.inputActivations, [
      { id: "input-00", kind: "movement", startSeconds: 0.1, endSeconds: 3.5, keys: ["W", "Shift"] },
      { id: "camera-00", kind: "camera", startSeconds: 2, endSeconds: 2.25, keys: ["ArrowUp", "ArrowRight"] },
    ]);
    assert.deepEqual(first.promptEvent, {
      id: "prompt-event-00",
      globalSeconds: 15.205,
      relativeSeconds: 15.205,
      activeEndSeconds: 19.205,
      targetNames: ["完整主体"],
      eventClass: "environment-transformation",
      commandText: "整片可见地表在保持碰撞不变的前提下转化为高对比发光环境。",
      eventPrompt: "在真实接触点生成一阵低矮尘流。",
      providerPrompt: "完整的 Seedance Provider Prompt",
    });
    assert.deepEqual(record.playbackComparisons[1].inputActivations, [
      { id: "input-01", kind: "movement", startSeconds: 0.2, endSeconds: 1, keys: ["S"] },
    ]);
    assert.equal(record.playbackComparisons[1].whiteboxVideo, null);
    assert.equal(record.playbackComparisons[2].promptEvent, null);
    assert.ok(record.artifacts.some((artifact) =>
      artifact.relativePath === "video/segment-00/mg-seedance-2.5-480p.mp4" &&
      artifact.stage === "seedance-generation"));
    assert.deepEqual((await service.listAll({ requireFinalVideo: true })).map(({ episodeId: id }) => id), [
      episodeId,
    ]);
  } finally {
    await service.shutdown();
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("packages all three review stages with related images and one prompt-bearing input timeline", async () => {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "worldkit-episode-bundle-"));
  const sceneId = "demo-world";
  const episodeId = "episode-demo-world-bundle123";
  const episodeRoot = path.join(repoRoot, "artifacts/episodes", episodeId);
  const sceneRoot = path.join(repoRoot, "artifacts/scenes", sceneId);
  const write = async (filePath, value = Buffer.alloc(96, 1)) => {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, typeof value === "string" ? value : value);
  };
  const record = {
    kind: "worldkit-episode-workflow-record",
    schemaVersion: 1,
    sceneId,
    episodeId,
    status: "succeeded",
    currentStage: null,
    createdAt: "2026-08-28T00:00:00.000Z",
    updatedAt: "2026-08-28T00:10:00.000Z",
    stages: [],
  };
  const promptEvents = [0, 1, 2].map((index) => ({
    id: `prompt-event-0${index}`,
    segmentId: `segment-0${index}`,
    globalSeconds: index * 30 + 15,
    segmentRelativeSeconds: 15,
    targetNames: ["完整主体"],
    eventClass: "environment-transformation",
    dominantChange: `第 ${index + 1} 段环境发生大幅变化`,
    eventPrompt: `第 ${index + 1} 段用户输入 Prompt`,
    timing: { transitionDurationSeconds: 2, endingDurationSeconds: 2 },
  }));
  const traceEvents = promptEvents.flatMap((event, index) => [
    { id: `input-0${index}`, kind: "input-start", actualSeconds: index * 30 + 1, rawKeys: ["W", "Shift"] },
    { id: `input-0${index}`, kind: "input-end", actualSeconds: index * 30 + 3 },
    { id: event.id, kind: "prompt-marker", segmentId: event.segmentId, actualSeconds: event.globalSeconds + .05 },
  ]);
  const frameTelemetry = {
    kind: "worldkit-episode-frame-telemetry",
    schemaVersion: 1,
    captureFrameRate: 24,
    frameCount: 2160,
    samples: [{
      frameIndex: 0,
      videoTimeSeconds: 0,
      activeKeys: ["W"],
      subject: { positionMetersXYZ: [0, 1, 0] },
      camera: { verticalFovDegrees: 58, viewMatrixColumnMajor: Array(16).fill(0) },
    }],
  };
  const visualManifest = {
    targets: [{
      visualTargetId: "hero",
      styledTriview: { path: "visual/triviews/hero/styled-triview.png" },
    }],
  };
  await Promise.all([
    write(path.join(episodeRoot, "episode-record.json"), JSON.stringify(record)),
    write(path.join(episodeRoot, "planning/playthrough-plan.json"), JSON.stringify({ seedancePromptEvents: promptEvents })),
    write(path.join(episodeRoot, "planning/reconnaissance/reconnaissance-report.json"), "{}"),
    write(path.join(episodeRoot, "whitebox/executed-playthrough-trace.json"), JSON.stringify({ events: traceEvents, frameTelemetry })),
    write(path.join(episodeRoot, "whitebox/episode-90s.mp4")),
    write(path.join(episodeRoot, "whitebox/episode-raw.webm")),
    write(path.join(episodeRoot, "visual/episode-visual-prompts.json"), "{}"),
    write(path.join(episodeRoot, "visual/episode-visual-manifest.json"), JSON.stringify(visualManifest)),
    write(path.join(episodeRoot, "visual/triviews/hero/styled-triview.png")),
    write(path.join(episodeRoot, "pipeline.log"), "pipeline complete\n"),
    write(path.join(sceneRoot, "user-first-frame.png")),
    write(path.join(sceneRoot, "styled-opening-frame.png")),
    write(path.join(sceneRoot, "triviews/hero/whitebox-triview.png")),
    write(path.join(repoRoot, "apps/playground/public/scene-plans", sceneId, "world-plan.png")),
  ]);
  for (let index = 0; index < 3; index += 1) {
    const segmentId = `segment-0${index}`;
    await Promise.all([
      write(path.join(episodeRoot, `whitebox/${segmentId}.mp4`)),
      write(path.join(episodeRoot, `whitebox/${segmentId}-first-frame.png`)),
      write(path.join(episodeRoot, `visual/${segmentId}-styled-opening-frame.png`)),
      write(path.join(episodeRoot, `video/${segmentId}/mg-seedance-2.5-480p.mp4`)),
      write(path.join(episodeRoot, `video/${segmentId}/cf-upscaled-720p.mp4`)),
      write(path.join(episodeRoot, `video/${segmentId}/final-1280x720-24fps-720f.mp4`)),
      write(path.join(episodeRoot, `prompts/${segmentId}.json`), JSON.stringify({
        eventId: `prompt-event-0${index}`,
        executedEventSeconds: index * 30 + 15.05,
        prompt: `第 ${index + 1} 段完整 Seedance Provider Prompt`,
      })),
      write(path.join(episodeRoot, `video/${segmentId}/provider-run.json`), JSON.stringify({ status: "succeeded" })),
    ]);
  }
  const service = createEpisodeWorkflowService({
    repoRoot,
    studioOrigin: () => "http://127.0.0.1:4297",
    spawnImplementation: () => new EventEmitter(),
  });
  const server = createServer((request, response) => {
    void service.handleApi(request, response, new URL(request.url, "http://127.0.0.1"));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    const [enriched] = await service.listForScene(sceneId);
    assert.equal(enriched.reviewDownloads.bundle.ready, true);
    assert.equal(enriched.reviewDownloads.images.length, 11);
    assert.match(enriched.reviewDownloads.bundle.fileName, /-seedance-review\.zip$/);
    const timelineResponse = await fetch(`${origin}/api/episode-workflows/${episodeId}/interaction-timeline`);
    assert.equal(timelineResponse.status, 200);
    assert.match(timelineResponse.headers.get("content-disposition"), /interaction-timeline\.json/);
    const timeline = await timelineResponse.json();
    assert.equal(timeline.schemaVersion, 2);
    assert.deepEqual(timeline.frameTelemetry, frameTelemetry);
    assert.deepEqual(timeline.segments[0].inputs[0], {
      id: "input-00",
      kind: "movement",
      keys: ["W", "Shift"],
      segmentStartSeconds: 1,
      segmentEndSeconds: 3,
      globalStartSeconds: 1,
      globalEndSeconds: 3,
    });
    assert.equal(timeline.segments[0].promptEvent.inputPrompt, "第 1 段用户输入 Prompt");
    assert.equal(
      timeline.segments[0].promptEvent.seedanceProviderPrompt,
      "第 1 段完整 Seedance Provider Prompt",
    );
    const bundleResponse = await fetch(`${origin}/api/episode-workflows/${episodeId}/bundle`);
    assert.equal(bundleResponse.status, 200);
    assert.equal(bundleResponse.headers.get("content-type"), "application/zip");
    assert.match(bundleResponse.headers.get("content-disposition"), /seedance-review\.zip/);
    const bundlePath = path.join(repoRoot, "episode-review.zip");
    await writeFile(bundlePath, Buffer.from(await bundleResponse.arrayBuffer()));
    const folder = `${episodeId}-seedance-review`;
    const entries = spawnSync("/usr/bin/unzip", ["-Z1", bundlePath], { encoding: "utf8" });
    assert.equal(entries.status, 0, entries.stderr);
    for (const relativePath of [
      "manifest.json",
      "interaction-timeline.json",
      "reference/user-first-frame.png",
      "reference/world-plan.png",
      "visual/triviews/hero-whitebox.png",
      "visual/triviews/hero-styled.png",
      "segments/segment-00/whitebox-1280x720-24fps-720f.mp4",
      "segments/segment-00/seedance-final-1280x720-24fps-720f.mp4",
      "segments/segment-00/seedance-prompt.json",
      "segments/segment-00/provider-run.json",
    ]) {
      assert.match(entries.stdout, new RegExp(`${folder}/${relativePath.replaceAll(".", "\\.")}`));
    }
    const bundledTimeline = spawnSync(
      "/usr/bin/unzip",
      ["-p", bundlePath, `${folder}/interaction-timeline.json`],
      { encoding: "utf8" },
    );
    const bundledTimelineValue = JSON.parse(bundledTimeline.stdout);
    assert.equal(bundledTimelineValue.segments[2].promptEvent.inputPrompt, "第 3 段用户输入 Prompt");
    assert.equal(bundledTimelineValue.frameTelemetry.samples[0].camera.verticalFovDegrees, 58);
  } finally {
    await service.shutdown();
    await new Promise((resolve) => server.close(resolve));
    await rm(repoRoot, { recursive: true, force: true });
  }
});
