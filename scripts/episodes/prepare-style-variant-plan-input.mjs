#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  EPISODE_STYLE_VARIANT_SEGMENT_IDS,
  sha256File,
  writeJsonAtomic,
} from "../lib/episode-style-variants.mjs";

const arguments_ = process.argv.slice(2);
const value = (name) => {
  const index = arguments_.indexOf(name);
  if (index < 0 || !arguments_[index + 1]) throw new Error(`Missing ${name}.`);
  return arguments_[index + 1];
};
const sceneId = value("--scene-id");
const episodeId = value("--episode-id");
const sceneRoot = path.resolve(value("--scene-root"));
const episodeRoot = path.resolve(value("--episode-root"));
const outputPath = path.resolve(value("--output"));
const whiteboxManifest = JSON.parse(await readFile(
  path.join(sceneRoot, "triviews/whitebox-triview-manifest.json"),
  "utf8",
));
const targets = (whiteboxManifest.whiteboxTriviews ?? []).map((target) => ({
  visualTargetId: target.visualTargetId,
  targetKind: target.targetKind ?? "complete-target",
  name: target.name ?? target.visualTargetId,
  description: target.description ?? "",
}));
if (targets.length < 1 || targets.length > 5 ||
    new Set(targets.map(({ visualTargetId }) => visualTargetId)).size !== targets.length) {
  throw new Error("Style Variant planning requires 1-5 unique complete targets.");
}
await writeJsonAtomic(outputPath, {
  kind: "worldkit-episode-style-variant-plan-input",
  schemaVersion: 1,
  sceneId,
  episodeId,
  sourceWhiteboxIdentity: {
    traceHash: await sha256File(path.join(
      episodeRoot, "whitebox/executed-playthrough-trace.json",
    )),
    qualityReportHash: await sha256File(path.join(
      episodeRoot, "whitebox/executed-playthrough-quality-report.json",
    )),
    segmentVideoHashes: await Promise.all(
      EPISODE_STYLE_VARIANT_SEGMENT_IDS.map(async (segmentId) => ({
        segmentId,
        contentHash: await sha256File(path.join(
          episodeRoot, "whitebox", `${segmentId}.mp4`,
        )),
      })),
    ),
  },
  targets,
});
process.stdout.write(`WORLDKIT_STYLE_VARIANT_PLAN_INPUT_OK targets=${targets.length}\n`);
