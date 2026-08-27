import { spawn } from "node:child_process";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { isEmpty, isNil } from "lodash-es";
import { afterEach, describe, expect, it } from "vitest";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../..");
const CHILD_FIXTURE_PATH = path.join(
  REPOSITORY_ROOT,
  "scripts/fixtures/durable-authoring-edit-host-child.test-support.ts",
);
const temporaryRoots: string[] = [];

interface ChildResultV1 {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly payload?: Readonly<{
    readonly receiptBytes: string;
    readonly revisionRef: string;
    readonly startupCleanupReports: readonly Readonly<{
      readonly status: string;
      readonly attemptCount: number;
    }>[];
    readonly walTransactionCount: number;
    readonly packageCount: number;
  }>;
}

async function temporaryRoot(prefix: string): Promise<string> {
  const created = await realpath(await mkdtemp(path.join(tmpdir(), prefix)));
  temporaryRoots.push(created);
  return created;
}

async function runChild(
  mode: string,
  stateDirectoryPath: string,
  controlFilePath: string,
): Promise<ChildResultV1> {
  return await new Promise((resolve, reject) => {
    const child = spawn(
      "pnpm",
      [
        "exec",
        "tsx",
        CHILD_FIXTURE_PATH,
        mode,
        stateDirectoryPath,
        controlFilePath,
      ],
      {
        cwd: REPOSITORY_ROOT,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Child mode '${mode}' timed out.`));
    }, 30_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      const lines = stdout.trim().split("\n").filter((line) => line.length > 0);
      let payload: ChildResultV1["payload"];
      const finalLine = isEmpty(lines) ? undefined : lines.at(-1);
      if (exitCode === 0 && !isNil(finalLine)) {
        payload = JSON.parse(finalLine) as NonNullable<ChildResultV1["payload"]>;
      }
      resolve({
        exitCode: isNil(exitCode) ? -1 : exitCode,
        stdout,
        stderr,
        ...(isNil(payload) ? {} : { payload }),
      });
    });
  });
}

function requiredPayload(
  result: ChildResultV1,
): NonNullable<ChildResultV1["payload"]> {
  if (isNil(result.payload)) {
    throw new Error(`Child returned no payload. stderr: ${result.stderr}`);
  }
  return result.payload;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

describe("durable Authoring Edit Host fresh-process recovery", () => {
  it("rehydrates the pinned Candidate and commits once after a pre-commit process exit", async () => {
    const root = await temporaryRoot("durable-host-pre-commit-");
    const stateDirectoryPath = path.join(root, "state");
    const controlFilePath = path.join(root, "control.json");
    const crashed = await runChild(
      "crash-before-commit",
      stateDirectoryPath,
      controlFilePath,
    );
    expect(crashed.exitCode).toBe(85);

    const resumed = await runChild(
      "publish-after-prepare",
      stateDirectoryPath,
      controlFilePath,
    );
    expect(resumed.exitCode, resumed.stderr).toBe(0);
    expect(resumed.payload).toMatchObject({
      revisionRef: "revision://basic-world/2",
      packageCount: 1,
    });
    const resumedPayload = requiredPayload(resumed);
    expect(JSON.parse(resumedPayload.receiptBytes)).toMatchObject({
      status: "committed",
      requestId: "request.child.apply",
      currentRuntimeIdentity: { simulationTick: 0 },
    });

    const retried = await runChild(
      "recover-release-cleanup",
      stateDirectoryPath,
      controlFilePath,
    );
    expect(retried.exitCode, retried.stderr).toBe(0);
    const retriedPayload = requiredPayload(retried);
    expect(retriedPayload.receiptBytes).toBe(resumedPayload.receiptBytes);
    expect(retriedPayload.packageCount).toBe(resumedPayload.packageCount);
  }, 30_000);

  it("recovers an exact post-commit identity before APIs reopen and resumes cleanup monotonically", async () => {
    const root = await temporaryRoot("durable-host-post-commit-");
    const stateDirectoryPath = path.join(root, "state");
    const controlFilePath = path.join(root, "control.json");
    const crashed = await runChild(
      "crash-after-commit",
      stateDirectoryPath,
      controlFilePath,
    );
    expect(crashed.exitCode).toBe(86);

    const interruptedCleanup = await runChild(
      "recover-incomplete-cleanup",
      stateDirectoryPath,
      controlFilePath,
    );
    expect(interruptedCleanup.exitCode, interruptedCleanup.stderr).toBe(0);
    expect(interruptedCleanup.payload).toMatchObject({
      revisionRef: "revision://basic-world/2",
      packageCount: 1,
      startupCleanupReports: [{ status: "retrying", attemptCount: 1 }],
    });

    const released = await runChild(
      "recover-release-cleanup",
      stateDirectoryPath,
      controlFilePath,
    );
    expect(released.exitCode, released.stderr).toBe(0);
    expect(released.payload).toMatchObject({
      revisionRef: "revision://basic-world/2",
      packageCount: 1,
      startupCleanupReports: [{ status: "released", attemptCount: 3 }],
    });
    const interruptedPayload = requiredPayload(interruptedCleanup);
    const releasedPayload = requiredPayload(released);
    expect(releasedPayload.receiptBytes).toBe(
      interruptedPayload.receiptBytes,
    );

    const replayed = await runChild(
      "recover-release-cleanup",
      stateDirectoryPath,
      controlFilePath,
    );
    expect(replayed.exitCode, replayed.stderr).toBe(0);
    const replayedPayload = requiredPayload(replayed);
    expect(replayedPayload.receiptBytes).toBe(releasedPayload.receiptBytes);
    expect(replayedPayload.packageCount).toBe(releasedPayload.packageCount);
    expect(replayedPayload.walTransactionCount).toBe(
      releasedPayload.walTransactionCount,
    );
  }, 30_000);
});
