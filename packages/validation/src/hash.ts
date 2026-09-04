import type { Sha256HashV1 } from "@whitebox-world/protocol";

import { sha256CanonicalJson } from "@whitebox-world/protocol";

import type { ValidationReportV1 } from "./types";

export function hashValidationReportV1(
  report: ValidationReportV1,
): Sha256HashV1 {
  return sha256CanonicalJson(report) as Sha256HashV1;
}
