import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  normalizeAuthoringSpecV4,
  parseAuthoringSpecV4,
  parseCanonicalJson,
  sha256CanonicalJson,
  stringifyCanonicalJson,
  type AuthoringSpecV4,
  type NormalizeAuthoringResultV4,
  type NormalizedWorldIRV4,
} from "@whitebox-world/authoring";

import {
  promoteArtifactDirectory,
  type ArtifactDirectoryPromotionFileSystem,
} from "./artifact-directory-promotion";
import {
  readWorldkitInput,
  type WorldkitDiagnostic,
  type WorldkitFailure,
} from "./worldkit-pipeline";

type LayoutSolveReport = NonNullable<
  NormalizeAuthoringResultV4["layoutSolveReport"]
>;
type LayoutSolveStatus = LayoutSolveReport["status"];

const LAYOUT_ARTIFACT_FILENAMES = [
  "integrity.json",
  "layout-report.json",
  "normalized-world-ir.json",
] as const;

interface LayoutCommandFailure extends Omit<WorldkitFailure, "exitCode"> {
  readonly exitCode: 2 | 3 | 4 | 5;
  readonly status?: Exclude<LayoutSolveStatus, "solved">;
  readonly layoutSolveReportHash?: string;
}

export interface LayoutSolveSuccess {
  readonly ok: true;
  readonly exitCode: 0;
  readonly kind: "worldkit-layout-solve";
  readonly schemaVersion: 1;
  readonly diagnostics: readonly [];
  readonly status: "solved";
  readonly outputPath: string;
  readonly layoutSolveReportHash: string;
  readonly normalizedWorldIrHash: string;
  readonly integrityManifestHash: string;
  readonly backupGarbageCollection: "complete" | "deferred";
  readonly deferredBackupDirectory?: string;
}

export interface LayoutArtifactWriteOptions {
  readonly promotionFileSystem?: ArtifactDirectoryPromotionFileSystem;
}

function layoutFailure(
  exitCode: LayoutCommandFailure["exitCode"],
  code: string,
  message: string,
  options: {
    readonly instancePath?: string;
    readonly details?: Readonly<Record<string, unknown>>;
    readonly status?: LayoutCommandFailure["status"];
    readonly layoutSolveReportHash?: string;
    readonly diagnostics?: readonly WorldkitDiagnostic[];
  } = {},
): LayoutCommandFailure {
  const diagnostics = options.diagnostics ?? [
    {
      severity: "error" as const,
      code,
      instancePath: options.instancePath ?? "",
      message,
      ...(options.details === undefined ? {} : { details: options.details }),
    },
  ];
  return {
    ok: false,
    exitCode,
    diagnostics,
    ...(options.status === undefined ? {} : { status: options.status }),
    ...(options.layoutSolveReportHash === undefined
      ? {}
      : { layoutSolveReportHash: options.layoutSolveReportHash }),
  };
}

function processInputFailure(failure: WorldkitFailure): LayoutCommandFailure {
  return {
    ...failure,
    exitCode: failure.diagnostics.some(
      (diagnostic) => diagnostic.code === "CLI_INPUT_UNAVAILABLE",
    )
      ? 5
      : 2,
  };
}

async function readParsedAuthoring(
  inputPath: string,
): Promise<
  | {
      readonly ok: true;
      readonly absoluteInputPath: string;
      readonly spec: AuthoringSpecV4;
    }
  | LayoutCommandFailure
> {
  const input = await readWorldkitInput(inputPath);
  if (!input.ok) return processInputFailure(input);
  const parsed = parseAuthoringSpecV4(input.sourceText);
  if (!parsed.ok || parsed.value === undefined) {
    return {
      ok: false,
      exitCode: 2,
      diagnostics: parsed.diagnostics,
    };
  }
  return {
    ok: true,
    absoluteInputPath: input.absoluteInputPath,
    spec: parsed.value,
  };
}

export function layoutExitCodeForStatus(status: LayoutSolveStatus): 0 | 2 | 3 | 4 {
  switch (status) {
    case "solved":
      return 0;
    case "invalid-input":
      return 2;
    case "unsatisfied":
      return 3;
    case "budget-exceeded":
      return 4;
  }
}

export async function layoutValidateFile(inputPath: string) {
  const input = await readParsedAuthoring(inputPath);
  if (!input.ok) return input;
  const resolved = normalizeAuthoringSpecV4(input.spec);
  if (
    !resolved.ok ||
    resolved.value === undefined ||
    resolved.normalizedWorldIrHash === undefined
  ) {
    return {
      ok: false as const,
      exitCode: 2 as const,
      diagnostics: resolved.diagnostics,
    };
  }
  return {
    ok: true as const,
    exitCode: 0 as const,
    kind: "worldkit-layout-validation" as const,
    schemaVersion: 1 as const,
    diagnostics: [] as const,
    solverProfileRef: resolved.value.layout.solverProfileRef,
    resolvedVersion: resolved.value.layout.resolvedVersion,
    solverProfileHash: resolved.value.layout.solverProfileHash,
    authoringSpecHash: resolved.value.authoringSpecHash,
    registryLockHash: resolved.value.resources.resourceLockHash,
    entityCount: resolved.value.nodes.length,
    constraintCount: input.spec.constraints.placements.length,
  };
}

function sha256Bytes(bytes: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function isInputInsideOutput(inputPath: string, outputDirectory: string): boolean {
  const relative = path.relative(outputDirectory, inputPath);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

async function writeLayoutArtifactDirectory(
  outputDirectory: string,
  report: LayoutSolveReport,
  layoutSolveReportHash: string,
  normalizedWorldIr: NormalizedWorldIRV4,
  normalizedWorldIrHash: string,
  options: LayoutArtifactWriteOptions,
): Promise<{
  readonly integrityManifestHash: string;
  readonly backupGarbageCollection: "complete" | "deferred";
  readonly deferredBackupDirectory?: string;
}> {
  const absoluteOutputDirectory = path.resolve(outputDirectory);
  await mkdir(path.dirname(absoluteOutputDirectory), { recursive: true });
  const temporaryDirectory = await mkdtemp(
    path.join(
      path.dirname(absoluteOutputDirectory),
      `.${path.basename(absoluteOutputDirectory)}.tmp-`,
    ),
  );
  const reportBytes = `${stringifyCanonicalJson(report)}\n`;
  const normalizedWorldIrBytes = `${stringifyCanonicalJson(normalizedWorldIr)}\n`;
  const integrity = {
    kind: "worldkit-layout-artifact-integrity",
    schemaVersion: 1,
    layoutSolveReportHash,
    normalizedWorldIrHash,
    filesByName: {
      "layout-report.json": {
        byteLength: Buffer.byteLength(reportBytes),
        byteContentHash: sha256Bytes(reportBytes),
      },
      "normalized-world-ir.json": {
        byteLength: Buffer.byteLength(normalizedWorldIrBytes),
        byteContentHash: sha256Bytes(normalizedWorldIrBytes),
      },
    },
  } as const;
  const integrityManifestHash = sha256CanonicalJson(integrity);
  try {
    await Promise.all([
      writeFile(path.join(temporaryDirectory, "layout-report.json"), reportBytes),
      writeFile(
        path.join(temporaryDirectory, "normalized-world-ir.json"),
        normalizedWorldIrBytes,
      ),
      writeFile(
        path.join(temporaryDirectory, "integrity.json"),
        `${stringifyCanonicalJson(integrity)}\n`,
      ),
    ]);
    const promotion = await promoteArtifactDirectory({
      temporaryDirectory,
      targetDirectory: absoluteOutputDirectory,
      expectedFilenames: LAYOUT_ARTIFACT_FILENAMES,
      ...(options.promotionFileSystem === undefined
        ? {}
        : { fileSystem: options.promotionFileSystem }),
    });
    return {
      integrityManifestHash,
      backupGarbageCollection: promotion.backupGarbageCollection,
      ...(promotion.backupGarbageCollection === "complete"
        ? {}
        : { deferredBackupDirectory: promotion.deferredBackupDirectory }),
    };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function layoutSolveFile(
  inputPath: string,
  outputDirectory: string,
  options: LayoutArtifactWriteOptions = {},
): Promise<LayoutSolveSuccess | LayoutCommandFailure> {
  const input = await readParsedAuthoring(inputPath);
  if (!input.ok) return input;
  const absoluteOutputDirectory = path.resolve(outputDirectory);
  if (isInputInsideOutput(input.absoluteInputPath, absoluteOutputDirectory)) {
    return layoutFailure(
      2,
      "LAYOUT_OUTPUT_CONTAINS_INPUT",
      "Layout output directory must not contain or replace the AuthoringSpec input.",
    );
  }
  const normalized = normalizeAuthoringSpecV4(input.spec);
  const report = normalized.layoutSolveReport;
  const reportHash = normalized.layoutSolveReportHash;
  if (report === undefined || reportHash === undefined) {
    return {
      ok: false,
      exitCode: 2,
      diagnostics: normalized.diagnostics,
    };
  }
  if (report.status !== "solved") {
    const exitCode = report.status === "unsatisfied"
      ? 3
      : report.status === "budget-exceeded"
        ? 4
        : 2;
    return {
      ok: false,
      exitCode,
      status: report.status,
      layoutSolveReportHash: reportHash,
      diagnostics: normalized.diagnostics,
    };
  }
  if (
    !normalized.ok ||
    normalized.value === undefined ||
    normalized.normalizedWorldIrHash === undefined
  ) {
    return layoutFailure(
      2,
      "LAYOUT_NORMALIZED_WORLD_MISSING",
      "Solved layout did not produce a NormalizedWorldIR.",
    );
  }
  try {
    const publication = await writeLayoutArtifactDirectory(
      absoluteOutputDirectory,
      report,
      reportHash,
      normalized.value,
      normalized.normalizedWorldIrHash,
      options,
    );
    return {
      ok: true,
      exitCode: 0,
      kind: "worldkit-layout-solve",
      schemaVersion: 1,
      diagnostics: [],
      status: "solved",
      outputPath: absoluteOutputDirectory,
      layoutSolveReportHash: reportHash,
      normalizedWorldIrHash: normalized.normalizedWorldIrHash,
      integrityManifestHash: publication.integrityManifestHash,
      backupGarbageCollection: publication.backupGarbageCollection,
      ...(publication.deferredBackupDirectory === undefined
        ? {}
        : { deferredBackupDirectory: publication.deferredBackupDirectory }),
    };
  } catch {
    return layoutFailure(
      5,
      "LAYOUT_ARTIFACT_PUBLICATION_FAILED",
      "Unable to publish the complete layout artifact directory.",
    );
  }
}

function isLayoutSolveReport(value: unknown): value is LayoutSolveReport {
  if (value === null || typeof value !== "object") return false;
  const report = value as Partial<LayoutSolveReport>;
  return report.kind === "worldkit-layout-solve-report" &&
    report.schemaVersion === 1 &&
    typeof report.id === "string" &&
    ["solved", "unsatisfied", "budget-exceeded", "invalid-input"].includes(
      String(report.status),
    ) &&
    report.placementsByEntityId !== null &&
    typeof report.placementsByEntityId === "object" &&
    report.constraintResultsById !== null &&
    typeof report.constraintResultsById === "object" &&
    Array.isArray(report.diagnostics);
}

export type LayoutExplainSelector =
  | Readonly<{ entityId: string; constraintId?: never }>
  | Readonly<{ constraintId: string; entityId?: never }>;

export async function layoutExplainFile(
  reportPath: string,
  selector: LayoutExplainSelector,
) {
  const input = await readWorldkitInput(reportPath);
  if (!input.ok) return processInputFailure(input);
  const parsed = parseCanonicalJson(input.sourceText);
  if (!parsed.ok) {
    return { ok: false as const, exitCode: 2 as const, diagnostics: parsed.diagnostics };
  }
  if (!isLayoutSolveReport(parsed.value)) {
    return layoutFailure(
      2,
      "LAYOUT_REPORT_INVALID",
      "Input must be a worldkit-layout-solve-report at schemaVersion 1.",
    );
  }
  const report = parsed.value;
  const layoutSolveReportHash = sha256CanonicalJson(report);
  if (selector.entityId !== undefined) {
    const entity = report.placementsByEntityId[selector.entityId];
    if (entity === undefined) {
      return layoutFailure(
        2,
        "LAYOUT_ENTITY_NOT_FOUND",
        `Layout Entity '${selector.entityId}' is not present in the report.`,
        {
          details: {
            entityId: selector.entityId,
            availableEntityIds: Object.keys(report.placementsByEntityId).sort(),
          },
        },
      );
    }
    const constraintResults = Object.entries(report.constraintResultsById)
      .filter(([, result]) => result.evidenceIds.includes(selector.entityId))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, result]) => structuredClone(result));
    return {
      ok: true as const,
      exitCode: 0 as const,
      kind: "worldkit-layout-explanation" as const,
      schemaVersion: 1 as const,
      diagnostics: [] as const,
      layoutSolveReportHash,
      reportStatus: report.status,
      selector: { kind: "entity" as const, entityId: selector.entityId },
      entity: structuredClone(entity),
      constraintResults,
    };
  }
  const constraintId = selector.constraintId;
  const constraintResult = report.constraintResultsById[constraintId];
  if (constraintResult === undefined) {
    return layoutFailure(
      2,
      "LAYOUT_CONSTRAINT_NOT_FOUND",
      `Placement Constraint '${constraintId}' is not present in the report.`,
      {
        details: {
          constraintId,
          availableConstraintIds: Object.keys(report.constraintResultsById).sort(),
        },
      },
    );
  }
  return {
    ok: true as const,
    exitCode: 0 as const,
    kind: "worldkit-layout-explanation" as const,
    schemaVersion: 1 as const,
    diagnostics: [] as const,
    layoutSolveReportHash,
    reportStatus: report.status,
    selector: { kind: "constraint" as const, constraintId },
    constraint: structuredClone(constraintResult),
    placements: constraintResult.evidenceIds
      .flatMap((entityId) => {
        const placement = report.placementsByEntityId[entityId];
        return placement === undefined ? [] : [structuredClone(placement)];
      })
      .sort((left, right) => left.entityId.localeCompare(right.entityId)),
  };
}
