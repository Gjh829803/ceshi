import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

import type { Page } from "playwright";

import {
  PLAYTHROUGH_CAPTURE_FPS,
  PLAYTHROUGH_CAMERA_RESET_WINDOWS,
} from "./playthrough-dataset.mjs";

export interface DeterministicPlaythroughCaptureOptions {
  readonly page: Page;
  readonly plan: any;
  readonly outputPath: string;
  readonly executionStartSeconds?: number;
  readonly frameCount: number;
  readonly firstFramePath?: string;
  readonly progressLabel?: string;
  readonly captureStartState?: Readonly<{
    positionMetersXYZ: readonly [number, number, number];
    facingYawRadians: number;
  }>;
}

export interface DeterministicPlaythroughCaptureResult {
  readonly captureMode: "deterministic-fixed-step-real-rendered-frames";
  readonly captureFrameRate: 24;
  readonly frameCount: number;
  readonly telemetrySamples: any[];
  readonly events: any[];
  readonly finished: any;
}

export function cameraKeysForEvent(event: {
  readonly yawDeltaRadians: number;
  readonly pitchDeltaRadians: number;
}): string[] {
  const keys: string[] = [];
  if (event.yawDeltaRadians < -0.02) keys.push("J");
  if (event.yawDeltaRadians > 0.02) keys.push("L");
  if (event.pitchDeltaRadians > 0.02) keys.push("I");
  if (event.pitchDeltaRadians < -0.02) keys.push("K");
  return keys;
}

export function cameraGestureDurationMs(event: {
  readonly yawDeltaRadians: number;
  readonly pitchDeltaRadians: number;
}): number {
  return Math.max(800, Math.min(
    1_800,
    Math.max(
      Math.abs(event.yawDeltaRadians),
      Math.abs(event.pitchDeltaRadians),
    ) * 3_000,
  ));
}

export function locomotionRequiresJumpCameraSuppression(
  locomotion: any,
): boolean {
  return locomotion === null || locomotion === undefined ||
    locomotion.mobilityMode === "airborne" ||
    locomotion.mode === "airborne" ||
    locomotion.supportMode === "unsupported" ||
    locomotion.verticalPhase === "rising" ||
    locomotion.verticalPhase === "falling";
}

async function writePipeFrame(
  stream: NodeJS.WritableStream,
  bytes: Buffer,
): Promise<void> {
  if (stream.write(bytes)) return;
  await new Promise<void>((resolve, reject) => {
    const onDrain = () => {
      stream.removeListener("error", onError);
      resolve();
    };
    const onError = (error: Error) => {
      stream.removeListener("drain", onDrain);
      reject(error);
    };
    stream.once("drain", onDrain);
    stream.once("error", onError);
  });
}

function activeIntervalAt(plan: any, executionSeconds: number): any | null {
  return plan.inputIntervals.find((interval: any) =>
    interval.startSeconds <= executionSeconds + 1e-9 &&
    interval.endSeconds > executionSeconds + 1e-9) ?? null;
}

function traceEvents(
  plan: any,
  executionStartSeconds: number,
  executionEndSeconds: number,
  cameraExecutionById: ReadonlyMap<string, Readonly<{
    actualSeconds: number;
    status: "applied" | "suppressed-during-jump";
  }>>,
): any[] {
  const inputEvents = plan.inputIntervals.flatMap((interval: any) => [
    {
      plannedSeconds: interval.startSeconds,
      actualSeconds: interval.startSeconds,
      kind: "input-start",
      id: interval.id,
      rawKeys: interval.rawKeys,
      source: "planner-fixed-step",
      purpose: interval.purpose,
    },
    {
      plannedSeconds: interval.endSeconds,
      actualSeconds: interval.endSeconds,
      kind: "input-end",
      id: interval.id,
      source: "planner-fixed-step",
    },
  ]).filter((event: any) =>
    event.actualSeconds >= executionStartSeconds &&
    event.actualSeconds < executionEndSeconds);
  const cameraEvents = plan.cameraEvents
    .filter((event: any) => event.atSeconds >= executionStartSeconds &&
      event.atSeconds < executionEndSeconds)
    .map((event: any) => {
      const execution = cameraExecutionById.get(event.id);
      const suppressed = execution?.status === "suppressed-during-jump";
      return {
        plannedSeconds: event.atSeconds,
        actualSeconds: execution?.actualSeconds ?? event.atSeconds,
        kind: suppressed ? "camera-suppressed" : "camera",
        id: event.id,
        source: "planner-fixed-step",
        cameraKeys: suppressed ? [] : cameraKeysForEvent(event),
        durationMs: suppressed ? 0 : cameraGestureDurationMs(event),
        yawDeltaRadians: suppressed ? 0 : event.yawDeltaRadians,
        pitchDeltaRadians: suppressed ? 0 : event.pitchDeltaRadians,
        ...(suppressed ? { reason: "explicit-jump-not-landed" } : {}),
        purpose: event.purpose,
      };
    });
  const resetEvents = PLAYTHROUGH_CAMERA_RESET_WINDOWS
    .filter(({ startSeconds }) => startSeconds >= executionStartSeconds &&
      startSeconds < executionEndSeconds)
    .map(({ segmentIndex, startSeconds }) => ({
      plannedSeconds: startSeconds,
      actualSeconds: startSeconds,
      kind: "camera-reset",
      id: `segment-camera-reset-${String(segmentIndex + 1).padStart(2, "0")}`,
      source: "host-reset-buffer",
      cameraKeys: ["R"],
      durationMs: 80,
    }));
  return [...inputEvents, ...cameraEvents, ...resetEvents]
    .sort((left, right) => left.actualSeconds - right.actualSeconds ||
      String(left.id).localeCompare(String(right.id)));
}

export async function captureDeterministicPlaythrough(
  options: DeterministicPlaythroughCaptureOptions,
): Promise<DeterministicPlaythroughCaptureResult> {
  const executionStartSeconds = options.executionStartSeconds ?? 0;
  const executionEndSeconds = executionStartSeconds +
    options.frameCount / PLAYTHROUGH_CAPTURE_FPS;
  const encoder = spawn("ffmpeg", [
    "-y", "-v", "error", "-f", "image2pipe", "-vcodec", "mjpeg",
    "-framerate", String(PLAYTHROUGH_CAPTURE_FPS), "-i", "pipe:0",
    "-vf", "scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1",
    "-an", "-frames:v", String(options.frameCount), "-fps_mode", "cfr",
    "-enc_time_base", `1/${PLAYTHROUGH_CAPTURE_FPS}`,
    "-video_track_timescale", "24000", "-c:v", "libx264",
    "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", options.outputPath,
  ], { stdio: ["pipe", "ignore", "pipe"] });
  let encoderError = "";
  encoder.stderr.on("data", (chunk) => { encoderError += String(chunk); });
  encoder.stdin.on("error", (error) => { encoderError += String(error); });
  const encoderClosed = new Promise<void>((resolve, reject) => {
    encoder.once("error", reject);
    encoder.once("close", (code) => code === 0
      ? resolve()
      : reject(new Error(encoderError || `ffmpeg exited ${code}`)));
  });

  let snapshot = await options.page.evaluate(async (captureStartState) => {
    const protocol = window.__WORLDKIT__;
    if (!protocol) throw new Error("WORLDKIT_BROWSER_PROTOCOL_MISSING");
    let value = await protocol.reset();
    protocol.setPaused(true);
    if (captureStartState) {
      if (typeof protocol.relocateControlledSubjectForCapture !== "function") {
        throw new Error("WORLDKIT_CAPTURE_START_RELOCATION_UNAVAILABLE");
      }
      value = protocol.relocateControlledSubjectForCapture(captureStartState);
    }
    protocol.resetCameraView();
    return value;
  }, options.captureStartState ?? null);
  const cameraEvents = [...options.plan.cameraEvents].sort((left, right) =>
    left.atSeconds - right.atSeconds);
  const resetSeconds = PLAYTHROUGH_CAMERA_RESET_WINDOWS.map(({ startSeconds }) =>
    startSeconds);
  let cameraIndex = cameraEvents.findIndex((event) =>
    event.atSeconds >= executionStartSeconds);
  if (cameraIndex < 0) cameraIndex = cameraEvents.length;
  let resetIndex = 0;
  const totalEndFrame = Math.round(executionEndSeconds * PLAYTHROUGH_CAPTURE_FPS);
  const captureStartFrame = Math.round(
    executionStartSeconds * PLAYTHROUGH_CAPTURE_FPS,
  );
  const telemetrySamples: any[] = [];
  const cameraExecutionById = new Map<string, Readonly<{
    actualSeconds: number;
    status: "applied" | "suppressed-during-jump";
  }>>();
  let explicitJumpNotLanded = false;
  let groundedFramesAfterJump = 0;

  try {
    for (let globalFrameIndex = captureStartFrame;
      globalFrameIndex < totalEndFrame;
      globalFrameIndex += 1) {
      const executionSeconds = globalFrameIndex / PLAYTHROUGH_CAPTURE_FPS;
      let submittedJumpThisFrame = false;
      if (globalFrameIndex > captureStartFrame) {
        const previousSeconds = (globalFrameIndex - 1) /
          PLAYTHROUGH_CAPTURE_FPS;
        const previousInterval = activeIntervalAt(
          options.plan,
          previousSeconds,
        );
        const actions = (previousInterval?.semanticActions ?? []).filter(
          (action: string) => action !== "jump" ||
            previousSeconds <= previousInterval.startSeconds + 1e-9,
        );
        submittedJumpThisFrame = actions.includes("jump");
        if (submittedJumpThisFrame) {
          explicitJumpNotLanded = true;
          groundedFramesAfterJump = 0;
        }
        const ticks = globalFrameIndex % 2 === 0 ? 3 : 2;
        snapshot = await options.page.evaluate(async ({ actions, ticks }) => {
          const protocol = window.__WORLDKIT__;
          if (!protocol) throw new Error("WORLDKIT_BROWSER_PROTOCOL_MISSING");
          return protocol.runFixedInput([{ actions, ticks }]);
        }, { actions, ticks });
      }
      if (explicitJumpNotLanded && !submittedJumpThisFrame) {
        const runtimeCamera = snapshot?.view?.camera;
        const entityId = runtimeCamera?.mode === "tracking"
          ? runtimeCamera.targetEntityId ?? options.plan.controlledEntityId
          : options.plan.controlledEntityId;
        const subjectState = snapshot?.world?.subjectStatesByEntityId?.[entityId];
        const locomotionCapability = Object.values(
          subjectState?.capabilityStatesById ?? {},
        ).find((candidate: any) =>
          candidate?.kind === "locomotion-capability-state-v2" ||
          candidate?.kind === "locomotion-capability-state");
        const locomotion = (locomotionCapability as any)?.locomotion ??
          locomotionCapability ?? null;
        const airborne = locomotionRequiresJumpCameraSuppression(locomotion);
        groundedFramesAfterJump = airborne ? 0 : groundedFramesAfterJump + 1;
        // Require a quarter second of committed grounded frames before manual
        // camera input can resume. A stale/early provider support bit therefore
        // cannot produce the large post-jump camera snap seen in production.
        if (groundedFramesAfterJump >= 6) explicitJumpNotLanded = false;
      }
      while (resetIndex < resetSeconds.length &&
          resetSeconds[resetIndex]! <= executionSeconds + 1e-9) {
        await options.page.evaluate(() => window.__WORLDKIT__?.resetCameraView());
        resetIndex += 1;
      }
      while (cameraIndex < cameraEvents.length &&
          cameraEvents[cameraIndex]!.atSeconds <= executionSeconds + 1e-9) {
        const event = cameraEvents[cameraIndex]!;
        if (explicitJumpNotLanded) {
          cameraExecutionById.set(event.id, {
            actualSeconds: executionSeconds,
            status: "suppressed-during-jump",
          });
        } else {
          await options.page.evaluate(({ yawDeltaRadians, pitchDeltaRadians }) =>
            window.__WORLDKIT__?.adjustCameraView({
              yawDeltaRadians,
              pitchDeltaRadians,
              zoomDeltaMeters: 0,
            }), event);
          cameraExecutionById.set(event.id, {
            actualSeconds: executionSeconds,
            status: "applied",
          });
        }
        cameraIndex += 1;
      }
      if (globalFrameIndex < captureStartFrame) continue;
      const captureFrameIndex = globalFrameIndex - captureStartFrame;
      const captured = await options.page.evaluate(async ({
        expectedTick,
        captureOpeningFrame,
      }) => {
        const protocol = window.__WORLDKIT__;
        if (!protocol) throw new Error("WORLDKIT_BROWSER_PROTOCOL_MISSING");
        await protocol.waitForRenderReady(expectedTick);
        const canvas = document.querySelector("canvas");
        if (!(canvas instanceof HTMLCanvasElement)) {
          throw new Error("WORLDKIT_CAPTURE_CANVAS_MISSING");
        }
        return {
          // PNG compression inside the Browser dominated capture time for block-
          // dense worlds. The video encoder only needs a genuine rendered frame,
          // not a lossless intermediate, so use a high-quality JPEG frame pipe.
          // Keep the separately published opening frame lossless and canonical.
          imageDataUrl: canvas.toDataURL("image/jpeg", 0.94),
          openingImageDataUrl: captureOpeningFrame
            ? protocol.captureScreenshot()
            : null,
          snapshot: protocol.getSnapshot(),
        };
      }, {
        expectedTick: snapshot.world.simulationTick,
        captureOpeningFrame: captureFrameIndex === 0 &&
          options.firstFramePath !== undefined,
      });
      const comma = captured.imageDataUrl.indexOf(",");
      if (comma < 0) throw new Error("PLAYTHROUGH_CAPTURE_FRAME_INVALID");
      const frameBytes = Buffer.from(
        captured.imageDataUrl.slice(comma + 1),
        "base64",
      );
      if (captureFrameIndex === 0 && options.firstFramePath) {
        const openingComma = captured.openingImageDataUrl?.indexOf(",") ?? -1;
        if (openingComma < 0) {
          throw new Error("PLAYTHROUGH_CAPTURE_OPENING_FRAME_INVALID");
        }
        await writeFile(
          options.firstFramePath,
          Buffer.from(
            captured.openingImageDataUrl!.slice(openingComma + 1),
            "base64",
          ),
        );
      }
      await writePipeFrame(encoder.stdin, frameBytes);
      const runtimeSnapshot = captured.snapshot;
      const camera = runtimeSnapshot.view.camera;
      if (camera.mode !== "tracking") {
        throw new Error("PLAYTHROUGH_CAPTURE_CAMERA_NOT_TRACKING");
      }
      const entityId = camera.targetEntityId ?? options.plan.controlledEntityId;
      const subjectState = runtimeSnapshot.world.subjectStatesByEntityId?.[entityId];
      const entityState = subjectState?.entityState;
      if (!entityState) throw new Error("PLAYTHROUGH_CAPTURE_SUBJECT_STATE_MISSING");
      const locomotionCapability = Object.values(
        subjectState?.capabilityStatesById ?? {},
      ).find((candidate: any) =>
        candidate?.kind === "locomotion-capability-state-v2" ||
        candidate?.kind === "locomotion-capability-state");
      const locomotion = (locomotionCapability as any)?.locomotion ??
        locomotionCapability ?? null;
      const cameraPosition = camera.actualPositionMetersXYZ ??
        camera.positionMetersXYZ;
      const cameraTarget = camera.actualTargetPositionMetersXYZ ??
        camera.desiredTargetPositionMetersXYZ ?? entityState.positionMetersXYZ;
      telemetrySamples.push({
        actualSeconds: executionSeconds,
        simulationTick: runtimeSnapshot.world.simulationTick,
        worldSessionId: runtimeSnapshot.worldSessionId,
        activeKeys: activeIntervalAt(options.plan, executionSeconds)?.rawKeys ?? [],
        subject: {
          entityId,
          positionMetersXYZ: [...entityState.positionMetersXYZ],
          rotationQuaternionXYZW: [...entityState.rotationQuaternionXYZW],
          velocityMetersPerSecondXYZ: [
            ...(entityState.linearVelocityMetersPerSecondXYZ ?? [0, 0, 0]),
          ],
          locomotion: locomotion === null ? null : {
            movementMedium: locomotion.movementMedium ?? null,
            mobilityMode: locomotion.mobilityMode ?? locomotion.mode ?? null,
            supportMode: locomotion.supportMode ?? null,
            verticalPhase: locomotion.verticalPhase ?? null,
          },
        },
        camera: {
          id: camera.id,
          targetEntityId: entityId,
          activeCameraProfileRef: camera.activeCameraProfileRef,
          activeCameraRigRef: camera.activeCameraRigRef,
          positionMetersXYZ: [...cameraPosition],
          targetPositionMetersXYZ: [...cameraTarget],
          verticalFovDegrees: camera.finalFovDegrees ??
            camera.resolvedParameters?.baseFovDegrees ?? 56,
          nearClipMeters: Number.isFinite(camera.nearClipMeters)
            ? camera.nearClipMeters
            : 0.05,
          farClipMeters: Number.isFinite(camera.farClipMeters)
            ? camera.farClipMeters
            : 10_000,
        },
      });
      if ((captureFrameIndex + 1) % 240 === 0 ||
          captureFrameIndex + 1 === options.frameCount) {
        process.stdout.write(
          `${options.progressLabel ?? "WORLDKIT_PLAYTHROUGH_CAPTURE_PROGRESS"} ` +
          `${captureFrameIndex + 1}/${options.frameCount}\n`,
        );
      }
    }
    encoder.stdin.end();
    await encoderClosed;
  } catch (error) {
    encoder.stdin.destroy();
    encoder.kill("SIGTERM");
    await encoderClosed.catch(() => undefined);
    throw error;
  }
  const finished = await options.page.evaluate(() =>
    window.__WORLDKIT__?.getSnapshot());
  return {
    captureMode: "deterministic-fixed-step-real-rendered-frames",
    captureFrameRate: PLAYTHROUGH_CAPTURE_FPS,
    frameCount: options.frameCount,
    telemetrySamples,
    events: traceEvents(
      options.plan,
      executionStartSeconds,
      executionEndSeconds,
      cameraExecutionById,
    ),
    finished,
  };
}
