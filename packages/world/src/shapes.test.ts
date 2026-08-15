import { describe, expect, it } from "vitest";

import { CircleShape, EllipseShape, PolygonShape } from "./shapes";

describe("2D shapes", () => {
  it("measures circle distance and smooth inner falloff", () => {
    const circle = new CircleShape([0, 0], 10);
    expect(circle.signedDistance([0, 0])).toBe(-10);
    expect(circle.signedDistance([13, 0])).toBe(3);
    expect(circle.contains([3, 4])).toBe(true);
    expect(circle.influence([0, 0], 4)).toBe(1);
    expect(circle.influence([9, 0], 4, "linear")).toBeCloseTo(0.25);
    expect(circle.influence([11, 0], 4)).toBe(0);
  });

  it("measures ellipse distance on its principal axes", () => {
    const ellipse = new EllipseShape([2, 3], [10, 5]);
    expect(ellipse.signedDistance([17, 3])).toBeCloseTo(5, 5);
    expect(ellipse.signedDistance([2, 5])).toBeCloseTo(-3, 5);
    expect(ellipse.contains([11, 3])).toBe(true);
    expect(ellipse.toJSON()).toEqual({ kind: "ellipse", center: [2, 3], radius: [10, 5] });
  });

  it("supports concave polygons and boundary distance", () => {
    const polygon = new PolygonShape([
      [0, 0],
      [6, 0],
      [6, 2],
      [2, 2],
      [2, 6],
      [0, 6],
    ]);
    expect(polygon.contains([1, 5])).toBe(true);
    expect(polygon.contains([4, 4])).toBe(false);
    expect(polygon.distanceToBoundary([1, 5])).toBeCloseTo(1);
    expect(polygon.signedDistance([4, 4])).toBeCloseTo(2);
  });

  it("rejects invalid shapes", () => {
    expect(() => new CircleShape([0, 0], 0)).toThrow(/radius/i);
    expect(() => new EllipseShape([0, 0], [1, -1])).toThrow(/radii/i);
    expect(() => new PolygonShape([[0, 0], [1, 1]])).toThrow(/three/i);
  });
});
