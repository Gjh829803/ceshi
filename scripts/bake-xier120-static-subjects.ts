import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { sourceFbxContributorAssetInventory } from "@whitebox-world/subject-registry";

import {
  type StaticSubjectBakeConfigV1,
  xier120StaticSubjectBakeConfigs,
} from "../packages/subject-registry/src/xier120-static-subject-config";
import {
  bakeStaticSubjectFbx,
  type StaticSubjectBakeResultV1,
} from "./lib/static-subject-bake";

export interface BakeXier120StaticSubjectsOptionsV1 {
  readonly repositoryRootPath: string;
  readonly outputRootPath?: string;
  readonly check: boolean;
  readonly log?: (message: string) => void;
}

export interface Xier120StaticSubjectBakeSummaryV1 {
  readonly sourceId: `${string}.${string}`;
  readonly slug: string;
  readonly outputPath: string;
  readonly result: StaticSubjectBakeResultV1;
  readonly matchedCommittedBytes: boolean;
}

const XIER120_SOURCE_PREFIX = "xier120.";
const EXPECTED_XIER120_SOURCE_COUNT = 19;

function slugFromSourceId(sourceId: `${string}.${string}`): string {
  if (!sourceId.startsWith(XIER120_SOURCE_PREFIX)) {
    throw new Error(`Unexpected xier120 Source ID: ${sourceId}`);
  }
  const slug = sourceId.slice(XIER120_SOURCE_PREFIX.length);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(`Unsafe xier120 Source ID slug: ${sourceId}`);
  }
  return slug;
}

function outputPathFor(outputRootPath: string, sourceId: `${string}.${string}`): string {
  const slug = slugFromSourceId(sourceId);
  return join(outputRootPath, slug, "v1", `${slug}.glb`);
}

function validatedInputs(): readonly {
  sourceEntry: (typeof sourceFbxContributorAssetInventory)[number];
  config: StaticSubjectBakeConfigV1;
}[] {
  const sourceEntries = sourceFbxContributorAssetInventory
    .filter((entry) => entry.creatorId === "xier120")
    .toSorted((left, right) =>
      left.sourceId < right.sourceId ? -1 : left.sourceId > right.sourceId ? 1 : 0,
    );
  if (sourceEntries.length !== EXPECTED_XIER120_SOURCE_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_XIER120_SOURCE_COUNT} xier120 sources, received ${sourceEntries.length}`,
    );
  }
  const configBySourceId = new Map<string, StaticSubjectBakeConfigV1>();
  for (const config of xier120StaticSubjectBakeConfigs) {
    if (configBySourceId.has(config.sourceId)) {
      throw new Error(`Duplicate xier120 static bake config: ${config.sourceId}`);
    }
    configBySourceId.set(config.sourceId, config);
  }
  if (configBySourceId.size !== sourceEntries.length) {
    throw new Error(
      `xier120 source/config count mismatch: ${sourceEntries.length} != ${configBySourceId.size}`,
    );
  }
  return sourceEntries.map((sourceEntry) => {
    const config = configBySourceId.get(sourceEntry.sourceId);
    if (config === undefined) {
      throw new Error(`Missing xier120 static bake config: ${sourceEntry.sourceId}`);
    }
    return Object.freeze({ sourceEntry, config });
  });
}

async function writeGeneratedOutputs(
  outputRootPath: string,
  generated: readonly {
    sourceId: `${string}.${string}`;
    result: StaticSubjectBakeResultV1;
  }[],
): Promise<void> {
  for (const item of generated) {
    const outputPath = outputPathFor(outputRootPath, item.sourceId);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, item.result.artifact.bytes);
  }
}

export async function bakeXier120StaticSubjects(
  options: BakeXier120StaticSubjectsOptionsV1,
): Promise<readonly Xier120StaticSubjectBakeSummaryV1[]> {
  const outputRootPath =
    options.outputRootPath ??
    resolve(options.repositoryRootPath, "apps/playground/public/subject-assets/xier120");
  const inputs = validatedInputs();
  const generated: {
    sourceId: `${string}.${string}`;
    result: StaticSubjectBakeResultV1;
  }[] = [];

  // Hold every result until every immutable input has passed length/hash
  // admission. Write mode therefore cannot partially update committed outputs
  // because of a later invalid source.
  for (const { sourceEntry, config } of inputs) {
    generated.push({
      sourceId: sourceEntry.sourceId,
      result: await bakeStaticSubjectFbx({
        sourceEntry,
        config,
        repositoryRootPath: options.repositoryRootPath,
      }),
    });
  }

  if (!options.check) {
    await writeGeneratedOutputs(outputRootPath, generated);
  } else {
    const temporaryRootPath = await mkdtemp(
      join(tmpdir(), "xier120-static-subject-check-"),
    );
    try {
      await writeGeneratedOutputs(temporaryRootPath, generated);
      for (const item of generated) {
        const temporaryOutputPath = outputPathFor(temporaryRootPath, item.sourceId);
        const committedOutputPath = outputPathFor(outputRootPath, item.sourceId);
        let committedBytes: Uint8Array;
        try {
          committedBytes = await readFile(committedOutputPath);
        } catch {
          throw new Error(`Missing committed xier120 static bake output: ${item.sourceId}`);
        }
        const regeneratedBytes = await readFile(temporaryOutputPath);
        if (!Buffer.from(regeneratedBytes).equals(Buffer.from(committedBytes))) {
          throw new Error(`Exact-byte mismatch for ${item.sourceId}`);
        }
      }
    } finally {
      await rm(temporaryRootPath, { recursive: true, force: true });
    }
  }

  return Object.freeze(
    generated.map(({ sourceId, result }) => {
      const slug = slugFromSourceId(sourceId);
      const summary = Object.freeze({
        sourceId,
        slug,
        outputPath: outputPathFor(outputRootPath, sourceId),
        result,
        matchedCommittedBytes: options.check,
      });
      options.log?.(
        JSON.stringify({
          sourceId,
          outputPath: summary.outputPath,
          byteLength: result.artifact.byteLength,
          contentHash: result.artifact.contentHash,
          bounds: result.bounds,
          inventory: result.inventory,
          check: options.check ? "matched" : "written",
        }),
      );
      return summary;
    }),
  );
}

export function parseXier120StaticSubjectBakeArguments(
  arguments_: readonly string[],
): { readonly check: boolean } {
  for (const argument of arguments_) {
    if (argument !== "--" && argument !== "--check") {
      throw new Error(`Unknown bake:xier120-subjects argument: ${argument}`);
    }
  }
  return Object.freeze({ check: arguments_.includes("--check") });
}

async function main(): Promise<void> {
  const repositoryRootPath = fileURLToPath(new URL("../", import.meta.url));
  const { check } = parseXier120StaticSubjectBakeArguments(process.argv.slice(2));
  const summaries = await bakeXier120StaticSubjects({
    repositoryRootPath,
    check,
    log: console.log,
  });
  console.log(
    `xier120 static subjects: ${summaries.length}/${EXPECTED_XIER120_SOURCE_COUNT} ` +
      (check ? "exact-byte outputs matched" : "outputs written"),
  );
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
