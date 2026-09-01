import { describe, expect, it } from "vitest";

import {
  ARTIFACT_SCENE_CATALOG_IDS,
  SCENE_VIEWER_PRESET_IDS,
  artifactSceneCatalogUrl,
  curatedViewerPresetUrl,
  sceneViewerFailureCount,
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
      "mounted-skateboard-s1",
    ]);
  });

  it("creates closed curated-preset and artifact-only routes", () => {
    expect(
      curatedViewerPresetUrl(
        "http://127.0.0.1:5173/?stale=1",
        "action-lab",
      ),
    ).toBe("http://127.0.0.1:5173/?stale=1&scene=action-lab");
    expect(
      artifactSceneCatalogUrl(
        "http://127.0.0.1:5173/?stale=1",
        "azure-bay",
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
      curatedPresets: [failed("gameplay")],
      presetSwitch: failed("preset-switch"),
      invalidPresetRoute: failed("unknown-preset"),
      artifacts: [failed("artifact")],
    } satisfies SceneViewerVerificationReportV1;

    expect(sceneViewerFailureCount(report)).toBe(4);
  });
});
