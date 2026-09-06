import * as THREE from 'three';
import { CameraHardDecolliderV1, type CameraGeometryHitV2, type CameraHardDecolliderTransactionStateV1 } from '@whitebox-world/camera-collision';
import type { CameraArmHit, PhysicsPort, Vec3 } from './engine-contracts.js';

export type CameraRigFollowOptions = Readonly<{
  targetEntityId: string;
  distanceMeters?: number;
  targetHeightMeters?: number;
  pitchRadians?: number;
  activateOnInput?: boolean;
  transitionSeconds?: number;
  rotationSpeedRadiansPerSecond?: number;
  collisionRadiusMeters?: number;
  recoveryHalfLifeSeconds?: number;
  maximumRecoveryMetersPerSecond?: number;
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
  positionWorldMetersXYZ: Vec3;
  desiredPositionWorldMetersXYZ: Vec3;
  desiredYawRadians: number;
  desiredPitchRadians: number;
  desiredArmDistanceMeters?: number;
  safeArmDistanceMeters?: number;
  actualArmDistanceMeters?: number;
  obstructionEntityId?: string;
  collisionPhase?: CameraHardDecolliderTransactionStateV1['phase'];
  targetPositionWorldMetersXYZ?: Vec3;
  orientationWorldQuaternionXYZW: readonly [number, number, number, number];
}>;

type Follow = { -readonly [Key in keyof CameraRigFollowOptions]-?: CameraRigFollowOptions[Key] };
type RigMemory = {
  mode: CameraRigState['mode'];
  follow: Follow | undefined;
  yawRadians: number;
  zoomDistanceMeters: number;
  safeArmDistanceMeters: number | undefined;
  actualArmDistanceMeters: number | undefined;
  obstructionEntityId: string | undefined;
  collisionPhase: CameraRigState['collisionPhase'];
  resolvedTarget: THREE.Vector3 | undefined;
  transitionElapsedSeconds: number;
  transitionPosition: THREE.Vector3;
  transitionQuaternion: THREE.Quaternion;
};
const MIN_PITCH_RADIANS = -1.3;
const MAX_PITCH_RADIANS = 1.4;
const CONTACT_MARGIN_METERS = .02;
const RELEASE_DELAY_SECONDS = .12;
const RELEASE_DEADBAND_METERS = .03;
const tuple = (value: THREE.Vector3): Vec3 => [value.x, value.y, value.z];
const exponential = (from: number, to: number, deltaSeconds: number, halfLifeSeconds: number) => to + (from - to) * Math.pow(.5, deltaSeconds / halfLifeSeconds);
const smoothstep = (ratio: number) => ratio * ratio * (3 - 2 * ratio);

function bounded(value: number, minimum: number, maximum: number, label: string): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`WORLD_CAMERA_OPTION_INVALID: ${label}`);
  return value;
}
function validDeltaSeconds(deltaSeconds: number): void {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0 || deltaSeconds > 10) throw new Error('WORLD_CAMERA_TIMESTEP_INVALID');
}
function copyMemory(memory: RigMemory): RigMemory {
  return { ...memory, follow: memory.follow ? { ...memory.follow } : undefined, transitionPosition: memory.transitionPosition.clone(), transitionQuaternion: memory.transitionQuaternion.clone(), resolvedTarget: memory.resolvedTarget?.clone() };
}

/** One optional writer for the supplied camera. The World owns input collection and time. */
export class ThreeCameraRig {
  get targetEntityId():string|undefined{return this.memory.follow?.targetEntityId;}
  private memory: RigMemory = {
    mode: 'authored', follow: undefined, yawRadians: 0, zoomDistanceMeters: 0,
    safeArmDistanceMeters: undefined, actualArmDistanceMeters: undefined, obstructionEntityId: undefined,
    collisionPhase: undefined, resolvedTarget: undefined, transitionElapsedSeconds: 0,
    transitionPosition: new THREE.Vector3(), transitionQuaternion: new THREE.Quaternion(),
  };
  private readonly decollider = new CameraHardDecolliderV1();
  private solveTick = 0;
  private initial: { camera: THREE.Camera; parent: THREE.Object3D | null; memory: RigMemory; collision: CameraHardDecolliderTransactionStateV1; solveTick: number } | undefined;

  constructor(
    private readonly camera: THREE.Camera,
    private readonly castCameraArm: PhysicsPort['castCameraArm'],
    private readonly targetPosition: (entityId: string) => Vec3 | undefined,
  ) {}

  get mode(): CameraRigState['mode'] { return this.memory.mode; }
  get desiredYawRadians(): number {
    if (this.memory.mode !== 'authored') return this.memory.yawRadians;
    const direction = this.camera.getWorldDirection(new THREE.Vector3());
    return Math.atan2(-direction.x, -direction.z);
  }

  setFollow(options: CameraRigFollowOptions): void {
    if (!options || typeof options.targetEntityId !== 'string' || !options.targetEntityId.trim()) throw new Error('WORLD_CAMERA_TARGET_REQUIRED');
    const follow: Follow = {
      targetEntityId: options.targetEntityId,
      distanceMeters: bounded(options.distanceMeters ?? 4, .05, 100, 'distanceMeters'),
      targetHeightMeters: bounded(options.targetHeightMeters ?? 1.3, -10_000, 10_000, 'targetHeightMeters'),
      pitchRadians: bounded(options.pitchRadians ?? .25, MIN_PITCH_RADIANS, MAX_PITCH_RADIANS, 'pitchRadians'),
      activateOnInput: options.activateOnInput ?? true,
      transitionSeconds: bounded(options.transitionSeconds ?? .35, 0, 10, 'transitionSeconds'),
      rotationSpeedRadiansPerSecond: bounded(options.rotationSpeedRadiansPerSecond ?? 1.8, .001, 100, 'rotationSpeedRadiansPerSecond'),
      collisionRadiusMeters: bounded(options.collisionRadiusMeters ?? .2, .001, 10, 'collisionRadiusMeters'),
      recoveryHalfLifeSeconds: bounded(options.recoveryHalfLifeSeconds ?? .18, .001, 10, 'recoveryHalfLifeSeconds'),
      maximumRecoveryMetersPerSecond: bounded(options.maximumRecoveryMetersPerSecond ?? 3, .001, 1000, 'maximumRecoveryMetersPerSecond'),
    };
    if (typeof follow.activateOnInput !== 'boolean') throw new Error('WORLD_CAMERA_OPTION_INVALID: activateOnInput');
    this.target(follow);
    const direction = this.camera.getWorldDirection(new THREE.Vector3());
    this.memory = {
      mode: follow.activateOnInput ? 'follow-pending' : 'follow', follow,
      yawRadians: Math.atan2(-direction.x, -direction.z), zoomDistanceMeters: follow.distanceMeters,
      safeArmDistanceMeters: undefined, actualArmDistanceMeters: undefined, obstructionEntityId: undefined,
      collisionPhase: undefined, resolvedTarget: undefined, transitionElapsedSeconds: 0,
      transitionPosition: this.camera.getWorldPosition(new THREE.Vector3()),
      transitionQuaternion: this.camera.getWorldQuaternion(new THREE.Quaternion()),
    };
    this.decollider.reset(); this.solveTick = 0;
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
      this.memory.mode = 'follow'; this.memory.transitionElapsedSeconds = 0;
      this.camera.getWorldPosition(this.memory.transitionPosition); this.camera.getWorldQuaternion(this.memory.transitionQuaternion);
    }
    this.memory.yawRadians += yaw;
    follow.pitchRadians = THREE.MathUtils.clamp(follow.pitchRadians + pitch, MIN_PITCH_RADIANS, MAX_PITCH_RADIANS);
    const distanceMeters = THREE.MathUtils.clamp(follow.distanceMeters + zoom, .05, 100);
    follow.distanceMeters = distanceMeters;
  }

  /** Call once after the shared physics step; never advances physics or renders. */
  update(deltaSeconds: number): void {
    validDeltaSeconds(deltaSeconds);
    const follow = this.memory.follow;
    if (!follow || this.mode !== 'follow') return;
    const target = this.target(follow);
    const direction = this.armDirection(follow);
    // User zoom retains its authored parameter smoothing; only an actual
    // obstruction enters the shared collision recovery state.
    this.memory.zoomDistanceMeters = exponential(this.memory.zoomDistanceMeters, follow.distanceMeters, deltaSeconds, follow.recoveryHalfLifeSeconds);
    const desiredEye = target.clone().addScaledVector(direction, this.memory.zoomDistanceMeters);
    this.memory.transitionElapsedSeconds += deltaSeconds;
    const transitionRatio = follow.transitionSeconds === 0 ? 1 : Math.min(1, this.memory.transitionElapsedSeconds / follow.transitionSeconds);
    const blend = smoothstep(transitionRatio);
    const candidateEye = desiredEye.clone();
    if (blend < 1) candidateEye.lerpVectors(this.memory.transitionPosition, desiredEye, blend);
    // Query the transition chord, not just its destination: its entire volume
    // must be safe even when a wall appears on the first activated frame.
    const solved = this.solveCollision(target, candidateEye, follow, deltaSeconds);
    const eye = solved.eye;
    const lookingEye = eye.distanceToSquared(target) > 1e-12 ? eye : desiredEye;
    let rotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(lookingEye, target, this.camera.up));
    // slerpQuaternions copies its start into the output before reading its end.
    // The output must therefore never alias that destination quaternion.
    if (blend < 1) rotation = this.memory.transitionQuaternion.clone().slerp(rotation, blend);
    this.applyWorldPose(eye, rotation);
    this.memory.actualArmDistanceMeters = eye.distanceTo(solved.target);
    this.memory.safeArmDistanceMeters = solved.safeDistance;
    this.memory.obstructionEntityId = solved.entityId;
    this.memory.collisionPhase = solved.phase;
    this.memory.resolvedTarget = solved.target;
  }
  private solveCollision(target: THREE.Vector3, desiredEye: THREE.Vector3, follow: Follow, dt: number): { eye: THREE.Vector3; target: THREE.Vector3; safeDistance: number; entityId: string | undefined; phase: CameraRigState['collisionPhase'] } {
    let pivot = target.clone(), hit = this.probe(pivot, desiredEye, follow.collisionRadiusMeters);
    const overlapId = hit.startedOverlapping ? hit.colliderEntityId : undefined;
    // Resolve a deeply intersecting visual pivot by native separation normals.
    // Each candidate is re-queried, including corners with multiple surfaces.
    for (let attempt = 0; hit.startedOverlapping && attempt < 8; attempt++) {
      if (!hit.normalWorldXYZ || !Number.isFinite(hit.penetrationDepthMeters)) break;
      pivot.addScaledVector(new THREE.Vector3(...hit.normalWorldXYZ).normalize(), hit.penetrationDepthMeters! + CONTACT_MARGIN_METERS);
      hit = this.probe(pivot, desiredEye, follow.collisionRadiusMeters);
    }
    if (hit.startedOverlapping) {
      const currentEye = this.camera.getWorldPosition(new THREE.Vector3());
      if (!this.probe(currentEye, currentEye, follow.collisionRadiusMeters).startedOverlapping) {
        // No bounded separating pivot was found, but the previous eye is still
        // physically valid. Hold it until a clear pivot is available.
        return { eye: currentEye, target: pivot, safeDistance: 0, entityId: hit.colliderEntityId ?? overlapId, phase: 'emergency-inside' };
      }
    }
    const previous = this.decollider.captureTransactionState();
    // Free orbit/zoom/entry trajectories must not impersonate recovery from a wall.
    if (previous.phase === 'clear' && !hit.startedOverlapping) this.decollider.reset();
    const armLength = pivot.distanceTo(desiredEye);
    let safeDistance = hit.distanceMeters;
    if (hit.colliderEntityId && previous.constrainedArmLengthMeters !== undefined && safeDistance > previous.constrainedArmLengthMeters && safeDistance - previous.constrainedArmLengthMeters < RELEASE_DEADBAND_METERS) safeDistance = previous.constrainedArmLengthMeters;
    const geometryHit: CameraGeometryHitV2 | undefined = hit.colliderEntityId !== undefined || safeDistance < armLength - 1e-8 ? {
      schemaVersion: 2, travelDistanceMeters: safeDistance, travelFraction: armLength === 0 ? 0 : safeDistance / armLength,
      hitPointMetersXYZ: hit.hitPositionWorldMetersXYZ ?? tuple(pivot),
      hitNormalXYZ: hit.normalWorldXYZ ?? tuple(pivot.clone().sub(desiredEye).normalize()),
      ...(hit.colliderEntityId ? { hitEntityId: hit.colliderEntityId } : {}),
      startedOverlapping: hit.startedOverlapping ?? false, penetrationDepthMeters: hit.penetrationDepthMeters ?? 0, obstructionClass: 'hard',
    } : undefined;
    const request = { authorityTick: ++this.solveTick, desiredTargetPositionMetersXYZ: tuple(pivot), desiredPositionMetersXYZ: tuple(desiredEye),
      currentCommittedPositionMetersXYZ: tuple(this.camera.getWorldPosition(new THREE.Vector3())), minimumUsableArmLengthMeters: Math.min(.3, armLength),
      clearHoldSeconds: RELEASE_DELAY_SECONDS, recoveryHalfLifeSeconds: follow.recoveryHalfLifeSeconds,
      maximumRecoveryMetersPerSecond: follow.maximumRecoveryMetersPerSecond, deltaSeconds: dt, ...(geometryHit ? { geometryHit } : {}) };
    const result = this.decollider.solve(request);
    let eye = new THREE.Vector3(...result.positionMetersXYZ), resolved = new THREE.Vector3(...result.resolvedTargetPositionMetersXYZ);
    if (hit.startedOverlapping) {
      // The shared emergency solver proposes a previous safe pose. Validate the
      // entire segment; if needed use the separating side rather than crossing a wall.
      const validate = (p: THREE.Vector3) => { const q = this.probe(resolved, p, follow.collisionRadiusMeters); return !q.startedOverlapping && q.distanceMeters >= resolved.distanceTo(p) - 1e-6; };
      if (!validate(eye)) {
        const candidate = resolved.clone().addScaledVector(new THREE.Vector3(...geometryHit!.hitNormalXYZ), Math.max(.3, follow.collisionRadiusMeters));
        if (!validate(candidate)) throw new Error('WORLD_CAMERA_NO_SAFE_POSE');
        eye = candidate;
      }
    }
    return { eye, target: resolved, safeDistance: result.safeArmLengthMeters, entityId: result.stableHitEntityId ?? overlapId,
      phase: overlapId ? 'emergency-inside' : result.phase };
  }

  useAuthoredCamera(): THREE.Camera {
    this.memory.mode = 'authored'; this.memory.follow = undefined;
    this.memory.safeArmDistanceMeters = undefined; this.memory.actualArmDistanceMeters = undefined;
    this.memory.obstructionEntityId = undefined; this.memory.collisionPhase = undefined; this.memory.resolvedTarget = undefined;
    this.memory.transitionElapsedSeconds = 0; this.decollider.reset(); this.solveTick = 0;
    return this.camera;
  }

  sealInitialState(): void {
    if (this.initial) return;
    this.camera.updateWorldMatrix(true, false);
    this.initial = { camera: this.camera.clone(), parent: this.camera.parent, memory: copyMemory(this.memory), collision: this.decollider.captureTransactionState(), solveTick: this.solveTick };
  }

  reset(): void {
    this.sealInitialState();
    const initial = this.initial!;
    if (initial.parent) initial.parent.add(this.camera); else this.camera.removeFromParent();
    this.camera.copy(initial.camera, false);
    this.camera.updateWorldMatrix(true, false);
    this.memory = copyMemory(initial.memory);
    this.decollider.restoreTransactionState(initial.collision); this.solveTick = initial.solveTick;
  }

  snapshot(): CameraRigState {
    const position = this.camera.getWorldPosition(new THREE.Vector3());
    const quaternion = this.camera.getWorldQuaternion(new THREE.Quaternion());
    const follow = this.memory.follow;
    const direction = this.camera.getWorldDirection(new THREE.Vector3());
    return {
      mode: this.mode,
      positionWorldMetersXYZ: tuple(position),
      orientationWorldQuaternionXYZW: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
      desiredPositionWorldMetersXYZ: tuple(follow ? this.target(follow).addScaledVector(this.armDirection(follow), follow.distanceMeters) : position),
      desiredYawRadians: this.desiredYawRadians,
      desiredPitchRadians: follow?.pitchRadians ?? Math.asin(THREE.MathUtils.clamp(-direction.y, -1, 1)),
      ...(follow ? { desiredArmDistanceMeters: follow.distanceMeters } : {}),
      ...(this.memory.safeArmDistanceMeters === undefined ? {} : { safeArmDistanceMeters: this.memory.safeArmDistanceMeters }),
      ...(this.memory.actualArmDistanceMeters === undefined ? {} : { actualArmDistanceMeters: this.memory.actualArmDistanceMeters }),
      ...(this.memory.obstructionEntityId === undefined ? {} : { obstructionEntityId: this.memory.obstructionEntityId }),
      ...(this.memory.collisionPhase === undefined ? {} : { collisionPhase: this.memory.collisionPhase }),
      ...(follow ? { targetPositionWorldMetersXYZ: tuple(this.memory.resolvedTarget ?? this.target(follow)) } : {}),
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

  private probe(target: THREE.Vector3, eye: THREE.Vector3, radius: number): CameraArmHit {
    const length = target.distanceTo(eye), hit = this.castCameraArm(tuple(target), tuple(eye), radius);
    if (!Number.isFinite(hit.distanceMeters) || hit.distanceMeters < 0 || (hit.normalWorldXYZ && (!hit.normalWorldXYZ.every(Number.isFinite) || Math.hypot(...hit.normalWorldXYZ) < .5))) throw new Error('WORLD_CAMERA_PROBE_INVALID');
    const blocked = hit.colliderEntityId !== undefined || hit.distanceMeters < length - 1e-8;
    return { ...hit, distanceMeters: Math.max(0, Math.min(length, hit.distanceMeters) - (blocked ? CONTACT_MARGIN_METERS : 0)) };
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
