import { existsSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

type SpawnSafetyModule = typeof import("./spawn-safety.js");
type SpawnSafetyInput = Parameters<SpawnSafetyModule["validateSpawnSafety"]>[0];

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

async function validateSpawnSafety(input: SpawnSafetyInput) {
  const owner: SpawnSafetyModule = await import("./spawn-safety.js");
  return owner.validateSpawnSafety(input);
}

const INVENTORY_EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".diversion",
  "node_modules",
]);

function repositoryFiles(...relativeRoots: readonly string[]): readonly string[] {
  const files: string[] = [];
  const visit = (absoluteDirectory: string): void => {
    for (const entry of readdirSync(absoluteDirectory, {
      withFileTypes: true,
    }).sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.isDirectory()) {
        if (!INVENTORY_EXCLUDED_DIRECTORIES.has(entry.name)) {
          visit(resolve(absoluteDirectory, entry.name));
        }
        continue;
      }
      if (!entry.isFile()) continue;
      files.push(relative(
        repositoryRoot,
        resolve(absoluteDirectory, entry.name),
      ).replaceAll("\\", "/"));
    }
  };

  for (const relativeRoot of relativeRoots) {
    const absoluteRoot = resolve(repositoryRoot, relativeRoot);
    if (existsSync(absoluteRoot)) visit(absoluteRoot);
  }
  return Object.freeze(files.sort());
}

describe("validateSpawnSafety", () => {
  it("accepts a grounded, unobstructed spawn", async () => {
    await expect(validateSpawnSafety({
      entityId: "player",
      position: [0, 2, 0],
      ground: { heightAt: () => 2 },
      worldBounds: { min: [-10, 0, -10], max: [10, 10, 10] },
    })).resolves.toEqual([]);
  });

  it("returns the exact non-finite diagnostic before all other checks", async () => {
    await expect(validateSpawnSafety({
      entityId: "player",
      position: [0, Number.NaN, 0],
      capsule: { radius: 0.5, height: 2 },
      worldBounds: { min: [-10, 0, -10], max: [10, 10, 10] },
    })).resolves.toEqual([{
      severity: "error",
      code: "SPAWN_NOT_FINITE",
      message: "Spawn player contains a non-finite position or capsule dimension.",
      entityId: "player",
    }]);
  });

  it("returns the exact invalid-capsule diagnostic before spatial checks", async () => {
    await expect(validateSpawnSafety({
      entityId: "player",
      position: [0, 0, 0],
      capsule: { radius: 0, height: 2 },
    })).resolves.toEqual([{
      severity: "error",
      code: "SPAWN_INVALID_CAPSULE",
      message: "Spawn player requires positive capsule dimensions.",
      entityId: "player",
      suggestions: ["Use the humanoid SubjectKit default capsule dimensions."],
    }]);
  });

  it("preserves exact world, collider, and missing-ground diagnostic order", async () => {
    await expect(validateSpawnSafety({
      entityId: "player",
      position: [12, 0, 0],
      capsule: { radius: 0.5, height: 2 },
      worldBounds: { min: [-10, 0, -10], max: [10, 10, 10] },
      colliders: [{
        entityId: "tower",
        featureId: "tower-feature",
        bounds: { min: [11, -1, -1], max: [13, 3, 1] },
      }],
      ground: { heightAt: () => undefined },
    })).resolves.toEqual([
      {
        severity: "error",
        code: "SPAWN_OUTSIDE_WORLD",
        message: "Spawn player is outside the configured world bounds.",
        entityId: "player",
        suggestions: ["Move the spawn point inside the playable bounds."],
      },
      {
        severity: "error",
        code: "SPAWN_INTERSECTS_COLLIDER",
        message: "Spawn player intersects collider tower.",
        entityId: "player",
        featureId: "tower-feature",
        suggestions: ["Move the spawn point or resize the blocking collider."],
      },
      {
        severity: "error",
        code: "SPAWN_HAS_NO_GROUND",
        message: "Spawn player has no finite ground sample beneath it.",
        entityId: "player",
        suggestions: ["Choose a spawn point on generated terrain."],
      },
    ]);
  });

  it("preserves exact below-ground, above-ground, and default-slope diagnostics", async () => {
    await expect(validateSpawnSafety({
      entityId: "below",
      position: [0, -0.2, 0],
      ground: { heightAt: () => 0 },
    })).resolves.toEqual([{
      severity: "error",
      code: "SPAWN_BELOW_GROUND",
      message: "Spawn below is 0.20m below the terrain.",
      entityId: "below",
      suggestions: ["Snap the spawn feet position to terrain height."],
    }]);

    await expect(validateSpawnSafety({
      entityId: "above",
      position: [0, 1.01, 0],
      ground: { heightAt: () => 0 },
    })).resolves.toEqual([{
      severity: "warning",
      code: "SPAWN_ABOVE_GROUND",
      message: "Spawn above is 1.01m above the terrain.",
      entityId: "above",
      suggestions: [
        "Snap the spawn feet position to terrain height unless an intentional drop is desired.",
      ],
    }]);

    await expect(validateSpawnSafety({
      entityId: "slope",
      position: [0, 0, 0],
      ground: {
        heightAt: () => 0,
        slopeDegreesAt: () => 47,
      },
    })).resolves.toEqual([{
      severity: "error",
      code: "SPAWN_SLOPE_NOT_WALKABLE",
      message: "Spawn slope is on a 47.0° slope, above the 42° climb limit.",
      entityId: "slope",
      suggestions: ["Flatten and smooth the spawn area or choose another point."],
    }]);
  });

  it("rejects only blocked water footprints and reports the exact blocking surface", async () => {
    const boundary = {
      kind: "ellipse" as const,
      centerMetersXZ: [2, -3] as const,
      radiusMetersXZ: [5, 4] as const,
    };

    await expect(validateSpawnSafety({
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
    })).resolves.toEqual([{
      severity: "error",
      code: "SPAWN_IN_BLOCKED_WATER",
      message: "Spawn player is inside blocked water lake-blocked.",
      entityId: "player",
      featureId: "lake-feature",
      suggestions: [
        "Move the spawn outside blocked water or mark an intentionally walkable surface as walkable.",
      ],
    }]);

    for (const traversalMode of ["walkable", "swimmable"] as const) {
      await expect(validateSpawnSafety({
        entityId: "player",
        position: [2, 0, -3],
        waterSurfaces: [{
          entityId: `lake-${traversalMode}`,
          boundary,
          waterLevelMeters: 1,
          depthMeters: 2,
          traversalMode,
        }],
      })).resolves.toEqual([]);
    }
  });

  it("preserves exact capsule-disc overlap diagnostics outside circular centers", async () => {
    const circle = {
      kind: "circle" as const,
      centerMetersXZ: [0, 0] as const,
      radiusMeters: 1,
    };

    await expect(validateSpawnSafety({
      entityId: "player",
      position: [1.2, 0, 0],
      capsule: { radius: 0.35, height: 1.8 },
      waterSurfaces: [{
        entityId: "pond",
        boundary: circle,
        waterLevelMeters: 1,
        depthMeters: 2,
        traversalMode: "blocked",
      }],
      staticBlockingObjects: [{
        entityId: "column",
        footprint: circle,
        heightRangeMeters: [-1, 2],
      }],
    })).resolves.toEqual([
      {
        severity: "error",
        code: "SPAWN_IN_BLOCKED_WATER",
        message: "Spawn player is inside blocked water pond.",
        entityId: "player",
        suggestions: [
          "Move the spawn outside blocked water or mark an intentionally walkable surface as walkable.",
        ],
      },
      {
        severity: "error",
        code: "SPAWN_INSIDE_STATIC_BLOCKER",
        message: "Spawn player is inside static blocking object column.",
        entityId: "player",
        suggestions: ["Move the spawn outside the blocking object's footprint."],
      },
    ]);
  });

  it("allows a spawn below an elevated blocked-water volume", async () => {
    await expect(validateSpawnSafety({
      entityId: "player",
      position: [4.2, 0, 0],
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
    })).resolves.toEqual([]);
  });

  it("rejects a spawn inside the exact footprint and vertical range of a blocker", async () => {
    const blocker = {
      entityId: "gate-post",
      featureId: "crossing-gate",
      footprint: {
        kind: "polygon" as const,
        pointsMetersXZ: [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const,
      },
      heightRangeMeters: [0, 3] as const,
    };

    await expect(validateSpawnSafety({
      entityId: "player",
      position: [0, 0, 0],
      staticBlockingObjects: [blocker],
    })).resolves.toEqual([{
      severity: "error",
      code: "SPAWN_INSIDE_STATIC_BLOCKER",
      message: "Spawn player is inside static blocking object gate-post.",
      entityId: "player",
      featureId: "crossing-gate",
      suggestions: ["Move the spawn outside the blocking object's footprint."],
    }]);
    await expect(validateSpawnSafety({
      entityId: "player",
      position: [4, 0, 0],
      staticBlockingObjects: [blocker],
    })).resolves.toEqual([]);
    await expect(validateSpawnSafety({
      entityId: "player",
      position: [0, 4, 0],
      staticBlockingObjects: [blocker],
    })).resolves.toEqual([]);
  });

  it("allows exact capsule-foot contact with a blocker top", async () => {
    await expect(validateSpawnSafety({
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
    })).resolves.toEqual([]);
  });
});

describe("spawn-safety ownership boundary", () => {
  it("has no non-test source imports or production manifest dependencies on testkit", () => {
    const sourceExtensions = /\.(?:c|m)?[jt]sx?$/;
    const testPath = /(?:^|\/)(?:__tests__|tests?)(?:\/|$)|\.(?:test|spec)\.[^.]+$/;
    const sourceViolations: string[] = [];

    for (const relativePath of repositoryFiles("packages", "apps", "scripts")) {
      if (!sourceExtensions.test(relativePath) || testPath.test(relativePath)) continue;
      const absolutePath = resolve(repositoryRoot, relativePath);
      if (!existsSync(absolutePath)) continue;
      const source = readFileSync(absolutePath, "utf8");
      source.split("\n").forEach((line, index) => {
        if (line.includes("@whitebox-world/testkit")) {
          sourceViolations.push(`${relativePath}:${index + 1}:${line.trim()}`);
        }
      });
    }

    const manifestViolations: string[] = [];
    for (const relativePath of repositoryFiles(".").filter((path) =>
      path === "package.json" || path.endsWith("/package.json")
    )) {
      const manifest = JSON.parse(
        readFileSync(resolve(repositoryRoot, relativePath), "utf8"),
      ) as Record<string, unknown>;
      for (const field of ["dependencies", "optionalDependencies", "peerDependencies"] as const) {
        const dependencies = manifest[field] as Record<string, string> | undefined;
        if (dependencies?.["@whitebox-world/testkit"] !== undefined) {
          manifestViolations.push(
            `${relativePath}:${field}:@whitebox-world/testkit`,
          );
        }
      }
    }

    expect({ sourceViolations, manifestViolations }).toEqual({
      sourceViolations: [],
      manifestViolations: [],
    });
  });
});
