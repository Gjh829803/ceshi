import * as THREE from 'three';
import RAPIER, { type Collider, type ColliderDesc, type KinematicCharacterController, type RigidBody, type World } from '@dimforge/rapier3d-compat';
import type { CharacterDrive, CharacterOptions, PhysicsAudit, PhysicsEntityState, PhysicsOptions, PhysicsPort, RigidPhysics, Vec3 } from './contracts.js';
import { extractCollisionGeometry, finiteVector, geometryError, geometrySignature, isWorldVisible, worldPose, type GeometrySnapshot, type WorldPose } from './geometry.js';

export const DEFAULT_CHARACTER_OPTIONS: Required<CharacterOptions> = Object.freeze({
  heightMeters: 1.8, radiusMeters: .35, walkSpeedMetersPerSecond: 2.4, runSpeedMetersPerSecond: 4.8,
  jumpSpeedMetersPerSecond: 5, maximumStepHeightMeters: .3, minimumStepWidthMeters: .15,
  snapToGroundDistanceMeters: .35, maximumSlopeRadians: Math.PI / 4, collisionOffsetMeters: .015,
});
let initialization: Promise<void> | undefined;
type LocalPose = { position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3; visible: boolean; matrix: THREE.Matrix4; matrixAutoUpdate: boolean };
type CharacterState = { controller: KinematicCharacterController; settings: Required<CharacterOptions>; verticalVelocity: number; grounded: boolean; collisions: string[]; scale: THREE.Vector3 };
type Entity = {
  id: string; object: THREE.Object3D; kind: RigidPhysics['kind'] | 'character'; body: RigidBody; colliders: Collider[];
  geometry?: GeometrySnapshot; options?: RigidPhysics; character?: CharacterState;
  initial: { local: LocalPose; pose: WorldPose; geometry?: GeometrySnapshot };
};
type Plan = { pose: WorldPose; descriptors: ColliderDesc[]; triangleCount: number; geometry?: GeometrySnapshot; settings?: Required<CharacterOptions>; scale?: THREE.Vector3 };
const vec = (value: THREE.Vector3 | Readonly<{ x: number; y: number; z: number }>): Vec3 => Object.freeze([value.x, value.y, value.z]);
const localPose = (object: THREE.Object3D): LocalPose => ({ position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone(), visible: object.visible, matrix: object.matrix.clone(), matrixAutoUpdate: object.matrixAutoUpdate });
const copyPose = (pose: WorldPose): WorldPose => ({ position: pose.position.clone(), rotation: pose.rotation.clone(), scale: pose.scale.clone() });
function restoreLocal(object: THREE.Object3D, pose: LocalPose): void { object.position.copy(pose.position); object.quaternion.copy(pose.quaternion); object.scale.copy(pose.scale); object.visible = pose.visible; object.matrixAutoUpdate = pose.matrixAutoUpdate; object.matrix.copy(pose.matrix); if (object.matrixAutoUpdate) object.updateMatrix(); object.matrixWorldNeedsUpdate = true; object.updateWorldMatrix(true, true); }
function setLocalPosition(object: THREE.Object3D, position: THREE.Vector3): void { object.position.copy(position); if (object.matrixAutoUpdate) object.updateMatrix(); else object.matrix.setPosition(position); object.matrixWorldNeedsUpdate = true; object.updateWorldMatrix(true, true); }
function validateNumber(value: unknown, minimum: number, label: string, inclusive = true): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isFinite(Math.fround(value)) || (inclusive ? value < minimum : value <= minimum)) geometryError('PHYSICS_OPTION_INVALID', `${label} is outside its physical range.`);
}
function validateVec(value: readonly number[], label: string): void { if (!Array.isArray(value) || !finiteVector(value)) geometryError('PHYSICS_VECTOR_INVALID', `${label} must contain three finite numbers.`); }

/** One physics world and one solve per tick. Three owns authored geometry; Rapier owns resolved body motion. */
export class ThreePhysics implements PhysicsPort {
  private readonly world: World;
  private readonly entries = new Map<string, Entity>();
  private readonly colliderOwners = new Map<number, string>();
  private readonly gravity: Vec3;
  private readonly maximumColliders: number;
  private readonly maximumTriangles: number;
  private disposed = false;

  static async create(options: PhysicsOptions = {}): Promise<ThreePhysics> {
    initialization ??= RAPIER.init();
    await initialization;
    return new ThreePhysics(options);
  }
  private constructor(options: PhysicsOptions) {
    this.gravity = Object.freeze([...(options.gravityMetersPerSecondSquared ?? [0, -9.81, 0])]) as Vec3;
    validateVec(this.gravity, 'gravityMetersPerSecondSquared');
    this.maximumColliders = options.maximumColliderCount ?? 4096;
    this.maximumTriangles = options.maximumTriangleCount ?? 1_000_000;
    if (!Number.isSafeInteger(this.maximumColliders) || this.maximumColliders < 1 || !Number.isSafeInteger(this.maximumTriangles) || this.maximumTriangles < 1) geometryError('PHYSICS_BUDGET_INVALID', 'Physics budgets must be positive integers.');
    this.world = new RAPIER.World({ x: this.gravity[0], y: this.gravity[1], z: this.gravity[2] });
  }
  private live(): void { if (this.disposed) geometryError('PHYSICS_DISPOSED', 'The physics world has been disposed.'); }
  private entry(id: string): Entity { this.live(); const entry = this.entries.get(id); if (!entry) geometryError('PHYSICS_ENTITY_UNKNOWN', `Unknown physics entity: ${id}`); return entry; }
  private newIdentity(id: string, object: THREE.Object3D): void {
    this.live();
    if (typeof id !== 'string' || !id.trim() || id.length > 128 || this.entries.has(id)) geometryError('PHYSICS_ENTITY_ID_INVALID', 'The physics entity id must be nonempty and unique.');
    if (!(object instanceof THREE.Object3D) || [...this.entries.values()].some(entry => entry.object === object)) geometryError('PHYSICS_OBJECT_INVALID', 'Register a Three Object3D only once.');
  }
  private budget(plans: readonly { previous?: Entity; plan: Plan }[]): void {
    const replaced = new Set(plans.flatMap(value => value.previous ? [value.previous.id] : []));
    let colliders = 0, triangles = 0;
    for (const entry of this.entries.values()) if (!replaced.has(entry.id)) { colliders += entry.colliders.length; triangles += entry.geometry?.geometries.reduce((sum, geometry) => sum + geometry.triangleCount, 0) ?? 0; }
    for (const { plan } of plans) { colliders += plan.descriptors.length; triangles += plan.triangleCount; }
    if (colliders > this.maximumColliders) geometryError('PHYSICS_COLLIDER_BUDGET_EXCEEDED', 'The operation exceeds the world collider budget.');
    if (triangles > this.maximumTriangles) geometryError('PHYSICS_TRIANGLE_BUDGET_EXCEEDED', 'The operation exceeds the world triangle budget.');
  }
  private validateDynamicParent(object: THREE.Object3D): void {
    if (object.parent) {
      const scale = worldPose(object.parent).scale;
      if (scale.x <= 0 || Math.abs(scale.x - scale.y) > 1e-6 || Math.abs(scale.x - scale.z) > 1e-6) geometryError('PHYSICS_DYNAMIC_PARENT_SCALE_UNSUPPORTED', 'A dynamic body needs an unscaled or uniformly scaled parent so its rotation can be projected without shear.');
    }
    const pose = worldPose(object), reconstructed = new THREE.Matrix4().compose(pose.position, pose.rotation, pose.scale);
    if (object.matrixWorld.elements.some((value, index) => Math.abs(value - reconstructed.elements[index]!) > 1e-6)) geometryError('PHYSICS_DYNAMIC_SHEAR_UNSUPPORTED', 'A dynamic visual root must have a decomposable TRS transform.');
  }
  private rigidPlan(object: THREE.Object3D, options: RigidPhysics, retained?: GeometrySnapshot, allowEmpty = false): Plan {
    if (!options || !['fixed', 'kinematic', 'dynamic'].includes(options.kind) || (options.shape !== undefined && !['trimesh', 'convex-hull', 'box'].includes(options.shape))) geometryError('PHYSICS_OPTION_INVALID', 'Choose a fixed, kinematic or dynamic body with a supported shape.');
    const shape = options.shape ?? (options.kind === 'dynamic' ? 'convex-hull' : 'trimesh');
    if (options.kind === 'dynamic') { this.validateDynamicParent(object); if (shape === 'trimesh') geometryError('PHYSICS_DYNAMIC_TRIMESH_UNSUPPORTED', 'Use convex-hull or box for a dynamic body.'); }
    const friction = options.frictionRatio ?? .7, restitution = options.restitutionRatio ?? 0, mass = options.massKilograms ?? 1;
    validateNumber(friction, 0, 'frictionRatio'); validateNumber(restitution, 0, 'restitutionRatio'); validateNumber(mass, 0, 'massKilograms', options.kind !== 'dynamic');
    if (friction > 1 || restitution > 1) geometryError('PHYSICS_OPTION_INVALID', 'Friction and restitution ratios must be between zero and one.');
    const geometry = retained ?? extractCollisionGeometry(object, this.maximumColliders, this.maximumTriangles, shape === 'trimesh', allowEmpty);
    const descriptors = geometry.geometries.map(mesh => {
      let descriptor: ColliderDesc | null;
      if (shape === 'trimesh') descriptor = RAPIER.ColliderDesc.trimesh(mesh.vertices, mesh.indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES);
      else if (shape === 'convex-hull') descriptor = RAPIER.ColliderDesc.convexHull(mesh.vertices);
      else {
        const bounds = new THREE.Box3().setFromBufferAttribute(new THREE.Float32BufferAttribute(mesh.vertices, 3)), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
        if (Math.min(size.x, size.y, size.z) <= 1e-6) geometryError('PHYSICS_BOX_DEGENERATE', 'An explicit box collider requires positive volume.');
        descriptor = RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2).setTranslation(center.x, center.y, center.z);
      }
      if (!descriptor) geometryError('PHYSICS_CONVEX_HULL_INVALID', 'The visible mesh does not define a convex volume.');
      descriptor.setFriction(friction).setRestitution(restitution);
      if (options.kind === 'dynamic') descriptor.setMass(mass / geometry.geometries.length);
      return descriptor;
    });
    return { pose: geometry.pose, descriptors, geometry, triangleCount: geometry.geometries.reduce((sum, mesh) => sum + mesh.triangleCount, 0) };
  }
  private characterPlan(object: THREE.Object3D, input: CharacterOptions, retainedPose?: WorldPose): Plan {
    if (this.gravity[0] !== 0 || this.gravity[2] !== 0 || this.gravity[1] > 0) geometryError('PHYSICS_CHARACTER_GRAVITY_UNSUPPORTED', 'XZ character drive uses downward Y gravity; other gravity directions remain available for rigid bodies.');
    const settings = { ...DEFAULT_CHARACTER_OPTIONS, ...input };
    for (const [key, value] of Object.entries(settings)) validateNumber(value, 0, key, !['heightMeters', 'radiusMeters', 'collisionOffsetMeters'].includes(key));
    if (settings.heightMeters < settings.radiusMeters * 2 || settings.maximumSlopeRadians >= Math.PI / 2) geometryError('PHYSICS_CHARACTER_SHAPE_INVALID', 'Capsule height must include both hemispheres; maximum slope must be below pi/2.');
    const pose = retainedPose ?? worldPose(object), scale = new THREE.Vector3(Math.abs(pose.scale.x), Math.abs(pose.scale.y), Math.abs(pose.scale.z));
    const radius = settings.radiusMeters * Math.max(scale.x, scale.z), height = settings.heightMeters * scale.y;
    if (height < radius * 2 || Math.min(radius, height) <= 1e-6) geometryError('PHYSICS_CHARACTER_SCALE_INVALID', 'The scaled capsule must have positive radius and height at least its diameter.');
    return { pose, descriptors: [RAPIER.ColliderDesc.capsule((height - 2 * radius) / 2, radius).setTranslation(0, height / 2, 0)], triangleCount: 0, settings, scale };
  }
  private construct(id: string, object: THREE.Object3D, kind: Entity['kind'], plan: Plan, options: RigidPhysics | undefined, initial: Entity['initial'], previous?: Entity): Entity {
    const bodyDescriptor = kind === 'fixed' ? RAPIER.RigidBodyDesc.fixed() : kind === 'dynamic' ? RAPIER.RigidBodyDesc.dynamic().setCcdEnabled(true) : RAPIER.RigidBodyDesc.kinematicPositionBased();
    bodyDescriptor.setTranslation(plan.pose.position.x, plan.pose.position.y, plan.pose.position.z).setEnabled(false);
    if (kind !== 'character') bodyDescriptor.setRotation(plan.pose.rotation);
    let body: RigidBody | undefined, controller: KinematicCharacterController | undefined;
    try {
      body = this.world.createRigidBody(bodyDescriptor);
      const colliders = plan.descriptors.map(descriptor => this.world.createCollider(descriptor, body));
      const entry: Entity = { id, object, kind, body, colliders, initial,
        ...(plan.geometry ? { geometry: plan.geometry } : {}), ...(options ? { options } : {}) };
      if (plan.settings && plan.scale) {
        controller = this.world.createCharacterController(plan.settings.collisionOffsetMeters);
        controller.enableAutostep(plan.settings.maximumStepHeightMeters, plan.settings.minimumStepWidthMeters, false);
        controller.enableSnapToGround(plan.settings.snapToGroundDistanceMeters);
        controller.setMaxSlopeClimbAngle(plan.settings.maximumSlopeRadians);
        controller.setMinSlopeSlideAngle(plan.settings.maximumSlopeRadians);
        entry.character = { controller, settings: plan.settings, scale: plan.scale, verticalVelocity: previous?.character?.verticalVelocity ?? 0,
          grounded: previous?.character?.grounded ?? false, collisions: [] };
      }
      if (previous?.kind === 'dynamic') { body.setLinvel(previous.body.linvel(), true); body.setAngvel(previous.body.angvel(), true); }
      return entry;
    } catch (error) {
      if (controller) this.world.removeCharacterController(controller);
      if (body) this.world.removeRigidBody(body);
      throw error;
    }
  }
  private destroy(entry: Entity): void {
    for (const collider of entry.colliders) this.colliderOwners.delete(collider.handle);
    if (entry.character) this.world.removeCharacterController(entry.character.controller);
    this.world.removeRigidBody(entry.body);
  }
  private publish(entry: Entity, previous?: Entity): void {
    if (previous) this.destroy(previous);
    this.entries.set(entry.id, entry);
    for (const collider of entry.colliders) this.colliderOwners.set(collider.handle, entry.id);
    entry.body.setEnabled(entry.colliders.length > 0 && isWorldVisible(entry.object));
    this.world.propagateModifiedBodyPositionsToColliders();
  }
  addRigid(id: string, object: THREE.Object3D, options: RigidPhysics): void {
    this.newIdentity(id, object); const plan = this.rigidPlan(object, options); this.budget([{ plan }]);
    const initial = { local: localPose(object), pose: copyPose(plan.pose), geometry: plan.geometry! };
    this.publish(this.construct(id, object, options.kind, plan, { ...options }, initial));
  }
  addCharacter(id: string, object: THREE.Object3D, options: CharacterOptions = {}): void {
    this.newIdentity(id, object); const plan = this.characterPlan(object, options); this.budget([{ plan }]);
    this.publish(this.construct(id, object, 'character', plan, undefined, { local: localPose(object), pose: copyPose(plan.pose) }));
  }
  remove(id: string): void { this.live(); const entry = this.entries.get(id); if (entry) { this.destroy(entry); this.entries.delete(id); } }
  refresh(id: string): void {
    this.refreshMany([id]);
  }
  refreshMany(ids: readonly string[]): void {
    this.live(); if (!Array.isArray(ids) || new Set(ids).size !== ids.length) geometryError('PHYSICS_REFRESH_BATCH_INVALID', 'A refresh batch contains each physics id once.');
    const updates = ids.map(id => {
      const previous = this.entry(id);
      const plan = previous.character ? this.characterPlan(previous.object, previous.character.settings) : this.rigidPlan(previous.object, previous.options!, undefined, true);
      return { previous, plan };
    });
    this.budget(updates);
    const staged: { previous: Entity; entry: Entity }[] = [];
    try { for (const { previous, plan } of updates) staged.push({ previous, entry: this.construct(previous.id, previous.object, previous.kind, plan, previous.options, previous.initial, previous) }); }
    catch (error) { for (const { entry } of staged) this.destroy(entry); throw error; }
    for (const { previous, entry } of staged) this.publish(entry, previous);
  }
  setEnabled(id: string, enabled: boolean): void {
    const entry = this.entry(id); if (typeof enabled !== 'boolean') geometryError('PHYSICS_OPTION_INVALID', 'enabled must be boolean.');
    entry.object.visible = enabled; entry.body.setEnabled(entry.colliders.length > 0 && isWorldVisible(entry.object));
    if (!enabled && entry.character) { entry.character.verticalVelocity = 0; entry.character.grounded = false; entry.character.collisions = []; }
  }
  teleport(id: string, positionMetersXYZ: Vec3): void {
    const entry = this.entry(id); validateVec(positionMetersXYZ, 'positionMetersXYZ');
    const position = new THREE.Vector3(...positionMetersXYZ);
    let local = position.clone();
    if (entry.object.parent) { worldPose(entry.object.parent); local = entry.object.parent.worldToLocal(local); }
    entry.body.setTranslation(position, true);
    if (entry.kind === 'kinematic' || entry.kind === 'character') entry.body.setNextKinematicTranslation(position);
    entry.body.setLinvel({ x: 0, y: 0, z: 0 }, true); entry.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    setLocalPosition(entry.object, local);
    if (entry.character) { entry.character.verticalVelocity = 0; entry.character.grounded = false; entry.character.collisions = []; }
    this.world.propagateModifiedBodyPositionsToColliders();
  }
  applyImpulse(id: string, impulseNewtonSecondsXYZ: Vec3): void {
    const entry = this.entry(id); validateVec(impulseNewtonSecondsXYZ, 'impulseNewtonSecondsXYZ');
    if (entry.kind !== 'dynamic') geometryError('PHYSICS_IMPULSE_REQUIRES_DYNAMIC', 'Only a dynamic body can receive an impulse.');
    entry.body.applyImpulse(new THREE.Vector3(...impulseNewtonSecondsXYZ), true);
  }
  private project(entry: Entity): void {
    if (entry.kind === 'fixed' || entry.kind === 'kinematic') return;
    const position = new THREE.Vector3().copy(entry.body.translation());
    if (entry.character) {
      setLocalPosition(entry.object, entry.object.parent ? entry.object.parent.worldToLocal(position) : position);
      return;
    } else {
      const rotation = new THREE.Quaternion().copy(entry.body.rotation()), scale = entry.geometry!.pose.scale;
      const matrix = new THREE.Matrix4().compose(position, rotation, scale);
      if (entry.object.parent) { entry.object.parent.updateWorldMatrix(true, false); matrix.premultiply(entry.object.parent.matrixWorld.clone().invert()); }
      matrix.decompose(entry.object.position, entry.object.quaternion, entry.object.scale);
    }
    entry.object.updateMatrix(); entry.object.updateWorldMatrix(true, true);
  }
  step(deltaSeconds: number, drives: Readonly<Record<string, CharacterDrive>>): void {
    this.live(); validateNumber(deltaSeconds, 0, 'deltaSeconds'); if (deltaSeconds > .1) geometryError('PHYSICS_TIMESTEP_INVALID', 'Use fixed steps of at most 0.1 seconds.');
    if (!drives || typeof drives !== 'object' || Array.isArray(drives)) geometryError('PHYSICS_DRIVE_INVALID', 'drives must be an entity-indexed record.');
    for (const [id, drive] of Object.entries(drives)) {
      if (!this.entry(id).character || !drive || !Array.isArray(drive.velocityMetersPerSecondXZ) || !finiteVector(drive.velocityMetersPerSecondXZ, 2) || (drive.jumpPressed !== undefined && typeof drive.jumpPressed !== 'boolean')) geometryError('PHYSICS_DRIVE_INVALID', 'Character drive needs finite XZ velocity and an optional jump edge.');
    }
    if (deltaSeconds === 0) return;
    const updates: { previous: Entity; plan: Plan }[] = [];
    const poses = new Map<string, WorldPose>();
    for (const entry of this.entries.values()) {
      const pose = worldPose(entry.object); poses.set(entry.id, pose);
      if (entry.character) {
        const scale = new THREE.Vector3(Math.abs(pose.scale.x), Math.abs(pose.scale.y), Math.abs(pose.scale.z));
        if (scale.distanceToSquared(entry.character.scale) > 1e-14) updates.push({ previous: entry, plan: this.characterPlan(entry.object, entry.character.settings) });
      } else {
        if (entry.kind === 'dynamic') this.validateDynamicParent(entry.object);
        if (geometrySignature(entry.object, pose) !== entry.geometry!.signature) updates.push({ previous: entry, plan: this.rigidPlan(entry.object, entry.options!, undefined, true) });
      }
    }
    this.budget(updates);
    const staged: { previous: Entity; entry: Entity }[] = [];
    try { for (const update of updates) staged.push({ previous: update.previous, entry: this.construct(update.previous.id, update.previous.object, update.previous.kind, update.plan, update.previous.options, update.previous.initial, update.previous) }); }
    catch (error) { for (const { entry } of staged) this.destroy(entry); throw error; }
    for (const { previous, entry } of staged) this.publish(entry, previous);
    this.world.timestep = deltaSeconds;
    for (const entry of this.entries.values()) {
      entry.body.setEnabled(entry.colliders.length > 0 && isWorldVisible(entry.object));
      if (!entry.body.isEnabled()) continue;
      const pose = poses.get(entry.id)!;
      if (entry.kind === 'fixed') { entry.body.setTranslation(pose.position, false); entry.body.setRotation(pose.rotation, false); }
      else if (entry.kind === 'kinematic') { entry.body.setNextKinematicTranslation(pose.position); entry.body.setNextKinematicRotation(pose.rotation); }
    }
    this.world.propagateModifiedBodyPositionsToColliders();
    const proposed: { entry: Entity; movement: Readonly<{ x: number; y: number; z: number }>; verticalVelocity: number; grounded: boolean; collisions: string[] }[] = [];
    // All characters query the same committed world. Do not advance one actor's world before another's input.
    for (const entry of this.entries.values()) {
      const character = entry.character; if (!character || !entry.body.isEnabled()) continue;
      const drive = drives[entry.id], jump = drive?.jumpPressed === true;
      let verticalVelocity = character.grounded && character.verticalVelocity < 0 ? -.1 : character.verticalVelocity + this.gravity[1] * deltaSeconds;
      if (jump && character.grounded) verticalVelocity = character.settings.jumpSpeedMetersPerSecond;
      character.controller.computeColliderMovement(entry.colliders[0]!, { x: (drive?.velocityMetersPerSecondXZ[0] ?? 0) * deltaSeconds, y: verticalVelocity * deltaSeconds, z: (drive?.velocityMetersPerSecondXZ[1] ?? 0) * deltaSeconds }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
      const movement = character.controller.computedMovement();
      const collisions = new Set<string>();
      for (let i = 0; i < character.controller.numComputedCollisions(); i++) { const collision = character.controller.computedCollision(i); const owner = collision?.collider ? this.colliderOwners.get(collision.collider.handle) : undefined; if (owner && owner !== entry.id) collisions.add(owner); }
      proposed.push({ entry, movement, verticalVelocity, grounded: character.controller.computedGrounded(), collisions: [...collisions].sort() });
    }
    for (const proposal of proposed) {
      const before = proposal.entry.body.translation();
      proposal.entry.body.setNextKinematicTranslation({ x: before.x + proposal.movement.x, y: before.y + proposal.movement.y, z: before.z + proposal.movement.z });
    }
    this.world.step();
    for (const proposal of proposed) Object.assign(proposal.entry.character!, { verticalVelocity: proposal.verticalVelocity, grounded: proposal.grounded, collisions: proposal.collisions });
    for (const entry of this.entries.values()) this.project(entry);
  }
  state(id: string): PhysicsEntityState | undefined {
    this.live(); const entry = this.entries.get(id); if (!entry) return undefined;
    const collisions = new Set(entry.character?.collisions ?? []);
    if (!entry.character) for (const collider of entry.colliders) this.world.contactPairsWith(collider, other => { const owner = this.colliderOwners.get(other.handle); if (owner && owner !== id) collisions.add(owner); });
    return Object.freeze({ id, positionMetersXYZ: vec(entry.body.translation()), velocityMetersPerSecondXYZ: vec(entry.body.linvel()), isGrounded: entry.body.isEnabled() && (entry.character?.grounded ?? false), collisionEntityIds: Object.freeze([...collisions].sort()) });
  }
  audit(): PhysicsAudit {
    this.live(); const entities = [...this.entries.values()].map(entry => Object.freeze({ id: entry.id, kind: entry.kind, colliderCount: entry.colliders.length, triangleCount: entry.geometry?.geometries.reduce((sum, geometry) => sum + geometry.triangleCount, 0) ?? 0 }));
    return Object.freeze({ engine: 'rapier', entityCount: entities.length, colliderCount: entities.reduce((sum, entry) => sum + entry.colliderCount, 0), triangleCount: entities.reduce((sum, entry) => sum + entry.triangleCount, 0), entities: Object.freeze(entities), diagnostics: Object.freeze([]) });
  }
  reset(): void {
    this.live(); const staged: { previous: Entity; entry: Entity }[] = [];
    try {
      for (const previous of this.entries.values()) {
        const plan = previous.character ? this.characterPlan(previous.object, previous.character.settings, previous.initial.pose) : this.rigidPlan(previous.object, previous.options!, previous.initial.geometry);
        const entry = this.construct(previous.id, previous.object, previous.kind, plan, previous.options, previous.initial);
        staged.push({ previous, entry });
      }
    } catch (error) { for (const { entry } of staged) this.destroy(entry); throw error; }
    for (const { previous, entry } of staged) { restoreLocal(entry.object, entry.initial.local); this.publish(entry, previous); }
  }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.entries.clear(); this.colliderOwners.clear(); this.world.free(); }
}
