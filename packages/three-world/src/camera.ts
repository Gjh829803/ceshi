import {readCameraWorldPose} from './camera-observation';
import {FOLLOW_CAMERA_DEFAULTS,recenterCameraYaw} from './config/follow-camera';
import * as THREE from 'three';
import { CameraCollisionSolver, type CameraCollisionRequest, type CameraCollisionSolution, type CameraHardDecolliderTransactionStateV1 } from '@worldkit/camera-collision';
import type { CameraArmHit, PhysicsPort, Vec3 } from './engine-contracts.js';
import type {CameraFollowViewOptions,CameraPerspective,CameraOpening} from './contracts.js';
import type { CameraSubjectAdapter, CameraSubjectBody, CameraSubjectSample } from './camera-subject.js';
export type { CameraSubjectAdapter, CameraSubjectBody, CameraSubjectSample } from './camera-subject.js';

export type CameraRigFollowOptions = Readonly<{
  opening?:CameraOpening;
  headingFollow?:'fixed'|'vehicle';
  view?:CameraFollowViewOptions;
  targetEntityId: string;
  /** Without orbit values, follow adopts the current authored pose and framing. */
  framingMode?: 'preserve-opening' | 'target';
  /** Translation damping for preserve-opening framing. */
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
  headingFollow?:'fixed'|'vehicle';
  headingTargetYawRadians?:number|null;
  subjectEntityId?:string;
  perspective?:CameraPerspective;
  view?:Required<CameraFollowViewOptions>;
  mode: 'authored' | 'follow-pending' | 'follow';
  positionWorldMetersXYZ: Vec3;
  orientationWorldQuaternionXYZW: readonly [number, number, number, number];
  desiredPositionWorldMetersXYZ: Vec3 | null;
  desiredYawRadians: number | null;
  desiredPitchRadians: number | null;
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
type Follow = { -readonly [Key in keyof Omit<CameraRigFollowOptions,'view'|'opening'>]-?: CameraRigFollowOptions[Key] } & {view?:Required<CameraFollowViewOptions>; targetHeightFromSubject: boolean};
type RigMemory = {
  perspective:CameraPerspective;firstPersonPitchRadians:number;thirdPersonNear:number|undefined;
  mode: CameraRigState['mode']; follow: Follow | undefined; yawRadians: number;
  zoomDistanceMeters: number; transitionElapsedSeconds: number;
  transitionPosition: THREE.Vector3; transitionQuaternion: THREE.Quaternion;
  framingRotation: THREE.Quaternion; framingRollRadians:number; smoothedSubject: THREE.Vector3;
  safeArmDistanceMeters: number | undefined; actualArmDistanceMeters: number | undefined;
  obstructionEntityId: string | undefined; collisionPhase: CameraRigState['collisionPhase'];
  resolvedTarget: THREE.Vector3 | undefined;
  headingHoldSeconds:number;skipHeadingUpdate:boolean;headingTargetYawRadians:number|null;
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
    transitionPosition: new THREE.Vector3(), transitionQuaternion: new THREE.Quaternion(), framingRotation: new THREE.Quaternion(), framingRollRadians:0,
    smoothedSubject: new THREE.Vector3(), safeArmDistanceMeters: undefined, actualArmDistanceMeters: undefined,
    obstructionEntityId: undefined, collisionPhase: undefined, resolvedTarget: undefined,
    headingHoldSeconds:0,skipHeadingUpdate:true,headingTargetYawRadians:null };
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
    subject: CameraSubjectAdapter | ((entityId: string) => Vec3 | undefined),
    subjectBody?: (entityId: string) => CameraSubjectBody | undefined,
    targetTransform?: (entityId:string)=>{matrixWorld:THREE.Matrix4;frontYawRadians:number}|undefined,
  ) {
    this.subjectAdapter = typeof subject === 'function' ? {
      sample: (id) => {
        const position = subject(id); if (!position) return undefined;
        const body = subjectBody?.(id), transform = targetTransform?.(id);
        return { id, positionWorldMetersXYZ: position, ...(body ? { body } : {}), ...(transform ? { transform } : {}) };
      },
    } : subject;
  }
  private readonly subjectAdapter: CameraSubjectAdapter;
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
    const sample = this.subjectSample(options.targetEntityId), subject = new THREE.Vector3(...sample.positionWorldMetersXYZ), body = sample.body;
    const configuredCamera=options.opening?this.openingCamera(options.opening):this.camera;
    const position = configuredCamera.getWorldPosition(new THREE.Vector3()), rotation = configuredCamera.getWorldQuaternion(new THREE.Quaternion());
    const hasOrbit = options.distanceMeters !== undefined || options.targetHeightMeters !== undefined || options.pitchRadians !== undefined;
    const framingMode = options.framingMode ?? (options.opening?'preserve-opening':hasOrbit ? 'target' : 'preserve-opening');
    if(options.opening&&(framingMode!=='preserve-opening'||options.view?.defaultPerspective==='first-person'))throw new Error('WORLD_CAMERA_OPTION_INVALID: opening requires preserved third-person framing');
    const headingFollow=options.headingFollow??'fixed';
    if(!['fixed','vehicle'].includes(headingFollow))throw new Error('WORLD_CAMERA_OPTION_INVALID: headingFollow');
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
      headingFollow,
      targetEntityId: options.targetEntityId, framingMode, targetHeightFromSubject: options.targetHeightMeters === undefined,
      ...(view?{view}:{}),
      followHalfLifeSeconds: bounded(options.followHalfLifeSeconds ?? FOLLOW_CAMERA_DEFAULTS.followHalfLifeSeconds, 0, 10, 'followHalfLifeSeconds'),
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
    const opening = framingMode === 'preserve-opening' ? this.readOpening(target,configuredCamera) : undefined;
    if (opening) { follow.distanceMeters = opening.distanceMeters; follow.pitchRadians = opening.pitchRadians; }
    const direction = configuredCamera.getWorldDirection(new THREE.Vector3());
    this.restoreNear();
    if(options.opening){this.applyWorldPose(position,rotation);const camera=this.camera as THREE.PerspectiveCamera;camera.up.copy(configuredCamera.up);camera.fov=options.opening.fovDegrees;camera.updateProjectionMatrix();}
    this.memory = { ...initialMemory(), mode: follow.activateOnInput ? 'follow-pending' : 'follow', follow,
      yawRadians: opening?.yawRadians ?? Math.atan2(-direction.x, -direction.z),
      zoomDistanceMeters: follow.distanceMeters, transitionPosition: position, transitionQuaternion: rotation,
      framingRotation: opening?.framingRotation ?? new THREE.Quaternion(), framingRollRadians:opening?.rollRadians??0, smoothedSubject: subject,
      headingHoldSeconds:sample.heading?.recenterDelaySeconds??0 };
    this.decollider.reset(); this.solveTick = 0;
    if(view?.defaultPerspective==='first-person')this.setPerspective('first-person');
  }
  /** Change the follow subject without replaying initial orbit or view settings. */
  retarget(entityId: string): void {
    const previous = this.memory.follow;
    if (!previous || this.mode === 'authored') throw new Error('WORLD_CAMERA_FOLLOW_REQUIRED');
    if (typeof entityId !== 'string' || !entityId.trim()) throw new Error('WORLD_CAMERA_TARGET_REQUIRED');
    const sample = this.subjectSample(entityId), subject = new THREE.Vector3(...sample.positionWorldMetersXYZ);
    const height = previous.targetHeightFromSubject ? (sample.body ? sample.body.heightMeters * .65 : 1.3) : previous.targetHeightMeters;
    this.memory.follow = { ...previous, targetEntityId: entityId, targetHeightMeters: height };
    if(previous.framingMode==='preserve-opening'&&this.perspective==='third-person'){
      // Keep the established screen framing and user orbit. Reading an opening
      // from a retracted vehicle camera would save the dismounted actor off-screen.
      if(this.mode==='follow-pending'){
        const delta=subject.clone().sub(this.memory.smoothedSubject);delta.y+=height-previous.targetHeightMeters;
        this.applyWorldPose(this.camera.getWorldPosition(new THREE.Vector3()).add(delta),this.camera.getWorldQuaternion(new THREE.Quaternion()));
        this.memory.smoothedSubject.copy(subject);
      }else{
        // Begin the follow translation at the previous pivot, including a height change.
        this.memory.smoothedSubject.y+=previous.targetHeightMeters-height;
      }
    }
    this.camera.getWorldPosition(this.memory.transitionPosition);
    this.camera.getWorldQuaternion(this.memory.transitionQuaternion);
    this.memory.transitionElapsedSeconds = 0;
    this.memory.skipHeadingUpdate=true;this.memory.headingHoldSeconds=sample.heading?.recenterDelaySeconds??0;this.memory.headingTargetYawRadians=null;
    this.memory.resolvedTarget = undefined;
    this.memory.safeArmDistanceMeters = undefined; this.memory.actualArmDistanceMeters = undefined;
    this.memory.obstructionEntityId = undefined; this.memory.collisionPhase = undefined;
    this.decollider.reset(); this.solveTick = 0;
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
      const transform=this.subjectSample(follow.targetEntityId).transform;
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
  private firstPersonEye(follow:Follow, sample = this.subjectSample(follow.targetEntityId)):THREE.Vector3 {
    const eye=new THREE.Vector3(...follow.view!.eyeOffsetLocalMetersXYZ),transform=sample.transform;
    if(transform)eye.applyMatrix4(transform.matrixWorld);else eye.add(new THREE.Vector3(...sample.positionWorldMetersXYZ));
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
    if(yaw||pitch||zoom)this.memory.headingHoldSeconds=this.subjectSample(follow.targetEntityId).heading?.recenterDelaySeconds??0;
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
        this.memory.framingRollRadians=opening.rollRadians;
        this.memory.zoomDistanceMeters = opening.distanceMeters; this.memory.smoothedSubject.copy(subject);
      }
      this.memory.mode = 'follow'; this.memory.transitionElapsedSeconds = 0;
      this.memory.skipHeadingUpdate=true;
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
    const sample = this.subjectSample(follow.targetEntityId), subject = new THREE.Vector3(...sample.positionWorldMetersXYZ), body = sample.body;
    this.memory.headingTargetYawRadians=null;
    if(this.memory.skipHeadingUpdate)this.memory.skipHeadingUpdate=false;
    else if(this.memory.headingHoldSeconds>0)this.memory.headingHoldSeconds=Math.max(0,this.memory.headingHoldSeconds-dt);
    else if(follow.headingFollow==='vehicle'&&this.perspective==='third-person'&&sample.heading&&sample.heading.speedMetersPerSecond>.8){
      const heading=sample.heading;
      if([heading.backYawRadians,heading.speedMetersPerSecond,heading.recenterResponsePerSecond].every(Number.isFinite)&&heading.recenterResponsePerSecond>=0){
        this.memory.headingTargetYawRadians=heading.backYawRadians;
        this.memory.yawRadians=recenterCameraYaw(this.memory.yawRadians,heading.backYawRadians,heading.recenterResponsePerSecond,dt);
      }
    }
    if(this.perspective==='first-person'){
      const pivot=subject.clone().add(new THREE.Vector3(0,body?body.heightMeters*.5:follow.targetHeightMeters,0));
      const solved=this.solveCollision(pivot,this.firstPersonEye(follow,sample),follow,dt,sample);
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
    const solved = this.solveCollision(physicalTarget, candidateEye, follow, dt, sample);
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
  private solveCollision(target: THREE.Vector3, desiredEye: THREE.Vector3, follow: Follow, dt: number, sample: CameraSubjectSample): { eye: THREE.Vector3; target: THREE.Vector3; safeDistance: number; entityId: string | undefined; phase: CameraRigState['collisionPhase'] } {
    try {
      const solved=this.decollider.solve(this.collisionRequest({ target:tuple(target),eye:tuple(desiredEye),
        current:tuple(this.camera.getWorldPosition(new THREE.Vector3())),radius:follow.collisionRadiusMeters }, sample),{
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
  /** Display-only spatial projection. Does not consume input, advance time or write a pose. */
  projectCollision(request: CameraCollisionRequest, sample?: CameraSubjectSample): CameraCollisionSolution {
    const subject = sample ?? (this.targetEntityId ? this.subjectSample(this.targetEntityId) : undefined);
    return this.decollider.project(this.collisionRequest(request, subject));
  }
  private collisionRequest(request: CameraCollisionRequest, sample: CameraSubjectSample | undefined): CameraCollisionRequest {
    return sample && this.subjectAdapter.collisionRequest ? this.subjectAdapter.collisionRequest(request, sample) : request;
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
    const {position,rotation:quaternion,direction}=readCameraWorldPose(this.camera), follow = this.memory.follow;
    if(this.mode==='authored')return {mode:'authored',positionWorldMetersXYZ:tuple(position),orientationWorldQuaternionXYZW:[quaternion.x,quaternion.y,quaternion.z,quaternion.w],desiredPositionWorldMetersXYZ:null,desiredYawRadians:null,desiredPitchRadians:null};
    const subject = follow ? this.subject(follow.targetEntityId) : undefined;
    const target = follow ? this.memory.smoothedSubject.clone().add(new THREE.Vector3(0, follow.targetHeightMeters, 0)) : undefined;
    return { mode: this.mode, positionWorldMetersXYZ: tuple(position), orientationWorldQuaternionXYZW: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
      desiredPositionWorldMetersXYZ: tuple(follow && target ? target.clone().addScaledVector(this.armDirection(follow), follow.distanceMeters) : position),
      desiredYawRadians: this.desiredYawRadians, desiredPitchRadians: follow?.pitchRadians ?? Math.asin(THREE.MathUtils.clamp(-direction.y, -1, 1)),
      ...(follow ? { headingFollow:follow.headingFollow,headingTargetYawRadians:this.memory.headingTargetYawRadians,subjectEntityId:this.subjectSample(follow.targetEntityId).id,desiredArmDistanceMeters: follow.distanceMeters, framingMode: follow.framingMode, transitionProgressRatio: this.mode === 'follow-pending' ? 0 : this.transitionProgress(follow) } : {}),
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
  private subjectSample(id: string): CameraSubjectSample {
    const sample = this.subjectAdapter.sample(id), value = sample?.positionWorldMetersXYZ;
    if (!sample || typeof sample.id !== 'string' || !sample.id.trim() || !value || value.length !== 3 || !value.every(Number.isFinite)) throw new Error(`WORLD_CAMERA_TARGET_INVALID: ${id}`);
    if (sample.body && (![sample.body.heightMeters, sample.body.radiusMeters].every(Number.isFinite) || sample.body.heightMeters <= 0 || sample.body.radiusMeters <= 0)) throw new Error(`WORLD_CAMERA_BODY_INVALID: ${id}`);
    if (sample.transform && (!Number.isFinite(sample.transform.frontYawRadians) || sample.transform.matrixWorld.elements.length !== 16 || !sample.transform.matrixWorld.elements.every(Number.isFinite))) throw new Error(`WORLD_CAMERA_TRANSFORM_INVALID: ${id}`);
    return sample;
  }
  private subject(id: string): THREE.Vector3 {
    return new THREE.Vector3(...this.subjectSample(id).positionWorldMetersXYZ);
  }
  private armDirection(follow: Follow): THREE.Vector3 { const cosine = Math.cos(follow.pitchRadians); return new THREE.Vector3(Math.sin(this.memory.yawRadians) * cosine, Math.sin(follow.pitchRadians), Math.cos(this.memory.yawRadians) * cosine); }
  private orbitRotation(yawRadians: number, pitchRadians: number): THREE.Quaternion {
    // Full authored roll and off-center orientation are relative to a stable world-up frame,
    // including at the orbit poles and after a caller changes camera.up.
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitchRadians, yawRadians, 0, 'YXZ'));
  }
  private framedRotation(follow: Follow): THREE.Quaternion {
    const rotation=this.orbitRotation(this.memory.yawRadians, follow.pitchRadians).multiply(this.memory.framingRotation);
    // An off-axis target (for example after boarding) must not turn pitch orbit
    // into persistent horizon roll. Retain the view direction and authored roll.
    const view=new THREE.Euler().setFromQuaternion(rotation,'YXZ');
    view.z=this.memory.framingRollRadians;
    return rotation.setFromEuler(view);
  }
  private readOpening(target: THREE.Vector3,camera=this.camera): { distanceMeters: number; yawRadians: number; pitchRadians: number; framingRotation: THREE.Quaternion; rollRadians:number } {
    const position = camera.getWorldPosition(new THREE.Vector3()), rotation = camera.getWorldQuaternion(new THREE.Quaternion());
    if (![...position.toArray(), ...rotation.toArray()].every(Number.isFinite)) throw new Error('WORLD_CAMERA_POSE_INVALID');
    const offset = position.clone().sub(target), distanceMeters = offset.length();
    if (!Number.isFinite(distanceMeters)) throw new Error('WORLD_CAMERA_POSE_INVALID');
    const direction = camera.getWorldDirection(new THREE.Vector3());
    const yawRadians = distanceMeters > 1e-12 ? Math.atan2(offset.x, offset.z) : Math.atan2(-direction.x, -direction.z);
    const pitchRadians = distanceMeters > 1e-12 ? Math.asin(THREE.MathUtils.clamp(offset.y / distanceMeters, -1, 1)) : 0;
    const framingRotation = this.orbitRotation(yawRadians, pitchRadians).invert().multiply(rotation);
    return { distanceMeters, yawRadians, pitchRadians, framingRotation, rollRadians:new THREE.Euler().setFromQuaternion(rotation,'YXZ').z };
  }
  private lookRotation(eye: THREE.Vector3, target: THREE.Vector3): THREE.Quaternion { return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(eye, target, this.camera.up)); }
  private openingCamera(opening:CameraOpening):THREE.PerspectiveCamera {
    const vector=(v:unknown):v is Vec3=>Array.isArray(v)&&v.length===3&&v.every(x=>typeof x==='number'&&Number.isFinite(x));
    if(!(this.camera instanceof THREE.PerspectiveCamera)||!opening||!vector(opening.positionWorldMetersXYZ)||!vector(opening.lookAtWorldMetersXYZ)||opening.upWorldXYZ!==undefined&&!vector(opening.upWorldXYZ)||!Number.isFinite(opening.fovDegrees)||opening.fovDegrees<=0||opening.fovDegrees>=180)throw new Error('WORLD_CAMERA_OPENING_INVALID');
    const camera=this.camera.clone();camera.parent=null;camera.position.fromArray(opening.positionWorldMetersXYZ);camera.up.fromArray(opening.upWorldXYZ??[0,1,0]);
    const target=new THREE.Vector3(...opening.lookAtWorldMetersXYZ),direction=target.clone().sub(camera.position);
    if(direction.lengthSq()<1e-12||camera.up.lengthSq()<1e-12||direction.clone().normalize().cross(camera.up.clone().normalize()).lengthSq()<1e-12)throw new Error('WORLD_CAMERA_OPENING_INVALID');
    camera.lookAt(target);camera.fov=opening.fovDegrees;camera.updateProjectionMatrix();camera.updateMatrix();camera.updateWorldMatrix(false,false);return camera;
  }
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
