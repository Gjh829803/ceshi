import {
  MathUtils,
  Object3D,
  PerspectiveCamera,
  Vector3,
} from "three";
import type { EntityId, Vec3Tuple } from "../../contracts/src/index.js";

export interface ThirdPersonCameraCollisionQuery {
  origin: Vector3;
  desired: Vector3;
  radius: number;
  targetEntityId?: EntityId;
}

/** Physics packages adapt their sphere cast/raycast API to this small boundary. */
export interface ThirdPersonCameraCollisionAdapter {
  resolve(query: ThirdPersonCameraCollisionQuery): Vector3 | null;
}

export interface ThirdPersonCameraRigOptions {
  camera: PerspectiveCamera;
  target: Object3D;
  targetEntityId?: EntityId;
  targetOffset?: Vec3Tuple;
  distance?: number;
  minDistance?: number;
  maxDistance?: number;
  pitch?: number;
  minPitch?: number;
  maxPitch?: number;
  yaw?: number;
  pointerSensitivity?: number;
  positionDamping?: number;
  focusDamping?: number;
  verticalFocusDamping?: number;
  verticalDeadZone?: number;
  collisionRadius?: number;
  collision?: ThirdPersonCameraCollisionAdapter;
}

export interface CameraMovementBasis {
  forward: Vec3Tuple;
  right: Vec3Tuple;
}

const WORLD_UP = new Vector3(0, 1, 0);

export class ThirdPersonCameraRig {
  readonly camera: PerspectiveCamera;
  readonly target: Object3D;

  private readonly targetOffset: Vector3;
  private readonly minDistance: number;
  private readonly maxDistance: number;
  private readonly minPitch: number;
  private readonly maxPitch: number;
  private readonly pointerSensitivity: number;
  private readonly positionDamping: number;
  private readonly focusDamping: number;
  private readonly verticalFocusDamping: number;
  private readonly verticalDeadZone: number;
  private readonly collisionRadius: number;
  private readonly collision: ThirdPersonCameraCollisionAdapter | undefined;
  private readonly targetEntityId: EntityId | undefined;
  private yaw: number;
  private pitch: number;
  private distance: number;
  private initialized = false;
  private readonly smoothedFocus = new Vector3();

  constructor(options: ThirdPersonCameraRigOptions) {
    this.camera = options.camera;
    this.target = options.target;
    this.targetOffset = new Vector3(...(options.targetOffset ?? [0, 1.45, 0]));
    this.minDistance = options.minDistance ?? 1.2;
    this.maxDistance = options.maxDistance ?? 8;
    this.distance = MathUtils.clamp(options.distance ?? 4.5, this.minDistance, this.maxDistance);
    this.minPitch = options.minPitch ?? -0.95;
    this.maxPitch = options.maxPitch ?? 0.65;
    this.pitch = MathUtils.clamp(options.pitch ?? 0.22, this.minPitch, this.maxPitch);
    this.yaw = options.yaw ?? 0;
    this.pointerSensitivity = options.pointerSensitivity ?? 0.0025;
    this.positionDamping = options.positionDamping ?? 18;
    this.focusDamping = options.focusDamping ?? 28;
    this.verticalFocusDamping = options.verticalFocusDamping ?? 8;
    this.verticalDeadZone = Math.max(0, options.verticalDeadZone ?? 0.035);
    this.collisionRadius = options.collisionRadius ?? 0.2;
    this.collision = options.collision;
    this.targetEntityId = options.targetEntityId;
  }

  get orbit(): Readonly<{ yaw: number; pitch: number; distance: number }> {
    return { yaw: this.yaw, pitch: this.pitch, distance: this.distance };
  }

  get focus(): Readonly<Vector3> {
    return this.smoothedFocus;
  }

  rotate(pointerDeltaX: number, pointerDeltaY: number): void {
    this.yaw -= pointerDeltaX * this.pointerSensitivity;
    this.pitch = MathUtils.clamp(
      this.pitch - pointerDeltaY * this.pointerSensitivity,
      this.minPitch,
      this.maxPitch,
    );
  }

  setOrbit(yaw: number, pitch: number): void {
    this.yaw = yaw;
    this.pitch = MathUtils.clamp(pitch, this.minPitch, this.maxPitch);
  }

  setDistance(distance: number): void {
    this.distance = MathUtils.clamp(distance, this.minDistance, this.maxDistance);
  }

  update(deltaSeconds: number): void {
    const rawFocus = this.target.getWorldPosition(new Vector3()).add(this.targetOffset);
    const canSmooth =
      this.initialized && Number.isFinite(deltaSeconds) && deltaSeconds > 0;
    if (!canSmooth) {
      this.smoothedFocus.copy(rawFocus);
    } else {
      const horizontalAlpha = 1 - Math.exp(-this.focusDamping * deltaSeconds);
      this.smoothedFocus.x += (rawFocus.x - this.smoothedFocus.x) * horizontalAlpha;
      this.smoothedFocus.z += (rawFocus.z - this.smoothedFocus.z) * horizontalAlpha;
      const verticalDelta = rawFocus.y - this.smoothedFocus.y;
      if (Math.abs(verticalDelta) > this.verticalDeadZone) {
        const verticalTarget =
          rawFocus.y - Math.sign(verticalDelta) * this.verticalDeadZone;
        const verticalAlpha =
          1 - Math.exp(-this.verticalFocusDamping * deltaSeconds);
        this.smoothedFocus.y +=
          (verticalTarget - this.smoothedFocus.y) * verticalAlpha;
      }
    }
    const focus = this.smoothedFocus;
    const cosPitch = Math.cos(this.pitch);
    const desired = new Vector3(
      Math.sin(this.yaw) * cosPitch,
      Math.sin(this.pitch),
      Math.cos(this.yaw) * cosPitch,
    )
      .multiplyScalar(this.distance)
      .add(focus);

    const query: ThirdPersonCameraCollisionQuery = {
      origin: focus.clone(),
      desired: desired.clone(),
      radius: this.collisionRadius,
      ...(this.targetEntityId === undefined
        ? {}
        : { targetEntityId: this.targetEntityId }),
    };
    const resolved = this.collision?.resolve(query) ?? desired;
    const next = resolved ?? desired;

    if (!canSmooth) {
      this.camera.position.copy(next);
      this.initialized = true;
    } else {
      const alpha = 1 - Math.exp(-this.positionDamping * deltaSeconds);
      this.camera.position.lerp(next, alpha);
    }
    this.camera.lookAt(focus);
    this.camera.updateMatrixWorld();
  }

  getMovementBasis(): CameraMovementBasis {
    const forward = this.camera.getWorldDirection(new Vector3());
    forward.y = 0;
    if (forward.lengthSq() < 1e-8) forward.set(0, 0, -1);
    else forward.normalize();
    const right = new Vector3().crossVectors(forward, WORLD_UP).normalize();
    return {
      forward: [forward.x, forward.y, forward.z],
      right: [right.x, right.y, right.z],
    };
  }
}
