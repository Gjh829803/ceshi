import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { promoteScenePresetV1 } from "./promote-scene-preset.js";

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "scene-preset-promotion-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })));
});

async function copyValidSource(root: string, sceneId = "feel-flat"): Promise<string> {
  const source = JSON.parse(await readFile(
    path.resolve("scenes/presets/feel-flat/world.json"),
    "utf8",
  ));
  source.id = sceneId;
  const sourcePath = path.join(root, "candidate.json");
  await writeFile(sourcePath, `${JSON.stringify(source, null, 2)}\n`);
  return sourcePath;
}

describe("promoteScenePresetV1", () => {
  it("publishes durable preset bytes before adding catalog metadata", async () => {
    const root = await temporaryRoot();
    const sourcePath = await copyValidSource(root);
    const catalogPath = path.join(root, "scenes", "catalog.json");

    const result = await promoteScenePresetV1({
      sceneId: "feel-flat",
      title: "空旷手感测试",
      purpose: "feel",
      sourcePath,
      catalogPath,
    });

    const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
    expect(catalog.entries).toEqual([{
      id: "feel-flat",
      title: "空旷手感测试",
      purpose: "feel",
      source: {
        kind: "canonical-authoring",
        authoringSpecPath: "presets/feel-flat/world.json",
      },
    }]);
    expect(JSON.parse(await readFile(result.presetPath, "utf8")).id)
      .toBe("feel-flat");
  });

  it("rejects malformed AuthoringSpec bytes", async () => {
    const root = await temporaryRoot();
    const sourcePath = path.join(root, "candidate.json");
    await writeFile(sourcePath, "{}\n");

    await expect(promoteScenePresetV1({
      sceneId: "feel-flat",
      title: "Flat",
      purpose: "feel",
      sourcePath,
      catalogPath: path.join(root, "scenes", "catalog.json"),
    })).rejects.toThrow("SCENE_PRESET_AUTHORING_INVALID");
  });

  it("rejects scene ID mismatch and a non-G-Bot controlled Subject", async () => {
    const root = await temporaryRoot();
    const mismatchPath = await copyValidSource(root, "other-scene");
    await expect(promoteScenePresetV1({
      sceneId: "feel-flat",
      title: "Flat",
      purpose: "feel",
      sourcePath: mismatchPath,
      catalogPath: path.join(root, "scenes", "catalog.json"),
    })).rejects.toThrow("SCENE_PRESET_ID_MISMATCH");

    const source = JSON.parse(await readFile(mismatchPath, "utf8"));
    source.id = "feel-flat";
    source.nodes.find((node: { id: string }) => node.id === "player")
      .subjectDefinitionRef =
        "worldkit://subject-definition/humanoid.third-person@1";
    await writeFile(mismatchPath, `${JSON.stringify(source, null, 2)}\n`);
    await expect(promoteScenePresetV1({
      sceneId: "feel-flat",
      title: "Flat",
      purpose: "feel",
      sourcePath: mismatchPath,
      catalogPath: path.join(root, "scenes", "catalog.json"),
    })).rejects.toThrow("SCENE_PRESET_CONTROLLED_SUBJECT_NOT_G_BOT");
  });

  it("rejects symlink inputs and destination overwrite", async () => {
    const root = await temporaryRoot();
    const sourcePath = await copyValidSource(root);
    const linkPath = path.join(root, "candidate-link.json");
    await symlink(sourcePath, linkPath);
    const catalogPath = path.join(root, "scenes", "catalog.json");

    await expect(promoteScenePresetV1({
      sceneId: "feel-flat",
      title: "Flat",
      purpose: "feel",
      sourcePath: linkPath,
      catalogPath,
    })).rejects.toThrow("SCENE_PRESET_SOURCE_NOT_REGULAR");

    await mkdir(path.join(root, "scenes", "presets", "feel-flat"), {
      recursive: true,
    });
    await writeFile(
      path.join(root, "scenes", "presets", "feel-flat", "world.json"),
      "occupied\n",
    );
    await expect(promoteScenePresetV1({
      sceneId: "feel-flat",
      title: "Flat",
      purpose: "feel",
      sourcePath,
      catalogPath,
    })).rejects.toThrow("SCENE_PRESET_DESTINATION_EXISTS");
  });
});
