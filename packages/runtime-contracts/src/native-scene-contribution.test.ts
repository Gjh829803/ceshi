import { describe, expect, it } from "vitest";

import {
  canonicalBabylonNativeSceneContributionBytesV1,
  createBabylonNativeStaticColliderContributionV1,
  hashBabylonNativeSceneContributionV1,
  parseBabylonNativeProfileSettlementReceiptV1,
  parseBabylonNativeSceneContributionV1,
} from "./native-scene-contribution.js";

const TRIANGLE_GEOMETRY = Object.freeze({
  worldPositionsMetersXYZ: Object.freeze([0, 0, 0, 2, 0, 0, 0, 0, 2]),
  triangleIndices: Object.freeze([0, 1, 2]),
});

function validContribution() {
  return {
    kind: "babylon-native-scene-contribution",
    schemaVersion: 1,
    sceneModuleRef: "worldkit://native-scene/cloud-ridge@1",
    sceneModuleId: "cloud-ridge-native",
    profileSettlement: {
      kind: "none",
      profileRef: "worldkit://native-scene-profile/whitebox.standard@1",
    },
    spawnMarker: {
      id: "player-spawn",
      positionMetersXYZ: [0, 1.1, 18],
      facingRadians: Math.PI,
    },
    staticColliders: [
      createBabylonNativeStaticColliderContributionV1({
        id: "main-route",
        runtimeRole: "scene-static-collider",
        ...TRIANGLE_GEOMETRY,
        frictionRatio: 0.75,
        restitutionRatio: 0,
        traversalBinding: {
          kind: "static-surface",
          surfaceEntityId: "main-route",
          logicalSubshapeId: "primary",
          traversalSurfaceProfileRef:
            "worldkit://traversal-surface-profile/ground.static@1",
        },
      }),
    ],
  } as const;
}

describe("BabylonNativeSceneContributionV1", () => {
  it("parses the exact standard and Host-snapshot settlement branches", () => {
    const standard = parseBabylonNativeProfileSettlementReceiptV1({
      kind: "none",
      profileRef: "worldkit://native-scene-profile/whitebox.standard@1",
    });
    const blocks = parseBabylonNativeProfileSettlementReceiptV1({
      kind: "host-snapshot",
      profileRef: "worldkit://native-scene-profile/whitebox.blocks@1",
      targetCount: 7,
      profileInventoryHash: `sha256:${"1".repeat(64)}`,
      settledVisualHash: `sha256:${"2".repeat(64)}`,
    });

    expect(standard).toEqual({
      kind: "none",
      profileRef: "worldkit://native-scene-profile/whitebox.standard@1",
    });
    expect(blocks).toEqual({
      kind: "host-snapshot",
      profileRef: "worldkit://native-scene-profile/whitebox.blocks@1",
      targetCount: 7,
      profileInventoryHash: `sha256:${"1".repeat(64)}`,
      settledVisualHash: `sha256:${"2".repeat(64)}`,
    });
    expect(Object.isFrozen(standard)).toBe(true);
    expect(Object.isFrozen(blocks)).toBe(true);
  });

  it.each([
    ["missing", undefined],
    ["extra", {
      kind: "none",
      profileRef: "worldkit://native-scene-profile/whitebox.standard@1",
      extra: true,
    }],
    ["wrong standard pair", {
      kind: "none",
      profileRef: "worldkit://native-scene-profile/whitebox.blocks@1",
    }],
    ["wrong blocks pair", {
      kind: "host-snapshot",
      profileRef: "worldkit://native-scene-profile/whitebox.standard@1",
      targetCount: 1,
      profileInventoryHash: `sha256:${"1".repeat(64)}`,
      settledVisualHash: `sha256:${"2".repeat(64)}`,
    }],
    ["negative count", {
      kind: "host-snapshot",
      profileRef: "worldkit://native-scene-profile/whitebox.blocks@1",
      targetCount: -1,
      profileInventoryHash: `sha256:${"1".repeat(64)}`,
      settledVisualHash: `sha256:${"2".repeat(64)}`,
    }],
    ["malformed hash", {
      kind: "host-snapshot",
      profileRef: "worldkit://native-scene-profile/whitebox.blocks@1",
      targetCount: 1,
      profileInventoryHash: "sha256:not-a-hash",
      settledVisualHash: `sha256:${"2".repeat(64)}`,
    }],
  ])("rejects %s settlement", (_label, profileSettlement) => {
    expect(() => parseBabylonNativeSceneContributionV1({
      ...validContribution(),
      profileSettlement,
    })).toThrow(/BabylonNativeSceneContributionV1/);
  });

  it("rejects accessor and symbol-bearing settlement records", () => {
    const accessor = Object.defineProperty({}, "kind", {
      enumerable: true,
      get: () => "none",
    });
    Object.defineProperty(accessor, "profileRef", {
      enumerable: true,
      value: "worldkit://native-scene-profile/whitebox.standard@1",
    });
    const symbolBearing = {
      kind: "none",
      profileRef: "worldkit://native-scene-profile/whitebox.standard@1",
      [Symbol("hidden")]: true,
    };

    expect(() => parseBabylonNativeSceneContributionV1({
      ...validContribution(),
      profileSettlement: accessor,
    })).toThrow(/BabylonNativeSceneContributionV1/);
    expect(() => parseBabylonNativeSceneContributionV1({
      ...validContribution(),
      profileSettlement: symbolBearing,
    })).toThrow(/BabylonNativeSceneContributionV1/);
  });

  it("binds every settlement field into the Contribution hash", () => {
    const base = validContribution();
    const first = {
      ...base,
      profileSettlement: {
        kind: "host-snapshot",
        profileRef: "worldkit://native-scene-profile/whitebox.blocks@1",
        targetCount: 7,
        profileInventoryHash: `sha256:${"1".repeat(64)}`,
        settledVisualHash: `sha256:${"2".repeat(64)}`,
      },
    } as const;
    const hashes = [
      first,
      { ...first, profileSettlement: { ...first.profileSettlement, targetCount: 8 } },
      { ...first, profileSettlement: { ...first.profileSettlement, profileInventoryHash: `sha256:${"3".repeat(64)}` } },
      { ...first, profileSettlement: { ...first.profileSettlement, settledVisualHash: `sha256:${"4".repeat(64)}` } },
    ].map(hashBabylonNativeSceneContributionV1);

    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it("parses a deeply frozen handle-free contribution and hashes canonical data", () => {
    const input = validContribution();
    const contribution = parseBabylonNativeSceneContributionV1(input);

    expect(contribution).not.toBe(input);
    expect(Object.isFrozen(contribution)).toBe(true);
    expect(Object.isFrozen(contribution.spawnMarker.positionMetersXYZ)).toBe(true);
    expect(Object.isFrozen(contribution.staticColliders)).toBe(true);
    expect(Object.isFrozen(contribution.staticColliders[0])).toBe(true);
    expect(Object.hasOwn(contribution.staticColliders[0]!, "mesh")).toBe(false);
    expect(Object.hasOwn(contribution.staticColliders[0]!, "sourceMesh")).toBe(false);
    expect(hashBabylonNativeSceneContributionV1(input)).toMatch(
      /^sha256:[0-9a-f]{64}$/,
    );
    expect(hashBabylonNativeSceneContributionV1(input)).toBe(
      hashBabylonNativeSceneContributionV1(contribution),
    );
    expect(canonicalBabylonNativeSceneContributionBytesV1(input)).toEqual(
      canonicalBabylonNativeSceneContributionBytesV1(contribution),
    );
  });

  it("derives stable collider and traversal identities from frozen geometry and binding", () => {
    const first = createBabylonNativeStaticColliderContributionV1({
      id: "route",
      runtimeRole: "scene-static-collider",
      ...TRIANGLE_GEOMETRY,
      frictionRatio: 0.75,
      restitutionRatio: 0,
      traversalBinding: {
        kind: "static-surface",
        surfaceEntityId: "route",
        logicalSubshapeId: "primary",
        traversalSurfaceProfileRef:
          "worldkit://traversal-surface-profile/ground.static@1",
      },
    });
    const same = createBabylonNativeStaticColliderContributionV1({
      id: "route",
      runtimeRole: "scene-static-collider",
      ...TRIANGLE_GEOMETRY,
      frictionRatio: 0.75,
      restitutionRatio: 0,
      traversalBinding: {
        kind: "static-surface",
        surfaceEntityId: "route",
        logicalSubshapeId: "primary",
        traversalSurfaceProfileRef:
          "worldkit://traversal-surface-profile/ground.static@1",
      },
    });
    const changed = createBabylonNativeStaticColliderContributionV1({
      id: "route",
      runtimeRole: "scene-static-collider",
      worldPositionsMetersXYZ: [0, 0, 0, 3, 0, 0, 0, 0, 2],
      triangleIndices: [0, 1, 2],
      frictionRatio: 0.75,
      restitutionRatio: 0,
      traversalBinding: {
        kind: "static-surface",
        surfaceEntityId: "route",
        logicalSubshapeId: "primary",
        traversalSurfaceProfileRef:
          "worldkit://traversal-surface-profile/ground.static@1",
      },
    });

    expect(first.colliderSubshapeId).toBe(same.colliderSubshapeId);
    expect(first.traversalBinding).toEqual(same.traversalBinding);
    expect(changed.colliderSubshapeId).not.toBe(first.colliderSubshapeId);
    expect(changed.traversalBinding.kind).toBe("static-surface");
    expect(first.traversalBinding.kind).toBe("static-surface");
    if (
      changed.traversalBinding.kind === "static-surface" &&
      first.traversalBinding.kind === "static-surface"
    ) {
      expect(changed.traversalBinding.traversalSurfaceId).not.toBe(
        first.traversalBinding.traversalSurfaceId,
      );
    }
  });

  it("binds the closed Runtime role and keeps safety boundaries non-traversable", () => {
    const scene = createBabylonNativeStaticColliderContributionV1({
      id: "edge",
      runtimeRole: "scene-static-collider",
      ...TRIANGLE_GEOMETRY,
      frictionRatio: 0,
      restitutionRatio: 0,
      traversalBinding: { kind: "not-traversable" },
    });
    const boundary = createBabylonNativeStaticColliderContributionV1({
      id: "edge",
      runtimeRole: "ground-safety-boundary",
      ...TRIANGLE_GEOMETRY,
      frictionRatio: 0,
      restitutionRatio: 0,
      traversalBinding: { kind: "not-traversable" },
    });

    expect(boundary.colliderSubshapeId).not.toBe(scene.colliderSubshapeId);
    expect(boundary.runtimeRole).toBe("ground-safety-boundary");
    expect(() => createBabylonNativeStaticColliderContributionV1({
      id: "invalid-boundary",
      runtimeRole: "ground-safety-boundary",
      ...TRIANGLE_GEOMETRY,
      frictionRatio: 0,
      restitutionRatio: 0,
      traversalBinding: {
        kind: "static-surface",
        surfaceEntityId: "invalid-boundary",
        logicalSubshapeId: "top",
        traversalSurfaceProfileRef:
          "worldkit://traversal-surface-profile/ground.static@1",
      },
    })).toThrow(/BabylonNativeSceneContributionV1/);
  });

  it.each([
    ["Babylon handle", () => ({ ...validContribution(), mesh: {} })],
    ["unknown collider field", () => {
      const input = validContribution();
      return { ...input, staticColliders: [{ ...input.staticColliders[0], legacySurfaceKind: "walkable" }] };
    }],
    ["signed zero", () => ({ ...validContribution(), spawnMarker: { ...validContribution().spawnMarker, facingRadians: -0 } })],
    ["non-finite world position", () => {
      const input = validContribution();
      return { ...input, staticColliders: [{ ...input.staticColliders[0], worldPositionsMetersXYZ: [0, 0, Number.NaN, 2, 0, 0, 0, 0, 2] }] };
    }],
    ["out-of-range triangle index", () => {
      const input = validContribution();
      return { ...input, staticColliders: [{ ...input.staticColliders[0], triangleIndices: [0, 1, 3] }] };
    }],
    ["tampered geometry identity", () => {
      const input = validContribution();
      return { ...input, staticColliders: [{ ...input.staticColliders[0], colliderSubshapeId: "collider-subshape:tampered" }] };
    }],
  ])("rejects %s", (_label, makeInput) => {
    expect(() => parseBabylonNativeSceneContributionV1(makeInput())).toThrow(
      /BabylonNativeSceneContributionV1/,
    );
  });
});
