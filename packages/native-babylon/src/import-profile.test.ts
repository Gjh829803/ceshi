import { describe, expect, it } from "vitest";

import {
  BABYLON_NATIVE_DEEP_ESM_IMPORT_SPECIFIERS_V1,
} from "./import-profile.js";

describe("BabylonNativeImportProfileV1", () => {
  it("freezes the one exact AI-facing Deep ESM dialect", () => {
    expect(BABYLON_NATIVE_DEEP_ESM_IMPORT_SPECIFIERS_V1).toEqual([
      "@babylonjs/core/Buffers/buffer.js",
      "@babylonjs/core/Lights/directionalLight.js",
      "@babylonjs/core/Lights/hemisphericLight.js",
      "@babylonjs/core/Lights/pointLight.js",
      "@babylonjs/core/Materials/standardMaterial.js",
      "@babylonjs/core/Maths/math.color.js",
      "@babylonjs/core/Maths/math.vector.js",
      "@babylonjs/core/Meshes/mesh.js",
      "@babylonjs/core/Meshes/mesh.vertexData.js",
      "@babylonjs/core/Meshes/meshBuilder.js",
      "@babylonjs/core/Meshes/transformNode.js",
      "@babylonjs/core/scene.js",
    ]);
    expect(Object.isFrozen(BABYLON_NATIVE_DEEP_ESM_IMPORT_SPECIFIERS_V1))
      .toBe(true);
  });
});
