import type { ErrorObject } from "ajv";
import { validateSubjectDefinitionV1, validateSubjectDesign } from "./subject-validators.generated.mjs";
export type { SubjectDesignV1 } from "./types.js";
import { isEmpty } from "lodash-es";

import { FIRST_BATCH_ALLOWED_OVERRIDE_PATHS_V1 } from "./types";
import type {
  AuthoringDiagnostic,
  AuthoringResult,
  PackageSubjectDefinitionV1,
  SubjectDesignV1,
} from "./types";

function diagnosticFor(error: ErrorObject): AuthoringDiagnostic {
  const details: Record<string, unknown> = {
    keyword: error.keyword,
    schemaPath: error.schemaPath,
    params: error.params,
  };
  const missingOrAdditionalProperty =
    error.keyword === "required"
      ? (error.params.missingProperty as string | undefined)
      : error.keyword === "additionalProperties"
        ? (error.params.additionalProperty as string | undefined)
        : undefined;
  const escapedProperty = missingOrAdditionalProperty
    ?.replace(/~/g, "~0")
    .replace(/\//g, "~1");
  return {
    severity: "error",
    code: "AUTHORING_SCHEMA_INVALID",
    instancePath:
      escapedProperty === undefined
        ? error.instancePath
        : `${error.instancePath}/${escapedProperty}`,
    message: error.message ?? "AuthoringSpec does not match the canonical schema.",
    details,
  };
}

function allowedOverridePathsDiagnostics(
  paths: readonly string[],
  instancePath: string,
): AuthoringDiagnostic[] {
  const diagnostics: AuthoringDiagnostic[] = [];
  let previous: string | undefined;
  paths.forEach((path, index) => {
    if (
      previous !== undefined &&
      previous.localeCompare(path) >= 0
    ) {
      diagnostics.push({
        severity: "error",
        code: "AUTHORING_SCHEMA_INVALID",
        instancePath: `${instancePath}/${index}`,
        message: "allowedOverridePaths must be lexicographically sorted.",
      });
    }
    previous = path;
    if (
      !FIRST_BATCH_ALLOWED_OVERRIDE_PATHS_V1.some((allowedPath) => allowedPath === path)
    ) {
      diagnostics.push({
        severity: "error",
        code: "AUTHORING_SCHEMA_INVALID",
        instancePath: `${instancePath}/${index}`,
        message:
          `allowedOverridePaths entry '${path}' is outside the first-batch ceiling.`,
      });
    }
  });
  return diagnostics;
}

export function validatePackageSubjectDefinition(
  value: unknown,
): AuthoringResult<PackageSubjectDefinitionV1> {
  if (!validateSubjectDefinitionV1(value)) {
    return {
      ok: false,
      diagnostics: (validateSubjectDefinitionV1.errors ?? []).map(diagnosticFor),
    };
  }
  const definition = value as PackageSubjectDefinitionV1;
  const diagnostics = allowedOverridePathsDiagnostics(
    definition.allowedOverridePaths,
    "/allowedOverridePaths",
  );
  return isEmpty(diagnostics)
    ? { ok: true, value: definition, diagnostics: [] }
    : { ok: false, diagnostics };
}

/** Uses the same Subject field schemas; does not resolve resources or select capabilities. */
export function validateSubjectDesignV1(value: unknown): AuthoringResult<SubjectDesignV1> {
  const validate = validateSubjectDesign;
  return validate(value)
    ? { ok: true, value, diagnostics: [] }
    : { ok: false, diagnostics: (validate.errors ?? []).map(diagnosticFor) };
}
