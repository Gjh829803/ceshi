import { describe, expect, it } from "vitest";

import {
  ownerLeakCountV1,
  parseRuntimeProbeRegistryV1,
  runIsolatedRuntimeProbeCyclesV1,
  RUNTIME_PROBE_REGISTRY_V1,
  ZERO_RUNTIME_OWNER_SNAPSHOT_V1,
  type RuntimeProbeCycleScriptV1,
  type RuntimeProbeRegistrationV1,
} from "./runtime-probe-registry";

function cycle(overrides: Partial<RuntimeProbeCycleScriptV1> = {}): RuntimeProbeCycleScriptV1 {
  return {
    beforeOwners: ZERO_RUNTIME_OWNER_SNAPSHOT_V1,
    afterOwners: ZERO_RUNTIME_OWNER_SNAPSHOT_V1,
    heapDeltaBytes: 0,
    construct() {},
    cleanup() {},
    ...overrides,
  };
}

const HOST = RUNTIME_PROBE_REGISTRY_V1[0] as RuntimeProbeRegistrationV1;

describe("runtime probe registry", () => {
  it("freezes the first-slice production probes and keeps BNA advisory", () => {
    const registry = parseRuntimeProbeRegistryV1();
    expect(registry.map((entry) => entry.id)).toEqual([
      "bna-candidate-determinism",
      "browser-ready-reset",
      "fixed-cadence",
      "runtime-host-lifecycle",
    ]);
    expect(registry.find((entry) => entry.id === "bna-candidate-determinism")).toMatchObject({
      kind: "candidate-determinism",
      requiredness: "advisory",
      gateId: "bna1-clean-break",
    });
    expect(registry.find((entry) => entry.id === "fixed-cadence")).toMatchObject({
      kind: "cadence",
      requiredness: "required",
      gateId: "route-r1-heightfield",
      ownerCommandId: "verify-route-r1-heightfield",
    });
    expect(registry.filter((entry) => entry.requiredness === "required")).toHaveLength(3);
  });

  it("rejects a required candidate-determinism probe", () => {
    expect(() => parseRuntimeProbeRegistryV1([{
      ...RUNTIME_PROBE_REGISTRY_V1.find((entry) => entry.id === "bna-candidate-determinism"),
      requiredness: "required",
    }])).toThrow(/advisory/i);
  });

  it("runs isolated cycles and preserves construct/cleanup failures", () => {
    const evidence = runIsolatedRuntimeProbeCyclesV1({
      registration: HOST,
      cycles: [
        cycle({
          construct() {
            throw new Error("partial construction");
          },
        }),
        cycle({
          afterOwners: { ...ZERO_RUNTIME_OWNER_SNAPSHOT_V1, timerCount: 1 },
          cleanup() {
            throw new Error("dispose failed");
          },
        }),
        cycle(),
      ],
    });
    expect(evidence.cycles).toHaveLength(3);
    expect(evidence.cycles[0]?.constructionStatus).toBe("partial-throw");
    expect(evidence.cycles[0]?.cleanupStatus).toBe("passed");
    expect(evidence.cycles[1]?.cleanupStatus).toBe("threw");
    expect(evidence.cycles[1]?.cleanupError).toBe("dispose failed");
    expect(evidence.cycles[2]?.constructionStatus).toBe("passed");
  });

  it("does not treat a heap delta as an owner leak", () => {
    expect(ownerLeakCountV1(
      ZERO_RUNTIME_OWNER_SNAPSHOT_V1,
      ZERO_RUNTIME_OWNER_SNAPSHOT_V1,
    )).toBe(0);
    expect(ownerLeakCountV1(
      ZERO_RUNTIME_OWNER_SNAPSHOT_V1,
      { ...ZERO_RUNTIME_OWNER_SNAPSHOT_V1, observableCount: 1, timerCount: 2 },
    )).toBe(3);
    const evidence = runIsolatedRuntimeProbeCyclesV1({
      registration: HOST,
      cycles: [cycle({ heapDeltaBytes: 4096 })],
    });
    expect(evidence.cycles[0]?.heapDeltaBytes).toBe(4096);
    expect(ownerLeakCountV1(evidence.cycles[0]!.beforeOwners, evidence.cycles[0]!.afterOwners)).toBe(0);
  });
});
