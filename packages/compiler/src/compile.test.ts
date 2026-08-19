import { describe, expect, it } from "vitest";

import { normalizeAuthoringSpec } from "@whitebox-world/authoring";
import { createValidAuthoringSpec } from "../../authoring/src/test-fixture";
import { compileWorld } from "./index";

function compileSpec(spec = createValidAuthoringSpec()) {
  const normalized = normalizeAuthoringSpec(spec);
  if (!normalized.ok || normalized.value === undefined || normalized.normalizedWorldIrHash === undefined) {
    throw new Error("Fixture did not normalize.");
  }
  return compileWorld({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
  });
}

function createMultiSubjectSpec(subjectOrder: readonly ["player", "animal"] | readonly ["animal", "player"] = ["player", "animal"]) {
  const spec = createValidAuthoringSpec();
  const player = spec.nodes.find((node) => node.kind === "subject");
  if (player === undefined || player.kind !== "subject") throw new Error("Fixture subject missing.");
  const animal = {
    id: "animal",
    kind: "subject" as const,
    kitRef: "worldkit://kit/quadruped.ground-proxy@1",
    spawnAnchorEntityId: "spawn-animal",
  };
  const subjectsById = { player, animal };
  spec.nodes = [
    ...spec.nodes.filter((node) => node.kind !== "subject"),
    {
      id: "spawn-animal",
      kind: "anchor",
      transform: { positionMeters: [6, 0, 28] },
      semantic: { classId: "spawn.subject" },
    },
    ...subjectOrder.map((entityId) => subjectsById[entityId]),
  ];
  return spec;
}

function compileFixture() {
  return compileSpec();
}

describe("compileWorld", () => {
  it("compiles a fully resolved, engine-neutral Babylon/Havok execution plan", () => {
    const result = compileFixture();

    expect(result.diagnostics).toEqual([]);
    expect(result.executionPlan).toMatchObject({
      kind: "worldkit-execution-plan",
      schemaVersion: 2,
      runtimeBackend: "babylon-havok",
      controlledEntityId: "player",
      subjects: [{ entityId: "player", spawnAnchorEntityId: "spawn-main" }],
      camera: { cameraEntityId: "camera-main", targetEntityId: "player" },
    });
    expect("subject" in result.executionPlan!).toBe(false);
    expect(result.executionPlan?.objects.map((item) => item.entityId)).toEqual(["wall-east"]);
    expect(result.executionPlan?.terrain.heightSamplesMeters).toHaveLength(65 * 65);
    expect(result.executionPlan?.terrain.heightSamplesHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.executionPlan?.terrain.heightSamplesMeters.every(Number.isFinite)).toBe(true);
  });

  it("compiles every subject from its registered Kit in stable entity order", () => {
    const result = compileSpec(createMultiSubjectSpec());

    expect(result.executionPlan?.schemaVersion).toBe(2);
    expect(result.executionPlan?.controlledEntityId).toBe("player");
    expect(result.executionPlan?.subjects.map((subject) => subject.entityId)).toEqual(["animal", "player"]);
    expect(result.executionPlan?.subjects[0]).toMatchObject({
      kitRef: "worldkit://kit/quadruped.ground-proxy@1",
      bodyTopology: "quadruped",
      semanticClassId: "subject.animal.quadruped",
      collider: { kind: "capsule" },
      locomotion: { mode: "ground" },
    });
    expect(result.executionPlan?.subjects[0]?.visualParts.map((part) => part.id)).toEqual([
      "torso",
      "head",
      "front-left-leg",
      "front-right-leg",
      "back-left-leg",
      "back-right-leg",
      "tail",
    ]);
    expect(result.executionPlan?.resourceUsage).toEqual({
      vertices: 4_746,
      triangles: 8_996,
      colliders: 4,
    });
  });

  it("changes neither plan bytes nor hash when subject nodes are reordered", () => {
    const playerFirst = compileSpec(createMultiSubjectSpec(["player", "animal"]));
    const animalFirst = compileSpec(createMultiSubjectSpec(["animal", "player"]));

    expect(playerFirst.executionPlan).toEqual(animalFirst.executionPlan);
    expect(playerFirst.executionPlanHash).toBe(animalFirst.executionPlanHash);
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
