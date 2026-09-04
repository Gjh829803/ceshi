import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("Native-default world agent Host route", () => {
  it("uses the same two model-stage topology as the Block baseline", () => {
    const source = readFileSync(
      "scripts/reconstruction/run-native-world-agent.ts",
      "utf8",
    );
    expect(source).toContain("scripts/agents/run-canonical-world-agent.sh");
    expect(source).toContain('"--plan-only"');
    expect(source).toContain('"--scene-source"');
    expect(source).toContain('"babylon-native"');
    expect(source).toContain("deriveNativeWorldBaselineProposalV1");
    expect(source).toContain('"worldkit",\n        "reconstruct",\n        "run"');
    expect(source).not.toContain("native-case-mapping");
    expect(source).not.toContain("native-case-proposal.json");
    expect(source).not.toContain("scripts/agents/run-codex-task.mjs");
  });

  it("reports only Planner and Native Builder as model stages", () => {
    const result = spawnSync(
      "pnpm",
      [
        "exec",
        "tsx",
        path.resolve("scripts/reconstruction/run-native-world-agent.ts"),
        "--scene-id",
        "native-prompt-smoke",
        "build a mountainous T-shaped world",
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, WORLDKIT_PROMPT_SMOKE: "1" },
        encoding: "utf8",
      },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "WORLDKIT_NATIVE_WORLD_SMOKE_OK unified-planning native-generation native-check package runtime capture evaluation final-publication",
    );
    expect(result.stdout).not.toContain("native-case-mapping");
    expect(result.stdout).not.toContain(" repair ");
  }, 15_000);
});
