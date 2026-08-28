import {
  canonicalJsonBytes,
  sha256CanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import { describe, expect, it, vi } from "vitest";

import {
  canonicalSceneExecutionPlanCanonicalBytesV1,
  createCanonicalSceneExecutionPlanV1,
  hashCanonicalSceneExecutionPlanV1,
  parseCanonicalSceneExecutionPlanV1,
  type CanonicalSceneExecutionPlanBodyV1,
} from "./canonical-scene-execution-plan.js";

const HASH_A = `sha256:${"1".repeat(64)}` as Sha256HashV1;
const HASH_B = `sha256:${"2".repeat(64)}` as Sha256HashV1;
const HASH_C = `sha256:${"3".repeat(64)}` as Sha256HashV1;
const HASH_D = `sha256:${"4".repeat(64)}` as Sha256HashV1;

function bodyFixture(): CanonicalSceneExecutionPlanBodyV1 {
  const sceneResourceLockEntries = [{
    resourceRef: "worldkit://traversal-surface-profile/ground.static@1",
    resourceKind: "traversal-surface-profile" as const,
    resolvedVersion: "1",
    contentHash: HASH_D,
  }];
  return {
    kind: "worldkit-canonical-scene-execution-plan",
    schemaVersion: 1,
    id: "canonical-ridge",
    seed: 17,
    authoringSpecHash: HASH_A,
    normalizedWorldIrHash: HASH_B,
    coordinateSystem: "right-handed-y-up-minus-z-forward",
    atmospherePreset: "golden-hour",
    worldRuntimeBootstrapRef:
      "worldkit://world-runtime-bootstrap/canonical-ridge@1",
    worldRuntimeBootstrapHash: HASH_C,
    sceneResourceLockHash: sha256CanonicalJson(
      sceneResourceLockEntries,
    ) as Sha256HashV1,
    sceneResourceLockEntries,
    terrain: {
      entityId: "terrain-main",
      centerMetersXZ: [0, 0],
      sizeMetersXZ: [20, 20],
      resolutionCellsXZ: [2, 2],
      heightSamplesMeters: [0, 0.25, 0.5, 1],
      heightSamplesHash: HASH_A,
      minimumHeightMeters: 0,
      maximumHeightMeters: 1,
      semanticClassId: "terrain.ridge",
    },
    waters: [],
    objects: [{
      entityId: "platform-main",
      prototypeId: "platform",
      primitive: { kind: "box", sizeMetersXYZ: [4, 0.5, 4] },
      transform: {
        positionMetersXYZ: [0, 1.25, -5],
        rotationEulerRadiansXYZ: [0, 0.1, 0],
        scaleXYZ: [1, 1, 1],
      },
      collisionEnabled: true,
      semanticClassId: "structure.platform",
    }],
    subjectInstances: [{
      entityId: "player",
      spawnAnchorEntityId: "spawn-main",
      subjectOriginPositionMetersXYZ: [0, 1, 6],
      subjectFacingRadians: 0.25,
    }],
    sceneResourceUsage: { vertices: 12, triangles: 8, colliders: 2 },
    layout: {
      solverProfileRef: "worldkit://layout-solver/fixed@1",
      resolvedVersion: "1",
      solverProfileHash: HASH_A,
      layoutSolveReportHash: HASH_B,
      regions: [],
      routes: [],
      screenRegions: [],
      placementsByEntityId: {
        "spawn-main": {
          entityId: "spawn-main",
          transform: {
            positionMetersXYZ: [0, 1, 6],
            rotationEulerRadiansXYZ: [0, 0.25, 0],
            scaleXYZ: [1, 1, 1],
          },
          placementProvenance: {
            kind: "fixed",
            candidateId: "fixed:spawn-main",
            placementConstraintIds: [],
            solverProfileRef: "worldkit://layout-solver/fixed@1",
            layoutSolveReportHash: HASH_B,
          },
        },
      },
      layoutAssertions: [],
    },
    traversal: {
      surfaces: [{
        kind: "heightfield",
        traversalSurfaceId: `traversal-surface:sha256:${"5".repeat(64)}`,
        surfaceEntityId: "terrain-main",
        colliderSubshapeId: `collider-subshape:sha256:${"6".repeat(64)}`,
        resourceRef: "package://traversal-surface/terrain-main.heightfield@1",
        resolvedVersion: "1",
        resourceHash: HASH_C,
      }],
      traversalAreas: [],
      connectivityRequirements: [],
      anchorEntityIds: ["spawn-main"],
    },
    staticColliders: [{
      entityId: "platform-main",
      logicalSubshapeId: "primary",
      colliderSubshapeId: `collider-subshape:sha256:${"7".repeat(64)}`,
      transform: {
        positionMetersXYZ: [0, 1.25, -5],
        rotationEulerRadiansXYZ: [0, 0.1, 0],
        scaleXYZ: [1, 1, 1],
      },
      shape: { kind: "box", sizeMetersXYZ: [4, 0.5, 4] },
      colliderHash: HASH_D,
    }],
  };
}

function expectInvalid(input: unknown): void {
  expect(() => parseCanonicalSceneExecutionPlanV1(input)).toThrow(
    /CANONICAL_SCENE_EXECUTION_PLAN_INVALID/,
  );
}

describe("CanonicalSceneExecutionPlanV1", () => {
  it("has the exact terminal key set and no Runtime or Gameplay authority", () => {
    const plan = createCanonicalSceneExecutionPlanV1(bodyFixture());
    expect(Object.keys(plan).sort()).toEqual([
      "atmospherePreset",
      "authoringSpecHash",
      "coordinateSystem",
      "id",
      "kind",
      "layout",
      "normalizedWorldIrHash",
      "objects",
      "sceneResourceLockEntries",
      "sceneResourceLockHash",
      "sceneResourceUsage",
      "schemaVersion",
      "seed",
      "staticColliders",
      "subjectInstances",
      "terrain",
      "traversal",
      "waters",
      "worldRuntimeBootstrapHash",
      "worldRuntimeBootstrapRef",
    ]);
    for (const forbidden of [
      "runtimeBackend",
      "gravityMetersPerSecondSquaredXYZ",
      "camera",
      "aspectRatio",
      "initialControlledEntityId",
      "initialRelationships",
      "subjects",
      "subjectAssets",
      "rigProfiles",
      "animationSets",
      "colliderProfiles",
      "actionPresentationRegistry",
    ]) {
      expect(plan).not.toHaveProperty(forbidden);
    }
  });

  it("owns Subject placement only and binds the independent Runtime Bootstrap", () => {
    const plan = createCanonicalSceneExecutionPlanV1(bodyFixture());
    expect(plan.subjectInstances).toEqual([{
      entityId: "player",
      spawnAnchorEntityId: "spawn-main",
      subjectOriginPositionMetersXYZ: [0, 1, 6],
      subjectFacingRadians: 0.25,
    }]);
    expect(plan.worldRuntimeBootstrapRef).toBe(
      bodyFixture().worldRuntimeBootstrapRef,
    );
    expect(plan.worldRuntimeBootstrapHash).toBe(HASH_C);
  });

  it("detaches, deeply freezes, canonicalizes, and hashes the closed plan", () => {
    const mutable = structuredClone(bodyFixture());
    const plan = createCanonicalSceneExecutionPlanV1(mutable);
    expect(plan).toEqual(mutable);
    expect(plan).not.toBe(mutable);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.subjectInstances)).toBe(true);
    expect(Object.isFrozen(plan.subjectInstances[0])).toBe(true);
    expect(Object.isFrozen(plan.layout.placementsByEntityId)).toBe(true);
    expect(canonicalSceneExecutionPlanCanonicalBytesV1(plan)).toEqual(
      canonicalJsonBytes(plan),
    );
    expect(hashCanonicalSceneExecutionPlanV1(plan)).toBe(
      sha256CanonicalJson(plan),
    );
  });

  it("canonicalizes set-like collections and rejects duplicates", () => {
    const first = bodyFixture();
    const secondInstance = {
      ...first.subjectInstances[0]!,
      entityId: "companion",
      spawnAnchorEntityId: "spawn-companion",
    };
    const plan = createCanonicalSceneExecutionPlanV1({
      ...first,
      subjectInstances: [first.subjectInstances[0]!, secondInstance],
      traversal: {
        ...first.traversal,
        anchorEntityIds: ["spawn-main", "goal"],
      },
    });
    expect(plan.subjectInstances.map(({ entityId }) => entityId)).toEqual([
      "companion",
      "player",
    ]);
    expect(plan.traversal.anchorEntityIds).toEqual(["goal", "spawn-main"]);

    expect(() => createCanonicalSceneExecutionPlanV1({
      ...first,
      subjectInstances: [
        first.subjectInstances[0]!,
        first.subjectInstances[0]!,
      ],
    })).toThrow(/CANONICAL_SCENE_EXECUTION_PLAN_INVALID/);
  });

  it("rejects missing, unknown, forbidden, stale-lock, signed-zero, and unsafe seed data", () => {
    const missing = { ...bodyFixture() } as Record<string, unknown>;
    delete missing.terrain;
    for (const input of [
      missing,
      { ...bodyFixture(), unknown: true },
      { ...bodyFixture(), gravityMetersPerSecondSquaredXYZ: [0, -9.81, 0] },
      { ...bodyFixture(), initialRelationships: [] },
      { ...bodyFixture(), seed: -0 },
      { ...bodyFixture(), seed: -1 },
      { ...bodyFixture(), seed: 4_294_967_296 },
      { ...bodyFixture(), sceneResourceLockHash: HASH_A },
      { ...bodyFixture(), worldRuntimeBootstrapHash: `sha256:${"0".repeat(64)}` },
      {
        ...bodyFixture(),
        subjectInstances: [{
          ...bodyFixture().subjectInstances[0],
          aspectRatio: 16 / 9,
        }],
      },
    ]) {
      expectInvalid(input);
    }
  });

  it("rejects accessors, symbols, and non-ordinary prototypes without invoking accessors", () => {
    const getter = vi.fn(() => HASH_A);
    const accessor = bodyFixture() as unknown as Record<string, unknown>;
    Object.defineProperty(accessor, "authoringSpecHash", {
      enumerable: true,
      get: getter,
    });
    const nestedAccessor = bodyFixture() as unknown as {
      terrain: Record<string, unknown>;
    };
    Object.defineProperty(nestedAccessor.terrain, "heightSamplesHash", {
      enumerable: true,
      get: getter,
    });
    const symbol = { ...bodyFixture(), [Symbol("hidden")]: true };
    const customPrototype = Object.assign(
      Object.create({ inherited: true }),
      bodyFixture(),
    );

    for (const input of [accessor, nestedAccessor, symbol, customPrototype]) {
      expectInvalid(input);
    }
    expect(getter).not.toHaveBeenCalled();
  });
});
