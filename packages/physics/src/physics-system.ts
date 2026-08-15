import RAPIER from "@dimforge/rapier3d-compat";
import type { FrameContext, RuntimeSystem, Vec3Tuple } from "@whitebox-world/contracts";
import type { Entity } from "@whitebox-world/core";
import { Vector3 } from "three";
import { PhysicsBody } from "./physics-body";
import { PhysicsCollider } from "./physics-collider";
import { createColliderDesc } from "./shape";
import type {
  ColliderOptions,
  QuaternionTuple,
  RaycastHit,
  RaycastOptions,
  RigidBodyKind,
  RigidBodyOptions,
  TransformSyncMode,
} from "./types";

let rapierInitialization: Promise<void> | undefined;

export async function initializeRapier(): Promise<void> {
  if (rapierInitialization === undefined) {
    rapierInitialization = RAPIER.init().catch((error: unknown) => {
      rapierInitialization = undefined;
      throw error;
    });
  }
  await rapierInitialization;
}

export interface PhysicsSystemOptions {
  id?: string;
  gravity?: Vec3Tuple;
}

function defaultSync(type: RigidBodyKind): TransformSyncMode {
  switch (type) {
    case "dynamic":
      return "physicsToObject";
    case "kinematicPosition":
      return "objectToPhysics";
    case "kinematicVelocity":
      return "physicsToObject";
    case "fixed":
      return "none";
  }
}

function bodyDescriptor(type: RigidBodyKind): RAPIER.RigidBodyDesc {
  switch (type) {
    case "fixed":
      return RAPIER.RigidBodyDesc.fixed();
    case "dynamic":
      return RAPIER.RigidBodyDesc.dynamic();
    case "kinematicPosition":
      return RAPIER.RigidBodyDesc.kinematicPositionBased();
    case "kinematicVelocity":
      return RAPIER.RigidBodyDesc.kinematicVelocityBased();
  }
}

function objectTransform(entity: Entity | undefined): {
  position: Vec3Tuple;
  rotation: QuaternionTuple;
} | undefined {
  if (entity === undefined) return undefined;
  const { position, quaternion } = entity.object3D;
  return {
    position: [position.x, position.y, position.z],
    rotation: [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
  };
}

/** Rapier owner/adapter. Construct with createPhysicsSystem so WASM is initialized. */
export class PhysicsSystem implements RuntimeSystem {
  public readonly id: string;
  public readonly rawWorld: RAPIER.World;
  #bodies = new Set<PhysicsBody>();
  #colliders = new Set<PhysicsCollider>();
  #collidersByHandle = new Map<number, PhysicsCollider>();
  #sceneQueriesDirty = true;
  #disposed = false;

  /** @internal */
  public constructor(options: PhysicsSystemOptions = {}) {
    this.id = options.id ?? "physics";
    const [x, y, z] = options.gravity ?? [0, -9.81, 0];
    this.rawWorld = new RAPIER.World({ x, y, z });
  }

  public createRigidBody(
    entity: Entity | undefined,
    options: RigidBodyOptions = {},
  ): PhysicsBody {
    this.#assertUsable();
    const type = options.type ?? "dynamic";
    const entityTransform = objectTransform(entity);
    const position = options.position ?? entityTransform?.position ?? [0, 0, 0];
    const rotation = options.rotation ?? entityTransform?.rotation ?? [0, 0, 0, 1];
    const desc = bodyDescriptor(type)
      .setTranslation(...position)
      .setRotation({ x: rotation[0], y: rotation[1], z: rotation[2], w: rotation[3] });

    if (options.gravityScale !== undefined) desc.setGravityScale(options.gravityScale);
    if (options.linearDamping !== undefined) desc.setLinearDamping(options.linearDamping);
    if (options.angularDamping !== undefined) desc.setAngularDamping(options.angularDamping);
    if (options.canSleep !== undefined) desc.setCanSleep(options.canSleep);
    if (options.ccd !== undefined) desc.setCcdEnabled(options.ccd);
    if (options.lockRotations === true) desc.lockRotations();

    const raw = this.rawWorld.createRigidBody(desc);
    const body = new PhysicsBody(this, raw, entity, options.sync ?? defaultSync(type));
    raw.userData = { entityId: entity?.id };
    this.#bodies.add(body);
    if (entity !== undefined) entity.own(body);
    return body;
  }

  public createCollider(
    options: ColliderOptions,
    body?: PhysicsBody,
    entity?: Entity,
  ): PhysicsCollider {
    this.#assertUsable();
    if (body?.disposed === true) throw new Error("Cannot attach to a disposed PhysicsBody.");
    if (body !== undefined && !this.#bodies.has(body)) {
      throw new Error("PhysicsBody belongs to a different PhysicsSystem.");
    }

    const desc = createColliderDesc(options.shape);
    if (options.translation !== undefined) desc.setTranslation(...options.translation);
    if (options.rotation !== undefined) {
      const [x, y, z, w] = options.rotation;
      desc.setRotation({ x, y, z, w });
    }
    if (options.friction !== undefined) desc.setFriction(options.friction);
    if (options.restitution !== undefined) desc.setRestitution(options.restitution);
    if (options.density !== undefined) desc.setDensity(options.density);
    if (options.sensor !== undefined) desc.setSensor(options.sensor);
    if (options.collisionGroups !== undefined) desc.setCollisionGroups(options.collisionGroups);

    const ownerEntity = body?.entity ?? entity;
    if (body === undefined && entity !== undefined && options.translation === undefined) {
      const { x, y, z } = entity.object3D.position;
      desc.setTranslation(x, y, z);
      const { quaternion } = entity.object3D;
      desc.setRotation(quaternion);
    }

    const raw = this.rawWorld.createCollider(desc, body?.raw);
    raw.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    const collider = new PhysicsCollider(this, raw, body, ownerEntity);
    this.#colliders.add(collider);
    this.#collidersByHandle.set(raw.handle, collider);
    this.#sceneQueriesDirty = true;
    body?.addCollider(collider);
    if (body === undefined && entity !== undefined) entity.own(collider);
    return collider;
  }

  public fixedUpdate(context: FrameContext): void {
    this.#assertUsable();
    for (const body of this.#bodies) this.#syncObjectToPhysics(body);
    this.rawWorld.timestep = context.deltaSeconds;
    this.rawWorld.step();
    this.#sceneQueriesDirty = false;
    for (const body of this.#bodies) this.#syncPhysicsToObject(body);
  }

  public raycast(options: RaycastOptions): RaycastHit | null {
    this.#assertUsable();
    if (!Number.isFinite(options.maxDistance) || options.maxDistance < 0) {
      throw new Error("Ray maxDistance must be finite and non-negative.");
    }
    const direction = new Vector3(...options.direction);
    if (direction.lengthSq() === 0) throw new Error("Ray direction must not be zero.");
    direction.normalize();
    const [x, y, z] = options.origin;
    const ray = new RAPIER.Ray({ x, y, z }, direction);
    const solid = options.solid ?? true;
    let collider: PhysicsCollider | undefined;
    let timeOfImpact: number;
    let normal: Vec3Tuple;

    if (this.#sceneQueriesDirty) {
      // Rapier's broad phase is populated by World.step. Feature builders may
      // need a query immediately after creating a collider, so use the exact
      // per-collider query until the next fixed step refreshes the broad phase.
      let nearest:
        | { collider: PhysicsCollider; timeOfImpact: number; normal: Vec3Tuple }
        | undefined;
      for (const candidate of this.#colliders) {
        if (candidate === options.excludeCollider || candidate.body === options.excludeBody) continue;
        if (
          options.collisionGroups !== undefined &&
          !groupsInteract(options.collisionGroups, candidate.raw.collisionGroups())
        ) {
          continue;
        }
        const candidateHit = candidate.raw.castRayAndGetNormal(
          ray,
          options.maxDistance,
          solid,
        );
        if (
          candidateHit !== null &&
          (nearest === undefined || candidateHit.timeOfImpact < nearest.timeOfImpact)
        ) {
          nearest = {
            collider: candidate,
            timeOfImpact: candidateHit.timeOfImpact,
            normal: [candidateHit.normal.x, candidateHit.normal.y, candidateHit.normal.z],
          };
        }
      }
      if (nearest === undefined) return null;
      collider = nearest.collider;
      timeOfImpact = nearest.timeOfImpact;
      normal = nearest.normal;
    } else {
      const hit = this.rawWorld.castRayAndGetNormal(
        ray,
        options.maxDistance,
        solid,
        undefined,
        options.collisionGroups,
        options.excludeCollider?.raw,
        options.excludeBody?.raw,
      );
      if (hit === null) return null;
      collider = this.#collidersByHandle.get(hit.collider.handle);
      timeOfImpact = hit.timeOfImpact;
      normal = [hit.normal.x, hit.normal.y, hit.normal.z];
    }

    const point = ray.pointAt(timeOfImpact);
    const result: RaycastHit = {
      point: [point.x, point.y, point.z],
      normal,
      distance: timeOfImpact,
      collider,
      body: collider?.body,
    };
    const entityId = collider?.entity?.id;
    if (entityId !== undefined) result.entityId = entityId;
    return result;
  }

  public removeCollider(collider: PhysicsCollider): void {
    if (!this.#colliders.delete(collider)) return;
    this.#collidersByHandle.delete(collider.handle);
    this.#sceneQueriesDirty = true;
    collider.body?.forgetCollider(collider);
    if (collider.raw.isValid()) this.rawWorld.removeCollider(collider.raw, true);
    collider.invalidate();
  }

  public removeBody(body: PhysicsBody): void {
    if (!this.#bodies.delete(body)) return;
    for (const collider of body.listColliders()) {
      this.#colliders.delete(collider);
      this.#collidersByHandle.delete(collider.handle);
    }
    this.#sceneQueriesDirty = true;
    if (body.raw.isValid()) this.rawWorld.removeRigidBody(body.raw);
    body.invalidate();
  }

  public dispose(): void {
    if (this.#disposed) return;
    for (const body of [...this.#bodies]) this.removeBody(body);
    for (const collider of [...this.#colliders]) this.removeCollider(collider);
    this.rawWorld.free();
    this.#disposed = true;
  }

  #syncObjectToPhysics(body: PhysicsBody): void {
    if (body.sync !== "objectToPhysics" || body.entity === undefined) return;
    const { position, quaternion } = body.entity.object3D;
    if (body.raw.isKinematic()) {
      body.raw.setNextKinematicTranslation(position);
      body.raw.setNextKinematicRotation(quaternion);
    } else {
      body.raw.setTranslation(position, true);
      body.raw.setRotation(quaternion, true);
    }
  }

  #syncPhysicsToObject(body: PhysicsBody): void {
    if (body.sync !== "physicsToObject" || body.entity === undefined) return;
    const translation = body.raw.translation();
    const rotation = body.raw.rotation();
    body.entity.object3D.position.set(translation.x, translation.y, translation.z);
    body.entity.object3D.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
  }

  #assertUsable(): void {
    if (this.#disposed) throw new Error("PhysicsSystem has been disposed.");
  }
}

function groupsInteract(queryGroups: number, colliderGroups: number): boolean {
  const queryMemberships = (queryGroups >>> 16) & 0xffff;
  const queryFilter = queryGroups & 0xffff;
  const colliderMemberships = (colliderGroups >>> 16) & 0xffff;
  const colliderFilter = colliderGroups & 0xffff;
  return (
    (queryMemberships & colliderFilter) !== 0 &&
    (colliderMemberships & queryFilter) !== 0
  );
}

export async function createPhysicsSystem(
  options: PhysicsSystemOptions = {},
): Promise<PhysicsSystem> {
  await initializeRapier();
  return new PhysicsSystem(options);
}
