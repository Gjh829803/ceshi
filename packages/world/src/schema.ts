import type { Diagnostic } from "@whitebox-world/contracts";

export type ParameterType =
  | "number"
  | "positiveNumber"
  | "integer"
  | "string"
  | "boolean"
  | "vec2"
  | "vec3"
  | "array"
  | "object";

export interface ParameterRule {
  type: ParameterType;
  optional?: boolean;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  values?: readonly unknown[];
  validate?: (value: unknown) => string | undefined;
}

export type ParameterSchema = Readonly<Record<string, ParameterType | ParameterRule>>;

export interface ParameterValidationResult<P extends object> {
  value: P;
  diagnostics: Diagnostic[];
}

function normalizeRule(rule: ParameterType | ParameterRule): ParameterRule {
  return typeof rule === "string" ? { type: rule } : rule;
}

function matchesType(value: unknown, type: ParameterType): boolean {
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "positiveNumber") return typeof value === "number" && Number.isFinite(value) && value > 0;
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (type === "string") return typeof value === "string";
  if (type === "boolean") return typeof value === "boolean";
  if (type === "array") return Array.isArray(value);
  if (type === "object") return typeof value === "object" && value !== null && !Array.isArray(value);
  if (type === "vec2") {
    return Array.isArray(value) && value.length === 2 && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
  }
  return Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

export function validateParameters<P extends object>(schema: ParameterSchema, params: P): ParameterValidationResult<P> {
  const result = { ...(params as Record<string, unknown>) };
  const diagnostics: Diagnostic[] = [];

  for (const [name, rawRule] of Object.entries(schema)) {
    const rule = normalizeRule(rawRule);
    let value = result[name];
    if (value === undefined && rule.default !== undefined) {
      value = cloneValue(rule.default);
      result[name] = value;
    }
    if (value === undefined) {
      if (!rule.optional) {
        diagnostics.push({
          severity: "error",
          code: "FEATURE_PARAMETER_REQUIRED",
          message: `Required feature parameter \"${name}\" is missing.`,
        });
      }
      continue;
    }
    if (!matchesType(value, rule.type)) {
      diagnostics.push({
        severity: "error",
        code: "FEATURE_PARAMETER_TYPE",
        message: `Feature parameter \"${name}\" must be ${rule.type}.`,
      });
      continue;
    }
    if (typeof value === "number" && rule.minimum !== undefined && value < rule.minimum) {
      diagnostics.push({
        severity: "error",
        code: "FEATURE_PARAMETER_MINIMUM",
        message: `Feature parameter \"${name}\" must be at least ${rule.minimum}.`,
      });
    }
    if (typeof value === "number" && rule.maximum !== undefined && value > rule.maximum) {
      diagnostics.push({
        severity: "error",
        code: "FEATURE_PARAMETER_MAXIMUM",
        message: `Feature parameter \"${name}\" must be at most ${rule.maximum}.`,
      });
    }
    if (rule.values && !rule.values.some((allowed) => Object.is(allowed, value))) {
      diagnostics.push({
        severity: "error",
        code: "FEATURE_PARAMETER_VALUE",
        message: `Feature parameter \"${name}\" is not one of the allowed values.`,
      });
    }
    const customError = rule.validate?.(value);
    if (customError) {
      diagnostics.push({
        severity: "error",
        code: "FEATURE_PARAMETER_CUSTOM",
        message: `Feature parameter \"${name}\": ${customError}`,
      });
    }
  }

  for (const name of Object.keys(result)) {
    if (!(name in schema)) {
      diagnostics.push({
        severity: "warning",
        code: "FEATURE_PARAMETER_UNKNOWN",
        message: `Unknown feature parameter \"${name}\" will be passed through.`,
      });
    }
  }

  return { value: result as P, diagnostics };
}
