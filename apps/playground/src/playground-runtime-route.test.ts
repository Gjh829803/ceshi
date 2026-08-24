import { describe, expect, it } from "vitest";

import { resolvePlaygroundRuntimeRoute } from "./playground-runtime-route.js";

const SCENE_CATALOG = Object.freeze({
  grassland: Object.freeze({}),
  canyon: Object.freeze({}),
  "sunlit-flower-bay": Object.freeze({}),
});

describe("resolvePlaygroundRuntimeRoute", () => {
  it.each([
    ["", { mode: "catalog-gameplay", sceneCatalogId: "grassland" }],
    ["?scene=canyon", { mode: "catalog-gameplay", sceneCatalogId: "canyon" }],
    ["?authoring=1", { mode: "authoring" }],
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
    expect(resolvePlaygroundRuntimeRoute(search, SCENE_CATALOG)).toEqual(expected);
  });

  it("fails closed when authoring and artifact ownership conflict", () => {
    expect(resolvePlaygroundRuntimeRoute("?authoring=1&artifact=1", SCENE_CATALOG))
      .toEqual({
        mode: "unknown",
        diagnostic: {
          severity: "error",
          code: "PLAYGROUND_RUNTIME_ROUTE_CONFLICT",
          message: "Authoring and artifact-only routes cannot be active together.",
        },
      });
  });

  it("fails closed when artifact capture is requested outside artifact-only mode", () => {
    expect(resolvePlaygroundRuntimeRoute("?scene=canyon&captureArtifacts=1", SCENE_CATALOG))
      .toEqual({
        mode: "unknown",
        diagnostic: {
          severity: "error",
          code: "PLAYGROUND_RUNTIME_ROUTE_CONFLICT",
          message: "Artifact capture requires artifact-only mode (?artifact=1).",
        },
      });
  });

  it.each(["missing", "__proto__"])(
    "rejects the unknown or inherited scene catalog id %s",
    (sceneCatalogId) => {
      expect(resolvePlaygroundRuntimeRoute(
        `?scene=${encodeURIComponent(sceneCatalogId)}`,
        SCENE_CATALOG,
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

  it("uses the default scene for an empty scene parameter and ignores non-canonical flags", () => {
    expect(resolvePlaygroundRuntimeRoute(
      "?scene=%20%20&authoring=true&artifact=yes&captureArtifacts=true",
      SCENE_CATALOG,
    )).toEqual({
      mode: "catalog-gameplay",
      sceneCatalogId: "grassland",
    });
  });
});
