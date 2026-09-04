import { worldPackageRefFromRootHashV1 } from "@whitebox-world/world-identity";

import type { Sha256HashV1 } from "@whitebox-world/protocol";

import { access } from "node:fs/promises";
import path from "node:path";

import {
  compileSimulationTakeV1,
  SimulationTakeValidationErrorV1,
  type CompiledSimulationTakeV1,
} from "@whitebox-world/control-capture";
import type {
  GameplayCommandReceiptV1,
  GameplayCommandV1,
  WorldStateSnapshotV1,
} from "@whitebox-world/gameplay-contracts";
import { sha256Bytes } from "@whitebox-world/protocol";
import type {
  CameraViewInputV1,
  ControlCaptureCapabilitiesV1,
  ControlCaptureRequestV1,
  FixedInputV1,
  RenderReadyReceiptV1,
  RuntimeActivityReceiptV1,
  RuntimeActivityRequestV1,
  RuntimeControlCaptureFrameV1,
  WorldRuntimeSnapshotV4,
  WorldSessionEventV1,
} from "@whitebox-world/runtime-contracts";
import {
  WORLDKIT_WORLD_SESSION_EVENT_PAGE_MAXIMUM_COUNT,
} from "@whitebox-world/runtime-contracts";
import {
  verifyWorldPackageDirectoryV1,
} from "@whitebox-world/world-package";
import type { Browser, Page } from "playwright";

import {
  createControlCaptureBundleWriterV1,
  inspectControlCaptureBundleV1,
  validateControlCaptureBundleV1,
  type ControlCaptureBundleWriterV1,
  type ControlCaptureBundleFrameInputV1,
} from "./control-capture-bundle";
import {
  runCompiledSimulationTakeV1,
  type SimulationTakeBrowserDriverV1,
} from "./simulation-take-runner";
import { launchChromiumWithSystemFallback } from "./playwright-browser-launch";
import {
  cliFailure,
  loadWorldkitRoutePipeline,
  readWorldkitInput,
  type WorldkitFailure,
  type WorldkitRoutePipelineSuccess,
} from "./worldkit-pipeline";
import {
  createTrustedCanonicalWorldPackageV1,
} from "./trusted-world-package";
import { startWorldkitServer, type WorldkitServerHandle } from "./worldkit-server";

interface SimulationTakeWorldPackageIdentityV1 {
  readonly worldPackageRef: string;
  readonly worldPackageRootHash: Sha256HashV1;
  readonly normalizedWorldIrHash: Sha256HashV1;
  readonly worldBuildIdentityHash: Sha256HashV1;
}

export interface RunSimulationTakeFileOptionsV1 {
  readonly worldPath: string;
  readonly outputPath: string;
  readonly widthPixels: number;
  readonly heightPixels: number;
  readonly port?: number;
}

function diagnosticForTake(error: unknown): WorldkitFailure {
  if (error instanceof SimulationTakeValidationErrorV1) {
    return {
      ok: false,
      exitCode: 2,
      diagnostics: error.diagnostics.map((diagnostic) => ({
        severity: "error" as const,
        code: diagnostic.code,
        instancePath: diagnostic.path,
        message: diagnostic.message,
      })),
    };
  }
  return cliFailure(
    "TAKE_JSON_INVALID",
    "Simulation Take input must be valid JSON.",
  );
}

async function loadCompiledTakeFile(
  inputPath: string,
): Promise<
  | { readonly ok: true; readonly compiledTake: CompiledSimulationTakeV1; readonly absoluteInputPath: string }
  | WorldkitFailure
> {
  const input = await readWorldkitInput(inputPath);
  if (!input.ok) return input;
  try {
    return {
      ok: true,
      compiledTake: compileSimulationTakeV1(JSON.parse(input.sourceText) as unknown),
      absoluteInputPath: input.absoluteInputPath,
    };
  } catch (error) {
    return diagnosticForTake(error);
  }
}

export async function createSimulationTakeWorldPackageIdentityV1(
  pipeline: WorldkitRoutePipelineSuccess,
): Promise<SimulationTakeWorldPackageIdentityV1> {
  const directory = await createTrustedCanonicalWorldPackageV1(pipeline);
  const verified = verifyWorldPackageDirectoryV1(directory);
  if (verified.kind !== "canonical-execution-plan") {
    throw new Error("SIMULATION_TAKE_CANONICAL_WORLD_PACKAGE_REQUIRED");
  }
  return {
    worldPackageRef: worldPackageRefFromRootHashV1(
      verified.receipt.worldPackageRootHash,
    ),
    worldPackageRootHash: verified.receipt.worldPackageRootHash,
    normalizedWorldIrHash: verified.receipt.manifest.sceneSource.normalizedWorldIrHash,
    worldBuildIdentityHash: verified.receipt.worldBuildIdentityHash,
  };
}

export async function validateSimulationTakeFileV1(inputPath: string) {
  const loaded = await loadCompiledTakeFile(inputPath);
  if (!loaded.ok) return loaded;
  return {
    ok: true as const,
    exitCode: 0 as const,
    kind: "worldkit-simulation-take-validation" as const,
    schemaVersion: 1 as const,
    diagnostics: [] as const,
    takeId: loaded.compiledTake.take.id,
    takeHash: loaded.compiledTake.takeHash,
    captureFrameCount: loaded.compiledTake.captureSchedulePlan.entries.length,
    firstCaptureTick:
      loaded.compiledTake.captureSchedulePlan.entries[0]?.simulationTick,
    lastCaptureTick:
      loaded.compiledTake.captureSchedulePlan.entries.at(-1)?.simulationTick,
  };
}

export async function inspectSimulationTakeFileV1(inputPath: string) {
  const loaded = await loadCompiledTakeFile(inputPath);
  if (!loaded.ok) return loaded;
  const { take, takeHash, captureSchedulePlan } = loaded.compiledTake;
  return {
    ok: true as const,
    exitCode: 0 as const,
    kind: "worldkit-simulation-take-inspection" as const,
    schemaVersion: 1 as const,
    diagnostics: [] as const,
    takeId: take.id,
    takeHash,
    worldPackageRef: take.worldPackageRef,
    worldPackageRootHash: take.worldPackageRootHash,
    worldBuildIdentityHash: take.worldBuildIdentityHash,
    simulationTickRate: take.simulationTickRate,
    tickRange: {
      startTick: take.startTick,
      endTickExclusive: take.endTickExclusive,
    },
    controllerIds: take.controllers.map(({ id }) => id),
    trackIds: take.tracks.map(({ id }) => id),
    captureFrameCount: captureSchedulePlan.entries.length,
    captureTicks: captureSchedulePlan.entries.map(({ simulationTick }) => simulationTick),
  };
}

class PlaywrightSimulationTakeDriverV1 implements SimulationTakeBrowserDriverV1 {
  constructor(private readonly page: Page) {}

  getControlCaptureCapabilities(): Promise<ControlCaptureCapabilitiesV1> {
    return this.page.evaluate(() => {
      if (window.__WORLDKIT__ === undefined) throw new Error("WORLDKIT_BROWSER_PROTOCOL_MISSING");
      return window.__WORLDKIT__.getControlCaptureCapabilities();
    });
  }

  setPaused(paused: boolean): Promise<WorldRuntimeSnapshotV4> {
    return this.page.evaluate((value) => {
      if (window.__WORLDKIT__ === undefined) throw new Error("WORLDKIT_BROWSER_PROTOCOL_MISSING");
      return window.__WORLDKIT__.setPaused(value);
    }, paused);
  }

  reset(): Promise<WorldRuntimeSnapshotV4> {
    return this.page.evaluate(() => {
      if (window.__WORLDKIT__ === undefined) throw new Error("WORLDKIT_BROWSER_PROTOCOL_MISSING");
      return window.__WORLDKIT__.reset();
    });
  }

  acquireRuntimeActivity(
    request: RuntimeActivityRequestV1,
  ): Promise<RuntimeActivityReceiptV1> {
    return this.page.evaluate((value) => {
      if (window.__WORLDKIT__ === undefined) throw new Error("WORLDKIT_BROWSER_PROTOCOL_MISSING");
      return window.__WORLDKIT__.acquireRuntimeActivity(value);
    }, request);
  }

  releaseRuntimeActivity(
    request: RuntimeActivityRequestV1,
  ): Promise<RuntimeActivityReceiptV1> {
    return this.page.evaluate((value) => {
      if (window.__WORLDKIT__ === undefined) throw new Error("WORLDKIT_BROWSER_PROTOCOL_MISSING");
      return window.__WORLDKIT__.releaseRuntimeActivity(value);
    }, request);
  }

  executeGameplayCommand(
    command: GameplayCommandV1,
  ): Promise<GameplayCommandReceiptV1> {
    return this.page.evaluate(async (value) => {
      if (window.__WORLDKIT__ === undefined) throw new Error("WORLDKIT_BROWSER_PROTOCOL_MISSING");
      return window.__WORLDKIT__.executeGameplayCommand(value);
    }, command);
  }

  runFixedInput(steps: readonly FixedInputV1[]): Promise<WorldRuntimeSnapshotV4> {
    return this.page.evaluate(async (value) => {
      if (window.__WORLDKIT__ === undefined) throw new Error("WORLDKIT_BROWSER_PROTOCOL_MISSING");
      return window.__WORLDKIT__.runFixedInput(value);
    }, steps);
  }

  adjustCameraView(input: CameraViewInputV1): Promise<WorldRuntimeSnapshotV4> {
    return this.page.evaluate((value) => {
      if (window.__WORLDKIT__?.adjustCameraView === undefined) {
        throw new Error("WORLDKIT_CAMERA_VIEW_PROTOCOL_MISSING");
      }
      return window.__WORLDKIT__.adjustCameraView(value);
    }, input);
  }

  waitForSimulationTick(expectedSimulationTick: number): Promise<WorldRuntimeSnapshotV4> {
    return this.page.evaluate(async (value) => {
      if (window.__WORLDKIT__ === undefined) throw new Error("WORLDKIT_BROWSER_PROTOCOL_MISSING");
      return window.__WORLDKIT__.waitForSimulationTick(value);
    }, expectedSimulationTick);
  }

  waitForRenderReady(expectedSimulationTick: number): Promise<RenderReadyReceiptV1> {
    return this.page.evaluate(async (value) => {
      if (window.__WORLDKIT__ === undefined) throw new Error("WORLDKIT_BROWSER_PROTOCOL_MISSING");
      return window.__WORLDKIT__.waitForRenderReady(value);
    }, expectedSimulationTick);
  }

  captureControlFrame(request: ControlCaptureRequestV1): Promise<RuntimeControlCaptureFrameV1> {
    return this.page.evaluate(async (value) => {
      if (window.__WORLDKIT__ === undefined) throw new Error("WORLDKIT_BROWSER_PROTOCOL_MISSING");
      return window.__WORLDKIT__.captureControlFrame(value);
    }, request);
  }
}

function decodeRuntimeFrame(
  frame: RuntimeControlCaptureFrameV1,
  worldState: WorldStateSnapshotV1,
): ControlCaptureBundleFrameInputV1 {
  const passes = Object.fromEntries(Object.entries(frame.passesById).map(([passId, payload]) => {
    const bytes = new Uint8Array(Buffer.from(payload.bytesBase64, "base64"));
    if (
      bytes.byteLength !== payload.byteLength ||
      sha256Bytes(bytes) !== payload.contentHash
    ) {
      throw new Error(`CONTROL_CAPTURE_PASS_INTEGRITY_INVALID: ${passId}`);
    }
    return [passId, { passId: payload.passId, bytes }];
  }));
  return {
    runtimeSessionId: frame.runtimeSessionId,
    captureFrameIndex: frame.captureFrameIndex,
    simulationTick: frame.simulationTick,
    renderFrameIndex: frame.renderFrameIndex,
    renderReadyReceiptId: frame.renderReadyReceiptId,
    widthPixels: frame.widthPixels,
    heightPixels: frame.heightPixels,
    camera: frame.camera,
    snapshot: frame.snapshot,
    worldState,
    passesById: passes,
  };
}

async function outputPathExists(outputPath: string): Promise<boolean> {
  try {
    await access(outputPath);
    return true;
  } catch {
    return false;
  }
}

export async function runSimulationTakeFileV1(
  inputPath: string,
  options: RunSimulationTakeFileOptionsV1,
) {
  const loadedTake = await loadCompiledTakeFile(inputPath);
  if (!loadedTake.ok) return loadedTake;
  const pipeline = await loadWorldkitRoutePipeline(options.worldPath);
  if (!pipeline.ok) return pipeline;
  const outputDirectory = path.resolve(options.outputPath);
  if (await outputPathExists(outputDirectory)) {
    return cliFailure(
      "CAPTURE_OUTPUT_EXISTS",
      "Control Capture output directory already exists.",
    );
  }
  const worldPackageIdentity =
    await createSimulationTakeWorldPackageIdentityV1(pipeline);
  if (
    worldPackageIdentity.worldPackageRef !==
      loadedTake.compiledTake.take.worldPackageRef ||
    worldPackageIdentity.worldPackageRootHash !==
    loadedTake.compiledTake.take.worldPackageRootHash
  ) {
    return cliFailure(
      "TAKE_WORLD_PACKAGE_MISMATCH",
      "Simulation Take does not match the compiled world identity.",
      {
        expectedWorldPackageRef: loadedTake.compiledTake.take.worldPackageRef,
        actualWorldPackageRef: worldPackageIdentity.worldPackageRef,
        expectedWorldPackageRootHash: loadedTake.compiledTake.take.worldPackageRootHash,
        actualWorldPackageRootHash: worldPackageIdentity.worldPackageRootHash,
      },
    );
  }

  let server: WorldkitServerHandle | undefined;
  let browser: Browser | undefined;
  let writer: ControlCaptureBundleWriterV1 | undefined;
  let previousCapturedEventSequence: number | undefined;
  try {
    server = await startWorldkitServer({
      source: {
        kind: "canonical-file",
        inputPath: pipeline.absoluteInputPath,
      },
      ...(options.port === undefined ? {} : { port: options.port }),
    });
    browser = await launchChromiumWithSystemFallback();
    const page = await browser.newPage({
      viewport: { width: Math.max(640, options.widthPixels), height: Math.max(360, options.heightPixels) },
      deviceScaleFactor: 1,
    });
    await page.goto(server.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForFunction(() => window.__WORLDKIT__ !== undefined, undefined, {
      timeout: 30_000,
    });
    await page.evaluate(async () => {
      if (window.__WORLDKIT__ === undefined) throw new Error("WORLDKIT_BROWSER_PROTOCOL_MISSING");
      await window.__WORLDKIT__.ready();
    });

    const run = await runCompiledSimulationTakeV1({
      compiledTake: loadedTake.compiledTake,
      driver: new PlaywrightSimulationTakeDriverV1(page),
      widthPixels: options.widthPixels,
      heightPixels: options.heightPixels,
      onFrame: async (frame) => {
        if (writer === undefined) {
          writer = await createControlCaptureBundleWriterV1({
            outputDirectory,
            bundleId: `${loadedTake.compiledTake.take.id}-capture`,
            compiledTake: loadedTake.compiledTake,
            worldPackageIdentity,
            runtimeSessionId: frame.runtimeSessionId,
            worldSessionId: frame.snapshot.worldSessionId,
            semanticClasses: frame.semanticClasses,
            instances: frame.instances,
          });
        }
        const worldState = await page.evaluate((worldStateRef) => {
          if (window.__WORLDKIT__ === undefined) {
            throw new Error("WORLDKIT_BROWSER_PROTOCOL_MISSING");
          }
          return window.__WORLDKIT__.getWorldStateSnapshot({ worldStateRef });
        }, frame.snapshot.world.worldStateRef);
        if (previousCapturedEventSequence !== undefined) {
          const worldSessionEvents = await page.evaluate(({ afterEventSequence, maximumEventCount }) => {
            if (window.__WORLDKIT__ === undefined) {
              throw new Error("WORLDKIT_BROWSER_PROTOCOL_MISSING");
            }
            const events: WorldSessionEventV1[] = [];
            let cursor = afterEventSequence;
            while (true) {
              const page = window.__WORLDKIT__.getWorldSessionEvents({
                afterEventSequence: cursor,
                maximumEventCount,
              });
              events.push(...page.events);
              if (!page.hasMore) return events;
              cursor = page.nextAfterEventSequence;
            }
          }, {
            afterEventSequence: previousCapturedEventSequence,
            maximumEventCount:
              WORLDKIT_WORLD_SESSION_EVENT_PAGE_MAXIMUM_COUNT,
          });
          writer.appendRuntimeHostFixedTickJournal({
            captureFrameIndexAfter: frame.captureFrameIndex,
            afterEventSequenceExclusive: previousCapturedEventSequence,
            worldSessionEvents,
            worldStateAfter: worldState,
            gameplayInspectionAfter: frame.snapshot.world.gameplayInspection,
          });
        }
        await writer.appendFrame(decodeRuntimeFrame(frame, worldState));
        previousCapturedEventSequence = worldState.lastEventSequence;
      },
    });
    if (writer === undefined) throw new Error("SIMULATION_TAKE_CAPTURE_SCHEDULE_EMPTY");
    const finalized = await writer.finalize();
    const validation = await validateControlCaptureBundleV1(finalized.outputDirectory);
    if (!validation.ok) throw new Error("CAPTURE_BUNDLE_SELF_VALIDATION_FAILED");
    return {
      ok: true as const,
      exitCode: 0 as const,
      kind: "worldkit-simulation-take-run" as const,
      schemaVersion: 1 as const,
      diagnostics: [] as const,
      takeId: loadedTake.compiledTake.take.id,
      takeHash: loadedTake.compiledTake.takeHash,
      worldPackageRootHash: worldPackageIdentity.worldPackageRootHash,
      runtimeSessionId: run.runtimeSessionId,
      capturedFrameCount: run.capturedFrameCount,
      bundleRootHash: finalized.bundleRootHash,
      outputPath: finalized.outputDirectory,
      url: server.url,
    };
  } catch (error) {
    await writer?.abort();
    return cliFailure(
      "TAKE_RUN_FAILED",
      "Simulation Take execution or Control Capture failed.",
      { cause: error instanceof Error ? error.message : String(error) },
    );
  } finally {
    await browser?.close();
    await server?.stop();
  }
}

export async function validateControlCaptureBundleFileV1(inputPath: string) {
  const validation = await validateControlCaptureBundleV1(inputPath);
  return validation.ok
    ? {
        ok: true as const,
        exitCode: 0 as const,
        kind: "worldkit-control-capture-validation" as const,
        schemaVersion: 1 as const,
        diagnostics: [] as const,
        bundleRootHash: validation.bundleRootHash,
      }
    : {
        ok: false as const,
        exitCode: 2 as const,
        diagnostics: validation.diagnostics.map((diagnostic) => ({
          severity: "error" as const,
          code: diagnostic.code,
          instancePath: diagnostic.path,
          message: diagnostic.message,
        })),
      };
}

export async function inspectControlCaptureBundleFileV1(inputPath: string) {
  try {
    const inspection = await inspectControlCaptureBundleV1(inputPath);
    return {
      ok: true as const,
      exitCode: 0 as const,
      kind: "worldkit-control-capture-inspection" as const,
      schemaVersion: 1 as const,
      diagnostics: [] as const,
      ...inspection,
    };
  } catch {
    return cliFailure(
      "CAPTURE_BUNDLE_INVALID",
      "Control Capture Bundle must pass integrity validation before inspection.",
    );
  }
}
