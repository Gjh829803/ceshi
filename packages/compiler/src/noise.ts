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

function sampleValueNoise(seed: number, x: number, z: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const x1 = x0 + 1;
  const z1 = z0 + 1;
  const tx = smootherStep(x - x0);
  const tz = smootherStep(z - z0);
  const top = lerp(lattice(seed, x0, z0), lattice(seed, x1, z0), tx);
  const bottom = lerp(lattice(seed, x0, z1), lattice(seed, x1, z1), tx);
  return lerp(top, bottom, tz) * 2 - 1;
}

export function sampleFractalNoise(
  seed: number,
  x: number,
  z: number,
  octaves: number,
  lacunarity: number,
  persistence: number,
): number {
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  let normalization = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += sampleValueNoise(seed, x * frequency, z * frequency) * amplitude;
    normalization += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  return normalization === 0 ? 0 : total / normalization;
}
