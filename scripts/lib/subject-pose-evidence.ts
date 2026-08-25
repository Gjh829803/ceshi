import { createHash } from "node:crypto";

export type PixelBoundsXYWH = readonly [number, number, number, number];

export interface SubjectPoseEvidenceV1 {
  readonly boundsPixelsXYWH: PixelBoundsXYWH;
  readonly foregroundBoundsPixelsXYWH: PixelBoundsXYWH;
  readonly foregroundPixelCount: number;
  readonly normalizationMode: "foreground-origin";
  readonly sha256: string;
}

export interface SubjectPoseAnalysisV1 {
  readonly evidence: SubjectPoseEvidenceV1;
  readonly silhouetteMask: Uint8Array;
}

export interface SubjectPoseComparisonV1 {
  readonly differingPixelCount: number;
  readonly unionForegroundPixelCount: number;
  readonly differenceRatio: number;
}

export interface GlbAnimationClipTimingV1 {
  readonly durationSeconds: number;
  readonly framesPerSecond: number;
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be finite and positive.`);
  }
}

export function readGlbAnimationClipTiming(
  bytes: Uint8Array,
  clipName: string,
): GlbAnimationClipTimingV1 {
  if (bytes.byteLength < 20) throw new Error("GLB animation timing requires a complete header.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(16, true) !== 0x4e4f534a
  ) {
    throw new Error("GLB animation timing requires a version 2 JSON chunk.");
  }
  const jsonByteLength = view.getUint32(12, true);
  const jsonEnd = 20 + jsonByteLength;
  if (jsonEnd > bytes.byteLength) throw new Error("GLB JSON chunk exceeds the asset bytes.");
  const document = JSON.parse(
    new TextDecoder().decode(bytes.subarray(20, jsonEnd)),
  ) as {
    accessors?: readonly {
      count?: number;
      min?: readonly number[];
      max?: readonly number[];
    }[];
    animations?: readonly {
      name?: string;
      extras?: { framesPerSecond?: number };
      samplers?: readonly { input?: number }[];
    }[];
  };
  const matches = document.animations?.filter((animation) => animation.name === clipName) ?? [];
  if (matches.length !== 1 || document.accessors === undefined) {
    throw new Error(`GLB animation clip '${clipName}' must resolve exactly once.`);
  }
  const animation = matches[0]!;
  const inputAccessorIndexes = new Set(
    animation.samplers?.map((sampler) => sampler.input) ?? [],
  );
  if (
    inputAccessorIndexes.size === 0 ||
    [...inputAccessorIndexes].some((index) => !Number.isSafeInteger(index))
  ) {
    throw new Error(`GLB animation clip '${clipName}' must use valid timing accessors.`);
  }
  const accessors = [...inputAccessorIndexes].map((index) =>
    document.accessors![index!]
  );
  const accessor = accessors[0];
  const keyframeCount = accessor?.count;
  const minimumSeconds = accessor?.min?.[0];
  const maximumSeconds = accessor?.max?.[0];
  if (
    !Number.isFinite(minimumSeconds) ||
    !Number.isFinite(maximumSeconds) ||
    maximumSeconds! <= minimumSeconds! ||
    accessors.some((candidate) =>
      candidate?.count !== keyframeCount ||
      candidate?.min?.[0] !== minimumSeconds ||
      candidate?.max?.[0] !== maximumSeconds
    )
  ) {
    throw new Error(`GLB animation clip '${clipName}' has invalid timing bounds.`);
  }
  const durationSeconds = maximumSeconds! - minimumSeconds!;
  const framesPerSecond = animation.extras?.framesPerSecond ??
    (Number.isSafeInteger(keyframeCount) && keyframeCount! > 1
      ? (keyframeCount! - 1) / durationSeconds
      : Number.NaN);
  assertPositiveFinite(framesPerSecond, "GLB animation framesPerSecond");
  return {
    durationSeconds,
    framesPerSecond,
  };
}

export function deriveLoopQuarterCycleCaptureTick(options: {
  actionStartTick: number;
  blendDurationSeconds: number;
  clipDurationSeconds: number;
  fixedTicksPerSecond: number;
  playbackSpeedRatio: number;
}): number {
  if (!Number.isSafeInteger(options.actionStartTick) || options.actionStartTick < 0) {
    throw new RangeError("actionStartTick must be a non-negative safe integer.");
  }
  if (!Number.isFinite(options.blendDurationSeconds) || options.blendDurationSeconds < 0) {
    throw new RangeError("blendDurationSeconds must be finite and non-negative.");
  }
  assertPositiveFinite(options.clipDurationSeconds, "clipDurationSeconds");
  assertPositiveFinite(options.fixedTicksPerSecond, "fixedTicksPerSecond");
  assertPositiveFinite(options.playbackSpeedRatio, "playbackSpeedRatio");

  const cycleTicks =
    (options.clipDurationSeconds / options.playbackSpeedRatio) *
    options.fixedTicksPerSecond;
  const blendTicks = Math.round(
    options.blendDurationSeconds * options.fixedTicksPerSecond,
  );
  const halfCycleTicks = cycleTicks / 2;
  let peakElapsedTicks = cycleTicks / 4;
  while (peakElapsedTicks < blendTicks) peakElapsedTicks += halfCycleTicks;
  return options.actionStartTick + Math.round(peakElapsedTicks);
}

function isSubjectForeground(red: number, green: number, blue: number): boolean {
  return red >= 90 && red > green * 1.35 && red > blue * 1.35;
}

export function analyzeSubjectPoseCrop(options: {
  boundsPixelsXYWH: PixelBoundsXYWH;
  rgbaBytes: Uint8Array;
}): SubjectPoseAnalysisV1 {
  const [xPixels, yPixels, widthPixels, heightPixels] = options.boundsPixelsXYWH;
  if (
    ![xPixels, yPixels, widthPixels, heightPixels].every(Number.isSafeInteger) ||
    xPixels < 0 ||
    yPixels < 0 ||
    widthPixels <= 0 ||
    heightPixels <= 0
  ) {
    throw new RangeError("boundsPixelsXYWH must contain a non-negative origin and positive size.");
  }
  const expectedByteLength = widthPixels * heightPixels * 4;
  if (options.rgbaBytes.byteLength !== expectedByteLength) {
    throw new RangeError(
      `Subject pose crop requires ${expectedByteLength} RGBA bytes, received ${options.rgbaBytes.byteLength}.`,
    );
  }

  const unnormalizedMask = new Uint8Array(widthPixels * heightPixels);
  let foregroundPixelCount = 0;
  let minimumForegroundXPixels = widthPixels;
  let minimumForegroundYPixels = heightPixels;
  let maximumForegroundXPixels = -1;
  let maximumForegroundYPixels = -1;
  for (let pixel = 0; pixel < unnormalizedMask.length; pixel += 1) {
    const offset = pixel * 4;
    const isForeground =
      options.rgbaBytes[offset + 3]! >= 128 &&
      isSubjectForeground(
        options.rgbaBytes[offset]!,
        options.rgbaBytes[offset + 1]!,
        options.rgbaBytes[offset + 2]!,
    );
    if (!isForeground) continue;
    unnormalizedMask[pixel] = 1;
    foregroundPixelCount += 1;
    const foregroundXPixels = pixel % widthPixels;
    const foregroundYPixels = Math.floor(pixel / widthPixels);
    minimumForegroundXPixels = Math.min(minimumForegroundXPixels, foregroundXPixels);
    minimumForegroundYPixels = Math.min(minimumForegroundYPixels, foregroundYPixels);
    maximumForegroundXPixels = Math.max(maximumForegroundXPixels, foregroundXPixels);
    maximumForegroundYPixels = Math.max(maximumForegroundYPixels, foregroundYPixels);
  }
  if (foregroundPixelCount === 0) {
    throw new Error("SUBJECT_POSE_FOREGROUND_MISSING");
  }
  const silhouetteMask = new Uint8Array(widthPixels * heightPixels);
  for (let pixel = 0; pixel < unnormalizedMask.length; pixel += 1) {
    if (unnormalizedMask[pixel] !== 1) continue;
    const normalizedXPixels = (pixel % widthPixels) - minimumForegroundXPixels;
    const normalizedYPixels =
      Math.floor(pixel / widthPixels) - minimumForegroundYPixels;
    silhouetteMask[normalizedYPixels * widthPixels + normalizedXPixels] = 1;
  }
  return {
    evidence: {
      boundsPixelsXYWH: [...options.boundsPixelsXYWH],
      foregroundBoundsPixelsXYWH: [
        xPixels + minimumForegroundXPixels,
        yPixels + minimumForegroundYPixels,
        maximumForegroundXPixels - minimumForegroundXPixels + 1,
        maximumForegroundYPixels - minimumForegroundYPixels + 1,
      ],
      foregroundPixelCount,
      normalizationMode: "foreground-origin",
      sha256: `sha256:${createHash("sha256").update(silhouetteMask).digest("hex")}`,
    },
    silhouetteMask,
  };
}

export function compareSubjectPoseSilhouettes(
  first: SubjectPoseAnalysisV1,
  second: SubjectPoseAnalysisV1,
): SubjectPoseComparisonV1 {
  if (
    first.silhouetteMask.length !== second.silhouetteMask.length ||
    first.evidence.boundsPixelsXYWH.some(
      (value, index) => value !== second.evidence.boundsPixelsXYWH[index],
    )
  ) {
    throw new Error("Subject pose silhouettes must use the same pixel bounds.");
  }
  let differingPixelCount = 0;
  let unionForegroundPixelCount = 0;
  for (let pixel = 0; pixel < first.silhouetteMask.length; pixel += 1) {
    const firstForeground = first.silhouetteMask[pixel] === 1;
    const secondForeground = second.silhouetteMask[pixel] === 1;
    if (firstForeground || secondForeground) unionForegroundPixelCount += 1;
    if (firstForeground !== secondForeground) differingPixelCount += 1;
  }
  if (unionForegroundPixelCount === 0) {
    throw new Error("SUBJECT_POSE_FOREGROUND_MISSING");
  }
  return {
    differingPixelCount,
    unionForegroundPixelCount,
    differenceRatio: differingPixelCount / unionForegroundPixelCount,
  };
}
