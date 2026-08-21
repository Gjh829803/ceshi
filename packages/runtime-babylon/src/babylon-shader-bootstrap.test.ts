import { ShaderStore } from "@babylonjs/core/Engines/shaderStore.js";
import { describe, expect, it } from "vitest";

import "./babylon-world-runtime";

describe("Babylon shader bootstrap", () => {
  it("registers every browser shader before Runtime construction", () => {
    expect({
      defaultVertexShader: ShaderStore.ShadersStore.defaultVertexShader,
      defaultPixelShader: ShaderStore.ShadersStore.defaultPixelShader,
      postprocessVertexShader: ShaderStore.ShadersStore.postprocessVertexShader,
      rgbdDecodePixelShader: ShaderStore.ShadersStore.rgbdDecodePixelShader,
    }).toEqual({
      defaultVertexShader: expect.stringMatching(/\S/),
      defaultPixelShader: expect.stringMatching(/\S/),
      postprocessVertexShader: expect.stringMatching(/\S/),
      rgbdDecodePixelShader: expect.stringMatching(/\S/),
    });
  });
});
