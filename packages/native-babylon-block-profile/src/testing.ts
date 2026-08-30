import {
  defineBabylonNativeScene,
  type BabylonNativeSceneModuleV1,
} from "@whitebox-world/native-babylon";

import { createBabylonNativeBlockProfileSessionV1 } from "./session.js";

const RUNTIME_FIXTURE_BLOCKS = Object.freeze([
  Object.freeze({ id: "ground-positive-one", shape: "full" as const, center: [0, -0.5, 1] as const }),
  Object.freeze({ id: "ground-zero", shape: "full" as const, center: [0, -0.5, 0] as const }),
  Object.freeze({ id: "ground-negative-one", shape: "full" as const, center: [0, -0.5, -1] as const }),
  Object.freeze({ id: "ground-negative-two", shape: "full" as const, center: [0, -0.5, -2] as const }),
  Object.freeze({ id: "over-limit-step", shape: "half" as const, center: [0, 0.25, -3] as const }),
]);

/** Test-only exact Module for real BWB-4 Package/Havok evidence. */
export function createBabylonNativeBlockColliderRuntimeFixtureModuleV1(
  input: Readonly<{ paletteRole?: "ground" | "structure" }> = {},
):
BabylonNativeSceneModuleV1 {
  return defineBabylonNativeScene({
    kind: "babylon-native-scene-module",
    id: "package-fixture-module",
    build(context): void {
      const session = createBabylonNativeBlockProfileSessionV1(context, {
        maximumBlockCount: RUNTIME_FIXTURE_BLOCKS.length,
      });
      for (const block of RUNTIME_FIXTURE_BLOCKS) {
        session.createBlock({
          id: block.id,
          shape: block.shape,
          paletteRole: input.paletteRole ?? "ground",
          ...(input.paletteRole === "structure"
            ? { visualGroupId: "runtime-fixture-structure" }
            : {}),
        }).position.set(block.center[0], block.center[1], block.center[2]);
      }
      const traversalSurfaceProfileRef =
        "worldkit://traversal-surface-profile/ground.static@1";
      session.finalize(Object.freeze({
        displayGapMeters: 0.04,
        staticColliders: Object.freeze(RUNTIME_FIXTURE_BLOCKS.map((block) =>
          Object.freeze({
            id: `collider-${block.id}`,
            blockId: block.id,
            traversalBinding: Object.freeze({
              kind: "static-surface" as const,
              surfaceEntityId: `surface-${block.id}`,
              logicalSubshapeId: "top",
              traversalSurfaceProfileRef,
            }),
            frictionRatio: 0.8,
            restitutionRatio: 0,
          }))),
      }));
      context.registration.registerSpawnMarker(Object.freeze({
        id: context.bootstrap.spawnMarkerId,
        positionMetersXYZ: Object.freeze([0, 0, 0] as const),
        facingRadians: 0,
      }));
    },
  });
}
