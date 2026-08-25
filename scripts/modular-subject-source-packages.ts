import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MODULAR_SUBJECT_SOURCE_PACKAGE_CATALOG } from "./lib/modular-subject-source-catalog";
import {
  recoverModularSubjectSourcePackage,
  validateRecoveredSubjectSourcePackage,
  type ModularSubjectPackageDefinitionV1,
  type RecoveredSubjectSourcePackageV1,
} from "./lib/modular-subject-source";

const DEFAULT_REPOSITORY_ROOT = path.resolve(
  fileURLToPath(new URL("../", import.meta.url)),
);

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
  readonly definition: ModularSubjectPackageDefinitionV1;
  readonly targetDirectory: string;
  readonly stagingDirectory: string;
  readonly backupDirectory: string;
  hadTarget: boolean;
  backupCreated: boolean;
  published: boolean;
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
  outputRoot: string,
  definition: ModularSubjectPackageDefinitionV1,
  injectFailure: WriteModularSubjectSourcePackagesOptionsV1["injectFailure"],
): Promise<StagedPackageV1> {
  const sourcePath = resolveOwnedRelativePath(repositoryRoot, definition.sourceGlbRelativePath);
  const recovered = await recoverModularSubjectSourcePackage({
    definition,
    sourceGlbBytes: await readFile(sourcePath),
  });
  const files = collectRecoveredSubjectSourcePackageFiles(recovered);
  const targetDirectory = path.join(
    outputRoot,
    definition.creatorId,
    definition.id,
    `v${definition.version}`,
  );
  const parentDirectory = path.dirname(targetDirectory);
  await mkdir(parentDirectory, { recursive: true });
  const stagingDirectory = await mkdtemp(
    path.join(parentDirectory, `.${path.basename(targetDirectory)}.staging-`),
  );
  try {
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
    await rm(stagingDirectory, { recursive: true, force: true });
    throw error;
  }
  return {
    definition,
    targetDirectory,
    stagingDirectory,
    backupDirectory: `${targetDirectory}.backup-${randomUUID()}`,
    hadTarget: false,
    backupCreated: false,
    published: false,
  };
}

async function rollbackPackages(entries: readonly StagedPackageV1[]): Promise<void> {
  const rollbackErrors: unknown[] = [];
  for (const entry of [...entries].reverse()) {
    try {
      if (entry.published) {
        await rm(entry.targetDirectory, { recursive: true, force: true });
      }
      if (entry.backupCreated) {
        await rename(entry.backupDirectory, entry.targetDirectory);
      }
    } catch (error) {
      rollbackErrors.push(error);
    }
  }
  for (const entry of entries) {
    try {
      await rm(entry.stagingDirectory, { recursive: true, force: true });
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
  const staged: StagedPackageV1[] = [];
  try {
    for (const definition of sortedDefinitions(options.packageDefinitions)) {
      staged.push(await stagePackage(
        options.repositoryRoot,
        options.outputRoot,
        definition,
        options.injectFailure,
      ));
    }
  } catch (error) {
    await Promise.all(staged.map((entry) =>
      rm(entry.stagingDirectory, { recursive: true, force: true })
    ));
    throw error;
  }

  try {
    for (const entry of staged) {
      try {
        const target = await lstat(entry.targetDirectory);
        if (!target.isDirectory()) {
          throw new Error(
            `MODULAR_SUBJECT_SOURCE_OUTPUT_TARGET_NOT_DIRECTORY: ${entry.definition.id}`,
          );
        }
        entry.hadTarget = true;
      } catch (error) {
        if (errorCode(error) !== "ENOENT") throw error;
      }
      if (!entry.hadTarget) continue;
      await options.injectFailure?.({
        phase: "before-backup-rename",
        packageId: entry.definition.id,
      });
      await rename(entry.targetDirectory, entry.backupDirectory);
      entry.backupCreated = true;
    }
    for (const entry of staged) {
      await options.injectFailure?.({
        phase: "before-publish-rename",
        packageId: entry.definition.id,
      });
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
      await rm(entry.backupDirectory, { recursive: true, force: true });
    } catch {
      // Publication is committed. A stale backup is never authoritative and must
      // not replace the complete new target during post-commit garbage collection.
    }
  }));
}

async function directoryExists(directory: string): Promise<boolean> {
  try {
    return (await lstat(directory)).isDirectory();
  } catch (error) {
    if (errorCode(error) === "ENOENT") return false;
    throw error;
  }
}

async function comparePackageDirectories(
  packageId: string,
  expectedDirectory: string,
  actualDirectory: string,
): Promise<string[]> {
  const mismatches: string[] = [];
  const expectedInventory = await recursiveInventory(expectedDirectory);
  if (!await directoryExists(actualDirectory)) {
    return expectedInventory.map((relativePath) => `${packageId} ${relativePath} (missing)`);
  }
  const actualInventory = await recursiveInventory(actualDirectory);
  const expectedPaths = new Set(expectedInventory);
  const actualPaths = new Set(actualInventory);
  for (const relativePath of expectedInventory) {
    if (!actualPaths.has(relativePath)) {
      mismatches.push(`${packageId} ${relativePath} (missing)`);
      continue;
    }
    const [expectedBytes, actualBytes] = await Promise.all([
      readFile(resolveOwnedRelativePath(expectedDirectory, relativePath)),
      readFile(resolveOwnedRelativePath(actualDirectory, relativePath)),
    ]);
    if (!equalBytes(expectedBytes, actualBytes)) {
      mismatches.push(`${packageId} ${relativePath}`);
    }
  }
  for (const relativePath of actualInventory) {
    if (!expectedPaths.has(relativePath)) {
      mismatches.push(`${packageId} ${relativePath} (unexpected)`);
    }
  }
  return mismatches;
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
    const mismatches: string[] = [];
    for (const definition of sortedDefinitions(options.packageDefinitions)) {
      const relativeTarget = path.join(
        definition.creatorId,
        definition.id,
        `v${definition.version}`,
      );
      mismatches.push(...await comparePackageDirectories(
        definition.id,
        path.join(expectedOutputRoot, relativeTarget),
        path.join(options.outputRoot, relativeTarget),
      ));
    }
    if (mismatches.length > 0) {
      throw new Error(
        `MODULAR_SUBJECT_SOURCE_OUTPUT_MISMATCH: ${mismatches.sort(compareCodeUnits).join(", ")}`,
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
