import { describe, expect, it } from "vitest";

import { initializePlaygroundAdapterV1 } from "./playground-adapter-startup.js";

describe("initializePlaygroundAdapterV1", () => {
  it("publishes visual readiness only after the adapter is mounted and rendered", () => {
    const events: string[] = [];
    const adapter = {
      configureVisualCaptureGroups: () => [],
      setPaused: () => events.push("pause"),
      mount: () => events.push("mount"),
      render: () => events.push("render"),
    };

    expect(initializePlaygroundAdapterV1({
      adapter,
      visualCaptureGroups: [],
      viewport: {} as HTMLElement,
      trackAdapter: () => events.push("track"),
      setStartupStage: (stage) => events.push(`stage:${stage}`),
      onFirstRenderReady: () => events.push("ready"),
    })).toBe(adapter);
    expect(events).toEqual([
      "track",
      "pause",
      "stage:visual-targets-configure",
      "stage:adapter-mount",
      "mount",
      "stage:first-render",
      "render",
      "ready",
    ]);
  });
});
