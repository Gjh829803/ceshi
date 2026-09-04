import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { stringifyCanonicalJson } from "@whitebox-world/protocol";

import { createAgentAuthoringCatalogV2 } from "../lib/agent-authoring-catalog.js";

const outputPath = path.resolve(
  ".codex/skills/worldkit-block-builder/references/agent-authoring-catalog.json",
);
const bytes = `${stringifyCanonicalJson(createAgentAuthoringCatalogV2())}\n`;
if (process.argv.includes("--check")) {
  const current = await readFile(outputPath, "utf8").catch(() => "");
  if (current !== bytes) {
    process.stderr.write("AgentAuthoringCatalog is stale. Run write-agent-authoring-catalog.ts.\n");
    process.exitCode = 1;
  }
} else {
  await writeFile(outputPath, bytes, "utf8");
}
