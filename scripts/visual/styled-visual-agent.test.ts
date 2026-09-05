import { spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runStyledVisualAgent } from "./run-styled-visual-agent.js";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const sceneId = "visual-agent-fixture";
const targetIds = ["traveler", "palace"];
const png = new PNG({ width: 2, height: 2 });
png.data.fill(255);
const pixels = PNG.sync.write(png);
const bundle = () => ({ kind: "worldkit-visual-generation-prompts", schemaVersion: 2, sceneId,
  openingFrame: { referenceRoles: ["actual-whitebox-opening", "user-first-frame"], prompt: "o".repeat(200) },
  styledTriviews: targetIds.map(visualTargetId => ({ visualTargetId,
    referenceRoles: ["target-whitebox-triview", "styled-opening-frame", "user-first-frame"], prompt: "t".repeat(150) })) });
async function fixture() {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "styled-agent-test-")));
  roots.push(root);
  const sceneRoot = path.join(root, "artifacts/scenes", sceneId);
  const skill = ".codex/skills/worldkit-visual-reconstructor/SKILL.md";
  await mkdir(path.dirname(path.join(root, skill)), { recursive: true });
  await writeFile(path.join(root, skill), await readFile(path.resolve(skill)));
  for (const id of targetIds) {
    await mkdir(path.join(sceneRoot, "triviews", id), { recursive: true });
    await writeFile(path.join(sceneRoot, "triviews", id, "whitebox-triview.png"), pixels);
  }
  for (const [file, content] of Object.entries({
    "scene-brief.md": "A traveler walking toward a palace.",
    "scene-implementation-map.json": "{}",
    "runtime-snapshot.json": "{}",
    "visual-identity-palette.json": JSON.stringify({ targets: targetIds.map(visualTargetId => ({ visualTargetId })) }),
    "triviews/whitebox-triview-manifest.json": JSON.stringify({ kind: "worldkit-whitebox-triview-manifest", schemaVersion: 1,
      worldBuildIdentityHash: `sha256:${"a".repeat(64)}`, whiteboxTriviews: targetIds.map((visualTargetId, index) => ({
        visualTargetId, runtimeEntityIds: [visualTargetId], role: index ? "primary-landmark" : "primary-subject",
        semanticClassId: index ? "landmark.palace" : "subject.traveler", identityColor: index ? "#5D9FE8" : "#E85D5D",
        views: ["front", "right", "back"], imageUri: `${visualTargetId}/whitebox-triview.png`,
      })) }),
  })) await writeFile(path.join(sceneRoot, file), content);
  await writeFile(path.join(sceneRoot, "opening-frame.png"), pixels);
  const userFramePath = path.join(root, "appearance.png");
  await writeFile(userFramePath, pixels);
  return { repoRoot: root, sceneId, userFramePath, sceneRoot, backend: "local" as const, scope: "all" as const };
}
function argument(args: readonly string[], key: string) { return args[args.indexOf(key) + 1]!; }
async function deliver(args: readonly string[]) {
  for (let i = 0; i < args.length; i++) if (args[i] === "--output") {
    const [, local] = args[++i]!.split("::");
    await mkdir(path.dirname(local!), { recursive: true });
    await writeFile(local!, local!.endsWith(".json") ? JSON.stringify(bundle()) : pixels);
  }
}

describe("single-task styled visual production", () => {
  it("dispatches once with frozen evidence and the opening-first Skill, then finalizes every output", async () => {
    const input = await fixture();
    const dispatch = vi.fn(async (args: readonly string[]) => {
      expect(argument(args, "--execution-profile")).toBe("formal");
      expect(argument(args, "--backend")).toBe("local");
      expect(argument(args, "--stage")).toBe("visual-reconstruction");
      expect(args.filter(x => x === "--output")).toHaveLength(4);
      const root = argument(args, "--repo-root");
      expect(root).not.toBe(input.repoRoot);
      const instruction = await readFile(argument(args, "--instruction-file"), "utf8");
      expect(instruction).toContain("Only after accepting it, use that exact styled-opening-frame PNG");
      expect(instruction).toContain("at most one regeneration per failing image");
      const skill = await readFile(path.join(root, ".codex/skills/worldkit-visual-reconstructor/SKILL.md"), "utf8");
      expect(skill).toContain("Do not start tri-view generation before inspecting and accepting it");
      expect(skill).not.toContain('"provider":');
      for (let i = 0; i < args.length; i++) if (args[i] === "--asset") {
        const [, source] = args[++i]!.split("::");
        expect(source!.startsWith(root + path.sep)).toBe(true);
        expect(await readFile(source!)).toEqual(pixels);
      }
      await expect(access(path.join(input.sceneRoot, "styled-opening-frame-manifest.json"))).rejects.toThrow();
      await deliver(args);
    });
    await runStyledVisualAgent(input, dispatch);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const manifest = JSON.parse(await readFile(path.join(input.sceneRoot, "styled-triviews-manifest.json"), "utf8"));
    expect(manifest.targets.map((t: { visualTargetId: string }) => t.visualTargetId)).toEqual(targetIds);
    expect(manifest.targets[0].views).toEqual(["front", "right", "back"]);
    const taskRoot = argument(dispatch.mock.calls[0]![0], "--repo-root");
    expect(JSON.parse(await readFile(path.join(taskRoot, "dispatch-args.json"), "utf8")))
      .toEqual(dispatch.mock.calls[0]![0]);
    await expect(access(path.join(taskRoot, `artifacts/scenes/${sceneId}/styled-opening-frame.png`))).rejects.toThrow();
  });

  it("does not redispatch after the router fails or replace existing accepted visuals", async () => {
    const input = await fixture();
    await writeFile(path.join(input.sceneRoot, "styled-opening-frame.png"), "prior accepted bytes");
    const dispatch = vi.fn(async () => { throw new Error("provider terminal"); });
    await expect(runStyledVisualAgent(input, dispatch)).rejects.toThrow("provider terminal");
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(await readFile(path.join(input.sceneRoot, "styled-opening-frame.png"), "utf8")).toBe("prior accepted bytes");
    await expect(access(path.join(input.sceneRoot, "styled-opening-frame-report.json"))).rejects.toThrow();
  });

  it("preserves old Cloud retries, timeout cap, prior attempts and backoff through the actual dispatched stage", async () => {
    const input = await fixture();
    const dispatch = vi.fn(async (args: readonly string[]) => {
      const stage = argument(args, "--stage");
      // Exercise the router's actual Node ESM policy, without a model or network.
      const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
        import { canRetryTerminalTask, resolveTerminalTaskRetryPolicy, terminalTaskRetryDelayMs }
          from "./scripts/agents/lwdp-codex-task-retry.mjs";
        const stage = process.argv[1];
        const policy = resolveTerminalTaskRetryPolicy(stage, undefined, {});
        const configured = resolveTerminalTaskRetryPolicy(stage, undefined, {
          WORLDKIT_VISUAL_RECONSTRUCTION_MAX_ATTEMPTS: "2",
          WORLDKIT_LWDP_VISUAL_PRIOR_ATTEMPTS: "1",
          WORLDKIT_VISUAL_RECONSTRUCTION_RETRY_DELAY_MS: "42",
        });
        console.log(JSON.stringify({ maximumAttempts: policy.maximumAttempts,
          delays: [1, 2].map(i => terminalTaskRetryDelayMs(policy, i)),
          capacity: [1, 2, 3].map(i => canRetryTerminalTask(policy, i, "capacity")),
          timeout: [1, 2].map(i => canRetryTerminalTask(policy, i, "task-timeout")),
          unknown: canRetryTerminalTask(policy, 1, null), configured,
          exhausted: canRetryTerminalTask(configured, 1, "capacity") }));
      `, stage], { encoding: "utf8", timeout: 10_000 });
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ maximumAttempts: 3,
        delays: [30_000, 120_000], capacity: [true, true, false], timeout: [true, false],
        unknown: false, configured: { stage, maximumAttempts: 2, priorAttempts: 1, baseDelayMs: 42 },
        exhausted: false,
      });
      await deliver(args);
    });
    await runStyledVisualAgent({ ...input, backend: "cloud" }, dispatch);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it.each(["live", "snapshot"])("rejects changed %s input before replacing any visual output", async (where) => {
    const input = await fixture();
    await expect(runStyledVisualAgent(input, async args => {
      await deliver(args);
      const root = where === "live" ? input.repoRoot : argument(args, "--repo-root");
      await writeFile(path.join(root, `artifacts/scenes/${sceneId}/scene-brief.md`), "changed");
    })).rejects.toThrow("Visual input changed during task");
    await expect(access(path.join(input.sceneRoot, "styled-opening-frame.png"))).rejects.toThrow();
  });

  it("rejects an incomplete delivery before promoting opening or writing passed", async () => {
    const input = await fixture();
    await expect(runStyledVisualAgent(input, async args => {
      await deliver(args);
      await rm(path.join(argument(args, "--repo-root"), `artifacts/scenes/${sceneId}/triviews/palace/styled-triview.png`));
    })).rejects.toThrow();
    await expect(access(path.join(input.sceneRoot, "styled-opening-frame.png"))).rejects.toThrow();
    await expect(access(path.join(input.sceneRoot, "styled-opening-frame-report.json"))).rejects.toThrow();
  });

  it("reuses the accepted opening exactly for tri-views-only and rejects a stale anchor before dispatch", async () => {
    const input = await fixture();
    await runStyledVisualAgent(input, deliver);
    const before = await readFile(path.join(input.sceneRoot, "styled-opening-frame-manifest.json"));
    const dispatch = vi.fn(async (args: readonly string[]) => {
      expect(args.filter(x => x === "--output")).toHaveLength(2);
      expect(args.some(x => x.startsWith("styled-opening-frame::"))).toBe(true);
      expect(await readFile(argument(args, "--instruction-file"), "utf8")).toContain("already accepted");
      await deliver(args);
    });
    await runStyledVisualAgent({ ...input, scope: "triviews" }, dispatch);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(await readFile(path.join(input.sceneRoot, "styled-opening-frame-manifest.json"))).toEqual(before);
    await writeFile(path.join(input.sceneRoot, "styled-opening-frame.png"), Buffer.concat([pixels, Buffer.from("changed")]));
    await expect(runStyledVisualAgent({ ...input, scope: "triviews" }, dispatch)).rejects.toThrow("acceptance is missing or stale");
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("routes the public first-frame entry to the same task and removes concurrent Gemini generation", async () => {
    const source = await readFile("scripts/visual/run-styled-opening-frame-agent.sh", "utf8");
    expect(source).toContain("run-styled-visual-agent.ts");
    expect(source).not.toContain("run-gemini-visual-pipeline.py");
  });

  it("rejects tri-views-only when a whitebox target changed since opening acceptance", async () => {
    const input = await fixture();
    await runStyledVisualAgent(input, deliver);
    await writeFile(path.join(input.sceneRoot, "triviews/palace/whitebox-triview.png"),
      Buffer.concat([pixels, Buffer.from("changed target")]));
    const dispatch = vi.fn(deliver);
    await expect(runStyledVisualAgent({ ...input, scope: "triviews" }, dispatch)).rejects.toThrow("acceptance is missing or stale");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it.each(["local", "cloud"] as const)("passes %s formal router preflight without spawning a model", async backend => {
    const input = await fixture();
    const dispatch = vi.fn(async (args: readonly string[]) => {
      const result = spawnSync(process.execPath, [path.resolve("scripts/agents/run-codex-task.mjs"), ...args], {
        encoding: "utf8", timeout: 30_000,
        env: { ...process.env, WORLDKIT_LOCAL_CODEX_SMOKE: "1", WORLDKIT_LWDP_CLIENT_SMOKE: "1" },
      });
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain(`WORLDKIT_CODEX_BACKEND ${backend}`);
      expect(result.stdout).toContain("profile=formal model=gpt-5.6-sol reasoning=xhigh");
      await deliver(args);
    });
    await runStyledVisualAgent({ ...input, backend }, dispatch);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
