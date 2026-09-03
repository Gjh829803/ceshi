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

  it("keeps the SDK controlled Subject out of Native Block visual groups", () => {
    const source = readFileSync(
      "scripts/reconstruction/run-native-world-agent.ts",
      "utf8",
    );
    expect(source).toContain(
      "Never create a semantic silhouette target, visual group, topology node, or composition target for the controlled Subject",
    );
    expect(source).toContain(
      "The Host-owned SDK Subject remains visible in Runtime Capture without a Native Block binding",
    );
  });

  it("keeps pass checks bound to declared traversable targets", () => {
    const source = readFileSync(
      "scripts/reconstruction/run-native-world-agent.ts",
      "utf8",
    );
    expect(source).toContain(
      "The acceptanceTargetRef of every pass traversal check must name a target with a ground or step Collider role",
    );
    expect(source).toContain(
      "never bind a pass check to a blocker, cliff, wall, mountain, or other non-traversable landmark",
    );
    expect(source).toContain(
      "The acceptanceTargetRef of every block traversal check must name a target with a blocker Collider role",
    );
    expect(source).toContain(
      "Every Collider ID and checkpoint ID must be globally unique",
    );
  });

  it("uses one Native Collider contribution identity", () => {
    const source = readFileSync(
      "scripts/reconstruction/run-native-world-agent.ts",
      "utf8",
    );
    expect(source).toContain(
      "every expected.colliders row must set contributionId to exactly the same string as colliderId",
    );
    expect(source).toContain("Do not invent a parallel contribution name");
  });

  it("defines the traversal plane side from the crossed destination", () => {
    const source = readFileSync(
      "scripts/reconstruction/run-native-world-agent.ts",
      "utf8",
    );
    expect(source).toContain(
      "expectedCenterSide means the destination or forbidden far side reached only after crossing sourceFace",
    );
    expect(source).toContain(
      "the Spawn center begins strictly on the opposite side outside capsule clearance",
    );
  });

  it("gives Mapper the exact source-neutral ground-connectivity contract", () => {
    const source = readFileSync(
      "scripts/reconstruction/run-native-world-agent.ts",
      "utf8",
    );
    expect(source).toContain(
      "For a ground Spawn, expected.groundConnectivity is required and has exactly this shape",
    );
    expect(source).toContain("centerlineStandPositionsXYZMeters");
    expect(source).toContain(
      "The first position of at least one band must exactly equal expected.spawnSupport.expectedPositionXYZMeters",
    );
    expect(source).toContain(
      "every band binds one pass target",
    );
    expect(source).toContain(
      "every ground pass target has exactly one explicit band",
    );
    expect(source).toContain(
      "For an air Spawn, use requireSingleReachableComponent false and an empty requiredTraversalBands array",
    );
    expect(source).toContain("current ground-only Traversal Envelope");
    expect(source).toContain(
      "do not add an isBidirectional or one-way field",
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
