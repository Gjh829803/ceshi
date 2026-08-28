import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Scene } from "@babylonjs/core/scene.pure.js";
import { parseBabylonNativeSceneBootstrapV1 } from
  "@whitebox-world/runtime-contracts";
import { afterEach, describe, expect, it } from "vitest";

import {
  createBabylonNativeHostRandomV1,
  defineBabylonNativeScene,
  type BabylonNativeLockedAssetResolverV1,
  type BabylonNativeSceneBuildContextV1,
  type BabylonNativeSceneModuleV1,
} from "./index.js";
import {
  buildBabylonNativeSceneCandidateV1,
  hashBabylonNativeSceneContributionV1,
  type BabylonNativeSceneAdmissionBudgetV1,
  type BuildBabylonNativeSceneCandidateResultV1,
} from "./host.js";

const retainedEngines: NullEngine[] = [];

const BOOTSTRAP = parseBabylonNativeSceneBootstrapV1({
  kind: "babylon-native-scene-bootstrap",
  schemaVersion: 1,
  id: "cloud-ridge-native",
  sceneModuleRef: "worldkit://native-scene/cloud-ridge@1",
  nativeSceneApiRef: "worldkit://native-scene-api/babylon@1",
  nativeSceneProfileRef: "worldkit://native-scene-profile/trusted-local@1",
  gameplayBootstrapRef: "worldkit://gameplay-bootstrap/g-bot@1",
  initialControlledEntityId: "player",
  gravityMetersPerSecondSquaredXYZ: [0, -9.81, 0],
  initialCamera: {
    mode: "third-person",
    pitchRadians: 0.1,
    distanceMeters: 5,
    fovDegrees: 55,
    targetHeightMeters: 1.2,
  },
  seed: 7301,
  spawnMarkerId: "player-spawn",
});

const ASSETS: BabylonNativeLockedAssetResolverV1 = Object.freeze({
  async resolve() {
    throw new Error("No asset is selected by this test Module.");
  },
});

const DEFAULT_BUDGET: BabylonNativeSceneAdmissionBudgetV1 = Object.freeze({
  maximumStaticColliderCount: 4,
  maximumStaticColliderVertexCount: 256,
  maximumStaticColliderTriangleCount: 64,
});

function createScene(): Scene {
  const engine = new NullEngine({
    renderWidth: 320,
    renderHeight: 180,
    textureSize: 128,
    deterministicLockstep: true,
    lockstepMaxSteps: 4,
  });
  retainedEngines.push(engine);
  return new Scene(engine);
}

function moduleWithBuild(
  build: BabylonNativeSceneModuleV1["build"],
): BabylonNativeSceneModuleV1 {
  return defineBabylonNativeScene({
    kind: "babylon-native-scene-module",
    id: "native-scene-test",
    build,
  });
}

function buildCandidate(
  scene: Scene,
  module: BabylonNativeSceneModuleV1,
  budget: BabylonNativeSceneAdmissionBudgetV1 = DEFAULT_BUDGET,
) {
  return buildBabylonNativeSceneCandidateV1({
    scene,
    bootstrap: BOOTSTRAP,
    module,
    random: createBabylonNativeHostRandomV1(BOOTSTRAP.seed),
    assets: ASSETS,
    budget,
  });
}

function registerSpawn(context: BabylonNativeSceneBuildContextV1): void {
  context.registration.registerSpawnMarker({
    id: "player-spawn",
    positionMetersXYZ: [0, 1, 0],
    facingRadians: 0,
  });
}

function rejectedCode(
  result: BuildBabylonNativeSceneCandidateResultV1,
): string | undefined {
  return result.outcome === "passed"
    ? undefined
    : result.checkResult.diagnostics.find(({ severity }) => severity === "error")?.code;
}

afterEach(() => {
  while (retainedEngines.length > 0) retainedEngines.pop()?.dispose();
});

describe("buildBabylonNativeSceneCandidateV1", () => {
  it("reports an invalid Bootstrap against unresolved-world", async () => {
    const scene = createScene();
    const result = await buildBabylonNativeSceneCandidateV1({
      scene,
      bootstrap: { ...BOOTSTRAP, geometry: [] } as never,
      module: moduleWithBuild(() => undefined),
      random: createBabylonNativeHostRandomV1(BOOTSTRAP.seed),
      assets: ASSETS,
      budget: DEFAULT_BUDGET,
    });

    expect(result.outcome).toBe("rejected");
    expect(result.checkResult.checkedInput).toEqual({ kind: "unresolved-world" });
    expect(rejectedCode(result)).toBe("WORLDKIT_NATIVE_SCENE_BOOTSTRAP_INVALID");
  });

  it("freezes transformed indexed geometry without Babylon handles", async () => {
    const scene = createScene();
    const collider = MeshBuilder.CreateBox("platform", { size: 2 }, scene);
    collider.position.set(5, 2, -3);
    const result = await buildCandidate(scene, moduleWithBuild((context) => {
      registerSpawn(context);
      context.registration.registerStaticCollider({
        id: "platform",
        mesh: collider,
        traversalBinding: {
          kind: "static-surface",
          surfaceEntityId: "platform",
          logicalSubshapeId: "primary",
          traversalSurfaceProfileRef:
            "worldkit://traversal-surface-profile/ground.static@1",
        },
        frictionRatio: 0.8,
        restitutionRatio: 0.05,
      });
    }));

    expect(result.outcome).toBe("passed");
    if (result.outcome !== "passed") return;
    const frozen = result.contribution.staticColliders[0]!;
    expect(frozen).toMatchObject({
      id: "platform",
      frictionRatio: 0.8,
      restitutionRatio: 0.05,
      vertexCount: 24,
      triangleCount: 12,
    });
    expect(Math.min(...frozen.worldPositionsMetersXYZ.filter((_, index) => index % 3 === 0))).toBe(4);
    expect(Math.max(...frozen.worldPositionsMetersXYZ.filter((_, index) => index % 3 === 1))).toBe(3);
    expect(Object.hasOwn(frozen, "mesh")).toBe(false);
    expect(Object.hasOwn(frozen, "sourceMesh")).toBe(false);
    expect(result.contributionHash).toBe(
      hashBabylonNativeSceneContributionV1(result.contribution),
    );
    expect(result.checkResult.outcome).toBe("passed");
  });

  it.each([
    ["missing spawn", "WORLDKIT_NATIVE_SCENE_SPAWN_REQUIRED", (context: BabylonNativeSceneBuildContextV1) => void context],
    ["duplicate spawn", "WORLDKIT_NATIVE_SCENE_SPAWN_DUPLICATE", (context: BabylonNativeSceneBuildContextV1) => {
      registerSpawn(context);
      registerSpawn(context);
    }],
    ["wrong spawn binding", "WORLDKIT_NATIVE_SCENE_SPAWN_MARKER_MISMATCH", (context: BabylonNativeSceneBuildContextV1) => {
      context.registration.registerSpawnMarker({ id: "other", positionMetersXYZ: [0, 1, 0], facingRadians: 0 });
    }],
    ["invalid spawn", "WORLDKIT_NATIVE_SCENE_SPAWN_INVALID", (context: BabylonNativeSceneBuildContextV1) => {
      context.registration.registerSpawnMarker({ id: "player-spawn", positionMetersXYZ: [0, Number.NaN, 0], facingRadians: 0 });
    }],
  ])("rejects %s", async (_label, code, build) => {
    const scene = createScene();
    const result = await buildCandidate(scene, moduleWithBuild(build));
    expect(result.outcome).toBe("rejected");
    expect(rejectedCode(result)).toBe(code);
  });

  it("rejects duplicate IDs and a non-closed traversal binding", async () => {
    const scene = createScene();
    const collider = MeshBuilder.CreateBox("platform", { size: 2 }, scene);
    const duplicate = await buildCandidate(scene, moduleWithBuild((context) => {
      registerSpawn(context);
      context.registration.registerStaticCollider({ id: "platform", mesh: collider, traversalBinding: { kind: "not-traversable" } });
      context.registration.registerStaticCollider({ id: "platform", mesh: collider, traversalBinding: { kind: "not-traversable" } });
    }));
    expect(rejectedCode(duplicate)).toBe("WORLDKIT_NATIVE_SCENE_COLLIDER_ID_DUPLICATE");

    const invalid = await buildCandidate(scene, moduleWithBuild((context) => {
      registerSpawn(context);
      context.registration.registerStaticCollider({
        id: "platform-2",
        mesh: collider,
        traversalBinding: { kind: "walkable" } as never,
      });
    }));
    expect(rejectedCode(invalid)).toBe("WORLDKIT_NATIVE_SCENE_TRAVERSAL_BINDING_INVALID");
  });

  it("rejects foreign, disposed, thin-instance, and provider-physics meshes", async () => {
    const scene = createScene();
    const foreignScene = createScene();
    const cases = [
      ["foreign", MeshBuilder.CreateBox("foreign", { size: 2 }, foreignScene), "WORLDKIT_NATIVE_SCENE_COLLIDER_SCENE_MISMATCH"],
      ["disposed", MeshBuilder.CreateBox("disposed", { size: 2 }, scene), "WORLDKIT_NATIVE_SCENE_COLLIDER_DISPOSED"],
      ["thin", MeshBuilder.CreateBox("thin", { size: 2 }, scene), "WORLDKIT_NATIVE_SCENE_COLLIDER_PROVIDER_STATE_INVALID"],
      ["physics", MeshBuilder.CreateBox("physics", { size: 2 }, scene), "WORLDKIT_NATIVE_SCENE_COLLIDER_PROVIDER_STATE_INVALID"],
    ] as const;
    cases[1][1].dispose();
    Object.defineProperty(cases[2][1], "hasThinInstances", { configurable: true, value: true });
    Object.defineProperty(cases[3][1], "physicsBody", { configurable: true, value: {} });

    for (const [id, mesh, code] of cases) {
      const result = await buildCandidate(scene, moduleWithBuild((context) => {
        registerSpawn(context);
        context.registration.registerStaticCollider({ id, mesh, traversalBinding: { kind: "not-traversable" } });
      }));
      expect(rejectedCode(result), id).toBe(code);
    }
  });

  it("rejects malformed vertices, indices, and world transforms", async () => {
    const scene = createScene();
    const invalidVertices = MeshBuilder.CreateBox("vertices", { size: 2, updatable: true }, scene);
    const positions = invalidVertices.getVerticesData(VertexBuffer.PositionKind)!;
    positions[0] = Number.NaN;
    invalidVertices.updateVerticesData(VertexBuffer.PositionKind, positions);
    const invalidIndices = MeshBuilder.CreateBox("indices", { size: 2, updatable: true }, scene);
    invalidIndices.setIndices([0, 1, 99]);
    const invalidTransform = MeshBuilder.CreateBox("transform", { size: 2 }, scene);
    invalidTransform.position.x = Number.POSITIVE_INFINITY;

    for (const mesh of [invalidVertices, invalidIndices, invalidTransform]) {
      const result = await buildCandidate(scene, moduleWithBuild((context) => {
        registerSpawn(context);
        context.registration.registerStaticCollider({ id: mesh.name, mesh, traversalBinding: { kind: "not-traversable" } });
      }));
      expect(rejectedCode(result), mesh.name).toBe("WORLDKIT_NATIVE_SCENE_COLLIDER_GEOMETRY_INVALID");
    }
  });

  it("rejects geometry or binding drift during build and detaches after closure", async () => {
    const scene = createScene();
    const geometry = MeshBuilder.CreateBox("geometry-drift", { size: 2 }, scene);
    const geometryResult = await buildCandidate(scene, moduleWithBuild((context) => {
      registerSpawn(context);
      context.registration.registerStaticCollider({ id: "geometry-drift", mesh: geometry, traversalBinding: { kind: "not-traversable" } });
      geometry.position.x = 2;
    }));
    expect(rejectedCode(geometryResult)).toBe("WORLDKIT_NATIVE_SCENE_COLLIDER_DRIFT");

    const binding = { kind: "not-traversable" } as { kind: string };
    const bindingMesh = MeshBuilder.CreateBox("binding-drift", { size: 2 }, scene);
    const bindingResult = await buildCandidate(scene, moduleWithBuild((context) => {
      registerSpawn(context);
      context.registration.registerStaticCollider({ id: "binding-drift", mesh: bindingMesh, traversalBinding: binding as never });
      binding.kind = "static-surface";
    }));
    expect(rejectedCode(bindingResult)).toBe("WORLDKIT_NATIVE_SCENE_COLLIDER_DRIFT");

    const stableMesh = MeshBuilder.CreateBox("stable", { size: 2 }, scene);
    const stableResult = await buildCandidate(scene, moduleWithBuild((context) => {
      registerSpawn(context);
      context.registration.registerStaticCollider({ id: "stable", mesh: stableMesh, traversalBinding: { kind: "not-traversable" } });
    }));
    expect(stableResult.outcome).toBe("passed");
    if (stableResult.outcome !== "passed") return;
    const before = [...stableResult.contribution.staticColliders[0]!.worldPositionsMetersXYZ];
    stableMesh.position.x = 100;
    stableMesh.dispose();
    expect(stableResult.contribution.staticColliders[0]!.worldPositionsMetersXYZ).toEqual(before);
  });

  it("closes registration after build settlement", async () => {
    const scene = createScene();
    let retainedRegistration: BabylonNativeSceneBuildContextV1["registration"] | undefined;
    const result = await buildCandidate(scene, moduleWithBuild((context) => {
      registerSpawn(context);
      retainedRegistration = context.registration;
    }));
    expect(result.outcome).toBe("passed");
    expect(() => retainedRegistration!.registerSpawnMarker({
      id: "late",
      positionMetersXYZ: [0, 1, 0],
      facingRadians: 0,
    })).toThrow("WORLDKIT_NATIVE_SCENE_REGISTRATION_CLOSED");
  });

  it("retains a Host registration failure caught by Module code", async () => {
    const scene = createScene();
    const collider = MeshBuilder.CreateBox("caught", { size: 2 }, scene);
    const result = await buildCandidate(scene, moduleWithBuild((context) => {
      registerSpawn(context);
      try {
        context.registration.registerStaticCollider({
          id: "caught",
          mesh: collider,
          traversalBinding: { kind: "not-traversable" },
          frictionRatio: 2,
        });
      } catch {
        // A Module cannot erase a Host admission failure.
      }
    }));

    expect(rejectedCode(result)).toBe(
      "WORLDKIT_NATIVE_SCENE_COLLIDER_MATERIAL_INVALID",
    );
  });

  it("canonicalizes signed zero at the provider publication boundary", async () => {
    const scene = createScene();
    const result = await buildCandidate(scene, moduleWithBuild((context) => {
      context.registration.registerSpawnMarker({
        id: "player-spawn",
        positionMetersXYZ: [-0, 1, -0],
        facingRadians: -0,
      });
    }));

    expect(result.outcome).toBe("passed");
    if (result.outcome !== "passed") return;
    expect(result.contribution.spawnMarker.positionMetersXYZ).toEqual([0, 1, 0]);
    expect(Object.is(result.contribution.spawnMarker.facingRadians, -0)).toBe(false);
  });

  it("enforces collider count, vertex, and triangle budgets", async () => {
    const scene = createScene();
    const first = MeshBuilder.CreateBox("first", { size: 2 }, scene);
    const second = MeshBuilder.CreateBox("second", { size: 2 }, scene);
    const module = moduleWithBuild((context) => {
      registerSpawn(context);
      context.registration.registerStaticCollider({ id: "first", mesh: first, traversalBinding: { kind: "not-traversable" } });
      context.registration.registerStaticCollider({ id: "second", mesh: second, traversalBinding: { kind: "not-traversable" } });
    });
    const cases = [
      [{ maximumStaticColliderCount: 1, maximumStaticColliderVertexCount: 256, maximumStaticColliderTriangleCount: 64 }, "WORLDKIT_NATIVE_SCENE_COLLIDER_COUNT_EXCEEDED"],
      [{ maximumStaticColliderCount: 2, maximumStaticColliderVertexCount: 47, maximumStaticColliderTriangleCount: 64 }, "WORLDKIT_NATIVE_SCENE_COLLIDER_VERTICES_EXCEEDED"],
      [{ maximumStaticColliderCount: 2, maximumStaticColliderVertexCount: 256, maximumStaticColliderTriangleCount: 23 }, "WORLDKIT_NATIVE_SCENE_COLLIDER_TRIANGLES_EXCEEDED"],
    ] as const;
    for (const [budget, code] of cases) {
      expect(rejectedCode(await buildCandidate(scene, module, budget))).toBe(code);
    }
  });

  it("rejects a non-exact admission budget before Module build", async () => {
    const scene = createScene();
    let buildCalled = false;
    const result = await buildCandidate(
      scene,
      moduleWithBuild(() => {
        buildCalled = true;
      }),
      {
        maximumStaticColliderCount: 4,
        maximumStaticColliderVertexCount: 256,
        legacyTriangleLimit: 64,
      } as never,
    );

    expect(rejectedCode(result)).toBe("WORLDKIT_NATIVE_SCENE_BUDGET_INVALID");
    expect(buildCalled).toBe(false);
  });

  it("sorts registrations so call order cannot change canonical bytes", async () => {
    const build = async (reverse: boolean) => {
      const scene = createScene();
      const meshes = {
        alpha: MeshBuilder.CreateBox("alpha", { size: 1 }, scene),
        beta: MeshBuilder.CreateBox("beta", { size: 2 }, scene),
      };
      return buildCandidate(scene, moduleWithBuild((context) => {
        registerSpawn(context);
        for (const id of reverse ? ["beta", "alpha"] as const : ["alpha", "beta"] as const) {
          context.registration.registerStaticCollider({ id, mesh: meshes[id], traversalBinding: { kind: "not-traversable" } });
        }
      }));
    };
    const first = await build(false);
    const second = await build(true);
    expect(first.outcome).toBe("passed");
    expect(second.outcome).toBe("passed");
    if (first.outcome !== "passed" || second.outcome !== "passed") return;
    expect(first.contribution.staticColliders.map(({ id }) => id)).toEqual(["alpha", "beta"]);
    expect(first.contribution).toEqual(second.contribution);
    expect(first.contributionHash).toBe(second.contributionHash);
  });
});
