import {
  validateFeatureOwnership,
  validateFiniteTransforms,
} from "@whitebox-world/testkit";
import { validateSpawnSafety } from "@whitebox-world/terrain-surface";
import {
  compileOutdoorScene,
  deriveWorldPlanArtifacts,
  isTerrainSurface,
  sampleTerrainSlopeDegrees,
  type TerrainSurface,
} from "@whitebox-world/world";
import { describe, expect, it } from "vitest";

import { sceneCatalog } from "./index.js";
import { azureBayScene } from "./azure-bay-scene.js";

describe("agent-authored playground scenes", () => {
  for (const [catalogId, definition] of Object.entries(sceneCatalog)) {
    it(`compiles and validates ${catalogId}`, () => {
      const scene = compileOutdoorScene(definition);
      const ownership = validateFeatureOwnership({
        features: scene.registry.list().map((feature) => ({
          id: feature.id,
          type: feature.type,
          version: feature.version,
          resources: feature.resourceIds,
          dependencies: feature.dependsOn,
        })),
        resources: scene.registry.listResources().map((resource) => ({
          id: resource.id,
          kind: resource.kind,
          ownerFeatureId: resource.ownerFeatureId,
        })),
        requireEveryResourceOwned: true,
      });
      const transforms = validateFiniteTransforms([
        { entityId: "player", position: scene.spawn.position },
      ]);
      const primaryTerrain = scene.registry.getResource<TerrainSurface>(
        scene.terrainHandles[0]?.terrainId ?? "",
      );
      const spawn = validateSpawnSafety({
        entityId: "player",
        position: scene.spawn.position,
        ground: {
          heightAt: (x, z) =>
            isTerrainSurface(primaryTerrain?.value)
              ? primaryTerrain.value.sampleHeight(x, z)
              : undefined,
          slopeDegreesAt: (x, z) =>
            isTerrainSurface(primaryTerrain?.value)
              ? sampleTerrainSlopeDegrees(primaryTerrain.value, x, z)
              : undefined,
          maxDrop: 1,
        },
      });
      const diagnostics = [...scene.diagnostics, ...ownership, ...transforms, ...spawn];
      expect(
        diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
      ).toEqual([]);
      expect(scene.registry.list().every((feature) => feature.status === "built")).toBe(true);
      expect(scene.registry.listResources().length).toBeGreaterThan(0);
      if (scene.worldSpec !== undefined) {
        const artifacts = deriveWorldPlanArtifacts(scene);
        expect(artifacts.diagnostics).toEqual([]);
        expect(artifacts.topDown.sceneId).toBe(definition.id);
        expect(artifacts.heightSlope.grid.heights.every((value) => value === null || Number.isFinite(value))).toBe(true);
      }
    }, 15_000);

  }

  it("keeps the Azure Bay overlook route continuously walkable", () => {
    const scene = compileOutdoorScene(azureBayScene);
    const terrain = scene.registry.getResource<TerrainSurface>(
      scene.terrainHandles[0]?.terrainId ?? "",
    );
    expect(isTerrainSurface(terrain?.value)).toBe(true);
    if (!isTerrainSurface(terrain?.value)) return;

    const routeSamples: Array<{ z: number; height: number; slope: number }> = [];
    for (let z = scene.spawn.position[2]; z <= -130; z += 5) {
      routeSamples.push({
        z,
        height: terrain.value.sampleHeight(0, z) ?? Number.NaN,
        slope: sampleTerrainSlopeDegrees(terrain.value, 0, z) ?? Number.POSITIVE_INFINITY,
      });
    }
    const steepest = routeSamples.reduce((current, sample) =>
      sample.slope > current.slope ? sample : current,
    );
    expect(steepest.slope, JSON.stringify(routeSamples)).toBeLessThanOrEqual(35);
  }, 15_000);
});
