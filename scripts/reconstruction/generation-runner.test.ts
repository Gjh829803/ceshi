import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { runNativeBlockGenerationV1, type CodexTaskProcessPortV1 } from "./generation-runner.js";
import {
  createCodexTaskProcessPortV1,
  reconcileCodexTaskCreationV1,
} from "./codex-task-process-port.js";

const expectedOutputs = ["scene.ts", "native-block-authoring.json", "native-resources.json"] as const;
const completedTaskOutcome = {
  kind: "worldkit-codex-task-outcome",
  schemaVersion: 1,
  requestId: "native-block-generation-cloud-temple-initial",
  outcome: "completed",
} as const;

async function preparedFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "worldkit-generation-runner-"));
  const stagingDirectoryPath = path.join(root, "attempts", "0", ".staging");
  const sourceDirectoryPath = path.join(root, "attempts", "0", "source");
  await mkdir(stagingDirectoryPath, { recursive: true });
  return {
    root,
    stagingDirectoryPath,
    sourceDirectoryPath,
    generationRequest: {
      kind: "native-block-generation-request", schemaVersion: 1,
      id: "cloud-temple.initial",
      routeDecisionRef: "worldkit://route/test@1", routeDecisionHash: `sha256:${"d".repeat(64)}`,
      sceneBriefRef: "scene-brief.md", sceneBriefHash: `sha256:${"e".repeat(64)}`,
      referenceInputs: [], codexExecutionProfileRef: "worldkit://codex-execution-profile/formal@1", codexExecutionProfileHash: `sha256:${"f".repeat(64)}`,
      taskInstructionRef: "instruction.md", taskInstructionHash: `sha256:${"1".repeat(64)}`, builderSkillRef: "skill.md", builderSkillHash: `sha256:${"2".repeat(64)}`,
      workspaceContextManifestRef: "manifest.json", workspaceContextManifestHash: `sha256:${"3".repeat(64)}`, contextInputs: [],
      nativeSceneApiRef: "api.json", nativeSceneApiHash: `sha256:${"4".repeat(64)}`, nativeSceneProfileRef: "profile.json", nativeSceneProfileHash: `sha256:${"5".repeat(64)}`,
      blockProfileRef: "block.json", blockProfileHash: `sha256:${"6".repeat(64)}`, bootstrapInputRef: "bootstrap.json", bootstrapInputHash: `sha256:${"7".repeat(64)}`,
      seed: 1, budgets: { maximumStaticColliderCount: 1, maximumStaticColliderVertexCount: 1, maximumStaticColliderTriangleCount: 1, maximumOutputBytes: 10000, timeoutSeconds: 1_800 },
      declaredOutputPaths: expectedOutputs,
    } as const,
    generationRequestHash: `sha256:${"a".repeat(64)}`,
    routerRequestId: "native-block-generation-cloud-temple-initial",
    routerTaskPayloadHash: `sha256:${"b".repeat(64)}`,
    backend: "cloud" as const,
    routerExecutablePath: "/workspace/scripts/agents/run-codex-task.mjs",
    routerArguments: ["--backend", "cloud"],
    taskWorkspacePath: path.join(root, "task-workspace"),
  };
}

async function writeOutputs(directory: string) {
  await Promise.all(expectedOutputs.map((output) => writeFile(path.join(directory, output), `${output}\n`)));
}

describe("runNativeBlockGenerationV1", () => {
  it("parses the router envelope and reaches cloud GET-only reconciliation through the production process port", async () => {
    const prepared = await preparedFixture();
    const fakeRouter = path.join(prepared.root, "fake-router.mjs");
    const observedArguments = path.join(prepared.root, "reconcile-arguments.json");
    await writeFile(fakeRouter, `
import { writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const valueAfter = (name) => args[args.indexOf(name) + 1];
const requestId = valueAfter("--request-id");
if (args.includes("--reconcile-only")) {
  writeFileSync(${JSON.stringify(observedArguments)}, JSON.stringify(args));
  console.log("WORLDKIT_CODEX_TASK_OUTCOME " + JSON.stringify({ kind: "worldkit-codex-task-outcome", schemaVersion: 1, requestId, outcome: "request-found" }));
  process.exit(0);
}
console.log("WORLDKIT_CODEX_TASK_OUTCOME " + JSON.stringify({ kind: "worldkit-codex-task-outcome", schemaVersion: 1, requestId, outcome: "creation-outcome-unknown" }));
process.exit(1);
`);
    try {
      const port = createCodexTaskProcessPortV1();
      const processResult = await port.run({
        executablePath: fakeRouter,
        arguments: ["--request-id", prepared.routerRequestId],
        cwd: prepared.root,
        requestId: prepared.routerRequestId,
      });
      expect(processResult.taskOutcome?.outcome).toBe("creation-outcome-unknown");
      const reconciliation = await reconcileCodexTaskCreationV1({
        executablePath: fakeRouter,
        backend: "cloud",
        requestId: prepared.routerRequestId,
        cwd: prepared.root,
      });
      expect(reconciliation).toEqual({ outcome: "unknown" });
      const argumentsValue = JSON.parse(await readFile(observedArguments, "utf8"));
      expect(argumentsValue).toEqual([
        "--backend", "cloud",
        "--reconcile-only",
        "--task-id", prepared.routerRequestId,
        "--request-id", prepared.routerRequestId,
      ]);
      expect(argumentsValue).not.toContain("--submit-attempts");
    } finally {
      await rm(prepared.root, { recursive: true, force: true });
    }
  });

  it("promotes exactly three non-empty outputs only after successful router and self-check", async () => {
    const prepared = await preparedFixture();
    const calls: unknown[] = [];
    const port: CodexTaskProcessPortV1 = { run: async (runInput) => { calls.push(runInput); await writeOutputs(prepared.stagingDirectoryPath); return { exitCode: 0, stdout: "WORLDKIT_LWDP_JOB coding-agent native-block-generation-cloud-temple-initial gen_cd640a435a24fae0 dispatch=single-task-fast-path profile=formal model=gpt-5.6-sol reasoning=xhigh\n", stderr: "", taskOutcome: completedTaskOutcome }; } };
    try {
      const result = await runNativeBlockGenerationV1(prepared, {
        process: port,
        selfCheck: async () => ({ ok: true, diagnosticCodes: [] }),
        reconcile: async () => ({ outcome: "missing" }),
        cleanup: async () => ({ outcome: "completed" }),
      });
      expect(result.receipt.outcome).toBe("completed");
      expect(result.receipt.outputs.map((output) => output.path)).toEqual([...expectedOutputs].sort());
      expect(calls).toHaveLength(1);
      expect((calls[0] as { executablePath: string }).executablePath).toMatch(/run-codex-task\.mjs$/);
      expect(await readFile(path.join(prepared.sourceDirectoryPath, "scene.ts"), "utf8")).toBe("scene.ts\n");
      await expect(readFile(prepared.stagingDirectoryPath, "utf8")).rejects.toThrow();
    } finally { await rm(prepared.root, { recursive: true, force: true }); }
  });

  it.each([
    ["no output", async (directory: string) => { void directory; }],
    ["empty output", async (directory: string) => { await writeOutputs(directory); await writeFile(path.join(directory, "scene.ts"), ""); }],
    ["unexpected output", async (directory: string) => { await writeOutputs(directory); await writeFile(path.join(directory, "extra.txt"), "no"); }],
  ])("rejects %s without partial promotion", async (_label, createOutputs) => {
    const prepared = await preparedFixture();
    try {
      const result = await runNativeBlockGenerationV1(prepared, {
        process: { run: async () => { await createOutputs(prepared.stagingDirectoryPath); return { exitCode: 0, stdout: "", stderr: "" }; } },
        selfCheck: async () => ({ ok: true, diagnosticCodes: [] }), reconcile: async () => ({ outcome: "missing" }), cleanup: async () => ({ outcome: "completed" }),
      });
      expect(result.receipt.outcome).not.toBe("completed");
      await expect(readFile(path.join(prepared.sourceDirectoryPath, "scene.ts"), "utf8")).rejects.toThrow();
    } finally { await rm(prepared.root, { recursive: true, force: true }); }
  });

  it("retains both prior evidence and the root diagnostic when rejected-source already exists", async () => {
    const prepared = await preparedFixture();
    const rejectedSourcePath = path.join(path.dirname(prepared.stagingDirectoryPath), "rejected-source");
    try {
      await mkdir(rejectedSourcePath);
      await writeFile(path.join(rejectedSourcePath, "scene.ts"), "prior evidence");
      const result = await runNativeBlockGenerationV1(prepared, {
        process: { run: async () => {
          await writeOutputs(prepared.stagingDirectoryPath);
          return { exitCode: 0, stdout: "WORLDKIT_LWDP_JOB coding-agent native-block-generation-cloud-temple-initial job-1 dispatch=single-task-fast-path profile=formal model=gpt-5.6-sol reasoning=xhigh\n", stderr: "", taskOutcome: completedTaskOutcome };
        } },
        selfCheck: async () => ({ ok: false, diagnosticCodes: ["self-check-failed"] }),
        reconcile: async () => ({ outcome: "missing" }),
        cleanup: async () => ({ outcome: "completed" }),
      });
      expect(result.receipt.diagnosticCodes).toEqual(["cleanup-failed", "self-check-failed"]);
      expect(result.receipt.cleanupOutcome).toBe("failed");
      expect(result.receipt.outputs).toEqual([]);
      expect(result.sourceDirectoryPath).toBeUndefined();
      expect(await readFile(path.join(rejectedSourcePath, "scene.ts"), "utf8")).toBe("prior evidence");
      expect(await readFile(path.join(prepared.stagingDirectoryPath, "scene.ts"), "utf8")).toBe("scene.ts\n");
    } finally { await rm(prepared.root, { recursive: true, force: true }); }
  });

  it("reconciles an unknown create outcome using the same request identity without a second submission", async () => {
    const prepared = await preparedFixture();
    let runs = 0;
    let reconciledHash: string | undefined;
    try {
      const result = await runNativeBlockGenerationV1(prepared, {
        process: { run: async () => { runs += 1; throw new Error("create timeout"); } },
        selfCheck: async () => ({ ok: true, diagnosticCodes: [] }),
        reconcile: async (requestId, requestHash) => {
          reconciledHash = requestHash;
          return { outcome: "unknown", requestId, requestHash };
        },
        cleanup: async () => ({ outcome: "completed" }),
      });
      expect(runs).toBe(1);
      expect(reconciledHash).toBe(prepared.routerTaskPayloadHash);
      expect(reconciledHash).not.toBe(prepared.generationRequestHash);
      expect(result.receipt.outcome).toBe("unknown");
      expect(result.receipt.diagnosticCodes).toContain("creation-outcome-unknown");
    } finally { await rm(prepared.root, { recursive: true, force: true }); }
  });

  it("records one request-bound adapter task timeout without inspecting provider stderr", async () => {
    const prepared = await preparedFixture();
    const privateProviderDetail = "secret-provider-trace-42";
    try {
      const result = await runNativeBlockGenerationV1(prepared, {
        process: {
          run: async () => ({
            exitCode: 1,
            stdout: "WORLDKIT_LWDP_JOB coding-agent native-block-generation-cloud-temple-initial job-1 dispatch=single-task-fast-path profile=formal model=gpt-5.6-sol reasoning=xhigh\n",
            stderr: privateProviderDetail,
            taskOutcome: {
              kind: "worldkit-codex-task-outcome",
              schemaVersion: 1,
              requestId: prepared.routerRequestId,
              outcome: "task-timeout",
            },
          }),
        },
        selfCheck: async () => ({ ok: true, diagnosticCodes: [] }),
        reconcile: async () => ({ outcome: "missing" }),
        cleanup: async () => ({ outcome: "completed" }),
      });

      expect(result.receipt.outcome).toBe("rejected");
      expect(result.receipt.diagnosticCodes).toEqual(["task-timeout"]);
      expect(JSON.stringify(result.receipt)).not.toContain(privateProviderDetail);
      expect(JSON.stringify(result.receipt)).not.toContain("codex timeout after");
    } finally {
      await rm(prepared.root, { recursive: true, force: true });
    }
  });

  it("classifies a local adapter missing-output rejection without publishing private stderr", async () => {
    const prepared = await preparedFixture();
    const privatePath = "/private/task/workspace/scene.ts";
    try {
      const result = await runNativeBlockGenerationV1(prepared, {
        process: {
          run: async () => ({
            exitCode: 1,
            stdout: "",
            stderr:
              `Error: WORLDKIT_LOCAL_CODEX_OUTPUT_MISSING: Local Codex omitted a non-empty declared output: ${privatePath}`,
            taskOutcome: {
              kind: "worldkit-codex-task-outcome",
              schemaVersion: 1,
              requestId: prepared.routerRequestId,
              outcome: "task-rejected",
            },
          }),
        },
        selfCheck: async () => ({ ok: true, diagnosticCodes: [] }),
        reconcile: async () => ({ outcome: "missing" }),
        cleanup: async () => ({ outcome: "completed" }),
      });

      expect(result.receipt.outcome).toBe("rejected");
      expect(result.receipt.diagnosticCodes).toEqual(["output-missing"]);
      expect(JSON.stringify(result.receipt)).not.toContain(privatePath);
    } finally {
      await rm(prepared.root, { recursive: true, force: true });
    }
  });

  it("appends cleanup-failed without replacing task-timeout", async () => {
    const prepared = await preparedFixture();
    try {
      const result = await runNativeBlockGenerationV1(prepared, {
        process: {
          run: async () => ({
            exitCode: 1,
            stdout: "",
            stderr: "secret-provider-trace-42",
            taskOutcome: {
              kind: "worldkit-codex-task-outcome",
              schemaVersion: 1,
              requestId: prepared.routerRequestId,
              outcome: "task-timeout",
            },
          }),
        },
        selfCheck: async () => ({ ok: true, diagnosticCodes: [] }),
        reconcile: async () => ({ outcome: "missing" }),
        cleanup: async () => ({ outcome: "failed" }),
      });

      expect(result.receipt.outcome).toBe("tool-error");
      expect(result.receipt.cleanupOutcome).toBe("failed");
      expect(result.receipt.diagnosticCodes).toEqual([
        "cleanup-failed",
        "task-timeout",
      ]);
      expect(JSON.stringify(result.receipt)).not.toContain(
        "secret-provider-trace-42",
      );
    } finally {
      await rm(prepared.root, { recursive: true, force: true });
    }
  });

  it("appends cleanup-failed without replacing a self-check failure", async () => {
    const prepared = await preparedFixture();
    try {
      const result = await runNativeBlockGenerationV1(prepared, {
        process: {
          run: async () => {
            await writeOutputs(prepared.stagingDirectoryPath);
            return {
              exitCode: 0,
              stdout:
                "WORLDKIT_LWDP_JOB coding-agent native-block-generation-cloud-temple-initial job-1 dispatch=single-task-fast-path profile=formal model=gpt-5.6-sol reasoning=xhigh\n",
              stderr: "",
              taskOutcome: completedTaskOutcome,
            };
          },
        },
        selfCheck: async () => ({
          ok: false,
          diagnosticCodes: ["self-check-failed"],
        }),
        reconcile: async () => ({ outcome: "missing" }),
        cleanup: async () => ({ outcome: "failed" }),
      });

      expect(result.receipt.outcome).toBe("tool-error");
      expect(result.receipt.cleanupOutcome).toBe("failed");
      expect(result.receipt.diagnosticCodes).toEqual([
        "cleanup-failed",
        "self-check-failed",
      ]);
      await expect(readFile(path.join(prepared.root, "attempts/0/rejected-source/scene.ts"), "utf8"))
        .resolves.toBe("scene.ts\n");
      await expect(readFile(path.join(prepared.sourceDirectoryPath, "scene.ts")))
        .rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(prepared.root, { recursive: true, force: true });
    }
  });

  it("routes an adapter creation uncertainty through GET-only reconciliation", async () => {
    const prepared = await preparedFixture();
    let reconciliations = 0;
    try {
      const result = await runNativeBlockGenerationV1(prepared, {
        process: {
          run: async () => ({
            exitCode: 1,
            stdout: "",
            stderr: "private transport detail",
            taskOutcome: {
              kind: "worldkit-codex-task-outcome",
              schemaVersion: 1,
              requestId: prepared.routerRequestId,
              outcome: "creation-outcome-unknown",
            },
          }),
        },
        selfCheck: async () => ({ ok: true, diagnosticCodes: [] }),
        reconcile: async (requestId, requestHash) => {
          reconciliations += 1;
          return { outcome: "unknown", requestId, requestHash };
        },
        cleanup: async () => ({ outcome: "completed" }),
      });

      expect(reconciliations).toBe(1);
      expect(result.receipt.outcome).toBe("unknown");
      expect(result.receipt.diagnosticCodes).toEqual(["creation-outcome-unknown"]);
    } finally {
      await rm(prepared.root, { recursive: true, force: true });
    }
  });

  it("keeps a failed read-only reconciliation durable-unknown without retrying it", async () => {
    const prepared = await preparedFixture();
    let reconciliations = 0;
    try {
      const result = await runNativeBlockGenerationV1(prepared, {
        process: {
          run: async () => ({
            exitCode: 1,
            stdout: "",
            stderr: "",
            taskOutcome: {
              kind: "worldkit-codex-task-outcome",
              schemaVersion: 1,
              requestId: prepared.routerRequestId,
              outcome: "creation-outcome-unknown",
            },
          }),
        },
        selfCheck: async () => ({ ok: true, diagnosticCodes: [] }),
        reconcile: async () => {
          reconciliations += 1;
          throw new Error("GET unavailable");
        },
        cleanup: async () => ({ outcome: "completed" }),
      });
      expect(reconciliations).toBe(1);
      expect(result.receipt.outcome).toBe("unknown");
      expect(result.receipt.diagnosticCodes).toEqual(["creation-outcome-unknown"]);
    } finally {
      await rm(prepared.root, { recursive: true, force: true });
    }
  });

  it("rejects a reconciled request identity whose hash differs", async () => {
    const prepared = await preparedFixture();
    try {
      const result = await runNativeBlockGenerationV1(prepared, {
        process: { run: async () => { throw new Error("create timeout"); } },
        selfCheck: async () => ({ ok: true, diagnosticCodes: [] }),
        reconcile: async (requestId) => ({ outcome: "completed", requestId, requestHash: `sha256:${"c".repeat(64)}` }),
        cleanup: async () => ({ outcome: "completed" }),
      });
      expect(result.receipt.diagnosticCodes).toContain("duplicate-request-mismatch");
    } finally { await rm(prepared.root, { recursive: true, force: true }); }
  });

  it("cleans task state after a rejected process and refuses stale source state", async () => {
    const prepared = await preparedFixture();
    let cleaned = 0;
    await mkdir(prepared.sourceDirectoryPath, { recursive: true });
    try {
      const result = await runNativeBlockGenerationV1(prepared, {
        process: { run: async () => ({ exitCode: 2, stdout: "", stderr: "failed" }) },
        selfCheck: async () => ({ ok: true, diagnosticCodes: [] }), reconcile: async () => ({ outcome: "missing" }),
        cleanup: async () => { cleaned += 1; return { outcome: "completed" }; },
      });
      expect(cleaned).toBe(1);
      expect(result.receipt.outcome).toBe("rejected");
    } finally { await rm(prepared.root, { recursive: true, force: true }); }
  });

  it("rejects a missing or duplicate router completion marker", async () => {
    for (const stdout of ["", "WORLDKIT_LWDP_JOB coding-agent native-block-generation-cloud-temple-initial a dispatch=single-task-fast-path profile=formal model=gpt-5.6-sol reasoning=xhigh\nWORLDKIT_LWDP_JOB coding-agent native-block-generation-cloud-temple-initial b dispatch=single-task-fast-path profile=formal model=gpt-5.6-sol reasoning=xhigh"]) {
      const prepared = await preparedFixture();
      try {
        const result = await runNativeBlockGenerationV1(prepared, { process: { run: async () => { await writeOutputs(prepared.stagingDirectoryPath); return { exitCode: 0, stdout, stderr: "", taskOutcome: completedTaskOutcome }; } }, selfCheck: async () => ({ ok: true, diagnosticCodes: [] }), reconcile: async () => ({ outcome: "missing" }), cleanup: async () => ({ outcome: "completed" }) });
        expect(result.receipt.outcome).toBe("rejected");
      } finally { await rm(prepared.root, { recursive: true, force: true }); }
    }
  });
});
