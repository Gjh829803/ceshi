import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildCloudEpisodeArtifactManifest,
  hydrateCloudEpisodeArtifactManifest,
} from "./worldkit-cloud-artifacts.mjs";

function sharedEpisodeFiles() {
  return [
    "episode-record.json",
    "episode-source-receipt.json",
    "planning/reconnaissance/reconnaissance-report.json",
    "planning/navigation-evidence.json",
    "planning/playthrough-plan.json",
    "whitebox/episode-180s.mp4",
    "whitebox/executed-playthrough-raw-trace.json",
    "whitebox/executed-playthrough-trace.json",
    "whitebox/executed-playthrough-quality-report.json",
    ...Array.from({ length: 6 }, (_, index) => [
      `whitebox/segment-0${index}.mp4`,
      `whitebox/segment-0${index}-first-frame.png`,
    ]).flat(),
  ];
}

test("builds a hash-closed Episode manifest with only episode-relative paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "worldkit-cloud-episode-artifacts-"));
  try {
    const files = [
      ...sharedEpisodeFiles(),
      "visual/episode-visual-prompts.json",
      "visual/episode-visual-manifest.json",
      "prompts/visual-events.json",
      ...Array.from({ length: 6 }, (_, index) => [
        `visual/segment-0${index}-styled-opening-frame.png`,
        `prompts/segment-0${index}.json`,
        `video/segment-0${index}/request.json`,
        `video/segment-0${index}/provider-run.json`,
        `video/segment-0${index}/seedance-2.5.mp4`,
        `video/segment-0${index}/final-1280x720-24fps-720f.mp4`,
      ]).flat(),
      "bundle/episode-scene-cloud-001-a1b2c3-seedance-review.zip",
    ];
    for (const relativePath of files) {
      const filePath = join(root, relativePath);
      await mkdir(join(filePath, ".."), { recursive: true });
      await writeFile(filePath, `bytes:${relativePath}`);
    }
    const manifest = await buildCloudEpisodeArtifactManifest({
      sceneId: "scene-cloud-001",
      episodeId: "episode-scene-cloud-001-a1b2c3",
      executionId: "exec-episode-001",
      stageId: "episode-production",
      stageOutputS3Prefix: "s3://bucket/episode/stages/episode-production",
      episodeRoot: root,
    });
    assert.equal(manifest.episodeId, "episode-scene-cloud-001-a1b2c3");
    assert.ok(manifest.artifacts.every((artifact) =>
      artifact.path.startsWith("episode/") && /^sha256:[a-f0-9]{64}$/.test(artifact.sha256)));
    assert.equal(manifest.artifacts.filter((artifact) => artifact.required).length, 61);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rehydrates a prior Episode attempt only from its hash-closed namespace", async () => {
  const root = await mkdtemp(join(tmpdir(), "worldkit-cloud-episode-resume-"));
  const episodeRoot = join(root, "episode");
  const manifestPath = join(root, "manifest.json");
  const bytes = Buffer.from("trusted resumed plan\n");
  const sha256 = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  const manifest = {
    kind: "worldkit-cloud-artifact-manifest",
    schemaVersion: 1,
    sceneId: "scene-cloud-001",
    episodeId: "episode-scene-cloud-001-a1b2c3",
    executionId: "exec-episode-001",
    artifacts: [{
      path: "episode/planning/playthrough-plan.json",
      byteSize: bytes.length,
      sha256,
      s3Uri: "s3://bucket/episode/playthrough-plan.json",
    }],
  };
  const downloadImplementation = async (uri, destination) => {
    await mkdir(join(destination, ".."), { recursive: true });
    await writeFile(destination, uri.endsWith("manifest.json")
      ? `${JSON.stringify(manifest)}\n`
      : bytes);
  };
  try {
    const restored = await hydrateCloudEpisodeArtifactManifest({
      manifestS3Uri: "s3://bucket/episode/manifest.json",
      manifestPath,
      expectedSceneId: "scene-cloud-001",
      expectedEpisodeId: "episode-scene-cloud-001-a1b2c3",
      expectedExecutionId: "exec-episode-001",
      episodeRoot,
      downloadImplementation,
    });
    assert.equal(restored.artifacts.length, 1);
    assert.deepEqual(await readFile(join(episodeRoot, "planning/playthrough-plan.json")), bytes);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("requires every reviewed Style Variant video while storing shared whitebox once", async () => {
  const root = await mkdtemp(join(tmpdir(), "worldkit-cloud-style-variants-"));
  const episodeId = "episode-scene-cloud-001-style01";
  const variantIds = Array.from({ length: 10 }, (_, index) =>
    `style-${String(index).padStart(2, "0")}`);
  const manifest = {
    kind: "worldkit-episode-style-variant-manifest",
    schemaVersion: 1,
    sceneId: "scene-cloud-001",
    episodeId,
    variantCount: 10,
    succeededCount: 10,
    variants: variantIds.map((id) => ({ id, status: "succeeded" })),
  };
  const files = [
    ...sharedEpisodeFiles(),
    `bundle/${episodeId}-seedance-review.zip`,
    "style-variants/style-variant-plan.json",
    "style-variants/style-variant-plan-report.json",
    "style-variants/style-variant-manifest.json",
    ...variantIds.flatMap((styleVariantId) => [
      `style-variants/${styleVariantId}/style-variant.json`,
      `style-variants/${styleVariantId}/visual/visual-manifest.json`,
      `style-variants/${styleVariantId}/review/visual-quality-review.json`,
      `style-variants/${styleVariantId}/review/visual-quality-review-report.json`,
      ...Array.from({ length: 6 }, (_, index) =>
        `style-variants/${styleVariantId}/visual/segment-0${index}-styled-opening-frame.png`),
      `style-variants/${styleVariantId}/prompts/visual-events.json`,
      ...Array.from({ length: 6 }, (_, index) =>
        `style-variants/${styleVariantId}/video/segment-0${index}/final-1280x720-24fps-720f.mp4`),
    ]),
  ];
  try {
    for (const relativePath of files) {
      const filePath = join(root, relativePath);
      await mkdir(join(filePath, ".."), { recursive: true });
      await writeFile(filePath, relativePath === "style-variants/style-variant-manifest.json"
        ? `${JSON.stringify(manifest)}\n`
        : `bytes:${relativePath}`);
    }
    const cloudManifest = await buildCloudEpisodeArtifactManifest({
      sceneId: "scene-cloud-001",
      episodeId,
      executionId: "exec-episode-style-001",
      stageId: "episode-production",
      stageOutputS3Prefix: "s3://bucket/episode/stages/episode-production",
      episodeRoot: root,
    });
    assert.equal(
      cloudManifest.artifacts.filter((artifact) => artifact.required).length,
      195,
    );
    assert.equal(
      cloudManifest.artifacts.filter((artifact) =>
        artifact.path.includes("/whitebox/segment-00.mp4")).length,
      1,
    );
    assert.equal(
      cloudManifest.artifacts.filter((artifact) =>
        /style-variants\/style-0[0-9]\/video\/segment-0[0-5]\/final-/.test(artifact.path)).length,
      60,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("publishes a reviewed ten-style visual sample without Gemini, Seedance, or a bundle", async () => {
  const root = await mkdtemp(join(tmpdir(), "worldkit-cloud-visual-sample-"));
  const episodeId = "episode-scene-cloud-001-visual01";
  const variantIds = Array.from({ length: 10 }, (_, index) =>
    `style-${String(index).padStart(2, "0")}`);
  const styleManifest = {
    kind: "worldkit-episode-style-variant-manifest",
    schemaVersion: 1,
    sceneId: "scene-cloud-001",
    episodeId,
    productionScope: "visual-sample",
    variantCount: 10,
    succeededCount: 10,
    variants: variantIds.map((id) => ({ id, status: "visual-passed" })),
  };
  const files = [
    ...sharedEpisodeFiles(),
    "style-variants/style-variant-plan.json",
    "style-variants/style-variant-plan-report.json",
    "style-variants/style-variant-manifest.json",
    ...variantIds.flatMap((styleVariantId) => [
      `style-variants/${styleVariantId}/style-variant.json`,
      `style-variants/${styleVariantId}/visual/visual-manifest.json`,
      `style-variants/${styleVariantId}/review/visual-quality-review.json`,
      `style-variants/${styleVariantId}/review/visual-quality-review-report.json`,
      ...Array.from({ length: 6 }, (_, index) =>
        `style-variants/${styleVariantId}/visual/segment-0${index}-styled-opening-frame.png`),
    ]),
  ];
  try {
    for (const relativePath of files) {
      const filePath = join(root, relativePath);
      await mkdir(join(filePath, ".."), { recursive: true });
      const contents = relativePath === "episode-record.json"
        ? JSON.stringify({ productionScope: "visual-sample" })
        : relativePath === "style-variants/style-variant-manifest.json"
          ? JSON.stringify(styleManifest)
          : `bytes:${relativePath}`;
      await writeFile(filePath, `${contents}\n`);
    }
    const cloudManifest = await buildCloudEpisodeArtifactManifest({
      sceneId: "scene-cloud-001",
      episodeId,
      executionId: "exec-episode-visual-001",
      stageId: "episode-production",
      stageOutputS3Prefix: "s3://bucket/episode/stages/episode-production",
      episodeRoot: root,
    });
    assert.equal(cloudManifest.artifacts.filter((artifact) => artifact.required).length, 124);
    assert.equal(cloudManifest.artifacts.some((artifact) =>
      artifact.path.includes("/prompts/visual-events.json")), false);
    assert.equal(cloudManifest.artifacts.some((artifact) =>
      artifact.path.includes("/video/segment-00/")), false);
    assert.equal(cloudManifest.artifacts.some((artifact) =>
      artifact.path.includes("/bundle/")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
