import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import "@babylonjs/core/Meshes/instancedMesh.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Scene } from "@babylonjs/core/scene.pure.js";
import {
  BABYLON_NATIVE_BLOCK_PROFILE_REF_V1,
  hashBabylonNativeSceneContributionV1,
  parseBabylonNativeSceneBootstrapV1,
  parseNativeSceneDiagnosticV1,
} from "@whitebox-world/runtime-contracts";
import { afterEach, describe, expect, it } from "vitest";

import {
  defineBabylonNativeScene,
  type BabylonNativeLockedAssetV1,
  type BabylonNativeLockedAssetResolverV1,
  type BabylonNativeSceneBuildContextV1,
  type BabylonNativeSceneModuleV1,
} from "./index.js";
import {
  admitBabylonNativeSceneCandidateV1,
  commitBabylonNativeProfileSettlementV1,
  createBabylonNativeBlockProfileBuildFailureV1,
  createBabylonNativeLockedAssetResolutionFailureV1,
  type BabylonNativeSceneAdmissionBudgetV1,
  type BabylonNativeSceneCandidateAdmissionResultV1,
} from "./host.js";

const retainedEngines: NullEngine[] = [];

const BOOTSTRAP = parseBabylonNativeSceneBootstrapV1({
  kind: "babylon-native-scene-bootstrap",
  schemaVersion: 1,
  id: "cloud-ridge-native",
  sceneModuleRef: "worldkit://native-scene/cloud-ridge@1",
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
  seed: 7301,
  spawnMarkerId: "player-spawn",
});
const BLOCK_BOOTSTRAP = parseBabylonNativeSceneBootstrapV1({
  ...BOOTSTRAP,
  id: "cloud-ridge-native-blocks",
  nativeSceneProfileRef: BABYLON_NATIVE_BLOCK_PROFILE_REF_V1,
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
  bootstrap = BOOTSTRAP,
) {
  return admitBabylonNativeSceneCandidateV1({
    candidate: { scene, engine: scene.getEngine() },
    bootstrap,
    module,
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
  result: BabylonNativeSceneCandidateAdmissionResultV1,
): string | undefined {
  return result.outcome === "passed"
    ? undefined
    : result.diagnostics.find(({ severity }) => severity === "error")?.code;
}

function rejectedStage(
  result: BabylonNativeSceneCandidateAdmissionResultV1,
): string | undefined {
  return result.outcome === "passed"
    ? undefined
    : result.diagnostics.find(({ severity }) => severity === "error")?.stage;
}

afterEach(() => {
  while (retainedEngines.length > 0) retainedEngines.pop()?.dispose();
});

describe("admitBabylonNativeSceneCandidateV1", () => {
  it("publishes the exact none settlement for the standard Profile", async () => {
    const scene = createScene();
    const result = await buildCandidate(scene, moduleWithBuild(registerSpawn));

    expect(result.outcome).toBe("passed");
    if (result.outcome === "passed") {
      expect(result.contribution.profileSettlement).toEqual({
        kind: "none",
        profileRef: "worldkit://native-scene-profile/whitebox.standard@1",
      });
    }
  });

  it("requires one blocks settlement batch", async () => {
    const scene = createScene();
    const result = await buildCandidate(
      scene,
      moduleWithBuild(registerSpawn),
      DEFAULT_BUDGET,
      BLOCK_BOOTSTRAP,
    );

    expect(rejectedCode(result)).toBe(
      "WORLDKIT_NATIVE_SCENE_PROFILE_SETTLEMENT_REQUIRED",
    );
  });

  it("sanitizes a blocks build failure before settlement finalization", async () => {
    const scene = createScene();
    const result = await buildCandidate(
      scene,
      moduleWithBuild(() => {
        throw new Error("private blocks build sentinel");
      }),
      DEFAULT_BUDGET,
      BLOCK_BOOTSTRAP,
    );

    expect(rejectedCode(result)).toBe(
      "WORLDKIT_NATIVE_SCENE_MODULE_BUILD_FAILED",
    );
    expect(rejectedStage(result)).toBe("build");
    expect(JSON.stringify(result)).not.toContain("private blocks build sentinel");
  });

  it("keeps a module-spoofed Block Profile code opaque", async () => {
    const result = await buildCandidate(
      createScene(),
      moduleWithBuild(() => {
        throw new TypeError(
          "WORLDKIT_NATIVE_BLOCK_FAKE: module-controlled diagnostic detail",
        );
      }),
      DEFAULT_BUDGET,
      BLOCK_BOOTSTRAP,
    );

    expect(rejectedCode(result)).toBe(
      "WORLDKIT_NATIVE_SCENE_MODULE_BUILD_FAILED",
    );
    expect(JSON.stringify(result)).not.toContain("WORLDKIT_NATIVE_BLOCK_FAKE");
    expect(JSON.stringify(result)).not.toContain("module-controlled diagnostic detail");
  });

  it("publishes a closed Block Profile build code without provider traces", async () => {
    const scene = createScene();
    const result = await buildCandidate(
      scene,
      moduleWithBuild(() => {
        throw createBabylonNativeBlockProfileBuildFailureV1(
          "WORLDKIT_NATIVE_BLOCK_OCCUPANCY_OVERLAP",
          "block 'ground-b' overlaps 'ground-a' at cell 0,-2,0",
          "Repair the Block occupancy, lattice, IDs, or Collider selection.",
        );
      }),
      DEFAULT_BUDGET,
      BLOCK_BOOTSTRAP,
    );

    expect(result.outcome).toBe("rejected");
    expect(rejectedCode(result)).toBe("WORLDKIT_NATIVE_BLOCK_OCCUPANCY_OVERLAP");
    expect(rejectedStage(result)).toBe("build");
    expect(result.outcome === "rejected" && result.diagnostics[0]).toMatchObject({
      message:
        "block 'ground-b' overlaps 'ground-a' at cell 0,-2,0",
      repairHint:
        "Repair the Block occupancy, lattice, IDs, or Collider selection.",
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/(?:Error:|\n\s+at\s)/);
    expect(serialized).not.toContain("TypeError");
  });

  it("does not publish a Block Profile code from the standard Profile", async () => {
    const result = await buildCandidate(
      createScene(),
      moduleWithBuild(() => {
        throw createBabylonNativeBlockProfileBuildFailureV1(
          "WORLDKIT_NATIVE_BLOCK_OCCUPANCY_OVERLAP",
          "occupied volume already claimed",
          "Repair the Block occupancy, lattice, IDs, or Collider selection.",
        );
      }),
    );

    expect(rejectedCode(result)).toBe(
      "WORLDKIT_NATIVE_SCENE_MODULE_BUILD_FAILED",
    );
    expect(JSON.stringify(result)).not.toContain(
      "WORLDKIT_NATIVE_BLOCK_OCCUPANCY_OVERLAP",
    );
  });

  it.each([
    ["unix path leakage", "WORLDKIT_NATIVE_BLOCK_CREATE_INPUT_INVALID: see /tmp/secret"],
    ["windows path leakage", "WORLDKIT_NATIVE_BLOCK_CREATE_INPUT_INVALID: see C:\\secret"],
    ["stack leakage", "WORLDKIT_NATIVE_BLOCK_CREATE_INPUT_INVALID: failed\n    at build (scene.ts:1:1)"],
    ["provider wrapper", "Error: WORLDKIT_NATIVE_BLOCK_OCCUPANCY_OVERLAP: occupied volume already claimed"],
  ] as const)(
    "keeps a blocks build failure opaque when the thrown text has %s",
    async (_label, message) => {
      const result = await buildCandidate(
        createScene(),
        moduleWithBuild(() => {
          const [code, ...detailParts] = message.split(": ");
          throw createBabylonNativeBlockProfileBuildFailureV1(
            code!,
            detailParts.join(": "),
            "Repair the Block occupancy, lattice, IDs, or Collider selection.",
          );
        }),
        DEFAULT_BUDGET,
        BLOCK_BOOTSTRAP,
      );

      expect(rejectedCode(result)).toBe(
        "WORLDKIT_NATIVE_SCENE_MODULE_BUILD_FAILED",
      );
      expect(JSON.stringify(result)).not.toContain("/tmp/secret");
      expect(JSON.stringify(result)).not.toContain("secret");
      expect(JSON.stringify(result)).not.toContain("scene.ts");
    },
  );

  it("publishes a Block Profile detail that names a worldkit URI", async () => {
    const result = await buildCandidate(
      createScene(),
      moduleWithBuild(() => {
        throw createBabylonNativeBlockProfileBuildFailureV1(
          "WORLDKIT_NATIVE_BLOCK_PROFILE_CHECK_REJECTED",
          "WORLDKIT_NATIVE_BLOCK_ROUTE_DISCONNECTED uses worldkit://traversal-surface-profile/ground.static@1",
          "Repair the Block occupancy, lattice, IDs, or Collider selection.",
        );
      }),
      DEFAULT_BUDGET,
      BLOCK_BOOTSTRAP,
    );

    expect(rejectedCode(result)).toBe(
      "WORLDKIT_NATIVE_BLOCK_PROFILE_CHECK_REJECTED",
    );
    expect(result.outcome === "rejected" && result.diagnostics[0]).toMatchObject({
      message:
        "WORLDKIT_NATIVE_BLOCK_ROUTE_DISCONNECTED uses worldkit://traversal-surface-profile/ground.static@1",
    });
  });

  it("publishes one blocks snapshot for exact visual and Collider inventory", async () => {
    const scene = createScene();
    const result = await buildCandidate(
      scene,
      moduleWithBuild((context) => {
        registerSpawn(context);
        const visual = MeshBuilder.CreateBox("block-visual", { size: 1 }, scene);
        const proxy = MeshBuilder.CreateBox("block-proxy", { size: 1 }, scene);
        proxy.isVisible = false;
        context.registration.registerStaticCollider({
          id: "block-proxy",
          mesh: proxy,
          traversalBinding: { kind: "not-traversable" },
        });
        commitBabylonNativeProfileSettlementV1(context, {
          kind: "babylon-native-profile-settlement-batch",
          schemaVersion: 1,
          profileRef: "worldkit://native-scene-profile/whitebox.blocks@1",
          profileInventoryHash: `sha256:${"1".repeat(64)}`,
          targets: [{
            elementId: "block-visual",
            mesh: visual,
            collisionBinding: {
              kind: "static-collider",
              colliderId: "block-proxy",
            },
          }],
        });
      }),
      DEFAULT_BUDGET,
      BLOCK_BOOTSTRAP,
    );

    expect(result.outcome).toBe("passed");
    if (result.outcome === "passed") {
      expect(result.contribution.profileSettlement).toMatchObject({
        kind: "host-snapshot",
        profileRef: "worldkit://native-scene-profile/whitebox.blocks@1",
        targetCount: 1,
      });
    }
  });

  it("rejects an extra live empty direct Mesh from the blocks inventory", async () => {
    const scene = createScene();
    const result = await buildCandidate(
      scene,
      moduleWithBuild((context) => {
        registerSpawn(context);
        const visual = MeshBuilder.CreateBox("block-visual", { size: 1 }, scene);
        new Mesh("unsettled-empty-mesh", scene);
        commitBabylonNativeProfileSettlementV1(context, {
          kind: "babylon-native-profile-settlement-batch",
          schemaVersion: 1,
          profileRef: "worldkit://native-scene-profile/whitebox.blocks@1",
          profileInventoryHash: `sha256:${"1".repeat(64)}`,
          targets: [{
            elementId: "block-visual",
            mesh: visual,
            collisionBinding: { kind: "none" },
          }],
        });
      }),
      DEFAULT_BUDGET,
      BLOCK_BOOTSTRAP,
    );

    expect(rejectedCode(result)).toBe(
      "WORLDKIT_NATIVE_SCENE_PROFILE_INVENTORY_MISMATCH",
    );
  });

  it("rejects an extra live Mesh whose installed Babylon geometry was released", async () => {
    const scene = createScene();
    const result = await buildCandidate(
      scene,
      moduleWithBuild((context) => {
        registerSpawn(context);
        const visual = MeshBuilder.CreateBox("block-visual", { size: 1 }, scene);
        const extra = MeshBuilder.CreateBox("released-geometry-mesh", { size: 1 }, scene);
        extra.geometry!.releaseForMesh(extra, false);
        commitBabylonNativeProfileSettlementV1(context, {
          kind: "babylon-native-profile-settlement-batch",
          schemaVersion: 1,
          profileRef: "worldkit://native-scene-profile/whitebox.blocks@1",
          profileInventoryHash: `sha256:${"1".repeat(64)}`,
          targets: [{
            elementId: "block-visual",
            mesh: visual,
            collisionBinding: { kind: "none" },
          }],
        });
      }),
      DEFAULT_BUDGET,
      BLOCK_BOOTSTRAP,
    );

    expect(rejectedCode(result)).toBe(
      "WORLDKIT_NATIVE_SCENE_PROFILE_INVENTORY_MISMATCH",
    );
  });

  it("rejects an extra live instance created from a settled Collider proxy", async () => {
    const scene = createScene();
    const result = await buildCandidate(
      scene,
      moduleWithBuild((context) => {
        registerSpawn(context);
        const visual = MeshBuilder.CreateBox("block-visual", { size: 1 }, scene);
        const proxy = MeshBuilder.CreateBox("block-proxy", { size: 1 }, scene);
        proxy.isVisible = false;
        context.registration.registerStaticCollider({
          id: "block-proxy",
          mesh: proxy,
          traversalBinding: { kind: "not-traversable" },
        });
        commitBabylonNativeProfileSettlementV1(context, {
          kind: "babylon-native-profile-settlement-batch",
          schemaVersion: 1,
          profileRef: "worldkit://native-scene-profile/whitebox.blocks@1",
          profileInventoryHash: `sha256:${"1".repeat(64)}`,
          targets: [{
            elementId: "block-visual",
            mesh: visual,
            collisionBinding: {
              kind: "static-collider",
              colliderId: "block-proxy",
            },
          }],
        });
        proxy.createInstance("extra-proxy-instance");
      }),
      DEFAULT_BUDGET,
      BLOCK_BOOTSTRAP,
    );

    expect(rejectedCode(result)).toBe(
      "WORLDKIT_NATIVE_SCENE_PROFILE_INVENTORY_MISMATCH",
    );
  });

  it("rejects using one Mesh as both the settled target and Collider proxy", async () => {
    const scene = createScene();
    const result = await buildCandidate(
      scene,
      moduleWithBuild((context) => {
        registerSpawn(context);
        const shared = MeshBuilder.CreateBox("shared-block", { size: 1 }, scene);
        shared.isVisible = false;
        context.registration.registerStaticCollider({
          id: "shared-proxy",
          mesh: shared,
          traversalBinding: { kind: "not-traversable" },
        });
        shared.isVisible = true;
        commitBabylonNativeProfileSettlementV1(context, {
          kind: "babylon-native-profile-settlement-batch",
          schemaVersion: 1,
          profileRef: "worldkit://native-scene-profile/whitebox.blocks@1",
          profileInventoryHash: `sha256:${"1".repeat(64)}`,
          targets: [{
            elementId: "shared-block",
            mesh: shared,
            collisionBinding: {
              kind: "static-collider",
              colliderId: "shared-proxy",
            },
          }],
        });
      }),
      DEFAULT_BUDGET,
      BLOCK_BOOTSTRAP,
    );

    expect(rejectedCode(result)).toBe(
      "WORLDKIT_NATIVE_SCENE_PROFILE_INVENTORY_MISMATCH",
    );
  });

  it("rejects a subclassed Collider proxy from the blocks inventory", async () => {
    const scene = createScene();
    const result = await buildCandidate(
      scene,
      moduleWithBuild((context) => {
        registerSpawn(context);
        const visual = MeshBuilder.CreateBox("ordinary-visual", { size: 1 }, scene);
        const source = MeshBuilder.CreateBox("proxy-source", { size: 1 }, scene);
        const proxy = new (class extends Mesh {})("subclass-proxy", scene);
        proxy.setVerticesData(
          VertexBuffer.PositionKind,
          source.getVerticesData(VertexBuffer.PositionKind)!,
        );
        proxy.setIndices(source.getIndices()!);
        source.dispose();
        proxy.isVisible = false;
        context.registration.registerStaticCollider({
          id: "subclass-proxy",
          mesh: proxy,
          traversalBinding: { kind: "not-traversable" },
        });
        commitBabylonNativeProfileSettlementV1(context, {
          kind: "babylon-native-profile-settlement-batch",
          schemaVersion: 1,
          profileRef: "worldkit://native-scene-profile/whitebox.blocks@1",
          profileInventoryHash: `sha256:${"1".repeat(64)}`,
          targets: [{
            elementId: "ordinary-visual",
            mesh: visual,
            collisionBinding: {
              kind: "static-collider",
              colliderId: "subclass-proxy",
            },
          }],
        });
      }),
      DEFAULT_BUDGET,
      BLOCK_BOOTSTRAP,
    );

    expect(rejectedCode(result)).toBe(
      "WORLDKIT_NATIVE_SCENE_PROFILE_INVENTORY_MISMATCH",
    );
  });

  it("keeps the settled Contribution deterministic across creation order", async () => {
    async function contributionHash(reverse: boolean): Promise<string> {
      const scene = createScene();
      const result = await buildCandidate(
        scene,
        moduleWithBuild((context) => {
          registerSpawn(context);
          const ids = reverse ? ["block-b", "block-a"] : ["block-a", "block-b"];
          const targets = ids.map((id) => ({
            elementId: id,
            mesh: MeshBuilder.CreateBox(id, { size: 1 }, scene),
            collisionBinding: { kind: "none" as const },
          }));
          commitBabylonNativeProfileSettlementV1(context, {
            kind: "babylon-native-profile-settlement-batch",
            schemaVersion: 1,
            profileRef: "worldkit://native-scene-profile/whitebox.blocks@1",
            profileInventoryHash: `sha256:${"1".repeat(64)}`,
            targets,
          });
        }),
        DEFAULT_BUDGET,
        BLOCK_BOOTSTRAP,
      );
      expect(result.outcome).toBe("passed");
      if (result.outcome !== "passed") throw new Error("expected admission pass");
      return hashBabylonNativeSceneContributionV1(result.contribution);
    }

    expect(await contributionHash(true)).toBe(await contributionHash(false));
  });

  it.each([
    ["target drift", (scene: Scene, context: BabylonNativeSceneBuildContextV1) => {
      const visual = MeshBuilder.CreateBox("visual", { size: 1 }, scene);
      commitBabylonNativeProfileSettlementV1(context, {
        kind: "babylon-native-profile-settlement-batch",
        schemaVersion: 1,
        profileRef: "worldkit://native-scene-profile/whitebox.blocks@1",
        profileInventoryHash: `sha256:${"1".repeat(64)}`,
        targets: [{
          elementId: "visual",
          mesh: visual,
          collisionBinding: { kind: "none" },
        }],
      });
      visual.position.x = 2;
    }, "WORLDKIT_NATIVE_SCENE_PROFILE_TARGET_DRIFT"],
    ["extra geometry", (scene: Scene, context: BabylonNativeSceneBuildContextV1) => {
      const visual = MeshBuilder.CreateBox("visual", { size: 1 }, scene);
      MeshBuilder.CreateBox("extra", { size: 1 }, scene);
      commitBabylonNativeProfileSettlementV1(context, {
        kind: "babylon-native-profile-settlement-batch",
        schemaVersion: 1,
        profileRef: "worldkit://native-scene-profile/whitebox.blocks@1",
        profileInventoryHash: `sha256:${"1".repeat(64)}`,
        targets: [{
          elementId: "visual",
          mesh: visual,
          collisionBinding: { kind: "none" },
        }],
      });
    }, "WORLDKIT_NATIVE_SCENE_PROFILE_INVENTORY_MISMATCH"],
    ["caught settlement failure", (scene: Scene, context: BabylonNativeSceneBuildContextV1) => {
      const visual = MeshBuilder.CreateBox("visual", { size: 1 }, scene);
      try {
        commitBabylonNativeProfileSettlementV1(context, {
          ...{
            kind: "babylon-native-profile-settlement-batch" as const,
            schemaVersion: 1 as const,
            profileRef: "worldkit://native-scene-profile/whitebox.blocks@1",
            profileInventoryHash: `sha256:${"1".repeat(64)}` as const,
            targets: [{
              elementId: "visual",
              mesh: visual,
              collisionBinding: { kind: "none" as const },
            }],
          },
          extra: true,
        } as never);
      } catch {
        // Candidate must retain the Host failure even when Module code catches it.
      }
    }, "WORLDKIT_NATIVE_SCENE_PROFILE_SETTLEMENT_INVALID"],
  ] as const)("rejects blocks %s", async (_label, build, code) => {
    const scene = createScene();
    const result = await buildCandidate(
      scene,
      moduleWithBuild((context) => {
        registerSpawn(context);
        build(scene, context);
      }),
      DEFAULT_BUDGET,
      BLOCK_BOOTSTRAP,
    );

    expect(rejectedCode(result)).toBe(code);
  });

  it("reports an invalid Bootstrap against unresolved-world", async () => {
    const scene = createScene();
    const result = await admitBabylonNativeSceneCandidateV1({
      candidate: { scene, engine: scene.getEngine() },
      bootstrap: { ...BOOTSTRAP, geometry: [] } as never,
      module: moduleWithBuild(() => undefined),
      assets: ASSETS,
      budget: DEFAULT_BUDGET,
    });

    expect(result.outcome).toBe("rejected");
    expect(rejectedCode(result)).toBe("WORLDKIT_NATIVE_SCENE_BOOTSTRAP_INVALID");
  });

  it.each([
    ["wrong kind", {
      kind: "legacy-native-scene-module",
      id: "native-scene-test",
      build() {},
    }],
    ["missing build", {
      kind: "babylon-native-scene-module",
      id: "native-scene-test",
    }],
    ["throwing accessor", (() => {
      const candidate = {
        kind: "babylon-native-scene-module",
        id: "native-scene-test",
      } as Record<string, unknown>;
      Object.defineProperty(candidate, "build", {
        enumerable: true,
        get() {
          throw new Error("untrusted accessor must not escape");
        },
      });
      return candidate;
    })()],
  ] as const)("reports malformed Module definition (%s) at source admission", async (
    _case,
    module,
  ) => {
    const scene = createScene();
    const result = await admitBabylonNativeSceneCandidateV1({
      candidate: { scene, engine: scene.getEngine() },
      bootstrap: BOOTSTRAP,
      module: module as never,
      assets: ASSETS,
      budget: DEFAULT_BUDGET,
    });

    expect(rejectedCode(result)).toBe(
      "WORLDKIT_NATIVE_SCENE_MODULE_DEFINITION_INVALID",
    );
    expect(rejectedStage(result)).toBe("source-admission");
  });

  it("isolates each resolved asset byte buffer from Module mutation", async () => {
    const sharedBytes = new Uint8Array([1, 2, 3, 4]);
    const lockedAsset: BabylonNativeLockedAssetV1 = {
      kind: "babylon-native-locked-asset",
      schemaVersion: 1,
      assetResourceRef: "worldkit://asset/cloud-ridge@1",
      assetAdmissionReceiptRef: "worldkit://asset-admission/cloud-ridge@1",
      assetAdmissionReceiptHash: `sha256:${"1".repeat(64)}`,
      assetPublicationReceiptRef: "worldkit://asset-publication/cloud-ridge@1",
      assetPublicationReceiptHash: `sha256:${"2".repeat(64)}`,
      classBuildRecordRef: "worldkit://class-build/cloud-ridge@1",
      classBuildRecordHash: `sha256:${"3".repeat(64)}`,
      resourceManifestHash: `sha256:${"4".repeat(64)}`,
      artifactContentHash: `sha256:${"5".repeat(64)}`,
      bytes: sharedBytes,
      importMetadata: {
        kind: "static-geometry-glb",
        mediaType: "model/gltf-binary",
        format: "glb",
        gltfVersion: "2.0",
        localForwardAxis: "-Z",
        localUpAxis: "+Y",
        metersPerUnit: 1,
        pivot: "support-center",
      },
    };
    const assets: BabylonNativeLockedAssetResolverV1 = Object.freeze({
      async resolve() {
        return lockedAsset;
      },
    });
    let secondResolution: Uint8Array | undefined;
    const scene = createScene();
    const result = await admitBabylonNativeSceneCandidateV1({
      candidate: { scene, engine: scene.getEngine() },
      bootstrap: BOOTSTRAP,
      module: moduleWithBuild(async (context) => {
        const first = await context.assets.resolve({
          assetResourceRef: lockedAsset.assetResourceRef,
        });
        first.bytes[0] = 99;
        const second = await context.assets.resolve({
          assetResourceRef: lockedAsset.assetResourceRef,
        });
        secondResolution = second.bytes;
        registerSpawn(context);
      }),
      assets,
      budget: DEFAULT_BUDGET,
    });

    expect(result.outcome).toBe("passed");
    expect([...sharedBytes]).toEqual([1, 2, 3, 4]);
    expect([...(secondResolution ?? [])]).toEqual([1, 2, 3, 4]);
  });

  it("derives a fresh deterministic LCG from the Bootstrap seed", async () => {
    const observations: number[][] = [];
    for (let run = 0; run < 2; run += 1) {
      const scene = createScene();
      const values: number[] = [];
      const result = await buildCandidate(scene, moduleWithBuild((context) => {
        values.push(
          context.random.nextRatio(),
          context.random.nextRatio(),
          context.random.nextRatio(),
        );
        registerSpawn(context);
      }));
      expect(result.outcome).toBe("passed");
      observations.push(values);
    }

    expect(observations).toEqual([
      [0.06558824330568314, 0.5067563650663942, 0.8746301126666367],
      [0.06558824330568314, 0.5067563650663942, 0.8746301126666367],
    ]);
  });

  it("retains a locked-asset failure caught by Module code", async () => {
    const assets: BabylonNativeLockedAssetResolverV1 = Object.freeze({
      async resolve() {
        throw new Error("private resolver detail must not escape");
      },
    });
    const scene = createScene();
    const result = await admitBabylonNativeSceneCandidateV1({
      candidate: { scene, engine: scene.getEngine() },
      bootstrap: BOOTSTRAP,
      module: moduleWithBuild(async (context) => {
        try {
          await context.assets.resolve({
            assetResourceRef: "worldkit://asset/unavailable@1",
          });
        } catch {
          // A Module cannot erase a trusted Host asset-resolution failure.
        }
        registerSpawn(context);
      }),
      assets,
      budget: DEFAULT_BUDGET,
    });

    expect(rejectedCode(result)).toBe(
      "WORLDKIT_NATIVE_SCENE_ASSET_LOCK_UNAVAILABLE",
    );
    expect(rejectedStage(result)).toBe("capability");
    if (result.outcome === "rejected") {
      expect(JSON.stringify(result.diagnostics)).not.toContain(
        "private resolver detail",
      );
    }
  });

  it("retains a malformed locked-asset request without invoking the resolver", async () => {
    let resolverCalled = false;
    const assets: BabylonNativeLockedAssetResolverV1 = Object.freeze({
      async resolve() {
        resolverCalled = true;
        throw new Error("must not run");
      },
    });
    const scene = createScene();
    const result = await admitBabylonNativeSceneCandidateV1({
      candidate: { scene, engine: scene.getEngine() },
      bootstrap: BOOTSTRAP,
      module: moduleWithBuild(async (context) => {
        try {
          await context.assets.resolve({ assetResourceRef: "legacy-path" });
        } catch {
          // Malformed requests remain a Host-owned rejection if swallowed.
        }
        registerSpawn(context);
      }),
      assets,
      budget: DEFAULT_BUDGET,
    });

    expect(resolverCalled).toBe(false);
    expect(rejectedCode(result)).toBe(
      "WORLDKIT_NATIVE_SCENE_ASSET_LOCK_UNAVAILABLE",
    );
  });

  it("preserves a trusted locked-asset diagnostic exactly", async () => {
    const trustedDiagnostic = parseNativeSceneDiagnosticV1({
      kind: "native-scene-diagnostic",
      schemaVersion: 1,
      id: "cloud-ridge-native.asset-lock-rejected",
      severity: "error",
      stage: "capability",
      code: "WORLDKIT_NATIVE_SCENE_ASSET_LOCK_REJECTED",
      location: {
        kind: "asset-resource",
        assetResourceRef: "worldkit://asset/rejected@1",
      },
      measurement: { kind: "none" },
      message: "The requested asset lock was rejected.",
      repairHint: "Select an admitted Package asset.",
    });
    const assets: BabylonNativeLockedAssetResolverV1 = Object.freeze({
      async resolve() {
        throw createBabylonNativeLockedAssetResolutionFailureV1(
          trustedDiagnostic,
        );
      },
    });
    const scene = createScene();
    const result = await admitBabylonNativeSceneCandidateV1({
      candidate: { scene, engine: scene.getEngine() },
      bootstrap: BOOTSTRAP,
      module: moduleWithBuild(async (context) => {
        try {
          await context.assets.resolve({
            assetResourceRef: "worldkit://asset/rejected@1",
          });
        } catch {
          // A trusted resolver diagnostic remains authoritative if swallowed.
        }
        registerSpawn(context);
      }),
      assets,
      budget: DEFAULT_BUDGET,
    });

    expect(result).toEqual({
      outcome: "rejected",
      diagnostics: [trustedDiagnostic],
    });
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
      ["foreign", () => MeshBuilder.CreateBox("foreign", { size: 2 }, foreignScene), "WORLDKIT_NATIVE_SCENE_COLLIDER_SCENE_MISMATCH"],
      ["disposed", () => {
        const mesh = MeshBuilder.CreateBox("disposed", { size: 2 }, scene);
        mesh.dispose();
        return mesh;
      }, "WORLDKIT_NATIVE_SCENE_COLLIDER_DISPOSED"],
      ["thin", () => {
        const mesh = MeshBuilder.CreateBox("thin", { size: 2 }, scene);
        Object.defineProperty(mesh, "hasThinInstances", { configurable: true, value: true });
        return mesh;
      }, "WORLDKIT_NATIVE_SCENE_COLLIDER_PROVIDER_STATE_INVALID"],
      ["physics", () => {
        const mesh = MeshBuilder.CreateBox("physics", { size: 2 }, scene);
        Object.defineProperty(mesh, "physicsBody", { configurable: true, value: {} });
        return mesh;
      }, "WORLDKIT_NATIVE_SCENE_COLLIDER_PROVIDER_STATE_INVALID"],
    ] as const;

    for (const [id, createMesh, code] of cases) {
      const result = await buildCandidate(scene, moduleWithBuild((context) => {
        registerSpawn(context);
        const mesh = createMesh();
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

  const invalidBuildResults: readonly Readonly<[
    string,
    () => unknown | Promise<unknown>,
  ]>[] = [
    ["sync null", () => null],
    ["sync object", () => ({ legacyController: true })],
    ["sync callback", () => () => undefined],
    ["sync controller", () => ({ update() {} })],
    ["sync disposer", () => ({ dispose() {} })],
    ["async object", async () => ({ legacyController: true })],
    ["async disposer", async () => ({ dispose() {} })],
  ];

  it.each(invalidBuildResults)("rejects a non-undefined Build result (%s)", async (_label, buildResult) => {
    const scene = createScene();
    const result = await buildCandidate(
      scene,
      moduleWithBuild(((context: BabylonNativeSceneBuildContextV1) => {
        registerSpawn(context);
        return buildResult();
      }) as never),
    );

    expect(rejectedCode(result)).toBe(
      "WORLDKIT_NATIVE_SCENE_BUILD_RETURN_INVALID",
    );
    expect(rejectedStage(result)).toBe("build");
  });

  it("rejects a returned Babylon Mesh handle", async () => {
    const scene = createScene();
    const returnedMesh = MeshBuilder.CreateBox("returned", { size: 1 }, scene);
    const result = await buildCandidate(
      scene,
      moduleWithBuild(((context: BabylonNativeSceneBuildContextV1) => {
        registerSpawn(context);
        return returnedMesh;
      }) as never),
    );

    expect(rejectedCode(result)).toBe(
      "WORLDKIT_NATIVE_SCENE_BUILD_RETURN_INVALID",
    );
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

  it("keeps the first registration failure when Module rethrows another value", async () => {
    const scene = createScene();
    const collider = MeshBuilder.CreateBox("first-failure", { size: 2 }, scene);
    const result = await buildCandidate(scene, moduleWithBuild((context) => {
      registerSpawn(context);
      try {
        context.registration.registerStaticCollider({
          id: "first-failure",
          mesh: collider,
          traversalBinding: { kind: "not-traversable" },
          restitutionRatio: 4,
        });
      } catch {
        throw new Error("secondary Module failure");
      }
    }));

    expect(rejectedCode(result)).toBe(
      "WORLDKIT_NATIVE_SCENE_COLLIDER_MATERIAL_INVALID",
    );
  });

  it("does not treat an explicit null collider ratio as omitted", async () => {
    const scene = createScene();
    const collider = MeshBuilder.CreateBox("null-ratio", { size: 2 }, scene);
    const result = await buildCandidate(scene, moduleWithBuild((context) => {
      registerSpawn(context);
      context.registration.registerStaticCollider({
        id: "null-ratio",
        mesh: collider,
        traversalBinding: { kind: "not-traversable" },
        frictionRatio: null as never,
      });
    }));

    expect(rejectedCode(result)).toBe(
      "WORLDKIT_NATIVE_SCENE_COLLIDER_MATERIAL_INVALID",
    );
  });

  it("retains a Module failure even when the thrown value is undefined", async () => {
    const result = await buildCandidate(
      createScene(),
      moduleWithBuild((context) => {
        registerSpawn(context);
        throw undefined;
      }),
    );

    expect(rejectedCode(result)).toBe(
      "WORLDKIT_NATIVE_SCENE_MODULE_BUILD_FAILED",
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
