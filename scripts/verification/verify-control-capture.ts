import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  compileSimulationTakeV1,
  type SimulationTakeV1,
} from "@whitebox-world/control-capture";

import {
  inspectControlCaptureBundleFileV1,
  runSimulationTakeFileV1,
  validateControlCaptureBundleFileV1,
} from "../lib/simulation-take-cli";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../..");
const WORLD_PATH = path.join(
  REPOSITORY_ROOT,
  "examples/authoring/placement-coastal-world.json",
);
const TAKE_PATHS = [
  path.join(REPOSITORY_ROOT, "examples/takes/coastal-walk-opening.take.json"),
  path.join(REPOSITORY_ROOT, "examples/takes/coastal-orbit-run.take.json"),
] as const;

interface FrameManifestV1 {
  readonly passesById: Readonly<Record<string, {
    readonly file: string;
    readonly byteLength: number;
    readonly contentHash: string;
  }>>;
}

function finiteFloat32Values(bytes: Uint8Array): readonly number[] {
  if (bytes.byteLength % 4 !== 0) throw new Error("VERIFY_FLOAT32_LENGTH_INVALID");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: bytes.byteLength / 4 }, (_, index) =>
    view.getFloat32(index * 4, true)
  );
}

function uint32Values(bytes: Uint8Array): readonly number[] {
  if (bytes.byteLength % 4 !== 0) throw new Error("VERIFY_UINT32_LENGTH_INVALID");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: bytes.byteLength / 4 }, (_, index) =>
    view.getUint32(index * 4, true)
  );
}

function pngDimensions(bytes: Uint8Array): readonly [number, number] {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.byteLength < 24 || !signature.every((value, index) => bytes[index] === value)) {
    throw new Error("VERIFY_NEUTRAL_PNG_INVALID");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return [view.getUint32(16, false), view.getUint32(20, false)];
}

async function inspectFirstFrame(bundleDirectory: string) {
  const frameDirectory = path.join(bundleDirectory, "frames/000000");
  const frame = JSON.parse(
    await readFile(path.join(frameDirectory, "frame.json"), "utf8"),
  ) as FrameManifestV1;
  const semanticTable = JSON.parse(
    await readFile(path.join(bundleDirectory, "tables/semantic-classes.json"), "utf8"),
  ) as Array<{ numericId: number }>;
  const instanceTable = JSON.parse(
    await readFile(path.join(bundleDirectory, "tables/instances.json"), "utf8"),
  ) as Array<{ numericId: number }>;
  const bytesByPassId = Object.fromEntries(await Promise.all(
    Object.entries(frame.passesById).map(async ([passId, pass]) => [
      passId,
      new Uint8Array(await readFile(path.join(frameDirectory, pass.file))),
    ] as const),
  ));
  const neutralDimensions = pngDimensions(bytesByPassId["neutral-color"]!);
  if (neutralDimensions[0] !== 160 || neutralDimensions[1] !== 90) {
    throw new Error("VERIFY_NEUTRAL_DIMENSIONS_INVALID");
  }
  const depthValues = finiteFloat32Values(bytesByPassId["linear-depth-meters"]!);
  if (!depthValues.every((value) => Number.isFinite(value) && value >= 0) ||
    !depthValues.some((value) => value > 0)) {
    throw new Error("VERIFY_DEPTH_VALUES_INVALID");
  }
  const semanticIds = uint32Values(bytesByPassId["semantic-class-id"]!);
  const allowedSemanticIds = new Set([0, ...semanticTable.map(({ numericId }) => numericId)]);
  if (!semanticIds.every((value) => allowedSemanticIds.has(value)) ||
    !semanticIds.some((value) => value > 0)) {
    throw new Error("VERIFY_SEMANTIC_IDS_INVALID");
  }
  const instanceIds = uint32Values(bytesByPassId["instance-id"]!);
  const allowedInstanceIds = new Set([0, ...instanceTable.map(({ numericId }) => numericId)]);
  if (!instanceIds.every((value) => allowedInstanceIds.has(value)) ||
    !instanceIds.some((value) => value > 0)) {
    throw new Error("VERIFY_INSTANCE_IDS_INVALID");
  }
  const normalValues = finiteFloat32Values(bytesByPassId["world-normal"]!);
  if (!normalValues.every(Number.isFinite)) throw new Error("VERIFY_NORMAL_VALUES_INVALID");
  let nonZeroNormalCount = 0;
  for (let index = 0; index < normalValues.length; index += 3) {
    const length = Math.hypot(
      normalValues[index]!,
      normalValues[index + 1]!,
      normalValues[index + 2]!,
    );
    if (length > 0.5) nonZeroNormalCount += 1;
    if (length > 0.0001 && Math.abs(length - 1) > 0.01) {
      throw new Error("VERIFY_NORMAL_LENGTH_INVALID");
    }
  }
  if (nonZeroNormalCount === 0) throw new Error("VERIFY_NORMAL_VALUES_EMPTY");

  return {
    neutralDimensions,
    nonZeroDepthPixels: depthValues.filter((value) => value > 0).length,
    semanticIds: [...new Set(semanticIds)].sort((left, right) => left - right),
    instanceIds: [...new Set(instanceIds)].sort((left, right) => left - right),
    nonZeroNormalPixels: nonZeroNormalCount,
    passHashesById: Object.fromEntries(
      Object.entries(frame.passesById).map(([passId, pass]) => [passId, pass.contentHash]),
    ),
  };
}

async function main(): Promise<void> {
  const retainedOutput = process.env.WORLDKIT_VERIFY_ARTIFACTS_DIR;
  const rootDirectory = retainedOutput === undefined
    ? await mkdtemp(path.join(tmpdir(), "worldkit-control-capture-verify-"))
    : path.resolve(retainedOutput);
  const shouldCleanup = retainedOutput === undefined;
  try {
    await mkdir(rootDirectory, { recursive: true });
    const reports = [];
    for (const takePath of TAKE_PATHS) {
      const source = JSON.parse(await readFile(takePath, "utf8")) as SimulationTakeV1;
      const probe = {
        ...source,
        id: `${source.id}-conformance-probe`,
        endTickExclusive: 1,
        tracks: source.tracks.map((track) => track.kind === "control-intent"
          ? {
              ...track,
              keyframes: track.keyframes.filter(({ tick }) => tick === 0),
            }
          : {
              ...track,
              keyframes: track.keyframes.filter(({ tick }) => tick === 0),
            }),
        captureSchedule: {
          kind: "explicit-ticks" as const,
          captureTicks: [0],
          renderInterpolation: { kind: "none" as const },
        },
      } satisfies SimulationTakeV1;
      const compiledProbe = compileSimulationTakeV1(probe);
      const takeInputPath = path.join(rootDirectory, `${probe.id}.take.json`);
      const bundleDirectory = path.join(rootDirectory, `${probe.id}.bundle`);
      await writeFile(takeInputPath, `${JSON.stringify(probe, null, 2)}\n`, "utf8");
      const run = await runSimulationTakeFileV1(takeInputPath, {
        worldPath: WORLD_PATH,
        outputPath: bundleDirectory,
        widthPixels: 160,
        heightPixels: 90,
      });
      if (!run.ok) throw new Error(JSON.stringify(run.diagnostics));
      const validation = await validateControlCaptureBundleFileV1(bundleDirectory);
      if (!validation.ok) throw new Error(JSON.stringify(validation.diagnostics));
      const inspection = await inspectControlCaptureBundleFileV1(bundleDirectory);
      if (!inspection.ok) throw new Error(JSON.stringify(inspection.diagnostics));
      reports.push({
        sourceTakeId: source.id,
        sourceTakeHash: compileSimulationTakeV1(source).takeHash,
        probeTakeHash: compiledProbe.takeHash,
        worldPackageRootHash: run.worldPackageRootHash,
        bundleRootHash: run.bundleRootHash,
        bundleDirectory,
        firstFrame: await inspectFirstFrame(bundleDirectory),
      });
    }
    if (reports[0]!.sourceTakeHash === reports[1]!.sourceTakeHash) {
      throw new Error("VERIFY_SOURCE_TAKE_HASHES_NOT_DISTINCT");
    }
    if (reports[0]!.worldPackageRootHash !== reports[1]!.worldPackageRootHash) {
      throw new Error("VERIFY_WORLD_PACKAGE_IDENTITY_MISMATCH");
    }
    process.stdout.write(`${JSON.stringify({
      ok: true,
      kind: "worldkit-control-capture-conformance",
      schemaVersion: 1,
      reports,
    }, null, 2)}\n`);
  } finally {
    if (shouldCleanup) await rm(rootDirectory, { recursive: true, force: true });
  }
}

await main();
