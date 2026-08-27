import type { Vec3 } from "@whitebox-world/runtime-contracts";

export function canonicalizeSignedZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

export function canonicalizeVec3(value: readonly [number, number, number]): Vec3 {
  return Object.freeze([
    canonicalizeSignedZero(value[0]),
    canonicalizeSignedZero(value[1]),
    canonicalizeSignedZero(value[2]),
  ]) as Vec3;
}

export function canonicalizeMatrix4ColumnMajor(
  value: readonly number[],
): readonly number[] {
  return Object.freeze(value.map(canonicalizeSignedZero));
}
