import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { stringifyCanonicalJson } from "@whitebox-world/protocol";
import type { VisualCaptureGroupV1, WhiteboxTriviewCaptureV1, WhiteboxTriviewManifestV1 } from "@whitebox-world/runtime-contracts";
import { writeAtomic } from "../lib/write-atomic.js";

/** Host-only old tri-view admission and failure evidence; no Runtime state writes. */
export async function writeWhiteboxTriviewCaptures(
  absoluteTriviewOutputPath: string,
  captures: readonly Readonly<{ target: VisualCaptureGroupV1; capture: WhiteboxTriviewCaptureV1 }>[],
  options: Readonly<{ failedOutputPath?: string; beforeWrite?: (relativePath: string) => Promise<void> }> = {},
): Promise<WhiteboxTriviewManifestV1["whiteboxTriviews"]> {
  const pngDataUrlPrefix = "data:image/png;base64,";
  const whiteboxTriviews = [] as {
    visualTargetId: string;
    runtimeEntityIds: readonly string[];
    role: VisualCaptureGroupV1["role"];
    semanticClassId: string;
    identityColor: `#${string}`;
    frontDirectionWorldXZ: readonly [number, number];
    views: readonly ["front", "right", "back"];
    imageUri: string;
  }[];
  const preparedTriviews = [] as Array<{
    target: VisualCaptureGroupV1;
    capture: WhiteboxTriviewCaptureV1;
    pngBytes: Buffer;
  }>;
  for (const triview of captures) {
    if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(triview.target.visualTargetId)) {
      throw new Error(`WORLDKIT_CAPTURE_TARGET_ID_INVALID: ${triview.target.visualTargetId}`);
    }
    if (!triview.capture.imageDataUri.startsWith(pngDataUrlPrefix)) {
      throw new Error(`WORLDKIT_CAPTURE_TRIVIEW_DATA_URL_INVALID: ${triview.target.visualTargetId}`);
    }
    const triviewPngBytes = Buffer.from(
      triview.capture.imageDataUri.slice(pngDataUrlPrefix.length),
      "base64",
    );
    if (!triview.capture.inspection.isRenderable) {
      const failedCaptureDirectory = path.join(
        options.failedOutputPath ?? absoluteTriviewOutputPath,
        ".failed",
        triview.target.visualTargetId,
      );
      await Promise.all([
        writeAtomic(
          path.join(failedCaptureDirectory, "whitebox-triview.png"),
          triviewPngBytes,
        ),
        writeAtomic(
          path.join(failedCaptureDirectory, "capture-failure.json"),
          `${stringifyCanonicalJson({
            kind: "worldkit-whitebox-triview-capture-failure",
            schemaVersion: 1,
            visualTargetId: triview.target.visualTargetId,
            runtimeEntityIds: triview.target.runtimeEntityIds,
            inspection: triview.capture.inspection,
            diagnostic: {
              code: "WORLDKIT_CAPTURE_TRIVIEW_EMPTY",
              message: "Tri-view capture does not contain enough visible target pixels.",
            },
          })}\n`,
        ),
      ]);
      throw new Error(
        `WORLDKIT_CAPTURE_TRIVIEW_EMPTY: ${triview.target.visualTargetId} ` +
        `(foreground ${triview.capture.inspection.foregroundPixelCount}/` +
        `${triview.capture.inspection.minimumForegroundPixelCount}; empty views: ` +
        `${triview.capture.inspection.viewInspections
          .filter(({ isRenderable }) => !isRenderable)
          .map(({ view }) => view)
          .join(",")})`,
      );
    }
    preparedTriviews.push({
      target: triview.target,
      capture: triview.capture,
      pngBytes: triviewPngBytes,
    });
  }
  for (const triview of preparedTriviews) {
    const relativeImagePath = `${triview.target.visualTargetId}/whitebox-triview.png`;
    const imagePath = path.join(absoluteTriviewOutputPath, relativeImagePath);
    await mkdir(path.dirname(imagePath), { recursive: true });
    await options.beforeWrite?.(relativeImagePath);
    await writeFile(
      imagePath,
      triview.pngBytes,
    );
    whiteboxTriviews.push({
      ...triview.target,
      views: ["front", "right", "back"],
      imageUri: relativeImagePath,
    });
  }
  return whiteboxTriviews;
}
