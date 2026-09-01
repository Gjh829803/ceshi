import type { GameplayWorldPortV1 } from "@whitebox-world/runtime-host";
import { describe, expect, it, vi } from "vitest";

import {
  BabylonRuntimeResidencyV1,
  wrapBabylonRuntimeOwnedGameplayWorldPortV1,
} from "./babylon-runtime-residency.js";

describe("Babylon Runtime residency", () => {
  it("owns the one current plus one Candidate invariant", () => {
    const residency = new BabylonRuntimeResidencyV1<object>();
    const current = {};
    const candidate = {};

    residency.retain("world.1", current);
    expect(residency.canRetainCandidate("world.1", "world.2")).toBe(true);
    residency.retain("world.2", candidate);

    expect(residency.canRetainCandidate("world.1", "world.3")).toBe(false);
    expect(residency.active("world.2")).toBe(candidate);
    expect(() => residency.retain("world.3", {})).toThrow(
      "WORLDKIT_BABYLON_RUNTIME_RESIDENCY_CAPACITY_EXCEEDED",
    );
    expect(residency.release("world.1", current)).toBe(true);
    expect(residency.canRetainCandidate("world.2", "world.3")).toBe(true);
  });

  it("releases a retained handle exactly once with its owned port", async () => {
    const dispose = vi.fn(async () => undefined);
    const released = vi.fn();
    const port = { dispose } as unknown as GameplayWorldPortV1;
    const owned = wrapBabylonRuntimeOwnedGameplayWorldPortV1(port, released);

    const first = owned.dispose();
    const second = owned.dispose();
    expect(second).toBe(first);
    await first;

    expect(dispose).toHaveBeenCalledOnce();
    expect(released).toHaveBeenCalledOnce();
  });
});
