import { describe, expect, it } from "vitest";

import {
  EntityComponentV1,
  EntityRegistryV1,
  RuntimeEntityV1,
  SceneComponentV1,
} from "./index";

class TestComponent extends EntityComponentV1 {
  constructor(componentId: string, private readonly events: string[]) {
    super(componentId);
  }

  protected override onActivate(): void {
    this.events.push(`activate:${this.componentId}`);
  }

  protected override onDispose(): void {
    this.events.push(`dispose:${this.componentId}`);
  }
}

class TestSceneComponent extends SceneComponentV1 {
  constructor(componentId: string) {
    super(componentId);
  }
}

class ThrowingComponent extends TestComponent {
  constructor(
    componentId: string,
    events: string[],
    private readonly failurePhase: "activate" | "dispose",
  ) {
    super(componentId, events);
  }

  protected override onActivate(): void {
    super.onActivate();
    if (this.failurePhase === "activate") throw new Error("TEST_ACTIVATE_FAILURE");
  }

  protected override onDispose(): void {
    super.onDispose();
    if (this.failurePhase === "dispose") throw new Error("TEST_DISPOSE_FAILURE");
  }
}

describe("RuntimeEntityV1", () => {
  it("owns component lifecycle and disposes components in reverse registration order", () => {
    const events: string[] = [];
    const entity = new RuntimeEntityV1("g-bot");
    const movement = entity.registerComponent(new TestComponent("movement", events));
    entity.registerComponent(new TestComponent("camera", events));

    entity.activate();
    entity.dispose();

    expect(movement.entityId).toBe("g-bot");
    expect(events).toEqual([
      "activate:movement",
      "activate:camera",
      "dispose:camera",
      "dispose:movement",
    ]);
  });

  it("maintains SceneComponent attachment and rejects cycles", () => {
    const entity = new RuntimeEntityV1("g-bot");
    const root = entity.registerComponent(new TestSceneComponent("root"));
    const arm = entity.registerComponent(new TestSceneComponent("spring-arm"));
    const camera = entity.registerComponent(new TestSceneComponent("camera"));

    arm.attachTo(root);
    camera.attachTo(arm);

    expect(root.children).toEqual([arm]);
    expect(arm.parent).toBe(root);
    expect(camera.parent).toBe(arm);
    expect(() => root.attachTo(camera)).toThrow("SCENE_COMPONENT_ATTACHMENT_CYCLE");
  });

  it("fails activation closed and rolls back every component in reverse order", () => {
    const events: string[] = [];
    const entity = new RuntimeEntityV1("g-bot");
    const movement = entity.registerComponent(new TestComponent("movement", events));
    const camera = entity.registerComponent(
      new ThrowingComponent("camera", events, "activate"),
    );

    expect(() => entity.activate()).toThrow("RUNTIME_ENTITY_ACTIVATION_FAILED");

    expect(events).toEqual([
      "activate:movement",
      "activate:camera",
      "dispose:camera",
      "dispose:movement",
    ]);
    expect(movement.state).toBe("disposed");
    expect(camera.state).toBe("disposed");
    expect(() => entity.registerComponent(new TestComponent("late", events))).toThrow(
      "RUNTIME_ENTITY_DISPOSED",
    );
  });

  it("continues reverse-order cleanup when one component disposer throws", () => {
    const events: string[] = [];
    const entity = new RuntimeEntityV1("g-bot");
    const first = entity.registerComponent(new TestComponent("first", events));
    const second = entity.registerComponent(
      new ThrowingComponent("second", events, "dispose"),
    );
    const third = entity.registerComponent(new TestComponent("third", events));

    expect(() => entity.dispose()).toThrow("RUNTIME_ENTITY_DISPOSAL_FAILED");

    expect(events).toEqual([
      "dispose:third",
      "dispose:second",
      "dispose:first",
    ]);
    expect(first.state).toBe("disposed");
    expect(second.state).toBe("disposed");
    expect(third.state).toBe("disposed");
    expect(entity.components()).toEqual([]);
  });

  it("keeps an active entity usable when a dynamically added component fails activation", () => {
    const events: string[] = [];
    const entity = new RuntimeEntityV1("g-bot");
    entity.registerComponent(new TestComponent("movement", events));
    entity.activate();

    expect(() => entity.registerComponent(
      new ThrowingComponent("broken-camera", events, "activate"),
    )).toThrow("RUNTIME_ENTITY_COMPONENT_ACTIVATION_FAILED");

    entity.registerComponent(new TestComponent("camera", events));
    expect(entity.components().map((component) => component.componentId)).toEqual([
      "movement",
      "camera",
    ]);
    expect(events).toEqual([
      "activate:movement",
      "activate:broken-camera",
      "dispose:broken-camera",
      "activate:camera",
    ]);
  });

  it("does not allow a disposed SceneComponent to re-enter an attachment tree", () => {
    const entity = new RuntimeEntityV1("g-bot");
    const root = entity.registerComponent(new TestSceneComponent("root"));
    const camera = entity.registerComponent(new TestSceneComponent("camera"));
    camera.dispose();

    expect(() => camera.attachTo(root)).toThrow("SCENE_COMPONENT_DISPOSED");
    expect(() => root.attachTo(camera)).toThrow("SCENE_COMPONENT_PARENT_DISPOSED");
  });
});

describe("EntityRegistryV1", () => {
  it("indexes entities once and activates registered entities", () => {
    const registry = new EntityRegistryV1();
    const entity = registry.register(new RuntimeEntityV1("g-bot"));
    const events: string[] = [];
    entity.registerComponent(new TestComponent("movement", events));

    registry.activateAll();

    expect(registry.entity("g-bot")).toBe(entity);
    expect(events).toEqual(["activate:movement"]);
    expect(() => registry.register(new RuntimeEntityV1("g-bot"))).toThrow(
      "ENTITY_REGISTRY_DUPLICATE",
    );
  });

  it("fails registry activation closed and disposes already-active entities", () => {
    const events: string[] = [];
    const registry = new EntityRegistryV1();
    const first = registry.register(new RuntimeEntityV1("first"));
    first.registerComponent(new TestComponent("movement", events));
    const second = registry.register(new RuntimeEntityV1("second"));
    second.registerComponent(new ThrowingComponent("camera", events, "activate"));

    expect(() => registry.activateAll()).toThrow("ENTITY_REGISTRY_ACTIVATION_FAILED");

    expect(events).toEqual([
      "activate:movement",
      "activate:camera",
      "dispose:camera",
      "dispose:movement",
    ]);
    expect(registry.entities()).toEqual([]);
    expect(() => registry.register(new RuntimeEntityV1("late"))).toThrow(
      "ENTITY_REGISTRY_DISPOSED",
    );
  });

  it("activates an entity registered after the registry is already active", () => {
    const events: string[] = [];
    const registry = new EntityRegistryV1();
    registry.activateAll();
    const late = new RuntimeEntityV1("late");
    late.registerComponent(new TestComponent("movement", events));

    registry.register(late);

    expect(events).toEqual(["activate:movement"]);
  });
});
