import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Scene } from "@babylonjs/core/scene.pure.js";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildBabylonNativeSceneContributionV1,
  type BabylonNativeSceneModuleV1,
} from "./native-scene-module.js";

const retainedEngines: NullEngine[] = [];

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
  return Object.freeze({
    kind: "babylon-native-scene-module",
    id: "native-scene-test",
    build,
  });
}

const DEFAULT_BUDGET = Object.freeze({
  maximumStaticColliderCount: 4,
  maximumStaticColliderVertexCount: 256,
  maximumStaticColliderTriangleCount: 64,
});

afterEach(() => {
  while (retainedEngines.length > 0) retainedEngines.pop()?.dispose();
});

describe("Babylon Native Scene Module V1", () => {
  it("returns one immutable spawn marker and explicit collider registration", async () => {
    const scene = createScene();
    const collider = MeshBuilder.CreateBox("platform", { size: 2 }, scene);

    const contribution = await buildBabylonNativeSceneContributionV1({
      scene,
      module: moduleWithBuild((context) => {
        context.registerSpawnMarker({
          id: "player-spawn",
          positionMetersXYZ: [1, 2, 3],
          facingRadians: Math.PI,
        });
        context.registerStaticCollisionMesh({
          id: "platform",
          mesh: collider,
          surfaceKind: "walkable",
          frictionRatio: 0.8,
          restitutionRatio: 0.05,
        });
      }),
      budget: DEFAULT_BUDGET,
    });

    expect(contribution.moduleId).toBe("native-scene-test");
    expect(contribution.spawnMarker).toEqual({
      id: "player-spawn",
      positionMetersXYZ: [1, 2, 3],
      facingRadians: Math.PI,
    });
    expect(contribution.staticCollisionMeshes).toHaveLength(1);
    expect(contribution.staticCollisionMeshes[0]).toMatchObject({
      id: "platform",
      sourceMesh: collider,
      surfaceKind: "walkable",
      frictionRatio: 0.8,
      restitutionRatio: 0.05,
      vertexCount: 24,
      triangleCount: 12,
    });
    expect(Object.isFrozen(contribution)).toBe(true);
    expect(Object.isFrozen(contribution.spawnMarker.positionMetersXYZ)).toBe(true);
    expect(Object.isFrozen(contribution.staticCollisionMeshes)).toBe(true);
    expect(Object.isFrozen(
      contribution.staticCollisionMeshes[0]!.worldPositionsMetersXYZ,
    )).toBe(true);
    expect(Object.isFrozen(
      contribution.staticCollisionMeshes[0]!.triangleIndices,
    )).toBe(true);
  });

  it("rejects missing or duplicate spawn markers and duplicate collider IDs", async () => {
    const scene = createScene();
    const collider = MeshBuilder.CreateBox("platform", { size: 2 }, scene);

    await expect(buildBabylonNativeSceneContributionV1({
      scene,
      module: moduleWithBuild((context) => {
        context.registerStaticCollisionMesh({
          id: "platform",
          mesh: collider,
          surfaceKind: "walkable",
        });
      }),
      budget: DEFAULT_BUDGET,
    })).rejects.toThrow("WORLDKIT_NATIVE_SCENE_SPAWN_REQUIRED");

    await expect(buildBabylonNativeSceneContributionV1({
      scene,
      module: moduleWithBuild((context) => {
        context.registerSpawnMarker({
          id: "player-spawn",
          positionMetersXYZ: [0, 1, 0],
          facingRadians: 0,
        });
        context.registerSpawnMarker({
          id: "second-spawn",
          positionMetersXYZ: [0, 1, 0],
          facingRadians: 0,
        });
      }),
      budget: DEFAULT_BUDGET,
    })).rejects.toThrow("WORLDKIT_NATIVE_SCENE_SPAWN_DUPLICATE");

    await expect(buildBabylonNativeSceneContributionV1({
      scene,
      module: moduleWithBuild((context) => {
        context.registerSpawnMarker({
          id: "player-spawn",
          positionMetersXYZ: [0, 1, 0],
          facingRadians: 0,
        });
        context.registerStaticCollisionMesh({
          id: "platform",
          mesh: collider,
          surfaceKind: "walkable",
        });
        context.registerStaticCollisionMesh({
          id: "platform",
          mesh: collider,
          surfaceKind: "obstacle",
        });
      }),
      budget: DEFAULT_BUDGET,
    })).rejects.toThrow("WORLDKIT_NATIVE_SCENE_COLLIDER_ID_DUPLICATE");
  });

  it("rejects non-finite spawn values", async () => {
    const scene = createScene();
    await expect(buildBabylonNativeSceneContributionV1({
      scene,
      module: moduleWithBuild((context) => {
        context.registerSpawnMarker({
          id: "player-spawn",
          positionMetersXYZ: [0, Number.NaN, 0],
          facingRadians: 0,
        });
      }),
      budget: DEFAULT_BUDGET,
    })).rejects.toThrow("WORLDKIT_NATIVE_SCENE_SPAWN_INVALID");
  });

  it("rejects foreign-scene and disposed collider meshes", async () => {
    const scene = createScene();
    const foreignScene = createScene();
    const foreign = MeshBuilder.CreateBox("foreign", { size: 2 }, foreignScene);

    await expect(buildBabylonNativeSceneContributionV1({
      scene,
      module: moduleWithBuild((context) => {
        context.registerSpawnMarker({
          id: "player-spawn",
          positionMetersXYZ: [0, 1, 0],
          facingRadians: 0,
        });
        context.registerStaticCollisionMesh({
          id: "foreign",
          mesh: foreign,
          surfaceKind: "walkable",
        });
      }),
      budget: DEFAULT_BUDGET,
    })).rejects.toThrow("WORLDKIT_NATIVE_SCENE_COLLIDER_SCENE_MISMATCH");

    const disposed = MeshBuilder.CreateBox("disposed", { size: 2 }, scene);
    disposed.dispose();
    await expect(buildBabylonNativeSceneContributionV1({
      scene,
      module: moduleWithBuild((context) => {
        context.registerSpawnMarker({
          id: "player-spawn",
          positionMetersXYZ: [0, 1, 0],
          facingRadians: 0,
        });
        context.registerStaticCollisionMesh({
          id: "disposed",
          mesh: disposed,
          surfaceKind: "walkable",
        });
      }),
      budget: DEFAULT_BUDGET,
    })).rejects.toThrow("WORLDKIT_NATIVE_SCENE_COLLIDER_DISPOSED");
  });

  it("rejects collider source Meshes with provider-owned physics or thin instances", async () => {
    const scene = createScene();
    const withThinInstance = MeshBuilder.CreateBox(
      "thin-instance-source",
      { size: 2 },
      scene,
    );
    Object.defineProperty(withThinInstance, "hasThinInstances", {
      configurable: true,
      value: true,
    });
    await expect(buildBabylonNativeSceneContributionV1({
      scene,
      module: moduleWithBuild((context) => {
        context.registerSpawnMarker({
          id: "player-spawn",
          positionMetersXYZ: [0, 1, 0],
          facingRadians: 0,
        });
        context.registerStaticCollisionMesh({
          id: "thin-instance-source",
          mesh: withThinInstance,
          surfaceKind: "walkable",
        });
      }),
      budget: DEFAULT_BUDGET,
    })).rejects.toThrow(
      "WORLDKIT_NATIVE_SCENE_COLLIDER_PROVIDER_STATE_INVALID",
    );

    const withPhysicsBody = MeshBuilder.CreateBox(
      "provider-physics-source",
      { size: 2 },
      scene,
    );
    Object.defineProperty(withPhysicsBody, "physicsBody", {
      configurable: true,
      value: {},
    });
    await expect(buildBabylonNativeSceneContributionV1({
      scene,
      module: moduleWithBuild((context) => {
        context.registerSpawnMarker({
          id: "player-spawn",
          positionMetersXYZ: [0, 1, 0],
          facingRadians: 0,
        });
        context.registerStaticCollisionMesh({
          id: "provider-physics-source",
          mesh: withPhysicsBody,
          surfaceKind: "walkable",
        });
      }),
      budget: DEFAULT_BUDGET,
    })).rejects.toThrow(
      "WORLDKIT_NATIVE_SCENE_COLLIDER_PROVIDER_STATE_INVALID",
    );
  });

  it("rejects non-finite collider vertices and world transforms", async () => {
    const scene = createScene();
    const invalidVertices = MeshBuilder.CreateBox(
      "invalid-vertices",
      { size: 2, updatable: true },
      scene,
    );
    const positions = invalidVertices.getVerticesData(VertexBuffer.PositionKind)!;
    positions[0] = Number.NaN;
    invalidVertices.updateVerticesData(VertexBuffer.PositionKind, positions);

    await expect(buildBabylonNativeSceneContributionV1({
      scene,
      module: moduleWithBuild((context) => {
        context.registerSpawnMarker({
          id: "player-spawn",
          positionMetersXYZ: [0, 1, 0],
          facingRadians: 0,
        });
        context.registerStaticCollisionMesh({
          id: "invalid-vertices",
          mesh: invalidVertices,
          surfaceKind: "walkable",
        });
      }),
      budget: DEFAULT_BUDGET,
    })).rejects.toThrow("WORLDKIT_NATIVE_SCENE_COLLIDER_GEOMETRY_INVALID");

    const invalidTransform = MeshBuilder.CreateBox(
      "invalid-transform",
      { size: 2 },
      scene,
    );
    invalidTransform.position.x = Number.POSITIVE_INFINITY;
    await expect(buildBabylonNativeSceneContributionV1({
      scene,
      module: moduleWithBuild((context) => {
        context.registerSpawnMarker({
          id: "player-spawn",
          positionMetersXYZ: [0, 1, 0],
          facingRadians: 0,
        });
        context.registerStaticCollisionMesh({
          id: "invalid-transform",
          mesh: invalidTransform,
          surfaceKind: "walkable",
        });
      }),
      budget: DEFAULT_BUDGET,
    })).rejects.toThrow("WORLDKIT_NATIVE_SCENE_COLLIDER_GEOMETRY_INVALID");
  });

  it("revalidates registered collider state after module build completes", async () => {
    const scene = createScene();
    const disposedAfterRegistration = MeshBuilder.CreateBox(
      "disposed-after-registration",
      { size: 2 },
      scene,
    );
    await expect(buildBabylonNativeSceneContributionV1({
      scene,
      module: moduleWithBuild((context) => {
        context.registerSpawnMarker({
          id: "player-spawn",
          positionMetersXYZ: [0, 1, 0],
          facingRadians: 0,
        });
        context.registerStaticCollisionMesh({
          id: "disposed-after-registration",
          mesh: disposedAfterRegistration,
          surfaceKind: "walkable",
        });
        disposedAfterRegistration.dispose();
      }),
      budget: DEFAULT_BUDGET,
    })).rejects.toThrow("WORLDKIT_NATIVE_SCENE_COLLIDER_DISPOSED");
  });

  it("retains a collider material failure caught inside the module", async () => {
    const scene = createScene();
    const collider = MeshBuilder.CreateBox("platform", { size: 2 }, scene);
    await expect(buildBabylonNativeSceneContributionV1({
      scene,
      module: moduleWithBuild((context) => {
        context.registerSpawnMarker({
          id: "player-spawn",
          positionMetersXYZ: [0, 1, 0],
          facingRadians: 0,
        });
        try {
          context.registerStaticCollisionMesh({
            id: "platform",
            mesh: collider,
            surfaceKind: "walkable",
            frictionRatio: 2,
          });
        } catch {
          // A Module cannot erase a Host admission failure by catching it.
        }
      }),
      budget: DEFAULT_BUDGET,
    })).rejects.toThrow("WORLDKIT_NATIVE_SCENE_COLLIDER_MATERIAL_INVALID");

    await expect(buildBabylonNativeSceneContributionV1({
      scene,
      module: moduleWithBuild((context) => {
        context.registerSpawnMarker({
          id: "player-spawn",
          positionMetersXYZ: [0, 1, 0],
          facingRadians: 0,
        });
        try {
          context.registerStaticCollisionMesh({
            id: "platform-after-catch",
            mesh: collider,
            surfaceKind: "walkable",
            frictionRatio: 2,
          });
        } catch {
          throw new Error("MODULE_FAILURE_MUST_NOT_MASK_HOST_ADMISSION");
        }
      }),
      budget: DEFAULT_BUDGET,
    })).rejects.toThrow("WORLDKIT_NATIVE_SCENE_COLLIDER_MATERIAL_INVALID");
  });

  it("enforces collider count and triangle budgets", async () => {
    const scene = createScene();
    const first = MeshBuilder.CreateBox("first", { size: 2 }, scene);
    const second = MeshBuilder.CreateBox("second", { size: 2 }, scene);
    const module = moduleWithBuild((context) => {
      context.registerSpawnMarker({
        id: "player-spawn",
        positionMetersXYZ: [0, 1, 0],
        facingRadians: 0,
      });
      context.registerStaticCollisionMesh({
        id: "first",
        mesh: first,
        surfaceKind: "walkable",
      });
      context.registerStaticCollisionMesh({
        id: "second",
        mesh: second,
        surfaceKind: "walkable",
      });
    });

    await expect(buildBabylonNativeSceneContributionV1({
      scene,
      module,
      budget: {
        maximumStaticColliderCount: 1,
        maximumStaticColliderVertexCount: 256,
        maximumStaticColliderTriangleCount: 64,
      },
    })).rejects.toThrow("WORLDKIT_NATIVE_SCENE_COLLIDER_COUNT_EXCEEDED");

    await expect(buildBabylonNativeSceneContributionV1({
      scene,
      module,
      budget: {
        maximumStaticColliderCount: 2,
        maximumStaticColliderVertexCount: 256,
        maximumStaticColliderTriangleCount: 23,
      },
    })).rejects.toThrow("WORLDKIT_NATIVE_SCENE_COLLIDER_TRIANGLES_EXCEEDED");

    await expect(buildBabylonNativeSceneContributionV1({
      scene,
      module: moduleWithBuild((context) => {
        context.registerSpawnMarker({
          id: "player-spawn",
          positionMetersXYZ: [0, 1, 0],
          facingRadians: 0,
        });
        context.registerStaticCollisionMesh({
          id: "vertex-heavy",
          mesh: first,
          surfaceKind: "walkable",
        });
      }),
      budget: {
        maximumStaticColliderCount: 1,
        maximumStaticColliderVertexCount: 23,
        maximumStaticColliderTriangleCount: 64,
      },
    })).rejects.toThrow("WORLDKIT_NATIVE_SCENE_COLLIDER_VERTICES_EXCEEDED");
  });
});
