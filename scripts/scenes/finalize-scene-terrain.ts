import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  parseAuthoringSpecV4,
  stringifyCanonicalJson,
} from "@whitebox-world/authoring";
import {
  compileTerrainHeightIntent,
  TERRAIN_HEIGHT_INTENT_COMPILER_VERSION,
  TERRAIN_HEIGHT_INTENT_NORMALIZATION_PROFILE,
} from "@whitebox-world/terrain-compiler";

import {
  BUILDER_SELF_CHECK_VERSION,
  runBuilderSelfCheck,
} from "../agents/agent-builder-self-check";
import { PLANNER_SELF_CHECK_VERSION } from "../agents/agent-planner-self-check";
import { promoteNamedArtifactsTransactionally } from
  "../lib/transactional-artifact-promotion";

type Sha256Hash = `sha256:${string}`;

interface ReceiptEnvelope {
  kind?: unknown;
  validatorVersion?: unknown;
  sceneId?: unknown;
  sceneSourceKind?: unknown;
  status?: unknown;
  inputs?: Record<string, unknown>;
}

export interface FinalizeSceneTerrainOptions {
  readonly sceneId: string;
  readonly runId: string;
  readonly briefPath: string;
  readonly plannerReceiptPath: string;
  readonly terrainPromptPath: string;
  readonly terrainIntentPath: string;
  readonly builderReceiptPath: string;
  readonly builderAuthoringPath: string;
  readonly mapDraftPath: string;
  readonly outputAuthoringPath: string;
  readonly outputReportPath: string;
  readonly outputManifestPath: string;
  readonly outputSelfCheckPath: string;
  readonly failureReportPath: string;
}

function byteHash(value: string | Uint8Array): Sha256Hash {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function parseReceipt(source: string, label: string): ReceiptEnvelope {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error(`${label}_RECEIPT_JSON_INVALID`);
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label}_RECEIPT_SHAPE_INVALID`);
  }
  return value as ReceiptEnvelope;
}

function expectReceiptField(
  actual: unknown,
  expected: unknown,
  code: string,
): void {
  if (actual !== expected) throw new Error(code);
}

function verifyPlannerReceipt(input: {
  sceneId: string;
  receipt: ReceiptEnvelope;
  briefSource: string;
  terrainPromptSource: string;
  terrainIntentBytes: Uint8Array;
}): void {
  expectReceiptField(
    input.receipt.kind,
    "worldkit-planner-self-check",
    "PLANNER_RECEIPT_KIND_INVALID",
  );
  expectReceiptField(
    input.receipt.validatorVersion,
    PLANNER_SELF_CHECK_VERSION,
    "PLANNER_RECEIPT_VERSION_INVALID",
  );
  expectReceiptField(
    input.receipt.sceneId,
    input.sceneId,
    "PLANNER_RECEIPT_SCENE_ID_MISMATCH",
  );
  expectReceiptField(
    input.receipt.sceneSourceKind,
    "canonical",
    "PLANNER_RECEIPT_SCENE_SOURCE_INVALID",
  );
  expectReceiptField(
    input.receipt.status,
    "passed",
    "PLANNER_RECEIPT_NOT_PASSED",
  );
  expectReceiptField(
    input.receipt.inputs?.sceneBriefHash,
    byteHash(input.briefSource),
    "PLANNER_RECEIPT_BRIEF_HASH_MISMATCH",
  );
  expectReceiptField(
    input.receipt.inputs?.terrainHeightIntentPromptHash,
    byteHash(input.terrainPromptSource),
    "PLANNER_RECEIPT_TERRAIN_PROMPT_HASH_MISMATCH",
  );
  expectReceiptField(
    input.receipt.inputs?.terrainHeightIntentPngHash,
    byteHash(input.terrainIntentBytes),
    "PLANNER_RECEIPT_TERRAIN_INTENT_HASH_MISMATCH",
  );
}

function verifyBuilderReceipt(input: {
  sceneId: string;
  receipt: ReceiptEnvelope;
  briefSource: string;
  builderAuthoringSource: string;
  mapDraftSource: string;
}): void {
  expectReceiptField(
    input.receipt.kind,
    "worldkit-builder-self-check",
    "BUILDER_RECEIPT_KIND_INVALID",
  );
  expectReceiptField(
    input.receipt.validatorVersion,
    BUILDER_SELF_CHECK_VERSION,
    "BUILDER_RECEIPT_VERSION_INVALID",
  );
  expectReceiptField(
    input.receipt.sceneId,
    input.sceneId,
    "BUILDER_RECEIPT_SCENE_ID_MISMATCH",
  );
  expectReceiptField(
    input.receipt.status,
    "passed",
    "BUILDER_RECEIPT_NOT_PASSED",
  );
  expectReceiptField(
    input.receipt.inputs?.sceneBriefHash,
    byteHash(input.briefSource),
    "BUILDER_RECEIPT_BRIEF_HASH_MISMATCH",
  );
  expectReceiptField(
    input.receipt.inputs?.authoringSpecHash,
    byteHash(input.builderAuthoringSource),
    "BUILDER_RECEIPT_AUTHORING_HASH_MISMATCH",
  );
  expectReceiptField(
    input.receipt.inputs?.implementationMapDraftHash,
    byteHash(input.mapDraftSource),
    "BUILDER_RECEIPT_MAP_HASH_MISMATCH",
  );
}

async function writeAtomic(filePath: string, contents: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, contents, "utf8");
  await rename(temporaryPath, filePath);
}

export async function finalizeSceneTerrain(
  options: FinalizeSceneTerrainOptions,
): Promise<{ readonly status: "passed" }> {
  const [
    briefSource,
    plannerReceiptSource,
    terrainPromptSource,
    terrainIntentBytes,
    builderReceiptSource,
    builderAuthoringSource,
    mapDraftSource,
  ] = await Promise.all([
    readFile(options.briefPath, "utf8"),
    readFile(options.plannerReceiptPath, "utf8"),
    readFile(options.terrainPromptPath, "utf8"),
    readFile(options.terrainIntentPath),
    readFile(options.builderReceiptPath, "utf8"),
    readFile(options.builderAuthoringPath, "utf8"),
    readFile(options.mapDraftPath, "utf8"),
  ]);
  const plannerReceipt = parseReceipt(plannerReceiptSource, "PLANNER");
  verifyPlannerReceipt({
    sceneId: options.sceneId,
    receipt: plannerReceipt,
    briefSource,
    terrainPromptSource,
    terrainIntentBytes,
  });
  const builderReceipt = parseReceipt(builderReceiptSource, "BUILDER");
  verifyBuilderReceipt({
    sceneId: options.sceneId,
    receipt: builderReceipt,
    briefSource,
    builderAuthoringSource,
    mapDraftSource,
  });

  const parsedAuthoring = parseAuthoringSpecV4(builderAuthoringSource);
  if (!parsedAuthoring.ok || parsedAuthoring.value === undefined) {
    throw new Error(
      `BUILDER_AUTHORING_INVALID: ${parsedAuthoring.diagnostics.map(({ code }) => code).join(", ")}`,
    );
  }
  const compilation = await compileTerrainHeightIntent({
    sourcePngBytes: terrainIntentBytes,
    authoringSpec: parsedAuthoring.value,
  });
  const reportSource = `${stringifyCanonicalJson(compilation.report)}\n`;
  if (
    compilation.report.status !== "passed" ||
    compilation.compiledAuthoringSpec === undefined
  ) {
    await writeAtomic(options.failureReportPath, reportSource);
    throw new Error("TERRAIN_HEIGHT_INTENT_COMPILATION_FAILED");
  }

  const authoringSource =
    `${stringifyCanonicalJson(compilation.compiledAuthoringSpec)}\n`;
  const temporaryRoot = await mkdtemp(
    path.join(tmpdir(), "worldkit-final-authoring-check-"),
  );
  try {
    const stagedAuthoringPath = path.join(temporaryRoot, "authoring.json");
    const stagedReceiptPath = path.join(
      temporaryRoot,
      "final-authoring-self-check.json",
    );
    await writeFile(stagedAuthoringPath, authoringSource, "utf8");
    const checked = await runBuilderSelfCheck({
      sceneId: options.sceneId,
      briefPath: options.briefPath,
      worldPath: stagedAuthoringPath,
      mapDraftPath: options.mapDraftPath,
      reportPath: stagedReceiptPath,
    });
    const finalReceiptSource = await readFile(stagedReceiptPath, "utf8");
    if (checked.status !== "passed") {
      await writeAtomic(options.failureReportPath, `${stringifyCanonicalJson({
        kind: "worldkit-terrain-finalization-failure",
        schemaVersion: 1,
        sceneId: options.sceneId,
        terrainCompileReport: compilation.report,
        finalAuthoringDiagnostics: checked.diagnostics,
      })}\n`);
      throw new Error("FINAL_AUTHORING_SELF_CHECK_FAILED");
    }

    const manifestSource = `${stringifyCanonicalJson({
      kind: "worldkit-terrain-compilation-manifest",
      schemaVersion: 1,
      sceneId: options.sceneId,
      runId: options.runId,
      compiler: {
        packageName: "@whitebox-world/terrain-compiler",
        compilerVersion: TERRAIN_HEIGHT_INTENT_COMPILER_VERSION,
        normalizationProfileId:
          TERRAIN_HEIGHT_INTENT_NORMALIZATION_PROFILE,
      },
      inputs: {
        plannerReceiptHash: byteHash(plannerReceiptSource),
        terrainHeightIntentPromptHash: byteHash(terrainPromptSource),
        terrainHeightIntentPngHash: byteHash(terrainIntentBytes),
        builderReceiptHash: byteHash(builderReceiptSource),
        builderAuthoringSpecHash: byteHash(builderAuthoringSource),
        implementationMapDraftHash: byteHash(mapDraftSource),
      },
      outputs: {
        authoringSpecHash: byteHash(authoringSource),
        terrainCompileReportHash: byteHash(reportSource),
        finalAuthoringSelfCheckHash: byteHash(finalReceiptSource),
      },
    })}\n`;
    for (const outputPath of [
      options.outputAuthoringPath,
      options.outputReportPath,
      options.outputManifestPath,
      options.outputSelfCheckPath,
    ]) {
      await mkdir(path.dirname(outputPath), { recursive: true });
    }
    await promoteNamedArtifactsTransactionally({
      writes: [
        {
          role: "authoring",
          targetPath: options.outputAuthoringPath,
          contents: authoringSource,
        },
        {
          role: "report",
          targetPath: options.outputReportPath,
          contents: reportSource,
        },
        {
          role: "receipt",
          targetPath: options.outputSelfCheckPath,
          contents: finalReceiptSource,
        },
        {
          role: "manifest",
          targetPath: options.outputManifestPath,
          contents: manifestSource,
        },
      ],
      commitRole: "manifest",
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
  return { status: "passed" };
}

function option(arguments_: readonly string[], name: string): string {
  const index = arguments_.indexOf(name);
  const value = index < 0 ? undefined : arguments_[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

export async function main(arguments_: readonly string[] = process.argv.slice(2)) {
  const result = await finalizeSceneTerrain({
    sceneId: option(arguments_, "--scene-id"),
    runId: option(arguments_, "--run-id"),
    briefPath: path.resolve(option(arguments_, "--brief")),
    plannerReceiptPath: path.resolve(option(arguments_, "--planner-receipt")),
    terrainPromptPath: path.resolve(option(arguments_, "--terrain-prompt")),
    terrainIntentPath: path.resolve(option(arguments_, "--terrain-intent")),
    builderReceiptPath: path.resolve(option(arguments_, "--builder-receipt")),
    builderAuthoringPath: path.resolve(option(arguments_, "--builder-authoring")),
    mapDraftPath: path.resolve(option(arguments_, "--map-draft")),
    outputAuthoringPath: path.resolve(option(arguments_, "--output-authoring")),
    outputReportPath: path.resolve(option(arguments_, "--output-report")),
    outputManifestPath: path.resolve(option(arguments_, "--output-manifest")),
    outputSelfCheckPath: path.resolve(option(arguments_, "--output-self-check")),
    failureReportPath: path.resolve(option(arguments_, "--failure-report")),
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
