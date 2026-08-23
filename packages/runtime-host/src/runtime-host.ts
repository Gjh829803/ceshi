import {
  parseGameplayBootstrapV1,
  parseGameplayCapacityBudgetV1,
  parseGameplayCommandV1,
  parseGameplayDiagnosticV1,
  type ControllerEntityStateV1,
  type GameplayBootstrapV1,
  type GameplayCapacityBudgetV1,
  type GameplayCommandReceiptV1,
  type GameplayDiagnosticV1,
  type GameplayDiagnosticCodeV1,
  type GameplayEventV1,
  type GameplayParticipantStateV1,
  type Sha256HashV1,
  type WorldStateSnapshotV1,
} from "@whitebox-world/gameplay-contracts";
import type {
  GameplayActionRequestResolverV1,
  GameplayFeatureFactoryV1,
  GameplayModeV1,
} from "@whitebox-world/gameplay";
import { sha256CanonicalJson } from "@whitebox-world/protocol";
import type { ExecutionPlanV5 } from "@whitebox-world/runtime-contracts";
import {
  assertWorldPackageAccessorFreeDataGraphV1,
  assertWorldPackageBuildReceiptV1,
  type WorldPackageBuildReceiptV1,
} from "@whitebox-world/world-package";
import { isNil } from "lodash-es";

import type { GameplayWorldPortV1 } from "./gameplay-world-port";
import {
  WorldSession,
  type WorldSessionPublicationV1,
} from "./world-session";

export type RuntimeActivityKindV1 =
  | "runtime-run"
  | "simulation-take"
  | "control-capture";

export interface RuntimeActivityRequestV1 {
  readonly kind: RuntimeActivityKindV1;
  readonly requestId: string;
  readonly payloadHash: Sha256HashV1;
}

export type RuntimeActivityStatusV1 =
  | "active"
  | "released"
  | "terminated-by-host";

export interface RuntimeActivityRecordV1 extends RuntimeActivityRequestV1 {
  readonly boundWorldSessionId: string;
  readonly runtimeActivityEpoch: number;
  readonly status: RuntimeActivityStatusV1;
}

export interface RuntimeActivityLeaseV1 extends RuntimeActivityRequestV1 {
  readonly boundWorldSessionId: string;
  readonly runtimeActivityEpoch: number;
  readonly cancellationSignal: AbortSignal;
  registerCleanup(cleanup: PromiseLike<void>): void;
  release(): RuntimeActivityRecordV1;
}

export type RuntimeActivityAcquireResultV1 =
  | Readonly<{
      status: "active";
      lease: RuntimeActivityLeaseV1;
    }>
  | Readonly<{
      status: "rejected";
      diagnostic: GameplayDiagnosticV1;
    }>;

export interface RuntimeActivityCoordinatorSnapshotV1 {
  readonly runtimeActivityEpoch: number;
  readonly activeRuntimeActivityCount: number;
  readonly retainedRuntimeActivityRecordCount: number;
}

interface RetainedRuntimeActivityV1 {
  readonly request: RuntimeActivityRequestV1;
  readonly boundWorldSessionId: string;
  readonly acquiredEpoch: number;
  readonly lease: RuntimeActivityLeaseV1;
  readonly acquisition: Extract<
    RuntimeActivityAcquireResultV1,
    { status: "active" }
  >;
  readonly cancellationController: AbortController;
  readonly settlementPromise: Promise<void>;
  readonly resolveSettlement: () => void;
  readonly rejectSettlement: (reason: unknown) => void;
  cleanupRegistered: boolean;
  settlementCompleted: boolean;
  status: RuntimeActivityStatusV1;
}

const RUNTIME_ACTIVITY_KINDS = new Set<RuntimeActivityKindV1>([
  "runtime-run",
  "simulation-take",
  "control-capture",
]);

function diagnostic(
  code: GameplayDiagnosticV1["code"],
  message: string,
): GameplayDiagnosticV1 {
  return Object.freeze({ code, message });
}

function rejected(
  code: GameplayDiagnosticV1["code"],
  message: string,
): RuntimeActivityAcquireResultV1 {
  return Object.freeze({
    status: "rejected",
    diagnostic: diagnostic(code, message),
  });
}

function snapshotDataRecord(input: unknown): Record<string, unknown> | undefined {
  if (typeof input !== "object" || isNil(input)) return undefined;
  try {
    if (Reflect.getPrototypeOf(input) !== Object.prototype) return undefined;
    const snapshot: Record<string, unknown> = {};
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

function hasExactKeys(
  record: Readonly<Record<string, unknown>>,
  expectedKeys: readonly string[],
): boolean {
  const actualKeys = Object.keys(record);
  return actualKeys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.hasOwn(record, key));
}

function isNonEmptyString(input: unknown): input is string {
  return typeof input === "string" && input.length > 0;
}

function isSha256Hash(input: unknown): input is Sha256HashV1 {
  return typeof input === "string" && /^sha256:[0-9a-f]{64}$/.test(input);
}

function parseRuntimeActivityRequestV1(
  input: unknown,
): RuntimeActivityRequestV1 | undefined {
  const record = snapshotDataRecord(input);
  if (
    isNil(record) ||
    !hasExactKeys(record, ["kind", "requestId", "payloadHash"]) ||
    !RUNTIME_ACTIVITY_KINDS.has(record.kind as RuntimeActivityKindV1) ||
    !isNonEmptyString(record.requestId) ||
    !isSha256Hash(record.payloadHash)
  ) return undefined;
  return Object.freeze({
    kind: record.kind as RuntimeActivityKindV1,
    requestId: record.requestId,
    payloadHash: record.payloadHash,
  });
}

function sameRequest(
  left: RuntimeActivityRequestV1,
  right: RuntimeActivityRequestV1,
): boolean {
  return left.kind === right.kind &&
    left.requestId === right.requestId &&
    left.payloadHash === right.payloadHash;
}

function toRecord(retained: RetainedRuntimeActivityV1): RuntimeActivityRecordV1 {
  return Object.freeze({
    ...retained.request,
    boundWorldSessionId: retained.boundWorldSessionId,
    runtimeActivityEpoch: retained.acquiredEpoch,
    status: retained.status,
  });
}

function parseRuntimeActivityCoordinatorOptions(
  input: unknown,
): Readonly<{ maximumRuntimeActivityRecordCount: number }> {
  const record = snapshotDataRecord(input);
  if (
    isNil(record) ||
    !hasExactKeys(record, ["maximumRuntimeActivityRecordCount"]) ||
    !Number.isSafeInteger(record.maximumRuntimeActivityRecordCount) ||
    (record.maximumRuntimeActivityRecordCount as number) <= 0
  ) {
    throw new RangeError(
      "maximumRuntimeActivityRecordCount must be a positive safe integer in an exact data object.",
    );
  }
  return Object.freeze({
    maximumRuntimeActivityRecordCount:
      record.maximumRuntimeActivityRecordCount as number,
  });
}

export class RuntimeActivityCoordinator {
  private readonly maximumRuntimeActivityRecordCount: number;
  private readonly retainedByRequestId = new Map<string, RetainedRuntimeActivityV1>();
  private runtimeActivityEpoch = 0;
  private activeRuntimeActivityCount = 0;

  constructor(optionsInput: unknown) {
    const options = parseRuntimeActivityCoordinatorOptions(optionsInput);
    this.maximumRuntimeActivityRecordCount =
      options.maximumRuntimeActivityRecordCount;
  }

  acquire(
    input: unknown,
    boundWorldSessionId: string,
  ): RuntimeActivityAcquireResultV1 {
    const request = parseRuntimeActivityRequestV1(input);
    if (isNil(request) || !isNonEmptyString(boundWorldSessionId)) {
      return rejected("INPUT_INVALID", "The Runtime Activity request is invalid.");
    }

    const retained = this.retainedByRequestId.get(request.requestId);
    if (!isNil(retained)) {
      if (
        !sameRequest(retained.request, request) ||
        retained.boundWorldSessionId !== boundWorldSessionId
      ) {
        return rejected(
          "RUNTIME_ACTIVITY_ID_CONFLICT",
          `Runtime Activity request '${request.requestId}' conflicts with a retained request.`,
        );
      }
      if (retained.status !== "active") {
        return rejected(
          "RUNTIME_ACTIVITY_NOT_ACTIVE",
          `Runtime Activity request '${request.requestId}' is already terminal.`,
        );
      }
      return retained.acquisition;
    }

    if (
      this.retainedByRequestId.size >= this.maximumRuntimeActivityRecordCount
    ) {
      return rejected(
        "RUNTIME_HOST_CAPACITY_EXCEEDED",
        "The Runtime Host retained Activity record capacity is exhausted.",
      );
    }

    this.runtimeActivityEpoch += 1;
    this.activeRuntimeActivityCount += 1;
    let retainedActivity: RetainedRuntimeActivityV1;
    const cancellationController = new AbortController();
    let resolveSettlement!: () => void;
    let rejectSettlement!: (reason: unknown) => void;
    const settlementPromise = new Promise<void>((resolve, reject) => {
      resolveSettlement = resolve;
      rejectSettlement = reject;
    });
    void settlementPromise.catch(() => undefined);
    const lease = Object.freeze({
      ...request,
      boundWorldSessionId,
      runtimeActivityEpoch: this.runtimeActivityEpoch,
      cancellationSignal: cancellationController.signal,
      registerCleanup: (cleanup: PromiseLike<void>): void =>
        this.registerCleanup(retainedActivity, cleanup),
      release: (): RuntimeActivityRecordV1 => this.release(retainedActivity),
    });
    const acquisition = Object.freeze({
      status: "active" as const,
      lease,
    });
    retainedActivity = {
      request,
      boundWorldSessionId,
      acquiredEpoch: this.runtimeActivityEpoch,
      lease,
      acquisition,
      cancellationController,
      settlementPromise,
      resolveSettlement,
      rejectSettlement,
      cleanupRegistered: false,
      settlementCompleted: false,
      status: "active" as const,
    };
    this.retainedByRequestId.set(request.requestId, retainedActivity);
    return acquisition;
  }

  terminateAll(): readonly RuntimeActivityRecordV1[] {
    const active = this.terminateActive();
    if (active.length === 0) return Object.freeze([]);
    return Object.freeze(active.map(toRecord));
  }

  terminateAllForHostDisposal(): Promise<void> {
    const active = this.terminateActive();
    const unsettled = [...this.retainedByRequestId.values()].filter(
      (retained) =>
        retained.status === "terminated-by-host" &&
        !retained.settlementCompleted,
    );
    if (active.length === 0 && unsettled.length === 0) {
      return Promise.resolve();
    }
    return Promise.all(unsettled.map(({ settlementPromise }) => settlementPromise))
      .then(() => undefined);
  }

  snapshot(): RuntimeActivityCoordinatorSnapshotV1 {
    return Object.freeze({
      runtimeActivityEpoch: this.runtimeActivityEpoch,
      activeRuntimeActivityCount: this.activeRuntimeActivityCount,
      retainedRuntimeActivityRecordCount: this.retainedByRequestId.size,
    });
  }

  private release(retained: RetainedRuntimeActivityV1): RuntimeActivityRecordV1 {
    if (retained.status !== "active") {
      if (
        retained.status === "terminated-by-host" &&
        !retained.cleanupRegistered
      ) this.completeSettlement(retained);
      return toRecord(retained);
    }
    retained.status = "released";
    this.activeRuntimeActivityCount -= 1;
    this.runtimeActivityEpoch += 1;
    if (!retained.cleanupRegistered) this.completeSettlement(retained);
    return toRecord(retained);
  }

  private registerCleanup(
    retained: RetainedRuntimeActivityV1,
    cleanup: PromiseLike<void>,
  ): void {
    if (retained.cleanupRegistered || retained.status === "released") {
      throw new Error(
        "RUNTIME_ACTIVITY_ID_CONFLICT: Runtime Activity cleanup is already registered.",
      );
    }
    retained.cleanupRegistered = true;
    void Promise.resolve(cleanup).then(
      () => this.completeSettlement(retained),
      (reason) => this.completeSettlement(retained, reason),
    );
  }

  private terminateActive(): readonly RetainedRuntimeActivityV1[] {
    const active = [...this.retainedByRequestId.values()].filter(
      (retained) => retained.status === "active",
    );
    if (active.length === 0) return Object.freeze([]);
    this.runtimeActivityEpoch += 1;
    this.activeRuntimeActivityCount = 0;
    for (const retained of active) {
      retained.status = "terminated-by-host";
      retained.cancellationController.abort();
    }
    return Object.freeze(active);
  }

  private completeSettlement(
    retained: RetainedRuntimeActivityV1,
    failure?: unknown,
  ): void {
    if (retained.settlementCompleted) return;
    retained.settlementCompleted = true;
    if (isNil(failure)) retained.resolveSettlement();
    else retained.rejectSettlement(failure);
  }
}

export interface RuntimeWorldConfigurationV1 {
  readonly executionPlan: ExecutionPlanV5;
  readonly executionPlanHash: Sha256HashV1;
  readonly worldPackageRef: string;
  readonly worldPackageBuildReceipt: WorldPackageBuildReceiptV1;
  readonly gameplayBootstrap: GameplayBootstrapV1;
}

export interface RuntimeHostCapacityBudgetV1 {
  readonly maximumWorldSessionCount: number;
  readonly maximumRuntimeActivityRecordCount: number;
}

export interface RuntimeWorldAdapterDescriptorV1 {
  readonly runtimeSessionId: string;
  readonly worldSessionId: string;
  readonly executionPlan: ExecutionPlanV5;
  readonly executionPlanHash: Sha256HashV1;
}

export type ConcurrentResidencyPreflightResultV1 =
  | Readonly<{ status: "accepted" }>
  | Readonly<{
      status: "rejected";
      diagnostic: GameplayDiagnosticV1;
    }>;

export interface GameplayWorldAdapterFactoryV1 {
  preflightConcurrentResidency(
    current: RuntimeWorldAdapterDescriptorV1,
    candidate: RuntimeWorldAdapterDescriptorV1,
  ): ConcurrentResidencyPreflightResultV1;
  create(candidate: RuntimeWorldAdapterDescriptorV1): Promise<GameplayWorldPortV1>;
}

export interface RuntimeHostCreateOptionsV1 {
  readonly runtimeSessionId: string;
  readonly initialWorld: RuntimeWorldConfigurationV1;
  readonly participantStates: readonly GameplayParticipantStateV1[];
  readonly controllerStates: readonly ControllerEntityStateV1[];
  readonly fixedInputControllerEntityId: string;
  readonly gameplayModeFactory: () => GameplayModeV1;
  readonly gameplayFeatureFactories: readonly GameplayFeatureFactoryV1[];
  readonly gameplayActionRequestResolver?: GameplayActionRequestResolverV1;
  readonly gameplayCapacityBudget: GameplayCapacityBudgetV1;
  readonly runtimeHostCapacityBudget: RuntimeHostCapacityBudgetV1;
  readonly adapterFactory: GameplayWorldAdapterFactoryV1;
  readonly worldSessionIdFactory: () => string;
}

export interface RuntimeWorldReplacementRequestV1 {
  readonly worldConfiguration: RuntimeWorldConfigurationV1;
}

export type RuntimeHostPhaseV1 =
  | "ready"
  | "replacing"
  | "failed"
  | "disposed";

interface ParsedRuntimeHostCreateOptionsV1 extends RuntimeHostCreateOptionsV1 {
  readonly adapterFactory: GameplayWorldAdapterFactoryV1;
}

interface ReplacementTokenV1 {
  readonly id: number;
  readonly candidateWorldSessionId: string;
  readonly previousWorldSession: WorldSession;
  readonly previousConfiguration: RuntimeWorldConfigurationV1;
  readonly worldSessionGeneration: number;
  readonly runtimeActivityEpoch: number;
  readonly candidateConfiguration: RuntimeWorldConfigurationV1;
}

class RuntimeHostOperationErrorV1 extends Error {
  readonly diagnostic: GameplayDiagnosticV1;

  constructor(code: GameplayDiagnosticCodeV1, message: string) {
    super(`${code}: ${message}`);
    this.name = "RuntimeHostOperationErrorV1";
    this.diagnostic = diagnostic(code, message);
  }
}

function hostFailure(
  code: GameplayDiagnosticCodeV1,
  message: string,
): RuntimeHostOperationErrorV1 {
  return new RuntimeHostOperationErrorV1(code, message);
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
    const values: unknown[] = [];
    for (let index = 0; index < input.length; index += 1) {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, String(index));
      if (
        isNil(descriptor) ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) return undefined;
      values.push(descriptor.value);
    }
    return values;
  } catch {
    return undefined;
  }
}

function deepFreezeData<Value>(value: Value): Value {
  if (typeof value !== "object" || isNil(value) || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreezeData(child);
  }
  return Object.freeze(value);
}

function cloneCanonicalData<Value>(input: Value, schemaName: string): Value {
  try {
    assertWorldPackageAccessorFreeDataGraphV1(
      input,
      `${schemaName.toUpperCase()}_ACCESSOR_FORBIDDEN`,
    );
    return deepFreezeData(structuredClone(input));
  } catch {
    throw new RangeError(`Value must match the closed ${schemaName} schema.`);
  }
}

function parseRuntimeWorldConfiguration(
  input: unknown,
): RuntimeWorldConfigurationV1 {
  const record = snapshotDataRecord(input);
  if (
    isNil(record) ||
    !hasExactKeys(record, [
      "executionPlan",
      "executionPlanHash",
      "worldPackageRef",
      "worldPackageBuildReceipt",
      "gameplayBootstrap",
    ]) ||
    !isSha256Hash(record.executionPlanHash) ||
    !isNonEmptyString(record.worldPackageRef)
  ) {
    throw new RangeError(
      "Value must match the closed RuntimeWorldConfigurationV1 schema.",
    );
  }
  const executionPlan = cloneCanonicalData(
    record.executionPlan,
    "ExecutionPlanV5",
  ) as ExecutionPlanV5;
  if (
    executionPlan.kind !== "worldkit-execution-plan" ||
    executionPlan.schemaVersion !== 5 ||
    sha256CanonicalJson(executionPlan) !== record.executionPlanHash
  ) {
    throw new RangeError(
      "Value must match the closed RuntimeWorldConfigurationV1 schema.",
    );
  }
  let worldPackageBuildReceipt: WorldPackageBuildReceiptV1;
  let gameplayBootstrap: GameplayBootstrapV1;
  try {
    worldPackageBuildReceipt = assertWorldPackageBuildReceiptV1(
      record.worldPackageBuildReceipt,
    );
    gameplayBootstrap = parseGameplayBootstrapV1(record.gameplayBootstrap);
  } catch {
    throw new RangeError(
      "Value must match the closed RuntimeWorldConfigurationV1 schema.",
    );
  }
  if (
    worldPackageBuildReceipt.manifest.executionPlanHash !==
      record.executionPlanHash
  ) {
    throw new RangeError(
      "Value must match the closed RuntimeWorldConfigurationV1 schema.",
    );
  }
  return Object.freeze({
    executionPlan,
    executionPlanHash: record.executionPlanHash,
    worldPackageRef: record.worldPackageRef,
    worldPackageBuildReceipt,
    gameplayBootstrap,
  });
}

function parseRuntimeHostCapacityBudget(
  input: unknown,
): RuntimeHostCapacityBudgetV1 {
  const record = snapshotDataRecord(input);
  if (
    isNil(record) ||
    !hasExactKeys(record, [
      "maximumWorldSessionCount",
      "maximumRuntimeActivityRecordCount",
    ]) ||
    !Number.isSafeInteger(record.maximumWorldSessionCount) ||
    (record.maximumWorldSessionCount as number) <= 0 ||
    !Number.isSafeInteger(record.maximumRuntimeActivityRecordCount) ||
    (record.maximumRuntimeActivityRecordCount as number) <= 0
  ) {
    throw new RangeError(
      "Value must match the closed RuntimeHostCapacityBudgetV1 schema.",
    );
  }
  return Object.freeze({
    maximumWorldSessionCount: record.maximumWorldSessionCount as number,
    maximumRuntimeActivityRecordCount:
      record.maximumRuntimeActivityRecordCount as number,
  });
}

function parseRuntimeIdentityBootstrap(
  participantInput: unknown,
  controllerInput: unknown,
  fixedInputControllerEntityId: string,
  capacityBudget: GameplayCapacityBudgetV1,
): Readonly<{
  participantStates: readonly GameplayParticipantStateV1[];
  controllerStates: readonly ControllerEntityStateV1[];
}> {
  const participantInputs = snapshotDataArray(participantInput);
  const controllerInputs = snapshotDataArray(controllerInput);
  if (isNil(participantInputs) || isNil(controllerInputs)) {
    throw new RangeError(
      "Value must match the closed RuntimeHostCreateOptionsV1 schema.",
    );
  }
  if (
    participantInputs.length > capacityBudget.maximumParticipantCount ||
    controllerInputs.length > capacityBudget.maximumControllerEntityCount
  ) {
    throw new RangeError(
      "Value must match the closed RuntimeHostCreateOptionsV1 schema.",
    );
  }

  const participantIds = new Set<string>();
  const participantStates = participantInputs.map((input) => {
    const record = snapshotDataRecord(input);
    if (
      isNil(record) ||
      !hasExactKeys(record, ["id", "mode"]) ||
      !isNonEmptyString(record.id) ||
      record.mode !== "active" ||
      participantIds.has(record.id)
    ) {
      throw new RangeError(
        "Value must match the closed RuntimeHostCreateOptionsV1 schema.",
      );
    }
    participantIds.add(record.id);
    return Object.freeze({ id: record.id, mode: "active" as const });
  });

  const controllerIds = new Set<string>();
  const controllerStates = controllerInputs.map((input) => {
    const record = snapshotDataRecord(input);
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
      controllerIds.has(record.id)
    ) {
      throw new RangeError(
        "Value must match the closed RuntimeHostCreateOptionsV1 schema.",
      );
    }
    controllerIds.add(record.id);
    return Object.freeze({
      id: record.id,
      kind: "controller-entity-state" as const,
      controllerDefinitionRef: record.controllerDefinitionRef,
      controllerDefinitionHash: record.controllerDefinitionHash,
      participantId: record.participantId,
      lifecycleMode:
        record.lifecycleMode as ControllerEntityStateV1["lifecycleMode"],
      inputMode: record.inputMode as ControllerEntityStateV1["inputMode"],
    });
  });
  if (!controllerStates.some(({ id, lifecycleMode }) =>
    id === fixedInputControllerEntityId && lifecycleMode === "active"
  )) {
    throw new RangeError(
      "Value must match the closed RuntimeHostCreateOptionsV1 schema.",
    );
  }
  return Object.freeze({
    participantStates: Object.freeze(participantStates),
    controllerStates: Object.freeze(controllerStates),
  });
}

function parseRuntimeHostCreateOptions(
  input: unknown,
): ParsedRuntimeHostCreateOptionsV1 {
  const record = snapshotDataRecord(input);
  const baseKeys = [
    "runtimeSessionId",
    "initialWorld",
    "participantStates",
    "controllerStates",
    "fixedInputControllerEntityId",
    "gameplayModeFactory",
    "gameplayFeatureFactories",
    "gameplayCapacityBudget",
    "runtimeHostCapacityBudget",
    "adapterFactory",
    "worldSessionIdFactory",
  ] as const;
  const hasResolver = !isNil(record) && hasExactKeys(record, [
    ...baseKeys,
    "gameplayActionRequestResolver",
  ]);
  if (
    isNil(record) ||
    (!hasExactKeys(record, baseKeys) && !hasResolver) ||
    !isNonEmptyString(record.runtimeSessionId) ||
    !isNonEmptyString(record.fixedInputControllerEntityId) ||
    typeof record.gameplayModeFactory !== "function" ||
    typeof record.worldSessionIdFactory !== "function" ||
    (hasResolver && typeof record.gameplayActionRequestResolver !== "function")
  ) throw new RangeError(
    "Value must match the closed RuntimeHostCreateOptionsV1 schema.",
  );
  const featureFactories = snapshotDataArray(record.gameplayFeatureFactories);
  const adapterFactoryRecord = snapshotDataRecord(record.adapterFactory);
  if (
    isNil(featureFactories) ||
    isNil(adapterFactoryRecord) ||
    !hasExactKeys(adapterFactoryRecord, [
      "preflightConcurrentResidency",
      "create",
    ]) ||
    typeof adapterFactoryRecord.preflightConcurrentResidency !== "function" ||
    typeof adapterFactoryRecord.create !== "function"
  ) throw new RangeError(
    "Value must match the closed RuntimeHostCreateOptionsV1 schema.",
  );
  const initialWorld = parseRuntimeWorldConfiguration(record.initialWorld);
  const gameplayCapacityBudget = parseGameplayCapacityBudgetV1(
    record.gameplayCapacityBudget,
  );
  const { participantStates, controllerStates } = parseRuntimeIdentityBootstrap(
    record.participantStates,
    record.controllerStates,
    record.fixedInputControllerEntityId,
    gameplayCapacityBudget,
  );
  const controllerIds = new Set(controllerStates.map(({ id }) => id));
  if (initialWorld.gameplayBootstrap.entityDescriptors.some(({ id }) =>
    controllerIds.has(id)
  )) {
    throw new RangeError(
      "Value must match the closed RuntimeHostCreateOptionsV1 schema.",
    );
  }
  const adapterReceiver = record.adapterFactory;
  const preflight = adapterFactoryRecord.preflightConcurrentResidency as
    GameplayWorldAdapterFactoryV1["preflightConcurrentResidency"];
  const create = adapterFactoryRecord.create as GameplayWorldAdapterFactoryV1["create"];
  const adapterFactory = Object.freeze({
    preflightConcurrentResidency: (
      current: RuntimeWorldAdapterDescriptorV1,
      candidate: RuntimeWorldAdapterDescriptorV1,
    ): ConcurrentResidencyPreflightResultV1 =>
      Reflect.apply(preflight, adapterReceiver, [current, candidate]),
    create: (candidate: RuntimeWorldAdapterDescriptorV1) =>
      Reflect.apply(create, adapterReceiver, [candidate]),
  });
  return Object.freeze({
    runtimeSessionId: record.runtimeSessionId,
    initialWorld,
    participantStates,
    controllerStates,
    fixedInputControllerEntityId: record.fixedInputControllerEntityId,
    gameplayModeFactory: record.gameplayModeFactory as () => GameplayModeV1,
    gameplayFeatureFactories: Object.freeze(
      [...featureFactories] as GameplayFeatureFactoryV1[],
    ),
    ...(hasResolver
      ? {
          gameplayActionRequestResolver:
            record.gameplayActionRequestResolver as GameplayActionRequestResolverV1,
        }
      : {}),
    gameplayCapacityBudget,
    runtimeHostCapacityBudget: parseRuntimeHostCapacityBudget(
      record.runtimeHostCapacityBudget,
    ),
    adapterFactory,
    worldSessionIdFactory: record.worldSessionIdFactory as () => string,
  });
}

function parseReplacementRequest(input: unknown): RuntimeWorldConfigurationV1 {
  const record = snapshotDataRecord(input);
  if (isNil(record) || !hasExactKeys(record, ["worldConfiguration"])) {
    throw new RangeError(
      "Value must match the closed RuntimeWorldReplacementRequestV1 schema.",
    );
  }
  return parseRuntimeWorldConfiguration(record.worldConfiguration);
}

function parsePreflightResult(
  input: unknown,
): ConcurrentResidencyPreflightResultV1 {
  const record = snapshotDataRecord(input);
  if (isNil(record)) {
    throw hostFailure(
      "WORLD_REPLACEMENT_CAPACITY_EXCEEDED",
      "The Adapter returned an invalid concurrent-residency result.",
    );
  }
  if (hasExactKeys(record, ["status"]) && record.status === "accepted") {
    return Object.freeze({ status: "accepted" });
  }
  if (
    hasExactKeys(record, ["status", "diagnostic"]) &&
    record.status === "rejected" &&
    typeof record.diagnostic === "object" &&
    !isNil(record.diagnostic)
  ) {
    const parsedDiagnostic = parseGameplayDiagnosticV1(record.diagnostic);
    if (!isNil(parsedDiagnostic)) {
      return Object.freeze({
        status: "rejected",
        diagnostic: parsedDiagnostic,
      });
    }
  }
  throw hostFailure(
    "WORLD_REPLACEMENT_CAPACITY_EXCEEDED",
    "The Adapter returned an invalid concurrent-residency result.",
  );
}

function descriptor(
  runtimeSessionId: string,
  worldSessionId: string,
  configuration: RuntimeWorldConfigurationV1,
): RuntimeWorldAdapterDescriptorV1 {
  return Object.freeze({
    runtimeSessionId,
    worldSessionId,
    executionPlan: configuration.executionPlan,
    executionPlanHash: configuration.executionPlanHash,
  });
}

export class RuntimeHost {
  readonly runtimeSessionId: string;
  private readonly options: ParsedRuntimeHostCreateOptionsV1;
  private readonly initialConfiguration: RuntimeWorldConfigurationV1;
  private readonly activityCoordinator: RuntimeActivityCoordinator;
  private readonly usedWorldSessionIds = new Set<string>();
  private currentWorldSession: WorldSession;
  private currentConfiguration: RuntimeWorldConfigurationV1;
  private phaseValue: RuntimeHostPhaseV1 = "ready";
  private mutationTail: Promise<void> = Promise.resolve();
  private worldSessionGeneration = 0;
  private nextReplacementTokenId = 0;
  private replacementToken: ReplacementTokenV1 | undefined;
  private replacementCommitPending = false;
  private replacementOperationPromise: Promise<WorldSessionPublicationV1> | undefined;
  private disposeRequested = false;
  private disposePromise: Promise<void> | undefined;

  private constructor(
    options: ParsedRuntimeHostCreateOptionsV1,
    initialWorldSessionId: string,
    initialWorldSession: WorldSession,
  ) {
    this.options = options;
    this.runtimeSessionId = options.runtimeSessionId;
    this.initialConfiguration = options.initialWorld;
    this.currentConfiguration = options.initialWorld;
    this.currentWorldSession = initialWorldSession;
    this.usedWorldSessionIds.add(initialWorldSessionId);
    this.activityCoordinator = new RuntimeActivityCoordinator({
      maximumRuntimeActivityRecordCount:
        options.runtimeHostCapacityBudget.maximumRuntimeActivityRecordCount,
    });
  }

  static async create(input: unknown): Promise<RuntimeHost> {
    const options = parseRuntimeHostCreateOptions(input);
    if (options.runtimeHostCapacityBudget.maximumWorldSessionCount < 1) {
      throw hostFailure(
        "RUNTIME_HOST_CAPACITY_EXCEEDED",
        "Runtime Host cannot retain its initial WorldSession.",
      );
    }
    let worldSessionId: string;
    try {
      worldSessionId = options.worldSessionIdFactory();
    } catch {
      throw hostFailure(
        "WORLD_SESSION_ID_INVALID",
        "The WorldSession ID factory could not produce an ID.",
      );
    }
    if (!isNonEmptyString(worldSessionId)) {
      throw hostFailure(
        "WORLD_SESSION_ID_INVALID",
        "The WorldSession ID factory returned an invalid ID.",
      );
    }
    let worldPort: GameplayWorldPortV1;
    try {
      worldPort = await options.adapterFactory.create(descriptor(
        options.runtimeSessionId,
        worldSessionId,
        options.initialWorld,
      ));
    } catch {
      throw hostFailure(
        "WORLD_SESSION_FAILED",
        "The Runtime Adapter could not create the initial WorldSession.",
      );
    }
    let worldSession: WorldSession;
    try {
      worldSession = await WorldSession.create({
        runtimeSessionId: options.runtimeSessionId,
        worldSessionId,
        worldPackageRef: options.initialWorld.worldPackageRef,
        worldPackageRootHash:
          options.initialWorld.worldPackageBuildReceipt.worldPackageRootHash,
        executionPlanHash: options.initialWorld.executionPlanHash,
        gameplayBootstrap: options.initialWorld.gameplayBootstrap,
        participantStates: options.participantStates,
        controllerStates: options.controllerStates,
        fixedInputControllerEntityId: options.fixedInputControllerEntityId,
        gameplayModeFactory: options.gameplayModeFactory,
        gameplayFeatureFactories: options.gameplayFeatureFactories,
        ...(isNil(options.gameplayActionRequestResolver)
          ? {}
          : {
              gameplayActionRequestResolver:
                options.gameplayActionRequestResolver,
            }),
        gameplayCapacityBudget: options.gameplayCapacityBudget,
        worldPort,
      });
    } catch {
      throw hostFailure(
        "WORLD_SESSION_FAILED",
        "The initial WorldSession could not be constructed.",
      );
    }
    return new RuntimeHost(options, worldSessionId, worldSession);
  }

  get phase(): RuntimeHostPhaseV1 {
    return this.phaseValue;
  }

  get currentWorldSessionId(): string {
    return this.currentWorldSession.worldSessionId;
  }

  snapshot(): WorldSessionPublicationV1 {
    return this.currentWorldSession.snapshot();
  }

  executeGameplayCommand(input: unknown): Promise<GameplayCommandReceiptV1> {
    const command = parseGameplayCommandV1(input);
    return this.enqueueMutation(async () => {
      this.assertMutationAllowed();
      const receipt = await this.currentWorldSession.executeGameplayCommand(command);
      this.synchronizePhaseFromCurrent();
      return receipt;
    });
  }

  runFixedInput(input: unknown): Promise<WorldSessionPublicationV1> {
    const fixedInput = cloneCanonicalData(input, "FixedInputV1");
    return this.enqueueMutation(async () => {
      this.assertMutationAllowed();
      const result = await this.currentWorldSession.runFixedInput(fixedInput);
      this.synchronizePhaseFromCurrent();
      return result;
    });
  }

  getWorldStateSnapshot(worldStateRef: string): WorldStateSnapshotV1 | undefined {
    return this.currentWorldSession.getWorldStateSnapshot(worldStateRef);
  }

  eventsAfter(
    afterEventSequence: number,
    maximumEventCount: number,
  ): readonly GameplayEventV1[] {
    return this.currentWorldSession.eventsAfter(
      afterEventSequence,
      maximumEventCount,
    );
  }

  acquireRuntimeActivity(input: unknown): RuntimeActivityAcquireResultV1 {
    if (
      this.disposeRequested ||
      this.phaseValue === "failed" ||
      this.phaseValue === "disposed" ||
      this.replacementCommitPending
    ) {
      return rejected(
        "RUNTIME_ACTIVITY_NOT_ACTIVE",
        "The Runtime Host is not accepting Runtime Activity.",
      );
    }
    return this.activityCoordinator.acquire(input, this.currentWorldSessionId);
  }

  replaceWorld(input: unknown): Promise<WorldSessionPublicationV1> {
    const configuration = parseReplacementRequest(input);
    if (!isNil(this.replacementOperationPromise)) {
      return Promise.reject(hostFailure(
        "WORLD_SESSION_NOT_READY",
        "A World replacement is already in progress.",
      ));
    }
    const operation = this.performReplacement(configuration);
    this.replacementOperationPromise = operation;
    void operation.finally(() => {
      if (this.replacementOperationPromise === operation) {
        this.replacementOperationPromise = undefined;
      }
    }).catch(() => undefined);
    return operation;
  }

  reset(): Promise<WorldSessionPublicationV1> {
    return this.replaceWorld({ worldConfiguration: this.initialConfiguration });
  }

  dispose(): Promise<void> {
    if (!isNil(this.disposePromise)) return this.disposePromise;
    this.disposeRequested = true;
    this.disposePromise = (async () => {
      let current: WorldSession | undefined;
      let replacement: Promise<WorldSessionPublicationV1> | undefined;
      let activityCleanup: Promise<void> | undefined;
      await this.enqueueMutation(async () => {
        activityCleanup = this.activityCoordinator.terminateAllForHostDisposal();
        current = this.currentWorldSession;
        replacement = this.replacementOperationPromise;
        void current.dispose().catch(() => undefined);
      });
      const results = await Promise.allSettled([
        current!.dispose(),
        activityCleanup!,
      ]);
      let replacementFailure: unknown;
      if (!isNil(replacement)) {
        try {
          await replacement;
        } catch (error) {
          if (
            !(error instanceof RuntimeHostOperationErrorV1) ||
            (error.diagnostic.code !== "WORLD_SESSION_NOT_READY" &&
              error.diagnostic.code !==
                "WORLD_REPLACEMENT_BLOCKED_BY_ACTIVE_ACTIVITY")
          ) replacementFailure = error;
        }
      }
      await this.enqueueMutation(async () => {
        this.phaseValue = "disposed";
      });
      const failures = results.filter((result) => result.status === "rejected");
      if (!isNil(replacementFailure)) {
        failures.push({ status: "rejected", reason: replacementFailure });
      }
      if (failures.length > 0) {
        throw hostFailure(
          "WORLD_SESSION_FAILED",
          "Runtime Host cleanup did not complete cleanly.",
        );
      }
    })();
    return this.disposePromise;
  }

  private async performReplacement(
    configuration: RuntimeWorldConfigurationV1,
  ): Promise<WorldSessionPublicationV1> {
    const token = await this.enqueueMutation(async () => {
      if (this.disposeRequested || this.phaseValue === "failed" ||
        this.phaseValue === "disposed") {
        throw hostFailure(
          "WORLD_SESSION_NOT_READY",
          "Runtime Host cannot replace the active World.",
        );
      }
      if (!isNil(this.replacementToken)) {
        throw hostFailure(
          "WORLD_SESSION_NOT_READY",
          "A World replacement is already in progress.",
        );
      }
      const activity = this.activityCoordinator.snapshot();
      if (activity.activeRuntimeActivityCount > 0) {
        throw hostFailure(
          "WORLD_REPLACEMENT_BLOCKED_BY_ACTIVE_ACTIVITY",
          "Active Runtime Activity prevents World replacement.",
        );
      }
      if (
        this.usedWorldSessionIds.size >=
          this.options.runtimeHostCapacityBudget.maximumWorldSessionCount
      ) {
        throw hostFailure(
          "RUNTIME_HOST_CAPACITY_EXCEEDED",
          "Runtime Host WorldSession capacity is exhausted.",
        );
      }
      let candidateWorldSessionId: string;
      try {
        candidateWorldSessionId = this.options.worldSessionIdFactory();
      } catch {
        throw hostFailure(
          "WORLD_SESSION_ID_INVALID",
          "The WorldSession ID factory could not produce an ID.",
        );
      }
      if (
        !isNonEmptyString(candidateWorldSessionId) ||
        this.usedWorldSessionIds.has(candidateWorldSessionId)
      ) {
        throw hostFailure(
          "WORLD_SESSION_ID_INVALID",
          "The WorldSession ID factory returned an invalid or reused ID.",
        );
      }
      this.usedWorldSessionIds.add(candidateWorldSessionId);
      this.nextReplacementTokenId += 1;
      const created = Object.freeze({
        id: this.nextReplacementTokenId,
        candidateWorldSessionId,
        previousWorldSession: this.currentWorldSession,
        previousConfiguration: this.currentConfiguration,
        worldSessionGeneration: this.worldSessionGeneration,
        runtimeActivityEpoch: activity.runtimeActivityEpoch,
        candidateConfiguration: configuration,
      });
      this.replacementToken = created;
      this.phaseValue = "replacing";
      return created;
    });

    let candidate: WorldSession | undefined;
    try {
      const currentDescriptor = descriptor(
        this.runtimeSessionId,
        token.previousWorldSession.worldSessionId,
        token.previousConfiguration,
      );
      const candidateDescriptor = descriptor(
        this.runtimeSessionId,
        token.candidateWorldSessionId,
        token.candidateConfiguration,
      );
      const preflight = parsePreflightResult(
        this.options.adapterFactory.preflightConcurrentResidency(
          currentDescriptor,
          candidateDescriptor,
        ),
      );
      if (preflight.status === "rejected") {
        throw hostFailure(
          "WORLD_REPLACEMENT_CAPACITY_EXCEEDED",
          "The Runtime Adapter rejected concurrent World residency.",
        );
      }
      const port = await this.options.adapterFactory.create(candidateDescriptor);
      candidate = await WorldSession.create({
        runtimeSessionId: this.runtimeSessionId,
        worldSessionId: token.candidateWorldSessionId,
        worldPackageRef: configuration.worldPackageRef,
        worldPackageRootHash:
          configuration.worldPackageBuildReceipt.worldPackageRootHash,
        executionPlanHash: configuration.executionPlanHash,
        gameplayBootstrap: configuration.gameplayBootstrap,
        participantStates: this.options.participantStates,
        controllerStates: this.options.controllerStates,
        fixedInputControllerEntityId: this.options.fixedInputControllerEntityId,
        gameplayModeFactory: this.options.gameplayModeFactory,
        gameplayFeatureFactories: this.options.gameplayFeatureFactories,
        ...(isNil(this.options.gameplayActionRequestResolver)
          ? {}
          : {
              gameplayActionRequestResolver:
                this.options.gameplayActionRequestResolver,
            }),
        gameplayCapacityBudget: this.options.gameplayCapacityBudget,
        worldPort: port,
      });

      const swapped = await this.enqueueMutation(async () => {
        const activity = this.activityCoordinator.snapshot();
        if (
          this.disposeRequested ||
          this.replacementToken !== token ||
          this.currentWorldSession !== token.previousWorldSession ||
          this.worldSessionGeneration !== token.worldSessionGeneration ||
          this.phaseValue !== "replacing" ||
          token.previousWorldSession.phase !== "ready" ||
          activity.runtimeActivityEpoch !== token.runtimeActivityEpoch ||
          activity.activeRuntimeActivityCount !== 0
        ) return false;
        this.replacementCommitPending = true;
        try {
          this.currentWorldSession = candidate!;
          this.currentConfiguration = token.candidateConfiguration;
          this.worldSessionGeneration += 1;
        } finally {
          this.replacementCommitPending = false;
        }
        return true;
      });
      if (!swapped) {
        await candidate.dispose().catch(() => undefined);
        throw hostFailure(
          this.disposeRequested
            ? "WORLD_SESSION_NOT_READY"
            : this.phaseValue === "failed" ||
                token.previousWorldSession.phase === "failed"
            ? "WORLD_SESSION_FAILED"
            : "WORLD_REPLACEMENT_BLOCKED_BY_ACTIVE_ACTIVITY",
          "World replacement was cancelled before publication.",
        );
      }
      try {
        await token.previousWorldSession.dispose();
      } catch {
        throw hostFailure(
          "WORLD_SESSION_FAILED",
          "The replaced WorldSession could not be released cleanly.",
        );
      }
      return candidate.snapshot();
    } catch (error) {
      if (!isNil(candidate) && candidate !== this.currentWorldSession) {
        await candidate.dispose().catch(() => undefined);
      }
      if (error instanceof RuntimeHostOperationErrorV1) {
        throw error;
      }
      throw hostFailure(
        "WORLD_SESSION_FAILED",
        "The candidate WorldSession could not be constructed.",
      );
    } finally {
      await this.enqueueMutation(async () => {
        if (this.replacementToken === token) this.replacementToken = undefined;
        if (!this.disposeRequested && this.phaseValue !== "failed") {
          this.phaseValue = "ready";
        }
      });
    }
  }

  private assertMutationAllowed(): void {
    if (
      this.disposeRequested ||
      this.phaseValue === "failed" ||
      this.phaseValue === "disposed"
    ) throw hostFailure(
      "WORLD_SESSION_NOT_READY",
      "Runtime Host is not accepting mutations.",
    );
  }

  private synchronizePhaseFromCurrent(): void {
    if (this.currentWorldSession.phase === "failed") this.phaseValue = "failed";
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
