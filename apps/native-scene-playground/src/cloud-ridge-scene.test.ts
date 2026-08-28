import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { Scene } from "@babylonjs/core/scene.pure.js";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildBabylonNativeSceneCandidateV1,
  createBabylonNativeHostRandomV1,
} from "@whitebox-world/native-babylon/host";

import { createCloudRidgeNativeSceneControllerV1 } from
  "./cloud-ridge-scene.js";
import {
  CLOUD_RIDGE_GAMEPLAY_BOOTSTRAP_V1,
  CLOUD_RIDGE_NATIVE_ADMISSION_BUDGET_V1,
  CLOUD_RIDGE_NATIVE_BOOTSTRAP_V1,
  CLOUD_RIDGE_WORLD_RUNTIME_BOOTSTRAP_V1,
  cloudRidgeLockedAssetResolver,
} from "./native-bootstrap.js";

const retainedEngines: NullEngine[] = [];

function localAxisExtent(mesh: AbstractMesh, axis: 0 | 1 | 2): number {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
  const values = positions.filter((_value, index) => index % 3 === axis);
  return Math.max(...values) - Math.min(...values);
}

afterEach(() => {
  while (retainedEngines.length > 0) retainedEngines.pop()?.dispose();
});

describe("cloud ridge Babylon Native scene", () => {
  it("keeps the bootstrap resource refs identical to the frozen gameplay closure", () => {
    const subject = CLOUD_RIDGE_WORLD_RUNTIME_BOOTSTRAP_V1
      .subjectRuntimeDescriptors[0]!;
    expect(CLOUD_RIDGE_NATIVE_BOOTSTRAP_V1).toEqual({
      kind: "babylon-native-scene-bootstrap",
      schemaVersion: 1,
      id: "cloud-ridge-native",
      sceneModuleRef: "worldkit://native-scene/cloud-ridge@1",
      nativeSceneApiRef: "worldkit://native-scene-api/babylon@1",
      nativeSceneProfileRef:
        "worldkit://native-scene-profile/whitebox.standard@1",
      gameplayBootstrapRef:
        "worldkit://gameplay-bootstrap/g-bot-subject-world.8201@1",
      initialControlledEntityId:
        CLOUD_RIDGE_WORLD_RUNTIME_BOOTSTRAP_V1.initialControlledEntityId,
      gravityMetersPerSecondSquaredXYZ: [0, -9.81, 0],
      initialCamera: {
        mode: "third-person",
        pitchRadians: 0.18,
        distanceMeters: 5,
        fovDegrees: 56,
        targetHeightMeters: 1.2,
      },
      seed: 0x5eed_c10d,
      spawnMarkerId: "player-spawn",
    });
    expect(subject.subjectDefinitionRef).toBe(
      "worldkit://subject-definition/humanoid.g-bot@2",
    );
    expect(CLOUD_RIDGE_NATIVE_ADMISSION_BUDGET_V1).toEqual({
      maximumStaticColliderCount: 3,
      maximumStaticColliderVertexCount: 256,
      maximumStaticColliderTriangleCount: 1_000,
    });
    expect(CLOUD_RIDGE_GAMEPLAY_BOOTSTRAP_V1.initialRelationshipStates)
      .toEqual([]);
  });

  it("builds the reference composition with only three explicit gameplay colliders", async () => {
    const engine = new NullEngine({
      renderWidth: 640,
      renderHeight: 360,
      textureSize: 256,
      deterministicLockstep: true,
      lockstepMaxSteps: 4,
    });
    retainedEngines.push(engine);
    const scene = new Scene(engine);
    const nativeScene = createCloudRidgeNativeSceneControllerV1();

    const result = await buildBabylonNativeSceneCandidateV1({
      scene,
      bootstrap: CLOUD_RIDGE_NATIVE_BOOTSTRAP_V1,
      module: nativeScene.module,
      random: createBabylonNativeHostRandomV1(
        CLOUD_RIDGE_NATIVE_BOOTSTRAP_V1.seed,
      ),
      assets: cloudRidgeLockedAssetResolver,
      budget: CLOUD_RIDGE_NATIVE_ADMISSION_BUDGET_V1,
    });
    expect(result.outcome).toBe("passed");
    if (result.outcome !== "passed") return;
    const contribution = result.contribution;

    expect(contribution.spawnMarker).toEqual({
      id: "player-spawn",
      positionMetersXYZ: [0, 2.2, 18],
      facingRadians: 0,
    });
    expect(contribution.staticColliders.map(({ id }) => id)).toEqual([
      "foreground-platform",
      "gate-platform",
      "primary-path",
    ]);
    expect(scene.getMeshByName("gate-main-beam")).not.toBeNull();
    expect(scene.getMeshByName("mountain-left-primary")).not.toBeNull();
    expect(scene.getMeshByName("mountain-right-primary")).not.toBeNull();
    expect(scene.getMeshByName("cloud-bank-left")).not.toBeNull();
    expect(scene.getMeshByName("waterfall-right-primary")).not.toBeNull();
    expect(scene.lights.length).toBeGreaterThanOrEqual(2);

    // These baselines are the c312871 LCG output for seed 0x5eed_c10d.
    // They protect visual continuity while the sole random authority moves to Host.
    const firstCloud = scene.getMeshByName("cloud-bank-left")!;
    expect(firstCloud.position.asArray()).toEqual([
      -23.30717745423317,
      5.296542538329959,
      -28.374872245825827,
    ]);
    expect(firstCloud.scaling.asArray()).toEqual([
      10.729977486422285,
      1.7488197574391962,
      5.4229568594601005,
    ]);

    const primaryMountain = scene.getMeshByName("mountain-left-primary")!;
    expect(primaryMountain.position.asArray()).toEqual([
      0.46222282765433187,
      5.64,
      -0.759693981707096,
    ]);
    expect(primaryMountain.scaling.asArray()).toEqual([
      0.9980582506209611,
      1,
      0.8598343188129366,
    ]);
    expect(primaryMountain.rotation.asArray()).toEqual([
      0,
      -0.19885834981687367,
      -0.04586609588004649,
    ]);

    const firstTree = scene.getTransformNodeByName("pine-foreground-left.root")!;
    expect(firstTree.rotation.y).toBe(-1.4825962701885123);
    expect(scene.getMeshByName("pine-foreground-left.trunk")!.rotation.z)
      .toBe(-0.045739916600286964);
    const firstCrown = scene.getMeshByName("pine-foreground-left.crown-0")!;
    expect(firstCrown.position.asArray()).toEqual([
      0.022222190327011046,
      3.9099999999999997,
      -0.05230065789772199,
    ]);
    expect(firstCrown.scaling.asArray()).toEqual([
      1.3425433238502593,
      0.28,
      1.1028635921888053,
    ]);

    const firstStone = scene.getMeshByName("foreground-stone-00")!;
    expect(firstStone.position.asArray()).toEqual([
      -13.012308482672681,
      -0.2763811016175896,
      20.015402656617297,
    ]);
    expect(firstStone.rotation.asArray()).toEqual([
      -0.024159106586594137,
      0.4231960931327194,
      -0.02429303400218487,
    ]);
    expect([
      localAxisExtent(firstStone, 0),
      localAxisExtent(firstStone, 1),
      localAxisExtent(firstStone, 2),
    ]).toEqual([
      2.721219802182168,
      0.21393532844725996,
      3.0888145204633473,
    ]);

    expect([0, 1, 2].map((ribbon) =>
      localAxisExtent(scene.getMeshByName(`waterfall-right-primary.strand-${ribbon}`)!, 1)
    )).toEqual([
      18.040013279239645,
      19.227039880501106,
      20.414066481762564,
    ]);
    expect([0, 1, 2].map((ribbon) =>
      localAxisExtent(scene.getMeshByName(`waterfall-left-secondary.strand-${ribbon}`)!, 1)
    )).toEqual([
      13.940010261230634,
      14.857258089478128,
      15.774505917725618,
    ]);

    const collisionMeshNames = new Set([
      "collision-foreground-platform",
      "collision-primary-path",
      "collision-gate-platform",
    ]);
    expect(collisionMeshNames.has("cloud-bank-left")).toBe(false);
    expect(collisionMeshNames.has("mountain-left-primary")).toBe(false);
    expect(collisionMeshNames.has("waterfall-right-primary")).toBe(false);

    const path = scene.getMeshByName("collision-primary-path")!;
    const gatePlatform = scene.getMeshByName("collision-gate-platform")!;
    const pathPositions = path.getVerticesData(VertexBuffer.PositionKind)!;
    const pathSummitZMeters = pathPositions
      .filter((_value, index) => index % 3 === 2 && pathPositions[index - 1] === 14);
    gatePlatform.computeWorldMatrix(true);
    const gateFrontEdgeZMeters =
      gatePlatform.getBoundingInfo().boundingBox.maximumWorld.z;
    expect(pathSummitZMeters).toEqual([-31, -31, -37, -37, -48, -48]);
    expect(gateFrontEdgeZMeters).toBeCloseTo(-34, 6);
    expect(Math.min(...pathSummitZMeters)).toBeLessThan(gateFrontEdgeZMeters);
    expect(Math.max(...pathSummitZMeters)).toBeGreaterThan(gateFrontEdgeZMeters);
    expect(gatePlatform.getBoundingInfo().boundingBox.maximumWorld.y)
      .toBeCloseTo(13.7, 6);

    const collisionMeshes = [...collisionMeshNames]
      .map((name) => scene.getMeshByName(name)!);
    expect(collisionMeshes.every(
      (mesh) => !mesh.isVisible && mesh.visibility === 0,
    )).toBe(true);
    nativeScene.setCollisionDebugVisible(true);
    expect(collisionMeshes.every(
      (mesh) => mesh.isVisible && mesh.visibility === 0.48,
    )).toBe(true);
    nativeScene.setCollisionDebugVisible(false);
    expect(collisionMeshes.every(
      (mesh) => !mesh.isVisible && mesh.visibility === 0,
    )).toBe(true);
    expect(contribution.staticColliders.every(
      (collider) => !Object.hasOwn(collider, "mesh"),
    )).toBe(true);
  });
});
