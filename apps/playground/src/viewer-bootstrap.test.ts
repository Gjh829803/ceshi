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

function collectSemanticClassIds(value: unknown, ids = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const child of value) collectSemanticClassIds(child, ids);
    return ids;
  }
  if (typeof value !== "object" || value === null) return ids;
  for (const [key, child] of Object.entries(value)) {
    if (key === "classId" && typeof child === "string") ids.add(child);
    else collectSemanticClassIds(child, ids);
  }
  return ids;
}

describe("Viewer bootstrap V1", () => {
  it("selects the default curated G Bot preset without exposing source paths", async () => {
    const input = await catalogAndSources();
    const bootstrap = await createCuratedViewerBootstrapV1(input);

    expect(bootstrap.selection).toMatchObject({
      kind: "curated-preset",
      selectedSceneId: "whitebox-3c-test-course",
    });
    expect(bootstrap.authoringSpec.id).toBe("whitebox-3c-test-course");
    expect(JSON.stringify(bootstrap)).not.toContain("authoringSpecPath");
    expect(Object.isFrozen(bootstrap.authoringSpec)).toBe(true);
  });

  it("exposes one default Whitebox 3C course with every required test station", async () => {
    const input = await catalogAndSources();
    const bootstrap = await createCuratedViewerBootstrapV1({
      ...input,
      selectedSceneId: "whitebox-3c-test-course",
    });
    if (bootstrap.selection.kind !== "curated-preset") {
      throw new Error("expected curated selection");
    }

    expect(input.catalog.defaultSceneId).toBe("whitebox-3c-test-course");
    expect(bootstrap.selection.entries).toContainEqual({
      id: "whitebox-3c-test-course",
      title: "Whitebox 3C 测试场",
      purpose: "traversal",
    });
    expect(bootstrap.authoringSpec.id).toBe("whitebox-3c-test-course");
    const controlled = bootstrap.authoringSpec.nodes.find(
      (node) => node.id === bootstrap.authoringSpec.startup.controlledEntityId,
    );
    expect(controlled).toMatchObject({
      kind: "subject",
      subjectDefinitionRef: "worldkit://subject-definition/humanoid.g-bot@2",
    });
    const camera = bootstrap.authoringSpec.nodes.find(
      (node) => node.id === bootstrap.authoringSpec.startup.cameraEntityId,
    );
    expect(camera).toMatchObject({
      kind: "camera",
      components: {
        cameraRig: {
          defaultRigRef: "worldkit://camera/third-person.standard@1",
          allowedRigRefs: ["worldkit://camera/third-person.standard@1"],
          manualSwitchAllowed: false,
        },
      },
    });
    const spawn = bootstrap.authoringSpec.nodes.find(
      (node) => node.id === bootstrap.authoringSpec.startup.spawnAnchorEntityId,
    );
    expect(spawn).toMatchObject({
      kind: "anchor",
      placement: {
        kind: "fixed",
        transform: { positionMetersXYZ: [expect.any(Number), 0, expect.any(Number)] },
      },
    });
    const requiredStationClassIds = [
      "3c.flat-calibration",
      "3c.slope",
      "3c.stairs",
      "3c.narrow-gate",
      "3c.ledge",
      "3c.obstacle.small",
      "3c.obstacle.large",
      "3c.narrow-corridor",
      "3c.high-speed-turn",
      "3c.camera-occlusion",
      "3c.jump-takeoff",
      "3c.jump-landing",
    ] as const;
    const semanticClassIds = collectSemanticClassIds(bootstrap.authoringSpec);
    for (const classId of requiredStationClassIds) {
      expect(semanticClassIds.has(classId), classId).toBe(true);
    }

    const objectNodes = bootstrap.authoringSpec.nodes.filter(
      (node) => node.kind === "object",
    );
    const placedPrototypeRefs = new Set(
      objectNodes.map((node) => node.prototypeRef),
    );
    for (const classId of requiredStationClassIds.filter(
      (candidate) => candidate !== "3c.flat-calibration",
    )) {
      const matchingPrototypes = bootstrap.authoringSpec.resources.prototypes
        .filter((prototype) => prototype.semantic?.classId === classId);
      expect(matchingPrototypes.length, `${classId} prototype count`).toBeGreaterThan(0);
      expect(
        matchingPrototypes.some((prototype) =>
          placedPrototypeRefs.has(
            `package://prototype/${prototype.id}@${prototype.version}`,
          )
        ),
        `${classId} must be instantiated in the course`,
      ).toBe(true);
    }

    const fixedPosition = (entityId: string): readonly [number, number, number] => {
      const node = objectNodes.find((candidate) => candidate.id === entityId);
      if (node?.placement.kind !== "fixed") {
        throw new Error(`Expected fixed course object '${entityId}'.`);
      }
      return node.placement.transform.positionMetersXYZ;
    };
    const prototype = (prototypeId: string) => {
      const found = bootstrap.authoringSpec.resources.prototypes.find(
        (candidate) => candidate.id === prototypeId,
      );
      if (found === undefined) throw new Error(`Missing prototype '${prototypeId}'.`);
      return found;
    };

    const gateWidthMeters = Math.abs(fixedPosition("gate-east")[0] - fixedPosition("gate-west")[0]);
    const gatePost = prototype("gate-post");
    if (gatePost.kind !== "primitive" || gatePost.primitive !== "box") {
      throw new Error("Expected box gate-post prototype.");
    }
    expect(gateWidthMeters - gatePost.sizeMetersXYZ[0]).toBeCloseTo(1.6, 6);

    const stairTread = prototype("stair-tread");
    if (stairTread.kind !== "primitive" || stairTread.primitive !== "box") {
      throw new Error("Expected box stair-tread prototype.");
    }
    const stairTopHeights = objectNodes
      .filter((node) => node.id.startsWith("stairs-"))
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((node) => {
        if (node.placement.kind !== "fixed") throw new Error("Expected fixed stair.");
        const scaleY = node.placement.transform.scaleXYZ?.[1] ?? 1;
        return node.placement.transform.positionMetersXYZ[1] +
          stairTread.sizeMetersXYZ[1] * scaleY / 2;
      });
    stairTopHeights.forEach((heightMeters, index) => {
      expect(heightMeters).toBeCloseTo((index + 1) * 0.2, 6);
    });

    const corridorWall = prototype("corridor-wall");
    if (corridorWall.kind !== "primitive" || corridorWall.primitive !== "box") {
      throw new Error("Expected box corridor-wall prototype.");
    }
    const corridorClearanceMeters =
      Math.abs(fixedPosition("corridor-east")[0] - fixedPosition("corridor-west")[0]) -
      corridorWall.sizeMetersXYZ[0];
    expect(corridorClearanceMeters).toBeCloseTo(1.5, 6);

    const speedTurnPositions = objectNodes
      .filter((node) => node.id.startsWith("speed-turn-"))
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((node) => fixedPosition(node.id));
    expect(speedTurnPositions.map(([x]) => x)).toEqual([19, 29, 19, 29, 19]);
    expect(speedTurnPositions.map(([, , z]) => z)).toEqual([44, 35, 26, 17, 8]);

    expect(
      Math.abs(
        fixedPosition("jump-landing-main")[2] -
        fixedPosition("jump-takeoff-main")[2],
      ),
    ).toBe(9);
    expect(objectNodes.filter((node) => node.id.startsWith("occlusion-pillar-")))
      .toHaveLength(3);
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
