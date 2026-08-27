#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

const sceneRoot = path.resolve(option("--scene-root"));
const limit = Number(option("--limit", "5"));
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 5) throw new Error("--limit must be 1-5.");
const format = option("--format", "paths");
if (!["paths", "tsv"].includes(format)) throw new Error("--format must be paths or tsv.");
const captureManifest = await readFile(
  path.join(sceneRoot, "triviews", "whitebox-triview-manifest.json"),
  "utf8",
).then(JSON.parse);
let paletteTargets = [];
try {
  const palette = await readFile(
    path.join(sceneRoot, "visual-identity-palette.json"),
    "utf8",
  ).then(JSON.parse);
  paletteTargets = Array.isArray(palette.targets) ? palette.targets : [];
} catch {
  // Semantic palette metadata is optional for path-only listing.
}
const paletteByVisualTargetId = new Map(
  paletteTargets.map((target) => [target.visualTargetId || target.id, target]),
);
const rows = (Array.isArray(captureManifest.whiteboxTriviews) ? captureManifest.whiteboxTriviews : []).map((target) => ({
  visualTargetId: target.visualTargetId,
  path: path.join("triviews", target.imageUri),
  target: paletteByVisualTargetId.get(target.visualTargetId),
}));
function tsv(value) {
  return String(value || "").replace(/[\t\r\n]+/g, " ").trim();
}
for (const row of rows.slice(0, limit)) {
  if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(row.visualTargetId)) throw new Error("Tri-view visual target id is invalid.");
  const absolutePath = path.resolve(sceneRoot, row.path);
  const relative = path.relative(sceneRoot, absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Tri-view input escaped scene root.");
  process.stdout.write(format === "tsv"
    ? [
        row.visualTargetId,
        absolutePath,
        row.visualTargetId,
        row.target?.targetKind,
        row.target?.name,
        row.target?.description,
      ].map(tsv).join("\t") + "\n"
    : `${absolutePath}\n`);
}
