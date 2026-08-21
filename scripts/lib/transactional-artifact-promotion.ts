import { randomUUID } from "node:crypto";
import {
  lstat,
  open,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";

export type ArtifactPromotionRole = "frame" | "report" | "manifest";

export interface ArtifactPromotionWrite {
  role: ArtifactPromotionRole;
  targetPath: string;
  contents: string | Uint8Array;
}

export interface ArtifactPromotionFaultPoint {
  phase: "before-temp-write" | "before-backup-rename" | "before-publish-rename";
  role: ArtifactPromotionRole;
  targetPath: string;
}

export interface ArtifactPromotionOptions {
  writes: readonly ArtifactPromotionWrite[];
  injectFailure?: (point: ArtifactPromotionFaultPoint) => void | Promise<void>;
}

interface TransactionEntry extends ArtifactPromotionWrite {
  tempPath: string;
  backupPath: string;
  existed: boolean;
  backupCreated: boolean;
  published: boolean;
}

async function existsAsRegularFile(targetPath: string): Promise<boolean> {
  try {
    const target = await lstat(targetPath);
    if (!target.isFile()) {
      throw new Error(`Artifact promotion target is not a regular file: ${targetPath}`);
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function removeExact(filePath: string): Promise<void> {
  await rm(filePath, { force: true });
}

async function cleanupEntries(entries: readonly TransactionEntry[]): Promise<void> {
  for (const entry of entries) {
    await removeExact(entry.tempPath);
    await removeExact(entry.backupPath);
  }
}

async function rollbackEntries(entries: readonly TransactionEntry[]): Promise<void> {
  const rollbackErrors: unknown[] = [];
  for (const entry of [...entries].reverse()) {
    try {
      if (entry.published) await removeExact(entry.targetPath);
      if (entry.backupCreated) await rename(entry.backupPath, entry.targetPath);
    } catch (error) {
      rollbackErrors.push(error);
    }
  }
  try {
    await cleanupEntries(entries);
  } catch (error) {
    rollbackErrors.push(error);
  }
  if (rollbackErrors.length > 0) {
    throw new AggregateError(rollbackErrors, "Artifact promotion rollback failed.");
  }
}

export async function promoteArtifactsTransactionally(
  options: ArtifactPromotionOptions,
): Promise<void> {
  const roles = options.writes.map((write) => write.role);
  if (
    options.writes.length !== 3 ||
    new Set(roles).size !== 3 ||
    !roles.includes("frame") ||
    !roles.includes("report") ||
    !roles.includes("manifest")
  ) {
    throw new Error("Artifact promotion requires exactly one frame, report, and manifest write.");
  }
  if (new Set(options.writes.map((write) => path.resolve(write.targetPath))).size !== 3) {
    throw new Error("Artifact promotion targets must be distinct files.");
  }

  const transactionId = randomUUID();
  const orderedWrites = ["frame", "report", "manifest"].map((role) =>
    options.writes.find((write) => write.role === role)!) as ArtifactPromotionWrite[];
  const entries: TransactionEntry[] = [];
  for (const write of orderedWrites) {
    const targetPath = path.resolve(write.targetPath);
    const siblingPrefix = `.${path.basename(targetPath)}.worldkit-${transactionId}`;
    entries.push({
      ...write,
      targetPath,
      tempPath: path.join(path.dirname(targetPath), `${siblingPrefix}.tmp`),
      backupPath: path.join(path.dirname(targetPath), `${siblingPrefix}.bak`),
      existed: await existsAsRegularFile(targetPath),
      backupCreated: false,
      published: false,
    });
  }

  let committed = false;
  try {
    for (const entry of entries) {
      await options.injectFailure?.({
        phase: "before-temp-write",
        role: entry.role,
        targetPath: entry.targetPath,
      });
      const handle = await open(entry.tempPath, "wx");
      try {
        await handle.writeFile(entry.contents);
        await handle.sync();
      } finally {
        await handle.close();
      }
    }
    for (const entry of entries) {
      if (!entry.existed) continue;
      await options.injectFailure?.({
        phase: "before-backup-rename",
        role: entry.role,
        targetPath: entry.targetPath,
      });
      await rename(entry.targetPath, entry.backupPath);
      entry.backupCreated = true;
    }
    for (const entry of entries) {
      await options.injectFailure?.({
        phase: "before-publish-rename",
        role: entry.role,
        targetPath: entry.targetPath,
      });
      await rename(entry.tempPath, entry.targetPath);
      entry.published = true;
      if (entry.role === "manifest") committed = true;
    }
  } catch (error) {
    if (!committed) {
      try {
        await rollbackEntries(entries);
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "Artifact promotion failed and could not be rolled back cleanly.",
        );
      }
    }
    throw error;
  }
  await cleanupEntries(entries);
}
