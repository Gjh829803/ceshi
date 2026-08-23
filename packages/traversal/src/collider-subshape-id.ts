import { sha256CanonicalJson } from "@whitebox-world/protocol";

export function deriveColliderSubshapeIdV1(
  entityId: string,
  logicalSubshapeId: string,
): string {
  if (entityId.length === 0 || logicalSubshapeId.length === 0) {
    throw new Error(
      "COLLIDER_SUBSHAPE_ID_INVALID: entityId and logicalSubshapeId must be non-empty.",
    );
  }
  return `collider-subshape:${sha256CanonicalJson({ entityId, logicalSubshapeId })}`;
}
