import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  BNA1_CLEAN_BREAK_SCAN_ROOTS,
  scanBna1CleanBreak,
  type Bna1CleanBreakScanOptions,
} from "./verify-bna1-clean-break";

const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupPaths.splice(0).map((target) =>
    rm(target, { recursive: true, force: true }),
  ));
});

function token(parts: readonly string[]): string {
  return parts.join("");
}

async function fixture(options: {
  compilerSource?: string;
  negativeFixtureSource?: string;
  extraSource?: string;
  runtimeHostSource?: string;
  protocolSource?: string;
} = {}): Promise<{ root: string; scanOptions: Bna1CleanBreakScanOptions }> {
  const planHashField = token(["execution", "Plan", "Hash"]);
  const root = await mkdtemp(path.join(os.tmpdir(), "worldkit-bna1-clean-break-"));
  cleanupPaths.push(root);
  const files = {
    compiler: "packages/compiler/src/compile.ts",
    negative: "packages/runtime-contracts/src/generic-rejection.test.ts",
    extra: "apps/playground/src/generic-runtime.ts",
    runtimeHost: "packages/runtime-host/src/runtime-host.ts",
    protocol: "packages/protocol/src/hash.ts",
  };
  for (const file of Object.values(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
  }
  await Promise.all([
    writeFile(
      path.join(root, files.compiler),
      options.compilerSource ?? `export const ${planHashField} = 'plan';\n`,
    ),
    writeFile(
      path.join(root, files.negative),
      options.negativeFixtureSource ??
        `expect(input).not.toHaveProperty('${planHashField}');\n`,
    ),
    writeFile(path.join(root, files.extra), options.extraSource ?? "export {};\n"),
    writeFile(
      path.join(root, files.runtimeHost),
      options.runtimeHostSource ?? [
        "function parseRuntimeHostCreateOptions(input) {",
        "  const configuration = input.initialWorld;",
        "  requireCanonicalRuntimeConfiguration(configuration);",
        "  return configuration;",
        "}",
        "function parseReplacementRequest(input) {",
        "  const configuration = input.worldConfiguration;",
        "  requireCanonicalRuntimeConfiguration(configuration);",
        "  return configuration;",
        "}",
        "function parsePublishWorldReplacementInput(input) {",
        "  const configuration = input.worldConfiguration;",
        "  requireCanonicalRuntimeConfiguration(configuration);",
        "  return configuration;",
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
      ].join("\n"),
    ),
    writeFile(
      path.join(root, files.protocol),
      options.protocolSource ?? "export type Sha256HashV1 = `sha256:${string}`;\n",
    ),
  ]);
  return {
    root,
    scanOptions: {
      scanRoots: ["packages", "apps"],
      planSpecificExecutionPlanHashFiles: [files.compiler],
      negativeExecutionPlanHashFixtureFiles: [files.negative],
      runtimeHostPath: files.runtimeHost,
      sha256HashOwnerPath: files.protocol,
    },
  };
}

describe("BNA-1 clean-break verifier", () => {
  it("scans only tracked Scene evidence instead of mutable generated Scene directories", () => {
    expect(BNA1_CLEAN_BREAK_SCAN_ROOTS).not.toContain("artifacts/scenes");
    expect(BNA1_CLEAN_BREAK_SCAN_ROOTS.filter((entry) =>
      entry.startsWith("artifacts/scenes/")
    )).not.toHaveLength(0);
  });

  it("passes one exact Plan allowlist, one negative fixture, and guarded formal Native rejection", async () => {
    const value = await fixture();
    const report = await scanBna1CleanBreak(value.root, value.scanOptions);

    expect(report).toMatchObject({
      kind: "worldkit-bna1-clean-break-report",
      schemaVersion: 1,
      ok: true,
      diagnostics: [],
    });
  });

  it("reports deleted compiler/package symbols, old paths, generic Plan identity, and a second hash owner", async () => {
    const value = await fixture({
      compilerSource: [
        `export type Old = ${token(["Execution", "Plan", "V5"])};`,
        `export const oldCompiler = ${token(["compile", "World", "V5"])};`,
        `export const ${token(["execution", "Plan", "Hash"])} = 'plan';`,
        `export const oldPath = '${token(["targets/babylon-web/", "execution-plan.json"])}';`,
        `export const oldPackage = ${token(["create", "World", "Package", "V2"])};`,
      ].join("\n"),
      extraSource: [
        `export const ${token(["execution", "Plan", "Hash"])} = 'generic';`,
        "export type Sha256HashV1 = `sha256:${string}`;",
      ].join("\n"),
    });
    const report = await scanBna1CleanBreak(value.root, value.scanOptions);

    expect(report.ok).toBe(false);
    expect(report.diagnostics.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "BNA1_DELETED_PLAN_SYMBOL",
      "BNA1_DELETED_COMPILER_SYMBOL",
      "BNA1_OLD_PACKAGE_SYMBOL",
      "BNA1_OLD_PACKAGE_ENTRY_PATH",
      "BNA1_GENERIC_EXECUTION_PLAN_HASH",
      "BNA1_SHA256_HASH_OWNER_INVALID",
    ]));
  });

  it("fails closed when an allowlisted file stops owning the Plan field", async () => {
    const value = await fixture({ compilerSource: "export {};\n" });
    const report = await scanBna1CleanBreak(value.root, value.scanOptions);

    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      code: "BNA1_EXECUTION_PLAN_HASH_ALLOWLIST_DRIFT",
      path: "packages/compiler/src/compile.ts",
    }));
  });

  it("rejects formal Native allocation when the canonical guard is missing or follows adapter allocation", async () => {
    const value = await fixture({
      runtimeHostSource: [
        "const descriptor = descriptorFor(configuration);",
        "await adapterFactory.create(descriptor);",
        "throw new Error('WORLDKIT_NATIVE_SCENE_PRODUCTION_NOT_ADMITTED');",
      ].join("\n"),
    });
    const report = await scanBna1CleanBreak(value.root, value.scanOptions);

    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      code: "BNA1_FORMAL_NATIVE_PREALLOCATION_GUARD_INVALID",
    }));
  });

  it("rejects a new unclassified adapter allocation even when existing guarded allocations remain", async () => {
    const value = await fixture();
    const runtimeHostPath = value.scanOptions.runtimeHostPath!;
    const original = await import("node:fs/promises").then(({ readFile }) =>
      readFile(path.join(value.root, runtimeHostPath), "utf8")
    );
    await writeFile(
      path.join(value.root, runtimeHostPath),
      `${original}\nawait options.adapterFactory.create(unclassifiedDescriptor);\n`,
    );

    const report = await scanBna1CleanBreak(value.root, value.scanOptions);
    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      code: "BNA1_FORMAL_NATIVE_PREALLOCATION_GUARD_INVALID",
    }));
  });

  it("rejects Plan imports and fields from Native scene implementation paths", async () => {
    const value = await fixture({
      extraSource: `export type NativePlan = ${token(["Canonical", "Scene", "Execution", "Plan", "V1"])};\n`,
    });
    const report = await scanBna1CleanBreak(value.root, {
      ...value.scanOptions,
      nativeSceneRoots: ["apps/playground/src"],
    });

    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      code: "BNA1_NATIVE_PLAN_DEPENDENCY",
      path: "apps/playground/src/generic-runtime.ts",
    }));
  });
});
