import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { decodeTerrainIntentPng } from "./decode-png";

const RAMP_RGB_2X2 = new Uint8Array([
  32, 64, 208,
  128, 128, 128,
  176, 112, 80,
  224, 96, 32,
]);

describe("decodeTerrainIntentPng", () => {
  it("returns an exact opaque sRGB buffer for a square PNG", async () => {
    const sourcePngBytes = await sharp(RAMP_RGB_2X2, {
      raw: { width: 2, height: 2, channels: 3 },
    }).png().toBuffer();

    const decoded = await decodeTerrainIntentPng(sourcePngBytes);

    expect(decoded).toMatchObject({
      widthPixels: 2,
      heightPixels: 2,
      sourcePngHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      canonicalRgbHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });
    expect(decoded.rgbBytes).toEqual(RAMP_RGB_2X2);
  });

  it("rejects non-square and alpha-bearing PNGs", async () => {
    const nonSquare = await sharp(new Uint8Array(2 * 3 * 3).fill(128), {
      raw: { width: 2, height: 3, channels: 3 },
    }).png().toBuffer();
    const withAlpha = await sharp(new Uint8Array(2 * 2 * 4).fill(128), {
      raw: { width: 2, height: 2, channels: 4 },
    }).png().toBuffer();

    await expect(decodeTerrainIntentPng(nonSquare)).rejects.toThrow("square");
    await expect(decodeTerrainIntentPng(withAlpha)).rejects.toThrow("alpha");
  });

  it("rejects animated or multipage inputs", async () => {
    const twoFrameRgb = new Uint8Array(2 * 4 * 3);
    twoFrameRgb.fill(32, 0, twoFrameRgb.length / 2);
    twoFrameRgb.fill(224, twoFrameRgb.length / 2);
    const animatedGif = await sharp(twoFrameRgb, {
      raw: { width: 2, height: 4, channels: 3, pageHeight: 2 },
    }).gif({ loop: 0, delay: [10, 10] }).toBuffer();

    await expect(decodeTerrainIntentPng(animatedGif)).rejects.toThrow("one PNG page");
  });

  it("rejects image dimensions above the pixel budget before decoding", async () => {
    const oversizedPng = await sharp({
      create: {
        width: 4_097,
        height: 4_097,
        channels: 3,
        background: { r: 128, g: 128, b: 128 },
      },
    }).png({ compressionLevel: 9 }).toBuffer();

    await expect(decodeTerrainIntentPng(oversizedPng)).rejects.toThrow(/pixel limit|Input image exceeds/i);
  });
});
