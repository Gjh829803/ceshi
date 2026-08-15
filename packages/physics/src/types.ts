import type { EntityId, Vec3Tuple } from "@whitebox-world/contracts";

export type QuaternionTuple = readonly [x: number, y: number, z: number, w: number];

export type RigidBodyKind =
  | "fixed"
  | "dynamic"
  | "kinematicPosition"
  | "kinematicVelocity";

export type TransformSyncMode = "physicsToObject" | "objectToPhysics" | "none";

export type ColliderShape =
  | { type: "box"; halfExtents: Vec3Tuple }
  | { type: "sphere"; radius: number }
  | { type: "capsule"; halfHeight: number; radius: number }
  | { type: "cylinder"; halfHeight: number; radius: number }
  | { type: "cone"; halfHeight: number; radius: number }
  | {
      type: "trimesh";
      vertices: Float32Array | readonly number[];
      indices: Uint32Array | readonly number[];
    }
  | {
      type: "heightfield";
      /** Z-axis cell count. */
      rows: number;
      /** X-axis cell count. */
      columns: number;
      /** Row-major samples: index = z * (columns + 1) + x. */
      heights: Float32Array | readonly number[];
      scale: Vec3Tuple;
    };

export interface RigidBodyOptions {
  type?: RigidBodyKind;
  position?: Vec3Tuple;
  rotation?: QuaternionTuple;
  sync?: TransformSyncMode;
  gravityScale?: number;
  linearDamping?: number;
  angularDamping?: number;
  canSleep?: boolean;
  ccd?: boolean;
  lockRotations?: boolean;
}

export interface ColliderOptions {
  shape: ColliderShape;
  translation?: Vec3Tuple;
  rotation?: QuaternionTuple;
  friction?: number;
  restitution?: number;
  density?: number;
  sensor?: boolean;
  collisionGroups?: number;
}

export interface RaycastOptions {
  origin: Vec3Tuple;
  direction: Vec3Tuple;
  maxDistance: number;
  solid?: boolean;
  collisionGroups?: number;
  excludeCollider?: import("./physics-collider").PhysicsCollider;
  excludeBody?: import("./physics-body").PhysicsBody;
}

export interface RaycastHit {
  point: Vec3Tuple;
  normal: Vec3Tuple;
  distance: number;
  entityId?: EntityId;
  collider: import("./physics-collider").PhysicsCollider | undefined;
  body: import("./physics-body").PhysicsBody | undefined;
}
