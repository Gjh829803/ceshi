import { sha256CanonicalJson } from "@whitebox-world/protocol";

import type { Sha256HashV1, ValidationReportV1 } from "./types";

export * from "./types";
export * from "./profile";
export * from "./policy";
export * from "./validate";

export function hashValidationReportV1(
  report: ValidationReportV1,
): Sha256HashV1 {
  return sha256CanonicalJson(report) as Sha256HashV1;
}
