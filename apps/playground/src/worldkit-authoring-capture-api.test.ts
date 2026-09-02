import { describe, expect, it, vi } from "vitest";

import { installWorldkitAuthoringCaptureApi } from "./worldkit-authoring-capture-api";

const TARGET = {
  visualTargetId: "visual-target-1",
  runtimeEntityIds: ["player"],
  role: "primary-subject" as const,
  semanticClassId: "subject.player",
  identityColor: "#E85D5D" as const,
  frontDirectionWorldXZ: [0, -1] as const,
};

describe("WorldKit authoring capture API", () => {
  it("keeps grouped tri-view capture outside the exact Runtime Browser API", () => {
    const target: Parameters<typeof installWorldkitAuthoringCaptureApi>[0] = {};
    const adapter = {
      configureVisualCaptureGroups: vi.fn(() => [TARGET]),
      listVisualCaptureGroups: vi.fn(() => [TARGET]),
      captureRuntimeWhiteboxTriview: vi.fn(() => ({
        kind: "worldkit-whitebox-triview-capture" as const,
        schemaVersion: 1 as const,
        visualTargetId: TARGET.visualTargetId,
        runtimeEntityIds: TARGET.runtimeEntityIds,
        views: ["front", "right", "back"] as const,
        imageDataUri: "data:image/png;base64,AA==",
        inspection: {
          widthPixels: 3,
          heightPixels: 1,
          foregroundPixelCount: 3,
          minimumForegroundPixelCount: 3,
          foregroundBoundsPixels: {
            minimumPixelsXY: [0, 0] as const,
            maximumPixelsXY: [2, 0] as const,
          },
          viewInspections: [
            {
              view: "front" as const,
              foregroundPixelCount: 1,
              minimumForegroundPixelCount: 1,
              foregroundBoundsPixels: {
                minimumPixelsXY: [0, 0] as const,
                maximumPixelsXY: [0, 0] as const,
              },
              isRenderable: true,
            },
            {
              view: "right" as const,
              foregroundPixelCount: 1,
              minimumForegroundPixelCount: 1,
              foregroundBoundsPixels: {
                minimumPixelsXY: [0, 0] as const,
                maximumPixelsXY: [0, 0] as const,
              },
              isRenderable: true,
            },
            {
              view: "back" as const,
              foregroundPixelCount: 1,
              minimumForegroundPixelCount: 1,
              foregroundBoundsPixels: {
                minimumPixelsXY: [0, 0] as const,
                maximumPixelsXY: [0, 0] as const,
              },
              isRenderable: true,
            },
          ] as const,
          isRenderable: true,
        },
      })),
    };
    const installation = installWorldkitAuthoringCaptureApi(target, adapter);

    expect(Object.keys(installation.api).sort()).toEqual([
      "captureWhiteboxTriview",
      "configureVisualCaptureGroups",
      "listVisualCaptureGroups",
      "version",
    ]);
    expect(installation.api.version).toBe(1);
    expect(installation.api.configureVisualCaptureGroups([TARGET])).toEqual([TARGET]);
    expect(installation.api.listVisualCaptureGroups()).toEqual([TARGET]);
    expect(installation.api.captureWhiteboxTriview(TARGET.visualTargetId)).toMatchObject({
      visualTargetId: TARGET.visualTargetId,
      views: ["front", "right", "back"],
    });
    expect(target.__WORLDKIT_AUTHORING_CAPTURE__).toBe(installation.api);

    installation.dispose();
    expect(target.__WORLDKIT_AUTHORING_CAPTURE__).toBeUndefined();
  });
});
