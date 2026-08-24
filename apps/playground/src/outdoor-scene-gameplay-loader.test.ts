import { describe, expect, it } from "vitest";
import { compileOutdoorScene } from "@whitebox-world/world";

import { sceneCatalog } from "./scenes/index.js";
import { loadOutdoorGameplaySceneV1 } from "./outdoor-scene-gameplay-loader.js";

describe("loadOutdoorGameplaySceneV1", () => {
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
