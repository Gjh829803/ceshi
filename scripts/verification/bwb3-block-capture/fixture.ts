import { Engine } from "@babylonjs/core/Engines/engine.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Scene } from "@babylonjs/core/scene.js";
import {
  createBabylonNativeHostRandomV1,
  type BabylonNativeSceneBuildContextV1,
} from "@whitebox-world/native-babylon";
import {
  createBabylonNativeBlockAuthoringCaptureV1,
  createBabylonNativeBlockProfileSessionV1,
  createBabylonNativeBlockVisualsV1,
  type BabylonNativeBlockAuthoringCaptureV1,
  type BabylonNativeBlockAuthoringViewIdV1,
  type BabylonNativeBlockProfileSessionV1,
  type BabylonNativeBlockVisualsV1,
} from "@whitebox-world/native-babylon-block-profile";

interface Bwb3CaptureProbeV1 {
  readonly ready: true;
  readonly capture: BabylonNativeBlockAuthoringCaptureV1;
  readonly checkOutcome: "passed";
  showView(viewId: BabylonNativeBlockAuthoringViewIdV1): void;
}

declare global {
  interface Window {
    __WORLDKIT_BWB3_CAPTURE__?: Bwb3CaptureProbeV1;
  }
}

function context(scene: Scene): BabylonNativeSceneBuildContextV1 {
  return Object.freeze({
    scene,
    bootstrap: Object.freeze({
      kind: "babylon-native-scene-bootstrap",
      schemaVersion: 1,
      id: "bwb3-block-capture",
      sceneModuleRef: "worldkit://native-scene/bwb3-block-capture@1",
      nativeSceneApiRef: "worldkit://native-scene-api/babylon@1",
      nativeSceneProfileRef:
        "worldkit://native-scene-profile/whitebox.blocks@1",
      gameplayBootstrapRef:
        "worldkit://gameplay-bootstrap/bwb3-block-capture@1",
      initialControlledEntityId: "capture-observer",
      gravityMetersPerSecondSquaredXYZ: Object.freeze([0, -9.81, 0] as const),
      initialCamera: Object.freeze({
        mode: "third-person",
        pitchRadians: 0.2,
        distanceMeters: 8,
        fovDegrees: 55,
        targetHeightMeters: 1.2,
      }),
      seed: 303,
      spawnMarkerId: "capture-spawn",
    }),
    random: createBabylonNativeHostRandomV1(303),
    assets: Object.freeze({
      async resolve(): Promise<never> {
        throw new Error("BWB-3 capture fixture has no external assets");
      },
    }),
    registration: Object.freeze({
      registerSpawnMarker(): void {},
      registerStaticCollider(): void {},
    }),
  });
}

function block(
  session: BabylonNativeBlockProfileSessionV1,
  input: Parameters<BabylonNativeBlockProfileSessionV1["createBlock"]>[0],
  positionMetersXYZ: readonly [number, number, number],
): void {
  session.createBlock(input).position.set(...positionMetersXYZ);
}

function buildFixture(session: BabylonNativeBlockProfileSessionV1): void {
  for (const xMeters of [-2, -1, 1, 2]) {
    block(session, {
      id: `foreground-${xMeters < 0 ? "west" : "east"}-${Math.abs(xMeters)}`,
      shape: "full",
      paletteRole: "ground",
    }, [xMeters, 0.5, 2]);
  }
  for (const [id, xMeters, zMeters] of [
    ["route-entry", 0, 2],
    ["route-mid-south", 0, 1],
    ["route-center", 0, 0],
    ["route-mid-north", 0, -1],
    ["route-junction", 0, -2],
    ["route-arm-west-1", -1, -2],
    ["route-arm-west-2", -2, -2],
    ["route-arm-east-1", 1, -2],
    ["route-arm-east-2", 2, -2],
  ] as const) {
    block(session, {
      id,
      shape: "full",
      paletteRole: "route",
      visualGroupId: "route-spine",
    }, [xMeters, 0.5, zMeters]);
  }
  for (const [id, xMeters, yMeters] of [
    ["gate-west-lower", -1, 0.5],
    ["gate-west-middle", -1, 1.5],
    ["gate-west-upper", -1, 2.5],
    ["gate-center-upper", 0, 2.5],
    ["gate-east-lower", 1, 0.5],
    ["gate-east-middle", 1, 1.5],
    ["gate-east-upper", 1, 2.5],
  ] as const) {
    block(session, {
      id,
      shape: "full",
      paletteRole: "structure",
      visualGroupId: "ridge-gate",
    }, [xMeters, yMeters, -3]);
  }
  for (const [id, xMeters, yMeters, zMeters] of [
    ["cliff-west-lower", -3, 0.5, -1],
    ["cliff-west-upper", -3, 1.5, -1],
    ["cliff-north-lower", -3, 0.5, -2],
    ["cliff-north-upper", -3, 1.5, -2],
  ] as const) {
    block(session, {
      id,
      shape: "full",
      paletteRole: "background-mass",
      visualGroupId: "cliff-mass",
    }, [xMeters, yMeters, zMeters]);
  }
}

function start(): void {
  const canvas = document.querySelector("canvas");
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new TypeError("BWB-3 fixture requires one canvas");
  }
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
  });
  engine.setSize(800, 600);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.09, 0.14, 0.19, 1);
  const ambient = new HemisphericLight("bwb3-ambient", Vector3.Up(), scene);
  ambient.intensity = 0.75;
  const sun = new DirectionalLight(
    "bwb3-sun",
    new Vector3(-0.5, -1, 0.35),
    scene,
  );
  sun.intensity = 1.35;

  const session = createBabylonNativeBlockProfileSessionV1(
    context(scene),
    { maximumBlockCount: 32 },
  );
  buildFixture(session);
  const checkedLayout = session.finalize();
  if (checkedLayout.checkResult.outcome !== "passed") {
    throw new Error(JSON.stringify(checkedLayout.checkResult.diagnostics));
  }
  const visuals: BabylonNativeBlockVisualsV1 =
    createBabylonNativeBlockVisualsV1({
      scene,
      buildEpochId: "bwb3-capture-epoch",
      checkedLayout,
      displayGapMeters: 0.035,
    });
  const capture = createBabylonNativeBlockAuthoringCaptureV1({
    scene,
    buildEpochId: "bwb3-capture-epoch",
    checkedLayout,
    widthPixels: 800,
    heightPixels: 600,
    opening: Object.freeze({
      positionMetersXYZ: Object.freeze([7, 5.5, 10] as const),
      targetMetersXYZ: Object.freeze([0, 1, -0.5] as const),
      fovDegrees: 52,
    }),
  });
  let camera: FreeCamera | undefined;
  const showView = (viewId: BabylonNativeBlockAuthoringViewIdV1): void => {
    const view = capture.views.find(({ id }) => id === viewId);
    if (view === undefined) throw new RangeError(`Unknown BWB-3 view '${viewId}'.`);
    camera?.dispose();
    camera = new FreeCamera(
      `bwb3-camera-${viewId}`,
      Vector3.FromArray(view.positionMetersXYZ),
      scene,
    );
    camera.upVector = viewId === "top-down" ? Vector3.Forward() : Vector3.Up();
    camera.setTarget(Vector3.FromArray(view.targetMetersXYZ));
    camera.freezeProjectionMatrix(Matrix.FromArray(view.projectionMatrix));
    scene.activeCamera = camera;
    scene.render();
  };
  showView("opening");
  window.__WORLDKIT_BWB3_CAPTURE__ = Object.freeze({
    ready: true as const,
    capture,
    checkOutcome: "passed" as const,
    showView,
  });
  window.addEventListener("pagehide", () => {
    camera?.dispose();
    visuals.dispose();
    session.dispose();
    scene.dispose();
    engine.dispose();
  }, { once: true });
}

start();
