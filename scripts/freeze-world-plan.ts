import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertSceneId,
  freezeWorldPlan,
  verifyFrozenWorldPlan,
} from "./lib/plan-lock.js";

function parseOptions(argv: readonly string[]): { sceneId: string; check: boolean } {
  let sceneId = "";
  let check = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--scene") {
      sceneId = argv[index + 1] ?? "";
      index += 1;
    } else if (argument === "--check") {
      check = true;
    } else if (argument !== "--") {
      throw new Error(`Unsupported option: ${argument}`);
    }
  }
  assertSceneId(sceneId);
  return { sceneId, check };
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = parseOptions(process.argv.slice(2));
if (options.check) {
  await verifyFrozenWorldPlan(projectRoot, options.sceneId);
  process.stdout.write(`PASS: ${options.sceneId} frozen plan has no drift.\n`);
} else {
  const outputPath = await freezeWorldPlan(projectRoot, options.sceneId);
  process.stdout.write(`Frozen reviewed plan at ${outputPath}.\n`);
}
