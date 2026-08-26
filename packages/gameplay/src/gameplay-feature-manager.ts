import {
  parseGameplayFeatureManifestV1,
  parseGameplayFeatureResourceLockV1,
  type GameplayCapacityBudgetV1,
  type GameplayCommandTypeV1,
  type GameplayFeatureManifestV1,
  type GameplayFeatureResourceLockV1,
} from "@whitebox-world/gameplay-contracts";
import { isNil } from "lodash-es";

import {
  GameplayCommandDispatcher,
  type GameplayCommandHandlerV1,
} from "./gameplay-command-dispatcher";
import {
  createGameplayActionEffectRegistryV1,
  type GameplayActionEffectRegistrarV1,
  type GameplayActionEffectRegistryV1,
} from "./gameplay-action-effect-registry";

export interface GameplayFeatureFactoryContextV1 {
  readonly worldSessionId: string;
  readonly actionEffectRegistry?: GameplayActionEffectRegistryV1;
  readonly actionEffectRegistrar?: GameplayActionEffectRegistrarV1;
}

export interface GameplayFeatureActivationContextV1 {
  readonly worldSessionId: string;
  readonly actionEffectRegistry?: GameplayActionEffectRegistryV1;
  readonly actionEffectRegistrar?: GameplayActionEffectRegistrarV1;
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
function featureError(message: string): never {
  throw new Error(`FEATURE_NOT_LOCKED: ${message}`);
}

function snapshotRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || isNil(value)) return undefined;
  try {
    const prototype = Reflect.getPrototypeOf(value);
    if (prototype !== Object.prototype && !isNil(prototype)) return undefined;
    const result = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (
        typeof key !== "string" ||
        isNil(descriptor) ||
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
        isNil(descriptor) ||
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

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseCanonicalStringSet(input: unknown, name: string): readonly string[] {
  const snapshot = snapshotArray(input);
  if (isNil(snapshot)) {
    return featureError(`${name} must be an Array.`);
  }
  const values = [...snapshot];
  if (
    !values.every((value): value is string =>
      typeof value === "string" && value.length > 0
    ) ||
    new Set(values).size !== values.length
  ) return featureError(`${name} must contain unique non-empty strings.`);
  const sorted = [...values].sort(compareCodeUnits);
  if (values.some((value, index) => value !== sorted[index])) {
    return featureError(`${name} must use canonical code-unit order.`);
  }
  return Object.freeze(values);
}

function validateManifest(input: unknown): GameplayFeatureManifestV1 {
  try {
    return parseGameplayFeatureManifestV1(input);
  } catch {
    return featureError(
      "Feature manifest is not canonical or has a content hash mismatch.",
    );
  }
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
      .sort(compareCodeUnits);
    if (ready.length === 0) {
      featureError(
        `Gameplay Feature dependency cycle: ${[...remaining].sort(compareCodeUnits).join(", ")}.`,
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
    if (!record.activationStarted) continue;
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
      let lock: GameplayFeatureResourceLockV1;
      try {
        lock = parseGameplayFeatureResourceLockV1(lockInput);
      } catch {
        featureError("Resource Lock has an invalid closed shape.");
      }
      if (locksByRef.has(lock.resourceRef)) featureError(
        `Duplicate Resource Lock '${lock.resourceRef}'.`,
      );
      locksByRef.set(lock.resourceRef, lock);
    }
    const availableCapabilities = new Set(parseCanonicalStringSet(
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
        if (!isNil(owner)) {
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
      .sort(compareCodeUnits);
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
    const actionEffects = createGameplayActionEffectRegistryV1();
    const featureContext = Object.freeze({
      ...context,
      actionEffectRegistry: actionEffects.registry,
      actionEffectRegistrar: actionEffects.registrar,
    });
    const records: LifecycleRecord[] = [];
    try {
      for (const factory of this.orderedFactories) {
        const feature = factory.create(featureContext);
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
        const handlerTypes = commandHandlers.map(({ type }) => type).sort(compareCodeUnits);
        const manifestTypes = [...factory.manifest.commandTypes].sort(compareCodeUnits);
        if (
          handlerTypes.length !== manifestTypes.length ||
          handlerTypes.some((type, index) => type !== manifestTypes[index])
        ) featureError(`Feature '${feature.resourceRef}' Handler declarations do not match.`);
        record.commandHandlers = Object.freeze(commandHandlers);
      }
      for (const record of records) {
        record.stateSlice = record.feature.createStateSlice(featureContext);
      }
      for (const record of records) {
        await record.feature.prepare(featureContext, record.stateSlice);
      }
      for (const record of records) {
        record.activationStarted = true;
        await record.feature.activate(featureContext, record.stateSlice);
      }
      actionEffects.registrar.seal();
    } catch (primary) {
      const cleanupErrors = await cleanupReverse(featureContext, records);
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
          const errors = await cleanupReverse(featureContext, records);
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
