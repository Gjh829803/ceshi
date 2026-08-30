import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { stringifyCanonicalJson } from "@whitebox-world/authoring";

interface BuilderReceipt {
  readonly kind?: string;
  readonly schemaVersion?: number;
  readonly validatorVersion?: string;
  readonly sceneId?: string;
  readonly status?: string;
  readonly inputs?: Readonly<Record<string, unknown>>;
  readonly diagnostics?: readonly unknown[];
}

interface ImplementationMapDraft {
  readonly kind?: string;
  readonly schemaVersion?: number;
  readonly sceneId?: string;
  readonly authoringSpecId?: string;
  readonly visualTargetMappings?: readonly Readonly<{
    visualTargetId?: string;
    runtimeEntityIds?: readonly string[];
  }>[];
}

function option(arguments_: readonly string[], name: string): string {
  const index = arguments_.indexOf(name);
  const value = index < 0 ? undefined : arguments_[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${name} is required.`);
  return value;
}

function contentHash(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function assertReceipt(
  receipt: BuilderReceipt,
  options: {
    readonly label: string;
    readonly sceneId: string;
    readonly allowedValidatorVersions: readonly string[];
    readonly briefHash: string;
    readonly worldHash: string;
    readonly authoringHash: string;
    readonly mapHash: string;
  },
): void {
  if (
    receipt.kind !== "worldkit-block-builder-self-check" ||
    receipt.schemaVersion !== 1 ||
    !options.allowedValidatorVersions.includes(receipt.validatorVersion ?? "") ||
    receipt.sceneId !== options.sceneId ||
    receipt.status !== "passed" ||
    !Array.isArray(receipt.diagnostics) || receipt.diagnostics.length !== 0 ||
    receipt.inputs?.sceneBriefHash !== options.briefHash ||
    receipt.inputs?.worldModuleHash !== options.worldHash ||
    receipt.inputs?.authoringSpecHash !== options.authoringHash ||
    receipt.inputs?.implementationMapDraftHash !== options.mapHash
  ) {
    throw new Error(`BLOCK_BUILDER_HOST_RESUME_${options.label}_RECEIPT_INVALID`);
  }
}

function assertMapMigration(
  originalBytes: Uint8Array,
  replayBytes: Uint8Array,
  sceneId: string,
): void {
  const parse = (bytes: Uint8Array): ImplementationMapDraft =>
    JSON.parse(Buffer.from(bytes).toString("utf8")) as ImplementationMapDraft;
  const original = parse(originalBytes);
  const replay = parse(replayBytes);
  const valid = (value: ImplementationMapDraft) =>
    value.kind === "worldkit-scene-brief-implementation-map-draft" &&
    value.schemaVersion === 1 && value.sceneId === sceneId &&
    value.authoringSpecId === sceneId && Array.isArray(value.visualTargetMappings) &&
    value.visualTargetMappings.length > 0 &&
    value.visualTargetMappings.every((mapping) =>
      typeof mapping.visualTargetId === "string" &&
      Array.isArray(mapping.runtimeEntityIds) && mapping.runtimeEntityIds.length > 0 &&
      mapping.runtimeEntityIds.every((id: string) =>
        typeof id === "string" && id.length > 0));
  if (!valid(original) || !valid(replay)) {
    throw new Error("BLOCK_BUILDER_HOST_RESUME_MAP_MIGRATION_INVALID");
  }
  const byTarget = (value: ImplementationMapDraft) => new Map(
    value.visualTargetMappings!.map((mapping) => [
      mapping.visualTargetId!,
      [...mapping.runtimeEntityIds!].sort(),
    ]),
  );
  const originalByTarget = byTarget(original);
  const replayByTarget = byTarget(replay);
  if ([...originalByTarget.keys()].sort().join(",") !==
      [...replayByTarget.keys()].sort().join(",") ||
      JSON.stringify(originalByTarget.get("visual-target-1")) !==
        JSON.stringify(replayByTarget.get("visual-target-1"))) {
    throw new Error("BLOCK_BUILDER_HOST_RESUME_MAP_TARGETS_CHANGED");
  }
}

export async function verifyBlockBuilderHostResume(options: {
  readonly sceneId: string;
  readonly briefPath: string;
  readonly worldModulePath: string;
  readonly originalAuthoringPath: string;
  readonly originalMapPath: string;
  readonly originalReportPath: string;
  readonly replayAuthoringPath: string;
  readonly replayMapPath: string;
  readonly replayReportPath: string;
  readonly outputPath: string;
}) {
  const [
    briefBytes,
    worldBytes,
    originalAuthoringBytes,
    originalMapBytes,
    originalReportBytes,
    replayAuthoringBytes,
    replayMapBytes,
    replayReportBytes,
  ] = await Promise.all([
    readFile(options.briefPath),
    readFile(options.worldModulePath),
    readFile(options.originalAuthoringPath),
    readFile(options.originalMapPath),
    readFile(options.originalReportPath),
    readFile(options.replayAuthoringPath),
    readFile(options.replayMapPath),
    readFile(options.replayReportPath),
  ]);
  const briefHash = contentHash(briefBytes);
  const worldHash = contentHash(worldBytes);
  const originalAuthoringHash = contentHash(originalAuthoringBytes);
  const originalMapHash = contentHash(originalMapBytes);
  const replayAuthoringHash = contentHash(replayAuthoringBytes);
  const replayMapHash = contentHash(replayMapBytes);
  const originalReport = JSON.parse(originalReportBytes.toString("utf8")) as BuilderReceipt;
  const replayReport = JSON.parse(replayReportBytes.toString("utf8")) as BuilderReceipt;
  assertReceipt(originalReport, {
    label: "ORIGINAL",
    sceneId: options.sceneId,
    allowedValidatorVersions: [
      "worldkit-block-builder-self-check-v2",
      "worldkit-block-builder-self-check-v3",
      "worldkit-block-builder-self-check-v4",
      "worldkit-block-builder-self-check-v5",
      "worldkit-block-builder-self-check-v6",
      "worldkit-block-builder-self-check-v7",
      "worldkit-block-builder-self-check-v8",
      "worldkit-block-builder-self-check-v9",
      "worldkit-block-builder-self-check-v10",
    ],
    briefHash,
    worldHash,
    authoringHash: originalAuthoringHash,
    mapHash: originalMapHash,
  });
  assertReceipt(replayReport, {
    label: "REPLAY",
    sceneId: options.sceneId,
    allowedValidatorVersions: ["worldkit-block-builder-self-check-v10"],
    briefHash,
    worldHash,
    authoringHash: replayAuthoringHash,
    mapHash: replayMapHash,
  });
  const implementationMapMigrated = !originalMapBytes.equals(replayMapBytes);
  if (implementationMapMigrated) {
    if (![
      "worldkit-block-builder-self-check-v2",
      "worldkit-block-builder-self-check-v3",
      "worldkit-block-builder-self-check-v4",
    ].includes(originalReport.validatorVersion ?? "") ||
        replayReport.validatorVersion !== "worldkit-block-builder-self-check-v10") {
      throw new Error("BLOCK_BUILDER_HOST_RESUME_MAP_CHANGED");
    }
    assertMapMigration(originalMapBytes, replayMapBytes, options.sceneId);
  }
  const receipt = {
    kind: "worldkit-block-builder-host-resume-receipt",
    schemaVersion: 1,
    sceneId: options.sceneId,
    status: "passed",
    originalValidatorVersion: originalReport.validatorVersion,
    replayValidatorVersion: replayReport.validatorVersion,
    implementationMapMigrated,
    inputs: {
      sceneBriefHash: briefHash,
      worldModuleHash: worldHash,
      originalImplementationMapDraftHash: originalMapHash,
      replayImplementationMapDraftHash: replayMapHash,
      originalAuthoringSpecHash: originalAuthoringHash,
      replayAuthoringSpecHash: replayAuthoringHash,
    },
    diagnostics: [],
  } as const;
  const outputPath = path.resolve(options.outputPath);
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(temporaryPath, `${stringifyCanonicalJson(receipt)}\n`, "utf8");
  await rename(temporaryPath, outputPath);
  return receipt;
}

export async function main(arguments_: readonly string[] = process.argv.slice(2)): Promise<void> {
  const receipt = await verifyBlockBuilderHostResume({
    sceneId: option(arguments_, "--scene-id"),
    briefPath: path.resolve(option(arguments_, "--brief")),
    worldModulePath: path.resolve(option(arguments_, "--world")),
    originalAuthoringPath: path.resolve(option(arguments_, "--original-authoring")),
    originalMapPath: path.resolve(option(arguments_, "--original-map")),
    originalReportPath: path.resolve(option(arguments_, "--original-report")),
    replayAuthoringPath: path.resolve(option(arguments_, "--replay-authoring")),
    replayMapPath: path.resolve(option(arguments_, "--replay-map")),
    replayReportPath: path.resolve(option(arguments_, "--replay-report")),
    outputPath: path.resolve(option(arguments_, "--output")),
  });
  process.stdout.write(`${JSON.stringify({ status: receipt.status, diagnostics: receipt.diagnostics })}\n`);
}

const entryPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
