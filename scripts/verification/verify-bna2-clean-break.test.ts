import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  scanBna2CleanBreak,
  type Bna2CleanBreakScanOptions,
} from "./verify-bna2-clean-break";

const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupPaths.splice(0).map((target) =>
    rm(target, { recursive: true, force: true })
  ));
});

function token(parts: readonly string[]): string {
  return parts.join("");
}

const guardedRuntimeHostSource = [
  "function parseRuntimeHostCreateOptions(input) {",
  "  requireCanonicalRuntimeConfiguration(input.initialWorld);",
  "}",
  "function parseReplacementRequest(input) {",
  "  requireCanonicalRuntimeConfiguration(input.worldConfiguration);",
  "}",
  "function parsePublishWorldReplacementInput(input) {",
  "  requireCanonicalRuntimeConfiguration(input.worldConfiguration);",
  "}",
  "function requireCanonicalRuntimeConfiguration(configuration) {",
  "  if (configuration.sceneSource.kind !== 'canonical-execution-plan') {",
  "    throw new Error('WORLDKIT_NATIVE_SCENE_PRODUCTION_NOT_ADMITTED');",
  "  }",
  "}",
  "function descriptor(configuration) {",
  "  requireCanonicalRuntimeConfiguration(configuration);",
  "  return descriptorFor(configuration);",
  "}",
  "await options.adapterFactory.create(descriptor(configuration));",
  "const candidateDescriptor = descriptor(candidateConfiguration);",
  "await this.options.adapterFactory.create(candidateDescriptor);",
].join("\n");

async function fixture(options: {
  extraSource?: string;
  runtimeHostSource?: string;
} = {}): Promise<{ root: string; scanOptions: Bna2CleanBreakScanOptions }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "worldkit-bna2-clean-break-"));
  cleanupPaths.push(root);
  const workspaceParserName = token([
    "read", "Babylon", "Native", "Authoring", "Workspace", "Root", "V1",
  ]);
  const importProfileName = token([
    "BABYLON", "_NATIVE", "_DEEP", "_ESM", "_IMPORT", "_SPECIFIERS", "_V1",
  ]);
  const sources: Readonly<Record<string, string>> = {
    "packages/native-babylon/src/import-profile.ts":
      `export const ${importProfileName} = Object.freeze([]);\n`,
    "packages/protocol/src/hash.ts":
      "export type Sha256HashV1 = `sha256:${string}`;\n",
    "packages/runtime-babylon/src/babylon-world-runtime.ts":
      "export const admission = 'audited';\n",
    "packages/runtime-host/src/runtime-host.ts":
      options.runtimeHostSource ?? guardedRuntimeHostSource,
    "scripts/native-scene/authoring-workspace.ts": [
      `export async function ${workspaceParserName}() {`,
      "  return { outcome: 'passed' };",
      "}",
    ].join("\n"),
    "apps/native-scene-playground/src/main.ts": options.extraSource ?? "export {};\n",
  };
  for (const [relativePath, source] of Object.entries(sources)) {
    const absolutePath = path.join(root, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, source);
  }
  return {
    root,
    scanOptions: {
      scanRoots: ["packages", "apps", "scripts"],
      bna1ScanOptions: {
        scanRoots: ["packages", "apps", "scripts"],
        planSpecificExecutionPlanHashFiles: [],
        negativeExecutionPlanHashFixtureFiles: [],
        runtimeHostPath: "packages/runtime-host/src/runtime-host.ts",
        sha256HashOwnerPath: "packages/protocol/src/hash.ts",
      },
    },
  };
}

describe("BNA-2 clean-break verifier", () => {
  it("accepts one audited API, workspace parser, import profile, and guarded formal Runtime", async () => {
    const value = await fixture();
    const report = await scanBna2CleanBreak(value.root, value.scanOptions);

    expect(report).toMatchObject({
      kind: "worldkit-bna2-clean-break-report",
      schemaVersion: 1,
      ok: true,
      diagnostics: [],
    });
  });

  it("rejects old Candidate/Controller/debug APIs and duplicate parser/profile owners", async () => {
    const value = await fixture({
      extraSource: [
        `const oldBuild = ${token(["build", "Babylon", "Native", "Scene", "Candidate", "V1"])};`,
        `const oldController = ${token(["create", "Cloud", "Ridge", "Native", "Scene", "Controller", "V1"])};`,
        `const oldDebug = ${token(["set", "Collision", "Debug", "Visible"])};`,
        `export async function ${token(["read", "Babylon", "Native", "Authoring", "Workspace", "Root", "V1"])}() {}`,
        `export const ${token(["BABYLON", "_NATIVE", "_DEEP", "_ESM", "_IMPORT", "_SPECIFIERS", "_V1"])} = [];`,
      ].join("\n"),
    });
    const report = await scanBna2CleanBreak(value.root, value.scanOptions);

    expect(report.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "BNA2_OLD_CANDIDATE_API",
        "BNA2_OLD_CLOUD_RIDGE_API",
        "BNA2_SECOND_WORKSPACE_PARSER",
        "BNA2_SECOND_IMPORT_PROFILE",
      ]),
    );
  });

  it("reuses the BNA-1 structural check for formal preallocation rejection", async () => {
    const value = await fixture({
      runtimeHostSource: [
        "await adapterFactory.create(descriptorFor(configuration));",
        "throw new Error('WORLDKIT_NATIVE_SCENE_PRODUCTION_NOT_ADMITTED');",
      ].join("\n"),
    });
    const report = await scanBna2CleanBreak(value.root, value.scanOptions);

    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      code: "BNA2_FORMAL_NATIVE_PREALLOCATION_GUARD_INVALID",
      path: "packages/runtime-host/src/runtime-host.ts",
    }));
  });
});
