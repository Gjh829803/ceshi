import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseCanonicalJson, stringifyCanonicalJson } from "@whitebox-world/authoring";
import type { WorldRuntimeSnapshotV4 } from "@whitebox-world/runtime-contracts";

interface RuntimePreviewOptionsV1 {
  readonly worldModulePath: string;
  readonly authoringInputPath?: string;
  readonly openingFramePath: string;
  readonly runtimeSnapshotPath: string;
  readonly cameraReportPath: string;
  readonly port?: number;
}

function requiredOption(arguments_: readonly string[], name: string): string {
  const index = arguments_.indexOf(name);
  const value = index < 0 ? undefined : arguments_[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`RUNTIME_PREVIEW_ARGUMENT_REQUIRED: ${name}`);
  }
  return value;
}

function optionalOption(arguments_: readonly string[], name: string): string | undefined {
  const index = arguments_.indexOf(name);
  if (index < 0) return undefined;
  const value = arguments_[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`RUNTIME_PREVIEW_ARGUMENT_REQUIRED: ${name}`);
  }
  return value;
}

function positiveInteger(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error(`RUNTIME_PREVIEW_ARGUMENT_INVALID: ${name}`);
  }
  return parsed;
}

function siblingOutputPath(openingFramePath: string, suffix: string): string {
  const extension = path.extname(openingFramePath);
  const stem = extension === "" ? openingFramePath : openingFramePath.slice(0, -extension.length);
  return `${stem}.${suffix}.json`;
}

async function writeCanonicalAtomic(outputPath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = path.join(
    path.dirname(outputPath),
    `.${path.basename(outputPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporaryPath, `${stringifyCanonicalJson(value)}\n`, "utf8");
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export function createRuntimePreviewReportV1(input: {
  readonly worldId: string;
  readonly worldModuleHash: `sha256:${string}`;
  readonly openingFramePath: string;
  readonly runtimeSnapshotPath: string;
  readonly snapshot: WorldRuntimeSnapshotV4;
}) {
  const camera = input.snapshot.view.camera;
  const trackedSubject = camera.mode === "tracking"
    ? input.snapshot.world.subjectStatesByEntityId[camera.targetEntityId]
    : undefined;
  return Object.freeze({
    kind: "worldkit-agent-runtime-preview" as const,
    schemaVersion: 1 as const,
    status: "captured" as const,
    worldId: input.worldId,
    worldModuleHash: input.worldModuleHash,
    openingFramePath: input.openingFramePath,
    runtimeSnapshotPath: input.runtimeSnapshotPath,
    runtime: Object.freeze({
      phase: input.snapshot.runtime.phase,
      isPaused: input.snapshot.runtime.isPaused,
      simulationTick: input.snapshot.world.simulationTick,
      meshCount: input.snapshot.resources.meshCount,
      physicsBodyCount: input.snapshot.resources.physicsBodyCount,
    }),
    camera: camera.mode === "unbound"
      ? Object.freeze({ mode: "unbound" as const })
      : Object.freeze({
          mode: "tracking" as const,
          targetEntityId: camera.targetEntityId,
          selectedTargetSocketId: camera.selectedTargetSocketId,
          targetSocketPositionMetersXYZ: camera.targetSocketPositionMetersXYZ,
          desiredTargetPositionMetersXYZ: camera.desiredTargetPositionMetersXYZ,
          actualTargetPositionMetersXYZ: camera.actualTargetPositionMetersXYZ,
          desiredPositionMetersXYZ: camera.desiredPositionMetersXYZ,
          actualPositionMetersXYZ: camera.actualPositionMetersXYZ,
          subjectPositionMetersXYZ:
            trackedSubject?.entityState.positionMetersXYZ,
          finalFovDegrees: camera.finalFovDegrees,
          requestedArmLengthMeters: camera.requestedArmLengthMeters,
          safeArmLengthMeters: camera.safeArmLengthMeters,
          effectiveArmLengthMeters: camera.effectiveArmLengthMeters,
          isCollisionRetracted: camera.isCollisionRetracted,
          decollisionPhase: camera.decollisionPhase,
          collisionHitEntityId: camera.collisionHitEntityId,
          collisionHitPositionMetersXYZ: camera.collisionHitPositionXYZ,
        }),
  });
}

export async function runAgentRuntimePreviewV1(
  options: RuntimePreviewOptionsV1,
) {
  const worldModulePath = path.resolve(options.worldModulePath);
  const openingFramePath = path.resolve(options.openingFramePath);
  const runtimeSnapshotPath = path.resolve(options.runtimeSnapshotPath);
  const cameraReportPath = path.resolve(options.cameraReportPath);
  const scratchDirectory = await mkdtemp(path.join(tmpdir(), "worldkit-runtime-preview-"));
  try {
    const { captureFile } = await import("../cli/worldkit.js");
    const worldModuleBytes = await readFile(worldModulePath);
    let authoringPath: string;
    let worldId: string;
    if (options.authoringInputPath === undefined) {
      const { compileBlockWorldModuleV2 } = await import(
        "../cli/compile-block-world.js"
      );
      authoringPath = path.join(scratchDirectory, "authoring.json");
      const compilation = await compileBlockWorldModuleV2({
        worldPath: worldModulePath,
        authoringOutputPath: authoringPath,
        mapOutputPath: path.join(scratchDirectory, "implementation-map.draft.json"),
      });
      if (!compilation.ok) {
        throw new Error(
          `RUNTIME_PREVIEW_BLOCK_WORLD_INVALID: ${JSON.stringify(compilation.diagnostics)}`,
        );
      }
      worldId = compilation.authoringSpec.id;
    } else {
      authoringPath = path.resolve(options.authoringInputPath);
      const parsedAuthoring = parseCanonicalJson(
        await readFile(authoringPath, "utf8"),
      );
      const authoringRecord = parsedAuthoring.ok &&
          parsedAuthoring.value !== undefined &&
          typeof parsedAuthoring.value === "object" &&
          parsedAuthoring.value !== null
        ? parsedAuthoring.value as Readonly<Record<string, unknown>>
        : undefined;
      if (typeof authoringRecord?.id !== "string" || authoringRecord.id === "") {
        throw new Error("RUNTIME_PREVIEW_AUTHORING_INVALID");
      }
      worldId = authoringRecord.id;
    }
    const capture = await captureFile(authoringPath, openingFramePath, {
      snapshotPath: runtimeSnapshotPath,
      allowUnvalidatedPreview: true,
      startupHardTimeoutMilliseconds: 600_000,
      startupStallTimeoutMilliseconds: 600_000,
      ...(options.port === undefined ? {} : { port: options.port }),
    });
    if (!capture.ok) {
      throw new Error(
        `RUNTIME_PREVIEW_CAPTURE_FAILED: ${JSON.stringify(capture.diagnostics)}`,
      );
    }
    const parsedSnapshot = parseCanonicalJson(
      await readFile(runtimeSnapshotPath, "utf8"),
    );
    if (!parsedSnapshot.ok || parsedSnapshot.value === undefined) {
      throw new Error("RUNTIME_PREVIEW_SNAPSHOT_INVALID");
    }
    const report = createRuntimePreviewReportV1({
      worldId,
      worldModuleHash:
        `sha256:${createHash("sha256").update(worldModuleBytes).digest("hex")}`,
      openingFramePath,
      runtimeSnapshotPath,
      snapshot: parsedSnapshot.value as unknown as WorldRuntimeSnapshotV4,
    });
    await writeCanonicalAtomic(cameraReportPath, report);
    return Object.freeze({
      status: "captured" as const,
      worldId,
      openingFramePath,
      runtimeSnapshotPath,
      cameraReportPath,
    });
  } finally {
    await rm(scratchDirectory, { recursive: true, force: true });
  }
}

export async function main(
  arguments_: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const openingFramePath = path.resolve(requiredOption(arguments_, "--output"));
  const port = positiveInteger(optionalOption(arguments_, "--port"), "--port");
  const authoringInputPath = optionalOption(arguments_, "--authoring");
  const result = await runAgentRuntimePreviewV1({
    worldModulePath: path.resolve(requiredOption(arguments_, "--world")),
    ...(authoringInputPath === undefined
      ? {}
      : { authoringInputPath: path.resolve(authoringInputPath) }),
    openingFramePath,
    runtimeSnapshotPath: path.resolve(
      optionalOption(arguments_, "--snapshot") ??
        siblingOutputPath(openingFramePath, "snapshot"),
    ),
    cameraReportPath: path.resolve(
      optionalOption(arguments_, "--camera-report") ??
        siblingOutputPath(openingFramePath, "camera"),
    ),
    ...(port === undefined ? {} : { port }),
  });
  process.stdout.write(`${stringifyCanonicalJson(result)}\n`);
}

const entryPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
