import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { isNil, sortBy, uniq } from "lodash-es";
import ts from "typescript";

import {
  parseWorkspaceBoundaryEvidenceV1,
  workspaceBoundaryDebtFingerprintV1,
  type WorkspaceBoundaryEvidenceV1,
  type WorkspaceBoundaryScanRequestV1,
  type WorkspaceBoundaryViolationV1,
  type WorkspaceDependencyEdgeV1,
  type WorkspacePublicSymbolOwnershipV1,
} from "./workspace-boundary-contract";

export type {
  WorkspaceBoundaryEvidenceV1,
  WorkspaceBoundaryScanRequestV1,
  WorkspaceBoundaryViolationV1,
} from "./workspace-boundary-contract";

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

interface CollectedExport {
  readonly symbolName: string;
  readonly isTypeOnly: boolean;
  readonly isReexport: boolean;
}

interface FileExportSurface {
  readonly names: readonly CollectedExport[];
  readonly stars: readonly Readonly<{ specifier: string; isTypeOnly: boolean }>[];
}

const SOURCE = /\.(?:c|m)?[jt]sx?$/;
const TEST_FILE = /(?:^|\/)(?:__tests__|tests?)(?:\/|$)|\.(?:test|spec)\.[^.]+$|(?:^|\/)[^/]*test-(?:fixture|plan|support)[^/]*\.[^.]+$|\.test-support\.[^.]+$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/;
const EXTENSIONS = ["", ".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"];

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

function repoPath(absoluteRoot: string, absolutePath: string): string {
  const relative = path.relative(absoluteRoot, absolutePath).split(path.sep).join("/");
  return relative === "" ? "." : relative;
}

function sourceFileKind(filePath: string): ts.ScriptKind {
  if (filePath.endsWith("x")) return ts.ScriptKind.TSX;
  return ts.ScriptKind.TS;
}

function parseSourceFile(filePath: string, source: string): ts.SourceFile {
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, sourceFileKind(filePath));
}

function stringLiteral(node: ts.Expression | undefined): string | undefined {
  if (isNil(node) || !ts.isStringLiteralLike(node)) return undefined;
  return node.text;
}

function literalImports(sourceFile: ts.SourceFile): readonly string[] {
  const imports = new Set<string>();
  function add(node: ts.Expression | undefined): void {
    const value = stringLiteral(node);
    if (!isNil(value)) imports.add(value);
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

function hasExportModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

function hasDefaultModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword);
}

function fileExportSurface(sourceFile: ts.SourceFile): FileExportSurface {
  const names: CollectedExport[] = [];
  const stars: Array<{ specifier: string; isTypeOnly: boolean }> = [];

  function pushName(symbolName: string, isTypeOnly: boolean, isReexport: boolean): void {
    if (!/^(?:[A-Za-z_$][A-Za-z0-9_$]*|default)$/.test(symbolName)) return;
    names.push({ symbolName, isTypeOnly, isReexport });
  }

  function visit(node: ts.Node): void {
    if (ts.isExportDeclaration(node)) {
      const specifier = stringLiteral(node.moduleSpecifier);
      if (!isNil(specifier) && isNil(node.exportClause)) {
        stars.push({ specifier, isTypeOnly: node.isTypeOnly });
        return;
      }
      if (!isNil(node.exportClause) && ts.isNamespaceExport(node.exportClause)) {
        pushName(node.exportClause.name.text, node.isTypeOnly, !isNil(specifier));
        return;
      }
      if (!isNil(node.exportClause) && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          pushName(element.name.text, node.isTypeOnly || element.isTypeOnly, !isNil(specifier));
        }
      }
      return;
    }
    if (ts.isExportAssignment(node) && node.isExportEquals !== true) {
      pushName("default", false, false);
      return;
    }
    if (hasExportModifier(node)) {
      if (hasDefaultModifier(node)) {
        pushName("default", ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node), false);
        return;
      }
      if (ts.isVariableStatement(node)) {
        for (const declaration of node.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)) pushName(declaration.name.text, false, false);
        }
        return;
      }
      if (
        (ts.isFunctionDeclaration(node) ||
          ts.isClassDeclaration(node) ||
          ts.isEnumDeclaration(node) ||
          ts.isModuleDeclaration(node) ||
          ts.isInterfaceDeclaration(node) ||
          ts.isTypeAliasDeclaration(node)) &&
        !isNil(node.name)
      ) {
        pushName(
          node.name.text,
          ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node),
          false,
        );
      }
    }
  }

  ts.forEachChild(sourceFile, visit);
  return { names, stars };
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

function resolveRelative(fromFile: string, specifier: string, files: ReadonlySet<string>): string | undefined {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    ...EXTENSIONS.filter((extension) => extension !== "").map((extension) => `${base}${extension}`),
    ...["index.ts", "index.tsx", "index.mts", "index.js"].map((fileName) => path.join(base, fileName)),
  ];
  return candidates.find((candidate) => files.has(candidate));
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

async function loadDebt(absoluteRoot: string): Promise<readonly WorkspaceBoundaryDebtV1[]> {
  try {
    const parsed = JSON.parse(
      await readFile(path.join(absoluteRoot, "config/workspace-boundary-debt.json"), "utf8"),
    ) as { schemaVersion?: unknown; entries?: unknown };
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.entries)) return [];
    return parsed.entries as WorkspaceBoundaryDebtV1[];
  } catch {
    return [];
  }
}

function workspaceIds(
  names: ReadonlySet<string>,
  packages: readonly WorkspacePackage[],
): readonly string[] {
  return sortBy([...names].filter((name) => packages.some((entry) => entry.name === name)));
}

export async function scanWorkspaceBoundaries(
  request: WorkspaceBoundaryScanRequestV1,
): Promise<WorkspaceBoundaryEvidenceV1> {
  if (typeof request !== "object" || isNil(request) || Array.isArray(request)) {
    throw new TypeError("scanWorkspaceBoundaries requires WorkspaceBoundaryScanRequestV1.");
  }
  if (typeof request.commitSha !== "string" || !COMMIT_SHA.test(request.commitSha)) {
    throw new TypeError("scanWorkspaceBoundaries requires a Host-injected 40-character commit SHA.");
  }
  const absoluteRoot = path.resolve(request.repositoryRoot);
  const packages = await workspacePackages(absoluteRoot);
  const files = await sourceFiles(absoluteRoot);
  const fileSet = new Set(files);
  const surfaces = new Map<string, FileExportSurface>();
  const violations: WorkspaceBoundaryViolationV1[] = [];
  const edgesByKey = new Map<string, WorkspaceDependencyEdgeV1>();

  function addEdge(edge: WorkspaceDependencyEdgeV1): void {
    const key = `${edge.importerPath}\0${edge.specifier}\0${edge.targetPackageId}\0${edge.usage}`;
    edgesByKey.set(key, edge);
  }

  for (const importerPath of files) {
    const importerOwner = ownerOf(importerPath, packages);
    if (importerOwner === undefined) continue;
    const importer = repoPath(absoluteRoot, importerPath);
    const isTest = TEST_FILE.test(importer);
    const sourceFile = parseSourceFile(importerPath, await readFile(importerPath, "utf8"));
    surfaces.set(importerPath, fileExportSurface(sourceFile));
    for (const specifier of literalImports(sourceFile)) {
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
          addEdge({
            importerPath: importer,
            importerPackageId: importerOwner.name,
            specifier,
            targetPackageId: targetOwner.name,
            usage: isTest ? "test" : "production",
          });
        }
        continue;
      }
      const dependency = packageForSpecifier(specifier, packages);
      if (dependency === undefined || dependency === importerOwner) continue;
      addEdge({
        importerPath: importer,
        importerPackageId: importerOwner.name,
        specifier,
        targetPackageId: dependency.name,
        usage: isTest ? "test" : "production",
      });
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
          repoPath(absoluteRoot, owner.manifestPath),
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

  const resolvedExports = new Map<string, readonly CollectedExport[]>();
  const resolving = new Set<string>();

  function resolveFileExports(filePath: string): readonly CollectedExport[] {
    const cached = resolvedExports.get(filePath);
    if (!isNil(cached)) return cached;
    if (resolving.has(filePath)) return [];
    const surface = surfaces.get(filePath);
    if (isNil(surface)) return [];
    resolving.add(filePath);
    const names: CollectedExport[] = [];
    const seen = new Set<string>();
    for (const entry of surface.names) {
      const key = `${entry.symbolName}\0${entry.isTypeOnly ? "1" : "0"}`;
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(entry);
    }
    for (const star of surface.stars) {
      const target = resolveStarTarget(filePath, star.specifier, packages, fileSet);
      if (isNil(target)) continue;
      for (const exported of resolveFileExports(target)) {
        const key = `${exported.symbolName}\0${(exported.isTypeOnly || star.isTypeOnly) ? "1" : "0"}`;
        if (seen.has(key)) continue;
        seen.add(key);
        names.push({
          symbolName: exported.symbolName,
          isTypeOnly: exported.isTypeOnly || star.isTypeOnly,
          isReexport: true,
        });
      }
    }
    resolving.delete(filePath);
    resolvedExports.set(filePath, names);
    return names;
  }

  const publicSymbols: WorkspacePublicSymbolOwnershipV1[] = [];
  for (const workspacePackage of packages) {
    for (const [subpath, target] of workspacePackage.exports) {
      const absoluteTarget = path.resolve(workspacePackage.root, target);
      if (!SOURCE.test(absoluteTarget) || !fileSet.has(absoluteTarget)) continue;
      const sourcePath = repoPath(absoluteRoot, absoluteTarget);
      for (const exported of resolveFileExports(absoluteTarget)) {
        publicSymbols.push({
          packageId: workspacePackage.name,
          sourcePath,
          exportSubpath: subpath,
          symbolName: exported.symbolName,
          isTypeOnly: exported.isTypeOnly,
          isReexport: exported.isReexport,
        });
      }
    }
  }

  const sortedViolations = sortBy(violations, ["code", "importer", "specifier", "owner"]);
  const debt = await loadDebt(absoluteRoot);
  const violationKeys = new Set(sortedViolations.map((entry) =>
    `${entry.importer}\0${entry.specifier}\0${entry.owner}`));
  const reconciledDebtFingerprints = uniq(sortBy(
    debt
      .filter((entry) => violationKeys.has(`${entry.importer}\0${entry.specifier}\0${entry.owner}`))
      .map((entry) => workspaceBoundaryDebtFingerprintV1(entry)),
  ));

  const graphPackages = packages.map((entry) => ({
    id: entry.name,
    rootPath: repoPath(absoluteRoot, entry.root),
    manifestPath: repoPath(absoluteRoot, entry.manifestPath),
    exportedSubpaths: sortBy(
      [...entry.exports.entries()].map(([subpath, target]) => ({
        subpath,
        targetPath: repoPath(absoluteRoot, path.resolve(entry.root, target)),
      })),
      ["subpath", "targetPath"],
    ),
    productionDependencyIds: workspaceIds(entry.productionDependencies, packages),
    developmentDependencyIds: workspaceIds(entry.devDependencies, packages),
  }));

  return parseWorkspaceBoundaryEvidenceV1({
    kind: "workspace-boundary-evidence",
    schemaVersion: 1,
    graph: {
      kind: "workspace-dependency-graph",
      schemaVersion: 1,
      commitSha: request.commitSha,
      packages: graphPackages,
      edges: [...edgesByKey.values()],
    },
    publicSymbols,
    violations: sortedViolations,
    reconciledDebtFingerprints,
  });
}

function resolveStarTarget(
  fromFile: string,
  specifier: string,
  packages: readonly WorkspacePackage[],
  files: ReadonlySet<string>,
): string | undefined {
  if (specifier.startsWith(".")) return resolveRelative(fromFile, specifier, files);
  const dependency = packageForSpecifier(specifier, packages);
  if (isNil(dependency)) return undefined;
  const subpath = exportedSubpath(specifier, dependency);
  const exportTarget = dependency.exports.get(subpath);
  if (isNil(exportTarget)) return undefined;
  const absoluteTarget = path.resolve(dependency.root, exportTarget);
  return files.has(absoluteTarget) ? absoluteTarget : undefined;
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
