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

import { compileTerrainHeightIntentV0 } from "./compile-height-intent";
import type { TerrainIntentDiagnosticV0 } from "./terrain-constraint-types";

interface TerrainIntentCliOptionsV0 {
  readonly imagePath: string;
  readonly authoringPath: string;
  readonly outputAuthoringPath: string;
  readonly reportPath: string;
  readonly force: boolean;
}

interface PublicationEntryV0 {
  readonly targetPath: string;
  readonly temporaryPath: string;
  readonly backupPath: string;
  readonly contents: string;
  readonly existed: boolean;
  backupCreated: boolean;
  published: boolean;
}

class TerrainIntentCliErrorV0 extends Error {
  readonly diagnostics?: readonly TerrainIntentDiagnosticV0[];

  constructor(message: string, diagnostics?: readonly TerrainIntentDiagnosticV0[]) {
    super(message);
    this.name = "TerrainIntentCliErrorV0";
    if (diagnostics !== undefined) this.diagnostics = diagnostics;
  }
}

function requireAbsolutePath(value: string, flag: string): string {
  if (!path.isAbsolute(value)) {
    throw new TerrainIntentCliErrorV0(`${flag} must be an absolute path.`);
  }
  return path.resolve(value);
}

function parseArguments(arguments_: readonly string[]): TerrainIntentCliOptionsV0 {
  const normalizedArguments = arguments_[0] === "--" ? arguments_.slice(1) : arguments_;
  const values = new Map<string, string>();
  let force = false;
  for (let index = 0; index < normalizedArguments.length; index += 1) {
    const argument = normalizedArguments[index]!;
    if (argument === "--force") {
      if (force) throw new TerrainIntentCliErrorV0("--force may appear only once.");
      force = true;
      continue;
    }
    if (!["--image", "--authoring", "--output-authoring", "--report"].includes(argument)) {
      throw new TerrainIntentCliErrorV0(`Unknown argument '${argument}'.`);
    }
    if (values.has(argument)) {
      throw new TerrainIntentCliErrorV0(`${argument} may appear only once.`);
    }
    const value = normalizedArguments[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new TerrainIntentCliErrorV0(`${argument} requires a path.`);
    }
    values.set(argument, value);
    index += 1;
  }
  for (const flag of ["--image", "--authoring", "--output-authoring", "--report"]) {
    if (!values.has(flag)) throw new TerrainIntentCliErrorV0(`${flag} is required.`);
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
    throw new TerrainIntentCliErrorV0("Input and output paths must identify four distinct files.");
  }
  return options;
}

async function requireRegularUnlinkedInput(filePath: string, flag: string): Promise<void> {
  const info = await lstat(filePath);
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new TerrainIntentCliErrorV0(`${flag} must identify a regular non-symbolic-link file.`);
  }
}

async function outputExistsAsRegularFile(filePath: string): Promise<boolean> {
  try {
    const info = await lstat(filePath);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new TerrainIntentCliErrorV0(
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

async function cleanupTransaction(entries: readonly PublicationEntryV0[]): Promise<void> {
  for (const entry of entries) {
    await rm(entry.temporaryPath, { force: true });
    await rm(entry.backupPath, { force: true });
  }
}

async function rollbackTransaction(entries: readonly PublicationEntryV0[]): Promise<void> {
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
    throw new TerrainIntentCliErrorV0(
      "Output already exists; pass --force to replace both transactionally.",
    );
  }

  const transactionId = randomUUID();
  const entries: PublicationEntryV0[] = [
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

export async function runTerrainHeightIntentCliV0(
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
    throw new TerrainIntentCliErrorV0(
      "Output already exists; pass --force to replace both transactionally.",
    );
  }

  const [sourcePngBytes, authoringSourceText] = await Promise.all([
    readFile(options.imagePath),
    readFile(options.authoringPath, "utf8"),
  ]);
  const parsed = parseAuthoringSpecV4(authoringSourceText);
  if (!parsed.ok || parsed.value === undefined) {
    throw new TerrainIntentCliErrorV0(
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
  const result = await compileTerrainHeightIntentV0({
    sourcePngBytes,
    authoringSpec: parsed.value,
  });
  if (result.report.status !== "passed" || result.compiledAuthoringSpec === undefined) {
    throw new TerrainIntentCliErrorV0(
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
  if (error instanceof TerrainIntentCliErrorV0) {
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
  runTerrainHeightIntentCliV0(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${JSON.stringify(publicError(error))}\n`);
    process.exitCode = 1;
  });
}
