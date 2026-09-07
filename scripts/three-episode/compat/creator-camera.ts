// Compatibility kernel for the pinned Creator delivery; see creator-camera-provenance.json.
import * as THREE from 'three';
import type { PhysicsPort, Vec3 } from '@worldkit/three/camera-compat';

export type CameraRigFollowOptions = Readonly<{
  targetEntityId: string;
  framingMode?: 'preserve-opening' | 'target';
  followHalfLifeSeconds?: number;
  distanceMeters?: number;
  targetHeightMeters?: number;
  pitchRadians?: number;
  activateOnInput?: boolean;
  transitionSeconds?: number;
  rotationSpeedRadiansPerSecond?: number;
  collisionRadiusMeters?: number;
  recoveryHalfLifeSeconds?: number;
}>;
export type CameraRigInput = Readonly<{
  cameraYawRatio?: number;
  cameraPitchRatio?: number;
  yawDeltaRadians?: number;
  pitchDeltaRadians?: number;
  distanceDeltaMeters?: number;
  activate?: boolean;
}>;
export type CameraRigState = Readonly<{
  mode: 'authored' | 'follow-pending' | 'follow';
  framingMode?: 'preserve-opening' | 'target';
  positionWorldMetersXYZ: Vec3;
  desiredPositionWorldMetersXYZ: Vec3;
  desiredYawRadians: number;
  desiredPitchRadians: number;
  desiredArmDistanceMeters?: number;
  safeArmDistanceMeters?: number;
  actualArmDistanceMeters?: number;
  obstructionEntityId?: string;
}>;

type Follow = { -readonly [Key in keyof CameraRigFollowOptions]-?: CameraRigFollowOptions[Key] };
type RigMemory = {
  mode: CameraRigState['mode'];
  follow: Follow | undefined;
  yawRadians: number;
  armDistanceMeters: number;
  safeArmDistanceMeters: number | undefined;
  actualArmDistanceMeters: number | undefined;
  obstructionEntityId: string | undefined;
  recoveryDelaySeconds: number;
  distanceChanged: boolean;
  transitionElapsedSeconds: number;
  transitionPosition: THREE.Vector3;
  transitionQuaternion: THREE.Quaternion;
  framingRotation: THREE.Quaternion;
  smoothedTarget: THREE.Vector3;
};
const MIN_PITCH_RADIANS = -1.3;
const MAX_PITCH_RADIANS = 1.4;
const CONTACT_MARGIN_METERS = .02;
const RELEASE_DELAY_SECONDS = .12;
const RELEASE_DEADBAND_METERS = .03;
const tuple = (value: THREE.Vector3): Vec3 => [value.x, value.y, value.z];
const exponential = (from: number, to: number, deltaSeconds: number, halfLifeSeconds: number) => halfLifeSeconds === 0 ? to : to + (from - to) * Math.pow(.5, deltaSeconds / halfLifeSeconds);
const smoothstep = (ratio: number) => ratio * ratio * (3 - 2 * ratio);

function bounded(value: number, minimum: number, maximum: number, label: string): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`WORLD_CAMERA_OPTION_INVALID: ${label}`);
  return value;
}
function validDeltaSeconds(deltaSeconds: number): void {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0 || deltaSeconds > 10) throw new Error('WORLD_CAMERA_TIMESTEP_INVALID');
}
function copyMemory(memory: RigMemory): RigMemory {
  return { ...memory, follow: memory.follow ? { ...memory.follow } : undefined, transitionPosition: memory.transitionPosition.clone(), transitionQuaternion: memory.transitionQuaternion.clone(), framingRotation: memory.framingRotation.clone(), smoothedTarget: memory.smoothedTarget.clone() };
}

/** One optional writer for the supplied camera. The World owns input collection and time. */
export class ThreeCameraRig {
  get targetEntityId():string|undefined{return this.memory.follow?.targetEntityId;}
  private memory: RigMemory = {
    mode: 'authored', follow: undefined, yawRadians: 0, armDistanceMeters: 0,
    safeArmDistanceMeters: undefined, actualArmDistanceMeters: undefined, obstructionEntityId: undefined,
    recoveryDelaySeconds: 0, distanceChanged: false, transitionElapsedSeconds: 0,
    transitionPosition: new THREE.Vector3(), transitionQuaternion: new THREE.Quaternion(),
    framingRotation: new THREE.Quaternion(), smoothedTarget: new THREE.Vector3(),
  };
  private initial: { camera: THREE.Camera; parent: THREE.Object3D | null; memory: RigMemory } | undefined;

  constructor(
    private readonly camera: THREE.Camera,
    private readonly castCameraArm: PhysicsPort['castCameraArm'],
    private readonly targetPosition: (entityId: string) => Vec3 | undefined,
  ) {}

  get mode(): CameraRigState['mode'] { return this.memory.mode; }
  get desiredYawRadians(): number {
    const follow = this.memory.follow;
    if (follow && this.mode !== 'authored') {
      if (follow.framingMode === 'target') return this.memory.yawRadians;
      // An off-center view does not necessarily look along its orbit arm.
      const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(this.framedRotation(follow));
      return Math.atan2(-direction.x, -direction.z);
    }
    const direction = this.camera.getWorldDirection(new THREE.Vector3());
    return Math.atan2(-direction.x, -direction.z);
  }

  setFollow(options: CameraRigFollowOptions): void {
    if (!options || typeof options.targetEntityId !== 'string' || !options.targetEntityId.trim()) throw new Error('WORLD_CAMERA_TARGET_REQUIRED');
    const hasOrbitOverride = options.distanceMeters !== undefined || options.pitchRadians !== undefined || options.targetHeightMeters !== undefined;
    const framingMode = options.framingMode ?? (hasOrbitOverride ? 'target' : 'preserve-opening');
    if (framingMode !== 'preserve-opening' && framingMode !== 'target') throw new Error('WORLD_CAMERA_OPTION_INVALID: framingMode');
    if (framingMode === 'preserve-opening' && (options.distanceMeters !== undefined || options.pitchRadians !== undefined)) throw new Error('WORLD_CAMERA_OPTION_INVALID: preserve-opening cannot override distanceMeters or pitchRadians');
    const follow: Follow = {
      targetEntityId: options.targetEntityId, framingMode,
      followHalfLifeSeconds: bounded(options.followHalfLifeSeconds ?? .08, 0, 10, 'followHalfLifeSeconds'),
      distanceMeters: bounded(options.distanceMeters ?? 4, .05, 100, 'distanceMeters'),
      targetHeightMeters: bounded(options.targetHeightMeters ?? 1.3, -10_000, 10_000, 'targetHeightMeters'),
      pitchRadians: bounded(options.pitchRadians ?? .25, MIN_PITCH_RADIANS, MAX_PITCH_RADIANS, 'pitchRadians'),
      activateOnInput: options.activateOnInput ?? true,
      transitionSeconds: bounded(options.transitionSeconds ?? .35, 0, 10, 'transitionSeconds'),
      rotationSpeedRadiansPerSecond: bounded(options.rotationSpeedRadiansPerSecond ?? 1.8, .001, 100, 'rotationSpeedRadiansPerSecond'),
      collisionRadiusMeters: bounded(options.collisionRadiusMeters ?? .2, .001, 10, 'collisionRadiusMeters'),
      recoveryHalfLifeSeconds: bounded(options.recoveryHalfLifeSeconds ?? .18, .001, 10, 'recoveryHalfLifeSeconds'),
    };
    if (typeof follow.activateOnInput !== 'boolean') throw new Error('WORLD_CAMERA_OPTION_INVALID: activateOnInput');
    const target = this.target(follow);
    const opening = framingMode === 'preserve-opening' ? this.readOpening(target) : undefined;
    if (opening) { follow.distanceMeters = opening.distanceMeters; follow.pitchRadians = opening.pitchRadians; }
    const direction = this.camera.getWorldDirection(new THREE.Vector3());
    this.memory = {
      mode: follow.activateOnInput ? 'follow-pending' : 'follow', follow,
      yawRadians: opening?.yawRadians ?? Math.atan2(-direction.x, -direction.z), armDistanceMeters: follow.distanceMeters,
      safeArmDistanceMeters: undefined, actualArmDistanceMeters: undefined, obstructionEntityId: undefined,
      recoveryDelaySeconds: 0, distanceChanged: false, transitionElapsedSeconds: 0,
      transitionPosition: this.camera.getWorldPosition(new THREE.Vector3()),
      transitionQuaternion: this.camera.getWorldQuaternion(new THREE.Quaternion()),
      framingRotation: opening?.framingRotation ?? new THREE.Quaternion(), smoothedTarget: target.clone(),
    };
  }

  /** Call before computing the player's camera-relative movement direction. */
  updateDesired(input: CameraRigInput, deltaSeconds: number): void {
    validDeltaSeconds(deltaSeconds);
    if (!input || typeof input !== 'object') throw new Error('WORLD_CAMERA_INPUT_INVALID');
    for (const key of ['cameraYawRatio', 'cameraPitchRatio', 'yawDeltaRadians', 'pitchDeltaRadians', 'distanceDeltaMeters'] as const) {
      const value = input[key];
      if (value !== undefined && (!Number.isFinite(value) || Math.abs(value) > (key.endsWith('Ratio') ? 1 : 100_000))) throw new Error(`WORLD_CAMERA_INPUT_INVALID: ${key}`);
    }
    if (input.activate !== undefined && typeof input.activate !== 'boolean') throw new Error('WORLD_CAMERA_INPUT_INVALID: activate');
    const follow = this.memory.follow;
    if (!follow || this.mode === 'authored') return;
    const yaw = (input.cameraYawRatio ?? 0) * follow.rotationSpeedRadiansPerSecond * deltaSeconds + (input.yawDeltaRadians ?? 0);
    const pitch = (input.cameraPitchRatio ?? 0) * follow.rotationSpeedRadiansPerSecond * deltaSeconds + (input.pitchDeltaRadians ?? 0);
    const zoom = input.distanceDeltaMeters ?? 0;
    if (this.mode === 'follow-pending' && (input.activate || yaw !== 0 || pitch !== 0 || zoom !== 0)) {
      // Read and validate before changing authority: setup may have adjusted the
      // camera or subject after setFollow, while follow remained pending.
      if (follow.framingMode === 'preserve-opening') {
        const target = this.target(follow), opening = this.readOpening(target);
        this.memory.yawRadians = opening.yawRadians;
        follow.distanceMeters = opening.distanceMeters; follow.pitchRadians = opening.pitchRadians;
        this.memory.armDistanceMeters = opening.distanceMeters;
        this.memory.framingRotation.copy(opening.framingRotation); this.memory.smoothedTarget.copy(target);
      }
      this.memory.mode = 'follow'; this.memory.transitionElapsedSeconds = 0;
      this.camera.getWorldPosition(this.memory.transitionPosition); this.camera.getWorldQuaternion(this.memory.transitionQuaternion);
    }
    this.memory.yawRadians += yaw;
    if (follow.framingMode === 'target') follow.pitchRadians = THREE.MathUtils.clamp(follow.pitchRadians + pitch, MIN_PITCH_RADIANS, MAX_PITCH_RADIANS);
    else if (pitch !== 0) follow.pitchRadians = THREE.MathUtils.clamp(follow.pitchRadians + pitch, -Math.PI / 2, Math.PI / 2);
    // Merely activating follow must not clamp a distant or zero-length authored arm.
    const distanceMeters = zoom === 0 ? follow.distanceMeters : THREE.MathUtils.clamp(follow.distanceMeters + zoom, .05, follow.framingMode === 'target' ? 100 : Math.max(10_000, follow.distanceMeters));
    if (distanceMeters !== follow.distanceMeters) this.memory.distanceChanged = true;
    follow.distanceMeters = distanceMeters;
  }

  /** Call once after the shared physics step; never advances physics or renders. */
  update(deltaSeconds: number): void {
    validDeltaSeconds(deltaSeconds);
    const follow = this.memory.follow;
    if (!follow || this.mode !== 'follow') return;
    const target = this.target(follow);
    if (follow.framingMode === 'preserve-opening') {
      for (const axis of ['x', 'y', 'z'] as const) this.memory.smoothedTarget[axis] = exponential(this.memory.smoothedTarget[axis], target[axis], deltaSeconds, follow.followHalfLifeSeconds);
      const dampingDistance = target.distanceTo(this.memory.smoothedTarget);
      if (dampingDistance > 1e-8 && this.probe(target, this.memory.smoothedTarget, follow.collisionRadiusMeters).safeDistanceMeters < dampingDistance - 1e-8) {
        // A legal wall-side teleport cannot leave the interpolated pivot in or
        // behind solid scenery. Safety overrides damping for this transition.
        this.memory.smoothedTarget.copy(target);
      }
      target.copy(this.memory.smoothedTarget);
    }
    const direction = this.armDirection(follow);
    const desiredEye = target.clone().addScaledVector(direction, follow.distanceMeters);
    const requested = this.probe(target, desiredEye, follow.collisionRadiusMeters);
    const desiredDistance = Math.min(follow.distanceMeters, requested.safeDistanceMeters);
    const hadObstruction = this.memory.obstructionEntityId !== undefined;
    const changedDistance = this.memory.distanceChanged;
    let armDistance = this.memory.armDistanceMeters;

    if (requested.obstructionEntityId !== undefined && requested.safeDistanceMeters < armDistance) {
      // A newly unsafe pose is corrected immediately, including zero clearance.
      armDistance = requested.safeDistanceMeters;
      this.memory.recoveryDelaySeconds = RELEASE_DELAY_SECONDS;
    } else if (desiredDistance < armDistance || changedDistance) {
      // A user zoom is a parameter transition; it does not impersonate a collision.
      armDistance = exponential(armDistance, desiredDistance, deltaSeconds, follow.recoveryHalfLifeSeconds);
    } else {
      if (hadObstruction && requested.obstructionEntityId === undefined) this.memory.recoveryDelaySeconds = RELEASE_DELAY_SECONDS;
      const delay = Math.min(deltaSeconds, this.memory.recoveryDelaySeconds);
      this.memory.recoveryDelaySeconds -= delay;
      if (requested.obstructionEntityId === undefined || desiredDistance - armDistance > RELEASE_DEADBAND_METERS) {
        armDistance = exponential(armDistance, desiredDistance, deltaSeconds - delay, follow.recoveryHalfLifeSeconds);
      }
    }
    this.memory.distanceChanged = false;
    this.memory.armDistanceMeters = armDistance;
    this.memory.transitionElapsedSeconds += deltaSeconds;
    const transitionRatio = follow.framingMode === 'preserve-opening' || follow.transitionSeconds === 0 ? 1 : Math.min(1, this.memory.transitionElapsedSeconds / follow.transitionSeconds);
    const blend = smoothstep(transitionRatio);
    const eye = target.clone().addScaledVector(direction, armDistance);
    if (blend < 1) eye.lerpVectors(this.memory.transitionPosition, eye, blend);

    // Transition chords and a smoothing zoom can be outside the requested arm.
    // Probe their actual volume too; a safe destination alone is insufficient.
    const actualProbe = this.probe(target, eye, follow.collisionRadiusMeters);
    const offset = eye.clone().sub(target);
    const candidateDistance = offset.length();
    if (actualProbe.safeDistanceMeters < candidateDistance) {
      eye.copy(target).addScaledVector(offset, candidateDistance === 0 ? 0 : actualProbe.safeDistanceMeters / candidateDistance);
      this.memory.recoveryDelaySeconds = RELEASE_DELAY_SECONDS;
      if (blend === 1) this.memory.armDistanceMeters = actualProbe.safeDistanceMeters;
    }
    this.memory.actualArmDistanceMeters = eye.distanceTo(target);
    this.memory.safeArmDistanceMeters = blend < 1 || candidateDistance > follow.distanceMeters
      ? actualProbe.safeDistanceMeters : requested.safeDistanceMeters;
    this.memory.obstructionEntityId = actualProbe.obstructionEntityId ?? requested.obstructionEntityId;
    const lookingEye = eye.distanceToSquared(target) > 1e-12 ? eye : desiredEye;
    // Framing is an angular offset, not another lookAt target. Shortening this
    // same pivot ray for collision cannot recenter the authored orientation.
    let rotation = follow.framingMode === 'preserve-opening' ? this.framedRotation(follow)
      : new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(lookingEye, target, this.camera.up));
    // slerpQuaternions copies its start before reading its destination; no alias.
    if (blend < 1) rotation = this.memory.transitionQuaternion.clone().slerp(rotation, blend);
    this.applyWorldPose(eye, rotation);
  }

  useAuthoredCamera(): THREE.Camera {
    this.memory.mode = 'authored'; this.memory.follow = undefined;
    this.memory.safeArmDistanceMeters = undefined; this.memory.actualArmDistanceMeters = undefined;
    this.memory.obstructionEntityId = undefined; this.memory.recoveryDelaySeconds = 0;
    this.memory.distanceChanged = false; this.memory.transitionElapsedSeconds = 0;
    return this.camera;
  }

  sealInitialState(): void {
    if (this.initial) return;
    this.camera.updateWorldMatrix(true, false);
    this.initial = { camera: this.camera.clone(), parent: this.camera.parent, memory: copyMemory(this.memory) };
  }

  reset(): void {
    this.sealInitialState();
    const initial = this.initial!;
    if (initial.parent) initial.parent.add(this.camera); else this.camera.removeFromParent();
    this.camera.copy(initial.camera, false);
    this.camera.updateWorldMatrix(true, false);
    this.memory = copyMemory(initial.memory);
  }

  /** Rebase camera memory once after the SDK relocates the controlled subject. */
  relocateEpisodeStart(from: Vec3, to: Vec3, yawDeltaRadians: number, eye: THREE.Vector3, orientation: THREE.Quaternion): void {
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawDeltaRadians);
    const transform = (point: THREE.Vector3) => point.sub(new THREE.Vector3(...from)).applyQuaternion(rotation).add(new THREE.Vector3(...to));
    transform(eye); orientation.premultiply(rotation);
    transform(this.memory.transitionPosition); this.memory.transitionQuaternion.premultiply(rotation);
    transform(this.memory.smoothedTarget); this.memory.yawRadians += yawDeltaRadians;
    this.memory.safeArmDistanceMeters = undefined; this.memory.actualArmDistanceMeters = undefined;
    this.memory.obstructionEntityId = undefined; this.memory.recoveryDelaySeconds = 0;
    this.applyWorldPose(eye, orientation);
  }

  snapshot(): CameraRigState {
    const position = this.camera.getWorldPosition(new THREE.Vector3());
    const follow = this.memory.follow;
    const direction = this.camera.getWorldDirection(new THREE.Vector3());
    return {
      mode: this.mode,
      positionWorldMetersXYZ: tuple(position),
      desiredPositionWorldMetersXYZ: tuple(follow ? this.target(follow).addScaledVector(this.armDirection(follow), follow.distanceMeters) : position),
      desiredYawRadians: this.desiredYawRadians,
      desiredPitchRadians: follow?.pitchRadians ?? Math.asin(THREE.MathUtils.clamp(-direction.y, -1, 1)),
      ...(follow ? { desiredArmDistanceMeters: follow.distanceMeters, framingMode: follow.framingMode } : {}),
      ...(this.memory.safeArmDistanceMeters === undefined ? {} : { safeArmDistanceMeters: this.memory.safeArmDistanceMeters }),
      ...(this.memory.actualArmDistanceMeters === undefined ? {} : { actualArmDistanceMeters: this.memory.actualArmDistanceMeters }),
      ...(this.memory.obstructionEntityId === undefined ? {} : { obstructionEntityId: this.memory.obstructionEntityId }),
    };
  }

  private target(follow: Follow): THREE.Vector3 {
    const position = this.targetPosition(follow.targetEntityId);
    if (!position || position.length !== 3 || !position.every(Number.isFinite)) throw new Error(`WORLD_CAMERA_TARGET_INVALID: ${follow.targetEntityId}`);
    return new THREE.Vector3(...position).add(new THREE.Vector3(0, follow.targetHeightMeters, 0));
  }

  private armDirection(follow: Follow): THREE.Vector3 {
    const cosine = Math.cos(follow.pitchRadians);
    return new THREE.Vector3(Math.sin(this.memory.yawRadians) * cosine, Math.sin(follow.pitchRadians), Math.cos(this.memory.yawRadians) * cosine);
  }

  private orbitRotation(yawRadians: number, pitchRadians: number): THREE.Quaternion {
    // A fixed world-up orbit frame keeps a full orientation offset (including
    // authored roll) independent from later camera.up or parent changes.
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitchRadians, yawRadians, 0, 'YXZ'));
  }

  private framedRotation(follow: Follow): THREE.Quaternion {
    return this.orbitRotation(this.memory.yawRadians, follow.pitchRadians).multiply(this.memory.framingRotation);
  }

  private readOpening(target: THREE.Vector3): { distanceMeters: number; yawRadians: number; pitchRadians: number; framingRotation: THREE.Quaternion } {
    const position = this.camera.getWorldPosition(new THREE.Vector3());
    const rotation = this.camera.getWorldQuaternion(new THREE.Quaternion());
    if (![...position.toArray(), ...rotation.toArray()].every(Number.isFinite)) throw new Error('WORLD_CAMERA_POSE_INVALID');
    const offset = position.clone().sub(target), distanceMeters = offset.length();
    if (!Number.isFinite(distanceMeters)) throw new Error('WORLD_CAMERA_POSE_INVALID');
    const direction = this.camera.getWorldDirection(new THREE.Vector3());
    const yawRadians = distanceMeters > 1e-12 ? Math.atan2(offset.x, offset.z) : Math.atan2(-direction.x, -direction.z);
    const pitchRadians = distanceMeters > 1e-12 ? Math.asin(THREE.MathUtils.clamp(offset.y / distanceMeters, -1, 1)) : 0;
    const framingRotation = this.orbitRotation(yawRadians, pitchRadians).invert().multiply(rotation);
    return { distanceMeters, yawRadians, pitchRadians, framingRotation };
  }

  private probe(target: THREE.Vector3, eye: THREE.Vector3, radiusMeters: number): { safeDistanceMeters: number; obstructionEntityId?: string } {
    const length = target.distanceTo(eye);
    const hit = this.castCameraArm(tuple(target), tuple(eye), radiusMeters);
    if (!Number.isFinite(hit.distanceMeters) || hit.distanceMeters < 0) throw new Error('WORLD_CAMERA_PROBE_INVALID');
    const hasObstruction = hit.colliderEntityId !== undefined || hit.distanceMeters < length - 1e-8;
    return {
      safeDistanceMeters: Math.max(0, Math.min(length, hit.distanceMeters) - (hasObstruction ? CONTACT_MARGIN_METERS : 0)),
      ...(hit.colliderEntityId === undefined ? {} : { obstructionEntityId: hit.colliderEntityId }),
    };
  }

  private applyWorldPose(position: THREE.Vector3, quaternion: THREE.Quaternion): void {
    const parent = this.camera.parent;
    if (parent) {
      parent.updateWorldMatrix(true, false);
      this.camera.position.copy(parent.worldToLocal(position.clone()));
      this.camera.quaternion.copy(parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(quaternion));
    } else { this.camera.position.copy(position); this.camera.quaternion.copy(quaternion); }
    this.camera.updateMatrix(); this.camera.updateWorldMatrix(true, false);
  }
}
