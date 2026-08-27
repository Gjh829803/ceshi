import { cp, mkdir, readdir, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

export interface ArtifactDirectoryPromotionFileSystem {
  rename: typeof rename;
  rm: typeof rm;
  cp: typeof cp;
}

export interface PromoteArtifactDirectoryOptions {
  temporaryDirectory: string;
  targetDirectory: string;
  expectedFilenames: readonly string[];
  fileSystem?: ArtifactDirectoryPromotionFileSystem;
}

export type ArtifactDirectoryPromotionResult =
  | { backupGarbageCollection: "complete" }
  | {
      backupGarbageCollection: "deferred";
      deferredBackupDirectory: string;
    };

export type ArtifactPublicationMode = "check" | "update";

export type FinalizeArtifactDirectoryResult =
  | { publicationMode: "check" }
  | ({ publicationMode: "update" } & ArtifactDirectoryPromotionResult);

const DEFAULT_FILE_SYSTEM: ArtifactDirectoryPromotionFileSystem = {
  rename,
  rm,
  cp,
};

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException).code;
}

async function moveDirectory(
  fileSystem: ArtifactDirectoryPromotionFileSystem,
  from: string,
  to: string,
): Promise<void> {
  try {
    await fileSystem.rename(from, to);
  } catch (error) {
    if (errorCode(error) !== "EXDEV") throw error;
    await fileSystem.cp(from, to, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    await fileSystem.rm(from, { recursive: true, force: true });
  }
}

async function assertExactFiles(
  directory: string,
  expectedFilenames: readonly string[],
): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  const actualFilenames = entries.map((entry) => entry.name).sort();
  const expected = [...expectedFilenames].sort();
  if (
    new Set(expected).size !== expected.length ||
    entries.some((entry) => !entry.isFile()) ||
    JSON.stringify(actualFilenames) !== JSON.stringify(expected)
  ) {
    throw new Error(
      `Artifact directory file inventory mismatch: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actualFilenames)}.`,
    );
  }
}

export function parseArtifactPublicationMode(
  arguments_: readonly string[],
): ArtifactPublicationMode {
  if (arguments_.length === 0) return "check";
  if (arguments_.length === 1 && arguments_[0] === "--update") return "update";
  throw new Error(
    "ARTIFACT_PUBLICATION_ARGUMENT_INVALID: expected no arguments or exactly '--update'.",
  );
}

export async function finalizeArtifactDirectory(
  options: PromoteArtifactDirectoryOptions & {
    readonly mode: ArtifactPublicationMode;
  },
): Promise<FinalizeArtifactDirectoryResult> {
  if (options.mode === "check") {
    await assertExactFiles(options.temporaryDirectory, options.expectedFilenames);
    return { publicationMode: "check" };
  }
  return {
    publicationMode: "update",
    ...(await promoteArtifactDirectory(options)),
  };
}

export async function promoteArtifactDirectory(
  options: PromoteArtifactDirectoryOptions,
): Promise<ArtifactDirectoryPromotionResult> {
  const temporaryDirectory = path.resolve(options.temporaryDirectory);
  const targetDirectory = path.resolve(options.targetDirectory);
  if (
    temporaryDirectory === targetDirectory ||
    path.dirname(temporaryDirectory) !== path.dirname(targetDirectory)
  ) {
    throw new Error(
      "Artifact temporary and target directories must be distinct siblings on one filesystem.",
    );
  }
  await assertExactFiles(temporaryDirectory, options.expectedFilenames);
  await mkdir(path.dirname(targetDirectory), { recursive: true });
  const fileSystem = options.fileSystem ?? DEFAULT_FILE_SYSTEM;
  const backupDirectory = `${targetDirectory}.backup-${randomUUID()}`;
  let hadTarget = true;
  try {
    await moveDirectory(fileSystem, targetDirectory, backupDirectory);
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw error;
    hadTarget = false;
  }

  try {
    await moveDirectory(fileSystem, temporaryDirectory, targetDirectory);
  } catch (publicationError) {
    if (!hadTarget) throw publicationError;
    try {
      await moveDirectory(fileSystem, backupDirectory, targetDirectory);
    } catch (rollbackError) {
      try {
        await fileSystem.cp(backupDirectory, targetDirectory, {
          recursive: true,
          errorOnExist: true,
          force: false,
        });
      } catch (recoveryError) {
        throw new AggregateError(
          [publicationError, rollbackError, recoveryError],
          "Artifact publication, direct rollback, and copy recovery failed; the backup directory remains authoritative.",
        );
      }
      throw new AggregateError(
        [publicationError, rollbackError],
        "Artifact publication and direct rollback failed; old target bytes were restored by copy recovery.",
      );
    }
    throw publicationError;
  }

  if (!hadTarget) return { backupGarbageCollection: "complete" };
  try {
    await fileSystem.rm(backupDirectory, { recursive: true });
    return { backupGarbageCollection: "complete" };
  } catch {
    // Publication is already committed. A partially removed backup is never authoritative
    // and must not replace the complete new target; leave any residue for later GC.
    return {
      backupGarbageCollection: "deferred",
      deferredBackupDirectory: backupDirectory,
    };
  }
}
