import { describe, expect, it } from "vitest";
import {
  mergeDiagnostics,
  summarizeDiagnostics,
  validateFeatureOwnership,
  validateFiniteTransforms,
  validateSpawnSafety,
} from "./index.js";

describe("validateFiniteTransforms", () => {
  it("reports non-finite values and zero scale", () => {
    const diagnostics = validateFiniteTransforms([
      { entityId: "valid", position: [0, 1, 2] },
      { entityId: "bad", position: [0, Number.NaN, 2], scale: [1, 0, 1] },
    ]);

    expect(diagnostics.map((item) => item.code)).toEqual([
      "TRANSFORM_NOT_FINITE",
      "TRANSFORM_ZERO_SCALE",
    ]);
  });
});

describe("validateSpawnSafety", () => {
  it("accepts a grounded, unobstructed spawn", () => {
    expect(
      validateSpawnSafety({
        entityId: "player",
        position: [0, 2, 0],
        ground: { heightAt: () => 2 },
        worldBounds: { min: [-10, 0, -10], max: [10, 10, 10] },
      }),
    ).toEqual([]);
  });

  it("reports overlap, missing ground, and out-of-bounds", () => {
    const diagnostics = validateSpawnSafety({
      entityId: "player",
      position: [12, 0, 0],
      capsule: { radius: 0.5, height: 2 },
      worldBounds: { min: [-10, 0, -10], max: [10, 10, 10] },
      colliders: [
        {
          entityId: "tower",
          featureId: "tower-feature",
          bounds: { min: [11, -1, -1], max: [13, 3, 1] },
        },
      ],
      ground: { heightAt: () => undefined },
    });

    expect(diagnostics.map((item) => item.code)).toEqual([
      "SPAWN_OUTSIDE_WORLD",
      "SPAWN_INTERSECTS_COLLIDER",
      "SPAWN_HAS_NO_GROUND",
    ]);
  });

  it("rejects a spawn on terrain steeper than the humanoid climb contract", () => {
    const diagnostics = validateSpawnSafety({
      entityId: "player",
      position: [0, 0, 0],
      ground: {
        heightAt: () => 0,
        slopeDegreesAt: () => 47,
      },
    });

    expect(diagnostics.map((item) => item.code)).toContain("SPAWN_SLOPE_NOT_WALKABLE");
  });

  it("rejects only blocked water footprints and reports the blocking surface", () => {
    const boundary = {
      kind: "ellipse" as const,
      centerMetersXZ: [2, -3] as const,
      radiusMetersXZ: [5, 4] as const,
    };

    expect(validateSpawnSafety({
      entityId: "player",
      position: [2, 0, -3],
      waterSurfaces: [{
        entityId: "lake-blocked",
        featureId: "lake-feature",
        boundary,
        waterLevelMeters: 1,
        depthMeters: 2,
        traversalMode: "blocked",
      }],
    })).toEqual([{
      severity: "error",
      code: "SPAWN_IN_BLOCKED_WATER",
      message: "Spawn player is inside blocked water lake-blocked.",
      entityId: "player",
      featureId: "lake-feature",
      suggestions: ["Move the spawn outside blocked water or mark an intentionally walkable surface as walkable."],
    }]);

    for (const traversalMode of ["walkable", "swimmable"] as const) {
      expect(validateSpawnSafety({
        entityId: "player",
        position: [2, 0, -3],
        waterSurfaces: [{
          entityId: `lake-${traversalMode}`,
          boundary,
          waterLevelMeters: 1,
          depthMeters: 2,
          traversalMode,
        }],
      })).toEqual([]);
    }
  });

  it("allows a spawn below an elevated blocked-water volume", () => {
    expect(validateSpawnSafety({
      entityId: "player",
      position: [0, 0, 0],
      capsule: { radius: 0.35, height: 1.8 },
      waterSurfaces: [{
        entityId: "elevated-reservoir",
        boundary: {
          kind: "circle",
          centerMetersXZ: [0, 0],
          radiusMeters: 4,
        },
        waterLevelMeters: 5,
        depthMeters: 2,
        traversalMode: "blocked",
      }],
    })).toEqual([]);
  });

  it("rejects a spawn inside the footprint and vertical range of a static blocker", () => {
    const blocker = {
      entityId: "gate-post",
      featureId: "crossing-gate",
      footprint: {
        kind: "polygon" as const,
        pointsMetersXZ: [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const,
      },
      heightRangeMeters: [0, 3] as const,
    };

    expect(validateSpawnSafety({
      entityId: "player",
      position: [0, 0, 0],
      staticBlockingObjects: [blocker],
    })).toEqual([{
      severity: "error",
      code: "SPAWN_INSIDE_STATIC_BLOCKER",
      message: "Spawn player is inside static blocking object gate-post.",
      entityId: "player",
      featureId: "crossing-gate",
      suggestions: ["Move the spawn outside the blocking object's footprint."],
    }]);
    expect(validateSpawnSafety({
      entityId: "player",
      position: [4, 0, 0],
      staticBlockingObjects: [blocker],
    })).toEqual([]);
    expect(validateSpawnSafety({
      entityId: "player",
      position: [0, 4, 0],
      staticBlockingObjects: [blocker],
    })).toEqual([]);
  });

  it("allows exact capsule-foot contact with the top of a static blocker", () => {
    expect(validateSpawnSafety({
      entityId: "player",
      position: [0, 3, 0],
      capsule: { radius: 0.35, height: 1.8 },
      staticBlockingObjects: [{
        entityId: "support-box",
        footprint: {
          kind: "polygon",
          pointsMetersXZ: [[-1, -1], [1, -1], [1, 1], [-1, 1]],
        },
        heightRangeMeters: [0, 3],
      }],
    })).toEqual([]);
  });
});

describe("validateFeatureOwnership", () => {
  it("reports missing dependencies and conflicting resource owners", () => {
    const diagnostics = validateFeatureOwnership({
      features: [
        {
          id: "lake",
          type: "lake",
          version: 1,
          resources: ["water"],
          dependencies: ["terrain"],
        },
        { id: "tower", type: "tower", version: 1, resources: ["water"] },
      ],
      resources: [
        { id: "water", kind: "surface", ownerFeatureId: "tower" },
        { id: "orphan", kind: "mesh" },
      ],
      requireEveryResourceOwned: true,
    });

    expect(diagnostics.map((item) => item.code)).toEqual([
      "FEATURE_DEPENDENCY_MISSING",
      "RESOURCE_HAS_MULTIPLE_OWNERS",
      "RESOURCE_OWNER_MISMATCH",
      "RESOURCE_UNOWNED",
    ]);
  });
});

describe("summarizeDiagnostics", () => {
  it("merges and summarizes diagnostic groups", () => {
    const diagnostics = mergeDiagnostics(
      [{ severity: "info", code: "READY", message: "ready" }],
      [
        { severity: "warning", code: "BUDGET", message: "near limit" },
        { severity: "error", code: "BROKEN", message: "broken" },
      ],
    );
    const summary = summarizeDiagnostics(diagnostics);

    expect(summary.total).toBe(3);
    expect(summary.bySeverity).toEqual({ info: 1, warning: 1, error: 1 });
    expect(summary.maxSeverity).toBe("error");
    expect(summary.hasErrors).toBe(true);
  });
});
