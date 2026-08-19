import { describe, expect, it } from "vitest";
import { buildGoldenHumanoidGlb } from "./generate-golden-humanoid-glb";

describe("golden humanoid GLB", () => {
  it("is byte-deterministic and exposes the frozen inventory", () => {
    const first = buildGoldenHumanoidGlb();
    const second = buildGoldenHumanoidGlb();
    expect(first.bytes).toEqual(second.bytes);
    expect(new TextDecoder().decode(first.bytes.slice(0, 4))).toBe("glTF");
    expect(first.inventory).toMatchObject({
      meshCount: 1,
      skeletonCount: 1,
      boneCount: 18,
      animationClipNames: ["idle", "jump", "run", "walk"],
      contentHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });
    expect(first.inventory.byteLength).toBe(first.bytes.byteLength);
  });
});
