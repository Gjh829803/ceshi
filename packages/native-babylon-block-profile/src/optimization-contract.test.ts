import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Scene } from "@babylonjs/core/scene.js";
import {
  createBabylonNativeHostRandomV1,
  type BabylonNativeSceneBuildContextV1,
} from "@whitebox-world/native-babylon";
import { describe, expect, it } from "vitest";

import { createBabylonNativeBlockProfileCheckResultV1 } from "./check.js";
import {
  materializeBabylonNativeBlockColliderCandidatesV1,
} from "./collider-contribution.js";
import { deriveBabylonNativeBlockLayoutV1 } from "./layout.js";
import type {
  BabylonNativeBlockCheckedLayoutV1,
  BabylonNativeBlockSessionRecordV1,
} from "./session.js";

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
      id: "bwb6-contract-gap",
      sceneModuleRef: "worldkit://native-scene/bwb6-contract-gap@1",
      nativeSceneApiRef: "worldkit://native-scene-api/babylon@1",
      nativeSceneProfileRef:
        "worldkit://native-scene-profile/whitebox.blocks@1",
      gameplayBootstrapRef:
        "worldkit://gameplay-bootstrap/bwb6-contract-gap@1",
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

describe("BWB-6 profile optimization contract", () => {
  it("retains Collider material semantics needed to decide coalescing equivalence", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const mesh = MeshBuilder.CreateBox("route-block", { size: 1 }, scene);
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
    const indices = mesh.getIndices()!;
    const records = Object.freeze([
      Object.freeze({
        input: Object.freeze({
          id: "route-block",
          shape: "full" as const,
          paletteRole: "route" as const,
        }),
        mesh,
        localGeometrySnapshot: Object.freeze({
          positions: Object.freeze(Array.from(positions)),
          indices: Object.freeze(Array.from(indices)),
        }),
      }),
    ] satisfies readonly BabylonNativeBlockSessionRecordV1[]);
    mesh.position.set(0, 0.5, 0);
    const layout = deriveBabylonNativeBlockLayoutV1(scene, records);
    const checkedLayout: BabylonNativeBlockCheckedLayoutV1 = Object.freeze({
      kind: "babylon-native-block-checked-layout",
      schemaVersion: 1,
      layout,
      checkResult: createBabylonNativeBlockProfileCheckResultV1(
        "bwb6-contract-gap",
        records,
        layout,
      ),
      records,
    });
    const materialized = materializeBabylonNativeBlockColliderCandidatesV1({
      context: context(scene),
      checkedLayout,
      selections: Object.freeze([
        Object.freeze({
          id: "route-collider",
          blockId: "route-block",
          traversalBinding: STATIC_SURFACE,
          frictionRatio: 0.25,
          restitutionRatio: 0.5,
        }),
      ]),
    });

    try {
      expect(materialized.inventory).toEqual([
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
      materialized.dispose();
      mesh.dispose();
      scene.dispose();
      engine.dispose();
    }
  });
});
