import { describe, expect, it } from "vitest";

import { parseSceneCatalogV1, parseViewerBootstrapV1 } from "./index.js";

const G_BOT_DEFINITION_REF =
  "worldkit://subject-definition/humanoid.g-bot@2" as const;

function validCatalog(): unknown {
  return {
    schemaVersion: 1,
    kind: "scene-catalog",
    id: "worldkit.dev-scenes",
    defaultSceneId: "feel-flat",
    entries: [
      {
        id: "feel-flat",
        title: "Flat Feel Lab",
        purpose: "feel",
        source: {
          kind: "canonical-authoring",
          authoringSpecPath: "presets/feel-flat/world.json",
        },
        defaultSubjectDefinitionRef: G_BOT_DEFINITION_REF,
      },
      {
        id: "action-lab",
        title: "Action Lab",
        purpose: "action",
        source: {
          kind: "canonical-authoring",
          authoringSpecPath: "presets/action-lab/world.json",
        },
        defaultSubjectDefinitionRef: G_BOT_DEFINITION_REF,
      },
    ],
  };
}

describe("Scene Catalog V1", () => {
  it("projects and deeply freezes the exact current catalog", () => {
    const source = validCatalog();
    const catalog = parseSceneCatalogV1(source);

    expect(catalog).toEqual(source);
    expect(Object.isFrozen(catalog)).toBe(true);
    expect(Object.isFrozen(catalog.entries)).toBe(true);
    expect(Object.isFrozen(catalog.entries[0])).toBe(true);
    expect(Object.isFrozen(catalog.entries[0]?.source)).toBe(true);
  });

  it.each([
    ["duplicate scene ids", (catalog: any) => catalog.entries.push(catalog.entries[0])],
    ["missing default", (catalog: any) => catalog.defaultSceneId = "missing"],
    ["inherited id", (catalog: any) => {
      catalog.entries[0] = Object.assign(Object.create({ id: "feel-flat" }), {
        title: "Flat Feel Lab",
        purpose: "feel",
        source: catalog.entries[0].source,
        defaultSubjectDefinitionRef: G_BOT_DEFINITION_REF,
      });
    }],
    ["absolute path", (catalog: any) => catalog.entries[0].source.authoringSpecPath = "/tmp/world.json"],
    ["traversal path", (catalog: any) => catalog.entries[0].source.authoringSpecPath = "../world.json"],
    ["unknown source", (catalog: any) => catalog.entries[0].source.kind = "outdoor-scene-definition"],
    ["raw native module", (catalog: any) => catalog.entries[0].source = {
      kind: "babylon-native-package",
      worldPackageRef: "worldkit://world-package/sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      modulePath: "scene.ts",
    }],
    ["extra catalog key", (catalog: any) => catalog.compatibilityMode = true],
  ])("rejects %s without a compatibility path", (_name, mutate) => {
    const catalog: any = validCatalog();
    mutate(catalog);
    expect(() => parseSceneCatalogV1(catalog)).toThrowError();
  });
});

describe("Viewer Bootstrap V1", () => {
  function validBootstrap(): any {
    return {
      schemaVersion: 1,
      kind: "scene-viewer-bootstrap",
      selectedSceneId: "feel-flat",
      entries: [{
        id: "feel-flat",
        title: "Flat Feel Lab",
        purpose: "feel",
        sourceKind: "canonical-authoring",
        defaultSubjectDefinitionRef: G_BOT_DEFINITION_REF,
      }],
      sceneSource: {
        kind: "canonical-authoring",
        authoringSpec: {
          schemaVersion: 4,
          kind: "worldkit-authoring-spec",
          id: "feel-flat",
        },
      },
    };
  }

  it("admits one selected Canonical source without exposing a path", () => {
    const bootstrap = parseViewerBootstrapV1(validBootstrap());

    expect(bootstrap.selectedSceneId).toBe("feel-flat");
    expect(JSON.stringify(bootstrap)).not.toContain("authoringSpecPath");
    expect(Object.isFrozen(bootstrap.sceneSource)).toBe(true);
  });

  it.each([
    ["selected id not listed", (bootstrap: any) => bootstrap.selectedSceneId = "missing"],
    ["source id mismatch", (bootstrap: any) => bootstrap.sceneSource.authoringSpec.id = "other"],
    ["legacy route mode", (bootstrap: any) => bootstrap.mode = "authoring"],
    ["raw native code", (bootstrap: any) => bootstrap.sceneSource = {
      kind: "babylon-native-package",
      worldPackageRef: "worldkit://world-package/sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      modulePath: "scene.ts",
    }],
  ])("rejects %s", (_name, mutate) => {
    const bootstrap = validBootstrap();
    mutate(bootstrap);
    expect(() => parseViewerBootstrapV1(bootstrap)).toThrowError();
  });
});
