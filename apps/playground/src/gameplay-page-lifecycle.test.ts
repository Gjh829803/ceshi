import { describe, expect, it } from "vitest";

import { createGameplayPageLifecycle } from "./gameplay-page-lifecycle.js";

describe("createGameplayPageLifecycle", () => {
  it("transfers a ready RuntimeHost adapter to page setup exactly once", async () => {
    const adapter = Object.freeze({ id: "runtime-adapter" });
    const events: string[] = [];
    const lifecycle = createGameplayPageLifecycle({
      initialization: Promise.resolve(adapter),
      getAdapter: () => adapter,
      setup: async (value) => {
        events.push(`setup:${value.id}`);
      },
      disposeRuntimeHost: async () => {
        events.push("dispose");
      },
    });

    await expect(Promise.all([
      lifecycle.completeSetup(),
      lifecycle.completeSetup(),
    ])).resolves.toEqual([true, true]);
    expect(events).toEqual(["setup:runtime-adapter"]);

    await Promise.all([lifecycle.dispose(), lifecycle.dispose()]);
    expect(events).toEqual(["setup:runtime-adapter", "dispose"]);
  });

  it("rolls back partial page state and disposes RuntimeHost once when setup throws", async () => {
    const adapter = Object.freeze({ id: "runtime-adapter" });
    const events: string[] = [];
    const lifecycle = createGameplayPageLifecycle({
      initialization: Promise.resolve(adapter),
      getAdapter: () => adapter,
      setup: async () => {
        events.push("setup");
        throw new Error("subscription failed");
      },
      rollbackPageState: async () => {
        events.push("rollback");
        throw new Error("rollback also failed");
      },
      disposeRuntimeHost: async () => {
        events.push("dispose");
        throw new Error("dispose also failed");
      },
    });

    await expect(lifecycle.completeSetup()).rejects.toThrow("subscription failed");
    await expect(lifecycle.completeSetup()).rejects.toThrow("subscription failed");
    await expect(lifecycle.dispose()).rejects.toThrow("dispose also failed");
    expect(events).toEqual(["setup", "rollback", "dispose"]);
  });

  it("does not mount or dispose when Browser V5 initialization fails closed", async () => {
    const events: string[] = [];
    const lifecycle = createGameplayPageLifecycle({
      initialization: Promise.resolve(undefined),
      getAdapter: () => ({ id: "stale-adapter" }),
      setup: () => {
        events.push("setup");
      },
      disposeRuntimeHost: async () => {
        events.push("dispose");
      },
    });

    await expect(lifecycle.completeSetup()).resolves.toBe(false);
    expect(events).toEqual([]);
  });

  it("cleans up once when initialization itself rejects after partial construction", async () => {
    const events: string[] = [];
    const lifecycle = createGameplayPageLifecycle({
      initialization: Promise.reject(new Error("initialization failed")),
      getAdapter: () => null,
      setup: () => {
        events.push("setup");
      },
      rollbackPageState: () => {
        events.push("rollback");
      },
      disposeRuntimeHost: async () => {
        events.push("dispose");
      },
    });

    await expect(lifecycle.completeSetup()).rejects.toThrow("initialization failed");
    await lifecycle.dispose();
    expect(events).toEqual(["rollback", "dispose"]);
  });
});
