import { describe, expect, it } from "vitest";

import {
  DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
  buildWorldStateSnapshotV1,
  canonicalizeGameplayCommandV1,
  canonicalizeGameplayEventV1,
  canonicalizeWorldStateSnapshotV1,
  deriveGameplaySemanticFactIdV1,
  deriveWorldStateHashV1,
  deriveGameplayEventIdV1,
  hashWorldStateSnapshotV1,
  parseGameplayCapacityBudgetV1,
  parseGameplayCommandV1,
  parseGameplayCommandReceiptV1,
  parseGameplayEventV1,
  parseGameplayInspectionSnapshotV1,
  parseGameplaySemanticFactV1,
  parseWorldStateSnapshotV1,
  type GameplayCapacityBudgetV1,
  type GameplayCommandV1,
  type GameplayCommandReceiptV1,
  type GameplayEventV1,
  type GameplayInspectionSnapshotV1,
  type GameplaySemanticFactV1,
  type WorldStateSnapshotV1,
} from "./gameplay-contracts";
import {
  parseGameplaySemanticFactV1 as parseGameplaySemanticFactV1FromBarrel,
} from "@whitebox-world/gameplay-contracts";

const bindCommand = {
  schemaVersion: 1,
  id: "command-bind-primary",
  type: "control.bind",
  runtimeSessionId: "runtime-primary",
  worldSessionId: "world-primary",
  controllerEntityId: "controller-primary",
  controlledEntityId: "g-bot-primary",
  expectedPossession: { mode: "unbound" },
} as const satisfies GameplayCommandV1;

const possessed = {
  mode: "possessed",
  controlledEntityId: "g-bot-primary",
} as const;

const releaseCommand = {
  schemaVersion: 1,
  id: "command-release-primary",
  type: "control.release",
  runtimeSessionId: "runtime-primary",
  worldSessionId: "world-primary",
  controllerEntityId: "controller-primary",
  expectedPossession: possessed,
} as const satisfies GameplayCommandV1;

const activateCommand = {
  schemaVersion: 1,
  id: "command-action-primary",
  type: "action.activate",
  runtimeSessionId: "runtime-primary",
  worldSessionId: "world-primary",
  controllerEntityId: "controller-primary",
  actionExecutionId: "action-execution-primary",
  semanticActionRef: "worldkit://semantic-action/dance@1",
  actorEntityId: "g-bot-primary",
  expectedPossession: possessed,
} as const satisfies GameplayCommandV1;

const cancelCommand = {
  schemaVersion: 1,
  id: "command-cancel-primary",
  type: "action.cancel",
  runtimeSessionId: "runtime-primary",
  worldSessionId: "world-primary",
  controllerEntityId: "controller-primary",
  actionExecutionId: "action-execution-primary",
  actorEntityId: "g-bot-primary",
  expectedPossession: possessed,
} as const satisfies GameplayCommandV1;

function withoutKey(
  value: Readonly<Record<string, unknown>>,
  omittedKey: string,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== omittedKey),
  );
}

describe("GameplayCommandV1", () => {
  it.each([
    ["bind", bindCommand],
    ["release", releaseCommand],
    ["activate", activateCommand],
    ["cancel", cancelCommand],
  ])("parses and deeply freezes the closed %s branch", (_label, command) => {
    const parsed = parseGameplayCommandV1(command);

    expect(parsed).toEqual(command);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.expectedPossession)).toBe(true);
  });

  it("canonicalizes equivalent commands to the same bytes", () => {
    const reordered = {
      expectedPossession: { mode: "unbound" },
      controlledEntityId: "g-bot-primary",
      controllerEntityId: "controller-primary",
      worldSessionId: "world-primary",
      runtimeSessionId: "runtime-primary",
      type: "control.bind",
      id: "command-bind-primary",
      schemaVersion: 1,
    };

    expect(canonicalizeGameplayCommandV1(reordered)).toEqual(
      canonicalizeGameplayCommandV1(bindCommand),
    );
  });

  it.each([
    ["missing schemaVersion", withoutKey(bindCommand, "schemaVersion")],
    ["wrong schemaVersion", { ...bindCommand, schemaVersion: 2 }],
    ["non-finite schemaVersion", { ...bindCommand, schemaVersion: Number.NaN }],
    ["legacy subjectEntityId", {
      ...withoutKey(bindCommand, "controlledEntityId"),
      subjectEntityId: "g-bot-primary",
    }],
    ["legacy actionId", {
      ...withoutKey(activateCommand, "semanticActionRef"),
      actionId: "dance",
    }],
    ["legacy expectedBinding", {
      ...withoutKey(bindCommand, "expectedPossession"),
      expectedBinding: { mode: "unbound" },
    }],
    ["unknown field", { ...bindCommand, debug: true }],
    ["empty command id", { ...bindCommand, id: "" }],
    ["empty role id", { ...bindCommand, controlledEntityId: "" }],
    ["invalid union shape", {
      ...releaseCommand,
      expectedPossession: { mode: "unbound" },
    }],
    ["non-finite numeric field", { ...bindCommand, simulationTick: Infinity }],
  ])("rejects %s", (_label, input) => {
    expect(() => parseGameplayCommandV1(input)).toThrow(
      "closed GameplayCommandV1 schema",
    );
  });

  it("rejects accessor-backed fields without invoking them", () => {
    let reads = 0;
    const accessorCommand = { ...bindCommand } as Record<string, unknown>;
    Object.defineProperty(accessorCommand, "controlledEntityId", {
      enumerable: true,
      get: () => {
        reads += 1;
        return "g-bot-primary";
      },
    });

    expect(() => parseGameplayCommandV1(accessorCommand)).toThrow(
      "closed GameplayCommandV1 schema",
    );
    expect(reads).toBe(0);
  });

  it("rejects symbol keys and non-plain prototypes", () => {
    const symbolCommand = { ...bindCommand, [Symbol("hidden")]: true };
    const prototypeCommand = Object.assign(
      Object.create({ inherited: true }),
      bindCommand,
    );

    expect(() => parseGameplayCommandV1(symbolCommand)).toThrow(
      "closed GameplayCommandV1 schema",
    );
    expect(() => parseGameplayCommandV1(prototypeCommand)).toThrow(
      "closed GameplayCommandV1 schema",
    );
  });
});

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_E = `sha256:${"e".repeat(64)}` as const;
const SEMANTIC_FACT_PROJECTOR_PROFILE_REF =
  "worldkit://semantic-fact-projector/default@1" as const;

const committedReceipt = {
  kind: "worldkit-gameplay-command-receipt",
  schemaVersion: 1,
  id: "receipt-bind-primary",
  runtimeSessionId: "runtime-primary",
  worldSessionId: "world-primary",
  commandId: "command-bind-primary",
  commandType: "control.bind",
  status: "committed",
  simulationTick: 12,
  eventIds: ["gameplay-event:world-primary:1"],
  worldStateAfterRef: "worldkit://world-state/world-primary/12",
  worldStateAfterHash: HASH_A,
} as const satisfies GameplayCommandReceiptV1;

const rejectedReceipt = {
  kind: "worldkit-gameplay-command-receipt",
  schemaVersion: 1,
  id: "receipt-rejected-primary",
  runtimeSessionId: "runtime-primary",
  worldSessionId: "world-primary",
  commandId: "command-bind-rejected",
  commandType: "control.bind",
  status: "rejected",
  simulationTick: 12,
  eventIds: [],
  diagnostic: {
    code: "CONTROL_ALREADY_OWNED",
    message: "The controlled entity is already possessed.",
  },
} as const satisfies GameplayCommandReceiptV1;

const failedReceipt = {
  kind: "worldkit-gameplay-command-receipt",
  schemaVersion: 1,
  id: "receipt-failed-primary",
  runtimeSessionId: "runtime-primary",
  worldSessionId: "world-primary",
  commandId: "command-action-primary",
  commandType: "action.activate",
  status: "failed",
  simulationTick: 13,
  eventIds: ["gameplay-event:world-primary:2"],
  diagnostic: {
    code: "ADAPTER_ROLLBACK_FAILED",
    message: "The prepared transition could not be rolled back.",
  },
} as const satisfies GameplayCommandReceiptV1;

describe("GameplayCommandReceiptV1", () => {
  it.each([
    ["committed", committedReceipt],
    ["rejected", rejectedReceipt],
    ["failed", failedReceipt],
  ])("parses and deeply freezes the closed %s branch", (_label, receipt) => {
    const parsed = parseGameplayCommandReceiptV1(receipt);

    expect(parsed).toEqual(receipt);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.eventIds)).toBe(true);
    if (parsed.status !== "committed") {
      expect(Object.isFrozen(parsed.diagnostic)).toBe(true);
    }
  });

  it.each([
    ["committed without state-after", withoutKey(committedReceipt, "worldStateAfterRef")],
    ["committed with diagnostic", {
      ...committedReceipt,
      diagnostic: rejectedReceipt.diagnostic,
    }],
    ["rejected without diagnostic", withoutKey(rejectedReceipt, "diagnostic")],
    ["rejected with events", { ...rejectedReceipt, eventIds: ["event-forbidden"] }],
    ["rejected with state-after", {
      ...rejectedReceipt,
      worldStateAfterRef: "worldkit://world-state/forbidden",
      worldStateAfterHash: HASH_A,
    }],
    ["failed without diagnostic", withoutKey(failedReceipt, "diagnostic")],
    ["failed with state-after", {
      ...failedReceipt,
      worldStateAfterRef: "worldkit://world-state/forbidden",
      worldStateAfterHash: HASH_A,
    }],
    ["unknown status", { ...committedReceipt, status: "pending" }],
    ["unknown key", { ...committedReceipt, timestamp: 123 }],
    ["non-finite tick", { ...committedReceipt, simulationTick: Infinity }],
    ["fractional tick", { ...committedReceipt, simulationTick: 1.5 }],
  ])("rejects %s", (_label, input) => {
    expect(() => parseGameplayCommandReceiptV1(input)).toThrow(
      "closed GameplayCommandReceiptV1 schema",
    );
  });

  it.each([
    "INPUT_INVALID",
    "FEATURE_NOT_LOCKED",
    "ACTION_CATALOG_INVALID",
  ] as const)("accepts downstream admission diagnostic %s", (code) => {
    expect(parseGameplayCommandReceiptV1({
      ...rejectedReceipt,
      diagnostic: { code, message: `Stable ${code} diagnostic.` },
    })).toMatchObject({ status: "rejected", diagnostic: { code } });
  });

  it("accepts exact same-session event IDs in increasing sequence order", () => {
    const parsed = parseGameplayCommandReceiptV1({
      ...committedReceipt,
      eventIds: [
        "gameplay-event:world-primary:0",
        "gameplay-event:world-primary:2",
        "gameplay-event:world-primary:10",
      ],
    });

    expect(parsed.eventIds).toEqual([
      "gameplay-event:world-primary:0",
      "gameplay-event:world-primary:2",
      "gameplay-event:world-primary:10",
    ]);
  });

  it.each([
    ["malformed ID", ["event-1"]],
    ["cross-session ID", ["gameplay-event:world-secondary:1"]],
    ["duplicate sequence", [
      "gameplay-event:world-primary:1",
      "gameplay-event:world-primary:1",
    ]],
    ["decreasing sequence", [
      "gameplay-event:world-primary:2",
      "gameplay-event:world-primary:1",
    ]],
    ["non-canonical leading zero", ["gameplay-event:world-primary:01"]],
    ["unsafe sequence", [
      `gameplay-event:world-primary:${Number.MAX_SAFE_INTEGER + 1}`,
    ]],
  ])("rejects %s in eventIds", (_label, eventIds) => {
    expect(() => parseGameplayCommandReceiptV1({
      ...committedReceipt,
      eventIds,
    })).toThrow("closed GameplayCommandReceiptV1 schema");
  });
});

const relationshipCommittedEvent = {
  kind: "worldkit-gameplay-event",
  schemaVersion: 1,
  id: "gameplay-event:world-primary:1",
  type: "relationship.committed",
  runtimeSessionId: "runtime-primary",
  worldSessionId: "world-primary",
  simulationTick: 12,
  sequence: 1,
  commandId: "command-bind-primary",
  relationshipId: "possession-primary",
  controlledEntityId: "g-bot-primary",
  controllerEntityId: "controller-primary",
} as const satisfies GameplayEventV1;

const naturallyCompletedEvent = {
  kind: "worldkit-gameplay-event",
  schemaVersion: 1,
  id: "gameplay-event:world-primary:2",
  type: "action.completed",
  runtimeSessionId: "runtime-primary",
  worldSessionId: "world-primary",
  simulationTick: 182,
  sequence: 2,
  semanticActionRef: "worldkit://semantic-action/dance@1",
  actionExecutionId: "action-execution-primary",
  actorEntityId: "g-bot-primary",
} as const satisfies GameplayEventV1;

const eventSemanticFact = {
  id: "semantic-fact:aa7d4d693180a2ee822ef248143598ca50f31e9d30ff5ed94fcef34fe59e2f77",
  type: "supportedBy",
  schemaVersion: 1,
  supportedEntityId: "g-bot-primary",
  supportSurfaceEntityId: "terrain-primary",
  supportColliderSubshapeId: "terrain-collider-primary",
  supportTraversalSurfaceId: "traversal-surface-primary",
  supportPointMetersXYZ: [0, 0, 2],
  supportNormalXYZ: [0, 1, 0],
  startedSimulationTick: 1,
  semanticFactProjectorProfileRef: SEMANTIC_FACT_PROJECTOR_PROFILE_REF,
  semanticFactProjectorProfileHash: HASH_E,
} as const satisfies GameplaySemanticFactV1;

const semanticFactStartedEvent = {
  kind: "worldkit-gameplay-event",
  schemaVersion: 1,
  id: "gameplay-event:world-primary:8",
  type: "semantic-fact.started",
  runtimeSessionId: "runtime-primary",
  worldSessionId: "world-primary",
  simulationTick: 1,
  sequence: 8,
  semanticFact: eventSemanticFact,
} as const satisfies GameplayEventV1;

const semanticFactEndedEvent = {
  ...semanticFactStartedEvent,
  id: "gameplay-event:world-primary:9",
  type: "semantic-fact.ended",
  simulationTick: 18,
  sequence: 9,
} as const satisfies GameplayEventV1;

describe("GameplayEventV1", () => {
  it("derives a stable event ID from worldSessionId and sequence", () => {
    expect(deriveGameplayEventIdV1("world-primary", 7)).toBe(
      "gameplay-event:world-primary:7",
    );
    expect(deriveGameplayEventIdV1("world-primary", 7)).not.toBe(
      deriveGameplayEventIdV1("world-primary", 8),
    );
  });

  it("parses relationship endpoints with role-qualified names", () => {
    expect(parseGameplayEventV1(relationshipCommittedEvent)).toEqual(
      relationshipCommittedEvent,
    );
  });

  it("models natural action completion without a fabricated commandId", () => {
    const parsed = parseGameplayEventV1(naturallyCompletedEvent);

    expect(parsed).toEqual(naturallyCompletedEvent);
    expect(parsed).not.toHaveProperty("commandId");
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it.each([
    ["relationship removed", {
      ...relationshipCommittedEvent,
      id: "gameplay-event:world-primary:3",
      type: "relationship.removed",
      sequence: 3,
    }],
    ["action started", {
      ...withoutKey(
        withoutKey(
          withoutKey(relationshipCommittedEvent, "relationshipId"),
          "controlledEntityId",
        ),
        "controllerEntityId",
      ),
      id: "gameplay-event:world-primary:4",
      type: "action.started",
      sequence: 4,
      semanticActionRef: "worldkit://semantic-action/dance@1",
      actionExecutionId: "action-execution-primary",
      actorEntityId: "g-bot-primary",
    }],
    ["action completed", naturallyCompletedEvent],
    ["action cancelled", {
      ...naturallyCompletedEvent,
      id: "gameplay-event:world-primary:5",
      type: "action.cancelled",
      sequence: 5,
      commandId: "command-cancel-primary",
    }],
    ["action failed", {
      ...naturallyCompletedEvent,
      id: "gameplay-event:world-primary:6",
      type: "action.failed",
      sequence: 6,
      diagnostic: {
        code: "ADAPTER_COMMIT_FAILED",
        message: "The action projection failed.",
      },
    }],
    ["semantic Fact started", semanticFactStartedEvent],
    ["semantic Fact ended", semanticFactEndedEvent],
    ["world failed", {
      kind: "worldkit-gameplay-event",
      schemaVersion: 1,
      id: "gameplay-event:world-primary:7",
      type: "world.failed",
      runtimeSessionId: "runtime-primary",
      worldSessionId: "world-primary",
      simulationTick: 183,
      sequence: 7,
      diagnostic: {
        code: "ADAPTER_ROLLBACK_FAILED",
        message: "The world session failed closed.",
      },
    }],
  ])("accepts the closed %s event branch", (_label, event) => {
    expect(() => parseGameplayEventV1(event)).not.toThrow();
  });

  it("canonicalizes reordered event input identically", () => {
    const reordered = Object.fromEntries(
      Object.entries(relationshipCommittedEvent).reverse(),
    );
    expect(canonicalizeGameplayEventV1(reordered)).toBe(
      canonicalizeGameplayEventV1(relationshipCommittedEvent),
    );
  });

  it.each([
    ["started", semanticFactStartedEvent],
    ["ended", semanticFactEndedEvent],
  ])("canonicalizes a closed physics-derived semantic Fact %s event", (_label, event) => {
    const parsed = parseGameplayEventV1(event);
    const reordered = Object.fromEntries(Object.entries(event).reverse());

    expect(parsed).toEqual(event);
    expect(parsed).not.toHaveProperty("commandId");
    if (
      parsed.type !== "semantic-fact.started" &&
      parsed.type !== "semantic-fact.ended"
    ) throw new Error("Expected a semantic Fact event.");
    expect(Object.isFrozen(parsed.semanticFact)).toBe(true);
    expect(canonicalizeGameplayEventV1(reordered)).toBe(
      canonicalizeGameplayEventV1(event),
    );
  });

  it.each([
    ["unknown type", { ...relationshipCommittedEvent, type: "control.bound" }],
    ["unknown key", { ...relationshipCommittedEvent, target: "g-bot-primary" }],
    ["missing sequence", withoutKey(relationshipCommittedEvent, "sequence")],
    ["fractional sequence", { ...relationshipCommittedEvent, sequence: 1.5 }],
    ["non-finite tick", { ...relationshipCommittedEvent, simulationTick: NaN }],
    ["unstable event id", { ...relationshipCommittedEvent, id: "event-1" }],
    ["natural completion with command", {
      ...naturallyCompletedEvent,
      commandId: "fabricated-command",
    }],
    ["semantic Fact event with command", {
      ...semanticFactStartedEvent,
      commandId: "fabricated-command",
    }],
    ["semantic Fact event with mismatched identity", {
      ...semanticFactStartedEvent,
      semanticFact: { ...eventSemanticFact, id: "semantic-fact:wrong" },
    }],
    ["semantic Fact started event after the Fact start", {
      ...semanticFactStartedEvent,
      simulationTick: eventSemanticFact.startedSimulationTick + 1,
    }],
    ["semantic Fact ended event before the Fact start", {
      ...semanticFactEndedEvent,
      simulationTick: eventSemanticFact.startedSimulationTick - 1,
    }],
    ["world failure without diagnostic", {
      kind: "worldkit-gameplay-event",
      schemaVersion: 1,
      id: "gameplay-event:world-primary:7",
      type: "world.failed",
      runtimeSessionId: "runtime-primary",
      worldSessionId: "world-primary",
      simulationTick: 183,
      sequence: 7,
    }],
  ])("rejects %s", (_label, input) => {
    expect(() => parseGameplayEventV1(input)).toThrow(
      "closed GameplayEventV1 schema",
    );
  });
});

const HASH_B = `sha256:${"b".repeat(64)}` as const;
const HASH_C = `sha256:${"c".repeat(64)}` as const;

const spatialEntityState = {
  id: "g-bot-primary",
  kind: "spatial-entity-state",
  entityDefinitionRef: "worldkit://entity-definition/g-bot@1",
  entityDefinitionHash: HASH_A,
  semanticClassId: "character.robot",
  lifecycleMode: "active",
  positionMetersXYZ: [0, 1, 2],
  rotationQuaternionXYZW: [0, 0, 0, 1],
  scaleRatioXYZ: [1, 1, 1],
  linearVelocityMetersPerSecondXYZ: [0, 0, -2],
  angularVelocityRadiansPerSecondXYZ: [0, 0, 0],
} as const;

const controllerEntityState = {
  id: "controller-primary",
  kind: "controller-entity-state",
  controllerDefinitionRef: "worldkit://controller-definition/local@1",
  controllerDefinitionHash: HASH_B,
  participantId: "participant-primary",
  lifecycleMode: "active",
  inputMode: "human",
} as const;

const locomotionCapabilityState = {
  id: "locomotion-g-bot-primary",
  kind: "locomotion-capability-state",
  ownerEntityId: "g-bot-primary",
  locomotionCapabilityRef: "worldkit://locomotion-profile/g-bot@1",
  locomotionCapabilityHash: HASH_C,
  mode: "run",
  movementMedium: "ground",
  facingYawRadians: Math.PI,
  speedMetersPerSecond: 2,
} as const;

const possessionRelationshipState = {
  id: "possession-primary",
  type: "possessedBy",
  schemaVersion: 1,
  controlledEntityId: "g-bot-primary",
  controllerEntityId: "controller-primary",
  establishedSimulationTick: 1,
} as const;

const actionState = {
  id: "action-execution-primary",
  kind: "action-state",
  semanticActionRef: "worldkit://semantic-action/dance@1",
  semanticActionHash: HASH_A,
  actorEntityId: "g-bot-primary",
  mode: "active",
  startedSimulationTick: 12,
  lastTransitionSimulationTick: 12,
} as const;

const supportedByFact = {
  id: "semantic-fact:aa7d4d693180a2ee822ef248143598ca50f31e9d30ff5ed94fcef34fe59e2f77",
  type: "supportedBy",
  schemaVersion: 1,
  supportedEntityId: "g-bot-primary",
  supportSurfaceEntityId: "terrain-primary",
  supportColliderSubshapeId: "terrain-collider-primary",
  supportTraversalSurfaceId: "traversal-surface-primary",
  supportPointMetersXYZ: [0, 0, 2],
  supportNormalXYZ: [0, 1, 0],
  startedSimulationTick: 1,
  semanticFactProjectorProfileRef: SEMANTIC_FACT_PROJECTOR_PROFILE_REF,
  semanticFactProjectorProfileHash: HASH_E,
} as const satisfies GameplaySemanticFactV1;

const WORLD_STATE_GOLDEN_HASH =
  "sha256:d0f0bf97d9f66711738ead0a2f29ae76229be6afeb5de7b09dc0e33a56089934" as const;

const worldStateSnapshot = {
  kind: "worldkit-world-state-snapshot",
  schemaVersion: 1,
  id: "world-state-world-primary-12",
  runtimeSessionId: "runtime-primary",
  worldSessionId: "world-primary",
  simulationTick: 12,
  worldPackageRef: "worldkit://world-package/g-bot@1",
  worldPackageRootHash: HASH_A,
  executionPlanHash: HASH_B,
  entityStatesById: {
    "g-bot-primary": spatialEntityState,
    "controller-primary": controllerEntityState,
  },
  capabilityStatesById: {
    "locomotion-g-bot-primary": locomotionCapabilityState,
  },
  relationshipStatesById: {
    "possession-primary": possessionRelationshipState,
  },
  semanticFactsById: {
    [supportedByFact.id]: supportedByFact,
  },
  activeActionStatesById: {
    "action-execution-primary": actionState,
  },
  lastEventSequence: 2,
  worldStateHash: WORLD_STATE_GOLDEN_HASH,
} as const satisfies WorldStateSnapshotV1;

describe("WorldStateSnapshotV1", () => {
  it("parses canonical entity, relationship, capability, and active Action maps", () => {
    const parsed = parseWorldStateSnapshotV1(worldStateSnapshot);

    expect(parsed).toEqual(worldStateSnapshot);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.entityStatesById["g-bot-primary"])).toBe(true);
    expect(Object.isFrozen(parsed.relationshipStatesById)).toBe(true);
  });

  it("accepts requestless and request-backed Action states as an exact paired union", () => {
    const requestBackedActionState = {
      ...actionState,
      id: "action-execution-request-backed",
      actionRequestRef: "worldkit://action-request/request-backed@1",
      actionRequestHash: HASH_C,
    } as const;
    const parsed = buildWorldStateSnapshotV1({
      ...worldStateSnapshot,
      activeActionStatesById: {
        [actionState.id]: actionState,
        [requestBackedActionState.id]: requestBackedActionState,
      },
    });

    expect(parsed.activeActionStatesById[actionState.id]).toEqual(actionState);
    expect(parsed.activeActionStatesById[requestBackedActionState.id]).toEqual(
      requestBackedActionState,
    );
    expect(() => buildWorldStateSnapshotV1({
      ...worldStateSnapshot,
      activeActionStatesById: {
        [actionState.id]: {
          ...actionState,
          actionRequestRef: "worldkit://action-request/unpaired@1",
        },
      },
    })).toThrow("closed WorldStateSnapshotV1 schema");
  });

  it("has a golden semantic hash over the canonical authority domain", () => {
    expect(deriveWorldStateHashV1(worldStateSnapshot)).toBe(
      WORLD_STATE_GOLDEN_HASH,
    );
    expect(hashWorldStateSnapshotV1(worldStateSnapshot)).toBe(
      WORLD_STATE_GOLDEN_HASH,
    );
  });

  it("excludes artifact identity, location, and the self hash", () => {
    const changedIdentity = {
      ...worldStateSnapshot,
      id: "world-state-other",
      runtimeSessionId: "runtime-other",
      worldSessionId: "world-other",
      worldPackageRef: "worldkit://world-package/relocated@1",
      worldStateHash: HASH_C,
    };

    expect(deriveWorldStateHashV1(changedIdentity)).toBe(
      WORLD_STATE_GOLDEN_HASH,
    );
    const rebuilt = buildWorldStateSnapshotV1(changedIdentity);
    expect(rebuilt.worldStateHash).toBe(WORLD_STATE_GOLDEN_HASH);
    expect(canonicalizeWorldStateSnapshotV1(rebuilt)).not.toBe(
      canonicalizeWorldStateSnapshotV1(worldStateSnapshot),
    );
  });

  it("changes the semantic hash for tick, lock, map, fact, or sequence tampering", () => {
    const tamperedInputs = [
      { ...worldStateSnapshot, simulationTick: 13 },
      { ...worldStateSnapshot, worldPackageRootHash: HASH_C },
      { ...worldStateSnapshot, executionPlanHash: HASH_C },
      {
        ...worldStateSnapshot,
        entityStatesById: {
          ...worldStateSnapshot.entityStatesById,
          "g-bot-primary": {
            ...spatialEntityState,
            positionMetersXYZ: [1, 1, 2],
          },
        },
      },
      {
        ...worldStateSnapshot,
        semanticFactsById: {
          [supportedByFact.id]: {
            ...supportedByFact,
            supportPointMetersXYZ: [1, 0, 2],
          },
        },
      },
      { ...worldStateSnapshot, lastEventSequence: 3 },
    ];

    for (const tampered of tamperedInputs) {
      expect(deriveWorldStateHashV1(tampered)).not.toBe(
        WORLD_STATE_GOLDEN_HASH,
      );
      expect(() => parseWorldStateSnapshotV1(tampered)).toThrow(
        "closed WorldStateSnapshotV1 schema",
      );
    }

    const selfHashTampered = { ...worldStateSnapshot, worldStateHash: HASH_C };
    expect(deriveWorldStateHashV1(selfHashTampered)).toBe(
      WORLD_STATE_GOLDEN_HASH,
    );
    expect(() => parseWorldStateSnapshotV1(selfHashTampered)).toThrow(
      "closed WorldStateSnapshotV1 schema",
    );
  });

  it("builds a valid snapshot with a derived hash", () => {
    const { worldStateHash: _ignored, ...input } = worldStateSnapshot;
    const built = buildWorldStateSnapshotV1(input);

    expect(built.worldStateHash).toBe(WORLD_STATE_GOLDEN_HASH);
    expect(parseWorldStateSnapshotV1(built)).toEqual(built);
  });

  it("safely preserves __proto__ where it remains a valid canonical ID", () => {
    const cases = [
      {
        ...worldStateSnapshot,
        entityStatesById: Object.fromEntries([
          ...Object.entries(worldStateSnapshot.entityStatesById),
          ["__proto__", { ...spatialEntityState, id: "__proto__" }],
        ]),
      },
      {
        ...worldStateSnapshot,
        capabilityStatesById: Object.fromEntries([
          ["__proto__", { ...locomotionCapabilityState, id: "__proto__" }],
        ]),
      },
      {
        ...worldStateSnapshot,
        relationshipStatesById: Object.fromEntries([
          ["__proto__", { ...possessionRelationshipState, id: "__proto__" }],
        ]),
      },
      {
        ...worldStateSnapshot,
        activeActionStatesById: Object.fromEntries([
          ["__proto__", { ...actionState, id: "__proto__" }],
        ]),
      },
    ];

    for (const input of cases) {
      const built = buildWorldStateSnapshotV1(input);
      const map = [
        built.entityStatesById,
        built.capabilityStatesById,
        built.relationshipStatesById,
        built.semanticFactsById,
        built.activeActionStatesById,
      ].find((candidate) => Object.hasOwn(candidate, "__proto__"));
      expect(map).toBeDefined();
      expect(Object.hasOwn(map!, "__proto__")).toBe(true);
      expect(Object.getPrototypeOf(map!)).toBe(Object.prototype);
      expect(map!["__proto__"]?.id).toBe("__proto__");
      expect(canonicalizeWorldStateSnapshotV1(built)).toContain('"__proto__"');
      expect(built.worldStateHash).not.toBe(WORLD_STATE_GOLDEN_HASH);
    }
  });

  it("stably rejects __proto__ as a forged derived Semantic Fact ID", () => {
    expect(() => buildWorldStateSnapshotV1({
      ...worldStateSnapshot,
      semanticFactsById: Object.fromEntries([
        ["__proto__", { ...supportedByFact, id: "__proto__" }],
      ]),
    })).toThrow("closed WorldStateSnapshotV1 schema");
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
  });

  it.each([
    ["dangling possession Controller", {
      ...worldStateSnapshot,
      relationshipStatesById: {
        "possession-primary": {
          ...possessionRelationshipState,
          controllerEntityId: "controller-missing",
        },
      },
    }],
    ["wrong-kind possession Controller", {
      ...worldStateSnapshot,
      relationshipStatesById: {
        "possession-primary": {
          ...possessionRelationshipState,
          controllerEntityId: "g-bot-primary",
        },
      },
    }],
    ["dangling possession target", {
      ...worldStateSnapshot,
      relationshipStatesById: {
        "possession-primary": {
          ...possessionRelationshipState,
          controlledEntityId: "subject-missing",
        },
      },
    }],
    ["wrong-kind possession target", {
      ...worldStateSnapshot,
      relationshipStatesById: {
        "possession-primary": {
          ...possessionRelationshipState,
          controlledEntityId: "controller-primary",
        },
      },
    }],
    ["dangling capability owner", {
      ...worldStateSnapshot,
      capabilityStatesById: {
        "locomotion-g-bot-primary": {
          ...locomotionCapabilityState,
          ownerEntityId: "subject-missing",
        },
      },
    }],
    ["wrong-kind capability owner", {
      ...worldStateSnapshot,
      capabilityStatesById: {
        "locomotion-g-bot-primary": {
          ...locomotionCapabilityState,
          ownerEntityId: "controller-primary",
        },
      },
    }],
    ["dangling Action actor", {
      ...worldStateSnapshot,
      activeActionStatesById: {
        "action-execution-primary": {
          ...actionState,
          actorEntityId: "subject-missing",
        },
      },
    }],
    ["wrong-kind Action actor", {
      ...worldStateSnapshot,
      activeActionStatesById: {
        "action-execution-primary": {
          ...actionState,
          actorEntityId: "controller-primary",
        },
      },
    }],
  ])("rejects %s", (_label, input) => {
    expect(() => buildWorldStateSnapshotV1(input)).toThrow(
      "closed WorldStateSnapshotV1 schema",
    );
  });

  it.each([
    ["air medium with non-airborne mode", {
      ...locomotionCapabilityState,
      mode: "run",
      movementMedium: "air",
    }],
    ["airborne mode with ground medium", {
      ...locomotionCapabilityState,
      mode: "airborne",
      movementMedium: "ground",
    }],
    ["negative speed", {
      ...locomotionCapabilityState,
      speedMetersPerSecond: -0.01,
    }],
  ])("rejects invalid locomotion cross-field state: %s", (_label, capability) => {
    expect(() => buildWorldStateSnapshotV1({
      ...worldStateSnapshot,
      capabilityStatesById: { [capability.id]: capability },
    })).toThrow("closed WorldStateSnapshotV1 schema");
  });

  const futureFactWithoutId = {
    ...supportedByFact,
    startedSimulationTick: worldStateSnapshot.simulationTick + 1,
  };
  const futureFact = {
    ...futureFactWithoutId,
    id: deriveGameplaySemanticFactIdV1(futureFactWithoutId),
  };
  it.each([
    ["relationship established after snapshot", {
      ...worldStateSnapshot,
      relationshipStatesById: {
        "possession-primary": {
          ...possessionRelationshipState,
          establishedSimulationTick: worldStateSnapshot.simulationTick + 1,
        },
      },
    }],
    ["Fact started after snapshot", {
      ...worldStateSnapshot,
      semanticFactsById: { [futureFact.id]: futureFact },
    }],
    ["Action started after snapshot", {
      ...worldStateSnapshot,
      activeActionStatesById: {
        "action-execution-primary": {
          ...actionState,
          startedSimulationTick: worldStateSnapshot.simulationTick + 1,
          lastTransitionSimulationTick: worldStateSnapshot.simulationTick + 1,
        },
      },
    }],
    ["Action transitioned after snapshot", {
      ...worldStateSnapshot,
      activeActionStatesById: {
        "action-execution-primary": {
          ...actionState,
          lastTransitionSimulationTick: worldStateSnapshot.simulationTick + 1,
        },
      },
    }],
    ["Action transitioned before it started", {
      ...worldStateSnapshot,
      activeActionStatesById: {
        "action-execution-primary": {
          ...actionState,
          startedSimulationTick: 10,
          lastTransitionSimulationTick: 9,
        },
      },
    }],
  ])("rejects invalid cross-snapshot timing: %s", (_label, input) => {
    expect(() => buildWorldStateSnapshotV1(input)).toThrow(
      "closed WorldStateSnapshotV1 schema",
    );
  });

  it("sorts ID maps so insertion order cannot change canonical bytes or hash", () => {
    const reversed = {
      ...worldStateSnapshot,
      entityStatesById: {
        "controller-primary": controllerEntityState,
        "g-bot-primary": spatialEntityState,
      },
    };

    expect(canonicalizeWorldStateSnapshotV1(reversed)).toBe(
      canonicalizeWorldStateSnapshotV1(worldStateSnapshot),
    );
    expect(hashWorldStateSnapshotV1(reversed)).toBe(
      hashWorldStateSnapshotV1(worldStateSnapshot),
    );
    expect(hashWorldStateSnapshotV1(worldStateSnapshot)).toMatch(
      /^sha256:[a-f0-9]{64}$/,
    );
  });

  it.each([
    ["entity map key mismatch", {
      ...worldStateSnapshot,
      entityStatesById: { wrong: spatialEntityState },
    }],
    ["relationship map key mismatch", {
      ...worldStateSnapshot,
      relationshipStatesById: { wrong: possessionRelationshipState },
    }],
    ["capability map key mismatch", {
      ...worldStateSnapshot,
      capabilityStatesById: { wrong: locomotionCapabilityState },
    }],
    ["Action map key mismatch", {
      ...worldStateSnapshot,
      activeActionStatesById: { wrong: actionState },
    }],
    ["semantic Fact map key mismatch", {
      ...worldStateSnapshot,
      semanticFactsById: { wrong: supportedByFact },
    }],
    ["two Controllers possessing one entity", {
      ...worldStateSnapshot,
      relationshipStatesById: {
        "possession-primary": possessionRelationshipState,
        "possession-secondary": {
          ...possessionRelationshipState,
          id: "possession-secondary",
          controllerEntityId: "controller-secondary",
        },
      },
    }],
    ["one Controller possessing two entities", {
      ...worldStateSnapshot,
      relationshipStatesById: {
        "possession-primary": possessionRelationshipState,
        "possession-secondary": {
          ...possessionRelationshipState,
          id: "possession-secondary",
          controlledEntityId: "g-bot-secondary",
        },
      },
    }],
    ["non-finite state number", {
      ...worldStateSnapshot,
      entityStatesById: {
        ...worldStateSnapshot.entityStatesById,
        "g-bot-primary": {
          ...spatialEntityState,
          positionMetersXYZ: [0, NaN, 2],
        },
      },
    }],
    ["fractional tick", { ...worldStateSnapshot, simulationTick: 1.5 }],
    ["unknown root key", { ...worldStateSnapshot, cameraStatesById: {} }],
  ])("rejects %s", (_label, input) => {
    expect(() => parseWorldStateSnapshotV1(input)).toThrow(
      "closed WorldStateSnapshotV1 schema",
    );
  });
});

describe("GameplaySemanticFactV1", () => {
  const touchingFact = {
    id: "semantic-fact:a85547ebee21b423c0d5cc3c2327fc168cd10d3ff484fbdb26144357b9ea8808",
    type: "touching",
    schemaVersion: 1,
    entityIds: ["g-bot-primary", "ground-primary"],
    startedSimulationTick: 2,
    semanticFactProjectorProfileRef: SEMANTIC_FACT_PROJECTOR_PROFILE_REF,
    semanticFactProjectorProfileHash: HASH_E,
  } as const satisfies GameplaySemanticFactV1;
  const insideVolumeFact = {
    id: "semantic-fact:f45502b593d70873d6de24b08a3f58f403e8508e31c8b23492c7f82d69112bbc",
    type: "insideVolume",
    schemaVersion: 1,
    containedEntityId: "g-bot-primary",
    volumeEntityId: "zone-primary",
    startedSimulationTick: 3,
    semanticFactProjectorProfileRef: SEMANTIC_FACT_PROJECTOR_PROFILE_REF,
    semanticFactProjectorProfileHash: HASH_E,
  } as const satisfies GameplaySemanticFactV1;

  it.each([
    [supportedByFact, supportedByFact.id],
    [touchingFact, touchingFact.id],
    [insideVolumeFact, insideVolumeFact.id],
  ])("derives the stable canonical Fact identity for %s", (fact, expectedId) => {
    expect(deriveGameplaySemanticFactIdV1(fact)).toBe(expectedId);
  });

  it("excludes changing support point and normal from continuous Fact identity", () => {
    expect(deriveGameplaySemanticFactIdV1({
      ...supportedByFact,
      supportPointMetersXYZ: [100, 200, 300],
      supportNormalXYZ: [1, 0, 0],
    })).toBe(supportedByFact.id);
  });

  it("changes Fact identity when an endpoint, start tick, or locked projector changes", () => {
    const changes = [
      { ...supportedByFact, supportedEntityId: "g-bot-secondary" },
      { ...supportedByFact, startedSimulationTick: 2 },
      {
        ...supportedByFact,
        semanticFactProjectorProfileRef:
          "worldkit://semantic-fact-projector/alternate@1",
      },
      { ...supportedByFact, semanticFactProjectorProfileHash: HASH_A },
    ];

    for (const changed of changes) {
      expect(deriveGameplaySemanticFactIdV1(changed)).not.toBe(
        supportedByFact.id,
      );
    }
  });

  it.each([
    ["supportedBy", supportedByFact],
    ["touching", touchingFact],
    ["insideVolume", insideVolumeFact],
  ])("parses and freezes the closed %s branch", (_label, fact) => {
    const built = buildWorldStateSnapshotV1({
      ...worldStateSnapshot,
      semanticFactsById: { [fact.id]: fact },
    });

    expect(built.semanticFactsById[fact.id]).toEqual(fact);
    expect(Object.isFrozen(built.semanticFactsById[fact.id])).toBe(true);
  });

  it.each([
    ["supportedBy", supportedByFact],
    ["touching", touchingFact],
    ["insideVolume", insideVolumeFact],
  ])("exports a standalone throwing parser for %s through the package barrel", (
    _label,
    fact,
  ) => {
    const parsed = parseGameplaySemanticFactV1FromBarrel(fact);

    expect(parsed).toEqual(fact);
    expect(Object.isFrozen(parsed)).toBe(true);
    if (parsed.type === "supportedBy") {
      expect(Object.isFrozen(parsed.supportPointMetersXYZ)).toBe(true);
      expect(Object.isFrozen(parsed.supportNormalXYZ)).toBe(true);
    }
    if (parsed.type === "touching") {
      expect(Object.isFrozen(parsed.entityIds)).toBe(true);
    }
    expect(() => parseGameplaySemanticFactV1FromBarrel({
      ...fact,
      id: "semantic-fact:invalid",
    })).toThrow("closed GameplaySemanticFactV1 schema");
  });

  it("rejects accessor-backed standalone Facts without invoking accessors", () => {
    let reads = 0;
    const accessorFact = { ...supportedByFact } as Record<string, unknown>;
    Object.defineProperty(accessorFact, "supportedEntityId", {
      enumerable: true,
      get: () => {
        reads += 1;
        return "g-bot-primary";
      },
    });

    expect(() => parseGameplaySemanticFactV1(accessorFact)).toThrow(
      "closed GameplaySemanticFactV1 schema",
    );
    expect(reads).toBe(0);
  });

  it.each([
    ["unsorted touching endpoints", {
      ...touchingFact,
      entityIds: ["ground-primary", "g-bot-primary"],
    }],
    ["duplicate touching endpoints", {
      ...touchingFact,
      entityIds: ["g-bot-primary", "g-bot-primary"],
    }],
    ["non-finite support point", {
      ...supportedByFact,
      supportPointMetersXYZ: [0, Infinity, 2],
    }],
    ["unsafe started tick", {
      ...insideVolumeFact,
      startedSimulationTick: Number.MAX_SAFE_INTEGER + 1,
    }],
    ["unknown Fact key", { ...insideVolumeFact, providerHandle: 1 }],
    ["mismatched derived Fact ID", {
      ...insideVolumeFact,
      id: "semantic-fact:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    }],
    ["missing projector ref", withoutKey(
      supportedByFact,
      "semanticFactProjectorProfileRef",
    )],
  ])("rejects %s", (_label, fact) => {
    const factId = typeof fact.id === "string" ? fact.id : "invalid-fact";
    expect(() => buildWorldStateSnapshotV1({
      ...worldStateSnapshot,
      semanticFactsById: { [factId]: fact },
    })).toThrow("closed WorldStateSnapshotV1 schema");
  });
});

const inspectionSnapshot = {
  kind: "worldkit-gameplay-inspection-snapshot",
  schemaVersion: 1,
  projection: "inspection",
  id: "gameplay-inspection-world-primary-12",
  runtimeSessionId: "runtime-primary",
  worldSessionId: "world-primary",
  gameplayModeRef: "worldkit://gameplay-mode/exploration@1",
  phase: "ready",
  simulationTick: 12,
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
  possessedByRelationshipsById: {
    "possession-primary": possessionRelationshipState,
  },
  activeActionStatesById: {
    "action-execution-primary": actionState,
  },
  activatedGameplayFeatureRefs: [
    "worldkit://gameplay-feature/core-control@1",
    "worldkit://gameplay-feature/core-semantic-action@1",
  ],
  lastEventSequence: 2,
} as const satisfies GameplayInspectionSnapshotV1;

describe("GameplayInspectionSnapshotV1", () => {
  it("is explicitly an inspection projection and has no duplicate binding truth", () => {
    const parsed = parseGameplayInspectionSnapshotV1(inspectionSnapshot);

    expect(parsed.projection).toBe("inspection");
    expect(parsed.participantStatesById["participant-primary"]).not.toHaveProperty(
      "controllerEntityIds",
    );
    expect(parsed.controllerStatesById["controller-primary"]).not.toHaveProperty(
      "binding",
    );
    expect(parsed.controllerStatesById["controller-primary"]).not.toHaveProperty(
      "controlledEntityId",
    );
  });

  it.each([
    ["participant controller array", {
      ...inspectionSnapshot,
      participantStatesById: {
        "participant-primary": {
          id: "participant-primary",
          mode: "active",
          controllerEntityIds: ["controller-primary"],
        },
      },
    }],
    ["Controller binding", {
      ...inspectionSnapshot,
      controllerStatesById: {
        "controller-primary": {
          id: "controller-primary",
          participantId: "participant-primary",
          binding: { mode: "possessed", controlledEntityId: "g-bot-primary" },
        },
      },
    }],
    ["Controller target", {
      ...inspectionSnapshot,
      controllerStatesById: {
        "controller-primary": {
          id: "controller-primary",
          participantId: "participant-primary",
          controlledEntityId: "g-bot-primary",
        },
      },
    }],
    ["missing projection marker", withoutKey(inspectionSnapshot, "projection")],
    ["wrong projection marker", { ...inspectionSnapshot, projection: "canonical" }],
    ["dangling Controller participant", {
      ...inspectionSnapshot,
      controllerStatesById: {
        "controller-primary": {
          id: "controller-primary",
          participantId: "participant-missing",
        },
      },
    }],
    ["dangling possession Controller", {
      ...inspectionSnapshot,
      possessedByRelationshipsById: {
        "possession-primary": {
          ...possessionRelationshipState,
          controllerEntityId: "controller-missing",
        },
      },
    }],
  ])("rejects %s", (_label, input) => {
    expect(() => parseGameplayInspectionSnapshotV1(input)).toThrow(
      "closed GameplayInspectionSnapshotV1 schema",
    );
  });
});

const capacityFields = Object.keys(
  DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
) as (keyof GameplayCapacityBudgetV1)[];

describe("GameplayCapacityBudgetV1", () => {
  it("uses the frozen trusted-local default budget", () => {
    expect(DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1).toEqual({
      maximumParticipantCount: 1,
      maximumControllerEntityCount: 1,
      maximumPossessedByRelationshipCount: 1,
      maximumActiveActionStateCount: 256,
      maximumGameplayFeatureCount: 16,
      maximumSemanticActionDefinitionCount: 256,
      maximumIdempotencyRecordCount: 4096,
      maximumRetiredActionExecutionIdCount: 4096,
      maximumRetainedReceiptCount: 4096,
      maximumRetainedEventCount: 8192,
    });
    expect(Object.isFrozen(DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1)).toBe(true);
  });

  it("requires a distinct retired Action execution ID budget", () => {
    expect(() => parseGameplayCapacityBudgetV1(withoutKey(
      DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1 as unknown as Readonly<
        Record<string, unknown>
      >,
      "maximumRetiredActionExecutionIdCount",
    ))).toThrow("closed GameplayCapacityBudgetV1 schema");
  });

  it.each(capacityFields.flatMap((field) => [
    [field, -1],
    [field, 1.5],
    [field, Number.NaN],
    [field, Infinity],
    [field, Number.MAX_SAFE_INTEGER + 1],
  ] as const))("rejects %s=%s", (field, value) => {
    expect(() => parseGameplayCapacityBudgetV1({
      ...DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
      [field]: value,
    })).toThrow("closed GameplayCapacityBudgetV1 schema");
  });

  it("accepts zero and deep-freezes the exact budget", () => {
    const zeroBudget = Object.fromEntries(
      capacityFields.map((field) => [field, 0]),
    );
    const parsed = parseGameplayCapacityBudgetV1(zeroBudget);

    expect(Object.values(parsed)).toEqual(new Array(capacityFields.length).fill(0));
    expect(Object.isFrozen(parsed)).toBe(true);
  });
});

describe("canonical numeric parsing", () => {
  const zeroTickFactWithoutId = {
    ...supportedByFact,
    startedSimulationTick: 0,
  };
  const zeroTickFact = {
    ...zeroTickFactWithoutId,
    id: deriveGameplaySemanticFactIdV1(zeroTickFactWithoutId),
  } as const;

  it.each([
    ["Receipt tick", () => parseGameplayCommandReceiptV1({
      ...committedReceipt,
      simulationTick: -0,
    })],
    ["Event tick", () => parseGameplayEventV1({
      ...relationshipCommittedEvent,
      simulationTick: -0,
    })],
    ["Event sequence", () => parseGameplayEventV1({
      ...relationshipCommittedEvent,
      id: "gameplay-event:world-primary:0",
      sequence: -0,
    })],
    ["Event ID derivation", () => deriveGameplayEventIdV1(
      "world-primary",
      -0,
    )],
    ["standalone Fact tick", () => parseGameplaySemanticFactV1({
      ...zeroTickFact,
      startedSimulationTick: -0,
    })],
    ["Fact ID derivation", () => deriveGameplaySemanticFactIdV1({
      ...zeroTickFact,
      startedSimulationTick: -0,
    })],
    ["World State tick", () => buildWorldStateSnapshotV1({
      ...worldStateSnapshot,
      simulationTick: -0,
      lastEventSequence: 0,
      relationshipStatesById: {},
      semanticFactsById: {},
      activeActionStatesById: {},
    })],
    ["World State last Event sequence", () => buildWorldStateSnapshotV1({
      ...worldStateSnapshot,
      lastEventSequence: -0,
    })],
    ["World State finite tuple", () => buildWorldStateSnapshotV1({
      ...worldStateSnapshot,
      entityStatesById: {
        ...worldStateSnapshot.entityStatesById,
        "g-bot-primary": {
          ...spatialEntityState,
          positionMetersXYZ: [-0, 0, 2],
        },
      },
    })],
    ["World State locomotion number", () => buildWorldStateSnapshotV1({
      ...worldStateSnapshot,
      capabilityStatesById: {
        "locomotion-g-bot-primary": {
          ...locomotionCapabilityState,
          speedMetersPerSecond: -0,
        },
      },
    })],
    ["World State relationship tick", () => buildWorldStateSnapshotV1({
      ...worldStateSnapshot,
      relationshipStatesById: {
        "possession-primary": {
          ...possessionRelationshipState,
          establishedSimulationTick: -0,
        },
      },
    })],
    ["World State Action tick", () => buildWorldStateSnapshotV1({
      ...worldStateSnapshot,
      activeActionStatesById: {
        "action-execution-primary": {
          ...actionState,
          startedSimulationTick: -0,
        },
      },
    })],
    ["inspection tick", () => parseGameplayInspectionSnapshotV1({
      ...inspectionSnapshot,
      simulationTick: -0,
    })],
    ["inspection last Event sequence", () => parseGameplayInspectionSnapshotV1({
      ...inspectionSnapshot,
      lastEventSequence: -0,
    })],
    ["capacity value", () => parseGameplayCapacityBudgetV1({
      ...DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
      maximumParticipantCount: -0,
    })],
  ])("rejects negative zero in the %s path", (_label, parse) => {
    expect(parse).toThrow();
  });
});
