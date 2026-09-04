import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { Browser, BrowserContext, Page } from "playwright";

import {
  normalizeAuthoringSpecV4,
  parseAuthoringSpecV4,
  type AuthoringSpecV4,
} from "@whitebox-world/authoring";
import { stringifyCanonicalJson } from "@whitebox-world/protocol";
import {
  compileSimulationTakeV1,
  type SimulationTakeV1,
} from "@whitebox-world/control-capture";
import {
  parseGameplayCommandV1,
  parseGameplayEventV1,
  type GameplayEventV1,
  type GameplayCommandReceiptV1,
  type GameplayCommandV1,
  type GameplayInspectionSnapshotV1,
  type WorldStateSnapshotV1,
} from "@whitebox-world/gameplay-contracts";
import {
  sha256CanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import {
  WORLDKIT_WORLD_SESSION_EVENT_PAGE_MAXIMUM_COUNT,
  type RuntimeControlCaptureFrameV1,
  type RuntimeVec3V1,
  type WorldRuntimeSnapshotV4,
  type WorldSessionEventV1,
} from "@whitebox-world/runtime-contracts";

import {
  MOUNTED_SKATEBOARD_S1_BOARD_ENTITY_ID,
  MOUNTED_SKATEBOARD_S1_DISMOUNT_ACTION_REF,
  MOUNTED_SKATEBOARD_S1_DISMOUNT_COMMAND_ID,
  MOUNTED_SKATEBOARD_S1_DISMOUNT_REQUEST,
  MOUNTED_SKATEBOARD_S1_DISMOUNT_REQUEST_REF,
  MOUNTED_SKATEBOARD_S1_MOUNT_ACTION_REF,
  MOUNTED_SKATEBOARD_S1_MOUNT_COMMAND_ID,
  MOUNTED_SKATEBOARD_S1_MOUNT_REQUEST,
  MOUNTED_SKATEBOARD_S1_MOUNT_REQUEST_REF,
  MOUNTED_SKATEBOARD_S1_RELATIONSHIP_ID,
  MOUNTED_SKATEBOARD_S1_SCENE_ID,
  augmentMountedSkateboardS1AuthoringSpecV1,
} from "@whitebox-world/playground/mounted-skateboard-s1";
import {
  collectControlCaptureBundleByteEvidenceV1,
  createControlCaptureBundleWriterV1,
  inspectControlCaptureBundleV1,
  validateControlCaptureBundleV1,
  type ControlCaptureBundleFrameInputV1,
} from "../lib/control-capture-bundle";
import { launchChromiumWithSystemFallback } from
  "../lib/playwright-browser-launch";
import { startWorldkitServer } from "../lib/worldkit-server";

const CONTROLLER_ENTITY_ID = "controller-primary" as const;
const RIDER_ENTITY_ID = "player" as const;
const FIXED_MOVEMENT_TICKS = 30;
const CAPTURE_WIDTH_PIXELS = 320;
const CAPTURE_HEIGHT_PIXELS = 180;
const MINIMUM_MOVEMENT_METERS = 0.05;
const MAXIMUM_RIDER_BOARD_XZ_SEPARATION_METERS = 0.02;
const MOUNTED_CAMERA_MODIFIER_REF =
  "worldkit://camera-modifier/mounted-framing@1" as const;

export interface MountedCapturePhaseObservationV1 {
  readonly phase:
    | "before-mount"
    | "after-mount-movement"
    | "after-dismount-movement"
    | "after-reset";
  readonly runtimeSessionId: string;
  readonly worldSessionId: string;
  readonly simulationTick: number;
  readonly riderPositionMetersXYZ: RuntimeVec3V1;
  readonly boardPositionMetersXYZ: RuntimeVec3V1;
  readonly controlledEntityId: string | undefined;
  readonly mountedOnPresent: boolean;
  readonly cameraTargetEntityId: string | undefined;
  readonly activeCameraModifierRefs: readonly string[];
  readonly supportedByFacts: readonly Readonly<{
    id: string;
    supportedEntityId: string;
    supportSurfaceEntityId: string;
    supportTraversalSurfaceId: string;
    supportColliderSubshapeId: string;
    startedSimulationTick: number;
    semanticFactProjectorProfileRef: string;
    semanticFactProjectorProfileHash: string;
  }>[];
  readonly lastEventSequence: number;
  readonly eventIds: readonly string[];
}

export interface MountedCaptureTimelineV1 {
  readonly beforeMount: MountedCapturePhaseObservationV1;
  readonly afterMountMovement: MountedCapturePhaseObservationV1;
  readonly afterDismountMovement: MountedCapturePhaseObservationV1;
  readonly afterReset: MountedCapturePhaseObservationV1;
  readonly riderPositionAfterDismountCommandMetersXYZ: RuntimeVec3V1;
}

interface JournalTransitionEvidenceV1 {
  readonly command: GameplayCommandV1;
  readonly receipt: Extract<GameplayCommandReceiptV1, { status: "committed" }>;
  readonly worldSessionEvents: readonly WorldSessionEventV1[];
  readonly worldStateAfter: WorldStateSnapshotV1;
  readonly gameplayInspectionAfter: GameplayInspectionSnapshotV1;
}

function planarDistanceMeters(
  left: RuntimeVec3V1,
  right: RuntimeVec3V1,
): number {
  return Math.hypot(left[0] - right[0], left[2] - right[2]);
}

function supportedByEpisodeIdentity(
  fact: Extract<
    WorldStateSnapshotV1["semanticFactsById"][string],
    { readonly type: "supportedBy" }
  >,
) {
  return {
    id: fact.id,
    supportedEntityId: fact.supportedEntityId,
    supportSurfaceEntityId: fact.supportSurfaceEntityId,
    supportTraversalSurfaceId: fact.supportTraversalSurfaceId,
    supportColliderSubshapeId: fact.supportColliderSubshapeId,
    startedSimulationTick: fact.startedSimulationTick,
    semanticFactProjectorProfileRef:
      fact.semanticFactProjectorProfileRef,
    semanticFactProjectorProfileHash:
      fact.semanticFactProjectorProfileHash,
  };
}

function requireControlledEntityId(
  snapshot: WorldRuntimeSnapshotV4,
): string | undefined {
  for (const relationship of Object.values(
    snapshot.world.gameplayInspection.relationshipStatesById,
  )) {
    if (
      relationship.type === "possessedBy" &&
      relationship.controllerEntityId === CONTROLLER_ENTITY_ID
    ) {
      return relationship.controlledEntityId;
    }
  }
  return undefined;
}

function requireSubjectPosition(
  snapshot: WorldRuntimeSnapshotV4,
  entityId: string,
): RuntimeVec3V1 {
  const subject = snapshot.world.subjectStatesByEntityId[entityId];
  assert.ok(subject !== undefined, `Subject '${entityId}' is absent.`);
  return subject.entityState.positionMetersXYZ;
}

function observePhase(
  phase: MountedCapturePhaseObservationV1["phase"],
  snapshot: WorldRuntimeSnapshotV4,
  worldState: WorldStateSnapshotV1,
  events: readonly WorldSessionEventV1[],
): MountedCapturePhaseObservationV1 {
  const camera = snapshot.view.camera;
  return {
    phase,
    runtimeSessionId: snapshot.runtimeSessionId,
    worldSessionId: snapshot.worldSessionId,
    simulationTick: snapshot.world.simulationTick,
    riderPositionMetersXYZ: requireSubjectPosition(snapshot, RIDER_ENTITY_ID),
    boardPositionMetersXYZ: requireSubjectPosition(
      snapshot,
      MOUNTED_SKATEBOARD_S1_BOARD_ENTITY_ID,
    ),
    controlledEntityId: requireControlledEntityId(snapshot),
    mountedOnPresent: Object.values(
      snapshot.world.gameplayInspection.relationshipStatesById,
    ).some((relationship) =>
      relationship.type === "mountedOn" &&
      relationship.id === MOUNTED_SKATEBOARD_S1_RELATIONSHIP_ID
    ),
    cameraTargetEntityId: camera.mode === "tracking"
      ? camera.targetEntityId
      : undefined,
    activeCameraModifierRefs: camera.mode === "tracking"
      ? [...camera.activeCameraModifierRefs]
      : [],
    supportedByFacts: Object.values(worldState.semanticFactsById)
      .filter((fact) => fact.type === "supportedBy")
      .map((fact) => ({
        id: fact.id,
        supportedEntityId: fact.supportedEntityId,
        supportSurfaceEntityId: fact.supportSurfaceEntityId,
        supportTraversalSurfaceId: fact.supportTraversalSurfaceId,
        supportColliderSubshapeId: fact.supportColliderSubshapeId,
        startedSimulationTick: fact.startedSimulationTick,
        semanticFactProjectorProfileRef:
          fact.semanticFactProjectorProfileRef,
        semanticFactProjectorProfileHash:
          fact.semanticFactProjectorProfileHash,
      }))
      .sort((left, right) =>
        left.supportedEntityId < right.supportedEntityId
          ? -1
          : left.supportedEntityId > right.supportedEntityId
            ? 1
            : left.id < right.id
              ? -1
              : left.id > right.id
                ? 1
                : 0
      ),
    lastEventSequence:
      snapshot.world.gameplayInspection.lastEventSequence,
    eventIds: events.map(({ id }) => id),
  };
}

export function assertMountedSkateboardCaptureTimelineV1(
  timeline: MountedCaptureTimelineV1,
): void {
  const {
    beforeMount,
    afterMountMovement,
    afterDismountMovement,
    afterReset,
  } = timeline;
  assert.equal(beforeMount.phase, "before-mount");
  assert.equal(afterMountMovement.phase, "after-mount-movement");
  assert.equal(afterDismountMovement.phase, "after-dismount-movement");
  assert.equal(afterReset.phase, "after-reset");
  assert.equal(afterMountMovement.runtimeSessionId, beforeMount.runtimeSessionId);
  assert.equal(afterDismountMovement.runtimeSessionId, beforeMount.runtimeSessionId);
  assert.equal(afterReset.runtimeSessionId, beforeMount.runtimeSessionId);
  assert.equal(afterMountMovement.worldSessionId, beforeMount.worldSessionId);
  assert.equal(afterDismountMovement.worldSessionId, beforeMount.worldSessionId);
  assert.notEqual(
    afterReset.worldSessionId,
    beforeMount.worldSessionId,
    "MOUNTED_CAPTURE_RESET_WORLD_SESSION_REUSED",
  );
  assert.equal(
    beforeMount.simulationTick,
    1,
    "MOUNTED_CAPTURE_SUPPORT_BASELINE_NOT_PRIMED",
  );
  assert.ok(
    afterMountMovement.simulationTick > beforeMount.simulationTick,
    "Mounted movement did not advance the committed fixed Tick.",
  );
  assert.ok(
    afterDismountMovement.simulationTick > afterMountMovement.simulationTick,
    "Dismounted movement did not advance the committed fixed Tick.",
  );
  assert.equal(afterReset.simulationTick, 0);

  assert.equal(beforeMount.mountedOnPresent, false);
  assert.equal(beforeMount.controlledEntityId, RIDER_ENTITY_ID);
  assert.equal(beforeMount.cameraTargetEntityId, RIDER_ENTITY_ID);
  assert.deepEqual(beforeMount.activeCameraModifierRefs, []);

  const requireFact = (
    observation: MountedCapturePhaseObservationV1,
    supportedEntityId: string,
  ) => {
    const matches = observation.supportedByFacts.filter((fact) =>
      fact.supportedEntityId === supportedEntityId
    );
    assert.equal(
      matches.length,
      1,
      `MOUNTED_CAPTURE_SUPPORT_FACT_CARDINALITY:${observation.phase}:${supportedEntityId}`,
    );
    return matches[0]!;
  };
  const supportIdentity = (
    fact: MountedCapturePhaseObservationV1["supportedByFacts"][number],
  ) => ({
    supportSurfaceEntityId: fact.supportSurfaceEntityId,
    supportTraversalSurfaceId: fact.supportTraversalSurfaceId,
    supportColliderSubshapeId: fact.supportColliderSubshapeId,
  });
  const projectorProfile = (
    fact: MountedCapturePhaseObservationV1["supportedByFacts"][number],
  ) => ({
    semanticFactProjectorProfileRef: fact.semanticFactProjectorProfileRef,
    semanticFactProjectorProfileHash: fact.semanticFactProjectorProfileHash,
  });
  const riderBeforeFact = requireFact(beforeMount, RIDER_ENTITY_ID);
  const boardBeforeFact = requireFact(
    beforeMount,
    MOUNTED_SKATEBOARD_S1_BOARD_ENTITY_ID,
  );

  assert.equal(afterMountMovement.mountedOnPresent, true);
  assert.equal(
    afterMountMovement.controlledEntityId,
    MOUNTED_SKATEBOARD_S1_BOARD_ENTITY_ID,
  );
  assert.equal(
    afterMountMovement.cameraTargetEntityId,
    MOUNTED_SKATEBOARD_S1_BOARD_ENTITY_ID,
  );
  assert.deepEqual(afterMountMovement.activeCameraModifierRefs, [
    MOUNTED_CAMERA_MODIFIER_REF,
  ]);
  assert.deepEqual(
    afterMountMovement.supportedByFacts.map((fact) => fact.supportedEntityId),
    [MOUNTED_SKATEBOARD_S1_BOARD_ENTITY_ID],
    "Mounted support facts must come from the moving board, never the suspended Rider.",
  );
  const boardMountedFact = requireFact(
    afterMountMovement,
    MOUNTED_SKATEBOARD_S1_BOARD_ENTITY_ID,
  );
  assert.deepEqual(
    supportIdentity(boardMountedFact),
    supportIdentity(boardBeforeFact),
    "MOUNTED_CAPTURE_SUPPORT_IDENTITY_CHANGED",
  );
  assert.deepEqual(
    projectorProfile(boardMountedFact),
    projectorProfile(boardBeforeFact),
    "MOUNTED_CAPTURE_PROJECTOR_PROFILE_CHANGED",
  );
  assert.equal(
    boardMountedFact.id,
    boardBeforeFact.id,
    "MOUNTED_CAPTURE_BOARD_EPISODE_CHANGED",
  );
  assert.equal(
    boardMountedFact.startedSimulationTick,
    boardBeforeFact.startedSimulationTick,
    "MOUNTED_CAPTURE_BOARD_EPISODE_CHANGED",
  );
  assert.ok(
    planarDistanceMeters(
      afterMountMovement.boardPositionMetersXYZ,
      beforeMount.boardPositionMetersXYZ,
    ) > MINIMUM_MOVEMENT_METERS,
    "The possessed skateboard did not move after Mount.",
  );
  assert.ok(
    planarDistanceMeters(
      afterMountMovement.riderPositionMetersXYZ,
      afterMountMovement.boardPositionMetersXYZ,
    ) <= MAXIMUM_RIDER_BOARD_XZ_SEPARATION_METERS,
    "The mounted Rider did not follow the committed skateboard pose.",
  );

  assert.equal(afterDismountMovement.mountedOnPresent, false);
  assert.equal(afterDismountMovement.controlledEntityId, RIDER_ENTITY_ID);
  assert.equal(afterDismountMovement.cameraTargetEntityId, RIDER_ENTITY_ID);
  assert.deepEqual(afterDismountMovement.activeCameraModifierRefs, []);
  assert.deepEqual(
    afterDismountMovement.supportedByFacts.map((fact) =>
      fact.supportedEntityId
    ),
    [RIDER_ENTITY_ID, MOUNTED_SKATEBOARD_S1_BOARD_ENTITY_ID].sort(),
    "A dismounted Rider may publish support only after its independent fixed Tick.",
  );
  const riderDismountedFact = requireFact(
    afterDismountMovement,
    RIDER_ENTITY_ID,
  );
  const boardDismountedFact = requireFact(
    afterDismountMovement,
    MOUNTED_SKATEBOARD_S1_BOARD_ENTITY_ID,
  );
  assert.deepEqual(
    supportIdentity(boardDismountedFact),
    supportIdentity(boardBeforeFact),
    "MOUNTED_CAPTURE_SUPPORT_IDENTITY_CHANGED",
  );
  assert.deepEqual(
    projectorProfile(boardDismountedFact),
    projectorProfile(boardBeforeFact),
    "MOUNTED_CAPTURE_PROJECTOR_PROFILE_CHANGED",
  );
  assert.equal(
    boardDismountedFact.id,
    boardBeforeFact.id,
    "MOUNTED_CAPTURE_BOARD_EPISODE_CHANGED",
  );
  assert.equal(
    boardDismountedFact.startedSimulationTick,
    boardBeforeFact.startedSimulationTick,
    "MOUNTED_CAPTURE_BOARD_EPISODE_CHANGED",
  );
  assert.deepEqual(
    supportIdentity(riderDismountedFact),
    supportIdentity(riderBeforeFact),
    "MOUNTED_CAPTURE_SUPPORT_IDENTITY_CHANGED",
  );
  assert.deepEqual(
    projectorProfile(riderDismountedFact),
    projectorProfile(riderBeforeFact),
    "MOUNTED_CAPTURE_PROJECTOR_PROFILE_CHANGED",
  );
  assert.notEqual(
    riderDismountedFact.id,
    riderBeforeFact.id,
    "MOUNTED_CAPTURE_RIDER_EPISODE_NOT_RESTARTED",
  );
  assert.ok(
    riderDismountedFact.startedSimulationTick >
      riderBeforeFact.startedSimulationTick &&
      riderDismountedFact.startedSimulationTick <=
        afterDismountMovement.simulationTick,
    "MOUNTED_CAPTURE_RIDER_EPISODE_NOT_RESTARTED",
  );
  assert.ok(
    planarDistanceMeters(
      afterDismountMovement.riderPositionMetersXYZ,
      timeline.riderPositionAfterDismountCommandMetersXYZ,
    ) > MINIMUM_MOVEMENT_METERS,
    "The Rider did not move independently after Dismount.",
  );

  assert.equal(afterReset.mountedOnPresent, false);
  assert.equal(afterReset.controlledEntityId, RIDER_ENTITY_ID);
  assert.equal(afterReset.cameraTargetEntityId, RIDER_ENTITY_ID);
  assert.deepEqual(afterReset.activeCameraModifierRefs, []);
  assert.ok(
    afterReset.supportedByFacts.length > 0,
    "MOUNTED_CAPTURE_RESET_FACTS_MISSING",
  );
  assert.ok(
    afterReset.supportedByFacts.every((fact) =>
      fact.startedSimulationTick === 0
    ),
    "Reset retained a semantic Fact episode from the prior WorldSession.",
  );
  const boardResetFact = requireFact(
    afterReset,
    MOUNTED_SKATEBOARD_S1_BOARD_ENTITY_ID,
  );
  assert.deepEqual(
    supportIdentity(boardResetFact),
    supportIdentity(boardBeforeFact),
    "MOUNTED_CAPTURE_SUPPORT_IDENTITY_CHANGED",
  );
  assert.deepEqual(
    projectorProfile(boardResetFact),
    projectorProfile(boardBeforeFact),
    "MOUNTED_CAPTURE_PROJECTOR_PROFILE_CHANGED",
  );
  assert.deepEqual(
    afterReset.riderPositionMetersXYZ,
    beforeMount.riderPositionMetersXYZ,
    "Reset did not restore the Rider spawn.",
  );
  assert.deepEqual(
    afterReset.boardPositionMetersXYZ,
    beforeMount.boardPositionMetersXYZ,
    "Reset did not restore the skateboard spawn.",
  );
  const preResetEventIds = new Set([
    ...beforeMount.eventIds,
    ...afterMountMovement.eventIds,
    ...afterDismountMovement.eventIds,
  ]);
  assert.ok(
    afterReset.eventIds.every((eventId) => !preResetEventIds.has(eventId)),
    "MOUNTED_CAPTURE_POST_RESET_EVENT_LEAKAGE",
  );
}

async function fixedMountedAuthoringSource(): Promise<AuthoringSpecV4> {
  const parsed = parseAuthoringSpecV4(await readFile(new URL(
    "../../examples/traversal/r1-heightfield/success.json",
    import.meta.url,
  ), "utf8"));
  assert.equal(parsed.ok, true, JSON.stringify(parsed.diagnostics));
  assert.ok(parsed.value !== undefined);
  const source = parsed.value;
  return {
    ...source,
    id: MOUNTED_SKATEBOARD_S1_SCENE_ID,
    seed: 8_260_801,
    nodes: source.nodes.map((node) =>
      node.kind === "terrain"
        ? {
            ...node,
            components: {
              terrain: {
                ...node.components.terrain,
                source: { kind: "procedural", relief: "flat" },
              },
            },
          }
        : node
    ),
  };
}

function mountedCaptureTake(
  id: string,
  worldState: WorldStateSnapshotV1,
  captureTicks: readonly number[],
): SimulationTakeV1 {
  return {
    kind: "worldkit-simulation-take",
    schemaVersion: 1,
    id,
    worldPackageRef: worldState.worldPackageRef,
    worldPackageRootHash: worldState.worldPackageRootHash,
    worldBuildIdentityHash: worldState.worldBuildIdentityHash,
    seed: 8_260_801,
    simulationTickRate: { numeratorTicks: 60, denominatorSeconds: 1 },
    startTick: 0,
    endTickExclusive: Math.max(...captureTicks) + 1,
    controllers: [{
      id: CONTROLLER_ENTITY_ID,
      kind: "scripted",
      controlledEntityId: RIDER_ENTITY_ID,
      controlProfileRef:
        "worldkit://control-profile/planar.camera-relative@1",
      initialSequence: 0,
    }],
    tracks: [{
      id: `${id}.neutral-control`,
      kind: "control-intent",
      controllerId: CONTROLLER_ENTITY_ID,
      interpolation: "step",
      keyframes: [{
        tick: 0,
        moveAxesXZ: [0, 0],
        runEnabled: false,
        jumpPressed: false,
      }],
    }],
    captureSchedule: {
      kind: "explicit-ticks",
      captureTicks,
      renderInterpolation: { kind: "none" },
    },
    captureProfileRef: "worldkit://capture/profile/control-video@1",
    captureEncodingProfileRef:
      "worldkit://capture/encoding/web-v1@1",
  };
}

async function allWorldSessionEvents(
  page: Page,
): Promise<readonly WorldSessionEventV1[]> {
  const result = await page.evaluate((maximumEventCount) =>
    window.__WORLDKIT__!.getWorldSessionEvents({
      afterEventSequence: 0,
      maximumEventCount,
    }), WORLDKIT_WORLD_SESSION_EVENT_PAGE_MAXIMUM_COUNT);
  assert.equal(result.hasMore, false, "Mounted verifier exceeded one Event page.");
  return result.events;
}

async function executeCommittedGameplayCommand(
  page: Page,
  command: GameplayCommandV1,
): Promise<JournalTransitionEvidenceV1> {
  const evidence = await page.evaluate(async ({ input, maximumEventCount }) => {
    const api = window.__WORLDKIT__!;
    const receipt = await api.executeGameplayCommand(input);
    if (receipt.status !== "committed") return { receipt };
    const eventPage = api.getWorldSessionEvents({
      afterEventSequence: 0,
      maximumEventCount,
    });
    return {
      receipt,
      worldSessionEvents: eventPage.events,
      hasMore: eventPage.hasMore,
      worldStateAfter: api.getWorldStateSnapshot({
        worldStateRef: receipt.worldStateAfterRef,
      }),
      gameplayInspectionAfter: api.getGameplayInspectionSnapshot(),
    };
  }, {
    input: command,
    maximumEventCount: WORLDKIT_WORLD_SESSION_EVENT_PAGE_MAXIMUM_COUNT,
  });
  assert.equal(evidence.receipt.status, "committed", JSON.stringify(evidence.receipt));
  assert.equal("hasMore" in evidence ? evidence.hasMore : true, false);
  assert.ok("worldSessionEvents" in evidence);
  assert.ok("worldStateAfter" in evidence);
  assert.ok("gameplayInspectionAfter" in evidence);
  return {
    command,
    receipt: evidence.receipt as Extract<
      GameplayCommandReceiptV1,
      { status: "committed" }
    >,
    worldSessionEvents: evidence.worldSessionEvents,
    worldStateAfter: evidence.worldStateAfter,
    gameplayInspectionAfter: evidence.gameplayInspectionAfter,
  };
}

async function captureFrame(
  page: Page,
  captureFrameIndex: number,
  expectedSimulationTick: number,
): Promise<Readonly<{
  runtimeFrame: RuntimeControlCaptureFrameV1;
  worldState: WorldStateSnapshotV1;
  writerFrame: ControlCaptureBundleFrameInputV1;
}>> {
  const captured = await page.evaluate(async ({
    captureFrameIndex,
    expectedSimulationTick,
    widthPixels,
    heightPixels,
  }) => {
    const api = window.__WORLDKIT__!;
    await api.waitForSimulationTick(expectedSimulationTick);
    const renderReady = await api.waitForRenderReady(expectedSimulationTick);
    const runtimeFrame = await api.captureControlFrame({
      captureFrameIndex,
      expectedSimulationTick,
      renderReadyReceiptId: renderReady.id,
      widthPixels,
      heightPixels,
    });
    return {
      runtimeFrame,
      worldState: api.getWorldStateSnapshot({
        worldStateRef: runtimeFrame.snapshot.world.worldStateRef,
      }),
    };
  }, {
    captureFrameIndex,
    expectedSimulationTick,
    widthPixels: CAPTURE_WIDTH_PIXELS,
    heightPixels: CAPTURE_HEIGHT_PIXELS,
  });
  const { runtimeFrame, worldState } = captured;
  const writerFrame: ControlCaptureBundleFrameInputV1 = {
    runtimeSessionId: runtimeFrame.runtimeSessionId,
    captureFrameIndex: runtimeFrame.captureFrameIndex,
    simulationTick: runtimeFrame.simulationTick,
    renderFrameIndex: runtimeFrame.renderFrameIndex,
    renderReadyReceiptId: runtimeFrame.renderReadyReceiptId,
    widthPixels: runtimeFrame.widthPixels,
    heightPixels: runtimeFrame.heightPixels,
    camera: runtimeFrame.camera,
    snapshot: runtimeFrame.snapshot,
    worldState,
    passesById: Object.fromEntries(
      Object.entries(runtimeFrame.passesById).map(([passId, pass]) => [
        passId,
        {
          passId: pass.passId,
          bytes: new Uint8Array(Buffer.from(pass.bytesBase64, "base64")),
        },
      ]),
    ),
  };
  return { runtimeFrame, worldState, writerFrame };
}

async function acquireCaptureActivity(
  page: Page,
  worldSessionId: string,
): Promise<string> {
  const requestId = `activity:mounted-skateboard-capture:${worldSessionId}`;
  const receipt = await page.evaluate(({ requestId, worldSessionId }) =>
    window.__WORLDKIT__!.acquireRuntimeActivity({
      schemaVersion: 1,
      id: requestId,
      activityKind: "simulation-take",
      expectedWorldSessionId: worldSessionId,
    }), { requestId, worldSessionId });
  assert.equal(receipt.status, "active", JSON.stringify(receipt));
  return requestId;
}

async function releaseCaptureActivity(
  page: Page,
  requestId: string,
  worldSessionId: string,
): Promise<void> {
  const receipt = await page.evaluate(({ requestId, worldSessionId }) =>
    window.__WORLDKIT__!.releaseRuntimeActivity({
      schemaVersion: 1,
      id: requestId,
      activityKind: "simulation-take",
      expectedWorldSessionId: worldSessionId,
    }), { requestId, worldSessionId });
  assert.equal(receipt.status, "released", JSON.stringify(receipt));
}

async function ndjsonRowCount(filePath: string): Promise<number> {
  const text = await readFile(filePath, "utf8");
  return text.trim() === "" ? 0 : text.trim().split("\n").length;
}

async function readNdjsonRows(filePath: string): Promise<readonly unknown[]> {
  const text = await readFile(filePath, "utf8");
  return text.trim() === ""
    ? []
    : text.trim().split("\n").map((line) => JSON.parse(line));
}

function lastReceiptEventSequence(
  transition: JournalTransitionEvidenceV1,
): number {
  const receiptEventIds = new Set(transition.receipt.eventIds);
  const events = transition.worldSessionEvents.filter(({ id }) =>
    receiptEventIds.has(id)
  );
  assert.equal(events.length, transition.receipt.eventIds.length);
  return Math.max(...events.map(({ sequence }) => sequence));
}

async function run(): Promise<void> {
  const retainedOutput = process.env.WORLDKIT_VERIFY_ARTIFACTS_DIR;
  const rootDirectory = retainedOutput === undefined
    ? await mkdtemp(path.join(tmpdir(), "worldkit-mounted-capture-"))
    : path.resolve(retainedOutput);
  const shouldCleanup = retainedOutput === undefined;
  const sourcePath = path.join(rootDirectory, "mounted-skateboard-s1.world.json");
  const preResetBundleDirectory = path.join(rootDirectory, "pre-reset.bundle");
  const postResetBundleDirectory = path.join(rootDirectory, "post-reset.bundle");
  let server: Awaited<ReturnType<typeof startWorldkitServer>> | undefined;
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let primaryError: unknown;
  try {
    await mkdir(rootDirectory, { recursive: true });
    const fixedSource = await fixedMountedAuthoringSource();
    const normalized = normalizeAuthoringSpecV4(
      augmentMountedSkateboardS1AuthoringSpecV1(fixedSource),
    );
    assert.equal(normalized.ok, true, JSON.stringify(normalized.diagnostics));
    assert.ok(normalized.value !== undefined);
    assert.ok(normalized.normalizedWorldIrHash !== undefined);
    await writeFile(
      sourcePath,
      `${stringifyCanonicalJson(fixedSource)}\n`,
      "utf8",
    );
    server = await startWorldkitServer({
      source: { kind: "canonical-file", inputPath: sourcePath },
    });
    browser = await launchChromiumWithSystemFallback();
    context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    await page.goto(server.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForFunction(
      () => window.__WORLDKIT__ !== undefined,
      undefined,
      { timeout: 60_000 },
    );
    const initialResult = await page.evaluate(async () => {
      const api = window.__WORLDKIT__!;
      try {
        const ready = await api.ready();
        return {
          ok: true as const,
          snapshot: api.setPaused(true).worldSessionId === ready.worldSessionId
            ? api.getSnapshot()
            : ready,
        };
      } catch (error) {
        return {
          ok: false as const,
          message: error instanceof Error ? error.message : String(error),
          diagnostics: api.getDiagnostics(),
        };
      }
    });
    if (!initialResult.ok) {
      throw new Error(`Mounted runtime failed to start: ${initialResult.message}`);
    }
    const initial = initialResult.snapshot;
    assert.equal(initial.runtime.phase, "ready");
    assert.equal(initial.resources.phase, "ready");
    const preActivityId = await acquireCaptureActivity(page, initial.worldSessionId);
    await page.evaluate(() => window.__WORLDKIT__!.runFixedInput([{
      actions: [],
      ticks: 1,
    }]));
    const beforeMountFrame = await captureFrame(page, 0, 1);
    const initialWorldState = beforeMountFrame.worldState;
    const initialEvents = await allWorldSessionEvents(page);

    const preResetWriter = await createControlCaptureBundleWriterV1({
      outputDirectory: preResetBundleDirectory,
      bundleId: "mounted-skateboard-s1.pre-reset",
      compiledTake: compileSimulationTakeV1(mountedCaptureTake(
        "mounted-skateboard-s1.pre-reset",
        initialWorldState,
        [1, FIXED_MOVEMENT_TICKS + 1, FIXED_MOVEMENT_TICKS * 2 + 1],
      )),
      worldPackageIdentity: {
        worldPackageRef: initialWorldState.worldPackageRef,
        worldPackageRootHash: initialWorldState.worldPackageRootHash,
        normalizedWorldIrHash:
          normalized.normalizedWorldIrHash as Sha256HashV1,
        worldBuildIdentityHash: initialWorldState.worldBuildIdentityHash,
      },
      runtimeSessionId: initial.runtimeSessionId,
      worldSessionId: initial.worldSessionId,
      semanticClasses: beforeMountFrame.runtimeFrame.semanticClasses,
      instances: beforeMountFrame.runtimeFrame.instances,
    });
    await preResetWriter.appendFrame(beforeMountFrame.writerFrame);

    const mountCommand = parseGameplayCommandV1({
      schemaVersion: 1,
      id: MOUNTED_SKATEBOARD_S1_MOUNT_COMMAND_ID,
      type: "action.activate",
      runtimeSessionId: initial.runtimeSessionId,
      worldSessionId: initial.worldSessionId,
      controllerEntityId: CONTROLLER_ENTITY_ID,
      expectedPossession: {
        mode: "possessed",
        controlledEntityId: RIDER_ENTITY_ID,
      },
      actionExecutionId: "action-execution.mounted-capture.mount",
      semanticActionRef: MOUNTED_SKATEBOARD_S1_MOUNT_ACTION_REF,
      actorEntityId: RIDER_ENTITY_ID,
      actionRequestRef: MOUNTED_SKATEBOARD_S1_MOUNT_REQUEST_REF,
      actionRequestHash:
        sha256CanonicalJson(MOUNTED_SKATEBOARD_S1_MOUNT_REQUEST),
    });
    const mountTransition = await executeCommittedGameplayCommand(
      page,
      mountCommand,
    );
    preResetWriter.appendRuntimeHostJournalTransition({
      captureFrameIndexAfter: 1,
      ...mountTransition,
    });
    await page.evaluate((ticks) =>
      window.__WORLDKIT__!.runFixedInput([{
        actions: ["move-forward"],
        ticks,
      }]), FIXED_MOVEMENT_TICKS);
    const afterMountEvents = await allWorldSessionEvents(page);
    const afterMountFrame = await captureFrame(
      page,
      1,
      FIXED_MOVEMENT_TICKS + 1,
    );
    const mountedWorldState = afterMountFrame.worldState;
    preResetWriter.appendRuntimeHostFixedTickJournal({
      captureFrameIndexAfter: 1,
      afterEventSequenceExclusive: lastReceiptEventSequence(mountTransition),
      worldSessionEvents: afterMountEvents,
      worldStateAfter: mountedWorldState,
      gameplayInspectionAfter:
        afterMountFrame.runtimeFrame.snapshot.world.gameplayInspection,
    });
    await preResetWriter.appendFrame(afterMountFrame.writerFrame);

    const dismountCommand = parseGameplayCommandV1({
      schemaVersion: 1,
      id: MOUNTED_SKATEBOARD_S1_DISMOUNT_COMMAND_ID,
      type: "action.activate",
      runtimeSessionId: initial.runtimeSessionId,
      worldSessionId: initial.worldSessionId,
      controllerEntityId: CONTROLLER_ENTITY_ID,
      expectedPossession: {
        mode: "possessed",
        controlledEntityId: MOUNTED_SKATEBOARD_S1_BOARD_ENTITY_ID,
      },
      actionExecutionId: "action-execution.mounted-capture.dismount",
      semanticActionRef: MOUNTED_SKATEBOARD_S1_DISMOUNT_ACTION_REF,
      actorEntityId: RIDER_ENTITY_ID,
      actionRequestRef: MOUNTED_SKATEBOARD_S1_DISMOUNT_REQUEST_REF,
      actionRequestHash:
        sha256CanonicalJson(MOUNTED_SKATEBOARD_S1_DISMOUNT_REQUEST),
    });
    const dismountTransition = await executeCommittedGameplayCommand(
      page,
      dismountCommand,
    );
    preResetWriter.appendRuntimeHostJournalTransition({
      captureFrameIndexAfter: 2,
      ...dismountTransition,
    });
    const afterDismountCommand = await page.evaluate(() =>
      window.__WORLDKIT__!.getSnapshot());
    await page.evaluate((ticks) =>
      window.__WORLDKIT__!.runFixedInput([{
        actions: ["move-forward"],
        ticks,
      }]), FIXED_MOVEMENT_TICKS);
    const afterDismountEvents = await allWorldSessionEvents(page);
    const afterDismountFrame = await captureFrame(
      page,
      2,
      FIXED_MOVEMENT_TICKS * 2 + 1,
    );
    const dismountedWorldState = afterDismountFrame.worldState;
    preResetWriter.appendRuntimeHostFixedTickJournal({
      captureFrameIndexAfter: 2,
      afterEventSequenceExclusive:
        lastReceiptEventSequence(dismountTransition),
      worldSessionEvents: afterDismountEvents,
      worldStateAfter: dismountedWorldState,
      gameplayInspectionAfter:
        afterDismountFrame.runtimeFrame.snapshot.world.gameplayInspection,
    });
    await preResetWriter.appendFrame(afterDismountFrame.writerFrame);
    const preResetFinalized = await preResetWriter.finalize();
    const preResetValidation = await validateControlCaptureBundleV1(
      preResetBundleDirectory,
    );
    assert.equal(preResetValidation.ok, true, JSON.stringify(preResetValidation));
    await releaseCaptureActivity(page, preActivityId, initial.worldSessionId);

    const preResetEvents = await allWorldSessionEvents(page);
    const reset = await page.evaluate(async () => window.__WORLDKIT__!.reset());
    assert.notEqual(reset.worldSessionId, initial.worldSessionId);
    const resetEvents = await allWorldSessionEvents(page);
    const postActivityId = await acquireCaptureActivity(page, reset.worldSessionId);
    const afterResetFrame = await captureFrame(page, 0, 0);
    const resetWorldState = afterResetFrame.worldState;
    const postResetWriter = await createControlCaptureBundleWriterV1({
      outputDirectory: postResetBundleDirectory,
      bundleId: "mounted-skateboard-s1.post-reset",
      compiledTake: compileSimulationTakeV1(mountedCaptureTake(
        "mounted-skateboard-s1.post-reset",
        resetWorldState,
        [0],
      )),
      worldPackageIdentity: {
        worldPackageRef: resetWorldState.worldPackageRef,
        worldPackageRootHash: resetWorldState.worldPackageRootHash,
        normalizedWorldIrHash:
          normalized.normalizedWorldIrHash as Sha256HashV1,
        worldBuildIdentityHash: resetWorldState.worldBuildIdentityHash,
      },
      runtimeSessionId: reset.runtimeSessionId,
      worldSessionId: reset.worldSessionId,
      semanticClasses: afterResetFrame.runtimeFrame.semanticClasses,
      instances: afterResetFrame.runtimeFrame.instances,
    });

    let foreignJournalRejection = "";
    try {
      postResetWriter.appendRuntimeHostJournalTransition({
        captureFrameIndexAfter: 0,
        ...mountTransition,
      });
    } catch (error) {
      foreignJournalRejection = error instanceof Error
        ? error.message
        : String(error);
    }
    assert.match(
      foreignJournalRejection,
      /CAPTURE_GAMEPLAY_REFERENCE_MISMATCH/,
      "The post-Reset Bundle accepted a prior WorldSession journal transition.",
    );

    const staleCommandReceipt = await page.evaluate((command) =>
      window.__WORLDKIT__!.executeGameplayCommand(command), mountCommand);
    assert.equal(staleCommandReceipt.status, "rejected");
    if (staleCommandReceipt.status !== "rejected") {
      throw new Error("Expected stale Mount command rejection after Reset.");
    }
    assert.equal(staleCommandReceipt.diagnostic.code, "WORLD_SESSION_STALE");
    const oldWorldStateLookup = await page.evaluate((worldStateRef) => {
      try {
        window.__WORLDKIT__!.getWorldStateSnapshot({ worldStateRef });
        return { found: true, message: "" };
      } catch (error) {
        return {
          found: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    }, mountTransition.receipt.worldStateAfterRef);
    assert.equal(oldWorldStateLookup.found, false);
    assert.match(
      oldWorldStateLookup.message,
      /World State snapshot is not retained in the active World Session/,
    );

    await postResetWriter.appendFrame(afterResetFrame.writerFrame);
    const postResetFinalized = await postResetWriter.finalize();
    const postResetValidation = await validateControlCaptureBundleV1(
      postResetBundleDirectory,
    );
    assert.equal(postResetValidation.ok, true, JSON.stringify(postResetValidation));
    await releaseCaptureActivity(page, postActivityId, reset.worldSessionId);

    const timeline: MountedCaptureTimelineV1 = {
      beforeMount: observePhase(
        "before-mount",
        beforeMountFrame.runtimeFrame.snapshot,
        initialWorldState,
        initialEvents,
      ),
      afterMountMovement: observePhase(
        "after-mount-movement",
        afterMountFrame.runtimeFrame.snapshot,
        mountedWorldState,
        afterMountEvents,
      ),
      afterDismountMovement: observePhase(
        "after-dismount-movement",
        afterDismountFrame.runtimeFrame.snapshot,
        dismountedWorldState,
        preResetEvents,
      ),
      afterReset: observePhase(
        "after-reset",
        afterResetFrame.runtimeFrame.snapshot,
        resetWorldState,
        resetEvents,
      ),
      riderPositionAfterDismountCommandMetersXYZ: requireSubjectPosition(
        afterDismountCommand,
        RIDER_ENTITY_ID,
      ),
    };
    assertMountedSkateboardCaptureTimelineV1(timeline);

    const preResetEventRows = await readNdjsonRows(path.join(
      preResetBundleDirectory,
      "tracks/events.ndjson",
    ));
    const preResetEventsFromBundle = preResetEventRows.flatMap((row) => {
      assert.ok(
        typeof row === "object" && row !== null && "event" in row,
        "Capture Event row is malformed.",
      );
      try {
        return [parseGameplayEventV1(
          (row as { readonly event: unknown }).event,
        )];
      } catch {
        return [];
      }
    });
    const eventTypeCounts = preResetEventsFromBundle.reduce<
      Record<GameplayEventV1["type"], number>
    >((counts, event) => {
      counts[event.type] += 1;
      return counts;
    }, {
      "relationship.committed": 0,
      "relationship.removed": 0,
      "action.started": 0,
      "action.completed": 0,
      "action.cancelled": 0,
      "action.failed": 0,
      "semantic-fact.started": 0,
      "semantic-fact.ended": 0,
      "world.failed": 0,
    });
    const cameraEventRowCount =
      preResetEventRows.length - preResetEventsFromBundle.length;
    assert.equal(cameraEventRowCount, 2);
    assert.deepEqual(eventTypeCounts, {
      "relationship.committed": 3,
      "relationship.removed": 3,
      "action.started": 2,
      "action.completed": 2,
      "action.cancelled": 0,
      "action.failed": 0,
      "semantic-fact.started": 1,
      "semantic-fact.ended": 1,
      "world.failed": 0,
    });
    const fixedTickGameplayEvents = preResetEventRows.flatMap((row) => {
      if (
        typeof row !== "object" || row === null ||
        !("source" in row) ||
        (row as { source?: { kind?: unknown } }).source?.kind !== "fixed-tick" ||
        !("event" in row)
      ) return [];
      try {
        return [parseGameplayEventV1(
          (row as { readonly event: unknown }).event,
        )];
      } catch {
        return [];
      }
    });
    assert.equal(fixedTickGameplayEvents.length, 2);
    const endedRiderFactEvent = preResetEventsFromBundle.find((event) =>
      event.type === "semantic-fact.ended" &&
      event.semanticFact.type === "supportedBy" &&
      event.semanticFact.supportedEntityId === RIDER_ENTITY_ID
    );
    const startedRiderFactEvent = preResetEventsFromBundle.find((event) =>
      event.type === "semantic-fact.started" &&
      event.semanticFact.type === "supportedBy" &&
      event.semanticFact.supportedEntityId === RIDER_ENTITY_ID
    );
    assert.ok(endedRiderFactEvent?.type === "semantic-fact.ended");
    assert.ok(startedRiderFactEvent?.type === "semantic-fact.started");
    const riderBeforeFact = Object.values(initialWorldState.semanticFactsById)
      .find((fact) =>
        fact.type === "supportedBy" &&
        fact.supportedEntityId === RIDER_ENTITY_ID
      );
    const riderDismountedFact = Object.values(
      dismountedWorldState.semanticFactsById,
    ).find((fact) =>
      fact.type === "supportedBy" &&
      fact.supportedEntityId === RIDER_ENTITY_ID
    );
    assert.ok(riderBeforeFact?.type === "supportedBy");
    assert.ok(riderDismountedFact?.type === "supportedBy");
    assert.ok(endedRiderFactEvent.semanticFact.type === "supportedBy");
    assert.ok(startedRiderFactEvent.semanticFact.type === "supportedBy");
    assert.deepEqual(
      supportedByEpisodeIdentity(endedRiderFactEvent.semanticFact),
      supportedByEpisodeIdentity(riderBeforeFact),
    );
    assert.deepEqual(
      supportedByEpisodeIdentity(startedRiderFactEvent.semanticFact),
      supportedByEpisodeIdentity(riderDismountedFact),
    );
    const postResetEventRows = await readNdjsonRows(path.join(
      postResetBundleDirectory,
      "tracks/events.ndjson",
    ));
    assert.equal(postResetEventRows.length, 0);
    assert.equal(resetEvents.length, 1);
    const resetBaselineEvent = parseGameplayEventV1(resetEvents[0]);
    assert.equal(resetBaselineEvent.type, "relationship.committed");
    assert.equal(resetBaselineEvent.sequence, 1);
    assert.equal(resetBaselineEvent.simulationTick, 0);
    assert.equal(resetBaselineEvent.worldSessionId, resetWorldState.worldSessionId);
    assert.equal(resetWorldState.lastEventSequence, 1);

    const preResetByteEvidence =
      await collectControlCaptureBundleByteEvidenceV1(preResetBundleDirectory);
    const postResetByteEvidence =
      await collectControlCaptureBundleByteEvidenceV1(postResetBundleDirectory);
    const report = {
      kind: "mounted-skateboard-capture-verification",
      schemaVersion: 1,
      ok: true,
      generatedAt: new Date().toISOString(),
      source: {
        mode: "host-fixed-canonical-authoring",
        path: sourcePath,
        sceneId: MOUNTED_SKATEBOARD_S1_SCENE_ID,
        normalizedWorldIrHash: normalized.normalizedWorldIrHash,
      },
      timeline,
      bundles: {
        preReset: {
          path: preResetBundleDirectory,
          frameCount: preResetFinalized.frameCount,
          bundleRootHash: preResetFinalized.bundleRootHash,
          bundleDirectoryHash: preResetByteEvidence.bundleDirectoryHash,
          actionRowCount: await ndjsonRowCount(path.join(
            preResetBundleDirectory,
            "tracks/actions.ndjson",
          )),
          eventRowCount: await ndjsonRowCount(path.join(
            preResetBundleDirectory,
            "tracks/events.ndjson",
          )),
          eventTypeCounts,
          relationshipRowCount: await ndjsonRowCount(path.join(
            preResetBundleDirectory,
            "tracks/relationships.ndjson",
          )),
        },
        postReset: {
          path: postResetBundleDirectory,
          frameCount: postResetFinalized.frameCount,
          bundleRootHash: postResetFinalized.bundleRootHash,
          bundleDirectoryHash: postResetByteEvidence.bundleDirectoryHash,
          actionRowCount: await ndjsonRowCount(path.join(
            postResetBundleDirectory,
            "tracks/actions.ndjson",
          )),
          eventRowCount: await ndjsonRowCount(path.join(
            postResetBundleDirectory,
            "tracks/events.ndjson",
          )),
          relationshipRowCount: await ndjsonRowCount(path.join(
            postResetBundleDirectory,
            "tracks/relationships.ndjson",
          )),
        },
      },
      sessionIsolation: {
        foreignJournalRejection,
        staleCommandDiagnosticCode: staleCommandReceipt.diagnostic.code,
        oldWorldStateLookupRejected: true,
      },
      cameraEvidenceSource: "committed-runtime-snapshot",
      retained: !shouldCleanup,
    };
    assert.equal(report.bundles.preReset.frameCount, 3);
    assert.equal(report.bundles.preReset.actionRowCount, 2);
    assert.equal(
      report.bundles.preReset.eventRowCount,
      Object.values(eventTypeCounts).reduce((sum, count) => sum + count, 0) +
        cameraEventRowCount,
    );
    assert.equal(report.bundles.preReset.relationshipRowCount, 6);
    assert.equal(report.bundles.postReset.frameCount, 1);
    assert.equal(report.bundles.postReset.actionRowCount, 0);
    assert.equal(report.bundles.postReset.eventRowCount, 0);
    assert.equal(report.bundles.postReset.relationshipRowCount, 0);
    await inspectControlCaptureBundleV1(preResetBundleDirectory);
    await inspectControlCaptureBundleV1(postResetBundleDirectory);
    const reportPath = path.join(
      rootDirectory,
      "mounted-skateboard-capture-report.json",
    );
    await writeFile(
      reportPath,
      `${stringifyCanonicalJson(report)}\n`,
      "utf8",
    );
    process.stdout.write(`${JSON.stringify({ ...report, reportPath }, null, 2)}\n`);
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    const cleanupErrors: unknown[] = [];
    for (const cleanup of [
      () => context?.close(),
      () => browser?.close(),
      () => server?.stop(),
      () => shouldCleanup
        ? rm(rootDirectory, { recursive: true, force: true })
        : Promise.resolve(),
    ]) {
      try {
        await cleanup();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (primaryError === undefined && cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, "Mounted Capture cleanup failed.");
    }
  }
}

const entryPath = process.argv[1] === undefined
  ? undefined
  : pathToFileURL(path.resolve(process.argv[1])).href;
if (entryPath === import.meta.url) {
  try {
    await run();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
