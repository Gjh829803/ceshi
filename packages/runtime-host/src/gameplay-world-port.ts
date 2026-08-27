import {
  buildWorldStateSnapshotV1,
  type GameplayActionStateV1,
  type GameplayCapabilityStateV1,
  type GameplayRelationshipStateV1,
  type GameplaySemanticFactV1,
  type SpatialEntityStateV1,
} from "@whitebox-world/gameplay-contracts";
import type { GameplayTransitionPlanV1 } from "@whitebox-world/gameplay";
import type { FixedInputV1 } from "@whitebox-world/runtime-contracts";
import { isNil } from "lodash-es";

const VALIDATION_HASH = `sha256:${"0".repeat(64)}` as const;

export interface GameplayWorldStateProjectionV1 {
  readonly simulationTick: number;
  readonly spatialEntityStatesById: Readonly<
    Record<string, SpatialEntityStateV1>
  >;
  readonly capabilityStatesById: Readonly<
    Record<string, GameplayCapabilityStateV1>
  >;
  readonly semanticFactsById: Readonly<
    Record<string, GameplaySemanticFactV1>
  >;
}

/**
 * Internal staged View revision only. Camera target and profile remain owned by
 * the View layer and are derived from committed Gameplay relationships; this
 * DTO must not carry a second controlled-entity truth.
 */
export interface GameplayViewStateProjectionV1 {
  readonly viewStateRevision: number;
}

export interface GameplayFixedInputCapacityEstimateV1 {
  readonly maximumSemanticFactCountAfterInput: number;
  readonly maximumSemanticFactTransitionEventCount: number;
}

/**
 * Host-owned Action authority for exactly one fixed simulation Tick. The
 * provider consumes this committed-next projection independently from raw
 * user input and must not infer Action state from input actions or animation.
 */
export interface GameplayFixedTickActionProjectionV1 {
  readonly simulationTick: number;
  readonly activeActionStatesById: Readonly<
    Record<string, GameplayActionStateV1>
  >;
}

export type FixedInputOneTickV1 = Omit<FixedInputV1, "ticks"> & Readonly<{
  ticks: 1;
}>;

export type GameplayWorldTransitionV1 = GameplayTransitionPlanV1;

export interface GameplayWorldTransactionV1 {
  readonly projectedWorldStateAfter: GameplayWorldStateProjectionV1;
  readonly projectedViewStateAfter: GameplayViewStateProjectionV1;
  commitPrepared(): void;
  abort(): Promise<void>;
}

export interface GameplayWorldPortV1 {
  initialize(): Promise<GameplayWorldStateProjectionV1>;
  hasEntity(entityId: string): boolean;
  isEntityControllable(controlledEntityId: string): boolean;
  isActionAvailable(
    actorEntityId: string,
    semanticActionRef: string,
    transition: GameplayWorldTransitionV1,
  ): boolean;
  prepareGameplayTransition(
    transition: GameplayWorldTransitionV1,
  ): Promise<GameplayWorldTransactionV1>;
  estimateFixedInputTickCapacity(
    input: FixedInputOneTickV1,
  ): GameplayFixedInputCapacityEstimateV1;
  runFixedInputTick(
    input: FixedInputOneTickV1,
    actionProjection: GameplayFixedTickActionProjectionV1,
  ): Promise<GameplayWorldStateProjectionV1>;
  snapshot(): GameplayWorldStateProjectionV1;
  dispose(): Promise<void>;
}

export interface GameplayWorldProjectionValidationOptionsV1 {
  readonly controllerEntityIds: readonly string[];
  readonly relationshipStatesById: Readonly<
    Record<string, GameplayRelationshipStateV1>
  >;
}

function invalid(schemaName: string): never {
  throw new RangeError(`Value must match the closed ${schemaName} schema.`);
}

function snapshotDataRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  if (typeof value !== "object" || isNil(value)) return undefined;
  try {
    const prototype = Reflect.getPrototypeOf(value);
    if (!isNil(prototype) && prototype !== Object.prototype) return undefined;
    const snapshot = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
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

function snapshotDataArray(value: unknown): readonly unknown[] | undefined {
  if (!Array.isArray(value)) return undefined;
  try {
    if (Reflect.getPrototypeOf(value) !== Array.prototype) return undefined;
    if (Reflect.ownKeys(value).some((key) => typeof key === "symbol")) {
      return undefined;
    }
    const ownNames = Object.getOwnPropertyNames(value);
    if (ownNames.length !== value.length + 1) return undefined;
    const snapshot: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
      if (
        isNil(descriptor) ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) return undefined;
      snapshot.push(descriptor.value);
    }
    const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, "length");
    if (isNil(lengthDescriptor) || lengthDescriptor.enumerable !== false) {
      return undefined;
    }
    return snapshot;
  } catch {
    return undefined;
  }
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean {
  const ownKeys = Reflect.ownKeys(value);
  return ownKeys.length === keys.length &&
    ownKeys.every((key) => typeof key === "string" && keys.includes(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    !Object.is(value, -0);
}

function parseControllerEntityIds(
  input: unknown,
): ReadonlySet<string> {
  const options = snapshotDataRecord(input);
  if (isNil(options)) {
    return invalid("GameplayWorldProjectionValidationOptionsV1");
  }
  if (!hasExactKeys(options, [
    "controllerEntityIds",
    "relationshipStatesById",
  ])) {
    return invalid("GameplayWorldProjectionValidationOptionsV1");
  }
  const values = snapshotDataArray(options.controllerEntityIds);
  if (isNil(values)) {
    return invalid("GameplayWorldProjectionValidationOptionsV1");
  }
  const controllerEntityIds = new Set<string>();
  for (const value of values) {
    if (!isNonEmptyString(value) || controllerEntityIds.has(value)) {
      return invalid("GameplayWorldProjectionValidationOptionsV1");
    }
    controllerEntityIds.add(value);
  }
  return controllerEntityIds;
}

export function parseGameplayWorldStateProjectionV1(
  input: unknown,
  optionsInput: GameplayWorldProjectionValidationOptionsV1,
): GameplayWorldStateProjectionV1 {
  const schemaName = "GameplayWorldStateProjectionV1";
  try {
    const record = snapshotDataRecord(input);
    if (isNil(record)) return invalid(schemaName);
    if (!hasExactKeys(record, [
      "simulationTick",
      "spatialEntityStatesById",
      "capabilityStatesById",
      "semanticFactsById",
    ]) || !isSafeNonNegativeInteger(record.simulationTick)) {
      return invalid(schemaName);
    }
    const controllerEntityIds = parseControllerEntityIds(optionsInput);
    const options = snapshotDataRecord(optionsInput) ?? invalid(schemaName);
    const canonical = buildWorldStateSnapshotV1({
      kind: "worldkit-world-state-snapshot",
      schemaVersion: 1,
      runtimeSessionId: "runtime-host-projection-validation",
      worldSessionId: "world-projection-validation",
      simulationTick: record.simulationTick,
      worldPackageRef:
        `package://world-package/sha256/${VALIDATION_HASH.slice(7)}`,
      worldPackageRootHash: VALIDATION_HASH,
      executionPlanHash: VALIDATION_HASH,
      entityStatesById: record.spatialEntityStatesById,
      capabilityStatesById: record.capabilityStatesById,
      relationshipStatesById: options.relationshipStatesById,
      semanticFactsById: record.semanticFactsById,
      activeActionStatesById: {},
      lastEventSequence: 0,
    });

    for (const entityState of Object.values(canonical.entityStatesById)) {
      if (
        entityState.kind !== "spatial-entity-state" ||
        controllerEntityIds.has(entityState.id)
      ) return invalid(schemaName);
    }
    for (const semanticFact of Object.values(canonical.semanticFactsById)) {
      const endpointEntityIds = semanticFact.type === "supportedBy"
        ? [semanticFact.supportedEntityId, semanticFact.supportSurfaceEntityId]
        : semanticFact.type === "touching"
          ? semanticFact.entityIds
          : [semanticFact.containedEntityId, semanticFact.volumeEntityId];
      if (endpointEntityIds.some((entityId) =>
        controllerEntityIds.has(entityId)
      )) return invalid(schemaName);
    }

    return Object.freeze({
      simulationTick: canonical.simulationTick,
      spatialEntityStatesById: canonical.entityStatesById as Readonly<
        Record<string, SpatialEntityStateV1>
      >,
      capabilityStatesById: canonical.capabilityStatesById,
      semanticFactsById: canonical.semanticFactsById,
    });
  } catch {
    return invalid(schemaName);
  }
}

export function parseGameplayViewStateProjectionV1(
  input: unknown,
): GameplayViewStateProjectionV1 {
  const schemaName = "GameplayViewStateProjectionV1";
  const record = snapshotDataRecord(input);
  if (isNil(record)) return invalid(schemaName);
  if (
    !hasExactKeys(record, ["viewStateRevision"]) ||
    !isSafeNonNegativeInteger(record.viewStateRevision)
  ) return invalid(schemaName);
  return Object.freeze({
    viewStateRevision: record.viewStateRevision,
  });
}

export function parseGameplayFixedInputCapacityEstimateV1(
  input: unknown,
): GameplayFixedInputCapacityEstimateV1 {
  const schemaName = "GameplayFixedInputCapacityEstimateV1";
  const record = snapshotDataRecord(input);
  if (isNil(record)) return invalid(schemaName);
  if (!hasExactKeys(record, [
    "maximumSemanticFactCountAfterInput",
    "maximumSemanticFactTransitionEventCount",
  ]) ||
    !isSafeNonNegativeInteger(record.maximumSemanticFactCountAfterInput) ||
    !isSafeNonNegativeInteger(
      record.maximumSemanticFactTransitionEventCount,
    )
  ) return invalid(schemaName);
  return Object.freeze({
    maximumSemanticFactCountAfterInput:
      record.maximumSemanticFactCountAfterInput,
    maximumSemanticFactTransitionEventCount:
      record.maximumSemanticFactTransitionEventCount,
  });
}

export function parseGameplayWorldTransactionV1(
  input: unknown,
  options: GameplayWorldProjectionValidationOptionsV1,
): GameplayWorldTransactionV1 {
  const schemaName = "GameplayWorldTransactionV1";
  try {
    const record = snapshotDataRecord(input);
    if (isNil(record)) return invalid(schemaName);
    if (!hasExactKeys(record, [
      "projectedWorldStateAfter",
      "projectedViewStateAfter",
      "commitPrepared",
      "abort",
    ]) ||
      typeof record.commitPrepared !== "function" ||
      typeof record.abort !== "function"
    ) return invalid(schemaName);

    const projectedWorldStateAfter = parseGameplayWorldStateProjectionV1(
      record.projectedWorldStateAfter,
      options,
    );
    const projectedViewStateAfter = parseGameplayViewStateProjectionV1(
      record.projectedViewStateAfter,
    );
    const transactionReceiver = input;
    const providerCommitPrepared = record.commitPrepared as () => unknown;
    const providerAbort = record.abort as () => Promise<void>;
    let lifecycle: "prepared" | "committed" | "aborted" = "prepared";
    let abortPromise: Promise<void> | undefined;
    const commitPrepared = (): void => {
      if (lifecycle === "committed") {
        throw new Error("GameplayWorldTransactionV1 is already committed.");
      }
      if (lifecycle === "aborted") {
        throw new Error("GameplayWorldTransactionV1 is already aborted.");
      }
      lifecycle = "committed";
      const result = Reflect.apply(
        providerCommitPrepared,
        transactionReceiver,
        [],
      );
      if (!isNil(result)) {
        void Promise.resolve(result).catch(() => undefined);
        throw new TypeError(
          "GameplayWorldTransactionV1 commitPrepared must return undefined.",
        );
      }
    };
    const abort = (): Promise<void> => {
      if (!isNil(abortPromise)) return abortPromise;
      if (lifecycle === "committed") {
        abortPromise = Promise.reject(
          new Error("GameplayWorldTransactionV1 is already committed."),
        );
        return abortPromise;
      }
      lifecycle = "aborted";
      abortPromise = Promise.resolve().then(() =>
        Reflect.apply(providerAbort, transactionReceiver, [])
      );
      return abortPromise;
    };

    return Object.freeze({
      projectedWorldStateAfter,
      projectedViewStateAfter,
      commitPrepared,
      abort,
    });
  } catch {
    return invalid(schemaName);
  }
}
