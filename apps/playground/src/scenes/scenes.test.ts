import {
  validateFeatureOwnership,
  validateFiniteTransforms,
  validateSpawnSafety,
} from "@whitebox-world/testkit";
import { createPhysicsSystem } from "@whitebox-world/physics";
import {
  compileOutdoorScene,
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
    });

    it(`keeps ${catalogId} terrain rendering samples aligned with physics`, async () => {
      const scene = compileOutdoorScene(definition);
      const physics = await createPhysicsSystem({ gravity: [0, -9.81, 0] });
      try {
        for (const resource of scene.registry.listResources()) {
          if (resource.kind !== "terrain" || !isTerrainSurface(resource.value)) continue;
          resource.value.forEachHeightfield((heightfield) => {
            const body = physics.createRigidBody(undefined, {
              type: "fixed",
              sync: "none",
              position: [heightfield.origin[0], 0, heightfield.origin[1]],
            });
            body.createCollider({
              shape: {
                type: "heightfield",
                rows: heightfield.zSegments,
                columns: heightfield.xSegments,
                heights: heightfield.heights,
                scale: [heightfield.width, 1, heightfield.depth],
              },
            });
          });
        }

        const [x, , z] = scene.spawn.position;
        const primaryTerrain = scene.registry.getResource<TerrainSurface>(
          scene.terrainHandles[0]?.terrainId ?? "",
        );
        const expectedHeight = isTerrainSurface(primaryTerrain?.value)
          ? primaryTerrain.value.sampleHeight(x, z)
          : undefined;
        const hit = physics.raycast({
          origin: [x, 100, z],
          direction: [0, -1, 0],
          maxDistance: 200,
        });

        expect(expectedHeight).toBeDefined();
        expect(hit?.point[1]).toBeCloseTo(expectedHeight as number, 2);
      } finally {
        physics.dispose();
      }
    });
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
  });
});
