#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  sha256Canonical,
  validatePlaythroughPlan,
} from "../../../../scripts/lib/playthrough-dataset.mjs";

const args = process.argv.slice(2);
const inputIndex = args.indexOf("--input");
const sceneIndex = args.indexOf("--scene-id");
if (inputIndex < 0 || sceneIndex < 0 || !args[inputIndex + 1] || !args[sceneIndex + 1]) {
  throw new Error("Usage: self-check.mjs --input <plan.json> --scene-id <scene-id>");
}
const input = path.resolve(args[inputIndex + 1]);
const value = JSON.parse(await readFile(input, "utf8"));
const result = validatePlaythroughPlan(value, { sceneId: args[sceneIndex + 1] });
if (!result.ok) {
  process.stderr.write(`${JSON.stringify(result.diagnostics, null, 2)}\n`);
  process.exitCode = 2;
} else {
  process.stdout.write(`WORLDKIT_PLAYTHROUGH_PLAN_OK ${sha256Canonical(value)}\n`);
}

