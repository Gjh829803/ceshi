export type EntityComponentLifecycleStateV1 =
  | "constructed"
  | "activating"
  | "active"
  | "disposing"
  | "disposed";

function requireNonEmptyIdentifier(value: string, label: string): void {
  if (value.trim().length === 0) throw new TypeError(`${label}_EMPTY`);
}

function lifecycleFailure(
  code: string,
  primaryFailure: unknown,
  cleanupFailures: readonly unknown[] = [],
): AggregateError {
  return new AggregateError(
    [primaryFailure, ...cleanupFailures],
    code,
  );
}

function disposeInReverse<T>(
  values: readonly T[],
  dispose: (value: T) => void,
): unknown[] {
  const failures: unknown[] = [];
  for (const value of [...values].reverse()) {
    try {
      dispose(value);
    } catch (error) {
      failures.push(error);
    }
  }
  return failures;
}

/**
 * Engine-neutral behavior unit owned by exactly one Runtime Entity.
 *
 * The framework owns lifecycle order. Components must not create independent
 * render-frame ticks; their owning World Session invokes the appropriate fixed
 * phase explicitly.
 */
export abstract class EntityComponentV1 {
  private owner: RuntimeEntityV1 | undefined;
  private lifecycleState: EntityComponentLifecycleStateV1 = "constructed";

  protected constructor(readonly componentId: string) {
    requireNonEmptyIdentifier(componentId, "ENTITY_COMPONENT_ID");
  }

  get entityId(): string {
    if (this.owner === undefined) throw new Error("ENTITY_COMPONENT_NOT_REGISTERED");
    return this.owner.entityId;
  }

  get state(): EntityComponentLifecycleStateV1 {
    return this.lifecycleState;
  }

  /** @internal RuntimeEntityV1 is the only component owner. */
  bindOwner(owner: RuntimeEntityV1): void {
    if (this.owner !== undefined) throw new Error("ENTITY_COMPONENT_OWNER_ALREADY_BOUND");
    this.owner = owner;
  }

  /** @internal RuntimeEntityV1 owns component activation order. */
  activate(): void {
    if (this.lifecycleState === "disposed") throw new Error("ENTITY_COMPONENT_DISPOSED");
    if (this.lifecycleState === "active") return;
    if (this.lifecycleState !== "constructed") {
      throw new Error(`ENTITY_COMPONENT_LIFECYCLE_REENTRANT: ${this.lifecycleState}`);
    }
    this.lifecycleState = "activating";
    try {
      this.onActivate();
      this.lifecycleState = "active";
    } catch (activationFailure) {
      const cleanupFailures: unknown[] = [];
      this.lifecycleState = "disposing";
      try {
        this.onDispose();
      } catch (cleanupFailure) {
        cleanupFailures.push(cleanupFailure);
      } finally {
        this.lifecycleState = "disposed";
      }
      throw lifecycleFailure(
        "ENTITY_COMPONENT_ACTIVATION_FAILED",
        activationFailure,
        cleanupFailures,
      );
    }
  }

  /** @internal RuntimeEntityV1 owns reverse-order disposal. */
  dispose(): void {
    if (this.lifecycleState === "disposed") return;
    if (this.lifecycleState === "disposing") return;
    if (this.lifecycleState === "activating") {
      throw new Error("ENTITY_COMPONENT_LIFECYCLE_REENTRANT: activating");
    }
    this.lifecycleState = "disposing";
    try {
      this.onDispose();
    } finally {
      this.lifecycleState = "disposed";
    }
  }

  protected onActivate(): void {}

  protected onDispose(): void {}
}

/**
 * A component that participates in a hierarchy. Transform math is deliberately
 * provider-owned: Babylon, a server simulation, or another runtime adapter may
 * apply this attachment to different native transform systems.
 */
export abstract class SceneComponentV1 extends EntityComponentV1 {
  private parentSceneComponent: SceneComponentV1 | undefined;
  private readonly childSceneComponents = new Set<SceneComponentV1>();

  get parent(): SceneComponentV1 | undefined {
    return this.parentSceneComponent;
  }

  get children(): readonly SceneComponentV1[] {
    return [...this.childSceneComponents];
  }

  attachTo(parent: SceneComponentV1): void {
    if (this.state === "disposed" || this.state === "disposing") {
      throw new Error("SCENE_COMPONENT_DISPOSED");
    }
    if (parent.state === "disposed" || parent.state === "disposing") {
      throw new Error("SCENE_COMPONENT_PARENT_DISPOSED");
    }
    if (parent === this) throw new Error("SCENE_COMPONENT_SELF_ATTACHMENT");
    for (let ancestor: SceneComponentV1 | undefined = parent; ancestor !== undefined; ancestor = ancestor.parent) {
      if (ancestor === this) throw new Error("SCENE_COMPONENT_ATTACHMENT_CYCLE");
    }
    if (this.parentSceneComponent === parent) return;
    this.detach();
    this.parentSceneComponent = parent;
    parent.childSceneComponents.add(this);
    this.onAttachmentChanged(parent);
  }

  detach(): void {
    const parent = this.parentSceneComponent;
    if (parent === undefined) return;
    parent.childSceneComponents.delete(this);
    this.parentSceneComponent = undefined;
    this.onAttachmentChanged(undefined);
  }

  protected onAttachmentChanged(_parent: SceneComponentV1 | undefined): void {}

  protected override onDispose(): void {
    this.detach();
    for (const child of [...this.childSceneComponents]) child.detach();
  }
}

export class RuntimeEntityV1 {
  private readonly componentsById = new Map<string, EntityComponentV1>();
  private active = false;
  private disposed = false;

  constructor(readonly entityId: string) {
    requireNonEmptyIdentifier(entityId, "RUNTIME_ENTITY_ID");
  }

  registerComponent<TComponent extends EntityComponentV1>(component: TComponent): TComponent {
    if (this.disposed) throw new Error("RUNTIME_ENTITY_DISPOSED");
    if (this.componentsById.has(component.componentId)) {
      throw new Error(`RUNTIME_ENTITY_COMPONENT_DUPLICATE: ${component.componentId}`);
    }
    component.bindOwner(this);
    this.componentsById.set(component.componentId, component);
    if (this.active) {
      try {
        component.activate();
      } catch (activationFailure) {
        this.componentsById.delete(component.componentId);
        throw lifecycleFailure(
          "RUNTIME_ENTITY_COMPONENT_ACTIVATION_FAILED",
          activationFailure,
        );
      }
    }
    return component;
  }

  component<TComponent extends EntityComponentV1>(
    componentId: string,
  ): TComponent | undefined {
    return this.componentsById.get(componentId) as TComponent | undefined;
  }

  components(): readonly EntityComponentV1[] {
    return [...this.componentsById.values()];
  }

  activate(): void {
    if (this.disposed) throw new Error("RUNTIME_ENTITY_DISPOSED");
    if (this.active) return;
    try {
      for (const component of this.componentsById.values()) component.activate();
      this.active = true;
    } catch (activationFailure) {
      this.disposed = true;
      const cleanupFailures = disposeInReverse(
        [...this.componentsById.values()],
        (component) => component.dispose(),
      );
      this.componentsById.clear();
      throw lifecycleFailure(
        "RUNTIME_ENTITY_ACTIVATION_FAILED",
        activationFailure,
        cleanupFailures,
      );
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const failures = disposeInReverse(
      [...this.componentsById.values()],
      (component) => component.dispose(),
    );
    this.componentsById.clear();
    if (failures.length > 0) {
      throw new AggregateError(failures, "RUNTIME_ENTITY_DISPOSAL_FAILED");
    }
  }
}

/** World-owned index for Runtime Entity lookup and deterministic disposal. */
export class EntityRegistryV1 {
  private readonly entitiesById = new Map<string, RuntimeEntityV1>();
  private active = false;
  private disposed = false;

  register<T extends RuntimeEntityV1>(entity: T): T {
    if (this.disposed) throw new Error("ENTITY_REGISTRY_DISPOSED");
    if (this.entitiesById.has(entity.entityId)) {
      throw new Error(`ENTITY_REGISTRY_DUPLICATE: ${entity.entityId}`);
    }
    this.entitiesById.set(entity.entityId, entity);
    if (this.active) {
      try {
        entity.activate();
      } catch (activationFailure) {
        this.entitiesById.delete(entity.entityId);
        throw lifecycleFailure(
          "ENTITY_REGISTRY_ENTITY_ACTIVATION_FAILED",
          activationFailure,
        );
      }
    }
    return entity;
  }

  entity(entityId: string): RuntimeEntityV1 | undefined {
    return this.entitiesById.get(entityId);
  }

  entities(): readonly RuntimeEntityV1[] {
    return [...this.entitiesById.values()];
  }

  activateAll(): void {
    if (this.disposed) throw new Error("ENTITY_REGISTRY_DISPOSED");
    if (this.active) return;
    try {
      for (const entity of this.entitiesById.values()) entity.activate();
      this.active = true;
    } catch (activationFailure) {
      this.disposed = true;
      const cleanupFailures = disposeInReverse(
        [...this.entitiesById.values()],
        (entity) => entity.dispose(),
      );
      this.entitiesById.clear();
      throw lifecycleFailure(
        "ENTITY_REGISTRY_ACTIVATION_FAILED",
        activationFailure,
        cleanupFailures,
      );
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.active = false;
    const failures = disposeInReverse(
      [...this.entitiesById.values()],
      (entity) => entity.dispose(),
    );
    this.entitiesById.clear();
    if (failures.length > 0) {
      throw new AggregateError(failures, "ENTITY_REGISTRY_DISPOSAL_FAILED");
    }
  }
}
