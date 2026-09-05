import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CODEX_TASK_OUTCOME_PREFIX } from "../lib/codex-task-outcome.mjs";
import { createCodexTaskProcessPortV1, reconcileCodexTaskCreationV1 } from "./codex-task-process-port.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

const input = {
  executablePath: "/router.mjs", arguments: ["--request-id", "host-request"],
  cwd: "/workspace", requestId: "host-request",
};
const envelope = (outcome: string, requestId = input.requestId) => ({
  kind: "worldkit-codex-task-outcome", schemaVersion: 1, requestId, outcome,
});
const outcomeLine = (outcome: string, requestId = input.requestId) =>
  `${CODEX_TASK_OUTCOME_PREFIX}${JSON.stringify(envelope(outcome, requestId))}\n`;

function fixture(requestId = input.requestId) {
  const child = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(), stderr: new EventEmitter(),
  });
  vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);
  const lines: string[] = [];
  const port = createCodexTaskProcessPortV1({ diagnosticSink: (line) => { lines.push(line); } });
  const result = port.run({ ...input, requestId });
  return { child, lines, result, records: () => lines.map((line) => JSON.parse(line.slice(line.indexOf(" ") + 1))) };
}

beforeEach(() => { vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] }); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.mocked(spawn).mockReset(); });

describe("Codex task process Host diagnostics", () => {
  it("reports bounded Host activity before close without exposing split secret-bearing child output", async () => {
    const run = fixture();
    let settled = false;
    void run.result.then(() => { settled = true; });
    const stdout = `Bearer private-token\n${outcomeLine("completed")}`;
    const stderr = "password=private-password 中文";
    vi.advanceTimersByTime(2_000);
    run.child.stdout.emit("data", Buffer.from(stdout.slice(0, 17)));
    run.child.stdout.emit("data", Buffer.from(stdout.slice(17)));
    run.child.stderr.emit("data", Buffer.from(stderr));
    vi.advanceTimersByTime(13_000);
    expect(settled).toBe(false);
    expect(run.records()).toEqual([
      expect.objectContaining({ requestId: input.requestId, operation: "run", lifecycle: "started", elapsedMs: 0, stdoutBytes: 0, stderrBytes: 0, outputActivityAgeMs: null }),
      expect.objectContaining({ requestId: input.requestId, lifecycle: "heartbeat", elapsedMs: 15_000, stdoutBytes: Buffer.byteLength(stdout), stderrBytes: Buffer.byteLength(stderr), outputActivityAgeMs: 13_000 }),
    ]);
    expect(run.lines.join("\n")).not.toMatch(/Bearer|private-token|password|completed|中文/);
    run.child.emit("close", 0);
    await expect(run.result).resolves.toEqual({ exitCode: 0, stdout, stderr, taskOutcome: envelope("completed") });
    expect(run.records().at(-1)).toMatchObject({ lifecycle: "closed", exitCode: 0 });
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(run.lines).toHaveLength(3);
  });

  it("emits silent heartbeats and throttles burst output without interpreting model stage claims", async () => {
    const run = fixture();
    vi.advanceTimersByTime(14_999);
    expect(run.lines).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(run.records()[1]).toMatchObject({ lifecycle: "heartbeat", stdoutBytes: 0, stderrBytes: 0, outputActivityAgeMs: null });
    for (let index = 0; index < 10_000; index += 1) run.child.stdout.emit("data", Buffer.from("completed 100%\n"));
    expect(run.lines).toHaveLength(2);
    vi.advanceTimersByTime(30_000);
    expect(run.lines).toHaveLength(4);
    expect(run.records().at(-1)).toMatchObject({ elapsedMs: 45_000, stdoutBytes: 150_000, outputActivityAgeMs: 30_000 });
    run.child.emit("close", null);
    expect((await run.result).exitCode).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["\n\u0000".repeat(64), "oversized-request".repeat(10_000)])("bounds escaped request identity and binds oversized IDs by digest", async (requestId) => {
    const run = fixture(requestId);
    run.child.emit("close", 0);
    await run.result;
    for (const line of run.lines) {
      expect(Buffer.byteLength(line)).toBeLessThanOrEqual(2048);
      expect(line).not.toContain("\n");
    }
    expect(run.records()[0]).toMatchObject({ requestIdSha256: createHash("sha256").update(requestId).digest("hex") });
    expect(run.records()[0].requestId).toBe(requestId.length <= 128 ? requestId : undefined);
  });

  it("cleans up on process error and preserves rejection without logging error text or duplicate close", async () => {
    const run = fixture();
    const error = new Error("provider-private-error");
    const rejected = expect(run.result).rejects.toBe(error);
    run.child.emit("error", error);
    await rejected;
    run.child.emit("close", 1);
    vi.advanceTimersByTime(60_000);
    expect(run.records().map((row) => row.lifecycle)).toEqual(["started", "error"]);
    expect(run.lines.join("\n")).not.toContain(error.message);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["throw", "reject"])("isolates a diagnostic sink that %ss from the process result", async (mode) => {
    const run = fixture();
    run.child.emit("close", 0);
    await run.result;
    const diagnosticSink = vi.fn(() => {
      if (mode === "throw") throw new Error("sink error");
      return Promise.reject(new Error("sink error"));
    });
    const result = createCodexTaskProcessPortV1({ diagnosticSink }).run(input);
    await Promise.resolve();
    vi.advanceTimersByTime(15_000);
    run.child.stdout.emit("data", Buffer.from(outcomeLine("completed")));
    run.child.emit("close", 0);
    await expect(result).resolves.toMatchObject({ exitCode: 0, taskOutcome: envelope("completed") });
    expect(diagnosticSink).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not queue diagnostics or delay completion behind a hung asynchronous sink", async () => {
    const run = fixture();
    run.child.emit("close", 0);
    await run.result;
    const diagnosticSink = vi.fn(() => new Promise<void>(() => {}));
    const result = createCodexTaskProcessPortV1({ diagnosticSink }).run(input);
    vi.advanceTimersByTime(150_000);
    run.child.emit("close", 0);
    await expect(result).resolves.toEqual({ exitCode: 0, stdout: "", stderr: "" });
    expect(diagnosticSink).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ["foreign identity", outcomeLine("completed", "other-request")],
    ["duplicate envelope", outcomeLine("completed") + outcomeLine("completed")],
    ["invalid JSON", `${CODEX_TASK_OUTCOME_PREFIX}{broken}\n`],
  ])("retains unchanged outcome rejection for %s", async (_label, stdout) => {
    const run = fixture();
    run.child.stdout.emit("data", Buffer.from(stdout));
    run.child.emit("close", 1);
    await expect(run.result).resolves.toEqual({ exitCode: 1, stdout, stderr: "" });
  });

  it("cleans up if spawn throws synchronously", async () => {
    vi.mocked(spawn).mockImplementation(() => { throw new Error("spawn failed"); });
    await expect(createCodexTaskProcessPortV1({ diagnosticSink: () => {} }).run(input)).rejects.toThrow("spawn failed");
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("reconciliation remains read-only and request bound", () => {
  it.each(["request-missing", "request-found", "creation-outcome-unknown"])("keeps %s classification and arguments", async (outcome) => {
    const run = fixture();
    run.child.emit("close", 0);
    await run.result;
    const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = reconcileCodexTaskCreationV1({ ...input, backend: "cloud" });
    vi.advanceTimersByTime(15_000);
    run.child.stdout.emit("data", Buffer.from(outcomeLine(outcome)));
    run.child.emit("close", 0);
    await expect(result).resolves.toEqual({ outcome: outcome === "request-missing" ? "missing" : "unknown" });
    expect(spawn).toHaveBeenLastCalledWith(process.execPath, [input.executablePath, "--backend", "cloud", "--reconcile-only", "--task-id", input.requestId, "--request-id", input.requestId], { cwd: input.cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(diagnostic.mock.calls.map(([line]) => JSON.parse(String(line).slice(String(line).indexOf(" ") + 1)))).toEqual([
      expect.objectContaining({ operation: "reconcile", requestId: input.requestId, lifecycle: "started" }),
      expect.objectContaining({ operation: "reconcile", requestId: input.requestId, lifecycle: "heartbeat" }),
      expect.objectContaining({ operation: "reconcile", requestId: input.requestId, lifecycle: "closed" }),
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not spawn for local reconciliation", async () => {
    await expect(reconcileCodexTaskCreationV1({ ...input, backend: "local" })).resolves.toEqual({ outcome: "missing" });
    expect(spawn).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
