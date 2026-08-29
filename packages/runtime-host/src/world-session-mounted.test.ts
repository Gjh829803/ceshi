import {
  createGameplayActionDefinitionV1,
  createGameplayBootstrapV1,
  DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
  type ActionActivateGameplayCommandV1,
  type ControllerEntityStateV1,
  type GameplayParticipantStateV1,
  type SpatialEntityStateV1,
} from "@whitebox-world/gameplay-contracts";
import {
  ACTION_PROJECTION_CAPABILITY_REF,
  CONTROL_TRANSITION_CAPABILITY_REF,
  MOUNTED_RELATIONSHIP_EFFECT_HASH,
  MOUNTED_RELATIONSHIP_EFFECT_REF,
  MOUNT_ACTION_REQUEST_SCHEMA_HASH,
  MOUNT_ACTION_REQUEST_SCHEMA_REF,
  createCoreControlFeatureFactoryV1,
  createCoreSemanticActionFeatureFactoryV1,
  createMountedRelationshipFeatureFactoryV1,
  type GameplayModeV1,
} from "@whitebox-world/gameplay";
import { canonicalJsonBytes, sha256CanonicalJson } from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import { createFakeGameplayWorldPortHarnessV1 } from "./test/fake-gameplay-world-adapter";
import { createTestWorldBuildIdentityV1 } from "./test/world-build-identity-fixture";
import { WorldSession } from "./world-session";

const HASH = `sha256:${"a".repeat(64)}` as const;
const RUNTIME_SESSION_ID = "runtime.mounted";
const WORLD_SESSION_ID = "world.mounted";
const RIDER_ID = "entity.rider";
const MOUNT_ID = "entity.skateboard";
const CONTROLLER_ID = "controller.primary";
const RIDER_DEFINITION_REF = "worldkit://entity-definition/humanoid@1";
const MOUNT_DEFINITION_REF = "worldkit://entity-definition/skateboard@1";
const MOUNT_ACTION_REF = "worldkit://semantic-action/mount@1";

const participant = Object.freeze({
  id: "participant.primary",
  mode: "active",
}) satisfies GameplayParticipantStateV1;

const controller = Object.freeze({
  id: CONTROLLER_ID,
  kind: "controller-entity-state",
  controllerDefinitionRef: "worldkit://controller-definition/local@1",
  controllerDefinitionHash: HASH,
  participantId: participant.id,
  lifecycleMode: "active",
  inputMode: "human",
}) satisfies ControllerEntityStateV1;

function spatialEntity(
  id: string,
  entityDefinitionRef: string,
  positionMetersXYZ: readonly [number, number, number],
): SpatialEntityStateV1 {
  return Object.freeze({
    id,
    kind: "spatial-entity-state",
    entityDefinitionRef,
    entityDefinitionHash: HASH,
    semanticClassId: id === RIDER_ID
      ? "character.humanoid"
      : "vehicle.skateboard",
    lifecycleMode: "active",
    positionMetersXYZ,
    rotationQuaternionXYZW: [0, 0, 0, 1] as const,
    scaleRatioXYZ: [1, 1, 1] as const,
    linearVelocityMetersPerSecondXYZ: [0, 0, 0] as const,
  });
}

const rider = spatialEntity(RIDER_ID, RIDER_DEFINITION_REF, [0, 0, 0]);
const skateboard = spatialEntity(MOUNT_ID, MOUNT_DEFINITION_REF, [0, 0, 0]);
const request = Object.freeze({
  kind: "mount-action-request" as const,
  schemaVersion: 1 as const,
  id: "request.mount.rider",
  riderEntityId: RIDER_ID,
  mountEntityId: MOUNT_ID,
  mountSlotId: "stand",
});
const requestHash = sha256CanonicalJson(request) as `sha256:${string}`;

const controlFeature = createCoreControlFeatureFactoryV1();
const actionFeature = createCoreSemanticActionFeatureFactoryV1();
const mountedFeature = createMountedRelationshipFeatureFactoryV1();
const mountAction = createGameplayActionDefinitionV1({
  kind: "semantic-action",
  id: "mount",
  version: 1,
  resourceRef: MOUNT_ACTION_REF,
  executionMode: "exclusive-per-subject",
  completion: { mode: "immediate" },
  effect: {
    mode: "trusted",
    gameplayActionEffectRef: MOUNTED_RELATIONSHIP_EFFECT_REF,
    gameplayActionEffectHash: MOUNTED_RELATIONSHIP_EFFECT_HASH,
  },
  isMovementInputBlocked: false,
  allowedActorEntityDefinitionRefs: [RIDER_DEFINITION_REF],
  requiredActorCapabilityRefs: [],
  request: {
    mode: "required",
    actionRequestSchemaRef: MOUNT_ACTION_REQUEST_SCHEMA_REF,
    actionRequestSchemaHash: MOUNT_ACTION_REQUEST_SCHEMA_HASH,
  },
});

const gameplayBootstrap = createGameplayBootstrapV1({
  kind: "gameplay-bootstrap",
  id: "gameplay.mounted",
  version: 1,
  resourceRef: "worldkit://gameplay-bootstrap/mounted@1",
  entityDescriptors: [
    {
      id: RIDER_ID,
      entityDefinitionRef: RIDER_DEFINITION_REF,
      capabilityRefs: [CONTROL_TRANSITION_CAPABILITY_REF],
    },
    {
      id: MOUNT_ID,
      entityDefinitionRef: MOUNT_DEFINITION_REF,
      capabilityRefs: [
        CONTROL_TRANSITION_CAPABILITY_REF,
        "worldkit://capability/relationship.mounted-on@1",
      ],
    },
  ],
  featureResourceLocks: [controlFeature, actionFeature, mountedFeature].map(
    ({ manifest }) => ({
      resourceRef: manifest.resourceRef,
      contentHash: manifest.contentHash,
    }),
  ),
  semanticActionDefinitions: [mountAction],
  availableCapabilityRefs: [
    ACTION_PROJECTION_CAPABILITY_REF,
    CONTROL_TRANSITION_CAPABILITY_REF,
  ],
  initialRelationshipStates: [],
});

const gameplayMode = Object.freeze({
  gameplayModeRef: "worldkit://gameplay-mode/exploration@1",
  evaluateCommand: () => Object.freeze({ status: "accepted" as const }),
}) satisfies GameplayModeV1;

function projection(
  riderState: SpatialEntityStateV1 = rider,
  mountState: SpatialEntityStateV1 = skateboard,
  capabilityStatesById: Readonly<Record<string, unknown>> = {},
) {
  return Object.freeze({
    simulationTick: 0,
    spatialEntityStatesById: Object.freeze({
      [RIDER_ID]: riderState,
      [MOUNT_ID]: mountState,
    }),
    capabilityStatesById: Object.freeze({ ...capabilityStatesById }),
    semanticFactsById: Object.freeze({}),
  });
}

function createMountedHarness() {
  const harness = createFakeGameplayWorldPortHarnessV1({
    initialWorldProjection: projection(),
    controllableEntityIds: [RIDER_ID, MOUNT_ID],
    availableActions: [{
      actorEntityId: RIDER_ID,
      semanticActionRef: MOUNT_ACTION_REF,
    }],
  });
  return {
    harness,
    options: {
      runtimeSessionId: RUNTIME_SESSION_ID,
      worldSessionId: WORLD_SESSION_ID,
      worldBuildIdentity: createTestWorldBuildIdentityV1(HASH),
      gameplayBootstrap,
      initialRelationships: [],
      participantStates: [participant],
      controllerStates: [controller],
      fixedInputControllerEntityId: CONTROLLER_ID,
      gameplayModeFactory: () => gameplayMode,
      gameplayFeatureFactories: [controlFeature, actionFeature, mountedFeature],
      gameplayActionRequestResolver: (ref: string, hash: `sha256:${string}`) =>
        ref === "worldkit://action-request/mount-rider@1" && hash === requestHash
          ? {
              actionRequestSchemaRef: MOUNT_ACTION_REQUEST_SCHEMA_REF,
              actionRequestSchemaHash: MOUNT_ACTION_REQUEST_SCHEMA_HASH,
              actionRequestBytes: canonicalJsonBytes(request),
            }
          : undefined,
      gameplayCapacityBudget: {
        ...DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
        maximumRelationshipStateCount: 4,
      },
      worldPort: harness.port,
    },
  } as const;
}

function bindCommand() {
  return {
    schemaVersion: 1 as const,
    id: "command.bind.rider",
    type: "control.bind" as const,
    runtimeSessionId: RUNTIME_SESSION_ID,
    worldSessionId: WORLD_SESSION_ID,
    controllerEntityId: CONTROLLER_ID,
    controlledEntityId: RIDER_ID,
    expectedPossession: { mode: "unbound" as const },
  };
}

function mountCommand(): ActionActivateGameplayCommandV1 {
  return {
    schemaVersion: 1,
    id: "command.mount.rider",
    type: "action.activate",
    runtimeSessionId: RUNTIME_SESSION_ID,
    worldSessionId: WORLD_SESSION_ID,
    controllerEntityId: CONTROLLER_ID,
    actionExecutionId: "action-execution.mount.rider",
    semanticActionRef: MOUNT_ACTION_REF,
    actorEntityId: RIDER_ID,
    expectedPossession: { mode: "possessed", controlledEntityId: RIDER_ID },
    actionRequestRef: "worldkit://action-request/mount-rider@1",
    actionRequestHash: requestHash,
  };
}

function mountedProjection(input: Readonly<{ mutateMount?: boolean }> = {}) {
  const mountedRelationshipId = `mounted-on:${sha256CanonicalJson({
    type: "mountedOn",
    acceptedActionCommandId: "command.mount.rider",
  })}`;
  return projection(
    { ...rider, positionMetersXYZ: [0, 1, 0] },
    input.mutateMount
      ? { ...skateboard, positionMetersXYZ: [9, 0, 0] }
      : skateboard,
    {
      [`capability-state:${RIDER_ID}:locomotion`]: {
        id: `capability-state:${RIDER_ID}:locomotion`,
        kind: "locomotion-capability-state",
        ownerEntityId: RIDER_ID,
        locomotionCapabilityRef: "worldkit://locomotion-profile/humanoid@1",
        locomotionCapabilityHash: HASH,
        mode: "suspended",
        suspendedByRelationshipId: mountedRelationshipId,
      },
    },
  );
}

async function bindRider(session: WorldSession): Promise<void> {
  await expect(session.executeGameplayCommand(bindCommand())).resolves
    .toMatchObject({ status: "committed" });
}

describe("WorldSession mountedOn transaction", () => {
  it("commits exactly the declared Rider pose and locomotion projection with all five Events", async () => {
    const { harness, options } = createMountedHarness();
    const session = await WorldSession.create(options);
    await bindRider(session);
    harness.queuePreparedTransition({
      projectedWorldStateAfter: mountedProjection(),
      projectedViewStateAfter: { viewStateRevision: 1 },
    });

    const receipt = await session.executeGameplayCommand(mountCommand());

    expect(receipt).toMatchObject({ status: "committed" });
    expect(receipt.eventIds).toHaveLength(5);
    expect(session.eventsAfter(1, 10).map(({ type }) => type)).toEqual([
      "relationship.removed",
      "relationship.committed",
      "relationship.committed",
      "action.started",
      "action.completed",
    ]);
    expect(session.snapshot()).toMatchObject({
      publicationEpoch: 2,
      worldState: {
        entityStatesById: {
          [RIDER_ID]: { positionMetersXYZ: [0, 1, 0] },
          [MOUNT_ID]: { positionMetersXYZ: [0, 0, 0] },
        },
        capabilityStatesById: {
          [`capability-state:${RIDER_ID}:locomotion`]: {
            mode: "suspended",
          },
        },
      },
      gameplayInspection: { activeActionStatesById: {} },
    });
  });

  it("aborts an undeclared Mount pose write without publishing any mounted state", async () => {
    const { harness, options } = createMountedHarness();
    const session = await WorldSession.create(options);
    await bindRider(session);
    const before = session.snapshot();
    harness.queuePreparedTransition({
      projectedWorldStateAfter: mountedProjection({ mutateMount: true }),
      projectedViewStateAfter: { viewStateRevision: 1 },
    });

    const receipt = await session.executeGameplayCommand(mountCommand());

    expect(receipt).toMatchObject({
      status: "rejected",
      diagnostic: { code: "ADAPTER_PREPARE_FAILED" },
    });
    expect(harness.abortCount).toBe(1);
    expect(session.snapshot()).toBe(before);
    expect(Object.values(before.gameplayInspection.relationshipStatesById))
      .toHaveLength(1);
  });

  it("keeps Relationship, possession, Events and WorldState unchanged when mounted prepare throws", async () => {
    const { harness, options } = createMountedHarness();
    const session = await WorldSession.create(options);
    await bindRider(session);
    const before = session.snapshot();
    harness.failNextOperation(
      "prepare-gameplay-transition",
      "reject",
      new Error("private prepare failure"),
    );

    const receipt = await session.executeGameplayCommand(mountCommand());

    expect(receipt).toMatchObject({
      status: "rejected",
      diagnostic: { code: "ADAPTER_PREPARE_FAILED" },
      eventIds: [],
    });
    expect(session.snapshot()).toBe(before);
    expect(harness.commitCount).toBe(1);
  });
});
