import {
  buildWorldStateSnapshotV1,
  parseGameplayInspectionSnapshotV1,
  type ActionActivateGameplayCommandV1,
  type ActionCancelGameplayCommandV1,
  type ControlBindGameplayCommandV1,
  type ControlReleaseGameplayCommandV1,
  type GameplayActionStateV1,
  type GameplayCapacityBudgetV1,
  type GameplayCapabilityStateV1,
  type ControllerEntityStateV1,
  type GameplayDiagnosticCodeV1,
  type GameplayDiagnosticV1,
  type GameplayInspectionSnapshotV1,
  type GameplayParticipantStateV1,
  type GameplaySemanticFactV1,
  type PossessedByRelationshipStateV1,
  type Sha256HashV1,
  type SpatialEntityStateV1,
  type WorldStateSnapshotV1,
} from "@whitebox-world/gameplay-contracts";
import { sha256CanonicalJson } from "@whitebox-world/protocol";

import type {
  GameplayActionCatalogV1,
  GameplayActionRequestResolverV1,
  InternalGameplayActionExecutionV1,
} from "./core-semantic-action-feature";

export interface GameplayEntityDescriptorV1 {
  readonly id: string;
  readonly entityDefinitionRef: string;
  readonly capabilityRefs: readonly string[];
}

export interface GameplayStateOptionsV1 {
  readonly runtimeSessionId: string;
  readonly worldSessionId: string;
  readonly participantStates: readonly GameplayParticipantStateV1[];
  readonly controllerStates: readonly ControllerEntityStateV1[];
  readonly entityDescriptors: readonly GameplayEntityDescriptorV1[];
  readonly actionCatalog: GameplayActionCatalogV1;
  readonly actionRequestResolver?: GameplayActionRequestResolverV1;
  readonly capacityBudget: GameplayCapacityBudgetV1;
}

export interface GameplayTransitionCapacityDeltaV1 {
  readonly relationshipStateCountDelta: number;
  readonly activeActionStateCountDelta: number;
  readonly retiredActionExecutionIdCountDelta: number;
  readonly requiredEventCount: number;
}

export type GameplayRelationshipChangeV1 =
  | Readonly<{
      operation: "add";
      before?: never;
      after: PossessedByRelationshipStateV1;
    }>
  | Readonly<{
      operation: "remove";
      before: PossessedByRelationshipStateV1;
      after?: never;
    }>;

export type GameplayActionChangeV1 =
  | Readonly<{
      operation: "add";
      before?: never;
      after: InternalGameplayActionExecutionV1;
    }>
  | Readonly<{
      operation: "remove";
      before: InternalGameplayActionExecutionV1;
      after?: never;
    }>;

interface GameplayTransitionPlanBaseV1 {
  readonly kind: "gameplay-transition-plan";
  readonly schemaVersion: 1;
  readonly expectedStateRevision: number;
  readonly relationshipChanges: readonly GameplayRelationshipChangeV1[];
  readonly actionChanges: readonly GameplayActionChangeV1[];
  readonly newlyCommittedActionExecutionIds: readonly string[];
  readonly capacityDelta: GameplayTransitionCapacityDeltaV1;
}

export interface GameplayCommandTransitionPlanV1
  extends GameplayTransitionPlanBaseV1 {
  readonly type:
    | "control.bind"
    | "control.release"
    | "action.activate"
    | "action.cancel";
  readonly commandId: string;
}

export interface GameplayActionCompletionTransitionPlanV1
  extends GameplayTransitionPlanBaseV1 {
  readonly type: "action.complete";
  readonly commandId?: never;
  readonly completedActionExecutionIds: readonly string[];
}

export type GameplayTransitionPlanV1 =
  | GameplayCommandTransitionPlanV1
  | GameplayActionCompletionTransitionPlanV1;

export type GameplayStatePlanResultV1 =
  | Readonly<{
      status: "planned";
      transitionPlan: GameplayCommandTransitionPlanV1;
    }>
  | Readonly<{
      status: "rejected";
      diagnostic: GameplayDiagnosticV1;
    }>;

export interface GameplayWorldStateProjectionContextV1 {
  readonly id: string;
  readonly simulationTick: number;
  readonly worldPackageRef: string;
  readonly worldPackageRootHash: Sha256HashV1;
  readonly executionPlanHash: Sha256HashV1;
  readonly spatialEntityStatesById: Readonly<Record<string, SpatialEntityStateV1>>;
  readonly capabilityStatesById: Readonly<
    Record<string, GameplayCapabilityStateV1>
  >;
  readonly semanticFactsById: Readonly<Record<string, GameplaySemanticFactV1>>;
  readonly lastEventSequence: number;
}

interface GameplayInspectionProjectionContextBaseV1 {
  readonly id: string;
  readonly gameplayModeRef: string;
  readonly simulationTick: number;
  readonly activatedGameplayFeatureRefs: readonly string[];
  readonly lastEventSequence: number;
}

export type GameplayInspectionProjectionContextV1 =
  | (GameplayInspectionProjectionContextBaseV1 & Readonly<{
      phase: "constructing" | "ready" | "replacing" | "disposed";
      diagnostic?: never;
    }>)
  | (GameplayInspectionProjectionContextBaseV1 & Readonly<{
      phase: "failed";
      diagnostic: GameplayDiagnosticV1;
    }>);

export interface GameplayPlanningStateV1 {
  planControl(
    command: ControlBindGameplayCommandV1 | ControlReleaseGameplayCommandV1,
    simulationTick: number,
  ): GameplayStatePlanResultV1;
  planAction(
    command: ActionActivateGameplayCommandV1 | ActionCancelGameplayCommandV1,
    simulationTick: number,
  ): GameplayStatePlanResultV1;
}

interface PreparedGameplayTransitionV1 {
  readonly expectedStateRevision: number;
  readonly relationshipStatesById: Readonly<
    Record<string, PossessedByRelationshipStateV1>
  >;
  readonly activeActionExecutionsById: Readonly<
    Record<string, InternalGameplayActionExecutionV1>
  >;
  readonly committedActionExecutionIds: ReadonlySet<string>;
}

function reject(
  code: GameplayDiagnosticCodeV1,
  message: string,
): Extract<GameplayStatePlanResultV1, { status: "rejected" }> {
  return Object.freeze({
    status: "rejected",
    diagnostic: Object.freeze({ code, message }),
  });
}

function assertNonEmpty(value: string, name: string): void {
  if (value.length === 0) throw new RangeError(`${name} must not be empty.`);
}

function assertTick(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
}

function safeAdd(left: number, right: number): number | undefined {
  const result = left + right;
  return Number.isSafeInteger(result) ? result : undefined;
}

function deepFreeze<T>(input: T): Readonly<T> {
  if (typeof input !== "object" || input === null || Object.isFrozen(input)) {
    return input;
  }
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
    if (descriptor !== undefined && "value" in descriptor) {
      deepFreeze(descriptor.value);
    }
  }
  return Object.freeze(input);
}

function ownValue<T>(record: Readonly<Record<string, T>>, id: string): T | undefined {
  const descriptor = Reflect.getOwnPropertyDescriptor(record, id);
  return descriptor !== undefined && "value" in descriptor
    ? descriptor.value
    : undefined;
}

function sortedRecord<T extends { readonly id: string }>(
  values: readonly T[],
): Readonly<Record<string, T>> {
  return Object.fromEntries(
    [...values]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((value) => [value.id, value]),
  );
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return sha256CanonicalJson(left) === sha256CanonicalJson(right);
}

function cloneActionExecution(
  execution: InternalGameplayActionExecutionV1,
): InternalGameplayActionExecutionV1 {
  return deepFreeze({
    state: { ...execution.state },
    isMovementInputBlocked: execution.isMovementInputBlocked,
    ...(execution.scheduledEndSimulationTick === undefined
      ? {}
      : { scheduledEndSimulationTick: execution.scheduledEndSimulationTick }),
  });
}

export function derivePossessedByRelationshipIdV1(
  acceptedBindCommandId: string,
): string {
  assertNonEmpty(acceptedBindCommandId, "accepted bind command ID");
  return `possessed-by:${sha256CanonicalJson({
    type: "possessedBy",
    acceptedBindCommandId,
  })}`;
}

export class GameplayState implements GameplayPlanningStateV1 {
  private readonly runtimeSessionId: string;
  private readonly worldSessionId: string;
  private readonly participantStatesById: Readonly<
    Record<string, GameplayParticipantStateV1>
  >;
  private readonly controllerStatesById: Readonly<
    Record<string, ControllerEntityStateV1>
  >;
  private readonly entityDescriptorsById: Readonly<
    Record<string, GameplayEntityDescriptorV1>
  >;
  private readonly actionCatalog: GameplayActionCatalogV1;
  private readonly actionRequestResolver: GameplayActionRequestResolverV1 | undefined;
  private readonly capacityBudget: GameplayCapacityBudgetV1;
  private relationshipStatesById: Readonly<
    Record<string, PossessedByRelationshipStateV1>
  > = Object.freeze({});
  private activeActionExecutionsById: Readonly<
    Record<string, InternalGameplayActionExecutionV1>
  > = Object.freeze({});
  private committedActionExecutionIds: ReadonlySet<string> = new Set<string>();
  private stateRevision = 0;
  private readonly planningState: GameplayPlanningStateV1;
  private readonly preparedTransitions = new WeakMap<
    GameplayTransitionPlanV1,
    PreparedGameplayTransitionV1
  >();
  private readonly issuedTransitionPlans = new WeakSet<GameplayTransitionPlanV1>();

  constructor(options: GameplayStateOptionsV1) {
    assertNonEmpty(options.runtimeSessionId, "runtimeSessionId");
    assertNonEmpty(options.worldSessionId, "worldSessionId");
    if (options.participantStates.length > options.capacityBudget.maximumParticipantCount ||
      options.controllerStates.length >
        options.capacityBudget.maximumControllerEntityCount
    ) {
      throw new Error("GAMEPLAY_CAPACITY_EXCEEDED: Gameplay identity capacity exceeded.");
    }

    const participants = new Map<string, GameplayParticipantStateV1>();
    for (const participant of options.participantStates) {
      if (participants.has(participant.id)) {
        throw new Error(`INPUT_INVALID: Duplicate Participant '${participant.id}'.`);
      }
      participants.set(participant.id, deepFreeze({ ...participant }));
    }
    const controllers = new Map<string, ControllerEntityStateV1>();
    for (const controller of options.controllerStates) {
      if (controllers.has(controller.id)) {
        throw new Error(`INPUT_INVALID: Duplicate Controller '${controller.id}'.`);
      }
      if (!participants.has(controller.participantId)) {
        throw new Error(
          `INPUT_INVALID: Controller '${controller.id}' references unknown Participant '${controller.participantId}'.`,
        );
      }
      controllers.set(controller.id, deepFreeze({ ...controller }));
    }
    const descriptors = new Map<string, GameplayEntityDescriptorV1>();
    for (const descriptor of options.entityDescriptors) {
      if (descriptors.has(descriptor.id)) {
        throw new Error(`INPUT_INVALID: Duplicate Entity '${descriptor.id}'.`);
      }
      if (controllers.has(descriptor.id)) {
        throw new Error(
          `INPUT_INVALID: Entity descriptor '${descriptor.id}' overlaps a Controller identity.`,
        );
      }
      const capabilityRefs = [...descriptor.capabilityRefs].sort((left, right) =>
        left.localeCompare(right)
      );
      if (
        descriptor.id.length === 0 ||
        descriptor.entityDefinitionRef.length === 0 ||
        capabilityRefs.some((ref) => ref.length === 0) ||
        new Set(capabilityRefs).size !== capabilityRefs.length
      ) throw new Error(`INPUT_INVALID: Invalid Entity descriptor '${descriptor.id}'.`);
      descriptors.set(descriptor.id, deepFreeze({ ...descriptor, capabilityRefs }));
    }

    this.runtimeSessionId = options.runtimeSessionId;
    this.worldSessionId = options.worldSessionId;
    this.participantStatesById = sortedRecord([...participants.values()]);
    this.controllerStatesById = sortedRecord([...controllers.values()]);
    this.entityDescriptorsById = sortedRecord([...descriptors.values()]);
    this.actionCatalog = options.actionCatalog;
    this.actionRequestResolver = options.actionRequestResolver;
    this.capacityBudget = options.capacityBudget;
    this.planningState = Object.freeze({
      planControl: this.planControl.bind(this),
      planAction: this.planAction.bind(this),
    });
  }

  get revision(): number {
    return this.stateRevision;
  }

  planningPort(): GameplayPlanningStateV1 {
    return this.planningState;
  }

  possessionForController(
    controllerEntityId: string,
  ): PossessedByRelationshipStateV1 | undefined {
    return Object.values(this.relationshipStatesById).find(
      (relationship) => relationship.controllerEntityId === controllerEntityId,
    );
  }

  possessionForControlledEntity(
    controlledEntityId: string,
  ): PossessedByRelationshipStateV1 | undefined {
    return Object.values(this.relationshipStatesById).find(
      (relationship) => relationship.controlledEntityId === controlledEntityId,
    );
  }

  activeActionState(actionExecutionId: string): GameplayActionStateV1 | undefined {
    return ownValue(this.activeActionExecutionsById, actionExecutionId)?.state;
  }

  retiredActionExecutionIds(): readonly string[] {
    return Object.freeze(
      [...this.committedActionExecutionIds]
        .filter((id) => ownValue(this.activeActionExecutionsById, id) === undefined)
        .sort((left, right) => left.localeCompare(right)),
    );
  }

  isMovementInputBlocked(controllerEntityId: string): boolean {
    const possession = this.possessionForController(controllerEntityId);
    return possession !== undefined && Object.values(
      this.activeActionExecutionsById,
    ).some((execution) =>
      execution.state.actorEntityId === possession.controlledEntityId &&
      execution.isMovementInputBlocked
    );
  }

  planControl(
    command: ControlBindGameplayCommandV1 | ControlReleaseGameplayCommandV1,
    simulationTick: number,
  ): GameplayStatePlanResultV1 {
    assertTick(simulationTick, "simulationTick");
    if (ownValue(this.controllerStatesById, command.controllerEntityId) === undefined) {
      return reject(
        "CONTROLLER_NOT_FOUND",
        `Controller '${command.controllerEntityId}' does not exist.`,
      );
    }
    const current = this.possessionForController(command.controllerEntityId);
    const expected = command.expectedPossession;
    if (
      (expected.mode === "unbound" && current !== undefined) ||
      (expected.mode === "possessed" &&
        current?.controlledEntityId !== expected.controlledEntityId)
    ) {
      return reject(
        "CONTROL_POSSESSION_STALE",
        `Controller '${command.controllerEntityId}' possession changed.`,
      );
    }

    if (command.type === "control.release") {
      if (current === undefined) {
        return reject(
          "CONTROL_POSSESSION_STALE",
          `Controller '${command.controllerEntityId}' is unbound.`,
        );
      }
      return this.plannedCommand(command.type, command.id, [{
        operation: "remove",
        before: current,
      }], [], [], {
        relationshipStateCountDelta: -1,
        activeActionStateCountDelta: 0,
        retiredActionExecutionIdCountDelta: 0,
        requiredEventCount: 1,
      });
    }

    if (ownValue(this.entityDescriptorsById, command.controlledEntityId) === undefined) {
      return reject(
        "CONTROLLED_ENTITY_NOT_FOUND",
        `Controlled Entity '${command.controlledEntityId}' does not exist.`,
      );
    }
    if (current?.controlledEntityId === command.controlledEntityId) {
      return reject(
        "CONTROL_ALREADY_OWNED",
        `Controller '${command.controllerEntityId}' already possesses '${command.controlledEntityId}'.`,
      );
    }
    const existingOwner = this.possessionForControlledEntity(command.controlledEntityId);
    if (existingOwner !== undefined) {
      return reject(
        "CONTROL_ALREADY_OWNED",
        `Controlled Entity '${command.controlledEntityId}' is already possessed.`,
      );
    }
    const next: PossessedByRelationshipStateV1 = deepFreeze({
      id: derivePossessedByRelationshipIdV1(command.id),
      type: "possessedBy",
      schemaVersion: 1,
      controlledEntityId: command.controlledEntityId,
      controllerEntityId: command.controllerEntityId,
      establishedSimulationTick: simulationTick,
    });
    const relationshipChanges: GameplayRelationshipChangeV1[] = current === undefined
      ? [{ operation: "add", after: next }]
      : [
          { operation: "remove", before: current },
          { operation: "add", after: next },
        ];
    const finalCount = Object.keys(this.relationshipStatesById).length +
      (current === undefined ? 1 : 0);
    if (finalCount > this.capacityBudget.maximumPossessedByRelationshipCount) {
      return reject(
        "GAMEPLAY_CAPACITY_EXCEEDED",
        "Possession Relationship capacity is exhausted.",
      );
    }
    return this.plannedCommand(command.type, command.id, relationshipChanges, [], [], {
      relationshipStateCountDelta: current === undefined ? 1 : 0,
      activeActionStateCountDelta: 0,
      retiredActionExecutionIdCountDelta: 0,
      requiredEventCount: current === undefined ? 1 : 2,
    });
  }

  planAction(
    command: ActionActivateGameplayCommandV1 | ActionCancelGameplayCommandV1,
    simulationTick: number,
  ): GameplayStatePlanResultV1 {
    assertTick(simulationTick, "simulationTick");
    if (ownValue(this.controllerStatesById, command.controllerEntityId) === undefined) {
      return reject(
        "CONTROLLER_NOT_FOUND",
        `Controller '${command.controllerEntityId}' does not exist.`,
      );
    }
    const possession = this.possessionForController(command.controllerEntityId);
    if (possession?.controlledEntityId !== command.expectedPossession.controlledEntityId) {
      return reject(
        "CONTROL_POSSESSION_STALE",
        `Controller '${command.controllerEntityId}' possession changed.`,
      );
    }
    if (command.actorEntityId !== command.expectedPossession.controlledEntityId) {
      return reject(
        "ACTION_NOT_AVAILABLE_FOR_ACTOR",
        "Action actor must be the expected possession target.",
      );
    }

    if (command.type === "action.cancel") {
      const execution = ownValue(
        this.activeActionExecutionsById,
        command.actionExecutionId,
      );
      if (execution === undefined) {
        return reject(
          "ACTION_EXECUTION_NOT_ACTIVE",
          `Action execution '${command.actionExecutionId}' is not active.`,
        );
      }
      if (execution.state.actorEntityId !== command.actorEntityId) {
        return reject(
          "ACTION_EXECUTION_OWNERSHIP_MISMATCH",
          `Action execution '${command.actionExecutionId}' has another owner.`,
        );
      }
      return this.plannedCommand(command.type, command.id, [], [{
        operation: "remove",
        before: execution,
      }], [], {
        relationshipStateCountDelta: 0,
        activeActionStateCountDelta: -1,
        retiredActionExecutionIdCountDelta: 0,
        requiredEventCount: 1,
      });
    }

    const definition = this.actionCatalog.get(command.semanticActionRef);
    if (definition === undefined) {
      return reject(
        "ACTION_DEFINITION_NOT_FOUND",
        `Semantic Action '${command.semanticActionRef}' is not registered.`,
      );
    }
    if (this.committedActionExecutionIds.has(command.actionExecutionId) ||
      ownValue(this.activeActionExecutionsById, command.actionExecutionId) !== undefined
    ) {
      return reject(
        "ACTION_EXECUTION_ID_CONFLICT",
        `Action execution ID '${command.actionExecutionId}' was already committed.`,
      );
    }
    if (
      Object.values(this.activeActionExecutionsById).some(
        (execution) => execution.state.actorEntityId === command.actorEntityId,
      )
    ) {
      return reject(
        "ACTION_ALREADY_ACTIVE",
        `Actor '${command.actorEntityId}' already has an exclusive Action.`,
      );
    }
    const descriptor = ownValue(this.entityDescriptorsById, command.actorEntityId);
    if (
      descriptor === undefined ||
      !definition.allowedActorEntityDefinitionRefs.includes(
        descriptor.entityDefinitionRef,
      ) ||
      !definition.requiredActorCapabilityRefs.every((ref) =>
        descriptor.capabilityRefs.includes(ref)
      )
    ) {
      return reject(
        "ACTION_NOT_AVAILABLE_FOR_ACTOR",
        `Semantic Action '${command.semanticActionRef}' is unavailable for '${command.actorEntityId}'.`,
      );
    }
    const requestDiagnostic = this.validateActionRequest(command, definition.request);
    if (requestDiagnostic !== undefined) {
      return { status: "rejected", diagnostic: requestDiagnostic };
    }
    if (
      Object.keys(this.activeActionExecutionsById).length + 1 >
        this.capacityBudget.maximumActiveActionStateCount ||
      this.committedActionExecutionIds.size + 1 >
        this.capacityBudget.maximumRetiredActionExecutionIdCount
    ) {
      return reject(
        "GAMEPLAY_CAPACITY_EXCEEDED",
        "Action state or permanent execution ID capacity is exhausted.",
      );
    }
    const scheduledEndSimulationTick = definition.completion.mode === "fixed-duration"
      ? safeAdd(simulationTick, definition.completion.durationTicks)
      : undefined;
    if (
      definition.completion.mode === "fixed-duration" &&
      scheduledEndSimulationTick === undefined
    ) {
      return reject(
        "ACTION_CATALOG_INVALID",
        "Action completion Tick exceeds the safe integer domain.",
      );
    }
    const state: GameplayActionStateV1 = deepFreeze({
      id: command.actionExecutionId,
      kind: "action-state",
      semanticActionRef: definition.resourceRef,
      semanticActionHash: definition.contentHash,
      actorEntityId: command.actorEntityId,
      mode: "active",
      startedSimulationTick: simulationTick,
      lastTransitionSimulationTick: simulationTick,
      ...(command.actionRequestRef === undefined
        ? {}
        : {
            actionRequestRef: command.actionRequestRef,
            actionRequestHash: command.actionRequestHash,
          }),
    });
    const execution = cloneActionExecution({
      state,
      isMovementInputBlocked: definition.isMovementInputBlocked,
      ...(scheduledEndSimulationTick === undefined
        ? {}
        : { scheduledEndSimulationTick }),
    });
    return this.plannedCommand(command.type, command.id, [], [{
      operation: "add",
      after: execution,
    }], [command.actionExecutionId], {
      relationshipStateCountDelta: 0,
      activeActionStateCountDelta: 1,
      retiredActionExecutionIdCountDelta: 1,
      requiredEventCount: 1,
    });
  }

  planDueActionCompletions(
    simulationTick: number,
  ): GameplayActionCompletionTransitionPlanV1 | undefined {
    assertTick(simulationTick, "simulationTick");
    const due = Object.values(this.activeActionExecutionsById)
      .filter((execution) =>
        execution.scheduledEndSimulationTick !== undefined &&
        execution.scheduledEndSimulationTick <= simulationTick
      )
      .sort((left, right) =>
        (left.scheduledEndSimulationTick ?? Number.MAX_SAFE_INTEGER) -
          (right.scheduledEndSimulationTick ?? Number.MAX_SAFE_INTEGER) ||
        left.state.id.localeCompare(right.state.id)
      );
    if (due.length === 0) return undefined;
    const transitionPlan: GameplayActionCompletionTransitionPlanV1 = deepFreeze({
      kind: "gameplay-transition-plan",
      schemaVersion: 1,
      type: "action.complete",
      expectedStateRevision: this.stateRevision,
      relationshipChanges: [],
      actionChanges: due.map((before) => ({ operation: "remove", before })),
      newlyCommittedActionExecutionIds: [],
      completedActionExecutionIds: due.map((execution) => execution.state.id),
      capacityDelta: {
        relationshipStateCountDelta: 0,
        activeActionStateCountDelta: -due.length,
        retiredActionExecutionIdCountDelta: 0,
        requiredEventCount: due.length,
      },
    });
    this.issuedTransitionPlans.add(transitionPlan);
    return transitionPlan;
  }

  commit(transitionPlan: GameplayTransitionPlanV1): void {
    this.assertIssuedTransitionPlan(transitionPlan);
    const prepared = this.preparedTransitions.get(transitionPlan) ??
      this.prepareTransition(transitionPlan);
    if (prepared.expectedStateRevision !== this.stateRevision) {
      throw new Error(
        `GAMEPLAY_STATE_STALE: expected revision ${prepared.expectedStateRevision}, current ${this.stateRevision}.`,
      );
    }
    this.relationshipStatesById = prepared.relationshipStatesById;
    this.activeActionExecutionsById = prepared.activeActionExecutionsById;
    this.committedActionExecutionIds = prepared.committedActionExecutionIds;
    this.stateRevision += 1;
    this.issuedTransitionPlans.delete(transitionPlan);
  }

  projectWorldState(
    context: GameplayWorldStateProjectionContextV1,
  ): WorldStateSnapshotV1 {
    return this.buildProjectedWorldState(
      context,
      this.relationshipStatesById,
      this.activeActionExecutionsById,
    );
  }

  projectGameplayInspection(
    context: GameplayInspectionProjectionContextV1,
  ): GameplayInspectionSnapshotV1 {
    const activatedGameplayFeatureRefs = [...context.activatedGameplayFeatureRefs]
      .sort((left, right) => left.localeCompare(right));
    if (
      activatedGameplayFeatureRefs.some((ref) => ref.length === 0) ||
      new Set(activatedGameplayFeatureRefs).size !==
        activatedGameplayFeatureRefs.length
    ) throw new Error("INPUT_INVALID: Activated Gameplay Feature Refs are invalid.");
    const base = {
      kind: "worldkit-gameplay-inspection-snapshot" as const,
      schemaVersion: 1 as const,
      projection: "inspection" as const,
      id: context.id,
      runtimeSessionId: this.runtimeSessionId,
      worldSessionId: this.worldSessionId,
      gameplayModeRef: context.gameplayModeRef,
      phase: context.phase,
      simulationTick: context.simulationTick,
      participantStatesById: this.participantStatesById,
      controllerStatesById: Object.fromEntries(
        Object.values(this.controllerStatesById).map((controller) => [
          controller.id,
          { id: controller.id, participantId: controller.participantId },
        ]),
      ),
      possessedByRelationshipsById: this.relationshipStatesById,
      activeActionStatesById: Object.fromEntries(
        Object.values(this.activeActionExecutionsById).map((execution) => [
          execution.state.id,
          execution.state,
        ]),
      ),
      activatedGameplayFeatureRefs,
      lastEventSequence: context.lastEventSequence,
    };
    return parseGameplayInspectionSnapshotV1(
      context.phase === "failed"
        ? { ...base, diagnostic: context.diagnostic }
        : base,
    );
  }

  projectWorldStateAfter(
    transitionPlan: GameplayTransitionPlanV1,
    context: GameplayWorldStateProjectionContextV1,
  ): WorldStateSnapshotV1 {
    this.assertIssuedTransitionPlan(transitionPlan);
    const prepared = this.prepareTransition(transitionPlan);
    const snapshot = this.buildProjectedWorldState(
      context,
      prepared.relationshipStatesById,
      prepared.activeActionExecutionsById,
    );
    this.preparedTransitions.set(transitionPlan, prepared);
    return snapshot;
  }

  private prepareTransition(
    transitionPlan: GameplayTransitionPlanV1,
  ): PreparedGameplayTransitionV1 {
    if (transitionPlan.expectedStateRevision !== this.stateRevision) {
      throw new Error(
        `GAMEPLAY_STATE_STALE: expected revision ${transitionPlan.expectedStateRevision}, current ${this.stateRevision}.`,
      );
    }
    if (this.stateRevision === Number.MAX_SAFE_INTEGER) {
      throw new Error("GAMEPLAY_CAPACITY_EXCEEDED: State revision is exhausted.");
    }
    const relationships = Object.assign(
      Object.create(null) as Record<string, PossessedByRelationshipStateV1>,
      this.relationshipStatesById,
    );
    const actions = Object.assign(
      Object.create(null) as Record<string, InternalGameplayActionExecutionV1>,
      this.activeActionExecutionsById,
    );
    const committedIds = new Set(this.committedActionExecutionIds);
    const relationshipStateCountBefore = Object.keys(relationships).length;
    const activeActionStateCountBefore = Object.keys(actions).length;
    const retiredActionExecutionIdCountBefore = committedIds.size;

    for (const change of transitionPlan.relationshipChanges) {
      if (change.operation === "remove") {
        const current = ownValue(relationships, change.before.id);
        if (current === undefined || !sameCanonical(current, change.before)) {
          throw new Error(
            `GAMEPLAY_STATE_STALE: Relationship '${change.before.id}' changed before commit.`,
          );
        }
        delete relationships[change.before.id];
      } else {
        if (ownValue(relationships, change.after.id) !== undefined) {
          throw new Error(
            `GAMEPLAY_STATE_STALE: Relationship '${change.after.id}' already exists.`,
          );
        }
        relationships[change.after.id] = change.after;
      }
    }
    for (const change of transitionPlan.actionChanges) {
      if (change.operation === "remove") {
        const current = ownValue(actions, change.before.state.id);
        if (current === undefined || !sameCanonical(current, change.before)) {
          throw new Error(
            `GAMEPLAY_STATE_STALE: Action '${change.before.state.id}' changed before commit.`,
          );
        }
        delete actions[change.before.state.id];
      } else {
        if (ownValue(actions, change.after.state.id) !== undefined) {
          throw new Error(
            `GAMEPLAY_STATE_STALE: Action '${change.after.state.id}' already exists.`,
          );
        }
        actions[change.after.state.id] = change.after;
      }
    }
    for (const id of transitionPlan.newlyCommittedActionExecutionIds) {
      if (committedIds.has(id)) {
        throw new Error(
          `ACTION_EXECUTION_ID_CONFLICT: Action execution '${id}' was already committed.`,
        );
      }
      committedIds.add(id);
    }
    const actualCapacityDelta: GameplayTransitionCapacityDeltaV1 = {
      relationshipStateCountDelta:
        Object.keys(relationships).length - relationshipStateCountBefore,
      activeActionStateCountDelta:
        Object.keys(actions).length - activeActionStateCountBefore,
      retiredActionExecutionIdCountDelta:
        committedIds.size - retiredActionExecutionIdCountBefore,
      requiredEventCount:
        transitionPlan.relationshipChanges.length + transitionPlan.actionChanges.length,
    };
    if (
      !Object.is(
        transitionPlan.capacityDelta.relationshipStateCountDelta,
        actualCapacityDelta.relationshipStateCountDelta,
      ) ||
      !Object.is(
        transitionPlan.capacityDelta.activeActionStateCountDelta,
        actualCapacityDelta.activeActionStateCountDelta,
      ) ||
      !Object.is(
        transitionPlan.capacityDelta.retiredActionExecutionIdCountDelta,
        actualCapacityDelta.retiredActionExecutionIdCountDelta,
      ) ||
      !Object.is(
        transitionPlan.capacityDelta.requiredEventCount,
        actualCapacityDelta.requiredEventCount,
      )
    ) {
      throw new Error(
        "GAMEPLAY_TRANSITION_INVARIANT: Capacity and Event reservations do not match the planned state changes.",
      );
    }
    this.assertCardinalityAndCapacity(relationships, actions, committedIds);
    return {
      expectedStateRevision: this.stateRevision,
      relationshipStatesById: deepFreeze(
        sortedRecord(Object.values(relationships)),
      ),
      activeActionExecutionsById: deepFreeze(Object.fromEntries(
        Object.values(actions)
          .sort((left, right) => left.state.id.localeCompare(right.state.id))
          .map((value) => [value.state.id, value]),
      )),
      committedActionExecutionIds: committedIds,
    };
  }

  private buildProjectedWorldState(
    context: GameplayWorldStateProjectionContextV1,
    relationshipStatesById: Readonly<
      Record<string, PossessedByRelationshipStateV1>
    >,
    activeActionExecutionsById: Readonly<
      Record<string, InternalGameplayActionExecutionV1>
    >,
  ): WorldStateSnapshotV1 {
    for (const [id, state] of Object.entries(context.spatialEntityStatesById)) {
      if (ownValue(this.controllerStatesById, id) !== undefined) {
        throw new Error(
          `INPUT_INVALID: Spatial Entity State '${id}' overlaps a Gameplay-owned Controller.`,
        );
      }
      if (state.kind !== "spatial-entity-state" || state.id !== id) {
        throw new Error(
          `INPUT_INVALID: Adapter-owned Spatial Entity State '${id}' is invalid.`,
        );
      }
    }
    const entityStatesById = Object.fromEntries([
      ...Object.entries(context.spatialEntityStatesById),
      ...Object.entries(this.controllerStatesById),
    ].sort(([left], [right]) => left.localeCompare(right)));
    return buildWorldStateSnapshotV1({
      kind: "worldkit-world-state-snapshot",
      schemaVersion: 1,
      id: context.id,
      runtimeSessionId: this.runtimeSessionId,
      worldSessionId: this.worldSessionId,
      simulationTick: context.simulationTick,
      worldPackageRef: context.worldPackageRef,
      worldPackageRootHash: context.worldPackageRootHash,
      executionPlanHash: context.executionPlanHash,
      entityStatesById,
      capabilityStatesById: context.capabilityStatesById,
      relationshipStatesById,
      semanticFactsById: context.semanticFactsById,
      activeActionStatesById: Object.fromEntries(
        Object.values(activeActionExecutionsById).map((execution) => [
          execution.state.id,
          execution.state,
        ]),
      ),
      lastEventSequence: context.lastEventSequence,
    });
  }

  private plannedCommand(
    type: GameplayCommandTransitionPlanV1["type"],
    commandId: string,
    relationshipChanges: readonly GameplayRelationshipChangeV1[],
    actionChanges: readonly GameplayActionChangeV1[],
    newlyCommittedActionExecutionIds: readonly string[],
    capacityDelta: GameplayTransitionCapacityDeltaV1,
  ): Extract<GameplayStatePlanResultV1, { status: "planned" }> {
    const result: Extract<GameplayStatePlanResultV1, { status: "planned" }> =
      deepFreeze({
        status: "planned",
        transitionPlan: {
          kind: "gameplay-transition-plan",
          schemaVersion: 1,
          type,
          commandId,
          expectedStateRevision: this.stateRevision,
          relationshipChanges,
          actionChanges,
          newlyCommittedActionExecutionIds,
          capacityDelta,
        },
      });
    this.issuedTransitionPlans.add(result.transitionPlan);
    return result;
  }

  private assertIssuedTransitionPlan(
    transitionPlan: GameplayTransitionPlanV1,
  ): void {
    if (
      !this.issuedTransitionPlans.has(transitionPlan) ||
      !Object.isFrozen(transitionPlan)
    ) {
      throw new Error(
        "GAMEPLAY_TRANSITION_NOT_ISSUED: Transition plan was not issued by this GameplayState.",
      );
    }
  }

  private validateActionRequest(
    command: ActionActivateGameplayCommandV1,
    request: import("./core-semantic-action-feature").GameplayActionDefinitionV1["request"],
  ): GameplayDiagnosticV1 | undefined {
    if (request.mode === "none") {
      return command.actionRequestRef === undefined
        ? undefined
        : Object.freeze({
            code: "ACTION_REQUEST_INVALID",
            message: "This Semantic Action does not accept an Action Request.",
          });
    }
    if (
      command.actionRequestRef === undefined ||
      command.actionRequestHash === undefined ||
      this.actionRequestResolver === undefined
    ) {
      return Object.freeze({
        code: "ACTION_REQUEST_INVALID",
        message: "This Semantic Action requires a locked Action Request.",
      });
    }
    const resolution = this.actionRequestResolver(
      command.actionRequestRef,
      command.actionRequestHash,
    );
    if (
      resolution?.actionRequestSchemaRef !== request.actionRequestSchemaRef ||
      resolution.actionRequestSchemaHash !== request.actionRequestSchemaHash
    ) {
      return Object.freeze({
        code: "ACTION_REQUEST_INVALID",
        message: "Action Request does not match the locked request Schema.",
      });
    }
    return undefined;
  }

  private assertCardinalityAndCapacity(
    relationships: Readonly<Record<string, PossessedByRelationshipStateV1>>,
    actions: Readonly<Record<string, InternalGameplayActionExecutionV1>>,
    committedIds: ReadonlySet<string>,
  ): void {
    const controllers = new Set<string>();
    const controlledEntities = new Set<string>();
    for (const relationship of Object.values(relationships)) {
      if (
        controllers.has(relationship.controllerEntityId) ||
        controlledEntities.has(relationship.controlledEntityId)
      ) throw new Error("GAMEPLAY_STATE_STALE: Possession cardinality changed.");
      controllers.add(relationship.controllerEntityId);
      controlledEntities.add(relationship.controlledEntityId);
    }
    const actors = new Set<string>();
    for (const execution of Object.values(actions)) {
      if (actors.has(execution.state.actorEntityId)) {
        throw new Error("GAMEPLAY_STATE_STALE: Exclusive Action cardinality changed.");
      }
      actors.add(execution.state.actorEntityId);
    }
    if (
      Object.keys(relationships).length >
        this.capacityBudget.maximumPossessedByRelationshipCount ||
      Object.keys(actions).length > this.capacityBudget.maximumActiveActionStateCount ||
      committedIds.size > this.capacityBudget.maximumRetiredActionExecutionIdCount
    ) throw new Error("GAMEPLAY_CAPACITY_EXCEEDED: Transition exceeds capacity.");
  }
}
