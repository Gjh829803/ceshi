import {
  lstat,
  readFile,
  readdir,
  realpath,
} from "node:fs/promises";
import path from "node:path";

import {
  canonicalJsonBytes,
  sha256Bytes,
  sha256CanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import {
  canonicalBabylonNativeDependencyLockBytesV1,
  hashBabylonNativeDependencyLockV1,
  parseBabylonNativeDependencyLockV1,
  type BabylonNativeDependencyLockEntryV1,
  type BabylonNativeDependencyLockV1,
} from "@whitebox-world/runtime-contracts";
import { isEqual, isNil } from "lodash-es";
import { parse as parseYaml } from "yaml";

const ALWAYS_RUNTIME_EXTERNALS = Object.freeze([
  "@babylonjs/core",
  "@whitebox-world/native-babylon",
] as const);
const OPTIONAL_RUNTIME_EXTERNALS = new Set([
  "@whitebox-world/native-babylon-block-profile",
]);
const BUNDLE_TOOLCHAIN = Object.freeze(["rollup", "typescript", "vite"] as const);
const IGNORED_DIRECTORIES = new Set([
  ".cache",
  ".codex-tmp",
  ".git",
  ".hg",
  ".svn",
  "node_modules",
]);
const REGISTRY_INTEGRITY_PATTERN = /^sha512-[A-Za-z0-9+/]+={0,2}$/;

export class BabylonNativeDependencyLockResolutionErrorV1 extends Error {
  readonly code:
    | "WORLDKIT_NATIVE_DEPENDENCY_LOCK_RESOLUTION_FAILED"
    | "WORLDKIT_NATIVE_DEPENDENCY_LOCK_MISMATCH";

  constructor(code: BabylonNativeDependencyLockResolutionErrorV1["code"]) {
    super(code);
    this.code = code;
  }
}

export interface ResolveBabylonNativeDependencyLockInputV1 {
  readonly repositoryRoot: string;
  readonly externalImportSpecifiers: readonly string[];
}

export interface ResolvedBabylonNativeDependencyLockV1 {
  readonly dependencyLock: BabylonNativeDependencyLockV1;
  readonly dependencyLockBytes: Uint8Array;
  readonly dependencyLockHash: Sha256HashV1;
}

interface LockfilePackageEntryV1 {
  readonly resolution?: Readonly<{ integrity?: unknown }>;
}

interface LockfileImporterDependencyV1 {
  readonly version?: unknown;
}

interface ParsedLockfileV1 {
  readonly importers?: Readonly<Record<string, Readonly<{
    dependencies?: Readonly<Record<string, LockfileImporterDependencyV1>>;
    devDependencies?: Readonly<Record<string, LockfileImporterDependencyV1>>;
  }>>>;
  readonly packages?: Readonly<Record<string, LockfilePackageEntryV1>>;
}

interface InstalledPackageV1 {
  readonly packageName: string;
  readonly packageRoot: string;
  readonly packageManifest: Readonly<Record<string, unknown>>;
  readonly resolvedVersion: string;
  readonly isWorkspace: boolean;
}

function fail(
  code: BabylonNativeDependencyLockResolutionErrorV1["code"] =
    "WORLDKIT_NATIVE_DEPENDENCY_LOCK_RESOLUTION_FAILED",
): never {
  throw new BabylonNativeDependencyLockResolutionErrorV1(code);
}

function canonicalRelativePath(root: string, absolutePath: string): string {
  const relativePath = path.relative(root, absolutePath);
  if (
    relativePath === "" ||
    path.isAbsolute(relativePath) ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`)
  ) return fail();
  return relativePath.split(path.sep).join("/");
}

function packageNameFromImportSpecifier(specifier: string): string {
  const segments = specifier.split("/");
  if (specifier.startsWith("@")) {
    if (segments.length < 2) return fail();
    return `${segments[0]}/${segments[1]}`;
  }
  if (segments[0] === undefined || segments[0].length === 0) return fail();
  return segments[0];
}

function requiredRuntimePackages(
  externalImportSpecifiers: readonly string[],
): readonly string[] {
  const sorted = [...externalImportSpecifiers]
    .sort((left, right) => left.localeCompare(right, "en-US"));
  if (
    !isEqual(sorted, externalImportSpecifiers) ||
    new Set(sorted).size !== sorted.length
  ) return fail();
  const packageNames = new Set<string>(ALWAYS_RUNTIME_EXTERNALS);
  for (const specifier of externalImportSpecifiers) {
    const packageName = packageNameFromImportSpecifier(specifier);
    if (
      packageName !== "@babylonjs/core" &&
      packageName !== "@whitebox-world/native-babylon" &&
      !OPTIONAL_RUNTIME_EXTERNALS.has(packageName)
    ) return fail();
    packageNames.add(packageName);
  }
  if (packageNames.has("@babylonjs/havok")) return fail();
  return Object.freeze([...packageNames].sort((left, right) =>
    left.localeCompare(right, "en-US")));
}

function exactRecord(input: unknown): Readonly<Record<string, unknown>> {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  ) return fail();
  return input as Readonly<Record<string, unknown>>;
}

async function readPackageManifest(
  packageRoot: string,
  expectedPackageName: string,
): Promise<InstalledPackageV1> {
  let bytes: Uint8Array;
  let parsed: Readonly<Record<string, unknown>>;
  try {
    bytes = new Uint8Array(await readFile(path.join(packageRoot, "package.json")));
    parsed = exactRecord(JSON.parse(new TextDecoder().decode(bytes)));
  } catch (error) {
    if (error instanceof BabylonNativeDependencyLockResolutionErrorV1) throw error;
    return fail();
  }
  if (
    parsed.name !== expectedPackageName ||
    typeof parsed.version !== "string" ||
    parsed.version.length === 0
  ) return fail();
  return Object.freeze({
    packageName: expectedPackageName,
    packageRoot,
    packageManifest: parsed,
    resolvedVersion: parsed.version,
    isWorkspace: false,
  });
}

async function findInstalledPackageRoot(
  repositoryRoot: string,
  packageName: string,
  expectedVersion: string | undefined,
): Promise<string> {
  const directPath = path.join(repositoryRoot, "node_modules", ...packageName.split("/"));
  try {
    const resolved = await realpath(directPath);
    canonicalRelativePath(repositoryRoot, resolved);
    return resolved;
  } catch (error) {
    if (error instanceof BabylonNativeDependencyLockResolutionErrorV1) throw error;
  }

  let virtualStoreEntries: readonly string[];
  try {
    virtualStoreEntries = (await readdir(path.join(repositoryRoot, "node_modules/.pnpm")))
      .sort((left, right) => left.localeCompare(right, "en-US"));
  } catch {
    return fail();
  }
  for (const virtualStoreEntry of virtualStoreEntries) {
    const candidate = path.join(
      repositoryRoot,
      "node_modules/.pnpm",
      virtualStoreEntry,
      "node_modules",
      ...packageName.split("/"),
    );
    try {
      const resolved = await realpath(candidate);
      canonicalRelativePath(repositoryRoot, resolved);
      const manifest = await readPackageManifest(resolved, packageName);
      if (isNil(expectedVersion) || manifest.resolvedVersion === expectedVersion) {
        return resolved;
      }
    } catch (error) {
      if (error instanceof BabylonNativeDependencyLockResolutionErrorV1) continue;
    }
  }
  return fail();
}

function importerDependency(
  lockfile: ParsedLockfileV1,
  packageName: string,
): LockfileImporterDependencyV1 | undefined {
  const importer = lockfile.importers?.["."];
  return importer?.dependencies?.[packageName] ??
    importer?.devDependencies?.[packageName];
}

function baseLockedVersion(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.startsWith("link:")) {
    return undefined;
  }
  return value.split("(")[0];
}

async function resolveInstalledPackage(
  repositoryRoot: string,
  lockfile: ParsedLockfileV1,
  packageName: string,
): Promise<InstalledPackageV1> {
  const importerEntry = importerDependency(lockfile, packageName);
  const importerVersion = importerEntry?.version;
  if (typeof importerVersion === "string" && importerVersion.startsWith("link:")) {
    const linkedPath = importerVersion.slice("link:".length);
    const unresolvedRoot = path.resolve(repositoryRoot, linkedPath);
    canonicalRelativePath(repositoryRoot, unresolvedRoot);
    let packageRoot: string;
    try {
      packageRoot = await realpath(unresolvedRoot);
      canonicalRelativePath(repositoryRoot, packageRoot);
    } catch {
      return fail();
    }
    const installed = await readPackageManifest(packageRoot, packageName);
    return Object.freeze({ ...installed, isWorkspace: true });
  }

  const expectedVersion = baseLockedVersion(importerVersion);
  const packageRoot = await findInstalledPackageRoot(
    repositoryRoot,
    packageName,
    expectedVersion,
  );
  const installed = await readPackageManifest(packageRoot, packageName);
  if (!isNil(expectedVersion) && installed.resolvedVersion !== expectedVersion) {
    return fail();
  }
  return installed;
}

function assertRegistryLockEntry(
  lockfile: ParsedLockfileV1,
  installed: InstalledPackageV1,
): void {
  if (installed.isWorkspace) return;
  const lockEntry = lockfile.packages?.[
    `${installed.packageName}@${installed.resolvedVersion}`
  ];
  const integrity = lockEntry?.resolution?.integrity;
  if (typeof integrity !== "string" || !REGISTRY_INTEGRITY_PATTERN.test(integrity)) {
    return fail();
  }
}

async function packageFileInventory(
  packageRoot: string,
  directoryPath: string = packageRoot,
): Promise<readonly Readonly<{
  path: string;
  sizeBytes: number;
  contentHash: Sha256HashV1;
}>[]> {
  const rows: Readonly<{
    path: string;
    sizeBytes: number;
    contentHash: Sha256HashV1;
  }>[] = [];
  let entries;
  try {
    entries = await readdir(directoryPath, { withFileTypes: true });
  } catch {
    return fail();
  }
  entries.sort((left, right) => left.name.localeCompare(right.name, "en-US"));
  for (const entry of entries) {
    if (IGNORED_DIRECTORIES.has(entry.name)) continue;
    const absolutePath = path.join(directoryPath, entry.name);
    const stats = await lstat(absolutePath);
    if (stats.isSymbolicLink()) return fail();
    if (entry.isDirectory()) {
      rows.push(...await packageFileInventory(packageRoot, absolutePath));
    } else if (entry.isFile()) {
      const bytes = new Uint8Array(await readFile(absolutePath));
      rows.push(Object.freeze({
        path: canonicalRelativePath(packageRoot, absolutePath),
        sizeBytes: bytes.byteLength,
        contentHash: sha256Bytes(bytes) as Sha256HashV1,
      }));
    } else {
      return fail();
    }
  }
  return Object.freeze(rows);
}

async function createLockEntry(
  repositoryRoot: string,
  lockfile: ParsedLockfileV1,
  packageName: string,
  usage: BabylonNativeDependencyLockEntryV1["usage"],
): Promise<BabylonNativeDependencyLockEntryV1> {
  const installed = await resolveInstalledPackage(repositoryRoot, lockfile, packageName);
  assertRegistryLockEntry(lockfile, installed);
  const inventory = await packageFileInventory(installed.packageRoot);
  if (inventory.length === 0) return fail();
  return Object.freeze({
    packageName,
    resolvedVersion: installed.resolvedVersion,
    packageManifestHash: sha256CanonicalJson(
      installed.packageManifest,
    ) as Sha256HashV1,
    packageIntegrityHash: sha256CanonicalJson(inventory) as Sha256HashV1,
    usage,
  });
}

export async function resolveBabylonNativeDependencyLockV1(
  input: ResolveBabylonNativeDependencyLockInputV1,
): Promise<ResolvedBabylonNativeDependencyLockV1> {
  let repositoryRoot: string;
  let lockfileBytes: Uint8Array;
  let lockfile: ParsedLockfileV1;
  try {
    repositoryRoot = await realpath(path.resolve(input.repositoryRoot));
    lockfileBytes = new Uint8Array(await readFile(
      path.join(repositoryRoot, "pnpm-lock.yaml"),
    ));
    lockfile = exactRecord(
      parseYaml(new TextDecoder().decode(lockfileBytes)),
    ) as ParsedLockfileV1;
  } catch (error) {
    if (error instanceof BabylonNativeDependencyLockResolutionErrorV1) throw error;
    return fail();
  }

  const runtimePackages = requiredRuntimePackages(input.externalImportSpecifiers);
  const entries = await Promise.all([
    ...runtimePackages.map((packageName) =>
      createLockEntry(repositoryRoot, lockfile, packageName, "runtime-external")),
    ...BUNDLE_TOOLCHAIN.map((packageName) =>
      createLockEntry(repositoryRoot, lockfile, packageName, "bundle-toolchain")),
  ]);
  const dependencyLock = parseBabylonNativeDependencyLockV1({
    kind: "babylon-native-dependency-lock",
    schemaVersion: 1,
    lockfileHash: sha256Bytes(lockfileBytes) as Sha256HashV1,
    entries,
  });
  return Object.freeze({
    dependencyLock,
    dependencyLockBytes: canonicalBabylonNativeDependencyLockBytesV1(
      dependencyLock,
    ),
    dependencyLockHash: hashBabylonNativeDependencyLockV1(dependencyLock),
  });
}

export async function assertBabylonNativeDependencyLockMatchesInstalledTreeV1(
  input: ResolveBabylonNativeDependencyLockInputV1,
  expectedLock: BabylonNativeDependencyLockV1,
): Promise<void> {
  const current = await resolveBabylonNativeDependencyLockV1(input);
  if (!isEqual(
    canonicalJsonBytes(current.dependencyLock),
    canonicalJsonBytes(parseBabylonNativeDependencyLockV1(expectedLock)),
  )) return fail("WORLDKIT_NATIVE_DEPENDENCY_LOCK_MISMATCH");
}
