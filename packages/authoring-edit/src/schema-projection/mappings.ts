import { isNil } from "lodash-es";

import type { AiSchemaCanonicalPathMappingV1 } from "../types.js";
import { deleteJsonPointerV1, readJsonPointerV1 } from "./json-pointer.js";

export function applyCanonicalPathMappingsV1(
  projectionInstance: unknown,
  mappings: readonly AiSchemaCanonicalPathMappingV1[],
): unknown {
  const canonical = structuredClone(projectionInstance);
  for (const mapping of mappings) {
    if (mapping.mode === "identity") continue;
    if (mapping.mode === "null-to-omitted") {
      if (
        canonical !== null &&
        typeof canonical === "object" &&
        !Array.isArray(canonical) &&
        readJsonPointerV1(canonical, mapping.projectionInstancePath) === null
      ) {
        deleteJsonPointerV1(
          canonical as Record<string, unknown>,
          mapping.canonicalInstancePath,
        );
      }
      continue;
    }
    if (mapping.mode === "presence-wrapper") {
      const wrapped = readJsonPointerV1(canonical, mapping.projectionInstancePath);
      if (
        isNil(wrapped) ||
        typeof wrapped !== "object" ||
        Array.isArray(wrapped)
      ) continue;
      const record = wrapped as Record<string, unknown>;
      if (record.present !== true) {
        deleteJsonPointerV1(
          canonical as Record<string, unknown>,
          mapping.canonicalInstancePath,
        );
      }
    }
  }
  return canonical;
}
