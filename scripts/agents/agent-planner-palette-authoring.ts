import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSceneBriefV1 } from "@whitebox-world/authoring";
import { BABYLON_NATIVE_VISUAL_IDENTITY_COLORS } from "../scenes/visual-identity-palette.js";
import { decodePlannerPngV1, encodePlannerPngV1 } from "./planner-png.js";

export interface PlannerPaletteSelectionV1 {
  readonly visualTargetIndex: number;
  readonly minimumXPixels: number;
  readonly minimumYPixels: number;
  readonly widthPixels: number;
  readonly heightPixels: number;
}

function hash(bytes: Uint8Array) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function hue(red: number, green: number, blue: number) {
  const maximum = Math.max(red, green, blue), minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  const raw = delta === 0 ? 0 : maximum === red ? (green - blue) / delta
    : maximum === green ? (blue - red) / delta + 2 : (red - green) / delta + 4;
  return { degrees: ((raw * 60) % 360 + 360) % 360,
    saturation: maximum === 0 ? 0 : delta / maximum, brightness: maximum / 255 };
}

/** Planner-invoked authoring, never automatic Host repair or an admission bypass.
 * It recolors existing chromatic pixels only; it cannot add/move/enlarge a shape. */
export function authorPlannerPaletteSelectionV1(input: {
  readonly sourcePng: Buffer;
  readonly sourcePngHash: string;
  readonly selection: PlannerPaletteSelectionV1;
}) {
  if (hash(input.sourcePng) !== input.sourcePngHash) throw new Error("PLANNER_PALETTE_SOURCE_CHANGED");
  const image = decodePlannerPngV1(input.sourcePng);
  const s = input.selection;
  const fields = ["visualTargetIndex", "minimumXPixels", "minimumYPixels", "widthPixels", "heightPixels"] as const;
  if (s === null || typeof s !== "object" || Object.keys(s).length !== fields.length ||
    !fields.every((key) => Number.isSafeInteger(s[key])) || s.visualTargetIndex < 0 ||
    s.visualTargetIndex >= BABYLON_NATIVE_VISUAL_IDENTITY_COLORS.length ||
    s.minimumXPixels < 0 || s.minimumYPixels < 0 || s.widthPixels < 1 || s.heightPixels < 1 ||
    s.minimumXPixels + s.widthPixels > image.width || s.minimumYPixels + s.heightPixels > image.height) {
    throw new Error("PLANNER_PALETTE_SELECTION_INVALID");
  }
  const color = BABYLON_NATIVE_VISUAL_IDENTITY_COLORS[s.visualTargetIndex]!;
  const rgb = [1, 3, 5].map((start) => Number.parseInt(color.slice(start, start + 2), 16));
  const targetHue = hue(rgb[0]!, rgb[1]!, rgb[2]!).degrees;
  let matchingPixelCount = 0, changedPixelCount = 0;
  for (let y = s.minimumYPixels; y < s.minimumYPixels + s.heightPixels; y += 1) {
    for (let x = s.minimumXPixels; x < s.minimumXPixels + s.widthPixels; x += 1) {
      const offset = (y * image.width + x) * 4;
      if (image.pixels[offset + 3] !== 255) continue;
      const sourceHue = hue(image.pixels[offset]!, image.pixels[offset + 1]!, image.pixels[offset + 2]!);
      const distance = Math.abs(sourceHue.degrees - targetHue);
      // This is the authoring mask, NOT a widened checker tolerance. Reject
      // absent/neutral/wrong-hue pixels; ordinary final PNG gates are unchanged.
      if (Math.min(distance, 360 - distance) > 12 || sourceHue.saturation < 0.3 || sourceHue.brightness < 0.2) continue;
      matchingPixelCount += 1;
      if (rgb.some((channel, index) => channel !== image.pixels[offset + index])) {
        changedPixelCount += 1;
        for (let channel = 0; channel < 3; channel += 1) image.pixels[offset + channel] = rgb[channel]!;
      }
    }
  }
  if (matchingPixelCount === 0) throw new Error("PLANNER_PALETTE_EXISTING_TARGET_MISSING");
  const png = changedPixelCount === 0 ? input.sourcePng : encodePlannerPngV1(image);
  return { png, record: { kind: "planner-palette-authoring", schemaVersion: 1,
    sourcePngHash: input.sourcePngHash, authoredPngHash: hash(png), selection: s,
    identityColorHex: color, matchingPixelCount, changedPixelCount } };
}

async function workspaceFile(value: string, writable: boolean) {
  const root = await realpath(process.cwd());
  const absolute = path.resolve(value), parent = await realpath(path.dirname(absolute));
  const relative = path.relative(root, parent);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("PLANNER_PALETTE_PATH_INVALID");
  }
  return open(path.join(parent, path.basename(absolute)),
    (writable ? constants.O_RDWR : constants.O_RDONLY) | constants.O_NOFOLLOW);
}

export async function main(arguments_ = process.argv.slice(2)) {
  const accepted = ["--image", "--image-hash", "--brief", "--target", "--region-pixels"];
  if (arguments_.length !== accepted.length * 2) throw new Error("PLANNER_PALETTE_ARGUMENTS_INVALID");
  const values = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const flag = arguments_[index]!, value = arguments_[index + 1]!;
    if (!accepted.includes(flag) || values.has(flag) || !value) throw new Error("PLANNER_PALETTE_ARGUMENTS_INVALID");
    values.set(flag, value);
  }
  const imagePath = values.get("--image")!;
  if (!["world-plan.png", "entry-whitebox-target.png"].includes(path.basename(imagePath))) {
    throw new Error("PLANNER_PALETTE_IMAGE_ROLE_INVALID");
  }
  const briefHandle = await workspaceFile(values.get("--brief")!, false);
  let brief;
  try { brief = parseSceneBriefV1(await briefHandle.readFile("utf8")); }
  finally { await briefHandle.close(); }
  const target = values.get("--target")!.match(/^visual-target-([1-5])$/);
  const visualTargetIndex = target === null ? -1 : Number(target[1]) - 1;
  if (!brief.ok || visualTargetIndex < 0 || visualTargetIndex >= brief.value.visualTargets.length) {
    throw new Error("PLANNER_PALETTE_TARGET_INVALID");
  }
  const region = values.get("--region-pixels")!.split(",").map(Number);
  if (region.length !== 4) throw new Error("PLANNER_PALETTE_SELECTION_INVALID");
  const handle = await workspaceFile(imagePath, true);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 16_777_216) throw new Error("PLANNER_PALETTE_PATH_INVALID");
    const result = authorPlannerPaletteSelectionV1({ sourcePng: await handle.readFile(),
      sourcePngHash: values.get("--image-hash")!, selection: { visualTargetIndex,
        minimumXPixels: region[0]!, minimumYPixels: region[1]!, widthPixels: region[2]!, heightPixels: region[3]! } });
    if (result.record.changedPixelCount > 0) {
      let offset = 0;
      while (offset < result.png.length) {
        const { bytesWritten } = await handle.write(result.png, offset, result.png.length - offset, offset);
        if (bytesWritten === 0) throw new Error("PLANNER_PALETTE_WRITE_INCOMPLETE");
        offset += bytesWritten;
      }
      await handle.truncate(result.png.length);
      await handle.sync();
    }
    process.stdout.write(`${JSON.stringify(result.record)}\n`);
  } finally { await handle.close(); }
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}
