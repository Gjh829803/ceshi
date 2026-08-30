import { describe, expect, it } from "vitest";

import { formatWorkbenchDuration, recordingStatusLabel } from "./recording-workbench.js";
import { styledOpeningFrameUrlV1 } from "./styled-opening-frame-panel.js";

describe("recording workbench presentation", () => {
  it("binds the final-look panel to the current Studio world", () => {
    expect(styledOpeningFrameUrlV1("world/demo 01")).toBe(
      "/api/worlds/world%2Fdemo%2001/deliverables/styled-opening-frame",
    );
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
});
