import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import {
  defineBabylonNativeScene,
  type BabylonNativeSceneBuildContextV1,
  type BabylonNativeSceneModuleV1,
} from "@whitebox-world/native-babylon";

import { createBabylonNativeBlockProfileCheckResultV1 } from "./check.js";
import { createBabylonNativeBlockColliderCandidatesV1 } from
  "./collider-contribution.js";
import { deriveBabylonNativeBlockLayoutV1 } from "./layout.js";
import type { BabylonNativeBlockSessionRecordV1 } from "./session.js";

const RUNTIME_FIXTURE_BLOCKS = Object.freeze([
  Object.freeze({ id: "ground-positive-one", shape: "full" as const, center: [0, -0.5, 1] as const }),
  Object.freeze({ id: "ground-zero", shape: "full" as const, center: [0, -0.5, 0] as const }),
  Object.freeze({ id: "ground-negative-one", shape: "full" as const, center: [0, -0.5, -1] as const }),
  Object.freeze({ id: "ground-negative-two", shape: "full" as const, center: [0, -0.5, -2] as const }),
  Object.freeze({ id: "over-limit-step", shape: "half" as const, center: [0, 0.25, -3] as const }),
]);

function runtimeFixtureBlockRecord(
  context: BabylonNativeSceneBuildContextV1,
  block: typeof RUNTIME_FIXTURE_BLOCKS[number],
): BabylonNativeBlockSessionRecordV1 {
  const sizeMetersXYZ = block.shape === "full"
    ? [1, 1, 1] as const
    : [1, 0.5, 1] as const;
  const mesh = MeshBuilder.CreateBox(block.id, {
    width: sizeMetersXYZ[0],
    height: sizeMetersXYZ[1],
    depth: sizeMetersXYZ[2],
  }, context.scene);
  mesh.position.set(block.center[0], block.center[1], block.center[2]);
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const indices = mesh.getIndices();
  if (positions === null || indices === null) {
    throw new Error("BWB-4 fixture Block must expose indexed position geometry.");
  }
  return Object.freeze({
    input: Object.freeze({
      id: block.id,
      shape: block.shape,
      paletteRole: "ground" as const,
    }),
    mesh,
    localGeometrySnapshot: Object.freeze({
      positions: Object.freeze(Array.from(positions)),
      indices: Object.freeze(Array.from(indices)),
    }),
  });
}

/** Test-only exact Module for real BWB-4 Package/Havok evidence. */
export function createBabylonNativeBlockColliderRuntimeFixtureModuleV1():
BabylonNativeSceneModuleV1 {
  return defineBabylonNativeScene({
    kind: "babylon-native-scene-module",
    id: "package-fixture-module",
    build(context): void {
      const records = Object.freeze(RUNTIME_FIXTURE_BLOCKS.map((block) =>
        runtimeFixtureBlockRecord(context, block)));
      const layout = deriveBabylonNativeBlockLayoutV1(context.scene, records);
      const checkResult = createBabylonNativeBlockProfileCheckResultV1(
        context.bootstrap.id,
        records,
        layout,
      );
      if (checkResult.outcome !== "passed") {
        throw new Error("BWB-4 fixture Layout must pass the Profile check.");
      }
      const traversalSurfaceProfileRef =
        "worldkit://traversal-surface-profile/ground.static@1";
      createBabylonNativeBlockColliderCandidatesV1({
        scene: context.scene,
        buildEpochId: "bwb4-runtime-epoch",
        layout,
        checkResult,
        records,
        selections: Object.freeze(records.map((record) => Object.freeze({
          id: `collider-${record.input.id}`,
          blockId: record.input.id,
          traversalBinding: Object.freeze({
            kind: "static-surface" as const,
            surfaceEntityId: `surface-${record.input.id}`,
            logicalSubshapeId: "top",
            traversalSurfaceProfileRef,
          }),
          frictionRatio: 0.8,
          restitutionRatio: 0,
        }))),
        registration: context.registration,
      });
      context.registration.registerSpawnMarker(Object.freeze({
        id: context.bootstrap.spawnMarkerId,
        positionMetersXYZ: Object.freeze([0, 0, 0] as const),
        facingRadians: 0,
      }));
    },
  });
}
