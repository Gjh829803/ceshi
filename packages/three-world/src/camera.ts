import {FOLLOW_CAMERA_DEFAULTS} from './config/follow-camera';
import * as THREE from 'three';
import { CameraCollisionSolver, type CameraHardDecolliderTransactionStateV1 } from '@whitebox-world/camera-collision';
import type { CameraArmHit, PhysicsPort, Vec3 } from './engine-contracts.js';
import type {CameraFollowViewOptions,CameraPerspective} from './contracts.js';

export type CameraRigFollowOptions = Readonly<{
  view?:CameraFollowViewOptions;
  targetEntityId: string;
  /** Without orbit values, follow adopts the current authored pose and framing. */
  framingMode?: 'preserve-opening' | 'target';
  /** Translation damping for preserve-opening; an explicit targetHalfLifeSeconds remains a fallback. */
  followHalfLifeSeconds?: number;
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
  perspective?:CameraPerspective;
  view?:Required<CameraFollowViewOptions>;
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
type Follow = { -readonly [Key in keyof Omit<CameraRigFollowOptions,'view'>]-?: CameraRigFollowOptions[Key] } & {view?:Required<CameraFollowViewOptions>};
type RigMemory = {
  perspective:CameraPerspective;firstPersonPitchRadians:number;thirdPersonNear:number|undefined;
  mode: CameraRigState['mode']; follow: Follow | undefined; yawRadians: number;
  zoomDistanceMeters: number; transitionElapsedSeconds: number;
  transitionPosition: THREE.Vector3; transitionQuaternion: THREE.Quaternion;
  framingRotation: THREE.Quaternion; smoothedSubject: THREE.Vector3;
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
  return { perspective:'third-person',firstPersonPitchRadians:0,thirdPersonNear:undefined,mode: 'authored', follow: undefined, yawRadians: 0, zoomDistanceMeters: 0, transitionElapsedSeconds: 0,
    transitionPosition: new THREE.Vector3(), transitionQuaternion: new THREE.Quaternion(), framingRotation: new THREE.Quaternion(),
    smoothedSubject: new THREE.Vector3(), safeArmDistanceMeters: undefined, actualArmDistanceMeters: undefined,
    obstructionEntityId: undefined, collisionPhase: undefined, resolvedTarget: undefined };
}
function copyMemory(m: RigMemory): RigMemory {
  return { ...m, follow: m.follow ? { ...m.follow,...(m.follow.view?{view:{...m.follow.view,eyeOffsetLocalMetersXYZ:[...m.follow.view.eyeOffsetLocalMetersXYZ] as Vec3}}:{}) } : undefined, transitionPosition: m.transitionPosition.clone(),
    transitionQuaternion: m.transitionQuaternion.clone(), framingRotation: m.framingRotation.clone(), smoothedSubject: m.smoothedSubject.clone(), resolvedTarget: m.resolvedTarget?.clone() };
}

/** The sole optional pose writer. World owns input, physics and the fixed clock. */
export class ThreeCameraRig {
  private memory: RigMemory = initialMemory();
  private readonly decollider = new CameraCollisionSolver((from,to,radius) => this.castCameraArm(from,to,radius));
  private solveTick = 0;
  private initial: { camera: THREE.Camera; parent: THREE.Object3D | null; memory: RigMemory; collision: CameraHardDecolliderTransactionStateV1; solveTick: number } | undefined;
  constructor(
    private readonly camera: THREE.Camera,
    private readonly castCameraArm: PhysicsPort['castCameraArm'],
    private readonly targetPosition: (entityId: string) => Vec3 | undefined,
    private readonly subjectBody?: (entityId: string) => CameraSubjectBody | undefined,
    private readonly targetTransform?: (entityId:string)=>{matrixWorld:THREE.Matrix4;frontYawRadians:number}|undefined,
  ) {}
  get targetEntityId(): string | undefined { return this.memory.follow?.targetEntityId; }
  get mode(): CameraRigState['mode'] { return this.memory.mode; }
  get perspective():CameraPerspective{return this.memory.perspective;}
  get keyboardToggleEnabled():boolean{return this.mode!=='authored'&&!!this.memory.follow?.view?.keyboardToggleEnabled;}
  get desiredYawRadians(): number {
    const follow = this.memory.follow;
    if(this.perspective==='first-person'&&this.mode!=='authored')return this.memory.yawRadians;
    if (follow && this.mode !== 'authored' && follow.framingMode === 'target') return this.memory.yawRadians;
    const direction = follow && this.mode !== 'authored'
      ? new THREE.Vector3(0, 0, -1).applyQuaternion(this.framedRotation(follow))
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
    if (framingMode === 'preserve-opening' && (options.distanceMeters !== undefined || options.pitchRadians !== undefined)) throw new Error('WORLD_CAMERA_OPTION_INVALID: preserve-opening cannot override distanceMeters or pitchRadians');
    const height = bounded(options.targetHeightMeters ?? (body ? body.heightMeters * .65 : 1.3), -10_000, 10_000, 'targetHeightMeters');
    const target = subject.clone().add(new THREE.Vector3(0, height, 0));
    let view:Required<CameraFollowViewOptions>|undefined;
    if(options.view!==undefined){
      const v=options.view;
      if(!v||!Array.isArray(v.eyeOffsetLocalMetersXYZ)||v.eyeOffsetLocalMetersXYZ.length!==3||!v.eyeOffsetLocalMetersXYZ.every(Number.isFinite))throw new Error('WORLD_CAMERA_OPTION_INVALID: eyeOffsetLocalMetersXYZ');
      if(!(this.camera instanceof THREE.PerspectiveCamera))throw new Error('WORLD_CAMERA_PERSPECTIVE_REQUIRED');
      const defaultPerspective=v.defaultPerspective??'third-person',keyboardToggleEnabled=v.keyboardToggleEnabled??false;
      if(!['first-person','third-person'].includes(defaultPerspective)||typeof keyboardToggleEnabled!=='boolean')throw new Error('WORLD_CAMERA_OPTION_INVALID: view');
      view={eyeOffsetLocalMetersXYZ:[v.eyeOffsetLocalMetersXYZ[0],v.eyeOffsetLocalMetersXYZ[1],v.eyeOffsetLocalMetersXYZ[2]],defaultPerspective,keyboardToggleEnabled};
    }
    const follow: Follow = {
      targetEntityId: options.targetEntityId, framingMode,
      ...(view?{view}:{}),
      followHalfLifeSeconds: bounded(options.followHalfLifeSeconds ?? options.targetHalfLifeSeconds ?? FOLLOW_CAMERA_DEFAULTS.followHalfLifeSeconds, 0, 10, 'followHalfLifeSeconds'),
      distanceMeters: bounded(options.distanceMeters ?? FOLLOW_CAMERA_DEFAULTS.distanceMeters, .05, 10_000, 'distanceMeters'),
      targetHeightMeters: height,
      pitchRadians: bounded(options.pitchRadians ?? FOLLOW_CAMERA_DEFAULTS.pitchRadians, -Math.PI / 2, Math.PI / 2, 'pitchRadians'),
      activateOnInput: options.activateOnInput ?? FOLLOW_CAMERA_DEFAULTS.activateOnInput,
      transitionSeconds: bounded(options.transitionSeconds ?? FOLLOW_CAMERA_DEFAULTS.transitionSeconds, 0, 10, 'transitionSeconds'),
      rotationSpeedRadiansPerSecond: bounded(options.rotationSpeedRadiansPerSecond ?? FOLLOW_CAMERA_DEFAULTS.rotationSpeedRadiansPerSecond, .001, 100, 'rotationSpeedRadiansPerSecond'),
      collisionRadiusMeters: bounded(options.collisionRadiusMeters ?? FOLLOW_CAMERA_DEFAULTS.collisionRadiusMeters, .001, 10, 'collisionRadiusMeters'),
      recoveryHalfLifeSeconds: bounded(options.recoveryHalfLifeSeconds ?? (framingMode === 'preserve-opening' ? FOLLOW_CAMERA_DEFAULTS.openingRecoveryHalfLifeSeconds : FOLLOW_CAMERA_DEFAULTS.targetRecoveryHalfLifeSeconds), .001, 10, 'recoveryHalfLifeSeconds'),
      maximumRecoveryMetersPerSecond: bounded(options.maximumRecoveryMetersPerSecond ?? FOLLOW_CAMERA_DEFAULTS.maximumRecoveryMetersPerSecond, .001, 1000, 'maximumRecoveryMetersPerSecond'),
      targetHalfLifeSeconds: bounded(options.targetHalfLifeSeconds ?? FOLLOW_CAMERA_DEFAULTS.targetHalfLifeSeconds, 0, 10, 'targetHalfLifeSeconds'),
    };
    if (typeof follow.activateOnInput !== 'boolean') throw new Error('WORLD_CAMERA_OPTION_INVALID: activateOnInput');
    const opening = framingMode === 'preserve-opening' ? this.readOpening(target) : undefined;
    if (opening) { follow.distanceMeters = opening.distanceMeters; follow.pitchRadians = opening.pitchRadians; }
    const direction = this.camera.getWorldDirection(new THREE.Vector3());
    this.restoreNear();
    this.memory = { ...initialMemory(), mode: follow.activateOnInput ? 'follow-pending' : 'follow', follow,
      yawRadians: opening?.yawRadians ?? Math.atan2(-direction.x, -direction.z),
      zoomDistanceMeters: follow.distanceMeters, transitionPosition: position, transitionQuaternion: rotation,
      framingRotation: opening?.framingRotation ?? new THREE.Quaternion(), smoothedSubject: subject };
    this.decollider.reset(); this.solveTick = 0;
    if(view?.defaultPerspective==='first-person')this.setPerspective('first-person');
  }
  setPerspective(perspective:CameraPerspective):void {
    if(!['first-person','third-person'].includes(perspective))throw new Error('WORLD_CAMERA_PERSPECTIVE_INVALID');
    const follow=this.memory.follow;
    if(!follow||this.mode==='authored')throw new Error('WORLD_CAMERA_FOLLOW_REQUIRED');
    if(perspective==='first-person'&&!follow.view)throw new Error('WORLD_CAMERA_EYE_REQUIRED');
    if(perspective===this.perspective)return;
    this.restoreNear();
    this.memory.perspective=perspective;this.memory.mode='follow';this.decollider.reset();this.solveTick=0;
    if(perspective==='first-person'){
      if(this.camera instanceof THREE.PerspectiveCamera)this.memory.thirdPersonNear=this.camera.near;
      const transform=this.targetTransform?.(follow.targetEntityId);
      if(transform){
        const front=new THREE.Vector3(-Math.sin(transform.frontYawRadians),0,-Math.cos(transform.frontYawRadians)).transformDirection(transform.matrixWorld);
        this.memory.yawRadians=Math.atan2(-front.x,-front.z);
      }
      this.memory.firstPersonPitchRadians=0;
    }else{
      this.memory.smoothedSubject.copy(this.subject(follow.targetEntityId));
      this.memory.zoomDistanceMeters=follow.distanceMeters;this.memory.transitionElapsedSeconds=follow.transitionSeconds;
    }
    this.update(0);
  }
  private restoreNear():void {
    if(this.perspective==='first-person'&&this.camera instanceof THREE.PerspectiveCamera&&this.memory.thirdPersonNear!==undefined){this.camera.near=this.memory.thirdPersonNear;this.camera.updateProjectionMatrix();this.memory.thirdPersonNear=undefined;}
  }
  private firstPersonEye(follow:Follow):THREE.Vector3 {
    const eye=new THREE.Vector3(...follow.view!.eyeOffsetLocalMetersXYZ),transform=this.targetTransform?.(follow.targetEntityId);
    if(transform)eye.applyMatrix4(transform.matrixWorld);else eye.add(this.subject(follow.targetEntityId));
    if(!eye.toArray().every(Number.isFinite))throw new Error('WORLD_CAMERA_EYE_INVALID');return eye;
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
    if(this.perspective==='first-person'){
      this.memory.yawRadians+=yaw;this.memory.firstPersonPitchRadians=THREE.MathUtils.clamp(this.memory.firstPersonPitchRadians+pitch,MIN_PITCH_RADIANS,MAX_PITCH_RADIANS);return;
    }
    if (this.mode === 'follow-pending' && (input.activate || yaw || pitch || zoom)) {
      // Setup may move the subject or edit the authored camera while follow is pending.
      // Validate the final pose before handing authority to the rig.
      if (follow.framingMode === 'preserve-opening') {
        const subject = this.subject(follow.targetEntityId), target = subject.clone().add(new THREE.Vector3(0, follow.targetHeightMeters, 0));
        const opening = this.readOpening(target);
        this.memory.yawRadians = opening.yawRadians;
        follow.distanceMeters = opening.distanceMeters; follow.pitchRadians = opening.pitchRadians;
        this.memory.framingRotation.copy(opening.framingRotation);
        this.memory.zoomDistanceMeters = opening.distanceMeters; this.memory.smoothedSubject.copy(subject);
      }
      this.memory.mode = 'follow'; this.memory.transitionElapsedSeconds = 0;
      this.camera.getWorldPosition(this.memory.transitionPosition); this.camera.getWorldQuaternion(this.memory.transitionQuaternion);
    }
    this.memory.yawRadians += yaw;
    if (pitch !== 0) follow.pitchRadians = follow.framingMode === 'preserve-opening'
      ? THREE.MathUtils.clamp(follow.pitchRadians + pitch, -Math.PI / 2, Math.PI / 2)
      : THREE.MathUtils.clamp(follow.pitchRadians + pitch, MIN_PITCH_RADIANS, MAX_PITCH_RADIANS);
    // An activation or empty input must not clamp a zero-length, distant or polar opening.
    if (zoom !== 0) follow.distanceMeters = THREE.MathUtils.clamp(follow.distanceMeters + zoom, .05,
      follow.framingMode === 'preserve-opening' ? Math.max(10_000, follow.distanceMeters) : 10_000);
  }
  /** Once after shared physics, with no rendering or independent timer. */
  update(dt: number): void {
    validDeltaSeconds(dt); const follow = this.memory.follow; if (!follow || this.mode !== 'follow') return;
    const subject = this.subject(follow.targetEntityId), body = this.subjectBody?.(follow.targetEntityId);
    if(this.perspective==='first-person'){
      const pivot=subject.clone().add(new THREE.Vector3(0,body?body.heightMeters*.5:follow.targetHeightMeters,0));
      const solved=this.solveCollision(pivot,this.firstPersonEye(follow),follow,dt);
      this.applyWorldPose(solved.eye,this.orbitRotation(this.memory.yawRadians,this.memory.firstPersonPitchRadians));
      if(this.camera instanceof THREE.PerspectiveCamera&&this.camera.near!==.035){this.camera.near=.035;this.camera.updateProjectionMatrix();}
      this.memory.smoothedSubject.copy(subject);this.memory.resolvedTarget=solved.target;
      this.memory.actualArmDistanceMeters=0;this.memory.safeArmDistanceMeters=0;
      this.memory.obstructionEntityId=solved.entityId;this.memory.collisionPhase=solved.phase;return;
    }
    const priorSubject = this.memory.smoothedSubject;
    const halfLife = follow.framingMode === 'preserve-opening' ? follow.followHalfLifeSeconds : follow.targetHalfLifeSeconds;
    if (follow.framingMode === 'target' && priorSubject.distanceTo(subject) > Math.max(4, follow.distanceMeters * .5)) { priorSubject.copy(subject); this.decollider.reset(); }
    else for (const axis of ['x', 'y', 'z'] as const) priorSubject[axis] = exponential(priorSubject[axis], subject[axis], dt, halfLife);
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
    let rotation = follow.framingMode === 'preserve-opening' ? this.framedRotation(follow) : this.lookRotation(desiredEye, target);
    // Never alias the destination with the slerpQuaternions output object.
    if (blend < 1) rotation = this.memory.transitionQuaternion.clone().slerp(rotation, blend);
    const solved = this.solveCollision(physicalTarget, candidateEye, follow, dt);
    const eye = solved.eye;
    if (follow.framingMode === 'target' && eye.distanceToSquared(candidateEye) > 1e-10) {
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
    try {
      const solved=this.decollider.solve({ target:tuple(target),eye:tuple(desiredEye),
        current:tuple(this.camera.getWorldPosition(new THREE.Vector3())),radius:follow.collisionRadiusMeters },{
        authorityTick:++this.solveTick,deltaSeconds:dt,clearHoldSeconds:RELEASE_DELAY_SECONDS,
        recoveryHalfLifeSeconds:follow.recoveryHalfLifeSeconds,maximumRecoveryMetersPerSecond:follow.maximumRecoveryMetersPerSecond,
        releaseDeadbandMeters:RELEASE_DEADBAND_METERS,
      });
      return {eye:new THREE.Vector3(...solved.position),target:new THREE.Vector3(...solved.target),
        safeDistance:solved.safeDistance,entityId:solved.entityId,phase:solved.phase};
    } catch(error) {
      if(error instanceof Error && error.message==='CAMERA_COLLISION_PROBE_INVALID')throw new Error('WORLD_CAMERA_PROBE_INVALID');
      if(error instanceof Error && error.message==='CAMERA_COLLISION_NO_SAFE_POSE')throw new Error('WORLD_CAMERA_NO_SAFE_POSE');
      throw error;
    }
  }
  useAuthoredCamera(): THREE.Camera { this.restoreNear();this.memory = initialMemory(); this.decollider.reset(); this.solveTick = 0; return this.camera; }
  sealInitialState(): void {
    if (this.initial) return; this.camera.updateWorldMatrix(true, false);
    this.initial = { camera: this.camera.clone(), parent: this.camera.parent, memory: copyMemory(this.memory), collision: this.decollider.captureTransactionState(), solveTick: this.solveTick };
  }
  reset(): void {
    this.sealInitialState(); const initial = this.initial!;
    if (initial.parent) initial.parent.add(this.camera); else this.camera.removeFromParent();
    this.camera.copy(initial.camera, false); this.camera.updateWorldMatrix(true, false);
    this.memory = copyMemory(initial.memory); this.decollider.restoreTransactionState(initial.collision); this.solveTick = initial.solveTick;
    if(this.memory.follow?.view)this.setPerspective(this.memory.follow.view.defaultPerspective);
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
      ...(this.memory.collisionPhase === undefined ? {} : { collisionPhase: this.memory.collisionPhase }),
      ...(follow?.view?{perspective:this.perspective,view:{...follow.view,eyeOffsetLocalMetersXYZ:[...follow.view.eyeOffsetLocalMetersXYZ] as Vec3},
        ...(this.perspective==='first-person'?{desiredPositionWorldMetersXYZ:tuple(this.firstPersonEye(follow)),desiredArmDistanceMeters:0,desiredPitchRadians:this.memory.firstPersonPitchRadians}:{})}:{}) };
  }
  private transitionProgress(follow: Follow): number { return follow.framingMode === 'preserve-opening' || follow.transitionSeconds === 0 ? 1 : Math.min(1, this.memory.transitionElapsedSeconds / follow.transitionSeconds); }
  private subject(id: string): THREE.Vector3 {
    const value = this.targetPosition(id); if (!value || value.length !== 3 || !value.every(Number.isFinite)) throw new Error(`WORLD_CAMERA_TARGET_INVALID: ${id}`);
    return new THREE.Vector3(...value);
  }
  private armDirection(follow: Follow): THREE.Vector3 { const cosine = Math.cos(follow.pitchRadians); return new THREE.Vector3(Math.sin(this.memory.yawRadians) * cosine, Math.sin(follow.pitchRadians), Math.cos(this.memory.yawRadians) * cosine); }
  private orbitRotation(yawRadians: number, pitchRadians: number): THREE.Quaternion {
    // Full authored roll and off-center orientation are relative to a stable world-up frame,
    // including at the orbit poles and after a caller changes camera.up.
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitchRadians, yawRadians, 0, 'YXZ'));
  }
  private framedRotation(follow: Follow): THREE.Quaternion {
    return this.orbitRotation(this.memory.yawRadians, follow.pitchRadians).multiply(this.memory.framingRotation);
  }
  private readOpening(target: THREE.Vector3): { distanceMeters: number; yawRadians: number; pitchRadians: number; framingRotation: THREE.Quaternion } {
    const position = this.camera.getWorldPosition(new THREE.Vector3()), rotation = this.camera.getWorldQuaternion(new THREE.Quaternion());
    if (![...position.toArray(), ...rotation.toArray()].every(Number.isFinite)) throw new Error('WORLD_CAMERA_POSE_INVALID');
    const offset = position.clone().sub(target), distanceMeters = offset.length();
    if (!Number.isFinite(distanceMeters)) throw new Error('WORLD_CAMERA_POSE_INVALID');
    const direction = this.camera.getWorldDirection(new THREE.Vector3());
    const yawRadians = distanceMeters > 1e-12 ? Math.atan2(offset.x, offset.z) : Math.atan2(-direction.x, -direction.z);
    const pitchRadians = distanceMeters > 1e-12 ? Math.asin(THREE.MathUtils.clamp(offset.y / distanceMeters, -1, 1)) : 0;
    const framingRotation = this.orbitRotation(yawRadians, pitchRadians).invert().multiply(rotation);
    return { distanceMeters, yawRadians, pitchRadians, framingRotation };
  }
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
