import { describe, expect, it } from "vitest";

import {
  createGameplayActionDefinitionV1,
  type ActionActivateGameplayCommandV1,
  type GameplayRelationshipStateV1,
} from "@whitebox-world/gameplay-contracts";
import { sha256CanonicalJson } from "@whitebox-world/protocol";

import { createGameplayActionEffectRegistryV1 } from "./gameplay-action-effect-registry";
import {
  CORE_SEMANTIC_ACTION_FEATURE_REF,
} from "./core-semantic-action-feature";
import { CORE_CONTROL_FEATURE_REF } from "./core-control-feature";
import {
  DISMOUNT_ACTION_REQUEST_SCHEMA_HASH,
  DISMOUNT_ACTION_REQUEST_SCHEMA_REF,
  MOUNTED_RELATIONSHIP_EFFECT_HASH,
  MOUNTED_RELATIONSHIP_EFFECT_REF,
  MOUNTED_RELATIONSHIP_FEATURE_REF,
  MOUNT_ACTION_REQUEST_SCHEMA_HASH,
  MOUNT_ACTION_REQUEST_SCHEMA_REF,
  createMountedRelationshipFeatureFactoryV1,
} from "./mounted-relationship-feature";

const HASH = `sha256:${"a".repeat(64)}` as const;

function actionDefinition(
  operation: "mount" | "dismount",
) {
  return createGameplayActionDefinitionV1({
    kind: "semantic-action",
    id: operation,
    version: 1,
    resourceRef: `worldkit://semantic-action/${operation}@1`,
    executionMode: "exclusive-per-subject",
    completion: { mode: "immediate" },
    effect: {
      mode: "trusted",
      gameplayActionEffectRef: MOUNTED_RELATIONSHIP_EFFECT_REF,
      gameplayActionEffectHash: MOUNTED_RELATIONSHIP_EFFECT_HASH,
    },
    isMovementInputBlocked: true,
    allowedActorEntityDefinitionRefs: ["worldkit://entity/human@1"],
    requiredActorCapabilityRefs: [],
    request: {
      mode: "required",
      actionRequestSchemaRef: operation === "mount"
        ? MOUNT_ACTION_REQUEST_SCHEMA_REF
        : DISMOUNT_ACTION_REQUEST_SCHEMA_REF,
      actionRequestSchemaHash: operation === "mount"
        ? MOUNT_ACTION_REQUEST_SCHEMA_HASH
        : DISMOUNT_ACTION_REQUEST_SCHEMA_HASH,
    },
  });
}

function command(
  operation: "mount" | "dismount",
): ActionActivateGameplayCommandV1 {
  return {
    schemaVersion: 1,
    id: `${operation}-command`,
    type: "action.activate",
    runtimeSessionId: "runtime-a",
    worldSessionId: "world-a",
    controllerEntityId: "controller-a",
    expectedPossession: {
      mode: "possessed",
      controlledEntityId: operation === "mount" ? "rider" : "board",
    },
    actionExecutionId: `${operation}-execution`,
    semanticActionRef: actionDefinition(operation).resourceRef,
    actorEntityId: "rider",
    actionRequestRef: `worldkit://action-request/${operation}-a@1`,
    actionRequestHash: HASH,
  };
}

function possession(
  controlledEntityId: string,
): GameplayRelationshipStateV1 {
  return {
    id: `possessed-${controlledEntityId}`,
    type: "possessedBy",
    schemaVersion: 1,
    controlledEntityId,
    controllerEntityId: "controller-a",
    establishedSimulationTick: 1,
  };
}

describe("mounted-relationship Gameplay Feature", () => {
  it("depends on both core Features, owns no command Handler, and registers one exact planner", async () => {
    const factory = createMountedRelationshipFeatureFactoryV1();
    expect(factory.manifest.resourceRef).toBe(MOUNTED_RELATIONSHIP_FEATURE_REF);
    expect(factory.manifest.dependencyFeatureRefs).toEqual([
      CORE_CONTROL_FEATURE_REF,
      CORE_SEMANTIC_ACTION_FEATURE_REF,
    ]);
    expect(factory.manifest.commandTypes).toEqual([]);
    expect(factory.manifest.resourceBudget.commandHandlerCount).toBe(0);

    const effects = createGameplayActionEffectRegistryV1();
    const feature = factory.create({
      worldSessionId: "world-a",
      actionEffectRegistry: effects.registry,
      actionEffectRegistrar: effects.registrar,
    });
    const context = {
      worldSessionId: "world-a",
      actionEffectRegistry: effects.registry,
      actionEffectRegistrar: effects.registrar,
    };
    const slice = feature.createStateSlice(context);
    await feature.prepare(context, slice);
    await feature.activate(context, slice);
    expect(
      effects.registry.resolve(
        MOUNTED_RELATIONSHIP_EFFECT_REF,
        MOUNTED_RELATIONSHIP_EFFECT_HASH,
      ),
    ).toBeDefined();
  });

  it("plans closed Mount and Dismount Relationship changes from immutable requests", async () => {
    const effects = createGameplayActionEffectRegistryV1();
    const feature = createMountedRelationshipFeatureFactoryV1().create({
      worldSessionId: "world-a",
      actionEffectRegistry: effects.registry,
      actionEffectRegistrar: effects.registrar,
    });
    const context = {
      worldSessionId: "world-a",
      actionEffectRegistry: effects.registry,
      actionEffectRegistrar: effects.registrar,
    };
    const slice = feature.createStateSlice(context);
    await feature.activate(context, slice);
    effects.registrar.seal();
    const planner = effects.registry.resolve(
      MOUNTED_RELATIONSHIP_EFFECT_REF,
      MOUNTED_RELATIONSHIP_EFFECT_HASH,
    )!;

    const mountCommand = command("mount");
    const mount = planner.plan({
      command: mountCommand,
      definition: actionDefinition("mount"),
      actionRequest: {
        actionRequestRef: mountCommand.actionRequestRef!,
        actionRequestHash: mountCommand.actionRequestHash!,
        actionRequestSchemaRef: MOUNT_ACTION_REQUEST_SCHEMA_REF,
        actionRequestSchemaHash: MOUNT_ACTION_REQUEST_SCHEMA_HASH,
        request: {
          kind: "mount-action-request",
          schemaVersion: 1,
          id: "mount-a",
          riderEntityId: "rider",
          mountEntityId: "board",
          mountSlotId: "stand",
        },
      },
      planningView: {
        simulationTick: 7,
        relationshipStatesById: { riderPossession: possession("rider") },
      },
    });
    expect(mount).toMatchObject({
      operation: "mount",
      actorEntityId: "rider",
      requiredControlledEntityId: "rider",
      runtimeProjectionWriteSet: {
        spatialEntityIds: ["rider"],
        capabilityStateIds: ["capability-state:rider:locomotion"],
        semanticFactIds: [],
      },
    });
    expect(mount.relationshipChanges.map(({ operation }) => operation)).toEqual([
      "remove", "add", "add",
    ]);
    const mounted = mount.relationshipChanges.find(
      (change) => change.operation === "add" && change.after.type === "mountedOn",
    );
    expect(mounted).toBeDefined();

    const mountedRelationship = mounted!.operation === "add"
      ? mounted!.after
      : undefined;
    const boardPossession = mount.relationshipChanges.find(
      (change) => change.operation === "add" &&
        change.after.type === "possessedBy" &&
        change.after.controlledEntityId === "board",
    );
    const dismountCommand = command("dismount");
    const dismount = planner.plan({
      command: dismountCommand,
      definition: actionDefinition("dismount"),
      actionRequest: {
        actionRequestRef: dismountCommand.actionRequestRef!,
        actionRequestHash: dismountCommand.actionRequestHash!,
        actionRequestSchemaRef: DISMOUNT_ACTION_REQUEST_SCHEMA_REF,
        actionRequestSchemaHash: DISMOUNT_ACTION_REQUEST_SCHEMA_HASH,
        request: {
          kind: "dismount-action-request",
          schemaVersion: 1,
          id: "dismount-a",
          riderEntityId: "rider",
          mountedOnRelationshipId: mountedRelationship!.id,
        },
      },
      planningView: {
        simulationTick: 8,
        relationshipStatesById: {
          mounted: mountedRelationship!,
          boardPossession: boardPossession!.operation === "add"
            ? boardPossession!.after
            : possession("board"),
        },
      },
    });
    expect(dismount).toMatchObject({
      operation: "dismount",
      actorEntityId: "rider",
      requiredControlledEntityId: "board",
    });
    expect(dismount.relationshipChanges.map(({ operation }) => operation)).toEqual([
      "remove", "remove", "add",
    ]);
  });

  it("rejects schema mismatches and unknown request fields", async () => {
    const effects = createGameplayActionEffectRegistryV1();
    const feature = createMountedRelationshipFeatureFactoryV1().create({
      worldSessionId: "world-a",
      actionEffectRegistry: effects.registry,
      actionEffectRegistrar: effects.registrar,
    });
    await feature.activate({
      worldSessionId: "world-a",
      actionEffectRegistry: effects.registry,
      actionEffectRegistrar: effects.registrar,
    }, {});
    const planner = effects.registry.resolve(
      MOUNTED_RELATIONSHIP_EFFECT_REF,
      MOUNTED_RELATIONSHIP_EFFECT_HASH,
    )!;
    const mountCommand = command("mount");
    expect(() => planner.plan({
      command: mountCommand,
      definition: actionDefinition("mount"),
      actionRequest: {
        actionRequestRef: mountCommand.actionRequestRef!,
        actionRequestHash: mountCommand.actionRequestHash!,
        actionRequestSchemaRef: DISMOUNT_ACTION_REQUEST_SCHEMA_REF,
        actionRequestSchemaHash: DISMOUNT_ACTION_REQUEST_SCHEMA_HASH,
        request: {
          kind: "mount-action-request",
          schemaVersion: 1,
          id: "mount-a",
          riderEntityId: "rider",
          mountEntityId: "board",
          mountSlotId: "stand",
          genericParams: {},
        },
      },
      planningView: {
        simulationTick: 7,
        relationshipStatesById: { riderPossession: possession("rider") },
      },
    })).toThrow(/MOUNTED_RELATIONSHIP_EFFECT_INVALID/);
  });
});
