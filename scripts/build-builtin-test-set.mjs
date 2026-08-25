#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.argv[2] || "");
if (!root) throw new Error("Usage: node scripts/build-builtin-test-set.mjs <builtin-test-set-root>");

const review = JSON.parse(await readFile(path.join(root, "review.json"), "utf8"));
const reviewedNames = new Set(review.matchingOriginalNames ?? []);
const imagesRoot = path.join(root, "images");
const names = (await readdir(imagesRoot))
  .filter((name) => /\.(?:png|jpe?g|webp)$/i.test(name))
  .sort((left, right) => left.localeCompare(right, "zh-CN", { numeric: true }));
if (names.length === 0) throw new Error("The built-in test set has no images.");

const images = [];
for (const [index, name] of names.entries()) {
  const filePath = path.join(imagesRoot, name);
  const bytes = await readFile(filePath);
  const metadata = await stat(filePath);
  const contentSha256 = createHash("sha256").update(bytes).digest("hex");
  const extension = path.extname(name).slice(1).toLowerCase().replace("jpeg", "jpg");
  const humanoidWalking = reviewedNames.has(name);
  images.push({
    id: `image-${String(index + 1).padStart(3, "0")}-${contentSha256.slice(0, 4)}`,
    sourceFile: `images/${name}`,
    extension,
    mimeType: extension === "jpg" ? "image/jpeg" : `image/${extension}`,
    contentSha256,
    originalName: name,
    size: metadata.size,
    labels: {
      humanoidWalking,
      primaryLocomotion: humanoidWalking ? "walking" : "other",
      reviewedBy: "manual-visual-review",
    },
    tags: humanoidWalking ? ["humanoid-walking"] : [],
  });
}

const unknownReviewedNames = [...reviewedNames].filter((name) => !names.includes(name));
if (unknownReviewedNames.length > 0) {
  throw new Error(`Reviewed files are missing: ${unknownReviewedNames.join(", ")}`);
}

const manifest = {
  kind: "worldkit-builtin-test-set",
  schemaVersion: 1,
  id: "test-set-worldkit-reference-scenes-v1",
  name: "WorldKit 综合参考场景 · V1",
  prompt: "严格依据每张参考图创建可玩的白膜世界。保持主体运动方式、地形与空间拓扑、完整标志物和可玩视角；不要把骑乘、载具或飞行 case 改成人形步行，也不要为开阔场景凭空增加路线。",
  createdAt: "2026-08-21T00:00:00.000Z",
  updatedAt: "2026-08-21T00:00:00.000Z",
  review: {
    label: review.label,
    criteria: review.criteria,
    reviewedAt: review.reviewedAt,
    matchingCount: images.filter((image) => image.labels.humanoidWalking).length,
  },
  images,
};

await writeFile(path.join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({
  id: manifest.id,
  images: images.length,
  humanoidWalking: manifest.review.matchingCount,
})}\n`);
