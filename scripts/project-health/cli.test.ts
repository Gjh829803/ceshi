import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { assertProjectHealthPrIdentityV1, runProjectHealthCliV1 } from "./cli";

const REPOSITORY_ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function runCli(repositoryRoot: string, argv: readonly string[]): Promise<Readonly<{
  exitCode: number;
  stdout: string;
  stderr: string;
}>> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await runProjectHealthCliV1({
    argv,
    repositoryRoot,
    clock: { utcDate: () => "2026-08-31" },
    stdout: (chunk) => stdout.push(chunk),
    stderr: (chunk) => stderr.push(chunk),
  });
  return { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
}

function git(repositoryRoot: string, argv: readonly string[]): string {
  return execFileSync("git", ["-C", repositoryRoot, ...argv], { encoding: "utf8" }).trim();
}

async function createLinearGitHistory(): Promise<Readonly<{
  repositoryRoot: string;
  baseSha: string;
  headSha: string;
}>> {
  const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), "worldkit-project-health-pr-identity-"));
  temporaryRoots.push(repositoryRoot);
  git(repositoryRoot, ["init", "--quiet"]);
  git(repositoryRoot, ["config", "user.email", "project-health@example.invalid"]);
  git(repositoryRoot, ["config", "user.name", "Project Health Test"]);
  git(repositoryRoot, ["commit", "--quiet", "--allow-empty", "-m", "base"]);
  const baseSha = git(repositoryRoot, ["rev-parse", "HEAD"]);
  git(repositoryRoot, ["commit", "--quiet", "--allow-empty", "-m", "head"]);
  return { repositoryRoot, baseSha, headSha: git(repositoryRoot, ["rev-parse", "HEAD"]) };
}

describe("project health cli", () => {
  it("exposes the frozen command family without a Gate injection or Receipt admission seam", async () => {
    const packageJson = JSON.parse(await readFile(path.join(REPOSITORY_ROOT, "package.json"), "utf8")) as {
      readonly scripts: Readonly<Record<string, string>>;
    };
    expect(packageJson.scripts["health:pr"]).toBe("tsx scripts/project-health/cli.ts check --mode pr");
    expect(packageJson.scripts["health:nightly"]).toBe("tsx scripts/project-health/cli.ts check --mode nightly");
    expect(packageJson.scripts["health:release"]).toBe("tsx scripts/project-health/cli.ts check --mode release");
    expect(packageJson.scripts["health:record"]).toBe("tsx scripts/project-health/cli.ts record");
    expect(packageJson.scripts["health:explain"]).toBe("tsx scripts/project-health/cli.ts explain");
    expect(packageJson.scripts["health:update-baseline"]).toBe("tsx scripts/project-health/cli.ts update-baseline");
    const source = await readFile(new URL("./cli.ts", import.meta.url), "utf8");
    expect(source).toMatch("executeRegisteredProjectHealthGateV1");
    expect(source).not.toMatch("readReceiptDirectory");
    expect(source).not.toMatch("executeGate?:");
    expect(source).not.toMatch("--receipts");
  });

  it("rejects external Receipt and Observation admission before any Gate can run", async () => {
    const result = await runCli(REPOSITORY_ROOT, [
      "check", "--mode", "pr", "--commit", "a".repeat(40),
      "--receipts", ".project-health/forged", "--output", ".project-health/report.json",
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/unknown option --receipts/i);
  });

  it("rejects a different checkout before it can mix Gate and Sensor implementations", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "worldkit-project-health-other-checkout-"));
    temporaryRoots.push(root);
    const result = await runCli(root, ["check", "--mode", "pr", "--output", ".project-health/report.json"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/checkout that owns its loaded implementation/i);
  });

  it("accepts an exact PR head identity and rejects an equal or non-ancestor base", async () => {
    const history = await createLinearGitHistory();
    expect(assertProjectHealthPrIdentityV1(history)).toEqual({
      checkoutSha: history.headSha,
      requestedHeadSha: history.headSha,
      isMergeCommit: false,
    });
    expect(() => assertProjectHealthPrIdentityV1({
      repositoryRoot: history.repositoryRoot,
      baseSha: history.headSha,
      headSha: history.headSha,
    })).toThrow(/base must precede/i);
    expect(() => assertProjectHealthPrIdentityV1({
      repositoryRoot: history.repositoryRoot,
      baseSha: history.headSha,
      headSha: history.baseSha,
    })).toThrow(/base must be an ancestor/i);
  });

  it("accepts a developer-authored merge commit when it is the exact requested PR head", async () => {
    const history = await createLinearGitHistory();
    git(history.repositoryRoot, ["branch", "side", history.baseSha]);
    git(history.repositoryRoot, ["checkout", "--quiet", "side"]);
    git(history.repositoryRoot, ["commit", "--quiet", "--allow-empty", "-m", "side"]);
    git(history.repositoryRoot, ["checkout", "--quiet", "-"]);
    git(history.repositoryRoot, ["merge", "--quiet", "--no-ff", "side", "-m", "merge"]);
    const mergeSha = git(history.repositoryRoot, ["rev-parse", "HEAD"]);
    expect(assertProjectHealthPrIdentityV1({
      repositoryRoot: history.repositoryRoot,
      baseSha: history.baseSha,
      headSha: mergeSha,
    })).toEqual({ checkoutSha: mergeSha, requestedHeadSha: mergeSha, isMergeCommit: false });
  });
});
