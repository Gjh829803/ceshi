import { describe, expect, it, vi } from "vitest";

import { RecastProviderLifecycleV1 } from "./provider-lifecycle.js";

describe("RecastProviderLifecycleV1", () => {
  it("initializes once and serializes concurrent operations", async () => {
    const initialize = vi.fn(async () => undefined);
    const lifecycle = new RecastProviderLifecycleV1(initialize);
    let active = 0;
    let maximumActive = 0;
    const order: number[] = [];
    const operation = (id: number) => lifecycle.runExclusive(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      order.push(id);
      await Promise.resolve();
      active -= 1;
      return id;
    });

    await expect(Promise.all([operation(1), operation(2), operation(3)]))
      .resolves.toEqual([1, 2, 3]);
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(maximumActive).toBe(1);
    expect(order).toEqual([1, 2, 3]);
  });

  it("releases the mutex after a throwing operation", async () => {
    const lifecycle = new RecastProviderLifecycleV1(async () => undefined);

    await expect(lifecycle.runExclusive(async () => {
      throw new Error("expected-operation-failure");
    })).rejects.toThrow("expected-operation-failure");
    await expect(lifecycle.runExclusive(async () => "after-failure"))
      .resolves.toBe("after-failure");
  });

  it("does not enter an operation when initialization fails", async () => {
    const operation = vi.fn();
    const lifecycle = new RecastProviderLifecycleV1(async () => {
      throw new Error("expected-init-failure");
    });

    await expect(lifecycle.runExclusive(operation)).rejects.toThrow(
      "expected-init-failure",
    );
    expect(operation).not.toHaveBeenCalled();
  });
});
