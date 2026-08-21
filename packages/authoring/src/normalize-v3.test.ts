import { describe, expect, it } from "vitest";

import {
  normalizeAuthoringSpecV3,
  type AuthoringSpecV3,
} from "./index.js";
import { createValidAuthoringSpec } from "./test-fixture.js";

function world(solved: boolean): AuthoringSpecV3 {
  const base = createValidAuthoringSpec();
  if (!solved) return base;
  return {
    ...base,
    spatial: {
      regions: [{
        id: "spawn-zone",
        kind: "polygon-xz",
        pointsMetersXZ: [[-4, -4], [4, -4], [4, 4], [-4, 4]],
        semanticClassId: "terrain.spawn-zone",
      }],
      routes: [],
      screenRegions: [],
    },
    nodes: base.nodes.map((node) =>
      node.id === "spawn-main" && node.kind === "anchor"
        ? {
            ...node,
            placement: {
              kind: "solved" as const,
              placementConstraintIds: ["spawn-inside", "spawn-supported"],
            },
          }
        : node
    ),
    constraints: {
      placements: [
        {
          id: "spawn-inside",
          kind: "inside-region",
          requirement: "required",
          entityId: "spawn-main",
          regionId: "spawn-zone",
          boundaryClearanceMeters: 0,
        },
        {
          id: "spawn-supported",
          kind: "supported-by",
          requirement: "required",
          supportedEntityId: "spawn-main",
          supportingEntityId: "terrain-main",
          maximumSupportGapMeters: 0,
          minimumSupportRatio: 1,
        },
      ],
    },
  };
}

describe("normalizeAuthoringSpecV3", () => {
  it("solves final transforms, preserves fixed transforms, and binds Subject to the solved spawn", () => {
    const first = normalizeAuthoringSpecV3(world(true));
    const second = normalizeAuthoringSpecV3(world(true));

    expect(first.ok).toBe(true);
    expect(first.layoutSolveReport?.status).toBe("solved");
    expect(first.layoutSolveReportHash).toBe(second.layoutSolveReportHash);
    expect(first.normalizedWorldIrHash).toBe(second.normalizedWorldIrHash);
    expect(first.value).toMatchObject({
      kind: "worldkit-normalized-world",
      schemaVersion: 3,
      layout: {
        solverProfileRef: "worldkit://layout-solver-profile/outdoor.s1@1",
        layoutSolveReportHash: first.layoutSolveReportHash,
        assertions: expect.arrayContaining([
          expect.objectContaining({ constraintId: "spawn-inside", kind: "inside-region" }),
          expect.objectContaining({ constraintId: "spawn-supported", kind: "supported-by" }),
        ]),
      },
    });
    expect(first.value?.nodes.find((node) => node.id === "wall-east")).toMatchObject({
      id: "wall-east",
      transform: { positionMetersXYZ: [12, 2, 10] },
      placementProvenance: { kind: "fixed", candidateId: expect.any(String) },
    });
    expect(first.value?.nodes.find((node) => node.id === "spawn-main")).toMatchObject({
      id: "spawn-main",
      transform: { positionMetersXYZ: expect.any(Array) },
      placementProvenance: {
        kind: "solved",
        candidateId: expect.any(String),
        placementConstraintIds: ["spawn-inside", "spawn-supported"],
        solverProfileRef: "worldkit://layout-solver-profile/outdoor.s1@1",
        layoutSolveReportHash: first.layoutSolveReportHash,
      },
    });
    expect(first.value?.nodes.find((node) => node.id === "player")).toMatchObject({
      id: "player",
      kind: "subject",
      spawnAnchorEntityId: "spawn-main",
    });
    const serialized = JSON.stringify(first.value);
    expect(serialized).not.toMatch(/sourceUri|licenseUri|providerHandle|Babylon|Havok/);
    expect(serialized).not.toContain('"constraints"');
    expect(serialized).not.toContain('"candidateRegionIds"');
  });

  it("returns no IR when a Required placement constraint is unsatisfied", () => {
    const source = world(true);
    const impossible = {
      ...source,
      constraints: {
        placements: source.constraints.placements.map((constraint) =>
          constraint.id === "spawn-inside"
            ? { ...constraint, boundaryClearanceMeters: 100 }
            : constraint
        ),
      },
    } as AuthoringSpecV3;
    const result = normalizeAuthoringSpecV3(impossible);

    expect(result.ok).toBe(false);
    expect(result.value).toBeUndefined();
    expect(result.normalizedWorldIrHash).toBeUndefined();
    expect(result.layoutSolveReport?.status).toBe("unsatisfied");
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "PLACEMENT_REQUIRED_CONSTRAINT_UNSATISFIED" }),
    ]));
  });

  it("locks exact solved and all-fixed Normalized IR hashes", () => {
    expect(normalizeAuthoringSpecV3(world(true)).normalizedWorldIrHash).toBe(
      "sha256:31cf04c93fd6be3b649f4bbd9ecd8581d63d8e9de11da2ee72caf75bfba6269f",
    );
    expect(normalizeAuthoringSpecV3(world(false)).normalizedWorldIrHash).toBe(
      "sha256:26cd2e5a2a040b9ed99c6348941393ebb53bc7173faea90db35ef9b21bb50cc2",
    );
  });
});
