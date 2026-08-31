import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseSceneCatalogV1 } from "@whitebox-world/scene-catalog";

import {
  createCuratedViewerBootstrapV1,
  createFixedViewerBootstrapV1,
  createStudioViewerBootstrapV1,
  loadViewerBootstrapV1,
  parseViewerBootstrapV1,
  viewerSceneSelectionUrlV1,
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

  it("projects a Studio transport source into the same fixed Viewer bootstrap", async () => {
    const authoringSpec = JSON.parse(await readFile(
      path.resolve("scenes/presets/action-lab/world.json"),
      "utf8",
    ));
    const bootstrap = createStudioViewerBootstrapV1({
      worldId: "studio-world",
      sceneId: "action-lab",
      authoringSpec,
    });

    expect(bootstrap.selection).toEqual({
      kind: "fixed-host",
      selectedSceneId: "action-lab",
    });
    expect(() => createStudioViewerBootstrapV1({
      worldId: "studio-world",
      sceneId: "another-scene",
      authoringSpec,
    })).toThrow("VIEWER_STUDIO_SOURCE_IDENTITY_MISMATCH");
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

  it("loads and validates the Host bootstrap before exposing it to the Viewer", async () => {
    const sourceText = await readFile(
      path.resolve("scenes/presets/feel-flat/world.json"),
      "utf8",
    );
    const source = createFixedViewerBootstrapV1(sourceText);
    const loaded = await loadViewerBootstrapV1(async () => new Response(
      JSON.stringify(source),
      { status: 200, headers: { "content-type": "application/json" } },
    ));

    expect(loaded.selection.selectedSceneId).toBe("feel-flat");
    expect(Object.isFrozen(loaded)).toBe(true);
    await expect(loadViewerBootstrapV1(async () => new Response("missing", {
      status: 404,
    }))).rejects.toThrow("VIEWER_BOOTSTRAP_HTTP_404");
  });

  it("builds selector navigation only for an advertised curated scene", async () => {
    const bootstrap = await createCuratedViewerBootstrapV1(
      await catalogAndSources(),
    );
    if (bootstrap.selection.kind !== "curated-preset") {
      throw new Error("expected curated selection");
    }
    const entries = bootstrap.selection.entries;
    expect(viewerSceneSelectionUrlV1(
      "http://127.0.0.1:5173/?scene=feel-flat&subjectDefinitionRef=legacy",
      "action-lab",
      entries,
    )).toBe("http://127.0.0.1:5173/?scene=action-lab");
    expect(() => viewerSceneSelectionUrlV1(
      "http://127.0.0.1:5173/",
      "missing",
      entries,
    )).toThrow("VIEWER_PRESET_NOT_FOUND");
  });
});
