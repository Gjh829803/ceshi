#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

import { sha256Canonical, validatePlaythroughPlan } from "../lib/playthrough-dataset.mjs";

const args = process.argv.slice(2);
const inputIndex = args.indexOf("--input");
const sceneIndex = args.indexOf("--scene-id");
if (inputIndex < 0 || !args[inputIndex + 1]) {
  throw new Error("Usage: node scripts/episodes/validate-playthrough-plan.mjs --input <plan.json> [--scene-id <id>]");
}
const inputPath = path.resolve(args[inputIndex + 1]);
const sceneId = sceneIndex >= 0 ? args[sceneIndex + 1] : undefined;
const value = JSON.parse(await readFile(inputPath, "utf8"));
const result = validatePlaythroughPlan(value, { sceneId });
if (!result.ok) {
  process.stderr.write(`${JSON.stringify({ ok: false, diagnostics: result.diagnostics }, null, 2)}\n`);
  process.exitCode = 2;
} else {
  process.stdout.write(`${JSON.stringify({ ok: true, planHash: sha256Canonical(value), frameCount: value.frameCount }, null, 2)}\n`);
}
