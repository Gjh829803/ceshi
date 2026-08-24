import { describe, expect, it } from "vitest";

import { FeatureRegistry, defineWorldFeature } from "@whitebox-world/world";

import {
  inspectPlaygroundFeatures,
  toPlaygroundFeatureInspection,
} from "./playground-feature-inspection.js";

describe("playground feature inspection projection", () => {
  it("projects built features into stable public resource and diagnostic metadata", () => {
    const registry = new FeatureRegistry();
    const feature = defineWorldFeature<{ label: string }, void>({
      type: "test.public-inspection",
      version: 3,
      schema: { label: "string" },
      build(context) {
        context.resources.create("surface", { engineHandle: "babylon-private-surface" });
        context.resources.create("terrainPatch", { providerHandle: "havok-private-patch" });
        context.resources.create("custom", { providerHandle: "private-custom-provider" });
        context.resources.create("semantic", { semantic: "grass" });
        context.resources.create("landmark", { engineHandle: "private-landmark" }, { vertices: 12 });
        context.resources.create("terrain", { engineHandle: "private-terrain" }, { vertices: 25 });
        context.diagnostics.add({
          severity: "warning",
          code: "Z_WARNING",
          message: "Later warning.",
          suggestions: ["private provider suggestion"],
        });
        context.diagnostics.add({
          severity: "info",
          code: "A_INFO",
          message: "Earlier information.",
        });
      },
    });
    const inspection = registry.instantiate(feature, {
      id: "feature-z",
      seed: 19,
      params: { label: "public" },
    });

    const projected = toPlaygroundFeatureInspection(registry, inspection);

    expect(projected).toEqual({
      id: "feature-z",
      type: "test.public-inspection",
      version: 3,
      seed: 19,
      status: "ready",
      parameters: { label: "public" },
      resources: [
        { id: "feature-z:custom:1", kind: "semantic" },
        { id: "feature-z:landmark:1", kind: "mesh", vertices: 12 },
        { id: "feature-z:semantic:1", kind: "semantic" },
        { id: "feature-z:surface:1", kind: "surface" },
        { id: "feature-z:terrain:1", kind: "mesh", vertices: 25 },
        { id: "feature-z:terrainPatch:1", kind: "collider" },
      ],
      diagnostics: [
        { severity: "info", code: "A_INFO", message: "Earlier information." },
        { severity: "warning", code: "Z_WARNING", message: "Later warning." },
      ],
    });
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain("babylon-private");
    expect(serialized).not.toContain("havok-private");
    expect(serialized).not.toContain("private provider suggestion");
  });

  it("projects failed features as errors without resource or private diagnostic fields", () => {
    const registry = new FeatureRegistry();
    const feature = defineWorldFeature<{ requiredValue: string }, void>({
      type: "test.failed-inspection",
      version: 1,
      schema: { requiredValue: "string" },
      build() {},
    });
    const inspection = registry.instantiate(feature, {
      id: "broken-feature",
      params: {} as { requiredValue: string },
    });

    const projected = toPlaygroundFeatureInspection(registry, inspection);

    expect(projected.status).toBe("error");
    expect(projected.resources).toEqual([]);
    expect(projected.diagnostics).toEqual([
      {
        severity: "error",
        code: "FEATURE_PARAMETER_REQUIRED",
        message: 'Required feature parameter "requiredValue" is missing.',
      },
    ]);
    expect(projected.diagnostics[0]).not.toHaveProperty("featureId");
    expect(projected.diagnostics[0]).not.toHaveProperty("suggestions");
  });

  it("sorts feature inspections by stable feature id instead of registry insertion order", () => {
    const registry = new FeatureRegistry();
    const feature = defineWorldFeature<Record<string, never>, void>({
      type: "test.sorted-inspection",
      version: 1,
      schema: {},
      build() {},
    });
    registry.instantiate(feature, { id: "z-last", params: {} });
    registry.instantiate(feature, { id: "a-first", params: {} });

    expect(inspectPlaygroundFeatures(registry).map(({ id }) => id)).toEqual([
      "a-first",
      "z-last",
    ]);
  });
});
