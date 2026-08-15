import type { Disposable, RuntimeSystem } from "@whitebox-world/contracts";
import { Object3D } from "three";
import { describe, expect, it, vi } from "vitest";
import { Entity, InputState, World } from "./index";

describe("World", () => {
  it("runs fixed updates independently from render updates", () => {
    const fixedUpdate = vi.fn();
    const update = vi.fn();
    const system: RuntimeSystem = { id: "counter", fixedUpdate, update, dispose: vi.fn() };
    const world = new World({ fixedDeltaSeconds: 0.1, scheduler: null });
    world.registerSystem(system);
    world.start();

    const result = world.advance(0.25);

    expect(result.fixedSteps).toBe(2);
    expect(result.interpolationAlpha).toBeCloseTo(0.5);
    expect(fixedUpdate).toHaveBeenCalledTimes(2);
    expect(fixedUpdate.mock.calls[1]?.[0]).toMatchObject({
      deltaSeconds: 0.1,
      elapsedSeconds: 0.2,
      tick: 2,
    });
    expect(update).toHaveBeenCalledOnce();
    expect(world.tick).toBe(2);
  });

  it("orders systems and disposes entities before systems", () => {
    const calls: string[] = [];
    const world = new World({ fixedDeltaSeconds: 0.1, scheduler: null });
    world.registerSystem({
      id: "late",
      fixedUpdate: () => calls.push("late"),
      dispose: () => calls.push("dispose-system"),
    }, { order: 10 });
    world.registerSystem({
      id: "early",
      fixedUpdate: () => calls.push("early"),
      dispose: vi.fn(),
    }, { order: -10 });

    const resource: Disposable = { dispose: () => calls.push("dispose-entity") };
    world.createEntity({ id: "owned" }).own(resource);
    world.start();
    world.advance(0.1);
    expect(calls).toEqual(["early", "late"]);

    world.dispose();
    expect(calls).toContain("dispose-entity");
    expect(calls.indexOf("dispose-entity")).toBeLessThan(calls.indexOf("dispose-system"));
  });

  it("owns entity scene lifecycle and rejects duplicate ids", () => {
    const world = new World({ scheduler: null });
    const entity = world.createEntity({ id: "hero" });
    expect(world.scene.children).toContain(entity.object3D);
    expect(() => world.createEntity({ id: "hero" })).toThrow(/already exists/);

    world.removeEntity("hero");
    expect(entity.disposed).toBe(true);
    expect(world.scene.children).not.toContain(entity.object3D);
  });

  it("detaches an entity disposed directly and emits its lifecycle event", () => {
    const world = new World({ scheduler: null });
    const removed: boolean[] = [];
    world.events.on("entityRemoved", (event) => removed.push(event.disposed));
    const entity = world.createEntity({ id: "temporary" });

    entity.dispose();

    expect(world.hasEntity(entity.id)).toBe(false);
    expect(removed).toEqual([true]);
  });
});

describe("Entity transform", () => {
  it("is a live Object3D binding", () => {
    const object = new Object3D();
    const entity = new Entity({
      id: "marker",
      object3D: object,
      transform: { position: [1, 2, 3], rotation: [0, 1, 0] },
    });

    expect(object.position.toArray()).toEqual([1, 2, 3]);
    object.position.x = 9;
    expect(entity.transform.position).toEqual([9, 2, 3]);
    entity.transform.scale = [2, 3, 4];
    expect(object.scale.toArray()).toEqual([2, 3, 4]);
  });
});

describe("InputState", () => {
  it("tracks held and frame-transition states", () => {
    const input = new InputState();
    input.setKey("KeyW", true);
    input.setAxis("moveX", 2);

    expect(input.isKeyDown("KeyW")).toBe(true);
    expect(input.wasKeyPressed("KeyW")).toBe(true);
    expect(input.getAxis("moveX")).toBe(1);

    input.endFrame();
    expect(input.isKeyDown("KeyW")).toBe(true);
    expect(input.wasKeyPressed("KeyW")).toBe(false);

    input.setKey("KeyW", false);
    expect(input.wasKeyReleased("KeyW")).toBe(true);
  });
});
