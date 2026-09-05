import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { sha256Bytes } from "@whitebox-world/protocol";
import { afterEach, describe, expect, it } from "vitest";

import {
  copyAcceptedPlannerExecutionV1,
  preparePlannerExecutionV1,
  replayPlannerExecutionV1,
  verifyAcceptedPlannerExecutionV1,
} from "./planner-execution.js";
import { NATIVE_BLOCK_RECONSTRUCTION_FORMAL_BUDGETS_V1, NATIVE_BLOCK_PLANNER_BUDGET_CONTEXT_V1 } from "../reconstruction/native-block-production-budget.js";

const roots: string[] = [];
const SKILL = ".codex/skills/worldkit-spatial-planner";
const CHECKER = `${SKILL}/scripts/self-check.mjs`;
// A real child process, not a mocked replay. Its output reveals exactly which
// frozen script ran and which semantic input bytes it consumed.
const checker = `import { readFileSync, writeFileSync } from 'node:fs';
const args = Object.fromEntries(process.argv.slice(2).reduce((rows, value, i, all) =>
  i % 2 === 0 ? [...rows, [value, all[i + 1]]] : rows, []));
const report = { status: 'passed', checker: 'original', brief: readFileSync(args['--brief'], 'utf8') };
writeFileSync(args['--report'], JSON.stringify(report));
`;

async function fixture(sceneSourceKind: "canonical" | "babylon-native" = "babylon-native") {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "worldkit-planner-execution-")));
  roots.push(root);
  await mkdir(path.join(root, SKILL, "scripts"), { recursive: true });
  await mkdir(path.join(root, SKILL, "references"));
  await writeFile(path.join(root, SKILL, "SKILL.md"), "Original Planner Skill");
  await writeFile(path.join(root, SKILL, "references/contract.md"), "Original contract");
  await writeFile(path.join(root, CHECKER), checker);
  await mkdir(path.join(root, "assets/terrain-height-intent"), { recursive: true });
  await writeFile(path.join(root, "assets/terrain-height-intent/exemplar.json"), "{}");
  const artifactRoot = path.join(root, "artifacts/scenes/test-scene");
  const publicPlanRoot = path.join(root, "apps/playground/public/scene-plans/test-scene");
  await mkdir(artifactRoot, { recursive: true });
  await mkdir(publicPlanRoot, { recursive: true });
  await writeFile(path.join(artifactRoot, "scene-brief.md"), "Original Brief");
  await writeFile(path.join(artifactRoot, "planner-self-check.json"), JSON.stringify({
    status: "passed", checker: "original", brief: "Original Brief",
  }));
  const instructionPath = path.join(root, "instruction.txt");
  await writeFile(instructionPath, "Use the original Planner Skill");
  const input = {
    repositoryRoot: root, artifactRoot, publicPlanRoot, sceneId: "test-scene",
    sceneSourceKind, taskId: "planner-test-001", routerRequestId: "test-scene-planner-001",
    instructionPath,
  };
  return { root, input, prepared: await preparePlannerExecutionV1(input) };
}

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe("Planner execution identity", () => {
  it("freezes the actual Native production representation budget before planning", async () => {
    const native = await fixture();
    const ref = "context/native-block-production-budget.json";
    const bytes = await readFile(path.join(native.prepared.workspaceContextRoot, ref));
    const context = JSON.parse(bytes.toString("utf8"));
    expect(context.budgets).toEqual(NATIVE_BLOCK_RECONSTRUCTION_FORMAL_BUDGETS_V1);
    expect(context.blockSizeMetersXYZByShape.full).toEqual([1, 1, 1]);
    expect(context.blockSizeMetersXYZByShape.step).toEqual([1, 0.25, 1]);
    const request = JSON.parse(await readFile(native.prepared.requestPath, "utf8"));
    expect(request.contextFiles).toContainEqual({ inputRef: ref, contentHash: sha256Bytes(bytes) });
    const canonical = await fixture("canonical");
    await expect(readFile(path.join(canonical.prepared.workspaceContextRoot, ref)))
      .rejects.toMatchObject({ code: "ENOENT" });
    await replayPlannerExecutionV1({ ...native.input, requestHash: native.prepared.requestHash });
    await expect(verifyAcceptedPlannerExecutionV1({ ...native.input,
      plannerSelfCheckPath: path.join(native.input.artifactRoot, "planner-self-check.json"),
      requiredNativeProductionContext: NATIVE_BLOCK_PLANNER_BUDGET_CONTEXT_V1,
    })).resolves.toMatchObject({ requestHash: native.prepared.requestHash });
    await expect(verifyAcceptedPlannerExecutionV1({ ...native.input,
      plannerSelfCheckPath: path.join(native.input.artifactRoot, "planner-self-check.json"),
      requiredNativeProductionContext: { ...NATIVE_BLOCK_PLANNER_BUDGET_CONTEXT_V1,
        budgets: { ...NATIVE_BLOCK_RECONSTRUCTION_FORMAL_BUDGETS_V1, maximumBlockCount: 2_000 } },
    })).rejects.toThrow("PLANNER_EXECUTION_PRODUCTION_BUDGET_MISMATCH");
    await chmod(path.join(native.prepared.workspaceContextRoot, ref), 0o600);
    await writeFile(path.join(native.prepared.workspaceContextRoot, ref), "{}");
    await expect(replayPlannerExecutionV1({ ...native.input, requestHash: native.prepared.requestHash }))
      .rejects.toThrow("PLANNER_EXECUTION_CONTEXT_CHANGED");
  });
  it.each(["canonical", "babylon-native"] as const)(
    "%s replays the dispatched snapshot after live Skill/checker/instruction replacement",
    async (source) => {
      const { root, input, prepared } = await fixture(source);
      await writeFile(path.join(root, CHECKER), "throw new Error('LIVE_CHECKER_MUST_NOT_RUN');");
      await writeFile(path.join(root, SKILL, "SKILL.md"), "New Skill");
      await writeFile(input.instructionPath, "New instruction");
      expect(await readFile(prepared.instructionPath, "utf8")).toBe("Use the original Planner Skill");
      expect(await readFile(path.join(prepared.workspaceContextRoot, SKILL, "SKILL.md"), "utf8"))
        .toBe("Original Planner Skill");
      const receipt = await replayPlannerExecutionV1({ ...input, requestHash: prepared.requestHash });
      expect(receipt.requestHash).toBe(prepared.requestHash);
      expect(receipt.plannerSelfCheckHash).toBe(sha256Bytes(await readFile(
        path.join(input.artifactRoot, "planner-self-check.json"),
      )));
      await expect(verifyAcceptedPlannerExecutionV1({
        ...input, plannerSelfCheckPath: path.join(input.artifactRoot, "planner-self-check.json"),
      })).resolves.toMatchObject({ requestHash: prepared.requestHash });
      // Replaying an admitted stage is Host-only and does not alter its identity.
      const before = await readFile(path.join(input.artifactRoot, "planner-execution.json"));
      await replayPlannerExecutionV1({ ...input, requestHash: prepared.requestHash });
      expect(await readFile(path.join(input.artifactRoot, "planner-execution.json"))).toEqual(before);
    },
  );

  it("sends only the selected Source context to the task", async () => {
    const native = await fixture();
    await expect(readFile(path.join(native.prepared.workspaceContextRoot,
      "assets/terrain-height-intent/exemplar.json"))).rejects.toMatchObject({ code: "ENOENT" });
    const canonical = await fixture("canonical");
    expect(await readFile(path.join(canonical.prepared.workspaceContextRoot,
      "assets/terrain-height-intent/exemplar.json"), "utf8")).toBe("{}");
  });

  it.each(["checker", "reference", "extra", "symlink"])(
    "rejects frozen context %s tampering before running it",
    async (kind) => {
      const { input, prepared } = await fixture();
      const target = path.join(prepared.workspaceContextRoot,
        kind === "reference" ? `${SKILL}/references/contract.md` : CHECKER);
      if (kind === "extra") {
        await writeFile(path.join(prepared.workspaceContextRoot, "extra.txt"), "undeclared");
      } else if (kind === "symlink") {
        await rm(target);
        await symlink(path.join(input.repositoryRoot, CHECKER), target);
      } else {
        await chmod(target, 0o600);
        await writeFile(target, "modified");
      }
      await expect(replayPlannerExecutionV1({ ...input, requestHash: prepared.requestHash }))
        .rejects.toThrow("PLANNER_EXECUTION_CONTEXT_CHANGED");
      await expect(readFile(path.join(input.artifactRoot, "planner-execution.json")))
        .rejects.toMatchObject({ code: "ENOENT" });
    },
  );

  it("rejects stale task and source identity", async () => {
    const { input, prepared } = await fixture();
    await expect(replayPlannerExecutionV1({ ...input, requestHash: `sha256:${"0".repeat(64)}` }))
      .rejects.toThrow("PLANNER_EXECUTION_REQUEST_MISMATCH");
    await expect(replayPlannerExecutionV1({ ...input, sceneSourceKind: "canonical", requestHash: prepared.requestHash }))
      .rejects.toThrow("PLANNER_EXECUTION_REQUEST_MISMATCH");
  });

  it("preserves both reports on mismatch and does not publish a passed receipt", async () => {
    const { input, prepared } = await fixture();
    await writeFile(path.join(input.artifactRoot, "scene-brief.md"), "changed after Agent self-check");
    await expect(replayPlannerExecutionV1({ ...input, requestHash: prepared.requestHash }))
      .rejects.toThrow("PLANNER_EXECUTION_REPORT_MISMATCH");
    expect(await readFile(path.join(prepared.executionDirectoryPath, "planner-self-check.host.json"), "utf8"))
      .toContain("changed after Agent self-check");
    expect(await readFile(path.join(input.artifactRoot, "planner-self-check.json"), "utf8"))
      .toContain("Original Brief");
  });

  it("refuses to overwrite an existing task snapshot", async () => {
    const { input, prepared } = await fixture();
    await expect(preparePlannerExecutionV1(input)).rejects.toMatchObject({ code: "EEXIST" });
    expect(await readFile(path.join(prepared.workspaceContextRoot, CHECKER), "utf8")).toBe(checker);
  });

  it("binds accepted planning bytes on resume, not merely scene id or filenames", async () => {
    const { input, prepared } = await fixture();
    await replayPlannerExecutionV1({ ...input, requestHash: prepared.requestHash });
    const plannerSelfCheckPath = path.join(input.artifactRoot, "planner-self-check.json");
    await writeFile(plannerSelfCheckPath, "{}");
    await expect(verifyAcceptedPlannerExecutionV1({ ...input, plannerSelfCheckPath }))
      .rejects.toThrow("PLANNER_EXECUTION_REPORT_MISMATCH");
  });

  it("preserves request, frozen Skill and Host receipt through Native Case publication", async () => {
    const { root, input, prepared } = await fixture();
    await replayPlannerExecutionV1({ ...input, requestHash: prepared.requestHash });
    const destinationArtifactRoot = path.join(root, "staged-case");
    const destinationPlannerSelfCheckPath = path.join(destinationArtifactRoot, "inputs/planner-self-check.json");
    await mkdir(path.dirname(destinationPlannerSelfCheckPath), { recursive: true });
    await writeFile(destinationPlannerSelfCheckPath,
      await readFile(path.join(input.artifactRoot, "planner-self-check.json")));
    await copyAcceptedPlannerExecutionV1({ ...input, destinationArtifactRoot,
      sourcePlannerSelfCheckPath: path.join(input.artifactRoot, "planner-self-check.json"),
      destinationPlannerSelfCheckPath });
    await rm(input.artifactRoot, { recursive: true, force: true });
    await expect(verifyAcceptedPlannerExecutionV1({ ...input, artifactRoot: destinationArtifactRoot,
      plannerSelfCheckPath: destinationPlannerSelfCheckPath })).resolves.toMatchObject({ requestHash: prepared.requestHash });
    await expect(copyAcceptedPlannerExecutionV1({ ...input, artifactRoot: destinationArtifactRoot,
      destinationArtifactRoot, sourcePlannerSelfCheckPath: destinationPlannerSelfCheckPath,
      destinationPlannerSelfCheckPath })).rejects.toMatchObject({ code: "EEXIST" });
  });

  it("delivers the frozen context through the real local task router before Host replay", async () => {
    const { root, input, prepared } = await fixture();
    const fakeCodex = path.join(root, "fake-codex.mjs");
    await writeFile(fakeCodex, `#!/usr/bin/env node
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
if (process.argv.includes('--version')) { console.log('codex test'); process.exit(0); }
if (readFileSync('${SKILL}/SKILL.md', 'utf8') !== 'Original Planner Skill') process.exit(31);
mkdirSync('artifacts/scenes/test-scene', { recursive: true });
writeFileSync('artifacts/scenes/test-scene/scene-brief.md', 'Original Brief');
const child = spawnSync(process.execPath, ['${CHECKER}', '--brief', 'artifacts/scenes/test-scene/scene-brief.md', '--report', 'artifacts/scenes/test-scene/planner-self-check.json']);
if (child.status !== 0) process.exit(32);
const lastMessage = process.argv.indexOf('--output-last-message');
if (lastMessage >= 0) writeFileSync(process.argv[lastMessage + 1], 'finished');
`, { mode: 0o700 });
    await writeFile(path.join(root, CHECKER), "throw new Error('LIVE_CHECKER_MUST_NOT_RUN');");
    await writeFile(path.join(root, SKILL, "SKILL.md"), "New live Skill");
    const result = await promisify(execFile)(process.execPath, [
      path.resolve("scripts/agents/run-codex-task.mjs"), "--backend", "local",
      "--repo-root", root, "--task-id", input.taskId, "--request-id", input.routerRequestId,
      "--instruction-file", prepared.instructionPath, "--workspace-context-root", prepared.workspaceContextRoot,
      "--output", `artifacts/scenes/test-scene/planner-self-check.json::${input.artifactRoot}/planner-self-check.json::application/json`,
    ], { env: { ...process.env, WORLDKIT_LOCAL_CODEX_BIN: fakeCodex, WORLDKIT_LOCAL_CODEX_SMOKE: "0" } });
    expect(result.stdout).toContain("WORLDKIT_LOCAL_CODEX_JOB");
    await expect(replayPlannerExecutionV1({ ...input, requestHash: prepared.requestHash }))
      .resolves.toMatchObject({ requestHash: prepared.requestHash });
  });
});
