import {
  getNodeValue,
  parseTree,
  printParseErrorCode,
  type Node,
  type ParseError,
} from "jsonc-parser";
import {
  assertCanonicalJsonValue,
  CanonicalJsonAdmissionError,
} from "@whitebox-world/protocol";

import type {
  AuthoringDiagnostic,
  AuthoringResult,
} from "./types";

const MAX_AUTHORING_JSON_BYTES = 8 * 1024 * 1024;
const MAX_CONFIGURABLE_CANONICAL_JSON_BYTES = 64 * 1024 * 1024;

export interface ParseCanonicalJsonOptions {
  readonly maximumBytes?: number;
}

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

export function parseCanonicalJson(
  sourceText: string,
  options: ParseCanonicalJsonOptions = {},
): AuthoringResult<unknown> {
  const maximumBytes = options.maximumBytes ?? MAX_AUTHORING_JSON_BYTES;
  if (
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 1 ||
    maximumBytes > MAX_CONFIGURABLE_CANONICAL_JSON_BYTES
  ) {
    throw new RangeError(
      `maximumBytes must be an integer from 1 to ${MAX_CONFIGURABLE_CANONICAL_JSON_BYTES}.`,
    );
  }
  if (new TextEncoder().encode(sourceText).byteLength > maximumBytes) {
    return {
      ok: false,
      diagnostics: [{
        severity: "error",
        code: "AUTHORING_JSON_TOO_LARGE",
        instancePath: "",
        message: `Authoring JSON exceeds the ${maximumBytes} byte limit.`,
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
  const value = JSON.parse(sourceText) as unknown;
  try {
    assertCanonicalJsonValue(value);
  } catch (error) {
    if (error instanceof CanonicalJsonAdmissionError) {
      return {
        ok: false,
        diagnostics: [{
          severity: "error",
          code: "AUTHORING_JSON_NEGATIVE_ZERO",
          instancePath: error.instancePath,
          message: "Negative zero is not allowed in Canonical JSON.",
        }],
      };
    }
    throw error;
  }
  return { ok: true, value, diagnostics: [] };
}
