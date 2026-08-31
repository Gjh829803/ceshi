import {
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";

import { parseAuthoringSpecV4 } from "@whitebox-world/authoring";
import { stringifyCanonicalJson } from "@whitebox-world/protocol";
import {
  parseSceneCatalogV1,
  type ScenePurposeV1,
} from "@whitebox-world/scene-catalog";

const G_BOT_DEFINITION_REF =
  "worldkit://subject-definition/humanoid.g-bot@2";

export interface PromoteScenePresetInputV1 {
  readonly sceneId: string;
  readonly title: string;
  readonly purpose: ScenePurposeV1;
  readonly sourcePath: string;
  readonly catalogPath: string;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function writeDurableExclusive(
  filePath: string,
  contents: string,
): Promise<void> {
  const handle = await open(filePath, "wx");
  try {
    await handle.writeFile(contents, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function promoteScenePresetV1(
  input: PromoteScenePresetInputV1,
): Promise<Readonly<{ presetPath: string; catalogPath: string }>> {
  const sourceStat = await lstat(input.sourcePath);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
    throw new Error("SCENE_PRESET_SOURCE_NOT_REGULAR");
  }
  const parsed = parseAuthoringSpecV4(await readFile(input.sourcePath, "utf8"));
  if (!parsed.ok || parsed.value === undefined) {
    throw new Error("SCENE_PRESET_AUTHORING_INVALID");
  }
  const authoringSpec = parsed.value;
  if (authoringSpec.id !== input.sceneId) {
    throw new Error("SCENE_PRESET_ID_MISMATCH");
  }
  const controlledNode = authoringSpec.nodes.find(
    (node) => node.id === authoringSpec.startup.controlledEntityId,
  );
  if (
    controlledNode?.kind !== "subject" ||
    controlledNode.subjectDefinitionRef !== G_BOT_DEFINITION_REF
  ) {
    throw new Error("SCENE_PRESET_CONTROLLED_SUBJECT_NOT_G_BOT");
  }

  const scenesRoot = path.dirname(input.catalogPath);
  const presetRoot = path.join(scenesRoot, "presets");
  const presetPath = path.join(presetRoot, input.sceneId, "world.json");
  if (await pathExists(presetPath)) {
    throw new Error("SCENE_PRESET_DESTINATION_EXISTS");
  }

  const currentCatalog = await pathExists(input.catalogPath)
    ? parseSceneCatalogV1(JSON.parse(await readFile(input.catalogPath, "utf8")))
    : undefined;
  if (currentCatalog?.entries.some((entry) => entry.id === input.sceneId)) {
    throw new Error("SCENE_PRESET_CATALOG_ENTRY_EXISTS");
  }
  const catalog = parseSceneCatalogV1({
    schemaVersion: 1,
    kind: "scene-catalog",
    id: currentCatalog?.id ?? "worldkit.dev-scenes",
    defaultSceneId: currentCatalog?.defaultSceneId ?? input.sceneId,
    entries: [
      ...(currentCatalog?.entries ?? []),
      {
        id: input.sceneId,
        title: input.title,
        purpose: input.purpose,
        source: {
          kind: "canonical-authoring",
          authoringSpecPath: `presets/${input.sceneId}/world.json`,
        },
      },
    ],
  });

  await mkdir(presetRoot, { recursive: true });
  const stagingDirectory = path.join(
    presetRoot,
    `.${input.sceneId}.${process.pid}.${Date.now()}.tmp`,
  );
  const catalogTemporaryPath = `${input.catalogPath}.${process.pid}.tmp`;
  await mkdir(stagingDirectory);
  try {
    await writeDurableExclusive(
      path.join(stagingDirectory, "world.json"),
      `${stringifyCanonicalJson(authoringSpec)}\n`,
    );
    await rename(stagingDirectory, path.dirname(presetPath));
    try {
      await writeDurableExclusive(
        catalogTemporaryPath,
        `${stringifyCanonicalJson(catalog)}\n`,
      );
      await rename(catalogTemporaryPath, input.catalogPath);
    } catch (error) {
      await rm(path.dirname(presetPath), { recursive: true, force: true });
      throw error;
    }
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
    await rm(catalogTemporaryPath, { force: true });
  }
  return Object.freeze({ presetPath, catalogPath: input.catalogPath });
}
