import { PNG } from "pngjs";
import { sha256Bytes, type Sha256HashV1 } from "@whitebox-world/protocol";
import { describe, expect, it } from "vitest";
import { measureFormalIdentityMaskV1, projectOpeningCompositionPixelsV1 } from "./formal-identity-mask-measurement.js";

function input(labels: readonly number[], width = 3) {
  const png = new PNG({ width, height: labels.length / width });
  labels.forEach((label, index) => {
    png.data[index * 4] = label === 1 ? 255 : 0;
    png.data[index * 4 + 1] = label === 2 ? 255 : 0;
    png.data[index * 4 + 3] = 255;
  });
  const pngBytes = PNG.sync.write(png);
  return { pngBytes, view: { identityMaskPngContentHash: sha256Bytes(pngBytes) as Sha256HashV1,
    request: { widthPixels: width, heightPixels: png.height } },
  targets: [{ acceptanceTargetRef: "target-red", identityColor: "#FF0000" },
    { acceptanceTargetRef: "target-green", identityColor: "#00FF00" }] };
}

describe("receipt-bound formal identity pixels", () => {
  it("joins Opening regions and anchors from decoded visible targets without an AABB fallback", () => {
    const projections = measureFormalIdentityMaskV1(input([0,1,0]));
    const bindings = [{ acceptanceTargetRef: "target-red", compositionTargetRef: "red-region" },
      { acceptanceTargetRef: "target-green", compositionTargetRef: "green-region" }];
    expect(projectOpeningCompositionPixelsV1({ projections, bindings })).toEqual({
      regions: [{ targetRef: "red-region", normalizedBounds: { minXBasisPoints: 3333, minYBasisPoints: 0, maxXBasisPoints: 6667, maxYBasisPoints: 10000 } }],
      anchors: [{ targetRef: "red-region", normalizedCenter: { xBasisPoints: 5000, yBasisPoints: 5000 } }],
    });
    expect(() => projectOpeningCompositionPixelsV1({ bindings, projections: new Map() }))
      .toThrow("missing opening target");
    expect(projectOpeningCompositionPixelsV1({ bindings: [], projections })).toEqual({ regions: [], anchors: [] });
    const bothVisible = measureFormalIdentityMaskV1(input([1,0,2]));
    const reordered = projectOpeningCompositionPixelsV1({ projections: bothVisible, bindings: [
      { acceptanceTargetRef: "target-red", compositionTargetRef: "z-last" },
      { acceptanceTargetRef: "target-green", compositionTargetRef: "a-first" },
    ] });
    expect(reordered.regions.map(({ targetRef }) => targetRef)).toEqual(["a-first", "z-last"]);
    expect(reordered.anchors.map(({ targetRef }) => targetRef)).toEqual(["a-first", "z-last"]);
  });

  it("measures actual holes and visible occluding targets instead of rectangle area", () => {
    const solid = measureFormalIdentityMaskV1(input([1,1,1,1,1,1,1,1,1]));
    const arch = measureFormalIdentityMaskV1(input([1,1,1,1,2,1,1,0,1]));
    expect(solid.get("target-red")).toMatchObject({ outcome: "visible", coverageBasisPoints: 10000 });
    expect(arch.get("target-red")).toMatchObject({ outcome: "visible", coverageBasisPoints: 7778 });
    expect(arch.get("target-green")).toMatchObject({ outcome: "visible", coverageBasisPoints: 1111 });
  });
  it("reports a black occluded or absent target without invented bounds or failure", () => {
    expect([...measureFormalIdentityMaskV1(input([0,0,0])).values()]).toEqual([
      { outcome: "not-visible" }, { outcome: "not-visible" },
    ]);
  });
  it.each(["hash", "dimensions", "crc", "duplicate-color", "duplicate-target", "black-target"])(
    "rejects %s identity corruption without AABB fallback", (mode) => {
      const value = input([1,0,2]);
      if (mode === "hash") value.view.identityMaskPngContentHash = `sha256:${"0".repeat(64)}`;
      if (mode === "dimensions") value.view.request.widthPixels += 1;
      if (mode === "crc") {
        value.pngBytes[value.pngBytes.length - 1]! ^= 1;
        value.view.identityMaskPngContentHash = sha256Bytes(value.pngBytes) as Sha256HashV1;
      }
      if (mode === "duplicate-color") value.targets[1]!.identityColor = value.targets[0]!.identityColor;
      if (mode === "duplicate-target") value.targets[1]!.acceptanceTargetRef = value.targets[0]!.acceptanceTargetRef;
      if (mode === "black-target") value.targets[0]!.identityColor = "#000000";
      expect(() => measureFormalIdentityMaskV1(value)).toThrow("WORLD_RECONSTRUCTION_IDENTITY_MASK_INVALID");
    },
  );
});
