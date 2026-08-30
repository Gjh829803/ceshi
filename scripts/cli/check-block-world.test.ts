import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  checkBlockWorldModuleV2,
  runBlockWorldCliV2,
} from "./check-block-world.js";

describe("Block World checker CLI module", () => {
  it("checks the direct Three.js example without a semantic construction DSL", async () => {
    const report = await checkBlockWorldModuleV2(
      "examples/block-world/basic-world.mjs",
    );
    expect(report.status).toBe("passed");
    expect(report.diagnostics).toEqual([]);
    expect(report.metrics.blockCount).toBeGreaterThan(80);
    expect(report.metrics.reachableRequiredTargetCount).toBe(2);
    expect(report.metrics.reachableRequiredGroundTraversalBandCount).toBe(1);
  });

  it("rejects modules without the one explicit build export", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "block-world-module-"));
    const modulePath = path.join(directory, "invalid.ts");
    await writeFile(modulePath, "export const value = 1;\n", "utf8");
    await expect(checkBlockWorldModuleV2(modulePath)).rejects.toThrow(
      "BLOCK_WORLD_MODULE_INVALID",
    );
  });

  it("returns exit code 2 and a stable report for a well-formed disconnected world", async () => {
    let stdout = "";
    let stderr = "";
    const exitCode = await runBlockWorldCliV2([
      "--world",
      "scripts/fixtures/block-world-disconnected.mjs",
    ], {
      writeStdout: (value) => { stdout += value; },
      writeStderr: (value) => { stderr += value; },
    });
    expect(exitCode).toBe(2);
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toMatchObject({
      status: "failed",
      metrics: { disconnectedStandablePositionCount: 1 },
    });
  });
});
