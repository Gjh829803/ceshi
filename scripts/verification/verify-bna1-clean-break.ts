import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const BNA1_CLEAN_BREAK_SCAN_ROOTS = Object.freeze([
  "packages",
  "apps",
  "scripts",
  "examples",
  "artifacts/scenes",
  ".codex/skills/worldkit-canonical-builder",
  ".codex/skills/worldkit-spatial-planner",
  "README.md",
  "docs/00-project-overview.md",
  "docs/02-sdk-architecture.md",
  "docs/05-mvp-roadmap.md",
  "docs/17-canonical-json-quickstart.md",
  "docs/20-gameplay-integration-contract.md",
] as const);

const PLAN_HASH = ["execution", "Plan", "Hash"].join("");

export const BNA1_PLAN_SPECIFIC_EXECUTION_PLAN_HASH_FILES = Object.freeze([
  ".codex/skills/worldkit-canonical-builder/scripts/self-check.mjs",
  "apps/playground/src/authoring-loader.test.ts",
  "apps/playground/src/authoring-loader.ts",
  "apps/playground/src/outdoor-scene-gameplay-loader.test.ts",
  "apps/playground/src/outdoor-scene-gameplay-loader.ts",
  "apps/playground/src/worldkit-browser-api.test.ts",
  "apps/studio/src/server.mjs",
  "apps/studio/src/server.test.mjs",
  "artifacts/scenes/cloud-ridge-celestial-gate/route-validation.manual-20260827-cloud-ridge-r23.json",
  "artifacts/scenes/cloud-ridge-celestial-gate/route-validation.manual-20260827-cloud-ridge-r23.json.evidence/00-route-validation-set-receipt.json",
  "artifacts/scenes/cloud-ridge-celestial-gate/route-validation.manual-20260827-cloud-ridge-r23.json.evidence/routes/000000/04-route-runtime-probe-receipt.json",
  "artifacts/scenes/cloud-ridge-celestial-gate/world.build.json",
  "artifacts/scenes/green-sahara-caravan/world.build.json",
  "artifacts/scenes/memory-postcard-coastal-ride/world.build.json",
  "examples/evidence/alpha-local-actions-world/explain.json",
  "examples/evidence/alpha-local-actions-world/verification.json",
  "examples/evidence/alpha-local-actions-world/world.build.json",
  "examples/evidence/g-bot-subject-world/explain.json",
  "examples/evidence/g-bot-subject-world/verification.json",
  "examples/evidence/g-bot-subject-world/world.build.json",
  "examples/evidence/package-subject-world/explain.json",
  "examples/evidence/package-subject-world/world.build.json",
  "examples/evidence/placement-coastal-world/world.build.json",
  "examples/evidence/rigged-subject-world/explain.json",
  "examples/evidence/rigged-subject-world/verification.json",
  "examples/evidence/rigged-subject-world/world.build.json",
  "packages/authoring-edit/src/authoring-edit.test.ts",
  "packages/authoring-edit/src/authoring-edit.ts",
  "packages/authoring-edit/src/types.ts",
  "packages/authoring-host/src/build.ts",
  "packages/authoring-host/src/journal/candidate-recovery.ts",
  "packages/authoring-host/src/journal/publication-adversarial.test.ts",
  "packages/authoring-host/src/journal/submit.ts",
  "packages/authoring-host/src/journal/types.ts",
  "packages/authoring-host/src/prepared-candidate.test.ts",
  "packages/compiler/src/compile.test.ts",
  "packages/compiler/src/compile.ts",
  "packages/runtime-babylon/src/traversal-runtime-port.test.ts",
  "packages/runtime-babylon/src/traversal-runtime-port.ts",
  "packages/runtime-contracts/src/browser-route-evidence.ts",
  "packages/runtime-contracts/src/runtime-contracts.test.ts",
  "packages/runtime-host/src/runtime-host.ts",
  "packages/runtime-host/src/test/runtime-host-lifecycle-harness.ts",
  "packages/runtime-host/src/test/world-build-identity-fixture.ts",
  "packages/traversal/src/runtime-evidence.test.ts",
  "packages/traversal/src/runtime-evidence.ts",
  "packages/traversal/src/runtime-probe-contract.test.ts",
  "packages/traversal/src/runtime-probe-contract.ts",
  "packages/validation/src/route-evaluator.test.ts",
  "packages/validation/src/route-evaluator.ts",
  "packages/validation/src/route-evidence-publication.test.ts",
  "packages/validation/src/route-evidence-publication.ts",
  "packages/validation/src/route-runtime-probe.test.ts",
  "packages/validation/src/route-runtime-probe.ts",
  "packages/validation/src/route-validation-set.test.ts",
  "packages/validation/src/route-validation-set.ts",
  "packages/validation/src/world-package-validation-types.ts",
  "packages/validation/src/validation.test.ts",
  "packages/validation/src/world-package-validation-subject.ts",
  "packages/world-identity/src/world-build-identity.test.ts",
  "packages/world-identity/src/world-build-identity.ts",
  "packages/world-package/src/package-build.test.ts",
  "packages/world-package/src/package-build.ts",
  "packages/world-package/src/package-contract.test.ts",
  "packages/world-package/src/package-contract.ts",
  "packages/world-package/src/package-directory.ts",
  "packages/world-package/src/package-types.ts",
  "scripts/cli/build-world-artifact.ts",
  "scripts/cli/worldkit-route-run.integration.test.ts",
  "scripts/cli/worldkit.test.ts",
  "scripts/cli/worldkit.ts",
  "scripts/lib/authoring-edit-host-bridge.test.ts",
  "scripts/lib/durable-world-change-runtime.ts",
  "scripts/lib/headless-runtime-session.ts",
  "scripts/lib/route-runtime-probe.integration.test.ts",
  "scripts/lib/route-validation-cli.test.ts",
  "scripts/lib/route-validation-orchestrator.test.ts",
  "scripts/lib/route-validation-orchestrator.ts",
  "scripts/lib/route-validation-runner.test.ts",
  "scripts/lib/route-validation-runner.ts",
  "scripts/lib/subject-explain.ts",
  "scripts/lib/validation-cli.test.ts",
  "scripts/lib/world-change-publication-recovery.ts",
  "scripts/lib/world-package-cli.test.ts",
  "scripts/lib/world-package-cli.ts",
  "scripts/lib/worldkit-pipeline.ts",
  "scripts/lib/worldkit-server.test.ts",
  "scripts/verification/verify-canonical-world.ts",
  "scripts/verification/verify-g-bot-subject-world.ts",
  "scripts/verification/verify-placement-layout.ts",
  "scripts/verification/verify-rigged-subject-world.ts",
] as const);

export interface Bna1CleanBreakScanOptions {
  readonly scanRoots?: readonly string[];
  readonly planSpecificExecutionPlanHashFiles?: readonly string[];
  readonly negativeExecutionPlanHashFixtureFiles?: readonly string[];
  readonly sha256HashOwnerPath?: string;
  readonly nativeSceneRoots?: readonly string[];
}

export interface Bna1CleanBreakDiagnostic {
  readonly code:
    | "BNA1_DELETED_PLAN_SYMBOL"
    | "BNA1_DELETED_COMPILER_SYMBOL"
    | "BNA1_OLD_PACKAGE_SYMBOL"
    | "BNA1_OLD_PACKAGE_ENTRY_PATH"
    | "BNA1_GENERIC_EXECUTION_PLAN_HASH"
    | "BNA1_NATIVE_PLAN_DEPENDENCY"
    | "BNA1_EXECUTION_PLAN_HASH_ALLOWLIST_DRIFT"
    | "BNA1_SHA256_HASH_OWNER_INVALID";
  readonly path: string;
  readonly line: number;
  readonly value: string;
}

export interface Bna1CleanBreakReport {
  readonly kind: "worldkit-bna1-clean-break-report";
  readonly schemaVersion: 1;
  readonly ok: boolean;
  readonly scannedFileCount: number;
  readonly planSpecificExecutionPlanHashFiles: readonly string[];
  readonly diagnostics: readonly Bna1CleanBreakDiagnostic[];
}

const TEXT_EXTENSIONS = new Set([
  ".cjs", ".js", ".json", ".jsx", ".md", ".mjs", ".sh", ".ts", ".tsx",
]);
const IGNORED_DIRECTORIES = new Set([".git", "coverage", "dist", "node_modules"]);

function lineAt(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

async function discoverFiles(absolutePath: string): Promise<readonly string[]> {
  let entries;
  try {
    entries = await readdir(absolutePath, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOTDIR") return [absolutePath];
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
    const child = path.join(absolutePath, entry.name);
    if (entry.isDirectory()) files.push(...await discoverFiles(child));
    else if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name))) files.push(child);
  }
  return files;
}

function matches(
  source: string,
  pattern: RegExp,
): readonly Readonly<{ index: number; value: string }>[] {
  pattern.lastIndex = 0;
  return [...source.matchAll(pattern)].map((match) => ({
    index: match.index,
    value: match[0],
  }));
}

const DELETED_PLAN_PATTERNS = [
  ["Execution", "Plan", "V5"].join(""),
  ["ExecutionPlan", " V5"].join(""),
  ["Plan", " V5"].join(""),
  ["V5", " Plan"].join(""),
  ["project", "Execution", "Plan", "V5", "To", "Terminal", "Artifacts", "V1"].join(""),
] as const;
const DELETED_COMPILER_PATTERNS = [
  ["compile", "World", "V5"].join(""),
  ["parse", "Execution", "Plan", "V5"].join(""),
  ["hash", "Execution", "Plan", "V5"].join(""),
] as const;
const OLD_PACKAGE_PATTERNS = [
  ["World", "Package", " V2"].join(""),
  ["World Package", " V2"].join(""),
  ["World", "Package", "Build", "Receipt", "V2"].join(""),
  ["World", "Package", "Manifest", "V2"].join(""),
  ["create", "World", "Package", "V2"].join(""),
  ["verify", "World", "Package", "Directory", "V2"].join(""),
  ["assert", "World", "Package", "Host", "Compatibility", "V2"].join(""),
  ["resolve", "World", "Package", "Subject", "Asset", "Artifacts", "V2"].join(""),
  ["create", "Playground", "World", "Package", "Build", "Context", "V2"].join(""),
] as const;
const OLD_PACKAGE_ENTRY_PATHS = [
  ["targets/babylon-web/", "execution-plan.json"].join(""),
  ["targets/babylon-web/", "world-runtime.json"].join(""),
] as const;
const NATIVE_PLAN_DEPENDENCY_PATTERNS = [
  ["Canonical", "Scene", "Execution", "Plan", "V1"].join(""),
  ["canonical", "-execution", "-plan"].join(""),
  ["execution", "Plan"].join(""),
  ["@whitebox-world/", "compiler"].join(""),
] as const;

function literalPattern(values: readonly string[]): RegExp {
  return new RegExp(values.map((value) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  ).join("|"), "g");
}

export async function scanBna1CleanBreak(
  repositoryRoot: string,
  options: Bna1CleanBreakScanOptions = {},
): Promise<Bna1CleanBreakReport> {
  const scanRoots = options.scanRoots ?? BNA1_CLEAN_BREAK_SCAN_ROOTS;
  const planFiles = new Set(
    options.planSpecificExecutionPlanHashFiles ??
      BNA1_PLAN_SPECIFIC_EXECUTION_PLAN_HASH_FILES,
  );
  const negativeFiles = new Set(
    options.negativeExecutionPlanHashFixtureFiles ?? [],
  );
  const sha256HashOwnerPath = options.sha256HashOwnerPath ??
    "packages/protocol/src/hash.ts";
  const nativeSceneRoots = options.nativeSceneRoots ?? [
    "apps/native-scene-playground",
    "packages/native-babylon",
  ];
  const discovered = new Set<string>();
  for (const root of scanRoots) {
    for (const file of await discoverFiles(path.join(repositoryRoot, root))) {
      discovered.add(file);
    }
  }
  const sourceByPath = new Map<string, string>();
  for (const file of [...discovered].sort()) {
    const relativePath = path.relative(repositoryRoot, file).split(path.sep).join("/");
    sourceByPath.set(relativePath, await readFile(file, "utf8"));
  }
  const diagnostics: Bna1CleanBreakDiagnostic[] = [];
  const addMatches = (
    code: Bna1CleanBreakDiagnostic["code"],
    relativePath: string,
    source: string,
    pattern: RegExp,
  ): void => {
    for (const match of matches(source, pattern)) {
      diagnostics.push({
        code,
        path: relativePath,
        line: lineAt(source, match.index),
        value: match.value,
      });
    }
  };
  const planPattern = literalPattern(DELETED_PLAN_PATTERNS);
  const compilerPattern = literalPattern(DELETED_COMPILER_PATTERNS);
  const packagePattern = literalPattern(OLD_PACKAGE_PATTERNS);
  const packagePathPattern = literalPattern(OLD_PACKAGE_ENTRY_PATHS);
  const planHashPattern = new RegExp(`\\b${PLAN_HASH}\\b`, "g");
  const nativePlanDependencyPattern = literalPattern(
    NATIVE_PLAN_DEPENDENCY_PATTERNS,
  );
  const actualPlanHashFiles = new Set<string>();
  const hashOwnerFiles = new Set<string>();
  for (const [relativePath, source] of sourceByPath) {
    addMatches("BNA1_DELETED_PLAN_SYMBOL", relativePath, source, planPattern);
    addMatches("BNA1_DELETED_COMPILER_SYMBOL", relativePath, source, compilerPattern);
    addMatches("BNA1_OLD_PACKAGE_SYMBOL", relativePath, source, packagePattern);
    addMatches("BNA1_OLD_PACKAGE_ENTRY_PATH", relativePath, source, packagePathPattern);
    if (nativeSceneRoots.some((root) =>
      relativePath === root || relativePath.startsWith(`${root}/`)
    )) {
      addMatches(
        "BNA1_NATIVE_PLAN_DEPENDENCY",
        relativePath,
        source,
        nativePlanDependencyPattern,
      );
    }
    const planHashMatches = matches(source, planHashPattern);
    if (planHashMatches.length > 0) {
      actualPlanHashFiles.add(relativePath);
      if (!planFiles.has(relativePath) && !negativeFiles.has(relativePath)) {
        for (const match of planHashMatches) {
          diagnostics.push({
            code: "BNA1_GENERIC_EXECUTION_PLAN_HASH",
            path: relativePath,
            line: lineAt(source, match.index),
            value: match.value,
          });
        }
      }
    }
    if (/^\s*export\s+(?:type|interface)\s+Sha256HashV1\b/m.test(source)) {
      hashOwnerFiles.add(relativePath);
    }
  }
  for (const allowlistedPath of [...planFiles, ...negativeFiles].sort()) {
    if (!actualPlanHashFiles.has(allowlistedPath)) {
      diagnostics.push({
        code: "BNA1_EXECUTION_PLAN_HASH_ALLOWLIST_DRIFT",
        path: allowlistedPath,
        line: 1,
        value: `allowlisted path has no ${PLAN_HASH} occurrence`,
      });
    }
  }
  if (
    hashOwnerFiles.size !== 1 ||
    !hashOwnerFiles.has(sha256HashOwnerPath)
  ) {
    for (const ownerPath of hashOwnerFiles.size === 0
      ? [sha256HashOwnerPath]
      : [...hashOwnerFiles].sort()) {
      diagnostics.push({
        code: "BNA1_SHA256_HASH_OWNER_INVALID",
        path: ownerPath,
        line: 1,
        value: "Sha256HashV1 must have exactly one declaration owner",
      });
    }
  }
  diagnostics.sort((left, right) =>
    left.path.localeCompare(right.path) ||
    left.line - right.line ||
    left.code.localeCompare(right.code) ||
    left.value.localeCompare(right.value),
  );
  return {
    kind: "worldkit-bna1-clean-break-report",
    schemaVersion: 1,
    ok: diagnostics.length === 0,
    scannedFileCount: sourceByPath.size,
    planSpecificExecutionPlanHashFiles: [...planFiles].sort(),
    diagnostics,
  };
}

export async function main(): Promise<void> {
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const report = await scanBna1CleanBreak(repositoryRoot);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 2;
}

const entryPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
