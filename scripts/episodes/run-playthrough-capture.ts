import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  PLAYTHROUGH_CAPTURE_FPS,
  PLAYTHROUGH_EVENT_SEGMENT_INDICES,
  PLAYTHROUGH_FRAME_COUNT,
  PLAYTHROUGH_HOST_EVENT_SLOTS,
  PLAYTHROUGH_PROMPT_WINDOWS,
  PLAYTHROUGH_SEGMENT_COUNT,
  PLAYTHROUGH_SEGMENT_EXECUTION_SECONDS,
  PLAYTHROUGH_SEGMENT_FRAME_COUNT,
  buildPlaythroughFrameTelemetry,
  sha256Canonical,
  validatePlaythroughFrameTelemetry,
} from "../lib/playthrough-dataset.mjs";
import {
  PLAYTHROUGH_CAPTURE_HEALTH_POLICY,
  buildPlaythroughRepairEvidence,
  validatePlaythroughCaptureHealth,
} from "../lib/playthrough-capture-health.mjs";
import { validatePlaythroughPlanStructure } from "../lib/playthrough-plan-structure.mjs";
import { captureDeterministicPlaythrough } from "../lib/deterministic-playthrough-capture";
import {
  deterministicCaptureBrowserLaunchOptions,
  launchChromiumWithSystemFallback,
} from "../lib/playwright-browser-launch";

interface Options {
  readonly sceneId: string;
  readonly origin: string;
  readonly playPath: string;
  readonly planPath: string;
  readonly navigationEvidencePath: string;
  readonly output: string;
}

function option(arguments_: readonly string[], name: string): string {
  const index = arguments_.indexOf(name);
  const value = index < 0 ? undefined : arguments_[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} is required.`);
  return value;
}

function parseOptions(arguments_: readonly string[]): Options {
  return {
    sceneId: option(arguments_, "--scene-id"),
    origin: option(arguments_, "--origin"),
    playPath: arguments_.includes("--play-path")
      ? option(arguments_, "--play-path")
      : "/play",
    planPath: path.resolve(option(arguments_, "--plan")),
    navigationEvidencePath: path.resolve(
      option(arguments_, "--navigation-evidence"),
    ),
    output: path.resolve(option(arguments_, "--output")),
  };
}

async function run(command: string, arguments_: readonly string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...arguments_], { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0
      ? resolve()
      : reject(new Error(`${command} exited with ${code}.`)));
  });
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.tmp`,
  );
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, filePath);
}

async function contentHash(filePath: string): Promise<string> {
  return `sha256:${createHash("sha256").update(await readFile(filePath)).digest("hex")}`;
}

async function probeVideo(filePath: string): Promise<{
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  durationSeconds: number;
  hasAudio: boolean;
}> {
  const output: string[] = [];
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffprobe", [
      "-v", "error", "-count_frames", "-show_streams", "-show_format",
      "-of", "json", filePath,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let errorOutput = "";
    child.stdout.on("data", (chunk) => output.push(String(chunk)));
    child.stderr.on("data", (chunk) => { errorOutput += String(chunk); });
    child.once("error", reject);
    child.once("close", (code) => code === 0
      ? resolve()
      : reject(new Error(errorOutput || `ffprobe exited ${code}`)));
  });
  const body = JSON.parse(output.join(""));
  const streams = body.streams ?? [];
  const video = streams.find((stream: any) => stream.codec_type === "video");
  if (!video) throw new Error(`No video stream: ${filePath}`);
  const [numerator = 0, denominator = 1] = String(
    video.avg_frame_rate ?? "0/1",
  ).split("/").map(Number);
  return {
    width: Number(video.width),
    height: Number(video.height),
    fps: denominator ? numerator / denominator : 0,
    frameCount: Number(video.nb_read_frames ?? video.nb_frames ?? 0),
    durationSeconds: Number(body.format?.duration ?? video.duration ?? 0),
    hasAudio: streams.some((stream: any) => stream.codec_type === "audio"),
  };
}

function assertMedia(
  media: Awaited<ReturnType<typeof probeVideo>>,
  frameCount: number,
  label: string,
): void {
  if (media.width !== 1280 || media.height !== 720 ||
      media.fps !== PLAYTHROUGH_CAPTURE_FPS ||
      media.frameCount !== frameCount || media.hasAudio) {
    throw new Error(`${label}_MEDIA_INVALID ${JSON.stringify(media)}`);
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const [plan, navigationEvidence] = await Promise.all([
    readFile(options.planPath, "utf8").then(JSON.parse),
    readFile(options.navigationEvidencePath, "utf8").then(JSON.parse),
  ]);
  const validation = validatePlaythroughPlanStructure(plan, {
    sceneId: options.sceneId,
    navigationEvidence,
  });
  if (!validation.ok) {
    throw new Error(`PLAYTHROUGH_PLAN_INVALID\n${JSON.stringify(validation.diagnostics)}`);
  }
  await mkdir(options.output, { recursive: true });
  const episodePath = path.join(options.output, "episode-180s.mp4");
  const episodeTemporaryPath = path.join(
    options.output,
    `.episode-180s.${process.pid}.mp4`,
  );
  const browser = await launchChromiumWithSystemFallback(
    deterministicCaptureBrowserLaunchOptions(),
  );
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" &&
        !message.text().includes("WebSocket connection")) {
      const text = message.text().slice(0, 4_000);
      consoleErrors.push(text);
      if (text.startsWith("WORLDKIT_RUNTIME_FIXED_INPUT_FAILED")) {
        process.stderr.write(`${text}\n`);
      }
    }
  });
  try {
    const url = new URL(options.origin);
    url.pathname = options.playPath;
    url.searchParams.set("authoring", "1");
    url.searchParams.set("world", options.sceneId);
    await page.goto(url.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await page.waitForFunction(
      () => window.__WORLDKIT__ !== undefined ||
        document.documentElement.dataset.worldkitStatus === "error",
      undefined,
      { timeout: 120_000 },
    );
    const initial = await page.evaluate(async () => {
      if (!window.__WORLDKIT__) throw new Error("WORLDKIT_BROWSER_PROTOCOL_MISSING");
      return window.__WORLDKIT__.ready();
    });
    await page.locator("canvas").first().focus();
    const captures = [];
    const segments = [];
    const segmentQualities = [];
    for (let index = 0; index < PLAYTHROUGH_SEGMENT_COUNT; index += 1) {
      const segmentId = `segment-0${index}`;
      const segmentPlan = plan.segmentPlans[index];
      const segmentPath = path.join(options.output, `${segmentId}.mp4`);
      const firstFramePath = path.join(options.output, `${segmentId}-first-frame.png`);
      const segmentTemporaryPath = path.join(
        options.output,
        `.${segmentId}.${process.pid}.mp4`,
      );
      const firstFrameTemporaryPath = path.join(
        options.output,
        `.${segmentId}-first-frame.${process.pid}.png`,
      );
      const capture = await captureDeterministicPlaythrough({
        page,
        plan,
        outputPath: segmentTemporaryPath,
        executionStartSeconds: index * PLAYTHROUGH_SEGMENT_EXECUTION_SECONDS,
        frameCount: PLAYTHROUGH_SEGMENT_FRAME_COUNT,
        firstFramePath: firstFrameTemporaryPath,
        captureStartState: {
          positionMetersXYZ: segmentPlan.initialPositionMetersXYZ,
          facingYawRadians: segmentPlan.initialFacingYawRadians,
        },
        progressLabel: `WORLDKIT_EPISODE_CAPTURE_PROGRESS_${segmentId}`,
      });
      const media = await probeVideo(segmentTemporaryPath);
      assertMedia(media, PLAYTHROUGH_SEGMENT_FRAME_COUNT, segmentId);
      const quality = validatePlaythroughCaptureHealth({
        telemetrySamples: capture.telemetrySamples,
        consoleErrors,
      });
      if (quality.ok) {
        await Promise.all([
          rename(segmentTemporaryPath, segmentPath),
          rename(firstFrameTemporaryPath, firstFramePath),
        ]);
      } else {
        await Promise.all([
          rm(segmentTemporaryPath, { force: true }),
          rm(firstFrameTemporaryPath, { force: true }),
        ]);
      }
      captures.push(capture);
      segmentQualities.push({
        segmentId,
        passed: quality.ok,
        diagnostics: quality.diagnostics,
        metrics: quality.metrics,
      });
      segments.push({
        segmentId,
        startFrame: index * PLAYTHROUGH_SEGMENT_FRAME_COUNT,
        endFrameExclusive: (index + 1) * PLAYTHROUGH_SEGMENT_FRAME_COUNT,
        videoPath: path.basename(segmentPath),
        firstFramePath: path.basename(firstFramePath),
        initialPositionMetersXYZ: segmentPlan.initialPositionMetersXYZ,
        initialFacingYawRadians: segmentPlan.initialFacingYawRadians,
        selectedForSeedance: true,
        selectedForPromptEvents: PLAYTHROUGH_EVENT_SEGMENT_INDICES.some(
          (eventSegmentIndex) => eventSegmentIndex === index,
        ),
        media,
      });
    }
    const promptMarkers = PLAYTHROUGH_HOST_EVENT_SLOTS.map((slot) => ({
      plannedSeconds: slot.globalSeconds,
      actualSeconds: slot.globalSeconds,
      kind: "prompt-marker",
      id: slot.id,
      segmentId: slot.segmentId,
      source: "host-event-slot",
    }));
    const events = [...captures.flatMap((capture) => capture.events), ...promptMarkers]
      .sort((left, right) => left.actualSeconds - right.actualSeconds ||
        String(left.id).localeCompare(String(right.id)));
    const qualityPassed = segmentQualities.every((quality) => quality.passed);
    await writeJsonAtomic(
      path.join(options.output, "executed-playthrough-quality-report.json"),
      {
        kind: "worldkit-executed-playthrough-quality-report",
        schemaVersion: 3,
        sceneId: options.sceneId,
        planHash: sha256Canonical(plan),
        policy: PLAYTHROUGH_CAPTURE_HEALTH_POLICY,
        passed: qualityPassed,
        diagnostics: segmentQualities.flatMap((quality) => quality.diagnostics.map(
          (diagnostic) => ({ ...diagnostic, segmentId: quality.segmentId }),
        )),
        segments: segmentQualities,
      },
    );
    if (!qualityPassed) {
      await writeJsonAtomic(
        path.join(options.output, "executed-playthrough-repair-evidence.json"),
        buildPlaythroughRepairEvidence({
          sceneId: options.sceneId,
          planHash: sha256Canonical(plan),
          captures,
          segmentQualities,
        }),
      );
      throw new Error(
        `EPISODE_MINIMUM_CAPTURE_HEALTH_FAILED ${JSON.stringify(segmentQualities)}`,
      );
    }
    await run("ffmpeg", [
      "-y", "-v", "error",
      ...segments.flatMap((segment) => [
        "-i",
        path.join(options.output, segment.videoPath),
      ]),
      "-filter_complex",
      `${segments.map((_, index) => `[${index}:v:0]`).join("")}concat=n=6:v=1:a=0[v]`,
      "-map", "[v]", "-an", "-frames:v", String(PLAYTHROUGH_FRAME_COUNT),
      "-r", "24", "-fps_mode", "cfr", "-enc_time_base", "1/24",
      "-video_track_timescale", "24000", "-c:v", "libx264",
      "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
      "-movflags", "+faststart", episodeTemporaryPath,
    ]);
    const episodeMedia = await probeVideo(episodeTemporaryPath);
    assertMedia(episodeMedia, PLAYTHROUGH_FRAME_COUNT, "EPISODE_DELIVERY");
    await rename(episodeTemporaryPath, episodePath);
    for (const segment of segments) {
      Object.assign(segment, {
        videoContentHash: await contentHash(path.join(options.output, segment.videoPath)),
        firstFrameContentHash: await contentHash(path.join(
          options.output,
          segment.firstFramePath,
        )),
      });
    }
    const episodeContentHash = await contentHash(episodePath);
    const telemetrySamples = captures.flatMap((capture) => capture.telemetrySamples);
    const frameTelemetry = buildPlaythroughFrameTelemetry(
      telemetrySamples,
      {
        captureFrameRate: PLAYTHROUGH_CAPTURE_FPS,
        frameCount: PLAYTHROUGH_FRAME_COUNT,
        widthPixels: 1280,
        heightPixels: 720,
      },
    );
    const telemetryValidation = validatePlaythroughFrameTelemetry(frameTelemetry);
    if (!telemetryValidation.ok) {
      throw new Error(
        `EPISODE_FRAME_TELEMETRY_INVALID ${JSON.stringify(telemetryValidation.diagnostics)}`,
      );
    }
    for (const slot of PLAYTHROUGH_HOST_EVENT_SLOTS) {
      const marker = promptMarkers.find(({ id }) => id === slot.id)!;
      const window = PLAYTHROUGH_PROMPT_WINDOWS[slot.windowIndex]!;
      if (marker.actualSeconds < window.startSeconds ||
          marker.actualSeconds >= window.endSeconds) {
        throw new Error(`EPISODE_PROMPT_MARKER_INVALID ${slot.id}`);
      }
    }
    const finalCapture = captures.at(-1);
    if (!finalCapture) throw new Error("EPISODE_CAPTURE_SET_EMPTY");
    const rawTrace = {
      kind: "worldkit-executed-playthrough-raw-trace",
      schemaVersion: 2,
      sceneId: options.sceneId,
      planHash: sha256Canonical(plan),
      recordedAt: new Date().toISOString(),
      recorder: {
        mode: "six-independent-fixed-step-captures",
        width: 1280,
        height: 720,
        frameRate: PLAYTHROUGH_CAPTURE_FPS,
        frameCount: PLAYTHROUGH_FRAME_COUNT,
        sourceFramePolicy: "genuine-frames-only-no-synthesis",
      },
      initial,
      finished: finalCapture.finished,
      events,
      telemetrySamples,
      consoleErrors,
      executionMedia: episodeMedia,
      episodeContentHash,
    };
    await writeJsonAtomic(
      path.join(options.output, "executed-playthrough-raw-trace.json"),
      rawTrace,
    );
    await writeJsonAtomic(
      path.join(options.output, "executed-playthrough-trace.json"),
      {
        kind: "worldkit-executed-playthrough-trace",
        schemaVersion: 3,
        sceneId: options.sceneId,
        planHash: sha256Canonical(plan),
        resolvedControlPlanHash: sha256Canonical({
          inputIntervals: plan.inputIntervals,
          cameraEvents: plan.cameraEvents,
        }),
        recordedAt: new Date().toISOString(),
        recorder: rawTrace.recorder,
        initial: {
          runtimeSessionId: initial.runtimeSessionId,
          worldSessionId: initial.worldSessionId,
          simulationTick: initial.world.simulationTick,
        },
        finished: {
          runtimeSessionId: finalCapture.finished.runtimeSessionId,
          worldSessionId: finalCapture.finished.worldSessionId,
          simulationTick: finalCapture.finished.world.simulationTick,
        },
        events,
        frameTelemetry,
        consoleErrors,
        executionMedia: episodeMedia,
        mediaConformance: {
          mode: "six-independent-fixed-step-captures",
          sourceFrameCount: PLAYTHROUGH_FRAME_COUNT,
          synthesizedFrameCount: 0,
        },
        episodeMedia,
        episodeContentHash,
        segments,
      },
    );
    process.stdout.write(
      `WORLDKIT_EPISODE_CAPTURE_OK ${options.sceneId} ` +
      `frames=${episodeMedia.frameCount} segments=${segments.length}\n`,
    );
  } finally {
    await browser.close();
    await Promise.all([
      rm(episodeTemporaryPath, { force: true }),
      ...Array.from({ length: PLAYTHROUGH_SEGMENT_COUNT }, (_, index) =>
        rm(path.join(options.output, `.segment-0${index}.${process.pid}.mp4`), {
          force: true,
        })),
      ...Array.from({ length: PLAYTHROUGH_SEGMENT_COUNT }, (_, index) =>
        rm(path.join(
          options.output,
          `.segment-0${index}-first-frame.${process.pid}.png`,
        ), { force: true })),
    ]);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
