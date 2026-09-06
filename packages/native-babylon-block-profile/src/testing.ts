import {
  defineBabylonNativeScene,
  type BabylonNativeSceneModuleV1,
} from "@whitebox-world/native-babylon";
import { isNil } from "lodash-es";

import {
  materializeBabylonNativeBlockReconstructionCorpusCaseV1,
  type BabylonNativeBlockReconstructionCorpusCaseIdV1,
} from "./reconstruction-corpus.js";
import { createBabylonNativeBlockProfileSessionV1 } from "./session.js";
export { createBabylonNativeBlockProfileCheckResultV1 } from "./check.js";
export { deriveBabylonNativeBlockLayoutV1 } from "./layout.js";
export type { BabylonNativeBlockSessionRecordV1 } from "./session.js";

export {
  babylonNativeBlockCenterAlignsToGridV1,
  babylonNativeBlockOccupiedMicroCellKeysV1,
} from "./shapes.js";
export {
  BABYLON_NATIVE_BLOCK_RECONSTRUCTION_CORPUS_CASE_IDS_V1,
  createBabylonNativeBlockReconstructionCorpusEvidenceIndexV1,
  inspectBabylonNativeBlockReconstructionCorpusCaseV1,
  materializeBabylonNativeBlockReconstructionCorpusCaseV1,
} from "./reconstruction-corpus.js";
export type {
  BabylonNativeBlockReconstructionCorpusCaseIdV1,
  BabylonNativeBlockReconstructionCorpusCaseV1,
  BabylonNativeBlockReconstructionCorpusEvidenceIndexV1,
  BabylonNativeBlockReconstructionCorpusMaterializationV1,
} from "./reconstruction-corpus.js";

const RUNTIME_FIXTURE_BLOCKS = Object.freeze([
  Object.freeze({ id: "ground-positive-one", shape: "full" as const, center: [0, -0.5, 1] as const }),
  Object.freeze({ id: "ground-zero", shape: "full" as const, center: [0, -0.5, 0] as const }),
  Object.freeze({ id: "ground-negative-one", shape: "full" as const, center: [0, -0.5, -1] as const }),
  Object.freeze({ id: "quarter-meter-rise", shape: "step" as const, center: [0, 0.125, -2] as const }),
  Object.freeze({ id: "elevated-tread", shape: "step" as const, center: [0, 0.125, -3] as const }),
  Object.freeze({ id: "half-meter-blocker", shape: "half" as const, center: [0, 0.5, -4] as const }),
]);

/** Test-only exact Module for real BWB-4 Package/Havok evidence. */
export function createBabylonNativeBlockColliderRuntimeFixtureModuleV1(
  input: Readonly<{ paletteRole?: "ground" | "structure" }> = {},
):
BabylonNativeSceneModuleV1 {
  const paletteRole = isNil(input.paletteRole) ? "ground" : input.paletteRole;
  return defineBabylonNativeScene({
    kind: "babylon-native-scene-module",
    id: "package-fixture-module",
    build(context): void {
      const session = createBabylonNativeBlockProfileSessionV1(context);
      for (const block of RUNTIME_FIXTURE_BLOCKS) {
        session.createBlock({
          id: block.id,
          shape: block.shape,
          paletteRole,
          centerMetersXYZ: block.center,
          ...(paletteRole === "structure"
            ? { visualGroupId: "runtime-fixture-structure" }
            : {}),
        });
      }
      const traversalSurfaceProfileRef =
        "worldkit://traversal-surface-profile/ground.static@1";
      session.finalize(Object.freeze({
        staticColliders: Object.freeze(RUNTIME_FIXTURE_BLOCKS.map((block) =>
          Object.freeze({
            id: `collider-${block.id}`,
            colliderGeometrySource: Object.freeze({ kind: "block" as const, blockId: block.id }),
            traversalBinding: Object.freeze({
              kind: "static-surface" as const,
              surfaceEntityId: `surface-${block.id}`,
              logicalSubshapeId: "top",
              traversalSurfaceProfileRef,
            }),
            exposedEdgePolicy: "none" as const,
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

const CORPUS_MODULE_CASE_IDS = Object.freeze([
  "mountain-cliff",
  "t-shaped-traversal",
  "ordinary-and-blocked-steps",
  "building-exterior",
  "limited-interior",
  "unsupported-spawn",
] as const satisfies readonly BabylonNativeBlockReconstructionCorpusCaseIdV1[]);

/** Test-only exact Module for BWB-5 Package/Havok corpus evidence. */
export function createBabylonNativeBlockReconstructionCorpusModuleV1(
  input: Readonly<{
    caseId: (typeof CORPUS_MODULE_CASE_IDS)[number];
  }>,
): BabylonNativeSceneModuleV1 {
  if (!CORPUS_MODULE_CASE_IDS.includes(input.caseId)) {
    throw new TypeError(
      `WORLDKIT_NATIVE_BLOCK_RECONSTRUCTION_CORPUS_CASE_UNKNOWN: case '${input.caseId}' cannot publish a Runtime Module`,
    );
  }
  return defineBabylonNativeScene({
    kind: "babylon-native-scene-module",
    id: "package-fixture-module",
    build(context): void {
      const materialization =
        materializeBabylonNativeBlockReconstructionCorpusCaseV1(
          context,
          input.caseId,
        );
      if (materialization.outcome !== "finalized") {
        throw new TypeError(
          `${materialization.code}: ${materialization.failureMessage}`,
        );
      }
    },
  });
}
