import Flatbush from "flatbush";

export interface TriangleXzBroadphaseEntryV1 {
  readonly ordinal: number;
  readonly minimumMetersXZ: readonly [number, number];
  readonly maximumMetersXZ: readonly [number, number];
}

export interface TriangleXzBroadphaseIndexV1 {
  overlappingOrdinals(
    minimumMetersXZ: readonly [number, number],
    maximumMetersXZ: readonly [number, number],
  ): Iterable<number>;
}

/** Package-private deterministic adapter over the provider-owned packed R-tree. */
export function createTriangleXzBroadphaseIndexV1(
  entries: readonly TriangleXzBroadphaseEntryV1[],
): TriangleXzBroadphaseIndexV1 {
  if (entries.length === 0) {
    return {
      overlappingOrdinals: function* overlappingOrdinals() {
        return;
      },
    };
  }

  const index = new Flatbush(entries.length);
  for (const entry of entries) {
    index.add(
      entry.minimumMetersXZ[0],
      entry.minimumMetersXZ[1],
      entry.maximumMetersXZ[0],
      entry.maximumMetersXZ[1],
    );
  }
  index.finish();

  return {
    *overlappingOrdinals(minimumMetersXZ, maximumMetersXZ): Generator<number> {
      const matchingOrdinals = index.search(
        minimumMetersXZ[0],
        minimumMetersXZ[1],
        maximumMetersXZ[0],
        maximumMetersXZ[1],
      ).map((entryIndex) => entries[entryIndex]!.ordinal);
      matchingOrdinals.sort((left, right) => left - right);
      yield* matchingOrdinals;
    },
  };
}
