import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { stringifyCanonicalJson } from "@whitebox-world/protocol";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import { runBuilderSelfCheck } from "../agents/agent-builder-self-check";
import { finalizeSceneTerrain } from "./finalize-scene-terrain";

const SCENE_ID = "green-sahara-caravan";

function hash(value: string | Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

async function signedIntentPng(): Promise<Buffer> {
  const pixels = new Uint8Array(16 * 16 * 3);
  for (let index = 0; index < 16 * 16; index += 1) {
    const column = index % 16;
    const color = column < 8 ? [104, 112, 144] : [152, 120, 104];
    pixels[index * 3] = color[0]!;
    pixels[index * 3 + 1] = color[1]!;
    pixels[index * 3 + 2] = color[2]!;
  }
  return sharp(pixels, { raw: { width: 16, height: 16, channels: 3 } })
    .png()
    .toBuffer();
}

describe("scene terrain finalizer", { timeout: 30_000 }, () => {
  let root: string | undefined;

  afterEach(async () => {
    if (root !== undefined) await rm(root, { recursive: true, force: true });
  });

  async function prepare() {
    root = await mkdtemp(path.join(tmpdir(), "worldkit-terrain-finalizer-"));
    const sourceRoot = path.resolve("artifacts/scenes", SCENE_ID);
    const briefPath = path.join(root, "scene-brief.md");
    const builderAuthoringPath = path.join(root, "authoring.builder.json");
    const mapDraftPath = path.join(root, "implementation-map.draft.json");
    const builderReceiptPath = path.join(root, "builder-self-check.json");
    const plannerReceiptPath = path.join(root, "planner-self-check.json");
    const terrainPromptPath = path.join(root, "terrain-height-intent-prompt.md");
    const terrainIntentPath = path.join(root, "terrain-height-intent.png");
    const outputRoot = path.join(root, "output");
    await mkdir(outputRoot, { recursive: true });
    const [briefSource, originalAuthoringSource, mapDraftSource, terrainBytes] =
      await Promise.all([
        readFile(path.join(sourceRoot, "scene-brief.md"), "utf8"),
        readFile(path.join(sourceRoot, "authoring.json"), "utf8"),
        readFile(path.join(sourceRoot, "implementation-map.draft.json"), "utf8"),
        signedIntentPng(),
      ]);
    const builderAuthoring = JSON.parse(originalAuthoringSource);
    const mapDraft = JSON.parse(mapDraftSource);
    // Copied WRC receipts still use a historical `-authoring` suffix. The
    // current Host contract requires AuthoringSpec id, map sceneId, and map
    // authoringSpecId to equal the Host scene id on this working copy.
    builderAuthoring.id = SCENE_ID;
    mapDraft.authoringSpecId = SCENE_ID;
    for (const definition of builderAuthoring.resources.subjectDefinitions) {
      definition.allowedOverridePaths = [];
    }
    const terrain = builderAuthoring.nodes.find(
      (node: { kind: string }) => node.kind === "terrain",
    );
    terrain.components.terrain.grid.resolutionCellsXZ = [33, 33];
    delete terrain.components.terrain.grid.heightSamplesMeters;
    const authoringSource = `${stringifyCanonicalJson(builderAuthoring)}\n`;
    const mapDraftCanonical = `${stringifyCanonicalJson(mapDraft)}\n`;
    const terrainPrompt = "# Terrain Height Intent\n\nEncoding profile: signed-diverging-blue-gray-orange@1.\n";
    await Promise.all([
      writeFile(briefPath, briefSource),
      writeFile(builderAuthoringPath, authoringSource),
      writeFile(mapDraftPath, mapDraftCanonical),
      writeFile(terrainPromptPath, terrainPrompt),
      writeFile(terrainIntentPath, terrainBytes),
    ]);
    const builder = await runBuilderSelfCheck({
      sceneId: SCENE_ID,
      briefPath,
      worldPath: builderAuthoringPath,
      mapDraftPath,
      reportPath: builderReceiptPath,
    });
    expect(builder.status, JSON.stringify(builder.diagnostics)).toBe("passed");
    await writeFile(plannerReceiptPath, `${stringifyCanonicalJson({
      kind: "worldkit-planner-self-check",
      schemaVersion: 1,
      validatorVersion: "worldkit-planner-self-check-v4",
      sceneId: SCENE_ID,
      sceneSourceKind: "canonical",
      status: "passed",
      inputs: {
        sceneBriefHash: hash(briefSource),
        worldPlanHash: `sha256:${"1".repeat(64)}`,
        entryWhiteboxTargetHash: `sha256:${"2".repeat(64)}`,
        terrainHeightIntentPromptHash: hash(terrainPrompt),
        terrainHeightIntentPngHash: hash(terrainBytes),
      },
      diagnostics: [],
    })}\n`);
    return {
      briefPath,
      builderAuthoringPath,
      mapDraftPath,
      builderReceiptPath,
      plannerReceiptPath,
      terrainPromptPath,
      terrainIntentPath,
      outputAuthoringPath: path.join(outputRoot, "authoring.json"),
      outputReportPath: path.join(outputRoot, "terrain-height-intent-report.json"),
      outputManifestPath: path.join(outputRoot, "terrain-compilation-manifest.json"),
      outputSelfCheckPath: path.join(outputRoot, "final-authoring-self-check.json"),
      failureReportPath: path.join(outputRoot, "terrain-height-intent-report.failed.json"),
    };
  }

  it("binds trusted receipts, compiles terrain, revalidates, and publishes one coherent set", async () => {
    const paths = await prepare();
    const result = await finalizeSceneTerrain({
      sceneId: SCENE_ID,
      runId: "test-run",
      ...paths,
    });

    expect(result.status).toBe("passed");
    const [authoring, report, manifest, receipt] = await Promise.all([
      readFile(paths.outputAuthoringPath, "utf8").then(JSON.parse),
      readFile(paths.outputReportPath, "utf8").then(JSON.parse),
      readFile(paths.outputManifestPath, "utf8").then(JSON.parse),
      readFile(paths.outputSelfCheckPath, "utf8").then(JSON.parse),
    ]);
    const terrain = authoring.nodes.find((node: { kind: string }) => node.kind === "terrain");
    expect(terrain.components.terrain.grid.heightSamplesMeters).toHaveLength(33 * 33);
    expect(report).toMatchObject({ status: "passed", schemaVersion: 1 });
    expect(receipt).toMatchObject({ status: "passed", sceneId: SCENE_ID });
    expect(manifest).toMatchObject({
      kind: "worldkit-terrain-compilation-manifest",
      schemaVersion: 1,
      sceneId: SCENE_ID,
      runId: "test-run",
      compiler: {
        compilerVersion: "terrain-height-intent-compiler@2",
        normalizationProfileId:
          "signed-diverging-blue-gray-orange-median-datum@1",
      },
    });
  });

  it("rejects a stale Planner receipt without replacing existing final artifacts", async () => {
    const paths = await prepare();
    await writeFile(paths.outputAuthoringPath, "old-authoring");
    const receipt = JSON.parse(await readFile(paths.plannerReceiptPath, "utf8"));
    receipt.inputs.terrainHeightIntentPngHash = `sha256:${"f".repeat(64)}`;
    await writeFile(paths.plannerReceiptPath, `${JSON.stringify(receipt)}\n`);

    await expect(finalizeSceneTerrain({
      sceneId: SCENE_ID,
      runId: "test-run",
      ...paths,
    })).rejects.toThrow("PLANNER_RECEIPT_TERRAIN_INTENT_HASH_MISMATCH");
    expect(await readFile(paths.outputAuthoringPath, "utf8")).toBe("old-authoring");
  });
});
