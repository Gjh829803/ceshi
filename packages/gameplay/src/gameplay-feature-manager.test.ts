import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
  createGameplayFeatureManifestV1,
  type GameplayFeatureManifestBodyV1,
} from "@whitebox-world/gameplay-contracts";

import {
  GameplayFeatureManager,
  type GameplayFeatureFactoryV1,
} from "./gameplay-feature-manager";

const HASH = `sha256:${"a".repeat(64)}` as const;

function manifestBody(
  resourceRef: string,
  overrides: Partial<GameplayFeatureManifestBodyV1> = {},
): GameplayFeatureManifestBodyV1 {
  return {
    kind: "gameplay-feature",
    id: resourceRef.split("/").at(-1) ?? resourceRef,
    version: 1,
    resourceRef,
    dependencyFeatureRefs: [],
    requiredCapabilityRefs: [],
    commandTypes: [],
    resourceBudget: { stateSliceCount: 1, commandHandlerCount: 0 },
    ...overrides,
  };
}

function factory(
  resourceRef: string,
  log: string[],
  overrides: Partial<GameplayFeatureFactoryV1> = {},
): GameplayFeatureFactoryV1 {
  const manifest = createGameplayFeatureManifestV1(manifestBody(resourceRef));
  return {
    manifest,
    create: () => ({
      resourceRef,
      commandHandlers: [],
      createStateSlice: () => {
        log.push(`slice:${resourceRef}`);
        return { resourceRef };
      },
      prepare: () => { log.push(`prepare:${resourceRef}`); },
      activate: () => { log.push(`activate:${resourceRef}`); },
      deactivate: () => { log.push(`deactivate:${resourceRef}`); },
      dispose: () => { log.push(`dispose:${resourceRef}`); },
    }),
    ...overrides,
  };
}

function manager(factories: readonly GameplayFeatureFactoryV1[], caps: readonly string[] = []) {
  return new GameplayFeatureManager({
    factories,
    resourceLocks: factories.map(({ manifest }) => ({
      resourceRef: manifest.resourceRef,
      contentHash: manifest.contentHash,
    })),
    availableCapabilityRefs: caps,
    capacityBudget: DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
  });
}

describe("GameplayFeatureManager", () => {
  it("validates locks, counts, dependencies, capabilities, cycles, and duplicate handlers before factories", () => {
    const create = vi.fn(() => { throw new Error("must not create"); });
    const aManifest = createGameplayFeatureManifestV1(manifestBody("feature:a", {
      dependencyFeatureRefs: ["feature:missing"],
    }));
    expect(() => new GameplayFeatureManager({
      factories: [{ manifest: aManifest, create }],
      resourceLocks: [{ resourceRef: "feature:a", contentHash: HASH }],
      availableCapabilityRefs: [],
      capacityBudget: DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
    })).toThrow();
    expect(create).not.toHaveBeenCalled();

    const duplicateHandlerFactories = ["a", "b"].map((id) => {
      const manifest = createGameplayFeatureManifestV1(manifestBody(`feature:${id}`, {
        commandTypes: ["control.bind"],
        resourceBudget: { stateSliceCount: 1, commandHandlerCount: 1 },
      }));
      return { manifest, create };
    });
    expect(() => manager(duplicateHandlerFactories)).toThrow(/Duplicate.*control.bind/);
    expect(create).not.toHaveBeenCalled();

    const cycleA = factory("feature:cycle-a", [], {
      manifest: createGameplayFeatureManifestV1(manifestBody("feature:cycle-a", {
        dependencyFeatureRefs: ["feature:cycle-b"],
      })),
    });
    const cycleB = factory("feature:cycle-b", [], {
      manifest: createGameplayFeatureManifestV1(manifestBody("feature:cycle-b", {
        dependencyFeatureRefs: ["feature:cycle-a"],
      })),
    });
    expect(() => manager([cycleA, cycleB])).toThrow(/cycle/i);

    const capabilityFactory = factory("feature:cap", [], {
      manifest: createGameplayFeatureManifestV1(manifestBody("feature:cap", {
        requiredCapabilityRefs: ["cap:required"],
      })),
    });
    expect(() => manager([capabilityFactory])).toThrow(/cap:required/);

    const validManifest = createGameplayFeatureManifestV1(manifestBody("feature:hash"));
    expect(() => new GameplayFeatureManager({
      factories: [{
        manifest: { ...validManifest, contentHash: HASH },
        create,
      }],
      resourceLocks: [{ resourceRef: "feature:hash", contentHash: HASH }],
      availableCapabilityRefs: [],
      capacityBudget: DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
    })).toThrow(/content hash/);
    expect(create).not.toHaveBeenCalled();
  });

  it("requires the Resource Lock set to exactly equal the factory manifest set", () => {
    expect(() => new GameplayFeatureManager({
      factories: [],
      resourceLocks: [{ resourceRef: "feature:surplus", contentHash: HASH }],
      availableCapabilityRefs: [],
      capacityBudget: DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
    })).toThrow(/surplus|exact/i);

    const log: string[] = [];
    const a = factory("feature:a", log);
    const create = vi.spyOn(a, "create");
    expect(() => new GameplayFeatureManager({
      factories: [a],
      resourceLocks: [
        { resourceRef: a.manifest.resourceRef, contentHash: a.manifest.contentHash },
        { resourceRef: "feature:surplus", contentHash: HASH },
      ],
      availableCapabilityRefs: [],
      capacityBudget: DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
    })).toThrow(/surplus|exact/i);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects accessor-backed lock/capability arrays without invoking them", () => {
    const lockGetter = vi.fn(() => ({
      resourceRef: "feature:side-effect",
      contentHash: HASH,
    }));
    const resourceLocks: Array<{ resourceRef: string; contentHash: typeof HASH }> = [];
    Object.defineProperty(resourceLocks, "0", {
      enumerable: true,
      configurable: true,
      get: lockGetter,
    });
    resourceLocks.length = 1;
    expect(() => new GameplayFeatureManager({
      factories: [],
      resourceLocks,
      availableCapabilityRefs: [],
      capacityBudget: DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
    })).toThrow();
    expect(lockGetter).not.toHaveBeenCalled();

    const capabilityGetter = vi.fn(() => "capability:side-effect");
    const capabilityRefs: string[] = [];
    Object.defineProperty(capabilityRefs, "0", {
      enumerable: true,
      configurable: true,
      get: capabilityGetter,
    });
    capabilityRefs.length = 1;
    expect(() => new GameplayFeatureManager({
      factories: [],
      resourceLocks: [],
      availableCapabilityRefs: capabilityRefs,
      capacityBudget: DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
    })).toThrow();
    expect(capabilityGetter).not.toHaveBeenCalled();
  });

  it("rejects non-canonical serialized manifests instead of normalizing them", () => {
    const canonical = createGameplayFeatureManifestV1(manifestBody("feature:strict", {
      dependencyFeatureRefs: ["feature:a", "feature:z"],
    }));
    const nonCanonical = {
      ...canonical,
      dependencyFeatureRefs: [...canonical.dependencyFeatureRefs].reverse(),
    };
    expect(() => new GameplayFeatureManager({
      factories: [{ manifest: nonCanonical, create: vi.fn() }],
      resourceLocks: [{
        resourceRef: canonical.resourceRef,
        contentHash: canonical.contentHash,
      }],
      availableCapabilityRefs: [],
      capacityBudget: DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
    })).toThrow(/FEATURE_NOT_LOCKED/);
  });

  it("rejects a non-canonical available Capability Ref set", () => {
    expect(() => new GameplayFeatureManager({
      factories: [],
      resourceLocks: [],
      availableCapabilityRefs: ["capability:ä", "capability:z"],
      capacityBudget: DEFAULT_GAMEPLAY_CAPACITY_BUDGET_V1,
    })).toThrow(/canonical code-unit order/);
  });

  it("uses code-unit order for independent Feature activation", async () => {
    const log: string[] = [];
    const z = factory("feature:z", log);
    const umlaut = factory("feature:ä", log);
    const handle = await manager([umlaut, z]).activate({ worldSessionId: "world-a" });
    expect(handle.activeFeatureRefs).toEqual(["feature:z", "feature:ä"]);
    await handle.dispose();
  });

  it("activates in stable topological order regardless of input order", async () => {
    const log: string[] = [];
    const a = factory("feature:a", log);
    const b = factory("feature:b", log, {
      manifest: createGameplayFeatureManifestV1(manifestBody("feature:b", {
        dependencyFeatureRefs: ["feature:a"],
      })),
    });
    const handle = await manager([b, a]).activate({ worldSessionId: "world-a" });
    expect(handle.activeFeatureRefs).toEqual(["feature:a", "feature:b"]);
    expect(log).toEqual([
      "slice:feature:a", "slice:feature:b",
      "prepare:feature:a", "prepare:feature:b",
      "activate:feature:a", "activate:feature:b",
    ]);
    await handle.dispose();
    expect(log.slice(-4)).toEqual([
      "deactivate:feature:b", "deactivate:feature:a",
      "dispose:feature:b", "dispose:feature:a",
    ]);
  });

  it("creates fresh instances per WorldSession and shares one idempotent dispose promise", async () => {
    const log: string[] = [];
    let instance = 0;
    const base = factory("feature:a", log);
    const create = vi.fn(() => {
      instance += 1;
      return base.create({ worldSessionId: `factory-${instance}` });
    });
    const first = await manager([{ ...base, create }]).activate({ worldSessionId: "world-a" });
    const promiseA = first.dispose();
    const promiseB = first.dispose();
    expect(promiseA).toBe(promiseB);
    await promiseA;
    const second = await manager([{ ...base, create }]).activate({ worldSessionId: "world-b" });
    await second.dispose();
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("preserves the primary activation failure and aggregates reverse cleanup failures", async () => {
    const log: string[] = [];
    const primary = new Error("primary activation");
    const cleanup = new Error("cleanup failure");
    const a = factory("feature:a", log, {
      create: () => ({
        ...factory("feature:a", log).create({ worldSessionId: "inner" }),
        deactivate: () => { log.push("deactivate:feature:a"); throw cleanup; },
      }),
    });
    const b = factory("feature:b", log, {
      create: () => ({
        ...factory("feature:b", log).create({ worldSessionId: "inner" }),
        activate: () => { log.push("activate:feature:b"); throw primary; },
      }),
    });
    await expect(manager([a, b]).activate({ worldSessionId: "world-a" }))
      .rejects.toMatchObject({ errors: [primary, cleanup] });
    expect(log).toContain("dispose:feature:a");
    expect(log).toContain("dispose:feature:b");
  });

  it("deactivates then disposes a successfully activated stateless Feature", async () => {
    const log: string[] = [];
    const base = factory("feature:stateless", log);
    const stateless: GameplayFeatureFactoryV1 = {
      ...base,
      create: (context) => ({
        ...base.create(context),
        createStateSlice: () => {
          log.push("slice:feature:stateless");
          return undefined;
        },
      }),
    };
    const handle = await manager([stateless]).activate({ worldSessionId: "world-a" });
    await handle.dispose();
    expect(log).toEqual([
      "slice:feature:stateless",
      "prepare:feature:stateless",
      "activate:feature:stateless",
      "deactivate:feature:stateless",
      "dispose:feature:stateless",
    ]);
  });

  it("deactivates and disposes a stateless Feature whose activation throws", async () => {
    const log: string[] = [];
    const primary = new Error("stateless activation failed");
    const base = factory("feature:stateless-failure", log);
    const stateless: GameplayFeatureFactoryV1 = {
      ...base,
      create: (context) => ({
        ...base.create(context),
        createStateSlice: () => {
          log.push("slice:feature:stateless-failure");
          return undefined;
        },
        activate: () => {
          log.push("activate:feature:stateless-failure");
          throw primary;
        },
      }),
    };
    await expect(manager([stateless]).activate({ worldSessionId: "world-a" }))
      .rejects.toBe(primary);
    expect(log).toEqual([
      "slice:feature:stateless-failure",
      "prepare:feature:stateless-failure",
      "activate:feature:stateless-failure",
      "deactivate:feature:stateless-failure",
      "dispose:feature:stateless-failure",
    ]);
  });

  it.each(["resource-ref", "handlers"] as const)(
    "disposes a returned instance after %s validation fails",
    async (failure) => {
      const log: string[] = [];
      const base = factory("feature:a", log);
      const invalid: GameplayFeatureFactoryV1 = {
        ...base,
        create: (context) => ({
          ...base.create(context),
          ...(failure === "resource-ref"
            ? { resourceRef: "feature:wrong" }
            : {
                commandHandlers: [{
                  type: "control.bind" as const,
                  plan: () => ({
                    status: "rejected" as const,
                    diagnostic: {
                      code: "GAMEPLAY_RULE_REJECTED" as const,
                      message: "unused",
                    },
                  }),
                }],
              }),
        }),
      };
      await expect(manager([invalid]).activate({ worldSessionId: "world-a" }))
        .rejects.toThrow();
      expect(log).toEqual(["dispose:feature:a"]);
    },
  );

  it("aggregates returned-instance cleanup failure behind the validation error", async () => {
    const primaryPattern = /Factory returned/;
    const cleanup = new Error("cleanup failed");
    const base = factory("feature:a", []);
    const invalid: GameplayFeatureFactoryV1 = {
      ...base,
      create: (context) => ({
        ...base.create(context),
        resourceRef: "feature:wrong",
        dispose: () => { throw cleanup; },
      }),
    };
    try {
      await manager([invalid]).activate({ worldSessionId: "world-a" });
      throw new Error("expected activation failure");
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      const errors = (error as AggregateError).errors;
      expect(errors).toHaveLength(2);
      expect((errors[0] as Error).message).toMatch(primaryPattern);
      expect(errors[1]).toBe(cleanup);
    }
  });

  it("rejects a declared Handler whose plan member is not executable and disposes it", async () => {
    const log: string[] = [];
    const manifest = createGameplayFeatureManifestV1(manifestBody("feature:handler-shape", {
      commandTypes: ["control.bind"],
      resourceBudget: { stateSliceCount: 1, commandHandlerCount: 1 },
    }));
    const invalid: GameplayFeatureFactoryV1 = {
      manifest,
      create: () => ({
        resourceRef: manifest.resourceRef,
        commandHandlers: [{
          type: "control.bind",
          plan: 123,
        } as never],
        createStateSlice: () => {
          log.push("slice");
          return {};
        },
        prepare: () => undefined,
        activate: () => undefined,
        deactivate: () => undefined,
        dispose: () => { log.push("dispose"); },
      }),
    };
    await expect(manager([invalid]).activate({ worldSessionId: "world-a" }))
      .rejects.toThrow(/Handler/);
    expect(log).toEqual(["dispose"]);
  });

  it.each(["factory", "slice", "prepare"] as const)(
    "cleans earlier instances when %s creation stage fails",
    async (stage) => {
      const log: string[] = [];
      const primary = new Error(`${stage} failed`);
      const a = factory("feature:a", log);
      const baseB = factory("feature:b", log);
      const b: GameplayFeatureFactoryV1 = stage === "factory"
        ? { ...baseB, create: () => { throw primary; } }
        : {
            ...baseB,
            create: (context) => ({
              ...baseB.create(context),
              ...(stage === "slice"
                ? { createStateSlice: () => { throw primary; } }
                : { prepare: () => { throw primary; } }),
            }),
          };
      await expect(manager([a, b]).activate({ worldSessionId: "world-a" }))
        .rejects.toBe(primary);
      expect(log).toContain("dispose:feature:a");
      if (stage !== "factory") expect(log).toContain("dispose:feature:b");
      expect(log.some((entry) => entry.startsWith("activate:"))).toBe(false);
    },
  );
});
