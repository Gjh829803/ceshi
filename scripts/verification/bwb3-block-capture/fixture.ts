import { Engine } from "@babylonjs/core/Engines/engine.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Scene } from "@babylonjs/core/scene.js";
import {
  defineBabylonNativeScene,
} from "@whitebox-world/native-babylon";
import { admitBabylonNativeSceneCandidateV1 } from
  "@whitebox-world/native-babylon/host";
import {
  createBabylonNativeBlockAuthoringCaptureV1,
  createBabylonNativeBlockProfileSessionV1,
  type BabylonNativeBlockAuthoringCaptureV1,
  type BabylonNativeBlockAuthoringViewIdV1,
  type BabylonNativeBlockFinalizedEpochV1,
  type BabylonNativeBlockProfileSessionV1,
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

const BOOTSTRAP = Object.freeze({
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
    });

function buildFixture(session: BabylonNativeBlockProfileSessionV1): void {
  for (const xMeters of [-2, -1, 1, 2]) {
    session.createBlock({
      id: `foreground-${xMeters < 0 ? "west" : "east"}-${Math.abs(xMeters)}`,
      shape: "full",
      paletteRole: "ground",
      centerMetersXYZ: [xMeters, 0.5, 2],
    });
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
    session.createBlock({
      id,
      shape: "full",
      paletteRole: "route",
      visualGroupId: "route-spine",
      centerMetersXYZ: [xMeters, 0.5, zMeters],
    });
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
    session.createBlock({
      id,
      shape: "full",
      paletteRole: "structure",
      visualGroupId: "ridge-gate",
      centerMetersXYZ: [xMeters, yMeters, -3],
    });
  }
  session.createBlockGrid({
    idPrefix: "cliff-mass",
    shape: "full",
    paletteRole: "background-mass",
    visualGroupId: "cliff-mass",
    minimumCenterMetersXYZ: [-3, 0.5, -2],
    repeatCountXYZ: [1, 2, 2],
  });
}

async function start(): Promise<void> {
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

  let session: BabylonNativeBlockProfileSessionV1 | undefined;
  let finalizedEpoch: BabylonNativeBlockFinalizedEpochV1 | undefined;
  const admission = await admitBabylonNativeSceneCandidateV1({
    candidate: Object.freeze({ engine, scene }),
    hostDerivedStaticColliders: Object.freeze([]),
    bootstrap: BOOTSTRAP,
    module: defineBabylonNativeScene({
      kind: "babylon-native-scene-module",
      id: "bwb3-block-capture-module",
      build(context): void {
        session = createBabylonNativeBlockProfileSessionV1(
          context,
          { maximumBlockCount: 32 },
        );
        buildFixture(session);
        finalizedEpoch = session.finalize(Object.freeze({
          displayGapMeters: 0.035,
          staticColliders: Object.freeze([]),
        }));
        context.registration.registerSpawnMarker(Object.freeze({
          id: context.bootstrap.spawnMarkerId,
          positionMetersXYZ: Object.freeze([0, 1, 4] as const),
          facingRadians: 0,
        }));
      },
    }),
    assets: Object.freeze({
      async resolve(): Promise<never> {
        throw new Error("BWB-3 capture fixture has no external assets");
      },
    }),
    budget: Object.freeze({
      maximumStaticColliderCount: 0,
      maximumStaticColliderVertexCount: 0,
      maximumStaticColliderTriangleCount: 0,
    }),
  });
  if (
    admission.outcome !== "passed" ||
    finalizedEpoch === undefined ||
    finalizedEpoch.checkedLayout.checkResult.outcome !== "passed"
  ) {
    throw new Error(JSON.stringify(
      admission.outcome === "rejected" ? admission.diagnostics : admission,
    ));
  }
  const capture = createBabylonNativeBlockAuthoringCaptureV1({
    scene,
    finalizedEpoch,
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
    checkOutcome: finalizedEpoch.checkedLayout.checkResult.outcome,
    showView,
  });
  window.addEventListener("pagehide", () => {
    camera?.dispose();
    session?.dispose();
    scene.dispose();
    engine.dispose();
  }, { once: true });
}

void start().catch((error: unknown) => {
  queueMicrotask(() => {
    throw error;
  });
});
