export interface BabylonNativeHostRandomV1 {
  nextRatio(): number;
  range(minimum: number, maximum: number): number;
  pick<Value>(values: readonly Value[]): Value;
}

function validFinite(value: number): boolean {
  return Number.isFinite(value) && !Object.is(value, -0);
}

function invalidSeed(): never {
  throw new TypeError("Babylon Native random seed must be a non-negative safe integer.");
}

function initialState(seed: number): number {
  if (!validFinite(seed) || !Number.isSafeInteger(seed) || seed < 0) {
    return invalidSeed();
  }
  const lower = seed >>> 0;
  const upper = Math.floor(seed / 0x1_0000_0000) >>> 0;
  return (lower ^ Math.imul(upper, 0x9e37_79b1) ^ 0x6d2b_79f5) >>> 0;
}

export function createBabylonNativeHostRandomV1(
  seed: number,
): BabylonNativeHostRandomV1 {
  let state = initialState(seed);

  const nextRatio = (): number => {
    state = (state + 0x6d2b_79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 0x1_0000_0000;
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
