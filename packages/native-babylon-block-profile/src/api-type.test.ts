import { describe, expectTypeOf, it } from "vitest";

import type {
  BabylonNativeBlockOptimizationAssessmentV1,
  BabylonNativeBlockCreateInputV1,
  BabylonNativeBlockFinalizedEpochV1,
  BabylonNativeBlockProfileFinalizeInputV1,
  BabylonNativeBlockProfileSessionV1,
} from "./index.js";
import { assessBabylonNativeBlockOptimizationV1 } from "./index.js";

describe("Babylon Native block profile public types", () => {
  it("names the ephemeral helper argument as a create input", () => {
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
      visualGroupId?: string;
    }>>();
    expectTypeOf<BabylonNativeBlockProfileSessionV1["createBlock"]>()
      .parameter(0)
      .toEqualTypeOf<Readonly<BabylonNativeBlockCreateInputV1>>();
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
