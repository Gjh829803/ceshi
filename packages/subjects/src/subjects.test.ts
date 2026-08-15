import { Bone, MathUtils, Object3D, PerspectiveCamera } from "three";
import { DEFAULT_HUMANOID_TRAVERSAL } from "../../contracts/src/index.js";
import { describe, expect, it, vi } from "vitest";
import { World } from "../../core/src/index.js";
import { createPhysicsSystem } from "../../physics/src/index.js";
import {
  createHumanoidThirdPersonSubjectKit,
  createPlaceholderHumanoidVisual,
  prepareRiggedWhiteboxVisual,
  createRapierHumanoidMotorFromWorld,
  RapierHumanoidMotor,
} from "./index.js";

describe("RapierHumanoidMotor", () => {
  it("configures a shared climb and slide limit on the Rapier controller", () => {
    const setMaxSlopeClimbAngle = vi.fn();
    const setMinSlopeSlideAngle = vi.fn();
    new RapierHumanoidMotor(
      {
        computeColliderMovement: vi.fn(),
        computedMovement: () => ({ x: 0, y: 0, z: 0 }),
        computedGrounded: () => true,
        setMaxSlopeClimbAngle,
        setMinSlopeSlideAngle,
      },
      {},
      {
        translation: () => ({ x: 0, y: 0, z: 0 }),
        setNextKinematicTranslation: vi.fn(),
      },
    );

    expect(setMaxSlopeClimbAngle).toHaveBeenCalledWith(
      MathUtils.degToRad(DEFAULT_HUMANOID_TRAVERSAL.maxSlopeClimbDegrees),
    );
    expect(setMinSlopeSlideAngle).toHaveBeenCalledWith(
      MathUtils.degToRad(DEFAULT_HUMANOID_TRAVERSAL.minSlopeSlideDegrees),
    );
  });

  it("turns camera-relative intent into a kinematic Rapier movement", () => {
    let position = { x: 0, y: 0, z: 0 };
    const setNextKinematicTranslation = vi.fn((next) => { position = next; });
    const controller = {
      computeColliderMovement: vi.fn((_collider: object, desired) => {
        position = { ...position, desired } as typeof position;
      }),
      computedMovement: () => (position as typeof position & { desired?: typeof position }).desired ?? { x: 0, y: 0, z: 0 },
      computedGrounded: () => true,
    };
    const body = {
      translation: () => ({ x: position.x, y: position.y, z: position.z }),
      setNextKinematicTranslation,
    };
    const motor = new RapierHumanoidMotor(controller, {}, body, {
      initialGrounded: true,
      acceleration: 100,
      walkSpeed: 2,
    });
    const result = motor.step(
      { forward: 1, right: 0, run: false, jump: false },
      { forward: [0, 0, -1], right: [1, 0, 0] },
      0.1,
    );

    expect(controller.computeColliderMovement).toHaveBeenCalled();
    expect(result.position[2]).toBeCloseTo(-0.2);
    expect(result.horizontalSpeed).toBeCloseTo(2);
    expect(setNextKinematicTranslation).toHaveBeenCalledOnce();
  });

  it("clears locomotion state and teleports deterministically on reset", () => {
    const setTranslation = vi.fn();
    const setNextKinematicTranslation = vi.fn();
    const motor = new RapierHumanoidMotor(
      {
        computeColliderMovement: vi.fn(),
        computedMovement: () => ({ x: 0, y: 0, z: 0 }),
        computedGrounded: () => false,
      },
      {},
      {
        translation: () => ({ x: 9, y: 9, z: 9 }),
        setTranslation,
        setNextKinematicTranslation,
      },
    );

    const result = motor.reset([1, 2, 3], { facingRadians: 0.5, grounded: true });

    expect(result).toMatchObject({
      position: [1, 2, 3],
      velocity: [0, 0, 0],
      horizontalSpeed: 0,
      facingRadians: 0.5,
      grounded: true,
    });
    expect(setTranslation).toHaveBeenCalledWith({ x: 1, y: 2, z: 3 }, true);
    expect(setNextKinematicTranslation).toHaveBeenCalledWith({ x: 1, y: 2, z: 3 });
  });
});

describe("HumanoidThirdPersonSubjectKit", () => {
  it("interpolates fixed-step motion and smooths grounded vertical corrections", () => {
    let position = { x: 0, y: 0, z: 0 };
    let desired = { x: 0, y: 0, z: 0 };
    const motor = new RapierHumanoidMotor(
      {
        computeColliderMovement: vi.fn((_collider: object, next) => {
          desired = { ...next, y: 0.2 };
        }),
        computedMovement: () => desired,
        computedGrounded: () => true,
      },
      {},
      {
        translation: () => position,
        setTranslation: (next) => { position = { ...next }; },
        setNextKinematicTranslation: (next) => { position = { ...next }; },
      },
      { initialGrounded: true, acceleration: 100, walkSpeed: 2 },
    );
    const kit = createHumanoidThirdPersonSubjectKit({
      id: "smoothed-player",
      camera: new PerspectiveCamera(),
      motor,
      renderVerticalDamping: 30,
    });
    kit.reset([0, 0, 0], { grounded: true });
    kit.setMovementIntent({ forward: 1, right: 0, run: false, jump: false });
    kit.fixedUpdate({ deltaSeconds: 0.1, elapsedSeconds: 0.1, tick: 1 });
    kit.update({
      deltaSeconds: 1 / 60,
      elapsedSeconds: 0.1,
      tick: 1,
      interpolationAlpha: 0.5,
    });

    expect(kit.root.position.z).toBeCloseTo(-0.1);
    expect(kit.root.position.y).toBeGreaterThan(0);
    expect(kit.root.position.y).toBeLessThan(0.1);
    kit.dispose();
  });

  it("accepts Mixamo rigs through Three.js cross-module type markers", () => {
    const root = new Object3D();
    const hips = new Bone();
    hips.name = "mixamorig:Hips";
    const crossModuleSkinnedMesh = new Object3D() as Object3D & {
      isSkinnedMesh: true;
      skeleton: { bones: Bone[] };
    };
    crossModuleSkinnedMesh.isSkinnedMesh = true;
    crossModuleSkinnedMesh.skeleton = { bones: [hips] };
    root.add(crossModuleSkinnedMesh);

    const visual = prepareRiggedWhiteboxVisual(root, []);

    expect(visual.status).toBe("rigged");
    visual.dispose();
  });

  it("uses an explicit non-rigged placeholder when no GLB is provided", () => {
    const visual = createPlaceholderHumanoidVisual();
    expect(visual.status).toBe("placeholder");
    expect(visual.clips).toHaveLength(0);
    expect(visual.limitations).toContain("No skeleton is bundled in the SDK yet.");
    visual.dispose();
  });

  it("composes movement and camera behind a single subject preset", () => {
    const controller = {
      computeColliderMovement: vi.fn(),
      computedMovement: () => ({ x: 0, y: 0, z: 0 }),
      computedGrounded: () => true,
    };
    const motor = new RapierHumanoidMotor(
      controller,
      {},
      {
        translation: () => ({ x: 1, y: 2, z: 3 }),
        setNextKinematicTranslation: vi.fn(),
      },
      { initialGrounded: true },
    );
    const kit = createHumanoidThirdPersonSubjectKit({
      id: "player",
      camera: new PerspectiveCamera(),
      motor,
    });
    kit.setMovementIntent({ forward: 0, right: 0, run: false, jump: false });
    kit.advance(0);
    expect(kit.preset).toBe("humanoid.third_person");
    expect(kit.id).toBe("subject:player");
    expect(kit.visualMount.rotation.y).toBe(0);
    expect(kit.root.position.toArray()).toEqual([1, 2, 3]);
    expect(kit.actionRegistry).toBeNull();
    kit.dispose();
  });

  it("corrects a rigged Mixamo +Z visual to the runtime -Z forward axis", () => {
    const root = new Object3D();
    const hips = new Bone();
    hips.name = "mixamorig:Hips";
    const skinned = new Object3D() as Object3D & {
      isSkinnedMesh: true;
      skeleton: { bones: Bone[] };
    };
    skinned.isSkinnedMesh = true;
    skinned.skeleton = { bones: [hips] };
    root.add(skinned);
    const visual = prepareRiggedWhiteboxVisual(root, []);
    const kit = createHumanoidThirdPersonSubjectKit({
      id: "mixamo-player",
      camera: new PerspectiveCamera(),
      motor: new RapierHumanoidMotor(
        {
          computeColliderMovement: vi.fn(),
          computedMovement: () => ({ x: 0, y: 0, z: 0 }),
          computedGrounded: () => true,
        },
        {},
        {
          translation: () => ({ x: 0, y: 1, z: 0 }),
          setNextKinematicTranslation: vi.fn(),
        },
      ),
      visual,
    });

    expect(kit.visualMount.rotation.y).toBeCloseTo(Math.PI);
    kit.dispose();
  });

  it("runs before the shared PhysicsSystem as a Core RuntimeSystem", async () => {
    const world = new World({ fixedDeltaSeconds: 1 / 60, scheduler: null });
    const physics = await createPhysicsSystem();
    const ground = physics.createRigidBody(undefined, {
      type: "fixed",
      position: [0, -0.1, 0],
    });
    ground.createCollider({ shape: { type: "box", halfExtents: [10, 0.1, 10] } });

    const body = physics.createRigidBody(undefined, {
      type: "kinematicPosition",
      sync: "none",
      position: [0, 1, 0],
    });
    const collider = body.createCollider({
      shape: { type: "capsule", halfHeight: 0.55, radius: 0.35 },
    });
    const motor = createRapierHumanoidMotorFromWorld(
      physics.rawWorld,
      body.raw,
      collider.raw,
    );
    const kit = createHumanoidThirdPersonSubjectKit({
      id: "integrated-player",
      camera: new PerspectiveCamera(),
      motor,
    });
    world.createEntity({ id: "integrated-player", object3D: kit.root });
    world.registerSystem(kit, { order: -100 });
    world.registerSystem(physics, { order: 0 });
    kit.setMovementIntent({ forward: 1, right: 0, run: false, jump: false });
    world.start();
    for (let index = 0; index < 30; index += 1) world.advance(1 / 60);

    expect(kit.root.position.z).toBeLessThan(-0.25);
    expect(kit.root.position.y).toBeGreaterThan(0.7);
    world.dispose();
  });
});
