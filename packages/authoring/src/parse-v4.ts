import { isNil } from "lodash-es";

import { parseCanonicalJson } from "./parse.js";
import type { AuthoringResult } from "./types.js";
import type { AuthoringSpecV4 } from "./types-v4.js";
import { validateAuthoringSpecV4 } from "./validate-v4.js";

export function parseAuthoringSpecV4(
  sourceText: string,
): AuthoringResult<AuthoringSpecV4> {
  const parsed = parseCanonicalJson(sourceText);
  if (!parsed.ok) return { ok: false, diagnostics: parsed.diagnostics };

  const value = parsed.value;
  if (
    !isNil(value) &&
    typeof value === "object" &&
    (value as { kind?: unknown }).kind === "worldkit-authoring-spec" &&
    Object.hasOwn(value, "schemaVersion") &&
    (value as { schemaVersion?: unknown }).schemaVersion !== 4
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
          details: { supportedSchemaVersions: [4] },
        },
      ],
    };
  }

  return validateAuthoringSpecV4(value);
}
