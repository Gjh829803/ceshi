import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import schema from "./authoring-spec-v1.schema.json";
import type { AuthoringDiagnostic, AuthoringResult, AuthoringSpecV1 } from "./types";

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

const validate = ajv.compile<AuthoringSpecV1>(schema);

function diagnosticFor(error: ErrorObject): AuthoringDiagnostic {
  const details: Record<string, unknown> = {
    keyword: error.keyword,
    schemaPath: error.schemaPath,
    params: error.params,
  };
  return {
    severity: "error",
    code: "AUTHORING_SCHEMA_INVALID",
    instancePath: error.instancePath,
    message: error.message ?? "AuthoringSpec does not match the canonical schema.",
    details,
  };
}

export function validateAuthoringSpec(value: unknown): AuthoringResult<AuthoringSpecV1> {
  if (validate(value)) return { ok: true, value, diagnostics: [] };
  return {
    ok: false,
    diagnostics: (validate.errors ?? []).map(diagnosticFor),
  };
}
