import type RAPIER from "@dimforge/rapier3d-compat";
import type { Entity } from "@whitebox-world/core";
import type { ColliderOptions, TransformSyncMode } from "./types";
import type { PhysicsSystem } from "./physics-system";
import { PhysicsCollider } from "./physics-collider";

export class PhysicsBody {
  public readonly handle: number;
  public readonly entity: Entity | undefined;
  public readonly sync: TransformSyncMode;
  #system: PhysicsSystem | undefined;
  #raw: RAPIER.RigidBody | undefined;
  #colliders = new Set<PhysicsCollider>();

  /** @internal */
  public constructor(
    system: PhysicsSystem,
    raw: RAPIER.RigidBody,
    entity: Entity | undefined,
    sync: TransformSyncMode,
  ) {
    this.#system = system;
    this.#raw = raw;
    this.handle = raw.handle;
    this.entity = entity;
    this.sync = sync;
  }

  public get disposed(): boolean {
    return this.#raw === undefined;
  }

  public get raw(): RAPIER.RigidBody {
    if (this.#raw === undefined) throw new Error("PhysicsBody has been disposed.");
    return this.#raw;
  }

  public createCollider(options: ColliderOptions): PhysicsCollider {
    if (this.#system === undefined) throw new Error("PhysicsBody has been disposed.");
    return this.#system.createCollider(options, this);
  }

  public listColliders(): readonly PhysicsCollider[] {
    return [...this.#colliders];
  }

  public dispose(): void {
    this.#system?.removeBody(this);
  }

  /** @internal */
  public addCollider(collider: PhysicsCollider): void {
    this.#colliders.add(collider);
  }

  /** @internal */
  public forgetCollider(collider: PhysicsCollider): void {
    this.#colliders.delete(collider);
  }

  /** @internal */
  public invalidate(): void {
    for (const collider of this.#colliders) collider.invalidate();
    this.#colliders.clear();
    this.#system = undefined;
    this.#raw = undefined;
  }
}
