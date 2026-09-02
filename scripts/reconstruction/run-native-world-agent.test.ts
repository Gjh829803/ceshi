import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("Native-default world agent Host route", () => {
  it("reuses the unified Planner before the Native Case proposal stage", () => {
    const source = readFileSync(
      "scripts/reconstruction/run-native-world-agent.ts",
      "utf8",
    );
    expect(source).toContain("scripts/agents/run-canonical-world-agent.sh");
    expect(source).toContain('"--plan-only"');
    expect(source).toContain("native-case-proposal.json");
    expect(source).not.toContain("Produce exactly two outputs");
  });

  it("assembles Case planning and the formal reconstruction transaction", () => {
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
      "WORLDKIT_NATIVE_WORLD_SMOKE_OK unified-planning native-case-mapping native-generation native-check package runtime capture evaluation repair final-publication",
    );
  });
});
