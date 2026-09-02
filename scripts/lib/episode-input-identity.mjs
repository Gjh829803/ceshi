import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { sha256Canonical } from "./playthrough-dataset.mjs";

export async function episodeFileHash(filePath) {
  return `sha256:${createHash("sha256").update(await readFile(filePath)).digest("hex")}`;
}

async function hashNamedFiles(entries) {
  return Promise.all(entries.map(async ([id, filePath]) => ({
    id,
    contentHash: await episodeFileHash(filePath),
  })));
}

export async function buildEpisodeSceneRuntimeIdentity({
  sceneRoot,
  scenePlanRoot,
  episodeSourceReceiptPath = null,
}) {
  const files = await hashNamedFiles([
    ["scene-brief", path.join(sceneRoot, "scene-brief.md")],
    ["world-module", path.join(sceneRoot, "world.mjs")],
    ["authoring", path.join(sceneRoot, "authoring.json")],
    ["world-build", path.join(sceneRoot, "world.build.json")],
    ["runtime-snapshot", path.join(sceneRoot, "runtime-snapshot.json")],
    ["opening-frame", path.join(sceneRoot, "opening-frame.png")],
    ["capture-receipt", path.join(sceneRoot, "whitebox-capture-receipt.json")],
    ["world-plan", path.join(scenePlanRoot, "world-plan.png")],
    ...(episodeSourceReceiptPath === null
      ? []
      : [["episode-source-receipt", episodeSourceReceiptPath]]),
  ]);
  const identity = {
    kind: "worldkit-episode-scene-runtime-input-identity",
    schemaVersion: 1,
    files,
  };
  return Object.freeze({ ...identity, identityHash: sha256Canonical(identity) });
}

export async function buildEpisodeVisualInputIdentity({
  sceneRoot,
  scenePlanRoot,
  episodeRoot,
}) {
  const whiteboxManifestPath = path.join(
    sceneRoot,
    "triviews/whitebox-triview-manifest.json",
  );
  const whiteboxManifest = JSON.parse(await readFile(whiteboxManifestPath, "utf8"));
  const targetFiles = (whiteboxManifest.whiteboxTriviews ?? []).map((target) => [
    `whitebox-triview:${target.visualTargetId}`,
    path.join(sceneRoot, "triviews", target.imageUri),
  ]);
  const files = await hashNamedFiles([
    ["scene-brief", path.join(sceneRoot, "scene-brief.md")],
    ["scene-visual-prompts", path.join(sceneRoot, "visual-generation-prompts.json")],
    ["visual-palette", path.join(sceneRoot, "visual-identity-palette.json")],
    ["base-styled-opening", path.join(sceneRoot, "styled-opening-frame.png")],
    ["user-reference", path.join(scenePlanRoot, "reference-0.png")],
    ["whitebox-triview-manifest", whiteboxManifestPath],
    ...Array.from({ length: 6 }, (_, index) => [
      `whitebox-opening:segment-0${index}`,
      path.join(episodeRoot, "whitebox", `segment-0${index}-first-frame.png`),
    ]),
    ...targetFiles,
  ]);
  const identity = {
    kind: "worldkit-episode-visual-input-identity",
    schemaVersion: 1,
    files,
  };
  return Object.freeze({ ...identity, identityHash: sha256Canonical(identity) });
}

export async function buildEpisodeVisualEventInputIdentity({
  configPath,
  promptTemplatePath,
  episodeRoot,
  styleRoot = episodeRoot,
  selectedCaptureIndices,
}) {
  const standardVisualManifest = path.join(
    styleRoot,
    "visual/episode-visual-manifest.json",
  );
  const variantVisualManifest = path.join(styleRoot, "visual/visual-manifest.json");
  const visualManifestPath = await access(standardVisualManifest)
    .then(() => standardVisualManifest)
    .catch(() => variantVisualManifest);
  const files = await hashNamedFiles([
    ["director-config", configPath],
    ["director-prompt-template", promptTemplatePath],
    ["visual-manifest", visualManifestPath],
    ["executed-trace", path.join(episodeRoot, "whitebox/executed-playthrough-trace.json")],
    ...selectedCaptureIndices.flatMap((index) => [[
      `styled-opening:segment-0${index}`,
      path.join(styleRoot, "visual", `segment-0${index}-styled-opening-frame.png`),
    ], [
      `whitebox-video:segment-0${index}`,
      path.join(episodeRoot, "whitebox", `segment-0${index}.mp4`),
    ]]),
  ]);
  const identity = {
    kind: "worldkit-episode-visual-event-input-identity",
    schemaVersion: 1,
    selectedCaptureIndices: [...selectedCaptureIndices],
    files,
  };
  return Object.freeze({ ...identity, identityHash: sha256Canonical(identity) });
}
