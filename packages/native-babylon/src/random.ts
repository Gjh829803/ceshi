export interface BabylonNativeHostRandomV1 {
  nextRatio(): number;
  range(minimum: number, maximum: number): number;
  pick<Value>(values: readonly Value[]): Value;
}

function validFinite(value: number): boolean {
  return Number.isFinite(value) && !Object.is(value, -0);
}

function invalidSeed(): never {
  throw new TypeError("Babylon Native random seed must be an unsigned 32-bit integer.");
}

function initialState(seed: number): number {
  if (
    !validFinite(seed) ||
    !Number.isSafeInteger(seed) ||
    seed < 0 ||
    seed > 0xffff_ffff
  ) {
    return invalidSeed();
  }
  return seed;
}

export function createBabylonNativeHostRandomV1(
  seed: number,
): BabylonNativeHostRandomV1 {
  let state = initialState(seed);

  const nextRatio = (): number => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };

  return Object.freeze({
    nextRatio,
    range(minimum: number, maximum: number): number {
      if (
        !validFinite(minimum) ||
        !validFinite(maximum) ||
        maximum <= minimum
      ) {
        throw new TypeError(
          "Babylon Native random range requires finite values with maximum greater than minimum.",
        );
      }
      return minimum + nextRatio() * (maximum - minimum);
    },
    pick<Value>(values: readonly Value[]): Value {
      if (!Array.isArray(values) || values.length === 0) {
        throw new TypeError(
          "Babylon Native random pick requires a non-empty array.",
        );
      }
      return values[Math.floor(nextRatio() * values.length)]!;
    },
  });
}
