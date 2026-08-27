import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { stringifyCanonicalJson } from "@whitebox-world/protocol";
import { isEmpty } from "lodash-es";

import {
  cliFailure,
  loadWorldkitRoutePipeline,
  type WorldkitDiagnostic,
} from "../lib/worldkit-pipeline";

export interface InternalWorldBuildArtifactResultV1 {
  readonly ok: boolean;
  readonly exitCode: number;
  readonly diagnostics: readonly WorldkitDiagnostic[];
  readonly normalizedWorldIrHash?: string;
  readonly executionPlanHash?: string;
  readonly outputPath?: string;
}

async function writeAtomic(
  outputPath: string,
  bytes: string | Uint8Array,
): Promise<void> {
  const absoluteOutputPath = path.resolve(outputPath);
  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
  const temporaryPath = path.join(
    path.dirname(absoluteOutputPath),
    `.${path.basename(absoluteOutputPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporaryPath, bytes);
    await rename(temporaryPath, absoluteOutputPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function buildWorldArtifactFileV1(
  inputPath: string,
  outputPath: string,
): Promise<InternalWorldBuildArtifactResultV1> {
  const absoluteInputPath = path.resolve(inputPath);
  const absoluteOutputPath = path.resolve(outputPath);
  if (absoluteInputPath === absoluteOutputPath) {
    return cliFailure(
      "CLI_OUTPUT_OVERWRITES_INPUT",
      "Build output must not overwrite the AuthoringSpec input.",
    );
  }
  const pipeline = await loadWorldkitRoutePipeline(absoluteInputPath);
  if (!pipeline.ok) return pipeline;
  const artifact = {
    kind: "worldkit-build-artifact",
    schemaVersion: 4,
    normalizedWorldIrHash: pipeline.normalizedWorldIrHash,
    executionPlanHash: pipeline.executionPlanHash,
    normalizedWorldIr: pipeline.normalizedWorldIr,
    executionPlan: pipeline.executionPlan,
  } as const;
  try {
    await writeAtomic(
      absoluteOutputPath,
      `${stringifyCanonicalJson(artifact)}\n`,
    );
  } catch (error) {
    return cliFailure(
      "CLI_OUTPUT_WRITE_FAILED",
      `Unable to write build artifact '${absoluteOutputPath}'.`,
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }
  return {
    ok: true,
    exitCode: 0,
    diagnostics: [],
    normalizedWorldIrHash: pipeline.normalizedWorldIrHash,
    executionPlanHash: pipeline.executionPlanHash,
    outputPath: absoluteOutputPath,
  };
}

interface InternalBuildArgsV1 {
  readonly inputPath: string;
  readonly outputPath: string;
  readonly json: boolean;
}

function parseArgs(arguments_: readonly string[]): InternalBuildArgsV1 {
  const tokens = [...arguments_];
  const jsonIndex = tokens.indexOf("--json");
  const json = jsonIndex >= 0;
  if (json) tokens.splice(jsonIndex, 1);
  const inputPath = tokens.shift();
  const outputIndex = tokens.indexOf("--output");
  const outputPath = outputIndex >= 0 ? tokens[outputIndex + 1] : undefined;
  if (outputIndex >= 0) tokens.splice(outputIndex, 2);
  if (
    typeof inputPath !== "string" ||
    isEmpty(inputPath) ||
    typeof outputPath !== "string" ||
    isEmpty(outputPath) ||
    !isEmpty(tokens)
  ) {
    throw new Error(
      "Usage: build-world-artifact <world.json> --output <world.build.json> [--json]",
    );
  }
  return { inputPath, outputPath, json };
}

export async function main(
  arguments_: readonly string[] = process.argv.slice(2),
): Promise<number> {
  let parsed: InternalBuildArgsV1;
  try {
    parsed = parseArgs(arguments_);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
  const result = await buildWorldArtifactFileV1(
    parsed.inputPath,
    parsed.outputPath,
  );
  if (parsed.json) {
    process.stdout.write(`${stringifyCanonicalJson(result)}\n`);
  } else if (!result.ok) {
    for (const diagnostic of result.diagnostics) {
      process.stderr.write(`[${diagnostic.code}] ${diagnostic.message}\n`);
    }
  }
  return result.exitCode;
}

const entryPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (entryPath === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
