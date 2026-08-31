import { describe, expect, it } from "vitest";
import sharp from "sharp";

import {
  inspectBabylonNativeBlockRenderedCapturesV1,
} from "./bwb3-block-capture-evidence.js";

async function image(
  widthPixels: number,
  heightPixels: number,
  background: Readonly<{ r: number; g: number; b: number }>,
  foreground: Readonly<{ r: number; g: number; b: number }>,
): Promise<Buffer> {
  return sharp({
    create: {
      width: widthPixels,
      height: heightPixels,
      channels: 4,
      background: { ...background, alpha: 1 },
    },
  }).composite([{
    input: Buffer.from(
      `<svg width="${widthPixels}" height="${heightPixels}">` +
        `<rect x="8" y="8" width="${widthPixels - 16}" height="${heightPixels - 16}" ` +
        `fill="rgb(${foreground.r},${foreground.g},${foreground.b})"/>` +
      "</svg>",
    ),
  }]).png().toBuffer();
}

describe("BWB-3 rendered block Capture evidence", () => {
  it("accepts three distinct rendered Opening, Top and Side PNGs", async () => {
    const result = await inspectBabylonNativeBlockRenderedCapturesV1([
      {
        viewId: "opening",
        pngBytes: await image(96, 64, { r: 20, g: 30, b: 40 }, { r: 201, g: 169, b: 107 }),
      },
      {
        viewId: "top-down",
        pngBytes: await image(96, 64, { r: 20, g: 30, b: 40 }, { r: 174, g: 184, b: 196 }),
      },
      {
        viewId: "side",
        pngBytes: await image(96, 64, { r: 20, g: 30, b: 40 }, { r: 127, g: 149, b: 110 }),
      },
    ]);

    expect(result.kind).toBe("babylon-native-block-rendered-capture-evidence");
    expect(result.views.map(({ viewId }) => viewId)).toEqual([
      "opening",
      "top-down",
      "side",
    ]);
    expect(result.views.every(({ widthPixels, heightPixels }) =>
      widthPixels === 96 && heightPixels === 64,
    )).toBe(true);
    expect(new Set(result.views.map(({ contentHash }) => contentHash).values()).size)
      .toBe(3);
    expect(result.views.every(({ distinctColorCount, dominantColorRatio }) =>
      distinctColorCount >= 2 && dominantColorRatio < 0.99,
    )).toBe(true);
  });

  it("rejects duplicate or visually empty screenshots", async () => {
    const solid = await sharp({
      create: {
        width: 96,
        height: 64,
        channels: 4,
        background: { r: 20, g: 30, b: 40, alpha: 1 },
      },
    }).png().toBuffer();

    await expect(inspectBabylonNativeBlockRenderedCapturesV1([
      { viewId: "opening", pngBytes: solid },
      { viewId: "top-down", pngBytes: solid },
      { viewId: "side", pngBytes: solid },
    ])).rejects.toThrow(/WORLDKIT_BWB3_RENDERED_CAPTURE_INVALID/);
  });
});
