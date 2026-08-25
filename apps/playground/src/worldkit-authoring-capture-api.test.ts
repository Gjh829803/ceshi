import { describe, expect, it, vi } from "vitest";

import { installWorldkitAuthoringCaptureApi } from "./worldkit-authoring-capture-api";

const TARGET = {
  id: "primary-subject",
  visualTargetId: "visual-target-1",
  runtimeEntityIds: ["player"],
  role: "primary-subject" as const,
  semanticClassId: "subject.player",
  identityColor: "#E85D5D" as const,
};

describe("WorldKit authoring capture API", () => {
  it("keeps grouped tri-view capture outside the exact Runtime Browser API", () => {
    const target: Parameters<typeof installWorldkitAuthoringCaptureApi>[0] = {};
    const adapter = {
      configureVisualCaptureTargets: vi.fn(() => [TARGET]),
      listCaptureTargets: vi.fn(() => [TARGET]),
      captureRuntimeWhiteboxTriview: vi.fn(() => ({
        kind: "worldkit-whitebox-triview-capture" as const,
        schemaVersion: 1 as const,
        targetId: TARGET.id,
        runtimeEntityIds: TARGET.runtimeEntityIds,
        views: ["front", "right", "back"] as const,
        imageDataUrl: "data:image/png;base64,AA==",
      })),
    };
    const installation = installWorldkitAuthoringCaptureApi(target, adapter);

    expect(Object.keys(installation.api).sort()).toEqual([
      "captureWhiteboxTriview",
      "configureVisualCaptureTargets",
      "listCaptureTargets",
      "version",
    ]);
    expect(installation.api.version).toBe(1);
    expect(installation.api.configureVisualCaptureTargets([TARGET])).toEqual([TARGET]);
    expect(installation.api.listCaptureTargets()).toEqual([TARGET]);
    expect(installation.api.captureWhiteboxTriview(TARGET.id)).toMatchObject({
      targetId: TARGET.id,
      views: ["front", "right", "back"],
    });
    expect(target.__WORLDKIT_AUTHORING_CAPTURE__).toBe(installation.api);

    installation.dispose();
    expect(target.__WORLDKIT_AUTHORING_CAPTURE__).toBeUndefined();
  });
});
