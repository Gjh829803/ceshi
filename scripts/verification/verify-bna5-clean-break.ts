import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const BNA5_CLEAN_BREAK_SCAN_ROOTS = Object.freeze([
  "packages",
  "apps",
  "scripts",
] as const);

const SELF_PATH = "scripts/verification/verify-bna5-clean-break.ts";
const TEST_PATH = "scripts/verification/verify-bna5-clean-break.test.ts";
const BRIDGE_PATH =
  "apps/native-scene-playground/src/hosted-runtime-bridge.ts";
const FRAME_PATH =
  "apps/native-scene-playground/src/hosted-runtime-frame.ts";
const TEXT_EXTENSIONS = new Set([
  ".cjs", ".js", ".json", ".jsx", ".mjs", ".mts", ".ts", ".tsx",
]);
const IGNORED_DIRECTORIES = new Set([
  ".git", "coverage", "dist", "node_modules",
]);
const LEGACY_HOSTED_ALIASES = Object.freeze([
  "sandboxProfileRef",
  "trustProfileRef",
  "isTrusted",
  "hostedNativeFallback",
  "allowHostedInProcess",
]);
const UNSAFE_EXECUTION_APIS = Object.freeze([
  "node:vm",
  "vm.runInContext",
]);
const INFRASTRUCTURE_FIELD_PATTERN =
  /"(?:(?:docker|kubernetes|container|iframe|provider)(?:[A-Z_][A-Za-z0-9_]*)?|(?:runtime|shell|application|browser|hosted)Origin(?:[A-Z_][A-Za-z0-9_]*)?)"\s*:/gu;

export interface Bna5CleanBreakDiagnostic {
  readonly code:
    | "BNA5_LEGACY_HOSTED_ALIAS"
    | "BNA5_UNSAFE_EXECUTION_API"
    | "BNA5_WILDCARD_MESSAGE_TARGET"
    | "BNA5_SAME_ORIGIN_SANDBOX"
    | "BNA5_EXACT_ORIGIN_BRIDGE_MISSING"
    | "BNA5_PUBLIC_SCHEMA_INFRASTRUCTURE_FIELD"
    | "BNA5_HOSTED_COMMAND_DIALECT"
    | "BNA5_DIRECT_EXECUTION_REQUEST_BYPASS";
  readonly path: string;
  readonly line: number;
  readonly value: string;
}

export interface Bna5CleanBreakReport {
  readonly kind: "worldkit-bna5-clean-break-report";
  readonly schemaVersion: 1;
  readonly ok: boolean;
  readonly scannedFileCount: number;
  readonly checks: Readonly<{
    legacyHostedAliasesAbsent: boolean;
    unsafeExecutionApisAbsent: boolean;
    exactOriginMessaging: boolean;
    publicSchemasInfrastructureFree: boolean;
    hostedCommandDialectAbsent: boolean;
    directExecutionRequestBypassAbsent: boolean;
  }>;
  readonly diagnostics: readonly Bna5CleanBreakDiagnostic[];
}

function lineAt(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
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
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name))) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
    const child = path.join(absolutePath, entry.name);
    if (entry.isDirectory()) files.push(...await discoverFiles(child));
    else if (
      entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name)) &&
      !/\.(?:spec|test)\.[cm]?[jt]sx?$/u.test(entry.name)
    ) files.push(child);
  }
  return files;
}

function isBna5OwnedPath(relativePath: string): boolean {
  return relativePath.startsWith("scripts/native-scene/hosted/") ||
    relativePath.startsWith("apps/native-scene-playground/src/hosted-runtime-") ||
    relativePath.startsWith("packages/runtime-contracts/src/native-execution-isolation") ||
    relativePath.startsWith("packages/runtime-host/src/native-execution-admission") ||
    relativePath.startsWith("packages/runtime-host/src/native-execution-budget") ||
    relativePath.startsWith(
      "packages/runtime-host/src/native-execution-trust-profile-registry",
    ) ||
    relativePath.startsWith("packages/runtime-host/src/native-isolation-supervisor") ||
    relativePath.startsWith(
      "packages/runtime-babylon/src/babylon-native-isolated-runtime-entry",
    ) ||
    relativePath === "scripts/verification/verify-hosted-native-isolation.ts" ||
    relativePath === "scripts/verification/verify-hosted-native-browser.ts";
}

function isPublicSchemaPath(relativePath: string): boolean {
  return relativePath.endsWith(".schema.json") && (
    relativePath.startsWith("packages/authoring/") ||
    relativePath.startsWith("packages/world-package/")
  );
}

function mayOwnNativeExecutionRequestConstruction(relativePath: string): boolean {
  return relativePath ===
      "packages/runtime-host/src/native-execution-admission.ts" ||
    relativePath ===
      "packages/runtime-contracts/src/native-execution-isolation.ts" ||
    relativePath ===
      "packages/runtime-contracts/src/native-execution-isolation-v1.schema.json";
}

function addTokenDiagnostics(
  diagnostics: Bna5CleanBreakDiagnostic[],
  code: Bna5CleanBreakDiagnostic["code"],
  relativePath: string,
  source: string,
  tokens: readonly string[],
): void {
  for (const token of tokens) {
    const pattern = new RegExp(`\\b${escaped(token)}\\b`, "gu");
    for (const match of source.matchAll(pattern)) {
      diagnostics.push({
        code,
        path: relativePath,
        line: lineAt(source, match.index),
        value: token,
      });
    }
  }
}

function hasExactBridgeIdentityChecks(
  bridge: string | undefined,
  frame: string | undefined,
): boolean {
  return bridge?.includes("event.origin !== this.input.runtimeOrigin") === true &&
    bridge.includes("event.source !== this.input.frame.contentWindow") &&
    bridge.includes("this.input.runtimeOrigin") &&
    frame?.includes("event.origin !== input.shellOrigin") === true &&
    frame.includes("event.source !== window.parent") &&
    frame.includes("input.shellOrigin");
}

export async function scanBna5CleanBreak(
  repositoryRoot: string,
  scanRoots: readonly string[] = BNA5_CLEAN_BREAK_SCAN_ROOTS,
): Promise<Bna5CleanBreakReport> {
  const sourceByPath = new Map<string, string>();
  for (const root of scanRoots) {
    for (const absolutePath of await discoverFiles(path.join(repositoryRoot, root))) {
      const relativePath = path.relative(repositoryRoot, absolutePath)
        .split(path.sep).join("/");
      if (relativePath === SELF_PATH || relativePath === TEST_PATH) continue;
      sourceByPath.set(relativePath, await readFile(absolutePath, "utf8"));
    }
  }

  const diagnostics: Bna5CleanBreakDiagnostic[] = [];
  for (const [relativePath, source] of sourceByPath) {
    if (isBna5OwnedPath(relativePath)) {
      addTokenDiagnostics(
        diagnostics,
        "BNA5_LEGACY_HOSTED_ALIAS",
        relativePath,
        source,
        LEGACY_HOSTED_ALIASES,
      );
    }
    addTokenDiagnostics(
      diagnostics,
      "BNA5_UNSAFE_EXECUTION_API",
      relativePath,
      source,
      UNSAFE_EXECUTION_APIS,
    );
    if (isBna5OwnedPath(relativePath)) {
      for (const match of source.matchAll(
        /\bpostMessage\s*\([\s\S]{0,500}?,\s*["']\*["']\s*(?:,|\))/gu,
      )) {
        diagnostics.push({
          code: "BNA5_WILDCARD_MESSAGE_TARGET",
          path: relativePath,
          line: lineAt(source, match.index),
          value: "postMessage wildcard target",
        });
      }
    }
    if (
      source.includes("allow-same-origin") &&
      /(?:frame|iframe)\.src\s*=\s*[^;\n]*\b(?:globalThis\.)?location\.origin/gu.test(source)
    ) {
      diagnostics.push({
        code: "BNA5_SAME_ORIGIN_SANDBOX",
        path: relativePath,
        line: lineAt(source, source.indexOf("allow-same-origin")),
        value: "allow-same-origin on application origin",
      });
    }
    if (isPublicSchemaPath(relativePath)) {
      for (const match of source.matchAll(INFRASTRUCTURE_FIELD_PATTERN)) {
        diagnostics.push({
          code: "BNA5_PUBLIC_SCHEMA_INFRASTRUCTURE_FIELD",
          path: relativePath,
          line: lineAt(source, match.index),
          value: match[0],
        });
      }
    }
    if (
      (relativePath === BRIDGE_PATH || relativePath === FRAME_PATH) &&
      /\bhosted\w*(?:Gameplay|Camera)\w*(?:Command|Action|Request)\w*\s*=/u
        .test(source)
    ) {
      diagnostics.push({
        code: "BNA5_HOSTED_COMMAND_DIALECT",
        path: relativePath,
        line: 1,
        value: "Hosted-specific Gameplay/Camera command declaration",
      });
    }
    const directRequestKind =
      /\bkind\s*:\s*["']native-isolated-execution-request["']/u.exec(source);
    if (
      !mayOwnNativeExecutionRequestConstruction(relativePath) &&
      directRequestKind !== null
    ) {
      diagnostics.push({
        code: "BNA5_DIRECT_EXECUTION_REQUEST_BYPASS",
        path: relativePath,
        line: lineAt(source, directRequestKind.index),
        value: "Native execution request constructed outside Host admission",
      });
    }
  }

  if (!hasExactBridgeIdentityChecks(
    sourceByPath.get(BRIDGE_PATH),
    sourceByPath.get(FRAME_PATH),
  )) {
    diagnostics.push({
      code: "BNA5_EXACT_ORIGIN_BRIDGE_MISSING",
      path: BRIDGE_PATH,
      line: 1,
      value: "exact origin/source bridge checks",
    });
  }

  diagnostics.sort((left, right) =>
    left.path.localeCompare(right.path) ||
    left.line - right.line ||
    left.code.localeCompare(right.code) ||
    left.value.localeCompare(right.value));
  const codes = new Set(diagnostics.map(({ code }) => code));
  const checks = Object.freeze({
    legacyHostedAliasesAbsent: !codes.has("BNA5_LEGACY_HOSTED_ALIAS"),
    unsafeExecutionApisAbsent: !codes.has("BNA5_UNSAFE_EXECUTION_API"),
    exactOriginMessaging: !codes.has("BNA5_WILDCARD_MESSAGE_TARGET") &&
      !codes.has("BNA5_SAME_ORIGIN_SANDBOX") &&
      !codes.has("BNA5_EXACT_ORIGIN_BRIDGE_MISSING"),
    publicSchemasInfrastructureFree:
      !codes.has("BNA5_PUBLIC_SCHEMA_INFRASTRUCTURE_FIELD"),
    hostedCommandDialectAbsent: !codes.has("BNA5_HOSTED_COMMAND_DIALECT"),
    directExecutionRequestBypassAbsent:
      !codes.has("BNA5_DIRECT_EXECUTION_REQUEST_BYPASS"),
  });
  return Object.freeze({
    kind: "worldkit-bna5-clean-break-report" as const,
    schemaVersion: 1 as const,
    ok: diagnostics.length === 0,
    scannedFileCount: sourceByPath.size,
    checks,
    diagnostics: Object.freeze(diagnostics),
  });
}

export async function main(): Promise<void> {
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const report = await scanBna5CleanBreak(repositoryRoot);
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
