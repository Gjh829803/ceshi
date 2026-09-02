import { describe, expectTypeOf, it } from "vitest";

import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";

import type {
  BabylonNativeBlockOptimizationAssessmentV1,
  BabylonNativeBlockCreateInputV1,
  BabylonNativeBlockColliderGeometrySourceV1,
  BabylonNativeBlockFinalizedEpochV1,
  BabylonNativeBlockGridCreateInputV1,
  BabylonNativeBlockProfileFinalizeInputV1,
  BabylonNativeBlockProfileSessionV1,
  BabylonNativeBlockRotationQuarterTurnsYV1,
  BabylonNativeBlockStaticColliderSelectionV1,
} from "./index.js";
import { assessBabylonNativeBlockOptimizationV1 } from "./index.js";

describe("Babylon Native block profile public types", () => {
  it("names the ephemeral helper argument as a positioned create input", () => {
    expectTypeOf<BabylonNativeBlockRotationQuarterTurnsYV1>()
      .toEqualTypeOf<0 | 1 | 2 | 3>();
    expectTypeOf<BabylonNativeBlockCreateInputV1>().toEqualTypeOf<Readonly<{
      id: string;
      shape: "full" | "half" | "quarter" | "small" | "step";
      paletteRole:
        | "ground"
        | "route"
        | "structure"
        | "hazard"
        | "water-like-visual"
        | "background-mass";
      centerMetersXYZ: readonly [
        xMeters: number,
        yMeters: number,
        zMeters: number,
      ];
      rotationQuarterTurnsY?: 0 | 1 | 2 | 3;
      visualGroupId?: string;
      colliderGroupId?: string;
    }>>();
    expectTypeOf<BabylonNativeBlockProfileSessionV1["createBlock"]>()
      .parameter(0)
      .toEqualTypeOf<Readonly<BabylonNativeBlockCreateInputV1>>();
    expectTypeOf<BabylonNativeBlockProfileSessionV1["createBlock"]>()
      .returns
      .toEqualTypeOf<Mesh>();
    expectTypeOf<BabylonNativeBlockProfileSessionV1["finalize"]>()
      .parameter(0)
      .toEqualTypeOf<Readonly<BabylonNativeBlockProfileFinalizeInputV1>>();
    expectTypeOf<BabylonNativeBlockProfileSessionV1["finalize"]>()
      .returns
      .toEqualTypeOf<BabylonNativeBlockFinalizedEpochV1>();
    expectTypeOf<BabylonNativeBlockProfileSessionV1["dispose"]>()
      .returns
      .toEqualTypeOf<void>();
  });

  it("names the dense repetition argument as a grid create input", () => {
    expectTypeOf<BabylonNativeBlockGridCreateInputV1>().toEqualTypeOf<Readonly<{
      idPrefix: string;
      shape: "full" | "half" | "quarter" | "small" | "step";
      paletteRole:
        | "ground"
        | "route"
        | "structure"
        | "hazard"
        | "water-like-visual"
        | "background-mass";
      minimumCenterMetersXYZ: readonly [
        xMeters: number,
        yMeters: number,
        zMeters: number,
      ];
      repeatCountXYZ: readonly [
        xCount: number,
        yCount: number,
        zCount: number,
      ];
      rotationQuarterTurnsY?: 0 | 1 | 2 | 3;
      visualGroupId?: string;
      colliderGroupId?: string;
    }>>();
    expectTypeOf<BabylonNativeBlockProfileSessionV1["createBlockGrid"]>()
      .parameter(0)
      .toEqualTypeOf<Readonly<BabylonNativeBlockGridCreateInputV1>>();
    expectTypeOf<BabylonNativeBlockProfileSessionV1["createBlockGrid"]>()
      .returns
      .toEqualTypeOf<readonly Mesh[]>();
  });

  it("exposes one closed current-only Collider geometry source", () => {
    expectTypeOf<BabylonNativeBlockColliderGeometrySourceV1>()
      .toEqualTypeOf<
        | Readonly<{ kind: "block"; blockId: string }>
        | Readonly<{ kind: "block-group"; colliderGroupId: string }>
      >();
    expectTypeOf<BabylonNativeBlockStaticColliderSelectionV1>()
      .toEqualTypeOf<Readonly<{
        id: string;
        colliderGeometrySource: BabylonNativeBlockColliderGeometrySourceV1;
        traversalBinding:
          | Readonly<{ kind: "not-traversable" }>
          | Readonly<{
              kind: "static-surface";
              surfaceEntityId: string;
              logicalSubshapeId: string;
              traversalSurfaceProfileRef: string;
            }>;
        exposedEdgePolicy: "none" | "protect-ground-subject";
        frictionRatio?: number;
        restitutionRatio?: number;
      }>>();
  });

  it("exposes one finalized-epoch optimization assessment", () => {
    expectTypeOf(assessBabylonNativeBlockOptimizationV1)
      .parameter(0)
      .toEqualTypeOf<Readonly<{
        finalizedEpoch: BabylonNativeBlockFinalizedEpochV1;
      }>>();
    expectTypeOf(assessBabylonNativeBlockOptimizationV1)
      .returns
      .toEqualTypeOf<BabylonNativeBlockOptimizationAssessmentV1>();
  });
});
