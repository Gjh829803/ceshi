import {
  buildWorldStateSnapshotV1,
  deriveGameplayCommandHashV1,
  parseGameplayEntityDescriptorV1,
  parseGameplayInspectionSnapshotV1,
  type ActionActivateGameplayCommandV1,
  type ActionCancelGameplayCommandV1,
  type ControlBindGameplayCommandV1,
  type ControlReleaseGameplayCommandV1,
  type GameplayActionStateV1,
  type GameplayActionDefinitionV1,
  type GameplayCapacityBudgetV1,
  type GameplayCapabilityStateV1,
  type GameplayCommandV1,
  type ControllerEntityStateV1,
  type GameplayDiagnosticCodeV1,
  type GameplayDiagnosticV1,
  type GameplayEntityDescriptorV1,
  type GameplayInspectionSnapshotV1,
  type GameplayParticipantStateV1,
  type GameplaySemanticFactV1,
  type PossessedByRelationshipStateV1,
  type Sha256HashV1,
  type SpatialEntityStateV1,
  type WorldStateSnapshotV1,
} from "@whitebox-world/gameplay-contracts";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isNil } from "lodash-es";

import type {
  GameplayActionCatalogV1,
  GameplayActionRequestResolverV1,
  InternalGameplayActionExecutionV1,
} from "./core-semantic-action-feature";

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
  readonly usedActionExecutionIdCountDelta: number;
  readonly immediateEventCount: number;
  readonly terminalEventReservationCountDelta: number;
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

export interface GameplayCommandPlanAuthorityV1 {
  authorizeCommandPlan(input: Readonly<{
    transitionPlan: GameplayCommandTransitionPlanV1;
    command: GameplayCommandV1;
    simulationTick: number;
  }>): void;
}

interface PreparedGameplayTransitionV1 {
  readonly expectedStateRevision: number;
  readonly relationshipStatesById: Readonly<
    Record<string, PossessedByRelationshipStateV1>
  >;
  readonly activeActionExecutionsById: Readonly<
    Record<string, InternalGameplayActionExecutionV1>
  >;
  readonly usedActionExecutionIds: ReadonlySet<string>;
  readonly terminalEventReservationCount: number;
}

type GameplayTransitionProvenanceV1 =
  | Readonly<{
      kind: "command";
      commandHash: Sha256HashV1;
      commandId: string;
      commandType: GameplayCommandTransitionPlanV1["type"];
      simulationTick: number;
    }>
  | Readonly<{
      kind: "system";
      transitionType: "action.complete";
      simulationTick: number;
    }>;

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
  if (typeof input !== "object" || isNil(input) || Object.isFrozen(input)) {
    return input;
  }
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
    if (!isNil(descriptor) && "value" in descriptor) {
      deepFreeze(descriptor.value);
    }
  }
  return Object.freeze(input);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function ownValue<T>(record: Readonly<Record<string, T>>, id: string): T | undefined {
  const descriptor = Reflect.getOwnPropertyDescriptor(record, id);
  return !isNil(descriptor) && "value" in descriptor
    ? descriptor.value
    : undefined;
}

function sortedRecord<T extends { readonly id: string }>(
  values: readonly T[],
): Readonly<Record<string, T>> {
  return Object.fromEntries(
    [...values]
      .sort((left, right) => compareCodeUnits(left.id, right.id))
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
    ...(isNil(execution.scheduledEndSimulationTick)
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
  private usedActionExecutionIdSet: ReadonlySet<string> = new Set<string>();
  private terminalEventReservationCount = 0;
  private stateRevision = 0;
  private readonly planningState: GameplayPlanningStateV1;
  private readonly commandPlanAuthority: GameplayCommandPlanAuthorityV1;
  private readonly preparedTransitions = new WeakMap<
    GameplayTransitionPlanV1,
    PreparedGameplayTransitionV1
  >();
  private readonly transitionProvenance = new WeakMap<
    GameplayTransitionPlanV1,
    GameplayTransitionProvenanceV1
  >();
  private readonly authorizedTransitionPlans = new WeakSet<
    GameplayTransitionPlanV1
  >();

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
    for (const descriptorInput of options.entityDescriptors) {
      let descriptor: GameplayEntityDescriptorV1;
      try {
        descriptor = parseGameplayEntityDescriptorV1(descriptorInput);
      } catch {
        throw new Error("INPUT_INVALID: Entity descriptor is not canonical.");
      }
      if (descriptors.has(descriptor.id)) {
        throw new Error(`INPUT_INVALID: Duplicate Entity '${descriptor.id}'.`);
      }
      if (controllers.has(descriptor.id)) {
        throw new Error(
          `INPUT_INVALID: Entity descriptor '${descriptor.id}' overlaps a Controller identity.`,
        );
      }
      descriptors.set(descriptor.id, descriptor);
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
    this.commandPlanAuthority = Object.freeze({
      authorizeCommandPlan: this.authorizeCommandPlan.bind(this),
    });
  }

  get revision(): number {
    return this.stateRevision;
  }

  planningPort(): GameplayPlanningStateV1 {
    return this.planningState;
  }

  commandPlanAuthorityPort(): GameplayCommandPlanAuthorityV1 {
    return this.commandPlanAuthority;
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

  usedActionExecutionIds(): readonly string[] {
    return Object.freeze(
      [...this.usedActionExecutionIdSet]
        .sort(compareCodeUnits),
    );
  }

  isMovementInputBlocked(controllerEntityId: string): boolean {
    const possession = this.possessionForController(controllerEntityId);
    return !isNil(possession) && Object.values(
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
    if (isNil(ownValue(this.controllerStatesById, command.controllerEntityId))) {
      return reject(
        "CONTROLLER_NOT_FOUND",
        `Controller '${command.controllerEntityId}' does not exist.`,
      );
    }
    const current = this.possessionForController(command.controllerEntityId);
    const expected = command.expectedPossession;
    if (
      (expected.mode === "unbound" && !isNil(current)) ||
      (expected.mode === "possessed" &&
        current?.controlledEntityId !== expected.controlledEntityId)
    ) {
      return reject(
        "CONTROL_POSSESSION_STALE",
        `Controller '${command.controllerEntityId}' possession changed.`,
      );
    }

    if (command.type === "control.release") {
      if (isNil(current)) {
        return reject(
          "CONTROL_POSSESSION_STALE",
          `Controller '${command.controllerEntityId}' is unbound.`,
        );
      }
      return this.plannedCommand(command, simulationTick, [{
        operation: "remove",
        before: current,
      }], [], [], {
        relationshipStateCountDelta: -1,
        activeActionStateCountDelta: 0,
        usedActionExecutionIdCountDelta: 0,
        immediateEventCount: 1,
        terminalEventReservationCountDelta: 0,
      });
    }

    if (isNil(ownValue(this.entityDescriptorsById, command.controlledEntityId))) {
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
    if (!isNil(existingOwner)) {
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
    const relationshipChanges: GameplayRelationshipChangeV1[] = isNil(current)
      ? [{ operation: "add", after: next }]
      : [
          { operation: "remove", before: current },
          { operation: "add", after: next },
        ];
    const finalCount = Object.keys(this.relationshipStatesById).length +
      (isNil(current) ? 1 : 0);
    if (finalCount > this.capacityBudget.maximumPossessedByRelationshipCount) {
      return reject(
        "GAMEPLAY_CAPACITY_EXCEEDED",
        "Possession Relationship capacity is exhausted.",
      );
    }
    return this.plannedCommand(command, simulationTick, relationshipChanges, [], [], {
      relationshipStateCountDelta: isNil(current) ? 1 : 0,
      activeActionStateCountDelta: 0,
      usedActionExecutionIdCountDelta: 0,
      immediateEventCount: isNil(current) ? 1 : 2,
      terminalEventReservationCountDelta: 0,
    });
  }

  planAction(
    command: ActionActivateGameplayCommandV1 | ActionCancelGameplayCommandV1,
    simulationTick: number,
  ): GameplayStatePlanResultV1 {
    assertTick(simulationTick, "simulationTick");
    if (isNil(ownValue(this.controllerStatesById, command.controllerEntityId))) {
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
      if (isNil(execution)) {
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
      return this.plannedCommand(command, simulationTick, [], [{
        operation: "remove",
        before: execution,
      }], [], {
        relationshipStateCountDelta: 0,
        activeActionStateCountDelta: -1,
        usedActionExecutionIdCountDelta: 0,
        immediateEventCount: 1,
        terminalEventReservationCountDelta: -1,
      });
    }

    const definition = this.actionCatalog.get(command.semanticActionRef);
    if (isNil(definition)) {
      return reject(
        "ACTION_DEFINITION_NOT_FOUND",
        `Semantic Action '${command.semanticActionRef}' is not registered.`,
      );
    }
    if (this.usedActionExecutionIdSet.has(command.actionExecutionId) ||
      !isNil(ownValue(this.activeActionExecutionsById, command.actionExecutionId))
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
      isNil(descriptor) ||
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
    if (!isNil(requestDiagnostic)) {
      return { status: "rejected", diagnostic: requestDiagnostic };
    }
    if (
      Object.keys(this.activeActionExecutionsById).length + 1 >
        this.capacityBudget.maximumActiveActionStateCount ||
      this.usedActionExecutionIdSet.size + 1 >
        this.capacityBudget.maximumUsedActionExecutionIdCount ||
      this.terminalEventReservationCount + 1 >
        this.capacityBudget.maximumRetainedEventCount
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
      isNil(scheduledEndSimulationTick)
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
      ...(isNil(command.actionRequestRef)
        ? {}
        : {
            actionRequestRef: command.actionRequestRef,
            actionRequestHash: command.actionRequestHash,
          }),
    });
    const execution = cloneActionExecution({
      state,
      isMovementInputBlocked: definition.isMovementInputBlocked,
      ...(isNil(scheduledEndSimulationTick)
        ? {}
        : { scheduledEndSimulationTick }),
    });
    return this.plannedCommand(command, simulationTick, [], [{
      operation: "add",
      after: execution,
    }], [command.actionExecutionId], {
      relationshipStateCountDelta: 0,
      activeActionStateCountDelta: 1,
      usedActionExecutionIdCountDelta: 1,
      immediateEventCount: 1,
      terminalEventReservationCountDelta: 1,
    });
  }

  planDueActionCompletions(
    simulationTick: number,
  ): GameplayActionCompletionTransitionPlanV1 | undefined {
    assertTick(simulationTick, "simulationTick");
    const due = Object.values(this.activeActionExecutionsById)
      .filter((execution) =>
        !isNil(execution.scheduledEndSimulationTick) &&
        execution.scheduledEndSimulationTick <= simulationTick
      )
      .sort((left, right) =>
        (left.scheduledEndSimulationTick ?? Number.MAX_SAFE_INTEGER) -
          (right.scheduledEndSimulationTick ?? Number.MAX_SAFE_INTEGER) ||
        compareCodeUnits(left.state.id, right.state.id)
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
        usedActionExecutionIdCountDelta: 0,
        immediateEventCount: due.length,
        terminalEventReservationCountDelta: -due.length,
      },
    });
    const provenance: GameplayTransitionProvenanceV1 = deepFreeze({
      kind: "system" as const,
      transitionType: "action.complete" as const,
      simulationTick,
    });
    this.transitionProvenance.set(transitionPlan, provenance);
    this.authorizedTransitionPlans.add(transitionPlan);
    return transitionPlan;
  }

  commit(transitionPlan: GameplayTransitionPlanV1): void {
    this.assertAuthorizedTransitionPlan(transitionPlan);
    const prepared = this.preparedTransitions.get(transitionPlan);
    if (isNil(prepared)) {
      throw new Error(
        "GAMEPLAY_TRANSITION_NOT_STAGED: Transition must be projected before commit.",
      );
    }
    if (prepared.expectedStateRevision !== this.stateRevision) {
      throw new Error(
        `GAMEPLAY_STATE_STALE: expected revision ${prepared.expectedStateRevision}, current ${this.stateRevision}.`,
      );
    }
    this.relationshipStatesById = prepared.relationshipStatesById;
    this.activeActionExecutionsById = prepared.activeActionExecutionsById;
    this.usedActionExecutionIdSet = prepared.usedActionExecutionIds;
    this.terminalEventReservationCount = prepared.terminalEventReservationCount;
    this.stateRevision += 1;
    this.preparedTransitions.delete(transitionPlan);
    this.authorizedTransitionPlans.delete(transitionPlan);
    this.transitionProvenance.delete(transitionPlan);
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
      .sort(compareCodeUnits);
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
    const provenance = this.assertAuthorizedTransitionPlan(transitionPlan);
    if (provenance.simulationTick !== context.simulationTick) {
      throw new Error(
        "GAMEPLAY_TRANSITION_TICK_MISMATCH: Projection Tick does not match transition provenance.",
      );
    }
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
    const usedActionExecutionIds = new Set(this.usedActionExecutionIdSet);
    const terminalEventReservationCountBefore =
      this.terminalEventReservationCount;
    const relationshipStateCountBefore = Object.keys(relationships).length;
    const activeActionStateCountBefore = Object.keys(actions).length;
    const usedActionExecutionIdCountBefore = usedActionExecutionIds.size;

    for (const change of transitionPlan.relationshipChanges) {
      if (change.operation === "remove") {
        const current = ownValue(relationships, change.before.id);
        if (isNil(current) || !sameCanonical(current, change.before)) {
          throw new Error(
            `GAMEPLAY_STATE_STALE: Relationship '${change.before.id}' changed before commit.`,
          );
        }
        delete relationships[change.before.id];
      } else {
        if (!isNil(ownValue(relationships, change.after.id))) {
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
        if (isNil(current) || !sameCanonical(current, change.before)) {
          throw new Error(
            `GAMEPLAY_STATE_STALE: Action '${change.before.state.id}' changed before commit.`,
          );
        }
        delete actions[change.before.state.id];
      } else {
        if (!isNil(ownValue(actions, change.after.state.id))) {
          throw new Error(
            `GAMEPLAY_STATE_STALE: Action '${change.after.state.id}' already exists.`,
          );
        }
        actions[change.after.state.id] = change.after;
      }
    }
    for (const id of transitionPlan.newlyCommittedActionExecutionIds) {
      if (usedActionExecutionIds.has(id)) {
        throw new Error(
          `ACTION_EXECUTION_ID_CONFLICT: Action execution '${id}' was already used.`,
        );
      }
      usedActionExecutionIds.add(id);
    }
    const actualCapacityDelta: GameplayTransitionCapacityDeltaV1 = {
      relationshipStateCountDelta:
        Object.keys(relationships).length - relationshipStateCountBefore,
      activeActionStateCountDelta:
        Object.keys(actions).length - activeActionStateCountBefore,
      usedActionExecutionIdCountDelta:
        usedActionExecutionIds.size - usedActionExecutionIdCountBefore,
      immediateEventCount:
        transitionPlan.relationshipChanges.length + transitionPlan.actionChanges.length,
      terminalEventReservationCountDelta:
        Object.keys(actions).length - activeActionStateCountBefore,
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
        transitionPlan.capacityDelta.usedActionExecutionIdCountDelta,
        actualCapacityDelta.usedActionExecutionIdCountDelta,
      ) ||
      !Object.is(
        transitionPlan.capacityDelta.immediateEventCount,
        actualCapacityDelta.immediateEventCount,
      ) ||
      !Object.is(
        transitionPlan.capacityDelta.terminalEventReservationCountDelta,
        actualCapacityDelta.terminalEventReservationCountDelta,
      )
    ) {
      throw new Error(
        "GAMEPLAY_TRANSITION_INVARIANT: Capacity and Event reservations do not match the planned state changes.",
      );
    }
    const terminalEventReservationCount = terminalEventReservationCountBefore +
      actualCapacityDelta.terminalEventReservationCountDelta;
    this.assertCardinalityAndCapacity(
      relationships,
      actions,
      usedActionExecutionIds,
      terminalEventReservationCount,
    );
    return {
      expectedStateRevision: this.stateRevision,
      relationshipStatesById: deepFreeze(
        sortedRecord(Object.values(relationships)),
      ),
      activeActionExecutionsById: deepFreeze(Object.fromEntries(
        Object.values(actions)
          .sort((left, right) => compareCodeUnits(left.state.id, right.state.id))
          .map((value) => [value.state.id, value]),
      )),
      usedActionExecutionIds,
      terminalEventReservationCount,
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
      if (!isNil(ownValue(this.controllerStatesById, id))) {
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
    ].sort(([left], [right]) => compareCodeUnits(left, right)));
    return buildWorldStateSnapshotV1({
      kind: "worldkit-world-state-snapshot",
      schemaVersion: 1,
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
    command: GameplayCommandV1,
    simulationTick: number,
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
          type: command.type,
          commandId: command.id,
          expectedStateRevision: this.stateRevision,
          relationshipChanges,
          actionChanges,
          newlyCommittedActionExecutionIds,
          capacityDelta,
        },
      });
    this.transitionProvenance.set(result.transitionPlan, deepFreeze({
      kind: "command",
      commandHash: deriveGameplayCommandHashV1(command),
      commandId: command.id,
      commandType: command.type,
      simulationTick,
    }));
    return result;
  }

  private authorizeCommandPlan(input: Readonly<{
    transitionPlan: GameplayCommandTransitionPlanV1;
    command: GameplayCommandV1;
    simulationTick: number;
  }>): void {
    assertTick(input.simulationTick, "simulationTick");
    const provenance = this.transitionProvenance.get(input.transitionPlan);
    if (isNil(provenance) || !Object.isFrozen(input.transitionPlan)) {
      throw new Error(
        "GAMEPLAY_TRANSITION_NOT_ISSUED: Transition plan was not issued by this GameplayState.",
      );
    }
    if (
      provenance.kind !== "command" ||
      provenance.commandId !== input.command.id ||
      provenance.commandType !== input.command.type ||
      provenance.simulationTick !== input.simulationTick ||
      provenance.commandHash !== deriveGameplayCommandHashV1(input.command)
    ) {
      throw new Error(
        "GAMEPLAY_TRANSITION_COMMAND_MISMATCH: Transition does not belong to the dispatched command and Tick.",
      );
    }
    this.authorizedTransitionPlans.add(input.transitionPlan);
  }

  private assertAuthorizedTransitionPlan(
    transitionPlan: GameplayTransitionPlanV1,
  ): GameplayTransitionProvenanceV1 {
    const provenance = this.transitionProvenance.get(transitionPlan);
    if (
      isNil(provenance) ||
      !Object.isFrozen(transitionPlan)
    ) {
      throw new Error(
        "GAMEPLAY_TRANSITION_NOT_ISSUED: Transition plan was not issued by this GameplayState.",
      );
    }
    if (!this.authorizedTransitionPlans.has(transitionPlan)) {
      throw new Error(
        "GAMEPLAY_TRANSITION_NOT_AUTHORIZED: Transition plan has not passed trusted authorization.",
      );
    }
    return provenance;
  }

  private validateActionRequest(
    command: ActionActivateGameplayCommandV1,
    request: GameplayActionDefinitionV1["request"],
  ): GameplayDiagnosticV1 | undefined {
    if (request.mode === "none") {
      return isNil(command.actionRequestRef)
        ? undefined
        : Object.freeze({
            code: "ACTION_REQUEST_INVALID",
            message: "This Semantic Action does not accept an Action Request.",
          });
    }
    if (
      isNil(command.actionRequestRef) ||
      isNil(command.actionRequestHash) ||
      isNil(this.actionRequestResolver)
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
    usedActionExecutionIds: ReadonlySet<string>,
    terminalEventReservationCount: number,
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
    if (terminalEventReservationCount !== Object.keys(actions).length) {
      throw new Error(
        "GAMEPLAY_TRANSITION_INVARIANT: Active Actions and terminal Event reservations diverged.",
      );
    }
    if (
      Object.keys(relationships).length >
        this.capacityBudget.maximumPossessedByRelationshipCount ||
      Object.keys(actions).length > this.capacityBudget.maximumActiveActionStateCount ||
      usedActionExecutionIds.size >
        this.capacityBudget.maximumUsedActionExecutionIdCount ||
      terminalEventReservationCount < 0 ||
      terminalEventReservationCount > this.capacityBudget.maximumRetainedEventCount
    ) throw new Error("GAMEPLAY_CAPACITY_EXCEEDED: Transition exceeds capacity.");
  }
}
