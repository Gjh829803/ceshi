import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { RegisterAbstractEngineStencil } from "@babylonjs/core/Engines/AbstractEngine/abstractEngine.stencil.pure.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import "@babylonjs/core/Meshes/thinInstanceMesh.js";
import { Scene } from "@babylonjs/core/scene.pure.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { captureBabylonArtifactViewV1, type BabylonArtifactCaptureRequestV1 } from "./artifact-capture.js";

class Canvas {
  width = 8;
  height = 8;
  getContext() {
    return { drawImage: vi.fn(), getImageData: () => ({ data: new Uint8ClampedArray(this.width * this.height * 4) }) };
  }
  toDataURL() { return "data:image/png;base64,fixture"; }
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function fixture() {
  vi.stubGlobal("HTMLCanvasElement", Canvas);
  vi.stubGlobal("document", { addEventListener: vi.fn(), removeEventListener: vi.fn(), createElement: () => new Canvas() });
  RegisterAbstractEngineStencil();
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new FreeCamera("camera", new Vector3(0, 1, -8), scene);
  camera.setTarget(Vector3.Zero());
  scene.activeCamera = camera;
  const material = new StandardMaterial("shared-display", scene);
  material.emissiveColor = new Color3(0.1, 0.2, 0.3);
  const meshes = ["target-a", "target-b", "occluder"].map((name, index) => {
    const mesh = MeshBuilder.CreateBox(name, {}, scene);
    mesh.position.x = index - 1;
    mesh.material = material;
    return mesh;
  });
  vi.spyOn(engine, "getRenderingCanvas").mockReturnValue(new Canvas() as unknown as HTMLCanvasElement);
  return { scene, engine, camera, material, meshes,
    dispose() { scene.dispose(); engine.dispose(); } };
}

describe("same-view identity mask capture", () => {
  it.each(["opening-frame", "world-side", "formal-world-top-down"] as const)(
    "keeps display pixels and exact %s camera while rendering opaque unlit identities", (kind) => {
      const f = fixture();
      const beforeMaterials = [...f.scene.materials];
      const beforeClearColor = f.scene.clearColor.clone();
      const render = vi.spyOn(f.scene, "render");
      const renders: { camera: object; transform: number[]; colors: number[][]; unlit: boolean[] }[] = [];
      f.scene.onBeforeRenderObservable.add(() => {
        renders.push({ camera: f.scene.activeCamera!, transform: [...f.scene.activeCamera!.getTransformationMatrix().asArray()],
          colors: f.meshes.map((mesh) => (mesh.material as StandardMaterial).emissiveColor.asArray()),
          unlit: f.meshes.map((mesh) => (mesh.material as StandardMaterial).disableLighting) });
      });
      const measured = vi.fn(() => "display-measurement");
      const request = {
        kind, widthPixels: 8, heightPixels: 8,
        ...(kind === "opening-frame" ? {} : {
          worldBoundsMeters: { minimumMetersXYZ: [-4, -2, -3], maximumMetersXYZ: [4, 2, 3] },
          cameraPositionMetersXYZ: kind === "world-side" ? [12, 0, 0] : [0, 12, 0], targetMetersXYZ: [0, 0, 0],
        }),
        measureAfterRender: measured,
        identityMaskColorsByMesh: () => new Map([[f.meshes[0]!, "#FF0000"], [f.meshes[1]!, "#00FF00"]]),
      } as BabylonArtifactCaptureRequestV1;
      try {
        const result = captureBabylonArtifactViewV1({ ...f, request });
        expect(result.identityMask).toMatchObject({ widthPixels: 8, heightPixels: 8, dataUrl: "data:image/png;base64,fixture" });
        expect(result.measurement).toBe("display-measurement");
        expect(measured).toHaveBeenCalledTimes(1);
        expect(renders).toHaveLength(5);
        expect(renders[0]!.unlit).toEqual([false, false, false]);
        expect(renders[2]!.colors).toEqual([[1,0,0], [0,1,0], [0,0,0]]);
        expect(renders[2]!.unlit).toEqual([true, true, true]);
        expect(renders[2]!.camera).toBe(renders[0]!.camera);
        expect(renders[2]!.transform).toEqual(renders[0]!.transform);
        expect(render.mock.calls.slice(2, 4)).toEqual([[false, true], [false, true]]);
        expect(f.scene.postProcessesEnabled).toBe(true);
        expect(f.scene.materials).toEqual(beforeMaterials);
        expect(f.scene.clearColor).toEqual(beforeClearColor);
        expect(f.scene.activeCamera).toBe(f.camera);
        expect(f.meshes.every((mesh) => mesh.material === f.material)).toBe(true);
      } finally { f.dispose(); }
    },
  );

  it("restores materials and camera after identity rendering throws", () => {
    const f = fixture();
    const failure = new Error("identity render failed");
    const beforeMaterials = [...f.scene.materials];
    f.scene.onBeforeRenderObservable.add(() => {
      if ((f.meshes[0]!.material as StandardMaterial).disableLighting) throw failure;
    });
    try {
      expect(() => captureBabylonArtifactViewV1({ ...f, request: {
        kind: "opening-frame", widthPixels: 8, heightPixels: 8,
        identityMaskColorsByMesh: () => new Map([[f.meshes[0]!, "#FF0000"]]),
      } })).toThrow(failure);
      expect(f.scene.materials).toEqual(beforeMaterials);
      expect(f.scene.activeCamera).toBe(f.camera);
      expect(f.meshes.every((mesh) => mesh.material === f.material)).toBe(true);
    } finally { f.dispose(); }
  });

  it.each(["disposed", "foreign", "invalid-color"])("rejects %s handles without mutating resources", (mode) => {
    const f = fixture();
    const foreign = new Scene(f.engine);
    const selected = mode === "foreign" ? MeshBuilder.CreateBox("foreign", {}, foreign) : f.meshes[0]!;
    if (mode === "disposed") selected.dispose();
    const beforeMaterials = [...f.scene.materials];
    try {
      expect(() => captureBabylonArtifactViewV1({ ...f, request: {
        kind: "opening-frame", widthPixels: 8, heightPixels: 8,
        identityMaskColorsByMesh: () => new Map([[selected, mode === "invalid-color" ? "red" : "#FF0000"]]),
      } })).toThrow("BABYLON_ARTIFACT_IDENTITY_HANDLE_INVALID");
      expect(f.scene.materials).toEqual(beforeMaterials);
      expect(f.scene.activeCamera).toBe(f.camera);
    } finally { foreign.dispose(); f.dispose(); }
  });

  it("preserves thin-instance transforms while using the explicitly bound batch color", () => {
    const f = fixture();
    const matrices = Float32Array.from([
      1,0,0,0, 0,1,0,0, 0,0,1,0, -2,0,0,1,
      1,0,0,0, 0,1,0,0, 0,0,1,0, 3,0,0,1,
    ]);
    f.meshes[0]!.thinInstanceSetBuffer("matrix", matrices, 16, true);
    const maskColors: number[][] = [];
    f.scene.onBeforeRenderObservable.add(() => {
      const material = f.meshes[0]!.material as StandardMaterial;
      if (material.disableLighting) maskColors.push(material.emissiveColor.asArray());
    });
    try {
      captureBabylonArtifactViewV1({ ...f, request: {
        kind: "opening-frame", widthPixels: 8, heightPixels: 8,
        identityMaskColorsByMesh: () => new Map([[f.meshes[0]!, "#FF0000"]]),
      } });
      expect(maskColors).toEqual([[1,0,0], [1,0,0]]);
      expect(f.meshes[0]!.thinInstanceCount).toBe(2);
      expect(f.meshes[0]!.thinInstanceGetWorldMatrices().map((m) => Array.from(m.asArray().slice(12, 15)))).toEqual([
        [-2,0,0], [3,0,0],
      ]);
      expect(f.meshes[0]!.material).toBe(f.material);
    } finally { f.dispose(); }
  });
});
