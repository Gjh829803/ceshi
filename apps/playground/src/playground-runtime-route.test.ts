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
    expect(resolvePlaygroundRuntimeRoute(
      search,
      ARTIFACT_SCENE_CATALOG,
      "curated-host",
    )).toEqual(
      expected,
    );
  });

  it("fails closed for the removed authoring route", () => {
    expect(resolvePlaygroundRuntimeRoute(
      "?authoring=1",
      ARTIFACT_SCENE_CATALOG,
      "curated-host",
    )).toEqual({
      mode: "unknown",
      diagnostic: {
        severity: "error",
        code: "PLAYGROUND_RUNTIME_ROUTE_REMOVED",
        message: "The authoring route was removed; use the unified Viewer URL.",
      },
    });
  });

  it("accepts only the Studio world identity injected by the Host document", () => {
    expect(resolvePlaygroundRuntimeRoute(
      "",
      ARTIFACT_SCENE_CATALOG,
      "curated-host",
      "studio-world",
    )).toEqual({ mode: "viewer", studioWorldId: "studio-world" });
  });

  it.each([
    ["?world=studio-world", "curated-host"],
    ["?world=studio-world", "fixed-host"],
    ["?world=other-world", "fixed-host"],
  ] as const)("rejects the removed Browser world selector %s for %s", (
    search,
    viewerSourceAuthority,
  ) => {
    expect(resolvePlaygroundRuntimeRoute(
      search,
      ARTIFACT_SCENE_CATALOG,
      viewerSourceAuthority,
    )).toEqual({
      mode: "unknown",
      diagnostic: {
        severity: "error",
        code: "PLAYGROUND_RUNTIME_ROUTE_REMOVED",
        message: "The Browser world selector was removed; Studio binds the Viewer source in the Host document.",
      },
    });
  });

  it("fails closed when curated and Host-bound Studio identities conflict", () => {
    expect(resolvePlaygroundRuntimeRoute(
      "?scene=feel-flat",
      ARTIFACT_SCENE_CATALOG,
      "curated-host",
      "studio-world",
    )).toEqual({
      mode: "unknown",
      diagnostic: {
        severity: "error",
        code: "PLAYGROUND_RUNTIME_ROUTE_CONFLICT",
        message: "Curated and Studio Viewer sources cannot be selected together.",
      },
    });
  });

  it.each([
    ["?artifact=1&scene=canyon", "fixed-host"],
    ["?artifact=1&captureArtifacts=1&scene=canyon", "fixed-host"],
  ] as const)(
    "fails closed when %s can replace a %s Viewer source",
    (search, viewerSourceAuthority) => {
      expect(resolvePlaygroundRuntimeRoute(
        search,
        ARTIFACT_SCENE_CATALOG,
        viewerSourceAuthority,
      )).toEqual({
        mode: "unknown",
        diagnostic: {
          severity: "error",
          code: "PLAYGROUND_RUNTIME_ROUTE_CONFLICT",
          message: "Artifact mode cannot replace a Host-owned Viewer source.",
        },
      });
    },
  );

  it("fails closed when artifact capture is requested outside artifact-only mode", () => {
    expect(resolvePlaygroundRuntimeRoute(
      "?scene=canyon&captureArtifacts=1",
      ARTIFACT_SCENE_CATALOG,
      "curated-host",
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
        "curated-host",
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
    for (const search of ["", "?scene=feel-flat"]) {
      const route = resolvePlaygroundRuntimeRoute(
        search,
        ARTIFACT_SCENE_CATALOG,
        "curated-host",
      );
      expect(JSON.stringify(route)).not.toContain("authoring");
      expect(JSON.stringify(route)).not.toContain("catalog-gameplay");
    }
  });
});
