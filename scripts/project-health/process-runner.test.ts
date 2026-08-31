import { execFile } from "node:child_process";
import { access, chmod, mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  parseProjectHealthExecutionDescriptorV1,
  runProjectHealthProcessV1,
  type ProjectHealthExecutionDescriptorV1,
} from "./process-runner";

const HASH_A = `sha256:${"a".repeat(64)}`;
const execFileAsync = promisify(execFile);
const roots: string[] = [];

async function createRepository(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "worldkit-project-health-runner-"));
  roots.push(root);
  await execFileAsync("git", ["init", "--quiet", root]);
  await execFileAsync("git", ["-C", root, "config", "user.email", "project-health@example.invalid"]);
  await execFileAsync("git", ["-C", root, "config", "user.name", "Project Health Test"]);
  await writeFile(path.join(root, "tracked.txt"), "clean\n", "utf8");
  await execFileAsync("git", ["-C", root, "add", "tracked.txt"]);
  await execFileAsync("git", ["-C", root, "commit", "--quiet", "-m", "fixture"]);
  return realpath(root);
}

function descriptor(
  argv: readonly [string, ...string[]],
  overrides: Partial<ProjectHealthExecutionDescriptorV1> = {},
): ProjectHealthExecutionDescriptorV1 {
  return {
    kind: "project-health-execution-descriptor",
    schemaVersion: 1,
    id: "fixture-command",
    executionScope: "in-place-checkout",
    descendantOwnershipMode: "inherit-owner-token",
    argv,
    allowedEnvironmentVariableNames: ["HOME", "PATH", "TMPDIR"],
    implementationHash: HASH_A,
    workingDirectory: ".",
    timeoutMilliseconds: 2_000,
    maximumOutputBytes: 4_096,
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("project health process runner", () => {
  it("rejects an unknown execution scope before spawning", () => {
    expect(() => parseProjectHealthExecutionDescriptorV1({
      ...descriptor(["node", "-e", "process.exit(0)"]),
      executionScope: "host-shell",
    })).toThrow(/closed ProjectHealthExecutionDescriptorV1/i);
  });

  it("rejects a descriptor that does not require descendant owner-token inheritance", () => {
    expect(() => parseProjectHealthExecutionDescriptorV1({
      ...descriptor(["node", "-e", "process.exit(0)"]),
      descendantOwnershipMode: "uncontained",
    })).toThrow(/closed ProjectHealthExecutionDescriptorV1/i);
  });

  it("rejects a machine-specific absolute executable from the stable descriptor", () => {
    expect(() => parseProjectHealthExecutionDescriptorV1(
      descriptor([process.execPath, "-e", "process.exit(0)"]),
    )).toThrow(/closed ProjectHealthExecutionDescriptorV1/i);
  });

  it("runs argv directly without a shell and publishes content-addressed evidence", async () => {
    const root = await createRepository();
    const result = await runProjectHealthProcessV1({
      repositoryRoot: root,
      descriptor: descriptor(["node", "-e", "process.stdout.write('ok')"]),
    });

    expect(result.evidence.status).toBe("passed");
    expect(result.evidence.stdout).toBe("ok");
    expect(result.evidence.exitCode).toBe(0);
    expect(result.evidenceRef).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.evidence.temporaryOutputRemoved).toBe(true);
  });

  it("inherits only the closed Host environment allowlist", async () => {
    const root = await createRepository();
    process.env.WORLDKIT_UNREGISTERED_ENV = "host-only-value";
    try {
      const result = await runProjectHealthProcessV1({
        repositoryRoot: root,
        descriptor: descriptor([
          "node",
          "-e",
          "process.stdout.write(process.env.WORLDKIT_UNREGISTERED_ENV ?? 'absent')",
        ]),
      });
      expect(result.evidence.stdout).toBe("absent");
    } finally {
      delete process.env.WORLDKIT_UNREGISTERED_ENV;
    }
  });

  it("redacts the internal process-owner token from command output", async () => {
    const root = await createRepository();
    const result = await runProjectHealthProcessV1({
      repositoryRoot: root,
      descriptor: descriptor([
        "node",
        "-e",
        "process.stdout.write(process.env.PROJECT_HEALTH_PROCESS_OWNER_TOKEN ?? 'missing')",
      ]),
    });

    expect(result.evidence.stdout).toBe("[REDACTED_INTERNAL_VALUE]");
  });

  it("caps output and records deterministic truncation", async () => {
    const root = await createRepository();
    const result = await runProjectHealthProcessV1({
      repositoryRoot: root,
      descriptor: descriptor(
        ["node", "-e", "process.stdout.write('x'.repeat(4096))"],
        { maximumOutputBytes: 32 },
      ),
    });

    expect(Buffer.byteLength(result.evidence.stdout)).toBeLessThanOrEqual(32);
    expect(result.evidence.stdoutTruncated).toBe(true);
  });

  it("enforces one global output budget after redaction expansion", async () => {
    const root = await createRepository();
    const result = await runProjectHealthProcessV1({
      repositoryRoot: root,
      descriptor: descriptor(
        ["node", "-e", "process.stdout.write('/'); process.stderr.write('/')"],
        { maximumOutputBytes: 2 },
      ),
    });

    expect(Buffer.byteLength(result.evidence.stdout) + Buffer.byteLength(result.evidence.stderr)).toBeLessThanOrEqual(2);
    expect(result.evidence.stdoutTruncated || result.evidence.stderrTruncated).toBe(true);
  });

  it("redacts credentials and absolute machine paths from captured output", async () => {
    const root = await createRepository();
    const secret = `crsr_${"a".repeat(48)}`;
    const encodedSecret = Buffer.from(secret).toString("base64");
    const result = await runProjectHealthProcessV1({
      repositoryRoot: root,
      descriptor: descriptor([
        "node",
        "-e",
        `process.stdout.write(Buffer.from('${encodedSecret}', 'base64').toString() + ${JSON.stringify(` path=${root}/tracked.txt host=/etc/passwd`)})`,
      ]),
    });

    expect(result.evidence.stdout).not.toContain(secret);
    expect(result.evidence.stdout).not.toContain(root);
    expect(result.evidence.stdout).not.toContain("/etc/passwd");
    expect(result.evidence.stdout).toContain("[REDACTED_CREDENTIAL]");
    expect(result.evidence.stdout).toContain("[REDACTED_PATH]");
  });

  it("reports a signal exit without converting it to success", async () => {
    const root = await createRepository();
    const result = await runProjectHealthProcessV1({
      repositoryRoot: root,
      descriptor: descriptor(["node", "-e", "process.kill(process.pid, 'SIGTERM')"]),
    });

    expect(result.evidence.status).toBe("failed");
    expect(result.evidence.exitCode).toBeNull();
    expect(result.evidence.signal).toBe("SIGTERM");
  });

  it("times out once and terminates descendant processes", async () => {
    const root = await createRepository();
    const sentinel = path.join(root, ".project-health", "descendant-survived.txt");
    const childCode = "setTimeout(() => require('node:fs').writeFileSync(process.argv[1], 'alive'), 350)";
    const parentCode = [
      "const { spawn } = require('node:child_process');",
      `spawn(process.execPath, ['-e', ${JSON.stringify(childCode)}, ${JSON.stringify(sentinel)}], { detached: true, stdio: 'ignore' }).unref();`,
      "setInterval(() => {}, 1000);",
    ].join("");
    const result = await runProjectHealthProcessV1({
      repositoryRoot: root,
      descriptor: descriptor(
        ["node", "-e", parentCode],
        { timeoutMilliseconds: 100 },
      ),
    });

    expect(result.evidence.status).toBe("timed-out");
    await new Promise((resolve) => setTimeout(resolve, 500));
    await expect(access(sentinel)).rejects.toThrow();
  });

  it("terminates an observed detached descendant after its parent exits normally", async () => {
    const root = await createRepository();
    const sentinel = path.join(root, ".project-health", "normal-exit-descendant.txt");
    const childCode = "setTimeout(() => require('node:fs').writeFileSync(process.argv[1], 'alive'), 350)";
    const parentCode = [
      "const { spawn } = require('node:child_process');",
      `spawn(process.execPath, ['-e', ${JSON.stringify(childCode)}, ${JSON.stringify(sentinel)}], { detached: true, stdio: 'ignore' }).unref();`,
    ].join("");
    const result = await runProjectHealthProcessV1({
      repositoryRoot: root,
      descriptor: descriptor(["node", "-e", parentCode]),
    });

    expect(result.evidence.status).toBe("passed");
    await new Promise((resolve) => setTimeout(resolve, 500));
    await expect(access(sentinel)).rejects.toThrow();
  });

  it("detects repository-state mutation without silently reverting it", async () => {
    const root = await createRepository();
    const result = await runProjectHealthProcessV1({
      repositoryRoot: root,
      descriptor: descriptor([
        "node",
        "-e",
        "require('node:fs').writeFileSync('tracked.txt', 'mutated\\n')",
      ]),
    });

    expect(result.evidence.status).toBe("repository-state-mutated");
    expect(result.evidence.repositoryStateBeforeHash).not.toBe(result.evidence.repositoryStateAfterHash);
    await expect(readFile(path.join(root, "tracked.txt"), "utf8")).resolves.toBe("mutated\n");
  });

  it("detects an untracked repository residue outside the temporary output root", async () => {
    const root = await createRepository();
    const result = await runProjectHealthProcessV1({
      repositoryRoot: root,
      descriptor: descriptor([
        "node",
        "-e",
        "require('node:fs').writeFileSync('leftover.txt', 'residue\\n')",
      ]),
    });

    expect(result.evidence.status).toBe("repository-state-mutated");
  });

  it("detects residue elsewhere under the ignored project-health root", async () => {
    const root = await createRepository();
    const result = await runProjectHealthProcessV1({
      repositoryRoot: root,
      descriptor: descriptor([
        "node",
        "-e",
        "require('node:fs').mkdirSync('.project-health', { recursive: true }); require('node:fs').writeFileSync('.project-health/outside-owned-run.txt', 'residue\\n')",
      ]),
    });

    expect(result.evidence.status).toBe("repository-state-mutated");
  });

  it("does not treat another active runner-owned infrastructure path as repository residue", async () => {
    const root = await createRepository();
    const activeRunRoot = path.join(root, ".project-health", "runs", "other-active-run");
    const activeFile = path.join(activeRunRoot, "live.txt");
    await mkdir(activeRunRoot, { recursive: true });
    await writeFile(activeFile, "0", "utf8");
    let revision = 0;
    const writer = setInterval(() => {
      revision += 1;
      void writeFile(activeFile, String(revision), "utf8");
    }, 5);
    try {
      const result = await runProjectHealthProcessV1({
        repositoryRoot: root,
        descriptor: descriptor(["node", "-e", "setTimeout(() => {}, 150)"]),
      });
      expect(result.evidence.status).toBe("passed");
    } finally {
      clearInterval(writer);
    }
  });

  it("fails closed when unexpected ignored-root evidence exceeds the fingerprint budget", async () => {
    const root = await createRepository();
    const unexpectedFile = path.join(root, ".project-health", "unexpected-large.bin");
    await mkdir(path.dirname(unexpectedFile), { recursive: true });
    await writeFile(unexpectedFile, Buffer.alloc(8 * 1024 * 1024 + 1));

    const result = await runProjectHealthProcessV1({
      repositoryRoot: root,
      descriptor: descriptor(["node", "-e", "process.exit(0)"]),
    });

    expect(result.evidence.status).toBe("infrastructure-failed");
    expect(result.evidence.failureCodes).toContain("EXECUTION_ENVELOPE_FAILED");
  });

  it("returns fail-closed evidence when output-root setup fails", async () => {
    const root = await createRepository();
    await mkdir(path.join(root, ".project-health"), { recursive: true });
    await writeFile(path.join(root, ".project-health", "runs"), "not-a-directory", "utf8");

    const result = await runProjectHealthProcessV1({
      repositoryRoot: root,
      descriptor: descriptor(["node", "-e", "process.exit(0)"]),
    });

    expect(result.evidence.status).toBe("infrastructure-failed");
    expect(result.evidence.temporaryOutputRemoved).toBeNull();
    expect(result.evidence.failureCodes).toContain("EXECUTION_ENVELOPE_FAILED");
  });

  it.runIf(process.platform !== "win32")("rejects a symlinked project-health root without touching its external target", async () => {
    const root = await createRepository();
    const externalRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), "worldkit-project-health-external-")));
    roots.push(externalRoot);
    await symlink(externalRoot, path.join(root, ".project-health"), "dir");

    const result = await runProjectHealthProcessV1({
      repositoryRoot: root,
      descriptor: descriptor(["node", "-e", "process.exit(0)"]),
    });

    expect(result.evidence.status).toBe("infrastructure-failed");
    await expect(access(path.join(externalRoot, "runs"))).rejects.toThrow();
  });

  it.runIf(process.platform !== "win32")("does not clean through a runner parent replaced by a symlink", async () => {
    const root = await createRepository();
    const externalRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), "worldkit-project-health-swap-target-")));
    roots.push(externalRoot);
    const command = [
      "const fs = require('node:fs');",
      "fs.renameSync('.project-health/runs', '.project-health/runs-moved');",
      `fs.symlinkSync(${JSON.stringify(externalRoot)}, '.project-health/runs', 'dir');`,
    ].join("");

    const result = await runProjectHealthProcessV1({
      repositoryRoot: root,
      descriptor: descriptor(["node", "-e", command]),
    });

    expect(result.evidence.status).toBe("cleanup-failed");
    expect(result.evidence.temporaryOutputRemoved).toBe(false);
    await expect(readdir(externalRoot)).resolves.toEqual([]);
    expect(await realpath(path.join(root, ".project-health", "runs"))).toBe(externalRoot);
  });

  it("returns fail-closed evidence when post-run repository inspection fails", async () => {
    const root = await createRepository();
    const result = await runProjectHealthProcessV1({
      repositoryRoot: root,
      descriptor: descriptor([
        "node",
        "-e",
        "require('node:fs').rmSync('.git', { recursive: true, force: true })",
      ]),
    });

    expect(result.evidence.status).toBe("infrastructure-failed");
    expect(result.evidence.failureCodes).toContain("EXECUTION_ENVELOPE_FAILED");
    expect(result.evidence.temporaryOutputRemoved).toBe(true);
  });

  it("creates and removes an isolated temporary worktree", async () => {
    const root = await createRepository();
    const result = await runProjectHealthProcessV1({
      repositoryRoot: root,
      descriptor: descriptor(
        ["node", "-e", "process.stdout.write(require('node:fs').readFileSync('tracked.txt', 'utf8'))"],
        { executionScope: "isolated-temp-worktree" },
      ),
    });

    expect(result.evidence.status).toBe("passed");
    expect(result.evidence.stdout).toBe("clean\n");
    expect(result.evidence.temporaryWorktreeRemoved).toBe(true);
    const { stdout } = await execFileAsync("git", ["-C", root, "worktree", "list", "--porcelain"]);
    expect(stdout.match(/^worktree /gm)).toHaveLength(1);
  });

  it.runIf(process.platform !== "win32")("fails closed when isolated cleanup cannot remove its worktree", async () => {
    const root = await createRepository();
    const worktreeParent = path.join(root, ".project-health", "worktrees");
    await mkdir(worktreeParent, { recursive: true });
    const command = [
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "fs.chmodSync(path.dirname(process.cwd()), 0o500);",
    ].join("");

    const result = await runProjectHealthProcessV1({
      repositoryRoot: root,
      descriptor: descriptor(
        ["node", "-e", command],
        { executionScope: "isolated-temp-worktree" },
      ),
    });

    expect(result.evidence.status).toBe("cleanup-failed");
    expect(result.evidence.temporaryWorktreeRemoved).toBe(false);
    await chmod(worktreeParent, 0o700);
  });

  it.runIf(process.platform !== "win32")("does not claim an isolated worktree was removed after its parent identity changed", async () => {
    const root = await createRepository();
    const externalRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), "worldkit-project-health-worktree-swap-")));
    roots.push(externalRoot);
    const command = [
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "const parent = path.dirname(process.cwd());",
      "fs.renameSync(parent, `${parent}-moved`);",
      `fs.symlinkSync(${JSON.stringify(externalRoot)}, parent, 'dir');`,
    ].join("");

    const result = await runProjectHealthProcessV1({
      repositoryRoot: root,
      descriptor: descriptor(
        ["node", "-e", command],
        { executionScope: "isolated-temp-worktree" },
      ),
    });

    expect(result.evidence.status).toBe("cleanup-failed");
    expect(result.evidence.temporaryWorktreeRemoved).toBe(false);
    await expect(readdir(externalRoot)).resolves.toEqual([]);
  });
});
