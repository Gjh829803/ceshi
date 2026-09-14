import { Quaternion, Vector3 } from "three";
import type { CameraQuaternion } from "./subject";

/** Horizontal input direction from the selected camera orientation. At vertical
 * sight, the camera right axis still supplies heading; never invent world north. */
export function cameraControlForward(quaternion: CameraQuaternion): [number, number, number] {
  const rotation = new Quaternion(...quaternion);
  const forward = new Vector3(0, 0, -1).applyQuaternion(rotation);
  forward.y = 0;
  if (forward.lengthSq() < 1e-12) {
    const right = new Vector3(1, 0, 0).applyQuaternion(rotation);
    forward.set(right.z, 0, -right.x);
  }
  return forward.normalize().toArray();
}
