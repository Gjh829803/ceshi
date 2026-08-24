import { isNil } from "lodash-es";

export interface GameplayPageLifecycleOptionsV1<Adapter> {
  readonly initialization: Promise<unknown | undefined>;
  readonly getAdapter: () => Adapter | null;
  readonly setup: (adapter: Adapter) => void | Promise<void>;
  readonly rollbackPageState?: () => void | Promise<void>;
  readonly disposeRuntimeHost: () => void | Promise<void>;
}

export interface GameplayPageLifecycleV1 {
  completeSetup(): Promise<boolean>;
  dispose(): Promise<void>;
}

/** Owns the one-way handoff from Browser V5 initialization to page UI. */
export function createGameplayPageLifecycle<Adapter>(
  options: GameplayPageLifecycleOptionsV1<Adapter>,
): GameplayPageLifecycleV1 {
  let setupPromise: Promise<boolean> | undefined;
  let disposalPromise: Promise<void> | undefined;

  const dispose = (): Promise<void> => {
    if (isNil(disposalPromise)) {
      disposalPromise = Promise.resolve().then(() => options.disposeRuntimeHost());
    }
    return disposalPromise;
  };

  const completeSetup = (): Promise<boolean> => {
    if (!isNil(setupPromise)) return setupPromise;
    setupPromise = (async () => {
      try {
        const initialized = await options.initialization;
        if (isNil(initialized)) return false;
        const adapter = options.getAdapter();
        if (isNil(adapter)) {
          throw new Error("WORLDKIT_GAMEPLAY_PAGE_ADAPTER_MISSING");
        }
        await options.setup(adapter);
        return true;
      } catch (error) {
        try {
          await options.rollbackPageState?.();
        } catch {
          // Preserve the primary setup failure.
        }
        try {
          await dispose();
        } catch {
          // Preserve the primary setup failure.
        }
        throw error;
      }
    })();
    return setupPromise;
  };

  return Object.freeze({ completeSetup, dispose });
}
