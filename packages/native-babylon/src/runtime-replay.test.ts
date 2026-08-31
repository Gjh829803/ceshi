import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Scene } from "@babylonjs/core/scene.pure.js";
import { parseBabylonNativeSceneBootstrapV1 } from
  "@whitebox-world/runtime-contracts";
import { describe, expect, it } from "vitest";

import {
  defineBabylonNativeScene,
  type BabylonNativeLockedAssetResolverV1,
  type BabylonNativeSceneBuildContextV1,
} from "./index.js";
import {
  commitBabylonNativeProfileSettlementV1,
  replayBabylonNativeSceneModuleV1,
  type BabylonNativeSceneCandidateFactoryV1,
  type BabylonNativeSceneCandidateLeaseV1,
  type ReplayBabylonNativeSceneModuleResultV1,
} from "./host.js";

const BOOTSTRAP = parseBabylonNativeSceneBootstrapV1({
  kind: "babylon-native-scene-bootstrap",
  schemaVersion: 1,
  id: "runtime-replay-native",
  sceneModuleRef: "worldkit://native-scene/runtime-replay@1",
  nativeSceneApiRef: "worldkit://native-scene-api/babylon@1",
  nativeSceneProfileRef: "worldkit://native-scene-profile/whitebox.standard@1",
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
  seed: 20260829,
  spawnMarkerId: "player-spawn",
});
const BLOCK_BOOTSTRAP = parseBabylonNativeSceneBootstrapV1({
  ...BOOTSTRAP,
  id: "runtime-replay-native-blocks",
  nativeSceneProfileRef:
    "worldkit://native-scene-profile/whitebox.blocks@1",
});

const ASSETS: BabylonNativeLockedAssetResolverV1 = Object.freeze({
  async resolve() {
    throw new Error("No asset is selected by this replay test.");
  },
});

const BUDGET = Object.freeze({
  maximumStaticColliderCount: 8,
  maximumStaticColliderVertexCount: 512,
  maximumStaticColliderTriangleCount: 256,
});

interface TrackedFactoryOptions {
  readonly failCreateAt?: number;
  readonly failDisposeAt?: number;
}

interface TrackedFactory {
  readonly factory: BabylonNativeSceneCandidateFactoryV1;
  readonly leases: readonly BabylonNativeSceneCandidateLeaseV1[];
  readonly disposedIndices: readonly number[];
  readonly createCount: number;
}

function trackedFactory(
  options: TrackedFactoryOptions = {},
): TrackedFactory {
  const leases: BabylonNativeSceneCandidateLeaseV1[] = [];
  const disposedIndices: number[] = [];
  let createCount = 0;
  const state = {
    factory: Object.freeze({
      createCandidate(): BabylonNativeSceneCandidateLeaseV1 {
        createCount += 1;
        if (createCount === options.failCreateAt) {
          throw new Error("private candidate factory detail");
        }
        const index = createCount;
        const engine = new NullEngine({
          renderWidth: 320,
          renderHeight: 180,
          textureSize: 128,
          deterministicLockstep: true,
          lockstepMaxSteps: 4,
        });
        const scene = new Scene(engine);
        const lease = Object.freeze({
          engine,
          scene,
          dispose(): void {
            disposedIndices.push(index);
            scene.dispose();
            engine.dispose();
            if (index === options.failDisposeAt) {
              throw new Error("private candidate cleanup detail");
            }
          },
        });
        leases.push(lease);
        return lease;
      },
    }),
    leases,
    disposedIndices,
    get createCount(): number {
      return createCount;
    },
  };
  return state;
}

function registerSpawn(
  context: BabylonNativeSceneBuildContextV1,
  x = 0,
): void {
  context.registration.registerSpawnMarker({
    id: "player-spawn",
    positionMetersXYZ: [x, 1, 0],
    facingRadians: 0,
  });
}

function registerCollider(
  context: BabylonNativeSceneBuildContextV1,
  input: Readonly<{
    id: string;
    x?: number;
    size?: number;
    frictionRatio?: number;
    traversable?: boolean;
  }>,
): void {
  const mesh = MeshBuilder.CreateBox(
    input.id,
    { size: input.size ?? 2 },
    context.scene,
  );
  mesh.position.x = input.x ?? 0;
  context.registration.registerStaticCollider({
    id: input.id,
    mesh,
    ...(typeof input.frictionRatio === "undefined"
      ? {}
      : { frictionRatio: input.frictionRatio }),
    traversalBinding: input.traversable
      ? {
          kind: "static-surface",
          surfaceEntityId: input.id,
          logicalSubshapeId: "top",
          traversalSurfaceProfileRef:
            "worldkit://traversal-surface-profile/ground.static@1",
        }
      : { kind: "not-traversable" },
  });
}

function input(
  factory: BabylonNativeSceneCandidateFactoryV1,
  module: ReturnType<typeof defineBabylonNativeScene>,
  bootstrap = BOOTSTRAP,
) {
  return {
    candidateFactory: factory,
    bootstrap,
    module,
    assets: ASSETS,
    budget: BUDGET,
  } as const;
}

function diagnosticCodes(
  result: ReplayBabylonNativeSceneModuleResultV1,
): readonly string[] {
  return result.checkResult.diagnostics.map(({ code }) => code);
}

function allKeys(input: unknown, output = new Set<string>()): ReadonlySet<string> {
  if (typeof input !== "object" || input === null) return output;
  for (const [key, value] of Object.entries(input)) {
    output.add(key);
    allKeys(value, output);
  }
  return output;
}

describe("replayBabylonNativeSceneModuleV1", () => {
  it("reuses one Module across two isolated Candidates and returns handle-free canonical output", async () => {
    const tracked = trackedFactory();
    const buildScenes: Scene[] = [];
    const module = defineBabylonNativeScene({
      kind: "babylon-native-scene-module",
      id: "stable-replay",
      build(context) {
        buildScenes.push(context.scene);
        registerSpawn(context);
        registerCollider(context, { id: "route", traversable: true });
      },
    });

    const result = await replayBabylonNativeSceneModuleV1(
      input(tracked.factory, module),
    );

    expect(result.checkResult.outcome).toBe("passed");
    expect(tracked.createCount).toBe(2);
    expect(tracked.disposedIndices).toEqual([1, 2]);
    expect(buildScenes).toHaveLength(2);
    expect(buildScenes[0]).not.toBe(buildScenes[1]);
    expect(buildScenes[0]!.getEngine()).not.toBe(buildScenes[1]!.getEngine());
    if (result.checkResult.outcome === "passed" && "contribution" in result) {
      expect(result.contributionHash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(Object.isFrozen(result.contribution)).toBe(true);
    }
    expect([...allKeys(result)]).not.toEqual(
      expect.arrayContaining([
        "candidate",
        "scene",
        "engine",
        "mesh",
        "dispose",
        "disposer",
      ]),
    );
  });

  it("normalizes Collider registration order before byte comparison", async () => {
    const tracked = trackedFactory();
    let buildCount = 0;
    const module = defineBabylonNativeScene({
      kind: "babylon-native-scene-module",
      id: "order-replay",
      build(context) {
        buildCount += 1;
        registerSpawn(context);
        const ids = buildCount === 1 ? ["alpha", "beta"] : ["beta", "alpha"];
        for (const id of ids) registerCollider(context, { id });
      },
    });

    const result = await replayBabylonNativeSceneModuleV1(
      input(tracked.factory, module),
    );

    expect(result.checkResult.outcome).toBe("passed");
    if (result.checkResult.outcome === "passed" && "contribution" in result) {
      expect(result.contribution.staticColliders.map(({ id }) => id)).toEqual([
        "alpha",
        "beta",
      ]);
    }
  });

  it.each([
    ["Spawn", "spawn"],
    ["geometry", "geometry"],
    ["binding", "binding"],
    ["ratio", "ratio"],
    ["Collider set", "set"],
  ] as const)("rejects retained-state %s drift", async (_label, drift) => {
    const tracked = trackedFactory();
    let buildCount = 0;
    const module = defineBabylonNativeScene({
      kind: "babylon-native-scene-module",
      id: `drift-${drift}`,
      build(context) {
        buildCount += 1;
        const second = buildCount === 2;
        registerSpawn(context, second && drift === "spawn" ? 1 : 0);
        registerCollider(context, {
          id: "route",
          size: second && drift === "geometry" ? 3 : 2,
          frictionRatio: second && drift === "ratio" ? 0.25 : 0.75,
          traversable: second && drift === "binding",
        });
        if (second && drift === "set") {
          registerCollider(context, { id: "extra", x: 4 });
        }
      },
    });

    const result = await replayBabylonNativeSceneModuleV1(
      input(tracked.factory, module),
    );

    expect(result.checkResult.outcome).toBe("rejected");
    expect(diagnosticCodes(result)).toContain(
      "WORLDKIT_NATIVE_SCENE_RUNTIME_REPLAY_MISMATCH",
    );
    expect(tracked.disposedIndices).toEqual([1, 2]);
    expect("contribution" in result).toBe(false);
  });

  it("rejects settled Block visual drift across isolated Candidates", async () => {
    const tracked = trackedFactory();
    let buildCount = 0;
    const module = defineBabylonNativeScene({
      kind: "babylon-native-scene-module",
      id: "block-visual-drift",
      build(context) {
        buildCount += 1;
        registerSpawn(context);
        const visual = MeshBuilder.CreateBox("route-block", { size: 1 }, context.scene);
        visual.position.x = buildCount === 1 ? 0 : 1;
        commitBabylonNativeProfileSettlementV1(context, {
          kind: "babylon-native-profile-settlement-batch",
          schemaVersion: 1,
          profileRef: "worldkit://native-scene-profile/whitebox.blocks@1",
          profileInventoryHash: `sha256:${"1".repeat(64)}`,
          targets: [{
            elementId: "route-block",
            mesh: visual,
            collisionBinding: { kind: "none" },
          }],
        });
      },
    });

    const result = await replayBabylonNativeSceneModuleV1(
      input(tracked.factory, module, BLOCK_BOOTSTRAP),
    );

    expect(result.checkResult.outcome).toBe("rejected");
    expect(diagnosticCodes(result)).toContain(
      "WORLDKIT_NATIVE_SCENE_RUNTIME_REPLAY_MISMATCH",
    );
    expect(tracked.disposedIndices).toEqual([1, 2]);
    expect("contribution" in result).toBe(false);
  });

  it("returns a tooling result when Candidate A creation fails and never creates B", async () => {
    const tracked = trackedFactory({ failCreateAt: 1 });
    const module = defineBabylonNativeScene({
      kind: "babylon-native-scene-module",
      id: "create-a-failure",
      build() {},
    });

    const result = await replayBabylonNativeSceneModuleV1(
      input(tracked.factory, module),
    );

    expect(result.checkResult.outcome).toBe("tool-error");
    expect(diagnosticCodes(result)).toContain(
      "WORLDKIT_NATIVE_SCENE_CANDIDATE_CREATE_FAILED",
    );
    expect(tracked.createCount).toBe(1);
    expect(tracked.disposedIndices).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("private candidate factory detail");
  });

  it("stops after Candidate A rejection and disposes it", async () => {
    const tracked = trackedFactory();
    const module = defineBabylonNativeScene({
      kind: "babylon-native-scene-module",
      id: "reject-a",
      build() {},
    });

    const result = await replayBabylonNativeSceneModuleV1(
      input(tracked.factory, module),
    );

    expect(result.checkResult.outcome).toBe("rejected");
    expect(diagnosticCodes(result)).toContain(
      "WORLDKIT_NATIVE_SCENE_SPAWN_REQUIRED",
    );
    expect(tracked.createCount).toBe(1);
    expect(tracked.disposedIndices).toEqual([1]);
  });

  it.each([
    ["A", 1, 1],
    ["B", 2, 2],
  ] as const)(
    "preserves Candidate %s authority-audit rejection and cleanup",
    async (_label, rejectedBuild, expectedCreateCount) => {
      const tracked = trackedFactory();
      let buildCount = 0;
      const module = defineBabylonNativeScene({
        kind: "babylon-native-scene-module",
        id: `authority-reject-${rejectedBuild}`,
        build(context) {
          buildCount += 1;
          if (buildCount === rejectedBuild) {
            try {
              context.scene.onBeforeRenderObservable.add(() => undefined);
            } catch {
              // The Candidate audit retains the attempted authority mutation.
            }
          }
          registerSpawn(context);
        },
      });

      const result = await replayBabylonNativeSceneModuleV1(
        input(tracked.factory, module),
      );

      expect(result.checkResult.outcome).toBe("rejected");
      expect(diagnosticCodes(result)).toContain(
        "WORLDKIT_NATIVE_SCENE_AUTHORITY_MUTATION_FORBIDDEN",
      );
      expect(tracked.createCount).toBe(expectedCreateCount);
      expect(tracked.disposedIndices).toEqual(
        expectedCreateCount === 1 ? [1] : [1, 2],
      );
    },
  );

  it("stops after Candidate A cleanup failure and publishes no Contribution", async () => {
    const tracked = trackedFactory({ failDisposeAt: 1 });
    const module = defineBabylonNativeScene({
      kind: "babylon-native-scene-module",
      id: "cleanup-a-failure",
      build(context) {
        registerSpawn(context);
      },
    });

    const result = await replayBabylonNativeSceneModuleV1(
      input(tracked.factory, module),
    );

    expect(result.checkResult.outcome).toBe("tool-error");
    expect(diagnosticCodes(result)).toContain(
      "WORLDKIT_NATIVE_SCENE_CANDIDATE_CLEANUP_FAILED",
    );
    expect(tracked.createCount).toBe(1);
    expect("contribution" in result).toBe(false);
    expect(JSON.stringify(result)).not.toContain("private candidate cleanup detail");
  });

  it("returns a tooling result when Candidate B creation fails", async () => {
    const tracked = trackedFactory({ failCreateAt: 2 });
    const module = defineBabylonNativeScene({
      kind: "babylon-native-scene-module",
      id: "create-b-failure",
      build(context) {
        registerSpawn(context);
      },
    });

    const result = await replayBabylonNativeSceneModuleV1(
      input(tracked.factory, module),
    );

    expect(result.checkResult.outcome).toBe("tool-error");
    expect(diagnosticCodes(result)).toContain(
      "WORLDKIT_NATIVE_SCENE_CANDIDATE_CREATE_FAILED",
    );
    expect(tracked.createCount).toBe(2);
    expect(tracked.disposedIndices).toEqual([1]);
  });

  it("retains Candidate B rejection after disposing both Candidates", async () => {
    const tracked = trackedFactory();
    let buildCount = 0;
    const module = defineBabylonNativeScene({
      kind: "babylon-native-scene-module",
      id: "reject-b",
      build(context) {
        buildCount += 1;
        if (buildCount === 1) registerSpawn(context);
      },
    });

    const result = await replayBabylonNativeSceneModuleV1(
      input(tracked.factory, module),
    );

    expect(result.checkResult.outcome).toBe("rejected");
    expect(diagnosticCodes(result)).toContain(
      "WORLDKIT_NATIVE_SCENE_SPAWN_REQUIRED",
    );
    expect(tracked.disposedIndices).toEqual([1, 2]);
  });

  it("turns Candidate B cleanup failure into tool-error without publication", async () => {
    const tracked = trackedFactory({ failDisposeAt: 2 });
    const module = defineBabylonNativeScene({
      kind: "babylon-native-scene-module",
      id: "cleanup-b-failure",
      build(context) {
        registerSpawn(context);
      },
    });

    const result = await replayBabylonNativeSceneModuleV1(
      input(tracked.factory, module),
    );

    expect(result.checkResult.outcome).toBe("tool-error");
    expect(diagnosticCodes(result)).toContain(
      "WORLDKIT_NATIVE_SCENE_CANDIDATE_CLEANUP_FAILED",
    );
    expect(tracked.disposedIndices).toEqual([1, 2]);
    expect("contribution" in result).toBe(false);
  });

  it("preserves a gate rejection beside cleanup failure with tooling precedence", async () => {
    const tracked = trackedFactory({ failDisposeAt: 1 });
    const module = defineBabylonNativeScene({
      kind: "babylon-native-scene-module",
      id: "reject-and-cleanup",
      build() {},
    });

    const result = await replayBabylonNativeSceneModuleV1(
      input(tracked.factory, module),
    );

    expect(result.checkResult.outcome).toBe("tool-error");
    expect(diagnosticCodes(result)).toEqual(
      expect.arrayContaining([
        "WORLDKIT_NATIVE_SCENE_SPAWN_REQUIRED",
        "WORLDKIT_NATIVE_SCENE_CANDIDATE_CLEANUP_FAILED",
      ]),
    );
    expect(tracked.createCount).toBe(1);
  });

  it("keeps concurrent replay leases, instrumentation, and disposal isolated", async () => {
    const tracked = trackedFactory();
    const seenScenes = new Set<Scene>();
    const module = defineBabylonNativeScene({
      kind: "babylon-native-scene-module",
      id: "concurrent-replay",
      async build(context) {
        seenScenes.add(context.scene);
        new StandardMaterial("concurrent-material", context.scene);
        registerSpawn(context);
        await Promise.resolve();
      },
    });

    const [first, second] = await Promise.all([
      replayBabylonNativeSceneModuleV1(input(tracked.factory, module)),
      replayBabylonNativeSceneModuleV1(input(tracked.factory, module)),
    ]);

    expect(first.checkResult.outcome).toBe("passed");
    expect(second.checkResult.outcome).toBe("passed");
    expect(tracked.createCount).toBe(4);
    expect(new Set(tracked.leases.map(({ scene }) => scene)).size).toBe(4);
    expect(new Set(tracked.leases.map(({ engine }) => engine)).size).toBe(4);
    expect(new Set(tracked.disposedIndices)).toEqual(new Set([1, 2, 3, 4]));
    expect(seenScenes.size).toBe(4);
  });
});
