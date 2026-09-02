#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";

import {
  loadEpisodeStyleVariantConfig,
  validateEpisodeStyleVariantPlan,
  writeJsonAtomic,
} from "../lib/episode-style-variants.mjs";

const arguments_ = process.argv.slice(2);
const value = (name) => {
  const index = arguments_.indexOf(name);
  if (index < 0 || !arguments_[index + 1]) throw new Error(`Missing ${name}.`);
  return arguments_[index + 1];
};
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sceneId = value("--scene-id");
const episodeId = value("--episode-id");
const inputPath = path.resolve(value("--input"));
const planPath = path.resolve(value("--plan"));
const reportPath = path.resolve(value("--report"));
const [input, plan, config] = await Promise.all([
  readFile(inputPath, "utf8").then(JSON.parse),
  readFile(planPath, "utf8").then(JSON.parse),
  loadEpisodeStyleVariantConfig(repoRoot),
]);
if (input?.sceneId !== sceneId || input?.episodeId !== episodeId) {
  throw new Error("Style Variant Plan input identity mismatch.");
}
const validation = validateEpisodeStyleVariantPlan(plan, {
  sceneId,
  episodeId,
  targetIds: (input.targets ?? []).map(({ visualTargetId }) => visualTargetId),
  variantCount: config.variantCount,
});
if (!isDeepStrictEqual(plan.sourceWhiteboxIdentity, input.sourceWhiteboxIdentity)) {
  validation.ok = false;
  validation.diagnostics.push({
    code: "STYLE_VARIANT_WHITEBOX_IDENTITY_STALE",
    path: "/sourceWhiteboxIdentity",
    message: "Style Variant Plan does not bind the current whitebox capture.",
  });
}
await writeJsonAtomic(reportPath, {
  kind: "worldkit-episode-style-variant-plan-report",
  schemaVersion: 1,
  sceneId,
  episodeId,
  passed: validation.ok,
  diagnostics: validation.diagnostics,
});
if (!validation.ok) {
  throw new Error(`STYLE_VARIANT_PLAN_INVALID ${JSON.stringify(validation.diagnostics)}`);
}
process.stdout.write(`WORLDKIT_STYLE_VARIANT_PLAN_OK variants=${config.variantCount}\n`);
