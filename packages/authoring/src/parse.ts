import {
  getNodeValue,
  parseTree,
  printParseErrorCode,
  type Node,
  type ParseError,
} from "jsonc-parser";

import type {
  AuthoringDiagnostic,
  AuthoringResult,
} from "./types";
import type { AuthoringSpecV3 } from "./types-v3.js";
import { validateAuthoringSpecV3 } from "./validate-v3.js";

const MAX_AUTHORING_JSON_BYTES = 8 * 1024 * 1024;

function pointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function findDuplicateKeys(
  node: Node,
  instancePath: string,
  diagnostics: AuthoringDiagnostic[],
): void {
  if (node.type === "object") {
    const seen = new Set<string>();
    for (const property of node.children ?? []) {
      const keyNode = property.children?.[0];
      const valueNode = property.children?.[1];
      if (keyNode === undefined || valueNode === undefined) continue;
      const key = String(getNodeValue(keyNode));
      const path = `${instancePath}/${pointerSegment(key)}`;
      if (seen.has(key)) {
        diagnostics.push({
          severity: "error",
          code: "AUTHORING_JSON_DUPLICATE_KEY",
          instancePath: path,
          message: `Duplicate JSON object key "${key}" is not allowed.`,
        });
      } else {
        seen.add(key);
      }
      findDuplicateKeys(valueNode, path, diagnostics);
    }
    return;
  }
  if (node.type === "array") {
    for (const [index, child] of (node.children ?? []).entries()) {
      findDuplicateKeys(child, `${instancePath}/${index}`, diagnostics);
    }
  }
}

export function parseCanonicalJson(sourceText: string): AuthoringResult<unknown> {
  if (new TextEncoder().encode(sourceText).byteLength > MAX_AUTHORING_JSON_BYTES) {
    return {
      ok: false,
      diagnostics: [{
        severity: "error",
        code: "AUTHORING_JSON_TOO_LARGE",
        instancePath: "",
        message: `Authoring JSON exceeds the ${MAX_AUTHORING_JSON_BYTES} byte limit.`,
      }],
    };
  }

  const errors: ParseError[] = [];
  const root = parseTree(sourceText, errors, {
    allowEmptyContent: false,
    allowTrailingComma: false,
    disallowComments: true,
  });
  if (root === undefined || errors.length > 0) {
    return {
      ok: false,
      diagnostics: errors.length === 0
        ? [{
            severity: "error",
            code: "AUTHORING_JSON_SYNTAX_INVALID",
            instancePath: "",
            message: "Authoring input must contain one JSON value.",
          }]
        : errors.map((error) => ({
            severity: "error" as const,
            code: "AUTHORING_JSON_SYNTAX_INVALID",
            instancePath: "",
            message: `${printParseErrorCode(error.error)} at byte offset ${error.offset}.`,
            details: { offset: error.offset, length: error.length },
          })),
    };
  }

  const duplicateDiagnostics: AuthoringDiagnostic[] = [];
  findDuplicateKeys(root, "", duplicateDiagnostics);
  if (duplicateDiagnostics.length > 0) {
    return { ok: false, diagnostics: duplicateDiagnostics };
  }
  return { ok: true, value: JSON.parse(sourceText) as unknown, diagnostics: [] };
}

export function parseAuthoringSpecJson(sourceText: string): AuthoringResult<AuthoringSpecV3> {
  const parsed = parseCanonicalJson(sourceText);
  if (!parsed.ok) return { ok: false, diagnostics: parsed.diagnostics };

  const value = parsed.value;
  if (
    value !== null &&
    typeof value === "object" &&
    (value as { kind?: unknown }).kind === "worldkit-authoring-spec" &&
    Object.hasOwn(value, "schemaVersion") &&
    (value as { schemaVersion?: unknown }).schemaVersion !== 3
  ) {
    const version = (value as { schemaVersion?: unknown }).schemaVersion;
    return {
      ok: false,
      diagnostics: [
        {
          severity: "error",
          code: "AUTHORING_SCHEMA_VERSION_NOT_SUPPORTED",
          instancePath: "/schemaVersion",
          message: `Authoring schema version '${String(version)}' is not supported.`,
          details: { supportedSchemaVersions: [3] },
        },
      ],
    };
  }

  return validateAuthoringSpecV3(value);
}
