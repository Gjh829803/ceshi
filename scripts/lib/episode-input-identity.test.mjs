import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildEpisodeSceneRuntimeIdentity,
  buildEpisodeVisualEventInputIdentity,
  buildEpisodeVisualInputIdentity,
} from "./episode-input-identity.mjs";

async function write(filePath, value = "fixture") {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value);
}

test("closes Scene, visual reconstruction, and Gemini inputs by content hash", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "worldkit-episode-input-identity-"));
  const sceneRoot = path.join(root, "scene");
  const scenePlanRoot = path.join(root, "scene-plan");
  const episodeRoot = path.join(root, "episode");
  const configPath = path.join(root, "director.json");
  const promptPath = path.join(root, "director.md");
  try {
    for (const name of [
      "scene-brief.md", "world.mjs", "authoring.json", "world.build.json",
      "runtime-snapshot.json", "opening-frame.png", "whitebox-capture-receipt.json",
      "visual-generation-prompts.json", "visual-identity-palette.json",
      "styled-opening-frame.png",
    ]) await write(path.join(sceneRoot, name), name);
    await write(path.join(scenePlanRoot, "world-plan.png"), "world-plan");
    await write(path.join(scenePlanRoot, "reference-0.png"), "reference");
    await write(path.join(sceneRoot, "triviews/target-a/whitebox-triview.png"), "triview");
    await write(path.join(sceneRoot, "triviews/whitebox-triview-manifest.json"), JSON.stringify({
      whiteboxTriviews: [{
        visualTargetId: "target-a",
        imageUri: "target-a/whitebox-triview.png",
      }],
    }));
    for (let index = 0; index < 6; index += 1) {
      await write(path.join(
        episodeRoot,
        `whitebox/segment-0${index}-first-frame.png`,
      ), `whitebox-${index}`);
      await write(path.join(episodeRoot, `whitebox/segment-0${index}.mp4`), `video-${index}`);
      await write(path.join(
        episodeRoot,
        `visual/segment-0${index}-styled-opening-frame.png`,
      ), `styled-${index}`);
    }
    await write(path.join(episodeRoot, "whitebox/executed-playthrough-trace.json"), "trace");
    await write(path.join(episodeRoot, "visual/episode-visual-manifest.json"), "manifest");
    await write(configPath, "config-v1");
    await write(promptPath, "prompt-v1");

    const scene = await buildEpisodeSceneRuntimeIdentity({ sceneRoot, scenePlanRoot });
    const visual = await buildEpisodeVisualInputIdentity({
      sceneRoot,
      scenePlanRoot,
      episodeRoot,
    });
    const eventV1 = await buildEpisodeVisualEventInputIdentity({
      configPath,
      promptTemplatePath: promptPath,
      episodeRoot,
      selectedCaptureIndices: [0, 2, 4],
    });
    await write(promptPath, "prompt-v2");
    const eventV2 = await buildEpisodeVisualEventInputIdentity({
      configPath,
      promptTemplatePath: promptPath,
      episodeRoot,
      selectedCaptureIndices: [0, 2, 4],
    });

    assert.match(scene.identityHash, /^sha256:[a-f0-9]{64}$/);
    assert.match(visual.identityHash, /^sha256:[a-f0-9]{64}$/);
    assert.notEqual(eventV1.identityHash, eventV2.identityHash);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
