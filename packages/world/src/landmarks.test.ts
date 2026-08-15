import { describe, expect, it } from "vitest";

import { createCompoundLandmark, createPrimitiveLandmark, measureLandmark } from "./landmarks";

describe("landmark descriptions", () => {
  it("normalizes primitive defaults", () => {
    const tower = createPrimitiveLandmark({ kind: "cylinder", radius: 4, height: 30 });
    expect(tower.transform.position).toEqual([0, 0, 0]);
    expect(tower.transform.scale).toEqual([1, 1, 1]);
    expect(tower.collision).toBe(true);
    expect(measureLandmark(tower)).toEqual({ vertices: 100, triangles: 128, colliders: 1 });
  });

  it("recursively describes and measures compound landmarks", () => {
    const landmark = createCompoundLandmark({
      id: "gate",
      collision: false,
      children: [
        { kind: "box", size: [2, 10, 2] },
        { kind: "box", size: [2, 10, 2], collision: false },
        {
          children: [{ kind: "box", size: [8, 2, 2] }],
        },
      ],
    });
    expect(landmark.children).toHaveLength(3);
    expect(measureLandmark(landmark)).toEqual({ vertices: 72, triangles: 36, colliders: 2 });
  });
});
