import { lstat } from "node:fs/promises";
import path from "node:path";

import { canonicalJsonBytes } from "@whitebox-world/protocol";
import {
  OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2,
  type Sha256HashV1,
  type ValidationDiagnosticV2,
  type ValidationReportStatusV1,
} from "@whitebox-world/validation";
import { isNil } from "lodash-es";

import {
  publishEvidenceAndReportNoReplaceV1,
} from "./exclusive-evidence-publication";
import type { TrustedRouteValidationResultV1 } from "./route-validation-runner";
import type { CliDiagnostic } from "./worldkit-pipeline";

interface RouteValidationCommandResultBaseV1 {
  readonly kind: "worldkit-route-validation-command-result";
  readonly schemaVersion: 1;
  readonly validationStatus: ValidationReportStatusV1;
  readonly validationReportHash: Sha256HashV1;
  readonly outputPath: string;
  readonly evidenceDirectory: string;
  readonly diagnostics: readonly CliDiagnostic[];
}

export type RouteValidationCommandResultV1 =
  | (RouteValidationCommandResultBaseV1 & {
      readonly ok: true;
      readonly exitCode: 0;
      readonly validationStatus: "passed";
    })
  | (RouteValidationCommandResultBaseV1 & {
      readonly ok: false;
      readonly exitCode: 2 | 3;
      readonly validationStatus: "failed" | "incomplete";
    })
  | {
      readonly ok: false;
      readonly exitCode: 1;
      readonly diagnostics: readonly CliDiagnostic[];
    };

const PUBLIC_ROUTE_VALIDATION_INFRASTRUCTURE_REASONS_V1 = Object.freeze([
  "WORLDKIT_ROUTE_VALIDATION_ASSET_DUPLICATE",
  "WORLDKIT_ROUTE_VALIDATION_ASSET_IDENTITY_MISMATCH",
  "WORLDKIT_ROUTE_VALIDATION_ASSET_INVALID",
  "WORLDKIT_ROUTE_VALIDATION_ASSET_UNAVAILABLE",
  "WORLDKIT_ROUTE_VALIDATION_INPUT_INVALID",
  "WORLDKIT_ROUTE_VALIDATION_RESOURCE_RESOLUTION_FAILED",
] as const);

function infrastructureFailure(
  code: string,
  instancePath: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): Extract<RouteValidationCommandResultV1, { readonly exitCode: 1 }> {
  return {
    ok: false,
    exitCode: 1,
    diagnostics: [{
      severity: "error",
      code,
      instancePath,
      message,
      ...(isNil(details) ? {} : { details }),
    }],
  };
}

/**
 * Projects a trusted-runner failure onto the public CLI/Browser diagnostic
 * contract. Raw provider errors, native causes, paths, and runner-owned
 * details intentionally never enter this function.
 */
export function publicRouteValidationRunnerFailureV1(
  context: "verify-route" | "run-playground",
  reason?: unknown,
): Extract<RouteValidationCommandResultV1, { readonly exitCode: 1 }> {
  const publicReason = typeof reason === "string" &&
      PUBLIC_ROUTE_VALIDATION_INFRASTRUCTURE_REASONS_V1.some(
        (candidate) => candidate === reason,
      )
    ? reason
    : undefined;
  return infrastructureFailure(
    isNil(publicReason)
      ? "WORLDKIT_ROUTE_VALIDATION_RUNNER_FAILED"
      : "WORLDKIT_ROUTE_VALIDATION_INFRASTRUCTURE_ERROR",
    "",
    context === "verify-route"
      ? "Unable to run trusted Route validation."
      : "Unable to prepare trusted Route evidence for the playground.",
    isNil(publicReason) ? undefined : { reason: publicReason },
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await lstat(targetPath);
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

async function assertOutputParentInspectable(targetPath: string): Promise<void> {
  let currentPath = path.dirname(targetPath);
  for (;;) {
    try {
      const stat = await lstat(currentPath);
      if (!stat.isDirectory()) {
        throw new Error("Route validation output parent is not a directory.");
      }
      return;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        const parent = path.dirname(currentPath);
        if (parent === currentPath) throw error;
        currentPath = parent;
        continue;
      }
      throw error;
    }
  }
}

function escapeJsonPointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function adaptRouteValidationDiagnostic(
  diagnostic: ValidationDiagnosticV2,
): CliDiagnostic {
  return {
    severity: diagnostic.severity,
    code: diagnostic.code,
    instancePath: diagnostic.scope === "world"
      ? ""
      : `/constraints/${escapeJsonPointerSegment(diagnostic.constraintId)}`,
    message: diagnostic.message,
    details: {
      diagnosticId: diagnostic.id,
      scope: diagnostic.scope,
      gateId: diagnostic.gateId,
      metricId: diagnostic.metricId,
      evidenceArtifactRefs: diagnostic.evidenceArtifactRefs,
      diagnosticDetails: diagnostic.details,
      suggestedFix: diagnostic.suggestedFix,
      ...(diagnostic.scope === "world"
        ? {}
        : {
            constraintId: diagnostic.constraintId,
            routeId: diagnostic.routeId,
            traversingEntityId: diagnostic.traversingEntityId,
            startAnchorEntityId: diagnostic.startAnchorEntityId,
            destinationAnchorEntityId: diagnostic.destinationAnchorEntityId,
            ...(isNil(diagnostic.traversalSurfaceId)
              ? {}
              : { traversalSurfaceId: diagnostic.traversalSurfaceId }),
            ...(isNil(diagnostic.colliderSubshapeId)
              ? {}
              : { colliderSubshapeId: diagnostic.colliderSubshapeId }),
            ...(isNil(diagnostic.positionMetersXYZ)
              ? {}
              : { positionMetersXYZ: diagnostic.positionMetersXYZ }),
          }),
    },
  };
}

function validationStatusExitCode(
  status: ValidationReportStatusV1,
): 0 | 2 | 3 {
  if (status === "passed") return 0;
  return status === "failed" ? 2 : 3;
}

/**
 * Runs the trusted Route validation pipeline and commits its evidence as one
 * no-replace publication. The Report is the commit marker and is never
 * produced for infrastructure failures.
 */
export async function verifyRouteFileV1(
  inputPath: string,
  validationProfileRef: string,
  outputPath: string,
): Promise<RouteValidationCommandResultV1> {
  if (
    validationProfileRef !==
      OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2.resourceRef
  ) {
    return infrastructureFailure(
      "WORLDKIT_ROUTE_VALIDATION_PROFILE_UNSUPPORTED",
      "/validationProfileRef",
      "Route validation requires the frozen built-in Validation Profile.",
      {
        actualValidationProfileRef: validationProfileRef,
        expectedValidationProfileRef:
          OUTDOOR_WORLD_PACKAGE_DEV_VALIDATION_PROFILE_V2.resourceRef,
      },
    );
  }

  const absoluteInputPath = path.resolve(inputPath);
  const absoluteOutputPath = path.resolve(outputPath);
  const evidenceDirectory = `${absoluteOutputPath}.evidence`;
  if (absoluteInputPath === absoluteOutputPath) {
    return infrastructureFailure(
      "WORLDKIT_ROUTE_VALIDATION_OUTPUT_EQUALS_INPUT",
      "/outputPath",
      "Validation Report output must not replace the input World.",
      { inputPath: absoluteInputPath, outputPath: absoluteOutputPath },
    );
  }

  try {
    await assertOutputParentInspectable(absoluteOutputPath);
    if (
      await pathExists(absoluteOutputPath) ||
      await pathExists(evidenceDirectory)
    ) {
      return infrastructureFailure(
        "WORLDKIT_ROUTE_VALIDATION_OUTPUT_EXISTS",
        "/outputPath",
        "Validation Report or evidence output already exists; refusing to replace it.",
        {
          outputPath: absoluteOutputPath,
          evidenceDirectory,
        },
      );
    }
  } catch (error) {
    return infrastructureFailure(
      "WORLDKIT_ROUTE_VALIDATION_OUTPUT_INSPECTION_FAILED",
      "/outputPath",
      "Unable to inspect the Route validation output targets.",
      {
        outputPath: absoluteOutputPath,
        evidenceDirectory,
      },
    );
  }

  let trustedResult: TrustedRouteValidationResultV1;
  let runnerModule: typeof import("./route-validation-runner") | undefined;
  try {
    runnerModule = await import("./route-validation-runner");
    trustedResult = await runnerModule.runTrustedRouteValidationV1(
      absoluteInputPath,
    );
  } catch (error) {
    if (
      !isNil(runnerModule) &&
      error instanceof runnerModule.RouteValidationRunnerInfrastructureErrorV1
    ) {
      return publicRouteValidationRunnerFailureV1(
        "verify-route",
        error.reason,
      );
    }
    return publicRouteValidationRunnerFailureV1("verify-route");
  }

  let publication: Awaited<ReturnType<
    typeof publishEvidenceAndReportNoReplaceV1
  >>;
  try {
    publication = await publishEvidenceAndReportNoReplaceV1({
      reportPath: absoluteOutputPath,
      reportBytes: canonicalJsonBytes(trustedResult.report),
      evidenceFiles: trustedResult.evidenceFiles.map((file) => ({
        relativePath: file.relativePath,
        bytes: new Uint8Array(file.bytes),
      })),
    });
  } catch (error) {
    const message = errorMessage(error);
    const outputExists = message.startsWith(
      "WORLDKIT_EVIDENCE_PUBLICATION_TARGET_EXISTS:",
    );
    return infrastructureFailure(
      outputExists
        ? "WORLDKIT_ROUTE_VALIDATION_OUTPUT_EXISTS"
        : "WORLDKIT_ROUTE_VALIDATION_PUBLICATION_FAILED",
      "/outputPath",
      outputExists
        ? "Validation Report or evidence output already exists; refusing to replace it."
        : "Unable to publish the Route Validation Report and evidence.",
      {
        outputPath: absoluteOutputPath,
        evidenceDirectory,
      },
    );
  }

  const diagnostics = trustedResult.report.diagnostics.map(
    adaptRouteValidationDiagnostic,
  );
  const resultDiagnostics: readonly CliDiagnostic[] =
    publication.postCommitCleanupStatus === "complete"
      ? diagnostics
      : [
          ...diagnostics,
          {
            severity: "warning",
            code: "WORLDKIT_ROUTE_VALIDATION_POST_COMMIT_CLEANUP_INCOMPLETE",
            instancePath: "/outputPath",
            message:
              "Route validation committed successfully, but temporary-file cleanup was incomplete.",
            details: {
              outputPath: absoluteOutputPath,
              evidenceDirectory,
            },
          },
        ];
  const exitCode = validationStatusExitCode(trustedResult.report.status);
  const base = {
    kind: "worldkit-route-validation-command-result" as const,
    schemaVersion: 1 as const,
    validationStatus: trustedResult.report.status,
    validationReportHash: trustedResult.validationReportHash,
    outputPath: absoluteOutputPath,
    evidenceDirectory,
    diagnostics: resultDiagnostics,
  };
  if (exitCode === 0) {
    return { ...base, ok: true, exitCode, validationStatus: "passed" };
  }
  return {
    ...base,
    ok: false,
    exitCode,
    validationStatus: trustedResult.report.status as "failed" | "incomplete",
  };
}
