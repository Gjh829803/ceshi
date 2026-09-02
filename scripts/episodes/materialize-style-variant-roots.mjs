#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

import { writeJsonAtomic } from "../lib/episode-style-variants.mjs";

const arguments_ = process.argv.slice(2);
const value = (name) => {
  const index = arguments_.indexOf(name);
  if (index < 0 || !arguments_[index + 1]) throw new Error(`Missing ${name}.`);
  return arguments_[index + 1];
};
const episodeRoot = path.resolve(value("--episode-root"));
const plan = JSON.parse(await readFile(path.resolve(value("--plan")), "utf8"));
for (const variant of plan.variants ?? []) {
  await writeJsonAtomic(
    path.join(episodeRoot, "style-variants", variant.id, "style-variant.json"),
    {
      kind: "worldkit-episode-style-variant",
      schemaVersion: 1,
      sceneId: plan.sceneId,
      episodeId: plan.episodeId,
      sourceWhiteboxIdentity: plan.sourceWhiteboxIdentity,
      ...variant,
    },
  );
}
process.stdout.write(`WORLDKIT_STYLE_VARIANT_ROOTS_OK variants=${plan.variants.length}\n`);
