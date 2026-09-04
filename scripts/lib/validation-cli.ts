import type { Sha256HashV1 } from "@whitebox-world/protocol";

import { randomUUID } from "node:crypto";
import {
  link,
  lstat,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  hashValidationReportV1,
  validateValidationReportV1,
  type EvidenceArtifactV1,
  type ControlCaptureValidationReportV1,
  type WorldPackageEvidenceArtifactV1,
  type WorldPackageGateResultV1,
  type ValidationDiagnosticV1,
  type WorldPackageValidationDiagnosticV1,
  type ValidationReportStatusV1,
  type ValidationReportV1,
  type WorldPackageValidationReportV1,
} from "@whitebox-world/validation";
import { stringifyCanonicalJson } from "@whitebox-world/protocol";
import { isNil, orderBy, uniq } from "lodash-es";

import {
  ControlCaptureValidationInfrastructureErrorV1,
  createControlCaptureValidationReportV1,
} from "./control-capture-validation";
import type { CliDiagnostic } from "./worldkit-pipeline";

interface ValidationCommandResultBaseV1 {
  readonly kind: "worldkit-validation-command-result";
  readonly schemaVersion: 1;
  readonly validationStatus: ValidationReportStatusV1;
  readonly validationReportHash: Sha256HashV1;
  readonly outputPath: string;
  readonly diagnostics: readonly CliDiagnostic[];
}

export type ValidationCommandResultV1 =
  | (ValidationCommandResultBaseV1 & {
      readonly ok: true;
      readonly exitCode: 0;
      readonly validationStatus: "passed";
    })
  | (ValidationCommandResultBaseV1 & {
      readonly ok: false;
      readonly exitCode: 2 | 3;
      readonly validationStatus: "failed" | "incomplete";
    })
  | {
      readonly ok: false;
      readonly exitCode: 1;
      readonly diagnostics: readonly CliDiagnostic[];
    };

export interface ControlCaptureValidationGateExplanationV1 {
  readonly ok: true;
  readonly exitCode: 0;
  readonly kind: "worldkit-validation-gate-explanation";
  readonly schemaVersion: 1;
  readonly validationReportId: string;
  readonly validationReportHash: Sha256HashV1;
  readonly validationStatus: ValidationReportStatusV1;
  readonly validationProfileRef: string;
  readonly gate: ControlCaptureValidationReportV1["gateResultsById"][string];
  readonly evidenceArtifacts: readonly EvidenceArtifactV1[];
  readonly validationDiagnostics: readonly ValidationDiagnosticV1[];
  readonly diagnostics: readonly [];
  readonly humanReadableText: string;
}

export interface WorldPackageValidationGateExplanationV1 {
  readonly ok: true;
  readonly exitCode: 0;
  readonly kind: "worldkit-validation-gate-explanation";
  readonly schemaVersion: 1;
  readonly validationReportId: string;
  readonly validationReportHash: Sha256HashV1;
  readonly validationStatus: ValidationReportStatusV1;
  readonly validationProfileRef: string;
  readonly gate: WorldPackageGateResultV1;
  readonly evidenceArtifacts: readonly WorldPackageEvidenceArtifactV1[];
  readonly validationDiagnostics: readonly WorldPackageValidationDiagnosticV1[];
  readonly diagnostics: readonly [];
  readonly humanReadableText: string;
}

export type ValidationGateExplanationResultV1 =
  | ControlCaptureValidationGateExplanationV1
  | WorldPackageValidationGateExplanationV1
  | {
      readonly ok: false;
      readonly exitCode: 1;
      readonly diagnostics: readonly CliDiagnostic[];
    };

function cliInfrastructureFailure(
  code: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): Extract<ValidationCommandResultV1, { readonly exitCode: 1 }> {
  return {
    ok: false,
    exitCode: 1,
    diagnostics: [
      {
        severity: "error",
        code,
        instancePath: "",
        message,
        ...(details === undefined ? {} : { details }),
      },
    ],
  };
}

function isWorldPackageValidationReportV1(
  report: ValidationReportV1,
): report is WorldPackageValidationReportV1 {
  return report.subject.kind === "world-package";
}

export function validationStatusExitCodeV1(
  status: ValidationReportStatusV1,
): 0 | 2 | 3 {
  if (status === "passed") return 0;
  return status === "failed" ? 2 : 3;
}

function adaptValidationDiagnosticV1(
  diagnostic: ValidationDiagnosticV1,
): CliDiagnostic {
  return {
    severity: diagnostic.severity,
    code: diagnostic.code,
    instancePath: diagnostic.artifactPath,
    message: diagnostic.message,
    details: {
      gateId: diagnostic.gateId,
      metricId: diagnostic.metricId,
      expectedValue: diagnostic.expectedValue,
      actualValue: diagnostic.actualValue,
      suggestedFix: diagnostic.suggestedFix,
    },
  };
}

function outputIsInsideBundle(
  absoluteBundleDirectory: string,
  absoluteOutputPath: string,
): boolean {
  const relativePath = path.relative(
    absoluteBundleDirectory,
    absoluteOutputPath,
  );
  return relativePath === "" || (
    !relativePath.startsWith(`..${path.sep}`) &&
    relativePath !== ".." &&
    !path.isAbsolute(relativePath)
  );
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return false;
    }
    throw error;
  }
}

async function resolveProspectiveRealPathV1(filePath: string): Promise<string> {
  let existingAncestor = path.resolve(filePath);
  const missingSegments: string[] = [];
  while (true) {
    try {
      return path.join(
        await realpath(existingAncestor),
        ...missingSegments,
      );
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "ENOENT"
      ) {
        throw error;
      }
      const parentPath = path.dirname(existingAncestor);
      if (parentPath === existingAncestor) throw error;
      missingSegments.unshift(path.basename(existingAncestor));
      existingAncestor = parentPath;
    }
  }
}

export async function writeValidationReportFileNoReplaceV1(
  outputPath: string,
  report: ValidationReportV1,
): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const temporaryPath = path.join(
    path.dirname(outputPath),
    `.${path.basename(outputPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(
      temporaryPath,
      `${stringifyCanonicalJson(report)}\n`,
      "utf8",
    );
    await link(temporaryPath, outputPath);
    await rm(temporaryPath, { force: true });
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function verifyControlCaptureFileV1(
  inputDirectory: string,
  outputPath: string,
): Promise<ValidationCommandResultV1> {
  const absoluteBundleDirectory = path.resolve(inputDirectory);
  const absoluteOutputPath = path.resolve(outputPath);
  if (outputIsInsideBundle(absoluteBundleDirectory, absoluteOutputPath)) {
    return cliInfrastructureFailure(
      "VALIDATION_OUTPUT_INSIDE_SUBJECT",
      "Validation Report output must be outside the immutable Control Capture Bundle.",
      { inputDirectory: absoluteBundleDirectory, outputPath: absoluteOutputPath },
    );
  }
  try {
    const canonicalBundleDirectory = await realpath(
      absoluteBundleDirectory,
    );
    const outputParentPath = path.dirname(absoluteOutputPath);
    const prospectiveOutputParent = await resolveProspectiveRealPathV1(
      outputParentPath,
    );
    const prospectiveOutputPath = path.join(
      prospectiveOutputParent,
      path.basename(absoluteOutputPath),
    );
    if (outputIsInsideBundle(
      canonicalBundleDirectory,
      prospectiveOutputPath,
    )) {
      return cliInfrastructureFailure(
        "VALIDATION_OUTPUT_INSIDE_SUBJECT",
        "Validation Report output must be outside the immutable Control Capture Bundle.",
        {
          inputDirectory: canonicalBundleDirectory,
          outputPath: prospectiveOutputPath,
        },
      );
    }
    await mkdir(outputParentPath, { recursive: true });
    const canonicalOutputParent = await realpath(outputParentPath);
    const canonicalOutputPath = path.join(
      canonicalOutputParent,
      path.basename(absoluteOutputPath),
    );
    if (outputIsInsideBundle(
      canonicalBundleDirectory,
      canonicalOutputPath,
    )) {
      return cliInfrastructureFailure(
        "VALIDATION_OUTPUT_INSIDE_SUBJECT",
        "Validation Report output must be outside the immutable Control Capture Bundle.",
        {
          inputDirectory: canonicalBundleDirectory,
          outputPath: canonicalOutputPath,
        },
      );
    }
    if (await pathExists(absoluteOutputPath)) {
      return cliInfrastructureFailure(
        "VALIDATION_OUTPUT_EXISTS",
        "Validation Report output already exists; refusing to replace it.",
        { outputPath: absoluteOutputPath },
      );
    }
    const { report, reportHash } =
      await createControlCaptureValidationReportV1(canonicalBundleDirectory);
    await writeValidationReportFileNoReplaceV1(absoluteOutputPath, report);
    const exitCode = validationStatusExitCodeV1(report.status);
    const diagnostics = report.diagnostics.map(adaptValidationDiagnosticV1);
    const base = {
      kind: "worldkit-validation-command-result" as const,
      schemaVersion: 1 as const,
      validationStatus: report.status,
      validationReportHash: reportHash,
      outputPath: absoluteOutputPath,
      diagnostics,
    };
    return exitCode === 0
      ? { ...base, ok: true, exitCode, validationStatus: "passed" }
      : {
          ...base,
          ok: false,
          exitCode,
          validationStatus: report.status as "failed" | "incomplete",
        };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return cliInfrastructureFailure(
      error instanceof ControlCaptureValidationInfrastructureErrorV1
        ? error.code
        : "VALIDATION_COMMAND_FAILED",
      "Unable to create the Control Capture Validation Report.",
      { cause: message },
    );
  }
}

type LoadedValidationReportV1 =
  | { readonly ok: true; readonly report: ValidationReportV1 }
  | { readonly ok: false; readonly result: ValidationGateExplanationResultV1 };

async function readValidationReportFileV1(
  inputPath: string,
): Promise<LoadedValidationReportV1> {
  const absoluteInputPath = path.resolve(inputPath);
  try {
    const value: unknown = JSON.parse(await readFile(absoluteInputPath, "utf8"));
    if (
      isNil(value) ||
      typeof value !== "object" ||
      Array.isArray(value)
    ) {
      return {
        ok: false,
        result: cliInfrastructureFailure(
          "VALIDATION_REPORT_VERSION_UNSUPPORTED",
          "Validation Report kind and schemaVersion must identify the current V1 contract.",
          { inputPath: absoluteInputPath },
        ),
      };
    }
    const identity = value as Readonly<Record<string, unknown>>;
    if (
      identity.kind !== "worldkit-validation-report" ||
      identity.schemaVersion !== 1
    ) {
      return {
        ok: false,
        result: cliInfrastructureFailure(
          "VALIDATION_REPORT_VERSION_UNSUPPORTED",
          "Validation Report kind and schemaVersion must identify the current V1 contract.",
          {
            inputPath: absoluteInputPath,
            ...(isNil(identity.kind) ? {} : { kind: identity.kind }),
            ...(isNil(identity.schemaVersion)
              ? {}
              : { schemaVersion: identity.schemaVersion }),
          },
        ),
      };
    }
    const validation = validateValidationReportV1(value);
    if (!validation.ok) {
      return {
        ok: false,
        result: cliInfrastructureFailure(
          "VALIDATION_REPORT_INVALID",
          "Validation Report does not satisfy the strict current V1 contract.",
          {
            inputPath: absoluteInputPath,
            contractDiagnostics: validation.diagnostics,
          },
        ),
      };
    }
    return { ok: true, report: validation.value };
  } catch (error) {
    return {
      ok: false,
      result: cliInfrastructureFailure(
        "VALIDATION_REPORT_UNAVAILABLE",
        "Validation Report file is unavailable or is not valid JSON.",
        {
          inputPath: absoluteInputPath,
          cause: error instanceof Error ? error.message : String(error),
        },
      ),
    };
  }
}

function referencedEvidenceArtifactRefsV1(
  gate: ValidationReportV1["gateResultsById"][string] | WorldPackageGateResultV1,
): readonly string[] {
  return uniq(
    Object.values(gate.metricResultsById).flatMap(
      ({ evidenceArtifactRefs }) => evidenceArtifactRefs,
    ),
  );
}

function formatGateExplanationV1(
  report: ControlCaptureValidationReportV1,
  gate: ControlCaptureValidationReportV1["gateResultsById"][string],
  diagnostics: readonly ValidationDiagnosticV1[],
): string {
  const metricLines = orderBy(
    Object.values(gate.metricResultsById),
    ["id"],
    ["asc"],
  ).map((metric) => `- ${metric.id}: ${metric.status}`);
  const diagnosticLines = diagnostics.flatMap((diagnostic) => [
    `- ${diagnostic.code} ${diagnostic.artifactPath}: ${diagnostic.message}`,
    `  Fix: ${diagnostic.suggestedFix}`,
  ]);
  return [
    `Validation gate: ${gate.id}`,
    `Report status: ${report.status}`,
    `Requirement: ${gate.requirement}`,
    `Gate status: ${gate.status}`,
    "Metrics:",
    ...metricLines,
    "Diagnostics:",
    ...(diagnosticLines.length === 0 ? ["- none"] : diagnosticLines),
  ].join("\n");
}

function formatWorldPackageValidationDiagnosticV1(
  diagnostic: WorldPackageValidationDiagnosticV1,
): readonly string[] {
  const scope = diagnostic.scope === "world"
    ? "scope=world"
    : [
        "scope=route-row",
        `constraintId=${diagnostic.constraintId}`,
        `routeId=${diagnostic.routeId}`,
        `traversingEntityId=${diagnostic.traversingEntityId}`,
        `startAnchorEntityId=${diagnostic.startAnchorEntityId}`,
        `destinationAnchorEntityId=${diagnostic.destinationAnchorEntityId}`,
        ...(isNil(diagnostic.traversalSurfaceId)
          ? []
          : [`traversalSurfaceId=${diagnostic.traversalSurfaceId}`]),
        ...(isNil(diagnostic.colliderSubshapeId)
          ? []
          : [`colliderSubshapeId=${diagnostic.colliderSubshapeId}`]),
        ...(isNil(diagnostic.positionMetersXYZ)
          ? []
          : [`positionMetersXYZ=${diagnostic.positionMetersXYZ.join(",")}`]),
      ].join(" ");
  return [
    `- ${diagnostic.code} ${scope}: ${diagnostic.message}`,
    `  Evidence: ${diagnostic.evidenceArtifactRefs.join(", ") || "none"}`,
    `  Details: ${stringifyCanonicalJson(diagnostic.details)}`,
    `  Fix: ${diagnostic.suggestedFix}`,
  ];
}

function formatWorldPackageGateExplanationV1(
  report: WorldPackageValidationReportV1,
  gate: WorldPackageGateResultV1,
  diagnostics: readonly WorldPackageValidationDiagnosticV1[],
): string {
  const metricLines = orderBy(
    Object.values(gate.metricResultsById),
    ["id"],
    ["asc"],
  ).map((metric) => `- ${metric.id}: ${metric.status}`);
  const diagnosticLines = diagnostics.flatMap(formatWorldPackageValidationDiagnosticV1);
  return [
    `Validation gate: ${gate.id}`,
    `Report status: ${report.status}`,
    `Requirement: ${gate.requirement}`,
    `Gate status: ${gate.status}`,
    "Metrics:",
    ...metricLines,
    "Diagnostics:",
    ...(diagnosticLines.length === 0 ? ["- none"] : diagnosticLines),
  ].join("\n");
}

function explainControlCaptureValidationReportV1(
  report: ControlCaptureValidationReportV1,
  gateId: string,
): ValidationGateExplanationResultV1 {
  const gate = report.gateResultsById[gateId];
  if (gate === undefined) {
    return cliInfrastructureFailure(
      "VALIDATION_GATE_NOT_FOUND",
      `Validation Gate '${gateId}' does not exist in this Report.`,
      {
        gateId,
        availableGateIds: Object.keys(report.gateResultsById).sort(),
      },
    );
  }
  const validationDiagnostics = report.diagnostics.filter(
    (diagnostic) => diagnostic.gateId === gateId,
  );
  const artifactRefs = referencedEvidenceArtifactRefsV1(gate);
  const evidenceArtifacts = orderBy(
    Object.values(report.evidenceArtifactsById).filter((artifact) =>
      artifactRefs.includes(artifact.artifactRef)
    ),
    ["id"],
    ["asc"],
  );
  return {
    ok: true,
    exitCode: 0,
    kind: "worldkit-validation-gate-explanation",
    schemaVersion: 1,
    validationReportId: report.id,
    validationReportHash: hashValidationReportV1(report),
    validationStatus: report.status,
    validationProfileRef: report.validationProfileRef,
    gate,
    evidenceArtifacts,
    validationDiagnostics,
    diagnostics: [],
    humanReadableText: formatGateExplanationV1(
      report,
      gate,
      validationDiagnostics,
    ),
  };
}

function explainWorldPackageValidationReportV1(
  report: WorldPackageValidationReportV1,
  gateId: string,
): ValidationGateExplanationResultV1 {
  const gate = report.gateResultsById[gateId];
  if (gate === undefined) {
    return cliInfrastructureFailure(
      "VALIDATION_GATE_NOT_FOUND",
      `Validation Gate '${gateId}' does not exist in this Report.`,
      {
        gateId,
        availableGateIds: Object.keys(report.gateResultsById).sort(),
      },
    );
  }
  const validationDiagnostics = orderBy(
    report.diagnostics.filter((diagnostic) => diagnostic.gateId === gateId),
    ["id"],
    ["asc"],
  );
  const artifactRefs = uniq([
    ...referencedEvidenceArtifactRefsV1(gate),
    ...validationDiagnostics.flatMap(
      ({ evidenceArtifactRefs }) => evidenceArtifactRefs,
    ),
  ]);
  const evidenceArtifacts = orderBy(
    Object.values(report.evidenceArtifactsById).filter((artifact) =>
      artifactRefs.includes(artifact.artifactRef)
    ),
    ["id"],
    ["asc"],
  );
  return {
    ok: true,
    exitCode: 0,
    kind: "worldkit-validation-gate-explanation",
    schemaVersion: 1,
    validationReportId: report.id,
    validationReportHash: hashValidationReportV1(report),
    validationStatus: report.status,
    validationProfileRef: report.validationProfileRef,
    gate,
    evidenceArtifacts,
    validationDiagnostics,
    diagnostics: [],
    humanReadableText: formatWorldPackageGateExplanationV1(
      report,
      gate,
      validationDiagnostics,
    ),
  };
}

export async function explainValidationReportFileV1(
  inputPath: string,
  gateId: string,
): Promise<ValidationGateExplanationResultV1> {
  const loaded = await readValidationReportFileV1(inputPath);
  if (!loaded.ok) return loaded.result;
  return isWorldPackageValidationReportV1(loaded.report)
    ? explainWorldPackageValidationReportV1(loaded.report, gateId)
    : explainControlCaptureValidationReportV1(loaded.report, gateId);
}
