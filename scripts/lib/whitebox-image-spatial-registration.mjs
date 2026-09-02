import { readFile } from "node:fs/promises";

import sharp from "sharp";

function parseHex(value) {
  const match = /^#([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})$/i.exec(String(value));
  if (!match) throw new Error(`Invalid whitebox identity color: ${value}`);
  return match.slice(1).map((part) => Number.parseInt(part, 16));
}

function hsv([red, green, blue]) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  const delta = maximum - minimum;
  let hue = 0;
  if (delta > 0) {
    if (maximum === r) hue = ((g - b) / delta) % 6;
    else if (maximum === g) hue = ((b - r) / delta) + 2;
    else hue = ((r - g) / delta) + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return { hue, saturation: maximum === 0 ? 0 : delta / maximum, value: maximum };
}

function hueDistance(first, second) {
  const difference = Math.abs(first - second);
  return Math.min(difference, 360 - difference);
}

function ratio(value, total) {
  return Number((value / total).toFixed(4));
}

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

export async function deriveWhiteboxImageSpatialRegistration({
  openingPath,
  triviewManifestPath,
}) {
  const [manifest, image] = await Promise.all([
    readFile(triviewManifestPath, "utf8").then(JSON.parse),
    sharp(openingPath).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  const targets = [];
  for (const target of manifest?.whiteboxTriviews ?? []) {
    const targetHsv = hsv(parseHex(target.identityColor));
    let minimumX = image.info.width;
    let minimumY = image.info.height;
    let maximumX = -1;
    let maximumY = -1;
    let pixelCount = 0;
    for (let y = 0; y < image.info.height; y += 1) {
      for (let x = 0; x < image.info.width; x += 1) {
        const offset = (y * image.info.width + x) * image.info.channels;
        const current = hsv([
          image.data[offset], image.data[offset + 1], image.data[offset + 2],
        ]);
        if (hueDistance(current.hue, targetHsv.hue) > 18 ||
            current.saturation < 0.12 || current.value < 0.22) continue;
        pixelCount += 1;
        minimumX = Math.min(minimumX, x);
        minimumY = Math.min(minimumY, y);
        maximumX = Math.max(maximumX, x);
        maximumY = Math.max(maximumY, y);
      }
    }
    if (pixelCount < 4) {
      targets.push({
        visualTargetId: target.visualTargetId,
        role: target.role ?? "complete-target",
        visible: false,
      });
      continue;
    }
    const subject = target.role === "primary-subject";
    const horizontalMargin = subject ? 0 : 0.015;
    const topMargin = subject ? 0 : 0.01;
    const bottomMargin = subject ? 0 : 0.03;
    const bounds = {
      left: ratio(minimumX, image.info.width),
      top: ratio(minimumY, image.info.height),
      right: ratio(maximumX + 1, image.info.width),
      bottom: ratio(maximumY + 1, image.info.height),
    };
    const promptBounds = {
      left: Math.max(0, Number((bounds.left - horizontalMargin).toFixed(4))),
      top: Math.max(0, Number((bounds.top - topMargin).toFixed(4))),
      right: Math.min(1, Number((bounds.right + horizontalMargin).toFixed(4))),
      bottom: Math.min(1, Number((bounds.bottom + bottomMargin).toFixed(4))),
    };
    targets.push({
      visualTargetId: target.visualTargetId,
      role: target.role ?? "complete-target",
      visible: true,
      identityColor: target.identityColor,
      evidencePixelCount: pixelCount,
      bounds,
      promptBounds,
      prompt: `${target.visualTargetId} (${target.role ?? "complete-target"}) must stay ` +
        `inside approximately x ${percent(promptBounds.left)}-${percent(promptBounds.right)}, ` +
        `y ${percent(promptBounds.top)}-${percent(promptBounds.bottom)} of the frame.`,
    });
  }
  return {
    kind: "worldkit-whitebox-image-spatial-registration",
    schemaVersion: 1,
    width: image.info.width,
    height: image.info.height,
    targets,
  };
}
