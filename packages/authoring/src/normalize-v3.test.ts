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
      "sha256:828f7cdbffefb754548892290624fabc788c075343d78ab7c7cae3758a162b46",
    );
    expect(normalizeAuthoringSpecV3(world(false)).normalizedWorldIrHash).toBe(
      "sha256:009b3439e52d980c9858ea80c51567e4ce0c3fd5e8e72b416c964560dc18fed8",
    );
  });
});
