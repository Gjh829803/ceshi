import type { CompositionPrimitiveV1, PrimitiveResourceCostV1 } from "./types";

const COST_BY_PRIMITIVE_KIND: Readonly<
  Record<CompositionPrimitiveV1["kind"], Readonly<{ vertices: number; triangles: number }>>
> = {
  box: { vertices: 24, triangles: 12 },
  sphere: { vertices: 289, triangles: 512 },
  cylinder: { vertices: 70, triangles: 128 },
  capsule: { vertices: 34, triangles: 64 },
};

export function calculatePrimitiveResourceCost(
  parts: readonly { shape: CompositionPrimitiveV1 }[],
): PrimitiveResourceCostV1 {
  return parts.reduce<PrimitiveResourceCostV1>(
    (total, part) => {
      const cost = COST_BY_PRIMITIVE_KIND[part.shape.kind];
      return {
        vertices: total.vertices + cost.vertices,
        triangles: total.triangles + cost.triangles,
        colliders: 1,
      };
    },
    { vertices: 0, triangles: 0, colliders: 1 },
  );
}
