import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assembleModularSubjectRuntimeBundle } from "../lib/modular-subject-runtime-bundle";

export interface ModularSubjectRuntimeBundleOutputV1 {
  readonly relativePath: string;
  readonly bytes: Uint8Array;
}

export interface BuildModularSubjectRuntimeBundleOutputsOptionsV1 {
  readonly repositoryRoot: string;
}

const CATALOG = [
  {
    packageRelativePath: "assets/subjects/packages/seedleap/g-bot/v1",
    publicRelativePath: "apps/playground/public/subject-assets/humanoid/g-bot/v2/g-bot.glb",
    manifestRelativePath:
      "assets/subjects/runtime-bundles/seedleap/g-bot/v1/runtime-bundle.manifest.json",
  },
  {
    packageRelativePath: "assets/subjects/packages/seedleap/golden-humanoid/v1",
    publicRelativePath:
      "apps/playground/public/subject-assets/humanoid/golden/v2/golden-humanoid.glb",
    manifestRelativePath:
      "assets/subjects/runtime-bundles/seedleap/golden-humanoid/v1/runtime-bundle.manifest.json",
  },
] as const;

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function canonicalizeModularSubjectRuntimeBundleOutputBytes(
  relativePath: string,
  bytes: Uint8Array,
): Uint8Array {
  if (!relativePath.endsWith(".json")) return bytes;
  return Buffer.from(Buffer.from(bytes).toString("utf8").replaceAll("\r\n", "\n"));
}

function equalBytes(
  relativePath: string,
  left: Uint8Array,
  right: Uint8Array,
): boolean {
  const canonicalLeft = canonicalizeModularSubjectRuntimeBundleOutputBytes(
    relativePath,
    left,
  );
  const canonicalRight = canonicalizeModularSubjectRuntimeBundleOutputBytes(
    relativePath,
    right,
  );
  return canonicalLeft.byteLength === canonicalRight.byteLength &&
    canonicalLeft.every((value, index) => value === canonicalRight[index]);
}

function repositoryPath(repositoryRoot: string, relativePath: string): string {
  const root = path.resolve(repositoryRoot);
  const resolved = path.resolve(root, ...relativePath.split("/"));
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`MODULAR_SUBJECT_RUNTIME_OUTPUT_PATH_INVALID: ${relativePath}`);
  }
  return resolved;
}

export async function buildModularSubjectRuntimeBundleOutputs(
  options: BuildModularSubjectRuntimeBundleOutputsOptionsV1,
): Promise<readonly ModularSubjectRuntimeBundleOutputV1[]> {
  const outputs: ModularSubjectRuntimeBundleOutputV1[] = [];
  for (const row of CATALOG) {
    const bundle = await assembleModularSubjectRuntimeBundle({
      packageDirectory: repositoryPath(options.repositoryRoot, row.packageRelativePath),
    });
    outputs.push(
      { relativePath: row.publicRelativePath, bytes: bundle.glbBytes },
      { relativePath: row.manifestRelativePath, bytes: bundle.manifestBytes },
    );
  }
  return outputs.sort((left, right) => compareCodeUnits(left.relativePath, right.relativePath));
}

async function writeOutputs(
  repositoryRoot: string,
  outputs: readonly ModularSubjectRuntimeBundleOutputV1[],
): Promise<void> {
  for (const output of outputs) {
    const target = repositoryPath(repositoryRoot, output.relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, output.bytes, { flag: "wx" });
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }
}

async function checkOutputs(
  repositoryRoot: string,
  outputs: readonly ModularSubjectRuntimeBundleOutputV1[],
): Promise<void> {
  const mismatches: string[] = [];
  for (const output of outputs) {
    try {
      const actual = await readFile(repositoryPath(repositoryRoot, output.relativePath));
      if (!equalBytes(output.relativePath, actual, output.bytes)) {
        mismatches.push(output.relativePath);
      }
    } catch {
      mismatches.push(output.relativePath);
    }
  }
  if (mismatches.length > 0) {
    throw new Error(`MODULAR_SUBJECT_RUNTIME_OUTPUT_MISMATCH: ${mismatches.join(",")}`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 1 || (args[0] !== "--write" && args[0] !== "--check")) {
    throw new Error("Pass exactly one of --write or --check.");
  }
  const repositoryRoot = path.resolve(import.meta.dirname, "../..");
  const outputs = await buildModularSubjectRuntimeBundleOutputs({ repositoryRoot });
  if (args[0] === "--write") await writeOutputs(repositoryRoot, outputs);
  else await checkOutputs(repositoryRoot, outputs);
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
