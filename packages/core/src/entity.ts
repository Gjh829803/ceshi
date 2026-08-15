import type {
  AppearanceBinding,
  Disposable,
  EntityId,
  TransformSpec,
} from "@whitebox-world/contracts";
import { Group, Object3D } from "three";
import { Object3DTransform } from "./transform";

export type EntityState = "detached" | "attached" | "disposed";

export interface EntityOptions {
  id: EntityId;
  name?: string;
  object3D?: Object3D;
  transform?: TransformSpec;
  appearance?: AppearanceBinding;
}

interface EntityHost {
  detachEntity(entity: Entity, disposed: boolean): void;
}

/**
 * The smallest tracked unit in a World.
 *
 * An Entity owns a scene root and any explicitly registered Disposable
 * resources. Geometry and materials are deliberately not disposed implicitly;
 * callers should register shared/owned assets explicitly with `own`.
 */
export class Entity implements Disposable {
  public readonly id: EntityId;
  public readonly object3D: Object3D;
  public readonly transform: Object3DTransform;
  public readonly appearance: AppearanceBinding | undefined;

  #state: EntityState = "detached";
  #host: EntityHost | undefined;
  #ownedResources = new Set<Disposable>();

  public constructor(options: EntityOptions) {
    if (options.id.trim().length === 0) {
      throw new Error("Entity id must not be empty.");
    }

    this.id = options.id;
    this.object3D = options.object3D ?? new Group();
    this.object3D.name = options.name ?? (this.object3D.name || options.id);
    this.object3D.userData.entityId = options.id;
    this.transform = new Object3DTransform(this.object3D);
    this.appearance = options.appearance;
    if (options.transform !== undefined) this.transform.apply(options.transform);
  }

  public get state(): EntityState {
    return this.#state;
  }

  public get disposed(): boolean {
    return this.#state === "disposed";
  }

  public attach(object: Object3D): this {
    this.#assertUsable();
    this.object3D.add(object);
    return this;
  }

  /** Register a resource that must be disposed when this entity is disposed. */
  public own<T extends Disposable>(resource: T): T {
    this.#assertUsable();
    this.#ownedResources.add(resource);
    return resource;
  }

  /** Stop owning a resource, optionally disposing it immediately. */
  public release(resource: Disposable, dispose = false): boolean {
    const removed = this.#ownedResources.delete(resource);
    if (removed && dispose) resource.dispose();
    return removed;
  }

  /** @internal */
  public mount(host: EntityHost): void {
    this.#assertUsable();
    if (this.#host !== undefined) {
      throw new Error(`Entity "${this.id}" is already attached to a World.`);
    }
    this.#host = host;
    this.#state = "attached";
  }

  /** @internal */
  public unmount(host: EntityHost): void {
    if (this.#host !== host) return;
    this.#host = undefined;
    if (!this.disposed) this.#state = "detached";
  }

  public dispose(): void {
    if (this.disposed) return;

    const host = this.#host;
    this.#state = "disposed";
    const resources = [...this.#ownedResources].reverse();
    this.#ownedResources.clear();
    for (const resource of resources) resource.dispose();

    if (host !== undefined) host.detachEntity(this, true);
    this.object3D.removeFromParent();
    this.object3D.clear();
  }

  #assertUsable(): void {
    if (this.disposed) {
      throw new Error(`Entity "${this.id}" has been disposed.`);
    }
  }
}
