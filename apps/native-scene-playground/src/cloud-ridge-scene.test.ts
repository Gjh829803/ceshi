import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import { Scene } from "@babylonjs/core/scene.pure.js";
import { afterEach, describe, expect, it } from "vitest";

import { buildBabylonNativeSceneContributionV1 } from
  "@whitebox-world/runtime-babylon";

import { createCloudRidgeNativeSceneControllerV1 } from
  "./cloud-ridge-scene.js";
import {
  CLOUD_RIDGE_GAMEPLAY_EXECUTION_PLAN_V1,
  CLOUD_RIDGE_NATIVE_BOOTSTRAP_V1,
} from "./native-bootstrap.js";

const retainedEngines: NullEngine[] = [];

afterEach(() => {
  while (retainedEngines.length > 0) retainedEngines.pop()?.dispose();
});

describe("cloud ridge Babylon Native scene", () => {
  it("keeps the bootstrap resource refs identical to the frozen gameplay closure", () => {
    const subject = CLOUD_RIDGE_GAMEPLAY_EXECUTION_PLAN_V1.subjects[0]!;
    expect(CLOUD_RIDGE_NATIVE_BOOTSTRAP_V1).toEqual({
      kind: "babylon-native-world-bootstrap",
      schemaVersion: 1,
      id: "cloud-ridge-native-spike",
      sceneModuleRef: "app://native-scene/cloud-ridge",
      sceneModuleId: "cloud-ridge-native-spike",
      gravityMetersPerSecondSquaredXYZ: [0, -9.81, 0],
      controlledSubjectDefinitionRef: subject.subjectDefinitionRef,
      spawnMarkerId: "player-spawn",
      cameraRigRef: CLOUD_RIDGE_GAMEPLAY_EXECUTION_PLAN_V1.camera.rigRef,
      actionOrPoseSetRef: subject.capabilityAssembly.actionOrPoseSetRef,
      staticCollisionBudget: {
        maximumStaticColliderCount: 3,
        maximumStaticColliderVertexCount: 256,
        maximumStaticColliderTriangleCount: 1_000,
      },
    });
    expect(CLOUD_RIDGE_GAMEPLAY_EXECUTION_PLAN_V1.initialRelationships)
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

    const contribution = await buildBabylonNativeSceneContributionV1({
      scene,
      module: nativeScene.module,
      budget: CLOUD_RIDGE_NATIVE_BOOTSTRAP_V1.staticCollisionBudget,
    });

    expect(contribution.spawnMarker).toEqual({
      id: "player-spawn",
      positionMetersXYZ: [0, 2.2, 18],
      facingRadians: 0,
    });
    expect(contribution.staticCollisionMeshes.map(({ id }) => id)).toEqual([
      "foreground-platform",
      "primary-path",
      "gate-platform",
    ]);
    expect(scene.getMeshByName("gate-main-beam")).not.toBeNull();
    expect(scene.getMeshByName("mountain-left-primary")).not.toBeNull();
    expect(scene.getMeshByName("mountain-right-primary")).not.toBeNull();
    expect(scene.getMeshByName("cloud-bank-left")).not.toBeNull();
    expect(scene.getMeshByName("waterfall-right-primary")).not.toBeNull();
    expect(scene.lights.length).toBeGreaterThanOrEqual(2);

    const collisionMeshNames = new Set(
      contribution.staticCollisionMeshes.map(({ sourceMesh }) => sourceMesh.name),
    );
    expect(collisionMeshNames.has("cloud-bank-left")).toBe(false);
    expect(collisionMeshNames.has("mountain-left-primary")).toBe(false);
    expect(collisionMeshNames.has("waterfall-right-primary")).toBe(false);

    const path = contribution.staticCollisionMeshes.find(
      ({ id }) => id === "primary-path",
    )!.sourceMesh;
    const gatePlatform = contribution.staticCollisionMeshes.find(
      ({ id }) => id === "gate-platform",
    )!.sourceMesh;
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

    expect(contribution.staticCollisionMeshes.every(
      ({ sourceMesh }) => !sourceMesh.isVisible && sourceMesh.visibility === 0,
    )).toBe(true);
    nativeScene.setCollisionDebugVisible(true);
    expect(contribution.staticCollisionMeshes.every(
      ({ sourceMesh }) =>
        sourceMesh.isVisible && sourceMesh.visibility === 0.48,
    )).toBe(true);
    nativeScene.setCollisionDebugVisible(false);
    expect(contribution.staticCollisionMeshes.every(
      ({ sourceMesh }) => !sourceMesh.isVisible && sourceMesh.visibility === 0,
    )).toBe(true);
  });
});
