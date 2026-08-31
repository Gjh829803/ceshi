import { describe, expect, it } from "vitest";

import { parseSceneCatalogV1 } from "./index.js";

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
      },
      {
        id: "action-lab",
        title: "Action Lab",
        purpose: "action",
        source: {
          kind: "canonical-authoring",
          authoringSpecPath: "presets/action-lab/world.json",
        },
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
      });
    }],
    ["absolute path", (catalog: any) => catalog.entries[0].source.authoringSpecPath = "/tmp/world.json"],
    ["traversal path", (catalog: any) => catalog.entries[0].source.authoringSpecPath = "../world.json"],
    ["unknown source", (catalog: any) => catalog.entries[0].source.kind = "outdoor-scene-definition"],
    ["native source", (catalog: any) => catalog.entries[0].source = {
      kind: "babylon-native-package",
      worldPackageRef: "worldkit://world-package/sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    }],
    ["duplicate subject metadata", (catalog: any) => {
      catalog.entries[0].defaultSubjectDefinitionRef =
        "worldkit://subject-definition/humanoid.g-bot@2";
    }],
    ["extra catalog key", (catalog: any) => catalog.compatibilityMode = true],
  ])("rejects %s without a compatibility path", (_name, mutate) => {
    const catalog: any = validCatalog();
    mutate(catalog);
    expect(() => parseSceneCatalogV1(catalog)).toThrowError();
  });
});
