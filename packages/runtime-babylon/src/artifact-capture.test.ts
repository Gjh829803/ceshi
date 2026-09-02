import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { RegisterAbstractEngineStencil } from "@babylonjs/core/Engines/AbstractEngine/abstractEngine.stencil.pure.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Scene } from "@babylonjs/core/scene.pure.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  captureBabylonArtifactViewV1,
  deriveBabylonTriviewProjectionV1,
} from "./artifact-capture.js";
import { createWhiteboxMaterials } from "./materials.js";
import { createBabylonObjectMeshesV1 } from "./scene-geometry.js";

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
  afterEach(() => vi.unstubAllGlobals());

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

  it("suspends beauty-only ground stripes during a semantic mask capture", () => {
    vi.stubGlobal("HTMLCanvasElement", FakeCanvasElement);
    vi.stubGlobal("document", {
      addEventListener: vi.fn(),
      createElement: () => new FakeCanvasElement(),
      removeEventListener: vi.fn(),
    });
    RegisterAbstractEngineStencil();
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const camera = new FreeCamera("striped-artifact-camera", new Vector3(0, 4, -8), scene);
    camera.setTarget(Vector3.Zero());
    scene.activeCamera = camera;
    const mesh = createBabylonObjectMeshesV1([{
      entityId: "bw-chunk-x-p0-z-p0-cluster-0000",
      prototypeId: "block-walkable",
      primitive: { kind: "box", sizeMetersXYZ: [1, 1, 1] },
      transform: {
        positionMetersXYZ: [0, 0, 0],
        rotationEulerRadiansXYZ: [0, 0, 0],
        scaleXYZ: [1, 1, 9],
      },
      collisionEnabled: true,
      semanticClassId: "block.walkable",
    }], createWhiteboxMaterials(scene), scene)[0]!;
    vi.spyOn(engine, "getRenderingCanvas").mockReturnValue(
      new FakeCanvasElement() as unknown as HTMLCanvasElement,
    );
    const instanceColorPresenceDuringRender: boolean[] = [];
    scene.onBeforeRenderObservable.add(() => {
      instanceColorPresenceDuringRender.push(
        mesh.isVerticesDataPresent(VertexBuffer.ColorInstanceKind),
      );
    });

    try {
      expect(mesh.isVerticesDataPresent(VertexBuffer.ColorInstanceKind)).toBe(true);
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
            "bw-chunk-x-p0-z-p0-cluster-0000": "#FFFFFF",
          },
          projectedEntityIds: [],
        },
      });
      expect(instanceColorPresenceDuringRender.slice(0, 2)).toEqual([false, false]);
      expect(instanceColorPresenceDuringRender.at(-1)).toBe(true);
      expect(mesh.isVerticesDataPresent(VertexBuffer.ColorInstanceKind)).toBe(true);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });

  it("keeps rig dependencies active while isolating and restoring a tri-view target", () => {
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
    scene.activeCamera = null;
    const target = MeshBuilder.CreateBox("rigged-target", {}, scene);
    target.metadata = {
      worldkitEntityId: "batch-primary",
      worldkitEntityIds: ["batch-primary", "rigged-entity"],
    };
    target.visibility = 0.7;
    const dependency = MeshBuilder.CreateBox("rig-dependency", {}, scene);
    dependency.metadata = { worldkitEntityId: "other-entity" };
    dependency.visibility = 0.4;
    vi.spyOn(engine, "getRenderingCanvas").mockReturnValue(
      new FakeCanvasElement() as unknown as HTMLCanvasElement,
    );
    const renderStates: Array<Readonly<{
      targetVisibility: number;
      targetForcedActive: boolean;
      dependencyVisibility: number;
      dependencyIsVisible: boolean;
    }>> = [];
    scene.onBeforeRenderObservable.add(() => renderStates.push({
      targetVisibility: target.visibility,
      targetForcedActive: target.alwaysSelectAsActiveMesh,
      dependencyVisibility: dependency.visibility,
      dependencyIsVisible: dependency.isVisible,
    }));
    vi.spyOn(scene, "render").mockImplementation(() => {
      scene.onBeforeRenderObservable.notifyObservers(scene);
    });

    try {
      captureBabylonArtifactViewV1({
        scene,
        engine,
        camera,
        request: {
          kind: "entity-triview",
          widthPixels: 9,
          heightPixels: 8,
          entityIds: ["rigged-entity"],
          identityColor: "#E85D5D",
          frontDirectionWorldXZ: [0, -1],
        },
      });

      expect(renderStates).toHaveLength(24);
      expect(renderStates).toEqual(expect.arrayContaining([
        expect.objectContaining({
          targetVisibility: 1,
          targetForcedActive: true,
          dependencyIsVisible: true,
        }),
      ]));
      expect(renderStates.every(({ dependencyVisibility }) =>
        dependencyVisibility > 0 && dependencyVisibility < 0.00001)).toBe(true);
      expect(target.visibility).toBe(0.7);
      expect(target.alwaysSelectAsActiveMesh).toBe(false);
      expect(dependency.visibility).toBe(0.4);
      expect(dependency.isVisible).toBe(true);
    } finally {
      scene.dispose();
      engine.dispose();
    }
  });

  it("uses target-local Front/Right/Back directions with one shared orthographic scale", () => {
    const projection = deriveBabylonTriviewProjectionV1({
      sizeMetersXYZ: [5, 4, 2],
      panelAspectRatio: 0.75,
      frontDirectionWorldXZ: [-1, 0],
    });

    expect(projection.viewDirectionsWorldXYZ).toEqual([
      [-1, 0, 0],
      [0, 0, -1],
      [1, 0, 0],
    ]);
    expect(projection.halfHeightMeters).toBeCloseTo((5 * 0.58) / 0.75);
    expect(deriveBabylonTriviewProjectionV1({
      sizeMetersXYZ: [2, 4, 5],
      panelAspectRatio: 0.75,
      frontDirectionWorldXZ: [0, -1],
    }).halfHeightMeters).toBeCloseTo(projection.halfHeightMeters);
  });
});
