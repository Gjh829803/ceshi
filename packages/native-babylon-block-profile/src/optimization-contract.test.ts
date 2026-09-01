import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Scene } from "@babylonjs/core/scene.js";
import {
  createBabylonNativeHostRandomV1,
  defineBabylonNativeScene,
  type BabylonNativeSceneBuildContextV1,
  type BabylonNativeTraversalBindingV1,
} from "@whitebox-world/native-babylon";
import { admitBabylonNativeSceneCandidateV1 } from
  "@whitebox-world/native-babylon/host";
import { describe, expect, it } from "vitest";

import { createBabylonNativeBlockProfileCheckResultV1 } from "./check.js";
import {
  materializeBabylonNativeBlockColliderCandidatesV1,
  type BabylonNativeBlockStaticColliderSelectionV1,
  type MaterializedBabylonNativeBlockColliderCandidatesV1,
} from "./collider-contribution.js";
import {
  assessBabylonNativeBlockOptimizationV1,
  materializeBabylonNativeBlockReconstructionCorpusCaseV1,
  type BabylonNativeBlockReconstructionCorpusCaseIdV1,
} from "./index.js";
import { deriveBabylonNativeBlockLayoutV1 } from "./layout.js";
import type {
  BabylonNativeBlockCheckedLayoutV1,
  BabylonNativeBlockFinalizedEpochV1,
  BabylonNativeBlockSessionRecordV1,
} from "./session.js";
import {
  BABYLON_NATIVE_BLOCK_SIZE_METERS_XYZ_BY_SHAPE_V1,
  type BabylonNativeBlockPositionMetersXYZV1,
  type BabylonNativeBlockShapeKindV1,
} from "./shapes.js";

type PaletteRole = "ground" | "route" | "structure";

interface BlockFixture {
  readonly id: string;
  readonly shape?: BabylonNativeBlockShapeKindV1;
  readonly paletteRole?: PaletteRole;
  readonly visualGroupId?: string;
  readonly centerMetersXYZ: BabylonNativeBlockPositionMetersXYZV1;
  readonly rotationQuarterTurnsY?: number;
}

interface EpochFixture {
  readonly engine: NullEngine;
  readonly scene: Scene;
  readonly colliders: MaterializedBabylonNativeBlockColliderCandidatesV1;
  readonly epoch: BabylonNativeBlockFinalizedEpochV1;
  dispose(): void;
}

const NOT_TRAVERSABLE = Object.freeze({
  kind: "not-traversable" as const,
});

const STATIC_SURFACE = Object.freeze({
  kind: "static-surface" as const,
  surfaceEntityId: "route-surface",
  logicalSubshapeId: "top",
  traversalSurfaceProfileRef:
    "worldkit://traversal-surface-profile/ground.static@1",
});

function context(scene: Scene): BabylonNativeSceneBuildContextV1 {
  return Object.freeze({
    scene,
    bootstrap: Object.freeze({
      kind: "babylon-native-scene-bootstrap" as const,
      schemaVersion: 1 as const,
      id: "bwb6-contract",
      sceneModuleRef: "worldkit://native-scene/bwb6-contract@1",
      nativeSceneApiRef: "worldkit://native-scene-api/babylon@1",
      nativeSceneProfileRef:
        "worldkit://native-scene-profile/whitebox.blocks@1",
      gameplayBootstrapRef:
        "worldkit://gameplay-bootstrap/bwb6-contract@1",
      initialControlledEntityId: "player",
      gravityMetersPerSecondSquaredXYZ: Object.freeze([0, -9.81, 0] as const),
      initialCamera: Object.freeze({
        mode: "third-person" as const,
        pitchRadians: 0.2,
        distanceMeters: 5,
        fovDegrees: 60,
        targetHeightMeters: 1.2,
      }),
      seed: 202609011,
      spawnMarkerId: "player-spawn",
    }),
    random: createBabylonNativeHostRandomV1(202609011),
    assets: Object.freeze({
      async resolve(): Promise<never> {
        throw new Error("BWB-6 contract fixture has no assets");
      },
    }),
    registration: Object.freeze({
      registerSpawnMarker(): void {},
      registerStaticCollider(): void {},
    }),
  });
}

function record(scene: Scene, fixture: BlockFixture): BabylonNativeBlockSessionRecordV1 {
  const shape = fixture.shape ?? "full";
  const size = BABYLON_NATIVE_BLOCK_SIZE_METERS_XYZ_BY_SHAPE_V1[shape];
  const mesh = MeshBuilder.CreateBox(fixture.id, {
    width: size[0],
    height: size[1],
    depth: size[2],
  }, scene);
  mesh.position.set(...fixture.centerMetersXYZ);
  mesh.rotation.y = (fixture.rotationQuarterTurnsY ?? 0) * Math.PI / 2;
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
  const indices = mesh.getIndices()!;
  return Object.freeze({
    input: Object.freeze({
      id: fixture.id,
      shape,
      paletteRole: fixture.paletteRole ?? "ground",
      ...(fixture.visualGroupId === undefined
        ? {}
        : { visualGroupId: fixture.visualGroupId }),
    }),
    mesh,
    localGeometrySnapshot: Object.freeze({
      positions: Object.freeze(Array.from(positions)),
      indices: Object.freeze(Array.from(indices)),
    }),
  });
}

function selection(
  id: string,
  blockId: string,
  traversalBinding: BabylonNativeTraversalBindingV1 = NOT_TRAVERSABLE,
  material: Readonly<{
    frictionRatio?: number;
    restitutionRatio?: number;
  }> = {},
): BabylonNativeBlockStaticColliderSelectionV1 {
  return Object.freeze({
    id,
    blockId,
    traversalBinding,
    ...(material.frictionRatio === undefined
      ? {}
      : { frictionRatio: material.frictionRatio }),
    ...(material.restitutionRatio === undefined
      ? {}
      : { restitutionRatio: material.restitutionRatio }),
  });
}

function createEpoch(
  blocks: readonly BlockFixture[],
  selections: readonly BabylonNativeBlockStaticColliderSelectionV1[],
  reverse = false,
): EpochFixture {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const orderedBlocks = reverse ? [...blocks].reverse() : [...blocks];
  const records = Object.freeze(orderedBlocks.map((entry) =>
    record(scene, entry)));
  const layout = deriveBabylonNativeBlockLayoutV1(scene, records);
  const checkResult = createBabylonNativeBlockProfileCheckResultV1(
    "bwb6-contract",
    records,
    layout,
  );
  if (checkResult.outcome !== "passed") {
    throw new Error(JSON.stringify(checkResult.diagnostics));
  }
  const checkedLayout: BabylonNativeBlockCheckedLayoutV1 = Object.freeze({
    kind: "babylon-native-block-checked-layout",
    schemaVersion: 1,
    layout,
    checkResult,
    records,
  });
  const colliders = materializeBabylonNativeBlockColliderCandidatesV1({
    context: context(scene),
    checkedLayout,
    selections: Object.freeze(reverse ? [...selections].reverse() : [...selections]),
  });
  const epoch: BabylonNativeBlockFinalizedEpochV1 = Object.freeze({
    kind: "babylon-native-block-finalized-epoch",
    schemaVersion: 1,
    checkedLayout,
    visualGroups: checkResult.visualGroups,
    colliderInventory: colliders.inventory,
    profileInventoryHash: `sha256:${"a".repeat(64)}`,
  });
  return Object.freeze({
    engine,
    scene,
    colliders,
    epoch,
    dispose(): void {
      colliders.dispose();
      scene.dispose();
      engine.dispose();
    },
  });
}

function expectDeeplyFrozen(value: unknown, path = "assessment"): void {
  if (typeof value !== "object" || value === null) return;
  expect(Object.isFrozen(value), path).toBe(true);
  for (const [key, child] of Object.entries(value)) {
    expectDeeplyFrozen(child, `${path}.${key}`);
  }
}

describe("BWB-6 profile optimization contract", () => {
  it("retains Collider material semantics needed to decide coalescing equivalence", () => {
    const fixture = createEpoch(
      [{ id: "route-block", centerMetersXYZ: [0, 0.5, 0] }],
      [selection("route-collider", "route-block", STATIC_SURFACE, {
        frictionRatio: 0.25,
        restitutionRatio: 0.5,
      })],
    );
    try {
      expect(fixture.epoch.colliderInventory).toEqual([
        {
          colliderId: "route-collider",
          sourceBlockIds: ["route-block"],
          visualGroupIds: [],
          proxyKind: "layout-block-volume",
          traversalBinding: STATIC_SURFACE,
          frictionRatio: 0.25,
          restitutionRatio: 0.5,
        },
      ]);
    } finally {
      fixture.dispose();
    }
  });

  it("publishes one deterministic rectangular optimization proposal", () => {
    const blocks = Object.freeze([
      Object.freeze({
        id: "wall-a",
        centerMetersXYZ: Object.freeze([0, 0.5, 0] as const),
        paletteRole: "structure",
        visualGroupId: "wall-group",
      }),
      Object.freeze({
        id: "wall-b",
        centerMetersXYZ: Object.freeze([1, 0.5, 0] as const),
        paletteRole: "structure",
        visualGroupId: "wall-group",
      }),
    ]);
    const selections = Object.freeze([
      selection("collider-wall-a", "wall-a", NOT_TRAVERSABLE, {
        frictionRatio: 0.25,
        restitutionRatio: 0.5,
      }),
      selection("collider-wall-b", "wall-b", NOT_TRAVERSABLE, {
        frictionRatio: 0.25,
        restitutionRatio: 0.5,
      }),
    ]);
    const fixture = createEpoch(blocks, selections);
    const reversed = createEpoch(blocks, selections, true);
    try {
      const assessment = assessBabylonNativeBlockOptimizationV1({
        finalizedEpoch: fixture.epoch,
      });
      const reversedAssessment = assessBabylonNativeBlockOptimizationV1({
        finalizedEpoch: reversed.epoch,
      });
      expect(assessment).toMatchObject({
        kind: "babylon-native-block-optimization-assessment",
        schemaVersion: 1,
        profileInventoryHash: `sha256:${"a".repeat(64)}`,
        measurementKind: "deterministic-resource-counts",
        chunkPolicy: {
          kind: "fixed-xz-grid",
          sizeMetersXZ: [4, 4],
          originMetersXZ: [-0.5, -0.5],
          boundaryMode: "half-open-center-owned",
        },
        residencyGroups: [{
          kind: "grid-chunk",
          id: "grid-chunk-xp0-zp0",
          chunkIndexXZ: [0, 0],
          minimumMetersXZ: [-0.5, -0.5],
          maximumMetersXZ: [3.5, 3.5],
          blockIds: ["wall-a", "wall-b"],
        }],
        thinInstanceGroups: [{
          id: "thin-instance-group-0001",
          residencyGroupId: "grid-chunk-xp0-zp0",
          shape: "full",
          paletteRole: "structure",
          semanticCaptureClassId: "worldkit.native-block.group.wall-group",
          blockIds: ["wall-a", "wall-b"],
        }],
        independentVisualBlockIds: [],
        colliderCoalescingGroups: [{
          id: "collider-coalescing-group-0001",
          residencyGroupId: "grid-chunk-xp0-zp0",
          colliderIds: ["collider-wall-a", "collider-wall-b"],
          sourceBlockIds: ["wall-a", "wall-b"],
          visualGroupIds: ["wall-group"],
          proxyKind: "layout-block-volume",
          traversalBinding: NOT_TRAVERSABLE,
          frictionRatio: 0.25,
          restitutionRatio: 0.5,
          minimumMetersXYZ: [-0.5, 0, -0.5],
          maximumMetersXYZ: [1.5, 1, 0.5],
        }],
        independentColliderIds: [],
        baselineResources: {
          visualMeshCount: 2,
          visualDrawUnitCount: 2,
          visualGeometryBufferSetCount: 2,
          paletteMaterialCount: 1,
          colliderProxyCount: 2,
          colliderTriangleCount: 24,
        },
        projectedResources: {
          thinInstanceBatchCount: 1,
          independentVisualMeshCount: 0,
          visualDrawUnitCount: 1,
          visualGeometryBufferSetCount: 1,
          residencyGroupCount: 1,
          colliderProxyCount: 1,
          colliderTriangleCount: 12,
        },
        equivalence: {
          areBlockIdsPreserved: true,
          isResidencyCoverageComplete: true,
          isSemanticCaptureMembershipPreserved: true,
          areColliderIdsPreserved: true,
          areColliderSemanticsPreserved: true,
          areCoalescedBoundsExact: true,
        },
      });
      expect(assessment.assessmentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(reversedAssessment).toEqual(assessment);
      expectDeeplyFrozen(assessment);
    } finally {
      reversed.dispose();
      fixture.dispose();
    }
  });

  it("keeps material-split and non-rectangular candidates independent", () => {
    const blocks = Object.freeze([
      Object.freeze({ id: "l-a", centerMetersXYZ: [0, 0.5, 0] as const,
        visualGroupId: "mass-group" }),
      Object.freeze({ id: "l-b", centerMetersXYZ: [1, 0.5, 0] as const,
        visualGroupId: "mass-group" }),
      Object.freeze({ id: "l-c", centerMetersXYZ: [0, 0.5, 1] as const,
        visualGroupId: "mass-group" }),
      Object.freeze({ id: "ratio-split", centerMetersXYZ: [2, 0.5, 0] as const,
        visualGroupId: "mass-group" }),
      Object.freeze({ id: "negative", centerMetersXYZ: [-1, 0.5, 0] as const,
        visualGroupId: "mass-group" }),
    ]);
    const fixture = createEpoch(blocks, [
      selection("collider-l-a", "l-a"),
      selection("collider-l-b", "l-b"),
      selection("collider-l-c", "l-c"),
      selection("collider-ratio", "ratio-split", NOT_TRAVERSABLE,
        { frictionRatio: 0.4 }),
      selection("collider-negative", "negative"),
    ]);
    try {
      const assessment = assessBabylonNativeBlockOptimizationV1({
        finalizedEpoch: fixture.epoch,
      });
      expect(assessment.residencyGroups).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: "grid-chunk",
          id: "grid-chunk-xn1-zp0",
          chunkIndexXZ: [-1, 0],
          blockIds: ["negative"],
        }),
      ]));
      expect(assessment.colliderCoalescingGroups).toEqual([]);
      expect(assessment.independentColliderIds).toEqual([
        "collider-l-a",
        "collider-l-b",
        "collider-l-c",
        "collider-negative",
        "collider-ratio",
      ]);
      expect(assessment.independentVisualBlockIds).toEqual(["negative"]);
    } finally {
      fixture.dispose();
    }
  });

  it("rejects a forged finalized epoch instead of publishing partial evidence", () => {
    const fixture = createEpoch(
      [{ id: "valid-block", centerMetersXYZ: [0, 0.5, 0] }],
      [selection("valid-collider", "valid-block")],
    );
    try {
      expect(() => assessBabylonNativeBlockOptimizationV1({
        finalizedEpoch: Object.freeze({
          ...fixture.epoch,
          profileInventoryHash: "not-a-hash" as `sha256:${string}`,
        }),
      })).toThrow(/WORLDKIT_NATIVE_BLOCK_OPTIMIZATION_INPUT_INVALID/);
      expect(() => assessBabylonNativeBlockOptimizationV1({
        finalizedEpoch: Object.freeze({
          ...fixture.epoch,
          colliderInventory: Object.freeze([Object.freeze({
            ...fixture.epoch.colliderInventory[0]!,
            visualGroupIds: Object.freeze(["forged-group"]),
          })]),
        }),
      })).toThrow(/WORLDKIT_NATIVE_BLOCK_OPTIMIZATION_INPUT_INVALID/);
      expect(() => assessBabylonNativeBlockOptimizationV1(
        null as unknown as Parameters<
          typeof assessBabylonNativeBlockOptimizationV1
        >[0],
      )).toThrow(/WORLDKIT_NATIVE_BLOCK_OPTIMIZATION_INPUT_INVALID/);
      expect(() => assessBabylonNativeBlockOptimizationV1({
        finalizedEpoch: Object.freeze({
          ...fixture.epoch,
          colliderInventory: Object.freeze([
            ...fixture.epoch.colliderInventory,
            fixture.epoch.colliderInventory[0]!,
          ]),
        }),
      })).toThrow(/WORLDKIT_NATIVE_BLOCK_OPTIMIZATION_INPUT_INVALID/);
    } finally {
      fixture.dispose();
    }
  });

  it("measures the five positive reconstruction families with the fixed oracle", async () => {
    const caseIds = [
      "mountain-cliff",
      "t-shaped-traversal",
      "ordinary-and-blocked-steps",
      "building-exterior",
      "limited-interior",
    ] as const satisfies readonly BabylonNativeBlockReconstructionCorpusCaseIdV1[];
    const measurements = [];
    const traversalCounts = { staticSurface: 0, notTraversable: 0 };
    for (const caseId of caseIds) {
      const engine = new NullEngine();
      const scene = new Scene(engine);
      try {
        let materialization: ReturnType<
          typeof materializeBabylonNativeBlockReconstructionCorpusCaseV1
        > | undefined;
        const fixtureContext = context(scene);
        const admission = await admitBabylonNativeSceneCandidateV1({
          candidate: Object.freeze({ engine, scene }),
          bootstrap: fixtureContext.bootstrap,
          module: defineBabylonNativeScene({
            kind: "babylon-native-scene-module",
            id: `bwb6-${caseId}-module`,
            build(buildContext): void {
              materialization =
                materializeBabylonNativeBlockReconstructionCorpusCaseV1(
                  buildContext,
                  caseId,
                );
            },
          }),
          assets: fixtureContext.assets,
          budget: Object.freeze({
            maximumStaticColliderCount: 24,
            maximumStaticColliderVertexCount: 256,
            maximumStaticColliderTriangleCount: 288,
          }),
        });
        if (admission.outcome !== "passed" || materialization === undefined) {
          throw new Error(`${caseId} admission unexpectedly rejected`);
        }
        if (materialization.outcome !== "finalized") {
          throw new Error(`${caseId} unexpectedly rejected`);
        }
        const assessment = assessBabylonNativeBlockOptimizationV1({
          finalizedEpoch: materialization.epoch,
        });
        for (const candidate of materialization.epoch.colliderInventory) {
          if (candidate.traversalBinding.kind === "static-surface") {
            traversalCounts.staticSurface += 1;
          } else {
            traversalCounts.notTraversable += 1;
          }
        }
        measurements.push({
          caseId,
          baseline: assessment.baselineResources,
          projected: assessment.projectedResources,
        });
      } finally {
        scene.dispose();
        engine.dispose();
      }
    }
    expect(measurements).toEqual([
      {
        caseId: "mountain-cliff",
        baseline: {
          visualMeshCount: 12,
          visualDrawUnitCount: 12,
          visualGeometryBufferSetCount: 12,
          paletteMaterialCount: 2,
          colliderProxyCount: 12,
          colliderTriangleCount: 144,
        },
        projected: {
          thinInstanceBatchCount: 4,
          independentVisualMeshCount: 1,
          visualDrawUnitCount: 5,
          visualGeometryBufferSetCount: 5,
          residencyGroupCount: 4,
          colliderProxyCount: 8,
          colliderTriangleCount: 96,
        },
      },
      {
        caseId: "t-shaped-traversal",
        baseline: {
          visualMeshCount: 12,
          visualDrawUnitCount: 12,
          visualGeometryBufferSetCount: 12,
          paletteMaterialCount: 2,
          colliderProxyCount: 12,
          colliderTriangleCount: 144,
        },
        projected: {
          thinInstanceBatchCount: 5,
          independentVisualMeshCount: 0,
          visualDrawUnitCount: 5,
          visualGeometryBufferSetCount: 5,
          residencyGroupCount: 3,
          colliderProxyCount: 10,
          colliderTriangleCount: 120,
        },
      },
      {
        caseId: "ordinary-and-blocked-steps",
        baseline: {
          visualMeshCount: 6,
          visualDrawUnitCount: 6,
          visualGeometryBufferSetCount: 6,
          paletteMaterialCount: 1,
          colliderProxyCount: 6,
          colliderTriangleCount: 72,
        },
        projected: {
          thinInstanceBatchCount: 2,
          independentVisualMeshCount: 2,
          visualDrawUnitCount: 4,
          visualGeometryBufferSetCount: 4,
          residencyGroupCount: 2,
          colliderProxyCount: 6,
          colliderTriangleCount: 72,
        },
      },
      {
        caseId: "building-exterior",
        baseline: {
          visualMeshCount: 8,
          visualDrawUnitCount: 8,
          visualGeometryBufferSetCount: 8,
          paletteMaterialCount: 2,
          colliderProxyCount: 8,
          colliderTriangleCount: 96,
        },
        projected: {
          thinInstanceBatchCount: 3,
          independentVisualMeshCount: 2,
          visualDrawUnitCount: 5,
          visualGeometryBufferSetCount: 5,
          residencyGroupCount: 3,
          colliderProxyCount: 8,
          colliderTriangleCount: 96,
        },
      },
      {
        caseId: "limited-interior",
        baseline: {
          visualMeshCount: 10,
          visualDrawUnitCount: 10,
          visualGeometryBufferSetCount: 10,
          paletteMaterialCount: 2,
          colliderProxyCount: 10,
          colliderTriangleCount: 120,
        },
        projected: {
          thinInstanceBatchCount: 3,
          independentVisualMeshCount: 3,
          visualDrawUnitCount: 6,
          visualGeometryBufferSetCount: 6,
          residencyGroupCount: 4,
          colliderProxyCount: 8,
          colliderTriangleCount: 96,
        },
      },
    ]);
    expect(traversalCounts).toEqual({
      staticSurface: 28,
      notTraversable: 20,
    });
  });
});
