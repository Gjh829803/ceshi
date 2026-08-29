import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  CLEAN_BREAK_SCAN_ROOTS,
  scanUnreleasedCleanBreak,
  type CleanBreakCensusReport,
} from "./verify-unreleased-clean-break.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function token(parts: readonly string[]): string {
  return parts.join("");
}

function family(
  report: CleanBreakCensusReport,
  familyId: string,
): CleanBreakCensusReport["families"][number] {
  const result = report.families.find((candidate) => candidate.familyId === familyId);
  expect(result, `missing census family ${familyId}`).toBeDefined();
  return result!;
}

describe("verify:unreleased-clean-break", () => {
  const cleanupPaths: string[] = [];

  async function createFixtureRoot(prefix: string): Promise<string> {
    const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), prefix));
    cleanupPaths.push(fixtureRoot);
    for (const root of CLEAN_BREAK_SCAN_ROOTS) {
      const target = path.join(fixtureRoot, root);
      if (path.extname(root)) {
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, "Current quickstart.\n", "utf8");
      } else {
        await mkdir(target, { recursive: true });
      }
    }
    return fixtureRoot;
  }

  afterEach(async () => {
    await Promise.all(cleanupPaths.splice(0).map((target) => rm(target, {
      force: true,
      recursive: true,
    })));
  });

  it("discovers a forbidden consumer added to an unlisted file under a scan root", async () => {
    const fixtureRoot = await createFixtureRoot("clean-break-adversarial-");
    const injectedDirectory = path.join(
      fixtureRoot,
      "packages",
      ".clean-break-adversarial-fixture",
    );
    const injectedPath = path.join(injectedDirectory, "new-consumer.ts");
    await mkdir(injectedDirectory, { recursive: true });
    await writeFile(
      injectedPath,
      `export type Injected = ${token(["Execution", "Plan", "V4"])};\n`,
      "utf8",
    );

    const report = await scanUnreleasedCleanBreak(fixtureRoot);
    const matches = family(report, "superseded-top-level-contracts").matchesByPath;

    expect(matches).toContainEqual({
      path: "packages/.clean-break-adversarial-fixture/new-consumer.ts",
      matches: [{ line: 1, value: token(["Execution", "Plan", "V4"]) }],
    });
    expect(report.ok).toBe(false);
  });

  it("passes the final zero contract while reporting current authority suffixes", async () => {
    const fixtureRoot = await createFixtureRoot("clean-break-zero-");
    await writeFile(
      path.join(fixtureRoot, "packages", "current.ts"),
      [
        `export type Input = ${token(["Authoring", "Spec", "V4"])};`,
        `export type Ir = ${token(["Normalized", "World", "IR", "V4"])};`,
        `export type Plan = ${token(["Canonical", "Scene", "Execution", "Plan", "V1"])};`,
        `export type Surface = ${token(["Execution", "Traversal", "Surface", "V1"])};`,
      ].join("\n"),
      "utf8",
    );
    await mkdir(path.join(fixtureRoot, "docs", "reviews"), { recursive: true });
    await writeFile(
      path.join(fixtureRoot, "docs", "reviews", "historical.md"),
      token(["Authoring", "Spec", "V3"]),
      "utf8",
    );

    const report = await scanUnreleasedCleanBreak(fixtureRoot);

    expect(report).toMatchObject({
      kind: "unreleased-clean-break-census",
      schemaVersion: 1,
      ok: true,
      forbiddenMatchCount: 0,
    });
    expect(family(report, "current-top-level-contracts")).toMatchObject({
      classification: "current-authority",
      matchCount: 3,
    });
    expect(family(report, "current-versioned-components")).toMatchObject({
      classification: "current-authority",
      matchCount: 1,
    });
  });

  it("groups superseded mechanisms and serialized authoring by family and path", async () => {
    const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "clean-break-groups-"));
    cleanupPaths.push(fixtureRoot);
    await mkdir(path.join(fixtureRoot, "apps", "sample"), { recursive: true });
    await mkdir(path.join(fixtureRoot, "examples"), { recursive: true });
    await writeFile(
      path.join(fixtureRoot, "apps", "sample", "adapter.ts"),
      `const plan = ${token(["project", "Normalized", "World", "V4", "To", "V3"])}(input);\n`,
      "utf8",
    );
    await writeFile(
      path.join(fixtureRoot, "examples", "old-world.json"),
      JSON.stringify({
        kind: "worldkit-authoring-spec",
        schemaVersion: 3,
      }, null, 2),
      "utf8",
    );

    const report = await scanUnreleasedCleanBreak(fixtureRoot);

    expect(family(report, "superseded-compatibility-mechanisms").matchesByPath)
      .toEqual([{
        path: "apps/sample/adapter.ts",
        matches: [{
          line: 1,
          value: token(["project", "Normalized", "World", "V4", "To", "V3"]),
        }],
      }]);
    expect(family(report, "superseded-serialized-contracts").matchesByPath)
      .toEqual([{
        path: "examples/old-world.json",
        matches: [{ line: 3, value: "worldkit-authoring-spec@3" }],
      }]);
    expect(report.forbiddenMatchCount).toBe(2);
    expect(report.ok).toBe(false);
  });

  it("allows strict checks for the current authoring and execution versions", async () => {
    const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "clean-break-current-version-"));
    cleanupPaths.push(fixtureRoot);
    await mkdir(path.join(fixtureRoot, "packages", "runtime"), { recursive: true });
    await writeFile(
      path.join(fixtureRoot, "packages", "runtime", "current-version.ts"),
      [
        "if (authoring.schemaVersion === 4) useCurrentAuthoring(authoring);",
        "if (plan.schemaVersion !== 1) throw new Error('CanonicalSceneExecutionPlanV1 required');",
      ].join("\n"),
      "utf8",
    );

    const report = await scanUnreleasedCleanBreak(fixtureRoot);

    expect(family(report, "superseded-compatibility-mechanisms").matchCount).toBe(0);
    expect(report.ok).toBe(true);
  });

  it("blocks superseded runtime ownership and subject registry compatibility", async () => {
    const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "clean-break-runtime-"));
    cleanupPaths.push(fixtureRoot);
    await mkdir(path.join(fixtureRoot, "packages", "runtime"), { recursive: true });
    await writeFile(
      path.join(fixtureRoot, "packages", "runtime", "compatibility.ts"),
      [
        `type Snapshot = ${token(["World", "Runtime", "Snapshot", "V3"])};`,
        `type Definition = ${token(["Registry", "Subject", "Definition", "V2"])};`,
        `type Registry = ${token(["Subject", "Resource", "Registry", "V2"])};`,
        `const ${token(["LEGACY", "_CONTROL", "_PROFILE"])} = {};`,
        `runtime.${token(["bind", "Control"])}({});`,
      ].join("\n"),
      "utf8",
    );

    const report = await scanUnreleasedCleanBreak(fixtureRoot);

    expect(family(report, "superseded-runtime-and-subject-contracts")).toMatchObject({
      classification: "superseded-delete",
      matchCount: 3,
    });
    expect(family(report, "superseded-compatibility-mechanisms")).toMatchObject({
      classification: "superseded-delete",
      matchCount: 2,
    });
    expect(report.forbiddenMatchCount).toBe(5);
    expect(report.ok).toBe(false);
  });

  it("blocks superseded v3 node contracts after authoring v4 became authoritative", async () => {
    const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "clean-break-node-v3-"));
    cleanupPaths.push(fixtureRoot);
    await mkdir(path.join(fixtureRoot, "packages", "authoring"), { recursive: true });
    await writeFile(
      path.join(fixtureRoot, "packages", "authoring", "compatibility.ts"),
      [
        `export type InputNode = ${token(["World", "Node", "Spec", "V3"])};`,
        `export type NormalizedNode = ${token(["Normalized", "World", "Node", "V3"])};`,
      ].join("\n"),
      "utf8",
    );

    const report = await scanUnreleasedCleanBreak(fixtureRoot);

    expect(family(report, "superseded-top-level-contracts")).toMatchObject({
      classification: "superseded-delete",
      matchCount: 2,
    });
    expect(report.forbiddenMatchCount).toBe(2);
    expect(report.ok).toBe(false);
  });

  it("blocks versionless public aliases after versioned APIs became authoritative", async () => {
    const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "clean-break-aliases-"));
    cleanupPaths.push(fixtureRoot);
    await mkdir(path.join(fixtureRoot, "packages", "api"), { recursive: true });
    await writeFile(
      path.join(fixtureRoot, "packages", "api", "index.ts"),
      [
        `export { ${token(["normalize", "Authoring", "Spec", "V4"])} as ${token(["normalize", "Authoring", "Spec"])} };`,
        `export function ${token(["parse", "Authoring", "Spec", "Json"])}(source: string) { return source; }`,
        `export function ${token(["validate", "Authoring", "Spec"])}(value: unknown) { return value; }`,
        `export const ${token(["compile", "World"])} = ${token(["compile", "World", "V5"])};`,
      ].join("\n"),
      "utf8",
    );

    const report = await scanUnreleasedCleanBreak(fixtureRoot);

    expect(family(report, "superseded-compatibility-mechanisms")).toMatchObject({
      classification: "superseded-delete",
      matchCount: 4,
    });
    expect(report.forbiddenMatchCount).toBe(4);
    expect(report.ok).toBe(false);
  });

  it("blocks superseded protocol names written with spaces in active documentation", async () => {
    const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "clean-break-active-docs-"));
    cleanupPaths.push(fixtureRoot);
    const quickstartPath = path.join(
      fixtureRoot,
      "docs",
      "17-canonical-json-quickstart.md",
    );
    await mkdir(path.dirname(quickstartPath), { recursive: true });
    await writeFile(
      quickstartPath,
      [
        `${token(["Authoring", "Spec"])} V3 compiles to ${token(["Normalized", "World", "IR"])} V3.`,
        `${token(["Execution", "Plan"])} V4 produces ${token(["Snapshot"])} V3 through ${token(["Browser", " Protocol"])} V4.`,
      ].join("\n"),
      "utf8",
    );

    const report = await scanUnreleasedCleanBreak(fixtureRoot);

    expect(family(report, "superseded-active-documentation")).toMatchObject({
      classification: "superseded-delete",
      matchCount: 5,
    });
    expect(report.ok).toBe(false);
  });

  it("treats the Gameplay integration contract as active documentation", async () => {
    const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "clean-break-gameplay-doc-"));
    cleanupPaths.push(fixtureRoot);
    const contractPath = path.join(
      fixtureRoot,
      "docs",
      "20-gameplay-integration-contract.md",
    );
    await mkdir(path.dirname(contractPath), { recursive: true });
    await writeFile(
      contractPath,
      `${token(["Execution", "Plan"])} V4 produces ${token(["Snapshot"])} V3.\n`,
      "utf8",
    );

    const report = await scanUnreleasedCleanBreak(fixtureRoot);

    expect(CLEAN_BREAK_SCAN_ROOTS).toContain(
      "docs/20-gameplay-integration-contract.md",
    );
    expect(family(report, "superseded-active-documentation").matchesByPath)
      .toEqual([{
        path: "docs/20-gameplay-integration-contract.md",
        matches: [
          { line: 1, value: `${token(["Execution", "Plan"])} V4` },
          { line: 1, value: `${token(["Snapshot"])} V3` },
        ],
      }]);
    expect(report.ok).toBe(false);
  });

  it("blocks a second public V4 JSON parser name and a hidden legacy camera path", async () => {
    const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "clean-break-parser-alias-"));
    cleanupPaths.push(fixtureRoot);
    await mkdir(path.join(fixtureRoot, "packages", "authoring"), { recursive: true });
    await writeFile(
      path.join(fixtureRoot, "packages", "authoring", "parse.ts"),
      [
        `export function ${token(["parse", "Authoring", "Spec", "Json", "V4"])}(source: string) { return source; }`,
        `class Camera { private ${token(["update", "Legacy"])}() {} }`,
      ].join("\n"),
      "utf8",
    );

    const report = await scanUnreleasedCleanBreak(fixtureRoot);

    expect(family(report, "superseded-compatibility-mechanisms")).toMatchObject({
      classification: "superseded-delete",
      matchCount: 2,
    });
    expect(report.ok).toBe(false);
  });

  it("discovers nested superseded serialized contracts under generated artifacts", async () => {
    const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "clean-break-artifacts-"));
    cleanupPaths.push(fixtureRoot);
    await mkdir(path.join(fixtureRoot, "artifacts", "generated"), { recursive: true });
    await writeFile(
      path.join(fixtureRoot, "artifacts", "generated", "bundle.json"),
      JSON.stringify({
        records: [
          { kind: "worldkit-normalized-world", schemaVersion: 3 },
          { kind: "worldkit-execution-plan", schemaVersion: 5 },
          { kind: "worldkit-runtime-snapshot", schemaVersion: 3 },
        ],
      }, null, 2),
      "utf8",
    );

    const report = await scanUnreleasedCleanBreak(fixtureRoot);

    expect(family(report, "superseded-serialized-contracts")).toMatchObject({
      classification: "superseded-delete",
      matchCount: 3,
    });
    expect(report.forbiddenMatchCount).toBe(3);
    expect(report.ok).toBe(false);
  });
});
