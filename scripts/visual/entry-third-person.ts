import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type {
  FormalOpeningObservationV1,
} from "@whitebox-world/runtime-contracts";
import {
  canonicalJsonBytes,
  sha256CanonicalJson,
  stringifyCanonicalJson,
  type Sha256HashV1,
} from "@whitebox-world/protocol";
import sharp from "sharp";

export const ENTRY_THIRD_PERSON_PRIMARY_SUBJECT_COLOR_V1 = "#E85D5D";
export const ENTRY_THIRD_PERSON_MAXIMUM_CENTER_ERROR_RATIO_V1 = 0.015;
export const ENTRY_THIRD_PERSON_MAXIMUM_REAR_ALIGNMENT_DEGREES_V1 = 1;
export const ENTRY_THIRD_PERSON_MAXIMUM_VIEW_YAW_OFFSET_RADIANS_V1 = 1e-6;

const ENTRY_THIRD_PERSON_DIAGNOSTIC_CODES_V1 = Object.freeze([
  "ENTRY_SUBJECT_MASK_INVALID",
  "ENTRY_SUBJECT_NOT_CENTERED",
  "ENTRY_RUNTIME_CAMERA_INVALID",
  "ENTRY_CAMERA_TARGET_MISMATCH",
  "ENTRY_CAMERA_NOT_DIRECTLY_BEHIND",
  "ENTRY_CAMERA_YAW_OFFSET",
] as const);

export type EntryThirdPersonDiagnosticCodeV1 =
  (typeof ENTRY_THIRD_PERSON_DIAGNOSTIC_CODES_V1)[number];

export interface EntryThirdPersonDiagnosticV1 {
  readonly code: EntryThirdPersonDiagnosticCodeV1;
  readonly message: string;
}

export interface EntryThirdPersonImageMeasurementsV1 {
  readonly widthPixels: number;
  readonly heightPixels: number;
  readonly subjectMaskPixelCount: number;
  readonly subjectCenterXRatio: number;
  readonly subjectCenterErrorRatio: number;
  readonly maximumCenterErrorRatio: number;
}

export interface EntryThirdPersonRuntimeMeasurementsV1 {
  readonly controlledEntityId: string;
  readonly cameraTargetEntityId: string;
  readonly cameraTargetsControlledSubject: boolean;
  readonly rearAlignmentDegrees: number;
  readonly maximumRearAlignmentDegrees: number;
  readonly viewYawOffsetRadians: number;
  readonly maximumViewYawOffsetRadians: number;
}

export interface EntryThirdPersonValidationResultV1 {
  readonly kind: "worldkit-entry-third-person-validation";
  readonly schemaVersion: 1;
  readonly status: "passed" | "failed";
  readonly imageMeasurements:
    | EntryThirdPersonImageMeasurementsV1
    | Readonly<Record<string, never>>;
  readonly runtimeMeasurements: EntryThirdPersonRuntimeMeasurementsV1 | null;
  readonly diagnostics: readonly EntryThirdPersonDiagnosticV1[];
}

function assertClosedRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  const source = record(value);
  if (source === undefined) throw new TypeError(`${label} must be an object.`);
  const actualKeys = Object.keys(source).sort();
  const expectedKeys = [...keys].sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) throw new TypeError(`${label} contains unknown or missing fields.`);
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite.`);
  }
  return value;
}

export function parseEntryThirdPersonValidationResultV1(
  value: unknown,
): EntryThirdPersonValidationResultV1 {
  assertClosedRecord(value, [
    "kind",
    "schemaVersion",
    "status",
    "imageMeasurements",
    "runtimeMeasurements",
    "diagnostics",
  ], "Entry validation result");
  if (
    value.kind !== "worldkit-entry-third-person-validation" ||
    value.schemaVersion !== 1 ||
    (value.status !== "passed" && value.status !== "failed")
  ) throw new TypeError("Entry validation result discriminator is invalid.");

  const image = record(value.imageMeasurements);
  if (image === undefined) {
    throw new TypeError("Entry validation image measurements must be an object.");
  }
  const imageKeys = Object.keys(image).sort();
  if (imageKeys.length !== 0) {
    const expected = [
      "heightPixels",
      "maximumCenterErrorRatio",
      "subjectMaskPixelCount",
      "subjectCenterErrorRatio",
      "subjectCenterXRatio",
      "widthPixels",
    ].sort();
    if (
      imageKeys.length !== expected.length ||
      imageKeys.some((key, index) => key !== expected[index])
    ) throw new TypeError("Entry validation image measurements are invalid.");
    for (const key of expected) finiteNumber(image[key], `imageMeasurements.${key}`);
  }

  if (value.runtimeMeasurements !== null) {
    assertClosedRecord(value.runtimeMeasurements, [
      "controlledEntityId",
      "cameraTargetEntityId",
      "cameraTargetsControlledSubject",
      "rearAlignmentDegrees",
      "maximumRearAlignmentDegrees",
      "viewYawOffsetRadians",
      "maximumViewYawOffsetRadians",
    ], "Entry validation runtime measurements");
    if (
      typeof value.runtimeMeasurements.controlledEntityId !== "string" ||
      value.runtimeMeasurements.controlledEntityId.length === 0 ||
      typeof value.runtimeMeasurements.cameraTargetEntityId !== "string" ||
      value.runtimeMeasurements.cameraTargetEntityId.length === 0 ||
      typeof value.runtimeMeasurements.cameraTargetsControlledSubject !== "boolean"
    ) throw new TypeError("Entry validation runtime identity is invalid.");
    for (const key of [
      "rearAlignmentDegrees",
      "maximumRearAlignmentDegrees",
      "viewYawOffsetRadians",
      "maximumViewYawOffsetRadians",
    ] as const) {
      finiteNumber(value.runtimeMeasurements[key], `runtimeMeasurements.${key}`);
    }
  }

  if (!Array.isArray(value.diagnostics)) {
    throw new TypeError("Entry validation diagnostics must be an array.");
  }
  const diagnostics = value.diagnostics.map((diagnostic, index) => {
    assertClosedRecord(diagnostic, ["code", "message"], `diagnostics[${index}]`);
    if (
      !ENTRY_THIRD_PERSON_DIAGNOSTIC_CODES_V1.includes(
        diagnostic.code as EntryThirdPersonDiagnosticCodeV1,
      ) ||
      typeof diagnostic.message !== "string" ||
      diagnostic.message.length === 0
    ) throw new TypeError(`diagnostics[${index}] is invalid.`);
    return Object.freeze({
      code: diagnostic.code as EntryThirdPersonDiagnosticCodeV1,
      message: diagnostic.message,
    });
  });
  if (
    (value.status === "passed" && diagnostics.length !== 0) ||
    (value.status === "failed" && diagnostics.length === 0)
  ) throw new TypeError("Entry validation status and diagnostics disagree.");

  return Object.freeze({
    kind: value.kind,
    schemaVersion: value.schemaVersion,
    status: value.status,
    imageMeasurements: Object.freeze({ ...image }) as
      EntryThirdPersonValidationResultV1["imageMeasurements"],
    runtimeMeasurements: value.runtimeMeasurements === null
      ? null
      : Object.freeze({ ...value.runtimeMeasurements }) as unknown as
        EntryThirdPersonRuntimeMeasurementsV1,
    diagnostics: Object.freeze(diagnostics),
  });
}

export function entryThirdPersonValidationResultCanonicalBytesV1(
  value: EntryThirdPersonValidationResultV1,
): Uint8Array {
  return canonicalJsonBytes(parseEntryThirdPersonValidationResultV1(value));
}

export function hashEntryThirdPersonValidationResultV1(
  value: EntryThirdPersonValidationResultV1,
): Sha256HashV1 {
  return sha256CanonicalJson(
    parseEntryThirdPersonValidationResultV1(value),
  ) as Sha256HashV1;
}

interface EntryThirdPersonValidationMeasurementsInputV1 {
  readonly imageMeasurements?: EntryThirdPersonImageMeasurementsV1;
  readonly imageError?: unknown;
  readonly runtimeSnapshot?: unknown;
  readonly runtimeError?: unknown;
  readonly formalControlledSubjectEntityId?: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function finiteTuple(value: unknown, length: number): readonly number[] | undefined {
  if (
    !Array.isArray(value) || value.length !== length ||
    !value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  ) return undefined;
  return value as number[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hueDistanceDegrees(left: number, right: number): number {
  const distance = Math.abs(left - right) % 360;
  return Math.min(distance, 360 - distance);
}

function rgbHsv(red: number, green: number, blue: number): readonly [number, number, number] {
  const normalized = [red / 255, green / 255, blue / 255] as const;
  const maximum = Math.max(...normalized);
  const minimum = Math.min(...normalized);
  const delta = maximum - minimum;
  let hue = 0;
  if (delta > 0) {
    if (maximum === normalized[0]) {
      hue = 60 * (((normalized[1] - normalized[2]) / delta) % 6);
    } else if (maximum === normalized[1]) {
      hue = 60 * ((normalized[2] - normalized[0]) / delta + 2);
    } else {
      hue = 60 * ((normalized[0] - normalized[1]) / delta + 4);
    }
  }
  if (hue < 0) hue += 360;
  const saturation = maximum === 0 ? 0 : delta / maximum;
  return [hue, saturation, maximum];
}

function roundHalfEven(value: number): number {
  const lower = Math.floor(value);
  const fraction = value - lower;
  if (fraction < 0.5) return lower;
  if (fraction > 0.5) return lower + 1;
  return lower % 2 === 0 ? lower : lower + 1;
}

export async function measureEntryThirdPersonSubjectMaskV1(
  imageBytes: Uint8Array,
): Promise<EntryThirdPersonImageMeasurementsV1> {
  const decoded = await sharp(Buffer.from(imageBytes), { failOn: "error" })
    .toColourspace("srgb")
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = decoded.info;
  if (width < 32 || height < 32) {
    throw new TypeError("Entry image is too small to validate.");
  }
  if (channels !== 3 || decoded.data.byteLength !== width * height * 3) {
    throw new TypeError("Entry image did not decode to three-channel sRGB.");
  }
  const [targetHue, targetSaturation] = rgbHsv(0xE8, 0x5D, 0x5D);
  let xTotal = 0;
  let pixelCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels;
      const [hue, saturation, brightness] = rgbHsv(
        decoded.data[offset]!,
        decoded.data[offset + 1]!,
        decoded.data[offset + 2]!,
      );
      if (
        hueDistanceDegrees(hue, targetHue) <= 12 &&
        saturation >= Math.max(0.3, targetSaturation * 0.45) &&
        brightness >= 0.2
      ) {
        xTotal += x;
        pixelCount += 1;
      }
    }
  }
  const minimumPixels = Math.max(64, roundHalfEven(width * height * 0.001));
  if (pixelCount < minimumPixels) {
    throw new TypeError(
      `Primary-subject identity mask is missing or too small (${pixelCount} pixels).`,
    );
  }
  const subjectCenterXRatio = (xTotal / pixelCount + 0.5) / width;
  return Object.freeze({
    widthPixels: width,
    heightPixels: height,
    subjectMaskPixelCount: pixelCount,
    subjectCenterXRatio,
    subjectCenterErrorRatio: Math.abs(subjectCenterXRatio - 0.5),
    maximumCenterErrorRatio:
      ENTRY_THIRD_PERSON_MAXIMUM_CENTER_ERROR_RATIO_V1,
  });
}

export function measureEntryThirdPersonRuntimeRearAlignmentV1(
  snapshot: unknown,
): EntryThirdPersonRuntimeMeasurementsV1 {
  const snapshotRecord = record(snapshot);
  if (
    snapshotRecord?.kind !== "worldkit-runtime-snapshot" ||
    snapshotRecord.schemaVersion !== 4
  ) {
    throw new TypeError(
      "Runtime Snapshot must use the current WorldKit Snapshot V4 contract.",
    );
  }
  const world = record(snapshotRecord.world) ?? {};
  const inspection = record(world.gameplayInspection) ?? {};
  const relationships = record(inspection.relationshipStatesById);
  const possessionEntries = relationships === undefined
    ? []
    : Object.entries(relationships).filter(([, candidate]) => {
        const row = record(candidate);
        return row?.type === "possessedBy";
      });
  if (possessionEntries.length !== 1) {
    throw new TypeError(
      "Runtime Snapshot must contain exactly one active possession binding.",
    );
  }
  const [possessionId, possessionValue] = possessionEntries[0]!;
  assertClosedRecord(possessionValue, [
    "id",
    "type",
    "schemaVersion",
    "controlledEntityId",
    "controllerEntityId",
    "establishedSimulationTick",
  ], "Runtime Snapshot possession binding");
  if (
    possessionValue.id !== possessionId ||
    possessionValue.type !== "possessedBy" ||
    possessionValue.schemaVersion !== 1 ||
    typeof possessionValue.controlledEntityId !== "string" ||
    possessionValue.controlledEntityId.length === 0 ||
    typeof possessionValue.controllerEntityId !== "string" ||
    possessionValue.controllerEntityId.length === 0 ||
    !Number.isSafeInteger(possessionValue.establishedSimulationTick) ||
    (possessionValue.establishedSimulationTick as number) < 0
  ) {
    throw new TypeError("Runtime Snapshot possession binding is invalid.");
  }
  const controlledId = possessionValue.controlledEntityId;
  const view = record(snapshotRecord.view) ?? {};
  const camera = record(view.camera) ?? {};
  if (camera.mode !== "tracking") {
    throw new TypeError(
      "Runtime Snapshot entry camera must be tracking the controlled Subject.",
    );
  }
  const states = record(world.subjectStatesByEntityId);
  const state = states === undefined ? undefined : record(states[controlledId]);
  const entityState = record(state?.entityState);
  if (controlledId.length === 0 || entityState === undefined) {
    throw new TypeError("Runtime Snapshot is missing the controlled Subject state.");
  }
  const cameraPosition = finiteTuple(camera.positionMetersXYZ, 3);
  const subjectPosition = finiteTuple(entityState.positionMetersXYZ, 3);
  if (cameraPosition === undefined || subjectPosition === undefined) {
    throw new TypeError("Runtime camera/Subject positions are missing or invalid.");
  }
  const rotation = finiteTuple(entityState.rotationQuaternionXYZW, 4);
  if (rotation === undefined) {
    throw new TypeError("Runtime Subject rotation quaternion is missing or invalid.");
  }
  const quaternion = new Quaternion(rotation[0], rotation[1], rotation[2], rotation[3]);
  if (quaternion.length() <= 1e-9) {
    throw new TypeError("Runtime Subject rotation quaternion is degenerate.");
  }
  quaternion.normalize();
  const subjectForward = Vector3.Zero();
  new Vector3(0, 0, -1).rotateByQuaternionToRef(quaternion, subjectForward);
  const cameraToSubjectX = subjectPosition[0]! - cameraPosition[0]!;
  const cameraToSubjectZ = subjectPosition[2]! - cameraPosition[2]!;
  const cameraLength = Math.hypot(cameraToSubjectX, cameraToSubjectZ);
  const forwardLength = Math.hypot(subjectForward.x, subjectForward.z);
  if (cameraLength <= 1e-6 || forwardLength <= 1e-6) {
    throw new TypeError(
      "Runtime camera/Subject horizontal direction is degenerate.",
    );
  }
  const cosine = Math.max(-1, Math.min(1,
    (cameraToSubjectX * subjectForward.x +
      cameraToSubjectZ * subjectForward.z) /
      (cameraLength * forwardLength),
  ));
  const yawOffset = camera.viewYawOffsetRadians ?? 0;
  if (typeof yawOffset !== "number" || !Number.isFinite(yawOffset)) {
    throw new TypeError("Runtime camera yaw offset is invalid.");
  }
  return Object.freeze({
    controlledEntityId: controlledId,
    cameraTargetEntityId: String(camera.targetEntityId ?? ""),
    cameraTargetsControlledSubject: camera.targetEntityId === controlledId,
    rearAlignmentDegrees: Math.acos(cosine) * 180 / Math.PI,
    maximumRearAlignmentDegrees:
      ENTRY_THIRD_PERSON_MAXIMUM_REAR_ALIGNMENT_DEGREES_V1,
    viewYawOffsetRadians: Math.abs(yawOffset),
    maximumViewYawOffsetRadians:
      ENTRY_THIRD_PERSON_MAXIMUM_VIEW_YAW_OFFSET_RADIANS_V1,
  });
}

function evaluateEntryThirdPersonMeasurementsV1(
  input: EntryThirdPersonValidationMeasurementsInputV1,
): EntryThirdPersonValidationResultV1 {
  const diagnostics: EntryThirdPersonDiagnosticV1[] = [];
  if (input.imageMeasurements === undefined) {
    diagnostics.push({
      code: "ENTRY_SUBJECT_MASK_INVALID",
      message: errorMessage(input.imageError ?? "Primary-subject identity mask is missing."),
    });
  } else if (
    input.imageMeasurements.subjectCenterErrorRatio >
      ENTRY_THIRD_PERSON_MAXIMUM_CENTER_ERROR_RATIO_V1 + Number.EPSILON
  ) {
    diagnostics.push({
      code: "ENTRY_SUBJECT_NOT_CENTERED",
      message:
        "The complete primary Subject is not strictly centered on the image vertical " +
        `midline (x=${input.imageMeasurements.subjectCenterXRatio.toFixed(4)}, ` +
        `required 0.5000±${ENTRY_THIRD_PERSON_MAXIMUM_CENTER_ERROR_RATIO_V1.toFixed(4)}).`,
    });
  }

  let runtimeMeasurements: EntryThirdPersonRuntimeMeasurementsV1 | null = null;
  if (input.runtimeError !== undefined) {
    diagnostics.push({
      code: "ENTRY_RUNTIME_CAMERA_INVALID",
      message: errorMessage(input.runtimeError),
    });
  } else if (input.runtimeSnapshot !== undefined) {
    try {
      runtimeMeasurements = measureEntryThirdPersonRuntimeRearAlignmentV1(
        input.runtimeSnapshot,
      );
    } catch (error) {
      diagnostics.push({
        code: "ENTRY_RUNTIME_CAMERA_INVALID",
        message: errorMessage(error),
      });
    }
  }
  if (runtimeMeasurements !== null) {
    if (
      input.formalControlledSubjectEntityId !== undefined &&
      runtimeMeasurements.controlledEntityId !==
        input.formalControlledSubjectEntityId
    ) {
      diagnostics.push({
        code: "ENTRY_RUNTIME_CAMERA_INVALID",
        message:
          "Formal Opening Observation controlled Subject does not match the " +
          "Runtime Snapshot possession binding.",
      });
    }
    if (!runtimeMeasurements.cameraTargetsControlledSubject) {
      diagnostics.push({
        code: "ENTRY_CAMERA_TARGET_MISMATCH",
        message: "The opening camera must target the startup controlled Subject.",
      });
    }
    if (
      runtimeMeasurements.rearAlignmentDegrees >
        ENTRY_THIRD_PERSON_MAXIMUM_REAR_ALIGNMENT_DEGREES_V1
    ) {
      diagnostics.push({
        code: "ENTRY_CAMERA_NOT_DIRECTLY_BEHIND",
        message:
          "The opening camera is diagonally behind the Subject instead of directly " +
          `behind it (${runtimeMeasurements.rearAlignmentDegrees.toFixed(4)} degrees).`,
      });
    }
    if (
      runtimeMeasurements.viewYawOffsetRadians >
        ENTRY_THIRD_PERSON_MAXIMUM_VIEW_YAW_OFFSET_RADIANS_V1
    ) {
      diagnostics.push({
        code: "ENTRY_CAMERA_YAW_OFFSET",
        message: "The opening camera must have zero yaw/orbit offset.",
      });
    }
  }
  return Object.freeze({
    kind: "worldkit-entry-third-person-validation",
    schemaVersion: 1,
    status: diagnostics.length === 0 ? "passed" : "failed",
    imageMeasurements: input.imageMeasurements ?? Object.freeze({}),
    runtimeMeasurements,
    diagnostics: Object.freeze(diagnostics.map((diagnostic) =>
      Object.freeze({ ...diagnostic })
    )),
  });
}

export async function validateEntryThirdPersonPngV1(input: Readonly<{
  imageBytes: Uint8Array;
  runtimeSnapshot?: unknown;
  formalControlledSubjectEntityId?: string;
}>): Promise<EntryThirdPersonValidationResultV1> {
  const formalControlledSubjectEntityId =
    input.formalControlledSubjectEntityId;
  const runtimeIdentityError = formalControlledSubjectEntityId !== undefined &&
      (
        typeof formalControlledSubjectEntityId !== "string" ||
        formalControlledSubjectEntityId.length === 0
      )
    ? new TypeError(
        "Formal Opening Observation controlled Subject identity is invalid.",
      )
    : undefined;
  try {
    return evaluateEntryThirdPersonMeasurementsV1({
      imageMeasurements: await measureEntryThirdPersonSubjectMaskV1(
        input.imageBytes,
      ),
      ...(formalControlledSubjectEntityId === undefined
        ? {}
        : { formalControlledSubjectEntityId }),
      ...(runtimeIdentityError === undefined
        ? {}
        : { runtimeError: runtimeIdentityError }),
      ...(input.runtimeSnapshot === undefined
        ? {}
        : { runtimeSnapshot: input.runtimeSnapshot }),
    });
  } catch (error) {
    return evaluateEntryThirdPersonMeasurementsV1({
      imageError: error,
      ...(formalControlledSubjectEntityId === undefined
        ? {}
        : { formalControlledSubjectEntityId }),
      ...(runtimeIdentityError === undefined
        ? {}
        : { runtimeError: runtimeIdentityError }),
      ...(input.runtimeSnapshot === undefined
        ? {}
        : { runtimeSnapshot: input.runtimeSnapshot }),
    });
  }
}

export function validateFormalOpeningEntryThirdPersonV1(input: Readonly<{
  openingPngBytes: Uint8Array;
  openingObservation: Pick<
    FormalOpeningObservationV1,
    "controlledSubjectProjection" | "resetReadySnapshot"
  >;
}>): Promise<EntryThirdPersonValidationResultV1> {
  return validateEntryThirdPersonPngV1({
    imageBytes: input.openingPngBytes,
    runtimeSnapshot: input.openingObservation.resetReadySnapshot,
    formalControlledSubjectEntityId:
      input.openingObservation.controlledSubjectProjection.subjectEntityId,
  });
}

function option(arguments_: readonly string[], name: string): string | undefined {
  const index = arguments_.indexOf(name);
  if (index === -1) return undefined;
  const value = arguments_[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new TypeError(`Missing value for ${name}.`);
  }
  if (arguments_.indexOf(name, index + 1) !== -1) {
    throw new TypeError(`Duplicate option ${name}.`);
  }
  return value;
}

function parseOptions(arguments_: readonly string[]) {
  const supported = new Set(["--image", "--snapshot", "--output"]);
  for (let index = 0; index < arguments_.length; index += 2) {
    if (!supported.has(arguments_[index] ?? "")) {
      throw new TypeError(`Unknown option '${arguments_[index] ?? ""}'.`);
    }
    if (arguments_[index + 1] === undefined) {
      throw new TypeError(`Missing value for ${arguments_[index]}.`);
    }
  }
  const imagePath = option(arguments_, "--image");
  if (imagePath === undefined) throw new TypeError("Missing required --image option.");
  return Object.freeze({
    imagePath: path.resolve(imagePath),
    snapshotPath: option(arguments_, "--snapshot") === undefined
      ? undefined
      : path.resolve(option(arguments_, "--snapshot")!),
    outputPath: option(arguments_, "--output") === undefined
      ? undefined
      : path.resolve(option(arguments_, "--output")!),
  });
}

export async function main(
  arguments_: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const options = parseOptions(arguments_);
  let runtimeSnapshot: unknown;
  let runtimeError: unknown;
  if (options.snapshotPath !== undefined) {
    try {
      runtimeSnapshot = JSON.parse(await readFile(options.snapshotPath, "utf8"));
    } catch (error) {
      runtimeError = error;
    }
  }
  let result: EntryThirdPersonValidationResultV1;
  try {
    const imageMeasurements = await measureEntryThirdPersonSubjectMaskV1(
      new Uint8Array(await readFile(options.imagePath)),
    );
    result = evaluateEntryThirdPersonMeasurementsV1({
      imageMeasurements,
      ...(runtimeError === undefined ? {} : { runtimeError }),
      ...(runtimeSnapshot === undefined ? {} : { runtimeSnapshot }),
    });
  } catch (error) {
    result = evaluateEntryThirdPersonMeasurementsV1({
      imageError: error,
      ...(runtimeError === undefined ? {} : { runtimeError }),
      ...(runtimeSnapshot === undefined ? {} : { runtimeSnapshot }),
    });
  }
  const serialized = `${stringifyCanonicalJson(result)}\n`;
  if (options.outputPath !== undefined) {
    await writeFile(options.outputPath, serialized, { encoding: "utf8" });
  }
  process.stdout.write(serialized);
  if (result.status === "failed") process.exitCode = 2;
}

const entryPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`${errorMessage(error)}\n`);
    process.exitCode = 2;
  });
}
