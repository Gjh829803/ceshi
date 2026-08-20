import { parseCanonicalJson } from "./parse.js";
import type { AuthoringResult } from "./types.js";
import type { AuthoringSpecV3 } from "./types-v3.js";
import { validateAuthoringSpecV3 } from "./validate-v3.js";

export function parseAuthoringSpecV3Json(
  sourceText: string,
): AuthoringResult<AuthoringSpecV3> {
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
