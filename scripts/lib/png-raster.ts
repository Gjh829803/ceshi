import { deflateSync, inflateSync } from "node:zlib";

export interface RgbaRasterV1 {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
}

export type RgbColorV1 = readonly [red: number, green: number, blue: number];

function assertDimensions(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1 || width > 8_192 || height > 8_192) {
    throw new Error("PNG raster dimensions must be positive integers no larger than 8192.");
  }
}

function paeth(left: number, above: number, upperLeft: number): number {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance
    ? left
    : aboveDistance <= upperLeftDistance ? above : upperLeft;
}

export function decodePngRgbaV1(bytes: Uint8Array): RgbaRasterV1 {
  const source = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (source.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("Image must be PNG.");
  }
  let offset = 8;
  let width: number | undefined;
  let height: number | undefined;
  let sourceChannels: 3 | 4 | undefined;
  const compressed: Buffer[] = [];
  while (offset + 12 <= source.length) {
    const length = source.readUInt32BE(offset);
    const type = source.subarray(offset + 4, offset + 8).toString("ascii");
    const data = source.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      const colorType = data[9];
      if (bitDepth !== 8 || data[12] !== 0 || (colorType !== 2 && colorType !== 6)) {
        throw new Error("PNG must be non-interlaced 8-bit RGB or RGBA.");
      }
      sourceChannels = colorType === 6 ? 4 : 3;
    } else if (type === "IDAT") compressed.push(data);
    else if (type === "IEND") break;
  }
  if (width === undefined || height === undefined || sourceChannels === undefined ||
      compressed.length === 0) throw new Error("PNG structure is incomplete.");
  assertDimensions(width, height);
  const scanlines = inflateSync(Buffer.concat(compressed));
  const stride = width * sourceChannels;
  if (scanlines.length !== (stride + 1) * height) {
    throw new Error("PNG scanline size is invalid.");
  }
  const reconstructed = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = scanlines[y * (stride + 1)]!;
    for (let x = 0; x < stride; x += 1) {
      const raw = scanlines[y * (stride + 1) + 1 + x]!;
      const left = x >= sourceChannels ? reconstructed[y * stride + x - sourceChannels]! : 0;
      const above = y > 0 ? reconstructed[(y - 1) * stride + x]! : 0;
      const upperLeft = y > 0 && x >= sourceChannels
        ? reconstructed[(y - 1) * stride + x - sourceChannels]!
        : 0;
      const value = filter === 0 ? raw
        : filter === 1 ? raw + left
        : filter === 2 ? raw + above
        : filter === 3 ? raw + Math.floor((left + above) / 2)
        : filter === 4 ? raw + paeth(left, above, upperLeft)
        : Number.NaN;
      if (!Number.isFinite(value)) throw new Error(`Unsupported PNG filter ${filter}.`);
      reconstructed[y * stride + x] = value & 0xff;
    }
  }
  const pixels = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const sourceOffset = index * sourceChannels;
    const targetOffset = index * 4;
    pixels[targetOffset] = reconstructed[sourceOffset]!;
    pixels[targetOffset + 1] = reconstructed[sourceOffset + 1]!;
    pixels[targetOffset + 2] = reconstructed[sourceOffset + 2]!;
    pixels[targetOffset + 3] = sourceChannels === 4
      ? reconstructed[sourceOffset + 3]!
      : 255;
  }
  return Object.freeze({ width, height, pixels });
}

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

function pngChunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const output = Buffer.alloc(12 + data.byteLength);
  output.writeUInt32BE(data.byteLength, 0);
  typeBytes.copy(output, 4);
  Buffer.from(data.buffer, data.byteOffset, data.byteLength).copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBytes, Buffer.from(data)])), 8 + data.byteLength);
  return output;
}

export function encodePngRgbaV1(raster: RgbaRasterV1): Buffer {
  assertDimensions(raster.width, raster.height);
  if (raster.pixels.byteLength !== raster.width * raster.height * 4) {
    throw new Error("RGBA raster pixel length is invalid.");
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(raster.width, 0);
  ihdr.writeUInt32BE(raster.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const scanlines = Buffer.alloc((raster.width * 4 + 1) * raster.height);
  for (let y = 0; y < raster.height; y += 1) {
    const targetOffset = y * (raster.width * 4 + 1);
    scanlines[targetOffset] = 0;
    Buffer.from(
      raster.pixels.buffer,
      raster.pixels.byteOffset + y * raster.width * 4,
      raster.width * 4,
    ).copy(scanlines, targetOffset + 1);
  }
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export function createRgbaRasterV1(
  width: number,
  height: number,
  color: RgbColorV1 = [255, 255, 255],
): RgbaRasterV1 {
  assertDimensions(width, height);
  const pixels = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = 255;
  }
  return { width, height, pixels };
}

export function setRgbaPixelV1(
  raster: RgbaRasterV1,
  x: number,
  y: number,
  color: RgbColorV1,
): void {
  if (x < 0 || y < 0 || x >= raster.width || y >= raster.height) return;
  const offset = (Math.floor(y) * raster.width + Math.floor(x)) * 4;
  raster.pixels[offset] = color[0];
  raster.pixels[offset + 1] = color[1];
  raster.pixels[offset + 2] = color[2];
  raster.pixels[offset + 3] = 255;
}

export function fillRgbaRectV1(
  raster: RgbaRasterV1,
  minimumX: number,
  minimumY: number,
  maximumX: number,
  maximumY: number,
  color: RgbColorV1,
): void {
  const left = Math.max(0, Math.floor(minimumX));
  const top = Math.max(0, Math.floor(minimumY));
  const right = Math.min(raster.width, Math.ceil(maximumX));
  const bottom = Math.min(raster.height, Math.ceil(maximumY));
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) setRgbaPixelV1(raster, x, y, color);
  }
}

export function fillRgbaPolygonV1(
  raster: RgbaRasterV1,
  points: readonly (readonly [number, number])[],
  color: RgbColorV1,
): void {
  if (points.length < 3) return;
  const minimumY = Math.max(0, Math.floor(Math.min(...points.map((point) => point[1]))));
  const maximumY = Math.min(
    raster.height - 1,
    Math.ceil(Math.max(...points.map((point) => point[1]))),
  );
  for (let y = minimumY; y <= maximumY; y += 1) {
    const scanY = y + 0.5;
    const intersections: number[] = [];
    for (let index = 0; index < points.length; index += 1) {
      const first = points[index]!;
      const second = points[(index + 1) % points.length]!;
      if ((first[1] <= scanY && second[1] > scanY) ||
          (second[1] <= scanY && first[1] > scanY)) {
        intersections.push(
          first[0] + (scanY - first[1]) * (second[0] - first[0]) /
          (second[1] - first[1]),
        );
      }
    }
    intersections.sort((left, right) => left - right);
    for (let index = 0; index + 1 < intersections.length; index += 2) {
      fillRgbaRectV1(raster, intersections[index]!, y, intersections[index + 1]!, y + 1, color);
    }
  }
}

export function drawRgbaLineV1(
  raster: RgbaRasterV1,
  from: readonly [number, number],
  to: readonly [number, number],
  color: RgbColorV1,
): void {
  let x = Math.round(from[0]);
  let y = Math.round(from[1]);
  const targetX = Math.round(to[0]);
  const targetY = Math.round(to[1]);
  const deltaX = Math.abs(targetX - x);
  const stepX = x < targetX ? 1 : -1;
  const deltaY = -Math.abs(targetY - y);
  const stepY = y < targetY ? 1 : -1;
  let error = deltaX + deltaY;
  while (true) {
    setRgbaPixelV1(raster, x, y, color);
    if (x === targetX && y === targetY) break;
    const doubled = 2 * error;
    if (doubled >= deltaY) {
      error += deltaY;
      x += stepX;
    }
    if (doubled <= deltaX) {
      error += deltaX;
      y += stepY;
    }
  }
}

export function drawRgbaCircleV1(
  raster: RgbaRasterV1,
  centerX: number,
  centerY: number,
  radius: number,
  color: RgbColorV1,
): void {
  const squared = radius ** 2;
  for (let y = Math.floor(centerY - radius); y <= Math.ceil(centerY + radius); y += 1) {
    for (let x = Math.floor(centerX - radius); x <= Math.ceil(centerX + radius); x += 1) {
      if ((x - centerX) ** 2 + (y - centerY) ** 2 <= squared) {
        setRgbaPixelV1(raster, x, y, color);
      }
    }
  }
}

function blendRasterPixel(
  target: RgbaRasterV1,
  targetX: number,
  targetY: number,
  source: RgbaRasterV1,
  sourceX: number,
  sourceY: number,
): void {
  const sourceOffset = (sourceY * source.width + sourceX) * 4;
  const alpha = source.pixels[sourceOffset + 3]! / 255;
  const targetOffset = (targetY * target.width + targetX) * 4;
  for (let channel = 0; channel < 3; channel += 1) {
    target.pixels[targetOffset + channel] = Math.round(
      source.pixels[sourceOffset + channel]! * alpha +
      target.pixels[targetOffset + channel]! * (1 - alpha),
    );
  }
  target.pixels[targetOffset + 3] = 255;
}

export function blitRgbaContainV1(
  target: RgbaRasterV1,
  source: RgbaRasterV1,
  left: number,
  top: number,
  width: number,
  height: number,
): void {
  const scale = Math.min(width / source.width, height / source.height);
  const renderedWidth = Math.max(1, Math.round(source.width * scale));
  const renderedHeight = Math.max(1, Math.round(source.height * scale));
  const offsetX = Math.round(left + (width - renderedWidth) / 2);
  const offsetY = Math.round(top + (height - renderedHeight) / 2);
  for (let y = 0; y < renderedHeight; y += 1) {
    const sourceY = Math.min(source.height - 1, Math.floor(y / scale));
    for (let x = 0; x < renderedWidth; x += 1) {
      const sourceX = Math.min(source.width - 1, Math.floor(x / scale));
      blendRasterPixel(target, offsetX + x, offsetY + y, source, sourceX, sourceY);
    }
  }
}

export function composeHorizontalComparisonPngV1(
  left: RgbaRasterV1,
  right: RgbaRasterV1,
  panelWidth: number,
  panelHeight: number,
): Buffer {
  const separatorWidth = 8;
  const output = createRgbaRasterV1(
    panelWidth * 2 + separatorWidth,
    panelHeight,
    [238, 242, 244],
  );
  fillRgbaRectV1(output, panelWidth, 0, panelWidth + separatorWidth, panelHeight, [43, 56, 58]);
  blitRgbaContainV1(output, left, 0, 0, panelWidth, panelHeight);
  blitRgbaContainV1(
    output,
    right,
    panelWidth + separatorWidth,
    0,
    panelWidth,
    panelHeight,
  );
  return encodePngRgbaV1(output);
}
