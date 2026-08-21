import { ShaderStore } from "@babylonjs/core/Engines/shaderStore.js";
import { defaultPixelShader } from "@babylonjs/core/Shaders/default.fragment.js";
import { defaultVertexShader } from "@babylonjs/core/Shaders/default.vertex.js";
import { postprocessVertexShader } from "@babylonjs/core/Shaders/postprocess.vertex.js";
import { rgbdDecodePixelShader } from "@babylonjs/core/Shaders/rgbdDecode.fragment.js";

const requiredBrowserShaders = [
  defaultVertexShader,
  defaultPixelShader,
  postprocessVertexShader,
  rgbdDecodePixelShader,
] as const;

for (const requiredBrowserShader of requiredBrowserShaders) {
  ShaderStore.ShadersStore[requiredBrowserShader.name] = requiredBrowserShader.shader;
}
