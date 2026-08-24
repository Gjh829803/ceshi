import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import {
  assertRouteBuildInputV2,
  assertRouteBuildInputReceiptV2,
  createRouteBuildInputReceiptV2,
  hashRouteBuildInputV2,
  hashRouteColliderArtifactV2,
  hashRouteGeometryArtifactV2,
  hashRouteSurfaceArtifactV2,
  hashRouteTerrainArtifactV2,
} from "./index.js";
import {
  capabilityEnvelope,
  deepFreeze,
  HASH_A,
  terrainSoup,
  validV2BuildInputDraft,
  type RouteBuildInputV2Draft,
} from "./route-v2-test-support.js";

function completeV2Input(
  draft: RouteBuildInputV2Draft = validV2BuildInputDraft() as RouteBuildInputV2Draft,
) {
  const terrainArtifactHash = hashRouteTerrainArtifactV2(draft.terrainSource);
  const colliderArtifactHash = hashRouteColliderArtifactV2(draft.staticColliders);
  const geometryArtifactHash = hashRouteGeometryArtifactV2({
    terrainArtifactHash,
    colliderArtifactHash,
  });
  const surfaceArtifactHash = hashRouteSurfaceArtifactV2(draft.traversalSurfaces);
  return {
    ...draft,
    terrainArtifactHash,
    colliderArtifactHash,
    geometryArtifactHash,
    surfaceArtifactHash,
  };
}

function freezeEnvelopeClone(
  envelope: ReturnType<typeof capabilityEnvelope>,
  patch: Record<string, unknown>,
) {
  return deepFreeze({ ...structuredClone(envelope), ...patch });
}

describe("RouteBuildInputV2", () => {
  it("rejects leftover V1 fields on V2 Build Input", () => {
    const v2 = completeV2Input();
    expect(() => assertRouteBuildInputV2({
      ...v2,
      blockingColliders: [],
    })).toThrow("ROUTE_BUILD_INPUT_INVALID");
    expect(() => assertRouteBuildInputV2({
      ...v2,
      terrainSource: {
        ...v2.terrainSource,
        terrainArtifactHash: HASH_A,
      },
    })).toThrow("ROUTE_BUILD_INPUT_INVALID");
  });

  it("admits one Heightfield surface, one bound platform, and one unbound wall", () => {
    const input = completeV2Input();
    const admitted = assertRouteBuildInputV2(input);
    expect(
      admitted.traversalSurfaces.map((surface) => surface.traversalSurfaceId),
    ).toEqual(
      [...admitted.traversalSurfaces.map((surface) => surface.traversalSurfaceId)].sort(),
    );
    expect(admitted.staticColliders).toHaveLength(2);
    expect(admitted.traversalSurfaces).toHaveLength(2);
    expect(admitted.geometryArtifactHash).toBe(sha256CanonicalJson({
      terrainArtifactHash: admitted.terrainArtifactHash,
      colliderArtifactHash: admitted.colliderArtifactHash,
    }));
    const receipt = createRouteBuildInputReceiptV2(input);
    expect(receipt.routeBuildInputHash).toBe(sha256CanonicalJson(receipt.input));
    expect(receipt.routeBuildInputHash).toBe(hashRouteBuildInputV2(input));
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(assertRouteBuildInputReceiptV2(receipt)).toEqual(receipt);
  });

  it("rejects reordered arrays, duplicate surfaces, zero/multi terrain surfaces, missing joins, stale hashes, and extra fields", () => {
    const input = completeV2Input();
    expect(() => assertRouteBuildInputV2({
      ...input,
      traversalSurfaces: [...input.traversalSurfaces].reverse(),
    })).toThrow("ROUTE_BUILD_INPUT_INVALID");
    expect(() => assertRouteBuildInputV2({
      ...input,
      staticColliders: [...input.staticColliders].reverse(),
    })).toThrow("ROUTE_BUILD_INPUT_INVALID");
    expect(() => assertRouteBuildInputV2({
      ...input,
      traversalSurfaces: [input.traversalSurfaces[0]!, input.traversalSurfaces[0]!],
    })).toThrow("ROUTE_BUILD_INPUT_INVALID");
    const draft = validV2BuildInputDraft();
    expect(() => assertRouteBuildInputV2(completeV2Input({
      ...draft,
      traversalSurfaces: draft.traversalSurfaces.filter(
        (surface) => surface.surfaceEntityId !== "terrain-main",
      ),
    }))).toThrow("ROUTE_BUILD_INPUT_INVALID");
    const terrain = input.traversalSurfaces.find(
      (surface) => surface.surfaceEntityId === "terrain-main",
    )!;
    expect(() => assertRouteBuildInputV2({
      ...input,
      traversalSurfaces: [
        ...input.traversalSurfaces,
        { ...terrain, traversalSurfaceId: "surface-terrain-duplicate" },
      ].sort((left, right) =>
        left.traversalSurfaceId < right.traversalSurfaceId ? -1 : 1
      ),
    })).toThrow("ROUTE_BUILD_INPUT_INVALID");
    expect(() => assertRouteBuildInputV2({
      ...input,
      staticColliders: input.staticColliders.filter(
        (row) => row.entityId !== "platform-deck",
      ),
    })).toThrow("ROUTE_BUILD_INPUT_INVALID");
    expect(() => assertRouteBuildInputV2({
      ...input,
      terrainArtifactHash: HASH_A,
    })).toThrow("ROUTE_BUILD_INPUT_INVALID");
    expect(() => assertRouteBuildInputV2({
      ...input,
      recastArea: 7,
    })).toThrow("ROUTE_BUILD_INPUT_INVALID");
  });

  it("rejects forged bounded extrema through every admission-aware public helper", () => {
    const valid = completeV2Input();
    const soup = valid.terrainSource.kind === "bounded"
      ? valid.terrainSource.triangleSoup
      : terrainSoup();
    const attacks: ReadonlyArray<{
      minimumMetersXZ: readonly [number, number];
      maximumMetersXZ: readonly [number, number];
    }> = [
      { minimumMetersXZ: [-1, 0], maximumMetersXZ: [1, 1] },
      { minimumMetersXZ: [0.25, 0], maximumMetersXZ: [0.75, 1] },
      { minimumMetersXZ: [1, 0], maximumMetersXZ: [2, 1] },
      { minimumMetersXZ: [0, 0], maximumMetersXZ: [1, 2] },
      { minimumMetersXZ: [-0, 0], maximumMetersXZ: [1, 1] },
    ];
    for (const bounds of attacks) {
      const forgedTerrainSource = {
        kind: "bounded" as const,
        terrainEntityId: "terrain-main",
        triangleSoup: soup,
        minimumMetersXZ: bounds.minimumMetersXZ,
        maximumMetersXZ: bounds.maximumMetersXZ,
      };
      const forgedTerrainArtifactHash = sha256CanonicalJson({
        kind: forgedTerrainSource.kind,
        terrainEntityId: forgedTerrainSource.terrainEntityId,
        triangleSoup: forgedTerrainSource.triangleSoup,
        minimumMetersXZ: forgedTerrainSource.minimumMetersXZ,
        maximumMetersXZ: forgedTerrainSource.maximumMetersXZ,
      });
      const forgedGeometryArtifactHash = sha256CanonicalJson({
        terrainArtifactHash: forgedTerrainArtifactHash,
        colliderArtifactHash: valid.colliderArtifactHash,
      });
      const forgedInput = {
        ...valid,
        terrainSource: forgedTerrainSource,
        terrainArtifactHash: forgedTerrainArtifactHash,
        geometryArtifactHash: forgedGeometryArtifactHash,
      };
      const attackerReceipt = deepFreeze({
        input: forgedInput,
        routeBuildInputHash: sha256CanonicalJson(forgedInput),
        budgetEvidence: {
          kind: "route-geometry-tile-estimate",
          tilesX: 1,
          tilesZ: 1,
          estimatedTiles: 1,
          maximumTiles: 1_024,
          minimumMetersXZ: bounds.minimumMetersXZ,
          maximumMetersXZ: bounds.maximumMetersXZ,
        },
      });
      expect(() => hashRouteTerrainArtifactV2(forgedTerrainSource)).toThrow(
        "ROUTE_BUILD_INPUT_INVALID",
      );
      expect(() => assertRouteBuildInputV2(forgedInput)).toThrow("ROUTE_BUILD_INPUT_INVALID");
      expect(() => hashRouteBuildInputV2(forgedInput)).toThrow("ROUTE_BUILD_INPUT_INVALID");
      expect(() => createRouteBuildInputReceiptV2(forgedInput)).toThrow(
        "ROUTE_BUILD_INPUT_INVALID",
      );
      expect(() => assertRouteBuildInputReceiptV2(attackerReceipt)).toThrow(
        /ROUTE_BUILD_INPUT/,
      );
    }
  });

  it("rejects forged envelope pair-test budget and plane-ratio even with recomputed hashes", () => {
    const draft = validV2BuildInputDraft();
    for (const patch of [
      { maximumTraversalSurfaceTrianglePairTestCount: 12 },
      { minimumEquivalentPlaneNormalDotRatio: 0.5 },
    ]) {
      const forged = completeV2Input({
        ...draft,
        capabilityEnvelope: freezeEnvelopeClone(draft.capabilityEnvelope, patch),
      });
      expect(() => assertRouteBuildInputV2(forged)).toThrow("ROUTE_BUILD_INPUT_INVALID");
      expect(() => hashRouteBuildInputV2(forged)).toThrow("ROUTE_BUILD_INPUT_INVALID");
      expect(() => createRouteBuildInputReceiptV2(forged)).toThrow("ROUTE_BUILD_INPUT_INVALID");
    }
  });

  it("uses route-geometry-tile-estimate union bounds for empty terrain plus static colliders", () => {
    const draft = validV2BuildInputDraft();
    const receipt = createRouteBuildInputReceiptV2(completeV2Input({
      ...draft,
      terrainSource: {
        kind: "empty",
        terrainEntityId: "terrain-main",
      },
    }));
    expect(receipt.budgetEvidence.kind).toBe("route-geometry-tile-estimate");
    if (receipt.budgetEvidence.kind !== "route-geometry-tile-estimate") return;
    expect(receipt.budgetEvidence.minimumMetersXZ).toEqual([2, 0]);
    expect(receipt.budgetEvidence.maximumMetersXZ).toEqual([9, 3]);
    expect(receipt.budgetEvidence).not.toHaveProperty("maximumTraversalSurfaceCount");
    expect(receipt.budgetEvidence).not.toHaveProperty(
      "maximumTraversalSurfaceTrianglePairTestCount",
    );
  });

  it("uses not-required-empty-geometry only when terrain and static colliders are both empty", () => {
    const draft = validV2BuildInputDraft();
    const receipt = createRouteBuildInputReceiptV2(completeV2Input({
      ...draft,
      terrainSource: {
        kind: "empty",
        terrainEntityId: "terrain-main",
      },
      staticColliders: [],
      traversalSurfaces: draft.traversalSurfaces.filter(
        (surface) => surface.surfaceEntityId === "terrain-main",
      ),
    }));
    expect(receipt.budgetEvidence).toEqual({ kind: "not-required-empty-geometry" });
  });

  it("changes routeBuildInputHash but not terrain/geometry hashes when only an exclusion declaration changes", () => {
    const input = completeV2Input();
    const mutated = completeV2Input({
      ...validV2BuildInputDraft(),
      blockedTraversalAreaExclusions: [
        {
          traversalAreaId: "dry-trench",
          surfaceEntityId: "terrain-main",
          boundary: {
            kind: "polygon-xz",
            pointsMetersXZ: [[-1, -1], [1, -1], [1, 1], [-1, 1]],
          },
        },
      ],
    });
    expect(mutated.terrainArtifactHash).toBe(input.terrainArtifactHash);
    expect(mutated.geometryArtifactHash).toBe(input.geometryArtifactHash);
    expect(hashRouteTerrainArtifactV2(mutated.terrainSource)).toBe(input.terrainArtifactHash);
    expect(hashRouteGeometryArtifactV2({
      terrainArtifactHash: mutated.terrainArtifactHash,
      colliderArtifactHash: mutated.colliderArtifactHash,
    })).toBe(input.geometryArtifactHash);
    const originalReceipt = createRouteBuildInputReceiptV2(input);
    const mutatedReceipt = createRouteBuildInputReceiptV2(mutated);
    expect(mutatedReceipt.routeBuildInputHash).not.toBe(originalReceipt.routeBuildInputHash);
    expect(mutatedReceipt.routeBuildInputHash).toBe(sha256CanonicalJson(mutatedReceipt.input));
  });
});
