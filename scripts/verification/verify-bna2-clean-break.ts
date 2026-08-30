import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  scanBna1CleanBreak,
  type Bna1CleanBreakScanOptions,
} from "./verify-bna1-clean-break";

export const BNA2_CLEAN_BREAK_SCAN_ROOTS = Object.freeze([
  "packages",
  "apps",
  "scripts",
] as const);

const WORKSPACE_PARSER_OWNER =
  "scripts/native-scene/authoring-workspace.ts";
const WORKSPACE_FIXTURE_OWNER = "scripts/native-scene/test-support.ts";
const IMPORT_PROFILE_OWNER = "packages/native-babylon/src/import-profile.ts";
const SELF_PATH = "scripts/verification/verify-bna2-clean-break.ts";

export interface Bna2CleanBreakScanOptions {
  readonly scanRoots?: readonly string[];
  readonly bna1ScanOptions?: Bna1CleanBreakScanOptions;
  readonly workspaceParserOwnerPath?: string;
  readonly importProfileOwnerPath?: string;
}

export interface Bna2CleanBreakDiagnostic {
  readonly code:
    | "BNA2_OLD_CANDIDATE_API"
    | "BNA2_OLD_CLOUD_RIDGE_API"
    | "BNA2_SECOND_WORKSPACE_PARSER"
    | "BNA2_SECOND_IMPORT_PROFILE"
    | "BNA2_FORMAL_NATIVE_PREALLOCATION_GUARD_INVALID";
  readonly path: string;
  readonly line: number;
  readonly value: string;
}

export interface Bna2CleanBreakReport {
  readonly kind: "worldkit-bna2-clean-break-report";
  readonly schemaVersion: 1;
  readonly ok: boolean;
  readonly scannedFileCount: number;
  readonly diagnostics: readonly Bna2CleanBreakDiagnostic[];
}

const TEXT_EXTENSIONS = new Set([
  ".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx",
]);
const IGNORED_DIRECTORIES = new Set([".git", "coverage", "dist", "node_modules"]);

function token(parts: readonly string[]): string {
  return parts.join("");
}

const OLD_CANDIDATE_API_NAMES = Object.freeze([
  token(["Build", "Babylon", "Native", "Scene", "Candidate"]),
  token(["build", "Babylon", "Native", "Scene", "Candidate", "V1"]),
]);
const OLD_CLOUD_RIDGE_API_NAMES = Object.freeze([
  token(["Cloud", "Ridge", "Native", "Scene", "Controller", "V1"]),
  token(["create", "Cloud", "Ridge", "Native", "Scene", "Controller", "V1"]),
  token(["collision", "Debug", "Snapshot"]),
  token(["set", "Collision", "Debug", "Visible"]),
  token(["set", "Collider", "Debug", "Visible"]),
]);
const WORKSPACE_PARSER_NAME = token([
  "read", "Babylon", "Native", "Authoring", "Workspace", "Root", "V1",
]);
const IMPORT_PROFILE_NAME = token([
  "BABYLON", "_NATIVE", "_DEEP", "_ESM", "_IMPORT", "_SPECIFIERS", "_V1",
]);
const BOOTSTRAP_FILE_NAME = token(["native", "-scene", ".bootstrap", ".json"]);

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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
    else if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(child);
    }
  }
  return files;
}

export async function scanBna2CleanBreak(
  repositoryRoot: string,
  options: Bna2CleanBreakScanOptions = {},
): Promise<Bna2CleanBreakReport> {
  const scanRoots = options.scanRoots ?? BNA2_CLEAN_BREAK_SCAN_ROOTS;
  const workspaceParserOwnerPath = options.workspaceParserOwnerPath ??
    WORKSPACE_PARSER_OWNER;
  const importProfileOwnerPath = options.importProfileOwnerPath ??
    IMPORT_PROFILE_OWNER;
  const sourceByPath = new Map<string, string>();
  for (const root of scanRoots) {
    for (const absolutePath of await discoverFiles(path.join(repositoryRoot, root))) {
      const relativePath = path.relative(repositoryRoot, absolutePath)
        .split(path.sep).join("/");
      if (relativePath === SELF_PATH) continue;
      sourceByPath.set(relativePath, await readFile(absolutePath, "utf8"));
    }
  }

  const diagnostics: Bna2CleanBreakDiagnostic[] = [];
  const addNameMatches = (
    code: Bna2CleanBreakDiagnostic["code"],
    relativePath: string,
    source: string,
    names: readonly string[],
  ): void => {
    for (const name of names) {
      const pattern = new RegExp(`\\b${escaped(name)}\\b`, "g");
      for (const match of source.matchAll(pattern)) {
        diagnostics.push({
          code,
          path: relativePath,
          line: lineAt(source, match.index),
          value: name,
        });
      }
    }
  };

  const workspaceOwnerDeclarations: string[] = [];
  const importProfileOwnerDeclarations: string[] = [];
  const workspaceDeclaration = new RegExp(
    `\\bexport\\s+async\\s+function\\s+${escaped(WORKSPACE_PARSER_NAME)}\\b`,
  );
  const importProfileDeclaration = new RegExp(
    `\\bexport\\s+const\\s+${escaped(IMPORT_PROFILE_NAME)}\\b`,
  );
  for (const [relativePath, source] of sourceByPath) {
    addNameMatches(
      "BNA2_OLD_CANDIDATE_API",
      relativePath,
      source,
      OLD_CANDIDATE_API_NAMES,
    );
    addNameMatches(
      "BNA2_OLD_CLOUD_RIDGE_API",
      relativePath,
      source,
      OLD_CLOUD_RIDGE_API_NAMES,
    );
    if (workspaceDeclaration.test(source)) {
      workspaceOwnerDeclarations.push(relativePath);
    }
    if (importProfileDeclaration.test(source)) {
      importProfileOwnerDeclarations.push(relativePath);
    }
    if (
      source.includes(BOOTSTRAP_FILE_NAME) &&
      relativePath !== workspaceParserOwnerPath &&
      relativePath !== WORKSPACE_FIXTURE_OWNER
    ) {
      diagnostics.push({
        code: "BNA2_SECOND_WORKSPACE_PARSER",
        path: relativePath,
        line: lineAt(source, source.indexOf(BOOTSTRAP_FILE_NAME)),
        value: BOOTSTRAP_FILE_NAME,
      });
    }
  }

  if (
    workspaceOwnerDeclarations.length !== 1 ||
    workspaceOwnerDeclarations[0] !== workspaceParserOwnerPath
  ) {
    for (const ownerPath of workspaceOwnerDeclarations.length === 0
      ? [workspaceParserOwnerPath]
      : workspaceOwnerDeclarations.sort()) {
      diagnostics.push({
        code: "BNA2_SECOND_WORKSPACE_PARSER",
        path: ownerPath,
        line: 1,
        value: "Native authoring workspace parser must have exactly one owner",
      });
    }
  }
  if (
    importProfileOwnerDeclarations.length !== 1 ||
    importProfileOwnerDeclarations[0] !== importProfileOwnerPath
  ) {
    for (const ownerPath of importProfileOwnerDeclarations.length === 0
      ? [importProfileOwnerPath]
      : importProfileOwnerDeclarations.sort()) {
      diagnostics.push({
        code: "BNA2_SECOND_IMPORT_PROFILE",
        path: ownerPath,
        line: 1,
        value: "Babylon Native import profile must have exactly one owner",
      });
    }
  }

  const bna1Report = await scanBna1CleanBreak(
    repositoryRoot,
    options.bna1ScanOptions,
  );
  for (const diagnostic of bna1Report.diagnostics) {
    if (diagnostic.code !== "BNA1_FORMAL_NATIVE_PREALLOCATION_GUARD_INVALID") {
      continue;
    }
    diagnostics.push({
      code: "BNA2_FORMAL_NATIVE_PREALLOCATION_GUARD_INVALID",
      path: diagnostic.path,
      line: diagnostic.line,
      value: diagnostic.value,
    });
  }

  diagnostics.sort((left, right) =>
    left.path.localeCompare(right.path) ||
    left.line - right.line ||
    left.code.localeCompare(right.code) ||
    left.value.localeCompare(right.value)
  );
  return {
    kind: "worldkit-bna2-clean-break-report",
    schemaVersion: 1,
    ok: diagnostics.length === 0,
    scannedFileCount: sourceByPath.size,
    diagnostics: Object.freeze(diagnostics),
  };
}

export async function main(): Promise<void> {
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const report = await scanBna2CleanBreak(repositoryRoot);
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
