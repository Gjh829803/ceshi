import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  analyzeSubjectPoseCrop,
  compareSubjectPoseSilhouettes,
  deriveLoopQuarterCycleCaptureTick,
  readGlbAnimationClipTiming,
} from "./subject-pose-evidence";

type Rgb = readonly [number, number, number];

function rgbaFixture(
  widthPixels: number,
  heightPixels: number,
  background: Rgb,
  subjectPixelIndexes: readonly number[],
): Uint8Array {
  const bytes = new Uint8Array(widthPixels * heightPixels * 4);
  for (let pixel = 0; pixel < widthPixels * heightPixels; pixel += 1) {
    const offset = pixel * 4;
    const color = subjectPixelIndexes.includes(pixel)
      ? ([180, 20, 20] as const)
      : background;
    bytes.set([...color, 255], offset);
  }
  return bytes;
}

describe("subject pose evidence", () => {
  it("reads the walk duration and FPS from the committed GLB", async () => {
    const bytes = await readFile(fileURLToPath(new URL(
      "../../apps/playground/public/subject-assets/humanoid/golden/v2/golden-humanoid.glb",
      import.meta.url,
    )));

    expect(readGlbAnimationClipTiming(bytes, "walk")).toEqual({
      durationSeconds: 1,
      framesPerSecond: 30,
    });
  });

  it("derives the first post-blend quarter-cycle peak from real clip timing", () => {
    expect(deriveLoopQuarterCycleCaptureTick({
      actionStartTick: 1,
      blendDurationSeconds: 0.2,
      clipDurationSeconds: 1,
      fixedTicksPerSecond: 60,
      playbackSpeedRatio: 1,
    })).toBe(16);
  });

  it("ignores background changes when hashing the subject silhouette", () => {
    const boundsPixelsXYWH = [0, 0, 4, 4] as const;
    const first = analyzeSubjectPoseCrop({
      boundsPixelsXYWH,
      rgbaBytes: rgbaFixture(4, 4, [120, 100, 45], [5, 9]),
    });
    const second = analyzeSubjectPoseCrop({
      boundsPixelsXYWH,
      rgbaBytes: rgbaFixture(4, 4, [80, 160, 210], [5, 9]),
    });

    expect(first.evidence.foregroundPixelCount).toBe(2);
    expect(second.evidence.foregroundPixelCount).toBe(2);
    expect(first.evidence.sha256).toBe(second.evidence.sha256);
    expect(compareSubjectPoseSilhouettes(first, second)).toEqual({
      differingPixelCount: 0,
      differenceRatio: 0,
      unionForegroundPixelCount: 2,
    });
  });

  it("normalizes subject translation so camera tracking cannot create a pose difference", () => {
    const boundsPixelsXYWH = [0, 0, 5, 5] as const;
    const first = analyzeSubjectPoseCrop({
      boundsPixelsXYWH,
      rgbaBytes: rgbaFixture(5, 5, [120, 100, 45], [6, 11]),
    });
    const shifted = analyzeSubjectPoseCrop({
      boundsPixelsXYWH,
      rgbaBytes: rgbaFixture(5, 5, [80, 160, 210], [8, 13]),
    });

    expect(first.evidence.sha256).toBe(shifted.evidence.sha256);
    expect(compareSubjectPoseSilhouettes(first, shifted).differenceRatio).toBe(0);
  });

  it("measures a local pose change from foreground silhouette pixels only", () => {
    const boundsPixelsXYWH = [0, 0, 4, 4] as const;
    const first = analyzeSubjectPoseCrop({
      boundsPixelsXYWH,
      rgbaBytes: rgbaFixture(4, 4, [120, 100, 45], [5, 9]),
    });
    const second = analyzeSubjectPoseCrop({
      boundsPixelsXYWH,
      rgbaBytes: rgbaFixture(4, 4, [80, 160, 210], [5, 6]),
    });

    expect(compareSubjectPoseSilhouettes(first, second)).toEqual({
      differingPixelCount: 2,
      differenceRatio: 2 / 3,
      unionForegroundPixelCount: 3,
    });
  });
});
