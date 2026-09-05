import * as THREE from 'three';
import { CameraHardDecolliderV1, type CameraGeometryHitV2, type CameraHardDecolliderTransactionStateV1 } from '@whitebox-world/camera-collision';
import type { CameraArmHit, PhysicsPort, Vec3 } from './engine-contracts.js';

export type CameraRigFollowOptions = Readonly<{
  targetEntityId: string;
  /** Without orbit values, follow adopts the current authored pose and framing. */
  framingMode?: 'preserve-opening' | 'target';
  distanceMeters?: number;
  targetHeightMeters?: number;
  pitchRadians?: number;
  activateOnInput?: boolean;
  transitionSeconds?: number;
  rotationSpeedRadiansPerSecond?: number;
  collisionRadiusMeters?: number;
  recoveryHalfLifeSeconds?: number;
  maximumRecoveryMetersPerSecond?: number;
  targetHalfLifeSeconds?: number;
}>;
export type CameraRigInput = Readonly<{
  cameraYawRatio?: number; cameraPitchRatio?: number; yawDeltaRadians?: number;
  pitchDeltaRadians?: number; distanceDeltaMeters?: number; activate?: boolean;
}>;
export type CameraRigState = Readonly<{
  mode: 'authored' | 'follow-pending' | 'follow';
  positionWorldMetersXYZ: Vec3;
  orientationWorldQuaternionXYZW: readonly [number, number, number, number];
  desiredPositionWorldMetersXYZ: Vec3;
  desiredYawRadians: number;
  desiredPitchRadians: number;
  desiredArmDistanceMeters?: number;
  safeArmDistanceMeters?: number;
  actualArmDistanceMeters?: number;
  obstructionEntityId?: string;
  collisionPhase?: CameraHardDecolliderTransactionStateV1['phase'];
  targetPositionWorldMetersXYZ?: Vec3;
  subjectPositionWorldMetersXYZ?: Vec3;
  transitionProgressRatio?: number;
  framingMode?: 'preserve-opening' | 'target';
}>;
export type CameraSubjectBody = Readonly<{ heightMeters: number; radiusMeters: number }>;
type Follow = { -readonly [Key in keyof CameraRigFollowOptions]-?: CameraRigFollowOptions[Key] };
type RigMemory = {
  mode: CameraRigState['mode']; follow: Follow | undefined; yawRadians: number;
  zoomDistanceMeters: number; transitionElapsedSeconds: number;
  transitionPosition: THREE.Vector3; transitionQuaternion: THREE.Quaternion;
  framingRotation: THREE.Quaternion; smoothedSubject: THREE.Vector3;
  inheritDistance: boolean; inheritPitch: boolean;
  safeArmDistanceMeters: number | undefined; actualArmDistanceMeters: number | undefined;
  obstructionEntityId: string | undefined; collisionPhase: CameraRigState['collisionPhase'];
  resolvedTarget: THREE.Vector3 | undefined;
};
const MIN_PITCH_RADIANS = -1.3, MAX_PITCH_RADIANS = 1.4;
const CONTACT_MARGIN_METERS = .02, RELEASE_DELAY_SECONDS = .12, RELEASE_DEADBAND_METERS = .03;
const tuple = (v: THREE.Vector3): Vec3 => [v.x, v.y, v.z];
const exponential = (a: number, b: number, dt: number, halfLife: number) => halfLife === 0 ? b : b + (a - b) * Math.pow(.5, dt / halfLife);
const smoothstep = (t: number) => t * t * (3 - 2 * t);
function bounded(value: number, min: number, max: number, label: string): number {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`WORLD_CAMERA_OPTION_INVALID: ${label}`);
  return value;
}
function validDeltaSeconds(dt: number): void {
  if (!Number.isFinite(dt) || dt < 0 || dt > 10) throw new Error('WORLD_CAMERA_TIMESTEP_INVALID');
}
function initialMemory(): RigMemory {
  return { mode: 'authored', follow: undefined, yawRadians: 0, zoomDistanceMeters: 0, transitionElapsedSeconds: 0,
    transitionPosition: new THREE.Vector3(), transitionQuaternion: new THREE.Quaternion(), framingRotation: new THREE.Quaternion(),
    smoothedSubject: new THREE.Vector3(), inheritDistance: false, inheritPitch: false, safeArmDistanceMeters: undefined, actualArmDistanceMeters: undefined,
    obstructionEntityId: undefined, collisionPhase: undefined, resolvedTarget: undefined };
}
function copyMemory(m: RigMemory): RigMemory {
  return { ...m, follow: m.follow ? { ...m.follow } : undefined, transitionPosition: m.transitionPosition.clone(),
    transitionQuaternion: m.transitionQuaternion.clone(), framingRotation: m.framingRotation.clone(), smoothedSubject: m.smoothedSubject.clone(), resolvedTarget: m.resolvedTarget?.clone() };
}

/** The sole optional pose writer. World owns input, physics and the fixed clock. */
export class ThreeCameraRig {
  private memory: RigMemory = initialMemory();
  private readonly decollider = new CameraHardDecolliderV1();
  private solveTick = 0;
  private initial: { camera: THREE.Camera; parent: THREE.Object3D | null; memory: RigMemory; collision: CameraHardDecolliderTransactionStateV1; solveTick: number } | undefined;
  constructor(
    private readonly camera: THREE.Camera,
    private readonly castCameraArm: PhysicsPort['castCameraArm'],
    private readonly targetPosition: (entityId: string) => Vec3 | undefined,
    private readonly subjectBody?: (entityId: string) => CameraSubjectBody | undefined,
  ) {}
  get targetEntityId(): string | undefined { return this.memory.follow?.targetEntityId; }
  get mode(): CameraRigState['mode'] { return this.memory.mode; }
  get desiredYawRadians(): number {
    const follow = this.memory.follow;
    const direction = follow && this.mode !== 'authored'
      ? new THREE.Vector3(0, 0, -1).applyQuaternion(this.orbitRotation(follow))
      : this.camera.getWorldDirection(new THREE.Vector3());
    return Math.atan2(-direction.x, -direction.z);
  }
  setFollow(options: CameraRigFollowOptions): void {
    if (!options || typeof options.targetEntityId !== 'string' || !options.targetEntityId.trim()) throw new Error('WORLD_CAMERA_TARGET_REQUIRED');
    const subject = this.subject(options.targetEntityId), body = this.subjectBody?.(options.targetEntityId);
    const position = this.camera.getWorldPosition(new THREE.Vector3()), rotation = this.camera.getWorldQuaternion(new THREE.Quaternion());
    const hasOrbit = options.distanceMeters !== undefined || options.targetHeightMeters !== undefined || options.pitchRadians !== undefined;
    const framingMode = options.framingMode ?? (hasOrbit ? 'target' : 'preserve-opening');
    if (!['preserve-opening', 'target'].includes(framingMode)) throw new Error('WORLD_CAMERA_OPTION_INVALID: framingMode');
    const height = bounded(options.targetHeightMeters ?? (body ? body.heightMeters * .65 : 1.3), -10_000, 10_000, 'targetHeightMeters');
    const target = subject.clone().add(new THREE.Vector3(0, height, 0)), offset = position.clone().sub(target);
    const actualDistance = offset.length();
    const follow: Follow = {
      targetEntityId: options.targetEntityId, framingMode,
      distanceMeters: bounded(options.distanceMeters ?? (framingMode === 'preserve-opening' ? THREE.MathUtils.clamp(actualDistance, .05, 10_000) : 4), .05, 10_000, 'distanceMeters'),
      targetHeightMeters: height,
      pitchRadians: bounded(options.pitchRadians ?? (framingMode === 'preserve-opening' && actualDistance > .001 ? Math.asin(THREE.MathUtils.clamp(offset.y / actualDistance, -1, 1)) : .25), -Math.PI / 2, Math.PI / 2, 'pitchRadians'),
      activateOnInput: options.activateOnInput ?? true,
      transitionSeconds: bounded(options.transitionSeconds ?? .35, 0, 10, 'transitionSeconds'),
      rotationSpeedRadiansPerSecond: bounded(options.rotationSpeedRadiansPerSecond ?? 1.8, .001, 100, 'rotationSpeedRadiansPerSecond'),
      collisionRadiusMeters: bounded(options.collisionRadiusMeters ?? .2, .001, 10, 'collisionRadiusMeters'),
      recoveryHalfLifeSeconds: bounded(options.recoveryHalfLifeSeconds ?? .24, .001, 10, 'recoveryHalfLifeSeconds'),
      maximumRecoveryMetersPerSecond: bounded(options.maximumRecoveryMetersPerSecond ?? 3, .001, 1000, 'maximumRecoveryMetersPerSecond'),
      targetHalfLifeSeconds: bounded(options.targetHalfLifeSeconds ?? .1, 0, 10, 'targetHalfLifeSeconds'),
    };
    if (typeof follow.activateOnInput !== 'boolean') throw new Error('WORLD_CAMERA_OPTION_INVALID: activateOnInput');
    const direction = this.camera.getWorldDirection(new THREE.Vector3());
    const yaw = framingMode === 'preserve-opening' && actualDistance > .001 ? Math.atan2(offset.x, offset.z) : Math.atan2(-direction.x, -direction.z);
    const framingRotation = framingMode === 'preserve-opening' && actualDistance > .001
      ? this.lookRotation(position, target).invert().multiply(rotation) : new THREE.Quaternion();
    this.memory = { ...initialMemory(), mode: follow.activateOnInput ? 'follow-pending' : 'follow', follow, yawRadians: yaw,
      zoomDistanceMeters: follow.distanceMeters, transitionPosition: position, transitionQuaternion: rotation,
      framingRotation, smoothedSubject: subject, inheritDistance: options.distanceMeters === undefined, inheritPitch: options.pitchRadians === undefined };
    this.decollider.reset(); this.solveTick = 0;
  }
  /** Called before deriving camera-relative player movement. */
  updateDesired(input: CameraRigInput, dt: number): void {
    validDeltaSeconds(dt);
    if (!input || typeof input !== 'object') throw new Error('WORLD_CAMERA_INPUT_INVALID');
    for (const key of ['cameraYawRatio', 'cameraPitchRatio', 'yawDeltaRadians', 'pitchDeltaRadians', 'distanceDeltaMeters'] as const) {
      const v = input[key];
      if (v !== undefined && (!Number.isFinite(v) || Math.abs(v) > (key.endsWith('Ratio') ? 1 : 100_000))) throw new Error(`WORLD_CAMERA_INPUT_INVALID: ${key}`);
    }
    if (input.activate !== undefined && typeof input.activate !== 'boolean') throw new Error('WORLD_CAMERA_INPUT_INVALID: activate');
    const follow = this.memory.follow; if (!follow || this.mode === 'authored') return;
    const yaw = (input.cameraYawRatio ?? 0) * follow.rotationSpeedRadiansPerSecond * dt + (input.yawDeltaRadians ?? 0);
    const pitch = (input.cameraPitchRatio ?? 0) * follow.rotationSpeedRadiansPerSecond * dt + (input.pitchDeltaRadians ?? 0);
    const zoom = input.distanceDeltaMeters ?? 0;
    if (this.mode === 'follow-pending' && (input.activate || yaw || pitch || zoom)) {
      this.memory.mode = 'follow'; this.memory.transitionElapsedSeconds = 0;
      this.camera.getWorldPosition(this.memory.transitionPosition); this.camera.getWorldQuaternion(this.memory.transitionQuaternion);
      if (follow.framingMode === 'preserve-opening') {
        const subject = this.subject(follow.targetEntityId), target = subject.clone().add(new THREE.Vector3(0, follow.targetHeightMeters, 0));
        const offset = this.memory.transitionPosition.clone().sub(target), length = offset.length();
        if (length > .001) {
          this.memory.yawRadians = Math.atan2(offset.x, offset.z);
          if (this.memory.inheritDistance) follow.distanceMeters = THREE.MathUtils.clamp(length, .05, 10_000);
          if (this.memory.inheritPitch) follow.pitchRadians = Math.asin(THREE.MathUtils.clamp(offset.y / length, -1, 1));
          this.memory.framingRotation.copy(this.lookRotation(this.memory.transitionPosition, target).invert().multiply(this.memory.transitionQuaternion));
        }
        this.memory.zoomDistanceMeters = follow.distanceMeters; this.memory.smoothedSubject.copy(subject);
      }
    }
    this.memory.yawRadians += yaw;
    if (pitch !== 0) follow.pitchRadians = THREE.MathUtils.clamp(follow.pitchRadians + pitch, MIN_PITCH_RADIANS, MAX_PITCH_RADIANS);
    follow.distanceMeters = THREE.MathUtils.clamp(follow.distanceMeters + zoom, .05, 10_000);
  }
  /** Once after shared physics, with no rendering or independent timer. */
  update(dt: number): void {
    validDeltaSeconds(dt); const follow = this.memory.follow; if (!follow || this.mode !== 'follow') return;
    const subject = this.subject(follow.targetEntityId), body = this.subjectBody?.(follow.targetEntityId);
    const priorSubject = this.memory.smoothedSubject;
    if (priorSubject.distanceTo(subject) > Math.max(4, follow.distanceMeters * .5)) { priorSubject.copy(subject); this.decollider.reset(); }
    else for (const axis of ['x', 'y', 'z'] as const) priorSubject[axis] = exponential(priorSubject[axis], subject[axis], dt, follow.targetHalfLifeSeconds);
    const collisionHeight = body ? body.heightMeters * .65 : follow.targetHeightMeters;
    const rawPivot = subject.clone().add(new THREE.Vector3(0, collisionHeight, 0));
    const dampedPivot = priorSubject.clone().add(new THREE.Vector3(0, collisionHeight, 0));
    if (rawPivot.distanceToSquared(dampedPivot) > 1e-8) {
      const dampingPath = this.probe(rawPivot, dampedPivot, follow.collisionRadiusMeters);
      // A legal teleport or wall-side change must not interpolate its pivot
      // through solid scenery, even when the displacement is relatively small.
      if (dampingPath.startedOverlapping || dampingPath.distanceMeters < rawPivot.distanceTo(dampedPivot) - 1e-6) priorSubject.copy(subject);
    }
    const target = priorSubject.clone().add(new THREE.Vector3(0, follow.targetHeightMeters, 0));
    // A tall visual LookAt point must not become the only visibility/collision anchor.
    const physicalTarget = body ? priorSubject.clone().add(new THREE.Vector3(0, body.heightMeters * .65, 0)) : target.clone();
    const subjectAnchor = body ? subject.clone().add(new THREE.Vector3(0, body.heightMeters * .5, 0)) : subject;
    this.memory.zoomDistanceMeters = exponential(this.memory.zoomDistanceMeters, follow.distanceMeters, dt, follow.recoveryHalfLifeSeconds);
    const desiredEye = target.clone().addScaledVector(this.armDirection(follow), this.memory.zoomDistanceMeters);
    this.memory.transitionElapsedSeconds += dt;
    const progress = this.transitionProgress(follow), blend = smoothstep(progress);
    const candidateEye = desiredEye.clone(); if (blend < 1) candidateEye.lerpVectors(this.memory.transitionPosition, desiredEye, blend);
    let rotation = this.lookRotation(desiredEye, target).multiply(this.memory.framingRotation);
    // Never alias the destination with the slerpQuaternions output object.
    if (blend < 1) rotation = this.memory.transitionQuaternion.clone().slerp(rotation, blend);
    const solved = this.solveCollision(physicalTarget, candidateEye, follow, dt);
    const eye = solved.eye;
    if (eye.distanceToSquared(candidateEye) > 1e-10) {
      // Preserve the subject's angular screen position while the arm retracts.
      // This changes orientation only; it cannot smooth a camera through geometry.
      const referenceRay = subjectAnchor.clone().sub(candidateEye).normalize();
      const actualRay = subjectAnchor.clone().sub(eye).normalize();
      if (referenceRay.lengthSq() > .5 && actualRay.lengthSq() > .5) rotation.premultiply(new THREE.Quaternion().setFromUnitVectors(referenceRay, actualRay));
    }
    this.applyWorldPose(eye, rotation);
    this.memory.resolvedTarget = solved.target;
    this.memory.actualArmDistanceMeters = eye.distanceTo(solved.target);
    this.memory.safeArmDistanceMeters = solved.safeDistance;
    this.memory.obstructionEntityId = solved.entityId;
    this.memory.collisionPhase = solved.phase;
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
  useAuthoredCamera(): THREE.Camera { this.memory = initialMemory(); this.decollider.reset(); this.solveTick = 0; return this.camera; }
  sealInitialState(): void {
    if (this.initial) return; this.camera.updateWorldMatrix(true, false);
    this.initial = { camera: this.camera.clone(), parent: this.camera.parent, memory: copyMemory(this.memory), collision: this.decollider.captureTransactionState(), solveTick: this.solveTick };
  }
  reset(): void {
    this.sealInitialState(); const initial = this.initial!;
    if (initial.parent) initial.parent.add(this.camera); else this.camera.removeFromParent();
    this.camera.copy(initial.camera, false); this.camera.updateWorldMatrix(true, false);
    this.memory = copyMemory(initial.memory); this.decollider.restoreTransactionState(initial.collision); this.solveTick = initial.solveTick;
  }
  /** Rebase a recording copy's opening and all follow memory as one rigid pose. */
  relocateEpisodeStart(from: Vec3, to: Vec3, yawDeltaRadians: number, eye: THREE.Vector3, orientation: THREE.Quaternion): void {
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawDeltaRadians);
    const transform = (point: THREE.Vector3) => point.sub(new THREE.Vector3(...from)).applyQuaternion(rotation).add(new THREE.Vector3(...to));
    transform(eye); orientation.premultiply(rotation);
    transform(this.memory.transitionPosition); this.memory.transitionQuaternion.premultiply(rotation);
    transform(this.memory.smoothedSubject); if (this.memory.resolvedTarget) transform(this.memory.resolvedTarget);
    this.memory.yawRadians += yawDeltaRadians;
    this.memory.safeArmDistanceMeters = undefined; this.memory.actualArmDistanceMeters = undefined;
    this.memory.obstructionEntityId = undefined; this.memory.collisionPhase = undefined;
    this.decollider.reset(); this.solveTick = 0;
    this.applyWorldPose(eye, orientation);
  }
  snapshot(): CameraRigState {
    const position = this.camera.getWorldPosition(new THREE.Vector3()), follow = this.memory.follow;
    const quaternion = this.camera.getWorldQuaternion(new THREE.Quaternion());
    const direction = this.camera.getWorldDirection(new THREE.Vector3());
    const subject = follow ? this.subject(follow.targetEntityId) : undefined;
    const target = follow ? this.memory.smoothedSubject.clone().add(new THREE.Vector3(0, follow.targetHeightMeters, 0)) : undefined;
    return { mode: this.mode, positionWorldMetersXYZ: tuple(position), orientationWorldQuaternionXYZW: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
      desiredPositionWorldMetersXYZ: tuple(follow && target ? target.clone().addScaledVector(this.armDirection(follow), follow.distanceMeters) : position),
      desiredYawRadians: this.desiredYawRadians, desiredPitchRadians: follow?.pitchRadians ?? Math.asin(THREE.MathUtils.clamp(-direction.y, -1, 1)),
      ...(follow ? { desiredArmDistanceMeters: follow.distanceMeters, framingMode: follow.framingMode, transitionProgressRatio: this.mode === 'follow-pending' ? 0 : this.transitionProgress(follow) } : {}),
      ...(subject ? { subjectPositionWorldMetersXYZ: tuple(subject) } : {}),
      ...(target ? { targetPositionWorldMetersXYZ: tuple(this.memory.resolvedTarget ?? target) } : {}),
      ...(this.memory.safeArmDistanceMeters === undefined ? {} : { safeArmDistanceMeters: this.memory.safeArmDistanceMeters }),
      ...(this.memory.actualArmDistanceMeters === undefined ? {} : { actualArmDistanceMeters: this.memory.actualArmDistanceMeters }),
      ...(this.memory.obstructionEntityId === undefined ? {} : { obstructionEntityId: this.memory.obstructionEntityId }),
      ...(this.memory.collisionPhase === undefined ? {} : { collisionPhase: this.memory.collisionPhase }) };
  }
  private transitionProgress(follow: Follow): number { return follow.transitionSeconds === 0 ? 1 : Math.min(1, this.memory.transitionElapsedSeconds / follow.transitionSeconds); }
  private subject(id: string): THREE.Vector3 {
    const value = this.targetPosition(id); if (!value || value.length !== 3 || !value.every(Number.isFinite)) throw new Error(`WORLD_CAMERA_TARGET_INVALID: ${id}`);
    return new THREE.Vector3(...value);
  }
  private armDirection(follow: Follow): THREE.Vector3 { const cosine = Math.cos(follow.pitchRadians); return new THREE.Vector3(Math.sin(this.memory.yawRadians) * cosine, Math.sin(follow.pitchRadians), Math.cos(this.memory.yawRadians) * cosine); }
  private orbitRotation(follow: Follow): THREE.Quaternion { return this.lookRotation(this.armDirection(follow), new THREE.Vector3()).multiply(this.memory.framingRotation); }
  private lookRotation(eye: THREE.Vector3, target: THREE.Vector3): THREE.Quaternion { return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(eye, target, this.camera.up)); }
  private probe(target: THREE.Vector3, eye: THREE.Vector3, radius: number): CameraArmHit {
    const length = target.distanceTo(eye), hit = this.castCameraArm(tuple(target), tuple(eye), radius);
    if (!Number.isFinite(hit.distanceMeters) || hit.distanceMeters < 0 || (hit.normalWorldXYZ && (!hit.normalWorldXYZ.every(Number.isFinite) || Math.hypot(...hit.normalWorldXYZ) < .5))) throw new Error('WORLD_CAMERA_PROBE_INVALID');
    const blocked = hit.colliderEntityId !== undefined || hit.distanceMeters < length - 1e-8;
    return { ...hit, distanceMeters: Math.max(0, Math.min(length, hit.distanceMeters) - (blocked ? CONTACT_MARGIN_METERS : 0)) };
  }
  private applyWorldPose(position: THREE.Vector3, quaternion: THREE.Quaternion): void {
    const parent = this.camera.parent;
    if (parent) { parent.updateWorldMatrix(true, false); this.camera.position.copy(parent.worldToLocal(position.clone())); this.camera.quaternion.copy(parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(quaternion)); }
    else { this.camera.position.copy(position); this.camera.quaternion.copy(quaternion); }
    this.camera.updateMatrix(); this.camera.updateWorldMatrix(true, false);
  }
}
