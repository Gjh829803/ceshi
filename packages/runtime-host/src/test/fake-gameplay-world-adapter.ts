import type { GameplayWorldTransitionV1 } from "../gameplay-world-port";
import type {
  FixedInputOneTickV1,
  GameplayFixedInputCapacityEstimateV1,
  GameplayViewStateProjectionV1,
  GameplayWorldPortV1,
  GameplayWorldStateProjectionV1,
  GameplayWorldTransactionV1,
} from "../gameplay-world-port";
import { isNil } from "lodash-es";

export type FakeGameplayWorldPortOperationV1 =
  | "initialize"
  | "snapshot"
  | "has-entity"
  | "is-entity-controllable"
  | "is-action-available"
  | "prepare-gameplay-transition"
  | "commit-prepared"
  | "abort"
  | "estimate-fixed-input-tick-capacity"
  | "run-fixed-input-tick"
  | "dispose";

export type FakeGameplayAsyncOperationV1 = Extract<
  FakeGameplayWorldPortOperationV1,
  | "initialize"
  | "prepare-gameplay-transition"
  | "abort"
  | "run-fixed-input-tick"
  | "dispose"
>;

export interface FakeGameplayWorldPortCallV1 {
  readonly sequence: number;
  readonly operation: FakeGameplayWorldPortOperationV1;
  readonly entityId?: string;
  readonly actorEntityId?: string;
  readonly semanticActionRef?: string;
  readonly transitionType?: GameplayWorldTransitionV1["type"];
  readonly transitionId?: string;
  readonly input?: FixedInputOneTickV1;
}

export interface FakeDeferredV1<Value> {
  readonly promise: Promise<Value>;
  resolve(value: Value): void;
  reject(reason: unknown): void;
}

export function createFakeDeferredV1<Value>(): FakeDeferredV1<Value> {
  let resolvePromise!: (value: Value) => void;
  let rejectPromise!: (reason: unknown) => void;
  let isSettled = false;
  const promise = new Promise<Value>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return Object.freeze({
    promise,
    resolve: (value: Value): void => {
      if (isSettled) return;
      isSettled = true;
      resolvePromise(value);
    },
    reject: (reason: unknown): void => {
      if (isSettled) return;
      isSettled = true;
      rejectPromise(reason);
    },
  });
}

export interface FakeGameplayOperationBarrierV1 {
  readonly entered: Promise<void>;
  release(): void;
  reject(reason: unknown): void;
}

interface InternalOperationBarrierV1 extends FakeGameplayOperationBarrierV1 {
  enter(): Promise<void>;
}

function createOperationBarrier(): InternalOperationBarrierV1 {
  const entered = createFakeDeferredV1<void>();
  const release = createFakeDeferredV1<void>();
  return Object.freeze({
    entered: entered.promise,
    enter: (): Promise<void> => {
      entered.resolve();
      return release.promise;
    },
    release: (): void => release.resolve(),
    reject: (reason: unknown): void => release.reject(reason),
  });
}

export interface FakePreparedGameplayTransitionV1 {
  readonly projectedWorldStateAfter: unknown;
  readonly projectedViewStateAfter: unknown;
}

export interface FakeFixedInputTickV1 {
  readonly capacityEstimate: unknown;
  readonly worldProjectionAfter: unknown;
}

export interface FakeAvailableGameplayActionV1 {
  readonly actorEntityId: string;
  readonly semanticActionRef: string;
}

export interface FakeGameplayWorldPortHarnessOptionsV1 {
  readonly initialWorldProjection: unknown;
  readonly initialViewProjection?: unknown;
  readonly controllableEntityIds?: readonly string[];
  readonly availableActions?: readonly FakeAvailableGameplayActionV1[];
}

export type FakeGameplayFailureModeV1 = "throw" | "reject";

interface FakeGameplayFailureV1 {
  readonly mode: FakeGameplayFailureModeV1;
  readonly error: unknown;
}

export interface FakeGameplayWorldPortHarnessV1 {
  readonly port: GameplayWorldPortV1;
  readonly calls: readonly FakeGameplayWorldPortCallV1[];
  readonly publishedWorldProjection: GameplayWorldStateProjectionV1;
  readonly publishedViewProjection: GameplayViewStateProjectionV1;
  readonly commitCount: number;
  readonly abortCount: number;
  readonly disposeCount: number;
  queuePreparedTransition(input: FakePreparedGameplayTransitionV1): void;
  queueFixedInputTick(input: FakeFixedInputTickV1): void;
  deferNextOperation(
    operation: FakeGameplayAsyncOperationV1,
  ): FakeGameplayOperationBarrierV1;
  failNextOperation(
    operation: FakeGameplayAsyncOperationV1 | "commit-prepared",
    mode: FakeGameplayFailureModeV1,
    error: unknown,
  ): void;
  setNextCommitReturn(value: unknown): void;
}

function freezeFixedInput(
  input: FixedInputOneTickV1,
): FixedInputOneTickV1 {
  return Object.freeze({
    actions: Object.freeze([...input.actions]),
    ...(!isNil(input.axes)
      ? { axes: Object.freeze({ ...input.axes }) }
      : {}),
    ticks: 1 as const,
  });
}

function transitionIdentity(
  transition: GameplayWorldTransitionV1,
): Readonly<{
  transitionType: GameplayWorldTransitionV1["type"];
  transitionId: string;
}> {
  return Object.freeze({
    transitionType: transition.type,
    transitionId: "commandId" in transition
      ? transition.commandId
      : transition.completedActionExecutionIds.join(","),
  });
}

function actionKey(actorEntityId: string, semanticActionRef: string): string {
  return `${actorEntityId.length}:${actorEntityId}${semanticActionRef}`;
}

class FakeGameplayWorldPortHarness
  implements FakeGameplayWorldPortHarnessV1, GameplayWorldPortV1 {
  readonly port: GameplayWorldPortV1 = this;
  private readonly operationCalls: FakeGameplayWorldPortCallV1[] = [];
  private readonly controllableEntityIds: ReadonlySet<string>;
  private readonly availableActionKeys: ReadonlySet<string>;
  private readonly preparedTransitions: FakePreparedGameplayTransitionV1[] = [];
  private readonly fixedInputTicks: FakeFixedInputTickV1[] = [];
  private readonly barriersByOperation = new Map<
    FakeGameplayAsyncOperationV1,
    InternalOperationBarrierV1[]
  >();
  private readonly failuresByOperation = new Map<
    FakeGameplayAsyncOperationV1 | "commit-prepared",
    FakeGameplayFailureV1[]
  >();
  private currentWorldProjection: unknown;
  private currentViewProjection: unknown;
  private operationSequence = 0;
  private committedTransitionCount = 0;
  private abortedTransitionCount = 0;
  private disposalCount = 0;
  private disposePromise: Promise<void> | undefined;
  private disposeThrow: unknown;
  private hasDisposeThrow = false;
  private nextCommitReturn: unknown;
  private hasNextCommitReturn = false;

  constructor(options: FakeGameplayWorldPortHarnessOptionsV1) {
    this.currentWorldProjection = options.initialWorldProjection;
    this.currentViewProjection = isNil(options.initialViewProjection)
      ? Object.freeze({ viewStateRevision: 0 })
      : options.initialViewProjection;
    this.controllableEntityIds = new Set(
      isNil(options.controllableEntityIds) ? [] : options.controllableEntityIds,
    );
    this.availableActionKeys = new Set((
      isNil(options.availableActions) ? [] : options.availableActions
    ).map(
      ({ actorEntityId, semanticActionRef }) =>
        actionKey(actorEntityId, semanticActionRef),
    ));
  }

  get calls(): readonly FakeGameplayWorldPortCallV1[] {
    return Object.freeze([...this.operationCalls]);
  }

  get publishedWorldProjection(): GameplayWorldStateProjectionV1 {
    return this.currentWorldProjection as GameplayWorldStateProjectionV1;
  }

  get publishedViewProjection(): GameplayViewStateProjectionV1 {
    return this.currentViewProjection as GameplayViewStateProjectionV1;
  }

  get commitCount(): number {
    return this.committedTransitionCount;
  }

  get abortCount(): number {
    return this.abortedTransitionCount;
  }

  get disposeCount(): number {
    return this.disposalCount;
  }

  queuePreparedTransition(input: FakePreparedGameplayTransitionV1): void {
    this.preparedTransitions.push(Object.freeze({ ...input }));
  }

  queueFixedInputTick(input: FakeFixedInputTickV1): void {
    this.fixedInputTicks.push(Object.freeze({ ...input }));
  }

  deferNextOperation(
    operation: FakeGameplayAsyncOperationV1,
  ): FakeGameplayOperationBarrierV1 {
    const barrier = createOperationBarrier();
    const queue = this.barriersByOperation.get(operation);
    if (isNil(queue)) this.barriersByOperation.set(operation, [barrier]);
    else queue.push(barrier);
    return barrier;
  }

  failNextOperation(
    operation: FakeGameplayAsyncOperationV1 | "commit-prepared",
    mode: FakeGameplayFailureModeV1,
    error: unknown,
  ): void {
    const failure = Object.freeze({ mode, error });
    const queue = this.failuresByOperation.get(operation);
    if (isNil(queue)) this.failuresByOperation.set(operation, [failure]);
    else queue.push(failure);
  }

  setNextCommitReturn(value: unknown): void {
    this.nextCommitReturn = value;
    this.hasNextCommitReturn = true;
  }

  initialize(): Promise<GameplayWorldStateProjectionV1> {
    this.record({ operation: "initialize" });
    const failure = this.takeFailure("initialize");
    if (!isNil(failure) && failure.mode === "throw") throw failure.error;
    if (!isNil(failure)) return Promise.reject(failure.error);
    return this.waitAtBarrier("initialize").then(() =>
      this.currentWorldProjection as GameplayWorldStateProjectionV1
    );
  }

  snapshot(): GameplayWorldStateProjectionV1 {
    this.record({ operation: "snapshot" });
    return this.currentWorldProjection as GameplayWorldStateProjectionV1;
  }

  hasEntity(entityId: string): boolean {
    this.record({ operation: "has-entity", entityId });
    return this.currentEntityIds().has(entityId);
  }

  isEntityControllable(controlledEntityId: string): boolean {
    this.record({
      operation: "is-entity-controllable",
      entityId: controlledEntityId,
    });
    return this.currentEntityIds().has(controlledEntityId) &&
      this.controllableEntityIds.has(controlledEntityId);
  }

  isActionAvailable(actorEntityId: string, semanticActionRef: string): boolean {
    this.record({
      operation: "is-action-available",
      actorEntityId,
      semanticActionRef,
    });
    return this.currentEntityIds().has(actorEntityId) &&
      this.availableActionKeys.has(actionKey(actorEntityId, semanticActionRef));
  }

  prepareGameplayTransition(
    transition: GameplayWorldTransitionV1,
  ): Promise<GameplayWorldTransactionV1> {
    const identity = transitionIdentity(transition);
    this.record({ operation: "prepare-gameplay-transition", ...identity });
    const failure = this.takeFailure("prepare-gameplay-transition");
    if (!isNil(failure) && failure.mode === "throw") throw failure.error;
    if (!isNil(failure)) return Promise.reject(failure.error);

    return this.waitAtBarrier("prepare-gameplay-transition").then(() => {
      const queued = this.preparedTransitions.shift();
      const staged = isNil(queued)
        ? Object.freeze({
            projectedWorldStateAfter: this.currentWorldProjection,
            projectedViewStateAfter: this.currentViewProjection,
          })
        : queued;
      return this.createTransaction(staged, identity);
    });
  }

  estimateFixedInputTickCapacity(
    input: FixedInputOneTickV1,
  ): GameplayFixedInputCapacityEstimateV1 {
    this.requireSingleTick(input);
    this.record({
      operation: "estimate-fixed-input-tick-capacity",
      input: freezeFixedInput(input),
    });
    const queued = this.fixedInputTicks[0];
    if (!isNil(queued)) {
      return queued.capacityEstimate as GameplayFixedInputCapacityEstimateV1;
    }
    const semanticFactsById = (
      this.currentWorldProjection as Partial<GameplayWorldStateProjectionV1>
    ).semanticFactsById;
    return Object.freeze({
      maximumSemanticFactCountAfterInput: isNil(semanticFactsById)
        ? 0
        : Object.keys(semanticFactsById).length,
      maximumSemanticFactTransitionEventCount: 0,
    });
  }

  runFixedInputTick(
    input: FixedInputOneTickV1,
  ): Promise<GameplayWorldStateProjectionV1> {
    this.requireSingleTick(input);
    this.record({
      operation: "run-fixed-input-tick",
      input: freezeFixedInput(input),
    });
    const failure = this.takeFailure("run-fixed-input-tick");
    if (!isNil(failure) && failure.mode === "throw") throw failure.error;
    if (!isNil(failure)) return Promise.reject(failure.error);

    return this.waitAtBarrier("run-fixed-input-tick").then(() => {
      const queued = this.fixedInputTicks.shift();
      const next = isNil(queued)
        ? this.nextDefaultTickProjection()
        : queued.worldProjectionAfter;
      this.currentWorldProjection = next;
      return next as GameplayWorldStateProjectionV1;
    });
  }

  dispose(): Promise<void> {
    if (this.hasDisposeThrow) throw this.disposeThrow;
    if (!isNil(this.disposePromise)) return this.disposePromise;
    this.disposalCount += 1;
    this.record({ operation: "dispose" });
    const failure = this.takeFailure("dispose");
    if (!isNil(failure) && failure.mode === "throw") {
      this.hasDisposeThrow = true;
      this.disposeThrow = failure.error;
      throw failure.error;
    }
    if (!isNil(failure)) {
      this.disposePromise = Promise.reject(failure.error);
      return this.disposePromise;
    }
    this.disposePromise = this.waitAtBarrier("dispose");
    return this.disposePromise;
  }

  private createTransaction(
    staged: FakePreparedGameplayTransitionV1,
    identity: ReturnType<typeof transitionIdentity>,
  ): GameplayWorldTransactionV1 {
    let lifecycle: "prepared" | "committed" | "aborted" = "prepared";
    let abortPromise: Promise<void> | undefined;
    let abortThrow: unknown;
    let hasAbortThrow = false;
    const commitPrepared = (): void => {
      if (lifecycle === "committed") {
        throw new Error("Fake Gameplay transaction is already committed.");
      }
      if (lifecycle === "aborted") {
        throw new Error("Fake Gameplay transaction is already aborted.");
      }
      lifecycle = "committed";
      this.committedTransitionCount += 1;
      this.record({ operation: "commit-prepared", ...identity });
      const failure = this.takeFailure("commit-prepared");
      if (!isNil(failure) && failure.mode === "throw") throw failure.error;
      this.currentWorldProjection = staged.projectedWorldStateAfter;
      this.currentViewProjection = staged.projectedViewStateAfter;
      if (!isNil(failure)) return Promise.reject(failure.error) as never;
      if (this.hasNextCommitReturn) {
        this.hasNextCommitReturn = false;
        const result = this.nextCommitReturn;
        this.nextCommitReturn = undefined;
        return result as never;
      }
    };
    const abort = (): Promise<void> => {
      if (hasAbortThrow) throw abortThrow;
      if (!isNil(abortPromise)) return abortPromise;
      if (lifecycle === "committed") {
        abortPromise = Promise.reject(
          new Error("Fake Gameplay transaction is already committed."),
        );
        return abortPromise;
      }
      lifecycle = "aborted";
      this.abortedTransitionCount += 1;
      this.record({ operation: "abort", ...identity });
      const failure = this.takeFailure("abort");
      if (!isNil(failure) && failure.mode === "throw") {
        hasAbortThrow = true;
        abortThrow = failure.error;
        throw failure.error;
      }
      abortPromise = this.waitAtBarrier("abort").then(() => {
        if (!isNil(failure)) throw failure.error;
      });
      return abortPromise;
    };
    return Object.freeze({
      projectedWorldStateAfter:
        staged.projectedWorldStateAfter as GameplayWorldStateProjectionV1,
      projectedViewStateAfter:
        staged.projectedViewStateAfter as GameplayViewStateProjectionV1,
      commitPrepared,
      abort,
    });
  }

  private requireSingleTick(input: FixedInputOneTickV1): void {
    if (input.ticks !== 1) {
      throw new RangeError("Fake Gameplay World Port accepts exactly one tick.");
    }
  }

  private nextDefaultTickProjection(): unknown {
    const current = this.currentWorldProjection as Partial<
      GameplayWorldStateProjectionV1
    >;
    if (typeof current.simulationTick !== "number") return current;
    return Object.freeze({ ...current, simulationTick: current.simulationTick + 1 });
  }

  private currentEntityIds(): ReadonlySet<string> {
    const projection = this.currentWorldProjection as Partial<
      GameplayWorldStateProjectionV1
    >;
    if (isNil(projection.spatialEntityStatesById)) return new Set();
    return new Set(Object.keys(projection.spatialEntityStatesById));
  }

  private waitAtBarrier(operation: FakeGameplayAsyncOperationV1): Promise<void> {
    const queue = this.barriersByOperation.get(operation);
    const barrier = isNil(queue) ? undefined : queue.shift();
    if (!isNil(queue) && queue.length === 0) {
      this.barriersByOperation.delete(operation);
    }
    return isNil(barrier) ? Promise.resolve() : barrier.enter();
  }

  private takeFailure(
    operation: FakeGameplayAsyncOperationV1 | "commit-prepared",
  ): FakeGameplayFailureV1 | undefined {
    const queue = this.failuresByOperation.get(operation);
    const failure = isNil(queue) ? undefined : queue.shift();
    if (!isNil(queue) && queue.length === 0) {
      this.failuresByOperation.delete(operation);
    }
    return failure;
  }

  private record(
    call: Omit<FakeGameplayWorldPortCallV1, "sequence">,
  ): void {
    this.operationSequence += 1;
    this.operationCalls.push(Object.freeze({
      sequence: this.operationSequence,
      ...call,
    }));
  }
}

export function createFakeGameplayWorldPortHarnessV1(
  options: FakeGameplayWorldPortHarnessOptionsV1,
): FakeGameplayWorldPortHarnessV1 {
  return new FakeGameplayWorldPortHarness(options);
}
