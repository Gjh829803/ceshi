import { describe, expect, it, vi } from "vitest";

import type { BabylonWorldAdapter } from "./babylon-world-adapter.js";
import { BabylonArtifactRenderer } from "./babylon-artifact-renderer.js";

describe("BabylonArtifactRenderer", () => {
  it("exposes only the artifact surface and no Gameplay authority", () => {
    const prototype = BabylonArtifactRenderer.prototype as unknown as Record<string, unknown>;

    for (const method of [
      "mount",
      "render",
      "restoreOpeningView",
      "captureScreenshot",
      "captureCompositionMask",
      "analyzeOpeningComposition",
      "exportOpeningFrame",
      "getWorldSpec",
      "getPlanArtifacts",
      "capturePlanningView",
      "getVisualPrototypes",
      "captureWhiteboxTriview",
      "exportWhiteboxTriviews",
      "inspectFeatures",
      "dispose",
    ]) expect(prototype).toHaveProperty(method);

    for (const method of [
      "setPaused",
      "reset",
      "runFixedInput",
      "snapshot",
      "subscribe",
    ]) expect(prototype).not.toHaveProperty(method);
  });

  it("owns adapter disposal exactly once even when the adapter rejects cleanup", async () => {
    const disposeRuntime = vi.fn().mockRejectedValue(new Error("dispose failed"));
    const adapter = { disposeRuntime, setPaused: vi.fn() } as unknown as BabylonWorldAdapter;
    const renderer = BabylonArtifactRenderer.fromAdapterForTest(adapter, {
      sceneCatalogId: "fixture",
      featureInspections: [],
    });

    const first = renderer.dispose();
    const second = renderer.dispose();

    expect(second).toBe(first);
    await expect(first).rejects.toThrow("dispose failed");
    await expect(second).rejects.toThrow("dispose failed");
    expect(disposeRuntime).toHaveBeenCalledOnce();
  });
});
