import { describe, expect, it } from "vitest";
import {
  recordingExtension,
  selectRecordingMimeType,
  WHITEBOX_RECORDING_FRAME_RATE,
  WHITEBOX_RECORDING_HEIGHT,
  WHITEBOX_RECORDING_WIDTH,
} from "./canvas-recorder.js";

describe("canvas recorder format selection", () => {
  it("prefers VP9 when the browser supports it", () => {
    const supported = new Set(["video/webm;codecs=vp9", "video/webm"]);
    expect(selectRecordingMimeType((mimeType) => supported.has(mimeType))).toBe(
      "video/webm;codecs=vp9",
    );
  });

  it("falls back to browser-selected encoding", () => {
    expect(selectRecordingMimeType(() => false)).toBe("");
  });

  it("uses an extension that matches the encoded container", () => {
    expect(recordingExtension("video/mp4;codecs=h264")).toBe("mp4");
    expect(recordingExtension("video/webm;codecs=vp8")).toBe("webm");
  });

  it("locks browser whitebox capture to the Seedance delivery raster", () => {
    expect([WHITEBOX_RECORDING_WIDTH, WHITEBOX_RECORDING_HEIGHT]).toEqual([1280, 720]);
    expect(WHITEBOX_RECORDING_WIDTH / WHITEBOX_RECORDING_HEIGHT).toBe(16 / 9);
    expect(WHITEBOX_RECORDING_FRAME_RATE).toBe(24);
  });
});
