import { deflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  comparePngRasterBytesV1,
} from "./verify-png-raster-equality.js";

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const output = Buffer.alloc(12 + data.byteLength);
  output.writeUInt32BE(data.byteLength, 0);
  typeBytes.copy(output, 4);
  Buffer.from(data).copy(output, 8);
  output.writeUInt32BE(
    crc32(Buffer.concat([typeBytes, Buffer.from(data)])),
    8 + data.byteLength,
  );
  return output;
}

function png(
  pixels: readonly number[],
  compressionLevel: number,
): Buffer {
  const width = 2;
  const height = 1;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const scanlines = Buffer.from([0, ...pixels]);
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(scanlines, { level: compressionLevel })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("trusted PNG raster replay", () => {
  const pixels = [
    255, 0, 0, 255,
    0, 0, 255, 255,
  ];

  it("accepts identical RGBA pixels encoded with different compression bytes", () => {
    const fast = png(pixels, 1);
    const compact = png(pixels, 9);

    expect(fast.equals(compact)).toBe(false);
    expect(comparePngRasterBytesV1(fast, compact)).toEqual({
      equal: true,
      widthPixels: 2,
      heightPixels: 1,
      comparedPixelCount: 2,
    });
  });

  it("rejects a real decoded-pixel difference", () => {
    const changed = [...pixels];
    changed[4] = 1;

    expect(comparePngRasterBytesV1(png(pixels, 1), png(changed, 9))).toMatchObject({
      equal: false,
      reason: "pixel-mismatch",
      firstMismatch: {
        x: 1,
        y: 0,
        channel: "red",
        expected: 0,
        actual: 1,
      },
    });
  });
});
