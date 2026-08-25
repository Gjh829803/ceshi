import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertAgentSelfCheckBundleParity } from "./lib/agent-self-check-bundle";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const trackedBundlePath = path.join(
  repositoryRoot,
  ".codex/skills/worldkit-canonical-builder/scripts/self-check.mjs",
);
const temporaryDirectory = await mkdtemp(
  path.join(tmpdir(), "worldkit-agent-self-check-compare-"),
);

try {
  const buildResult = spawnSync(
    process.execPath,
    [
      path.join(repositoryRoot, "scripts/build-agent-self-check.mjs"),
      "--out-dir",
      temporaryDirectory,
    ],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  if (buildResult.status !== 0) {
    throw new Error(
      `Builder self-check generation failed.\n${buildResult.stderr || buildResult.stdout}`,
    );
  }
  await assertAgentSelfCheckBundleParity({
    generatedBundlePath: path.join(temporaryDirectory, "self-check.mjs"),
    trackedBundlePath,
  });
  process.stdout.write("Builder self-check bundle is current.\n");
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
