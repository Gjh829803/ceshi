import { describe, expect, it } from "vitest";
import { compileOutdoorScene } from "@whitebox-world/world";

import { sceneCatalog } from "./scenes/index.js";
import {
  loadOutdoorGameplaySceneV1,
  projectOutdoorLandmarkTransformV1,
} from "./outdoor-scene-gameplay-loader.js";

function expectImportErrorCode(action: () => unknown, code: string): void {
  try {
    action();
  } catch (error) {
    expect(error).toMatchObject({ code });
    return;
  }
  throw new Error(`Expected Outdoor Scene import error '${code}'.`);
}

describe("loadOutdoorGameplaySceneV1", () => {
  it("composes nested legacy XYZ transforms into the Babylon execution convention", () => {
    const result = projectOutdoorLandmarkTransformV1([
      {
        position: [10, 0, 0],
        rotation: [0, Math.PI / 2, 0],
        scale: [2, 2, 2],
      },
      {
        position: [1, 0, 0],
        rotation: [0.2, 0, -0.3],
        scale: [1, 1, 1],
      },
    ]);

    expect(result.positionMetersXYZ[0]).toBeCloseTo(10, 6);
    expect(result.positionMetersXYZ[1]).toBeCloseTo(0, 6);
    expect(result.positionMetersXYZ[2]).toBeCloseTo(-2, 6);
    expect(result.rotationEulerRadiansXYZ[0]).toBeCloseTo(0.2, 6);
    expect(result.rotationEulerRadiansXYZ[1]).toBeCloseTo(Math.PI / 2, 6);
    expect(result.rotationEulerRadiansXYZ[2]).toBeCloseTo(-0.3, 6);
    expect(result.scaleXYZ[0]).toBeCloseTo(2, 6);
    expect(result.scaleXYZ[1]).toBeCloseTo(2, 6);
    expect(result.scaleXYZ[2]).toBeCloseTo(2, 6);
  });

  it("composes aligned nested non-uniform scale without losing an axis", () => {
    const result = projectOutdoorLandmarkTransformV1([
      {
        position: [10, 2, -4],
        rotation: [0, 0, 0],
        scale: [2, 3, 4],
      },
      {
        position: [1, 2, 3],
        rotation: [0, 0, 0],
        scale: [0.5, 2, 0.25],
      },
    ]);

    expect(result.positionMetersXYZ).toEqual([12, 8, 8]);
    expect(result.rotationEulerRadiansXYZ).toEqual([0, 0, 0]);
    expect(result.scaleXYZ).toEqual([1, 6, 1]);
  });

  it("rejects a negative-determinant landmark transform", () => {
    expectImportErrorCode(() => projectOutdoorLandmarkTransformV1([{
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [-1, 1, 1],
    }]), "OUTDOOR_SCENE_IMPORT_TRANSFORM_INVALID");
  });

  it("rejects nested non-uniform transforms that flatten into shear", () => {
    expectImportErrorCode(() => projectOutdoorLandmarkTransformV1([
      {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [2, 1, 1],
      },
      {
        position: [0, 0, 0],
        rotation: [0, 0, Math.PI / 4],
        scale: [1, 1, 1],
      },
    ]), "OUTDOOR_SCENE_IMPORT_TRANSFORM_UNREPRESENTABLE");
  });

  it.each(Object.entries(sceneCatalog))(
    "compiles catalog scene %s through Authoring V4 and ExecutionPlan V5",
    async (sceneCatalogId, sceneDefinition) => {
      const result = await loadOutdoorGameplaySceneV1(sceneDefinition, {
        sceneCatalogId,
        aspectRatio: 16 / 9,
      });

      expect(result.ok, `${sceneCatalogId}: ${JSON.stringify(result.diagnostics)}`).toBe(true);
      expect(result.executionPlan).toMatchObject({
        kind: "worldkit-execution-plan",
        schemaVersion: 5,
        initialControlledEntityId: "player",
      });
      expect(result.runtimeWorldConfiguration?.executionPlan).toBe(result.executionPlan);
      expect(result.executionPlan?.terrain.resolutionCellsXZ[0]).toBeGreaterThan(2);
      expect(result.executionPlan?.terrain.resolutionCellsXZ[1]).toBeGreaterThan(2);
      expect(result.executionPlan?.subjects.map((subject) => subject.entityId)).toContain("player");
      expect(result.playgroundMetadata?.sceneCatalogId).toBe(sceneCatalogId);
      expect(result.playgroundMetadata?.featureInspections.length).toBeGreaterThan(0);
    },
    90_000,
  );

  it("produces byte-stable identities for the same scene", async () => {
    const scene = sceneCatalog["world-08170639-54db"]!;
    const first = await loadOutdoorGameplaySceneV1(scene, {
      sceneCatalogId: "world-08170639-54db",
      aspectRatio: 16 / 9,
    });
    const second = await loadOutdoorGameplaySceneV1(scene, {
      sceneCatalogId: "world-08170639-54db",
      aspectRatio: 16 / 9,
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.normalizedWorldIrHash).toBe(first.normalizedWorldIrHash);
    expect(second.executionPlanHash).toBe(first.executionPlanHash);
    expect(second.runtimeWorldConfiguration?.worldPackageBuildReceipt.worldPackageRootHash)
      .toBe(first.runtimeWorldConfiguration?.worldPackageBuildReceipt.worldPackageRootHash);
  }, 20_000);

  it("preserves terrain samples, content, spawn facing, and camera framing", async () => {
    const scene = sceneCatalog["azure-bay"]!;
    const compiledScene = compileOutdoorScene(scene);
    const result = await loadOutdoorGameplaySceneV1(scene, {
      sceneCatalogId: "azure-bay",
      aspectRatio: 4 / 3,
    });

    expect(result.ok).toBe(true);
    expect(result.executionPlan?.terrain.heightSamplesMeters.length)
      .toBe(result.executionPlan?.terrain.resolutionCellsXZ[0]! *
        result.executionPlan?.terrain.resolutionCellsXZ[1]!);
    expect(result.executionPlan?.objects.length).toBeGreaterThan(0);
    expect(result.executionPlan?.waters.length).toBeGreaterThan(0);
    expect(result.executionPlan?.subjects[0]?.spawnSubjectFacingRadians)
      .toBeCloseTo(compiledScene.spawn.facingRadians, 6);
    expect(result.executionPlan?.camera.aspectRatio).toBe(4 / 3);
  }, 20_000);
});
