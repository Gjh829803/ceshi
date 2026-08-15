export type Seed = number | string;

/** Stable, non-cryptographic hash used to turn names and source text into seeds. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function normalizeSeed(seed: Seed): number {
  return typeof seed === "number" ? seed >>> 0 : hashString(seed);
}

/** A deterministic PRNG with cheap, clonable state. */
export class SeededRandom {
  readonly initialSeed: number;
  private state: number;

  constructor(seed: Seed) {
    this.initialSeed = normalizeSeed(seed);
    this.state = this.initialSeed;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }

  range(minimum: number, maximum: number): number {
    return minimum + (maximum - minimum) * this.next();
  }

  integer(minimum: number, maximumInclusive: number): number {
    return Math.floor(this.range(minimum, maximumInclusive + 1));
  }

  fork(label: Seed): SeededRandom {
    return new SeededRandom(hashString(`${this.initialSeed}:${String(label)}`));
  }
}

function lattice(seed: number, x: number, z: number): number {
  let value = seed ^ Math.imul(x, 0x1f123bb5) ^ Math.imul(z, 0x5f356495);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 4_294_967_295;
}

function smootherStep(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

export interface FractalNoiseOptions {
  octaves?: number;
  lacunarity?: number;
  persistence?: number;
}

/** Deterministic continuous value noise. Results are in [-1, 1]. */
export class SeededNoise2D {
  readonly seed: number;

  constructor(seed: Seed) {
    this.seed = normalizeSeed(seed);
  }

  sample(x: number, z: number): number {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const x1 = x0 + 1;
    const z1 = z0 + 1;
    const tx = smootherStep(x - x0);
    const tz = smootherStep(z - z0);
    const top = lerp(lattice(this.seed, x0, z0), lattice(this.seed, x1, z0), tx);
    const bottom = lerp(lattice(this.seed, x0, z1), lattice(this.seed, x1, z1), tx);
    return lerp(top, bottom, tz) * 2 - 1;
  }

  fractal(x: number, z: number, options: FractalNoiseOptions = {}): number {
    const octaves = Math.max(1, Math.floor(options.octaves ?? 4));
    const lacunarity = options.lacunarity ?? 2;
    const persistence = options.persistence ?? 0.5;
    let amplitude = 1;
    let frequency = 1;
    let total = 0;
    let normalization = 0;
    for (let octave = 0; octave < octaves; octave += 1) {
      total += this.sample(x * frequency, z * frequency) * amplitude;
      normalization += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }
    return normalization === 0 ? 0 : total / normalization;
  }
}
