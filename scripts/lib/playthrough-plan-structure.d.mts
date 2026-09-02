export type PlaythroughPlanStructureDiagnostic = {
  code: string;
  path: string;
  message: string;
};

export function validatePlaythroughPlanStructure(
  value: unknown,
  expected?: { sceneId?: string; navigationEvidence?: unknown },
):
  | { ok: true; value: Record<string, unknown>; diagnostics: [] }
  | { ok: false; diagnostics: PlaythroughPlanStructureDiagnostic[] };
