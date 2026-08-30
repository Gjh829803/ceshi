import { spawn } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Page } from "playwright";

import {
  PLAYTHROUGH_CAPTURE_FPS,
  PLAYTHROUGH_DURATION_SECONDS,
  PLAYTHROUGH_FRAME_COUNT,
  PLAYTHROUGH_SEGMENT_FRAME_COUNT,
  buildPlaythroughFrameTelemetry,
  sha256Canonical,
  validatePlaythroughPlan,
} from "../lib/playthrough-dataset.mjs";
import { launchChromiumWithSystemFallback } from "../lib/playwright-browser-launch";

interface Options {
  sceneId: string;
  origin: string;
  playPath: string;
  planPath: string;
  output: string;
}

function parseOptions(argv: string[]): Options {
  const value = (name: string): string => {
    const index = argv.indexOf(name);
    if (index < 0 || !argv[index + 1]) throw new Error(`Missing ${name}.`);
    return argv[index + 1]!;
  };
  return {
    sceneId: value("--scene-id"),
    origin: value("--origin"),
    playPath: argv.includes("--play-path") ? value("--play-path") : "/",
    planPath: path.resolve(value("--plan")),
    output: path.resolve(value("--output")),
  };
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited ${code}: ${(stderr || stdout).slice(-3000)}`));
    });
  });
}

async function probeVideo(filePath: string) {
  const output: string[] = [];
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffprobe", [
      "-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", filePath,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let error = "";
    child.stdout.on("data", (chunk) => output.push(String(chunk)));
    child.stderr.on("data", (chunk) => { error += String(chunk); });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error(error)));
  });
  const body = JSON.parse(output.join(""));
  const streams = body.streams ?? [];
  const video = streams.find((stream: any) => stream.codec_type === "video");
  if (!video) throw new Error(`No video stream: ${filePath}`);
  const [numerator = 0, denominator = 1] = String(video.avg_frame_rate ?? "0/1").split("/").map(Number);
  return {
    width: Number(video.width),
    height: Number(video.height),
    fps: denominator ? numerator / denominator : 0,
    frameCount: Number(video.nb_read_frames ?? video.nb_frames ?? 0),
    durationSeconds: Number(body.format?.duration ?? video.duration ?? 0),
    hasAudio: streams.some((stream: any) => stream.codec_type === "audio"),
  };
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, filePath);
}

async function runBrowserTimeline(page: Page, plan: any): Promise<{ events: any[]; telemetrySamples: any[] }> {
  const planPayload = JSON.stringify({
    inputIntervals: plan.inputIntervals,
    cameraEvents: plan.cameraEvents,
    seedancePromptEvents: plan.seedancePromptEvents,
  });
  const expression = String.raw`(async () => {
    const plan = __WORLDKIT_PLAYTHROUGH_PLAN__;
    const protocol = window.__WORLDKIT__;
    if (!protocol) throw new Error("WORLDKIT_BROWSER_PROTOCOL_MISSING");
    const codes = { W: "KeyW", A: "KeyA", S: "KeyS", D: "KeyD", Shift: "ShiftLeft", Space: "Space", R: "KeyR", ArrowLeft: "ArrowLeft", ArrowRight: "ArrowRight", ArrowUp: "ArrowUp", ArrowDown: "ArrowDown" };
    const rank = { "input-end": 0, "input-start": 1, "camera-reset": 2, camera: 3, "prompt-marker": 4 };
    const timeline = [];
    for (const interval of plan.inputIntervals) {
      timeline.push({ at: interval.startSeconds, kind: "input-start", interval });
      timeline.push({ at: interval.endSeconds, kind: "input-end", interval });
    }
    for (const [index, at] of [29, 59].entries()) {
      timeline.push({ at, kind: "camera-reset", id: "segment-camera-reset-" + String(index + 1).padStart(2, "0") });
    }
    for (const event of plan.cameraEvents) timeline.push({ at: event.atSeconds, kind: "camera", event });
    for (const event of plan.seedancePromptEvents) timeline.push({ at: event.globalSeconds, kind: "prompt-marker", event });
    timeline.sort((left, right) => left.at - right.at || rank[left.kind] - rank[right.kind]);
    const activeKeys = new Set();
    const pressedKeys = new Set();
    const trace = [];
    const telemetrySamples = [];
    const errors = [];
    const movementKeys = new Set(["W", "A", "S", "D"]);
    let activeInterval = null;
    let recoveryTimer = null;
    let recoveryIndex = 0;
    let recoveryInProgress = false;
    let lastSamplePosition = null;
    let stagnantSinceMs = null;
    const startedAt = performance.now();
    const actualSeconds = () => (performance.now() - startedAt) / 1000;
    const dispatch = (type, key) => {
      const code = codes[key];
      if (type === "keydown") pressedKeys.add(key);
      else if (type === "keyup") pressedKeys.delete(key);
      window.dispatchEvent(new KeyboardEvent(type, { key: key === "Space" ? " " : key, code, bubbles: true, cancelable: true }));
    };
    const releaseAll = () => {
      for (const key of activeKeys) dispatch("keyup", key);
      activeKeys.clear();
    };
    const pressKeys = (keys) => {
      for (const key of keys) {
        dispatch("keydown", key);
        activeKeys.add(key);
      }
    };
    const subjectPosition = () => {
      const snapshot = protocol.getSnapshot();
      const states = snapshot?.world?.subjectStatesByEntityId ?? {};
      const targetId = snapshot?.view?.camera?.targetEntityId ?? Object.keys(states)[0];
      const position = states?.[targetId]?.entityState?.positionMetersXYZ;
      return Array.isArray(position) && position.length === 3 ? [...position] : null;
    };
    const sampleTelemetry = () => {
      const snapshot = protocol.getSnapshot();
      const states = snapshot?.world?.subjectStatesByEntityId ?? {};
      const camera = snapshot?.view?.camera;
      const targetEntityId = camera?.targetEntityId ?? Object.keys(states)[0];
      const entityState = states?.[targetEntityId]?.entityState;
      const cameraPosition = camera?.actualPositionMetersXYZ ?? camera?.positionMetersXYZ;
      const cameraTarget = camera?.actualTargetPositionMetersXYZ ??
        camera?.desiredTargetPositionMetersXYZ ?? camera?.targetSocketPositionMetersXYZ;
      if (!entityState || camera?.mode !== "tracking" || !Array.isArray(cameraPosition) ||
          !Array.isArray(cameraTarget) || !Number.isFinite(camera.finalFovDegrees)) return;
      telemetrySamples.push({
        actualSeconds: actualSeconds(),
        simulationTick: snapshot.world.simulationTick,
        worldSessionId: snapshot.worldSessionId,
        activeKeys: [...pressedKeys],
        subject: {
          entityId: targetEntityId,
          positionMetersXYZ: [...entityState.positionMetersXYZ],
          rotationQuaternionXYZW: [...entityState.rotationQuaternionXYZW],
          velocityMetersPerSecondXYZ: [...(entityState.linearVelocityMetersPerSecondXYZ ?? [0, 0, 0])],
        },
        camera: {
          id: camera.id,
          targetEntityId,
          activeCameraProfileRef: camera.activeCameraProfileRef,
          activeCameraRigRef: camera.activeCameraRigRef,
          positionMetersXYZ: [...cameraPosition],
          targetPositionMetersXYZ: [...cameraTarget],
          verticalFovDegrees: camera.finalFovDegrees,
          nearClipMeters: camera.nearClipMeters,
          farClipMeters: camera.farClipMeters,
        },
      });
    };
    const finishRecovery = (reason) => {
      if (!recoveryInProgress) return;
      releaseAll();
      trace.push({
        plannedSeconds: activeInterval?.startSeconds ?? actualSeconds(),
        actualSeconds: actualSeconds(),
        kind: "input-end",
        id: "runtime-recovery-" + String(recoveryIndex).padStart(2, "0"),
        source: "runtime-recovery",
        reason,
        positionMetersXYZ: subjectPosition(),
      });
      recoveryInProgress = false;
      recoveryTimer = null;
      if (activeInterval && actualSeconds() < activeInterval.endSeconds) {
        pressKeys(activeInterval.rawKeys);
      }
      lastSamplePosition = subjectPosition();
      stagnantSinceMs = null;
    };
    const cancelRecovery = (reason) => {
      if (recoveryTimer !== null) window.clearTimeout(recoveryTimer);
      finishRecovery(reason);
    };
    const startRecovery = () => {
      if (recoveryInProgress || !activeInterval) return;
      recoveryIndex += 1;
      if (recoveryIndex > 6) {
        errors.push("WORLDKIT_EPISODE_EXCESSIVE_COLLISION_RECOVERY");
        return;
      }
      const recoveryKeys = recoveryIndex % 2 === 1 ? ["S", "D"] : ["S", "A"];
      releaseAll();
      pressKeys(recoveryKeys);
      recoveryInProgress = true;
      trace.push({
        plannedSeconds: activeInterval.startSeconds,
        actualSeconds: actualSeconds(),
        kind: "input-start",
        id: "runtime-recovery-" + String(recoveryIndex).padStart(2, "0"),
        rawKeys: recoveryKeys,
        source: "runtime-recovery",
        reason: "movement-stalled",
        interruptedIntervalId: activeInterval.id,
        positionMetersXYZ: subjectPosition(),
      });
      recoveryTimer = window.setTimeout(() => finishRecovery("recovery-duration-complete"), 1200);
    };
    sampleTelemetry();
    const telemetryMonitor = window.setInterval(sampleTelemetry, 1000 / 24);
    const recoveryMonitor = window.setInterval(() => {
      if (recoveryInProgress || !activeInterval ||
          !activeInterval.rawKeys.some((key) => movementKeys.has(key))) {
        lastSamplePosition = subjectPosition();
        stagnantSinceMs = null;
        return;
      }
      const position = subjectPosition();
      if (!position || !lastSamplePosition) {
        lastSamplePosition = position;
        stagnantSinceMs = null;
        return;
      }
      const displacement = Math.hypot(
        position[0] - lastSamplePosition[0],
        position[2] - lastSamplePosition[2],
      );
      lastSamplePosition = position;
      if (displacement >= 0.04) {
        stagnantSinceMs = null;
        return;
      }
      stagnantSinceMs ??= performance.now();
      if (performance.now() - stagnantSinceMs >= 1250) startRecovery();
    }, 250);
    await new Promise((resolve) => {
      for (const item of timeline) {
        window.setTimeout(() => {
          try {
            if (item.kind === "input-start") {
              cancelRecovery("planned-interval-transition");
              releaseAll();
              activeInterval = item.interval;
              pressKeys(item.interval.rawKeys);
              lastSamplePosition = subjectPosition();
              stagnantSinceMs = null;
              trace.push({ plannedSeconds: item.at, actualSeconds: actualSeconds(), kind: item.kind, id: item.interval.id, rawKeys: item.interval.rawKeys });
            } else if (item.kind === "input-end") {
              cancelRecovery("planned-interval-end");
              releaseAll();
              if (activeInterval?.id === item.interval.id) activeInterval = null;
              lastSamplePosition = subjectPosition();
              stagnantSinceMs = null;
              trace.push({ plannedSeconds: item.at, actualSeconds: actualSeconds(), kind: item.kind, id: item.interval.id });
            } else if (item.kind === "camera-reset") {
              dispatch("keydown", "R");
              window.setTimeout(() => dispatch("keyup", "R"), 80);
              trace.push({ plannedSeconds: item.at, actualSeconds: actualSeconds(), kind: item.kind, id: item.id, cameraKeys: ["R"], durationMs: 80 });
            } else if (item.kind === "camera") {
              const cameraKeys = [];
              if (item.event.yawDeltaRadians < -0.02) cameraKeys.push("ArrowLeft");
              if (item.event.yawDeltaRadians > 0.02) cameraKeys.push("ArrowRight");
              if (item.event.pitchDeltaRadians > 0.02) cameraKeys.push("ArrowUp");
              if (item.event.pitchDeltaRadians < -0.02) cameraKeys.push("ArrowDown");
              const durationMs = Math.max(100, Math.min(650,
                Math.max(Math.abs(item.event.yawDeltaRadians), Math.abs(item.event.pitchDeltaRadians)) * 1600));
              for (const key of cameraKeys) dispatch("keydown", key);
              window.setTimeout(() => {
                for (const key of cameraKeys) dispatch("keyup", key);
              }, durationMs);
              trace.push({ plannedSeconds: item.at, actualSeconds: actualSeconds(), kind: item.kind, id: item.event.id, cameraKeys, durationMs });
            } else {
              const snapshot = protocol.getSnapshot();
              trace.push({ plannedSeconds: item.at, actualSeconds: actualSeconds(), kind: item.kind, id: item.event.id, segmentId: item.event.segmentId, runtimeTick: snapshot.world.simulationTick });
            }
          } catch (error) {
            errors.push(String(error));
          }
        }, Math.max(0, item.at * 1000));
      }
      window.setTimeout(() => {
        if (recoveryTimer !== null) window.clearTimeout(recoveryTimer);
        window.clearInterval(telemetryMonitor);
        window.clearInterval(recoveryMonitor);
        recoveryInProgress = false;
        releaseAll();
        sampleTelemetry();
        resolve(undefined);
      }, 90_750);
    });
    if (errors.length > 0) throw new Error("WORLDKIT_EPISODE_TIMELINE_FAILED " + errors.join("; "));
    return {
      events: trace.sort((left, right) => left.actualSeconds - right.actualSeconds),
      telemetrySamples,
    };
  })()`.replace("__WORLDKIT_PLAYTHROUGH_PLAN__", planPayload);
  return page.evaluate<{ events: any[]; telemetrySamples: any[] }>(expression);
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const plan = JSON.parse(await readFile(options.planPath, "utf8"));
  const validation = validatePlaythroughPlan(plan, { sceneId: options.sceneId });
  if (!validation.ok) throw new Error(`PLAYTHROUGH_PLAN_INVALID\n${JSON.stringify(validation.diagnostics)}`);
  await mkdir(options.output, { recursive: true });
  const rawPath = path.join(options.output, "episode-raw.webm");
  const episodePath = path.join(options.output, "episode-90s.mp4");
  // WebGL canvas capture in headless Chromium can report a high simulation FPS
  // while submitting fewer than one compositor frame per second. Episode video
  // capture must run headed so captureStream receives real rendered frames.
  const browser = await launchChromiumWithSystemFallback({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, acceptDownloads: true });
  const traceEvents: any[] = [];
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("WebSocket connection")) consoleErrors.push(message.text().slice(0, 1000));
  });
  try {
    const url = new URL(options.origin);
    url.pathname = options.playPath;
    url.searchParams.set("authoring", "1");
    url.searchParams.set("world", options.sceneId);
    await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForFunction(() => window.__WORLDKIT__ !== undefined, undefined, { timeout: 120_000 });
    let readySnapshot: any;
    try {
      readySnapshot = await page.evaluate(async () => {
        if (!window.__WORLDKIT__) throw new Error("WORLDKIT_BROWSER_PROTOCOL_MISSING");
        return window.__WORLDKIT__.ready();
      });
    } catch (error) {
      const diagnostics = await page.evaluate(() => window.__WORLDKIT__?.getDiagnostics() ?? []);
      throw new Error(
        `WORLDKIT_EPISODE_RUNTIME_READY_FAILED ${error instanceof Error ? error.message : String(error)}\n` +
        JSON.stringify(diagnostics),
      );
    }
    process.stdout.write(`WORLDKIT_EPISODE_CAPTURE_READY tick=${readySnapshot.world.simulationTick}\n`);
    let resetApplied = false;
    try {
      if (readySnapshot.world.simulationTick > 0) {
        await Promise.race([
          page.evaluate(async () => {
            if (!window.__WORLDKIT__) throw new Error("WORLDKIT_BROWSER_PROTOCOL_MISSING");
            await window.__WORLDKIT__.reset();
          }),
          new Promise((_, reject) => setTimeout(
            () => reject(new Error("WORLDKIT_EPISODE_RESET_TIMEOUT")), 5_000,
          )),
        ]);
        resetApplied = true;
      }
    } catch (error) {
      // A freshly mounted play page is already at the authored spawn. Some
      // adapters intentionally reject a second reset before the first input;
      // that must not block capture or hide the fallback in the trace.
      console.warn(`WORLDKIT_EPISODE_RESET_FALLBACK ${error instanceof Error ? error.message : String(error)}`);
    }
    const initial = await page.evaluate(() => {
      if (!window.__WORLDKIT__) throw new Error("WORLDKIT_BROWSER_PROTOCOL_MISSING");
      window.__WORLDKIT__.resetCameraView();
      return window.__WORLDKIT__.getSnapshot();
    });
    await page.locator("canvas").first().evaluate((element) => (element as HTMLCanvasElement).focus());
    let resolveCapturedUpload: ((value: any) => void) | undefined;
    let rejectCapturedUpload: ((reason: unknown) => void) | undefined;
    const capturedUpload = new Promise<any>((resolve, reject) => {
      resolveCapturedUpload = resolve;
      rejectCapturedUpload = reject;
    });
    await page.route(/\/api\/recording-worlds\/[^/]+\/recordings$/, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      try {
        const bytes = route.request().postDataBuffer();
        if (!bytes || bytes.length === 0) throw new Error("CanvasRecorder uploaded an empty video.");
        const temporary = path.join(path.dirname(rawPath), `.${path.basename(rawPath)}.${process.pid}.tmp`);
        await writeFile(temporary, bytes);
        await rename(temporary, rawPath);
        const headers = route.request().headers();
        const metadata = {
          size: bytes.length,
          mimeType: headers["content-type"] ?? "application/octet-stream",
          durationMs: Number(headers["x-worldkit-recording-duration-ms"] ?? 0),
          captureTransport: "playwright-route-intercept",
        };
        resolveCapturedUpload?.(metadata);
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ recording: { id: `episode-${Date.now()}`, title: "90 秒 Episode 白膜录制" } }),
        });
      } catch (error) {
        rejectCapturedUpload?.(error);
        await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: String(error) }) });
      }
    });
    const recordButton = page.locator("#record-button");
    await recordButton.click();
    await page.locator("#record-label").filter({ hasText: "停止录制" }).waitFor({ timeout: 30_000 });
    const mimeType = "studio-canvas-recorder";
    process.stdout.write(`WORLDKIT_EPISODE_RECORDER_STARTED mime=${mimeType}\n`);
    const timelineCapture = await runBrowserTimeline(page, plan);
    traceEvents.push(...timelineCapture.events);
    for (const marker of traceEvents.filter((event) => event.kind === "prompt-marker")) {
      process.stdout.write(`WORLDKIT_EPISODE_PROMPT_MARKER ${marker.id} planned=${marker.plannedSeconds} actual=${marker.actualSeconds.toFixed(3)}\n`);
    }
    process.stdout.write("WORLDKIT_EPISODE_RECORDER_STOPPING\n");
    await recordButton.click();
    const stopped = { metadata: await capturedUpload };
    process.stdout.write(`WORLDKIT_EPISODE_RECORDER_DOWNLOADED bytes=${stopped.metadata.size}\n`);
    const rawMedia = await probeVideo(rawPath);
    const minimumSubmittedFrames = PLAYTHROUGH_DURATION_SECONDS * 20;
    if (rawMedia.frameCount < minimumSubmittedFrames) {
      throw new Error(
        `EPISODE_RAW_CAPTURE_CADENCE_FAILED submitted=${rawMedia.frameCount} ` +
        `minimum=${minimumSubmittedFrames} duration=${PLAYTHROUGH_DURATION_SECONDS}s`,
      );
    }
    process.stdout.write(`WORLDKIT_EPISODE_RAW_CADENCE_OK frames=${rawMedia.frameCount}\n`);
    const finished = await page.evaluate(() => {
      if (!window.__WORLDKIT__) throw new Error("WORLDKIT_BROWSER_PROTOCOL_MISSING");
      return window.__WORLDKIT__.getSnapshot();
    });
    const frameTelemetry = buildPlaythroughFrameTelemetry(timelineCapture.telemetrySamples, {
      captureFrameRate: PLAYTHROUGH_CAPTURE_FPS,
      frameCount: PLAYTHROUGH_FRAME_COUNT,
      widthPixels: 1280,
      heightPixels: 720,
    });
    await run("ffmpeg", [
      "-y", "-v", "error", "-i", rawPath,
      "-vf", `scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${PLAYTHROUGH_CAPTURE_FPS},tpad=stop_mode=clone:stop_duration=1,trim=duration=${PLAYTHROUGH_DURATION_SECONDS},setpts=N/(${PLAYTHROUGH_CAPTURE_FPS}*TB)`,
      "-an", "-frames:v", String(PLAYTHROUGH_FRAME_COUNT), "-fps_mode", "cfr",
      "-enc_time_base", `1/${PLAYTHROUGH_CAPTURE_FPS}`, "-video_track_timescale", "24000",
      "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", episodePath,
    ]);
    process.stdout.write("WORLDKIT_EPISODE_MASTER_CONFORMED\n");
    const episodeMedia = await probeVideo(episodePath);
    if (episodeMedia.width !== 1280 || episodeMedia.height !== 720 || episodeMedia.fps !== 24 || episodeMedia.frameCount !== 2160) {
      throw new Error(`EPISODE_MEDIA_CONFORMANCE_FAILED ${JSON.stringify(episodeMedia)}`);
    }
    const segments = [];
    for (let index = 0; index < 3; index += 1) {
      const segmentId = `segment-0${index}`;
      const segmentPath = path.join(options.output, `${segmentId}.mp4`);
      const firstFramePath = path.join(options.output, `${segmentId}-first-frame.png`);
      const startFrame = index * PLAYTHROUGH_SEGMENT_FRAME_COUNT;
      const endFrame = startFrame + PLAYTHROUGH_SEGMENT_FRAME_COUNT;
      await run("ffmpeg", [
        "-y", "-v", "error", "-i", episodePath,
        "-vf", `trim=start_frame=${startFrame}:end_frame=${endFrame},fps=24,setpts=N/(24*TB)`,
        "-an", "-frames:v", String(PLAYTHROUGH_SEGMENT_FRAME_COUNT), "-fps_mode", "cfr",
        "-enc_time_base", "1/24", "-video_track_timescale", "24000",
        "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", segmentPath,
      ]);
      await run("ffmpeg", ["-y", "-v", "error", "-i", segmentPath, "-frames:v", "1", firstFramePath]);
      const media = await probeVideo(segmentPath);
      if (media.width !== 1280 || media.height !== 720 || media.fps !== 24 || media.frameCount !== 720) {
        throw new Error(`SEGMENT_MEDIA_CONFORMANCE_FAILED ${segmentId} ${JSON.stringify(media)}`);
      }
      segments.push({ segmentId, startFrame, endFrameExclusive: endFrame, videoPath: path.basename(segmentPath), firstFramePath: path.basename(firstFramePath), media });
      process.stdout.write(`WORLDKIT_EPISODE_SEGMENT_READY ${segmentId} frames=${media.frameCount}\n`);
    }
    await writeJsonAtomic(path.join(options.output, "executed-playthrough-trace.json"), {
      kind: "worldkit-executed-playthrough-trace",
      schemaVersion: 2,
      sceneId: options.sceneId,
      planHash: sha256Canonical(plan),
      recordedAt: new Date().toISOString(),
      recorder: { mimeType, ...stopped.metadata },
      rawMedia,
      initial: {
        runtimeSessionId: initial.runtimeSessionId,
        worldSessionId: initial.worldSessionId,
        simulationTick: initial.world.simulationTick,
        resetApplied,
        readyWorldSessionId: readySnapshot.worldSessionId,
      },
      finished: { runtimeSessionId: finished.runtimeSessionId, worldSessionId: finished.worldSessionId, simulationTick: finished.world.simulationTick },
      events: traceEvents,
      frameTelemetry,
      consoleErrors,
      episodeMedia,
      segments,
    });
    process.stdout.write(`WORLDKIT_EPISODE_CAPTURE_OK ${options.sceneId} frames=${episodeMedia.frameCount} segments=${segments.length}\n`);
  } finally {
    await browser.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
