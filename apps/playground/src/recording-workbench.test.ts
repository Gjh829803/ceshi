import { describe, expect, it } from "vitest";

import {
  formatWorkbenchDuration,
  recordingStatusLabel,
  renderAssetStrip,
} from "@whitebox-world/browser-recording/workbench";
import { recordingWorkbenchSceneId } from "./recording-workbench-route.js";

describe("recording workbench presentation", () => {
  it("renders current visualTargetId assets without an id alias", () => {
    const html = renderAssetStrip({
      ready: true,
      bundleReady: true,
      styledOpeningFrameUrl: "/opening.png",
      styledTriviews: [{
        visualTargetId: "palace",
        role: "primary-landmark",
        semanticClassId: "visual.landmark",
        url: "/styled-triviews/palace",
      }],
    });
    expect(html).toContain('alt="palace"');
    expect(html).toContain('href="/styled-triviews/palace"');
    expect(html).not.toContain("undefined");
  });
  it("formats recording duration without losing minute boundaries", () => {
    expect(formatWorkbenchDuration(0)).toBe("00:00");
    expect(formatWorkbenchDuration(61_900)).toBe("01:01");
  });

  it("uses explicit prompt and video generation states", () => {
    expect(recordingStatusLabel("prompt-running")).toBe("正在补全 Prompt");
    expect(recordingStatusLabel("video-running")).toBe("Seedance 生成中");
    expect(recordingStatusLabel("ready")).toBe("视频已完成");
  });

  it("binds the workbench only to the Studio world identity selected by the Host", () => {
    expect(recordingWorkbenchSceneId({
      mode: "viewer",
      studioWorldId: "studio-world",
    })).toBe("studio-world");
    expect(recordingWorkbenchSceneId({ mode: "viewer" })).toBeUndefined();
    expect(recordingWorkbenchSceneId({
      mode: "artifact-only",
      sceneCatalogId: "grassland",
      captureArtifactsEnabled: false,
    })).toBeUndefined();
  });
});
