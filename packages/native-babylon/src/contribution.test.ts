import { describe, expect, it } from "vitest";

import {
  createBabylonNativeStaticColliderContributionV1,
  hashBabylonNativeSceneContributionV1,
  parseBabylonNativeSceneContributionV1,
} from "./contribution.js";

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
    spawnMarker: {
      id: "player-spawn",
      positionMetersXYZ: [0, 1.1, 18],
      facingRadians: Math.PI,
    },
    staticColliders: [
      createBabylonNativeStaticColliderContributionV1({
        id: "main-route",
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
  });

  it("derives stable collider and traversal identities from frozen geometry and binding", () => {
    const first = createBabylonNativeStaticColliderContributionV1({
      id: "route",
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
