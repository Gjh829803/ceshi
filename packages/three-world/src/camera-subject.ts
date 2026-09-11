import type * as THREE from 'three';
import type { CameraCollisionRequest } from '@worldkit/camera-collision';
import type { Vec3 } from './engine-contracts.js';

export type CameraSubjectBody = Readonly<{ heightMeters: number; radiusMeters: number }>;

/** World-space data from the current fixed or display sample; reading never steps it. */
export type CameraSubjectSample = Readonly<{
  /** Actual subject identity; a logical controlled target may resolve to its mount. */
  id: string;
  positionWorldMetersXYZ: Vec3;
  body?: CameraSubjectBody;
  /** Vehicle heading and its existing recenter tuning. Back yaw uses the camera boom's +Z convention. */
  heading?:Readonly<{backYawRadians:number;speedMetersPerSecond:number;recenterDelaySeconds:number;recenterResponsePerSecond:number}>;
  transform?: Readonly<{ matrixWorld: THREE.Matrix4; frontYawRadians: number }>;
}>;

/** A subject supplies data and collision policy, never a camera, clock or input listener. */
export type CameraSubjectAdapter = Readonly<{
  sample(entityId: string): CameraSubjectSample | undefined;
  collisionRequest?(request: CameraCollisionRequest, sample: CameraSubjectSample): CameraCollisionRequest;
}>;
