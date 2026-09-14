import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { CameraOpeningConfiguration } from "@worldkit/three";
/** Native, on-demand observer: never writes the source camera or advances World. */
export function createCameraPreview(
  host: HTMLElement,
  scene: T.Scene,
  source: T.PerspectiveCamera,
) {
  const camera = source.clone(),
    renderer = new T.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  host.append(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  const forward = new T.Vector3();
  camera.getWorldDirection(forward);
  controls.target.copy(camera.position).addScaledVector(forward, 8);
  const draw = () => {
    const width = Math.max(1, host.clientWidth),
      height = 240;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  };
  controls.addEventListener("change", draw);
  const resize = new ResizeObserver(draw);
  resize.observe(host);
  draw();
  return {
    opening: (): CameraOpeningConfiguration => ({
      positionWorldMetersXYZ: camera.position.toArray(),
      lookAtWorldMetersXYZ: controls.target.toArray(),
      upWorldXYZ: camera.up.toArray(),
      fovDegrees: camera.getEffectiveFOV(),
    }),
    dispose() {
      resize.disconnect();
      controls.removeEventListener("change", draw);
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
