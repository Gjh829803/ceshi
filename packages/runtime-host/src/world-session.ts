import {
  deriveGameplayCommandHashV1,
  deriveGameplayCommandReceiptIdV1,
  deriveGameplayEventIdV1,
  deriveWorldStateSnapshotRefV1,
  parseGameplayBootstrapV1,
  parseGameplayCapacityBudgetV1,
  parseGameplayCommandReceiptV1,
  parseGameplayCommandV1,
  parseGameplayEventV1,
  type ControllerEntityStateV1,
  type GameplayBootstrapV1,
  type GameplayCapacityBudgetV1,
  type GameplayCommandReceiptV1,
  type GameplayCommandV1,
  type GameplayDiagnosticCodeV1,
  type GameplayDiagnosticV1,
  type GameplayEventV1,
  type GameplayInspectionSnapshotV1,
  type GameplayParticipantStateV1,
  type GameplaySemanticFactV1,
  type Sha256HashV1,
  type WorldStateSnapshotV1,
} from "@whitebox-world/gameplay-contracts";
import {
  createGameplayActionCatalogV1,
  GameplayFeatureManager,
  GameplayState,
  type ActiveGameplayFeaturesHandleV1,
  type GameplayActionRequestResolverV1,
  type GameplayFeatureFactoryV1,
  type GameplayModeV1,
  type GameplayTransitionPlanV1,
} from "@whitebox-world/gameplay";
import type {
  ControlInputAxesV2,
  FixedInputV1,
  SemanticInputActionV1,
} from "@whitebox-world/runtime-contracts";
import { isEqual, isNil } from "lodash-es";

import {
  CommandJournal,
  type CommandJournalCapacityReservationV1,
} from "./command-journal";
import {
  parseGameplayFixedInputCapacityEstimateV1,
  parseGameplayViewStateProjectionV1,
  parseGameplayWorldStateProjectionV1,
  parseGameplayWorldTransactionV1,
  type GameplayViewStateProjectionV1,
  type GameplayWorldPortV1,
  type GameplayWorldStateProjectionV1,
} from "./gameplay-world-port";
import { WorldStateArtifactStore } from "./world-state-artifact-store";

export interface WorldSessionCreateOptionsV1 {
  readonly runtimeSessionId: string;
  readonly worldSessionId: string;
  readonly worldPackageRef: string;
  readonly worldPackageRootHash: Sha256HashV1;
  readonly executionPlanHash: Sha256HashV1;
  readonly gameplayBootstrap: GameplayBootstrapV1;
  readonly participantStates: readonly GameplayParticipantStateV1[];
  readonly controllerStates: readonly ControllerEntityStateV1[];
  readonly fixedInputControllerEntityId: string;
  readonly gameplayModeFactory: () => GameplayModeV1;
  readonly gameplayFeatureFactories: readonly GameplayFeatureFactoryV1[];
  readonly gameplayActionRequestResolver?: GameplayActionRequestResolverV1;
  readonly gameplayCapacityBudget: GameplayCapacityBudgetV1;
  readonly worldPort: GameplayWorldPortV1;
}

export type WorldSessionPhaseV1 = "ready" | "failed" | "disposed";

export interface WorldSessionPublicationV1 {
  readonly publicationEpoch: number;
  readonly worldState: WorldStateSnapshotV1;
  readonly gameplayInspection: GameplayInspectionSnapshotV1;
  readonly viewState: GameplayViewStateProjectionV1;
}

interface ParsedWorldSessionCreateOptionsV1 extends WorldSessionCreateOptionsV1 {
  readonly controllerEntityIds: readonly string[];
}

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const MAXIMUM_FIXED_INPUT_TICK_COUNT = 36_000;
const SEMANTIC_INPUT_ACTIONS = new Set<SemanticInputActionV1>([
  "move-forward",
  "move-backward",
  "move-left",
  "move-right",
  "jump",
  "run",
  "boost",
  "brake",
  "handbrake",
  "primary-action",
  "secondary-action",
  "aim",
  "camera-recenter",
  "camera-look-back",
  "camera-shoulder-swap",
]);
const MOVEMENT_INPUT_ACTIONS = new Set<SemanticInputActionV1>([
  "move-forward",
  "move-backward",
  "move-left",
  "move-right",
  "jump",
  "run",
  "boost",
  "brake",
  "handbrake",
]);
const UNBOUND_CAMERA_INPUT_ACTIONS = new Set<SemanticInputActionV1>([
  "camera-recenter",
  "camera-look-back",
  "camera-shoulder-swap",
]);

function invalid(schemaName: string): never {
  throw new RangeError(`Value must match the closed ${schemaName} schema.`);
}

function snapshotDataRecord(input: unknown): Record<string, unknown> | undefined {
  if (typeof input !== "object" || isNil(input)) return undefined;
  try {
    const prototype = Reflect.getPrototypeOf(input);
    if (!isNil(prototype) && prototype !== Object.prototype) return undefined;
    const snapshot = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(input)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
      if (
        typeof key !== "string" ||
        isNil(descriptor) ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) return undefined;
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    return undefined;
  }
}

function snapshotDataArray(input: unknown): readonly unknown[] | undefined {
  if (!Array.isArray(input)) return undefined;
  try {
    if (Reflect.getPrototypeOf(input) !== Array.prototype) return undefined;
    if (Reflect.ownKeys(input).some((key) => typeof key === "symbol")) {
      return undefined;
    }
    if (Object.getOwnPropertyNames(input).length !== input.length + 1) {
      return undefined;
    }
    const snapshot: unknown[] = [];
    for (let index = 0; index < input.length; index += 1) {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, String(index));
      if (
        isNil(descriptor) ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) return undefined;
      snapshot.push(descriptor.value);
    }
    return snapshot;
  } catch {
    return undefined;
  }
}

function hasExactKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean {
  const actual = Reflect.ownKeys(record);
  return actual.length === keys.length && actual.every(
    (key) => typeof key === "string" && keys.includes(key),
  );
}

function isNonEmptyString(input: unknown): input is string {
  return typeof input === "string" && input.length > 0;
}

function isSha256Hash(input: unknown): input is Sha256HashV1 {
  return typeof input === "string" && SHA256_PATTERN.test(input);
}

function isSafeNonNegativeInteger(input: unknown): input is number {
  return typeof input === "number" &&
    Number.isSafeInteger(input) &&
    input >= 0 &&
    !Object.is(input, -0);
}

function isFiniteNumberInRange(
  input: unknown,
  minimum: number,
  maximum: number,
): input is number {
  return typeof input === "number" &&
    Number.isFinite(input) &&
    input >= minimum &&
    input <= maximum;
}

function parseFixedInput(input: unknown): FixedInputV1 {
  const record = snapshotDataRecord(input);
  const hasAxes = !isNil(record) && hasExactKeys(record, [
    "actions",
    "axes",
    "ticks",
  ]);
  if (
    isNil(record) ||
    (!hasExactKeys(record, ["actions", "ticks"]) && !hasAxes) ||
    !isSafeNonNegativeInteger(record.ticks) ||
    record.ticks > MAXIMUM_FIXED_INPUT_TICK_COUNT
  ) return invalid("FixedInputV1");
  const actionInputs = snapshotDataArray(record.actions);
  if (
    isNil(actionInputs) ||
    actionInputs.some((action) =>
      typeof action !== "string" ||
      !SEMANTIC_INPUT_ACTIONS.has(action as SemanticInputActionV1)
    )
  ) return invalid("FixedInputV1");

  let axes: Readonly<ControlInputAxesV2> | undefined;
  if (hasAxes) {
    const axesRecord = snapshotDataRecord(record.axes);
    const keys = [
      "moveXRatio",
      "moveYRatio",
      "throttleRatio",
      "brakeRatio",
    ] as const;
    if (
      isNil(axesRecord) ||
      Reflect.ownKeys(axesRecord).some((key) =>
        typeof key !== "string" || !keys.includes(key as typeof keys[number])
      ) ||
      [axesRecord.moveXRatio, axesRecord.moveYRatio].some((value) =>
        !isNil(value) && !isFiniteNumberInRange(value, -1, 1)
      ) ||
      [axesRecord.throttleRatio, axesRecord.brakeRatio].some((value) =>
        !isNil(value) && !isFiniteNumberInRange(value, 0, 1)
      )
    ) return invalid("FixedInputV1");
    axes = Object.freeze({ ...axesRecord }) as Readonly<ControlInputAxesV2>;
  }
  return Object.freeze({
    actions: Object.freeze([...actionInputs] as SemanticInputActionV1[]),
    ...(!isNil(axes) ? { axes } : {}),
    ticks: record.ticks,
  });
}

function parseParticipants(input: unknown): readonly GameplayParticipantStateV1[] {
  const values = snapshotDataArray(input);
  if (isNil(values)) return invalid("WorldSessionCreateOptionsV1");
  const ids = new Set<string>();
  return Object.freeze(values.map((value) => {
    const record = snapshotDataRecord(value);
    if (
      isNil(record) ||
      !hasExactKeys(record, ["id", "mode"]) ||
      !isNonEmptyString(record.id) ||
      record.mode !== "active" ||
      ids.has(record.id)
    ) return invalid("WorldSessionCreateOptionsV1");
    ids.add(record.id);
    return Object.freeze({ id: record.id, mode: "active" as const });
  }));
}

function parseControllers(
  input: unknown,
  participantIds: ReadonlySet<string>,
): readonly ControllerEntityStateV1[] {
  const values = snapshotDataArray(input);
  if (isNil(values)) return invalid("WorldSessionCreateOptionsV1");
  const ids = new Set<string>();
  return Object.freeze(values.map((value) => {
    const record = snapshotDataRecord(value);
    if (
      isNil(record) ||
      !hasExactKeys(record, [
        "id",
        "kind",
        "controllerDefinitionRef",
        "controllerDefinitionHash",
        "participantId",
        "lifecycleMode",
        "inputMode",
      ]) ||
      !isNonEmptyString(record.id) ||
      record.kind !== "controller-entity-state" ||
      !isNonEmptyString(record.controllerDefinitionRef) ||
      !isSha256Hash(record.controllerDefinitionHash) ||
      !isNonEmptyString(record.participantId) ||
      !participantIds.has(record.participantId) ||
      !["active", "suspended", "disabled"].includes(
        record.lifecycleMode as string,
      ) ||
      !["human", "agent", "replay"].includes(record.inputMode as string) ||
      ids.has(record.id)
    ) return invalid("WorldSessionCreateOptionsV1");
    ids.add(record.id);
    return Object.freeze({
      id: record.id,
      kind: "controller-entity-state" as const,
      controllerDefinitionRef: record.controllerDefinitionRef,
      controllerDefinitionHash: record.controllerDefinitionHash,
      participantId: record.participantId,
      lifecycleMode: record.lifecycleMode as ControllerEntityStateV1["lifecycleMode"],
      inputMode: record.inputMode as ControllerEntityStateV1["inputMode"],
    });
  }));
}

function parseCreateOptions(input: unknown): ParsedWorldSessionCreateOptionsV1 {
  const record = snapshotDataRecord(input);
  const baseKeys = [
    "runtimeSessionId",
    "worldSessionId",
    "worldPackageRef",
    "worldPackageRootHash",
    "executionPlanHash",
    "gameplayBootstrap",
    "participantStates",
    "controllerStates",
    "fixedInputControllerEntityId",
    "gameplayModeFactory",
    "gameplayFeatureFactories",
    "gameplayCapacityBudget",
    "worldPort",
  ] as const;
  const hasResolver = !isNil(record) && hasExactKeys(record, [
    ...baseKeys,
    "gameplayActionRequestResolver",
  ]);
  if (
    isNil(record) ||
    (!hasExactKeys(record, baseKeys) && !hasResolver) ||
    !isNonEmptyString(record.runtimeSessionId) ||
    !isNonEmptyString(record.worldSessionId) ||
    !isNonEmptyString(record.worldPackageRef) ||
    !isSha256Hash(record.worldPackageRootHash) ||
    !isSha256Hash(record.executionPlanHash) ||
    !isNonEmptyString(record.fixedInputControllerEntityId) ||
    typeof record.gameplayModeFactory !== "function" ||
    (hasResolver && typeof record.gameplayActionRequestResolver !== "function") ||
    typeof record.worldPort !== "object" ||
    isNil(record.worldPort)
  ) return invalid("WorldSessionCreateOptionsV1");

  const participantStates = parseParticipants(record.participantStates);
  const controllerStates = parseControllers(
    record.controllerStates,
    new Set(participantStates.map(({ id }) => id)),
  );
  if (!controllerStates.some(({ id, lifecycleMode }) =>
    id === record.fixedInputControllerEntityId && lifecycleMode === "active"
  )) {
    return invalid("WorldSessionCreateOptionsV1");
  }
  const factoryInputs = snapshotDataArray(record.gameplayFeatureFactories);
  if (isNil(factoryInputs)) return invalid("WorldSessionCreateOptionsV1");
  const gameplayBootstrap = parseGameplayBootstrapV1(record.gameplayBootstrap);
  const gameplayCapacityBudget = parseGameplayCapacityBudgetV1(
    record.gameplayCapacityBudget,
  );
  return Object.freeze({
    runtimeSessionId: record.runtimeSessionId,
    worldSessionId: record.worldSessionId,
    worldPackageRef: record.worldPackageRef,
    worldPackageRootHash: record.worldPackageRootHash,
    executionPlanHash: record.executionPlanHash,
    gameplayBootstrap,
    participantStates,
    controllerStates,
    fixedInputControllerEntityId: record.fixedInputControllerEntityId,
    gameplayModeFactory: record.gameplayModeFactory as () => GameplayModeV1,
    gameplayFeatureFactories: Object.freeze(
      [...factoryInputs] as GameplayFeatureFactoryV1[],
    ),
    ...(hasResolver
      ? {
          gameplayActionRequestResolver:
            record.gameplayActionRequestResolver as GameplayActionRequestResolverV1,
        }
      : {}),
    gameplayCapacityBudget,
    worldPort: record.worldPort as GameplayWorldPortV1,
    controllerEntityIds: Object.freeze(controllerStates.map(({ id }) => id)),
  });
}

function diagnostic(
  code: GameplayDiagnosticCodeV1,
  message: string,
): GameplayDiagnosticV1 {
  return Object.freeze({ code, message });
}

function receipt(
  command: GameplayCommandV1,
  simulationTick: number,
  result:
    | Readonly<{
        status: "committed";
        events: readonly GameplayEventV1[];
        worldState: WorldStateSnapshotV1;
      }>
    | Readonly<{
        status: "rejected" | "failed";
        events: readonly GameplayEventV1[];
        diagnostic: GameplayDiagnosticV1;
      }>,
): GameplayCommandReceiptV1 {
  const base = {
    kind: "worldkit-gameplay-command-receipt" as const,
    schemaVersion: 1 as const,
    runtimeSessionId: command.runtimeSessionId,
    worldSessionId: command.worldSessionId,
    commandId: command.id,
    commandHash: deriveGameplayCommandHashV1(command),
    commandType: command.type,
    simulationTick,
    eventIds: result.events.map(({ id }) => id),
  };
  const body = result.status === "committed"
    ? {
        ...base,
        status: "committed" as const,
        worldStateAfterRef: deriveWorldStateSnapshotRefV1({
          runtimeSessionId: result.worldState.runtimeSessionId,
          worldSessionId: result.worldState.worldSessionId,
          worldStateHash: result.worldState.worldStateHash,
        }),
        worldStateAfterHash: result.worldState.worldStateHash,
      }
    : {
        ...base,
        status: result.status,
        diagnostic: result.diagnostic,
      };
  return parseGameplayCommandReceiptV1({
    id: deriveGameplayCommandReceiptIdV1(body),
    ...body,
  });
}

function transitionEvents(
  runtimeSessionId: string,
  worldSessionId: string,
  simulationTick: number,
  lastEventSequence: number,
  transition: GameplayTransitionPlanV1,
): readonly GameplayEventV1[] {
  let sequence = lastEventSequence;
  const events: GameplayEventV1[] = [];
  const base = () => {
    sequence += 1;
    return {
      kind: "worldkit-gameplay-event" as const,
      schemaVersion: 1 as const,
      id: deriveGameplayEventIdV1(worldSessionId, sequence),
      runtimeSessionId,
      worldSessionId,
      simulationTick,
      sequence,
    };
  };
  for (const change of transition.relationshipChanges) {
    const relationship = change.operation === "remove"
      ? change.before
      : change.after;
    events.push(parseGameplayEventV1({
      ...base(),
      type: change.operation === "remove"
        ? "relationship.removed"
        : "relationship.committed",
      commandId: "commandId" in transition
        ? transition.commandId
        : invalid("GameplayTransitionPlanV1"),
      relationshipId: relationship.id,
      controlledEntityId: relationship.controlledEntityId,
      controllerEntityId: relationship.controllerEntityId,
    }));
  }
  for (const change of transition.actionChanges) {
    const execution = change.operation === "remove" ? change.before : change.after;
    const action = execution.state;
    if (change.operation === "add") {
      events.push(parseGameplayEventV1({
        ...base(),
        type: "action.started",
        semanticActionRef: action.semanticActionRef,
        actionExecutionId: action.id,
        actorEntityId: action.actorEntityId,
        commandId: "commandId" in transition
          ? transition.commandId
          : invalid("GameplayTransitionPlanV1"),
      }));
    } else if (transition.type === "action.complete") {
      events.push(parseGameplayEventV1({
        ...base(),
        type: "action.completed",
        semanticActionRef: action.semanticActionRef,
        actionExecutionId: action.id,
        actorEntityId: action.actorEntityId,
      }));
    } else {
      events.push(parseGameplayEventV1({
        ...base(),
        type: "action.cancelled",
        semanticActionRef: action.semanticActionRef,
        actionExecutionId: action.id,
        actorEntityId: action.actorEntityId,
        commandId: transition.commandId,
      }));
    }
  }
  return Object.freeze(events);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function semanticFactEvents(
  runtimeSessionId: string,
  worldSessionId: string,
  simulationTick: number,
  lastEventSequence: number,
  beforeById: Readonly<Record<string, GameplaySemanticFactV1>>,
  afterById: Readonly<Record<string, GameplaySemanticFactV1>>,
): readonly GameplayEventV1[] {
  let sequence = lastEventSequence;
  const events: GameplayEventV1[] = [];
  const append = (
    type: "semantic-fact.ended" | "semantic-fact.started",
    semanticFact: GameplaySemanticFactV1,
  ): void => {
    sequence += 1;
    events.push(parseGameplayEventV1({
      kind: "worldkit-gameplay-event",
      schemaVersion: 1,
      id: deriveGameplayEventIdV1(worldSessionId, sequence),
      type,
      runtimeSessionId,
      worldSessionId,
      simulationTick,
      sequence,
      semanticFact,
    }));
  };
  for (const id of Object.keys(beforeById).filter((id) => isNil(afterById[id]))
    .sort(compareCodeUnits)) {
    append("semantic-fact.ended", beforeById[id]!);
  }
  for (const id of Object.keys(afterById).filter((id) => isNil(beforeById[id]))
    .sort(compareCodeUnits)) {
    append("semantic-fact.started", afterById[id]!);
  }
  return Object.freeze(events);
}

function worldFailedEvent(
  runtimeSessionId: string,
  worldSessionId: string,
  simulationTick: number,
  sequence: number,
  failureDiagnostic: GameplayDiagnosticV1,
): GameplayEventV1 {
  return parseGameplayEventV1({
    kind: "worldkit-gameplay-event",
    schemaVersion: 1,
    id: deriveGameplayEventIdV1(worldSessionId, sequence),
    type: "world.failed",
    runtimeSessionId,
    worldSessionId,
    simulationTick,
    sequence,
    diagnostic: failureDiagnostic,
  });
}

async function abortUnparsedTransaction(input: unknown): Promise<void> {
  const record = snapshotDataRecord(input);
  if (
    isNil(record) ||
    typeof record.abort !== "function"
  ) throw new Error("INVALID_GAMEPLAY_TRANSACTION_ABORT");
  await Promise.resolve().then(() =>
    Reflect.apply(record.abort as () => unknown, input, [])
  );
}

function publication(
  publicationEpoch: number,
  worldState: WorldStateSnapshotV1,
  gameplayInspection: GameplayInspectionSnapshotV1,
  viewState: GameplayViewStateProjectionV1,
): WorldSessionPublicationV1 {
  return Object.freeze({
    publicationEpoch,
    worldState,
    gameplayInspection,
    viewState,
  });
}

export class WorldSession {
  readonly runtimeSessionId: string;
  readonly worldSessionId: string;
  private readonly options: ParsedWorldSessionCreateOptionsV1;
  private readonly gameplayState: GameplayState;
  private readonly gameplayMode: GameplayModeV1;
  private readonly activeFeatures: ActiveGameplayFeaturesHandleV1;
  private readonly commandJournal: CommandJournal;
  private readonly artifactStore: WorldStateArtifactStore;
  private publishedWorldProjection: GameplayWorldStateProjectionV1;
  private currentPublication: WorldSessionPublicationV1;
  private phaseValue: WorldSessionPhaseV1 = "ready";
  private mutationTail: Promise<void> = Promise.resolve();
  private disposeRequested = false;
  private disposePromise: Promise<void> | undefined;
  private resourceCleanupPromise: Promise<readonly unknown[]> | undefined;

  private constructor(
    options: ParsedWorldSessionCreateOptionsV1,
    gameplayState: GameplayState,
    gameplayMode: GameplayModeV1,
    activeFeatures: ActiveGameplayFeaturesHandleV1,
    publishedWorldProjection: GameplayWorldStateProjectionV1,
    initialPublication: WorldSessionPublicationV1,
  ) {
    this.options = options;
    this.runtimeSessionId = options.runtimeSessionId;
    this.worldSessionId = options.worldSessionId;
    this.gameplayState = gameplayState;
    this.gameplayMode = gameplayMode;
    this.activeFeatures = activeFeatures;
    this.publishedWorldProjection = publishedWorldProjection;
    this.currentPublication = initialPublication;
    this.commandJournal = new CommandJournal({
      maximumIdempotencyRecordCount:
        options.gameplayCapacityBudget.maximumIdempotencyRecordCount,
      maximumRetainedReceiptCount:
        options.gameplayCapacityBudget.maximumRetainedReceiptCount,
      maximumRetainedEventCount:
        options.gameplayCapacityBudget.maximumRetainedEventCount,
    });
    this.artifactStore = new WorldStateArtifactStore({
      maximumRetainedWorldStateSnapshotCount:
        options.gameplayCapacityBudget.maximumRetainedWorldStateSnapshotCount,
    });
  }

  static async create(input: unknown): Promise<WorldSession> {
    const options = parseCreateOptions(input);
    let activeFeatures: ActiveGameplayFeaturesHandleV1 | undefined;
    try {
      const actionCatalog = createGameplayActionCatalogV1(
        options.gameplayBootstrap.semanticActionDefinitions,
        options.gameplayCapacityBudget.maximumSemanticActionDefinitionCount,
      );
      const featureManager = new GameplayFeatureManager({
        factories: options.gameplayFeatureFactories,
        resourceLocks: options.gameplayBootstrap.featureResourceLocks,
        availableCapabilityRefs:
          options.gameplayBootstrap.availableCapabilityRefs,
        capacityBudget: options.gameplayCapacityBudget,
      });
      const gameplayState = new GameplayState({
        runtimeSessionId: options.runtimeSessionId,
        worldSessionId: options.worldSessionId,
        participantStates: options.participantStates,
        controllerStates: options.controllerStates,
        entityDescriptors: options.gameplayBootstrap.entityDescriptors,
        actionCatalog,
        ...(isNil(options.gameplayActionRequestResolver)
          ? {}
          : { actionRequestResolver: options.gameplayActionRequestResolver }),
        capacityBudget: options.gameplayCapacityBudget,
      });
      const gameplayMode = options.gameplayModeFactory();
      if (
        typeof gameplayMode !== "object" ||
        isNil(gameplayMode) ||
        !isNonEmptyString(gameplayMode.gameplayModeRef) ||
        typeof gameplayMode.evaluateCommand !== "function"
      ) invalid("GameplayModeV1");
      activeFeatures = await featureManager.activate({
        worldSessionId: options.worldSessionId,
      });
      const initialProjection = parseGameplayWorldStateProjectionV1(
        await options.worldPort.initialize(),
        { controllerEntityIds: options.controllerEntityIds },
      );
      const worldState = gameplayState.projectWorldState({
        simulationTick: initialProjection.simulationTick,
        worldPackageRef: options.worldPackageRef,
        worldPackageRootHash: options.worldPackageRootHash,
        executionPlanHash: options.executionPlanHash,
        spatialEntityStatesById: initialProjection.spatialEntityStatesById,
        capabilityStatesById: initialProjection.capabilityStatesById,
        semanticFactsById: initialProjection.semanticFactsById,
        lastEventSequence: 0,
      });
      const inspection = gameplayState.projectGameplayInspection({
        id: `gameplay-inspection:${options.worldSessionId}:0`,
        gameplayModeRef: gameplayMode.gameplayModeRef,
        phase: "ready",
        simulationTick: initialProjection.simulationTick,
        activatedGameplayFeatureRefs: activeFeatures.activeFeatureRefs,
        lastEventSequence: 0,
      });
      const initialPublication = publication(
        0,
        worldState,
        inspection,
        parseGameplayViewStateProjectionV1({ viewStateRevision: 0 }),
      );
      return new WorldSession(
        options,
        gameplayState,
        gameplayMode,
        activeFeatures,
        initialProjection,
        initialPublication,
      );
    } catch {
      const cleanupErrors: unknown[] = [];
      try {
        await options.worldPort.dispose();
      } catch (error) {
        cleanupErrors.push(error);
      }
      if (!isNil(activeFeatures)) {
        try {
          await activeFeatures.dispose();
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
      throw new Error(
        cleanupErrors.length === 0
          ? "WORLD_SESSION_INITIALIZATION_FAILED: Session construction failed."
          : "WORLD_SESSION_INITIALIZATION_FAILED: Session construction and cleanup failed.",
      );
    }
  }

  get phase(): WorldSessionPhaseV1 {
    return this.phaseValue;
  }

  snapshot(): WorldSessionPublicationV1 {
    return this.currentPublication;
  }

  getWorldStateSnapshot(worldStateRef: string): WorldStateSnapshotV1 | undefined {
    const currentRef = deriveWorldStateSnapshotRefV1({
      runtimeSessionId: this.currentPublication.worldState.runtimeSessionId,
      worldSessionId: this.currentPublication.worldState.worldSessionId,
      worldStateHash: this.currentPublication.worldState.worldStateHash,
    });
    if (worldStateRef === currentRef) return this.currentPublication.worldState;
    return this.artifactStore.get(worldStateRef);
  }

  eventsAfter(
    afterEventSequence: number,
    maximumEventCount: number,
  ): readonly GameplayEventV1[] {
    return this.commandJournal.eventsAfter(
      afterEventSequence,
      maximumEventCount,
    );
  }

  executeGameplayCommand(input: unknown): Promise<GameplayCommandReceiptV1> {
    const command = parseGameplayCommandV1(input);
    const commandHash = deriveGameplayCommandHashV1(command);
    return this.enqueueMutation(() => this.executeParsedCommand(command, commandHash));
  }

  runFixedInput(input: unknown): Promise<WorldSessionPublicationV1> {
    const fixedInput = parseFixedInput(input);
    return this.enqueueMutation(() => this.runParsedFixedInput(fixedInput));
  }

  dispose(): Promise<void> {
    if (!isNil(this.disposePromise)) return this.disposePromise;
    this.disposeRequested = true;
    this.disposePromise = this.enqueueMutation(async () => {
      if (this.phaseValue === "disposed") return;
      const errors = await this.cleanupResources();
      this.phaseValue = "disposed";
      this.artifactStore.dispose();
      if (errors.length > 0) {
        throw new AggregateError(errors, "WorldSession cleanup failed.");
      }
    });
    return this.disposePromise;
  }

  private async executeParsedCommand(
    command: GameplayCommandV1,
    commandHash: Sha256HashV1,
  ): Promise<GameplayCommandReceiptV1> {
    const lookup = this.commandJournal.lookup(command, commandHash);
    if (lookup.status === "replay") return lookup.receipt;
    if (lookup.status === "conflict") {
      return receipt(command, this.currentPublication.worldState.simulationTick, {
        status: "rejected",
        events: [],
        diagnostic: diagnostic(
          "COMMAND_ID_CONFLICT",
          "The Gameplay command ID conflicts with a retained payload.",
        ),
      });
    }

    const simulationTick = this.currentPublication.worldState.simulationTick;
    if (
      this.disposeRequested ||
      this.phaseValue !== "ready" ||
      command.runtimeSessionId !== this.runtimeSessionId ||
      command.worldSessionId !== this.worldSessionId
    ) {
      const code = command.runtimeSessionId !== this.runtimeSessionId
        ? "RUNTIME_SESSION_NOT_FOUND"
        : command.worldSessionId !== this.worldSessionId
        ? "WORLD_SESSION_STALE"
        : "WORLD_SESSION_NOT_READY";
      return this.retainRejected(
        command,
        simulationTick,
        diagnostic(code, "The Gameplay command does not target a ready Session."),
      );
    }

    const planned = this.activeFeatures.dispatcher.dispatch({
      command,
      state: this.gameplayState.planningPort(),
      commandPlanAuthority: this.gameplayState.commandPlanAuthorityPort(),
      simulationTick,
      gameplayMode: this.gameplayMode,
    });
    if (planned.status === "rejected") {
      return this.retainRejected(command, simulationTick, planned.diagnostic);
    }

    const reservedEventCount = Math.max(
      1,
      planned.transitionPlan.capacityDelta.immediateEventCount,
    );
    const terminalEventReservationCountBefore = Object.keys(
      this.currentPublication.gameplayInspection.activeActionStatesById,
    ).length;
    const terminalEventReservationCountAfter = terminalEventReservationCountBefore +
      planned.transitionPlan.capacityDelta.terminalEventReservationCountDelta;
    const retainedEventCount = this.commandJournal.snapshot().retainedEventCount;
    const successEventCapacityAfter = retainedEventCount +
      terminalEventReservationCountAfter +
      planned.transitionPlan.capacityDelta.immediateEventCount;
    const failureEventCapacityAfter = retainedEventCount +
      terminalEventReservationCountBefore + 1;
    if (
      terminalEventReservationCountAfter < 0 ||
      Math.max(successEventCapacityAfter, failureEventCapacityAfter) >
        this.options.gameplayCapacityBudget.maximumRetainedEventCount
    ) {
      return this.retainRejected(
        command,
        simulationTick,
        diagnostic(
          "GAMEPLAY_CAPACITY_EXCEEDED",
          "Gameplay Event capacity cannot preserve terminal Action evidence.",
        ),
      );
    }
    const journalReservation = this.commandJournal.reserveCapacity({
      simulationTick,
      idempotencyRecordCount: 1,
      receiptCount: 1,
      eventCount: reservedEventCount,
    });
    if (journalReservation.status !== "reserved") {
      if (journalReservation.status === "command-admission-closed") {
        return this.commandAdmissionClosedReceipt(
          command,
          journalReservation.commandAdmissionClosedSimulationTick,
        );
      }
      return this.retainRejected(
        command,
        simulationTick,
        diagnostic(
          "GAMEPLAY_CAPACITY_EXCEEDED",
          "Gameplay Event capacity is exhausted.",
        ),
      );
    }
    const availabilityDiagnostic = this.availabilityDiagnostic(command);
    if (!isNil(availabilityDiagnostic)) {
      const rejectedReceipt = receipt(command, simulationTick, {
        status: "rejected",
        events: [],
        diagnostic: availabilityDiagnostic,
      });
      return journalReservation.reservation.prepare({
        command,
        commandHash,
        receipt: rejectedReceipt,
        events: [],
      }).commitPrepared();
    }
    const artifactReservation = this.artifactStore.reserveSlot();
    if (artifactReservation.status !== "reserved") {
      journalReservation.reservation.release();
      return this.retainRejected(
        command,
        simulationTick,
        diagnostic(
          "GAMEPLAY_CAPACITY_EXCEEDED",
          "World State artifact retention capacity is exhausted.",
        ),
      );
    }

    let rawTransaction: unknown;
    try {
      rawTransaction = await this.options.worldPort.prepareGameplayTransition(
        planned.transitionPlan,
      );
    } catch {
      artifactReservation.reservation.release();
      const prepareFailure = diagnostic(
          "ADAPTER_PREPARE_FAILED",
          "The Runtime Adapter could not prepare the Gameplay transition.",
      );
      const rejectedReceipt = receipt(command, simulationTick, {
        status: "rejected",
        events: [],
        diagnostic: prepareFailure,
      });
      return journalReservation.reservation.prepare({
        command,
        commandHash,
        receipt: rejectedReceipt,
        events: [],
      }).commitPrepared();
    }

    let transaction;
    try {
      transaction = parseGameplayWorldTransactionV1(
        rawTransaction,
        { controllerEntityIds: this.options.controllerEntityIds },
      );
    } catch {
      artifactReservation.reservation.release();
      try {
        await abortUnparsedTransaction(rawTransaction);
      } catch {
        return this.commitFailedCommand(
          command,
          commandHash,
          journalReservation.reservation,
          diagnostic(
            "ADAPTER_ABORT_FAILED",
            "The Runtime Adapter could not abort an invalid staged transition.",
          ),
        );
      }
      const projectionFailure = diagnostic(
        "ADAPTER_PREPARE_FAILED",
        "The Runtime Adapter returned an invalid staged transition.",
      );
      const rejectedReceipt = receipt(command, simulationTick, {
        status: "rejected",
        events: [],
        diagnostic: projectionFailure,
      });
      return journalReservation.reservation.prepare({
        command,
        commandHash,
        receipt: rejectedReceipt,
        events: [],
      }).commitPrepared();
    }

    try {
      if (
        transaction.projectedWorldStateAfter.simulationTick !== simulationTick ||
        !isEqual(
          transaction.projectedWorldStateAfter.spatialEntityStatesById,
          this.publishedWorldProjection.spatialEntityStatesById,
        ) ||
        !isEqual(
          transaction.projectedWorldStateAfter.capabilityStatesById,
          this.publishedWorldProjection.capabilityStatesById,
        ) ||
        !isEqual(
          transaction.projectedWorldStateAfter.semanticFactsById,
          this.publishedWorldProjection.semanticFactsById,
        )
      ) {
        throw new Error(
          "GAMEPLAY_WORLD_PROJECTION_CHANGED: Command transactions cannot mutate Adapter-owned World projection.",
        );
      }
      const events = transitionEvents(
        this.runtimeSessionId,
        this.worldSessionId,
        simulationTick,
        this.currentPublication.gameplayInspection.lastEventSequence,
        planned.transitionPlan,
      );
      const lastEventSequence = events.length === 0
        ? this.currentPublication.gameplayInspection.lastEventSequence
        : events[events.length - 1]!.sequence;
      const worldState = this.gameplayState.projectWorldStateAfter(
        planned.transitionPlan,
        {
          simulationTick: transaction.projectedWorldStateAfter.simulationTick,
          worldPackageRef: this.options.worldPackageRef,
          worldPackageRootHash: this.options.worldPackageRootHash,
          executionPlanHash: this.options.executionPlanHash,
          spatialEntityStatesById:
            transaction.projectedWorldStateAfter.spatialEntityStatesById,
          capabilityStatesById:
            transaction.projectedWorldStateAfter.capabilityStatesById,
          semanticFactsById:
            transaction.projectedWorldStateAfter.semanticFactsById,
          lastEventSequence,
        },
      );
      const nextEpoch = this.currentPublication.publicationEpoch + 1;
      const inspection = this.gameplayState.projectGameplayInspectionAfter(
        planned.transitionPlan,
        {
          id: `gameplay-inspection:${this.worldSessionId}:${nextEpoch}`,
          gameplayModeRef: this.gameplayMode.gameplayModeRef,
          phase: "ready",
          simulationTick,
          activatedGameplayFeatureRefs: this.activeFeatures.activeFeatureRefs,
          lastEventSequence,
        },
      );
      const committedReceipt = receipt(command, simulationTick, {
        status: "committed",
        events,
        worldState,
      });
      const preparedJournal = journalReservation.reservation.prepare({
        command,
        commandHash,
        receipt: committedReceipt,
        events,
      });
      const preparedArtifact = artifactReservation.reservation.prepare(worldState);
      const nextPublication = publication(
        nextEpoch,
        preparedArtifact.snapshot,
        inspection,
        transaction.projectedViewStateAfter,
      );

      const commitFailureDiagnostic = diagnostic(
        "ADAPTER_COMMIT_CONTRACT_VIOLATED",
        "The Runtime Adapter violated the synchronous commit contract.",
      );
      const commitFailureBundle = this.buildFailureBundle(
        command,
        commitFailureDiagnostic,
      );
      const preparedFailureJournal = journalReservation.reservation.prepare({
        command,
        commandHash,
        receipt: commitFailureBundle.receipt,
        events: [commitFailureBundle.event],
      });

      try {
        transaction.commitPrepared();
        this.gameplayState.commit(planned.transitionPlan);
      } catch {
        artifactReservation.reservation.release();
        this.phaseValue = "failed";
        preparedFailureJournal.commitPrepared();
        this.currentPublication = commitFailureBundle.publication;
        await this.cleanupResources();
        return preparedFailureJournal.receipt;
      }
      preparedArtifact.commitPrepared();
      preparedJournal.commitPrepared();
      this.publishedWorldProjection = transaction.projectedWorldStateAfter;
      this.currentPublication = nextPublication;
      return preparedJournal.receipt;
    } catch {
      artifactReservation.reservation.release();
      try {
        await transaction.abort();
      } catch {
        return this.commitFailedCommand(
          command,
          commandHash,
          journalReservation.reservation,
          diagnostic(
            "ADAPTER_ABORT_FAILED",
            "The Runtime Adapter could not abort the staged transition.",
          ),
        );
      }
      const precommitFailure = diagnostic(
        "ADAPTER_PREPARE_FAILED",
        "The Runtime Adapter transition was rejected before publication.",
      );
      const rejectedReceipt = receipt(command, simulationTick, {
        status: "rejected",
        events: [],
        diagnostic: precommitFailure,
      });
      return journalReservation.reservation.prepare({
        command,
        commandHash,
        receipt: rejectedReceipt,
        events: [],
      }).commitPrepared();
    }
  }

  private async runParsedFixedInput(
    input: FixedInputV1,
  ): Promise<WorldSessionPublicationV1> {
    if (this.disposeRequested || this.phaseValue !== "ready") {
      throw new Error("WORLD_SESSION_NOT_READY: Fixed input requires a ready Session.");
    }
    if (input.ticks === 0) return this.currentPublication;

    for (let index = 0; index < input.ticks; index += 1) {
      const oneTickInput = Object.freeze({
        ...this.fixedInputForCurrentGameplayState(input),
        ticks: 1 as const,
      });
      await this.runOneFixedInputTick(oneTickInput);
      if (this.phaseValue !== "ready") break;
    }
    return this.currentPublication;
  }

  private fixedInputForCurrentGameplayState(
    input: FixedInputV1,
  ): Omit<FixedInputV1, "ticks"> {
    if (isNil(this.gameplayState.possessionForController(
      this.options.fixedInputControllerEntityId,
    ))) {
      return Object.freeze({
        actions: Object.freeze(input.actions.filter((action) =>
          UNBOUND_CAMERA_INPUT_ACTIONS.has(action)
        )),
      });
    }
    if (!this.gameplayState.isMovementInputBlocked(
      this.options.fixedInputControllerEntityId,
    )) {
      return Object.freeze({
        actions: input.actions,
        ...(!isNil(input.axes) ? { axes: input.axes } : {}),
      });
    }
    return Object.freeze({
      actions: Object.freeze(input.actions.filter((action) =>
        !MOVEMENT_INPUT_ACTIONS.has(action)
      )),
    });
  }

  private async runOneFixedInputTick(
    input: Readonly<Omit<FixedInputV1, "ticks"> & { ticks: 1 }>,
  ): Promise<void> {
    const currentInspection = this.currentPublication.gameplayInspection;
    const currentTick = this.currentPublication.worldState.simulationTick;
    const nextTick = currentTick + 1;
    if (!Number.isSafeInteger(nextTick)) {
      throw new Error("GAMEPLAY_CAPACITY_EXCEEDED: Simulation Tick is exhausted.");
    }

    const activeTerminalEventCountBeforeEstimate = Object.keys(
      currentInspection.activeActionStatesById,
    ).length;
    if (
      this.commandJournal.snapshot().retainedEventCount +
          activeTerminalEventCountBeforeEstimate + 1 >
        this.options.gameplayCapacityBudget.maximumRetainedEventCount
    ) {
      throw new Error(
        "GAMEPLAY_CAPACITY_EXCEEDED: Fixed input cannot preserve failure evidence.",
      );
    }
    const failureReservation = this.commandJournal.reserveEventCapacity({
      eventCount: 1,
    });
    if (failureReservation.status !== "reserved") {
      throw new Error(
        "GAMEPLAY_CAPACITY_EXCEEDED: Gameplay Event capacity is exhausted.",
      );
    }
    const failureBundle = this.buildWorldFailureBundle(diagnostic(
      "ADAPTER_FIXED_INPUT_FAILED",
      "The Runtime Adapter could not advance the fixed simulation Tick.",
    ));
    const preparedEarlyFailure = failureReservation.reservation.prepare([
      failureBundle.event,
    ]);

    let estimate;
    try {
      estimate = parseGameplayFixedInputCapacityEstimateV1(
        this.options.worldPort.estimateFixedInputTickCapacity(input),
      );
    } catch {
      preparedEarlyFailure.commitPrepared();
      this.phaseValue = "failed";
      this.currentPublication = failureBundle.publication;
      await this.cleanupResources();
      return;
    }
    failureReservation.reservation.release();

    if (
      estimate.maximumSemanticFactCountAfterInput >
        this.options.gameplayCapacityBudget.maximumSemanticFactCount ||
      estimate.maximumSemanticFactTransitionEventCount >
        this.options.gameplayCapacityBudget
          .maximumSemanticFactTransitionCountPerTick
    ) {
      throw new Error(
        "GAMEPLAY_CAPACITY_EXCEEDED: Fixed input cannot be admitted within the Gameplay budget.",
      );
    }

    const completionPlan = this.gameplayState.planDueActionCompletions(nextTick);
    const completionEventCount = isNil(completionPlan)
      ? 0
      : completionPlan.capacityDelta.immediateEventCount;
    const activeTerminalEventCount = Object.keys(
      currentInspection.activeActionStatesById,
    ).length;
    const retainedEventCount = this.commandJournal.snapshot().retainedEventCount;
    if (
      retainedEventCount + activeTerminalEventCount + Math.max(
        1,
        estimate.maximumSemanticFactTransitionEventCount,
      ) > this.options.gameplayCapacityBudget.maximumRetainedEventCount
    ) {
      throw new Error(
        "GAMEPLAY_CAPACITY_EXCEEDED: Fixed input cannot preserve terminal Event evidence.",
      );
    }

    const reservedEventCount = Math.max(
      1,
      estimate.maximumSemanticFactTransitionEventCount + completionEventCount,
    );
    const eventReservation = this.commandJournal.reserveEventCapacity({
      eventCount: reservedEventCount,
    });
    if (eventReservation.status !== "reserved") {
      throw new Error(
        "GAMEPLAY_CAPACITY_EXCEEDED: Gameplay Event capacity is exhausted.",
      );
    }
    const failure = this.buildWorldFailureBundle(diagnostic(
      "ADAPTER_FIXED_INPUT_FAILED",
      "The Runtime Adapter could not publish the fixed simulation Tick.",
    ));
    const preparedFailure = eventReservation.reservation.prepare([failure.event]);

    let projectionAfter: GameplayWorldStateProjectionV1;
    try {
      projectionAfter = parseGameplayWorldStateProjectionV1(
        await this.options.worldPort.runFixedInputTick(input),
        { controllerEntityIds: this.options.controllerEntityIds },
      );
      if (projectionAfter.simulationTick !== nextTick) {
        throw new Error("FIXED_INPUT_TICK_MISMATCH");
      }

      const factEvents = semanticFactEvents(
        this.runtimeSessionId,
        this.worldSessionId,
        nextTick,
        currentInspection.lastEventSequence,
        this.publishedWorldProjection.semanticFactsById,
        projectionAfter.semanticFactsById,
      );
      if (
        Object.keys(projectionAfter.semanticFactsById).length >
          estimate.maximumSemanticFactCountAfterInput ||
        factEvents.length >
          estimate.maximumSemanticFactTransitionEventCount ||
        factEvents.length >
          this.options.gameplayCapacityBudget
            .maximumSemanticFactTransitionCountPerTick
      ) throw new Error("FIXED_INPUT_CAPACITY_ESTIMATE_BREACHED");

      const completionEvents = isNil(completionPlan)
        ? []
        : transitionEvents(
            this.runtimeSessionId,
            this.worldSessionId,
            nextTick,
            currentInspection.lastEventSequence + factEvents.length,
            completionPlan,
          );
      const events = Object.freeze([...factEvents, ...completionEvents]);
      const lastEventSequence = events.length === 0
        ? currentInspection.lastEventSequence
        : events[events.length - 1]!.sequence;
      const context = {
        simulationTick: nextTick,
        worldPackageRef: this.options.worldPackageRef,
        worldPackageRootHash: this.options.worldPackageRootHash,
        executionPlanHash: this.options.executionPlanHash,
        spatialEntityStatesById: projectionAfter.spatialEntityStatesById,
        capabilityStatesById: projectionAfter.capabilityStatesById,
        semanticFactsById: projectionAfter.semanticFactsById,
        lastEventSequence,
      } as const;
      const worldState = isNil(completionPlan)
        ? this.gameplayState.projectWorldState(context)
        : this.gameplayState.projectWorldStateAfter(completionPlan, context);
      const nextEpoch = this.currentPublication.publicationEpoch + 1;
      const inspectionContext = {
        id: `gameplay-inspection:${this.worldSessionId}:${nextEpoch}`,
        gameplayModeRef: this.gameplayMode.gameplayModeRef,
        phase: "ready" as const,
        simulationTick: nextTick,
        activatedGameplayFeatureRefs: this.activeFeatures.activeFeatureRefs,
        lastEventSequence,
      };
      const inspection = isNil(completionPlan)
        ? this.gameplayState.projectGameplayInspection(inspectionContext)
        : this.gameplayState.projectGameplayInspectionAfter(
            completionPlan,
            inspectionContext,
          );
      const nextPublication = publication(
        nextEpoch,
        worldState,
        inspection,
        this.currentPublication.viewState,
      );
      const preparedEvents = eventReservation.reservation.prepare(events);

      if (!isNil(completionPlan)) this.gameplayState.commit(completionPlan);
      preparedEvents.commitPrepared();
      this.publishedWorldProjection = projectionAfter;
      this.currentPublication = nextPublication;
    } catch {
      preparedFailure.commitPrepared();
      this.phaseValue = "failed";
      this.currentPublication = failure.publication;
      await this.cleanupResources();
    }
  }

  private buildWorldFailureBundle(
    failureDiagnostic: GameplayDiagnosticV1,
  ): Readonly<{
    event: GameplayEventV1;
    publication: WorldSessionPublicationV1;
  }> {
    const simulationTick = this.currentPublication.worldState.simulationTick;
    const sequence =
      this.currentPublication.gameplayInspection.lastEventSequence + 1;
    const event = worldFailedEvent(
      this.runtimeSessionId,
      this.worldSessionId,
      simulationTick,
      sequence,
      failureDiagnostic,
    );
    const worldState = this.gameplayState.projectWorldState({
      simulationTick,
      worldPackageRef: this.options.worldPackageRef,
      worldPackageRootHash: this.options.worldPackageRootHash,
      executionPlanHash: this.options.executionPlanHash,
      spatialEntityStatesById:
        this.publishedWorldProjection.spatialEntityStatesById,
      capabilityStatesById: this.publishedWorldProjection.capabilityStatesById,
      semanticFactsById: this.publishedWorldProjection.semanticFactsById,
      lastEventSequence: sequence,
    });
    const nextEpoch = this.currentPublication.publicationEpoch + 1;
    const gameplayInspection = this.gameplayState.projectGameplayInspection({
      id: `gameplay-inspection:${this.worldSessionId}:${nextEpoch}`,
      gameplayModeRef: this.gameplayMode.gameplayModeRef,
      phase: "failed",
      diagnostic: failureDiagnostic,
      simulationTick,
      activatedGameplayFeatureRefs: this.activeFeatures.activeFeatureRefs,
      lastEventSequence: sequence,
    });
    return Object.freeze({
      event,
      publication: publication(
        nextEpoch,
        worldState,
        gameplayInspection,
        this.currentPublication.viewState,
      ),
    });
  }

  private buildFailureBundle(
    command: GameplayCommandV1,
    failureDiagnostic: GameplayDiagnosticV1,
  ): Readonly<{
    event: GameplayEventV1;
    receipt: GameplayCommandReceiptV1;
    publication: WorldSessionPublicationV1;
  }> {
    const failure = this.buildWorldFailureBundle(failureDiagnostic);
    const simulationTick = failure.publication.worldState.simulationTick;
    return Object.freeze({
      event: failure.event,
      receipt: receipt(command, simulationTick, {
        status: "failed",
        events: [failure.event],
        diagnostic: failureDiagnostic,
      }),
      publication: failure.publication,
    });
  }

  private async commitFailedCommand(
    command: GameplayCommandV1,
    commandHash: Sha256HashV1,
    reservation: CommandJournalCapacityReservationV1,
    failureDiagnostic: GameplayDiagnosticV1,
  ): Promise<GameplayCommandReceiptV1> {
    const failureBundle = this.buildFailureBundle(command, failureDiagnostic);
    const prepared = reservation.prepare({
      command,
      commandHash,
      receipt: failureBundle.receipt,
      events: [failureBundle.event],
    });
    this.phaseValue = "failed";
    prepared.commitPrepared();
    this.currentPublication = failureBundle.publication;
    await this.cleanupResources();
    return prepared.receipt;
  }

  private cleanupResources(): Promise<readonly unknown[]> {
    if (!isNil(this.resourceCleanupPromise)) return this.resourceCleanupPromise;
    this.resourceCleanupPromise = (async () => {
      const errors: unknown[] = [];
      try {
        await this.options.worldPort.dispose();
      } catch (error) {
        errors.push(error);
      }
      try {
        await this.activeFeatures.dispose();
      } catch (error) {
        errors.push(error);
      }
      return Object.freeze(errors);
    })();
    return this.resourceCleanupPromise;
  }

  private availabilityDiagnostic(
    command: GameplayCommandV1,
  ): GameplayDiagnosticV1 | undefined {
    if (command.type === "control.bind") {
      if (!this.options.worldPort.hasEntity(command.controlledEntityId)) {
        return diagnostic(
          "CONTROLLED_ENTITY_NOT_FOUND",
          "The controlled Entity does not exist in the active World.",
        );
      }
      if (!this.options.worldPort.isEntityControllable(command.controlledEntityId)) {
        return diagnostic(
          "CONTROLLED_ENTITY_NOT_CONTROLLABLE",
          "The controlled Entity is not controllable.",
        );
      }
    }
    if (
      command.type === "action.activate" &&
      !this.options.worldPort.isActionAvailable(
        command.actorEntityId,
        command.semanticActionRef,
      )
    ) {
      return diagnostic(
        "ACTION_NOT_AVAILABLE_FOR_ACTOR",
        "The Semantic Action is not available for the actor.",
      );
    }
    return undefined;
  }

  private retainRejected(
    command: GameplayCommandV1,
    simulationTick: number,
    rejection: GameplayDiagnosticV1,
  ): GameplayCommandReceiptV1 {
    const commandHash = deriveGameplayCommandHashV1(command);
    const reservation = this.commandJournal.reserveCapacity({
      simulationTick,
      idempotencyRecordCount: 1,
      receiptCount: 1,
      eventCount: 0,
    });
    const rejectedReceipt = receipt(command, simulationTick, {
      status: "rejected",
      events: [],
      diagnostic: rejection,
    });
    if (reservation.status === "command-admission-closed") {
      return this.commandAdmissionClosedReceipt(
        command,
        reservation.commandAdmissionClosedSimulationTick,
      );
    }
    if (reservation.status !== "reserved") return rejectedReceipt;
    return reservation.reservation.prepare({
      command,
      commandHash,
      receipt: rejectedReceipt,
      events: [],
    }).commitPrepared();
  }

  private commandAdmissionClosedReceipt(
    command: GameplayCommandV1,
    simulationTick: number,
  ): GameplayCommandReceiptV1 {
    return receipt(command, simulationTick, {
      status: "rejected",
      events: [],
      diagnostic: diagnostic(
        "GAMEPLAY_CAPACITY_EXCEEDED",
        "Gameplay command retention capacity is exhausted.",
      ),
    });
  }

  private enqueueMutation<Value>(operation: () => Promise<Value>): Promise<Value> {
    const result = this.mutationTail.then(operation, operation);
    this.mutationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
