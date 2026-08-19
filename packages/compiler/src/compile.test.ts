import { describe, expect, it } from "vitest";

import { normalizeAuthoringSpecV2 } from "@whitebox-world/authoring";
import { createValidPackageSubjectWorldV2 } from "../../authoring/src/test-fixture";

import { compileWorldV3, sampleTerrainHeight } from "./index";

function compilePackageWorld() {
  const normalized = normalizeAuthoringSpecV2(createValidPackageSubjectWorldV2());
  if (
    !normalized.ok ||
    normalized.value === undefined ||
    normalized.normalizedWorldIrHash === undefined
  ) {
    throw new Error("Package Subject fixture did not normalize.");
  }
  return compileWorldV3({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
  });
}

describe("compileWorldV3", () => {
  it("compiles two instances from one resolved Package Definition", () => {
    const result = compilePackageWorld();

    expect(result.ok).toBe(true);
    expect(result.executionPlan?.schemaVersion).toBe(3);
    expect(
      result.executionPlan?.subjects.map((subject) => ({
        entityId: subject.entityId,
        ref: subject.subjectDefinitionRef,
        hash: subject.subjectDefinitionHash,
      })),
    ).toEqual([
      {
        entityId: "pack-animal-a",
        ref: "package://subject-definition/coastal-pack-animal@1",
        hash: expect.stringMatching(/^sha256:/),
      },
      {
        entityId: "pack-animal-b",
        ref: "package://subject-definition/coastal-pack-animal@1",
        hash: expect.stringMatching(/^sha256:/),
      },
      expect.objectContaining({ entityId: "player" }),
    ]);
    expect(result.executionPlan?.subjects[0]?.subjectDefinitionHash).toBe(
      result.executionPlan?.subjects[1]?.subjectDefinitionHash,
    );
  });

  it("places Subject Origin on sampled Terrain without adding Collider height", () => {
    const result = compilePackageWorld();
    const executionPlan = result.executionPlan!;
    const subject = executionPlan.subjects.find(
      (candidate) => candidate.entityId === "pack-animal-a",
    )!;

    expect(subject.spawnSubjectOriginPositionMetersXYZ[1]).toBeCloseTo(
      sampleTerrainHeight(executionPlan.terrain, [-4, 5]),
    );
    expect(subject.collider).toMatchObject({
      radiusMeters: 0.7,
      heightMeters: 1.4,
      centerOffsetFromSubjectOriginMetersXYZ: [0, 0.7, 0],
    });
    expect(subject.spawnSubjectOriginPositionMetersXYZ[1]).not.toBeCloseTo(
      sampleTerrainHeight(executionPlan.terrain, [-4, 5]) +
        subject.collider.heightMeters / 2,
    );
  });

  it("propagates stable Sockets and normalized visual composition", () => {
    const subject = compilePackageWorld().executionPlan!.subjects.find(
      (candidate) => candidate.entityId === "pack-animal-a",
    )!;

    expect(subject.sockets.map((socket) => socket.id)).toEqual([
      "seat.mount",
      "tow.rear",
    ]);
    expect(subject.visualParts.map((part) => part.id)).toEqual([
      "body",
      "leg.back-left",
      "leg.back-right",
      "leg.front-left",
      "leg.front-right",
    ]);
    expect(subject.visualParts[0]).toHaveProperty(
      "localTransform.positionMetersXYZ",
    );
  });

  it("aggregates resource cost once per Subject instance", () => {
    expect(compilePackageWorld().executionPlan?.resourceUsage).toEqual({
      vertices: 4_956,
      triangles: 9_380,
      colliders: 5,
    });
  });

  it("is deterministic for the same normalized input and seed", () => {
    const first = compilePackageWorld();
    const second = compilePackageWorld();

    expect(first.executionPlan).toEqual(second.executionPlan);
    expect(first.executionPlanHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.executionPlanHash).toBe(second.executionPlanHash);
  });

  it("fails before runtime construction when the plan exceeds a resource budget", () => {
    const spec = createValidPackageSubjectWorldV2();
    spec.world = {
      ...spec.world,
      resourceBudget: { ...spec.world.resourceBudget, maxVertices: 100 },
    };
    const normalized = normalizeAuthoringSpecV2(spec);
    if (
      !normalized.ok ||
      normalized.value === undefined ||
      normalized.normalizedWorldIrHash === undefined
    ) {
      throw new Error("Fixture did not normalize.");
    }

    const result = compileWorldV3({
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

  it("rejects a normalized hash that does not match the supplied V2 IR", () => {
    const normalized = normalizeAuthoringSpecV2(createValidPackageSubjectWorldV2());
    if (!normalized.ok || normalized.value === undefined) {
      throw new Error("Fixture did not normalize.");
    }

    const result = compileWorldV3({
      normalizedWorldIr: normalized.value,
      normalizedWorldIrHash: `sha256:${"0".repeat(64)}`,
    });

    expect(result).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: "COMPILER_NORMALIZED_HASH_MISMATCH",
          instancePath: "/normalizedWorldIrHash",
        },
      ],
    });
  });
});
