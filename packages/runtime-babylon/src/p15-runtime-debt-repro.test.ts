import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const kernelSource = readFileSync(
  new URL("./motion-kernel-runtime.ts", import.meta.url),
  "utf8",
);
const worldSource = readFileSync(
  new URL("./babylon-world-runtime.ts", import.meta.url),
  "utf8",
);

describe("P1.5 runtime debt", () => {
  it("still bootstraps ground with a physics raycast", () => {
    expect(kernelSource.includes("hasWalkablePhysicalGroundAt")).toBe(true);
    expect(kernelSource.includes("physicsEngine.raycast")).toBe(true);
    expect(kernelSource.includes("initialGroundSupportPending")).toBe(true);
  });

  it("still overwrites controller step/slope from motion parameters", () => {
    expect(kernelSource.includes('numberParameter(\n        this.activeProfile,\n        "stepHeightMeters",\n        0.35,')).toBe(true);
    expect(kernelSource.includes('"maximumSlopeDegrees", 50)')).toBe(true);
  });

  it("still treats water membership as a published movementMedium", () => {
    expect(kernelSource.includes('return "water"')).toBe(true);
  });

  it("still revalidates object supported-by with AABB Y", () => {
    expect(worldSource.includes("supporting.maximumMetersXYZ[1]")).toBe(true);
  });
});
