import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { RegisterAbstractEngineStencil } from "@babylonjs/core/Engines/AbstractEngine/abstractEngine.stencil.pure.js";
import { RegisterAbstractEngineStates } from "@babylonjs/core/Engines/AbstractEngine/abstractEngine.states.pure.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Scene } from "@babylonjs/core/scene.pure.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { captureBabylonArtifactViewV1 } from "./artifact-capture.js";

class FakeCanvasElement {
  width = 8;
  height = 8;

  getContext(): CanvasRenderingContext2D {
    return {
      drawImage: vi.fn(),
      getImageData: () => ({ data: new Uint8ClampedArray(this.width * this.height * 4) }),
    } as unknown as CanvasRenderingContext2D;
  }

  toDataURL(): string {
    return "data:image/png;base64,fixture";
  }
}

describe("Babylon artifact capture", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps one physical scale and baseline across asymmetric target tri-view panels", () => {
    vi.stubGlobal("HTMLCanvasElement", FakeCanvasElement);
    vi.stubGlobal("document", {
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      createElement: () => new FakeCanvasElement(),
    });
    RegisterAbstractEngineStencil();
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const camera = new FreeCamera("opening", new Vector3(0, 0, -8), scene);
    scene.activeCamera = camera;
    const target = MeshBuilder.CreateBox("asymmetric", { width: 2, height: 1, depth: 8 }, scene);
    target.metadata = { worldkitEntityId: "complete-target" };
    target.material = new StandardMaterial("whitebox", scene);
    vi.spyOn(engine, "getRenderingCanvas").mockReturnValue(new FakeCanvasElement() as unknown as HTMLCanvasElement);
    const projections: { top: number | null; bottom: number | null; left: number | null; right: number | null }[] = [];
    scene.onBeforeRenderObservable.add(() => {
      if (scene.activeCamera?.name !== "worldkit.artifact.triview") return;
      const active = scene.activeCamera;
      projections.push({ top: active.orthoTop, bottom: active.orthoBottom,
        left: active.orthoLeft, right: active.orthoRight });
    });
    try {
      const result = captureBabylonArtifactViewV1({ scene, engine, camera, request: {
        kind: "entity-triview", widthPixels: 6, heightPixels: 2,
        entityIds: ["complete-target"], identityColor: "#E85D5D",
      } });
      expect(result).toMatchObject({ widthPixels: 6, heightPixels: 2 });
      // The empty synthetic framebuffer exhausts the old eight renders per panel.
      expect(projections).toHaveLength(24);
      for (const projection of projections) {
        expect(projection).toEqual({ top: 8 * 0.58, bottom: -8 * 0.58,
          left: -8 * 0.58, right: 8 * 0.58 });
      }
      expect(scene.activeCamera).toBe(camera);
    } finally { scene.dispose(); engine.dispose(); }
  });

  it.each([[1, false], [3, false], [Infinity, false], [3, true]] as const)(
    "replays old per-panel foreground retries (ready at %s, copy failure %s)", (readyAt, copyFailure) => {
    RegisterAbstractEngineStates();
    // Synthetic framebuffer controls readiness; real Babylon owns camera/mesh state.
    const attempts = [0, 0, 0];
    const pixels = new Uint8ClampedArray(6 * 2 * 4);
    for (let offset = 0; offset < pixels.length; offset += 4) {
      pixels.set([221, 232, 238, 255], offset);
    }
    class PanelCanvas extends FakeCanvasElement {
      override getContext(): CanvasRenderingContext2D {
        return {
          drawImage: (_canvas: unknown, x: number) => {
            const index = x / 2;
            attempts[index]! += 1;
            if (copyFailure && index === 1) throw new Error("framebuffer copy failed");
            if (attempts[index]! < readyAt) return;
            for (let y = 0; y < 2; y += 1) {
              for (let dx = 0; dx < 2; dx += 1) {
                pixels.set([232, 93, 93, 255], (y * 6 + x + dx) * 4);
              }
            }
          },
          getImageData: () => ({ data: pixels }),
        } as unknown as CanvasRenderingContext2D;
      }
    }
    vi.stubGlobal("HTMLCanvasElement", FakeCanvasElement);
    vi.stubGlobal("document", {
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      createElement: () => new PanelCanvas(),
    });
    RegisterAbstractEngineStencil();
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const camera = new FreeCamera("opening", new Vector3(0, 0, -8), scene);
    scene.activeCamera = camera;
    const target = MeshBuilder.CreateBox("target", {}, scene);
    target.metadata = { worldkitEntityId: "complete-target" };
    target.visibility = 0.7;
    const dependency = MeshBuilder.CreateBox("dependency", {}, scene);
    dependency.visibility = 0.4;
    const hidden = MeshBuilder.CreateBox("hidden", {}, scene);
    hidden.isVisible = false;
    vi.spyOn(engine, "getRenderingCanvas").mockReturnValue(new FakeCanvasElement() as unknown as HTMLCanvasElement);
    const flush = vi.spyOn(engine, "flushFramebuffer");
    scene.onBeforeRenderObservable.add(() => {
      if (scene.activeCamera?.name !== "worldkit.artifact.triview") return;
      expect(scene.clearColor.toHexString()).toBe("#DDE8EEFF");
      expect(target.alwaysSelectAsActiveMesh).toBe(true);
      expect(target.visibility).toBe(1);
      expect(dependency.isVisible).toBe(true);
      expect(dependency.visibility).toBe(1e-6);
      expect(hidden.isVisible).toBe(false);
    });
    try {
      const capture = () => captureBabylonArtifactViewV1({ scene, engine, camera, request: {
        kind: "entity-triview", widthPixels: 6, heightPixels: 2,
        entityIds: ["complete-target"], identityColor: "#E85D5D",
      } });
      if (copyFailure) {
        expect(capture).toThrow("framebuffer copy failed");
        expect(attempts).toEqual([3, 1, 0]);
        expect(flush).toHaveBeenCalledTimes(4);
      } else {
        capture();
        expect(attempts).toEqual(Array(3).fill(Math.min(readyAt, 8)));
        expect(flush).toHaveBeenCalledTimes(Math.min(readyAt, 8) * 3);
      }
      expect(target.alwaysSelectAsActiveMesh).toBe(false);
      expect(target.visibility).toBe(0.7);
      expect(dependency.visibility).toBe(0.4);
      expect(dependency.isVisible).toBe(true);
      expect(hidden.isVisible).toBe(false);
      expect(scene.activeCamera).toBe(camera);
    } finally { scene.dispose(); engine.dispose(); }
  });

  it("renders different entity mask colors when meshes share their beauty material", () => {
    // This catches assigning semantic colors to the shared source material:
    // the last entity would overwrite every mesh before the single scene draw.
    vi.stubGlobal("HTMLCanvasElement", FakeCanvasElement);
    vi.stubGlobal("document", {
      addEventListener: vi.fn(),
      createElement: () => new FakeCanvasElement(),
      removeEventListener: vi.fn(),
    });
    RegisterAbstractEngineStencil();
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const camera = new FreeCamera("artifact-camera", new Vector3(0, 0, -8), scene);
    camera.setTarget(Vector3.Zero());
    scene.activeCamera = camera;
    const sharedMaterial = new StandardMaterial("shared-beauty", scene);
    sharedMaterial.emissiveColor = new Color3(0.1, 0.2, 0.3);
    const firstMesh = MeshBuilder.CreateBox("first", {}, scene);
    firstMesh.position.x = -1;
    firstMesh.material = sharedMaterial;
    firstMesh.metadata = { worldkitEntityId: "first-entity" };
    const secondMesh = MeshBuilder.CreateBox("second", {}, scene);
    secondMesh.position.x = 1;
    secondMesh.material = sharedMaterial;
    secondMesh.metadata = { worldkitEntityId: "second-entity" };
    const canvas = new FakeCanvasElement();
    vi.spyOn(engine, "getRenderingCanvas").mockReturnValue(
      canvas as unknown as HTMLCanvasElement,
    );
    const renderedMaterials: Array<Readonly<{
      firstColor: readonly number[];
      isShared: boolean;
      secondColor: readonly number[];
    }>> = [];
    scene.onBeforeRenderObservable.add(() => {
      const firstRenderedMaterial = firstMesh.material as StandardMaterial;
      const secondRenderedMaterial = secondMesh.material as StandardMaterial;
      renderedMaterials.push({
        firstColor: firstRenderedMaterial.emissiveColor.asArray(),
        isShared: firstRenderedMaterial === secondRenderedMaterial,
        secondColor: secondRenderedMaterial.emissiveColor.asArray(),
      });
    });

    try {
      captureBabylonArtifactViewV1({
        scene,
        engine,
        camera,
        request: {
          kind: "composition-mask",
          widthPixels: 8,
          heightPixels: 8,
          backgroundColor: "#000000",
          colorByEntityId: {
            "first-entity": "#FF0000",
            "second-entity": "#00FF00",
          },
          projectedEntityIds: [],
        },
      });

      expect(renderedMaterials[0]).toEqual({
        firstColor: [1, 0, 0],
        isShared: false,
        secondColor: [0, 1, 0],
      });
      expect(firstMesh.material).toBe(sharedMaterial);
      expect(secondMesh.material).toBe(sharedMaterial);
      expect(sharedMaterial.emissiveColor.asArray()).toEqual([0.1, 0.2, 0.3]);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });

  it("releases cloned textures after every repeated composition mask capture", () => {
    // This catches disposing a cloned StandardMaterial without its cloned
    // textures, which leaves one Scene/GPU texture per mesh and capture.
    vi.stubGlobal("HTMLCanvasElement", FakeCanvasElement);
    vi.stubGlobal("document", {
      addEventListener: vi.fn(),
      createElement: () => new FakeCanvasElement(),
      removeEventListener: vi.fn(),
    });
    RegisterAbstractEngineStencil();
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const camera = new FreeCamera("textured-artifact-camera", new Vector3(0, 0, -8), scene);
    camera.setTarget(Vector3.Zero());
    scene.activeCamera = camera;
    const beautyMaterial = new StandardMaterial("textured-beauty", scene);
    const beautyTexture = RawTexture.CreateRGBATexture(
      new Uint8Array([255, 255, 255, 255]),
      1,
      1,
      scene,
      false,
    );
    beautyMaterial.diffuseTexture = beautyTexture;
    const mesh = MeshBuilder.CreateBox("textured", {}, scene);
    mesh.material = beautyMaterial;
    mesh.metadata = { worldkitEntityId: "textured-entity" };
    vi.spyOn(engine, "getRenderingCanvas").mockReturnValue(
      new FakeCanvasElement() as unknown as HTMLCanvasElement,
    );
    const request = {
      kind: "composition-mask" as const,
      widthPixels: 8,
      heightPixels: 8,
      backgroundColor: "#000000",
      colorByEntityId: { "textured-entity": "#112233" },
      projectedEntityIds: [],
    };

    try {
      expect(scene.textures).toEqual([beautyTexture]);

      captureBabylonArtifactViewV1({ scene, engine, camera, request });
      expect(scene.textures).toEqual([beautyTexture]);

      captureBabylonArtifactViewV1({ scene, engine, camera, request });
      expect(scene.textures).toEqual([beautyTexture]);
      expect(mesh.material).toBe(beautyMaterial);
      expect(beautyMaterial.diffuseTexture).toBe(beautyTexture);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });

  it("captures a world-scale lateral elevation with one bounded orthographic camera", () => {
    // This catches mapping world-side to the current opening camera or to one
    // panel of the object-local entity triview instead of fitting world bounds.
    vi.stubGlobal("HTMLCanvasElement", FakeCanvasElement);
    vi.stubGlobal("document", {
      addEventListener: vi.fn(),
      createElement: () => new FakeCanvasElement(),
      removeEventListener: vi.fn(),
    });
    RegisterAbstractEngineStencil();
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const openingCamera = new FreeCamera(
      "opening-camera",
      new Vector3(0, 4, -12),
      scene,
    );
    openingCamera.setTarget(Vector3.Zero());
    scene.activeCamera = openingCamera;
    const previousWidth = engine.getRenderWidth(true);
    const previousHeight = engine.getRenderHeight(true);
    vi.spyOn(engine, "getRenderingCanvas").mockReturnValue(
      new FakeCanvasElement() as unknown as HTMLCanvasElement,
    );
    const renderedCameras: Array<Readonly<{
      mode: number;
      name: string;
      orthoBottom: number | null;
      orthoLeft: number | null;
      orthoRight: number | null;
      orthoTop: number | null;
      position: readonly number[];
      target: readonly number[];
    }>> = [];
    scene.onBeforeRenderObservable.add(() => {
      const activeCamera = scene.activeCamera as FreeCamera;
      renderedCameras.push({
        mode: activeCamera.mode,
        name: activeCamera.name,
        orthoBottom: activeCamera.orthoBottom,
        orthoLeft: activeCamera.orthoLeft,
        orthoRight: activeCamera.orthoRight,
        orthoTop: activeCamera.orthoTop,
        position: activeCamera.position.asArray(),
        target: activeCamera.getTarget().asArray(),
      });
    });

    try {
      captureBabylonArtifactViewV1({
        scene,
        engine,
        camera: openingCamera,
        request: {
          kind: "world-side",
          widthPixels: 8,
          heightPixels: 4,
          worldBoundsMeters: {
            minimumMetersXYZ: [-20, -2, -5],
            maximumMetersXYZ: [20, 8, 5],
          },
          cameraPositionMetersXYZ: [60, 3, 0],
          targetMetersXYZ: [0, 3, 0],
        },
      });

      expect(renderedCameras).toHaveLength(3);
      for (const renderedCamera of renderedCameras.slice(0, 2)) {
        expect(renderedCamera).toMatchObject({
          mode: 1,
          name: "worldkit.artifact.world-side",
          position: [60, 3, 0],
        });
        expect(renderedCamera.orthoBottom).toBeCloseTo(-5, 8);
        expect(renderedCamera.orthoLeft).toBeCloseTo(-10, 8);
        expect(renderedCamera.orthoRight).toBeCloseTo(10, 8);
        expect(renderedCamera.orthoTop).toBeCloseTo(5, 8);
        expect(renderedCamera.target[0]).toBeCloseTo(0, 6);
        expect(renderedCamera.target[1]).toBeCloseTo(3, 6);
        expect(renderedCamera.target[2]).toBeCloseTo(0, 6);
      }
      expect(scene.activeCamera).toBe(openingCamera);
      expect(engine.getRenderWidth(true)).toBe(previousWidth);
      expect(engine.getRenderHeight(true)).toBe(previousHeight);
      expect(scene.cameras.map(({ name }) => name)).toEqual(["opening-camera"]);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });

  it("measures with the exact rendered world-side camera and render size", () => {
    // This catches measuring after artifact capture has already restored the
    // SDK camera or the previous engine dimensions.
    vi.stubGlobal("HTMLCanvasElement", FakeCanvasElement);
    vi.stubGlobal("document", {
      addEventListener: vi.fn(),
      createElement: () => new FakeCanvasElement(),
      removeEventListener: vi.fn(),
    });
    RegisterAbstractEngineStencil();
    const engine = new NullEngine({
      renderWidth: 16,
      renderHeight: 9,
      textureSize: 16,
      deterministicLockstep: true,
      lockstepMaxSteps: 4,
    });
    const scene = new Scene(engine);
    const openingCamera = new FreeCamera(
      "opening-camera",
      new Vector3(0, 4, -12),
      scene,
    );
    openingCamera.setTarget(Vector3.Zero());
    scene.activeCamera = openingCamera;
    vi.spyOn(engine, "getRenderingCanvas").mockReturnValue(
      new FakeCanvasElement() as unknown as HTMLCanvasElement,
    );

    try {
      const result = captureBabylonArtifactViewV1({
        scene,
        engine,
        camera: openingCamera,
        request: {
          kind: "world-side",
          widthPixels: 8,
          heightPixels: 4,
          worldBoundsMeters: {
            minimumMetersXYZ: [-20, -2, -5],
            maximumMetersXYZ: [20, 8, 5],
          },
          cameraPositionMetersXYZ: [60, 3, 0],
          targetMetersXYZ: [0, 3, 0],
          measureAfterRender: ({ camera, heightPixels, widthPixels }) => ({
            cameraName: camera.name,
            mode: camera.mode,
            size: [widthPixels, heightPixels],
          }),
        },
      });

      expect(result.measurement).toEqual({
        cameraName: "worldkit.artifact.world-side",
        mode: 1,
        size: [8, 4],
      });
      expect(scene.activeCamera).toBe(openingCamera);
      expect(engine.getRenderWidth(true)).toBe(16);
      expect(engine.getRenderHeight(true)).toBe(9);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });

  it("restores explicit collider overlay resources when measurement throws", () => {
    // This catches leaking an overlay material or leaving a collision-only
    // mesh visible after a failed formal capture transaction.
    vi.stubGlobal("HTMLCanvasElement", FakeCanvasElement);
    vi.stubGlobal("document", {
      addEventListener: vi.fn(),
      createElement: () => new FakeCanvasElement(),
      removeEventListener: vi.fn(),
    });
    RegisterAbstractEngineStencil();
    const engine = new NullEngine({
      renderWidth: 16,
      renderHeight: 9,
      textureSize: 16,
      deterministicLockstep: true,
      lockstepMaxSteps: 4,
    });
    const scene = new Scene(engine);
    const openingCamera = new FreeCamera(
      "opening-camera",
      new Vector3(0, 4, -12),
      scene,
    );
    openingCamera.setTarget(Vector3.Zero());
    scene.activeCamera = openingCamera;
    const collider = MeshBuilder.CreateBox("explicit-collider", {}, scene);
    const originalMaterial = new StandardMaterial("collider-source", scene);
    collider.material = originalMaterial;
    collider.isVisible = false;
    vi.spyOn(engine, "getRenderingCanvas").mockReturnValue(
      new FakeCanvasElement() as unknown as HTMLCanvasElement,
    );
    const materialCountBefore = scene.materials.length;

    try {
      expect(() => captureBabylonArtifactViewV1({
        scene,
        engine,
        camera: openingCamera,
        request: {
          kind: "explicit-collider-overlay",
          widthPixels: 8,
          heightPixels: 4,
          colliderMeshes: [collider],
          overlayColor: "#FF00FF",
          measureAfterRender: () => {
            throw new Error("measurement failed");
          },
        },
      })).toThrowError("measurement failed");

      expect(collider.isVisible).toBe(false);
      expect(collider.material).toBe(originalMaterial);
      expect(scene.materials).toHaveLength(materialCountBefore);
      expect(scene.activeCamera).toBe(openingCamera);
      expect(engine.getRenderWidth(true)).toBe(16);
      expect(engine.getRenderHeight(true)).toBe(9);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });

  it("continues restoring the capture transaction when temporary camera disposal throws", () => {
    vi.stubGlobal("HTMLCanvasElement", FakeCanvasElement);
    vi.stubGlobal("document", {
      addEventListener: vi.fn(),
      createElement: () => new FakeCanvasElement(),
      removeEventListener: vi.fn(),
    });
    RegisterAbstractEngineStencil();
    const engine = new NullEngine({
      renderWidth: 16,
      renderHeight: 9,
      textureSize: 16,
      deterministicLockstep: true,
      lockstepMaxSteps: 4,
    });
    const scene = new Scene(engine);
    const openingCamera = new FreeCamera("opening-camera", new Vector3(0, 4, -12), scene);
    openingCamera.setTarget(Vector3.Zero());
    scene.activeCamera = openingCamera;
    const previousClearColor = scene.clearColor.clone();
    vi.spyOn(engine, "getRenderingCanvas").mockReturnValue(
      new FakeCanvasElement() as unknown as HTMLCanvasElement,
    );
    try {
      expect(() => captureBabylonArtifactViewV1({
        scene,
        engine,
        camera: openingCamera,
        request: {
          kind: "world-side",
          widthPixels: 8,
          heightPixels: 4,
          worldBoundsMeters: {
            minimumMetersXYZ: [-4, 0, -4],
            maximumMetersXYZ: [4, 4, 4],
          },
          cameraPositionMetersXYZ: [8, 6, 8],
          targetMetersXYZ: [0, 1, 0],
          measureAfterRender: ({ camera }) => {
            const originalDispose = camera.dispose.bind(camera);
            vi.spyOn(camera, "dispose").mockImplementation(() => {
              originalDispose();
              throw new Error("dispose-failed");
            });
          },
        },
      })).toThrowError("BABYLON_ARTIFACT_CAPTURE_CLEANUP_FAILED");

      expect(scene.activeCamera).toBe(openingCamera);
      expect(scene.cameras.map(({ name }) => name)).toEqual(["opening-camera"]);
      expect(scene.clearColor.equals(previousClearColor)).toBe(true);
      expect(engine.getRenderWidth(true)).toBe(16);
      expect(engine.getRenderHeight(true)).toBe(9);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });
});
