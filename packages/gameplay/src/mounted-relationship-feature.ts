import type { Sha256HashV1 } from "@whitebox-world/protocol";

import {
  createGameplayFeatureManifestV1,
  type GameplayRelationshipStateV1,
  type MountedOnRelationshipStateV1,
  type PossessedByRelationshipStateV1,
} from "@whitebox-world/gameplay-contracts";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isNil } from "lodash-es";

import { CORE_CONTROL_FEATURE_REF } from "./core-control-feature";
import { CORE_SEMANTIC_ACTION_FEATURE_REF } from "./core-semantic-action-feature";
import type {
  GameplayActionEffectPlannerInputV1,
  GameplayTrustedActionEffectPlanV1,
} from "./gameplay-action-effect-registry";
import type {
  GameplayFeatureActivationContextV1,
  GameplayFeatureFactoryV1,
} from "./gameplay-feature-manager";

export const MOUNTED_RELATIONSHIP_FEATURE_REF =
  "worldkit://gameplay-feature/mounted-relationship@1" as const;
export const MOUNTED_RELATIONSHIP_EFFECT_REF =
  "worldkit://gameplay-action-effect/mounted-relationship@1" as const;
export const MOUNT_ACTION_REQUEST_SCHEMA_REF =
  "worldkit://schema/mount-action-request@1" as const;
export const DISMOUNT_ACTION_REQUEST_SCHEMA_REF =
  "worldkit://schema/dismount-action-request@1" as const;

const MOUNT_ACTION_REQUEST_SCHEMA_BODY = {
  kind: "action-request-schema",
  schemaVersion: 1,
  requestKind: "mount-action-request",
  fields: [
    "id",
    "kind",
    "mountEntityId",
    "mountSlotId",
    "riderEntityId",
    "schemaVersion",
  ],
} as const;
const DISMOUNT_ACTION_REQUEST_SCHEMA_BODY = {
  kind: "action-request-schema",
  schemaVersion: 1,
  requestKind: "dismount-action-request",
  fields: [
    "id",
    "kind",
    "mountedOnRelationshipId",
    "riderEntityId",
    "schemaVersion",
  ],
} as const;

export const MOUNT_ACTION_REQUEST_SCHEMA_HASH = sha256CanonicalJson(
  MOUNT_ACTION_REQUEST_SCHEMA_BODY,
) as Sha256HashV1;
export const DISMOUNT_ACTION_REQUEST_SCHEMA_HASH = sha256CanonicalJson(
  DISMOUNT_ACTION_REQUEST_SCHEMA_BODY,
) as Sha256HashV1;
export const MOUNTED_RELATIONSHIP_EFFECT_HASH = sha256CanonicalJson({
  kind: "gameplay-action-effect",
  schemaVersion: 1,
  resourceRef: MOUNTED_RELATIONSHIP_EFFECT_REF,
  supportedRequestSchemaRefs: [
    DISMOUNT_ACTION_REQUEST_SCHEMA_REF,
    MOUNT_ACTION_REQUEST_SCHEMA_REF,
  ],
}) as Sha256HashV1;

interface MountActionRequestV1 {
  readonly kind: "mount-action-request";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly riderEntityId: string;
  readonly mountEntityId: string;
  readonly mountSlotId: string;
}

interface DismountActionRequestV1 {
  readonly kind: "dismount-action-request";
  readonly schemaVersion: 1;
  readonly id: string;
  readonly riderEntityId: string;
  readonly mountedOnRelationshipId: string;
}

function effectInvalid(message: string): never {
  throw new Error(`MOUNTED_RELATIONSHIP_EFFECT_INVALID: ${message}`);
}

function exactRecord(
  input: unknown,
  keys: readonly string[],
): Readonly<Record<string, unknown>> {
  if (typeof input !== "object" || isNil(input) || Array.isArray(input)) {
    return effectInvalid("Action Request must be a plain object.");
  }
  const record = input as Readonly<Record<string, unknown>>;
  const actual = Object.keys(record);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    return effectInvalid("Action Request has an invalid closed shape.");
  }
  return record;
}

function nonEmptyString(input: unknown, field: string): string {
  if (typeof input !== "string" || input.length === 0) {
    return effectInvalid(`${field} must be a non-empty string.`);
  }
  return input;
}

function parseMountRequest(input: unknown): MountActionRequestV1 {
  const row = exactRecord(input, [
    "kind",
    "schemaVersion",
    "id",
    "riderEntityId",
    "mountEntityId",
    "mountSlotId",
  ]);
  if (row.kind !== "mount-action-request" || row.schemaVersion !== 1) {
    return effectInvalid("Mount request discriminator is invalid.");
  }
  return {
    kind: "mount-action-request",
    schemaVersion: 1,
    id: nonEmptyString(row.id, "id"),
    riderEntityId: nonEmptyString(row.riderEntityId, "riderEntityId"),
    mountEntityId: nonEmptyString(row.mountEntityId, "mountEntityId"),
    mountSlotId: nonEmptyString(row.mountSlotId, "mountSlotId"),
  };
}

function parseDismountRequest(input: unknown): DismountActionRequestV1 {
  const row = exactRecord(input, [
    "kind",
    "schemaVersion",
    "id",
    "riderEntityId",
    "mountedOnRelationshipId",
  ]);
  if (row.kind !== "dismount-action-request" || row.schemaVersion !== 1) {
    return effectInvalid("Dismount request discriminator is invalid.");
  }
  return {
    kind: "dismount-action-request",
    schemaVersion: 1,
    id: nonEmptyString(row.id, "id"),
    riderEntityId: nonEmptyString(row.riderEntityId, "riderEntityId"),
    mountedOnRelationshipId: nonEmptyString(
      row.mountedOnRelationshipId,
      "mountedOnRelationshipId",
    ),
  };
}

function possessionId(commandId: string): string {
  return `possessed-by:${sha256CanonicalJson({
    type: "possessedBy",
    acceptedBindCommandId: commandId,
  })}`;
}

function mountedOnId(commandId: string): string {
  return `mounted-on:${sha256CanonicalJson({
    type: "mountedOn",
    acceptedActionCommandId: commandId,
  })}`;
}

function relationships(
  input: GameplayActionEffectPlannerInputV1,
): readonly GameplayRelationshipStateV1[] {
  return Object.values(input.planningView.relationshipStatesById)
    .sort((left, right) => left.id.localeCompare(right.id));
}

function planMount(
  input: GameplayActionEffectPlannerInputV1,
): GameplayTrustedActionEffectPlanV1 {
  if (
    input.actionRequest.actionRequestSchemaRef !== MOUNT_ACTION_REQUEST_SCHEMA_REF ||
    input.actionRequest.actionRequestSchemaHash !== MOUNT_ACTION_REQUEST_SCHEMA_HASH
  ) return effectInvalid("Mount request Schema lock does not match.");
  const request = parseMountRequest(input.actionRequest.request);
  const possession = relationships(input).find(
    (relationship): relationship is PossessedByRelationshipStateV1 =>
      relationship.type === "possessedBy" &&
      relationship.controllerEntityId === input.command.controllerEntityId &&
      relationship.controlledEntityId === request.riderEntityId,
  );
  if (possession === undefined) {
    return effectInvalid("Mount planning requires current Rider possession.");
  }
  const tick = input.planningView.simulationTick;
  const mountedOn: MountedOnRelationshipStateV1 = {
    id: mountedOnId(input.command.id),
    type: "mountedOn",
    schemaVersion: 1,
    riderEntityId: request.riderEntityId,
    mountEntityId: request.mountEntityId,
    mountSlotId: request.mountSlotId,
    establishedSimulationTick: tick,
  };
  const mountPossession: PossessedByRelationshipStateV1 = {
    id: possessionId(input.command.id),
    type: "possessedBy",
    schemaVersion: 1,
    controlledEntityId: request.mountEntityId,
    controllerEntityId: input.command.controllerEntityId,
    establishedSimulationTick: tick,
  };
  return {
    kind: "mounted-relationship-effect-plan",
    schemaVersion: 1,
    operation: "mount",
    actorEntityId: request.riderEntityId,
    requiredControlledEntityId: request.riderEntityId,
    relationshipChanges: [
      { operation: "remove", before: possession },
      { operation: "add", after: mountedOn },
      { operation: "add", after: mountPossession },
    ],
    runtimeProjectionWriteSet: {
      spatialEntityIds: [request.riderEntityId],
      capabilityStateIds: [
        `capability-state:${request.riderEntityId}:locomotion`,
      ],
      semanticFactIds: [],
    },
  };
}

function planDismount(
  input: GameplayActionEffectPlannerInputV1,
): GameplayTrustedActionEffectPlanV1 {
  if (
    input.actionRequest.actionRequestSchemaRef !== DISMOUNT_ACTION_REQUEST_SCHEMA_REF ||
    input.actionRequest.actionRequestSchemaHash !== DISMOUNT_ACTION_REQUEST_SCHEMA_HASH
  ) return effectInvalid("Dismount request Schema lock does not match.");
  const request = parseDismountRequest(input.actionRequest.request);
  const mountedOn = relationships(input).find(
    (relationship): relationship is MountedOnRelationshipStateV1 =>
      relationship.type === "mountedOn" &&
      relationship.id === request.mountedOnRelationshipId &&
      relationship.riderEntityId === request.riderEntityId,
  );
  if (mountedOn === undefined) {
    return effectInvalid("Dismount planning requires the exact mountedOn Relationship.");
  }
  const possession = relationships(input).find(
    (relationship): relationship is PossessedByRelationshipStateV1 =>
      relationship.type === "possessedBy" &&
      relationship.controllerEntityId === input.command.controllerEntityId &&
      relationship.controlledEntityId === mountedOn.mountEntityId,
  );
  if (possession === undefined) {
    return effectInvalid("Dismount planning requires current Mount possession.");
  }
  const riderPossession: PossessedByRelationshipStateV1 = {
    id: possessionId(input.command.id),
    type: "possessedBy",
    schemaVersion: 1,
    controlledEntityId: request.riderEntityId,
    controllerEntityId: input.command.controllerEntityId,
    establishedSimulationTick: input.planningView.simulationTick,
  };
  return {
    kind: "mounted-relationship-effect-plan",
    schemaVersion: 1,
    operation: "dismount",
    actorEntityId: request.riderEntityId,
    requiredControlledEntityId: mountedOn.mountEntityId,
    relationshipChanges: [
      { operation: "remove", before: mountedOn },
      { operation: "remove", before: possession },
      { operation: "add", after: riderPossession },
    ],
    runtimeProjectionWriteSet: {
      spatialEntityIds: [request.riderEntityId],
      capabilityStateIds: [
        `capability-state:${request.riderEntityId}:locomotion`,
      ],
      semanticFactIds: [],
    },
  };
}

function mountedRelationshipPlanner(
  input: GameplayActionEffectPlannerInputV1,
): GameplayTrustedActionEffectPlanV1 {
  if (
    input.definition.effect.mode !== "trusted" ||
    input.definition.effect.gameplayActionEffectRef !==
      MOUNTED_RELATIONSHIP_EFFECT_REF ||
    input.definition.effect.gameplayActionEffectHash !==
      MOUNTED_RELATIONSHIP_EFFECT_HASH ||
    input.definition.completion.mode !== "immediate" ||
    input.definition.request.mode !== "required"
  ) return effectInvalid("Semantic Action Definition is not the locked immediate effect.");
  const request = input.actionRequest.request as Readonly<Record<string, unknown>>;
  return request?.kind === "mount-action-request"
    ? planMount(input)
    : request?.kind === "dismount-action-request"
      ? planDismount(input)
      : effectInvalid("Action Request kind is unsupported.");
}

const manifest = createGameplayFeatureManifestV1({
  kind: "gameplay-feature",
  id: "mounted-relationship",
  version: 1,
  resourceRef: MOUNTED_RELATIONSHIP_FEATURE_REF,
  dependencyFeatureRefs: [
    CORE_CONTROL_FEATURE_REF,
    CORE_SEMANTIC_ACTION_FEATURE_REF,
  ],
  requiredCapabilityRefs: [],
  commandTypes: [],
  resourceBudget: { stateSliceCount: 1, commandHandlerCount: 0 },
});

export function createMountedRelationshipFeatureFactoryV1(): GameplayFeatureFactoryV1 {
  return Object.freeze({
    manifest,
    create: () => ({
      resourceRef: MOUNTED_RELATIONSHIP_FEATURE_REF,
      commandHandlers: [],
      createStateSlice: () => Object.freeze({
        kind: "mounted-relationship-state",
        schemaVersion: 1,
      }),
      prepare: () => undefined,
      activate: (context: GameplayFeatureActivationContextV1) => {
        if (isNil(context.actionEffectRegistrar)) {
          throw new Error(
            "MOUNTED_RELATIONSHIP_EFFECT_INVALID: Effect registrar is unavailable.",
          );
        }
        context.actionEffectRegistrar.register({
          gameplayActionEffectRef: MOUNTED_RELATIONSHIP_EFFECT_REF,
          gameplayActionEffectHash: MOUNTED_RELATIONSHIP_EFFECT_HASH,
          plan: mountedRelationshipPlanner,
        });
      },
      deactivate: () => undefined,
      dispose: () => undefined,
    }),
  });
}
