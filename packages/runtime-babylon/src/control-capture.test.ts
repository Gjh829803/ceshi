import { describe, expect, it } from "vitest";
import { stringifyCanonicalJson } from "@whitebox-world/protocol";
import type { ControlCaptureCameraV1 } from "@whitebox-world/runtime-contracts";

import {
  buildControlCaptureTablesV1,
  canonicalizeControlCaptureCameraV1,
  encodeFloat32LittleEndianV1,
  encodeUint32LittleEndianV1,
  extractCameraDepthMetersV1,
  extractWorldNormalsV1,
  flipRgbaRowsToTopLeftV1,
  rgbaBytesToUint32IdsV1,
} from "./control-capture";

function cameraFixture(
  overrides: Partial<ControlCaptureCameraV1> = {},
): ControlCaptureCameraV1 {
  return {
    cameraEntityId: "camera-main",
    cameraRigRef: "worldkit://camera-rig/third-person@1",
    positionMetersXYZ: [1, 2, -1],
    forwardXYZ: [0, 0, -1],
    upXYZ: [0, 1, 0],
    verticalFovRadians: 1,
    nearClipMeters: 0.1,
    farClipMeters: 1_000,
    viewMatrixColumnMajor: [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      -1, 0, 0, 1,
    ],
    projectionMatrixColumnMajor: [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, -1, -1,
      0, 0, -0.1, 0,
    ],
    ...overrides,
  };
}

function cameraNumbers(camera: ControlCaptureCameraV1): readonly number[] {
  return [
    ...camera.positionMetersXYZ,
    ...camera.forwardXYZ,
    ...camera.upXYZ,
    camera.verticalFovRadians,
    camera.nearClipMeters,
    camera.farClipMeters,
    ...camera.viewMatrixColumnMajor,
    ...camera.projectionMatrixColumnMajor,
  ];
}

describe("Babylon control capture codecs", () => {
  it("publishes a canonical camera when only one matrix component is negative zero", () => {
    const camera = cameraFixture({
      viewMatrixColumnMajor: [
        1, 0, 0, 0,
        -0, 1, 0, 0,
        0, 0, 1, 0,
        -1, 0, 0, 1,
      ],
    });

    const canonicalCamera = canonicalizeControlCaptureCameraV1(camera);

    expect(Object.is(canonicalCamera.viewMatrixColumnMajor[4], 0)).toBe(true);
    expect(canonicalCamera.viewMatrixColumnMajor[12]).toBe(-1);
    expect(cameraNumbers(canonicalCamera).some((value) => Object.is(value, -0))).toBe(false);
    expect(() => stringifyCanonicalJson(canonicalCamera)).not.toThrow();
  });

  it("canonicalizes signed zero across every public camera numeric channel", () => {
    const canonicalCamera = canonicalizeControlCaptureCameraV1(cameraFixture({
      positionMetersXYZ: [-0, 2, -1],
      forwardXYZ: [0, -0, -1],
      upXYZ: [-0, 1, 0],
      verticalFovRadians: -0,
      nearClipMeters: -0,
      farClipMeters: -0,
      viewMatrixColumnMajor: [
        -0, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        -1, 0, 0, 1,
      ],
      projectionMatrixColumnMajor: [
        1, 0, 0, 0,
        0, -0, 0, 0,
        0, 0, -1, -1,
        0, 0, -0.1, 0,
      ],
    }));

    expect(cameraNumbers(canonicalCamera).some((value) => Object.is(value, -0))).toBe(false);
    expect(canonicalCamera.positionMetersXYZ[2]).toBe(-1);
    expect(canonicalCamera.forwardXYZ[2]).toBe(-1);
    expect(canonicalCamera.viewMatrixColumnMajor[12]).toBe(-1);
    expect(canonicalCamera.projectionMatrixColumnMajor[10]).toBe(-1);
    expect(canonicalCamera.projectionMatrixColumnMajor[14]).toBe(-0.1);
    expect(() => stringifyCanonicalJson(canonicalCamera)).not.toThrow();
  });

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
