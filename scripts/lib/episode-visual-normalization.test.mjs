import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { normalizeEpisodePng, readPngSize } from "./episode-visual-normalization.mjs";

const execFileAsync = promisify(execFile);

test("normalizes the built-in image generator's near-16:9 PNG to delivery raster", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "worldkit-episode-visual-"));
  const imagePath = path.join(root, "styled-opening.png");
  try {
    await execFileAsync("ffmpeg", [
      "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=1672x941",
      "-frames:v", "1", imagePath,
    ]);
    const result = await normalizeEpisodePng(imagePath, { width: 1280, height: 720 });
    assert.equal(result.normalized, true);
    assert.deepEqual(await readPngSize(imagePath), { width: 1280, height: 720 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a materially different aspect ratio instead of hiding composition drift", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "worldkit-episode-visual-"));
  const imagePath = path.join(root, "portrait.png");
  try {
    await execFileAsync("ffmpeg", [
      "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=900x1200",
      "-frames:v", "1", imagePath,
    ]);
    await assert.rejects(
      normalizeEpisodePng(imagePath, { width: 1280, height: 720 }),
      /approximately 1280:720/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("aspect-fits a valid tri-view canvas without cropping its subject views", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "worldkit-episode-triview-"));
  const imagePath = path.join(root, "styled-triview.png");
  try {
    await execFileAsync("ffmpeg", [
      "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=1492x1054",
      "-frames:v", "1", imagePath,
    ]);
    const result = await normalizeEpisodePng(
      imagePath,
      { width: 1280, height: 720 },
      { allowAspectFit: true },
    );
    assert.equal(result.normalized, true);
    assert.deepEqual(await readPngSize(imagePath), { width: 1280, height: 720 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
