import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  CONTROL_CAPTURE_PASS_IDS_V1,
  compileSimulationTakeV1,
  type ControlCapturePassIdV1,
  type Sha256HashV1,
} from "@whitebox-world/control-capture";
import {
  sha256Bytes,
  sha256CanonicalJson,
  stringifyCanonicalJson,
} from "@whitebox-world/protocol";
import type { WorldRuntimeSnapshotV4 } from "@whitebox-world/runtime-contracts";

import {
  createControlCaptureBundleWriterV1,
  type ControlCaptureFrameInputV1,
} from "./control-capture-bundle";

const WORLD_HASH = `sha256:${"a".repeat(64)}` as Sha256HashV1;

function runtimeSnapshot(simulationTick: number): WorldRuntimeSnapshotV4 {
  const runtimeSessionId = "validation-fixture-session";
  const worldSessionId = "validation-fixture-world-session";
  return {
    kind: "worldkit-runtime-snapshot",
    schemaVersion: 4,
    runtimeSessionId,
    worldSessionId,
    world: {
      publicationEpoch: 1,
      simulationTick,
      worldStateRef: `worldkit://world-state/world-state:${"d".repeat(64)}`,
      worldStateHash: WORLD_HASH,
      subjectStatesByEntityId: {},
      gameplayInspection: {
        kind: "worldkit-gameplay-inspection-snapshot",
        schemaVersion: 1,
        projection: "inspection",
        id: `gameplay-inspection:${worldSessionId}:${simulationTick}`,
        runtimeSessionId,
        worldSessionId,
        gameplayModeRef: "worldkit://gameplay-mode/outdoor.default@1",
        phase: "ready",
        simulationTick,
        participantStatesById: {
          "participant-primary": { id: "participant-primary", mode: "active" },
        },
        controllerStatesById: {
          "controller-primary": {
            id: "controller-primary",
            participantId: "participant-primary",
          },
        },
        possessedByRelationshipsById: {
          "possessed-by-primary": {
            id: "possessed-by-primary",
            type: "possessedBy",
            schemaVersion: 1,
            controlledEntityId: "player",
            controllerEntityId: "controller-primary",
            establishedSimulationTick: simulationTick,
          },
        },
        activeActionStatesById: {},
        activatedGameplayFeatureRefs: [],
        lastEventSequence: 0,
      },
    },
    view: {
      viewStateRevision: simulationTick,
      camera: {
        mode: "tracking",
        id: "camera-main",
        targetEntityId: "player",
        positionMetersXYZ: [0, 2, 5],
        activeCameraProfileRef: "worldkit://camera-profile/test@1",
        activeCameraRigRef: "worldkit://camera-rig/third-person-orbit@1",
        activeCameraModifierRefs: [],
        safeFallbackActive: false,
        viewYawOffsetRadians: 0,
        viewPitchOffsetRadians: 0,
        viewDistanceOffsetMeters: 0,
        fixedStepDeltaSeconds: 1 / 60,
      },
    },
    runtime: {
      phase: "ready",
      isPaused: true,
      fixedTimeStepSeconds: 1 / 60,
    },
    resources: {
      phase: "ready",
      meshCount: 1,
      physicsBodyCount: 1,
      terrainSampleCount: 4,
    },
  };
}

function takeInput(): Record<string, unknown> {
  return {
    kind: "worldkit-simulation-take",
    schemaVersion: 1,
    id: "validation-fixture-take",
    worldPackageRef: `package://validation-fixture@${WORLD_HASH}`,
    worldPackageRootHash: WORLD_HASH,
    seed: 11,
    simulationTickRate: { numeratorTicks: 60, denominatorSeconds: 1 },
    startTick: 0,
    endTickExclusive: 10,
    controllers: [
      {
        id: "hero-controller",
        kind: "scripted",
        controlledEntityId: "player",
        controlProfileRef: "worldkit://control/character-relative-camera@1",
        initialSequence: 0,
      },
    ],
    tracks: [
      {
        id: "hero-movement",
        kind: "control-intent",
        controllerId: "hero-controller",
        interpolation: "step",
        keyframes: [
          {
            tick: 0,
            moveAxesXZ: [0, 1],
            runEnabled: false,
            jumpPressed: false,
          },
        ],
      },
    ],
    captureSchedule: {
      kind: "explicit-ticks",
      captureTicks: [0, 5],
      renderInterpolation: { kind: "none" },
    },
    captureProfileRef: "worldkit://capture/profile/control-video@1",
    captureEncodingProfileRef: "worldkit://capture/encoding/web-v1@1",
  };
}

function passBytes(
  passId: ControlCapturePassIdV1,
  captureFrameIndex: number,
): Uint8Array {
  if (passId === "neutral-color") {
    return new Uint8Array([137, 80, 78, 71, captureFrameIndex]);
  }
  const bytes = new Uint8Array(passId === "world-normal" ? 24 : 8);
  const view = new DataView(bytes.buffer);
  if (passId === "semantic-class-id" || passId === "instance-id") {
    view.setUint32(0, 0, true);
    view.setUint32(4, 1, true);
  } else if (passId === "linear-depth-meters") {
    view.setFloat32(0, captureFrameIndex + 1, true);
    view.setFloat32(4, captureFrameIndex + 2, true);
  } else {
    [0, 1, 0, 1, 0, 0].forEach((value, index) =>
      view.setFloat32(index * 4, value, true)
    );
  }
  return bytes;
}

function frameInput(
  captureFrameIndex: number,
  simulationTick: number,
): ControlCaptureFrameInputV1 {
  return {
    kind: "worldkit-control-capture-frame",
    schemaVersion: 1,
    runtimeSessionId: "validation-fixture-session",
    captureFrameIndex,
    simulationTick,
    renderFrameIndex: captureFrameIndex + 20,
    renderReadyReceiptId: `render-ready-${captureFrameIndex}`,
    widthPixels: 2,
    heightPixels: 1,
    camera: {
      cameraEntityId: "camera-main",
      cameraRigRef: "worldkit://camera-rig/third-person-orbit@1",
      positionMetersXYZ: [0, 2, 5],
      forwardXYZ: [0, 0, -1],
      upXYZ: [0, 1, 0],
      verticalFovRadians: 1,
      nearClipMeters: 0.05,
      farClipMeters: 1_000,
      viewMatrixColumnMajor: [1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
      projectionMatrixColumnMajor: [1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
    },
    snapshot: runtimeSnapshot(simulationTick),
    passesById: Object.fromEntries(
      CONTROL_CAPTURE_PASS_IDS_V1.map((passId) => [
        passId,
        { passId, bytes: passBytes(passId, captureFrameIndex) },
      ]),
    ),
  };
}

export async function createControlCaptureValidationFixtureV1(
  outputDirectory: string,
): Promise<void> {
  const writer = await createControlCaptureBundleWriterV1({
    outputDirectory,
    bundleId: "validation-fixture-bundle",
    compiledTake: compileSimulationTakeV1(takeInput()),
    worldPackageIdentity: {
      worldPackageRef: `package://validation-fixture@${WORLD_HASH}`,
      worldPackageRootHash: WORLD_HASH,
      normalizedWorldIrHash: `sha256:${"b".repeat(64)}` as Sha256HashV1,
      executionPlanHash: `sha256:${"c".repeat(64)}` as Sha256HashV1,
    },
    runtimeSessionId: "validation-fixture-session",
    worldSessionId: "validation-fixture-world-session",
    semanticClasses: [{ numericId: 1, semanticClassId: "terrain.ground" }],
    instances: [
      {
        numericId: 1,
        entityId: "terrain-main",
        semanticClassId: "terrain.ground",
      },
    ],
  });
  await writer.appendFrame(frameInput(0, 0));
  await writer.appendFrame(frameInput(1, 5));
  await writer.finalize();
}

export async function rewriteControlCaptureIntegrityV1(
  outputDirectory: string,
): Promise<void> {
  const integrityPath = path.join(outputDirectory, "integrity.json");
  const integrity = JSON.parse(await readFile(integrityPath, "utf8")) as {
    fileHashesByPath: Record<string, Sha256HashV1>;
    bundleRootHash: Sha256HashV1;
  };
  for (const filePath of Object.keys(integrity.fileHashesByPath)) {
    integrity.fileHashesByPath[filePath] = sha256Bytes(
      new Uint8Array(await readFile(path.join(outputDirectory, filePath))),
    ) as Sha256HashV1;
  }
  integrity.bundleRootHash = sha256CanonicalJson(
    integrity.fileHashesByPath,
  ) as Sha256HashV1;
  await writeFile(
    integrityPath,
    `${stringifyCanonicalJson(integrity)}\n`,
    "utf8",
  );
}

export async function rewriteControlCaptureFrameAndManifestHashesV1(
  outputDirectory: string,
  captureFrameIndex: number,
): Promise<void> {
  const frameDirectoryName = String(captureFrameIndex).padStart(6, "0");
  const framePath = path.join(
    outputDirectory,
    "frames",
    frameDirectoryName,
    "frame.json",
  );
  const frame = JSON.parse(await readFile(framePath, "utf8")) as Record<
    string,
    unknown
  >;
  const passesById = frame.passesById as Record<
    string,
    Record<string, unknown>
  >;
  const depthPath = path.join(
    outputDirectory,
    "frames",
    frameDirectoryName,
    "linear-depth-meters.bin",
  );
  passesById["linear-depth-meters"]!.contentHash = sha256Bytes(
    new Uint8Array(await readFile(depthPath)),
  );
  const { frameHash: _oldFrameHash, ...frameBody } = frame;
  frame.frameHash = sha256CanonicalJson(frameBody);
  await writeFile(framePath, `${stringifyCanonicalJson(frame)}\n`, "utf8");

  const bundlePath = path.join(outputDirectory, "bundle.json");
  const bundle = JSON.parse(await readFile(bundlePath, "utf8")) as Record<
    string,
    unknown
  >;
  const frames = bundle.frames as Array<Record<string, unknown>>;
  frames[captureFrameIndex]!.frameHash = frame.frameHash;
  const { bundleManifestHash: _oldManifestHash, ...bundleBody } = bundle;
  bundle.bundleManifestHash = sha256CanonicalJson(bundleBody);
  await writeFile(bundlePath, `${stringifyCanonicalJson(bundle)}\n`, "utf8");
  await rewriteControlCaptureIntegrityV1(outputDirectory);
}

export async function rewriteControlCaptureTakeHashV1(
  outputDirectory: string,
  takeHash: Sha256HashV1,
): Promise<void> {
  const bundlePath = path.join(outputDirectory, "bundle.json");
  const bundle = JSON.parse(await readFile(bundlePath, "utf8")) as Record<
    string,
    unknown
  >;
  const frames = bundle.frames as Array<Record<string, unknown>>;
  for (
    let captureFrameIndex = 0;
    captureFrameIndex < frames.length;
    captureFrameIndex += 1
  ) {
    const framePath = path.join(
      outputDirectory,
      "frames",
      String(captureFrameIndex).padStart(6, "0"),
      "frame.json",
    );
    const frame = JSON.parse(await readFile(framePath, "utf8")) as Record<
      string,
      unknown
    >;
    frame.takeHash = takeHash;
    const { frameHash: _oldFrameHash, ...frameBody } = frame;
    frame.frameHash = sha256CanonicalJson(frameBody);
    frames[captureFrameIndex]!.frameHash = frame.frameHash;
    await writeFile(framePath, `${stringifyCanonicalJson(frame)}\n`, "utf8");
  }
  bundle.takeHash = takeHash;
  const { bundleManifestHash: _oldManifestHash, ...bundleBody } = bundle;
  bundle.bundleManifestHash = sha256CanonicalJson(bundleBody);
  await writeFile(bundlePath, `${stringifyCanonicalJson(bundle)}\n`, "utf8");
  await rewriteControlCaptureIntegrityV1(outputDirectory);
}

export async function snapshotControlCaptureFileHashesV1(
  outputDirectory: string,
): Promise<Readonly<Record<string, Sha256HashV1>>> {
  const files: string[] = [];
  const visit = async (directory: string, relative = ""): Promise<void> => {
    for (const name of (await readdir(directory, { withFileTypes: true })).sort(
      (left, right) => left.name.localeCompare(right.name),
    )) {
      const childRelative = relative === "" ? name.name : `${relative}/${name.name}`;
      const childPath = path.join(directory, name.name);
      if (name.isDirectory()) await visit(childPath, childRelative);
      else if (name.isFile()) files.push(childRelative);
    }
  };
  await visit(outputDirectory);
  return Object.fromEntries(
    await Promise.all(
      files.map(async (filePath) => [
        filePath,
        sha256Bytes(
          new Uint8Array(await readFile(path.join(outputDirectory, filePath))),
        ) as Sha256HashV1,
      ] as const),
    ),
  );
}
