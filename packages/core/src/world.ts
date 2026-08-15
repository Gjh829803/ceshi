import type {
  EntityId,
  FrameContext,
  RuntimeSystem,
} from "@whitebox-world/contracts";
import { Scene } from "three";
import { Entity, type EntityOptions } from "./entity";
import { EventBus, type EventMap } from "./events";
import { InputState } from "./input";

export type WorldState = "idle" | "running" | "paused" | "disposed";

export interface FrameScheduler {
  request(callback: (timestampMs: number) => void): number;
  cancel(handle: number): void;
}

export interface WorldOptions {
  scene?: Scene;
  fixedDeltaSeconds?: number;
  maxFrameDeltaSeconds?: number;
  maxSubSteps?: number;
  scheduler?: FrameScheduler | null;
}

export interface SystemRegistrationOptions {
  order?: number;
}

export interface AdvanceResult {
  fixedSteps: number;
  interpolationAlpha: number;
  droppedSeconds: number;
}

export interface WorldEvents extends EventMap {
  entityAdded: { entity: Entity };
  entityRemoved: { entity: Entity; disposed: boolean };
  stateChanged: { previous: WorldState; current: WorldState };
}

interface RegisteredSystem {
  system: RuntimeSystem;
  order: number;
  sequence: number;
}

function browserScheduler(): FrameScheduler | null {
  if (
    typeof globalThis.requestAnimationFrame !== "function" ||
    typeof globalThis.cancelAnimationFrame !== "function"
  ) {
    return null;
  }
  return {
    request: (callback) => globalThis.requestAnimationFrame(callback),
    cancel: (handle) => globalThis.cancelAnimationFrame(handle),
  };
}

/** Deterministic fixed-step runtime and owner of entities/systems. */
export class World {
  public readonly scene: Scene;
  public readonly input = new InputState();
  public readonly events = new EventBus<WorldEvents>();
  public readonly fixedDeltaSeconds: number;
  public readonly maxFrameDeltaSeconds: number;
  public readonly maxSubSteps: number;

  #state: WorldState = "idle";
  #entities = new Map<EntityId, Entity>();
  #systems = new Map<string, RegisteredSystem>();
  #systemSequence = 0;
  #scheduler: FrameScheduler | null;
  #animationHandle: number | undefined;
  #lastAnimationTimestamp: number | undefined;
  #accumulator = 0;
  #elapsedSeconds = 0;
  #fixedElapsedSeconds = 0;
  #tick = 0;

  public constructor(options: WorldOptions = {}) {
    this.fixedDeltaSeconds = options.fixedDeltaSeconds ?? 1 / 60;
    this.maxFrameDeltaSeconds = options.maxFrameDeltaSeconds ?? 0.25;
    this.maxSubSteps = options.maxSubSteps ?? 8;
    if (!(this.fixedDeltaSeconds > 0)) throw new Error("fixedDeltaSeconds must be positive.");
    if (!(this.maxFrameDeltaSeconds > 0)) {
      throw new Error("maxFrameDeltaSeconds must be positive.");
    }
    if (!Number.isInteger(this.maxSubSteps) || this.maxSubSteps < 1) {
      throw new Error("maxSubSteps must be a positive integer.");
    }

    this.scene = options.scene ?? new Scene();
    this.#scheduler = options.scheduler === undefined ? browserScheduler() : options.scheduler;
  }

  public get state(): WorldState {
    return this.#state;
  }

  public get elapsedSeconds(): number {
    return this.#elapsedSeconds;
  }

  public get tick(): number {
    return this.#tick;
  }

  public get interpolationAlpha(): number {
    return this.#accumulator / this.fixedDeltaSeconds;
  }

  public createEntity(options: EntityOptions): Entity {
    const entity = new Entity(options);
    this.addEntity(entity);
    return entity;
  }

  public addEntity<T extends Entity>(entity: T): T {
    this.#assertUsable();
    if (this.#entities.has(entity.id)) {
      throw new Error(`Entity id "${entity.id}" already exists in this World.`);
    }
    if (entity.disposed) throw new Error(`Cannot add disposed Entity "${entity.id}".`);

    entity.mount(this);
    this.#entities.set(entity.id, entity);
    this.scene.add(entity.object3D);
    this.events.emit("entityAdded", { entity });
    return entity;
  }

  public getEntity<T extends Entity = Entity>(id: EntityId): T | undefined {
    return this.#entities.get(id) as T | undefined;
  }

  public requireEntity<T extends Entity = Entity>(id: EntityId): T {
    const entity = this.getEntity<T>(id);
    if (entity === undefined) throw new Error(`Unknown Entity "${id}".`);
    return entity;
  }

  public hasEntity(id: EntityId): boolean {
    return this.#entities.has(id);
  }

  public listEntities(): readonly Entity[] {
    return [...this.#entities.values()];
  }

  public removeEntity(id: EntityId, dispose = true): Entity | undefined {
    const entity = this.#entities.get(id);
    if (entity === undefined) return undefined;
    if (dispose) entity.dispose();
    else this.detachEntity(entity, false);
    return entity;
  }

  /** @internal Called by Entity.dispose to avoid leaving a ghost scene node. */
  public detachEntity(entity: Entity, disposed: boolean): void {
    if (this.#entities.get(entity.id) !== entity) return;
    this.#entities.delete(entity.id);
    this.scene.remove(entity.object3D);
    entity.unmount(this);
    this.events.emit("entityRemoved", { entity, disposed });
  }

  public registerSystem<T extends RuntimeSystem>(
    system: T,
    options: SystemRegistrationOptions = {},
  ): T {
    this.#assertUsable();
    if (this.#systems.has(system.id)) {
      throw new Error(`RuntimeSystem id "${system.id}" is already registered.`);
    }
    this.#systems.set(system.id, {
      system,
      order: options.order ?? 0,
      sequence: this.#systemSequence++,
    });
    return system;
  }

  public getSystem<T extends RuntimeSystem = RuntimeSystem>(id: string): T | undefined {
    return this.#systems.get(id)?.system as T | undefined;
  }

  public removeSystem(id: string, dispose = true): RuntimeSystem | undefined {
    const registration = this.#systems.get(id);
    if (registration === undefined) return undefined;
    this.#systems.delete(id);
    if (dispose) registration.system.dispose();
    return registration.system;
  }

  public start(): void {
    this.#assertUsable();
    if (this.#state === "running") return;
    this.#setState("running");
    this.#lastAnimationTimestamp = undefined;
    this.#scheduleNextFrame();
  }

  public pause(): void {
    this.#assertUsable();
    if (this.#state !== "running") return;
    this.#cancelScheduledFrame();
    this.#setState("paused");
  }

  public resume(): void {
    this.#assertUsable();
    if (this.#state !== "paused") return;
    this.start();
  }

  public stop(): void {
    this.#assertUsable();
    this.#cancelScheduledFrame();
    this.#accumulator = 0;
    this.#lastAnimationTimestamp = undefined;
    this.#setState("idle");
  }

  /**
   * Advance a running world manually. This is the deterministic entry point for
   * tests, replay, headless execution, and custom render loops.
   */
  public advance(deltaSeconds: number): AdvanceResult {
    this.#assertUsable();
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new Error("deltaSeconds must be a finite, non-negative number.");
    }
    if (this.#state !== "running") {
      return { fixedSteps: 0, interpolationAlpha: this.interpolationAlpha, droppedSeconds: 0 };
    }

    const acceptedDelta = Math.min(deltaSeconds, this.maxFrameDeltaSeconds);
    let droppedSeconds = deltaSeconds - acceptedDelta;
    this.#elapsedSeconds += acceptedDelta;
    this.#accumulator += acceptedDelta;

    const systems = this.#orderedSystems();
    let fixedSteps = 0;
    while (
      this.#accumulator + Number.EPSILON >= this.fixedDeltaSeconds &&
      fixedSteps < this.maxSubSteps
    ) {
      this.#tick += 1;
      this.#fixedElapsedSeconds += this.fixedDeltaSeconds;
      const context: FrameContext = {
        deltaSeconds: this.fixedDeltaSeconds,
        elapsedSeconds: this.#fixedElapsedSeconds,
        tick: this.#tick,
      };
      for (const registration of systems) {
        if (this.#systems.get(registration.system.id) === registration) {
          registration.system.fixedUpdate?.(context);
        }
      }
      this.#accumulator = Math.max(0, this.#accumulator - this.fixedDeltaSeconds);
      fixedSteps += 1;
    }

    if (this.#accumulator >= this.fixedDeltaSeconds) {
      const retained = this.#accumulator % this.fixedDeltaSeconds;
      droppedSeconds += this.#accumulator - retained;
      this.#accumulator = retained;
    }

    const updateContext: FrameContext = {
      deltaSeconds: acceptedDelta,
      elapsedSeconds: this.#elapsedSeconds,
      tick: this.#tick,
      interpolationAlpha: this.interpolationAlpha,
    };
    for (const registration of systems) {
      if (this.#systems.get(registration.system.id) === registration) {
        registration.system.update?.(updateContext);
      }
    }
    this.input.endFrame();

    return {
      fixedSteps,
      interpolationAlpha: this.interpolationAlpha,
      droppedSeconds,
    };
  }

  public dispose(): void {
    if (this.#state === "disposed") return;
    this.#cancelScheduledFrame();

    for (const entity of [...this.#entities.values()].reverse()) {
      this.removeEntity(entity.id, true);
    }
    const systems = this.#orderedSystems().reverse();
    this.#systems.clear();
    for (const { system } of systems) system.dispose();

    this.input.dispose();
    this.events.clear();
    this.#state = "disposed";
  }

  #orderedSystems(): RegisteredSystem[] {
    return [...this.#systems.values()].sort(
      (a, b) => a.order - b.order || a.sequence - b.sequence,
    );
  }

  #setState(next: WorldState): void {
    if (this.#state === next) return;
    const previous = this.#state;
    this.#state = next;
    this.events.emit("stateChanged", { previous, current: next });
  }

  #scheduleNextFrame(): void {
    if (this.#scheduler === null || this.#animationHandle !== undefined) return;
    this.#animationHandle = this.#scheduler.request((timestampMs) => {
      this.#animationHandle = undefined;
      if (this.#state !== "running") return;
      if (this.#lastAnimationTimestamp !== undefined) {
        this.advance((timestampMs - this.#lastAnimationTimestamp) / 1000);
      }
      this.#lastAnimationTimestamp = timestampMs;
      this.#scheduleNextFrame();
    });
  }

  #cancelScheduledFrame(): void {
    if (this.#animationHandle === undefined || this.#scheduler === null) return;
    this.#scheduler.cancel(this.#animationHandle);
    this.#animationHandle = undefined;
  }

  #assertUsable(): void {
    if (this.#state === "disposed") throw new Error("World has been disposed.");
  }
}
