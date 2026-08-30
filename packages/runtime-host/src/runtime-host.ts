import {
  hashWorldBuildIdentityV1,
  parseWorldBuildIdentityV1,
  type WorldBuildIdentityV1,
} from "@whitebox-world/world-identity";

import type { Sha256HashV1 } from "@whitebox-world/protocol";

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
  type WorldStateSnapshotV1,
} from "@whitebox-world/gameplay-contracts";
import type {
  GameplayActionRequestResolverV1,
  GameplayFeatureFactoryV1,
  GameplayModeV1,
} from "@whitebox-world/gameplay";
import {
  hashBabylonNativeSceneBootstrapV1,
  nativeSceneModuleBundleHashFromRefV1,
  parseBabylonNativeSceneBootstrapV1,
  hashCanonicalSceneExecutionPlanV1,
  parseCanonicalSceneExecutionPlanV1,
  parseWorldRuntimeBootstrapV1,
  type BabylonNativeSceneBootstrapV1,
  type CanonicalSceneExecutionPlanV1,
  type WorldRuntimeBootstrapV1,
} from "@whitebox-world/runtime-contracts";
import {
  assertWorldPackageAccessorFreeDataGraphV1,
  type VerifiedWorldPackageDirectoryV1,
} from "@whitebox-world/world-package";
import { isNil } from "lodash-es";

import type { GameplayWorldPortV1 } from "./gameplay-world-port";
import {
  WorldSession,
  type CameraViewCommandExecutorV1,
  type CameraViewSelectionProjectionV1,
  type WorldSessionPublicationV1,
} from "./world-session";
import type { WorldSessionEventV1 } from "./command-journal";
import type { CameraViewCommandReceiptV1 } from "@whitebox-world/runtime-contracts";

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
  releaseInvoked: boolean;
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
      releaseInvoked: false,
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
    const joinable = [...this.retainedByRequestId.values()].filter(
      (retained) =>
        retained.status === "terminated-by-host" ||
        retained.cleanupRegistered,
    );
    if (active.length === 0 && joinable.length === 0) {
      return Promise.resolve();
    }
    return Promise.allSettled(
      joinable.map(({ settlementPromise }) => settlementPromise),
    ).then((results) => {
      const failures = results.filter((result) => result.status === "rejected");
      if (failures.length > 0) {
        throw new AggregateError(
          failures.map(({ reason }) => reason),
          "Runtime Activity cleanup failed.",
        );
      }
    });
  }

  snapshot(): RuntimeActivityCoordinatorSnapshotV1 {
    return Object.freeze({
      runtimeActivityEpoch: this.runtimeActivityEpoch,
      activeRuntimeActivityCount: this.activeRuntimeActivityCount,
      retainedRuntimeActivityRecordCount: this.retainedByRequestId.size,
    });
  }

  private release(retained: RetainedRuntimeActivityV1): RuntimeActivityRecordV1 {
    retained.releaseInvoked = true;
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
    if (retained.cleanupRegistered || retained.releaseInvoked) {
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
    }
    for (const retained of active) {
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

export type NativeSceneModuleBundleRefV1 =
  `package://native-scene-module/sha256/${string}`;

export type RuntimeSceneSourceV1 =
  | Readonly<{
      kind: "canonical-execution-plan";
      executionPlan: CanonicalSceneExecutionPlanV1;
      executionPlanHash: Sha256HashV1;
    }>
  | Readonly<{
      kind: "babylon-native-scene";
      bootstrap: BabylonNativeSceneBootstrapV1;
      sceneModuleBundleRef: NativeSceneModuleBundleRefV1;
    }>;

export interface RuntimeWorldConfigurationV1 {
  readonly worldBuildIdentity: WorldBuildIdentityV1;
  readonly gameplayBootstrap: GameplayBootstrapV1;
  readonly worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
  readonly sceneSource: RuntimeSceneSourceV1;
}

export interface RuntimeHostCapacityBudgetV1 {
  readonly maximumWorldSessionCount: number;
  readonly maximumRuntimeActivityRecordCount: number;
}

export interface RuntimeWorldAdapterDescriptorV1 {
  readonly runtimeSessionId: string;
  readonly worldSessionId: string;
  readonly worldBuildIdentity: WorldBuildIdentityV1;
  readonly gameplayBootstrap: GameplayBootstrapV1;
  readonly worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
  readonly sceneSource: RuntimeSceneSourceV1;
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
  awaitCandidatePublicationReady(
    input: RuntimeCandidatePublicationGateInputV1,
  ): Promise<void>;
}

export interface RuntimeCandidatePublicationGateInputV1 {
  readonly runtimeSessionId: string;
  readonly worldSessionId: string;
  readonly publication: WorldSessionPublicationV1;
}

export interface RuntimeHostCreateOptionsV1 {
  readonly runtimeSessionId: string;
  readonly initialWorld: RuntimeWorldConfigurationV1;
  readonly initialControlBinding?: RuntimeHostInitialControlBindingV1;
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

export interface RuntimeWorldPublicationExpectationV1 {
  readonly runtimeSessionId: string;
  readonly expectedWorldSessionId: string;
  readonly expectedWorldPackageRootHash: Sha256HashV1;
  readonly targetPhaseBarrier:
    | { readonly mode: "next-world-replacement-barrier" }
    | {
        readonly mode: "fixed-tick";
        readonly expectedSimulationTick: number;
      };
}

export interface RuntimeWorldPublicationEnvelopeV1 {
  readonly requestId: string;
  readonly requestHash: Sha256HashV1;
  readonly fencingToken: string;
  readonly runtimeExpectation: RuntimeWorldPublicationExpectationV1;
}

export interface RuntimeWorldPublicationIdentitiesV1 {
  readonly runtimeSessionId: string;
  readonly worldSessionId: string;
  readonly worldPackageRootHash: Sha256HashV1;
  readonly simulationTick: number;
}

export type PersistDurableWorldCommitV1 = (identities: {
  readonly previous: RuntimeWorldPublicationIdentitiesV1;
  readonly current: RuntimeWorldPublicationIdentitiesV1;
}) => () => void;

export type RuntimeWorldPublicationFailureKindV1 =
  | "expectation-stale"
  | "publication-mode-unsupported"
  | "capacity-exceeded"
  | "prepare-failed"
  | "publication-conflict"
  | "commit-failed";

export type PublishWorldReplacementResultV1 =
  | {
      readonly status: "published";
      readonly publication: WorldSessionPublicationV1;
      readonly previous: RuntimeWorldPublicationIdentitiesV1;
      readonly current: RuntimeWorldPublicationIdentitiesV1;
      readonly cleanup: {
        readonly status: "released" | "quarantined";
        readonly diagnostics: readonly GameplayDiagnosticV1[];
      };
    }
  | {
      readonly status: "rejected";
      readonly failureKind: RuntimeWorldPublicationFailureKindV1;
      readonly message: string;
    };

interface PublicationReplacementContextV1 {
  readonly expectation: RuntimeWorldPublicationExpectationV1;
  readonly persistDurableCommit?: PersistDurableWorldCommitV1;
}

interface ReplacementOutcomeV1 {
  readonly publication: WorldSessionPublicationV1;
  readonly previous: RuntimeWorldPublicationIdentitiesV1;
  readonly current: RuntimeWorldPublicationIdentitiesV1;
  readonly cleanupStatus: "released" | "quarantined";
}

interface ParsedPublishWorldReplacementV1 {
  readonly worldConfiguration: RuntimeWorldConfigurationV1;
  readonly publication: RuntimeWorldPublicationEnvelopeV1;
  readonly persistDurableCommit?: PersistDurableWorldCommitV1;
}

export interface RuntimeHostInitialControlBindingV1 {
  readonly controllerEntityId: string;
  readonly controlledEntityId: string;
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

class PublicationExpectationErrorV1 extends Error {
  readonly name = "PublicationExpectationErrorV1" as const;

  constructor() {
    super("Runtime publication expectation does not match the live Runtime.");
  }
}

class PublicationCommitErrorV1 extends Error {
  readonly name = "PublicationCommitErrorV1" as const;

  constructor(cause: unknown) {
    super(
      cause instanceof Error
        ? cause.message
        : "Durable publication commit failed.",
    );
  }
}

function isSafeNonNegativeInteger(input: unknown): input is number {
  return typeof input === "number" && Number.isSafeInteger(input) && input >= 0;
}

function publicationIdentitiesV1(
  runtimeSessionId: string,
  worldSession: WorldSession,
  configuration: RuntimeWorldConfigurationV1,
): RuntimeWorldPublicationIdentitiesV1 {
  return Object.freeze({
    runtimeSessionId,
    worldSessionId: worldSession.worldSessionId,
    worldPackageRootHash: configuration.worldBuildIdentity.worldPackageRootHash,
    simulationTick: worldSession.snapshot().worldState.simulationTick,
  });
}

function parseRuntimeWorldPublicationExpectation(
  input: unknown,
): RuntimeWorldPublicationExpectationV1 {
  const record = snapshotDataRecord(input);
  const barrier = isNil(record)
    ? undefined
    : snapshotDataRecord(record.targetPhaseBarrier);
  if (
    isNil(record) ||
    isNil(barrier) ||
    !hasExactKeys(record, [
      "runtimeSessionId",
      "expectedWorldSessionId",
      "expectedWorldPackageRootHash",
      "targetPhaseBarrier",
    ]) ||
    !isNonEmptyString(record.runtimeSessionId) ||
    !isNonEmptyString(record.expectedWorldSessionId) ||
    !isSha256Hash(record.expectedWorldPackageRootHash)
  ) {
    throw new RangeError(
      "Value must match the closed RuntimeWorldPublicationExpectationV1 schema.",
    );
  }
  if (
    barrier.mode === "next-world-replacement-barrier" &&
    hasExactKeys(barrier, ["mode"])
  ) {
    return Object.freeze({
      runtimeSessionId: record.runtimeSessionId,
      expectedWorldSessionId: record.expectedWorldSessionId,
      expectedWorldPackageRootHash: record.expectedWorldPackageRootHash,
      targetPhaseBarrier: Object.freeze({
        mode: "next-world-replacement-barrier" as const,
      }),
    });
  }
  if (
    barrier.mode === "fixed-tick" &&
    hasExactKeys(barrier, ["mode", "expectedSimulationTick"]) &&
    isSafeNonNegativeInteger(barrier.expectedSimulationTick)
  ) {
    return Object.freeze({
      runtimeSessionId: record.runtimeSessionId,
      expectedWorldSessionId: record.expectedWorldSessionId,
      expectedWorldPackageRootHash: record.expectedWorldPackageRootHash,
      targetPhaseBarrier: Object.freeze({
        mode: "fixed-tick" as const,
        expectedSimulationTick: barrier.expectedSimulationTick,
      }),
    });
  }
  throw new RangeError(
    "Value must match the closed RuntimeWorldPublicationExpectationV1 schema.",
  );
}

function parseRuntimeWorldPublicationEnvelope(
  input: unknown,
): RuntimeWorldPublicationEnvelopeV1 {
  const record = snapshotDataRecord(input);
  if (
    isNil(record) ||
    !hasExactKeys(record, [
      "requestId",
      "requestHash",
      "fencingToken",
      "runtimeExpectation",
    ]) ||
    !isNonEmptyString(record.requestId) ||
    !isSha256Hash(record.requestHash) ||
    !isNonEmptyString(record.fencingToken)
  ) {
    throw new RangeError(
      "Value must match the closed RuntimeWorldPublicationEnvelopeV1 schema.",
    );
  }
  return Object.freeze({
    requestId: record.requestId,
    requestHash: record.requestHash,
    fencingToken: record.fencingToken,
    runtimeExpectation: parseRuntimeWorldPublicationExpectation(
      record.runtimeExpectation,
    ),
  });
}

function parsePublishWorldReplacementInput(
  input: unknown,
): ParsedPublishWorldReplacementV1 {
  const record = snapshotDataRecord(input);
  const hasCommit = !isNil(record) && Object.hasOwn(record, "persistDurableCommit");
  if (
    isNil(record) ||
    (hasCommit
      ? !hasExactKeys(record, [
          "worldConfiguration",
          "publication",
          "persistDurableCommit",
        ]) || typeof record.persistDurableCommit !== "function"
      : !hasExactKeys(record, ["worldConfiguration", "publication"]))
  ) {
    throw new RangeError(
      "Value must match the closed PublishWorldReplacementInputV1 schema.",
    );
  }
  const worldConfiguration = parseRuntimeWorldConfiguration(
    record.worldConfiguration,
  );
  return Object.freeze({
    worldConfiguration,
    publication: parseRuntimeWorldPublicationEnvelope(record.publication),
    ...(hasCommit
      ? {
          persistDurableCommit: record.persistDurableCommit as
            PersistDurableWorldCommitV1,
        }
      : {}),
  });
}

function mapPublicationReplacementError(
  error: unknown,
): Extract<PublishWorldReplacementResultV1, { status: "rejected" }> {
  if (error instanceof PublicationExpectationErrorV1) {
    return {
      status: "rejected",
      failureKind: "expectation-stale",
      message: error.message,
    };
  }
  if (error instanceof PublicationCommitErrorV1) {
    return {
      status: "rejected",
      failureKind: "commit-failed",
      message: error.message,
    };
  }
  if (error instanceof RuntimeHostOperationErrorV1) {
    if (
      error.diagnostic.code === "RUNTIME_HOST_CAPACITY_EXCEEDED" ||
      error.diagnostic.code === "WORLD_REPLACEMENT_CAPACITY_EXCEEDED"
    ) {
      return {
        status: "rejected",
        failureKind: "capacity-exceeded",
        message: error.diagnostic.message,
      };
    }
    if (
      error.diagnostic.code === "WORLD_REPLACEMENT_BLOCKED_BY_ACTIVE_ACTIVITY" ||
      error.diagnostic.code === "WORLD_SESSION_NOT_READY"
    ) {
      return {
        status: "rejected",
        failureKind: "publication-conflict",
        message: error.diagnostic.message,
      };
    }
    return {
      status: "rejected",
      failureKind: "prepare-failed",
      message: error.diagnostic.message,
    };
  }
  return {
    status: "rejected",
    failureKind: "prepare-failed",
    message: "The candidate WorldSession could not be constructed.",
  };
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
      "worldBuildIdentity",
      "gameplayBootstrap",
      "worldRuntimeBootstrap",
      "sceneSource",
    ])
  ) {
    throw new RangeError(
      "Value must match the closed RuntimeWorldConfigurationV1 schema.",
    );
  }
  let worldBuildIdentity: WorldBuildIdentityV1;
  let gameplayBootstrap: GameplayBootstrapV1;
  let worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
  let sceneSource: RuntimeSceneSourceV1;
  try {
    worldBuildIdentity = parseWorldBuildIdentityV1(record.worldBuildIdentity);
    gameplayBootstrap = parseGameplayBootstrapV1(record.gameplayBootstrap);
    worldRuntimeBootstrap = parseWorldRuntimeBootstrapV1(
      record.worldRuntimeBootstrap,
    );
    const sourceRecord = snapshotDataRecord(record.sceneSource);
    if (isNil(sourceRecord)) throw new Error("Scene Source invalid.");
    if (
      sourceRecord.kind === "canonical-execution-plan" &&
      hasExactKeys(sourceRecord, ["kind", "executionPlan", "executionPlanHash"]) &&
      isSha256Hash(sourceRecord.executionPlanHash)
    ) {
      const executionPlan = parseCanonicalSceneExecutionPlanV1(
        sourceRecord.executionPlan,
      );
      if (hashCanonicalSceneExecutionPlanV1(executionPlan) !== sourceRecord.executionPlanHash) {
        throw new Error("Canonical Scene Plan hash mismatch.");
      }
      sceneSource = Object.freeze({
        kind: "canonical-execution-plan",
        executionPlan,
        executionPlanHash: sourceRecord.executionPlanHash,
      });
    } else if (
      sourceRecord.kind === "babylon-native-scene" &&
      hasExactKeys(sourceRecord, ["kind", "bootstrap", "sceneModuleBundleRef"]) &&
      typeof sourceRecord.sceneModuleBundleRef === "string" &&
      /^package:\/\/native-scene-module\/sha256\/[a-f0-9]{64}$/.test(
        sourceRecord.sceneModuleBundleRef,
      )
    ) {
      sceneSource = Object.freeze({
        kind: "babylon-native-scene",
        bootstrap: parseBabylonNativeSceneBootstrapV1(sourceRecord.bootstrap),
        sceneModuleBundleRef:
          sourceRecord.sceneModuleBundleRef as NativeSceneModuleBundleRefV1,
      });
    } else {
      throw new Error("Scene Source invalid.");
    }
  } catch {
    throw new RangeError(
      "Value must match the closed RuntimeWorldConfigurationV1 schema.",
    );
  }
  const runtimeSubjects = worldRuntimeBootstrap.subjectRuntimeDescriptors;
  const initialRuntimeSubjects = runtimeSubjects.filter((subject) =>
    subject.entityId === worldRuntimeBootstrap.initialControlledEntityId
  );
  if (
    worldBuildIdentity.gameplayBootstrapHash !== gameplayBootstrap.contentHash ||
    worldBuildIdentity.worldRuntimeBootstrapHash !==
      worldRuntimeBootstrap.contentHash ||
    worldRuntimeBootstrap.gameplayBootstrapRef !== gameplayBootstrap.resourceRef ||
    worldRuntimeBootstrap.gameplayBootstrapHash !== gameplayBootstrap.contentHash ||
    initialRuntimeSubjects.length !== 1 ||
    gameplayBootstrap.entityDescriptors.some((gameplayEntity) => {
      const runtimeSubject = runtimeSubjects.find((subject) =>
        subject.entityId === gameplayEntity.id
      );
      return isNil(runtimeSubject) ||
        runtimeSubject.subjectDefinitionRef !==
          gameplayEntity.entityDefinitionRef;
    }) ||
    runtimeSubjects.some((runtimeSubject) =>
      !gameplayBootstrap.entityDescriptors.some((gameplayEntity) =>
        gameplayEntity.id === runtimeSubject.entityId
      )
    )
  ) {
    throw new RangeError(
      "Value must match the closed RuntimeWorldConfigurationV1 schema.",
    );
  }
  if (sceneSource.kind === "canonical-execution-plan") {
    if (
      worldBuildIdentity.sceneSourceIdentity.kind !==
        "canonical-execution-plan" ||
      worldBuildIdentity.sceneSourceIdentity.executionPlanHash !==
        sceneSource.executionPlanHash ||
      sceneSource.executionPlan.worldRuntimeBootstrapHash !==
        worldRuntimeBootstrap.contentHash ||
      sceneSource.executionPlan.worldRuntimeBootstrapRef.length === 0
    ) {
      throw new RangeError(
        "Value must match the closed RuntimeWorldConfigurationV1 schema.",
      );
    }
  } else if (worldBuildIdentity.sceneSourceIdentity.kind !== "babylon-native-scene") {
    throw new RangeError(
      "Value must match the closed RuntimeWorldConfigurationV1 schema.",
    );
  } else if (
    hashBabylonNativeSceneBootstrapV1(sceneSource.bootstrap) !==
      worldBuildIdentity.sceneSourceIdentity.nativeSceneBootstrapHash ||
    nativeSceneModuleBundleHashFromRefV1(sceneSource.sceneModuleBundleRef) !==
      worldBuildIdentity.sceneSourceIdentity.sceneModuleBundleHash ||
    sceneSource.bootstrap.gameplayBootstrapRef !== gameplayBootstrap.resourceRef ||
    sceneSource.bootstrap.initialControlledEntityId !==
      worldRuntimeBootstrap.initialControlledEntityId
  ) {
    throw new RangeError(
      "Value must match the closed RuntimeWorldConfigurationV1 schema.",
    );
  }
  return Object.freeze({
    worldBuildIdentity,
    gameplayBootstrap,
    worldRuntimeBootstrap,
    sceneSource,
  });
}

export function runtimeWorldConfigurationFromVerifiedWorldPackageV1(
  verified: VerifiedWorldPackageDirectoryV1,
): RuntimeWorldConfigurationV1 {
  const source = verified.kind === "canonical-execution-plan"
    ? Object.freeze({
        kind: "canonical-execution-plan" as const,
        executionPlan: verified.executionPlan,
        executionPlanHash:
          verified.receipt.manifest.sceneSource.executionPlanHash,
      })
    : Object.freeze({
        kind: "babylon-native-scene" as const,
        bootstrap: verified.bootstrap,
        sceneModuleBundleRef: verified.sceneModuleBundleRef,
      });
  return parseRuntimeWorldConfiguration({
    worldBuildIdentity: verified.receipt.worldBuildIdentity,
    gameplayBootstrap: verified.gameplayBootstrap,
    worldRuntimeBootstrap: verified.worldRuntimeBootstrap,
    sceneSource: source,
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
  const hasResolver = !isNil(record) &&
    Object.hasOwn(record, "gameplayActionRequestResolver");
  const hasInitialControlBinding = !isNil(record) &&
    Object.hasOwn(record, "initialControlBinding");
  const expectedKeys = [
    ...baseKeys,
    ...(hasResolver ? ["gameplayActionRequestResolver"] : []),
    ...(hasInitialControlBinding ? ["initialControlBinding"] : []),
  ];
  if (
    isNil(record) ||
    !hasExactKeys(record, expectedKeys) ||
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
      "awaitCandidatePublicationReady",
    ]) ||
    typeof adapterFactoryRecord.preflightConcurrentResidency !== "function" ||
    typeof adapterFactoryRecord.create !== "function" ||
    typeof adapterFactoryRecord.awaitCandidatePublicationReady !== "function"
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
  const awaitCandidatePublicationReady =
    adapterFactoryRecord.awaitCandidatePublicationReady as
      GameplayWorldAdapterFactoryV1["awaitCandidatePublicationReady"];
  const adapterFactory = Object.freeze({
    preflightConcurrentResidency: (
      current: RuntimeWorldAdapterDescriptorV1,
      candidate: RuntimeWorldAdapterDescriptorV1,
    ): ConcurrentResidencyPreflightResultV1 =>
      Reflect.apply(preflight, adapterReceiver, [current, candidate]),
    create: (candidate: RuntimeWorldAdapterDescriptorV1) =>
      Reflect.apply(create, adapterReceiver, [candidate]),
    awaitCandidatePublicationReady: (
      gateInput: RuntimeCandidatePublicationGateInputV1,
    ) => Reflect.apply(
      awaitCandidatePublicationReady,
      adapterReceiver,
      [gateInput],
    ),
  });
  return Object.freeze({
    runtimeSessionId: record.runtimeSessionId,
    initialWorld,
    ...(hasInitialControlBinding
      ? {
          initialControlBinding: parseInitialControlBinding(
            record.initialControlBinding,
          ),
        }
      : {}),
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
  const configuration = parseRuntimeWorldConfiguration(record.worldConfiguration);
  return configuration;
}

function parseInitialControlBinding(
  input: unknown,
): RuntimeHostInitialControlBindingV1 {
  const record = snapshotDataRecord(input);
  if (
    isNil(record) ||
    !hasExactKeys(record, ["controllerEntityId", "controlledEntityId"]) ||
    !isNonEmptyString(record.controllerEntityId) ||
    !isNonEmptyString(record.controlledEntityId)
  ) {
    throw new RangeError(
      "Value must match the closed RuntimeHostInitialControlBindingV1 schema.",
    );
  }
  return Object.freeze({
    controllerEntityId: record.controllerEntityId,
    controlledEntityId: record.controlledEntityId,
  });
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
    worldBuildIdentity: configuration.worldBuildIdentity,
    gameplayBootstrap: configuration.gameplayBootstrap,
    worldRuntimeBootstrap: configuration.worldRuntimeBootstrap,
    sceneSource: configuration.sceneSource,
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
        worldBuildIdentity: options.initialWorld.worldBuildIdentity,
        gameplayBootstrap: options.initialWorld.gameplayBootstrap,
        initialRelationships:
          options.initialWorld.gameplayBootstrap.initialRelationshipStates,
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
    try {
      if (!isNil(options.initialControlBinding)) {
        const bindReceipt = await worldSession.executeGameplayCommand({
          schemaVersion: 1,
          id: `command.runtime-host.initial-bind.${worldSessionId}`,
          type: "control.bind",
          runtimeSessionId: options.runtimeSessionId,
          worldSessionId,
          controllerEntityId: options.initialControlBinding.controllerEntityId,
          controlledEntityId: options.initialControlBinding.controlledEntityId,
          expectedPossession: { mode: "unbound" },
        });
        if (bindReceipt.status !== "committed") {
          throw hostFailure(
            bindReceipt.diagnostic.code,
            "The initial control binding was not committed.",
          );
        }
      }
      await options.adapterFactory.awaitCandidatePublicationReady(
        Object.freeze({
          runtimeSessionId: options.runtimeSessionId,
          worldSessionId,
          publication: worldSession.snapshot(),
        }),
      );
    } catch {
      await worldSession.dispose().catch(() => undefined);
      throw hostFailure(
        "WORLD_SESSION_FAILED",
        "The initial WorldSession did not reach publication readiness.",
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
    this.assertObservationAllowed();
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

  executeCameraViewCommand(
    input: unknown,
    executor: CameraViewCommandExecutorV1,
  ): Promise<CameraViewCommandReceiptV1> {
    return this.enqueueMutation(async () => {
      this.assertMutationAllowed();
      const receipt = await this.currentWorldSession.executeCameraViewCommand(input, executor);
      this.synchronizePhaseFromCurrent();
      return receipt;
    });
  }

  publishCameraSelectionObservation(
    previous: CameraViewSelectionProjectionV1,
    next: CameraViewSelectionProjectionV1,
  ): Promise<WorldSessionPublicationV1> {
    return this.enqueueMutation(async () => {
      this.assertMutationAllowed();
      return await this.currentWorldSession.publishCameraSelectionObservation(
        previous,
        next,
      );
    });
  }

  publishCameraTargetUnbound(
    previous: CameraViewSelectionProjectionV1,
    reason: "control-released" | "target-disposed" | "world-replaced",
  ): Promise<WorldSessionPublicationV1> {
    return this.enqueueMutation(async () => {
      this.assertMutationAllowed();
      return await this.currentWorldSession.publishCameraTargetUnbound(previous, reason);
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
    this.assertObservationAllowed();
    return this.currentWorldSession.getWorldStateSnapshot(worldStateRef);
  }

  eventsAfter(
    afterEventSequence: number,
    maximumEventCount: number,
  ): readonly WorldSessionEventV1[] {
    this.assertObservationAllowed();
    return this.currentWorldSession.eventsAfter(
      afterEventSequence,
      maximumEventCount,
    );
  }

  runtimeActivitySnapshot(): RuntimeActivityCoordinatorSnapshotV1 {
    this.assertObservationAllowed();
    return this.activityCoordinator.snapshot();
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
    return this.startReplacement(configuration);
  }

  publishWorldReplacementV1(
    input: unknown,
    initialControlBindingInput?: unknown,
  ): Promise<PublishWorldReplacementResultV1> {
    let parsed: ParsedPublishWorldReplacementV1;
    let initialControlBinding: RuntimeHostInitialControlBindingV1 | undefined;
    try {
      parsed = parsePublishWorldReplacementInput(input);
      initialControlBinding = isNil(initialControlBindingInput)
        ? undefined
        : parseInitialControlBinding(initialControlBindingInput);
    } catch {
      return Promise.resolve({
        status: "rejected",
        failureKind: "prepare-failed",
        message: "Value must match the closed PublishWorldReplacementInputV1 schema.",
      });
    }
    if (parsed.publication.runtimeExpectation.targetPhaseBarrier.mode === "fixed-tick") {
      return Promise.resolve({
        status: "rejected",
        failureKind: "publication-mode-unsupported",
        message: "Full Reload V1 only accepts next-world-replacement-barrier.",
      });
    }
    if (!this.matchesPublicationExpectation(parsed.publication.runtimeExpectation)) {
      return Promise.resolve({
        status: "rejected",
        failureKind: "expectation-stale",
        message: "Runtime publication expectation does not match the live Runtime.",
      });
    }
    if (!isNil(this.replacementOperationPromise)) {
      return Promise.resolve({
        status: "rejected",
        failureKind: "publication-conflict",
        message: "A World replacement is already in progress.",
      });
    }
    const published = this.performPublicationReplacement(
      parsed,
      initialControlBinding,
    );
    const tracked = published.then((result) => {
      if (result.status === "published") return result.publication;
      throw hostFailure(
        result.failureKind === "capacity-exceeded"
          ? "RUNTIME_HOST_CAPACITY_EXCEEDED"
          : result.failureKind === "publication-conflict"
            ? "WORLD_SESSION_NOT_READY"
            : "WORLD_SESSION_FAILED",
        result.message,
      );
    });
    this.replacementOperationPromise = tracked;
    void tracked.finally(() => {
      if (this.replacementOperationPromise === tracked) {
        this.replacementOperationPromise = undefined;
      }
    }).catch(() => undefined);
    return published;
  }

  resetWithInitialControlBinding(
    input: unknown,
  ): Promise<WorldSessionPublicationV1> {
    const initialControlBinding = parseInitialControlBinding(input);
    return this.startReplacement(
      this.initialConfiguration,
      initialControlBinding,
    );
  }

  private startReplacement(
    configuration: RuntimeWorldConfigurationV1,
    initialControlBinding?: RuntimeHostInitialControlBindingV1,
  ): Promise<WorldSessionPublicationV1> {
    if (!isNil(this.replacementOperationPromise)) {
      return Promise.reject(hostFailure(
        "WORLD_SESSION_NOT_READY",
        "A World replacement is already in progress.",
      ));
    }
    const operation = this.performReplacement(
      configuration,
      initialControlBinding,
    ).then((outcome) => outcome.publication);
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

  private matchesPublicationExpectation(
    expectation: RuntimeWorldPublicationExpectationV1,
  ): boolean {
    return expectation.runtimeSessionId === this.runtimeSessionId &&
      expectation.expectedWorldSessionId === this.currentWorldSessionId &&
      expectation.expectedWorldPackageRootHash ===
        this.currentConfiguration.worldBuildIdentity.worldPackageRootHash;
  }

  private async performPublicationReplacement(
    parsed: ParsedPublishWorldReplacementV1,
    initialControlBinding?: RuntimeHostInitialControlBindingV1,
  ): Promise<PublishWorldReplacementResultV1> {
    try {
      const outcome = await this.performReplacement(
        parsed.worldConfiguration,
        initialControlBinding,
        {
          expectation: parsed.publication.runtimeExpectation,
          ...(isNil(parsed.persistDurableCommit)
            ? {}
            : { persistDurableCommit: parsed.persistDurableCommit }),
        },
      );
      return {
        status: "published",
        publication: outcome.publication,
        previous: outcome.previous,
        current: outcome.current,
        cleanup: {
          status: outcome.cleanupStatus,
          diagnostics: outcome.cleanupStatus === "quarantined"
            ? [
                diagnostic(
                  "WORLD_SESSION_FAILED",
                  "The replaced WorldSession could not be released cleanly.",
                ),
              ]
            : [],
        },
      };
    } catch (error) {
      return mapPublicationReplacementError(error);
    }
  }

  private async performReplacement(
    configuration: RuntimeWorldConfigurationV1,
    initialControlBinding?: RuntimeHostInitialControlBindingV1,
    publication?: PublicationReplacementContextV1,
  ): Promise<ReplacementOutcomeV1> {
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
        worldBuildIdentity: configuration.worldBuildIdentity,
        gameplayBootstrap: configuration.gameplayBootstrap,
        initialRelationships:
          configuration.gameplayBootstrap.initialRelationshipStates,
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

      if (!isNil(initialControlBinding)) {
        const bindReceipt = await candidate.executeGameplayCommand({
          schemaVersion: 1,
          id: `command.runtime-host.initial-bind.${token.candidateWorldSessionId}`,
          type: "control.bind",
          runtimeSessionId: this.runtimeSessionId,
          worldSessionId: token.candidateWorldSessionId,
          controllerEntityId: initialControlBinding.controllerEntityId,
          controlledEntityId: initialControlBinding.controlledEntityId,
          expectedPossession: { mode: "unbound" },
        });
        if (bindReceipt.status !== "committed") {
          throw hostFailure(
            bindReceipt.diagnostic.code,
            "The candidate initial control binding was not committed.",
          );
        }
      }

      await this.options.adapterFactory.awaitCandidatePublicationReady(
        Object.freeze({
          runtimeSessionId: this.runtimeSessionId,
          worldSessionId: token.candidateWorldSessionId,
          publication: candidate.snapshot(),
        }),
      );

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
        ) return undefined;
        if (
          !isNil(publication) &&
          !this.matchesPublicationExpectation(publication.expectation)
        ) {
          throw new PublicationExpectationErrorV1();
        }
        const previous = publicationIdentitiesV1(
          this.runtimeSessionId,
          token.previousWorldSession,
          token.previousConfiguration,
        );
        const current = publicationIdentitiesV1(
          this.runtimeSessionId,
          candidate!,
          token.candidateConfiguration,
        );
        this.replacementCommitPending = true;
        let releaseDurableCommitFence: (() => void) | undefined;
        try {
          if (!isNil(publication?.persistDurableCommit)) {
            try {
              releaseDurableCommitFence = publication.persistDurableCommit({
                previous,
                current,
              });
            } catch (error) {
              throw new PublicationCommitErrorV1(error);
            }
          }
          this.currentWorldSession = candidate!;
          this.currentConfiguration = token.candidateConfiguration;
          this.worldSessionGeneration += 1;
        } finally {
          this.replacementCommitPending = false;
          releaseDurableCommitFence?.();
        }
        return { previous, current };
      });
      if (isNil(swapped)) {
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
      let cleanupStatus: ReplacementOutcomeV1["cleanupStatus"] = "released";
      try {
        await token.previousWorldSession.dispose();
      } catch {
        if (isNil(publication)) {
          throw hostFailure(
            "WORLD_SESSION_FAILED",
            "The replaced WorldSession could not be released cleanly.",
          );
        }
        cleanupStatus = "quarantined";
      }
      return {
        publication: candidate.snapshot(),
        previous: swapped.previous,
        current: swapped.current,
        cleanupStatus,
      };
    } catch (error) {
      if (!isNil(candidate) && candidate !== this.currentWorldSession) {
        await candidate.dispose().catch(() => undefined);
      }
      if (
        error instanceof RuntimeHostOperationErrorV1 ||
        error instanceof PublicationExpectationErrorV1 ||
        error instanceof PublicationCommitErrorV1
      ) {
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

  private assertObservationAllowed(): void {
    if (this.replacementCommitPending) {
      throw hostFailure(
        "WORLD_SESSION_NOT_READY",
        "Runtime publication fence is committing a World replacement.",
      );
    }
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
