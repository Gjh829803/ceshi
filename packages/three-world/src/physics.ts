import {DEFAULT_CHARACTER_OPTIONS} from './config/physics';
import * as THREE from 'three';
import RAPIER, { type Collider, type ColliderDesc, type KinematicCharacterController, type RigidBody, type World } from '@dimforge/rapier3d-compat';
import type { CameraArmHit, CharacterDrive, CharacterOptions, PhysicsAudit, PhysicsCandidate, PhysicsEntityState, PhysicsOptions, PhysicsPort, RigidPhysics, Vec3 } from './engine-contracts.js';
import { extractCollisionGeometry, finiteVector, geometryError, geometrySignature, isWorldVisible, worldPose, type GeometrySnapshot, type WorldPose } from './geometry.js';
import type { EpisodeStartProbe } from './episode-contracts.js';

export const MAXIMUM_EPISODE_START_ALIGNMENT_METERS = .35;

// Float32 capsule contacts can report a slightly tilted normal on a flat cuboid.
// This is only a retry eligibility tolerance, never the character's slope limit.
const PLANAR_CONTACT_MINIMUM_Y = Math.cos(Math.PI / 180);
const PLANAR_CONTACT_MAXIMUM_XZ = Math.sin(Math.PI / 180);
let initialization: Promise<void> | undefined;
type LocalPose = { position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3; visible: boolean; matrix: THREE.Matrix4; matrixAutoUpdate: boolean };
type DriveMode = 'ground' | 'velocity-gravity' | 'velocity-direct';
type CharacterState = { driveMode: DriveMode; needsClearance: boolean; controller: KinematicCharacterController; settings: Required<CharacterOptions>; verticalVelocity: number; grounded: boolean; collisions: string[]; scale: THREE.Vector3 };
type Entity = {
  id: string; object: THREE.Object3D; enabled: boolean; kind: RigidPhysics['kind'] | 'character'; body: RigidBody; colliders: Collider[];
  geometry?: GeometrySnapshot; options?: RigidPhysics; character?: CharacterState;
  fixedQueryPose?: WorldPose;
  sourceObjects?: readonly THREE.Object3D[];
  initial: { local: LocalPose; pose: WorldPose; geometry?: GeometrySnapshot };
};
type CharacterProposal = { entry: Entity; driveMode: DriveMode; desired: THREE.Vector3; correction: THREE.Vector3; movement: THREE.Vector3; supportNeedsRefresh: boolean; verticalVelocity: number; grounded: boolean; collisions: Set<string> };
type QueryShape = { id: string; character: boolean; changed: boolean; shape: RAPIER.Shape; position: THREE.Vector3; rotation: THREE.Quaternion; settings?: Required<CharacterOptions> };
type KinematicQueryState = { entry: Entity; type: RAPIER.RigidBodyType; linearVelocity: THREE.Vector3; angularVelocity: THREE.Vector3; nextPosition: THREE.Vector3; nextRotation: THREE.Quaternion; sleeping: boolean; enabled: boolean };
type Plan = { pose: WorldPose; descriptors: ColliderDesc[]; sourceObjects?: THREE.Object3D[]; triangleCount: number; geometry?: GeometrySnapshot; settings?: Required<CharacterOptions>; scale?: THREE.Vector3 };
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
  private readonly colliderSources = new Map<number, THREE.Object3D>();
  // Rapier's broad phase refreshes during World.step, not when a collider is
  // created or moved. Direct native queries cover those edits until that step.
  private readonly queryDirty = new Set<string>();
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
  private budget(plans: readonly { id?: string; previous?: Entity; plan: Plan }[], removed: readonly string[] = []): void {
    const replaced = new Set([...removed, ...plans.flatMap(value => value.previous ? [value.previous.id] : [])]);
    let colliders = 0, triangles = 0;
    for (const entry of this.entries.values()) if (!replaced.has(entry.id)) { colliders += entry.colliders.length; triangles += entry.geometry?.geometries.reduce((sum, geometry) => sum + geometry.triangleCount, 0) ?? 0; }
    const retainedColliders = colliders, retainedTriangles = triangles;
    for (const { plan } of plans) { colliders += plan.descriptors.length; triangles += plan.triangleCount; }
    if (colliders > this.maximumColliders || triangles > this.maximumTriangles) {
      const entityIds = plans.flatMap(({id, previous}) => id ?? previous?.id ?? []);
      if (colliders > this.maximumColliders) geometryError('PHYSICS_COLLIDER_BUDGET_EXCEEDED', `The operation exceeds the world collider budget: plannedColliderCount=${colliders}, retainedColliderCount=${retainedColliders}, maximumColliderCount=${this.maximumColliders}.`, entityIds);
      if (triangles > this.maximumTriangles) geometryError('PHYSICS_TRIANGLE_BUDGET_EXCEEDED', `The operation exceeds the world triangle budget: plannedTriangleCount=${triangles}, retainedTriangleCount=${retainedTriangles}, maximumTriangleCount=${this.maximumTriangles}.`, entityIds);
    }
  }
  private validateDynamicParent(object: THREE.Object3D): void {
    if (object.parent) {
      const scale = worldPose(object.parent).scale;
      if (scale.x <= 0 || Math.abs(scale.x - scale.y) > 1e-6 || Math.abs(scale.x - scale.z) > 1e-6) geometryError('PHYSICS_DYNAMIC_PARENT_SCALE_UNSUPPORTED', 'A dynamic body needs an unscaled or uniformly scaled parent so its rotation can be projected without shear.');
    }
    const pose = worldPose(object), reconstructed = new THREE.Matrix4().compose(pose.position, pose.rotation, pose.scale);
    if (object.matrixWorld.elements.some((value, index) => Math.abs(value - reconstructed.elements[index]!) > 1e-6)) geometryError('PHYSICS_DYNAMIC_SHEAR_UNSUPPORTED', 'A dynamic visual root must have a decomposable TRS transform.');
  }
  private rigidPlan(id: string, object: THREE.Object3D, options: RigidPhysics, retained?: GeometrySnapshot, allowEmpty = false): Plan {
    if (!options || !['fixed', 'kinematic', 'dynamic'].includes(options.kind) || (options.shape !== undefined && !['trimesh', 'convex-hull', 'box'].includes(options.shape))) geometryError('PHYSICS_OPTION_INVALID', 'Choose a fixed, kinematic or dynamic body with a supported shape.');
    const shape = options.shape ?? (options.kind === 'dynamic' ? 'convex-hull' : 'trimesh');
    if (options.kind === 'dynamic') { this.validateDynamicParent(object); if (shape === 'trimesh') geometryError('PHYSICS_DYNAMIC_TRIMESH_UNSUPPORTED', 'Use convex-hull or box for a dynamic body.'); }
    const friction = options.frictionRatio ?? .7, restitution = options.restitutionRatio ?? 0, mass = options.massKilograms ?? 1;
    validateNumber(friction, 0, 'frictionRatio'); validateNumber(restitution, 0, 'restitutionRatio'); validateNumber(mass, 0, 'massKilograms', options.kind !== 'dynamic');
    if (friction > 1 || restitution > 1) geometryError('PHYSICS_OPTION_INVALID', 'Friction and restitution ratios must be between zero and one.');
    let geometry = retained;
    if (!geometry) try { geometry = extractCollisionGeometry(object, this.maximumColliders, this.maximumTriangles, shape === 'trimesh', allowEmpty); }
    catch (error) {
      // Add ownership only to structured budget failures; diagnostic enrichment
      // must not replace an unrelated author/provider error.
      try {
        if (error && typeof error === 'object') {
          const code = Object.getOwnPropertyDescriptor(error, 'code')?.value;
          if (code === 'PHYSICS_TRIANGLE_BUDGET_EXCEEDED' || code === 'PHYSICS_COLLIDER_BUDGET_EXCEEDED') Object.assign(error, {entityIds: [id]});
        }
      } catch { /* Keep the original failure if its descriptors are unavailable. */ }
      throw error;
    }
    const descriptors: ColliderDesc[] = [], sourceObjects: THREE.Object3D[] = [];
    for (const mesh of geometry.geometries) {
      const append = (descriptor: ColliderDesc | null): void => {
        if (!descriptor) geometryError('PHYSICS_CONVEX_HULL_INVALID', 'The visible mesh does not define a convex volume.');
        descriptor.setFriction(friction).setRestitution(restitution);
        if (options.kind === 'dynamic') descriptor.setMass(mass / geometry.geometries.length);
        descriptors.push(descriptor); sourceObjects.push(mesh.sourceObject);
      };
      if (shape === 'trimesh') append(RAPIER.ColliderDesc.trimesh(mesh.vertices, mesh.indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES));
      else if (shape === 'convex-hull') append(RAPIER.ColliderDesc.convexHull(mesh.vertices));
      else {
        const bounds = new THREE.Box3().setFromBufferAttribute(new THREE.Float32BufferAttribute(mesh.vertices, 3)), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
        if (Math.min(size.x, size.y, size.z) <= 1e-6) geometryError('PHYSICS_BOX_DEGENERATE', 'An explicit box collider requires positive volume.');
        // Large cuboid faces make native KCC contact normals numerically
        // unstable. These smaller native cuboids partition the exact same
        // volume, retaining the original visible mesh and collider ownership.
        const cells = options.kind === 'dynamic' ? new THREE.Vector3(1, 1, 1) : size.clone().divideScalar(4).ceil();
        if (cells.x * cells.y * cells.z + descriptors.length > this.maximumColliders) geometryError('PHYSICS_COLLIDER_BUDGET_EXCEEDED', `Exact box subdivision exceeds the collider budget: requiredColliderCount=${cells.x * cells.y * cells.z + descriptors.length} (lower bound), maximumColliderCount=${this.maximumColliders}. Current mesh in the rigid-body frame: sizeMetersXYZ=${JSON.stringify(size.toArray())}, cellsXYZ=${JSON.stringify(cells.toArray())}. Counts exclude remaining meshes and other world entities.`, [id]);
        const cellSize = size.clone().divide(cells);
        for (let x = 0; x < cells.x; x++) for (let y = 0; y < cells.y; y++) for (let z = 0; z < cells.z; z++) append(RAPIER.ColliderDesc.cuboid(cellSize.x / 2, cellSize.y / 2, cellSize.z / 2)
          .setTranslation(center.x + (x + .5 - cells.x / 2) * cellSize.x, center.y + (y + .5 - cells.y / 2) * cellSize.y, center.z + (z + .5 - cells.z / 2) * cellSize.z));
      }
    }
    return { pose: geometry.pose, descriptors, sourceObjects, geometry, triangleCount: geometry.geometries.reduce((sum, mesh) => sum + mesh.triangleCount, 0) };
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
      const entry: Entity = { id, object, enabled: previous?.enabled ?? true, kind, body, colliders, initial,
        ...(plan.geometry ? { geometry: plan.geometry } : {}), ...(plan.sourceObjects ? { sourceObjects: plan.sourceObjects } : {}), ...(options ? { options } : {}), ...(kind === 'fixed' ? { fixedQueryPose: copyPose(plan.pose) } : {}) };
      if (plan.settings && plan.scale) {
        controller = this.world.createCharacterController(plan.settings.collisionOffsetMeters);
        controller.enableAutostep(plan.settings.maximumStepHeightMeters, plan.settings.minimumStepWidthMeters, false);
        controller.enableSnapToGround(plan.settings.snapToGroundDistanceMeters);
        controller.setMaxSlopeClimbAngle(plan.settings.maximumSlopeRadians);
        controller.setMinSlopeSlideAngle(plan.settings.maximumSlopeRadians);
        entry.character = { driveMode: previous?.character?.driveMode ?? 'ground', needsClearance: true, controller, settings: plan.settings, scale: plan.scale, verticalVelocity: previous?.character?.verticalVelocity ?? 0,
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
    this.queryDirty.delete(entry.id);
    for (const collider of entry.colliders) { this.colliderOwners.delete(collider.handle); this.colliderSources.delete(collider.handle); }
    if (entry.character) this.world.removeCharacterController(entry.character.controller);
    this.world.removeRigidBody(entry.body);
  }
  private publish(entry: Entity, previous?: Entity): void {
    if (previous) this.destroy(previous);
    this.entries.set(entry.id, entry);
    for (let i = 0; i < entry.colliders.length; i++) {
      const collider = entry.colliders[i]!;
      this.colliderOwners.set(collider.handle, entry.id);
      this.colliderSources.set(collider.handle, entry.sourceObjects?.[i] ?? entry.object);
    }
    entry.body.setEnabled(entry.enabled && entry.colliders.length > 0);
    this.queryDirty.add(entry.id);
    this.world.propagateModifiedBodyPositionsToColliders();
  }
  addRigid(id: string, object: THREE.Object3D, options: RigidPhysics): void {
    this.newIdentity(id, object); const plan = this.rigidPlan(id, object, options); this.budget([{ id, plan }]);
    const initial = { local: localPose(object), pose: copyPose(plan.pose), geometry: plan.geometry! };
    this.publish(this.construct(id, object, options.kind, plan, { ...options }, initial));
  }
  addCharacter(id: string, object: THREE.Object3D, options: CharacterOptions = {}): void {
    this.newIdentity(id, object); const plan = this.characterPlan(object, options); this.budget([{ id, plan }]);
    this.publish(this.construct(id, object, 'character', plan, undefined, { local: localPose(object), pose: copyPose(plan.pose) }));
  }
  validateBatch(candidates: readonly PhysicsCandidate[], removedEntityIds: readonly string[] = []): void {
    this.live();
    if (!Array.isArray(candidates) || !Array.isArray(removedEntityIds) || new Set(removedEntityIds).size !== removedEntityIds.length) geometryError('PHYSICS_CANDIDATE_BATCH_INVALID', 'Candidate and removal lists must contain each physics id once.');
    const removed = new Set(removedEntityIds), identities = new Set<string>(), objects = new Set<THREE.Object3D>();
    for (const id of removed) this.entry(id);
    for (const candidate of candidates) {
      if (!candidate || !['rigid', 'character'].includes(candidate.kind) || typeof candidate.id !== 'string' || !candidate.id.trim() || candidate.id.length > 128 || identities.has(candidate.id) || removed.has(candidate.id)) geometryError('PHYSICS_CANDIDATE_BATCH_INVALID', 'Each candidate needs a unique id, a body kind, and no conflicting removal.');
      if (!(candidate.object instanceof THREE.Object3D) || objects.has(candidate.object)) geometryError('PHYSICS_OBJECT_INVALID', 'Each candidate needs a distinct Three Object3D.');
      identities.add(candidate.id); objects.add(candidate.object);
    }
    for (const entry of this.entries.values()) if (!identities.has(entry.id) && !removed.has(entry.id) && objects.has(entry.object)) geometryError('PHYSICS_OBJECT_INVALID', 'A candidate object is already registered to a retained physics entity.');
    const plans = candidates.map(candidate => {
      const previous = this.entries.get(candidate.id);
      const plan = candidate.kind === 'character' ? this.characterPlan(candidate.object, candidate.options ?? {}) : this.rigidPlan(candidate.id, candidate.object, candidate.options, undefined, Boolean(previous));
      return { id: candidate.id, ...(previous ? { previous } : {}), plan, candidate };
    });
    this.budget(plans, removedEntityIds);
    const shapes: QueryShape[] = [];
    for (const entry of this.entries.values()) if (!identities.has(entry.id) && !removed.has(entry.id) && entry.enabled) for (const collider of entry.colliders) {
      shapes.push({ id: entry.id, character: entry.kind === 'character', changed: false, shape: collider.shape, position: new THREE.Vector3().copy(collider.translation()), rotation: new THREE.Quaternion().copy(collider.rotation()), ...(entry.character ? { settings: entry.character.settings } : {}) });
    }
    for (const { previous, plan, candidate } of plans) if (previous?.enabled !== false) for (const descriptor of plan.descriptors) {
      const rotation = candidate.kind === 'character' ? new THREE.Quaternion() : plan.pose.rotation.clone();
      shapes.push({ id: candidate.id, character: candidate.kind === 'character', changed: true, shape: descriptor.shape,
        position: new THREE.Vector3().copy(descriptor.translation).applyQuaternion(rotation).add(plan.pose.position), rotation: rotation.multiply(new THREE.Quaternion().copy(descriptor.rotation)), ...(plan.settings ? { settings: plan.settings } : {}) });
    }
    for (let i = 0; i < shapes.length; i++) for (let j = i + 1; j < shapes.length; j++) {
      const a = shapes[i]!, b = shapes[j]!;
      if (a.id === b.id || (!a.character && !b.character) || (!a.changed && !b.changed)) continue;
      const contact = a.shape.contactShape(a.position, a.rotation, b.shape, b.position, b.rotation, 0);
      if (contact && contact.distance < -.001) geometryError('PHYSICS_CHARACTER_OVERLAP', `Candidate physics overlaps a character: ${a.id}, ${b.id}. Choose a non-overlapping pose or body size.`);
    }
    const geometryChanged = shapes.some(shape => shape.changed && !shape.character);
    this.clearanceLifts(shapes, new Set(shapes.filter(shape => shape.character && (shape.changed || geometryChanged)).map(shape => shape.id)));
  }
  remove(id: string): void { this.live(); const entry = this.entries.get(id); if (entry) { this.destroy(entry); this.entries.delete(id); } }
  refresh(id: string): void {
    this.refreshMany([id]);
  }
  refreshMany(ids: readonly string[]): void {
    this.live(); if (!Array.isArray(ids) || new Set(ids).size !== ids.length) geometryError('PHYSICS_REFRESH_BATCH_INVALID', 'A refresh batch contains each physics id once.');
    const updates = ids.map(id => {
      const previous = this.entry(id);
      const plan = previous.character ? this.characterPlan(previous.object, previous.character.settings) : this.rigidPlan(previous.id, previous.object, previous.options!, undefined, true);
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
    entry.enabled = enabled; entry.body.setEnabled(enabled && entry.colliders.length > 0);
    this.queryDirty.add(id);
    if (enabled && entry.character) entry.character.needsClearance = true;
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
    if (entry.character) { entry.character.verticalVelocity = 0; entry.character.grounded = false; entry.character.collisions = []; entry.character.needsClearance = true; }
    this.world.propagateModifiedBodyPositionsToColliders();
    this.queryDirty.add(id);
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
  probe(originMetersXYZ: Vec3, directionWorldXYZ: Vec3, maximumDistanceMeters: number, excludeEntityId?: string): { entityId: string; distanceMeters: number; normalWorldXYZ: Vec3 } | null {
    this.live(); validateVec(originMetersXYZ, 'probe origin'); validateVec(directionWorldXYZ, 'probe direction'); validateNumber(maximumDistanceMeters, 0, 'probe distance');
    const direction = new THREE.Vector3(...directionWorldXYZ);
    if (direction.lengthSq() < 1e-20 || (excludeEntityId !== undefined && typeof excludeEntityId !== 'string')) geometryError('PHYSICS_PROBE_INVALID', 'A probe needs a nonzero direction and an optional entity id.');
    const ray = new RAPIER.Ray(new THREE.Vector3(...originMetersXYZ), direction.normalize());
    const include = (collider: Collider): boolean => {
        const owner = this.colliderOwners.get(collider.handle), entry = owner ? this.entries.get(owner) : undefined;
        return Boolean(entry && owner !== excludeEntityId && entry.enabled && entry.body.isEnabled() && !collider.isSensor());
      };
    const hit = this.world.castRayAndGetNormal(ray, maximumDistanceMeters, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined, include);
    let result = hit ? { entityId: this.colliderOwners.get(hit.collider.handle)!, distanceMeters: hit.timeOfImpact, normalWorldXYZ: vec(hit.normal) } : null;
    for (const id of this.queryDirty) for (const collider of this.entries.get(id)?.colliders ?? []) if (include(collider)) {
      const direct = collider.castRayAndGetNormal(ray, result?.distanceMeters ?? maximumDistanceMeters, true);
      if (direct && (!result || direct.timeOfImpact < result.distanceMeters)) result = { entityId: id, distanceMeters: direct.timeOfImpact, normalWorldXYZ: vec(direct.normal) };
    }
    return result;
  }
  characterSettings(id: string): Required<CharacterOptions> {
    const entry = this.entry(id), character = entry.character;
    if (!character) throw new Error('EPISODE_CONTROL_REQUIRES_CHARACTER');
    return { ...character.settings, heightMeters: character.settings.heightMeters * character.scale.y,
      radiusMeters: character.settings.radiusMeters * Math.max(character.scale.x, character.scale.z) };
  }
  /** Pure local native shape queries: no teleport, controller solve, tick or navigation scan. */
  probeCharacterStart(id: string, positionWorldMetersXYZ: Vec3, supportMode:'ground'|'free'='ground'): EpisodeStartProbe {
    const entry = this.entry(id), character = entry.character;
    validateVec(positionWorldMetersXYZ, 'episode start');
    if (!character) throw new Error('EPISODE_CONTROL_REQUIRES_CHARACTER');
    const settings = this.characterSettings(id), requested = [...positionWorldMetersXYZ] as [number, number, number];
    const invalid = (code: string, message: string, entityId?: string): EpisodeStartProbe => ({ isValid: false,
      requestedPositionWorldMetersXYZ: requested, resolvedPositionWorldMetersXYZ: [...requested],
      diagnostics: [{ code, message, ...(entityId ? { entityIds: [entityId] } : {}) }] });
    const height = settings.heightMeters, skin = settings.collisionOffsetMeters, alignment = MAXIMUM_EPISODE_START_ALIGNMENT_METERS;
    const shape = new RAPIER.Capsule((height - 2 * settings.radiusMeters) / 2, settings.radiusMeters);
    const rotation = { x: 0, y: 0, z: 0, w: 1 }, velocity = { x: 0, y: -1, z: 0 };
    const origin = new THREE.Vector3(...requested).add(new THREE.Vector3(0, height / 2 + alignment, 0));
    const include = (collider: Collider): boolean => {
      const owner = this.colliderOwners.get(collider.handle), candidate = owner ? this.entries.get(owner) : undefined;
      return Boolean(candidate && owner !== id && candidate.enabled && candidate.body.isEnabled() && !collider.isSensor());
    };
    const resolved: [number,number,number]=[...requested];
    if(supportMode==='ground'){
      const maximumDistance = alignment * 2;
      const hit = this.world.castShape(origin, rotation, velocity, shape, skin, maximumDistance, false,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined, include);
      let support = hit ? { distanceMeters: hit.time_of_impact, normal: new THREE.Vector3().copy(hit.normal1), entityId: this.colliderOwners.get(hit.collider.handle)! } : undefined;
      // Newly created or reset colliders have not reached Rapier's broad phase yet.
      for (const dirtyId of this.queryDirty) for (const collider of this.entries.get(dirtyId)?.colliders ?? []) if (include(collider)) {
        const direct = collider.castShape({ x: 0, y: 0, z: 0 }, shape, origin, rotation, velocity, skin, support?.distanceMeters ?? maximumDistance, false);
        if (direct && (!support || direct.time_of_impact < support.distanceMeters)) support = {
          distanceMeters: direct.time_of_impact, normal: new THREE.Vector3().copy(direct.normal1).applyQuaternion(collider.rotation()), entityId: dirtyId };
      }
      if (!support) return invalid('EPISODE_START_UNSUPPORTED', 'No character support exists within 0.35 metres vertically of the requested start.');
      if (this.entries.get(support.entityId)?.kind === 'character') return invalid('EPISODE_START_ACTOR_SUPPORT', 'Another actor cannot provide the start support.', support.entityId);
      if (support.normal.y < Math.cos(settings.maximumSlopeRadians) - 1e-5) return invalid('EPISODE_START_SLOPE_OR_OBSTRUCTION', 'The local shape sweep reached a wall, ceiling or unsupported slope.', support.entityId);
      resolved[1] += alignment - support.distanceMeters;
    }
    const center = new THREE.Vector3(...resolved).add(new THREE.Vector3(0, height / 2, 0));
    // Triangle seams can report zero contact depth even across a capsule.
    // For free starts, intersect a slightly inset body so touching remains valid.
    const interior=supportMode==='free'?new RAPIER.Capsule((height-2*settings.radiusMeters)/2,Math.max(settings.radiusMeters-.001,settings.radiusMeters*.99)):undefined;
    let overlapping: string | undefined;
    const inspect = (collider: Collider): boolean => {
      if (!include(collider)) return true;
      const contact = collider.contactShape(shape, center, rotation, 0);
      if ((contact && contact.distance < -.001) || collider.containsPoint(center) || (interior&&collider.intersectsShape(interior,center,rotation))) overlapping = this.colliderOwners.get(collider.handle)!;
      return true;
    };
    this.world.intersectionsWithShape(center, rotation, shape, inspect, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined, include);
    this.world.intersectionsWithPoint(center, inspect, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined, include);
    for (const dirtyId of this.queryDirty) for (const collider of this.entries.get(dirtyId)?.colliders ?? []) inspect(collider);
    if (overlapping) return invalid('EPISODE_START_BODY_OVERLAP', 'The actual character capsule overlaps geometry or another actor at the requested start.', overlapping);
    return { isValid: true, requestedPositionWorldMetersXYZ: requested, resolvedPositionWorldMetersXYZ: resolved, diagnostics: [] };
  }
  castCameraArm(targetMetersXYZ: Vec3, desiredEyeMetersXYZ: Vec3, radiusMeters: number): CameraArmHit {
    this.live(); validateVec(targetMetersXYZ, 'camera target'); validateVec(desiredEyeMetersXYZ, 'camera eye'); validateNumber(radiusMeters, 0, 'camera radius', false);
    const target = new THREE.Vector3(...targetMetersXYZ), direction = new THREE.Vector3(...desiredEyeMetersXYZ).sub(target), length = direction.length();
    const shape = new RAPIER.Ball(radiusMeters), rotation = { x: 0, y: 0, z: 0, w: 1 };
    const includeSolid = (collider: Collider): boolean => {
      const entry = this.entries.get(this.colliderOwners.get(collider.handle) ?? '');
      const source = this.colliderSources.get(collider.handle);
      return Boolean(entry && entry.kind !== 'character' && entry.body.isEnabled() && !collider.isSensor() && source && isWorldVisible(entry.object) && isWorldVisible(source));
    };
    let overlap: CameraArmHit | undefined;
    const considerOverlap = (collider: Collider): boolean => {
      if (!includeSolid(collider)) return true;
      const contact = collider.contactShape(shape, target, rotation, 0);
      if (contact && contact.distance <= 0 && -contact.distance >= (overlap?.penetrationDepthMeters ?? -1)) {
        overlap = { distanceMeters: 0, colliderEntityId: this.colliderOwners.get(collider.handle)!,
          normalWorldXYZ: vec(contact.normal1), hitPositionWorldMetersXYZ: vec(contact.point1),
          startedOverlapping: true, penetrationDepthMeters: -contact.distance };
      }
      return true;
    };
    this.world.intersectionsWithShape(target, rotation, shape, considerOverlap, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined, includeSolid);
    for (const id of this.queryDirty) for (const collider of this.entries.get(id)?.colliders ?? []) considerOverlap(collider);
    if (overlap) return overlap;
    if (length === 0) return { distanceMeters: 0 };
    const hit = this.world.castShape(target, rotation, direction.divideScalar(length), shape, 0, length, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined, includeSolid);
    // Rapier 0.20 World.castShape returns world-space data, while the direct
    // Collider.castShape fallback returns collider-local normal1/witness1.
    const describe = (collider: Collider, hit: RAPIER.ShapeCastHit, local = false): CameraArmHit => ({
      distanceMeters: Math.max(0, Math.min(length, hit.time_of_impact)), colliderEntityId: this.colliderOwners.get(collider.handle)!,
      normalWorldXYZ: local ? vec(new THREE.Vector3().copy(hit.normal1).applyQuaternion(collider.rotation())) : vec(hit.normal1),
      hitPositionWorldMetersXYZ: local ? vec(new THREE.Vector3().copy(hit.witness1).applyQuaternion(collider.rotation()).add(collider.translation())) : vec(hit.witness1), startedOverlapping: false, penetrationDepthMeters: 0,
    });
    let result: CameraArmHit = hit ? describe(hit.collider, hit) : { distanceMeters: length };
    for (const id of this.queryDirty) for (const collider of this.entries.get(id)?.colliders ?? []) if (includeSolid(collider)) {
      const direct = collider.castShape({ x: 0, y: 0, z: 0 }, shape, target, rotation, direction, 0, result.distanceMeters, true);
      if (direct && (!result.colliderEntityId || direct.time_of_impact < result.distanceMeters)) result = describe(collider, direct, true);
    }
    return result;
  }
  private computeEnvironmentMotion(proposal: CharacterProposal): void {
    const character = proposal.entry.character!, controller = character.controller;
    const requested = proposal.desired.clone().add(proposal.correction);
    // Newly published colliders belong to the direct sweep until world.step
    // synchronizes the query pipeline. A reused broad phase may already see
    // them after reset and add KCC's normal nudge, unlike a cold world.
    const includeEnvironment = (collider: Collider): boolean => {
      const owner=this.colliderOwners.get(collider.handle)??'';
      return this.entries.get(owner)?.kind!=='character'&&!this.queryDirty.has(owner);
    };
    controller.computeColliderMovement(proposal.entry.colliders[0]!, requested, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, includeEnvironment);
    proposal.movement.copy(controller.computedMovement()); proposal.grounded = controller.computedGrounded();
    let onlyPlanarFixedContacts = controller.numComputedCollisions() > 0;
    for (let i = 0; i < controller.numComputedCollisions(); i++) {
      const collision = controller.computedCollision(i), owner = collision?.collider ? this.colliderOwners.get(collision.collider.handle) : undefined;
      if (owner && owner !== proposal.entry.id) proposal.collisions.add(owner);
      onlyPlanarFixedContacts &&= Boolean(collision && owner && this.entries.get(owner)?.kind === 'fixed'
        && collision.normal1.y >= PLANAR_CONTACT_MINIMUM_Y
        && Math.hypot(collision.normal1.x, collision.normal1.z) <= PLANAR_CONTACT_MAXIMUM_XZ);
    }
    const horizontal = requested.clone().setY(0), horizontalSquared = horizontal.lengthSq();
    if (proposal.driveMode === 'ground' && character.grounded && proposal.grounded && requested.y < 0
      && proposal.correction.lengthSq() === 0 && this.queryDirty.size === 0 && onlyPlanarFixedContacts
      && horizontalSquared > 1e-8 && proposal.movement.dot(horizontal) < horizontalSquared * .5) {
      // Rapier.js 0.20.0, npm gitHead 3e12c2679cb1940a876bde93af9cec0cf2f57944:
      // https://github.com/dimforge/rapier/blob/3e12c2679cb1940a876bde93af9cec0cf2f57944/src/control/character_controller.rs#L683
      // A near-unit vertical normal leaves a negative float32 tangent residual.
      // handle_slopes then mistakes the remaining horizontal travel for downhill
      // slipping and discards it. Remove only the grounded downward push in one
      // retry; the same KCC still owns wall/step collision, snapping and support.
      // API: https://rapier.rs/javascript3d/classes/KinematicCharacterController.html#computeColliderMovement
      controller.computeColliderMovement(proposal.entry.colliders[0]!, horizontal, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, includeEnvironment);
      const retry = new THREE.Vector3().copy(controller.computedMovement());
      if (controller.computedGrounded() && retry.dot(horizontal) > proposal.movement.dot(horizontal) + 1e-5) {
        proposal.movement.copy(retry);
        for (let i = 0; i < controller.numComputedCollisions(); i++) {
          const collision = controller.computedCollision(i), owner = collision?.collider ? this.colliderOwners.get(collision.collider.handle) : undefined;
          if (owner && owner !== proposal.entry.id) proposal.collisions.add(owner);
        }
      }
    }
    this.constrainDirtyMotion(proposal);
  }
  private addSupportCarry(proposal: CharacterProposal, platforms: readonly KinematicQueryState[]): void {
    const character = proposal.entry.character!;
    if (!character.grounded || proposal.desired.y > 0) return;
    const capsule = proposal.entry.colliders[0]!;
    let selected: { platform: KinematicQueryState; point: THREE.Vector3; normal: THREE.Vector3; distance: number } | undefined;
    for (const platform of platforms) for (const collider of platform.entry.colliders) {
      const contact = capsule.contactCollider(collider, character.settings.collisionOffsetMeters + .05);
      if (contact && contact.normal1.y <= -Math.cos(character.settings.maximumSlopeRadians) && (!selected || contact.distance < selected.distance)) selected = { platform, point: new THREE.Vector3().copy(contact.point2), normal: new THREE.Vector3().copy(contact.normal1).negate(), distance: contact.distance };
    }
    if (!selected) return;
    const { platform, point, normal } = selected, body = platform.entry.body;
    const movedPoint = point.clone().sub(body.translation()).applyQuaternion(new THREE.Quaternion().copy(body.rotation()).invert()).applyQuaternion(platform.nextRotation).add(platform.nextPosition);
    // The real support contact prevents inward relative normal motion. Without
    // this constraint, gravity subtracts from an ascending platform's movement
    // every tick and eventually embeds the capsule inside it.
    const inward = proposal.desired.dot(normal); if (inward < 0) proposal.desired.addScaledVector(normal, -inward);
    proposal.desired.add(movedPoint.sub(point)); proposal.supportNeedsRefresh = true;
  }
  private restoreKinematicQueries(platforms: readonly KinematicQueryState[]): void {
    for (const platform of platforms) {
      const body = platform.entry.body;
      // Position-based kinematic bodies ignore setLinvel/setAngvel. Restore the
      // saved velocity through velocity-based type before restoring the final
      // type, without advancing the simulation or replacing any native handle.
      body.setBodyType(RAPIER.RigidBodyType.KinematicVelocityBased, false); body.setLinvel(platform.linearVelocity, false); body.setAngvel(platform.angularVelocity, false); body.setBodyType(platform.type, false);
      body.setNextKinematicTranslation(platform.nextPosition); body.setNextKinematicRotation(platform.nextRotation);
      body.setEnabled(platform.enabled); if (platform.sleeping) body.sleep(); else body.wakeUp();
    }
  }
  private clearanceLifts(shapes: readonly QueryShape[], targets: ReadonlySet<string>): Map<string, number> {
    const lifts = new Map<string, number>();
    for (const capsule of shapes) if (capsule.character && targets.has(capsule.id)) {
      const settings = capsule.settings!, skin = settings.collisionOffsetMeters, raised = capsule.position.clone(); raised.y += 2 * skin;
      let lift = 0;
      // Exact touching can produce a degenerate GJK normal. Sweep the same
      // native capsule from outside its skin; never replace support with a ray.
      for (const other of shapes) if (!other.character) {
        const hit = other.shape.castShape(other.position, other.rotation, { x: 0, y: 0, z: 0 }, capsule.shape, raised, capsule.rotation, { x: 0, y: -2 * skin, z: 0 }, skin, 1, false);
        if (!hit) continue;
        const normal = new THREE.Vector3().copy(hit.normal1).applyQuaternion(other.rotation), amount = 2 * skin * (1 - hit.time_of_impact);
        if (normal.y >= Math.cos(settings.maximumSlopeRadians) && amount <= skin + 1e-5) lift = Math.max(lift, Math.min(skin, amount));
      }
      lifts.set(capsule.id, lift);
    }
    for (const capsule of shapes) {
      const lift = lifts.get(capsule.id) ?? 0; if (!capsule.character || lift <= 1e-7) continue;
      const position = capsule.position.clone(); position.y += lift;
      for (const other of shapes) if (other.id !== capsule.id) {
        const otherPosition = other.position.clone(); otherPosition.y += lifts.get(other.id) ?? 0;
        const contact = capsule.shape.contactShape(position, capsule.rotation, other.shape, otherPosition, other.rotation, 0);
        if (contact && contact.distance < -.001) geometryError('PHYSICS_SPAWN_CLEARANCE_BLOCKED', `The initial contact clearance for ${capsule.id} overlaps ${other.id}. Provide enough room for the character body and collision offset.`);
      }
    }
    return lifts;
  }
  private prepareCharacterClearance(): void {
    const geometryChanged = [...this.queryDirty].some(id => { const entry = this.entries.get(id); return entry && !entry.character && entry.enabled; });
    const targets = new Set([...this.entries.values()].filter(entry => entry.character && entry.enabled && (entry.character.needsClearance || geometryChanged)).map(entry => entry.id));
    if (!targets.size) return;
    const shapes: QueryShape[] = [];
    for (const entry of this.entries.values()) if (entry.enabled) for (const collider of entry.colliders) shapes.push({ id: entry.id, character: Boolean(entry.character), changed: false, shape: collider.shape,
      position: new THREE.Vector3().copy(collider.translation()), rotation: new THREE.Quaternion().copy(collider.rotation()), ...(entry.character ? { settings: entry.character.settings } : {}) });
    const lifts = this.clearanceLifts(shapes, targets);
    for (const [id, lift] of lifts) {
      const entry = this.entries.get(id)!; entry.character!.needsClearance = false;
      if (lift <= 1e-7) continue;
      const position = new THREE.Vector3().copy(entry.body.translation()); position.y += lift;
      entry.body.setTranslation(position, true); entry.body.setNextKinematicTranslation(position);
      setLocalPosition(entry.object, entry.object.parent ? entry.object.parent.worldToLocal(position.clone()) : position);
      this.queryDirty.add(entry.id);
    }
    if ([...lifts.values()].some(lift => lift > 1e-7)) this.world.propagateModifiedBodyPositionsToColliders();
  }
  private constrainDirtyMotion(proposal: CharacterProposal): void {
    // Native KCC cannot yet see fresh broad-phase entries. During this one
    // synchronization tick, sweep its actual capsule against edited solids.
    // This conservatively stops at their first TOI; only KCC reads support.
    const capsule = proposal.entry.colliders[0]!;
    let fraction = 1;
    for (const id of this.queryDirty) {
      const entry = this.entries.get(id); if (!entry || entry.character || !entry.enabled) continue;
      proposal.supportNeedsRefresh = true;
      for (const collider of entry.colliders) {
        const overlap = capsule.contactCollider(collider, 0);
        if (overlap && overlap.distance < -.001) geometryError('PHYSICS_CHARACTER_OVERLAP', `Published physics overlaps a character: ${proposal.entry.id}, ${id}. Validate a non-overlapping candidate before publication.`);
        const hit = capsule.castCollider(proposal.movement, collider, { x: 0, y: 0, z: 0 }, proposal.entry.character!.settings.collisionOffsetMeters, fraction, false);
        if (hit && hit.time_of_impact < fraction) { fraction = Math.max(0, hit.time_of_impact); proposal.collisions.add(id); }
      }
    }
    if (fraction < 1) { proposal.correction.addScaledVector(proposal.movement, fraction - 1); proposal.movement.multiplyScalar(fraction); }
  }
  private constrainCharacterMotion(proposals: CharacterProposal[]): void {
    // Pair casts use the actual Rapier capsules and both proposed translations;
    // no replacement bounds or second ground solver. Stable order is independent
    // of entity registration order, and a stationary actor is never pushed by
    // another actor's previous-frame velocity.
    proposals.sort((a, b) => a.entry.id.localeCompare(b.entry.id));
    for (let pass = 0; pass < 12; pass++) {
      const changed = new Set<CharacterProposal>();
      for (let i = 0; i < proposals.length; i++) for (let j = i + 1; j < proposals.length; j++) {
        const a = proposals[i]!, b = proposals[j]!, first = a.entry.colliders[0]!, second = b.entry.colliders[0]!;
        if (pass === 0 && (this.queryDirty.has(a.entry.id) || this.queryDirty.has(b.entry.id))) {
          const overlap = first.contactCollider(second, 0);
          if (overlap && overlap.distance < -.001) geometryError('PHYSICS_CHARACTER_OVERLAP', `Published characters overlap: ${a.entry.id}, ${b.entry.id}. Validate a non-overlapping candidate before publication.`);
        }
        const distance = Math.max(a.entry.character!.settings.collisionOffsetMeters, b.entry.character!.settings.collisionOffsetMeters);
        const hit = first.castCollider(a.movement, second, b.movement, distance, 1, false);
        if (!hit || hit.time_of_impact >= 1) continue;
        a.collisions.add(b.entry.id); b.collisions.add(a.entry.id);
        const normal = new THREE.Vector3().copy(hit.normal1).applyQuaternion(first.rotation()).normalize();
        const closing = a.movement.clone().sub(b.movement).dot(normal);
        if (closing <= 1e-7) continue;
        const aInward = Math.max(0, a.movement.dot(normal)), bInward = Math.max(0, -b.movement.dot(normal)), inward = aInward + bInward;
        if (inward <= 1e-10) continue;
        const correction = closing * (1 - Math.max(0, hit.time_of_impact));
        for (const [proposal, amount] of [[a, -correction * aInward / inward], [b, correction * bInward / inward]] as const) if (Math.abs(amount) > 1e-8) {
          proposal.correction.addScaledVector(normal, amount); proposal.movement.addScaledVector(normal, amount); proposal.supportNeedsRefresh = true; changed.add(proposal);
        }
      }
      if (!changed.size) return;
      // Only re-run KCC when the corrected trajectory actually meets environment
      // geometry. Re-running its stair/snap heuristics for an already clear path
      // can introduce a stop/start cycle from tiny contact-offset rounding.
      for (const proposal of changed) {
        const collider = proposal.entry.colliders[0]!;
        const hit = this.world.castShape(collider.translation(), collider.rotation(), proposal.movement, collider.shape, 0, 1, false,
          RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined,
          other => this.entries.get(this.colliderOwners.get(other.handle) ?? '')?.kind !== 'character');
        if (hit) this.computeEnvironmentMotion(proposal); else this.constrainDirtyMotion(proposal);
      }
    }
  }
  step(deltaSeconds: number, drives: Readonly<Record<string, CharacterDrive>>): void {
    this.live(); validateNumber(deltaSeconds, 0, 'deltaSeconds'); if (deltaSeconds > .1) geometryError('PHYSICS_TIMESTEP_INVALID', 'Use fixed steps of at most 0.1 seconds.');
    if (!drives || typeof drives !== 'object' || Array.isArray(drives)) geometryError('PHYSICS_DRIVE_INVALID', 'drives must be an entity-indexed record.');
    for (const [id, drive] of Object.entries(drives)) {
      if (!this.entry(id).character || !drive || typeof drive !== 'object' || Array.isArray(drive)) geometryError('PHYSICS_DRIVE_INVALID', 'Character drive must be an object for a registered character.');
      if ('velocityWorldMetersPerSecondXYZ' in drive) {
        if (!Array.isArray(drive.velocityWorldMetersPerSecondXYZ) || !finiteVector(drive.velocityWorldMetersPerSecondXYZ) || typeof drive.applyGravity !== 'boolean' || Object.keys(drive).some(key => !['velocityWorldMetersPerSecondXYZ', 'applyGravity'].includes(key))) geometryError('PHYSICS_DRIVE_INVALID', 'Spatial drive needs finite world XYZ velocity and explicit applyGravity.');
      } else if (!Array.isArray(drive.velocityMetersPerSecondXZ) || !finiteVector(drive.velocityMetersPerSecondXZ, 2) || (drive.jumpPressed !== undefined && typeof drive.jumpPressed !== 'boolean') || Object.keys(drive).some(key => !['velocityMetersPerSecondXZ', 'jumpPressed'].includes(key))) geometryError('PHYSICS_DRIVE_INVALID', 'Ground drive needs finite XZ velocity and an optional jump edge.');
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
        if (geometrySignature(entry.object, pose) !== entry.geometry!.signature) updates.push({ previous: entry, plan: this.rigidPlan(entry.id, entry.object, entry.options!, undefined, true) });
      }
    }
    this.budget(updates);
    const staged: { previous: Entity; entry: Entity }[] = [];
    try { for (const update of updates) staged.push({ previous: update.previous, entry: this.construct(update.previous.id, update.previous.object, update.previous.kind, update.plan, update.previous.options, update.previous.initial, update.previous) }); }
    catch (error) { for (const { entry } of staged) this.destroy(entry); throw error; }
    for (const { previous, entry } of staged) this.publish(entry, previous);
    this.world.timestep = deltaSeconds;
    for (const entry of this.entries.values()) {
      entry.body.setEnabled(entry.enabled && entry.colliders.length > 0);
      if (!entry.body.isEnabled()) continue;
      const pose = poses.get(entry.id)!;
      if (entry.kind === 'fixed') {
        // Compare authored poses with authored poses: Rapier stores float32,
        // whose rounding must not make an unchanged obstacle dirty every tick.
        const previous = entry.fixedQueryPose!;
        if (pose.position.distanceToSquared(previous.position) > 1e-14 || 1 - Math.abs(pose.rotation.dot(previous.rotation)) > 1e-12) { this.queryDirty.add(entry.id); entry.fixedQueryPose = copyPose(pose); }
        entry.body.setTranslation(pose.position, false); entry.body.setRotation(pose.rotation, false);
      }
      else if (entry.kind === 'kinematic') { entry.body.setNextKinematicTranslation(pose.position); entry.body.setNextKinematicRotation(pose.rotation); }
    }
    this.world.propagateModifiedBodyPositionsToColliders();
    this.prepareCharacterClearance();
    const proposed: CharacterProposal[] = [];
    const platforms: KinematicQueryState[] = [];
    try {
      // KCC's implicit kinematic friction cancels its own separation nudge and
      // can prevent voluntary walking even on a stationary platform. Keep every
      // native collider queryable, while reading these same bodies as fixed only
      // during queries. Restore all motion state before the one real world step.
      for (const entry of this.entries.values()) if (entry.kind === 'kinematic' && entry.enabled) {
        const body = entry.body;
        platforms.push({ entry, type: body.bodyType(), linearVelocity: new THREE.Vector3().copy(body.linvel()), angularVelocity: new THREE.Vector3().copy(body.angvel()), nextPosition: new THREE.Vector3().copy(body.nextTranslation()), nextRotation: new THREE.Quaternion().copy(body.nextRotation()), sleeping: body.isSleeping(), enabled: body.isEnabled() });
        body.setBodyType(RAPIER.RigidBodyType.Fixed, false);
      }
      // All characters query the same committed world, then resolve their relative
      // motion together. Other characters must not inject previous-tick platform
      // velocity into KCC: Rapier's kinematic friction also applies at side contacts.
      for (const entry of this.entries.values()) {
        const character = entry.character; if (!character || !entry.body.isEnabled()) continue;
        const drive = drives[entry.id], spatial = drive && 'velocityWorldMetersPerSecondXYZ' in drive ? drive : undefined;
        const ground = drive && 'velocityMetersPerSecondXZ' in drive ? drive : undefined;
        const driveMode: DriveMode = spatial ? spatial.applyGravity ? 'velocity-gravity' : 'velocity-direct' : 'ground';
        const previousVerticalVelocity = driveMode === character.driveMode ? character.verticalVelocity : 0;
        const applyGravity = driveMode !== 'velocity-direct';
        let verticalVelocity = applyGravity ? character.grounded && previousVerticalVelocity < 0 ? -.1 : previousVerticalVelocity + this.gravity[1] * deltaSeconds : 0;
        if (ground?.jumpPressed && character.grounded) verticalVelocity = character.settings.jumpSpeedMetersPerSecond;
        if (applyGravity) {
          character.controller.enableAutostep(character.settings.maximumStepHeightMeters, character.settings.minimumStepWidthMeters, false);
          character.controller.enableSnapToGround(character.settings.snapToGroundDistanceMeters);
        } else { character.controller.disableAutostep(); character.controller.disableSnapToGround(); }
        const velocity = spatial ? spatial.velocityWorldMetersPerSecondXYZ : [ground?.velocityMetersPerSecondXZ[0] ?? 0, 0, ground?.velocityMetersPerSecondXZ[1] ?? 0];
        const proposal: CharacterProposal = { entry, driveMode,
          desired: new THREE.Vector3(velocity[0]! * deltaSeconds, (velocity[1]! + verticalVelocity) * deltaSeconds, velocity[2]! * deltaSeconds),
          correction: new THREE.Vector3(), movement: new THREE.Vector3(), supportNeedsRefresh: platforms.length > 0, verticalVelocity, grounded: false, collisions: new Set() };
        this.addSupportCarry(proposal, platforms);
        this.computeEnvironmentMotion(proposal); proposed.push(proposal);
      }
      this.constrainCharacterMotion(proposed);
    } finally { this.restoreKinematicQueries(platforms); }
    for (const proposal of proposed) {
      const before = proposal.entry.body.translation();
      proposal.entry.body.setNextKinematicTranslation({ x: before.x + proposal.movement.x, y: before.y + proposal.movement.y, z: before.z + proposal.movement.z });
    }
    this.world.step();
    this.queryDirty.clear();
    for (const proposal of proposed) if (proposal.supportNeedsRefresh) {
      const controller = proposal.entry.character!.controller;
      // Read support at the position that was actually committed. Do not apply
      // the query's displacement or advance a second physics step.
      controller.disableSnapToGround();
      controller.computeColliderMovement(proposal.entry.colliders[0]!, { x: 0, y: 0, z: 0 }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined,
        collider => this.entries.get(this.colliderOwners.get(collider.handle) ?? '')?.kind !== 'character');
      proposal.grounded = controller.computedGrounded();
    }
    for (let i = 0; i < proposed.length; i++) for (let j = i + 1; j < proposed.length; j++) {
      const a = proposed[i]!, b = proposed[j]!, distance = Math.max(a.entry.character!.settings.collisionOffsetMeters, b.entry.character!.settings.collisionOffsetMeters) + 1e-4;
      const contact = a.entry.colliders[0]!.contactCollider(b.entry.colliders[0]!, distance);
      if (!contact) continue;
      a.collisions.add(b.entry.id); b.collisions.add(a.entry.id);
      if (contact.normal1.y < -Math.cos(a.entry.character!.settings.maximumSlopeRadians) && a.verticalVelocity <= 0) { a.grounded = true; a.verticalVelocity = 0; }
      if (contact.normal2.y < -Math.cos(b.entry.character!.settings.maximumSlopeRadians) && b.verticalVelocity <= 0) { b.grounded = true; b.verticalVelocity = 0; }
    }
    for (const proposal of proposed) Object.assign(proposal.entry.character!, { driveMode: proposal.driveMode, verticalVelocity: proposal.verticalVelocity, grounded: proposal.grounded, collisions: [...proposal.collisions].sort() });
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
        const plan = previous.character ? this.characterPlan(previous.object, previous.character.settings, previous.initial.pose) : this.rigidPlan(previous.id, previous.object, previous.options!, previous.initial.geometry);
        const entry = this.construct(previous.id, previous.object, previous.kind, plan, previous.options, previous.initial);
        staged.push({ previous, entry });
      }
    } catch (error) { for (const { entry } of staged) this.destroy(entry); throw error; }
    for (const { previous, entry } of staged) { restoreLocal(entry.object, entry.initial.local); this.publish(entry, previous); }
  }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.entries.clear(); this.colliderOwners.clear(); this.colliderSources.clear(); this.queryDirty.clear(); this.world.free(); }
}
