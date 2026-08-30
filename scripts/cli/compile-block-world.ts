import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { stringifyCanonicalJson } from "@whitebox-world/authoring";
import { compileBlockWorldV2 } from "@whitebox-world/block-world-compiler";

import {
  blockWorldCheckInputV2,
  loadBlockWorldModuleV2,
} from "../lib/block-world-module.js";

function requiredArgument(args: readonly string[], name: string): string {
  const index = args.indexOf(name);
  const value = index < 0 ? undefined : args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`BLOCK_WORLD_CLI_ARGUMENT_REQUIRED: ${name}`);
  }
  return value;
}

async function writeCanonicalAtomic(filePath: string, value: unknown): Promise<void> {
  const absolutePath = path.resolve(filePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${stringifyCanonicalJson(value)}\n`, "utf8");
  await rename(temporaryPath, absolutePath);
}

export async function compileBlockWorldModuleV2(options: {
  readonly worldPath: string;
  readonly authoringOutputPath: string;
  readonly mapOutputPath: string;
}) {
  const result = compileBlockWorldV2(blockWorldCheckInputV2(
    await loadBlockWorldModuleV2(options.worldPath),
  ));
  if (!result.ok) return result;
  await Promise.all([
    writeCanonicalAtomic(options.authoringOutputPath, result.authoringSpec),
    writeCanonicalAtomic(options.mapOutputPath, result.implementationMapDraft),
  ]);
  return result;
}

export async function runCompileBlockWorldCliV2(
  args: readonly string[],
): Promise<0 | 1 | 2> {
  try {
    const result = await compileBlockWorldModuleV2({
      worldPath: requiredArgument(args, "--world"),
      authoringOutputPath: requiredArgument(args, "--output"),
      mapOutputPath: requiredArgument(args, "--map-output"),
    });
    if (!result.ok) {
      process.stderr.write(`${JSON.stringify({
        status: "failed",
        diagnostics: result.diagnostics,
      })}\n`);
      return 2;
    }
    process.stdout.write(`${JSON.stringify({
      status: "passed",
      worldId: result.authoringSpec.id,
      blockCount: result.checkReport.metrics.blockCount,
    })}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (process.argv[1] !== undefined &&
    import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await runCompileBlockWorldCliV2(process.argv.slice(2));
}
