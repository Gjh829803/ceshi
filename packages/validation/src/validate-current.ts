import type {
  ControlCaptureValidationProfileV1,
  ControlCaptureValidationReportV1,
  ValidationContractResultV1,
  ValidationProfileV1,
  ValidationReportV1,
} from "./types";
import type {
  WorldPackageValidationProfileV1,
  WorldPackageValidationReportV1,
} from "./world-package-validation-types";
import {
  validateControlCaptureValidationProfileV1,
  validateControlCaptureValidationReportV1,
} from "./validate-control-capture";
import {
  validateWorldPackageValidationProfileV1,
  validateWorldPackageValidationReportV1,
} from "./validate-world-package";

function objectField(value: unknown, field: string): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return (value as Readonly<Record<string, unknown>>)[field];
}

export function validateValidationProfileV1(
  value: ControlCaptureValidationProfileV1,
): ValidationContractResultV1<ControlCaptureValidationProfileV1>;
export function validateValidationProfileV1(
  value: WorldPackageValidationProfileV1,
): ValidationContractResultV1<WorldPackageValidationProfileV1>;
export function validateValidationProfileV1(
  value: unknown,
): ValidationContractResultV1<ValidationProfileV1>;
export function validateValidationProfileV1(
  value: unknown,
): ValidationContractResultV1<ValidationProfileV1> {
  return objectField(value, "subjectKind") === "world-package"
    ? validateWorldPackageValidationProfileV1(value)
    : validateControlCaptureValidationProfileV1(value);
}

export function validateValidationReportV1(
  value: ControlCaptureValidationReportV1,
): ValidationContractResultV1<ControlCaptureValidationReportV1>;
export function validateValidationReportV1(
  value: WorldPackageValidationReportV1,
): ValidationContractResultV1<WorldPackageValidationReportV1>;
export function validateValidationReportV1(
  value: unknown,
): ValidationContractResultV1<ValidationReportV1>;
export function validateValidationReportV1(
  value: unknown,
): ValidationContractResultV1<ValidationReportV1> {
  return objectField(objectField(value, "subject"), "kind") === "world-package"
    ? validateWorldPackageValidationReportV1(value)
    : validateControlCaptureValidationReportV1(value);
}
