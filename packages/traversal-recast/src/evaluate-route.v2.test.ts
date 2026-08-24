import {
  preflightCanonicalTraversalSurfaceOverlapsV1,
} from "@whitebox-world/terrain-surface";
import { isNil } from "lodash-es";
import { describe, expect, it } from "vitest";

import { evaluateRequiredRouteV2 } from "./evaluate-route.js";
import {
  collectBoundTraversalSurfaceQuerySourcesV2,
} from "./heightfield-source.js";
import {
  createMultiSurfaceRouteBuildInputReceiptV2,
} from "./test-fixture.test-support.js";

function catalogIdentitiesV2(
  receipt: ReturnType<typeof createMultiSurfaceRouteBuildInputReceiptV2>,
  traversalSurfaceIds: readonly string[],
) {
  return traversalSurfaceIds.map((traversalSurfaceId) => {
    const identity = receipt.input.traversalSurfaces.find(
      (surface) => surface.traversalSurfaceId === traversalSurfaceId,
    );
    if (isNil(identity)) {
      throw new Error(`missing catalog Traversal Surface '${traversalSurfaceId}'`);
    }
    return identity;
  });
}

function serializedProviderLeak(value: unknown): string[] {
  const json = JSON.stringify(value);
  return [
    "providerPolygonRef",
    "areaId",
    "navMesh",
    "polyRef",
    "tileRef",
  ].filter((term) => json.includes(term));
}

describe("evaluateRequiredRouteV2", () => {
  it("builds a Heightfield -> 0.25m step -> platform -> ramp -> Heightfield path", async () => {
    const receipt = createMultiSurfaceRouteBuildInputReceiptV2();
    const result = await evaluateRequiredRouteV2({ buildInputReceipt: receipt });
    expect(result.status).toBe("complete");
    if (result.status !== "complete") return;
    expect(serializedProviderLeak(result.traversalGraph)).toEqual([]);
    expect(serializedProviderLeak(result.routePathReceipt)).toEqual([]);
    const surfaceIds = result.routePathReceipt.orderedTraversalSurfaceIdentities.map(
      (identity) => identity.traversalSurfaceId,
    );
    expect(surfaceIds.length).toBe(result.routePathReceipt.orderedTraversalNodeIds.length);
    expect(result.routePathReceipt.orderedPathPositionsMetersXYZ).toHaveLength(
      result.routePathReceipt.orderedTraversalNodeIds.length,
    );
    const uniqueSequence = surfaceIds.filter((id, index) => id !== surfaceIds[index - 1]);
    expect(uniqueSequence).toEqual([
      "surface-heightfield",
      "surface-step",
      "surface-platform",
      "surface-ramp",
      "surface-heightfield",
    ]);
    const stepEdges = Object.values(result.traversalGraph.traversalEdgesById).filter(
      (edge) => edge.type === "step",
    );
    expect(stepEdges.length).toBeGreaterThan(0);
  });

  it("rejects a 0.35m step with a dedicated step diagnostic", async () => {
    const receipt = createMultiSurfaceRouteBuildInputReceiptV2({
      stepHeightMeters: 0.35,
    });
    const result = await evaluateRequiredRouteV2({ buildInputReceipt: receipt });
    expect(result.status).toBe("unreachable");
    if (result.status === "complete") return;
    expect(result.connectivityFailure.reason.kind).toBe("step-height-threshold-exceeded");
    expect(result.connectivityFailure.relatedTraversalSurfaceIdentities).toEqual(
      catalogIdentitiesV2(receipt, ["surface-heightfield", "surface-step"]),
    );
  });

  it("rejects a 1cm surface gap with a dedicated gap diagnostic", async () => {
    const receipt = createMultiSurfaceRouteBuildInputReceiptV2({
      gapMeters: 0.01,
    });
    const result = await evaluateRequiredRouteV2({ buildInputReceipt: receipt });
    expect(result.status).toBe("unreachable");
    if (result.status === "complete") return;
    expect(result.connectivityFailure.reason.kind).toBe("surface-gap-exceeded");
    expect(result.connectivityFailure.relatedTraversalSurfaceIdentities).toEqual(
      catalogIdentitiesV2(receipt, ["surface-heightfield", "surface-ramp"]),
    );
  });

  it("rejects a narrow tread with a dedicated width diagnostic", async () => {
    const receipt = createMultiSurfaceRouteBuildInputReceiptV2({
      walkwayMinimumZ: 2.9,
      walkwayMaximumZ: 3.1,
    });
    const result = await evaluateRequiredRouteV2({ buildInputReceipt: receipt });
    expect(result.status).toBe("unreachable");
    if (result.status === "complete") return;
    expect(result.connectivityFailure.reason.kind).toBe("clearance-width-insufficient");
    expect(result.connectivityFailure.relatedTraversalSurfaceIdentities).toEqual(
      catalogIdentitiesV2(receipt, ["surface-heightfield", "surface-platform", "surface-ramp", "surface-step"]),
    );
  });

  it("rejects low overhead with a dedicated overhead diagnostic", async () => {
    const receipt = createMultiSurfaceRouteBuildInputReceiptV2({
      includeLowOverhead: true,
    });
    const result = await evaluateRequiredRouteV2({ buildInputReceipt: receipt });
    expect(result.status).toBe("unreachable");
    if (result.status === "complete") return;
    expect(result.connectivityFailure.reason.kind).toBe("overhead-clearance-insufficient");
    expect(result.connectivityFailure.relatedTraversalSurfaceIdentities).toEqual(
      catalogIdentitiesV2(receipt, ["surface-heightfield", "surface-platform", "surface-ramp", "surface-step"]),
    );
  });

  it("maps a missing Profile on an unbound platform to zero identities plus collider evidence", async () => {
    const receipt = createMultiSurfaceRouteBuildInputReceiptV2({
      bindStaticSurfaces: false,
      destinationOnPlatform: true,
    });
    const result = await evaluateRequiredRouteV2({ buildInputReceipt: receipt });
    expect(result.status).toBe("unreachable");
    if (result.status === "complete") return;
    expect(result.graphStatus).toBe("unavailable");
    expect(result.connectivityFailure.reason.kind).toBe("surface-profile-missing");
    expect(result.connectivityFailure.relatedTraversalSurfaceIdentities).toEqual([]);
    if (result.connectivityFailure.reason.kind === "surface-profile-missing") {
      expect(result.connectivityFailure.reason.relevantColliderSubshapeIds.length).toBeGreaterThan(0);
    }
  });

  it("maps coplanar interior overlap to correlation ambiguous with at least two identities", async () => {
    const receipt = createMultiSurfaceRouteBuildInputReceiptV2({
      overlapCoplanarMeters: 1,
    });
    const result = await evaluateRequiredRouteV2({ buildInputReceipt: receipt });
    expect(result.status).toBe("unreachable");
    if (result.status === "complete") return;
    expect(result.graphStatus).toBe("unavailable");
    expect(result.connectivityFailure.reason.kind).toBe("surface-correlation-ambiguous");
    expect(
      result.connectivityFailure.relatedTraversalSurfaceIdentities.length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("fails closed when 62 Traversal Surfaces exceed the locked count budget", () => {
    expect(() => createMultiSurfaceRouteBuildInputReceiptV2({
      extraDummySurfaceCount: 58,
    })).toThrow(/Surface-count budget exceeded|maximumTraversalSurfaceCount/);
  });
});

describe("multi-surface triangle-pair preflight budget", () => {
  it("exits on candidate 2 when the pair-test limit is 1", () => {
    const receipt = createMultiSurfaceRouteBuildInputReceiptV2();
    const envelope = receipt.input.capabilityEnvelope;
    const result = preflightCanonicalTraversalSurfaceOverlapsV1({
      sources: collectBoundTraversalSurfaceQuerySourcesV2(receipt.input),
      minimumUpwardNormalYRatio: Math.cos(envelope.maxSlopeDegrees * Math.PI / 180),
      maximumSameBandHeightDifferenceMeters:
        envelope.positionQuantizationMeters / 2,
      maximumEquivalentPlaneHeightDifferenceMeters:
        envelope.positionQuantizationMeters / 2,
      minimumEquivalentPlaneNormalDotRatio:
        envelope.minimumEquivalentPlaneNormalDotRatio,
      maximumTraversalSurfaceTrianglePairTestCount: 1,
    });
    expect(result.mode).toBe("budget-exceeded");
    if (result.mode !== "budget-exceeded") return;
    expect(result.reason).toBe(
      "traversal-surface-triangle-pair-test-budget-exceeded",
    );
    expect(result.maximumAllowedCount).toBe(1);
    expect(result.minimumRequiredCount).toBe(2);
  });
});
