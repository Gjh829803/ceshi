import type { Diagnostic, TransformSnapshot, Vec3Tuple } from "./types.js";

const VECTOR_FIELDS = ["position", "rotation", "scale"] as const;

function isFiniteVector(value: Vec3Tuple): boolean {
  return value.length === 3 && value.every(Number.isFinite);
}

export function validateFiniteTransforms(
  transforms: readonly TransformSnapshot[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const transform of transforms) {
    for (const field of VECTOR_FIELDS) {
      const value = transform[field];
      if (value === undefined || isFiniteVector(value)) continue;

      diagnostics.push({
        severity: "error",
        code: "TRANSFORM_NOT_FINITE",
        message: `${transform.entityId}.${field} must contain three finite numbers.`,
        entityId: transform.entityId,
        ...(transform.featureId === undefined
          ? {}
          : { featureId: transform.featureId }),
        suggestions: [
          "Check divisions, normalization of zero-length vectors, and uninitialized values.",
        ],
      });
    }

    const scale = transform.scale;
    if (scale !== undefined && isFiniteVector(scale) && scale.some((axis) => axis === 0)) {
      diagnostics.push({
        severity: "warning",
        code: "TRANSFORM_ZERO_SCALE",
        message: `${transform.entityId}.scale contains a zero axis and may be invisible or non-collidable.`,
        entityId: transform.entityId,
        ...(transform.featureId === undefined
          ? {}
          : { featureId: transform.featureId }),
        suggestions: ["Use a positive non-zero scale or explicitly hide the entity."],
      });
    }
  }

  return diagnostics;
}
