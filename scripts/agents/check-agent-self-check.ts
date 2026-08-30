import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertAgentSelfCheckBundleParity } from "../lib/agent-self-check-bundle";
import { stringifyCanonicalJson } from "@whitebox-world/protocol";
import { createAgentAuthoringCatalogV1 } from "../lib/agent-authoring-catalog.js";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const arguments_ = process.argv.slice(2);
let trackedSkillsRoot: string;
if (arguments_.length === 0) {
  trackedSkillsRoot = path.join(repositoryRoot, ".codex", "skills");
} else if (
  arguments_.length === 2 &&
  arguments_[0] === "--tracked-skills-root" &&
  arguments_[1] !== undefined &&
  arguments_[1] !== ""
) {
  trackedSkillsRoot = path.resolve(arguments_[1]);
} else {
  throw new Error(
    "Usage: check-agent-self-check.ts [--tracked-skills-root <directory>]",
  );
}
const targets = [
  {
    bundleId: "planner",
    relativePath: "worldkit-spatial-planner/scripts/self-check.mjs",
  },
  {
    bundleId: "block-builder",
    relativePath: "worldkit-block-builder/scripts/self-check.mjs",
  },
  {
    bundleId: "block-builder-visual-review",
    relativePath: "worldkit-block-builder/scripts/render-visual-review.mjs",
  },
] as const;
const temporaryDirectory = await mkdtemp(
  path.join(tmpdir(), "worldkit-agent-self-check-compare-"),
);

try {
  const buildResult = spawnSync(
    process.execPath,
    [
      path.join(repositoryRoot, "scripts/agents/build-agent-self-check.mjs"),
      "--out-root",
      temporaryDirectory,
    ],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  if (buildResult.status !== 0) {
    throw new Error(
      `Agent self-check generation failed.\n${buildResult.stderr || buildResult.stdout}`,
    );
  }
  for (const target of targets) {
    await assertAgentSelfCheckBundleParity({
      bundleId: target.bundleId,
      generatedBundlePath: path.join(
        temporaryDirectory,
        target.relativePath,
      ),
      trackedBundlePath: path.join(trackedSkillsRoot, target.relativePath),
    });
  }
  const catalogPath = path.join(
    trackedSkillsRoot,
    "worldkit-block-builder/references/agent-authoring-catalog.json",
  );
  const expectedCatalog = `${stringifyCanonicalJson(createAgentAuthoringCatalogV1())}\n`;
  if (await readFile(catalogPath, "utf8") !== expectedCatalog) {
    throw new Error("AgentAuthoringCatalog is stale or does not match the real Registry admission probe.");
  }
  process.stdout.write("Planner, Block Builder, visual-review bundles, and Agent Authoring Catalog are current.\n");
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
