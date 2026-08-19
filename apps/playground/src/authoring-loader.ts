import {
  normalizeAuthoringSpecV2,
  parseAuthoringSpecJsonV2,
  type AuthoringDiagnostic,
} from "@whitebox-world/authoring";
import { compileWorldV3 } from "@whitebox-world/compiler";
import type {
  CompileDiagnostic,
  ExecutionPlanV3,
} from "@whitebox-world/runtime-contracts";

export interface AuthoringSceneLoadResult {
  ok: boolean;
  executionPlan?: ExecutionPlanV3;
  normalizedWorldIrHash?: string;
  executionPlanHash?: string;
  diagnostics: readonly (AuthoringDiagnostic | CompileDiagnostic)[];
}

export type AuthoringSourceFetcher = () => Promise<Response>;

function sourceDiagnostic(message: string, details?: Readonly<Record<string, unknown>>): AuthoringSceneLoadResult {
  return {
    ok: false,
    diagnostics: [
      {
        severity: "error",
        code: "AUTHORING_SOURCE_UNAVAILABLE",
        instancePath: "",
        message,
        ...(details === undefined ? {} : { details }),
      },
    ],
  };
}

export async function loadAuthoringScene(
  fetchSource: AuthoringSourceFetcher = () => fetch("/__worldkit/authoring-spec", { cache: "no-store" }),
): Promise<AuthoringSceneLoadResult> {
  let response: Response;
  try {
    response = await fetchSource();
  } catch (error) {
    return sourceDiagnostic("Unable to fetch the configured AuthoringSpec.", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!response.ok) {
    return sourceDiagnostic(`AuthoringSpec source returned HTTP ${response.status}.`, {
      status: response.status,
    });
  }

  let sourceText: string;
  try {
    sourceText = await response.text();
  } catch (error) {
    return sourceDiagnostic("Unable to read the configured AuthoringSpec response.", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  const parsed = parseAuthoringSpecJsonV2(sourceText);
  if (!parsed.ok || parsed.value === undefined) return { ok: false, diagnostics: parsed.diagnostics };
  const normalized = normalizeAuthoringSpecV2(parsed.value);
  if (!normalized.ok || normalized.value === undefined || normalized.normalizedWorldIrHash === undefined) {
    return { ok: false, diagnostics: normalized.diagnostics };
  }
  const compiled = compileWorldV3({
    normalizedWorldIr: normalized.value,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
  });
  if (!compiled.ok || compiled.executionPlan === undefined || compiled.executionPlanHash === undefined) {
    return { ok: false, diagnostics: compiled.diagnostics };
  }
  return {
    ok: true,
    executionPlan: compiled.executionPlan,
    normalizedWorldIrHash: normalized.normalizedWorldIrHash,
    executionPlanHash: compiled.executionPlanHash,
    diagnostics: [],
  };
}
