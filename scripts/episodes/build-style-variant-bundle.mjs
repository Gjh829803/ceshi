#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

const arguments_ = process.argv.slice(2);
const value = (name) => {
  const index = arguments_.indexOf(name);
  if (index < 0 || !arguments_[index + 1]) throw new Error(`Missing ${name}.`);
  return arguments_[index + 1];
};
const episodeId = value("--episode-id");
const episodeRoot = path.resolve(value("--episode-root"));
const manifest = await readFile(
  path.join(episodeRoot, "style-variants/style-variant-manifest.json"), "utf8",
).then(JSON.parse).catch(() => null);
if (manifest === null) {
  const record = await readFile(path.join(episodeRoot, "episode-record.json"), "utf8")
    .then(JSON.parse).catch(() => null);
  if (record?.styleVariantMode !== "ten-style") {
    process.stdout.write("WORLDKIT_STYLE_VARIANT_BUNDLE_SKIPPED legacy-episode\n");
    process.exit(0);
  }
}
if (manifest?.episodeId !== episodeId || manifest?.succeededCount !== manifest?.variantCount) {
  throw new Error("Style Variant bundle requires a complete admitted manifest.");
}
const bundleRoot = path.join(episodeRoot, "bundle");
await mkdir(bundleRoot, { recursive: true });
const outputPath = path.join(bundleRoot, `${episodeId}-seedance-review.zip`);
await rm(outputPath, { force: true });
const included = [
  "episode-record.json",
  "planning",
  "whitebox",
  "style-variants",
  "pipeline.log",
];
await new Promise((resolve, reject) => {
  const child = spawn("zip", ["-q", "-r", outputPath, ...included], {
    cwd: episodeRoot,
    stdio: ["ignore", "ignore", "pipe"],
  });
  let errorOutput = "";
  child.stderr.on("data", (chunk) => { errorOutput += String(chunk); });
  child.once("error", reject);
  child.once("close", (code) => code === 0
    ? resolve()
    : reject(new Error(errorOutput || `zip exited ${code}`)));
});
process.stdout.write(`WORLDKIT_STYLE_VARIANT_BUNDLE_OK ${outputPath}\n`);
