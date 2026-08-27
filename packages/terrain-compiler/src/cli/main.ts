import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { parseAuthoringSpecV4 } from "@whitebox-world/authoring";
import { stringifyCanonicalJson } from "@whitebox-world/protocol";

import { compileTerrainHeightIntent } from "../compile-terrain-height-intent";
import type { TerrainIntentDiagnostic } from
  "../constraints/terrain-constraint-types";

interface TerrainIntentCliOptions {
  readonly imagePath: string;
  readonly authoringPath: string;
  readonly outputAuthoringPath: string;
  readonly reportPath: string;
  readonly force: boolean;
}

interface PublicationEntry {
  readonly targetPath: string;
  readonly temporaryPath: string;
  readonly backupPath: string;
  readonly contents: string;
  readonly existed: boolean;
  backupCreated: boolean;
  published: boolean;
}

class TerrainIntentCliError extends Error {
  readonly diagnostics?: readonly TerrainIntentDiagnostic[];

  constructor(message: string, diagnostics?: readonly TerrainIntentDiagnostic[]) {
    super(message);
    this.name = "TerrainIntentCliError";
    if (diagnostics !== undefined) this.diagnostics = diagnostics;
  }
}

function requireAbsolutePath(value: string, flag: string): string {
  if (!path.isAbsolute(value)) {
    throw new TerrainIntentCliError(`${flag} must be an absolute path.`);
  }
  return path.resolve(value);
}

function parseArguments(arguments_: readonly string[]): TerrainIntentCliOptions {
  const normalizedArguments = arguments_[0] === "--" ? arguments_.slice(1) : arguments_;
  const values = new Map<string, string>();
  let force = false;
  for (let index = 0; index < normalizedArguments.length; index += 1) {
    const argument = normalizedArguments[index]!;
    if (argument === "--force") {
      if (force) throw new TerrainIntentCliError("--force may appear only once.");
      force = true;
      continue;
    }
    if (!["--image", "--authoring", "--output-authoring", "--report"].includes(argument)) {
      throw new TerrainIntentCliError(`Unknown argument '${argument}'.`);
    }
    if (values.has(argument)) {
      throw new TerrainIntentCliError(`${argument} may appear only once.`);
    }
    const value = normalizedArguments[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new TerrainIntentCliError(`${argument} requires a path.`);
    }
    values.set(argument, value);
    index += 1;
  }
  for (const flag of ["--image", "--authoring", "--output-authoring", "--report"]) {
    if (!values.has(flag)) throw new TerrainIntentCliError(`${flag} is required.`);
  }
  const options = {
    imagePath: requireAbsolutePath(values.get("--image")!, "--image"),
    authoringPath: requireAbsolutePath(values.get("--authoring")!, "--authoring"),
    outputAuthoringPath: requireAbsolutePath(
      values.get("--output-authoring")!,
      "--output-authoring",
    ),
    reportPath: requireAbsolutePath(values.get("--report")!, "--report"),
    force,
  };
  const distinctPaths = new Set([
    options.imagePath,
    options.authoringPath,
    options.outputAuthoringPath,
    options.reportPath,
  ]);
  if (distinctPaths.size !== 4) {
    throw new TerrainIntentCliError("Input and output paths must identify four distinct files.");
  }
  return options;
}

async function requireRegularUnlinkedInput(filePath: string, flag: string): Promise<void> {
  const info = await lstat(filePath);
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new TerrainIntentCliError(`${flag} must identify a regular non-symbolic-link file.`);
  }
}

async function outputExistsAsRegularFile(filePath: string): Promise<boolean> {
  try {
    const info = await lstat(filePath);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new TerrainIntentCliError(
        `Output target '${filePath}' must be absent or a regular non-symbolic-link file.`,
      );
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function writeSyncedExclusive(filePath: string, contents: string): Promise<void> {
  const handle = await open(filePath, "wx", 0o600);
  try {
    await handle.writeFile(contents, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function cleanupTransaction(entries: readonly PublicationEntry[]): Promise<void> {
  for (const entry of entries) {
    await rm(entry.temporaryPath, { force: true });
    await rm(entry.backupPath, { force: true });
  }
}

async function rollbackTransaction(entries: readonly PublicationEntry[]): Promise<void> {
  const failures: unknown[] = [];
  for (const entry of [...entries].reverse()) {
    try {
      if (entry.published) await rm(entry.targetPath, { force: true });
      if (entry.backupCreated) await rename(entry.backupPath, entry.targetPath);
    } catch (error) {
      failures.push(error);
    }
  }
  try {
    await cleanupTransaction(entries);
  } catch (error) {
    failures.push(error);
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, "Terrain intent output rollback failed.");
  }
}

async function publishCompiledAuthoringAndReport(input: {
  readonly outputAuthoringPath: string;
  readonly compiledAuthoringContents: string;
  readonly reportPath: string;
  readonly reportContents: string;
  readonly force: boolean;
}): Promise<void> {
  await Promise.all([
    mkdir(path.dirname(input.outputAuthoringPath), { recursive: true }),
    mkdir(path.dirname(input.reportPath), { recursive: true }),
  ]);
  const existing = await Promise.all([
    outputExistsAsRegularFile(input.outputAuthoringPath),
    outputExistsAsRegularFile(input.reportPath),
  ]);
  if (!input.force && existing.some(Boolean)) {
    throw new TerrainIntentCliError(
      "Output already exists; pass --force to replace both transactionally.",
    );
  }

  const transactionId = randomUUID();
  const entries: PublicationEntry[] = [
    {
      targetPath: input.outputAuthoringPath,
      temporaryPath: path.join(
        path.dirname(input.outputAuthoringPath),
        `.${path.basename(input.outputAuthoringPath)}.worldkit-${transactionId}.tmp`,
      ),
      backupPath: path.join(
        path.dirname(input.outputAuthoringPath),
        `.${path.basename(input.outputAuthoringPath)}.worldkit-${transactionId}.bak`,
      ),
      contents: input.compiledAuthoringContents,
      existed: existing[0],
      backupCreated: false,
      published: false,
    },
    {
      targetPath: input.reportPath,
      temporaryPath: path.join(
        path.dirname(input.reportPath),
        `.${path.basename(input.reportPath)}.worldkit-${transactionId}.tmp`,
      ),
      backupPath: path.join(
        path.dirname(input.reportPath),
        `.${path.basename(input.reportPath)}.worldkit-${transactionId}.bak`,
      ),
      contents: input.reportContents,
      existed: existing[1],
      backupCreated: false,
      published: false,
    },
  ];
  let committed = false;
  try {
    for (const entry of entries) {
      await writeSyncedExclusive(entry.temporaryPath, entry.contents);
    }
    for (const entry of entries) {
      if (!entry.existed) continue;
      await rename(entry.targetPath, entry.backupPath);
      entry.backupCreated = true;
    }
    for (const entry of entries) {
      await rename(entry.temporaryPath, entry.targetPath);
      entry.published = true;
    }
    committed = true;
  } catch (error) {
    if (!committed) {
      try {
        await rollbackTransaction(entries);
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "Terrain intent publication failed and rollback was incomplete.",
        );
      }
    }
    throw error;
  }
  await cleanupTransaction(entries);
}

export async function runTerrainHeightIntentCli(
  arguments_: readonly string[],
): Promise<void> {
  const options = parseArguments(arguments_);
  await Promise.all([
    requireRegularUnlinkedInput(options.imagePath, "--image"),
    requireRegularUnlinkedInput(options.authoringPath, "--authoring"),
  ]);
  const existingOutputs = await Promise.all([
    outputExistsAsRegularFile(options.outputAuthoringPath),
    outputExistsAsRegularFile(options.reportPath),
  ]);
  if (!options.force && existingOutputs.some(Boolean)) {
    throw new TerrainIntentCliError(
      "Output already exists; pass --force to replace both transactionally.",
    );
  }

  const [sourcePngBytes, authoringSourceText] = await Promise.all([
    readFile(options.imagePath),
    readFile(options.authoringPath, "utf8"),
  ]);
  const parsed = parseAuthoringSpecV4(authoringSourceText);
  if (!parsed.ok || parsed.value === undefined) {
    throw new TerrainIntentCliError(
      "AuthoringSpec V4 input is invalid.",
      parsed.diagnostics.map((diagnostic) => ({
        severity: "blocking" as const,
        code: diagnostic.code,
        instancePath: diagnostic.instancePath,
        message: diagnostic.message,
        ...(diagnostic.details === undefined ? {} : { details: diagnostic.details }),
      })),
    );
  }
  const result = await compileTerrainHeightIntent({
    sourcePngBytes,
    authoringSpec: parsed.value,
  });
  if (result.report.status !== "passed" || result.compiledAuthoringSpec === undefined) {
    throw new TerrainIntentCliError(
      "Terrain height intent compilation produced blocking diagnostics.",
      result.report.diagnostics,
    );
  }
  await publishCompiledAuthoringAndReport({
    outputAuthoringPath: options.outputAuthoringPath,
    compiledAuthoringContents: `${stringifyCanonicalJson(result.compiledAuthoringSpec)}\n`,
    reportPath: options.reportPath,
    reportContents: `${stringifyCanonicalJson(result.report)}\n`,
    force: options.force,
  });
  process.stdout.write(`${stringifyCanonicalJson(result.report)}\n`);
}

function publicError(error: unknown): Readonly<Record<string, unknown>> {
  if (error instanceof TerrainIntentCliError) {
    return {
      status: "failed",
      message: error.message,
      ...(error.diagnostics === undefined ? {} : { diagnostics: error.diagnostics }),
    };
  }
  return {
    status: "failed",
    message: error instanceof Error ? error.message : String(error),
  };
}

const entryPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (entryPath === fileURLToPath(import.meta.url)) {
  runTerrainHeightIntentCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${JSON.stringify(publicError(error))}\n`);
    process.exitCode = 1;
  });
}
