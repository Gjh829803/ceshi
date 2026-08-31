import type {
  FixedInputOneTickV1,
  GameplayFixedTickActionProjectionV1,
  GameplayWorldPortV1,
  GameplayWorldTransactionV1,
} from "@whitebox-world/runtime-host";
import { isNil } from "lodash-es";

const MAXIMUM_CONCURRENT_RESIDENT_WORLD_COUNT = 2;

export class BabylonRuntimeResidencyV1<Handle> {
  readonly #handlesByWorldSessionId = new Map<string, Handle>();

  get size(): number {
    return this.#handlesByWorldSessionId.size;
  }

  has(worldSessionId: string): boolean {
    return this.#handlesByWorldSessionId.has(worldSessionId);
  }

  get(worldSessionId: string): Handle | undefined {
    return this.#handlesByWorldSessionId.get(worldSessionId);
  }

  values(): IterableIterator<Handle> {
    return this.#handlesByWorldSessionId.values();
  }

  canRetainCandidate(
    currentWorldSessionId: string,
    candidateWorldSessionId: string,
  ): boolean {
    return this.has(currentWorldSessionId) &&
      !this.has(candidateWorldSessionId) &&
      this.size < MAXIMUM_CONCURRENT_RESIDENT_WORLD_COUNT;
  }

  retain(worldSessionId: string, handle: Handle): void {
    if (
      this.has(worldSessionId) ||
      this.size >= MAXIMUM_CONCURRENT_RESIDENT_WORLD_COUNT
    ) {
      throw new Error(
        "WORLDKIT_BABYLON_RUNTIME_RESIDENCY_CAPACITY_EXCEEDED",
      );
    }
    this.#handlesByWorldSessionId.set(worldSessionId, handle);
  }

  release(worldSessionId: string, expectedHandle: Handle): boolean {
    if (this.get(worldSessionId) !== expectedHandle) return false;
    return this.#handlesByWorldSessionId.delete(worldSessionId);
  }

  active(worldSessionId: string): Handle {
    const handle = this.get(worldSessionId);
    if (isNil(handle)) {
      throw new Error("WORLDKIT_BABYLON_RUNTIME_HANDLE_UNAVAILABLE");
    }
    return handle;
  }

  clear(): void {
    this.#handlesByWorldSessionId.clear();
  }
}

export function wrapBabylonRuntimeOwnedGameplayWorldPortV1(
  port: GameplayWorldPortV1,
  onDisposed: () => void,
): GameplayWorldPortV1 {
  type PreparedPortV1 = GameplayWorldPortV1 & Readonly<{
    prepareFixedInputTick?: (
      input: FixedInputOneTickV1,
      actionProjection: GameplayFixedTickActionProjectionV1,
    ) => Promise<GameplayWorldTransactionV1>;
  }>;
  const preparedPort = port as PreparedPortV1;
  const prepareFixedInputTick = preparedPort.prepareFixedInputTick;
  let disposePromise: Promise<void> | undefined;
  const owned: PreparedPortV1 = {
    initialize: () => port.initialize(),
    hasEntity: (entityId) => port.hasEntity(entityId),
    isEntityControllable: (entityId) => port.isEntityControllable(entityId),
    isActionAvailable: (actorEntityId, semanticActionRef, transition) =>
      port.isActionAvailable(actorEntityId, semanticActionRef, transition),
    prepareGameplayTransition: (transition) =>
      port.prepareGameplayTransition(transition),
    estimateFixedInputTickCapacity: (input) =>
      port.estimateFixedInputTickCapacity(input),
    runFixedInputTick: (input, actionProjection) =>
      port.runFixedInputTick(input, actionProjection),
    snapshot: () => port.snapshot(),
    dispose: () => {
      if (!isNil(disposePromise)) return disposePromise;
      disposePromise = Promise.resolve(port.dispose()).finally(onDisposed);
      return disposePromise;
    },
  };
  if (typeof prepareFixedInputTick === "function") {
    Object.defineProperty(owned, "prepareFixedInputTick", {
      enumerable: false,
      configurable: false,
      writable: false,
      value: (
        input: FixedInputOneTickV1,
        projection: GameplayFixedTickActionProjectionV1,
      ) => Reflect.apply(prepareFixedInputTick, port, [input, projection]),
    });
  }
  return Object.freeze(owned);
}
