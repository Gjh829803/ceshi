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
  sha256Bytes,
  sha256CanonicalJson,
  stringifyCanonicalJson,
} from "@whitebox-world/protocol";
import type { WorldRuntimeSnapshotV4 } from "@whitebox-world/runtime-contracts";
import {
  buildWorldStateSnapshotV1,
  deriveGameplayCommandReceiptIdV1,
  deriveGameplayEventIdV1,
  deriveWorldStateSnapshotRefV1,
  type GameplayCommandReceiptV1,
  type GameplayCommandV1,
  type GameplayEventV1,
} from "@whitebox-world/gameplay-contracts";

import {
  collectControlCaptureBundleByteEvidenceV1,
  createControlCaptureBundleWriterV1,
  inspectControlCaptureBundleV1,
  type ControlCaptureFrameInputV1,
  type ControlCaptureGameplayTransitionInputV1,
  validateControlCaptureBundleV1,
} from "./control-capture-bundle";

const temporaryDirectories: string[] = [];
const WORLD_HASH = `sha256:${"a".repeat(64)}` as Sha256HashV1;

function runtimeSnapshot(simulationTick: number): WorldRuntimeSnapshotV4 {
  const runtimeSessionId = "session-test";
  const worldSessionId = "world-session-test";
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
        relationshipStatesById: {
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
  const bytes = new Uint8Array(passId === "world-normal" ? 24 : 8);
  const view = new DataView(bytes.buffer);
  if (passId === "semantic-class-id" || passId === "instance-id") {
    view.setUint32(0, 0, true);
    view.setUint32(4, 1, true);
  } else if (passId === "linear-depth-meters") {
    view.setFloat32(0, frameIndex + 1, true);
    view.setFloat32(4, frameIndex + 2, true);
  } else {
    [0, 1, 0, 1, 0, 0].forEach((value, index) =>
      view.setFloat32(index * 4, value, true)
    );
  }
  return bytes;
}

async function rewriteIntegrity(outputDirectory: string): Promise<void> {
  const integrityPath = path.join(outputDirectory, "integrity.json");
  const integrity = JSON.parse(await readFile(integrityPath, "utf8")) as {
    fileHashesByPath: Record<string, string>;
    bundleRootHash: string;
  };
  for (const filePath of Object.keys(integrity.fileHashesByPath)) {
    integrity.fileHashesByPath[filePath] = sha256Bytes(
      new Uint8Array(await readFile(path.join(outputDirectory, filePath))),
    );
  }
  integrity.bundleRootHash = sha256CanonicalJson(integrity.fileHashesByPath);
  await writeFile(integrityPath, `${stringifyCanonicalJson(integrity)}\n`, "utf8");
}

function frameInput(
  captureFrameIndex: number,
  simulationTick: number,
  snapshot: WorldRuntimeSnapshotV4 = runtimeSnapshot(simulationTick),
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
    snapshot,
    passesById: Object.fromEntries(CONTROL_CAPTURE_PASS_IDS_V1.map((passId) => [
      passId,
      {
        passId,
        bytes: passBytes(passId, captureFrameIndex),
      },
    ])),
  };
}

function mountedGameplayEvidence(): Readonly<{
  transition: ControlCaptureGameplayTransitionInputV1;
  snapshot: WorldRuntimeSnapshotV4;
}> {
  const relationship = {
    id: "mounted-on-test",
    type: "mountedOn" as const,
    schemaVersion: 1 as const,
    riderEntityId: "player",
    mountEntityId: "skateboard",
    mountSlotId: "stand",
    establishedSimulationTick: 5,
  };
  const spatial = (id: string, classId: string) => ({
    id,
    kind: "spatial-entity-state" as const,
    entityDefinitionRef: `worldkit://subject-definition/${id}@1`,
    entityDefinitionHash: WORLD_HASH,
    semanticClassId: classId,
    lifecycleMode: "active" as const,
    positionMetersXYZ: [0, 0, 0] as const,
    rotationQuaternionXYZW: [0, 0, 0, 1] as const,
    scaleRatioXYZ: [1, 1, 1] as const,
    linearVelocityMetersPerSecondXYZ: [0, 0, 0] as const,
  });
  const worldStateAfter = buildWorldStateSnapshotV1({
    kind: "worldkit-world-state-snapshot",
    schemaVersion: 1,
    runtimeSessionId: "session-test",
    worldSessionId: "world-session-test",
    simulationTick: 5,
    worldPackageRef: `package://bundle-test@${WORLD_HASH}`,
    worldPackageRootHash: WORLD_HASH,
    executionPlanHash: `sha256:${"c".repeat(64)}`,
    entityStatesById: {
      player: spatial("player", "character.humanoid"),
      skateboard: spatial("skateboard", "vehicle.skateboard"),
    },
    capabilityStatesById: {
      "capability-state:player:locomotion": {
        id: "capability-state:player:locomotion",
        kind: "locomotion-capability-state",
        ownerEntityId: "player",
        locomotionCapabilityRef: "worldkit://capability/locomotion.ground@1",
        locomotionCapabilityHash: WORLD_HASH,
        mode: "suspended",
        suspendedByRelationshipId: relationship.id,
      },
    },
    relationshipStatesById: { [relationship.id]: relationship },
    semanticFactsById: {},
    activeActionStatesById: {},
    lastEventSequence: 3,
  });
  const command = {
    schemaVersion: 1,
    id: "command.mount.capture",
    type: "action.activate",
    runtimeSessionId: "session-test",
    worldSessionId: "world-session-test",
    controllerEntityId: "controller-primary",
    expectedPossession: { mode: "possessed", controlledEntityId: "player" },
    actionExecutionId: "execution.mount.capture",
    semanticActionRef: "worldkit://semantic-action/mount@1",
    actorEntityId: "player",
  } as const satisfies GameplayCommandV1;
  const events: GameplayEventV1[] = [
    {
      kind: "worldkit-gameplay-event",
      schemaVersion: 1,
      id: deriveGameplayEventIdV1("world-session-test", 1),
      type: "relationship.committed",
      runtimeSessionId: "session-test",
      worldSessionId: "world-session-test",
      simulationTick: 5,
      sequence: 1,
      commandId: command.id,
      relationship,
    },
    {
      kind: "worldkit-gameplay-event" as const,
      schemaVersion: 1 as const,
      id: deriveGameplayEventIdV1("world-session-test", 2),
      type: "action.started" as const,
      runtimeSessionId: "session-test",
      worldSessionId: "world-session-test",
      simulationTick: 5,
      sequence: 2,
      semanticActionRef: command.semanticActionRef,
      actionExecutionId: command.actionExecutionId,
      actorEntityId: command.actorEntityId,
      commandId: command.id,
    },
    {
      kind: "worldkit-gameplay-event" as const,
      schemaVersion: 1 as const,
      id: deriveGameplayEventIdV1("world-session-test", 3),
      type: "action.completed" as const,
      runtimeSessionId: "session-test",
      worldSessionId: "world-session-test",
      simulationTick: 5,
      sequence: 3,
      semanticActionRef: command.semanticActionRef,
      actionExecutionId: command.actionExecutionId,
      actorEntityId: command.actorEntityId,
    },
  ];
  const receiptBody = {
    kind: "worldkit-gameplay-command-receipt" as const,
    schemaVersion: 1 as const,
    runtimeSessionId: "session-test",
    worldSessionId: "world-session-test",
    commandId: command.id,
    commandHash: sha256CanonicalJson(command) as Sha256HashV1,
    commandType: command.type,
    simulationTick: 5,
    status: "committed" as const,
    eventIds: events.map(({ id }) => id),
    worldStateAfterRef: deriveWorldStateSnapshotRefV1({
      runtimeSessionId: worldStateAfter.runtimeSessionId,
      worldSessionId: worldStateAfter.worldSessionId,
      worldStateHash: worldStateAfter.worldStateHash,
    }),
    worldStateAfterHash: worldStateAfter.worldStateHash,
  };
  const receipt: GameplayCommandReceiptV1 = {
    id: deriveGameplayCommandReceiptIdV1(receiptBody),
    ...receiptBody,
  };
  const gameplayInspectionAfter = {
    ...runtimeSnapshot(5).world.gameplayInspection,
    relationshipStatesById: { [relationship.id]: relationship },
    lastEventSequence: 3,
  };
  const snapshot: WorldRuntimeSnapshotV4 = {
    ...runtimeSnapshot(5),
    world: {
      ...runtimeSnapshot(5).world,
      worldStateRef: receipt.worldStateAfterRef,
      worldStateHash: receipt.worldStateAfterHash,
      gameplayInspection: gameplayInspectionAfter,
    },
  };
  return {
    transition: {
      captureFrameIndexAfter: 1,
      command,
      receipt,
      events,
      worldStateAfter,
      gameplayInspectionAfter,
    },
    snapshot,
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
    worldSessionId: "world-session-test",
    semanticClasses: [{ numericId: 1, semanticClassId: "terrain.ground" }],
    instances: [{ numericId: 1, entityId: "terrain-main", semanticClassId: "terrain.ground" }],
  });
}

describe("Control Capture Bundle V1", () => {
  it("binds mounted Action, Event, Relationship, Receipt, and Snapshot tracks", async () => {
    const parent = await createTemporaryDirectory();
    const outputDirectory = path.join(parent, "capture-bundle");
    const writer = await createWriter(outputDirectory);
    const evidence = mountedGameplayEvidence();

    await writer.appendFrame(frameInput(0, 0));
    writer.appendGameplayTransition(evidence.transition);
    await writer.appendFrame(frameInput(1, 5, evidence.snapshot));
    await writer.finalize();

    const readRows = async (fileName: string) =>
      (await readFile(path.join(outputDirectory, "tracks", fileName), "utf8"))
        .trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
    expect(await readRows("actions.ndjson")).toHaveLength(1);
    expect(await readRows("events.ndjson")).toHaveLength(3);
    expect(await readRows("relationships.ndjson")).toEqual([
      expect.objectContaining({
        captureFrameIndexAfter: 1,
        operation: "add",
        relationship: expect.objectContaining({ type: "mountedOn" }),
      }),
    ]);
    await expect(validateControlCaptureBundleV1(outputDirectory)).resolves
      .toMatchObject({ ok: true });
  });

  it("rejects a missing Relationship row even after a self-consistent re-hash", async () => {
    const parent = await createTemporaryDirectory();
    const outputDirectory = path.join(parent, "capture-bundle");
    const writer = await createWriter(outputDirectory);
    const evidence = mountedGameplayEvidence();
    await writer.appendFrame(frameInput(0, 0));
    writer.appendGameplayTransition(evidence.transition);
    await writer.appendFrame(frameInput(1, 5, evidence.snapshot));
    await writer.finalize();

    await writeFile(
      path.join(outputDirectory, "tracks/relationships.ndjson"),
      "",
      "utf8",
    );
    await rewriteIntegrity(outputDirectory);
    const validation = await validateControlCaptureBundleV1(outputDirectory);
    expect(validation.ok).toBe(false);
    expect(validation.diagnostics).toContainEqual(expect.objectContaining({
      code: "CAPTURE_GAMEPLAY_REFERENCE_MISMATCH",
      path: "tracks/relationships.ndjson",
    }));
  });

  it("rejects transition evidence whose Event Tick disagrees with its Receipt", async () => {
    const parent = await createTemporaryDirectory();
    const writer = await createWriter(path.join(parent, "capture-bundle"));
    const evidence = mountedGameplayEvidence();
    const events = evidence.transition.events.map((event) => ({
      ...event,
      simulationTick: event.simulationTick + 1,
    })) as readonly GameplayEventV1[];

    expect(() => writer.appendGameplayTransition({
      ...evidence.transition,
      events,
    })).toThrow("CAPTURE_GAMEPLAY_REFERENCE_MISMATCH");
    await writer.abort();
  });

  it("rejects a re-hashed Relationship Event that disagrees with its post-transition Snapshot", async () => {
    const parent = await createTemporaryDirectory();
    const outputDirectory = path.join(parent, "capture-bundle");
    const writer = await createWriter(outputDirectory);
    const evidence = mountedGameplayEvidence();
    await writer.appendFrame(frameInput(0, 0));
    writer.appendGameplayTransition(evidence.transition);
    await writer.appendFrame(frameInput(1, 5, evidence.snapshot));
    await writer.finalize();

    const eventPath = path.join(outputDirectory, "tracks/events.ndjson");
    const relationshipPath = path.join(
      outputDirectory,
      "tracks/relationships.ndjson",
    );
    const eventRows = (await readFile(eventPath, "utf8")).trim().split("\n")
      .map((line) => JSON.parse(line));
    const relationshipRows = (await readFile(relationshipPath, "utf8"))
      .trim().split("\n").map((line) => JSON.parse(line));
    eventRows[0].event.relationship.mountSlotId = "tampered-slot";
    relationshipRows[0].relationship.mountSlotId = "tampered-slot";
    await writeFile(
      eventPath,
      `${eventRows.map(stringifyCanonicalJson).join("\n")}\n`,
      "utf8",
    );
    await writeFile(
      relationshipPath,
      `${relationshipRows.map(stringifyCanonicalJson).join("\n")}\n`,
      "utf8",
    );
    await rewriteIntegrity(outputDirectory);

    const validation = await validateControlCaptureBundleV1(outputDirectory);
    expect(validation.ok).toBe(false);
    expect(validation.diagnostics).toContainEqual(expect.objectContaining({
      code: "CAPTURE_GAMEPLAY_REFERENCE_MISMATCH",
      path: "tracks/relationships.ndjson/0",
    }));
  });

  it("rejects a self-consistent Receipt chain bound to the wrong post-transition World State", async () => {
    const parent = await createTemporaryDirectory();
    const outputDirectory = path.join(parent, "capture-bundle");
    const writer = await createWriter(outputDirectory);
    const evidence = mountedGameplayEvidence();
    await writer.appendFrame(frameInput(0, 0));
    writer.appendGameplayTransition(evidence.transition);
    await writer.appendFrame(frameInput(1, 5, evidence.snapshot));
    await writer.finalize();

    const actionPath = path.join(outputDirectory, "tracks/actions.ndjson");
    const eventPath = path.join(outputDirectory, "tracks/events.ndjson");
    const relationshipPath = path.join(
      outputDirectory,
      "tracks/relationships.ndjson",
    );
    const actionRows = (await readFile(actionPath, "utf8")).trim().split("\n")
      .map((line) => JSON.parse(line));
    const eventRows = (await readFile(eventPath, "utf8")).trim().split("\n")
      .map((line) => JSON.parse(line));
    const relationshipRows = (await readFile(relationshipPath, "utf8"))
      .trim().split("\n").map((line) => JSON.parse(line));
    const { id: _receiptId, ...receiptBody } = actionRows[0].receipt;
    const wrongWorldStateHash = `sha256:${"e".repeat(64)}`;
    const receipt = {
      ...receiptBody,
      worldStateAfterHash: wrongWorldStateHash,
      worldStateAfterRef: deriveWorldStateSnapshotRefV1({
        runtimeSessionId: receiptBody.runtimeSessionId,
        worldSessionId: receiptBody.worldSessionId,
        worldStateHash: wrongWorldStateHash,
      }),
    };
    actionRows[0].receipt = {
      id: deriveGameplayCommandReceiptIdV1(receipt),
      ...receipt,
    };
    actionRows[0].worldStateAfterRef = receipt.worldStateAfterRef;
    actionRows[0].worldStateAfterHash = receipt.worldStateAfterHash;
    for (const row of [...eventRows, ...relationshipRows]) {
      row.receiptId = actionRows[0].receipt.id;
    }
    await writeFile(
      actionPath,
      `${actionRows.map(stringifyCanonicalJson).join("\n")}\n`,
      "utf8",
    );
    await writeFile(
      eventPath,
      `${eventRows.map(stringifyCanonicalJson).join("\n")}\n`,
      "utf8",
    );
    await writeFile(
      relationshipPath,
      `${relationshipRows.map(stringifyCanonicalJson).join("\n")}\n`,
      "utf8",
    );
    await rewriteIntegrity(outputDirectory);

    const validation = await validateControlCaptureBundleV1(outputDirectory);
    expect(validation.ok).toBe(false);
    expect(validation.diagnostics).toContainEqual(expect.objectContaining({
      code: "CAPTURE_GAMEPLAY_REFERENCE_MISMATCH",
      path: "tracks/actions.ndjson/0",
    }));
  });

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
    const byteEvidence = await collectControlCaptureBundleByteEvidenceV1(
      outputDirectory,
    );
    expect(byteEvidence).toMatchObject({
      bundleRootHash: finalized.bundleRootHash,
      sizeBytes: expect.any(Number),
    });
    expect(byteEvidence.sizeBytes).toBeGreaterThan(0);
    expect(byteEvidence.fileHashesByPath).not.toHaveProperty("integrity.json");
    expect(Object.keys(byteEvidence.fileHashesByPath)).toEqual(
      Object.keys(byteEvidence.fileHashesByPath).sort(),
    );
    const integrityPath = path.join(outputDirectory, "integrity.json");
    const integrityBytes = new Uint8Array(await readFile(integrityPath));
    integrityBytes[integrityBytes.byteLength - 1] = 0x20;
    await writeFile(integrityPath, integrityBytes);
    const changedDirectoryEvidence =
      await collectControlCaptureBundleByteEvidenceV1(outputDirectory);
    expect(changedDirectoryEvidence.bundleRootHash).toBe(
      byteEvidence.bundleRootHash,
    );
    expect(changedDirectoryEvidence.sizeBytes).toBe(byteEvidence.sizeBytes);
    expect(changedDirectoryEvidence.bundleDirectoryHash).not.toBe(
      byteEvidence.bundleDirectoryHash,
    );
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

    const thirdOutput = path.join(parent, "capture-bundle-3");
    const thirdWriter = await createWriter(thirdOutput);
    const mixedSnapshot = frameInput(0, 0);
    await expect(thirdWriter.appendFrame({
      ...mixedSnapshot,
      snapshot: {
        ...mixedSnapshot.snapshot,
        runtimeSessionId: "other-session",
      },
    })).rejects.toThrow("CAPTURE_SESSION_MISMATCH");
    await expect(access(thirdOutput)).rejects.toThrow();

    const fourthOutput = path.join(parent, "capture-bundle-4");
    const fourthWriter = await createWriter(fourthOutput);
    const crossWorldSnapshot = frameInput(0, 0);
    await expect(fourthWriter.appendFrame({
      ...crossWorldSnapshot,
      snapshot: {
        ...crossWorldSnapshot.snapshot,
        worldSessionId: "other-world-session",
      },
    })).rejects.toThrow("CAPTURE_SESSION_MISMATCH");
    await expect(access(fourthOutput)).rejects.toThrow();
    expect((await readdir(parent)).filter((name) => name.includes("staging"))).toEqual([]);
  });

  it("requires the exact compiled capture schedule before finalization", async () => {
    const parent = await createTemporaryDirectory();
    const wrongTickOutput = path.join(parent, "wrong-tick");
    const wrongTickWriter = await createWriter(wrongTickOutput);
    await wrongTickWriter.appendFrame(frameInput(0, 0));
    await expect(wrongTickWriter.appendFrame(frameInput(1, 6))).rejects.toThrow(
      "CAPTURE_FRAME_TICK_INVALID",
    );
    await expect(access(wrongTickOutput)).rejects.toThrow();

    const incompleteOutput = path.join(parent, "incomplete");
    const incompleteWriter = await createWriter(incompleteOutput);
    await incompleteWriter.appendFrame(frameInput(0, 0));
    await expect(incompleteWriter.finalize()).rejects.toThrow(
      "CAPTURE_SCHEDULE_INCOMPLETE",
    );
    await expect(access(incompleteOutput)).rejects.toThrow();
    expect((await readdir(parent)).filter((name) => name.includes("staging"))).toEqual([]);
  });

  it("binds every frame to one Take and World Package and verifies the frame hash", async () => {
    const parent = await createTemporaryDirectory();
    const outputDirectory = path.join(parent, "capture-bundle");
    const writer = await createWriter(outputDirectory);
    await writer.appendFrame(frameInput(0, 0));
    await writer.appendFrame(frameInput(1, 5));
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

  it("rejects a self-consistent re-hash that detaches the Bundle from its Take", async () => {
    const parent = await createTemporaryDirectory();
    const outputDirectory = path.join(parent, "capture-bundle");
    const writer = await createWriter(outputDirectory);
    await writer.appendFrame(frameInput(0, 0));
    await writer.appendFrame(frameInput(1, 5));
    await writer.finalize();

    const tamperedTakeHash = `sha256:${"d".repeat(64)}`;
    const manifestPath = path.join(outputDirectory, "bundle.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
    const frames = manifest.frames as Array<Record<string, unknown>>;
    for (let index = 0; index < frames.length; index += 1) {
      const framePath = path.join(
        outputDirectory,
        "frames",
        String(index).padStart(6, "0"),
        "frame.json",
      );
      const frame = JSON.parse(await readFile(framePath, "utf8")) as Record<string, unknown>;
      frame.takeHash = tamperedTakeHash;
      const { frameHash: _oldFrameHash, ...frameBody } = frame;
      frame.frameHash = sha256CanonicalJson(frameBody);
      frames[index]!.frameHash = frame.frameHash;
      await writeFile(framePath, `${stringifyCanonicalJson(frame)}\n`, "utf8");
    }
    manifest.takeHash = tamperedTakeHash;
    const { bundleManifestHash: _oldManifestHash, ...manifestBody } = manifest;
    manifest.bundleManifestHash = sha256CanonicalJson(manifestBody);
    await writeFile(manifestPath, `${stringifyCanonicalJson(manifest)}\n`, "utf8");
    await rewriteIntegrity(outputDirectory);

    const validation = await validateControlCaptureBundleV1(outputDirectory);
    expect(validation.ok).toBe(false);
    expect(validation.diagnostics).toContainEqual(expect.objectContaining({
      code: "CAPTURE_TAKE_MISMATCH",
      path: "bundle.json",
    }));
  });
});
