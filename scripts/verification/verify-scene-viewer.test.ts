import { describe, expect, it } from "vitest";

import {
  ARTIFACT_SCENE_CATALOG_IDS,
  SCENE_VIEWER_PRESET_IDS,
  sceneViewerFailureCount,
  sceneViewerUrl,
  type SceneViewerVerificationReportV1,
  type VerificationResultV1,
} from "./verify-scene-viewer.js";

function failed<T>(message: string): VerificationResultV1<T> {
  return {
    status: "failed",
    failure: { name: "Error", message },
  };
}

describe("verify:scene-viewer", () => {
  it("locks the three current G Bot Viewer presets and separate artifact catalog", () => {
    expect(SCENE_VIEWER_PRESET_IDS).toEqual([
      "feel-flat",
      "traversal-course",
      "action-lab",
    ]);
    expect(ARTIFACT_SCENE_CATALOG_IDS).toEqual([
      "grassland",
      "azure-bay",
      "canyon",
      "mistbound-rider",
      "sunlit-flower-bay",
      "world-08170639-54db",
    ]);
  });

  it("creates distinct gameplay and artifact-only routes", () => {
    expect(sceneViewerUrl("http://127.0.0.1:5173", "azure-bay"))
      .toBe("http://127.0.0.1:5173/?scene=azure-bay");
    expect(
      sceneViewerUrl(
        "http://127.0.0.1:5173/?stale=1",
        "azure-bay",
        true,
      ),
    ).toBe(
      "http://127.0.0.1:5173/?stale=1&scene=azure-bay&artifact=1",
    );
  });

  it("counts failures across gameplay, unknown-scene, and artifact gates", () => {
    const report = {
      kind: "scene-viewer-browser-verification",
      schemaVersion: 1,
      generatedAt: "2026-08-24T00:00:00.000Z",
      scenes: [failed("gameplay")],
      sceneSwitch: failed("scene-switch"),
      invalidSceneRoute: failed("unknown-scene"),
      artifacts: [failed("artifact")],
    } satisfies SceneViewerVerificationReportV1;

    expect(sceneViewerFailureCount(report)).toBe(4);
  });
});
