import { sha256CanonicalJson } from "@whitebox-world/protocol";
import { isEmpty, isNil, sortBy, uniq } from "lodash-es";

export type WorkspaceBoundaryViolationCodeV1 =
  | "WORKSPACE_DIRECT_DEPENDENCY_MISSING"
  | "WORKSPACE_PRODUCTION_DEPENDENCY_IN_DEV"
  | "WORKSPACE_EXPORT_NOT_PUBLIC"
  | "WORKSPACE_PRIVATE_SIBLING_SOURCE"
  | "WORKSPACE_PRODUCTION_TEST_EXPORT"
  | "WORKSPACE_DEPENDENCY_CYCLE";

export interface WorkspaceBoundaryViolationV1 {
  readonly code: WorkspaceBoundaryViolationCodeV1;
  readonly importer: string;
  readonly specifier: string;
  readonly owner: string;
  readonly message: string;
  readonly removalGate: string;
}

export interface WorkspaceDependencyPackageV1 {
  readonly id: string;
  readonly rootPath: string;
  readonly manifestPath: string;
  readonly exportedSubpaths: readonly Readonly<{
    readonly subpath: string;
    readonly targetPath: string;
  }>[];
  readonly productionDependencyIds: readonly string[];
  readonly developmentDependencyIds: readonly string[];
}

export interface WorkspaceDependencyEdgeV1 {
  readonly importerPath: string;
  readonly importerPackageId: string;
  readonly specifier: string;
  readonly targetPackageId: string;
  readonly usage: "production" | "test";
}

export interface WorkspaceDependencyGraphV1 {
  readonly kind: "workspace-dependency-graph";
  readonly schemaVersion: 1;
  readonly commitSha: string;
  readonly packages: readonly WorkspaceDependencyPackageV1[];
  readonly edges: readonly WorkspaceDependencyEdgeV1[];
}

export interface WorkspacePublicSymbolOwnershipV1 {
  readonly packageId: string;
  readonly sourcePath: string;
  readonly exportSubpath: string;
  readonly symbolName: string;
  readonly isTypeOnly: boolean;
  readonly isReexport: boolean;
}

export interface WorkspaceBoundaryEvidenceV1 {
  readonly kind: "workspace-boundary-evidence";
  readonly schemaVersion: 1;
  readonly graph: WorkspaceDependencyGraphV1;
  readonly publicSymbols: readonly WorkspacePublicSymbolOwnershipV1[];
  readonly violations: readonly WorkspaceBoundaryViolationV1[];
  readonly reconciledDebtFingerprints: readonly string[];
}

export interface WorkspaceBoundaryScanRequestV1 {
  readonly repositoryRoot: string;
  readonly commitSha: string;
}

export interface WorkspaceBoundaryDebtIdentityV1 {
  readonly importer: string;
  readonly specifier: string;
  readonly owner: string;
}

const COMMIT_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const PACKAGE_ID = /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/;
const SYMBOL_NAME = /^(?:[A-Za-z_$][A-Za-z0-9_$]*|default)$/;
const GLOB_OR_REGEX = /[*?[\]()^$|\\]/;
const VIOLATION_CODES = new Set<WorkspaceBoundaryViolationCodeV1>([
  "WORKSPACE_DIRECT_DEPENDENCY_MISSING",
  "WORKSPACE_PRODUCTION_DEPENDENCY_IN_DEV",
  "WORKSPACE_EXPORT_NOT_PUBLIC",
  "WORKSPACE_PRIVATE_SIBLING_SOURCE",
  "WORKSPACE_PRODUCTION_TEST_EXPORT",
  "WORKSPACE_DEPENDENCY_CYCLE",
]);

function invalid(detail = "Value must match the closed WorkspaceBoundaryEvidenceV1 schema."): never {
  throw new TypeError(detail);
}

function invalidPath(): never {
  throw new TypeError("Workspace paths must be canonical repository-relative POSIX paths.");
}

function record(
  input: unknown,
  fields: readonly string[],
  error: () => never = invalid,
): Record<string, unknown> {
  if (typeof input !== "object" || isNil(input) || Array.isArray(input)) return error();
  const source = input as Record<string, unknown>;
  const keys = Object.keys(source);
  if (
    keys.length !== fields.length ||
    fields.some((field) => !Object.hasOwn(source, field)) ||
    keys.some((field) => !fields.includes(field))
  ) return error();
  return source;
}

function string(input: unknown): string {
  if (
    typeof input !== "string" ||
    isEmpty(input) ||
    input.trim() !== input ||
    input.normalize("NFC") !== input
  ) return invalid();
  return input;
}

function stableText(input: unknown): string {
  const value = string(input);
  if (
    /(?:file:\/\/|(?:^|[\s"'(=])\/(?!\/)[^\s"'()]*|[A-Za-z]:\\)/i.test(value) ||
    /(?:api[_-]?key|token|secret)\s*[=:]|\b(?:crsr|sk)_[A-Za-z0-9]{16,}/i.test(value)
  ) throw new TypeError("Workspace evidence text must be stable workspace text without machine paths or credentials.");
  return value;
}

function identity(input: unknown): string {
  const value = string(input);
  if (/\s/.test(value)) return invalid();
  return value;
}

function packageId(input: unknown): string {
  const value = identity(input);
  if (!PACKAGE_ID.test(value)) return invalid();
  return value;
}

function moduleSpecifier(input: unknown): string {
  const value = string(input);
  if (
    value.startsWith("/") ||
    value.startsWith("file:") ||
    value.includes("\\") ||
    /^[A-Za-z]:/.test(value)
  ) return invalid();
  return value;
}

function repositoryPath(input: unknown, allowRoot: boolean): string {
  const value = string(input);
  if (allowRoot && value === ".") return value;
  if (
    value === "." ||
    value.startsWith("/") ||
    value.includes("\\") ||
    /^[A-Za-z]:/.test(value) ||
    value.split("/").some((segment) => isEmpty(segment) || segment === "." || segment === "..")
  ) return invalidPath();
  return value;
}

export function parseRepositoryRelativePathV1(input: unknown, allowRoot = false): string {
  return repositoryPath(input, allowRoot);
}

function stringArray(input: unknown, item: (value: unknown) => string): readonly string[] {
  if (!Array.isArray(input)) return invalid();
  const values = input.map(item);
  if (uniq(values).length !== values.length) return invalid();
  return sortBy(values);
}

function parsePackage(input: unknown): WorkspaceDependencyPackageV1 {
  const source = record(input, [
    "id",
    "rootPath",
    "manifestPath",
    "exportedSubpaths",
    "productionDependencyIds",
    "developmentDependencyIds",
  ]);
  if (!Array.isArray(source.exportedSubpaths)) return invalid();
  const exportedSubpaths = source.exportedSubpaths.map((entry) => {
    const exported = record(entry, ["subpath", "targetPath"]);
    const subpath = string(exported.subpath);
    if (GLOB_OR_REGEX.test(subpath)) return invalid();
    return {
      subpath,
      targetPath: repositoryPath(exported.targetPath, false),
    };
  });
  const exportedSubpathKeys = exportedSubpaths.map((entry) => entry.subpath);
  if (uniq(exportedSubpathKeys).length !== exportedSubpathKeys.length) {
    return invalid("Workspace evidence requires unique export subpath values.");
  }
  return {
    id: packageId(source.id),
    rootPath: repositoryPath(source.rootPath, true),
    manifestPath: repositoryPath(source.manifestPath, false),
    exportedSubpaths: sortBy(exportedSubpaths, ["subpath", "targetPath"]),
    productionDependencyIds: stringArray(source.productionDependencyIds, packageId),
    developmentDependencyIds: stringArray(source.developmentDependencyIds, packageId),
  };
}

function parsePublicSymbol(input: unknown): WorkspacePublicSymbolOwnershipV1 {
  const source = record(input, [
    "packageId",
    "sourcePath",
    "exportSubpath",
    "symbolName",
    "isTypeOnly",
    "isReexport",
  ]);
  const symbolName = string(source.symbolName);
  const exportSubpath = string(source.exportSubpath);
  if (!SYMBOL_NAME.test(symbolName) || GLOB_OR_REGEX.test(exportSubpath)) return invalid();
  if (typeof source.isTypeOnly !== "boolean" || typeof source.isReexport !== "boolean") return invalid();
  return {
    packageId: packageId(source.packageId),
    sourcePath: repositoryPath(source.sourcePath, false),
    exportSubpath,
    symbolName,
    isTypeOnly: source.isTypeOnly,
    isReexport: source.isReexport,
  };
}

function owningPackage(
  packages: readonly WorkspaceDependencyPackageV1[],
  filePath: string,
): WorkspaceDependencyPackageV1 | undefined {
  const matches = packages.filter((entry) =>
    entry.rootPath === "." || filePath === entry.rootPath || filePath.startsWith(`${entry.rootPath}/`),
  );
  if (isEmpty(matches)) return undefined;
  return sortBy(matches, (entry) => -entry.rootPath.length)[0];
}

function parseEdge(input: unknown): WorkspaceDependencyEdgeV1 {
  const source = record(input, [
    "importerPath",
    "importerPackageId",
    "specifier",
    "targetPackageId",
    "usage",
  ]);
  if (source.usage !== "production" && source.usage !== "test") return invalid();
  return {
    importerPath: repositoryPath(source.importerPath, false),
    importerPackageId: packageId(source.importerPackageId),
    specifier: moduleSpecifier(source.specifier),
    targetPackageId: packageId(source.targetPackageId),
    usage: source.usage,
  };
}

function parseViolation(input: unknown): WorkspaceBoundaryViolationV1 {
  const source = record(input, ["code", "importer", "specifier", "owner", "message", "removalGate"]);
  if (typeof source.code !== "string" || !VIOLATION_CODES.has(source.code as WorkspaceBoundaryViolationCodeV1)) {
    return invalid();
  }
  return {
    code: source.code as WorkspaceBoundaryViolationCodeV1,
    importer: repositoryPath(source.importer, false),
    specifier: moduleSpecifier(source.specifier),
    owner: packageId(source.owner),
    message: stableText(source.message),
    removalGate: stableText(source.removalGate),
  };
}

export function parseWorkspaceBoundaryEvidenceV1(input: unknown): WorkspaceBoundaryEvidenceV1 {
  const source = record(input, [
    "kind",
    "schemaVersion",
    "graph",
    "publicSymbols",
    "violations",
    "reconciledDebtFingerprints",
  ]);
  if (source.kind !== "workspace-boundary-evidence" || source.schemaVersion !== 1) return invalid();
  const graph = record(source.graph, ["kind", "schemaVersion", "commitSha", "packages", "edges"]);
  if (
    graph.kind !== "workspace-dependency-graph" ||
    graph.schemaVersion !== 1 ||
    typeof graph.commitSha !== "string" ||
    !COMMIT_SHA.test(graph.commitSha) ||
    !Array.isArray(graph.packages) ||
    !Array.isArray(graph.edges) ||
    !Array.isArray(source.publicSymbols) ||
    !Array.isArray(source.violations)
  ) return invalid();
  const packages = graph.packages.map(parsePackage);
  const packageIds = packages.map((entry) => entry.id);
  if (uniq(packageIds).length !== packageIds.length) {
    return invalid("Workspace evidence requires unique package id values.");
  }
  const rootPaths = packages.map((entry) => entry.rootPath);
  if (uniq(rootPaths).length !== rootPaths.length) {
    return invalid("Workspace evidence requires unique package rootPath values.");
  }
  const manifestPaths = packages.map((entry) => entry.manifestPath);
  if (uniq(manifestPaths).length !== manifestPaths.length) {
    return invalid("Workspace evidence requires unique package manifestPath values.");
  }
  const rootPackages = packages.filter((entry) => entry.rootPath === ".");
  if (rootPackages.length !== 1) return invalid();
  const packageById = new Map(packages.map((entry) => [entry.id, entry]));
  const edges = graph.edges.map(parseEdge);
  const edgeKeys = edges.map((entry) =>
    `${entry.importerPath}\0${entry.specifier}\0${entry.targetPackageId}\0${entry.usage}`,
  );
  if (uniq(edgeKeys).length !== edgeKeys.length) {
    return invalid("Workspace evidence requires unique dependency edges.");
  }
  for (const edge of edges) {
    const importer = packageById.get(edge.importerPackageId);
    const target = packageById.get(edge.targetPackageId);
    const owner = owningPackage(packages, edge.importerPath);
    if (isNil(importer) || isNil(target) || isNil(owner) || owner.id !== edge.importerPackageId) {
      return invalid("Workspace evidence requires edge referential integrity.");
    }
  }
  const publicSymbols = source.publicSymbols.map(parsePublicSymbol);
  const publicSymbolKeys = publicSymbols.map((entry) =>
    `${entry.packageId}\0${entry.exportSubpath}\0${entry.symbolName}\0${entry.isTypeOnly ? "1" : "0"}`,
  );
  if (uniq(publicSymbolKeys).length !== publicSymbolKeys.length) {
    return invalid("Workspace evidence requires unique public symbol ownership.");
  }
  for (const symbol of publicSymbols) {
    const owner = packageById.get(symbol.packageId);
    const pathOwner = owningPackage(packages, symbol.sourcePath);
    if (
      isNil(owner) ||
      isNil(pathOwner) ||
      pathOwner.id !== symbol.packageId ||
      !owner.exportedSubpaths.some((entry) => entry.subpath === symbol.exportSubpath)
    ) {
      return invalid("Workspace evidence requires public symbol referential integrity.");
    }
  }
  return {
    kind: "workspace-boundary-evidence",
    schemaVersion: 1,
    graph: {
      kind: "workspace-dependency-graph",
      schemaVersion: 1,
      commitSha: graph.commitSha,
      packages: sortBy(packages, ["rootPath", "id"]),
      edges: sortBy(edges, ["importerPath", "specifier", "targetPackageId", "usage"]),
    },
    publicSymbols: sortBy(publicSymbols, ["packageId", "sourcePath", "exportSubpath", "symbolName", "isTypeOnly"]),
    violations: sortBy(source.violations.map(parseViolation), ["code", "importer", "specifier", "owner"]),
    reconciledDebtFingerprints: stringArray(source.reconciledDebtFingerprints, (value) => {
      if (typeof value !== "string" || !SHA256.test(value)) return invalid();
      return value;
    }),
  };
}

export function workspaceBoundaryDebtFingerprintV1(
  input: WorkspaceBoundaryDebtIdentityV1,
): string {
  const importer = repositoryPath(input.importer, false);
  const specifier = moduleSpecifier(input.specifier);
  const owner = packageId(input.owner);
  return sha256CanonicalJson({ importer, specifier, owner });
}
