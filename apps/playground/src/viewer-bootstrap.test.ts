import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseSceneCatalogV1 } from "@whitebox-world/scene-catalog";

import {
  createCuratedViewerBootstrapV1,
  createFixedViewerBootstrapV1,
  parseViewerBootstrapV1,
} from "./viewer-bootstrap.js";

async function catalogAndSources() {
  const catalogPath = path.resolve("scenes/catalog.json");
  const catalog = parseSceneCatalogV1(JSON.parse(await readFile(catalogPath, "utf8")));
  return {
    catalog,
    loadAuthoringSpec: (relativePath: string) =>
      readFile(path.join(path.dirname(catalogPath), relativePath), "utf8"),
  };
}

describe("Viewer bootstrap V1", () => {
  it("selects the default curated G Bot preset without exposing source paths", async () => {
    const input = await catalogAndSources();
    const bootstrap = await createCuratedViewerBootstrapV1(input);

    expect(bootstrap.selection).toMatchObject({
      kind: "curated-preset",
      selectedSceneId: "feel-flat",
    });
    expect(bootstrap.authoringSpec.id).toBe("feel-flat");
    expect(JSON.stringify(bootstrap)).not.toContain("authoringSpecPath");
    expect(Object.isFrozen(bootstrap.authoringSpec)).toBe(true);
  });

  it("rejects unknown presets and curated sources whose controlled Subject is not G Bot", async () => {
    const input = await catalogAndSources();
    await expect(createCuratedViewerBootstrapV1({
      ...input,
      selectedSceneId: "missing",
    })).rejects.toThrow("VIEWER_PRESET_NOT_FOUND");

    await expect(createCuratedViewerBootstrapV1({
      ...input,
      loadAuthoringSpec: async (relativePath) => {
        const source = JSON.parse(await input.loadAuthoringSpec(relativePath));
        source.nodes.find((node: { id: string }) => node.id === "player")
          .subjectDefinitionRef =
            "worldkit://subject-definition/humanoid.third-person@1";
        return JSON.stringify(source);
      },
    })).rejects.toThrow("VIEWER_PRESET_CONTROLLED_SUBJECT_NOT_G_BOT");
  });

  it("loads a Host-fixed Canonical source without allowing catalog substitution", async () => {
    const sourceText = await readFile(
      path.resolve("scenes/presets/action-lab/world.json"),
      "utf8",
    );
    const bootstrap = createFixedViewerBootstrapV1(sourceText);

    expect(bootstrap.selection).toEqual({
      kind: "fixed-host",
      selectedSceneId: "action-lab",
    });
    expect("entries" in bootstrap.selection).toBe(false);
  });

  it("rejects malformed app bootstrap payloads through the authoritative V4 parser", () => {
    expect(() => parseViewerBootstrapV1({
      kind: "scene-viewer-bootstrap",
      schemaVersion: 1,
      selection: { kind: "fixed-host", selectedSceneId: "broken" },
      authoringSpec: {
        kind: "worldkit-authoring-spec",
        schemaVersion: 4,
        id: "broken",
      },
    })).toThrow("VIEWER_BOOTSTRAP_AUTHORING_INVALID");
  });
});
