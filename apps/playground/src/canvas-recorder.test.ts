import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CanvasRecorder,
  recordingExtension,
  selectRecordingMimeType,
  WHITEBOX_RECORDING_FRAME_RATE,
  WHITEBOX_RECORDING_HEIGHT,
  WHITEBOX_RECORDING_WIDTH,
} from "./canvas-recorder.js";

afterEach(() => { vi.unstubAllGlobals(); });

function recordingEnvironment(width = 1280, height = 720) {
  const faults = { captureSource: false, captureCopy: false, constructor: false, start: false, disposeStop: false };
  const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
  const stream = { getTracks: () => tracks } as unknown as MediaStream;
  const context = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
  const copyCanvas = { width: 0, height: 0, getContext: vi.fn(() => context), captureStream: vi.fn(() => {
    if (faults.captureCopy) throw new Error("copy capture failed");
    return stream;
  }) };
  const createElement = vi.fn(() => copyCanvas);
  const source = { width, height, clientWidth: 1280, clientHeight: 720,
    ownerDocument: { createElement }, captureStream: vi.fn(() => {
      if (faults.captureSource) throw new Error("source capture failed");
      return stream;
    }),
  };
  const timers = new Map<number, () => void>();
  let nextTimer = 0;
  const setInterval = vi.fn((callback: () => void, _delay: number) => {
    const id = ++nextTimer;
    timers.set(id, callback);
    return id;
  });
  const clearInterval = vi.fn((id: number) => { timers.delete(id); });
  const instances: FakeMediaRecorder[] = [];
  const construct = vi.fn();
  class FakeMediaRecorder extends EventTarget {
    static isTypeSupported = vi.fn((mimeType: string) => mimeType === "video/webm;codecs=vp9");
    state = "inactive";
    readonly mimeType: string;
    constructor(stream: MediaStream, options: MediaRecorderOptions) {
      super();
      construct(stream, options);
      if (faults.constructor) throw new Error("constructor failed");
      this.mimeType = options.mimeType ?? "video/webm";
      instances.push(this);
    }
    start = vi.fn((_timeslice: number) => {
      if (faults.start) throw new Error("start failed");
      this.state = "recording";
    });
    stop = vi.fn(() => {
      if (faults.disposeStop) throw new Error("stop failed");
      this.state = "inactive";
      queueMicrotask(() => {
        const event = new Event("dataavailable");
        Object.defineProperty(event, "data", { value: new Blob(["runtime frame"], { type: this.mimeType }) });
        this.dispatchEvent(event);
        this.dispatchEvent(new Event("stop"));
      });
    });
  }
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  vi.stubGlobal("window", { setInterval, clearInterval });
  return { source, canvas: source as unknown as HTMLCanvasElement, copyCanvas, context, createElement,
    tracks, faults, setInterval, clearInterval, timers, construct, instances,
    drawTick: () => { for (const callback of timers.values()) callback(); } };
}

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

describe("canvas recorder source selection and lifecycle", () => {
  it("captures an exact Runtime raster directly at 24 fps, with no copy canvas or draw timer", async () => {
    const env = recordingEnvironment();
    let now = 100;
    const recorder = new CanvasRecorder(env.canvas, { now: () => now });
    expect(env.construct).not.toHaveBeenCalled();
    recorder.start();
    expect(env.source.captureStream).toHaveBeenCalledExactlyOnceWith(24);
    expect(env.createElement).not.toHaveBeenCalled();
    expect(env.context.drawImage).not.toHaveBeenCalled();
    expect(env.setInterval).not.toHaveBeenCalled();
    expect(env.construct).toHaveBeenCalledWith(expect.anything(), { mimeType: "video/webm;codecs=vp9", videoBitsPerSecond: 12_000_000 });
    expect(env.instances[0]!.start).toHaveBeenCalledExactlyOnceWith(1000);
    expect(recorder.state).toBe("recording");
    now = 600;
    const stopped = recorder.stop();
    expect(recorder.state).toBe("stopping");
    expect(recorder.stop()).toBe(stopped);
    const result = await stopped;
    expect(result).toMatchObject({ durationMs: 500, extension: "webm", mimeType: "video/webm;codecs=vp9" });
    expect(await result.blob.text()).toBe("runtime frame");
    expect(recorder.state).toBe("idle");
    expect(recorder.elapsedMs).toBe(0);
    for (const track of env.tracks) expect(track.stop).toHaveBeenCalledOnce();
  });

  it("uses raster dimensions rather than CSS dimensions and preserves the mismatch letterbox", async () => {
    const env = recordingEnvironment(800, 800);
    const recorder = new CanvasRecorder(env.canvas);
    recorder.start();
    expect(env.source.captureStream).not.toHaveBeenCalled();
    expect(env.copyCanvas.captureStream).toHaveBeenCalledExactlyOnceWith(24);
    expect([env.copyCanvas.width, env.copyCanvas.height]).toEqual([1280, 720]);
    expect(env.context.fillRect).toHaveBeenCalledWith(0, 0, 1280, 720);
    expect(env.context.drawImage).toHaveBeenCalledWith(env.source, 280, 0, 720, 720);
    expect(env.setInterval).toHaveBeenCalledWith(expect.any(Function), 1000 / 24);
    env.drawTick();
    expect(env.context.drawImage).toHaveBeenCalledTimes(2);
    await recorder.stop();
    expect(env.clearInterval).toHaveBeenCalledOnce();
    expect(env.timers.size).toBe(0);
    for (const track of env.tracks) expect(track.stop).toHaveBeenCalledOnce();
  });

  it("selects the path at start, not construction, including caller-specified raster/fps", () => {
    const env = recordingEnvironment();
    const recorder = new CanvasRecorder(env.canvas, { width: 640, height: 360, frameRate: 30 });
    env.source.width = 640;
    env.source.height = 360;
    recorder.start();
    expect(env.source.captureStream).toHaveBeenCalledExactlyOnceWith(30);
    expect(env.createElement).not.toHaveBeenCalled();
    recorder.dispose();
  });

  it("preserves legacy start-time direct selection on source resize, without promising a fixed encoded raster", () => {
    const env = recordingEnvironment();
    const recorder = new CanvasRecorder(env.canvas);
    recorder.start();
    env.source.width = 1920;
    env.source.height = 1080;
    env.drawTick();
    expect(recorder.state).toBe("recording");
    expect([env.source.width, env.source.height]).toEqual([1920, 1080]);
    expect(env.source.captureStream).toHaveBeenCalledOnce();
    expect(env.createElement).not.toHaveBeenCalled();
    expect(env.setInterval).not.toHaveBeenCalled();
    recorder.dispose();
  });

  it("keeps the fixed copy raster when a mismatched source resizes, even when it later matches", () => {
    const env = recordingEnvironment(800, 600);
    const recorder = new CanvasRecorder(env.canvas);
    recorder.start();
    env.source.width = 1280;
    env.source.height = 720;
    env.drawTick();
    expect(env.context.drawImage).toHaveBeenLastCalledWith(env.source, 0, 0, 1280, 720);
    expect([env.copyCanvas.width, env.copyCanvas.height]).toEqual([1280, 720]);
    expect(env.copyCanvas.captureStream).toHaveBeenCalledOnce();
    expect(env.source.captureStream).not.toHaveBeenCalled();
    recorder.dispose();
  });

  it.each(["constructor", "start"] as const)("cleans both paths if MediaRecorder %s throws", (failure) => {
    for (const width of [1280, 640]) {
      const env = recordingEnvironment(width);
      env.faults[failure] = true;
      const recorder = new CanvasRecorder(env.canvas);
      expect(() => recorder.start()).toThrow(`${failure} failed`);
      expect(recorder.state).toBe("idle");
      expect(env.timers.size).toBe(0);
      for (const track of env.tracks) expect(track.stop).toHaveBeenCalledOnce();
      recorder.dispose();
      for (const track of env.tracks) expect(track.stop).toHaveBeenCalledOnce();
    }
  });

  it.each([true, false])("cleans setup when captureStream throws, direct=%s", (isDirect) => {
    const env = recordingEnvironment(isDirect ? 1280 : 640);
    env.faults[isDirect ? "captureSource" : "captureCopy"] = true;
    const recorder = new CanvasRecorder(env.canvas);
    expect(() => recorder.start()).toThrow("capture failed");
    expect(recorder.state).toBe("idle");
    expect(env.timers.size).toBe(0);
    expect(env.construct).not.toHaveBeenCalled();
    for (const track of env.tracks) expect(track.stop).not.toHaveBeenCalled();
    env.faults.captureCopy = env.faults.captureSource = false;
    recorder.start();
    recorder.dispose();
    expect(env.timers.size).toBe(0);
  });

  it.each([true, false])("disposes active resources exactly once, direct=%s", (isDirect) => {
    const env = recordingEnvironment(isDirect ? 1280 : 640);
    const recorder = new CanvasRecorder(env.canvas);
    recorder.start();
    const media = env.instances[0]!;
    const removeListener = vi.spyOn(media, "removeEventListener");
    expect(() => recorder.start()).toThrow("already active");
    recorder.dispose();
    recorder.dispose();
    expect(media.stop).toHaveBeenCalledOnce();
    expect(removeListener).toHaveBeenCalledWith("dataavailable", expect.any(Function));
    expect(recorder.state).toBe("idle");
    expect(env.timers.size).toBe(0);
    for (const track of env.tracks) expect(track.stop).toHaveBeenCalledOnce();
  });

  it("still releases tracks/timer when dispose's MediaRecorder.stop throws", () => {
    const env = recordingEnvironment(640);
    const recorder = new CanvasRecorder(env.canvas);
    recorder.start();
    env.faults.disposeStop = true;
    expect(() => recorder.dispose()).toThrow("stop failed");
    expect(recorder.state).toBe("idle");
    expect(env.timers.size).toBe(0);
    for (const track of env.tracks) expect(track.stop).toHaveBeenCalledOnce();
  });
});
