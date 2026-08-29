import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  normalizeAuthoringSpecV4,
  parseAuthoringSpecV4,
  type AuthoringDiagnostic,
  type AuthoringSpecV4,
  type NormalizeAuthoringResultV4,
  type NormalizedWorldIRV4,
} from "@whitebox-world/authoring";
import {
  compileCanonicalWorldV1,
  type CompileDiagnostic,
} from "@whitebox-world/compiler";
import { createCoreGameplayBootstrapV1 } from "@whitebox-world/gameplay";
import {
  createGameplayBootstrapResourceLockEntryV1,
  type GameplayBootstrapV1,
} from "@whitebox-world/gameplay-contracts";
import type {
  CanonicalSceneExecutionPlanV1,
  WorldRuntimeBootstrapV1,
} from "@whitebox-world/runtime-contracts";
import { isNil } from "lodash-es";

export interface CliDiagnostic {
  severity: "info" | "warning" | "error";
  code: string;
  instancePath: string;
  message: string;
  details?: Readonly<Record<string, unknown>>;
}

export type WorldkitDiagnostic =
  | AuthoringDiagnostic
  | CompileDiagnostic
  | CliDiagnostic;

export interface WorldkitFailure {
  ok: false;
  exitCode: 2;
  diagnostics: readonly WorldkitDiagnostic[];
}

export interface WorldkitRoutePipelineSuccess {
  ok: true;
  exitCode: 0;
  diagnostics: readonly [];
  absoluteInputPath: string;
  authoringSpec: AuthoringSpecV4;
  normalizedWorldIr: NormalizedWorldIRV4;
  normalizedWorldIrHash: string;
  layoutSolveReport: NonNullable<NormalizeAuthoringResultV4["layoutSolveReport"]>;
  layoutSolveReportHash: `sha256:${string}`;
  gameplayBootstrap: GameplayBootstrapV1;
  executionPlan: CanonicalSceneExecutionPlanV1;
  executionPlanHash: string;
  worldRuntimeBootstrap: WorldRuntimeBootstrapV1;
}

function createRuntimeGameplayBootstrap(
  normalizedWorldIr: NormalizedWorldIRV4,
): GameplayBootstrapV1 {
  const entityDescriptors = normalizedWorldIr.nodes
    .filter((node) => node.kind === "subject")
    .map((node) => {
      const definition = normalizedWorldIr.resources.subjectDefinitions.find(
        (candidate) =>
          candidate.subjectDefinitionRef === node.subjectDefinitionRef,
      );
      if (isNil(definition)) {
        throw new Error(
          `WORLDKIT_PIPELINE_GAMEPLAY_SUBJECT_DEFINITION_MISSING: ${node.subjectDefinitionRef}`,
        );
      }
      return {
        id: node.id,
        entityDefinitionRef: node.subjectDefinitionRef,
        capabilityRefs: definition.capabilityRefs,
      };
    });
  return createCoreGameplayBootstrapV1({
    worldId: normalizedWorldIr.id,
    worldSeed: normalizedWorldIr.seed,
    entityDescriptors,
    initialRelationshipStates: normalizedWorldIr.relationships.map(
      (relationship) => ({ ...relationship, establishedSimulationTick: 0 }),
    ),
  });
}

export function cliFailure(
  code: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): WorldkitFailure {
  return {
    ok: false,
    exitCode: 2,
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

export async function readWorldkitInput(
  inputPath: string,
): Promise<
  | { ok: true; absoluteInputPath: string; sourceText: string }
  | WorldkitFailure
> {
  const absoluteInputPath = path.resolve(inputPath);
  try {
    return {
      ok: true,
      absoluteInputPath,
      sourceText: await readFile(absoluteInputPath, "utf8"),
    };
  } catch (error) {
    return cliFailure(
      "CLI_INPUT_UNAVAILABLE",
      `Unable to read input file '${absoluteInputPath}'.`,
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }
}

export async function loadWorldkitRoutePipeline(
  inputPath: string,
): Promise<WorldkitRoutePipelineSuccess | WorldkitFailure> {
  const input = await readWorldkitInput(inputPath);
  if (!input.ok) return input;

  const parsed = parseAuthoringSpecV4(input.sourceText);
  if (!parsed.ok || parsed.value === undefined) {
    return { ok: false, exitCode: 2, diagnostics: parsed.diagnostics };
  }
  const normalized = normalizeAuthoringSpecV4(parsed.value);
  if (!normalized.ok || normalized.value === undefined ||
    normalized.normalizedWorldIrHash === undefined ||
    normalized.layoutSolveReport === undefined ||
    normalized.layoutSolveReportHash === undefined) {
    return { ok: false, exitCode: 2, diagnostics: normalized.diagnostics };
  }
  const gameplayBootstrap = createRuntimeGameplayBootstrap(normalized.value);
  const compiled = compileCanonicalWorldV1({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    gameplayBootstrap,
    worldRuntimeBootstrapRef:
      `worldkit://world-runtime-bootstrap/${normalized.value.id}@1`,
  });
  if (!compiled.ok) {
    return { ok: false, exitCode: 2, diagnostics: compiled.diagnostics };
  }
  return {
    ok: true,
    exitCode: 0,
    diagnostics: [],
    absoluteInputPath: input.absoluteInputPath,
    authoringSpec: parsed.value,
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    layoutSolveReport: normalized.layoutSolveReport,
    layoutSolveReportHash: normalized.layoutSolveReportHash,
    gameplayBootstrap,
    executionPlan: compiled.canonicalSceneExecutionPlan,
    executionPlanHash: compiled.executionPlanHash,
    worldRuntimeBootstrap: compiled.worldRuntimeBootstrap,
  };
}
