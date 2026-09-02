import { sha256CanonicalJson, type Sha256HashV1 } from
  "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";

import {
  buildBabylonNativeBlockGroundBoundaryV1,
  createBabylonNativeBlockGroundBoundaryContributionV1,
  type BabylonNativeBlockGroundBoundaryPolicyV1,
} from "./ground-boundary.js";
import type {
  BabylonNativeBlockTopologyGeometryV1,
  BabylonNativeBlockWalkableTopologyV1,
} from "./walkable-topology.js";

const H = (digit: string) => `sha256:${digit.repeat(64)}` as Sha256HashV1;
const STATIC_SURFACE = Object.freeze({
  kind: "static-surface" as const,
  surfaceEntityId: "ground-surface",
  logicalSubshapeId: "top",
  traversalSurfaceProfileRef:
    "worldkit://traversal-surface-profile/ground.static@1",
});
const POLICY: BabylonNativeBlockGroundBoundaryPolicyV1 = Object.freeze({
  kind: "babylon-native-block-ground-boundary-policy",
  schemaVersion: 1,
  heightAboveSurfaceMeters: 4,
  depthBelowSurfaceMeters: 0.2,
  maximumSourceSegmentCount: 1_000,
  maximumMergedSegmentCount: 1_000,
  maximumBoundaryVertexCount: 4_000,
  maximumBoundaryTriangleCount: 2_000,
});

function geometry(input: Readonly<{
  id: string;
  x0: number;
  x1: number;
  z0?: number;
  z1?: number;
  y0?: number;
  y1?: number;
  policy?: "none" | "protect-ground-subject";
}>): BabylonNativeBlockTopologyGeometryV1 {
  const z0 = input.z0 ?? 0;
  const z1 = input.z1 ?? 0.5;
  const y0 = input.y0 ?? 0.5;
  const y1 = input.y1 ?? y0;
  const positions = Object.freeze([
    input.x0, y0, z0,
    input.x1, y1, z0,
    input.x1, y1, z1,
    input.x0, y0, z1,
  ]);
  const indices = Object.freeze([0, 1, 2, 0, 2, 3]);
  const body = Object.freeze({
    logicalColliderId: input.id,
    sourceBlockIds: Object.freeze([`${input.id}-block`]),
    visualGroupIds: Object.freeze([`${input.id}-visual`]),
    traversalBinding: STATIC_SURFACE,
    exposedEdgePolicy: input.policy ?? "protect-ground-subject",
    proxyKind: "continuous-walkable-surface" as const,
    minimumMetersXYZ: Object.freeze([
      input.x0,
      Math.min(y0, y1),
      z0,
    ]) as readonly [number, number, number],
    maximumMetersXYZ: Object.freeze([
      input.x1,
      Math.max(y0, y1),
      z1,
    ]) as readonly [number, number, number],
    collisionPositionsMetersXYZ: positions,
    overlayPositionsMetersXYZ: positions,
    triangleIndices: indices,
    sourceCellCount: 1,
    vertexCount: 4,
    triangleCount: 2,
  });
  return Object.freeze({
    ...body,
    geometryHash: sha256CanonicalJson(body) as Sha256HashV1,
  });
}

function topology(
  geometries: readonly BabylonNativeBlockTopologyGeometryV1[],
): BabylonNativeBlockWalkableTopologyV1 {
  const body = Object.freeze({
    kind: "babylon-native-block-walkable-topology" as const,
    schemaVersion: 1 as const,
    identity: Object.freeze({
      logicalGroundModelHash: H("1"),
      topologyPolicyHash: H("2"),
    }),
    walkableGeometries: Object.freeze([...geometries]),
    solidGeometries: Object.freeze([]),
    logicalColliderCount: geometries.length,
    colliderVertexCount: geometries.length * 4,
    colliderTriangleCount: geometries.length * 2,
    removedInternalFaceCount: 0,
  });
  return Object.freeze({
    ...body,
    topologyHash: sha256CanonicalJson(body) as Sha256HashV1,
  });
}

describe("Babylon Native Block ground boundary", () => {
  it("derives exposed edges globally and never protects a cross-Collider seam", () => {
    const result = buildBabylonNativeBlockGroundBoundaryV1({
      topology: topology([
        geometry({ id: "west", x0: 0, x1: 0.5 }),
        geometry({ id: "east", x0: 0.5, x1: 1 }),
      ]),
      policy: POLICY,
    });

    expect(result.sourceSegmentCount).toBe(6);
    expect(result.mergedSegmentCount).toBe(4);
    expect(result.segments.some((segment) =>
      segment.startMetersXYZ[0] === 0.5 &&
      segment.endMetersXYZ[0] === 0.5)).toBe(false);
    expect(result.segments.find((segment) =>
      segment.startMetersXYZ[2] === 0 &&
      segment.endMetersXYZ[2] === 0)?.sourceLogicalColliderIds).toEqual([
      "east",
      "west",
    ]);
    expect(result.triangleCount).toBe(result.mergedSegmentCount * 2);
    expect(result.triangleIndices).toHaveLength(
      result.mergedSegmentCount * 6,
    );
  });

  it("keeps policy visual-neutral and omits unprotected external edges", () => {
    const result = buildBabylonNativeBlockGroundBoundaryV1({
      topology: topology([
        geometry({ id: "protected", x0: 0, x1: 0.5 }),
        geometry({ id: "open", x0: 0.5, x1: 1, policy: "none" }),
      ]),
      policy: POLICY,
    });

    expect(result.sourceSegmentCount).toBe(3);
    expect(result.mergedSegmentCount).toBe(3);
    expect(result.segments.flatMap(({ sourceLogicalColliderIds }) =>
      sourceLogicalColliderIds)).not.toContain("open");
    expect(result.segments.some((segment) =>
      segment.startMetersXYZ[0] === 0.5 &&
      segment.endMetersXYZ[0] === 0.5)).toBe(false);
  });

  it("does not merge a real height discontinuity into one false smooth edge", () => {
    const result = buildBabylonNativeBlockGroundBoundaryV1({
      topology: topology([
        geometry({ id: "low", x0: 0, x1: 0.5, y1: 0.5 }),
        geometry({ id: "high", x0: 0.5, x1: 1, y0: 1, y1: 1 }),
      ]),
      policy: POLICY,
    });

    expect(result.sourceSegmentCount).toBe(8);
    expect(result.segments.filter((segment) =>
      segment.startMetersXYZ[0] === 0.5 &&
      segment.endMetersXYZ[0] === 0.5)).toHaveLength(2);
  });

  it("is deterministic across creation order once the topology identity is frozen", () => {
    const first = buildBabylonNativeBlockGroundBoundaryV1({
      topology: topology([
        geometry({ id: "west", x0: -0.5, x1: 0 }),
        geometry({ id: "east", x0: 0, x1: 0.5 }),
      ]),
      policy: POLICY,
    });
    const second = buildBabylonNativeBlockGroundBoundaryV1({
      topology: topology([
        geometry({ id: "east", x0: 0, x1: 0.5 }),
        geometry({ id: "west", x0: -0.5, x1: 0 }),
      ]),
      policy: POLICY,
    });

    expect(second.segments).toEqual(first.segments);
    expect(second.sourceSegmentCount).toBe(first.sourceSegmentCount);
  });

  it("rejects stale topology identity and closed-policy violations", () => {
    const current = topology([geometry({ id: "ground", x0: 0, x1: 0.5 })]);
    expect(() => buildBabylonNativeBlockGroundBoundaryV1({
      topology: Object.freeze({ ...current, topologyHash: H("f") }),
      policy: POLICY,
    })).toThrow(/GROUND_BOUNDARY_IDENTITY_MISMATCH/);
    expect(() => buildBabylonNativeBlockGroundBoundaryV1({
      topology: current,
      policy: {
        ...POLICY,
        legacyHeightMeters: 4,
      } as BabylonNativeBlockGroundBoundaryPolicyV1,
    })).toThrow(/GROUND_BOUNDARY_INPUT_INVALID/);
    expect(() => buildBabylonNativeBlockGroundBoundaryV1({
      topology: current,
      policy: Object.defineProperty({ ...POLICY }, "maximumSourceSegmentCount", {
        enumerable: true,
        get: () => 1_000,
      }) as BabylonNativeBlockGroundBoundaryPolicyV1,
    })).toThrow(/GROUND_BOUNDARY_INPUT_INVALID/);
  });

  it("fails before publication when any frozen boundary budget is exceeded", () => {
    const current = topology([geometry({ id: "ground", x0: 0, x1: 0.5 })]);
    expect(() => buildBabylonNativeBlockGroundBoundaryV1({
      topology: current,
      policy: Object.freeze({ ...POLICY, maximumSourceSegmentCount: 3 }),
    })).toThrow(/GROUND_BOUNDARY_BUDGET_EXCEEDED/);
    expect(() => buildBabylonNativeBlockGroundBoundaryV1({
      topology: current,
      policy: Object.freeze({ ...POLICY, maximumMergedSegmentCount: 3 }),
    })).toThrow(/GROUND_BOUNDARY_BUDGET_EXCEEDED/);
  });

  it("publishes only the Host-derived non-traversable boundary Runtime role", () => {
    const boundary = buildBabylonNativeBlockGroundBoundaryV1({
      topology: topology([geometry({ id: "ground", x0: 0, x1: 0.5 })]),
      policy: POLICY,
    });
    const contribution =
      createBabylonNativeBlockGroundBoundaryContributionV1(boundary);

    expect(contribution.runtimeRole).toBe("ground-safety-boundary");
    expect(contribution.traversalBinding).toEqual({ kind: "not-traversable" });
    expect(contribution.worldPositionsMetersXYZ).toEqual(
      boundary.positionsMetersXYZ,
    );
    expect(() => createBabylonNativeBlockGroundBoundaryContributionV1(
      Object.freeze({ ...boundary, boundaryHash: H("f") }),
    )).toThrow(/GROUND_BOUNDARY_IDENTITY_MISMATCH/);
  });
});
