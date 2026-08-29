import { describe, expectTypeOf, it } from "vitest";

import type {
  BabylonNativeBlockCreateInputV1,
  BabylonNativeBlockProfileSessionV1,
} from "./index.js";

describe("Babylon Native block profile public types", () => {
  it("names the ephemeral helper argument as a create input", () => {
    expectTypeOf<BabylonNativeBlockCreateInputV1>().toEqualTypeOf<Readonly<{
      id: string;
      shape: "full" | "half" | "quarter" | "small";
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
  });
});
