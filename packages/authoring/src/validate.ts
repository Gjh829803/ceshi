import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import subjectDefinitionV1Schema from "./subject-definition-v1.schema.json";
import type {
  AuthoringDiagnostic,
  AuthoringResult,
  PackageSubjectDefinitionV1,
} from "./types";
import type { AuthoringSpecV4 } from "./types-v4.js";
import { validateAuthoringSpecV4 } from "./validate-v4.js";

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  validateFormats: true,
});
addFormats(ajv);
ajv.addFormat("worldkit-resource-ref", {
  type: "string",
  validate: (value: string) =>
    /^(?:worldkit|package|asset):\/\/[a-z0-9][a-z0-9./_-]*(?:@[1-9][0-9]*)?$/.test(value),
});
ajv.addFormat("subject-definition-ref", {
  type: "string",
  validate: (value: string) =>
    /^(?:worldkit|package):\/\/subject-definition\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/.test(
      value,
    ),
});
ajv.addFormat("capability-ref", {
  type: "string",
  validate: (value: string) =>
    /^worldkit:\/\/capability\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/.test(value),
});
ajv.addFormat("physics-body-profile-ref", {
  type: "string",
  validate: (value: string) =>
    /^worldkit:\/\/physics-body-profile\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/.test(
      value,
    ),
});
ajv.addFormat("locomotion-profile-ref", {
  type: "string",
  validate: (value: string) =>
    /^worldkit:\/\/locomotion-profile\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/.test(value),
});
ajv.addFormat("collider-derivation-profile-ref", {
  type: "string",
  validate: (value: string) =>
    /^worldkit:\/\/collider-derivation-profile\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/.test(
      value,
    ),
});
ajv.addFormat("package-prototype-ref", {
  type: "string",
  validate: (value: string) =>
    /^package:\/\/prototype\/[a-z0-9][a-z0-9.-]{0,63}@[1-9][0-9]*$/.test(value),
});

ajv.addSchema(subjectDefinitionV1Schema);

const validateSubjectDefinitionV1 = (() => {
  const registeredValidator = ajv.getSchema<PackageSubjectDefinitionV1>(
    "worldkit://schema/subject-definition@1",
  );
  if (registeredValidator === undefined) {
    throw new Error("SUBJECT_DEFINITION_SCHEMA_NOT_REGISTERED");
  }
  return registeredValidator;
})();

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

export function validateAuthoringSpec(value: unknown): AuthoringResult<AuthoringSpecV4> {
  return validateAuthoringSpecV4(value);
}

export function validatePackageSubjectDefinition(
  value: unknown,
): AuthoringResult<PackageSubjectDefinitionV1> {
  if (validateSubjectDefinitionV1(value)) {
    return { ok: true, value: value as PackageSubjectDefinitionV1, diagnostics: [] };
  }
  return {
    ok: false,
    diagnostics: (validateSubjectDefinitionV1.errors ?? []).map(diagnosticFor),
  };
}
