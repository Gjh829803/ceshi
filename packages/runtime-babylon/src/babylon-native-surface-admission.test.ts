import {
  createBabylonNativeStaticColliderContributionV1,
  parseBabylonNativeSceneContributionV1,
  type BabylonNativeSceneContributionV1,
  type BabylonNativeTraversalBindingInputV1,
  type RuntimeSubjectDescriptorV1,
  type WorldResourceLockEntryV1,
} from "@whitebox-world/runtime-contracts";
import {
  BUILT_IN_GROUND_STATIC_TRAVERSAL_SURFACE_PROFILE_REF,
  resolveTraversalSurfaceProfileV1,
} from "@whitebox-world/traversal";
import { createBabylonNativeWorldPackageTestInputV1 } from
  "@whitebox-world/world-package/testing";
import { describe, expect, it } from "vitest";

import {
  admitBabylonNativeSurfacesV1,
  type BabylonNativeSurfaceAdmissionResultV1,
} from "./babylon-native-surface-admission.js";

const WORLD_BOUNDS = Object.freeze({
  centerMetersXZ: Object.freeze([0, 0] as const),
  sizeMetersXZ: Object.freeze([20, 20] as const),
  heightRangeMeters: Object.freeze([-5, 20] as const),
});
const SURFACE_PROFILE = resolveTraversalSurfaceProfileV1(
  BUILT_IN_GROUND_STATIC_TRAVERSAL_SURFACE_PROFILE_REF,
);
const PROFILE_LOCK: WorldResourceLockEntryV1 = Object.freeze({
  resourceKind: "traversal-surface-profile",
  resourceRef: SURFACE_PROFILE.resourceRef,
  resolvedVersion: SURFACE_PROFILE.resolvedVersion,
  contentHash: SURFACE_PROFILE.contentHash,
});
const SUBJECT = createBabylonNativeWorldPackageTestInputV1()
  .worldRuntimeBootstrap.subjectRuntimeDescriptors[0]!;

function collider(
  id: string,
  positions: readonly number[],
  indices: readonly number[] = [0, 1, 2],
  traversalBinding: BabylonNativeTraversalBindingInputV1 = {
    kind: "static-surface",
    surfaceEntityId: `${id}-surface`,
    logicalSubshapeId: "top",
    traversalSurfaceProfileRef:
      BUILT_IN_GROUND_STATIC_TRAVERSAL_SURFACE_PROFILE_REF,
  },
) {
  return createBabylonNativeStaticColliderContributionV1({
    id,
    worldPositionsMetersXYZ: positions,
    triangleIndices: indices,
    frictionRatio: 0.8,
    restitutionRatio: 0,
    traversalBinding,
  });
}

function contribution(
  positionMetersXYZ: readonly [number, number, number],
  staticColliders = [
    collider("ground", [-4, 0, -4, 4, 0, -4, 0, 0, 4]),
  ],
): BabylonNativeSceneContributionV1 {
  return parseBabylonNativeSceneContributionV1({
    kind: "babylon-native-scene-contribution",
    schemaVersion: 1,
    sceneModuleRef: "worldkit://native-scene/surface-test@1",
    sceneModuleId: "surface-test",
    spawnMarker: {
      id: "player-spawn",
      positionMetersXYZ,
      facingRadians: 0,
    },
    staticColliders: [...staticColliders].sort((left, right) =>
      left.id.localeCompare(right.id),
    ),
  });
}

function admit(
  sceneContribution: BabylonNativeSceneContributionV1,
  overrides: Partial<Readonly<{
    registryLock: readonly WorldResourceLockEntryV1[];
    controlledSubject: RuntimeSubjectDescriptorV1;
    worldBounds: typeof WORLD_BOUNDS;
  }>> = {},
): BabylonNativeSurfaceAdmissionResultV1 {
  return admitBabylonNativeSurfacesV1({
    contribution: sceneContribution,
    registryLock: overrides.registryLock ?? [PROFILE_LOCK],
    controlledSubject: overrides.controlledSubject ?? SUBJECT,
    worldBounds: overrides.worldBounds ?? WORLD_BOUNDS,
  });
}

function code(result: BabylonNativeSurfaceAdmissionResultV1): string {
  if (result.outcome === "passed") throw new Error("expected rejection");
  return result.diagnostic.code;
}

describe("admitBabylonNativeSurfacesV1", () => {
  it("admits exact feet support with stable Surface and subshape identity", () => {
    const result = admit(contribution([0, 0, 0]));
    expect(result.outcome).toBe("passed");
    if (result.outcome !== "passed") throw new Error("unreachable");
    const source = result.surfaces[0]!;
    expect(source).toMatchObject({
      colliderId: "ground",
      colliderSubshapeId: expect.stringMatching(/^collider-subshape:[a-f0-9]{64}$/),
      surfaceEntityId: "ground-surface",
      logicalSubshapeId: "top",
      traversalSurfaceId: expect.stringMatching(/^traversal-surface:/),
      traversalSurfaceProfileRef:
        BUILT_IN_GROUND_STATIC_TRAVERSAL_SURFACE_PROFILE_REF,
    });
    expect(source.faces).toEqual([expect.objectContaining({
      triangleIndex: 0,
      vertexIndices: [0, 1, 2],
      normalXYZ: [0, 1, 0],
      slopeDegrees: 0,
    })]);
    expect(result.spawnSupport).toMatchObject({
      colliderId: "ground",
      colliderSubshapeId: source.colliderSubshapeId,
      traversalSurfaceId: source.traversalSurfaceId,
      triangleIndex: 0,
      supportHeightMeters: 0,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(source.faces)).toBe(true);
  });

  it("treats both triangle winding orders identically", () => {
    const positions = [-4, 0, -4, 4, 0, -4, 0, 0, 4] as const;
    const forward = admit(contribution([0, 0, 0], [
      collider("forward", positions, [0, 1, 2]),
    ]));
    const reverse = admit(contribution([0, 0, 0], [
      collider("reverse", positions, [2, 1, 0]),
    ]));
    expect(forward.outcome).toBe("passed");
    expect(reverse.outcome).toBe("passed");
    if (forward.outcome !== "passed" || reverse.outcome !== "passed") {
      throw new Error("unreachable");
    }
    expect(forward.surfaces[0]?.faces[0]?.normalXYZ).toEqual([0, 1, 0]);
    expect(reverse.surfaces[0]?.faces[0]?.normalXYZ).toEqual([0, 1, 0]);
  });

  it("interpolates asymmetric sloped support and selects the topmost eligible face", () => {
    const low = collider("low", [-4, 0, -4, 4, 0, -4, 0, 2, 4]);
    const high = collider("high", [-4, 1, -4, 4, 1, -4, 0, 3, 4]);
    const result = admit(contribution([0, 2, 0], [low, high]));
    expect(result.outcome).toBe("passed");
    if (result.outcome !== "passed") throw new Error("unreachable");
    expect(result.spawnSupport.colliderId).toBe("high");
    expect(result.spawnSupport.supportHeightMeters).toBeCloseTo(2, 12);
    expect(result.surfaces).toHaveLength(2);
  });

  it("uses a deterministic tolerance on triangle edges and vertices", () => {
    const ground = collider("ground", [0, 0, 0, 4, 0, 0, 0, 0, 4]);
    expect(admit(contribution([2, 0, 0], [ground])).outcome).toBe("passed");
    expect(admit(contribution([0, 0, 0], [ground])).outcome).toBe("passed");
    expect(code(admit(contribution([2, 0, -0.001], [ground])))).toBe(
      "WORLDKIT_NATIVE_SCENE_RUNTIME_SPAWN_SUPPORT_MISSING",
    );
  });

  it("rejects missing, floating, underground and outside spawn support", () => {
    expect(code(admit(contribution([8, 0, 8])))).toBe(
      "WORLDKIT_NATIVE_SCENE_RUNTIME_SPAWN_SUPPORT_MISSING",
    );
    expect(code(admit(contribution([0, 0.01, 0])))).toBe(
      "WORLDKIT_NATIVE_SCENE_RUNTIME_SPAWN_SUPPORT_HEIGHT_MISMATCH",
    );
    expect(code(admit(contribution([0, -0.01, 0])))).toBe(
      "WORLDKIT_NATIVE_SCENE_RUNTIME_SPAWN_SUPPORT_MISSING",
    );
    expect(code(admit(contribution([9.9, 0, 0])))).toBe(
      "WORLDKIT_NATIVE_SCENE_RUNTIME_SPAWN_OUTSIDE_BOUNDS",
    );
  });

  it("rejects non-traversable, vertical and subject-incompatible steep support", () => {
    const blocked = collider(
      "blocked",
      [-4, 0, -4, 4, 0, -4, 0, 0, 4],
      [0, 1, 2],
      { kind: "not-traversable" },
    );
    const vertical = collider("vertical", [0, -2, -4, 0, 4, -4, 0, 0, 4]);
    const steep = collider("steep", [-4, -4, -4, 4, -4, -4, 0, 4, 4]);
    expect(code(admit(contribution([0, 0, 0], [blocked])))).toBe(
      "WORLDKIT_NATIVE_SCENE_RUNTIME_SPAWN_SUPPORT_MISSING",
    );
    expect(code(admit(contribution([0, 0, 0], [vertical])))).toBe(
      "WORLDKIT_NATIVE_SCENE_RUNTIME_SPAWN_SUPPORT_MISSING",
    );
    expect(code(admit(contribution([0, 0, 0], [steep])))).toBe(
      "WORLDKIT_NATIVE_SCENE_RUNTIME_SPAWN_SUPPORT_MISSING",
    );
  });

  it("rejects missing, wrong and duplicate Surface Profile locks", () => {
    const exact = contribution([0, 0, 0]);
    expect(code(admit(exact, { registryLock: [] }))).toBe(
      "WORLDKIT_NATIVE_SCENE_RUNTIME_SURFACE_PROFILE_LOCK_INVALID",
    );
    expect(code(admit(exact, { registryLock: [{
      ...PROFILE_LOCK,
      contentHash: `sha256:${"a".repeat(64)}`,
    }] }))).toBe(
      "WORLDKIT_NATIVE_SCENE_RUNTIME_SURFACE_PROFILE_LOCK_INVALID",
    );
    expect(code(admit(exact, { registryLock: [PROFILE_LOCK, PROFILE_LOCK] }))).toBe(
      "WORLDKIT_NATIVE_SCENE_RUNTIME_SURFACE_PROFILE_LOCK_INVALID",
    );
  });

  it("rejects a higher blocking triangle intersecting the initial capsule", () => {
    const ground = collider("ground", [-4, 0, -4, 4, 0, -4, 0, 0, 4]);
    const ceiling = collider(
      "ceiling",
      [-4, 1, -4, 0, 1, 4, 4, 1, -4],
      [0, 1, 2],
      { kind: "not-traversable" },
    );
    expect(code(admit(contribution([0, 0, 0], [ground, ceiling])))).toBe(
      "WORLDKIT_NATIVE_SCENE_RUNTIME_SPAWN_CAPSULE_OBSTRUCTED",
    );

    const radialX = SUBJECT.collider.radiusMeters * 0.8;
    const radialWall = collider(
      "radial-wall",
      [radialX, 0.5, -1, radialX, 1.5, 0, radialX, 0.5, 1],
      [0, 1, 2],
      { kind: "not-traversable" },
    );
    expect(code(admit(contribution([0, 0, 0], [ground, radialWall])))).toBe(
      "WORLDKIT_NATIVE_SCENE_RUNTIME_SPAWN_CAPSULE_OBSTRUCTED",
    );
  });
});
