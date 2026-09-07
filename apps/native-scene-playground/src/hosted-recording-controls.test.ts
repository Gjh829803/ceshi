import { afterEach, expect, it, vi } from "vitest";
import { installHostedRecordingControls } from "./hosted-recording-controls.js";
import type { HostedRecordingClient } from "./hosted-recording.js";

afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const button = Object.assign(new EventTarget(), { disabled: false, textContent: "", setAttribute: vi.fn() }) as unknown as HTMLButtonElement;
  const time = { textContent: "" } as HTMLElement;
  const status = { textContent: "" } as HTMLElement;
  const setInterval = vi.fn(() => 7); const clearInterval = vi.fn();
  vi.stubGlobal("window", { setInterval, clearInterval });
  let state: HostedRecordingClient["state"] = "idle";
  const result = { blob: new Blob(["video"]), durationMs: 5100, extension: "webm" as const, mimeType: "video/webm" };
  const client = { get state() { return state; }, start: vi.fn(async () => { state = "recording"; }),
    stop: vi.fn(async () => { state = "idle"; return result; }), dispose: vi.fn(() => { state = "disposed"; }),
    onDisposed: vi.fn((_listener: () => void) => () => {}) };
  const save = vi.fn(async () => "saved exact video"); const focusCanvas = vi.fn();
  const controls = installHostedRecordingControls({ button, time, status, client, save, focusCanvas });
  return { button, time, status, client, save, focusCanvas, result, controls, setInterval, clearInterval };
}
it("starts, stops, saves exact bytes and restores Canvas focus with the old 250ms UI interval", async () => {
  const f = fixture();
  try {
    f.button.dispatchEvent(new Event("click"));
    await vi.waitFor(() => expect(f.button.textContent).toBe("停止录制"));
    expect(f.setInterval).toHaveBeenCalledWith(expect.any(Function), 250);
    f.button.dispatchEvent(new Event("click"));
    await vi.waitFor(() => expect(f.status.textContent).toBe("saved exact video"));
    expect(f.save).toHaveBeenCalledWith(f.result);
    expect(f.clearInterval).toHaveBeenCalledWith(7);
    expect(f.focusCanvas).toHaveBeenCalledTimes(2);
    expect(f.button.disabled).toBe(false);
  } finally { f.controls.dispose(); }
});
it("reports save failure and allows another recording without resubmitting the old one", async () => {
  const f = fixture();
  try {
    f.save.mockRejectedValueOnce(new Error("upload unavailable"));
    f.button.dispatchEvent(new Event("click"));
    await vi.waitFor(() => expect(f.button.textContent).toBe("停止录制"));
    f.button.dispatchEvent(new Event("click"));
    await vi.waitFor(() => expect(f.status.textContent).toBe("upload unavailable"));
    f.button.dispatchEvent(new Event("click"));
    await vi.waitFor(() => expect(f.client.start).toHaveBeenCalledTimes(2));
    expect(f.save).toHaveBeenCalledOnce();
  } finally { f.controls.dispose(); }
});
it("does not upload or refocus after disposal during a pending stop", async () => {
  const f = fixture();
  let done!: (result: typeof f.result) => void;
  f.client.stop.mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
  f.button.dispatchEvent(new Event("click"));
  await vi.waitFor(() => expect(f.button.textContent).toBe("停止录制"));
  f.button.dispatchEvent(new Event("click")); f.button.dispatchEvent(new Event("click"));
  expect(f.client.stop).toHaveBeenCalledOnce();
  f.controls.dispose(); done(f.result);
  await Promise.resolve(); await Promise.resolve();
  expect(f.save).not.toHaveBeenCalled();
  expect(f.focusCanvas).toHaveBeenCalledOnce();
  expect(f.clearInterval).toHaveBeenCalledWith(7);
});
it("clears the recording timer and disables controls when the frame closes", async () => {
  const f = fixture();
  f.button.dispatchEvent(new Event("click"));
  await vi.waitFor(() => expect(f.button.textContent).toBe("停止录制"));
  f.client.onDisposed.mock.calls[0]![0]();
  expect(f.clearInterval).toHaveBeenCalledWith(7);
  expect(f.button.disabled).toBe(true);
  expect(f.status.textContent).toBe("录制连接已关闭");
  f.button.dispatchEvent(new Event("click"));
  expect(f.client.stop).not.toHaveBeenCalled();
  f.controls.dispose();
});
