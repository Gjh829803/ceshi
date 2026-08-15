import { describe, expect, it } from "vitest";

import { hashString, SeededNoise2D, SeededRandom } from "./random";

describe("deterministic random utilities", () => {
  it("produces repeatable random sequences", () => {
    const first = new SeededRandom("grassland");
    const second = new SeededRandom("grassland");
    expect(Array.from({ length: 20 }, () => first.next())).toEqual(
      Array.from({ length: 20 }, () => second.next()),
    );
  });

  it("creates deterministic, independently named forks", () => {
    const root = new SeededRandom(42);
    expect(root.fork("lake").next()).toBe(root.fork("lake").next());
    expect(root.fork("lake").next()).not.toBe(root.fork("mountain").next());
  });

  it("returns continuous and repeatable fractal noise", () => {
    const first = new SeededNoise2D(7);
    const second = new SeededNoise2D(7);
    const value = first.fractal(1.25, -3.75, { octaves: 5 });
    expect(value).toBe(second.fractal(1.25, -3.75, { octaves: 5 }));
    expect(Math.abs(value - first.fractal(1.251, -3.749, { octaves: 5 }))).toBeLessThan(0.05);
    expect(value).toBeGreaterThanOrEqual(-1);
    expect(value).toBeLessThanOrEqual(1);
  });

  it("hashes source text stably", () => {
    expect(hashString("feature source")).toBe(hashString("feature source"));
    expect(hashString("feature source")).not.toBe(hashString("different source"));
  });
});
