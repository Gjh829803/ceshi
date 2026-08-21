import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  normalizeAuthoringSpec,
  normalizeAuthoringSpecV4,
  parseAuthoringSpecJson,
  parseAuthoringSpecV4,
  type AuthoringDiagnostic,
  type NormalizedWorldIRV3,
  type NormalizedWorldIRV4,
} from "@whitebox-world/authoring";
import { compileWorld, compileWorldV5 } from "@whitebox-world/compiler";
import type {
  CompileDiagnostic,
  ExecutionPlanV4,
  ExecutionPlanV5,
} from "@whitebox-world/runtime-contracts";

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

export interface WorldkitPipelineSuccess {
  ok: true;
  exitCode: 0;
  diagnostics: readonly [];
  absoluteInputPath: string;
  normalizedWorldIr: NormalizedWorldIRV3;
  normalizedWorldIrHash: string;
  executionPlan: ExecutionPlanV4;
  executionPlanHash: string;
}

export interface WorldkitRoutePipelineSuccess {
  ok: true;
  exitCode: 0;
  diagnostics: readonly [];
  absoluteInputPath: string;
  normalizedWorldIr: NormalizedWorldIRV4;
  normalizedWorldIrHash: string;
  executionPlan: ExecutionPlanV5;
  executionPlanHash: string;
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

export async function loadWorldkitPipeline(
  inputPath: string,
): Promise<WorldkitPipelineSuccess | WorldkitFailure> {
  const input = await readWorldkitInput(inputPath);
  if (!input.ok) return input;

  const parsed = parseAuthoringSpecJson(input.sourceText);
  if (!parsed.ok || parsed.value === undefined) {
    return { ok: false, exitCode: 2, diagnostics: parsed.diagnostics };
  }
  const normalized = normalizeAuthoringSpec(parsed.value);
  if (
    !normalized.ok ||
    normalized.value === undefined ||
    normalized.normalizedWorldIrHash === undefined
  ) {
    return { ok: false, exitCode: 2, diagnostics: normalized.diagnostics };
  }
  const compiled = compileWorld({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
  });
  if (
    !compiled.ok ||
    compiled.executionPlan === undefined ||
    compiled.executionPlanHash === undefined
  ) {
    return { ok: false, exitCode: 2, diagnostics: compiled.diagnostics };
  }
  return {
    ok: true,
    exitCode: 0,
    diagnostics: [],
    absoluteInputPath: input.absoluteInputPath,
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    executionPlan: compiled.executionPlan,
    executionPlanHash: compiled.executionPlanHash,
  };
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
    normalized.normalizedWorldIrHash === undefined) {
    return { ok: false, exitCode: 2, diagnostics: normalized.diagnostics };
  }
  const compiled = compileWorldV5({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
  });
  if (!compiled.ok || compiled.executionPlan === undefined ||
    compiled.executionPlanHash === undefined) {
    return { ok: false, exitCode: 2, diagnostics: compiled.diagnostics };
  }
  return {
    ok: true,
    exitCode: 0,
    diagnostics: [],
    absoluteInputPath: input.absoluteInputPath,
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    executionPlan: compiled.executionPlan,
    executionPlanHash: compiled.executionPlanHash,
  };
}
