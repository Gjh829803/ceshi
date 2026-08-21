import { access, mkdtemp, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  CONTROL_CAPTURE_PASS_IDS_V1,
  compileSimulationTakeV1,
  type ControlCapturePassIdV1,
  type Sha256HashV1,
} from "@whitebox-world/control-capture";

import {
  createControlCaptureBundleWriterV1,
  inspectControlCaptureBundleV1,
  type ControlCaptureFrameInputV1,
  validateControlCaptureBundleV1,
} from "./control-capture-bundle";

const temporaryDirectories: string[] = [];
const WORLD_HASH = `sha256:${"a".repeat(64)}` as Sha256HashV1;

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "worldkit-control-capture-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

function takeInput(): Record<string, unknown> {
  return {
    kind: "worldkit-simulation-take",
    schemaVersion: 1,
    id: "bundle-test-take",
    worldPackageRef: `package://bundle-test@${WORLD_HASH}`,
    worldPackageRootHash: WORLD_HASH,
    seed: 7,
    simulationTickRate: { numeratorTicks: 60, denominatorSeconds: 1 },
    startTick: 0,
    endTickExclusive: 10,
    controllers: [{
      id: "hero-controller",
      kind: "scripted",
      controlledEntityId: "player",
      controlProfileRef: "worldkit://control/character-relative-camera@1",
      initialSequence: 0,
    }],
    tracks: [{
      id: "hero-movement",
      kind: "control-intent",
      controllerId: "hero-controller",
      interpolation: "step",
      keyframes: [{ tick: 0, moveAxesXZ: [0, 1], runEnabled: false, jumpPressed: false }],
    }],
    captureSchedule: {
      kind: "explicit-ticks",
      captureTicks: [0, 5],
      renderInterpolation: { kind: "none" },
    },
    captureProfileRef: "worldkit://capture/profile/control-video@1",
    captureEncodingProfileRef: "worldkit://capture/encoding/web-v1@1",
  };
}

function passBytes(passId: ControlCapturePassIdV1, frameIndex: number): Uint8Array {
  if (passId === "neutral-color") {
    return new Uint8Array([137, 80, 78, 71, frameIndex]);
  }
  const elementBytes = passId === "world-normal" ? 24 : 8;
  return new Uint8Array(elementBytes).fill(frameIndex + 1);
}

function frameInput(
  captureFrameIndex: number,
  simulationTick: number,
): ControlCaptureFrameInputV1 {
  return {
    kind: "worldkit-control-capture-frame" as const,
    schemaVersion: 1 as const,
    runtimeSessionId: "session-test",
    captureFrameIndex,
    simulationTick,
    renderFrameIndex: captureFrameIndex + 11,
    renderReadyReceiptId: `render-ready-${captureFrameIndex}`,
    widthPixels: 2,
    heightPixels: 1,
    camera: {
      cameraEntityId: "camera-main",
      cameraRigRef: "worldkit://camera-rig/third-person-orbit@1",
      positionMetersXYZ: [0, 2, 5] as const,
      forwardXYZ: [0, 0, -1] as const,
      upXYZ: [0, 1, 0] as const,
      verticalFovRadians: 1,
      nearClipMeters: 0.05,
      farClipMeters: 1_000,
      viewMatrixColumnMajor: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const,
      projectionMatrixColumnMajor: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const,
    },
    snapshot: {
      kind: "worldkit-runtime-snapshot",
      schemaVersion: 3,
      runtimeBackend: "babylon-havok",
      tick: simulationTick,
      ready: true,
      controlledEntityId: "player",
      controllersById: { "controller-primary": { id: "controller-primary", controlledEntityId: "player" } },
      subjectStatesByEntityId: {},
      camera: {
        entityId: "camera-main",
        targetEntityId: "player",
        positionMetersXYZ: [0, 2, 5] as const,
      },
      physics: { backend: "havok", ready: true, fixedTimeStepSeconds: 1 / 60 },
      resources: { meshes: 1, bodies: 1, terrainSamples: 4 },
    },
    passesById: Object.fromEntries(CONTROL_CAPTURE_PASS_IDS_V1.map((passId) => [
      passId,
      {
        passId,
        bytes: passBytes(passId, captureFrameIndex),
      },
    ])),
  };
}

async function createWriter(outputDirectory: string) {
  return createControlCaptureBundleWriterV1({
    outputDirectory,
    bundleId: "bundle-test",
    compiledTake: compileSimulationTakeV1(takeInput()),
    worldPackageIdentity: {
      worldPackageRef: `package://bundle-test@${WORLD_HASH}`,
      worldPackageRootHash: WORLD_HASH,
      normalizedWorldIrHash: `sha256:${"b".repeat(64)}` as Sha256HashV1,
      executionPlanHash: `sha256:${"c".repeat(64)}` as Sha256HashV1,
    },
    runtimeSessionId: "session-test",
    semanticClasses: [{ numericId: 1, semanticClassId: "terrain.ground" }],
    instances: [{ numericId: 1, entityId: "terrain-main", semanticClassId: "terrain.ground" }],
  });
}

describe("Control Capture Bundle V1", () => {
  it("atomically writes and validates a deterministic five-pass bundle", async () => {
    const parent = await createTemporaryDirectory();
    const outputDirectory = path.join(parent, "capture-bundle");
    const writer = await createWriter(outputDirectory);

    await expect(access(outputDirectory)).rejects.toThrow();
    await writer.appendFrame(frameInput(0, 0));
    await writer.appendFrame(frameInput(1, 5));
    const finalized = await writer.finalize();

    expect(finalized.bundleRootHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(await readdir(outputDirectory)).toEqual([
      "bundle.json",
      "capture-profile-lock.json",
      "diagnostics.json",
      "encoding-profile-lock.json",
      "frames",
      "integrity.json",
      "tables",
      "take.json",
      "tracks",
      "validation-report.json",
      "world-package-ref.json",
    ]);
    expect(await readdir(path.join(outputDirectory, "frames", "000000"))).toEqual([
      "frame.json",
      "instance-id.bin",
      "linear-depth-meters.bin",
      "neutral-color.png",
      "semantic-class-id.bin",
      "world-normal.bin",
    ]);

    const validation = await validateControlCaptureBundleV1(outputDirectory);
    expect(validation).toMatchObject({ ok: true, bundleRootHash: finalized.bundleRootHash });
    const inspection = await inspectControlCaptureBundleV1(outputDirectory);
    expect(inspection).toMatchObject({
      bundleId: "bundle-test",
      frameCount: 2,
      runtimeSessionId: "session-test",
      worldPackageRootHash: WORLD_HASH,
      takeHash: compileSimulationTakeV1(takeInput()).takeHash,
      bundleRootHash: finalized.bundleRootHash,
    });
  });

  it("detects changed bytes, missing passes, and stale integrity roots", async () => {
    const parent = await createTemporaryDirectory();
    const outputDirectory = path.join(parent, "capture-bundle");
    const writer = await createWriter(outputDirectory);
    await writer.appendFrame(frameInput(0, 0));
    await writer.appendFrame(frameInput(1, 5));
    await writer.finalize();

    await writeFile(path.join(outputDirectory, "frames/000001/instance-id.bin"), new Uint8Array([9, 9]));
    await unlink(path.join(outputDirectory, "frames/000000/world-normal.bin"));
    const integrityPath = path.join(outputDirectory, "integrity.json");
    const integrity = JSON.parse(await readFile(integrityPath, "utf8")) as Record<string, unknown>;
    integrity.bundleRootHash = `sha256:${"f".repeat(64)}`;
    await writeFile(integrityPath, JSON.stringify(integrity), "utf8");

    const validation = await validateControlCaptureBundleV1(outputDirectory);
    expect(validation.ok).toBe(false);
    expect(validation.diagnostics.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "CAPTURE_FILE_HASH_MISMATCH",
      "CAPTURE_REQUIRED_PASS_MISSING",
      "CAPTURE_ROOT_HASH_MISMATCH",
    ]));
  });

  it("rejects duplicate frames and mixed session evidence without publishing output", async () => {
    const parent = await createTemporaryDirectory();
    const outputDirectory = path.join(parent, "capture-bundle");
    const writer = await createWriter(outputDirectory);
    await writer.appendFrame(frameInput(0, 0));

    await expect(writer.appendFrame(frameInput(0, 5))).rejects.toThrow("CAPTURE_FRAME_INDEX_INVALID");
    await expect(access(outputDirectory)).rejects.toThrow();
    expect((await readdir(parent)).filter((name) => name.includes("staging"))).toEqual([]);

    const secondOutput = path.join(parent, "capture-bundle-2");
    const secondWriter = await createWriter(secondOutput);
    const mixed = { ...frameInput(0, 0), runtimeSessionId: "other-session" };
    await expect(secondWriter.appendFrame(mixed)).rejects.toThrow("CAPTURE_SESSION_MISMATCH");
    await expect(access(secondOutput)).rejects.toThrow();
    expect((await readdir(parent)).filter((name) => name.includes("staging"))).toEqual([]);
  });

  it("binds every frame to one Take and World Package and verifies the frame hash", async () => {
    const parent = await createTemporaryDirectory();
    const outputDirectory = path.join(parent, "capture-bundle");
    const writer = await createWriter(outputDirectory);
    await writer.appendFrame(frameInput(0, 0));
    await writer.finalize();

    const framePath = path.join(outputDirectory, "frames/000000/frame.json");
    const frame = JSON.parse(await readFile(framePath, "utf8")) as Record<string, unknown>;
    frame.worldPackageRootHash = `sha256:${"d".repeat(64)}`;
    frame.takeHash = `sha256:${"e".repeat(64)}`;
    frame.frameHash = `sha256:${"f".repeat(64)}`;
    await writeFile(framePath, JSON.stringify(frame), "utf8");

    const validation = await validateControlCaptureBundleV1(outputDirectory);
    expect(validation.ok).toBe(false);
    expect(validation.diagnostics.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "CAPTURE_FRAME_HASH_MISMATCH",
      "CAPTURE_TAKE_MISMATCH",
      "CAPTURE_WORLD_PACKAGE_MISMATCH",
    ]));
  });
});
