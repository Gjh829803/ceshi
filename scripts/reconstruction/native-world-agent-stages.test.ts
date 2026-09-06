import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { sha256Bytes } from "@whitebox-world/protocol";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import { runPlannerSelfCheck } from "../agents/agent-planner-self-check.js";
import { preparePlannerExecutionV1, replayPlannerExecutionV1, verifyAcceptedPlannerExecutionV1 } from "../agents/planner-execution.js";
import { parseWorldAgentArgumentsV1 } from "../agents/run-world-agent.js";
import { writeVisualIdentityPalette } from "../visual/write-visual-identity-palette.js";
import { runNativeWorldAgentV1 } from "./run-native-world-agent.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "native-world-stages-")));
  roots.push(root);
  for (const name of ["worldkit-spatial-planner", "worldkit-native-block-builder"]) {
    await cp(path.resolve(".codex/skills", name), path.join(root, ".codex/skills", name), { recursive: true });
  }
  const descriptorRef = "artifacts/scenes/cloud-temple-t-gate-native-block/inputs";
  await mkdir(path.join(root, descriptorRef), { recursive: true });
  for (const name of ["native-scene-api.json", "native-scene-profile.json", "block-profile.json"]) {
    await cp(path.resolve(descriptorRef, name), path.join(root, descriptorRef, name));
  }
  const reference = path.join(root, "uploaded.png");
  await writeFile(reference, await sharp({ create: { width: 8, height: 8, channels: 3, background: "blue" } }).png().toBuffer());
  const calls: string[] = [];
  const options = {
    repositoryRoot: root,
    backend: "local" as const,
    runProcess: async (command: string, args: readonly string[], cwd: string) => {
      expect(cwd).toBe(root);
      calls.push(command);
      if (command === "pnpm") {
        expect(args.slice(0, 3)).toEqual(["worldkit", "reconstruct", "run"]);
        expect(args[args.indexOf("--visual-capture-scope") + 1]).toBe("complete-targets");
        return 0; // Only the production handoff is mocked; all plan/Case checks are real.
      }
      expect(command).toBe("bash");
      if (args[0]?.endsWith("run-styled-opening-frame-agent.sh")) {
        expect(args[args.indexOf("--scene-source") + 1]).toBe("babylon-native");
        expect(args[args.indexOf("--backend") + 1]).toBe("local");
        const userFrame = args[args.indexOf("--user-frame") + 1]!;
        expect(userFrame).toBe(path.join(root, "artifacts/scenes/staged-palace/inputs/reference-0.png"));
        expect((await readFile(userFrame)).length).toBeGreaterThan(8);
        return 0;
      }
      const sceneId = args[args.indexOf("--scene-id") + 1]!;
      const artifactRoot = path.join(root, "artifacts/scenes", sceneId);
      const publicPlanRoot = path.join(root, "apps/playground/public/scene-plans", sceneId);
      await mkdir(artifactRoot, { recursive: true });
      await mkdir(publicPlanRoot, { recursive: true });
      const template = await readFile(path.resolve(".codex/skills/worldkit-spatial-planner/references/scene-brief-template.md"), "utf8");
      const brief = template.match(/```md\r?\n([\s\S]*?)\r?\n```/)![1]!;
      const briefPath = path.join(artifactRoot, "scene-brief.md");
      await writeFile(briefPath, brief);
      const instructionPath = path.join(artifactRoot, "test-instruction.md");
      await writeFile(instructionPath, "synthetic Planner delivery for stage-control regression");
      const identity = { repositoryRoot: root, artifactRoot, publicPlanRoot, sceneId,
        sceneSourceKind: "babylon-native" as const, taskId: "planner-stage-test", routerRequestId: "planner-stage-test-request", instructionPath };
      const prepared = await preparePlannerExecutionV1(identity);
      // Synthetic fixtures, not model output or visual-fidelity evidence.
      for (const [name, width, height] of [["entry-whitebox-target.png", 1600, 900], ["world-plan.png", 400, 400]] as const) {
        await writeFile(path.join(publicPlanRoot, name), await sharp({ create: {
          width, height, channels: 3, background: "#B7E4C7",
        } }).composite([
          { input: { create: { width: 40, height: 80, channels: 3, background: "#E85D5D" } }, left: width / 2 - 20, top: height - 100 },
          { input: { create: { width: 80, height: 80, channels: 3, background: "#F28E2B" } }, left: 100, top: 100 },
        ]).png().toBuffer());
      }
      const checked = await runPlannerSelfCheck({ sceneId, sceneSourceKind: "babylon-native", briefPath,
        worldPlanPath: path.join(publicPlanRoot, "world-plan.png"),
        entryPath: path.join(publicPlanRoot, "entry-whitebox-target.png"),
        reportPath: path.join(artifactRoot, "planner-self-check.json") });
      expect(checked).toMatchObject({ status: "passed" });
      await replayPlannerExecutionV1({ ...identity, requestHash: prepared.requestHash });
      await writeVisualIdentityPalette({ sceneId, sceneSourceKind: "babylon-native", briefPath,
        outputPath: path.join(artifactRoot, "visual-identity-palette.json") });
      return 0;
    },
  };
  const request = parseWorldAgentArgumentsV1(["--scene-id", "staged-palace", "--plan-only", "--image", reference, "reconstruct the palace"]);
  return { root, reference, calls, options, request };
}

describe("Native staged world production", () => {
  it("classifies Host copy failure after passed planning and preserves delivery without launching Builder", async () => {
    const { root, calls, options, request } = await fixture();
    const artifactRoot = path.join(root, "artifacts/scenes/staged-palace");
    const publicPlanRoot = path.join(root, "apps/playground/public/scene-plans/staged-palace");
    const paths = [path.join(artifactRoot, "scene-brief.md"),
      path.join(artifactRoot, "planner-self-check.json"),
      path.join(artifactRoot, "planner-execution.json"),
      path.join(publicPlanRoot, "world-plan.png"),
      path.join(publicPlanRoot, "entry-whitebox-target.png")];
    let deliveredBytes: Buffer[] = [];
    const failure = runNativeWorldAgentV1(request, { ...options, runProcess: async (...args) => {
      const exitCode = await options.runProcess(...args);
      deliveredBytes = await Promise.all(paths.map((file) => readFile(file)));
      // Inject a genuine exclusive-copy conflict only after the real synthetic
      // Planner check/replay passed, not a rejected or missing model output.
      const parent = path.dirname(artifactRoot);
      const stagedName = (await readdir(parent)).find((name) => name.startsWith(".staged-palace.native-case-"));
      expect(stagedName).toBeDefined();
      await mkdir(path.join(parent, stagedName!, "planner-executions", "planner-stage-test"), { recursive: true });
      return exitCode;
    } });
    await expect(failure).rejects.toMatchObject({
      message: "NATIVE_WORLD_PLANNER_HANDOFF_FAILED:EEXIST", cause: { code: "EEXIST" },
    });
    expect(calls).toEqual(["bash"]);
    expect(await Promise.all(paths.map((file) => readFile(file)))).toEqual(deliveredBytes);
    await expect(verifyAcceptedPlannerExecutionV1({ artifactRoot, sceneId: request.sceneId,
      sceneSourceKind: "babylon-native", plannerSelfCheckPath: paths[1]!,
    })).resolves.toMatchObject({ taskId: "planner-stage-test" });
    await expect(readFile(path.join(artifactRoot, "case.json"))).rejects.toMatchObject({ code: "ENOENT" });
    expect((await readdir(path.dirname(artifactRoot))).filter((name) => name.startsWith(".staged-palace.native-case-")))
      .toEqual([]);
  });

  it("full production without a user appearance image does not start a visual task", async () => {
    const { calls, options, request } = await fixture();
    const result = await runNativeWorldAgentV1({ ...request, mode: "full", imagePaths: [] }, options);
    expect(result.exitCode).toBe(0);
    expect(calls).toEqual(["bash", "pnpm"]);
  });

  it("plan-only freezes a valid Case without Builder, then build-only consumes it without the uploaded path", async () => {
    const { root, reference, calls, options, request } = await fixture();
    const plan = await runNativeWorldAgentV1(request, options);
    expect(plan).toMatchObject({ kind: "native-world-plan-result", phase: "plan-ready", exitCode: 0 });
    expect(calls).toEqual(["bash"]);
    const caseHash = sha256Bytes(await readFile(plan.casePath));
    const frozenReference = path.join(root, "artifacts/scenes/staged-palace/inputs/reference-0.png");
    expect(await readFile(frozenReference)).toEqual(await readFile(reference));
    await rm(reference);
    const built = await runNativeWorldAgentV1(parseWorldAgentArgumentsV1([
      "--scene-id", "staged-palace", "--build-only",
    ]), options);
    expect(built.kind).toBe("native-world-agent-result");
    expect(calls).toEqual(["bash", "pnpm", "bash"]);
    expect(sha256Bytes(await readFile(plan.casePath))).toBe(caseHash);
  });

  it("does not start styling after a failed whitebox production", async () => {
    const { calls, options, request } = await fixture();
    await runNativeWorldAgentV1(request, options);
    const result = await runNativeWorldAgentV1(parseWorldAgentArgumentsV1([
      "--scene-id", "staged-palace", "--build-only",
    ]), { ...options, runProcess: async (...args) => {
      const exitCode = await options.runProcess(...args);
      return args[0] === "pnpm" ? 7 : exitCode;
    } });
    expect(result.exitCode).toBe(7);
    expect(calls).toEqual(["bash", "pnpm"]);
  });

  it("propagates the visual child failure without resubmitting Builder or Planner", async () => {
    const { root, calls, options, request } = await fixture();
    await runNativeWorldAgentV1(request, options);
    const before = await readFile(path.join(root, "artifacts/scenes/staged-palace/case.json"));
    const result = await runNativeWorldAgentV1(parseWorldAgentArgumentsV1([
      "--scene-id", "staged-palace", "--build-only",
    ]), { ...options, runProcess: async (...args) => {
      const exitCode = await options.runProcess(...args);
      return args[1][0]?.endsWith("run-styled-opening-frame-agent.sh") ? 9 : exitCode;
    } });
    expect(result.exitCode).toBe(9);
    expect(calls).toEqual(["bash", "pnpm", "bash"]);
    expect(await readFile(path.join(root, "artifacts/scenes/staged-palace/case.json"))).toEqual(before);
  });

  it("build-only without an admitted plan does not pay for planning or create partial Case output", async () => {
    const { root, calls, options } = await fixture();
    await expect(runNativeWorldAgentV1(parseWorldAgentArgumentsV1([
      "--scene-id", "missing-plan", "--build-only",
    ]), options)).rejects.toThrow("NATIVE_WORLD_PLAN_REQUIRED");
    expect(calls).toEqual([]);
    await expect(readFile(path.join(root, "artifacts/scenes/missing-plan/case.json")))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("stale frozen Planner images fail before production handoff and do not trigger a replacement Planner", async () => {
    const { root, calls, options, request } = await fixture();
    await runNativeWorldAgentV1(request, options);
    await writeFile(path.join(root, "artifacts/scenes/staged-palace/inputs/world-plan.png"), "stale plan");
    await expect(runNativeWorldAgentV1(parseWorldAgentArgumentsV1([
      "--scene-id", "staged-palace", "--build-only",
    ]), options)).rejects.toThrow();
    expect(calls).toEqual(["bash"]);
  });

  it("retains failed Planner delivery without treating it as an admitted plan", async () => {
    const { root, options, request } = await fixture();
    await expect(runNativeWorldAgentV1(request, { ...options,
      runProcess: async (...args) => { await options.runProcess(...args); return 2; },
    })).rejects.toThrow("NATIVE_WORLD_UNIFIED_PLANNING_FAILED:2");
    const artifactRoot = path.join(root, "artifacts/scenes/staged-palace");
    expect(await readFile(path.join(artifactRoot, "scene-brief.md"), "utf8")).toContain("WorldKit");
    expect(await readFile(path.join(artifactRoot, "planner-execution.json"), "utf8")).toContain("requestHash");
    await expect(readFile(path.join(artifactRoot, "case.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
