import { sha256CanonicalJson } from "@whitebox-world/protocol";

import type { Sha256HashV1, ValidationReportV1 } from "./types";
import type { ValidationReportV2 } from "./types-v2";

export * from "./types";
export * from "./types-v2";
export * from "./profile";
export * from "./profile-v2";
export * from "./policy";
export * from "./validate";
export * from "./validate-v2";
export * from "./route";
export * from "./route-evaluator";
export * from "./route-validation-set";
export * from "./route-runtime-probe";
export * from "./world-package-validation-subject";
export * from "./route-evidence-publication";

export function hashValidationReportV1(
  report: ValidationReportV1,
): Sha256HashV1 {
  return sha256CanonicalJson(report) as Sha256HashV1;
}

export function hashValidationReportV2(
  report: ValidationReportV2,
): Sha256HashV1 {
  return sha256CanonicalJson(report) as Sha256HashV1;
}
