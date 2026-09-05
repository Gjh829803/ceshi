import { describe, expect, it, vi } from "vitest";
import { inspectWhiteboxTriviewPixelsV1 } from "@whitebox-world/runtime-contracts";

import { installWorldkitAuthoringCaptureApi } from "./worldkit-authoring-capture-api";

const TARGET = {
  visualTargetId: "visual-target-1",
  runtimeEntityIds: ["player"],
  frontDirectionWorldXZ: [0, -1] as const,
  role: "primary-subject" as const,
  semanticClassId: "subject.player",
  identityColor: "#E85D5D" as const,
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
        inspection: inspectWhiteboxTriviewPixelsV1(new Uint8ClampedArray(12), 3, 1),
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
