import {
  deriveGameplayCommandHashV1,
  deriveGameplayCommandReceiptIdV1,
  type GameplayCommandReceiptV1,
  type GameplayCommandV1,
} from "@whitebox-world/gameplay-contracts";
import { describe, expect, it } from "vitest";

import {
  WORLDKIT_RUNTIME_SESSION_PROTOCOL_VERSION,
  WORLDKIT_RUNTIME_SESSION_REQUEST_TYPES_V1,
  canonicalRuntimeSessionEventV1,
  canonicalRuntimeSessionReceiptV1,
  deriveRuntimeSessionEventIdV1,
  deriveRuntimeSessionReceiptIdV1,
  hashRuntimeSessionRequestV1,
  parseFixedInputV1,
  parseRuntimeSessionEventV1,
  parseRuntimeSessionReceiptV1,
  parseRuntimeSessionRequestV1,
  parseWorldRuntimeSnapshotV4,
  type RuntimeSessionEventV1,
  type RuntimeSessionReceiptV1,
  type RuntimeSessionRequestV1,
  type WorldRuntimeSnapshotV4,
} from "./index";

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;

function snapshotFixture(): WorldRuntimeSnapshotV4 {
  return {
    kind: "worldkit-runtime-snapshot",
    schemaVersion: 4,
    runtimeSessionId: "runtime-session-primary",
    worldSessionId: "world-session-primary",
    world: {
      publicationEpoch: 0,
      simulationTick: 0,
      worldStateRef: "worldkit://world-state/world-state-primary",
      worldStateHash: HASH_A,
      subjectStatesByEntityId: {
        player: {
          entityState: {
            id: "player",
            kind: "spatial-entity-state",
            entityDefinitionRef:
              "worldkit://subject-definition/humanoid.third-person@1",
            entityDefinitionHash: HASH_B,
            semanticClassId: "subject.humanoid.player",
            lifecycleMode: "active",
            positionMetersXYZ: [0, 1, 2],
            rotationQuaternionXYZW: [0, 0, 0, 1],
            scaleRatioXYZ: [1, 1, 1],
            linearVelocityMetersPerSecondXYZ: [0, 0, 0],
          },
          capabilityStatesById: {
            "locomotion:player": {
              id: "locomotion:player",
              kind: "locomotion-capability-state",
              ownerEntityId: "player",
              locomotionCapabilityRef:
                "worldkit://locomotion-capability/ground.standard@1",
              locomotionCapabilityHash: HASH_A,
              mode: "idle",
              movementMedium: "ground",
              facingYawRadians: 0,
              speedMetersPerSecond: 0,
            },
          },
        },
      },
      gameplayInspection: {
        kind: "worldkit-gameplay-inspection-snapshot",
        schemaVersion: 1,
        projection: "inspection",
        id: "gameplay-inspection:world-session-primary:0",
        runtimeSessionId: "runtime-session-primary",
        worldSessionId: "world-session-primary",
        gameplayModeRef: "worldkit://gameplay-mode/outdoor.default@1",
        phase: "ready",
        simulationTick: 0,
        participantStatesById: {
          "participant-primary": {
            id: "participant-primary",
            mode: "active",
          },
        },
        controllerStatesById: {
          "controller-primary": {
            id: "controller-primary",
            participantId: "participant-primary",
          },
        },
        relationshipStatesById: {},
        activeActionStatesById: {},
        activatedGameplayFeatureRefs: [],
        lastEventSequence: 0,
      },
    },
    view: {
      viewStateRevision: 0,
      camera: { mode: "unbound" },
    },
    runtime: {
      phase: "ready",
      isPaused: false,
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

const gameplayCommand = {
  schemaVersion: 1,
  id: "gameplay-command-primary",
  runtimeSessionId: "runtime-session-primary",
  worldSessionId: "world-session-primary",
  controllerEntityId: "controller-primary",
  type: "control.bind",
  controlledEntityId: "player",
  expectedPossession: { mode: "unbound" },
} as const satisfies GameplayCommandV1;

function requestFixtures(): readonly RuntimeSessionRequestV1[] {
  return [
    {
      kind: "worldkit-runtime-session-request",
      schemaVersion: 1,
      id: "runtime-request-command",
      runtimeSessionId: "runtime-session-primary",
      type: "gameplay-command.execute",
      command: gameplayCommand,
    },
    {
      kind: "worldkit-runtime-session-request",
      schemaVersion: 1,
      id: "runtime-request-input",
      runtimeSessionId: "runtime-session-primary",
      type: "fixed-input.run",
      input: { actions: ["move-forward"], ticks: 2 },
    },
    {
      kind: "worldkit-runtime-session-request",
      schemaVersion: 1,
      id: "runtime-request-snapshot",
      runtimeSessionId: "runtime-session-primary",
      type: "snapshot.get",
    },
    {
      kind: "worldkit-runtime-session-request",
      schemaVersion: 1,
      id: "runtime-request-events",
      runtimeSessionId: "runtime-session-primary",
      type: "events.get",
      query: { afterEventSequence: 0, maximumEventCount: 32 },
    },
    {
      kind: "worldkit-runtime-session-request",
      schemaVersion: 1,
      id: "runtime-request-close",
      runtimeSessionId: "runtime-session-primary",
      type: "session.close",
    },
  ];
}

function withOwnAccessor<T extends object>(
  value: T,
  key: string,
): T {
  const result = { ...value };
  Object.defineProperty(result, key, {
    enumerable: true,
    get: () => Reflect.get(value, key),
  });
  return result;
}

describe("Runtime Session V1 public DTOs", () => {
  it("parses and deeply freezes one value for every closed Request branch", () => {
    expect(WORLDKIT_RUNTIME_SESSION_PROTOCOL_VERSION).toBe(1);
    expect(WORLDKIT_RUNTIME_SESSION_REQUEST_TYPES_V1).toEqual([
      "gameplay-command.execute",
      "fixed-input.run",
      "snapshot.get",
      "events.get",
      "session.close",
    ]);

    for (const request of requestFixtures()) {
      const parsed = parseRuntimeSessionRequestV1(request);
      expect(parsed).toEqual(request);
      expect(Object.isFrozen(parsed)).toBe(true);
    }
  });

  it("hashes the exact canonical Request domain and rejects aliases", () => {
    const request = requestFixtures()[0]!;
    const reordered = {
      command: gameplayCommand,
      type: "gameplay-command.execute",
      runtimeSessionId: "runtime-session-primary",
      id: "runtime-request-command",
      schemaVersion: 1,
      kind: "worldkit-runtime-session-request",
    };
    expect(hashRuntimeSessionRequestV1(reordered)).toBe(
      hashRuntimeSessionRequestV1(request),
    );
    expect(() => parseRuntimeSessionRequestV1({
      ...request,
      requestId: request.id,
    })).toThrow("closed RuntimeSessionRequestV1 schema");
    expect(() => parseRuntimeSessionRequestV1({
      ...request,
      type: "command.execute",
    })).toThrow("closed RuntimeSessionRequestV1 schema");
  });

  it("rejects accessor, symbol, negative-zero, and cross-branch Request inputs", () => {
    const inputRequest = requestFixtures()[1]!;
    expect(() => parseRuntimeSessionRequestV1(
      withOwnAccessor(inputRequest, "id"),
    )).toThrow("closed RuntimeSessionRequestV1 schema");
    expect(() => parseRuntimeSessionRequestV1({
      ...inputRequest,
      [Symbol("hidden")]: true,
    })).toThrow("closed RuntimeSessionRequestV1 schema");
    expect(() => parseRuntimeSessionRequestV1({
      ...inputRequest,
      input: { actions: [], ticks: -0 },
    })).toThrow("closed FixedInputV1 schema");
    expect(() => parseRuntimeSessionRequestV1({
      ...requestFixtures()[2],
      input: { actions: [], ticks: 1 },
    })).toThrow("closed RuntimeSessionRequestV1 schema");
  });

  it("parses FixedInput with the exact supported action and axis contract", () => {
    expect(parseFixedInputV1({
      actions: ["move-forward", "jump"],
      axes: { moveXRatio: -1, moveYRatio: 0.5 },
      ticks: 60,
    })).toEqual({
      actions: ["move-forward", "jump"],
      axes: { moveXRatio: -1, moveYRatio: 0.5 },
      ticks: 60,
    });
    expect(() => parseFixedInputV1({
      actions: ["fly"],
      ticks: 1,
    })).toThrow("closed FixedInputV1 schema");
    expect(() => parseFixedInputV1({
      actions: [],
      axes: { moveXRatio: 0, vendorAxis: 1 },
      ticks: 1,
    })).toThrow("closed FixedInputV1 schema");
    expect(parseFixedInputV1({ actions: [], axes: {}, ticks: 0 })).toEqual({
      actions: [],
      axes: {},
      ticks: 0,
    });
    expect(() => parseFixedInputV1({
      actions: [],
      axes: { moveXRatio: undefined },
      ticks: 1,
    })).toThrow("closed FixedInputV1 schema");
  });

  it("parses and freezes the closed Runtime Snapshot including nested state", () => {
    const snapshot = snapshotFixture();
    const parsed = parseWorldRuntimeSnapshotV4(snapshot);
    expect(parsed).toEqual(snapshot);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.world.subjectStatesByEntityId.player)).toBe(true);

    expect(() => parseWorldRuntimeSnapshotV4({
      ...snapshot,
      world: { ...snapshot.world, providerHandle: 1 },
    })).toThrow("closed WorldRuntimeSnapshotV4 schema");
    expect(() => parseWorldRuntimeSnapshotV4({
      ...snapshot,
      world: {
        ...snapshot.world,
        subjectStatesByEntityId: {
          player: {
            ...snapshot.world.subjectStatesByEntityId.player,
            entityState: {
              ...snapshot.world.subjectStatesByEntityId.player!.entityState,
              positionMetersXYZ: [0, Number.NaN, 2],
            },
          },
        },
      },
    })).toThrow("closed WorldRuntimeSnapshotV4 schema");
    expect(() => parseWorldRuntimeSnapshotV4({
      ...snapshot,
      view: { ...snapshot.view, camera: { mode: "unbound", fovDegrees: 60 } },
    })).toThrow("closed WorldRuntimeSnapshotV4 schema");
  });

  it("accepts every public Camera diagnostic code in a tracking Snapshot", () => {
    const snapshot = snapshotFixture();
    const cameraContextProfileRef = "worldkit://camera-context/test@1";
    const cameraRigProfileRef = "worldkit://camera-profile/test@1";
    const cameraViewPreference = { mode: "auto" as const };
    const diagnostics = [
      {
        severity: "warning" as const,
        code: "CAMERA_PREFERENCE_INVALID" as const,
        message: "The requested Camera preference is invalid.",
        cameraContextProfileRef,
      },
      {
        severity: "warning" as const,
        code: "CAMERA_SEMANTIC_AUTHORITY_UNAVAILABLE" as const,
        message: "Committed Camera semantic authority is unavailable.",
        cameraContextProfileRef,
      },
    ];
    const trackingSnapshot: WorldRuntimeSnapshotV4 = {
      ...snapshot,
      view: {
        ...snapshot.view,
        camera: {
          mode: "tracking",
          id: "camera-main",
          targetEntityId: "player",
          positionMetersXYZ: [0, 4, 5],
          activeCameraProfileRef: cameraRigProfileRef,
          activeCameraRigRef: "worldkit://camera-rig/orbit-follow@1",
          activeCameraModifierRefs: [],
          safeFallbackActive: true,
          viewYawOffsetRadians: 0,
          viewPitchOffsetRadians: 0,
          viewDistanceOffsetMeters: 0,
          fixedStepDeltaSeconds: 1 / 60,
          selectionDecision: {
            schemaVersion: 2,
            committedTick: 0,
            targetEntityId: "player",
            activeCameraRigProfileRef: cameraRigProfileRef,
            activeCameraModifierRefs: [],
            matchedCameraContextRuleIds: [],
            cameraViewPreference,
            fallbackActive: true,
            diagnostics,
            explain: {
              cameraViewPreference,
              cameraContextRules: [],
              selectedCameraRigProfileRef: cameraRigProfileRef,
              appliedCameraModifierRefs: [],
              fallbackActive: true,
            },
          },
        },
      },
    };

    expect(parseWorldRuntimeSnapshotV4(trackingSnapshot)).toEqual(
      trackingSnapshot,
    );
  });

  it("parses succeeded and rejected Receipts and verifies the derived id", () => {
    const request = requestFixtures()[2]! as Extract<
      RuntimeSessionRequestV1,
      { type: "snapshot.get" }
    >;
    const requestHash = hashRuntimeSessionRequestV1(request);
    const succeededBody = {
      kind: "worldkit-runtime-session-receipt",
      schemaVersion: 1,
      requestId: request.id,
      requestHash,
      runtimeSessionId: request.runtimeSessionId,
      worldSessionId: "world-session-primary",
      requestType: request.type,
      status: "succeeded",
      snapshot: snapshotFixture(),
    } as const;
    const succeeded = {
      id: deriveRuntimeSessionReceiptIdV1(succeededBody),
      ...succeededBody,
    } as const satisfies RuntimeSessionReceiptV1;
    expect(parseRuntimeSessionReceiptV1(succeeded)).toEqual(succeeded);
    expect(canonicalRuntimeSessionReceiptV1(succeeded)).toContain(requestHash);

    const rejectedBody = {
      kind: "worldkit-runtime-session-receipt",
      schemaVersion: 1,
      requestId: request.id,
      requestHash,
      runtimeSessionId: request.runtimeSessionId,
      worldSessionId: "world-session-primary",
      requestType: request.type,
      status: "rejected",
      diagnostic: {
        code: "RUNTIME_SESSION_NOT_ACTIVE",
        message: "The Runtime Session is not active.",
      },
    } as const;
    const rejected = {
      id: deriveRuntimeSessionReceiptIdV1(rejectedBody),
      ...rejectedBody,
    } as const satisfies RuntimeSessionReceiptV1;
    expect(parseRuntimeSessionReceiptV1(rejected)).toEqual(rejected);
    expect(() => parseRuntimeSessionReceiptV1({
      ...succeeded,
      id: "runtime-session-receipt:wrong",
    })).toThrow("closed RuntimeSessionReceiptV1 schema");
  });

  it("reuses the exact Gameplay receipt parser for command results", () => {
    const commandReceiptBody = {
      kind: "worldkit-gameplay-command-receipt",
      schemaVersion: 1,
      runtimeSessionId: "runtime-session-primary",
      worldSessionId: "world-session-primary",
      commandId: gameplayCommand.id,
      commandHash: deriveGameplayCommandHashV1(gameplayCommand),
      commandType: gameplayCommand.type,
      status: "rejected",
      simulationTick: 0,
      eventIds: [],
      diagnostic: {
        code: "CONTROL_ALREADY_OWNED",
        message: "The controlled entity is already possessed.",
      },
    } as const;
    const commandReceipt = {
      id: deriveGameplayCommandReceiptIdV1(commandReceiptBody),
      ...commandReceiptBody,
    } as const satisfies GameplayCommandReceiptV1;
    const request = requestFixtures()[0]! as Extract<
      RuntimeSessionRequestV1,
      { type: "gameplay-command.execute" }
    >;
    const body = {
      kind: "worldkit-runtime-session-receipt",
      schemaVersion: 1,
      requestId: request.id,
      requestHash: hashRuntimeSessionRequestV1(request),
      runtimeSessionId: request.runtimeSessionId,
      worldSessionId: "world-session-primary",
      requestType: request.type,
      status: "succeeded",
      gameplayCommandReceipt: commandReceipt,
    } as const;
    const receipt = {
      id: deriveRuntimeSessionReceiptIdV1(body),
      ...body,
    } as const satisfies RuntimeSessionReceiptV1;
    expect(parseRuntimeSessionReceiptV1(receipt)).toEqual(receipt);
    expect(() => parseRuntimeSessionReceiptV1({
      ...receipt,
      gameplayCommandReceipt: {
        ...commandReceipt,
        commandHash: HASH_A,
      },
    })).toThrow();
  });

  it("parses ready/completed/failed events with derived ids", () => {
    const readyBody = {
      kind: "worldkit-runtime-session-event",
      schemaVersion: 1,
      protocolVersion: 1,
      sequence: 1,
      runtimeSessionId: "runtime-session-primary",
      worldSessionId: "world-session-primary",
      type: "ready",
      runtimeSessionUri:
        "worldkit://runtime-session/runtime-session-primary",
      worldPackageRef: `package://world-package/sha256/${"a".repeat(64)}`,
      worldPackageRootHash: HASH_A,
      fixedInputControllerEntityId: "controller-primary",
      supportedRequestTypes: WORLDKIT_RUNTIME_SESSION_REQUEST_TYPES_V1,
    } as const;
    const ready = {
      id: deriveRuntimeSessionEventIdV1(readyBody),
      ...readyBody,
    } as const satisfies RuntimeSessionEventV1;
    expect(parseRuntimeSessionEventV1(ready)).toEqual(ready);
    expect(canonicalRuntimeSessionEventV1(ready)).toContain(
      '"type":"ready"',
    );

    const completedBody = {
      kind: "worldkit-runtime-session-event",
      schemaVersion: 1,
      protocolVersion: 1,
      sequence: 2,
      runtimeSessionId: "runtime-session-primary",
      worldSessionId: "world-session-primary",
      type: "completed",
    } as const;
    const completed = {
      id: deriveRuntimeSessionEventIdV1(completedBody),
      ...completedBody,
    } as const satisfies RuntimeSessionEventV1;
    expect(parseRuntimeSessionEventV1(completed)).toEqual(completed);

    const failedBody = {
      ...completedBody,
      sequence: 3,
      type: "failed",
      diagnostic: {
        code: "RUNTIME_SESSION_INTERNAL_FAILURE",
        message: "The Runtime Session failed.",
      },
    } as const;
    const failed = {
      id: deriveRuntimeSessionEventIdV1(failedBody),
      ...failedBody,
    } as const satisfies RuntimeSessionEventV1;
    expect(parseRuntimeSessionEventV1(failed)).toEqual(failed);
    expect(() => parseRuntimeSessionEventV1({
      ...ready,
      supportedRequestTypes: [...ready.supportedRequestTypes].reverse(),
    })).toThrow("closed RuntimeSessionEventV1 schema");
  });
});
