import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  CONTROL_CAPTURE_PASS_IDS_V1,
  CONTROL_CAPTURE_PROFILE_V1,
  compileSimulationTakeV1,
  type CompiledSimulationTakeV1,
  type ControlCapturePassIdV1,
  type Sha256HashV1,
} from "@whitebox-world/control-capture";
import {
  sha256Bytes,
  sha256CanonicalJson,
  stringifyCanonicalJson,
} from "@whitebox-world/protocol";
import type { WorldRuntimeSnapshotV3 } from "@whitebox-world/runtime-contracts";
import { isEqual, isPlainObject } from "lodash-es";

const PASS_FILE_NAMES: Readonly<Record<ControlCapturePassIdV1, string>> = {
  "neutral-color": "neutral-color.png",
  "linear-depth-meters": "linear-depth-meters.bin",
  "semantic-class-id": "semantic-class-id.bin",
  "instance-id": "instance-id.bin",
  "world-normal": "world-normal.bin",
};

const REQUIRED_BUNDLE_FILE_PATHS = [
  "bundle.json",
  "capture-profile-lock.json",
  "diagnostics.json",
  "encoding-profile-lock.json",
  "tables/instances.json",
  "tables/semantic-classes.json",
  "take.json",
  "tracks/actions.ndjson",
  "tracks/cameras.ndjson",
  "tracks/events.ndjson",
  "tracks/inputs.ndjson",
  "tracks/relationships.ndjson",
  "tracks/snapshots.ndjson",
  "validation-report.json",
  "world-package-ref.json",
] as const;

interface WorldPackageIdentityV1 {
  readonly worldPackageRef: string;
  readonly worldPackageRootHash: Sha256HashV1;
  readonly normalizedWorldIrHash: Sha256HashV1;
  readonly executionPlanHash: Sha256HashV1;
}

interface SemanticClassTableEntryV1 {
  readonly numericId: number;
  readonly semanticClassId: string;
}

interface InstanceTableEntryV1 {
  readonly numericId: number;
  readonly entityId: string;
  readonly semanticClassId: string;
}

interface ControlCaptureCameraV1 {
  readonly cameraEntityId: string;
  readonly cameraRigRef: string;
  readonly positionMetersXYZ: readonly [number, number, number];
  readonly forwardXYZ: readonly [number, number, number];
  readonly upXYZ: readonly [number, number, number];
  readonly verticalFovRadians: number;
  readonly nearClipMeters: number;
  readonly farClipMeters: number;
  readonly viewMatrixColumnMajor: readonly number[];
  readonly projectionMatrixColumnMajor: readonly number[];
}

interface ControlCapturePassBytesV1 {
  readonly passId: ControlCapturePassIdV1;
  readonly bytes: Uint8Array;
}

export interface ControlCaptureFrameInputV1 {
  readonly kind: "worldkit-control-capture-frame";
  readonly schemaVersion: 1;
  readonly runtimeSessionId: string;
  readonly captureFrameIndex: number;
  readonly simulationTick: number;
  readonly renderFrameIndex: number;
  readonly renderReadyReceiptId: string;
  readonly widthPixels: number;
  readonly heightPixels: number;
  readonly camera: ControlCaptureCameraV1;
  readonly snapshot: WorldRuntimeSnapshotV3;
  readonly passesById: Readonly<Record<string, ControlCapturePassBytesV1>>;
}

export interface CreateControlCaptureBundleWriterOptionsV1 {
  readonly outputDirectory: string;
  readonly bundleId: string;
  readonly compiledTake: CompiledSimulationTakeV1;
  readonly worldPackageIdentity: WorldPackageIdentityV1;
  readonly runtimeSessionId: string;
  readonly semanticClasses: readonly SemanticClassTableEntryV1[];
  readonly instances: readonly InstanceTableEntryV1[];
}

interface FrameManifestV1 {
  readonly captureFrameIndex: number;
  readonly simulationTick: number;
  readonly renderFrameIndex: number;
  readonly framePath: string;
  readonly frameHash: Sha256HashV1;
}

export interface FinalizedControlCaptureBundleV1 {
  readonly outputDirectory: string;
  readonly bundleRootHash: Sha256HashV1;
  readonly frameCount: number;
}

export interface ControlCaptureBundleByteEvidenceV1 {
  readonly bundleRootHash: Sha256HashV1;
  readonly sizeBytes: number;
  readonly fileHashesByPath: Readonly<Record<string, Sha256HashV1>>;
}

export interface ControlCaptureBundleWriterV1 {
  appendFrame(frame: ControlCaptureFrameInputV1): Promise<void>;
  finalize(): Promise<FinalizedControlCaptureBundleV1>;
  abort(): Promise<void>;
}

export interface ControlCaptureBundleDiagnosticV1 {
  readonly code:
    | "CAPTURE_BUNDLE_JSON_INVALID"
    | "CAPTURE_FILE_HASH_MISMATCH"
    | "CAPTURE_FILE_MISSING"
    | "CAPTURE_FILE_UNDECLARED"
    | "CAPTURE_FRAME_INDEX_INVALID"
    | "CAPTURE_FRAME_DIMENSIONS_INVALID"
    | "CAPTURE_FRAME_HASH_MISMATCH"
    | "CAPTURE_FRAME_TICK_INVALID"
    | "CAPTURE_MANIFEST_HASH_MISMATCH"
    | "CAPTURE_REQUIRED_PASS_MISSING"
    | "CAPTURE_ROOT_HASH_MISMATCH"
    | "CAPTURE_PROFILE_MISMATCH"
    | "CAPTURE_SESSION_MISMATCH"
    | "CAPTURE_TABLE_INVALID"
    | "CAPTURE_TAKE_MISMATCH"
    | "CAPTURE_WORLD_PACKAGE_MISMATCH";
  readonly path: string;
  readonly message: string;
}

export type ControlCaptureBundleValidationResultV1 =
  | {
      readonly ok: true;
      readonly bundleRootHash: Sha256HashV1;
      readonly diagnostics: readonly [];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly ControlCaptureBundleDiagnosticV1[];
    };

export interface ControlCaptureBundleInspectionV1 {
  readonly bundleId: string;
  readonly frameCount: number;
  readonly runtimeSessionId: string;
  readonly worldPackageRootHash: Sha256HashV1;
  readonly takeHash: Sha256HashV1;
  readonly bundleRootHash: Sha256HashV1;
}

function canonicalJsonText(value: unknown): string {
  return `${stringifyCanonicalJson(value)}\n`;
}

async function writeCanonicalJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, canonicalJsonText(value), "utf8");
}

async function writeNdjson(filePath: string, rows: readonly unknown[]): Promise<void> {
  const text = rows.length === 0
    ? ""
    : `${rows.map((row) => stringifyCanonicalJson(row)).join("\n")}\n`;
  await writeFile(filePath, text, "utf8");
}

function passEncoding(passId: ControlCapturePassIdV1): string {
  return CONTROL_CAPTURE_PROFILE_V1.encodingProfile.passesById[passId].encoding;
}

function passMediaType(passId: ControlCapturePassIdV1): string {
  return CONTROL_CAPTURE_PROFILE_V1.encodingProfile.passesById[passId].mediaType;
}

function assertFrameShape(
  frame: ControlCaptureFrameInputV1,
  options: CreateControlCaptureBundleWriterOptionsV1,
  expectedCaptureFrameIndex: number,
  previousSimulationTick: number | undefined,
): void {
  const expectedScheduleEntry =
    options.compiledTake.captureSchedulePlan.entries[expectedCaptureFrameIndex];
  if (expectedScheduleEntry === undefined) {
    throw new Error("CAPTURE_FRAME_INDEX_INVALID: Frame exceeds the compiled Capture Schedule.");
  }
  if (frame.captureFrameIndex !== expectedCaptureFrameIndex) {
    throw new Error("CAPTURE_FRAME_INDEX_INVALID: Capture frame indices must be contiguous from zero.");
  }
  if (!Number.isSafeInteger(frame.simulationTick) || frame.simulationTick < 0 ||
    (previousSimulationTick !== undefined && frame.simulationTick < previousSimulationTick)) {
    throw new Error("CAPTURE_FRAME_TICK_INVALID: Simulation ticks must be non-decreasing safe integers.");
  }
  if (frame.simulationTick !== expectedScheduleEntry.simulationTick) {
    throw new Error("CAPTURE_FRAME_TICK_INVALID: Frame does not match the compiled Capture Schedule.");
  }
  if (frame.runtimeSessionId !== options.runtimeSessionId) {
    throw new Error("CAPTURE_SESSION_MISMATCH: Frame belongs to another Runtime Session.");
  }
  if (frame.snapshot.tick !== frame.simulationTick) {
    throw new Error("CAPTURE_FRAME_TICK_INVALID: Snapshot tick does not match captured simulation tick.");
  }
  if (!Number.isSafeInteger(frame.widthPixels) || frame.widthPixels < 1 ||
    !Number.isSafeInteger(frame.heightPixels) || frame.heightPixels < 1) {
    throw new Error("CAPTURE_FRAME_DIMENSIONS_INVALID: Capture dimensions must be positive integers.");
  }
  const actualPassIds = Object.keys(frame.passesById).sort();
  const requiredPassIds = [...CONTROL_CAPTURE_PASS_IDS_V1].sort();
  if (actualPassIds.join("\n") !== requiredPassIds.join("\n")) {
    throw new Error("CAPTURE_REQUIRED_PASS_MISSING: A frame must contain exactly the five required passes.");
  }
  const pixelCount = frame.widthPixels * frame.heightPixels;
  for (const passId of CONTROL_CAPTURE_PASS_IDS_V1) {
    const pass = frame.passesById[passId]!;
    if (pass.passId !== passId) {
      throw new Error("CAPTURE_PASS_ID_MISMATCH: Pass map key and payload ID differ.");
    }
    const expectedByteLength = passId === "neutral-color"
      ? undefined
      : passId === "world-normal"
        ? pixelCount * 12
        : pixelCount * 4;
    if ((expectedByteLength === undefined && pass.bytes.byteLength === 0) ||
      (expectedByteLength !== undefined && pass.bytes.byteLength !== expectedByteLength)) {
      throw new Error(`CAPTURE_PASS_BYTE_LENGTH_INVALID: ${passId}`);
    }
  }
}

async function listFilesRecursively(directory: string, relative = ""): Promise<readonly string[]> {
  const current = path.join(directory, relative);
  const names = (await readdir(current)).sort();
  const rows: string[] = [];
  for (const name of names) {
    const childRelative = relative === "" ? name : `${relative}/${name}`;
    const stat = await lstat(path.join(directory, childRelative));
    if (stat.isDirectory()) rows.push(...await listFilesRecursively(directory, childRelative));
    else if (stat.isFile()) rows.push(childRelative);
  }
  return rows;
}

export async function collectControlCaptureBundleByteEvidenceV1(
  directory: string,
): Promise<ControlCaptureBundleByteEvidenceV1> {
  const resolvedDirectory = path.resolve(directory);
  const filePaths = await listFilesRecursively(resolvedDirectory);
  const fileRows = await Promise.all(filePaths.map(async (filePath) => {
    const bytes = new Uint8Array(
      await readFile(path.join(resolvedDirectory, filePath)),
    );
    return {
      filePath,
      sizeBytes: bytes.byteLength,
      contentHash: sha256Bytes(bytes) as Sha256HashV1,
    };
  }));
  const fileHashesByPath = Object.fromEntries(
    fileRows
      .filter(({ filePath }) => filePath !== "integrity.json")
      .map(({ filePath, contentHash }) => [filePath, contentHash]),
  );
  return {
    bundleRootHash: sha256CanonicalJson(fileHashesByPath) as Sha256HashV1,
    sizeBytes: fileRows.reduce(
      (totalBytes, { sizeBytes }) => totalBytes + sizeBytes,
      0,
    ),
    fileHashesByPath,
  };
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function createControlCaptureBundleWriterV1(
  options: CreateControlCaptureBundleWriterOptionsV1,
): Promise<ControlCaptureBundleWriterV1> {
  const outputDirectory = path.resolve(options.outputDirectory);
  const parentDirectory = path.dirname(outputDirectory);
  await mkdir(parentDirectory, { recursive: true });
  if (await pathExists(outputDirectory)) {
    throw new Error("CAPTURE_OUTPUT_EXISTS: Refusing to replace an existing bundle.");
  }
  const stagingDirectory = await mkdtemp(`${outputDirectory}.staging-`);
  await mkdir(path.join(stagingDirectory, "frames"), { recursive: true });
  const frameManifests: FrameManifestV1[] = [];
  const snapshotRows: unknown[] = [];
  const cameraRows: unknown[] = [];
  let closed = false;
  let previousSimulationTick: number | undefined;

  const abort = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    await rm(stagingDirectory, { recursive: true, force: true });
  };

  const fail = async (error: unknown): Promise<never> => {
    await abort();
    throw error;
  };

  return {
    async appendFrame(frame): Promise<void> {
      if (closed) throw new Error("CAPTURE_WRITER_CLOSED");
      try {
        assertFrameShape(frame, options, frameManifests.length, previousSimulationTick);
        const frameDirectoryName = String(frame.captureFrameIndex).padStart(6, "0");
        const frameDirectory = path.join(stagingDirectory, "frames", frameDirectoryName);
        await mkdir(frameDirectory, { recursive: false });
        const passesById: Record<string, unknown> = {};
        for (const passId of CONTROL_CAPTURE_PASS_IDS_V1) {
          const fileName = PASS_FILE_NAMES[passId];
          const bytes = frame.passesById[passId]!.bytes;
          await writeFile(path.join(frameDirectory, fileName), bytes);
          passesById[passId] = {
            passId,
            file: fileName,
            mediaType: passMediaType(passId),
            encoding: passEncoding(passId),
            byteLength: bytes.byteLength,
            contentHash: sha256Bytes(bytes),
          };
        }
        const frameBody = {
          kind: frame.kind,
          schemaVersion: frame.schemaVersion,
          runtimeSessionId: frame.runtimeSessionId,
          worldPackageRootHash: options.worldPackageIdentity.worldPackageRootHash,
          takeHash: options.compiledTake.takeHash,
          captureFrameIndex: frame.captureFrameIndex,
          simulationTick: frame.simulationTick,
          renderFrameIndex: frame.renderFrameIndex,
          renderReadyReceiptId: frame.renderReadyReceiptId,
          widthPixels: frame.widthPixels,
          heightPixels: frame.heightPixels,
          camera: frame.camera,
          passesById,
        };
        const frameHash = sha256CanonicalJson(frameBody) as Sha256HashV1;
        await writeCanonicalJson(path.join(frameDirectory, "frame.json"), {
          ...frameBody,
          frameHash,
        });
        frameManifests.push({
          captureFrameIndex: frame.captureFrameIndex,
          simulationTick: frame.simulationTick,
          renderFrameIndex: frame.renderFrameIndex,
          framePath: `frames/${frameDirectoryName}/frame.json`,
          frameHash,
        });
        snapshotRows.push({
          captureFrameIndex: frame.captureFrameIndex,
          simulationTick: frame.simulationTick,
          snapshot: frame.snapshot,
        });
        cameraRows.push({
          captureFrameIndex: frame.captureFrameIndex,
          simulationTick: frame.simulationTick,
          renderFrameIndex: frame.renderFrameIndex,
          renderReadyReceiptId: frame.renderReadyReceiptId,
          camera: frame.camera,
        });
        previousSimulationTick = frame.simulationTick;
      } catch (error) {
        return fail(error);
      }
    },

    async finalize(): Promise<FinalizedControlCaptureBundleV1> {
      if (closed) throw new Error("CAPTURE_WRITER_CLOSED");
      try {
        if (
          frameManifests.length !==
          options.compiledTake.captureSchedulePlan.entries.length
        ) {
          throw new Error(
            "CAPTURE_SCHEDULE_INCOMPLETE: Every compiled Capture Schedule entry is required.",
          );
        }
        await mkdir(path.join(stagingDirectory, "tables"), { recursive: false });
        await mkdir(path.join(stagingDirectory, "tracks"), { recursive: false });
        await writeCanonicalJson(path.join(stagingDirectory, "take.json"), options.compiledTake.take);
        await writeCanonicalJson(path.join(stagingDirectory, "world-package-ref.json"), options.worldPackageIdentity);
        await writeCanonicalJson(path.join(stagingDirectory, "capture-profile-lock.json"), {
          resourceRef: CONTROL_CAPTURE_PROFILE_V1.resourceRef,
          contentHash: sha256CanonicalJson({
            kind: CONTROL_CAPTURE_PROFILE_V1.kind,
            schemaVersion: CONTROL_CAPTURE_PROFILE_V1.schemaVersion,
            resourceRef: CONTROL_CAPTURE_PROFILE_V1.resourceRef,
            requiredPassIds: CONTROL_CAPTURE_PROFILE_V1.requiredPassIds,
          }),
          requiredPassIds: CONTROL_CAPTURE_PROFILE_V1.requiredPassIds,
        });
        await writeCanonicalJson(path.join(stagingDirectory, "encoding-profile-lock.json"), CONTROL_CAPTURE_PROFILE_V1.encodingProfile);
        await writeCanonicalJson(path.join(stagingDirectory, "tables/semantic-classes.json"), options.semanticClasses);
        await writeCanonicalJson(path.join(stagingDirectory, "tables/instances.json"), options.instances);
        await writeNdjson(path.join(stagingDirectory, "tracks/inputs.ndjson"), []);
        await writeNdjson(path.join(stagingDirectory, "tracks/actions.ndjson"), []);
        await writeNdjson(path.join(stagingDirectory, "tracks/events.ndjson"), []);
        await writeNdjson(path.join(stagingDirectory, "tracks/relationships.ndjson"), []);
        await writeNdjson(path.join(stagingDirectory, "tracks/snapshots.ndjson"), snapshotRows);
        await writeNdjson(path.join(stagingDirectory, "tracks/cameras.ndjson"), cameraRows);
        await writeCanonicalJson(path.join(stagingDirectory, "diagnostics.json"), []);
        await writeCanonicalJson(path.join(stagingDirectory, "validation-report.json"), {
          kind: "worldkit-control-capture-validation-report",
          schemaVersion: 1,
          pass: true,
          diagnosticCount: 0,
          checkedFrameCount: frameManifests.length,
        });
        const manifestBody = {
          kind: "worldkit-control-capture-bundle",
          schemaVersion: 1,
          id: options.bundleId,
          worldPackageRef: options.worldPackageIdentity.worldPackageRef,
          worldPackageRootHash: options.worldPackageIdentity.worldPackageRootHash,
          normalizedWorldIrHash: options.worldPackageIdentity.normalizedWorldIrHash,
          executionPlanHash: options.worldPackageIdentity.executionPlanHash,
          takeId: options.compiledTake.take.id,
          takeHash: options.compiledTake.takeHash,
          runtimeSessionId: options.runtimeSessionId,
          captureProfileRef: options.compiledTake.take.captureProfileRef,
          captureEncodingProfileRef: options.compiledTake.take.captureEncodingProfileRef,
          frameCount: frameManifests.length,
          frames: frameManifests,
        };
        await writeCanonicalJson(path.join(stagingDirectory, "bundle.json"), {
          ...manifestBody,
          bundleManifestHash: sha256CanonicalJson(manifestBody),
        });
        const { bundleRootHash, fileHashesByPath } =
          await collectControlCaptureBundleByteEvidenceV1(stagingDirectory);
        await writeCanonicalJson(path.join(stagingDirectory, "integrity.json"), {
          kind: "worldkit-control-capture-integrity",
          schemaVersion: 1,
          bundleRootHash,
          fileHashesByPath,
        });
        await rename(stagingDirectory, outputDirectory);
        closed = true;
        return { outputDirectory, bundleRootHash, frameCount: frameManifests.length };
      } catch (error) {
        return fail(error);
      }
    },
    abort,
  };
}

function addValidationDiagnostic(
  diagnostics: ControlCaptureBundleDiagnosticV1[],
  code: ControlCaptureBundleDiagnosticV1["code"],
  filePath: string,
  message: string,
): void {
  diagnostics.push({ code, path: filePath, message });
}

async function readJsonRecord(
  directory: string,
  filePath: string,
  diagnostics: ControlCaptureBundleDiagnosticV1[],
): Promise<Record<string, unknown> | undefined> {
  try {
    const value: unknown = JSON.parse(await readFile(path.join(directory, filePath), "utf8"));
    if (!isPlainObject(value)) throw new TypeError("not an object");
    return value as Record<string, unknown>;
  } catch {
    addValidationDiagnostic(diagnostics, "CAPTURE_BUNDLE_JSON_INVALID", filePath, "Required JSON object is missing or invalid.");
    return undefined;
  }
}

async function readJsonArray(
  directory: string,
  filePath: string,
  diagnostics: ControlCaptureBundleDiagnosticV1[],
): Promise<readonly unknown[] | undefined> {
  try {
    const value: unknown = JSON.parse(await readFile(path.join(directory, filePath), "utf8"));
    if (!Array.isArray(value)) throw new TypeError("not an array");
    return value;
  } catch {
    addValidationDiagnostic(
      diagnostics,
      "CAPTURE_BUNDLE_JSON_INVALID",
      filePath,
      "Required JSON array is missing or invalid.",
    );
    return undefined;
  }
}

function validateIdTable(
  rows: readonly unknown[] | undefined,
  filePath: string,
  requiredStringFields: readonly string[],
  diagnostics: ControlCaptureBundleDiagnosticV1[],
): ReadonlySet<number> {
  const ids = new Set<number>();
  if (rows === undefined) return ids;
  rows.forEach((row, index) => {
    if (!isPlainObject(row)) {
      addValidationDiagnostic(
        diagnostics,
        "CAPTURE_TABLE_INVALID",
        `${filePath}/${index}`,
        "ID table entry must be an object.",
      );
      return;
    }
    const record = row as Record<string, unknown>;
    const numericId = record.numericId;
    if (!Number.isSafeInteger(numericId) || numericId !== index + 1 || ids.has(numericId as number)) {
      addValidationDiagnostic(
        diagnostics,
        "CAPTURE_TABLE_INVALID",
        `${filePath}/${index}/numericId`,
        "ID table values must be unique contiguous positive integers in canonical order.",
      );
    } else {
      ids.add(numericId as number);
    }
    for (const field of requiredStringFields) {
      if (typeof record[field] !== "string" || record[field] === "") {
        addValidationDiagnostic(
          diagnostics,
          "CAPTURE_TABLE_INVALID",
          `${filePath}/${index}/${field}`,
          `ID table field '${field}' must be a non-empty string.`,
        );
      }
    }
  });
  return ids;
}

function uint32ValuesFromBytes(bytes: Uint8Array): readonly number[] {
  if (bytes.byteLength % 4 !== 0) return [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: bytes.byteLength / 4 }, (_, index) =>
    view.getUint32(index * 4, true)
  );
}

export async function validateControlCaptureBundleV1(
  directory: string,
): Promise<ControlCaptureBundleValidationResultV1> {
  const resolvedDirectory = path.resolve(directory);
  const diagnostics: ControlCaptureBundleDiagnosticV1[] = [];
  const integrity = await readJsonRecord(resolvedDirectory, "integrity.json", diagnostics);
  const manifest = await readJsonRecord(resolvedDirectory, "bundle.json", diagnostics);
  const take = await readJsonRecord(resolvedDirectory, "take.json", diagnostics);
  const worldPackageIdentity = await readJsonRecord(
    resolvedDirectory,
    "world-package-ref.json",
    diagnostics,
  );
  const captureProfileLock = await readJsonRecord(
    resolvedDirectory,
    "capture-profile-lock.json",
    diagnostics,
  );
  const encodingProfileLock = await readJsonRecord(
    resolvedDirectory,
    "encoding-profile-lock.json",
    diagnostics,
  );
  const semanticClasses = await readJsonArray(
    resolvedDirectory,
    "tables/semantic-classes.json",
    diagnostics,
  );
  const instances = await readJsonArray(
    resolvedDirectory,
    "tables/instances.json",
    diagnostics,
  );
  if (integrity === undefined || manifest === undefined || take === undefined) {
    return { ok: false, diagnostics };
  }
  let compiledTake: CompiledSimulationTakeV1 | undefined;
  try {
    compiledTake = compileSimulationTakeV1(take);
  } catch {
    addValidationDiagnostic(
      diagnostics,
      "CAPTURE_TAKE_MISMATCH",
      "take.json",
      "Simulation Take is invalid.",
    );
  }

  const declaredHashes = isPlainObject(integrity.fileHashesByPath)
    ? integrity.fileHashesByPath as Record<string, unknown>
    : {};
  const declaredFilePaths = Object.keys(declaredHashes).sort();
  const byteEvidence = await collectControlCaptureBundleByteEvidenceV1(
    resolvedDirectory,
  );
  const actualFilePaths = Object.keys(byteEvidence.fileHashesByPath).sort();
  for (const filePath of REQUIRED_BUNDLE_FILE_PATHS) {
    if (!actualFilePaths.includes(filePath)) {
      addValidationDiagnostic(
        diagnostics,
        "CAPTURE_FILE_MISSING",
        filePath,
        "Required Control Capture Bundle file is missing.",
      );
    }
  }
  for (const filePath of declaredFilePaths) {
    if (!actualFilePaths.includes(filePath)) {
      addValidationDiagnostic(diagnostics, "CAPTURE_FILE_MISSING", filePath, "Declared file is missing.");
      continue;
    }
    const actualHash = byteEvidence.fileHashesByPath[filePath];
    if (declaredHashes[filePath] !== actualHash) {
      addValidationDiagnostic(diagnostics, "CAPTURE_FILE_HASH_MISMATCH", filePath, "File bytes do not match the declared hash.");
    }
  }
  for (const filePath of actualFilePaths) {
    if (!declaredFilePaths.includes(filePath)) {
      addValidationDiagnostic(diagnostics, "CAPTURE_FILE_UNDECLARED", filePath, "File is not covered by bundle integrity.");
    }
  }
  const expectedRootHash = sha256CanonicalJson(declaredHashes);
  if (integrity.bundleRootHash !== expectedRootHash) {
    addValidationDiagnostic(diagnostics, "CAPTURE_ROOT_HASH_MISMATCH", "integrity.json", "Bundle root hash does not match its file hash map.");
  }

  if (compiledTake !== undefined) {
    if (
      manifest.takeId !== compiledTake.take.id ||
      manifest.takeHash !== compiledTake.takeHash
    ) {
      addValidationDiagnostic(
        diagnostics,
        "CAPTURE_TAKE_MISMATCH",
        "bundle.json",
        "Bundle identity does not match the validated Simulation Take.",
      );
    }
    if (
      manifest.worldPackageRef !== compiledTake.take.worldPackageRef ||
      manifest.worldPackageRootHash !== compiledTake.take.worldPackageRootHash
    ) {
      addValidationDiagnostic(
        diagnostics,
        "CAPTURE_WORLD_PACKAGE_MISMATCH",
        "bundle.json",
        "Bundle World Package identity does not match the Simulation Take.",
      );
    }
    if (
      manifest.captureProfileRef !== compiledTake.take.captureProfileRef ||
      manifest.captureEncodingProfileRef !== compiledTake.take.captureEncodingProfileRef
    ) {
      addValidationDiagnostic(
        diagnostics,
        "CAPTURE_PROFILE_MISMATCH",
        "bundle.json",
        "Bundle capture profiles do not match the Simulation Take.",
      );
    }
  }
  if (
    worldPackageIdentity !== undefined &&
    (
      worldPackageIdentity.worldPackageRef !== manifest.worldPackageRef ||
      worldPackageIdentity.worldPackageRootHash !== manifest.worldPackageRootHash ||
      worldPackageIdentity.normalizedWorldIrHash !== manifest.normalizedWorldIrHash ||
      worldPackageIdentity.executionPlanHash !== manifest.executionPlanHash
    )
  ) {
    addValidationDiagnostic(
      diagnostics,
      "CAPTURE_WORLD_PACKAGE_MISMATCH",
      "world-package-ref.json",
      "World Package identity file does not match the Bundle manifest.",
    );
  }
  if (
    captureProfileLock !== undefined &&
    (
      captureProfileLock.resourceRef !== CONTROL_CAPTURE_PROFILE_V1.resourceRef ||
      !isEqual(captureProfileLock.requiredPassIds, CONTROL_CAPTURE_PROFILE_V1.requiredPassIds)
    )
  ) {
    addValidationDiagnostic(
      diagnostics,
      "CAPTURE_PROFILE_MISMATCH",
      "capture-profile-lock.json",
      "Capture Profile lock does not match the required V1 pass set.",
    );
  }
  if (
    encodingProfileLock !== undefined &&
    !isEqual(encodingProfileLock, CONTROL_CAPTURE_PROFILE_V1.encodingProfile)
  ) {
    addValidationDiagnostic(
      diagnostics,
      "CAPTURE_PROFILE_MISMATCH",
      "encoding-profile-lock.json",
      "Capture Encoding Profile lock does not match web-v1.",
    );
  }
  const semanticNumericIds = validateIdTable(
    semanticClasses,
    "tables/semantic-classes.json",
    ["semanticClassId"],
    diagnostics,
  );
  const instanceNumericIds = validateIdTable(
    instances,
    "tables/instances.json",
    ["entityId", "semanticClassId"],
    diagnostics,
  );
  const semanticClassIds = new Set(
    (semanticClasses ?? []).flatMap((row) => {
      if (!isPlainObject(row)) return [];
      const record = row as Record<string, unknown>;
      return typeof record.semanticClassId === "string" ? [record.semanticClassId] : [];
    }),
  );
  (instances ?? []).forEach((row, index) => {
    if (!isPlainObject(row)) return;
    const record = row as Record<string, unknown>;
    if (
      typeof record.semanticClassId === "string" &&
      !semanticClassIds.has(record.semanticClassId)
    ) {
      addValidationDiagnostic(
        diagnostics,
        "CAPTURE_TABLE_INVALID",
        `tables/instances.json/${index}/semanticClassId`,
        "Instance table references an unknown Semantic Class ID.",
      );
    }
  });

  const { bundleManifestHash, ...manifestBody } = manifest;
  if (bundleManifestHash !== sha256CanonicalJson(manifestBody)) {
    addValidationDiagnostic(diagnostics, "CAPTURE_MANIFEST_HASH_MISMATCH", "bundle.json", "Bundle manifest hash is invalid.");
  }
  const frames = Array.isArray(manifest.frames) ? manifest.frames : [];
  if (
    compiledTake !== undefined &&
    frames.length !== compiledTake.captureSchedulePlan.entries.length
  ) {
    addValidationDiagnostic(
      diagnostics,
      "CAPTURE_FRAME_INDEX_INVALID",
      "bundle.json/frameCount",
      "Frame count does not match the compiled Capture Schedule.",
    );
  }
  let previousTick: number | undefined;
  for (let index = 0; index < frames.length; index += 1) {
    const frameEntry = frames[index];
    if (!isPlainObject(frameEntry)) {
      addValidationDiagnostic(diagnostics, "CAPTURE_BUNDLE_JSON_INVALID", `bundle.json/frames/${index}`, "Frame manifest entry is invalid.");
      continue;
    }
    const captureFrameIndex = (frameEntry as Record<string, unknown>).captureFrameIndex;
    const simulationTick = (frameEntry as Record<string, unknown>).simulationTick;
    if (captureFrameIndex !== index) {
      addValidationDiagnostic(diagnostics, "CAPTURE_FRAME_INDEX_INVALID", `bundle.json/frames/${index}`, "Capture frame indices are not contiguous.");
    }
    if (!Number.isSafeInteger(simulationTick) ||
      (previousTick !== undefined && (simulationTick as number) < previousTick)) {
      addValidationDiagnostic(diagnostics, "CAPTURE_FRAME_TICK_INVALID", `bundle.json/frames/${index}`, "Simulation ticks are not non-decreasing.");
    }
    if (Number.isSafeInteger(simulationTick)) previousTick = simulationTick as number;
    const expectedScheduleEntry = compiledTake?.captureSchedulePlan.entries[index];
    if (
      expectedScheduleEntry !== undefined &&
      simulationTick !== expectedScheduleEntry.simulationTick
    ) {
      addValidationDiagnostic(
        diagnostics,
        "CAPTURE_FRAME_TICK_INVALID",
        `bundle.json/frames/${index}`,
        "Frame tick does not match the compiled Capture Schedule.",
      );
    }
    const frameDirectoryName = String(index).padStart(6, "0");
    for (const passId of CONTROL_CAPTURE_PASS_IDS_V1) {
      const passPath = `frames/${frameDirectoryName}/${PASS_FILE_NAMES[passId]}`;
      if (!actualFilePaths.includes(passPath)) {
        addValidationDiagnostic(diagnostics, "CAPTURE_REQUIRED_PASS_MISSING", passPath, `Required pass '${passId}' is missing.`);
      }
    }
    const framePath = `frames/${frameDirectoryName}/frame.json`;
    const frame = actualFilePaths.includes(framePath)
      ? await readJsonRecord(resolvedDirectory, framePath, diagnostics)
      : undefined;
    if (frame !== undefined && frame.runtimeSessionId !== manifest.runtimeSessionId) {
      addValidationDiagnostic(diagnostics, "CAPTURE_SESSION_MISMATCH", framePath, "Frame belongs to another Runtime Session.");
    }
    if (frame !== undefined && frame.worldPackageRootHash !== manifest.worldPackageRootHash) {
      addValidationDiagnostic(diagnostics, "CAPTURE_WORLD_PACKAGE_MISMATCH", framePath, "Frame belongs to another World Package.");
    }
    if (frame !== undefined && frame.takeHash !== manifest.takeHash) {
      addValidationDiagnostic(diagnostics, "CAPTURE_TAKE_MISMATCH", framePath, "Frame belongs to another Simulation Take.");
    }
    if (frame !== undefined) {
      const widthPixels = frame.widthPixels;
      const heightPixels = frame.heightPixels;
      const validDimensions = Number.isSafeInteger(widthPixels) &&
        Number.isSafeInteger(heightPixels) &&
        (widthPixels as number) > 0 &&
        (heightPixels as number) > 0;
      if (!validDimensions) {
        addValidationDiagnostic(
          diagnostics,
          "CAPTURE_FRAME_DIMENSIONS_INVALID",
          framePath,
          "Frame dimensions must be positive safe integers.",
        );
      } else {
        const pixelCount = (widthPixels as number) * (heightPixels as number);
        for (const [passId, allowedIds] of [
          ["semantic-class-id", semanticNumericIds],
          ["instance-id", instanceNumericIds],
        ] as const) {
          const passPath = `frames/${frameDirectoryName}/${PASS_FILE_NAMES[passId]}`;
          if (!actualFilePaths.includes(passPath)) continue;
          const bytes = new Uint8Array(await readFile(path.join(resolvedDirectory, passPath)));
          const values = uint32ValuesFromBytes(bytes);
          if (
            values.length !== pixelCount ||
            values.some((value) => value !== 0 && !allowedIds.has(value))
          ) {
            addValidationDiagnostic(
              diagnostics,
              "CAPTURE_TABLE_INVALID",
              passPath,
              `Pass '${passId}' contains an ID outside its locked table or has the wrong pixel count.`,
            );
          }
        }
      }
      const { frameHash, ...frameBody } = frame;
      const expectedFrameHash = sha256CanonicalJson(frameBody);
      const manifestFrameHash = (frameEntry as Record<string, unknown>).frameHash;
      if (frameHash !== expectedFrameHash || manifestFrameHash !== expectedFrameHash) {
        addValidationDiagnostic(diagnostics, "CAPTURE_FRAME_HASH_MISMATCH", framePath, "Frame metadata hash is invalid.");
      }
    }
  }
  if (manifest.frameCount !== frames.length) {
    addValidationDiagnostic(diagnostics, "CAPTURE_FRAME_INDEX_INVALID", "bundle.json/frameCount", "Frame count does not match frame manifests.");
  }
  if (diagnostics.length > 0 || typeof integrity.bundleRootHash !== "string") {
    return { ok: false, diagnostics };
  }
  return {
    ok: true,
    diagnostics: [],
    bundleRootHash: integrity.bundleRootHash as Sha256HashV1,
  };
}

export async function inspectControlCaptureBundleV1(
  directory: string,
): Promise<ControlCaptureBundleInspectionV1> {
  const validation = await validateControlCaptureBundleV1(directory);
  if (!validation.ok) {
    throw new Error("CAPTURE_BUNDLE_INVALID: Inspect requires a valid bundle.");
  }
  const manifest = JSON.parse(await readFile(path.join(directory, "bundle.json"), "utf8")) as Record<string, unknown>;
  return {
    bundleId: manifest.id as string,
    frameCount: manifest.frameCount as number,
    runtimeSessionId: manifest.runtimeSessionId as string,
    worldPackageRootHash: manifest.worldPackageRootHash as Sha256HashV1,
    takeHash: manifest.takeHash as Sha256HashV1,
    bundleRootHash: validation.bundleRootHash,
  };
}
