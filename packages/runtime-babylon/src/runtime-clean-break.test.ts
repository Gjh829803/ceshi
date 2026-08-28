import { describe, expect, it } from "vitest";

import type { CanonicalSceneExecutionPlanV1 } from "@whitebox-world/runtime-contracts";
import { createValidPackageSubjectWorldV4 } from "@whitebox-world/authoring/testing";

import { BabylonWorldRuntime } from "./babylon-world-runtime";
import {
  compileRuntimeTestScenePlanV1,
  runtimeTestWorldArtifactsForPlanV1,
  runtimeTestWorldInputForPlanV1,
} from "./runtime-test-plan";

function validRuntimeInput() {
  const executionPlan = compileRuntimeTestScenePlanV1(
    createValidPackageSubjectWorldV4(),
  );
  return {
    executionPlan,
    runtimeInput: runtimeTestWorldInputForPlanV1(executionPlan),
  };
}

describe("Babylon Runtime current contract", () => {
  it("rejects an obsolete ExecutionPlan before creating engine resources", async () => {
    const valid = validRuntimeInput();
    const obsoletePlan = {
      schemaVersion: 4,
      runtimeBackend: "babylon-havok",
    } as unknown as CanonicalSceneExecutionPlanV1;

    await expect(BabylonWorldRuntime.create({
      ...valid.runtimeInput,
      sceneSource: {
        kind: "canonical-execution-plan",
        executionPlan: obsoletePlan,
      },
    })).rejects.toThrow("WORLDKIT_RUNTIME_CANONICAL_SCENE_PLAN_REQUIRED");
  });

  it("rejects a subject without the required capability assembly before creating engine resources", async () => {
    const valid = validRuntimeInput();
    const artifacts = runtimeTestWorldArtifactsForPlanV1(valid.executionPlan);
    const invalidBootstrap = {
      ...artifacts.worldRuntimeBootstrap,
      subjectRuntimeDescriptors:
        artifacts.worldRuntimeBootstrap.subjectRuntimeDescriptors.map(
          (descriptor, index) => index === 0
            ? { ...descriptor, capabilityAssembly: undefined }
            : descriptor,
        ),
    } as unknown as typeof artifacts.worldRuntimeBootstrap;

    await expect(BabylonWorldRuntime.create({
      ...valid.runtimeInput,
      worldRuntimeBootstrap: invalidBootstrap,
    })).rejects.toThrow("WORLDKIT_RUNTIME_CAPABILITY_ASSEMBLY_REQUIRED");
  });

  it("does not expose the retired direct control binding API", () => {
    expect("bindControl" in BabylonWorldRuntime.prototype).toBe(false);
  });
});
