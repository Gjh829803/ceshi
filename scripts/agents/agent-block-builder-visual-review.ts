import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createBlockWorldVisualReviewPngsV1 } from "../lib/block-world-visual-review.js";
import { loadBlockWorldModuleV2 } from "../lib/block-world-module.js";

function option(arguments_: readonly string[], name: string): string {
  const index = arguments_.indexOf(name);
  const value = index < 0 ? undefined : arguments_[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${name} is required.`);
  return value;
}

function contentHash(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function writeAtomic(filePath: string, bytes: Uint8Array): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, bytes);
  await rename(temporaryPath, filePath);
}

export async function renderBlockBuilderVisualReview(options: Readonly<{
  worldModulePath: string;
  worldPlanPath: string;
  entryWhiteboxTargetPath: string;
  topDownComparisonOutputPath: string;
  entryComparisonOutputPath: string;
}>): Promise<Readonly<{
  status: "passed";
  worldModuleHash: `sha256:${string}`;
  worldPlanHash: `sha256:${string}`;
  entryWhiteboxTargetHash: `sha256:${string}`;
  topDownComparisonHash: `sha256:${string}`;
  entryComparisonHash: `sha256:${string}`;
}>> {
  const [loaded, worldPlanPng, entryWhiteboxTargetPng] = await Promise.all([
    loadBlockWorldModuleV2(options.worldModulePath),
    readFile(options.worldPlanPath),
    readFile(options.entryWhiteboxTargetPath),
  ]);
  if (loaded.extraction.diagnostics.length > 0) {
    throw new Error(
      `BLOCK_WORLD_VISUAL_REVIEW_EXTRACTION_FAILED: ${loaded.extraction.diagnostics
        .map(({ code }) => code).join(",")}`,
    );
  }
  const rendered = createBlockWorldVisualReviewPngsV1({
    manifest: loaded.extraction.manifest,
    controlledSubject: loaded.authored.controlledSubject,
    camera: loaded.authored.camera,
    spawnStandPositionMetersXYZ: loaded.authored.spawnStandPositionMetersXYZ,
    plannerWorldPlanPng: worldPlanPng,
    plannerEntryWhiteboxTargetPng: entryWhiteboxTargetPng,
  });
  await Promise.all([
    writeAtomic(options.topDownComparisonOutputPath, rendered.topDownComparisonPng),
    writeAtomic(options.entryComparisonOutputPath, rendered.entryComparisonPng),
  ]);
  return Object.freeze({
    status: "passed",
    worldModuleHash: contentHash(Buffer.from(loaded.sourceText, "utf8")),
    worldPlanHash: contentHash(worldPlanPng),
    entryWhiteboxTargetHash: contentHash(entryWhiteboxTargetPng),
    topDownComparisonHash: contentHash(rendered.topDownComparisonPng),
    entryComparisonHash: contentHash(rendered.entryComparisonPng),
  });
}

export async function main(arguments_: readonly string[] = process.argv.slice(2)): Promise<void> {
  const result = await renderBlockBuilderVisualReview({
    worldModulePath: path.resolve(option(arguments_, "--world")),
    worldPlanPath: path.resolve(option(arguments_, "--world-plan")),
    entryWhiteboxTargetPath: path.resolve(option(arguments_, "--entry")),
    topDownComparisonOutputPath: path.resolve(option(arguments_, "--top-down-output")),
    entryComparisonOutputPath: path.resolve(option(arguments_, "--entry-output")),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const entryPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
