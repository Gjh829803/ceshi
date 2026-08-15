import type { Entity } from "@whitebox-world/core";
import type RAPIER from "@dimforge/rapier3d-compat";
import type { PhysicsBody } from "./physics-body";
import type { PhysicsSystem } from "./physics-system";

export class PhysicsCollider {
  public readonly handle: number;
  public readonly entity: Entity | undefined;
  public readonly body: PhysicsBody | undefined;
  #system: PhysicsSystem | undefined;
  #raw: RAPIER.Collider | undefined;

  /** @internal */
  public constructor(
    system: PhysicsSystem,
    raw: RAPIER.Collider,
    body: PhysicsBody | undefined,
    entity: Entity | undefined,
  ) {
    this.#system = system;
    this.#raw = raw;
    this.handle = raw.handle;
    this.body = body;
    this.entity = entity;
  }

  public get disposed(): boolean {
    return this.#raw === undefined;
  }

  public get raw(): RAPIER.Collider {
    if (this.#raw === undefined) throw new Error("PhysicsCollider has been disposed.");
    return this.#raw;
  }

  public dispose(): void {
    this.#system?.removeCollider(this);
  }

  /** @internal */
  public invalidate(): void {
    this.#system = undefined;
    this.#raw = undefined;
  }
}
