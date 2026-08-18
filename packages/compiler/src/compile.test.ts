import { describe, expect, it } from "vitest";

import { normalizeAuthoringSpec } from "@whitebox-world/authoring";
import { createValidAuthoringSpec } from "../../authoring/src/test-fixture";
import { compileWorld } from "./index";

function compileFixture() {
  const normalized = normalizeAuthoringSpec(createValidAuthoringSpec());
  if (!normalized.ok || normalized.value === undefined || normalized.normalizedWorldIrHash === undefined) {
    throw new Error("Fixture did not normalize.");
  }
  return compileWorld({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
  });
}

describe("compileWorld", () => {
  it("compiles a fully resolved, engine-neutral Babylon/Havok execution plan", () => {
    const result = compileFixture();

    expect(result.diagnostics).toEqual([]);
    expect(result.executionPlan).toMatchObject({
      kind: "worldkit-execution-plan",
      schemaVersion: 1,
      runtimeBackend: "babylon-havok",
      subject: { entityId: "player", spawnAnchorEntityId: "spawn-main" },
      camera: { cameraEntityId: "camera-main", targetEntityId: "player" },
    });
    expect(result.executionPlan?.objects.map((item) => item.entityId)).toEqual(["wall-east"]);
    expect(result.executionPlan?.terrain.heightSamplesMeters).toHaveLength(65 * 65);
    expect(result.executionPlan?.terrain.heightSamplesHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.executionPlan?.terrain.heightSamplesMeters.every(Number.isFinite)).toBe(true);
  });

  it("is deterministic for the same normalized input and seed", () => {
    const first = compileFixture();
    const second = compileFixture();

    expect(first.executionPlan).toEqual(second.executionPlan);
    expect(first.executionPlanHash).toBe(second.executionPlanHash);
  });

  it("fails before runtime construction when the resolved plan exceeds a resource budget", () => {
    const spec = createValidAuthoringSpec();
    spec.world.resourceBudget.maxVertices = 100;
    const normalized = normalizeAuthoringSpec(spec);
    if (!normalized.ok || normalized.value === undefined || normalized.normalizedWorldIrHash === undefined) {
      throw new Error("Fixture did not normalize.");
    }

    const result = compileWorld({
      normalizedWorldIr: normalized.value,
      normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    });

    expect(result.ok).toBe(false);
    expect(result.executionPlan).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "COMPILER_RESOURCE_BUDGET_EXCEEDED",
        instancePath: "/world/resourceBudget/maxVertices",
      }),
    );
  });

  it("rejects a normalized hash that does not match the supplied IR", () => {
    const normalized = normalizeAuthoringSpec(createValidAuthoringSpec());
    if (!normalized.ok || normalized.value === undefined) throw new Error("Fixture did not normalize.");

    const result = compileWorld({
      normalizedWorldIr: normalized.value,
      normalizedWorldIrHash: `sha256:${"0".repeat(64)}`,
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [{ code: "COMPILER_NORMALIZED_HASH_MISMATCH", instancePath: "/normalizedWorldIrHash" }],
    });
  });
});
