import earcut from "earcut";

export function triangulatePolygonMetersXZV1(
  pointsMetersXZ: readonly (readonly [number, number])[],
): readonly number[] {
  if (pointsMetersXZ.length < 3) {
    throw new RangeError("A polygon requires at least three points.");
  }
  const coordinates = pointsMetersXZ.flatMap(([xMeters, zMeters]) => [
    xMeters,
    zMeters,
  ]);
  const indices = earcut(coordinates, undefined, 2);
  if (indices.length !== (pointsMetersXZ.length - 2) * 3) {
    throw new Error("WORLDKIT_WATER_POLYGON_TRIANGULATION_FAILED");
  }
  return indices;
}
