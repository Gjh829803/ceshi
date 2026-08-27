import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MODULAR_SUBJECT_SOURCE_PACKAGE_CATALOG } from "../lib/modular-subject-source-catalog";
import {
  recoverModularSubjectSourcePackage,
  validateRecoveredSubjectSourcePackage,
  type ModularSubjectPackageDefinitionV1,
  type RecoveredSubjectSourcePackageV1,
} from "../lib/modular-subject-source";
import {
  auditSubjectSourceMigration,
  serializeSubjectSourceMigrationInventory,
} from "../lib/subject-source-migration-audit";

const DEFAULT_REPOSITORY_ROOT = path.resolve(
  fileURLToPath(new URL("../../", import.meta.url)),
);
const MIGRATION_INVENTORY_FILE = "migration-inventory.json";

export interface RecoveredSubjectSourcePackageFileV1 {
  readonly relativePath: string;
  readonly bytes: Uint8Array;
}

export interface ModularSubjectSourcePackageFaultPointV1 {
  readonly phase:
    | "after-staged-file-write"
    | "before-backup-rename"
    | "before-publish-rename";
  readonly packageId: string;
  readonly relativePath?: string;
}

export interface WriteModularSubjectSourcePackagesOptionsV1 {
  readonly mode: "write" | "check";
  readonly repositoryRoot?: string;
  readonly outputRoot?: string;
  readonly packageDefinitions?: readonly ModularSubjectPackageDefinitionV1[];
  readonly injectFailure?: (
    point: ModularSubjectSourcePackageFaultPointV1,
  ) => void | Promise<void>;
}

interface ResolvedPackageOperationOptionsV1 {
  readonly repositoryRoot: string;
  readonly outputRoot: string;
  readonly packageDefinitions: readonly ModularSubjectPackageDefinitionV1[];
  readonly injectFailure:
    WriteModularSubjectSourcePackagesOptionsV1["injectFailure"] | undefined;
}

interface StagedPackageV1 {
  readonly ownedOutputRoot: string;
  readonly definition: ModularSubjectPackageDefinitionV1;
  readonly targetDirectory: string;
  readonly stagingDirectory: string;
  readonly backupDirectory: string;
  hadTarget: boolean;
  backupCreated: boolean;
  published: boolean;
}

interface RecursiveOutputEntryV1 {
  readonly relativePath: string;
  readonly kind: "directory" | "file" | "other";
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException).code;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength &&
    left.every((value, index) => value === right[index]);
}

function assertSafePathSegment(value: string, label: string): void {
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(value)) {
    throw new Error(`MODULAR_SUBJECT_SOURCE_OUTPUT_PATH_INVALID: ${label}`);
  }
}

function resolveOwnedRelativePath(root: string, relativePath: string): string {
  if (
    relativePath.length === 0 ||
    path.posix.isAbsolute(relativePath) ||
    path.posix.normalize(relativePath) !== relativePath ||
    relativePath.startsWith("../") ||
    relativePath.includes("\\")
  ) {
    throw new Error(`MODULAR_SUBJECT_SOURCE_OUTPUT_PATH_INVALID: ${relativePath}`);
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (resolved === resolvedRoot || !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`MODULAR_SUBJECT_SOURCE_OUTPUT_PATH_INVALID: ${relativePath}`);
  }
  return resolved;
}

function ownedRelativeLabel(ownedRoot: string, targetPath: string): string {
  const relativePath = path.relative(ownedRoot, targetPath).split(path.sep).join("/");
  return relativePath.length === 0 ? "." : relativePath;
}

async function lstatOrMissing(targetPath: string): Promise<Awaited<ReturnType<typeof lstat>> | null> {
  try {
    return await lstat(targetPath);
  } catch (error) {
    if (errorCode(error) === "ENOENT") return null;
    throw error;
  }
}

async function assertCanonicalOwnedDirectory(
  ownedRoot: string,
  directory: string,
  allowMissing = false,
): Promise<boolean> {
  const resolvedRoot = path.resolve(ownedRoot);
  const resolvedDirectory = path.resolve(directory);
  if (
    resolvedDirectory !== resolvedRoot &&
    !resolvedDirectory.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error(
      `MODULAR_SUBJECT_SOURCE_OUTPUT_OWNERSHIP_INVALID: ${resolvedDirectory}`,
    );
  }
  const label = ownedRelativeLabel(resolvedRoot, resolvedDirectory);
  const stat = await lstatOrMissing(resolvedDirectory);
  if (stat === null) {
    if (allowMissing) return false;
    throw new Error(`MODULAR_SUBJECT_SOURCE_OUTPUT_DIRECTORY_MISSING: ${label}`);
  }
  if (stat.isSymbolicLink()) {
    throw new Error(`MODULAR_SUBJECT_SOURCE_OUTPUT_SYMLINK_FORBIDDEN: ${label}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`MODULAR_SUBJECT_SOURCE_OUTPUT_TARGET_NOT_DIRECTORY: ${label}`);
  }
  if (await realpath(resolvedDirectory) !== resolvedDirectory) {
    throw new Error(`MODULAR_SUBJECT_SOURCE_OUTPUT_CANONICAL_PATH_MISMATCH: ${label}`);
  }
  return true;
}

async function establishOwnedOutputRoot(outputRoot: string): Promise<string> {
  const resolvedOutputRoot = path.resolve(outputRoot);
  const existing = await lstatOrMissing(resolvedOutputRoot);
  if (existing?.isSymbolicLink() === true) {
    throw new Error("MODULAR_SUBJECT_SOURCE_OUTPUT_SYMLINK_FORBIDDEN: .");
  }
  if (existing === null) await mkdir(resolvedOutputRoot, { recursive: true });
  const established = await lstatOrMissing(resolvedOutputRoot);
  if (established?.isSymbolicLink() === true) {
    throw new Error("MODULAR_SUBJECT_SOURCE_OUTPUT_SYMLINK_FORBIDDEN: .");
  }
  if (established === null || !established.isDirectory()) {
    throw new Error("MODULAR_SUBJECT_SOURCE_OUTPUT_TARGET_NOT_DIRECTORY: .");
  }
  const canonicalRoot = await realpath(resolvedOutputRoot);
  await assertCanonicalOwnedDirectory(canonicalRoot, canonicalRoot);
  return canonicalRoot;
}

async function resolveExistingOwnedOutputRoot(outputRoot: string): Promise<string | null> {
  const resolvedOutputRoot = path.resolve(outputRoot);
  const existing = await lstatOrMissing(resolvedOutputRoot);
  if (existing === null) return null;
  if (existing.isSymbolicLink()) {
    throw new Error("MODULAR_SUBJECT_SOURCE_OUTPUT_SYMLINK_FORBIDDEN: .");
  }
  if (!existing.isDirectory()) {
    throw new Error("MODULAR_SUBJECT_SOURCE_OUTPUT_TARGET_NOT_DIRECTORY: .");
  }
  const canonicalRoot = await realpath(resolvedOutputRoot);
  await assertCanonicalOwnedDirectory(canonicalRoot, canonicalRoot);
  return canonicalRoot;
}

async function ensureOwnedPackageParent(
  ownedRoot: string,
  definition: ModularSubjectPackageDefinitionV1,
): Promise<string> {
  await assertCanonicalOwnedDirectory(ownedRoot, ownedRoot);
  let current = ownedRoot;
  for (const segment of [definition.creatorId, definition.id]) {
    const candidate = path.join(current, segment);
    if (!await assertCanonicalOwnedDirectory(ownedRoot, candidate, true)) {
      await assertCanonicalOwnedDirectory(ownedRoot, current);
      try {
        await mkdir(candidate, { recursive: false });
      } catch (error) {
        if (errorCode(error) !== "EEXIST") throw error;
      }
    }
    await assertCanonicalOwnedDirectory(ownedRoot, candidate);
    current = candidate;
  }
  return current;
}

async function assertCanonicalPackageParent(entry: StagedPackageV1): Promise<void> {
  await assertCanonicalOwnedDirectory(entry.ownedOutputRoot, entry.ownedOutputRoot);
  await assertCanonicalOwnedDirectory(
    entry.ownedOutputRoot,
    path.join(entry.ownedOutputRoot, entry.definition.creatorId),
  );
  await assertCanonicalOwnedDirectory(
    entry.ownedOutputRoot,
    path.dirname(entry.targetDirectory),
  );
}

async function assertOwnedSiblingMissing(
  entry: StagedPackageV1,
  siblingPath: string,
): Promise<void> {
  await assertCanonicalPackageParent(entry);
  const existing = await lstatOrMissing(siblingPath);
  if (existing !== null) {
    throw new Error(
      `MODULAR_SUBJECT_SOURCE_OUTPUT_SIBLING_COLLISION: ${
        ownedRelativeLabel(entry.ownedOutputRoot, siblingPath)
      }`,
    );
  }
}

async function assertOwnedEntryDirectory(
  entry: StagedPackageV1,
  directory: string,
  allowMissing = false,
): Promise<boolean> {
  await assertCanonicalPackageParent(entry);
  return assertCanonicalOwnedDirectory(
    entry.ownedOutputRoot,
    directory,
    allowMissing,
  );
}

async function removeOwnedEntryDirectoryIfPresent(
  entry: StagedPackageV1,
  directory: string,
): Promise<void> {
  if (!await assertOwnedEntryDirectory(entry, directory, true)) return;
  await rm(directory, { recursive: true, force: true });
}

function sortedDefinitions(
  definitions: readonly ModularSubjectPackageDefinitionV1[],
): ModularSubjectPackageDefinitionV1[] {
  const sorted = [...definitions].sort((left, right) =>
    compareCodeUnits(left.id, right.id) ||
    compareCodeUnits(left.creatorId, right.creatorId) ||
    left.version - right.version,
  );
  const targetKeys = new Set<string>();
  for (const definition of sorted) {
    assertSafePathSegment(definition.creatorId, "creatorId");
    assertSafePathSegment(definition.id, "id");
    if (!Number.isInteger(definition.version) || definition.version < 1) {
      throw new Error("MODULAR_SUBJECT_SOURCE_OUTPUT_PATH_INVALID: version");
    }
    const targetKey = `${definition.creatorId}/${definition.id}/v${definition.version}`;
    if (targetKeys.has(targetKey)) {
      throw new Error(`MODULAR_SUBJECT_SOURCE_PACKAGE_DUPLICATE: ${targetKey}`);
    }
    targetKeys.add(targetKey);
  }
  return sorted;
}

export function collectRecoveredSubjectSourcePackageFiles(
  recovered: RecoveredSubjectSourcePackageV1,
): readonly RecoveredSubjectSourcePackageFileV1[] {
  const files: RecoveredSubjectSourcePackageFileV1[] = [
    {
      relativePath: recovered.packageManifestRelativePath,
      bytes: recovered.packageManifestBytes,
    },
    {
      relativePath: recovered.model.glbRelativePath,
      bytes: recovered.model.glbBytes,
    },
    {
      relativePath: recovered.model.manifestRelativePath,
      bytes: recovered.model.manifestBytes,
    },
    {
      relativePath: recovered.materialSet.manifestRelativePath,
      bytes: recovered.materialSet.manifestBytes,
    },
    ...recovered.materialSet.textureArtifacts.map((artifact) => ({
      relativePath: artifact.relativePath,
      bytes: artifact.bytes,
    })),
    ...recovered.animationClips.flatMap((clip) => [
      { relativePath: clip.glbRelativePath, bytes: clip.glbBytes },
      { relativePath: clip.manifestRelativePath, bytes: clip.manifestBytes },
    ]),
    {
      relativePath: recovered.sourceArchive.glbRelativePath,
      bytes: recovered.sourceArchive.glbBytes,
    },
    {
      relativePath: recovered.sourceArchive.manifestRelativePath,
      bytes: recovered.sourceArchive.manifestBytes,
    },
  ].sort((left, right) => compareCodeUnits(left.relativePath, right.relativePath));
  const relativePaths = new Set<string>();
  for (const file of files) {
    resolveOwnedRelativePath("/owned-package", file.relativePath);
    if (relativePaths.has(file.relativePath)) {
      throw new Error(`MODULAR_SUBJECT_SOURCE_OUTPUT_PATH_DUPLICATE: ${file.relativePath}`);
    }
    relativePaths.add(file.relativePath);
  }
  return files;
}

async function recursiveInventory(directory: string): Promise<string[]> {
  const result: string[] = [];
  const visit = async (current: string, prefix: string): Promise<void> => {
    const entries = (await readdir(current, { withFileTypes: true }))
      .sort((left, right) => compareCodeUnits(left.name, right.name));
    for (const entry of entries) {
      const relativePath = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        await visit(path.join(current, entry.name), relativePath);
      } else if (entry.isFile()) {
        result.push(relativePath);
      } else {
        throw new Error(`MODULAR_SUBJECT_SOURCE_OUTPUT_ENTRY_UNSUPPORTED: ${relativePath}`);
      }
    }
  };
  await visit(directory, "");
  return result.sort(compareCodeUnits);
}

async function recursiveOutputEntries(directory: string): Promise<RecursiveOutputEntryV1[]> {
  const result: RecursiveOutputEntryV1[] = [];
  const visit = async (current: string, prefix: string): Promise<void> => {
    const entries = (await readdir(current, { withFileTypes: true }))
      .sort((left, right) => compareCodeUnits(left.name, right.name));
    for (const entry of entries) {
      const relativePath = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
      const kind = entry.isDirectory()
        ? "directory"
        : entry.isFile()
          ? "file"
          : "other";
      result.push({ relativePath, kind });
      if (kind === "directory") {
        await visit(path.join(current, entry.name), relativePath);
      }
    }
  };
  await visit(directory, "");
  return result.sort((left, right) => compareCodeUnits(left.relativePath, right.relativePath));
}

async function readExactStagedFiles(
  stagingDirectory: string,
  expectedFiles: readonly RecoveredSubjectSourcePackageFileV1[],
): Promise<ReadonlyMap<string, Uint8Array>> {
  const expectedInventory = expectedFiles.map((file) => file.relativePath);
  const actualInventory = await recursiveInventory(stagingDirectory);
  if (JSON.stringify(actualInventory) !== JSON.stringify(expectedInventory)) {
    throw new Error("MODULAR_SUBJECT_SOURCE_STAGED_INVENTORY_MISMATCH");
  }
  const readBytes = new Map<string, Uint8Array>();
  for (const expected of expectedFiles) {
    const bytes = await readFile(
      resolveOwnedRelativePath(stagingDirectory, expected.relativePath),
    );
    if (!equalBytes(bytes, expected.bytes)) {
      throw new Error(
        `MODULAR_SUBJECT_SOURCE_STAGED_BYTES_MISMATCH: ${expected.relativePath}`,
      );
    }
    readBytes.set(expected.relativePath, bytes);
  }
  return readBytes;
}

function stagedPackageValue(
  recovered: RecoveredSubjectSourcePackageV1,
  bytesByRelativePath: ReadonlyMap<string, Uint8Array>,
): RecoveredSubjectSourcePackageV1 {
  const read = (relativePath: string): Uint8Array => {
    const bytes = bytesByRelativePath.get(relativePath);
    if (bytes === undefined) {
      throw new Error(`MODULAR_SUBJECT_SOURCE_STAGED_INVENTORY_MISMATCH: ${relativePath}`);
    }
    return bytes;
  };
  return {
    ...recovered,
    packageManifestBytes: read(recovered.packageManifestRelativePath),
    model: {
      ...recovered.model,
      glbBytes: read(recovered.model.glbRelativePath),
      manifestBytes: read(recovered.model.manifestRelativePath),
    },
    materialSet: {
      ...recovered.materialSet,
      manifestBytes: read(recovered.materialSet.manifestRelativePath),
      textureArtifacts: recovered.materialSet.textureArtifacts.map((artifact) => ({
        ...artifact,
        bytes: read(artifact.relativePath),
      })),
    },
    animationClips: recovered.animationClips.map((clip) => ({
      ...clip,
      glbBytes: read(clip.glbRelativePath),
      manifestBytes: read(clip.manifestRelativePath),
    })),
    sourceArchive: {
      ...recovered.sourceArchive,
      glbBytes: read(recovered.sourceArchive.glbRelativePath),
      manifestBytes: read(recovered.sourceArchive.manifestRelativePath),
    },
  };
}

async function stagePackage(
  repositoryRoot: string,
  ownedOutputRoot: string,
  definition: ModularSubjectPackageDefinitionV1,
  injectFailure: WriteModularSubjectSourcePackagesOptionsV1["injectFailure"],
): Promise<StagedPackageV1> {
  const sourcePath = resolveOwnedRelativePath(repositoryRoot, definition.sourceGlbRelativePath);
  const recovered = await recoverModularSubjectSourcePackage({
    definition,
    sourceGlbBytes: await readFile(sourcePath),
  });
  const files = collectRecoveredSubjectSourcePackageFiles(recovered);
  const parentDirectory = await ensureOwnedPackageParent(ownedOutputRoot, definition);
  const targetDirectory = path.join(parentDirectory, `v${definition.version}`);
  await assertCanonicalOwnedDirectory(ownedOutputRoot, targetDirectory, true);
  await assertCanonicalOwnedDirectory(ownedOutputRoot, parentDirectory);
  const stagingDirectory = await mkdtemp(
    path.join(parentDirectory, `.${path.basename(targetDirectory)}.staging-`),
  );
  const stagedEntry: StagedPackageV1 = {
    ownedOutputRoot,
    definition,
    targetDirectory,
    stagingDirectory,
    backupDirectory: `${targetDirectory}.backup-${randomUUID()}`,
    hadTarget: false,
    backupCreated: false,
    published: false,
  };
  try {
    await assertOwnedEntryDirectory(stagedEntry, stagingDirectory);
    for (const file of files) {
      const stagedPath = resolveOwnedRelativePath(stagingDirectory, file.relativePath);
      await mkdir(path.dirname(stagedPath), { recursive: true });
      await writeFile(stagedPath, file.bytes, { flag: "wx" });
      await injectFailure?.({
        phase: "after-staged-file-write",
        packageId: definition.id,
        relativePath: file.relativePath,
      });
    }
    const stagedBytes = await readExactStagedFiles(stagingDirectory, files);
    await validateRecoveredSubjectSourcePackage(stagedPackageValue(recovered, stagedBytes));
  } catch (error) {
    try {
      await removeOwnedEntryDirectoryIfPresent(stagedEntry, stagingDirectory);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "MODULAR_SUBJECT_SOURCE_STAGING_CLEANUP_FAILED",
      );
    }
    throw error;
  }
  return stagedEntry;
}

async function rollbackPackages(entries: readonly StagedPackageV1[]): Promise<void> {
  const rollbackErrors: unknown[] = [];
  for (const entry of [...entries].reverse()) {
    try {
      if (entry.published) {
        await removeOwnedEntryDirectoryIfPresent(entry, entry.targetDirectory);
      }
      if (entry.backupCreated) {
        await assertOwnedSiblingMissing(entry, entry.targetDirectory);
        await assertOwnedEntryDirectory(entry, entry.backupDirectory);
        await rename(entry.backupDirectory, entry.targetDirectory);
      }
    } catch (error) {
      rollbackErrors.push(error);
    }
  }
  for (const entry of entries) {
    try {
      await removeOwnedEntryDirectoryIfPresent(entry, entry.stagingDirectory);
    } catch (error) {
      rollbackErrors.push(error);
    }
  }
  if (rollbackErrors.length > 0) {
    throw new AggregateError(
      rollbackErrors,
      "MODULAR_SUBJECT_SOURCE_OUTPUT_ROLLBACK_FAILED",
    );
  }
}

async function writePackages(
  options: ResolvedPackageOperationOptionsV1,
): Promise<void> {
  const definitions = sortedDefinitions(options.packageDefinitions);
  const ownedOutputRoot = await establishOwnedOutputRoot(options.outputRoot);
  const staged: StagedPackageV1[] = [];
  try {
    for (const definition of definitions) {
      staged.push(await stagePackage(
        options.repositoryRoot,
        ownedOutputRoot,
        definition,
        options.injectFailure,
      ));
    }
  } catch (error) {
    try {
      await Promise.all(staged.map((entry) =>
        removeOwnedEntryDirectoryIfPresent(entry, entry.stagingDirectory)
      ));
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "MODULAR_SUBJECT_SOURCE_STAGING_CLEANUP_FAILED",
      );
    }
    throw error;
  }

  try {
    for (const entry of staged) {
      await options.injectFailure?.({
        phase: "before-backup-rename",
        packageId: entry.definition.id,
      });
      entry.hadTarget = await assertOwnedEntryDirectory(
        entry,
        entry.targetDirectory,
        true,
      );
      await assertOwnedSiblingMissing(entry, entry.backupDirectory);
      if (!entry.hadTarget) continue;
      await rename(entry.targetDirectory, entry.backupDirectory);
      entry.backupCreated = true;
    }
    for (const entry of staged) {
      await options.injectFailure?.({
        phase: "before-publish-rename",
        packageId: entry.definition.id,
      });
      await assertOwnedSiblingMissing(entry, entry.targetDirectory);
      if (entry.backupCreated) {
        await assertOwnedEntryDirectory(entry, entry.backupDirectory);
      }
      await assertOwnedEntryDirectory(entry, entry.stagingDirectory);
      await rename(entry.stagingDirectory, entry.targetDirectory);
      entry.published = true;
    }
  } catch (error) {
    try {
      await rollbackPackages(staged);
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "MODULAR_SUBJECT_SOURCE_OUTPUT_PROMOTION_FAILED",
      );
    }
    throw error;
  }

  await Promise.all(staged.map(async (entry) => {
    if (!entry.backupCreated) return;
    try {
      await removeOwnedEntryDirectoryIfPresent(entry, entry.backupDirectory);
    } catch {
      // Publication is committed. A stale backup is never authoritative and must
      // not replace the complete new target during post-commit garbage collection.
    }
  }));
}

async function migrationInventoryBytes(repositoryRoot: string): Promise<Uint8Array> {
  return serializeSubjectSourceMigrationInventory(
    await auditSubjectSourceMigration({ repositoryRoot }),
  );
}

async function writeMigrationInventory(
  repositoryRoot: string,
  outputRoot: string,
): Promise<void> {
  const ownedOutputRoot = await establishOwnedOutputRoot(outputRoot);
  await assertCanonicalOwnedDirectory(ownedOutputRoot, ownedOutputRoot);
  const targetPath = resolveOwnedRelativePath(ownedOutputRoot, MIGRATION_INVENTORY_FILE);
  const stagingPath = resolveOwnedRelativePath(
    ownedOutputRoot,
    `.${MIGRATION_INVENTORY_FILE}.staging-${randomUUID()}`,
  );
  const backupPath = resolveOwnedRelativePath(
    ownedOutputRoot,
    `.${MIGRATION_INVENTORY_FILE}.backup-${randomUUID()}`,
  );
  const bytes = await migrationInventoryBytes(repositoryRoot);
  await writeFile(stagingPath, bytes, { flag: "wx" });
  const stagedBytes = await readFile(stagingPath);
  if (!equalBytes(stagedBytes, bytes)) {
    await rm(stagingPath, { force: true });
    throw new Error("MODULAR_SUBJECT_SOURCE_STAGED_BYTES_MISMATCH: migration-inventory.json");
  }
  const existing = await lstatOrMissing(targetPath);
  if (existing?.isSymbolicLink() === true || (existing !== null && !existing.isFile())) {
    await rm(stagingPath, { force: true });
    throw new Error("MODULAR_SUBJECT_SOURCE_OUTPUT_ENTRY_UNSUPPORTED: migration-inventory.json");
  }
  let backupCreated = false;
  try {
    await assertCanonicalOwnedDirectory(ownedOutputRoot, ownedOutputRoot);
    if (existing !== null) {
      await rename(targetPath, backupPath);
      backupCreated = true;
    }
    await assertCanonicalOwnedDirectory(ownedOutputRoot, ownedOutputRoot);
    await rename(stagingPath, targetPath);
  } catch (error) {
    await rm(stagingPath, { force: true });
    if (backupCreated) {
      await rm(targetPath, { force: true });
      await rename(backupPath, targetPath);
    }
    throw error;
  }
  if (backupCreated) await rm(backupPath, { force: true });
}

async function compareManagedOutputRoots(
  expectedRoot: string,
  actualRoot: string | null,
): Promise<string[]> {
  const mismatches: string[] = [];
  const expectedEntries = await recursiveOutputEntries(expectedRoot);
  const actualEntries = actualRoot === null ? [] : await recursiveOutputEntries(actualRoot);
  const expectedByPath = new Map(expectedEntries.map((entry) => [entry.relativePath, entry]));
  const actualByPath = new Map(actualEntries.map((entry) => [entry.relativePath, entry]));
  for (const expected of expectedEntries) {
    const actual = actualByPath.get(expected.relativePath);
    if (actual === undefined) {
      mismatches.push(
        `${expected.relativePath} (missing${
          expected.kind === "directory" ? " directory" : ""
        })`,
      );
      continue;
    }
    if (actual.kind !== expected.kind) {
      mismatches.push(
        `${expected.relativePath} (expected ${expected.kind}, received ${actual.kind})`,
      );
      continue;
    }
    if (expected.kind === "file" && actualRoot !== null) {
      const [expectedBytes, actualBytes] = await Promise.all([
        readFile(resolveOwnedRelativePath(expectedRoot, expected.relativePath)),
        readFile(resolveOwnedRelativePath(actualRoot, actual.relativePath)),
      ]);
      if (!equalBytes(expectedBytes, actualBytes)) {
        mismatches.push(expected.relativePath);
      }
    }
  }
  for (const actual of actualEntries) {
    if (!expectedByPath.has(actual.relativePath)) {
      mismatches.push(
        `${actual.relativePath} (unexpected${
          actual.kind === "directory" ? " directory" :
            actual.kind === "other" ? " other entry" : ""
        })`,
      );
    }
  }
  return mismatches.sort(compareCodeUnits);
}

async function checkPackages(
  options: ResolvedPackageOperationOptionsV1,
): Promise<void> {
  const temporaryRoot = await mkdtemp(
    path.join(tmpdir(), "worldkit-modular-subject-package-check-"),
  );
  try {
    const expectedOutputRoot = path.join(temporaryRoot, "packages");
    await writePackages({
      ...options,
      outputRoot: expectedOutputRoot,
      injectFailure: undefined,
    });
    await writeMigrationInventory(options.repositoryRoot, expectedOutputRoot);
    const expectedRoot = await resolveExistingOwnedOutputRoot(expectedOutputRoot);
    if (expectedRoot === null) {
      throw new Error("MODULAR_SUBJECT_SOURCE_CHECK_GENERATION_MISSING");
    }
    const actualRoot = await resolveExistingOwnedOutputRoot(options.outputRoot);
    const mismatches = await compareManagedOutputRoots(expectedRoot, actualRoot);
    if (mismatches.length > 0) {
      throw new Error(
        `MODULAR_SUBJECT_SOURCE_OUTPUT_MISMATCH: ${mismatches.join(", ")}`,
      );
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function writeModularSubjectSourcePackages(
  options: WriteModularSubjectSourcePackagesOptionsV1,
): Promise<void> {
  const repositoryRoot = path.resolve(options.repositoryRoot ?? DEFAULT_REPOSITORY_ROOT);
  const outputRoot = path.resolve(
    options.outputRoot ?? path.join(repositoryRoot, "assets/subjects/packages"),
  );
  const packageDefinitions = options.packageDefinitions ??
    MODULAR_SUBJECT_SOURCE_PACKAGE_CATALOG;
  if (options.mode === "write") {
    await writePackages({
      repositoryRoot,
      outputRoot,
      packageDefinitions,
      injectFailure: options.injectFailure,
    });
    await writeMigrationInventory(repositoryRoot, outputRoot);
    return;
  }
  await checkPackages({
    repositoryRoot,
    outputRoot,
    packageDefinitions,
    injectFailure: options.injectFailure,
  });
}

export function parseModularSubjectSourcePackageArguments(
  arguments_: readonly string[],
): { readonly mode: "write" | "check" } {
  const unknown = arguments_.find((argument) =>
    argument !== "--write" && argument !== "--check"
  );
  if (unknown !== undefined) {
    throw new Error(`MODULAR_SUBJECT_SOURCE_ARGUMENT_UNKNOWN: ${unknown}`);
  }
  const writeCount = arguments_.filter((argument) => argument === "--write").length;
  const checkCount = arguments_.filter((argument) => argument === "--check").length;
  if (writeCount === 0 && checkCount === 0) {
    throw new Error("MODULAR_SUBJECT_SOURCE_MODE_REQUIRED");
  }
  if (writeCount + checkCount !== 1) {
    throw new Error("MODULAR_SUBJECT_SOURCE_MODE_CONFLICT");
  }
  return { mode: writeCount === 1 ? "write" : "check" };
}

async function main(): Promise<void> {
  const { mode } = parseModularSubjectSourcePackageArguments(process.argv.slice(2));
  await writeModularSubjectSourcePackages({ mode });
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && path.resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
