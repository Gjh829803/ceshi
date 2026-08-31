import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import ts from "typescript";
import type { WorkspaceBoundaryViolationV1 } from "./workspace-boundary-contract";

export type { WorkspaceBoundaryViolationV1 } from "./workspace-boundary-contract";

export interface WorkspaceBoundaryDebtV1 {
  readonly importer: string;
  readonly specifier: string;
  readonly owner: string;
  readonly reason: string;
  readonly removalGate: string;
}

interface WorkspacePackage {
  readonly name: string;
  readonly root: string;
  readonly manifestPath: string;
  readonly exports: ReadonlyMap<string, string>;
  readonly productionDependencies: ReadonlySet<string>;
  readonly devDependencies: ReadonlySet<string>;
}

const SOURCE = /\.(?:c|m)?[jt]sx?$/;
const TEST_FILE = /(?:^|\/)(?:__tests__|tests?)(?:\/|$)|\.(?:test|spec)\.[^.]+$|(?:^|\/)[^/]*test-(?:fixture|plan|support)[^/]*\.[^.]+$|\.test-support\.[^.]+$/;

async function exists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function directories(parent: string): Promise<readonly string[]> {
  try {
    return (await readdir(parent, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(parent, entry.name));
  } catch {
    return [];
  }
}

function exportedTargets(value: unknown): ReadonlyMap<string, string> {
  if (typeof value === "string") return new Map([[".", value]]);
  if (value === null || typeof value !== "object" || Array.isArray(value)) return new Map();
  const result = new Map<string, string>();
  for (const [key, candidate] of Object.entries(value)) {
    if (!key.startsWith(".")) continue;
    if (typeof candidate === "string") {
      result.set(key, candidate);
      continue;
    }
    if (candidate !== null && typeof candidate === "object" && !Array.isArray(candidate)) {
      const conditional = Object.values(candidate).find((entry) => typeof entry === "string");
      if (typeof conditional === "string") result.set(key, conditional);
    }
  }
  return result;
}

async function readPackage(root: string): Promise<WorkspacePackage | undefined> {
  const manifestPath = path.join(root, "package.json");
  if (!await exists(manifestPath)) return undefined;
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
  if (typeof manifest.name !== "string") return undefined;
  const dependencies = (value: unknown) => new Set(
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? Object.keys(value)
      : [],
  );
  return {
    name: manifest.name,
    root,
    manifestPath,
    exports: exportedTargets(manifest.exports),
    productionDependencies: new Set([
      ...dependencies(manifest.dependencies),
      ...dependencies(manifest.peerDependencies),
      ...dependencies(manifest.optionalDependencies),
    ]),
    devDependencies: dependencies(manifest.devDependencies),
  };
}

async function workspacePackages(repositoryRoot: string): Promise<readonly WorkspacePackage[]> {
  const roots = [
    repositoryRoot,
    ...await directories(path.join(repositoryRoot, "packages")),
    ...await directories(path.join(repositoryRoot, "apps")),
  ];
  return (await Promise.all(roots.map(readPackage)))
    .filter((entry): entry is WorkspacePackage => entry !== undefined)
    .sort((left, right) => right.root.length - left.root.length);
}

async function sourceFiles(root: string): Promise<readonly string[]> {
  const result: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (["node_modules", ".git", "dist", "coverage", "artifacts"].includes(entry.name)) continue;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile() && SOURCE.test(entry.name)) result.push(target);
    }
  }
  await visit(root);
  return result.sort();
}

function literalImports(source: string, filePath: string): readonly string[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const imports = new Set<string>();
  function add(node: ts.Expression | undefined): void {
    if (node !== undefined && ts.isStringLiteralLike(node)) imports.add(node.text);
  }
  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) add(node.moduleSpecifier);
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node.moduleReference.expression);
    }
    if (ts.isCallExpression(node) &&
        ((node.expression.kind === ts.SyntaxKind.ImportKeyword) ||
          (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      add(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return [...imports].sort();
}

function ownerOf(filePath: string, packages: readonly WorkspacePackage[]): WorkspacePackage | undefined {
  return packages.find((candidate) =>
    filePath === candidate.root || filePath.startsWith(`${candidate.root}${path.sep}`));
}

function packageForSpecifier(
  specifier: string,
  packages: readonly WorkspacePackage[],
): WorkspacePackage | undefined {
  return packages.find((candidate) =>
    specifier === candidate.name || specifier.startsWith(`${candidate.name}/`));
}

function exportedSubpath(specifier: string, owner: WorkspacePackage): string {
  return specifier === owner.name ? "." : `.${specifier.slice(owner.name.length)}`;
}

function violation(
  code: WorkspaceBoundaryViolationV1["code"],
  importer: string,
  specifier: string,
  owner: string,
  message: string,
): WorkspaceBoundaryViolationV1 {
  return {
    code,
    importer,
    specifier,
    owner,
    message,
    removalGate: code === "WORKSPACE_PRIVATE_SIBLING_SOURCE" || code === "WORKSPACE_EXPORT_NOT_PUBLIC"
      ? "Replace with an explicitly exported public or testing subpath."
      : "Declare or restructure the dependency without weakening the boundary verifier.",
  };
}

export async function scanWorkspaceBoundaries(
  repositoryRoot: string,
): Promise<readonly WorkspaceBoundaryViolationV1[]> {
  const absoluteRoot = path.resolve(repositoryRoot);
  const packages = await workspacePackages(absoluteRoot);
  const violations: WorkspaceBoundaryViolationV1[] = [];
  for (const importerPath of await sourceFiles(absoluteRoot)) {
    const importerOwner = ownerOf(importerPath, packages);
    if (importerOwner === undefined) continue;
    const importer = path.relative(absoluteRoot, importerPath).split(path.sep).join("/");
    const isTest = TEST_FILE.test(importer);
    const source = await readFile(importerPath, "utf8");
    for (const specifier of literalImports(source, importerPath)) {
      if (specifier.startsWith(".")) {
        const targetPath = path.resolve(path.dirname(importerPath), specifier);
        const targetOwner = packages.find((candidate) =>
          candidate.root !== absoluteRoot &&
          (targetPath === candidate.root || targetPath.startsWith(`${candidate.root}${path.sep}`)));
        if (targetOwner !== undefined && targetOwner !== importerOwner) {
          violations.push(violation(
            "WORKSPACE_PRIVATE_SIBLING_SOURCE",
            importer,
            specifier,
            targetOwner.name,
            `Relative import crosses from '${importerOwner.name}' into '${targetOwner.name}'.`,
          ));
        }
        continue;
      }
      const dependency = packageForSpecifier(specifier, packages);
      if (dependency === undefined || dependency === importerOwner) continue;
      const subpath = exportedSubpath(specifier, dependency);
      const exportTarget = dependency.exports.get(subpath);
      if (exportTarget === undefined || !await exists(path.resolve(dependency.root, exportTarget))) {
        violations.push(violation(
          "WORKSPACE_EXPORT_NOT_PUBLIC",
          importer,
          specifier,
          dependency.name,
          `Workspace subpath '${subpath}' is not exported to an existing file by '${dependency.name}'.`,
        ));
        continue;
      }
      if (!isTest && (subpath === "./testing" || TEST_FILE.test(exportTarget))) {
        violations.push(violation(
          "WORKSPACE_PRODUCTION_TEST_EXPORT",
          importer,
          specifier,
          dependency.name,
          "Production source imports a testing-only package export.",
        ));
        continue;
      }
      const hasProductionDependency = importerOwner.productionDependencies.has(dependency.name);
      const hasTestDependency = importerOwner.devDependencies.has(dependency.name);
      if (!hasProductionDependency && !isTest && hasTestDependency) {
        violations.push(violation(
          "WORKSPACE_PRODUCTION_DEPENDENCY_IN_DEV",
          importer,
          specifier,
          dependency.name,
          "Production source relies on a workspace dependency declared only in devDependencies.",
        ));
      } else if (!hasProductionDependency && !(isTest && hasTestDependency)) {
        violations.push(violation(
          "WORKSPACE_DIRECT_DEPENDENCY_MISSING",
          importer,
          specifier,
          dependency.name,
          "Importer does not declare the workspace package as a direct dependency.",
        ));
      }
    }
  }

  const packageByName = new Map(packages.map((entry) => [entry.name, entry]));
  const visited = new Set<string>();
  const visiting: string[] = [];
  function visit(name: string): void {
    if (visited.has(name)) return;
    const cycleStart = visiting.indexOf(name);
    if (cycleStart >= 0) {
      const cycle = [...visiting.slice(cycleStart), name];
      const owner = packageByName.get(visiting.at(-1)!);
      if (owner !== undefined) {
        violations.push(violation(
          "WORKSPACE_DEPENDENCY_CYCLE",
          path.relative(absoluteRoot, owner.manifestPath).split(path.sep).join("/"),
          name,
          name,
          `Workspace production dependency cycle: ${cycle.join(" -> ")}.`,
        ));
      }
      return;
    }
    visiting.push(name);
    for (const dependency of packageByName.get(name)?.productionDependencies ?? []) {
      if (packageByName.has(dependency)) visit(dependency);
    }
    visiting.pop();
    visited.add(name);
  }
  for (const workspacePackage of packages) visit(workspacePackage.name);

  return violations.sort((left, right) =>
    left.importer.localeCompare(right.importer) ||
    left.specifier.localeCompare(right.specifier) ||
    left.code.localeCompare(right.code));
}

export function reconcileWorkspaceBoundaryDebt(
  violations: readonly WorkspaceBoundaryViolationV1[],
  debt: readonly WorkspaceBoundaryDebtV1[],
): readonly string[] {
  const errors: string[] = [];
  const key = (entry: Pick<WorkspaceBoundaryDebtV1, "importer" | "specifier" | "owner">) =>
    `${entry.importer}\0${entry.specifier}\0${entry.owner}`;
  const violationKeys = new Set(violations.map(key));
  const debtKeys = new Set<string>();
  for (const entry of debt) {
    if ([entry.importer, entry.specifier, entry.owner].some((value) =>
      typeof value !== "string" || value.length === 0 || /[*?]/.test(value)) ||
      typeof entry.reason !== "string" || entry.reason.trim().length < 8 ||
      typeof entry.removalGate !== "string" || entry.removalGate.trim().length < 8) {
      errors.push(`WORKSPACE_BOUNDARY_DEBT_INVALID: ${JSON.stringify(entry)}`);
      continue;
    }
    const entryKey = key(entry);
    if (debtKeys.has(entryKey)) errors.push(`WORKSPACE_BOUNDARY_DEBT_DUPLICATE: ${entry.importer} -> ${entry.specifier}`);
    debtKeys.add(entryKey);
    if (!violationKeys.has(entryKey)) errors.push(`WORKSPACE_BOUNDARY_DEBT_STALE: ${entry.importer} -> ${entry.specifier}`);
  }
  for (const violationEntry of violations) {
    if (!debtKeys.has(key(violationEntry))) {
      errors.push(`${violationEntry.code}: ${violationEntry.importer} -> ${violationEntry.specifier}`);
    }
  }
  return errors.sort();
}
