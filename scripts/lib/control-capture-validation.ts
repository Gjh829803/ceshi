import type { Sha256HashV1 } from "@whitebox-world/protocol";

import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_HASH_V1,
  OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1,
  deriveValidationGateStatusV1,
  deriveValidationReportStatusV1,
  hashValidationReportV1,
  validateValidationReportV1,
  type BooleanAssertionMetricResultV1,
  type GateDefinitionV1,
  type GateResultV1,
  type ValidationDiagnosticCodeV1,
  type ValidationDiagnosticV1,
  type ValidationMetricStatusV1,
  type ValidationReportV1,
} from "@whitebox-world/validation";
import { isPlainObject, orderBy } from "lodash-es";

import {
  collectControlCaptureBundleByteEvidenceV1,
  validateControlCaptureBundleV1,
  type ControlCaptureBundleByteEvidenceV1,
  type ControlCaptureBundleDiagnosticV1,
} from "./control-capture-bundle";

const PASS_FILE_NAMES = new Set([
  "neutral-color.png",
  "linear-depth-meters.bin",
  "semantic-class-id.bin",
  "instance-id.bin",
  "world-normal.bin",
]);

type GateIdV1 =
  | "capture-bundle-integrity"
  | "capture-completeness"
  | "capture-ownership";

type MetricIdV1 =
  | "capture-bundle-integrity-valid"
  | "capture-required-passes-valid"
  | "capture-linear-depth-valid"
  | "capture-ownership-valid";

interface DiagnosticTargetV1 {
  readonly gateId: GateIdV1;
  readonly metricId: MetricIdV1;
}

interface RawValidationDiagnosticV1 extends DiagnosticTargetV1 {
  readonly code: ValidationDiagnosticCodeV1;
  readonly artifactPath: string;
  readonly expectedValue: string;
  readonly actualValue: string;
  readonly message: string;
  readonly suggestedFix: string;
}

interface CaptureBundleIdentityV1 {
  readonly bundleId: string;
  readonly worldPackageRootHash: Sha256HashV1;
  readonly takeHash: Sha256HashV1;
}

interface CaptureBundleEvidenceV1 {
  readonly bundleRootHash: Sha256HashV1;
  readonly bundleDirectoryHash: Sha256HashV1;
  readonly sizeBytes: number;
  readonly artifactRef: string;
}

export interface ControlCaptureValidationReportResultV1 {
  readonly report: ValidationReportV1;
  readonly reportHash: Sha256HashV1;
}

export class ControlCaptureValidationInfrastructureErrorV1 extends Error {
  readonly code = "VALIDATION_SUBJECT_UNAVAILABLE";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ControlCaptureValidationInfrastructureErrorV1";
  }
}

function isSha256Hash(value: unknown): value is Sha256HashV1 {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

async function readCaptureBundleIdentityV1(
  bundleDirectory: string,
): Promise<CaptureBundleIdentityV1> {
  try {
    const value: unknown = JSON.parse(
      await readFile(path.join(bundleDirectory, "bundle.json"), "utf8"),
    );
    if (!isPlainObject(value)) throw new TypeError("bundle.json is not an object");
    const record = value as Record<string, unknown>;
    if (
      typeof record.id !== "string" ||
      record.id.length === 0 ||
      !isSha256Hash(record.worldPackageRootHash) ||
      !isSha256Hash(record.takeHash)
    ) {
      throw new TypeError("bundle.json does not contain a valid V1 identity");
    }
    return {
      bundleId: record.id,
      worldPackageRootHash: record.worldPackageRootHash,
      takeHash: record.takeHash,
    };
  } catch (error) {
    throw new ControlCaptureValidationInfrastructureErrorV1(
      "Control Capture Bundle identity is unavailable; no Validation Report was created.",
      { cause: error },
    );
  }
}

async function collectCaptureBundleEvidenceV1(
  bundleDirectory: string,
): Promise<CaptureBundleEvidenceV1> {
  try {
    const { bundleDirectoryHash, bundleRootHash, sizeBytes } =
      await collectControlCaptureBundleByteEvidenceV1(bundleDirectory);
    return {
      bundleRootHash,
      bundleDirectoryHash,
      sizeBytes,
      artifactRef: `artifact://control-capture-bundle/${bundleRootHash.slice("sha256:".length)}`,
    };
  } catch (error) {
    throw new ControlCaptureValidationInfrastructureErrorV1(
      "Control Capture Bundle bytes are unavailable; no Validation Report was created.",
      { cause: error },
    );
  }
}

export function assertControlCaptureBundleEvidenceStableV1(
  before: Pick<
    ControlCaptureBundleByteEvidenceV1,
    "bundleDirectoryHash" | "sizeBytes"
  >,
  after: Pick<
    ControlCaptureBundleByteEvidenceV1,
    "bundleDirectoryHash" | "sizeBytes"
  >,
): void {
  if (
    before.bundleDirectoryHash !== after.bundleDirectoryHash ||
    before.sizeBytes !== after.sizeBytes
  ) {
    throw new ControlCaptureValidationInfrastructureErrorV1(
      "Control Capture Bundle changed while it was being validated; no Validation Report was created.",
    );
  }
}

function isRequiredPassPath(artifactPath: string): boolean {
  const segments = artifactPath.split("/");
  return segments.length === 3 &&
    segments[0] === "frames" &&
    PASS_FILE_NAMES.has(segments[2]!);
}

function targetForBundleDiagnosticV1(
  diagnostic: ControlCaptureBundleDiagnosticV1,
): DiagnosticTargetV1 {
  if (
    diagnostic.code === "CAPTURE_SESSION_MISMATCH" ||
    diagnostic.code === "CAPTURE_TAKE_MISMATCH" ||
    diagnostic.code === "CAPTURE_WORLD_PACKAGE_MISMATCH"
  ) {
    return {
      gateId: "capture-ownership",
      metricId: "capture-ownership-valid",
    };
  }
  if (
    diagnostic.code === "CAPTURE_REQUIRED_PASS_MISSING" ||
    (
      diagnostic.code === "CAPTURE_FILE_MISSING" &&
      isRequiredPassPath(diagnostic.path)
    )
  ) {
    return {
      gateId: "capture-completeness",
      metricId: "capture-required-passes-valid",
    };
  }
  return {
    gateId: "capture-bundle-integrity",
    metricId: "capture-bundle-integrity-valid",
  };
}

function suggestedFixForDiagnosticV1(
  target: DiagnosticTargetV1,
): string {
  if (target.metricId === "capture-required-passes-valid") {
    return "Regenerate the affected capture frame with all five required passes, then finalize a new Bundle.";
  }
  if (target.metricId === "capture-linear-depth-valid") {
    return "Re-capture Linear Depth as little-endian float32 meters using zero only for no-hit pixels.";
  }
  if (target.metricId === "capture-ownership-valid") {
    return "Regenerate the Bundle from one World Package, Simulation Take, and Runtime Session; do not combine frames.";
  }
  return "Treat the Bundle as immutable, fix the producing stage, and finalize a new hash-complete Bundle.";
}

function adaptBundleDiagnosticV1(
  diagnostic: ControlCaptureBundleDiagnosticV1,
): RawValidationDiagnosticV1 {
  const target = targetForBundleDiagnosticV1(diagnostic);
  return {
    ...target,
    code: diagnostic.code,
    artifactPath: diagnostic.path,
    expectedValue: "valid Control Capture Bundle evidence",
    actualValue: `${diagnostic.code} at ${diagnostic.path}`,
    message: diagnostic.message,
    suggestedFix: suggestedFixForDiagnosticV1(target),
  };
}

async function evaluateLinearDepthV1(
  bundleDirectory: string,
): Promise<{
  readonly status: "passed" | "failed" | "not-evaluated";
  readonly diagnostics: readonly RawValidationDiagnosticV1[];
}> {
  const target = {
    gateId: "capture-completeness",
    metricId: "capture-linear-depth-valid",
  } as const;
  try {
    const bundleValue: unknown = JSON.parse(
      await readFile(path.join(bundleDirectory, "bundle.json"), "utf8"),
    );
    if (!isPlainObject(bundleValue)) throw new TypeError("bundle.json is invalid");
    const frames = (bundleValue as Record<string, unknown>).frames;
    if (!Array.isArray(frames)) throw new TypeError("bundle frames are invalid");
    const diagnostics: RawValidationDiagnosticV1[] = [];
    for (let captureFrameIndex = 0; captureFrameIndex < frames.length; captureFrameIndex += 1) {
      const frameDirectoryName = String(captureFrameIndex).padStart(6, "0");
      const framePath = `frames/${frameDirectoryName}/frame.json`;
      const frameValue: unknown = JSON.parse(
        await readFile(path.join(bundleDirectory, framePath), "utf8"),
      );
      if (!isPlainObject(frameValue)) throw new TypeError(`${framePath} is invalid`);
      const frame = frameValue as Record<string, unknown>;
      if (
        !Number.isSafeInteger(frame.widthPixels) ||
        (frame.widthPixels as number) < 1 ||
        !Number.isSafeInteger(frame.heightPixels) ||
        (frame.heightPixels as number) < 1
      ) {
        throw new TypeError(`${framePath} dimensions are invalid`);
      }
      const depthArtifactPath =
        `frames/${frameDirectoryName}/linear-depth-meters.bin`;
      const depthBytes = new Uint8Array(
        await readFile(path.join(bundleDirectory, depthArtifactPath)),
      );
      const expectedByteLength =
        (frame.widthPixels as number) * (frame.heightPixels as number) * 4;
      if (depthBytes.byteLength !== expectedByteLength) {
        diagnostics.push({
          ...target,
          code: "CAPTURE_LINEAR_DEPTH_INVALID",
          artifactPath: depthArtifactPath,
          expectedValue: `${expectedByteLength} bytes of little-endian float32 depth`,
          actualValue: `${depthBytes.byteLength} bytes`,
          message: "Linear Depth byte length does not match the capture dimensions.",
          suggestedFix: suggestedFixForDiagnosticV1(target),
        });
        continue;
      }
      const view = new DataView(
        depthBytes.buffer,
        depthBytes.byteOffset,
        depthBytes.byteLength,
      );
      for (let byteOffset = 0; byteOffset < depthBytes.byteLength; byteOffset += 4) {
        const valueMeters = view.getFloat32(byteOffset, true);
        if (!Number.isFinite(valueMeters) || valueMeters < 0) {
          diagnostics.push({
            ...target,
            code: "CAPTURE_LINEAR_DEPTH_INVALID",
            artifactPath: depthArtifactPath,
            expectedValue: "finite float32 value equal to zero or greater than zero meters",
            actualValue: `pixel ${byteOffset / 4}: ${String(valueMeters)}`,
            message: "Linear Depth contains a non-finite or negative value.",
            suggestedFix: suggestedFixForDiagnosticV1(target),
          });
          break;
        }
      }
    }
    return {
      status: diagnostics.length === 0 ? "passed" : "failed",
      diagnostics,
    };
  } catch (error) {
    return {
      status: "not-evaluated",
      diagnostics: [
        {
          ...target,
          code: "VALIDATION_EVALUATOR_FAILED",
          artifactPath: "bundle.json",
          expectedValue: "readable frame metadata and Linear Depth evidence",
          actualValue: error instanceof Error ? error.message : String(error),
          message: "Linear Depth evaluator could not complete.",
          suggestedFix: suggestedFixForDiagnosticV1(target),
        },
      ],
    };
  }
}

function materializeDiagnosticsV1(
  rawDiagnostics: readonly RawValidationDiagnosticV1[],
): readonly ValidationDiagnosticV1[] {
  return orderBy(
    rawDiagnostics,
    ["gateId", "metricId", "code", "artifactPath", "message"],
    ["asc", "asc", "asc", "asc", "asc"],
  ).map((diagnostic, index) => ({
    id: `validation-diagnostic-${String(index + 1).padStart(4, "0")}`,
    code: diagnostic.code,
    severity: "error",
    gateId: diagnostic.gateId,
    metricId: diagnostic.metricId,
    artifactPath: diagnostic.artifactPath,
    expectedValue: diagnostic.expectedValue,
    actualValue: diagnostic.actualValue,
    message: diagnostic.message,
    suggestedFix: diagnostic.suggestedFix,
  }));
}

function metricResultV1(
  gateId: GateIdV1,
  metricId: MetricIdV1,
  evidenceArtifactRef: string,
  diagnostics: readonly ValidationDiagnosticV1[],
  explicitStatus?: ValidationMetricStatusV1,
): BooleanAssertionMetricResultV1 {
  const definition = (
    OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1.gateDefinitionsById[
      gateId
    ] as GateDefinitionV1
  ).metricDefinitionsById[metricId];
  if (definition?.kind !== "boolean-assertion") {
    throw new Error(`VALIDATION_PROFILE_METRIC_MISSING: ${gateId}/${metricId}`);
  }
  const diagnosticIds = diagnostics
    .filter((diagnostic) => diagnostic.metricId === metricId)
    .map(({ id }) => id);
  const status = explicitStatus ?? (
    diagnosticIds.length === 0 ? "passed" : "failed"
  );
  return {
    id: metricId,
    kind: "boolean-assertion",
    status,
    ...(status === "not-evaluated" ? {} : { value: status === "passed" }),
    expectedValue: definition.expectedValue,
    evaluatorProfileRef: definition.evaluatorProfileRef,
    evidenceArtifactRefs: [evidenceArtifactRef],
    diagnosticIds,
  };
}

function gateResultV1(
  gateId: GateIdV1,
  metricResultsById: GateResultV1["metricResultsById"],
  diagnostics: readonly ValidationDiagnosticV1[],
): GateResultV1 {
  const definition =
    OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1.gateDefinitionsById[
      gateId
    ] as GateDefinitionV1;
  const diagnosticIds = diagnostics
    .filter((diagnostic) => diagnostic.gateId === gateId)
    .map(({ id }) => id);
  const partialResult: GateResultV1 = {
    id: gateId,
    requirement: definition.requirement,
    status: "passed",
    metricResultsById,
    diagnosticIds,
  };
  return {
    ...partialResult,
    status: deriveValidationGateStatusV1(definition, partialResult),
  };
}

export async function createControlCaptureValidationReportV1(
  inputDirectory: string,
): Promise<ControlCaptureValidationReportResultV1> {
  const bundleDirectory = path.resolve(inputDirectory);
  const evidence = await collectCaptureBundleEvidenceV1(bundleDirectory);
  const [identity, bundleValidation, depthEvaluation] = await Promise.all([
    readCaptureBundleIdentityV1(bundleDirectory),
    validateControlCaptureBundleV1(bundleDirectory),
    evaluateLinearDepthV1(bundleDirectory),
  ]);
  const finalEvidence = await collectCaptureBundleEvidenceV1(
    bundleDirectory,
  );
  assertControlCaptureBundleEvidenceStableV1(evidence, finalEvidence);
  const rawDiagnostics = [
    ...bundleValidation.diagnostics.map(adaptBundleDiagnosticV1),
    ...depthEvaluation.diagnostics,
  ];
  const diagnostics = materializeDiagnosticsV1(rawDiagnostics);
  const integrityMetric = metricResultV1(
    "capture-bundle-integrity",
    "capture-bundle-integrity-valid",
    evidence.artifactRef,
    diagnostics,
  );
  const requiredPassesMetric = metricResultV1(
    "capture-completeness",
    "capture-required-passes-valid",
    evidence.artifactRef,
    diagnostics,
  );
  const depthMetric = metricResultV1(
    "capture-completeness",
    "capture-linear-depth-valid",
    evidence.artifactRef,
    diagnostics,
    depthEvaluation.status,
  );
  const ownershipMetric = metricResultV1(
    "capture-ownership",
    "capture-ownership-valid",
    evidence.artifactRef,
    diagnostics,
  );
  const gateResultsById: Record<GateIdV1, GateResultV1> = {
    "capture-bundle-integrity": gateResultV1(
      "capture-bundle-integrity",
      { "capture-bundle-integrity-valid": integrityMetric },
      diagnostics,
    ),
    "capture-completeness": gateResultV1(
      "capture-completeness",
      {
        "capture-required-passes-valid": requiredPassesMetric,
        "capture-linear-depth-valid": depthMetric,
      },
      diagnostics,
    ),
    "capture-ownership": gateResultV1(
      "capture-ownership",
      { "capture-ownership-valid": ownershipMetric },
      diagnostics,
    ),
  };
  const report: ValidationReportV1 = {
    kind: "worldkit-validation-report",
    schemaVersion: 1,
    id: `${identity.bundleId}-validation`,
    subject: {
      kind: "control-capture-bundle",
      worldPackageRootHash: identity.worldPackageRootHash,
      takeHash: identity.takeHash,
      bundleRootHash: evidence.bundleRootHash,
    },
    validationProfileRef:
      OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1.resourceRef,
    resolvedVersion:
      OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1.version,
    validationProfileHash:
      OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_HASH_V1,
    status: deriveValidationReportStatusV1(
      OUTDOOR_CONTROL_VIDEO_DEV_VALIDATION_PROFILE_V1,
      gateResultsById,
    ),
    gateResultsById,
    evidenceArtifactsById: {
      "capture-bundle": {
        id: "capture-bundle",
        kind: "control-capture-bundle",
        artifactRef: evidence.artifactRef,
        mediaType:
          "application/vnd.worldkit.control-capture-bundle.v1+directory",
        sizeBytes: evidence.sizeBytes,
        contentHash: evidence.bundleRootHash,
      },
    },
    diagnostics,
  };
  const validation = validateValidationReportV1(report);
  if (!validation.ok) {
    throw new ControlCaptureValidationInfrastructureErrorV1(
      `Generated Validation Report is invalid: ${validation.diagnostics.map(
        ({ code, path: diagnosticPath }) => `${code} ${diagnosticPath}`,
      ).join(", ")}`,
    );
  }
  return { report, reportHash: hashValidationReportV1(report) };
}
