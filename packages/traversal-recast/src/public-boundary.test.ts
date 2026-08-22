import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import * as publicApi from "./index.js";

describe("traversal-recast provider boundary", () => {
  it("does not expose provider handles, configs, or identities at the package root", () => {
    expect(Object.keys(publicApi).sort()).toEqual([
      "HeightfieldRouteBuildInputInvalidErrorV1",
      "createHeightfieldRouteBuildInputV1",
    ]);

    const publicSource = readFileSync(
      new URL("./index.ts", import.meta.url),
      "utf8",
    ).toLowerCase();
    for (const providerTerm of [
      "recast",
      "navmesh",
      "polyref",
      "tileref",
      "wasm",
      "recasttiledconfig",
    ]) {
      expect(publicSource).not.toContain(providerTerm);
    }
  });

  it("keeps Runtime Babylon and provider dependencies out of canonical Traversal", () => {
    const traversalPackageJson = readFileSync(
      new URL("../../traversal/package.json", import.meta.url),
      "utf8",
    );
    expect(traversalPackageJson).not.toContain("recast-navigation");
    expect(traversalPackageJson).not.toContain("@whitebox-world/validation");

    const recastPackageJson = JSON.parse(readFileSync(
      new URL("../package.json", import.meta.url),
      "utf8",
    )) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(recastPackageJson.dependencies).not.toHaveProperty(
      "@whitebox-world/runtime-babylon",
    );
    expect(recastPackageJson.devDependencies).toHaveProperty(
      "@whitebox-world/runtime-babylon",
    );

    const recastSourceDirectory = new URL("./", import.meta.url);
    const recastProductionSources = readdirSync(recastSourceDirectory)
      .filter((name) =>
        name.endsWith(".ts") &&
        !name.endsWith(".test.ts") &&
        !name.endsWith(".test-support.ts")
      )
      .map((name) => ({
        name,
        source: readFileSync(new URL(name, recastSourceDirectory), "utf8"),
      }));
    for (const { source } of recastProductionSources) {
      expect(source).not.toContain("@whitebox-world/runtime-babylon");
    }
    const rawGeneratorConsumers = recastProductionSources.filter(
      ({ source }) => source.includes("generateTiledNavMesh"),
    );
    expect(rawGeneratorConsumers.map(({ name }) => name)).toEqual([
      "provider-lifecycle.ts",
    ]);

    const traversalSourceDirectory = new URL("../../traversal/src/", import.meta.url);
    const traversalProductionSources = readdirSync(traversalSourceDirectory)
      .filter((name) =>
        name.endsWith(".ts") &&
        !name.endsWith(".test.ts") &&
        !name.endsWith(".test-support.ts")
      )
      .map((name) => readFileSync(
        new URL(name, traversalSourceDirectory),
        "utf8",
      ))
      .join("\n");
    expect(traversalProductionSources).not.toContain("recast-navigation");
    expect(traversalProductionSources).not.toContain(
      "@whitebox-world/validation",
    );
    for (const validationAuthority of [
      "routeRuntimeGateThresholds",
      "maximumProbeTicks",
      "maximumStallTicks",
      "maximumUnsupportedTicks",
    ]) {
      expect(traversalProductionSources).not.toContain(validationAuthority);
    }
  });
});
