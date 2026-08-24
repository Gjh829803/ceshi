import { describe, expect, it } from "vitest";

import type { ExecutionPlanV5 } from "@whitebox-world/runtime-contracts";

import { BabylonWorldRuntime } from "./babylon-world-runtime";

describe("Babylon Runtime current contract", () => {
  it("rejects an obsolete ExecutionPlan before creating engine resources", async () => {
    const obsoletePlan = {
      schemaVersion: 4,
      runtimeBackend: "babylon-havok",
    } as unknown as ExecutionPlanV5;

    await expect(BabylonWorldRuntime.create({
      executionPlan: obsoletePlan,
    })).rejects.toThrow("WORLDKIT_RUNTIME_EXECUTION_PLAN_V5_REQUIRED");
  });

  it("rejects a subject without the required capability assembly before creating engine resources", async () => {
    const invalidPlan = {
      schemaVersion: 5,
      runtimeBackend: "babylon-havok",
      subjects: [{ entityId: "subject-a" }],
    } as unknown as ExecutionPlanV5;

    await expect(BabylonWorldRuntime.create({
      executionPlan: invalidPlan,
    })).rejects.toThrow("WORLDKIT_RUNTIME_CAPABILITY_ASSEMBLY_REQUIRED");
  });

  it("does not expose the retired direct control binding API", () => {
    expect("bindControl" in BabylonWorldRuntime.prototype).toBe(false);
  });
});
