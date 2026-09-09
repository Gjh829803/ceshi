import * as T from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type {
  TrainingCharacter,
  CharacterAttachmentPoint,
} from "@worldkit/three";
import { ACCESSORY_CHOICES } from "../../../shared/training-content/humanoid/accessories";
export type PreviewPin = {
  point: CharacterAttachmentPoint;
  hidden: boolean;
  left: number;
  top: number;
};
/** Owns only the isolated preview's GPU resources. Rendering is demand driven. */
export function createEquipmentPreview(
  canvas: HTMLCanvasElement,
  stage: HTMLElement,
  character: TrainingCharacter,
  isOpen: () => boolean,
  updatePins: (pins: PreviewPin[]) => void,
) {
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera(35, 1, 0.05, 30);
  scene.add(new T.HemisphereLight(0xffffff, 0x567277, 2.8));
  const light = new T.DirectionalLight(0xffffff, 2.3);
  light.position.set(3, 5, 4);
  scene.add(light);
  const floor = new T.Mesh(
    new T.CircleGeometry(0.7, 48),
    new T.MeshBasicMaterial({
      color: 0x28474e,
      transparent: true,
      opacity: 0.7,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.012;
  scene.add(floor);
  let renderer: T.WebGLRenderer | undefined,
    controls: OrbitControls | undefined,
    model: T.Object3D | undefined,
    mixer: T.AnimationMixer | undefined,
    disposed = false;
  function render() {
    if (!renderer || disposed || !isOpen()) return;
    const width = stage.clientWidth,
      height = stage.clientHeight;
    if (!width || !height) return;
    const size = renderer.getSize(new T.Vector2());
    if (size.x !== width || size.y !== height)
      renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    scene.updateMatrixWorld(true);
    renderer.render(scene, camera);
    updatePins(
      ACCESSORY_CHOICES.map(({ point }) => {
        const anchor = model?.getObjectByName(`attachment:${point}`),
          p = anchor?.getWorldPosition(new T.Vector3()).project(camera);
        return {
          point,
          hidden: !p || p.z > 1 || p.z < -1,
          left: p ? ((p.x + 1) * width) / 2 : 0,
          top: p ? ((1 - p.y) * height) / 2 : 0,
        };
      }),
    );
  }
  function resetCamera() {
    camera.position.set(2.2, 1.65, 3.5);
    controls?.target.set(0, 0.86, 0);
    controls?.update();
    render();
  }
  function disposeRenderer() {
    canvas.removeEventListener("webglcontextrestored", render);
    controls?.dispose();
    controls = undefined;
    renderer?.dispose();
    renderer = undefined;
  }
  function initialize() {
    if (renderer) return;
    try {
      renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      renderer.outputColorSpace = T.SRGBColorSpace;
      controls = new OrbitControls(camera, canvas);
      controls.enableDamping = false;
      controls.enablePan = false;
      controls.minDistance = 1.6;
      controls.maxDistance = 6;
      controls.maxPolarAngle = Math.PI * 0.85;
      controls.listenToKeyEvents(canvas);
      controls.addEventListener("change", render);
      // Register after Three's own GL restoration handler.
      canvas.addEventListener("webglcontextrestored", render);
    } catch (error) {
      disposeRenderer();
      throw error;
    }
  }
  function clearModel() {
    model?.removeFromParent();
    mixer?.stopAllAction();
    if (model && mixer) mixer.uncacheRoot(model);
    mixer = undefined;
    // Geometry and materials remain borrowed; only cloned skeletons are owned.
    const skeletons = new Set<T.Skeleton>();
    model?.traverse((node) => {
      if ((node as T.SkinnedMesh).isSkinnedMesh)
        skeletons.add((node as T.SkinnedMesh).skeleton);
    });
    for (const skeleton of skeletons) skeleton.dispose();
    model = undefined;
  }
  function refreshModel() {
    clearModel();
    const source = character.sourceCharacter;
    if (!source) {
      render();
      return;
    }
    model = clone(source.root);
    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    scene.add(model);
    const idle = source.actions.idle?.getClip();
    if (idle) {
      mixer = new T.AnimationMixer(model);
      mixer.clipAction(idle).play();
      mixer.setTime(0);
    }
    render();
  }
  const resize = new ResizeObserver(render);
  resize.observe(stage);
  return {
    initialize,
    render,
    resetCamera,
    refreshModel,
    clearModel,
    get ready() {
      return !!renderer;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      resize.disconnect();
      clearModel();
      floor.geometry.dispose();
      floor.material.dispose();
      disposeRenderer();
    },
  };
}
