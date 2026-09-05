import { PNG } from "pngjs";

/** Portable Planner image codec. No visual admission thresholds live here. */
export function decodePlannerPngV1(bytes: Buffer) {
  if (bytes.length < 33 || bytes.length > 16_777_216 ||
    bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
    bytes.readUInt32BE(8) !== 13 || bytes.toString("ascii", 12, 16) !== "IHDR") {
    throw new Error("PLANNER_PNG_INVALID");
  }
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (width === 0 || height === 0 || width > 8192 || height > 8192 ||
    width * height > 16_777_216 || bytes[24] !== 8 ||
    ![2, 6].includes(bytes[25]!) || bytes[28] !== 0) {
    throw new Error("PLANNER_PNG_FORMAT_OR_BUDGET_INVALID");
  }
  const decoded = PNG.sync.read(bytes, { checkCRC: true });
  return { width: decoded.width, height: decoded.height,
    channels: 4 as const, pixels: decoded.data };
}

export function encodePlannerPngV1(image: ReturnType<typeof decodePlannerPngV1>): Buffer {
  const png = new PNG({ width: image.width, height: image.height });
  png.data = image.pixels;
  return PNG.sync.write(png,
    { colorType: 6, inputColorType: 6, bitDepth: 8 });
}
