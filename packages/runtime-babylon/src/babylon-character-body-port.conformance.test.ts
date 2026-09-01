import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.pure.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import {
  CharacterSupportedState,
  PhysicsCharacterController,
} from "@babylonjs/core/Physics/v2/characterController.js";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { PhysicsShapeBox } from "@babylonjs/core/Physics/v2/physicsShape.js";
import { Scene } from "@babylonjs/core/scene.js";
import {
  BODY_RESOLUTION_COHERENCE_TOLERANCE_METERS_V1,
  createMovementTickTokenV1,
} from "@whitebox-world/character-movement";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BABYLON_CHARACTER_BODY_PROVIDER_VERSIONS_V1,
  GroundAwarePhysicsCharacterController,
  createBabylonCharacterBodyPortV1,
} from "./babylon-character-body-port.js";
import { enableHavokPhysics } from "./physics.js";

const require = createRequire(import.meta.url);
const havokWasmBytes = await readFile(
  require.resolve("@babylonjs/havok/lib/esm/HavokPhysics.wasm"),
);
const havokWasmBinary = havokWasmBytes.buffer.slice(
  havokWasmBytes.byteOffset,
  havokWasmBytes.byteOffset + havokWasmBytes.byteLength,
) as ArrayBuffer;

const disposals: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  for (const dispose of disposals.splice(0).reverse()) await dispose();
  vi.restoreAllMocks();
});

async function realScene(): Promise<{ engine: NullEngine; scene: Scene }> {
  const engine = new NullEngine({
    renderWidth: 64,
    renderHeight: 64,
    textureSize: 64,
    deterministicLockstep: true,
    lockstepMaxSteps: 4,
  });
  const scene = new Scene(engine);
  await enableHavokPhysics(scene, [0, -9.81, 0], havokWasmBinary);
  disposals.push(() => {
    scene.dispose();
    engine.dispose();
  });
  return { engine, scene };
}

function realPortOptions(scene: Scene) {
  return {
    schemaVersion: 1 as const,
    providerVersions: BABYLON_CHARACTER_BODY_PROVIDER_VERSIONS_V1,
    scene,
    fixedDeltaSeconds: 1 / 60,
    gravityMetersPerSecondSquaredXYZ: [0, -9.81, 0] as const,
    capsule: { heightMeters: 1.8, radiusMeters: 0.35 },
    controller: {
      keepDistanceMeters: 0.05,
      keepContactToleranceMeters: 0.1,
      maxSlopeDegrees: 45,
      maxStepHeightMeters: 0.3,
      characterMassKilograms: 80,
    },
    resetState: {
      positionMetersXYZ: [0, 0.95, 0] as const,
      linearVelocityMetersPerSecondXYZ: [0, 0, 0] as const,
    },
  };
}

function addStaticBox(
  scene: Scene,
  name: string,
  position: Vector3,
  extents: Vector3,
  metadata?: Record<string, unknown>,
): void {
  const node = new TransformNode(name, scene);
  node.position.copyFrom(position);
  node.metadata = metadata;
  const shape = new PhysicsShapeBox(
    Vector3.ZeroReadOnly as Vector3,
    Quaternion.Identity(),
    extents,
    scene,
  );
  const body = new PhysicsBody(node, PhysicsMotionType.STATIC, false, scene);
  body.shape = shape;
  disposals.push(() => {
    body.dispose();
    shape.dispose();
    node.dispose();
  });
}

function sceneInventory(scene: Scene): Readonly<{ nodes: number; bodies: number }> {
  const physicsEngine = scene.getPhysicsEngine() as unknown as {
    getBodies(): readonly unknown[];
  };
  return {
    nodes: scene.getNodes().length,
    bodies: physicsEngine.getBodies().length,
  };
}

interface HavokQueryApiProbe {
  HP_QueryCollector_Create(maxHits: number): readonly [number, unknown];
  HP_QueryCollector_Release(handle: unknown): unknown;
  HP_Body_GetQTransform(
    bodyId: unknown,
  ): readonly [number, readonly [readonly number[], readonly number[]]];
}

function havokProbe(scene: Scene): Readonly<{
  plugin: Record<string, (...args: never[]) => unknown>;
  query: HavokQueryApiProbe;
}> {
  const plugin = scene.getPhysicsEngine()!.getPhysicsPlugin() as unknown as
    Record<string, (...args: never[]) => unknown> & { _hknp: HavokQueryApiProbe };
  return { plugin, query: plugin._hknp };
}

function nativeControllerPosition(
  scene: Scene,
  controller: GroundAwarePhysicsCharacterController,
): readonly number[] {
  const body = (controller as unknown as { readonly _body: PhysicsBody })._body;
  const bodyId = (body as unknown as {
    readonly _pluginData: { readonly hpBodyId: unknown };
  })._pluginData.hpBodyId;
  return havokProbe(scene).query.HP_Body_GetQTransform(bodyId)[1][0];
}

function constructionSurfaces(scene: Scene) {
  const { plugin, query } = havokProbe(scene);
  return Object.freeze({
    initShape: plugin.initShape,
    initBody: plugin.initBody,
    setMassProperties: plugin.setMassProperties,
    setShape: plugin.setShape,
    collectorCreate: query.HP_QueryCollector_Create,
    addTransformNode: scene.addTransformNode,
  });
}

function expectConstructionSurfaces(
  scene: Scene,
  expected: ReturnType<typeof constructionSurfaces>,
): void {
  const actual = constructionSurfaces(scene);
  expect(actual.initShape).toBe(expected.initShape);
  expect(actual.initBody).toBe(expected.initBody);
  expect(actual.setMassProperties).toBe(expected.setMassProperties);
  expect(actual.setShape).toBe(expected.setShape);
  expect(actual.collectorCreate).toBe(expected.collectorCreate);
  expect(actual.addTransformNode).toBe(expected.addTransformNode);
}

describe("Babylon 9.23.0 / Havok 1.3.14 Character Body conformance", () => {
  it("locks installed versions and the real constructor/protected/method surface", async () => {
    const corePackage = JSON.parse(await readFile(
      require.resolve("@babylonjs/core/package.json"),
      "utf8",
    )) as { version: string };
    const havokPackage = JSON.parse(await readFile(
      join(
        dirname(require.resolve("@babylonjs/havok/lib/esm/HavokPhysics.wasm")),
        "../../package.json",
      ),
      "utf8",
    )) as { version: string };
    expect({
      babylonJs: corePackage.version,
      havok: havokPackage.version,
    }).toEqual(BABYLON_CHARACTER_BODY_PROVIDER_VERSIONS_V1);

    const { scene } = await realScene();
    const controller = new GroundAwarePhysicsCharacterController(
      new Vector3(0, 2, 0),
      { capsuleHeight: 1.8, capsuleRadius: 0.35 },
      scene,
    );
    disposals.push(() => controller.dispose());

    expect(controller).toBeInstanceOf(PhysicsCharacterController);
    expect(Object.prototype.hasOwnProperty.call(
      GroundAwarePhysicsCharacterController.prototype,
      "_tryStepUp",
    )).toBe(true);
    controller.setPosition(new Vector3(1, 2, 3));
    controller.setVelocity(new Vector3(4, 5, 6));
    expect(controller.getPosition().asArray()).toEqual([1, 2, 3]);
    expect(controller.getVelocity().asArray()).toEqual([4, 5, 6]);
    controller.prepareExactTranslation(
      new Vector3(0.2, 0.1, -0.3),
      new Vector3(12, 6, -18),
      1 / 60,
    );
    const exactTranslationState = controller.captureTransactionalState();
    expect(exactTranslationState.lastDisplacement.asArray())
      .toEqual([0.2, 0.1, -0.3]);
    expect(exactTranslationState.lastVelocity.asArray())
      .toEqual([12, 6, -18]);
    expect(exactTranslationState.lastInvDeltaTime).toBe(60);
    for (const method of [
      "getPosition",
      "setPosition",
      "getVelocity",
      "setVelocity",
      "checkSupport",
      "integrate",
      "dispose",
    ]) {
      expect(typeof (controller as unknown as Record<string, unknown>)[method]).toBe("function");
    }
  }, 30_000);

  it("projects Native Surface identity from the real Havok support body metadata", async () => {
    const { scene } = await realScene();
    addStaticBox(
      scene,
      "native-support",
      new Vector3(0, -0.1, 0),
      new Vector3(10, 0.2, 10),
      {
        worldkitEntityId: "native-ground",
        colliderSubshapeId: "collider-subshape:native-ground-top",
        worldkitNativeTraversalKind: "static-surface",
        worldkitTraversalSurfaceId: "traversal-surface:native-ground-top",
        worldkitSurfaceEntityId: "native-ground-surface",
        worldkitLogicalSubshapeId: "top",
        worldkitTraversalSurfaceProfileRef:
          "worldkit://traversal-surface-profile/ground.static@1",
      },
    );
    const controller = new GroundAwarePhysicsCharacterController(
      new Vector3(0, 0.95, 0),
      { capsuleHeight: 1.8, capsuleRadius: 0.35 },
      scene,
    );
    controller.keepDistance = 0.05;
    controller.keepContactTolerance = 0.1;
    controller.maxSlopeCosine = Math.cos(45 * Math.PI / 180);
    disposals.push(() => controller.dispose());

    controller.refreshCurrentManifold();
    const support = controller.checkSupport(1 / 60, new Vector3(0, -1, 0));
    expect(support.supportedState).toBe(CharacterSupportedState.SUPPORTED);
    const supportContact = controller.readCurrentContacts().find((contact) =>
      contact.motionType === "static" && contact.normalXYZ[1] > 0.9
    );
    expect(supportContact).toMatchObject({
      colliderId: "native-ground",
      traversalSurfaceId: "traversal-surface:native-ground-top",
      surfaceEntityId: "native-ground-surface",
      colliderSubshapeId: "collider-subshape:native-ground-top",
      logicalSubshapeId: "top",
      traversalSurfaceProfileRef:
        "worldkit://traversal-surface-profile/ground.static@1",
    });
  }, 30_000);

  it("retains canonical collider identity from real Havok contact metadata", async () => {
    const { scene } = await realScene();
    addStaticBox(
      scene,
      "canonical-support",
      new Vector3(0, -0.1, 0),
      new Vector3(10, 0.2, 10),
      {
        worldkitEntityId: "canonical-ground",
        colliderSubshapeId: "collider-subshape:canonical-ground",
        worldkitLogicalSubshapeId: "primary",
        worldkitTraversalSurfaceId: "traversal-surface:canonical-ground",
        worldkitSurfaceEntityId: "canonical-ground",
        worldkitTraversalSurfaceProfileRef:
          "worldkit://traversal-surface-profile/ground.static@1",
      },
    );
    const controller = new GroundAwarePhysicsCharacterController(
      new Vector3(0, 0.95, 0),
      { capsuleHeight: 1.8, capsuleRadius: 0.35 },
      scene,
    );
    controller.keepDistance = 0.05;
    controller.keepContactTolerance = 0.1;
    disposals.push(() => controller.dispose());

    controller.refreshCurrentManifold();
    const contact = controller.readCurrentContacts().find((candidate) =>
      candidate.motionType === "static" && candidate.normalXYZ[1] > 0.9
    );

    expect(contact).toMatchObject({
      colliderId: "canonical-ground",
      colliderSubshapeId: "collider-subshape:canonical-ground",
      logicalSubshapeId: "primary",
      traversalSurfaceId: "traversal-surface:canonical-ground",
      surfaceEntityId: "canonical-ground",
      traversalSurfaceProfileRef:
        "worldkit://traversal-surface-profile/ground.static@1",
    });
  }, 30_000);

  it("removes a teleported animated Body from its previous collision position before a peer Tick", async () => {
    const { scene } = await realScene();
    addStaticBox(
      scene,
      "floor",
      new Vector3(0, -0.1, 0),
      new Vector3(20, 0.2, 20),
    );
    const mountedPosition = [4, 0.95, 5] as const;
    const rider = createBabylonCharacterBodyPortV1({
      ...realPortOptions(scene),
      resetState: {
        positionMetersXYZ: mountedPosition,
        linearVelocityMetersPerSecondXYZ: [0, 0, 0],
      },
    });
    disposals.push(() => rider.dispose());
    rider.setCollisionFilterMasks(0, 0);
    const mount = createBabylonCharacterBodyPortV1({
      ...realPortOptions(scene),
      resetState: {
        positionMetersXYZ: mountedPosition,
        linearVelocityMetersPerSecondXYZ: [0, 0, 0],
      },
    });
    disposals.push(() => mount.dispose());

    rider.setCollisionFilterMasks(-1, -1);
    rider.resetToState({
      positionMetersXYZ: [0, 0.95, 0],
      linearVelocityMetersPerSecondXYZ: [0, 0, 0],
    });

    const token = createMovementTickTokenV1();
    expect(mount.beginTick({ token, tick: 1 }).support.mode).toBe("supported");
    const resolution = mount.resolve({
      token,
      proposal: {
        schemaVersion: 1,
        token,
        tick: 1,
        translationDeltaMetersXYZ: [0, 0, 0],
        proposedLinearVelocityMetersPerSecondXYZ: [0, 0, 0],
        proposedFacingYawRadians: 0,
        layeredMoves: [],
      },
    });

    expect(resolution.appliedTranslationMetersXYZ).toEqual([0, 0, 0]);
  }, 30_000);

  it("restores the animated Body native position with its teleport transaction snapshot", async () => {
    const { scene } = await realScene();
    const initialPosition = new Vector3(0, 0.95, 0);
    const controller = new GroundAwarePhysicsCharacterController(
      initialPosition,
      { capsuleHeight: 1.8, capsuleRadius: 0.35 },
      scene,
    );
    disposals.push(() => controller.dispose());
    const snapshot = controller.captureTransactionalState();
    const attemptedPosition = new Vector3(4.1, 0.95, 5);

    controller.setPosition(attemptedPosition);
    controller.synchronizeAfterTeleport();
    for (const [axis, value] of nativeControllerPosition(
      scene,
      controller,
    ).entries()) {
      expect(value).toBeCloseTo(attemptedPosition.asArray()[axis]!, 5);
    }

    controller.restoreTransactionalState(snapshot);

    expect(controller.getPosition().asArray()).toEqual(initialPosition.asArray());
    for (const [axis, value] of nativeControllerPosition(
      scene,
      controller,
    ).entries()) {
      expect(value).toBeCloseTo(initialPosition.asArray()[axis]!, 5);
    }
  }, 30_000);

  it.each([1, 2])(
    "rolls back exact real allocations when query collector %i construction fails",
    async (failureOrdinal) => {
      const { scene } = await realScene();
      const baseline = sceneInventory(scene);
      const { query } = havokProbe(scene);
      const primary = new Error(`collector ${failureOrdinal} failed`);
      const originalCreate = query.HP_QueryCollector_Create.bind(query);
      const release = vi.spyOn(query, "HP_QueryCollector_Release");
      let calls = 0;
      vi.spyOn(query, "HP_QueryCollector_Create").mockImplementation((maxHits) => {
        calls += 1;
        if (calls === failureOrdinal) throw primary;
        return originalCreate(maxHits);
      });

      expect(() => createBabylonCharacterBodyPortV1(realPortOptions(scene)))
        .toThrow(primary);
      expect(sceneInventory(scene)).toEqual(baseline);
      expect(release).toHaveBeenCalledTimes(failureOrdinal - 1);
    },
    30_000,
  );

  it.each(["shape", "body"] as const)(
    "rolls back exact real allocations when partial %s construction fails",
    async (failureKind) => {
      const { scene } = await realScene();
      const baseline = sceneInventory(scene);
      const { plugin } = havokProbe(scene);
      const primary = new Error(`${failureKind} construction failed`);
      const method = failureKind === "shape" ? "initShape" : "initBody";
      const cleanupMethod = failureKind === "shape" ? "disposeShape" : "disposeBody";
      const original = plugin[method]!.bind(plugin);
      const cleanup = vi.spyOn(plugin, cleanupMethod);
      vi.spyOn(plugin, method).mockImplementation((...args: never[]) => {
        original(...args);
        throw primary;
      });

      expect(() => createBabylonCharacterBodyPortV1(realPortOptions(scene)))
        .toThrow(primary);
      expect(sceneInventory(scene)).toEqual(baseline);
      expect(cleanup).toHaveBeenCalledTimes(1);
    },
    30_000,
  );

  it("attempts every real sibling cleanup when shape cleanup throws", async () => {
    const { scene } = await realScene();
    const baseline = sceneInventory(scene);
    const { plugin, query } = havokProbe(scene);
    const release = vi.spyOn(query, "HP_QueryCollector_Release");
    const port = createBabylonCharacterBodyPortV1(realPortOptions(scene));
    const primary = new Error("owned shape cleanup failed");
    vi.spyOn(plugin, "disposeShape").mockImplementationOnce(() => {
      throw primary;
    });

    expect(() => port.dispose()).toThrow(primary);
    expect(sceneInventory(scene)).toEqual(baseline);
    expect(release).toHaveBeenCalledTimes(2);
    expect(() => port.dispose()).not.toThrow();
  }, 30_000);

  it("keeps successful real allocations live until one idempotent disposal", async () => {
    const { scene } = await realScene();
    const baseline = sceneInventory(scene);
    const { query } = havokProbe(scene);
    const release = vi.spyOn(query, "HP_QueryCollector_Release");

    const port = createBabylonCharacterBodyPortV1(realPortOptions(scene));
    expect(release).not.toHaveBeenCalled();
    expect(sceneInventory(scene)).toEqual({
      nodes: baseline.nodes + 1,
      bodies: baseline.bodies + 1,
    });

    port.dispose();
    expect(release).toHaveBeenCalledTimes(2);
    expect(sceneInventory(scene)).toEqual(baseline);
    port.dispose();
    expect(release).toHaveBeenCalledTimes(2);
  }, 30_000);

  it("retains a successful same-scene nested port when the outer construction fails", async () => {
    const { scene } = await realScene();
    const baseline = sceneInventory(scene);
    const { plugin } = havokProbe(scene);
    const nativeInitShape = plugin.initShape!.bind(plugin);
    const primary = new Error("outer construction failed after nested success");
    let calls = 0;
    let nestedPort: ReturnType<typeof createBabylonCharacterBodyPortV1> | undefined;
    vi.spyOn(plugin, "initShape").mockImplementation((...args: never[]) => {
      calls += 1;
      if (calls === 1) {
        nestedPort = createBabylonCharacterBodyPortV1(realPortOptions(scene));
        throw primary;
      }
      return nativeInitShape(...args);
    });
    const entrySurfaces = constructionSurfaces(scene);

    expect(() => createBabylonCharacterBodyPortV1(realPortOptions(scene)))
      .toThrow(primary);
    expect(nestedPort).toBeDefined();
    const retainedPort = nestedPort!;
    disposals.push(() => retainedPort.dispose());
    expect(sceneInventory(scene)).toEqual({
      nodes: baseline.nodes + 1,
      bodies: baseline.bodies + 1,
    });
    const token = createMovementTickTokenV1();
    expect(retainedPort.beginTick({ token, tick: 1 }).tick).toBe(1);
    expectConstructionSurfaces(scene, entrySurfaces);

    retainedPort.dispose();
    expect(sceneInventory(scene)).toEqual(baseline);
  }, 30_000);

  it("retains unrelated node and body allocations made inside a failing provider callback", async () => {
    const { scene } = await realScene();
    const baseline = sceneInventory(scene);
    const { plugin } = havokProbe(scene);
    const nativeInitShape = plugin.initShape!.bind(plugin);
    const primary = new Error("outer construction failed after unrelated allocation");
    let calls = 0;
    let unrelatedNode: TransformNode | undefined;
    let unrelatedShape: PhysicsShapeBox | undefined;
    let unrelatedBody: PhysicsBody | undefined;
    vi.spyOn(plugin, "initShape").mockImplementation((...args: never[]) => {
      calls += 1;
      if (calls === 1) {
        unrelatedNode = new TransformNode("unrelated-callback-node", scene);
        unrelatedShape = new PhysicsShapeBox(
          Vector3.ZeroReadOnly as Vector3,
          Quaternion.Identity(),
          new Vector3(0.25, 0.25, 0.25),
          scene,
        );
        unrelatedBody = new PhysicsBody(
          unrelatedNode,
          PhysicsMotionType.STATIC,
          false,
          scene,
        );
        unrelatedBody.shape = unrelatedShape;
        throw primary;
      }
      return nativeInitShape(...args);
    });
    const entrySurfaces = constructionSurfaces(scene);

    expect(() => createBabylonCharacterBodyPortV1(realPortOptions(scene)))
      .toThrow(primary);
    expect(unrelatedNode).toBeDefined();
    expect(unrelatedShape).toBeDefined();
    expect(unrelatedBody).toBeDefined();
    disposals.push(() => {
      try {
        unrelatedBody?.dispose();
      } catch {
        // A RED implementation may already have deleted the unrelated body.
      }
      try {
        unrelatedShape?.dispose();
      } catch {
        // A RED implementation may already have deleted the unrelated shape.
      }
      try {
        unrelatedNode?.dispose();
      } catch {
        // A RED implementation may already have deleted the unrelated node.
      }
    });
    expect(sceneInventory(scene)).toEqual({
      nodes: baseline.nodes + 1,
      bodies: baseline.bodies + 1,
    });
    expectConstructionSurfaces(scene, entrySurfaces);

    unrelatedBody!.dispose();
    unrelatedShape!.dispose();
    unrelatedNode!.dispose();
    expect(sceneInventory(scene)).toEqual(baseline);
  }, 30_000);

  it("lets a handled nested failure leave the outer construction usable", async () => {
    const { scene } = await realScene();
    const baseline = sceneInventory(scene);
    const { plugin } = havokProbe(scene);
    const nativeInitShape = plugin.initShape!.bind(plugin);
    const nestedPrimary = new Error("handled nested construction failed");
    let calls = 0;
    let caught: unknown;
    vi.spyOn(plugin, "initShape").mockImplementation((...args: never[]) => {
      calls += 1;
      if (calls === 1) {
        try {
          createBabylonCharacterBodyPortV1(realPortOptions(scene));
        } catch (error) {
          caught = error;
        }
        return nativeInitShape(...args);
      }
      nativeInitShape(...args);
      throw nestedPrimary;
    });
    const entrySurfaces = constructionSurfaces(scene);

    const port = createBabylonCharacterBodyPortV1(realPortOptions(scene));
    disposals.push(() => port.dispose());
    expect(caught).toBe(nestedPrimary);
    expect(sceneInventory(scene)).toEqual({
      nodes: baseline.nodes + 1,
      bodies: baseline.bodies + 1,
    });
    const token = createMovementTickTokenV1();
    expect(port.beginTick({ token, tick: 1 }).tick).toBe(1);
    expectConstructionSurfaces(scene, entrySurfaces);

    port.dispose();
    expect(sceneInventory(scene)).toEqual(baseline);
  }, 30_000);

  it("isolates nested construction ownership and wrappers across two real scenes", async () => {
    const { scene: sceneA } = await realScene();
    const { scene: sceneB } = await realScene();
    const baselineA = sceneInventory(sceneA);
    const baselineB = sceneInventory(sceneB);
    const { plugin: pluginA } = havokProbe(sceneA);
    const primary = new Error("scene A outer construction failed");
    let calls = 0;
    let sceneBPort: ReturnType<typeof createBabylonCharacterBodyPortV1> | undefined;
    vi.spyOn(pluginA, "initShape").mockImplementation((..._args: never[]) => {
      calls += 1;
      if (calls === 1) {
        sceneBPort = createBabylonCharacterBodyPortV1(realPortOptions(sceneB));
        throw primary;
      }
      throw new Error("unexpected recursive scene A shape initialization");
    });
    const entrySurfacesA = constructionSurfaces(sceneA);
    const entrySurfacesB = constructionSurfaces(sceneB);

    expect(() => createBabylonCharacterBodyPortV1(realPortOptions(sceneA)))
      .toThrow(primary);
    expect(sceneInventory(sceneA)).toEqual(baselineA);
    expect(sceneBPort).toBeDefined();
    const retainedPort = sceneBPort!;
    disposals.push(() => retainedPort.dispose());
    expect(sceneInventory(sceneB)).toEqual({
      nodes: baselineB.nodes + 1,
      bodies: baselineB.bodies + 1,
    });
    expectConstructionSurfaces(sceneA, entrySurfacesA);
    expectConstructionSurfaces(sceneB, entrySurfacesB);

    retainedPort.dispose();
    expect(sceneInventory(sceneB)).toEqual(baselineB);
  }, 30_000);

  it.each([
    ["tiny partial-step proposal", 0.2, 0.01, "partial"],
    ["normal legal step", 0.2, 0.5, "landing"],
    ["too-tall step", 0.5, 0.5, "none"],
  ] as const)(
    "keeps %s progress within the exact proposal and bounded step height",
    async (_case, stepHeight, requestedX, expectedVerticalProgress) => {
      const { scene } = await realScene();
      addStaticBox(scene, "floor", new Vector3(0, -0.1, 0), new Vector3(10, 0.2, 10));
      addStaticBox(
        scene,
        "step",
        new Vector3(0.9, stepHeight / 2, 0),
        new Vector3(1, stepHeight, 2),
      );
      const port = createBabylonCharacterBodyPortV1(realPortOptions(scene));
      disposals.push(() => port.dispose());
      const token = createMovementTickTokenV1();
      const sample = port.beginTick({ token, tick: 1 });
      expect(sample.support.mode).toBe("supported");

      const resolution = port.resolve({
        token,
        proposal: {
          schemaVersion: 1,
          token,
          tick: 1,
          translationDeltaMetersXYZ: [requestedX, 0, 0],
          proposedLinearVelocityMetersPerSecondXYZ: [requestedX * 60, 0, 0],
          proposedFacingYawRadians: 0,
          layeredMoves: [],
        },
      });
      const tolerance = BODY_RESOLUTION_COHERENCE_TOLERANCE_METERS_V1;
      expect(resolution.appliedTranslationMetersXYZ[0])
        .toBeLessThanOrEqual(requestedX + tolerance);
      expect(resolution.appliedTranslationMetersXYZ[0]).toBeGreaterThanOrEqual(-tolerance);
      expect(resolution.appliedTranslationMetersXYZ[1])
        .toBeLessThanOrEqual(0.3 + tolerance);
      if (expectedVerticalProgress === "landing") {
        expect(resolution.appliedTranslationMetersXYZ[1]).toBeGreaterThan(0.15);
      }
      if (expectedVerticalProgress === "partial") {
        expect(resolution.appliedTranslationMetersXYZ[1]).toBeGreaterThan(tolerance);
        expect(resolution.appliedTranslationMetersXYZ[1]).toBeLessThan(0.15);
      }
      if (expectedVerticalProgress === "none") {
        expect(Math.abs(resolution.appliedTranslationMetersXYZ[1]))
          .toBeLessThanOrEqual(tolerance);
      }
    },
    30_000,
  );

  it("uses a fully supported step height without amplifying the horizontal proposal", async () => {
    const { scene } = await realScene();
    addStaticBox(scene, "floor", new Vector3(0, -0.1, 0), new Vector3(10, 0.2, 10));
    addStaticBox(
      scene,
      "step",
      new Vector3(1.7, 0.1, 0),
      new Vector3(2, 0.2, 4),
    );
    const port = createBabylonCharacterBodyPortV1({
      ...realPortOptions(scene),
      capsule: { heightMeters: 1.92, radiusMeters: 0.32 },
      resetState: {
        positionMetersXYZ: [0.4, 0.96, 0],
        linearVelocityMetersPerSecondXYZ: [0, 0, 0],
      },
    });
    disposals.push(() => port.dispose());
    const token = createMovementTickTokenV1();
    const sample = port.beginTick({ token, tick: 1 });
    expect(sample.support.mode).toBe("supported");

    const resolution = port.resolve({
      token,
      proposal: {
        schemaVersion: 1,
        token,
        tick: 1,
        translationDeltaMetersXYZ: [0.04, 0, 0],
        proposedLinearVelocityMetersPerSecondXYZ: [2.4, 0, 0],
        proposedFacingYawRadians: 0,
        layeredMoves: [],
      },
    });
    const tolerance = BODY_RESOLUTION_COHERENCE_TOLERANCE_METERS_V1;
    expect(resolution.appliedTranslationMetersXYZ[0]).toBeGreaterThan(0);
    expect(resolution.appliedTranslationMetersXYZ[0])
      .toBeLessThanOrEqual(0.04 + tolerance);
    expect(resolution.appliedTranslationMetersXYZ[1]).toBeGreaterThan(0.15);
    expect(resolution.support.mode).toBe("supported");
  }, 30_000);

  it("climbs a 0.25m step across walk-speed ticks without remaining on the riser", async () => {
    const { scene } = await realScene();
    addStaticBox(scene, "floor", new Vector3(0, -0.1, 0), new Vector3(16, 0.2, 8));
    addStaticBox(scene, "step", new Vector3(2.5, 0.125, 0), new Vector3(3, 0.25, 4));
    const port = createBabylonCharacterBodyPortV1({
      ...realPortOptions(scene),
      resetState: {
        positionMetersXYZ: [0, 0.95, 0],
        linearVelocityMetersPerSecondXYZ: [0, 0, 0],
      },
    });
    disposals.push(() => port.dispose());
    const walkDeltaX = 1.4 / 60;
    let positionX = 0;
    let positionY = 0.95;
    for (let tick = 1; tick <= 90; tick += 1) {
      const token = createMovementTickTokenV1();
      const sample = port.beginTick({ token, tick });
      expect(sample.support.mode).toBe("supported");
      const resolution = port.resolve({
        token,
        proposal: {
          schemaVersion: 1,
          token,
          tick,
          translationDeltaMetersXYZ: [walkDeltaX, 0, 0],
          proposedLinearVelocityMetersPerSecondXYZ: [1.4, 0, 0],
          proposedFacingYawRadians: -Math.PI / 2,
          layeredMoves: [],
        },
      });
      port.commitTick(token);
      positionX = resolution.positionMetersXYZ[0];
      positionY = resolution.positionMetersXYZ[1];
      if (positionX > 2 && positionY > 1.05) break;
    }
    expect(positionY).toBeGreaterThan(1.05);
    expect(positionX).toBeGreaterThan(1.2);
  }, 30_000);

  it("climbs a 0.25m step when the native controller receives exact Motion Kernel translations", async () => {
    const { scene } = await realScene();
    addStaticBox(scene, "floor", new Vector3(0, -0.1, 0), new Vector3(24, 0.2, 8));
    addStaticBox(scene, "step", new Vector3(5.5, 0.125, 0), new Vector3(3, 0.25, 4));
    const controller = new GroundAwarePhysicsCharacterController(
      new Vector3(2, 0.95, 0),
      { capsuleHeight: 1.8, capsuleRadius: 0.35 },
      scene,
    );
    controller.keepDistance = 0.05;
    controller.keepContactTolerance = 0.1;
    controller.maxSlopeCosine = Math.cos((42 * Math.PI) / 180);
    controller.maxStepHeight = 0.3;
    disposals.push(() => controller.dispose());
    const gravityDirection = new Vector3(0, -1, 0);
    const fixedDeltaSeconds = 1 / 60;
    for (let tick = 1; tick <= 180; tick += 1) {
      const support = controller.checkSupport(fixedDeltaSeconds, gravityDirection);
      const desired = new Vector3(1.4, 0, 0);
      if (support.supportedState !== CharacterSupportedState.UNSUPPORTED) {
        const normal = support.averageSurfaceNormal.clone().normalize();
        const intoSurface = Vector3.Dot(desired, normal);
        if (intoSurface < 0) desired.subtractInPlace(normal.scale(intoSurface));
      }
      controller.prepareExactTranslation(
        desired.scale(fixedDeltaSeconds),
        desired,
        fixedDeltaSeconds,
      );
      controller.integrate(fixedDeltaSeconds, support, Vector3.Zero());
      if (controller.getPosition().x > 4.2 && controller.getPosition().y > 1.05) {
        break;
      }
    }
    expect(controller.getPosition().y).toBeGreaterThan(1.05);
    expect(controller.getPosition().x).toBeGreaterThan(4.2);
  }, 30_000);

  it("keeps a positive upward exact proposal unsupported across the next real support sample", async () => {
    const { scene } = await realScene();
    addStaticBox(
      scene,
      "jump-floor",
      new Vector3(0, -0.1, 0),
      new Vector3(10, 0.2, 10),
    );
    const checkSupport = vi.spyOn(
      PhysicsCharacterController.prototype,
      "checkSupport",
    );
    const integrate = vi.spyOn(
      PhysicsCharacterController.prototype,
      "integrate",
    );
    const port = createBabylonCharacterBodyPortV1(realPortOptions(scene));
    disposals.push(() => port.dispose());
    for (const [tick, speed] of [[1, 3], [2, 6]] as const) {
      const walkToken = createMovementTickTokenV1();
      const walkSample = port.beginTick({ token: walkToken, tick });
      expect(walkSample.support.mode).toBe("supported");
      port.resolve({
        token: walkToken,
        proposal: {
          schemaVersion: 1,
          token: walkToken,
          tick,
          translationDeltaMetersXYZ: [0, 0, -speed / 60],
          proposedLinearVelocityMetersPerSecondXYZ: [0, 0, -speed],
          proposedFacingYawRadians: 0,
          layeredMoves: [],
        },
      });
      port.commitTick(walkToken);
    }
    const token = createMovementTickTokenV1();
    const sample = port.beginTick({ token, tick: 3 });
    expect(sample.support.mode).toBe("supported");

    const resolution = port.resolve({
      token,
      proposal: {
        schemaVersion: 1,
        token,
        tick: 3,
        translationDeltaMetersXYZ: [0, 5.5 / 60, 0],
        proposedLinearVelocityMetersPerSecondXYZ: [0, 5.5, 0],
        proposedFacingYawRadians: 0,
        layeredMoves: [],
      },
    });

    expect(checkSupport).toHaveBeenCalledTimes(3);
    expect(integrate).toHaveBeenCalledTimes(3);
    expect(integrate.mock.calls[2]?.[1].supportedState)
      .toBe(CharacterSupportedState.UNSUPPORTED);
    expect(resolution.appliedTranslationMetersXYZ[1]).toBeGreaterThan(0.05);
    expect(resolution.linearVelocityMetersPerSecondXYZ[1]).toBeGreaterThan(5);
    expect(resolution.support.mode).toBe("unsupported");
    expect(resolution.hasCeilingContact).toBe(false);
    port.commitTick(token);

    const flightToken = createMovementTickTokenV1();
    const flightSample = port.beginTick({ token: flightToken, tick: 4 });
    expect(flightSample.linearVelocityMetersPerSecondXYZ[1]).toBeGreaterThan(5);
    expect(flightSample.support.mode).toBe("unsupported");
    port.abortTick(flightToken);
  }, 30_000);

  it("does not snap an unsupported falling body through unproposed vertical distance", async () => {
    const { scene } = await realScene();
    addStaticBox(
      scene,
      "airborne-snap-floor",
      new Vector3(0, -0.1, 0),
      new Vector3(10, 0.2, 10),
    );
    const port = createBabylonCharacterBodyPortV1({
      ...realPortOptions(scene),
      resetState: {
        positionMetersXYZ: [0, 1.2, 0],
        linearVelocityMetersPerSecondXYZ: [0, -1, 0],
      },
    });
    disposals.push(() => port.dispose());
    const token = createMovementTickTokenV1();
    const sample = port.beginTick({ token, tick: 1 });
    expect(sample.support.mode).toBe("unsupported");

    const resolution = port.resolve({
      token,
      proposal: {
        schemaVersion: 1,
        token,
        tick: 1,
        translationDeltaMetersXYZ: [0, -1 / 60, 0],
        proposedLinearVelocityMetersPerSecondXYZ: [0, -1, 0],
        proposedFacingYawRadians: 0,
        layeredMoves: [],
      },
    });

    expect(resolution.appliedTranslationMetersXYZ[1]).toBeCloseTo(-1 / 60, 5);
    expect(resolution.positionMetersXYZ[1]).toBeCloseTo(1.2 - 1 / 60, 5);
    expect(resolution.support.mode).toBe("unsupported");
  }, 30_000);

  it("retains grounded snap-down across a legal lower step", async () => {
    const { scene } = await realScene();
    addStaticBox(
      scene,
      "lower-step-floor",
      new Vector3(0, -0.3, 0),
      new Vector3(10, 0.2, 10),
    );
    addStaticBox(
      scene,
      "upper-step-platform",
      new Vector3(-1, -0.1, 0),
      new Vector3(2, 0.2, 2),
    );
    const port = createBabylonCharacterBodyPortV1({
      ...realPortOptions(scene),
      resetState: {
        positionMetersXYZ: [-0.4, 0.95, 0],
        linearVelocityMetersPerSecondXYZ: [0, 0, 0],
      },
    });
    disposals.push(() => port.dispose());
    let snapped: Readonly<{
      startedSupported: boolean;
      appliedYMeters: number;
      endedSupported: boolean;
    }> | undefined;
    for (let tick = 1; tick <= 20 && snapped === undefined; tick += 1) {
      const token = createMovementTickTokenV1();
      const sample = port.beginTick({ token, tick });
      const resolution = port.resolve({
        token,
        proposal: {
          schemaVersion: 1,
          token,
          tick,
          translationDeltaMetersXYZ: [4 / 60, 0, 0],
          proposedLinearVelocityMetersPerSecondXYZ: [4, 0, 0],
          proposedFacingYawRadians: 0,
          layeredMoves: [],
        },
      });
      if (resolution.appliedTranslationMetersXYZ[1] < -0.1) {
        snapped = Object.freeze({
          startedSupported: sample.support.mode === "supported",
          appliedYMeters: resolution.appliedTranslationMetersXYZ[1],
          endedSupported: resolution.support.mode === "supported",
        });
      }
      port.commitTick(token);
    }

    expect(snapped).toBeDefined();
    expect(snapped?.startedSupported).toBe(true);
    expect(snapped?.appliedYMeters).toBeGreaterThanOrEqual(
      -0.3 - BODY_RESOLUTION_COHERENCE_TOLERANCE_METERS_V1,
    );
    expect(snapped?.endedSupported).toBe(true);
  }, 30_000);

  it("allocates the real controller and performs one native support query and integrate per Tick", async () => {
    const { scene } = await realScene();
    const checkSupport = vi.spyOn(
      PhysicsCharacterController.prototype,
      "checkSupport",
    );
    const integrate = vi.spyOn(
      PhysicsCharacterController.prototype,
      "integrate",
    );
    const nativeDispose = vi.spyOn(
      GroundAwarePhysicsCharacterController.prototype,
      "dispose",
    );
    const port = createBabylonCharacterBodyPortV1({
      schemaVersion: 1,
      providerVersions: BABYLON_CHARACTER_BODY_PROVIDER_VERSIONS_V1,
      scene,
      fixedDeltaSeconds: 1 / 60,
      gravityMetersPerSecondSquaredXYZ: [0, -9.81, 0],
      capsule: { heightMeters: 1.8, radiusMeters: 0.35 },
      controller: {
        keepDistanceMeters: 0.05,
        keepContactToleranceMeters: 0.1,
        maxSlopeDegrees: 45,
        maxStepHeightMeters: 0.3,
        characterMassKilograms: 80,
      },
      resetState: {
        positionMetersXYZ: [0, 2, 0],
        linearVelocityMetersPerSecondXYZ: [0, 0, 0],
      },
    });

    const token = createMovementTickTokenV1();
    const sample = port.beginTick({ token, tick: 1 });
    const resolution = port.resolve({
      token,
      proposal: {
        schemaVersion: 1,
        token,
        tick: 1,
        translationDeltaMetersXYZ: [0.1, -0.01, 0],
        proposedLinearVelocityMetersPerSecondXYZ: [6, -0.6, 0],
        proposedFacingYawRadians: 0,
        layeredMoves: [],
      },
    });

    expect(checkSupport).toHaveBeenCalledTimes(1);
    expect(integrate).toHaveBeenCalledTimes(1);
    expect(sample.token).toBe(token);
    expect(resolution.token).toBe(token);
    expect(Object.isFrozen(sample)).toBe(true);
    expect(Object.isFrozen(resolution)).toBe(true);
    expect(sample).not.toHaveProperty("physicsController");
    expect(resolution).not.toHaveProperty("manifold");
    port.dispose();
    port.dispose();
    expect(nativeDispose).toHaveBeenCalledTimes(1);
  }, 30_000);

  it("fails the real provider closed after a post-integrate observation failure", async () => {
    const { scene } = await realScene();
    const nativeDispose = vi.spyOn(
      GroundAwarePhysicsCharacterController.prototype,
      "dispose",
    );
    const port = createBabylonCharacterBodyPortV1({
      schemaVersion: 1,
      providerVersions: BABYLON_CHARACTER_BODY_PROVIDER_VERSIONS_V1,
      scene,
      fixedDeltaSeconds: 1 / 60,
      gravityMetersPerSecondSquaredXYZ: [0, -9.81, 0],
      capsule: { heightMeters: 1.8, radiusMeters: 0.35 },
      controller: {
        keepDistanceMeters: 0.05,
        keepContactToleranceMeters: 0.1,
        maxSlopeDegrees: 45,
        maxStepHeightMeters: 0.3,
        characterMassKilograms: 80,
      },
      resetState: {
        positionMetersXYZ: [0, 2, 0],
        linearVelocityMetersPerSecondXYZ: [0, 0, 0],
      },
    });
    const token = createMovementTickTokenV1();
    port.beginTick({ token, tick: 1 });
    const primary = new Error("post-integrate provider observation failed");
    vi.spyOn(GroundAwarePhysicsCharacterController.prototype, "readCurrentContacts")
      .mockImplementationOnce(() => {
        throw primary;
      });

    expect(() => port.resolve({
      token,
      proposal: {
        schemaVersion: 1,
        token,
        tick: 1,
        translationDeltaMetersXYZ: [0.1, 0, 0],
        proposedLinearVelocityMetersPerSecondXYZ: [6, 0, 0],
        proposedFacingYawRadians: 0,
        layeredMoves: [],
      },
    })).toThrow(primary);
    expect(() => port.beginTick({ token: createMovementTickTokenV1(), tick: 2 }))
      .toThrow("3C_RUNTIME_DISPOSED");
    port.dispose();
    expect(nativeDispose).toHaveBeenCalledTimes(1);
  }, 30_000);
});
