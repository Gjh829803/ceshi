import { describe, expect, it } from "vitest";

import { mapTraversalCapabilityEnvelopeToRecastTiledConfigV1 } from "./recast-config.js";
import { createRecastTestEnvelopeV1 } from "./test-fixture.test-support.js";

describe("Recast tiled config mapping", () => {
  it("maps canonical units exactly once with frozen rounding and constants", () => {
    const config = mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
      createRecastTestEnvelopeV1(),
    );

    expect(config).toEqual({
      borderSize: 0,
      tileSize: 64,
      cs: 0.15,
      ch: 0.1,
      walkableSlopeAngle: 42,
      walkableHeight: 20,
      walkableClimb: 3,
      walkableRadius: 3,
      maxEdgeLen: 16,
      maxSimplificationError: 1,
      minRegionArea: 8,
      mergeRegionArea: 20,
      maxVertsPerPoly: 6,
      detailSampleDist: 6,
      detailSampleMaxError: 1,
      buildBvTree: true,
      chunkyTriMeshTrisPerChunk: 128,
    });
    expect(config.walkableRadius * config.cs).toBeGreaterThanOrEqual(0.32 + 0.05);
    expect(Object.isFrozen(config)).toBe(true);
  });

  it("keeps floor semantics without IEEE exact-multiple drift", () => {
    const baseline = mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
      createRecastTestEnvelopeV1(),
    );
    const belowStep = mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
      createRecastTestEnvelopeV1({ maxStepHeightMeters: 0.299 }),
    );

    expect(baseline.walkableClimb).toBe(3);
    expect(baseline.maxEdgeLen).toBe(16);
    expect(belowStep.walkableClimb).toBe(2);
  });

  it("maps the locked slope limit below the unsupported vertical boundary", () => {
    const supported = mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
      createRecastTestEnvelopeV1({ maxSlopeDegrees: 89.999 }),
    );
    const vertical = createRecastTestEnvelopeV1({ maxSlopeDegrees: 90 });

    expect(supported.walkableSlopeAngle).toBe(89.999);
    expect(() => mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
      vertical,
    )).toThrow("TRAVERSAL_RECAST_CONFIG_INVALID");
  });

  it("keeps the locked capsule-clearance boundary coupled to the audited backend tuple", () => {
    const exactBoundary = createRecastTestEnvelopeV1({
      capsuleRadiusMeters: 0.4,
    });
    const crossedBoundary = createRecastTestEnvelopeV1({
      capsuleRadiusMeters: 0.400001,
    });
    const unauditedBackend = createRecastTestEnvelopeV1({
      runtimeAdapterHash:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });

    expect(exactBoundary.clearanceMarginMeters).toBe(0.05);
    expect(mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
      exactBoundary,
    ).walkableRadius).toBe(3);
    expect(mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
      crossedBoundary,
    ).walkableRadius).toBe(4);
    expect(() => mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
      unauditedBackend,
    )).toThrow("TRAVERSAL_RECAST_BACKEND_MAPPING_NOT_AUDITED");
  });

  it("keeps exact-multiple height ceil semantics independent of collider offset", () => {
    const baseline = mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
      createRecastTestEnvelopeV1({ capsuleHeightMeters: 0.3 }),
    );
    const changedOffset = mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
      createRecastTestEnvelopeV1({
        capsuleHeightMeters: 0.3,
        colliderCenterOffsetMetersXYZ: [0, 9, 0],
      }),
    );

    expect(baseline.walkableHeight).toBe(3);
    expect(changedOffset.walkableHeight).toBe(3);
  });

  it("is deterministic, permits quantization equivalence, and changes at boundaries", () => {
    const baseline = mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
      createRecastTestEnvelopeV1(),
    );
    const equivalent = mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
      createRecastTestEnvelopeV1({ capsuleRadiusMeters: 0.33 }),
    );
    const crossed = mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
      createRecastTestEnvelopeV1({ capsuleRadiusMeters: 0.46 }),
    );

    expect(mapTraversalCapabilityEnvelopeToRecastTiledConfigV1(
      createRecastTestEnvelopeV1(),
    )).toEqual(baseline);
    expect(equivalent.walkableRadius).toBe(baseline.walkableRadius);
    expect(crossed.walkableRadius).toBe(4);
  });

  it("fails closed before mapping an unaudited Runtime tuple", () => {
    const envelope = createRecastTestEnvelopeV1();

    expect(() => mapTraversalCapabilityEnvelopeToRecastTiledConfigV1({
      ...envelope,
      runtimeAdapterHash:
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    })).toThrow("TRAVERSAL_RECAST_BACKEND_MAPPING_NOT_AUDITED");
  });

  it("normalizes provider world units and rejects an unsupported vertical slope", () => {
    const envelope = createRecastTestEnvelopeV1();
    const normalized = mapTraversalCapabilityEnvelopeToRecastTiledConfigV1({
      ...envelope,
      voxelCellSizeMeters: 0.1500000004,
      voxelCellHeightMeters: 0.1000000004,
    });

    expect(normalized.cs).toBe(0.15);
    expect(normalized.ch).toBe(0.1);
    expect(() => mapTraversalCapabilityEnvelopeToRecastTiledConfigV1({
      ...envelope,
      maxSlopeDegrees: 90,
    })).toThrow("TRAVERSAL_RECAST_CONFIG_INVALID");
  });

  it("classifies invalid meter values as field-specific Recast config errors", () => {
    for (const [field, value] of [
      ["capsuleHeightMeters", Number.NaN],
      ["capsuleHeightMeters", Number.POSITIVE_INFINITY],
      ["voxelCellSizeMeters", Number.NaN],
      ["voxelCellSizeMeters", Number.POSITIVE_INFINITY],
    ] as const) {
      expect(() => mapTraversalCapabilityEnvelopeToRecastTiledConfigV1({
        ...createRecastTestEnvelopeV1(),
        [field]: value,
      })).toThrow(
        new RegExp(`TRAVERSAL_RECAST_CONFIG_INVALID: '${field}'`),
      );
      try {
        mapTraversalCapabilityEnvelopeToRecastTiledConfigV1({
          ...createRecastTestEnvelopeV1(),
          [field]: value,
        });
      } catch (error) {
        expect(String(error)).not.toContain(
          "TRAVERSAL_GRAPH_BUILD_BUDGET_INVALID",
        );
      }
    }
  });
});
