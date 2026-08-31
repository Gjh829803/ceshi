import { describe, expect, it } from "vitest";

import { resolvePlaygroundRuntimeRoute } from "./playground-runtime-route.js";

const ARTIFACT_SCENE_CATALOG = Object.freeze({
  grassland: Object.freeze({}),
  canyon: Object.freeze({}),
  "sunlit-flower-bay": Object.freeze({}),
});

describe("resolvePlaygroundRuntimeRoute", () => {
  it.each([
    ["", { mode: "viewer" }],
    ["?scene=feel-flat", { mode: "viewer" }],
    ["?world=studio-world", { mode: "viewer", studioWorldId: "studio-world" }],
    [
      "?scene=sunlit-flower-bay&artifact=1",
      {
        mode: "artifact-only",
        sceneCatalogId: "sunlit-flower-bay",
        captureArtifactsEnabled: false,
      },
    ],
    [
      "?scene=canyon&artifact=1&captureArtifacts=1",
      {
        mode: "artifact-only",
        sceneCatalogId: "canyon",
        captureArtifactsEnabled: true,
      },
    ],
  ] as const)("classifies %s without exposing a renderer or RuntimeHost", (search, expected) => {
    expect(resolvePlaygroundRuntimeRoute(search, ARTIFACT_SCENE_CATALOG)).toEqual(
      expected,
    );
  });

  it("fails closed for the removed authoring route", () => {
    expect(resolvePlaygroundRuntimeRoute(
      "?authoring=1",
      ARTIFACT_SCENE_CATALOG,
    )).toEqual({
      mode: "unknown",
      diagnostic: {
        severity: "error",
        code: "PLAYGROUND_RUNTIME_ROUTE_REMOVED",
        message: "The authoring route was removed; use the unified Viewer URL.",
      },
    });
  });

  it("fails closed when curated and Studio source identities conflict", () => {
    expect(resolvePlaygroundRuntimeRoute(
      "?scene=feel-flat&world=studio-world",
      ARTIFACT_SCENE_CATALOG,
    )).toEqual({
      mode: "unknown",
      diagnostic: {
        severity: "error",
        code: "PLAYGROUND_RUNTIME_ROUTE_CONFLICT",
        message: "Curated and Studio Viewer sources cannot be selected together.",
      },
    });
  });

  it("fails closed when artifact capture is requested outside artifact-only mode", () => {
    expect(resolvePlaygroundRuntimeRoute(
      "?scene=canyon&captureArtifacts=1",
      ARTIFACT_SCENE_CATALOG,
    )).toEqual({
      mode: "unknown",
      diagnostic: {
        severity: "error",
        code: "PLAYGROUND_RUNTIME_ROUTE_CONFLICT",
        message: "Artifact capture requires artifact-only mode (?artifact=1).",
      },
    });
  });

  it.each(["missing", "__proto__"])(
    "rejects the unknown or inherited artifact scene id %s",
    (sceneCatalogId) => {
      expect(resolvePlaygroundRuntimeRoute(
        `?scene=${encodeURIComponent(sceneCatalogId)}&artifact=1`,
        ARTIFACT_SCENE_CATALOG,
      )).toEqual({
        mode: "unknown",
        diagnostic: {
          severity: "error",
          code: "PLAYGROUND_SCENE_NOT_FOUND",
          message: `Scene '${sceneCatalogId}' is not registered.`,
        },
      });
    },
  );

  it("never returns the deleted public route modes", () => {
    for (const search of ["", "?scene=feel-flat", "?world=studio-world"]) {
      const route = resolvePlaygroundRuntimeRoute(search, ARTIFACT_SCENE_CATALOG);
      expect(JSON.stringify(route)).not.toContain("authoring");
      expect(JSON.stringify(route)).not.toContain("catalog-gameplay");
    }
  });
});
