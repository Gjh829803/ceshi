import type {
  GameplayCapacityBudgetV1,
  GameplayCommandV1,
  Sha256HashV1,
} from "@whitebox-world/gameplay-contracts";
import { sha256CanonicalJson } from "@whitebox-world/protocol";

import {
  GameplayCommandDispatcher,
  type GameplayCommandHandlerV1,
} from "./gameplay-command-dispatcher";

type GameplayCommandTypeV1 = GameplayCommandV1["type"];

export interface GameplayFeatureResourceBudgetV1 {
  readonly stateSliceCount: 1;
  readonly commandHandlerCount: number;
}

export interface GameplayFeatureManifestBodyV1 {
  readonly kind: "gameplay-feature";
  readonly id: string;
  readonly version: number;
  readonly resourceRef: string;
  readonly dependencyFeatureRefs: readonly string[];
  readonly requiredCapabilityRefs: readonly string[];
  readonly commandTypes: readonly GameplayCommandTypeV1[];
  readonly resourceBudget: GameplayFeatureResourceBudgetV1;
}

export interface GameplayFeatureManifestV1
  extends GameplayFeatureManifestBodyV1 {
  readonly contentHash: Sha256HashV1;
}

export interface GameplayFeatureResourceLockV1 {
  readonly resourceRef: string;
  readonly contentHash: Sha256HashV1;
}

export interface GameplayFeatureFactoryContextV1 {
  readonly worldSessionId: string;
}

export interface GameplayFeatureActivationContextV1 {
  readonly worldSessionId: string;
}

export interface GameplayFeatureV1 {
  readonly resourceRef: string;
  readonly commandHandlers: readonly GameplayCommandHandlerV1[];
  createStateSlice(context: GameplayFeatureActivationContextV1): unknown;
  prepare(
    context: GameplayFeatureActivationContextV1,
    stateSlice: unknown,
  ): void | Promise<void>;
  activate(
    context: GameplayFeatureActivationContextV1,
    stateSlice: unknown,
  ): void | Promise<void>;
  deactivate(
    context: GameplayFeatureActivationContextV1,
    stateSlice: unknown,
  ): void | Promise<void>;
  dispose(
    context: GameplayFeatureActivationContextV1,
    stateSlice: unknown | undefined,
  ): void | Promise<void>;
}

export interface GameplayFeatureFactoryV1 {
  readonly manifest: GameplayFeatureManifestV1;
  create(context: GameplayFeatureFactoryContextV1): GameplayFeatureV1;
}

export interface GameplayFeatureManagerOptionsV1 {
  readonly factories: readonly GameplayFeatureFactoryV1[];
  readonly resourceLocks: readonly GameplayFeatureResourceLockV1[];
  readonly availableCapabilityRefs: readonly string[];
  readonly capacityBudget: GameplayCapacityBudgetV1;
}

export interface ActiveGameplayFeaturesHandleV1 {
  readonly activeFeatureRefs: readonly string[];
  readonly dispatcher: GameplayCommandDispatcher;
  dispose(): Promise<void>;
}

const COMMAND_TYPES = new Set<GameplayCommandTypeV1>([
  "control.bind",
  "control.release",
  "action.activate",
  "action.cancel",
]);
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;

function featureError(message: string): never {
  throw new Error(`FEATURE_NOT_LOCKED: ${message}`);
}

function snapshotRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  try {
    const prototype = Reflect.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return undefined;
    const result = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (
        typeof key !== "string" ||
        descriptor === undefined ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) return undefined;
      result[key] = descriptor.value;
    }
    return result;
  } catch {
    return undefined;
  }
}

function exactKeys(record: Readonly<Record<string, unknown>>, keys: readonly string[]) {
  const ownKeys = Reflect.ownKeys(record);
  return ownKeys.length === keys.length && ownKeys.every((key) =>
    typeof key === "string" && keys.includes(key)
  );
}

function snapshotArray(input: unknown): readonly unknown[] | undefined {
  if (!Array.isArray(input)) return undefined;
  try {
    if (Reflect.getPrototypeOf(input) !== Array.prototype) return undefined;
    if (Reflect.ownKeys(input).some((key) => typeof key === "symbol")) {
      return undefined;
    }
    if (Object.getOwnPropertyNames(input).length !== input.length + 1) {
      return undefined;
    }
    const result: unknown[] = [];
    for (let index = 0; index < input.length; index += 1) {
      const descriptor = Reflect.getOwnPropertyDescriptor(input, String(index));
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) return undefined;
      result.push(descriptor.value);
    }
    return result;
  } catch {
    return undefined;
  }
}

function parseStringSet(input: unknown, name: string): readonly string[] {
  const snapshot = snapshotArray(input);
  if (snapshot === undefined) {
    return featureError(`${name} must be an Array.`);
  }
  const values = [...snapshot];
  if (
    !values.every((value): value is string =>
      typeof value === "string" && value.length > 0
    ) ||
    new Set(values).size !== values.length
  ) return featureError(`${name} must contain unique non-empty strings.`);
  return Object.freeze(values.sort((left, right) => left.localeCompare(right)));
}

function deepFreeze<T>(input: T): Readonly<T> {
  if (typeof input !== "object" || input === null || Object.isFrozen(input)) {
    return input;
  }
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(input, key);
    if (descriptor !== undefined && "value" in descriptor) deepFreeze(descriptor.value);
  }
  return Object.freeze(input);
}

function parseManifestBody(input: unknown): GameplayFeatureManifestBodyV1 {
  const record = snapshotRecord(input) ?? featureError(
    "Feature manifest must be a plain data object.",
  );
  if (!exactKeys(record, [
    "kind", "id", "version", "resourceRef", "dependencyFeatureRefs",
    "requiredCapabilityRefs", "commandTypes", "resourceBudget",
  ]) ||
    record.kind !== "gameplay-feature" ||
    typeof record.id !== "string" || record.id.length === 0 ||
    !Number.isSafeInteger(record.version) || (record.version as number) <= 0 ||
    typeof record.resourceRef !== "string" || record.resourceRef.length === 0
  ) featureError("Feature manifest identity is invalid.");
  const commandTypes = parseStringSet(record.commandTypes, "commandTypes");
  if (!commandTypes.every((type) => COMMAND_TYPES.has(type as GameplayCommandTypeV1))) {
    featureError("Feature manifest contains an unknown command type.");
  }
  const budget = snapshotRecord(record.resourceBudget) ?? featureError(
    "Feature resourceBudget must be a plain data object.",
  );
  if (!exactKeys(budget, ["stateSliceCount", "commandHandlerCount"]) ||
    budget.stateSliceCount !== 1 ||
    !Number.isSafeInteger(budget.commandHandlerCount) ||
    Object.is(budget.commandHandlerCount, -0) ||
    (budget.commandHandlerCount as number) < 0 ||
    budget.commandHandlerCount !== commandTypes.length
  ) featureError("Feature resourceBudget does not exactly match its declarations.");
  return deepFreeze({
    kind: "gameplay-feature",
    id: record.id,
    version: record.version as number,
    resourceRef: record.resourceRef,
    dependencyFeatureRefs: parseStringSet(
      record.dependencyFeatureRefs,
      "dependencyFeatureRefs",
    ),
    requiredCapabilityRefs: parseStringSet(
      record.requiredCapabilityRefs,
      "requiredCapabilityRefs",
    ),
    commandTypes: commandTypes as readonly GameplayCommandTypeV1[],
    resourceBudget: {
      stateSliceCount: 1,
      commandHandlerCount: budget.commandHandlerCount as number,
    },
  });
}

export function deriveGameplayFeatureManifestContentHashV1(
  input: unknown,
): Sha256HashV1 {
  return sha256CanonicalJson(parseManifestBody(input)) as Sha256HashV1;
}

export function createGameplayFeatureManifestV1(
  input: GameplayFeatureManifestBodyV1,
): GameplayFeatureManifestV1 {
  const body = parseManifestBody(input);
  return deepFreeze({
    ...body,
    contentHash: sha256CanonicalJson(body) as Sha256HashV1,
  });
}

function validateManifest(input: unknown): GameplayFeatureManifestV1 {
  const record = snapshotRecord(input) ?? featureError("Feature manifest is invalid.");
  if (!exactKeys(record, [
    "kind", "id", "version", "resourceRef", "contentHash",
    "dependencyFeatureRefs", "requiredCapabilityRefs", "commandTypes",
    "resourceBudget",
  ]) || typeof record.contentHash !== "string") {
    featureError("Feature manifest has unknown or missing fields.");
  }
  const { contentHash: _contentHash, ...bodyInput } = record;
  const body = parseManifestBody(bodyInput);
  const expected = sha256CanonicalJson(body) as Sha256HashV1;
  if (record.contentHash !== expected) {
    featureError(`Feature '${body.resourceRef}' content hash does not match.`);
  }
  return deepFreeze({ ...body, contentHash: expected });
}

function stableTopologicalSort(
  factoriesByRef: ReadonlyMap<string, GameplayFeatureFactoryV1>,
): readonly GameplayFeatureFactoryV1[] {
  const sorted: GameplayFeatureFactoryV1[] = [];
  const completed = new Set<string>();
  const remaining = new Set(factoriesByRef.keys());
  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter((resourceRef) =>
        factoriesByRef.get(resourceRef)!.manifest.dependencyFeatureRefs.every(
          (dependencyRef) => completed.has(dependencyRef),
        )
      )
      .sort((left, right) => left.localeCompare(right));
    if (ready.length === 0) {
      featureError(
        `Gameplay Feature dependency cycle: ${[...remaining].sort().join(", ")}.`,
      );
    }
    for (const resourceRef of ready) {
      sorted.push(factoriesByRef.get(resourceRef)!);
      completed.add(resourceRef);
      remaining.delete(resourceRef);
    }
  }
  return Object.freeze(sorted);
}

interface LifecycleRecord {
  readonly feature: GameplayFeatureV1;
  commandHandlers: readonly GameplayCommandHandlerV1[];
  stateSlice: unknown | undefined;
  activationStarted: boolean;
}

async function cleanupReverse(
  context: GameplayFeatureActivationContextV1,
  records: readonly LifecycleRecord[],
): Promise<readonly unknown[]> {
  const errors: unknown[] = [];
  for (const record of [...records].reverse()) {
    if (!record.activationStarted || record.stateSlice === undefined) continue;
    try {
      await record.feature.deactivate(context, record.stateSlice);
    } catch (error) {
      errors.push(error);
    }
    record.activationStarted = false;
  }
  for (const record of [...records].reverse()) {
    try {
      await record.feature.dispose(context, record.stateSlice);
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

function throwWithCleanup(
  primary: unknown,
  cleanupErrors: readonly unknown[],
  message: string,
): never {
  if (cleanupErrors.length === 0) throw primary;
  throw new AggregateError([primary, ...cleanupErrors], message);
}

export class GameplayFeatureManager {
  private readonly orderedFactories: readonly GameplayFeatureFactoryV1[];
  private activated = false;

  constructor(options: GameplayFeatureManagerOptionsV1) {
    if (options.factories.length > options.capacityBudget.maximumGameplayFeatureCount) {
      throw new Error("GAMEPLAY_CAPACITY_EXCEEDED: Gameplay Feature count exceeded.");
    }
    const locksByRef = new Map<string, GameplayFeatureResourceLockV1>();
    const resourceLockInputs = snapshotArray(options.resourceLocks) ?? featureError(
      "resourceLocks must be an Array.",
    );
    for (const lockInput of resourceLockInputs) {
      const lock = snapshotRecord(lockInput) ?? featureError(
        "Every Resource Lock must be a plain data object.",
      );
      if (
        !exactKeys(lock, ["resourceRef", "contentHash"]) ||
        typeof lock.resourceRef !== "string" ||
        lock.resourceRef.length === 0 ||
        typeof lock.contentHash !== "string" ||
        !SHA256_PATTERN.test(lock.contentHash)
      ) featureError("Resource Lock has an invalid closed shape.");
      if (locksByRef.has(lock.resourceRef)) featureError(
        `Duplicate Resource Lock '${lock.resourceRef}'.`,
      );
      locksByRef.set(lock.resourceRef, Object.freeze({
        resourceRef: lock.resourceRef,
        contentHash: lock.contentHash as Sha256HashV1,
      }));
    }
    const availableCapabilities = new Set(parseStringSet(
      options.availableCapabilityRefs,
      "availableCapabilityRefs",
    ));
    const factoriesByRef = new Map<string, GameplayFeatureFactoryV1>();
    const commandOwnerByType = new Map<GameplayCommandTypeV1, string>();
    for (const factory of options.factories) {
      const manifest = validateManifest(factory.manifest);
      if (factoriesByRef.has(manifest.resourceRef)) {
        featureError(`Duplicate Gameplay Feature '${manifest.resourceRef}'.`);
      }
      const lock = locksByRef.get(manifest.resourceRef);
      if (lock?.contentHash !== manifest.contentHash) {
        featureError(`Feature '${manifest.resourceRef}' is not locked to its manifest hash.`);
      }
      for (const capabilityRef of manifest.requiredCapabilityRefs) {
        if (!availableCapabilities.has(capabilityRef)) {
          featureError(
            `Feature '${manifest.resourceRef}' requires missing Capability '${capabilityRef}'.`,
          );
        }
      }
      for (const commandType of manifest.commandTypes) {
        const owner = commandOwnerByType.get(commandType);
        if (owner !== undefined) {
          throw new Error(
            `Duplicate Gameplay command Handler '${commandType}' declared by '${owner}' and '${manifest.resourceRef}'.`,
          );
        }
        commandOwnerByType.set(commandType, manifest.resourceRef);
      }
      factoriesByRef.set(manifest.resourceRef, { ...factory, manifest });
    }
    const surplusLockRefs = [...locksByRef.keys()]
      .filter((resourceRef) => !factoriesByRef.has(resourceRef))
      .sort((left, right) => left.localeCompare(right));
    if (surplusLockRefs.length > 0 || locksByRef.size !== factoriesByRef.size) {
      featureError(
        `Resource Lock set must exactly match Feature manifests; surplus Locks: ${surplusLockRefs.join(", ") || "none"}.`,
      );
    }
    for (const factory of factoriesByRef.values()) {
      for (const dependencyRef of factory.manifest.dependencyFeatureRefs) {
        if (!factoriesByRef.has(dependencyRef)) {
          featureError(
            `Feature '${factory.manifest.resourceRef}' has missing dependency '${dependencyRef}'.`,
          );
        }
      }
    }
    this.orderedFactories = stableTopologicalSort(factoriesByRef);
  }

  async activate(
    context: GameplayFeatureActivationContextV1,
  ): Promise<ActiveGameplayFeaturesHandleV1> {
    if (this.activated) throw new Error("Gameplay FeatureManager can activate only once.");
    this.activated = true;
    const records: LifecycleRecord[] = [];
    try {
      for (const factory of this.orderedFactories) {
        const feature = factory.create({ worldSessionId: context.worldSessionId });
        const record: LifecycleRecord = {
          feature,
          commandHandlers: Object.freeze([]),
          stateSlice: undefined,
          activationStarted: false,
        };
        records.push(record);
        if (feature.resourceRef !== factory.manifest.resourceRef) {
          featureError(
            `Factory returned '${feature.resourceRef}' for '${factory.manifest.resourceRef}'.`,
          );
        }
        const handlerInputs = snapshotArray(feature.commandHandlers) ?? featureError(
          `Feature '${feature.resourceRef}' Handlers must be an Array.`,
        );
        const commandHandlers = handlerInputs.map((handlerInput) => {
          const handler = snapshotRecord(handlerInput) ?? featureError(
            `Feature '${feature.resourceRef}' Handler must be a plain data object.`,
          );
          if (
            !exactKeys(handler, ["type", "plan"]) ||
            typeof handler.type !== "string" ||
            !COMMAND_TYPES.has(handler.type as GameplayCommandTypeV1) ||
            typeof handler.plan !== "function"
          ) featureError(
            `Feature '${feature.resourceRef}' Handler has an invalid executable shape.`,
          );
          return Object.freeze({
            type: handler.type as GameplayCommandTypeV1,
            plan: handler.plan as GameplayCommandHandlerV1["plan"],
          }) as GameplayCommandHandlerV1;
        });
        const handlerTypes = commandHandlers.map(({ type }) => type).sort();
        const manifestTypes = [...factory.manifest.commandTypes].sort();
        if (
          handlerTypes.length !== manifestTypes.length ||
          handlerTypes.some((type, index) => type !== manifestTypes[index])
        ) featureError(`Feature '${feature.resourceRef}' Handler declarations do not match.`);
        record.commandHandlers = Object.freeze(commandHandlers);
      }
      for (const record of records) {
        record.stateSlice = record.feature.createStateSlice(context);
      }
      for (const record of records) {
        await record.feature.prepare(context, record.stateSlice);
      }
      for (const record of records) {
        record.activationStarted = true;
        await record.feature.activate(context, record.stateSlice);
      }
    } catch (primary) {
      const cleanupErrors = await cleanupReverse(context, records);
      throwWithCleanup(
        primary,
        cleanupErrors,
        "Gameplay Feature activation failed and cleanup was incomplete.",
      );
    }
    const dispatcher = new GameplayCommandDispatcher(
      records.flatMap(({ commandHandlers }) => commandHandlers),
    );
    let disposePromise: Promise<void> | undefined;
    return Object.freeze({
      activeFeatureRefs: Object.freeze(
        this.orderedFactories.map(({ manifest }) => manifest.resourceRef),
      ),
      dispatcher,
      dispose: () => {
        disposePromise ??= (async () => {
          const errors = await cleanupReverse(context, records);
          if (errors.length > 0) {
            throw new AggregateError(
              errors,
              "One or more Gameplay Feature cleanup operations failed.",
            );
          }
        })();
        return disposePromise;
      },
    });
  }
}
