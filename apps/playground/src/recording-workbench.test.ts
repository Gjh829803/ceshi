import { describe, expect, it } from "vitest";

import { formatWorkbenchDuration, recordingStatusLabel } from "./recording-workbench.js";

describe("recording workbench presentation", () => {
  it("formats recording duration without losing minute boundaries", () => {
    expect(formatWorkbenchDuration(0)).toBe("00:00");
    expect(formatWorkbenchDuration(61_900)).toBe("01:01");
  });

  it("uses explicit prompt and video generation states", () => {
    expect(recordingStatusLabel("prompt-running")).toBe("正在补全 Prompt");
    expect(recordingStatusLabel("video-running")).toBe("Seedance 生成中");
    expect(recordingStatusLabel("ready")).toBe("视频已完成");
  });
});
