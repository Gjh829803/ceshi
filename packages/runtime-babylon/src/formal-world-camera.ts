import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { FormalWorldBoundsMetersV1 } from "@whitebox-world/runtime-contracts";

export interface FittedOrthographicWorldBoundsV1 {
  readonly orthoLeft: number;
  readonly orthoRight: number;
  readonly orthoBottom: number;
  readonly orthoTop: number;
}

function worldBoundsCorners(
  bounds: FormalWorldBoundsMetersV1,
): readonly Vector3[] {
  const [minimumX, minimumY, minimumZ] = bounds.minimumMetersXYZ;
  const [maximumX, maximumY, maximumZ] = bounds.maximumMetersXYZ;
  return [
    new Vector3(minimumX, minimumY, minimumZ),
    new Vector3(maximumX, minimumY, minimumZ),
    new Vector3(minimumX, maximumY, minimumZ),
    new Vector3(maximumX, maximumY, minimumZ),
    new Vector3(minimumX, minimumY, maximumZ),
    new Vector3(maximumX, minimumY, maximumZ),
    new Vector3(minimumX, maximumY, maximumZ),
    new Vector3(maximumX, maximumY, maximumZ),
  ];
}

export function fitOrthographicBoundsToWorldExtentsV1(
  bounds: FormalWorldBoundsMetersV1,
  viewMatrix: Matrix,
  aspect: number,
): FittedOrthographicWorldBoundsV1 {
  const corners = worldBoundsCorners(bounds).map((corner) =>
    Vector3.TransformCoordinates(corner, viewMatrix)
  );
  const minimumX = Math.min(...corners.map(({ x }) => x));
  const maximumX = Math.max(...corners.map(({ x }) => x));
  const minimumY = Math.min(...corners.map(({ y }) => y));
  const maximumY = Math.max(...corners.map(({ y }) => y));
  const centerX = (minimumX + maximumX) / 2;
  const centerY = (minimumY + maximumY) / 2;
  const width = maximumX - minimumX;
  const height = maximumY - minimumY;
  const halfWidth = Math.max(width / 2, height * aspect / 2);
  const halfHeight = Math.max(height / 2, width / aspect / 2);
  return Object.freeze({
    orthoLeft: centerX - halfWidth,
    orthoRight: centerX + halfWidth,
    orthoBottom: centerY - halfHeight,
    orthoTop: centerY + halfHeight,
  });
}

export function orientCameraAtExactPose(
  camera: FreeCamera,
  position: Vector3,
  target: Vector3,
  useRightHandedSystem: boolean,
): void {
  camera.setTarget(target);
  camera.position.copyFrom(position);
  const cameraWorld = useRightHandedSystem
    ? Matrix.LookAtRH(position, target, Vector3.UpReadOnly).invert()
    : Matrix.LookAtLH(position, target, Vector3.UpReadOnly).invert();
  Quaternion.FromRotationMatrix(cameraWorld).toEulerAnglesToRef(camera.rotation);
  camera.rotation.z = 0;
}
