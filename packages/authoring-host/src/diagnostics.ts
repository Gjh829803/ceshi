import {
  parseWorldChangeDiagnosticV1,
  type AuthoringEditBudgetIdV1,
  type WorldChangeDiagnosticDetailsV1,
  type WorldChangeDiagnosticV1,
  type WorldChangeFailurePhaseV1,
} from "@whitebox-world/authoring-edit";
import { isNil } from "lodash-es";

import type { PrepareTrustedCandidateResultV1 } from "./types.js";

export function worldChangeDiagnostic(
  code: WorldChangeDiagnosticV1["code"],
  instancePath: string,
  message: string,
  details?: WorldChangeDiagnosticDetailsV1,
): WorldChangeDiagnosticV1 {
  return parseWorldChangeDiagnosticV1({
    severity: "error",
    code,
    instancePath,
    message,
    ...(isNil(details) ? {} : { details }),
  });
}

export function admissionBudgetDiagnostic(
  budgetId: AuthoringEditBudgetIdV1,
  instancePath: string,
  limit: number,
  actual: number,
): WorldChangeDiagnosticV1 {
  return worldChangeDiagnostic(
    "WORLD_CHANGE_ADMISSION_BUDGET_EXCEEDED",
    instancePath,
    `Authoring/Edit workload budget '${budgetId}' was exceeded.`,
    { kind: "admission-budget", budgetId, limit, actual },
  );
}

export function rejectedPrepare(
  failurePhase: WorldChangeFailurePhaseV1,
  diagnostics: readonly WorldChangeDiagnosticV1[],
): Extract<PrepareTrustedCandidateResultV1, { status: "rejected" }> {
  return {
    status: "rejected",
    failurePhase,
    diagnostics,
  };
}
