import { orient2d } from "robust-predicates";

export type OrientationPointXZV1 = readonly [x: number, z: number];

/**
 * Returns the robust signed XZ cross product for the directed turn a -> b -> c.
 *
 * robust-predicates uses screen-style downward-positive Y orientation, so its
 * result is negated here to preserve WorldKit's existing X-right/Z-up sign.
 */
export function orientXZV1(
  a: OrientationPointXZV1,
  b: OrientationPointXZV1,
  c: OrientationPointXZV1,
): number {
  return -orient2d(a[0], a[1], b[0], b[1], c[0], c[1]);
}
