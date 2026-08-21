import { describe, expect, it } from "vitest";

import {
  buildControlCaptureTablesV1,
  encodeFloat32LittleEndianV1,
  encodeUint32LittleEndianV1,
  extractCameraDepthMetersV1,
  extractWorldNormalsV1,
  flipRgbaRowsToTopLeftV1,
  rgbaBytesToUint32IdsV1,
} from "./control-capture";

describe("Babylon control capture codecs", () => {
  it("flips WebGL bottom-left RGBA rows into the locked top-left origin", () => {
    const bottomThenTop = new Uint8Array([
      1, 0, 0, 255,
      2, 0, 0, 255,
      3, 0, 0, 255,
      4, 0, 0, 255,
    ]);

    expect([...flipRgbaRowsToTopLeftV1(bottomThenTop, 2, 2)]).toEqual([
      3, 0, 0, 255,
      4, 0, 0, 255,
      1, 0, 0, 255,
      2, 0, 0, 255,
    ]);
  });

  it("encodes exact little-endian uint32 and float32 payloads", () => {
    expect([...encodeUint32LittleEndianV1(new Uint32Array([0x01020304]))]).toEqual([
      4, 3, 2, 1,
    ]);
    const floatBytes = encodeFloat32LittleEndianV1(new Float32Array([1.5, -2.25]));
    const view = new DataView(floatBytes.buffer, floatBytes.byteOffset, floatBytes.byteLength);
    expect(view.getFloat32(0, true)).toBe(1.5);
    expect(view.getFloat32(4, true)).toBe(-2.25);
  });

  it("decodes stable ID colors and camera-space depth after row flipping", () => {
    const ids = rgbaBytesToUint32IdsV1(new Uint8Array([
      1, 2, 3, 255,
      4, 5, 6, 255,
    ]), 1, 2);
    expect([...ids]).toEqual([0x060504, 0x030201]);

    const depth = extractCameraDepthMetersV1(new Float32Array([
      -2, 0, 0, 1,
      -5, 0, 0, 1,
    ]), 1, 2);
    expect([...depth]).toEqual([5, 2]);
  });

  it("exports finite world-space XYZ normals and decodes unsigned G-buffer values", () => {
    const signed = extractWorldNormalsV1(new Float32Array([
      1, 0, 0, 1,
      0, 1, 0, 1,
    ]), 1, 2, false);
    expect([...signed]).toEqual([0, 1, 0, 1, 0, 0]);

    const unsigned = extractWorldNormalsV1(new Float32Array([
      0.5, 1, 0.5, 1,
    ]), 1, 1, true);
    expect([...unsigned]).toEqual([0, 1, 0]);
  });

  it("assigns semantic and instance IDs by stable names instead of draw order", () => {
    const meshes = [
      { metadata: { worldkitEntityId: "wall-b", semanticClassId: "object.wall" } },
      { metadata: { worldkitEntityId: "terrain-main", semanticClassId: "terrain.ground" } },
      { metadata: { worldkitEntityId: "wall-a", semanticClassId: "object.wall" } },
      { metadata: {} },
    ];
    const reordered = [meshes[2]!, meshes[0]!, meshes[3]!, meshes[1]!];

    expect(buildControlCaptureTablesV1(meshes)).toEqual({
      semanticClasses: [
        { numericId: 1, semanticClassId: "object.wall" },
        { numericId: 2, semanticClassId: "terrain.ground" },
      ],
      instances: [
        { numericId: 1, entityId: "terrain-main", semanticClassId: "terrain.ground" },
        { numericId: 2, entityId: "wall-a", semanticClassId: "object.wall" },
        { numericId: 3, entityId: "wall-b", semanticClassId: "object.wall" },
      ],
    });
    expect(buildControlCaptureTablesV1(reordered)).toEqual(buildControlCaptureTablesV1(meshes));
  });
});
