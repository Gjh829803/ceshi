#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import path from "node:path";

const VERSION = "worldkit-planner-self-check-v1";
const REQUIRED_SECTIONS = [
  "场景",
  "主体",
  "用户事实",
  "可见参考证据",
  "推断的世界延伸",
  "仅视觉层设想",
  "运动模式",
  "空间",
  "通行",
  "首帧",
  "视觉目标",
];
const MAXIMUM_CENTER_ERROR_RATIO = 0.015;

function option(name) {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${name} is required.`);
  return value;
}

function hash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function paeth(left, above, upperLeft) {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance
    ? left
    : aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function decodePng(bytes) {
  if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("Image must be PNG.");
  }
  let offset = 8;
  let width;
  let height;
  let channels;
  const compressed = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      const colorType = data[9];
      if (bitDepth !== 8 || data[12] !== 0 || ![2, 6].includes(colorType)) {
        throw new Error("Planner self-check supports non-interlaced 8-bit RGB/RGBA PNG files.");
      }
      channels = colorType === 6 ? 4 : 3;
    } else if (type === "IDAT") {
      compressed.push(data);
    } else if (type === "IEND") {
      break;
    }
  }
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || channels === undefined || compressed.length === 0) {
    throw new Error("PNG structure is incomplete.");
  }
  const scanlines = inflateSync(Buffer.concat(compressed));
  const stride = width * channels;
  if (scanlines.length !== (stride + 1) * height) throw new Error("PNG scanline size is invalid.");
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = scanlines[y * (stride + 1)];
    for (let x = 0; x < stride; x += 1) {
      const raw = scanlines[y * (stride + 1) + 1 + x];
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const above = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upperLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      const reconstructed = filter === 0 ? raw
        : filter === 1 ? raw + left
        : filter === 2 ? raw + above
        : filter === 3 ? raw + Math.floor((left + above) / 2)
        : filter === 4 ? raw + paeth(left, above, upperLeft)
        : Number.NaN;
      if (!Number.isFinite(reconstructed)) throw new Error(`Unsupported PNG filter ${filter}.`);
      pixels[y * stride + x] = reconstructed & 0xff;
    }
  }
  return { width, height, channels, pixels };
}

function rgbHueSaturation(red, green, blue) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  const delta = maximum - minimum;
  let hue = 0;
  if (delta > 0) {
    if (maximum === r) hue = 60 * (((g - b) / delta) % 6);
    else if (maximum === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }
  if (hue < 0) hue += 360;
  return { hue, saturation: maximum === 0 ? 0 : delta / maximum, brightness: maximum };
}

function centerMeasurement(bytes) {
  const image = decodePng(bytes);
  let xTotal = 0;
  let count = 0;
  for (let index = 0; index < image.width * image.height; index += 1) {
    const offset = index * image.channels;
    const color = rgbHueSaturation(image.pixels[offset], image.pixels[offset + 1], image.pixels[offset + 2]);
    const hueDistance = Math.min(color.hue, 360 - color.hue);
    if (hueDistance <= 12 && color.saturation >= 0.3 && color.brightness >= 0.2) {
      xTotal += index % image.width;
      count += 1;
    }
  }
  const minimumPixels = Math.max(64, Math.round(image.width * image.height * 0.001));
  if (count < minimumPixels) throw new Error(`Primary-subject red mask is missing or too small (${count} pixels).`);
  const centerXRatio = (xTotal / count + 0.5) / image.width;
  return {
    widthPixels: image.width,
    heightPixels: image.height,
    subjectMaskPixelCount: count,
    subjectCenterXRatio: centerXRatio,
    subjectCenterErrorRatio: Math.abs(centerXRatio - 0.5),
    maximumCenterErrorRatio: MAXIMUM_CENTER_ERROR_RATIO,
  };
}

function briefDiagnostics(source) {
  const diagnostics = [];
  const normalized = source.replaceAll("\r\n", "\n").trim();
  if (Buffer.byteLength(normalized) > 12 * 1024) diagnostics.push({ code: "SCENE_BRIEF_TOO_LARGE", message: "Scene Brief must be at most 12 KiB." });
  const lines = normalized.split("\n");
  if (lines[0]?.trim() !== "# WorldKit Scene Brief") diagnostics.push({ code: "SCENE_BRIEF_HEADER_INVALID", message: "First line must be '# WorldKit Scene Brief'." });
  const sections = new Map();
  let current;
  for (const line of lines.slice(1)) {
    const heading = /^##\s+(.+?)\s*$/.exec(line)?.[1];
    if (heading !== undefined) {
      if (!REQUIRED_SECTIONS.includes(heading) || sections.has(heading)) diagnostics.push({ code: "SCENE_BRIEF_SECTION_INVALID", message: `Unknown or duplicate section '${heading}'.` });
      current = heading;
      sections.set(heading, []);
    } else if (current !== undefined) sections.get(current).push(line);
  }
  for (const section of REQUIRED_SECTIONS) {
    if (!sections.has(section) || !sections.get(section).join("\n").trim()) diagnostics.push({ code: "SCENE_BRIEF_SECTION_MISSING", message: `Section '${section}' is missing or empty.` });
  }
  const movement = sections.get("运动模式")?.join("\n").trim() ?? "";
  if (!/^([^：:\n]+)[：:]\s*([^\n]+)$/.test(movement)) diagnostics.push({ code: "SCENE_BRIEF_MOVEMENT_INVALID", message: "Movement must use '<mode>：<description>'." });
  const targets = (sections.get("视觉目标") ?? []).map((line) => line.trim()).filter(Boolean);
  if (targets.length < 1 || targets.length > 5 || !targets.every((line) => /^-\s*(主体|标志物|重复标志物)\s*[｜|]\s*([^：:\n｜|]{1,48})\s*[：:]\s*(.+)$/.test(line)) || !/^-\s*主体/.test(targets[0] ?? "")) {
    diagnostics.push({ code: "SCENE_BRIEF_VISUAL_TARGET_INVALID", message: "Visual targets must contain 1-5 valid entries beginning with the Subject." });
  }
  return diagnostics;
}

async function writeAtomic(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value)}\n`);
}

const sceneId = option("--scene-id");
const briefPath = path.resolve(option("--brief"));
const worldPlanPath = path.resolve(option("--world-plan"));
const entryPath = path.resolve(option("--entry"));
const reportPath = path.resolve(option("--report"));
const [briefBytes, worldPlanBytes, entryBytes] = await Promise.all([
  readFile(briefPath),
  readFile(worldPlanPath),
  readFile(entryPath),
]);
const diagnostics = briefDiagnostics(briefBytes.toString("utf8"));
let imageMeasurements = null;
try {
  decodePng(worldPlanBytes);
  imageMeasurements = centerMeasurement(entryBytes);
  if (imageMeasurements.subjectCenterErrorRatio > MAXIMUM_CENTER_ERROR_RATIO) {
    diagnostics.push({ code: "ENTRY_SUBJECT_NOT_CENTERED", message: `Primary Subject center is x=${imageMeasurements.subjectCenterXRatio.toFixed(4)}; required 0.5000±${MAXIMUM_CENTER_ERROR_RATIO.toFixed(4)}.` });
  }
} catch (error) {
  diagnostics.push({ code: "PLANNER_IMAGE_INVALID", message: error instanceof Error ? error.message : String(error) });
}
const report = {
  kind: "worldkit-planner-self-check",
  schemaVersion: 1,
  validatorVersion: VERSION,
  sceneId,
  status: diagnostics.length === 0 ? "passed" : "failed",
  inputs: {
    sceneBriefHash: hash(briefBytes),
    worldPlanHash: hash(worldPlanBytes),
    entryWhiteboxTargetHash: hash(entryBytes),
  },
  imageMeasurements,
  diagnostics,
};
await writeAtomic(reportPath, report);
process.stdout.write(`${JSON.stringify({ status: report.status, diagnostics })}\n`);
if (report.status !== "passed") process.exitCode = 2;
