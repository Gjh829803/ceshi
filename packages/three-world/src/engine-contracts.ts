import type * as THREE from 'three';

export type Vec3 = readonly [number, number, number];
export type EntityRole = 'terrain' | 'obstacle' | 'decoration' | 'actor';
export type PhysicsOptions = Readonly<{
  gravityMetersPerSecondSquared?: Vec3;
  maximumColliderCount?: number;
  maximumTriangleCount?: number;
}>;
export type RigidPhysics = Readonly<{
  kind: 'fixed' | 'kinematic' | 'dynamic';
  shape?: 'trimesh' | 'convex-hull' | 'box';
  frictionRatio?: number;
  restitutionRatio?: number;
  massKilograms?: number;
}>;
export type CharacterOptions = Readonly<{
  heightMeters?: number;
  radiusMeters?: number;
  walkSpeedMetersPerSecond?: number;
  runSpeedMetersPerSecond?: number;
  jumpSpeedMetersPerSecond?: number;
  maximumStepHeightMeters?: number;
  minimumStepWidthMeters?: number;
  snapToGroundDistanceMeters?: number;
  maximumSlopeRadians?: number;
  collisionOffsetMeters?: number;
}>;
export type CharacterDrive = Readonly<{
  velocityMetersPerSecondXZ: readonly [number, number];
  jumpPressed?: boolean;
}> | Readonly<{ velocityWorldMetersPerSecondXYZ: Vec3; applyGravity: boolean }>;
export type PhysicsEntityState = Readonly<{
  id: string;
  positionMetersXYZ: Vec3;
  velocityMetersPerSecondXYZ: Vec3;
  isGrounded: boolean;
  collisionEntityIds: readonly string[];
}>;
export type PhysicsAudit = Readonly<{
  engine: 'rapier';
  entityCount: number;
  colliderCount: number;
  triangleCount: number;
  entities: readonly Readonly<{ id: string; kind: string; colliderCount: number; triangleCount: number }>[];
  diagnostics: readonly Readonly<{ code: string; entityId?: string; message: string }>[];
}>;
export type PhysicsCandidate = Readonly<{kind:'rigid';id:string;object:THREE.Object3D;options:RigidPhysics}>|Readonly<{kind:'character';id:string;object:THREE.Object3D;options?:CharacterOptions}>;
export type CameraArmHit = Readonly<{
  distanceMeters: number;
  colliderEntityId?: string;
  normalWorldXYZ?: Vec3;
  hitPositionWorldMetersXYZ?: Vec3;
  startedOverlapping?: boolean;
  penetrationDepthMeters?: number;
}>;
export interface PhysicsPort {
  validateBatch(candidates:readonly PhysicsCandidate[],removedEntityIds?:readonly string[]):void;
  addRigid(id: string, object: THREE.Object3D, options: RigidPhysics): void;
  addCharacter(id: string, object: THREE.Object3D, options?: CharacterOptions): void;
  remove(id: string): void;
  refresh(id: string): void;
  refreshMany(ids: readonly string[]): void;
  setEnabled(id: string, enabled: boolean): void;
  teleport(id: string, positionMetersXYZ: Vec3): void;
  applyImpulse(id: string, impulseNewtonSecondsXYZ: Vec3): void;
  step(deltaSeconds: number, drives: Readonly<Record<string, CharacterDrive>>): void;
  state(id: string): PhysicsEntityState | undefined;
  castCameraArm(targetMetersXYZ: Vec3, desiredEyeMetersXYZ: Vec3, radiusMeters: number): CameraArmHit;
  probe(originMetersXYZ: Vec3, directionWorldXYZ: Vec3, maximumDistanceMeters: number, excludeEntityId?: string): { entityId: string; distanceMeters: number; normalWorldXYZ: Vec3 } | null;
  audit(): PhysicsAudit;
  reset(): void;
  dispose(): void;
}
export type AssetDefinition = Readonly<{
  id: string;
  displayName: string;
  uri: string;
  sha256: string;
  byteLength: number;
  selectedNodeIndices?: readonly number[];
  recommendedBody?: Readonly<{heightMeters:number;radiusMeters:number}> | null;
  locomotionBindingIds?: readonly string[];
  rootTransform: Readonly<{ positionMetersXYZ: Vec3; rotationEulerRadiansXYZ: Vec3; scaleXYZ: Vec3 }>;
  actions: Readonly<Record<string, Readonly<{ clipName: string; loop: boolean; blendSeconds: number; timeScale: number }>>>;
  limitations: readonly string[];
}>;
export interface AssetInstance {
  object: THREE.Group;
  clips: readonly THREE.AnimationClip[];
  mixer: THREE.AnimationMixer;
  readonly currentActionId?: string | undefined;
  readonly currentClipName?: string | undefined;
  readonly actionIds: readonly string[];
  readonly isActionComplete: boolean;
  readonly timeSeconds: number;
  play(actionId: string, options?: {playback:'once'|'loop'}): void;
  update(deltaSeconds: number): void;
  dispose(): void;
}
export type EntityOptions = Readonly<{
  id: string;
  object: THREE.Object3D;
  role?: EntityRole;
  name?: string;
  tags?: readonly string[];
  appearancePrompt?: string;
  physics?: RigidPhysics | Readonly<{ kind: 'none' }>;
  frontYawRadians?: number;
}>;
export type CharacterEntityOptions = EntityOptions & Readonly<{
  character?: CharacterOptions;
  asset?: AssetInstance;
}>;
export type WorldInput = Readonly<{
  training?:import('./training/simulation').Input;
  moveXRatio?: number;
  moveZRatio?: number;
  moveYRatio?: number;
  cameraYawRatio?: number;
  cameraPitchRatio?: number;
  run?: boolean;
  jump?: boolean;
  jumpPressed?: boolean;
  interact?: boolean;
  interactPressed?: boolean;
  cameraTogglePressed?: boolean;
}>;
export type EntityState = Readonly<{
  id: string;
  name: string;
  role: EntityRole;
  tags: readonly string[];
  positionMetersXYZ: Vec3;
  rotationEulerRadiansXYZ: Vec3;
  scaleXYZ: Vec3;
  visible: boolean;
  actionId?: string;
  clipName?: string;
  parentEntityId?: string;
  physics?: PhysicsEntityState;
}>;
export type WorldSnapshot = Readonly<{
  schemaVersion: 1;
  simulationTick: number;
  simulationSeconds: number;
  revision: number;
  isRunning: boolean;
  controlledEntityId?: string;
  entities: readonly EntityState[];
  errors: readonly Readonly<{ code: string; message: string; simulationTick: number; entityId?: string }>[];
}>;
/** Minimal common observer for raw Three and SDK worlds. Host owns evaluation. */
export interface WorldObservation {
 /** Host-only synchronous capture transaction at the exact current fixed sample. */
 withPresentation?<T>(work:()=>T,options?:{readonly view?:'world'|'object'}):T;
  readonly ready: boolean;
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  readonly renderer: THREE.WebGLRenderer;
  readonly player: THREE.Object3D;
  readonly targets: Readonly<Record<string, THREE.Object3D>>;
  /** Local semantic front rotates -Z around +Y, then follows the target's world quaternion. */
  readonly targetFrontYawRadiansById?: Readonly<Record<string, number>>;
  startLive(): void | Promise<void>;
  stopLive(): void | Promise<void>;
  reset(): void | Promise<void>;
  snapshot?(): WorldSnapshot;
  inspect?(): unknown;
  capabilities?(): unknown;
  execute?(command: WorldCommand): WorldCommandResult;
}
export type WorldCommandResult = { status: 'applied' | 'rejected'; revision: number; error?: { code: string; message: string } };
export type WorldCommand =
  | Readonly<{ type: 'entity.set-visible'; entityId: string; visible: boolean }>
  | Readonly<{ type: 'entity.set-scale'; entityId: string; scaleXYZ: Vec3 }>
  | Readonly<{ type: 'entity.set-position'; entityId: string; positionMetersXYZ: Vec3 }>
  | Readonly<{ type: 'entity.despawn'; entityId: string }>
  | Readonly<{ type: 'entity.spawn'; prototypeId: string; entityId: string; positionMetersXYZ: Vec3 }>
  | Readonly<{ type: 'entity.attach'; childEntityId: string; parentEntityId: string; positionMetersXYZ?: Vec3 }>
  | Readonly<{ type: 'entity.play-action'; entityId: string; actionId: string }>
  | Readonly<{ type: 'entity.apply-impulse'; entityId: string; impulseNewtonSecondsXYZ: Vec3 }>
  | Readonly<{ type: 'actor.move-to'; entityId: string; targetPositionMetersXYZ: Vec3; run?: boolean }>
  | Readonly<{ type: 'actor.follow'; entityId: string; targetEntityId: string; distanceMeters?: number }>
  | Readonly<{ type: 'actor.stop'; entityId: string }>;
