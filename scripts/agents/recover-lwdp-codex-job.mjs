#!/usr/bin/env node
import path from "node:path";

import { recoverSucceededCodexJobOutputs } from "../lib/lwdp-codex-output-recovery.mjs";

function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error(`Invalid argument near ${key ?? "<end>"}.`);
    result[key.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
  }
  return result;
}

const args = parseArguments(process.argv.slice(2));
const result = await recoverSucceededCodexJobOutputs({
  jobId: args.jobId,
  repoRoot: path.resolve(args.repoRoot || process.cwd()),
  sceneId: args.sceneId,
  stage: args.stage,
});
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
