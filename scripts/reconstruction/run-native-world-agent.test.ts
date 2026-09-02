import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  resolveNativeCaseMappingCloudOutputS3PrefixV1,
} from "./run-native-world-agent.js";

describe("Native-default world agent Host route", () => {
  it("gives only Cloud mapping tasks one stable scene/run/stage S3 prefix", () => {
    expect(resolveNativeCaseMappingCloudOutputS3PrefixV1({
      backend: "cloud",
      sceneId: "native-prompt-smoke",
      mappingTaskId: "native-case-map-native-prompt-smoke-123456789abc",
      environment: {
        WORLDKIT_LWDP_S3_ROOT: "s3://bucket/worldkit///",
      },
    })).toBe(
      "s3://bucket/worldkit/native-prompt-smoke/" +
      "native-case-map-native-prompt-smoke-123456789abc/native-case-mapping",
    );
    expect(resolveNativeCaseMappingCloudOutputS3PrefixV1({
      backend: "local",
      sceneId: "native-prompt-smoke",
      mappingTaskId: "native-case-map-native-prompt-smoke-123456789abc",
      environment: {
        WORLDKIT_LWDP_S3_ROOT: "s3://must-not-cross/local",
      },
    })).toBeUndefined();
  });

  it("reuses the unified Planner before the Native Case proposal stage", () => {
    const source = readFileSync(
      "scripts/reconstruction/run-native-world-agent.ts",
      "utf8",
    );
    expect(source).toContain("scripts/agents/run-canonical-world-agent.sh");
    expect(source).toContain('"--plan-only"');
    expect(source).toContain('"--scene-source"');
    expect(source).toContain('"babylon-native"');
    expect(source).toContain("native-case-proposal.json");
    expect(source).not.toContain("Produce exactly two outputs");
    expect(source).not.toContain('"terrain-height-intent-prompt.md",');
  });

  it("closes the WorldPackage world-bounds contract in Mapper inputs", () => {
    const source = readFileSync(
      "scripts/reconstruction/run-native-world-agent.ts",
      "utf8",
    );
    expect(source).toContain(
      '"centerMetersXZ": [<finite x meters>, <finite z meters>]',
    );
    expect(source).toContain(
      '"sizeMetersXZ": [<positive width meters>, <positive depth meters>]',
    );
    expect(source).toContain(
      '"heightRangeMeters": [<finite minimum y meters>, <finite maximum y meters>]',
    );
    expect(source).toContain(
      '"--context", "packages/world-package/src/package-contract.ts"',
    );
    expect(source).toContain(
      '"--context", "artifacts/scenes/cloud-temple-t-gate-native-block/inputs/world-bounds.json"',
    );
    expect(source).toContain(
      "Never use minimumMetersXYZ or maximumMetersXYZ for worldBounds",
    );
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
