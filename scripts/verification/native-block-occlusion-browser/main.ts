import { Engine } from "@babylonjs/core/Engines/engine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { NativeBlockSubjectOcclusionFadeV1 } from "../../../packages/runtime-babylon/src/native-block-subject-occlusion";
import { captureBabylonArtifactViewV1, prepareBabylonArtifactIdentityCaptureV1 } from "../../../packages/runtime-babylon/src/artifact-capture";

const result = document.querySelector<HTMLPreElement>("#result")!;

async function run() {
  const canvas = document.querySelector<HTMLCanvasElement>("#world")!;
  const engine = new Engine(canvas, false, { preserveDrawingBuffer: true, stencil: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.05, 0.05, 0.05, 1);
  const camera = new FreeCamera("camera", new Vector3(0, 1, 5), scene);
  camera.setTarget(new Vector3(0, 1, 0));
  camera.minZ = 0.05;
  const material = (id: string, color: string) => {
    const m = new StandardMaterial(id, scene);
    m.disableLighting = true;
    m.emissiveColor = Color3.FromHexString(color);
    m.diffuseColor = Color3.Black();
    m.specularColor = Color3.Black();
    return m;
  };
  const subject = MeshBuilder.CreateBox("subject", { width: 0.7, height: 1.8, depth: 0.5 }, scene);
  subject.position.y = 0.9;
  subject.material = material("subject", "#FF0000");
  const wall = MeshBuilder.CreateBox("wall", {}, scene);
  wall.material = material("wall", "#0000FF");
  const transforms = [
    { positionMetersXYZ: [0, 1, 2.5] as const, scaleXYZ: [1.4, 2.4, 0.2] as const },
    { positionMetersXYZ: [1.7, 0.4, 0] as const, scaleXYZ: [0.4, 0.8, 0.4] as const },
  ];
  wall.thinInstanceSetBuffer("matrix", new Float32Array(transforms.flatMap(t =>
    Array.from(Matrix.Compose(new Vector3(...t.scaleXYZ), Quaternion.Identity(), new Vector3(...t.positionMetersXYZ)).asArray()))), 16, true);
  wall.alwaysSelectAsActiveMesh = true;
  const fade = new NativeBlockSubjectOcclusionFadeV1([{ id: "wall", mesh: wall, transforms }]);
  const capture = () => captureBabylonArtifactViewV1({ scene, engine, camera,
    request: { kind: "opening-frame", widthPixels: 640, heightPixels: 360,
      identityMaskColorsByMesh: () => new Map([[wall, "#0000FF"], [subject, "#FF0000"]]) },
  });
  const redCount = (pixels: Uint8ClampedArray) => {
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i]! > 150 && pixels[i + 1]! < 50 && pixels[i + 2]! < 50) count++;
    return count;
  };
  const display = (label: string, pixels: Uint8ClampedArray) => {
    const target = document.createElement("canvas");
    target.width = 640; target.height = 360;
    target.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(pixels), 640, 360), 0, 0);
    const title = document.createElement("h2"); title.textContent = label;
    document.querySelector("#captures")!.append(title, target);
  };
  try {
    scene.render();
    await scene.whenReadyAsync();
    await prepareBabylonArtifactIdentityCaptureV1(scene);
    const opaque = capture();
    fade.update({ cameraPosition: camera.position, subjectOriginPositionMetersXYZ: [0, 0, 0],
      colliderCenterOffsetMetersXYZ: [0, 0.9, 0], colliderHeightMeters: 1.8, colliderRadiusMeters: 0.3,
      deltaSeconds: 0.15 });
    const before = fade.snapshot();
    const faded = capture();
    const isolated = fade.withSuspended(capture);
    const restored = capture();
    const metrics = {
      opaqueRedPixels: redCount(opaque.pixelsRgba), fadedRedPixels: redCount(faded.pixelsRgba),
      firstIdentityRedPixels: redCount(opaque.identityMask!.pixelsRgba),
      identityRedPixels: redCount(faded.identityMask!.pixelsRgba), isolatedRedPixels: redCount(isolated.pixelsRgba),
      selectedInstanceCount: before.selectedInstanceCount,
      stateRestored: JSON.stringify(before) === JSON.stringify(fade.snapshot()),
      pixelsRestored: faded.pixelsRgba.every((value, index) => value === restored.pixelsRgba[index]),
    };
    display("Opaque opening", opaque.pixelsRgba);
    display("Faded opening", faded.pixelsRgba);
    display("Opaque identity mask", faded.identityMask!.pixelsRgba);
    if (metrics.opaqueRedPixels !== 0 || metrics.fadedRedPixels < 500 || metrics.firstIdentityRedPixels !== 0 || metrics.identityRedPixels !== 0 ||
        metrics.isolatedRedPixels !== 0 || metrics.selectedInstanceCount !== 1 || !metrics.stateRestored || !metrics.pixelsRestored) {
      throw new Error(JSON.stringify(metrics));
    }
    result.textContent = JSON.stringify({ status: "passed", metrics }, null, 2);
  } finally { fade.dispose(); engine.dispose(); }
}

run().catch(error => { result.textContent = JSON.stringify({ status: "failed", error: String(error) }); console.error(error); });
