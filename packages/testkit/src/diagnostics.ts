import type { Diagnostic, DiagnosticSummary } from "./types.js";

const SEVERITY_RANK: Readonly<Record<Diagnostic["severity"], number>> = {
  info: 0,
  warning: 1,
  error: 2,
};

export function mergeDiagnostics(
  ...groups: readonly (readonly Diagnostic[])[]
): Diagnostic[] {
  return groups.flat();
}

export function summarizeDiagnostics(
  diagnostics: readonly Diagnostic[],
): DiagnosticSummary {
  const bySeverity: Record<Diagnostic["severity"], number> = {
    info: 0,
    warning: 0,
    error: 0,
  };
  const byCode: Record<string, number> = {};
  let maxSeverity: Diagnostic["severity"] | null = null;

  for (const diagnostic of diagnostics) {
    bySeverity[diagnostic.severity] += 1;
    byCode[diagnostic.code] = (byCode[diagnostic.code] ?? 0) + 1;
    if (
      maxSeverity === null ||
      SEVERITY_RANK[diagnostic.severity] > SEVERITY_RANK[maxSeverity]
    ) {
      maxSeverity = diagnostic.severity;
    }
  }

  return {
    diagnostics,
    total: diagnostics.length,
    bySeverity,
    byCode,
    maxSeverity,
    hasErrors: bySeverity.error > 0,
  };
}
