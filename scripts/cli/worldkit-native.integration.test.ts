import { spawn } from "node:child_process";
import path from "node:path";

import { parseNativeSceneCheckResultV1 } from
  "@whitebox-world/runtime-contracts";
import { afterEach, describe, expect, it } from "vitest";

import {
  createNativeSceneWorkspaceFixtureV1,
  removeNativeSceneWorkspaceFixtureV1,
} from "../native-scene/test-support.js";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../..");
const CLI_PATH = path.join(REPOSITORY_ROOT, "scripts/cli/worldkit.ts");
const roots: string[] = [];

interface ProcessResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

async function fixture(source: string): Promise<string> {
  const root = await createNativeSceneWorkspaceFixtureV1({
    files: { "scene.ts": source },
  });
  roots.push(root);
  return root;
}

function moduleSource(buildBody: string): string {
  return `
    import { defineBabylonNativeScene } from "@whitebox-world/native-babylon";
    export default defineBabylonNativeScene({
      kind: "babylon-native-scene-module",
      id: "native-cli-test",
      build(context) { ${buildBody} },
    });
  `;
}

async function runCli(
  arguments_: readonly string[],
  environment: Readonly<Record<string, string>> = {},
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "pnpm",
      ["exec", "tsx", CLI_PATH, ...arguments_],
      {
        cwd: REPOSITORY_ROOT,
        env: { ...process.env, ...environment },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => resolve(Object.freeze({
      exitCode: code ?? 2,
      stdout,
      stderr,
    })));
  });
}

function parseSingleJsonLine(output: string) {
  expect(output.endsWith("\n")).toBe(true);
  expect(output.split("\n")).toHaveLength(2);
  return parseNativeSceneCheckResultV1(JSON.parse(output.trim()));
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(removeNativeSceneWorkspaceFixtureV1));
});

describe("worldkit native CLI process contract", () => {
  it("emits byte-clean passing check/explain JSON and deterministic human text", async () => {
    const root = await fixture(moduleSource(`
      context.registration.registerSpawnMarker({
        id: "player-spawn", positionMetersXYZ: [0, 1, 0], facingRadians: 0,
      });
    `));

    const check = await runCli(["native", "check", root, "--json"]);
    const explainJson = await runCli([
      "native",
      "explain",
      root,
      "--json",
    ]);
    const explainHuman = await runCli(["native", "explain", root]);

    expect(check.exitCode).toBe(0);
    expect(check.stderr).toBe("");
    expect(explainJson.exitCode).toBe(0);
    expect(explainJson.stderr).toBe("");
    expect(parseSingleJsonLine(check.stdout).outcome).toBe("passed");
    expect(parseSingleJsonLine(explainJson.stdout)).toEqual(
      parseSingleJsonLine(check.stdout),
    );
    expect(explainHuman.exitCode).toBe(0);
    expect(explainHuman.stdout).toBe("outcome: passed\n");
    expect(explainHuman.stderr).toBe("");
  }, 60_000);

  it("maps rejection, usage, missing root, and cleanup to exact exits", async () => {
    const rejectedRoot = await fixture(moduleSource(""));
    const rejected = await runCli([
      "native",
      "check",
      rejectedRoot,
      "--json",
    ]);
    expect(rejected.exitCode).toBe(1);
    expect(parseSingleJsonLine(rejected.stdout).outcome).toBe("rejected");

    const usage = await runCli([
      "native",
      "check",
      rejectedRoot,
      "--json",
      "--unknown",
    ]);
    expect(usage.exitCode).toBe(2);
    expect(parseSingleJsonLine(usage.stdout)).toMatchObject({
      checkedInput: { kind: "unresolved-world" },
      outcome: "tool-error",
    });

    const missingJson = await runCli([
      "native",
      "check",
      rejectedRoot,
    ]);
    expect(missingJson.exitCode).toBe(2);
    expect(missingJson.stderr).toBe("");
    expect(parseSingleJsonLine(missingJson.stdout)).toMatchObject({
      checkedInput: { kind: "unresolved-world" },
      outcome: "tool-error",
      diagnostics: [
        { code: "WORLDKIT_NATIVE_SCENE_TOOL_USAGE_INVALID" },
      ],
    });

    const missing = await runCli([
      "native",
      "check",
      path.join(rejectedRoot, "missing"),
      "--json",
    ]);
    expect(missing.exitCode).toBe(2);
    expect(parseSingleJsonLine(missing.stdout).outcome).toBe("tool-error");

    const cleanupRoot = await fixture(moduleSource(`
      context.registration.registerSpawnMarker({
        id: "player-spawn", positionMetersXYZ: [0, 1, 0], facingRadians: 0,
      });
    `));
    const environmentIsolation = await runCli(
      ["native", "check", cleanupRoot, "--json"],
      { WORLDKIT_NATIVE_SCENE_TEST_FAILURE_MODE: "candidate-cleanup" },
    );
    expect(environmentIsolation.exitCode).toBe(0);
    expect(parseSingleJsonLine(environmentIsolation.stdout)).toMatchObject({
      outcome: "passed",
      diagnostics: [],
    });
  }, 60_000);

  it("never leaks paths, stacks, Babylon banners, or environment sentinels", async () => {
    const root = await fixture(moduleSource(""));
    const sentinel = "WORLDKIT_PRIVATE_CREDENTIAL_SENTINEL";
    const run = await runCli(
      ["native", "check", root, "--json"],
      { WORLDKIT_CREDENTIAL_SENTINEL: sentinel },
    );
    const combined = `${run.stdout}${run.stderr}`;

    expect(combined).not.toContain(root);
    expect(combined).not.toContain(REPOSITORY_ROOT);
    expect(combined).not.toContain(".codex-tmp");
    expect(combined).not.toContain(sentinel);
    expect(combined).not.toContain("Babylon.js v");
    expect(combined).not.toMatch(/(?:Error:|\n\s+at\s)/);
  }, 30_000);
});
