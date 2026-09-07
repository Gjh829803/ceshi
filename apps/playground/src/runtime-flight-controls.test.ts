import { describe, expect, it, vi } from "vitest";
import { installRuntimeFlightRecorderV1 } from "@whitebox-world/runtime-babylon";
import { installRuntimeFlightControlsV1 } from "./runtime-flight-controls.js";

function harness() {
  const storage = { getItem: () => null, setItem: vi.fn() };
  const recorder = installRuntimeFlightRecorderV1({
    target: { performance: { now: () => 0 } as Performance, setInterval: () => 1, clearInterval: () => undefined },
    diagnosticSessionId: "00000000-0000-4000-8000-000000000001", visibilityState: () => "visible",
    history: { worldId: "world/a", storage: () => storage },
    source: { read: () => ({ worldSessionId: "private-session", hasRuntimeFailure: false, progressMode: "continuous",
      snapshot: { frame: 1, tick: 2, paused: true, performance: { fps: 60, triangles: 4, drawCalls: 1 } } }) },
  });
  const input = { recorder, root: { hidden: true }, status: { textContent: "" }, markButton: new EventTarget(),
    copyButton: new EventTarget(), downloadButton: new EventTarget(), download: vi.fn(),
    copyText: vi.fn(async (_text: string) => undefined), copyFallback: vi.fn(), now: () => new Date("2026-09-06T00:00:00Z") };
  const controls = installRuntimeFlightControlsV1(input);
  return { input, controls, storage, close: () => { controls.dispose(); recorder.dispose(); } };
}

describe("CF-05 diagnostic controls", () => {
  it("records and persists a manual sample, downloads the exact bundle and detaches on disposal", () => {
    const h = harness();
    expect(h.input.root.hidden).toBe(false);
    h.input.markButton.dispatchEvent(new Event("click"));
    expect(h.storage.setItem).toHaveBeenCalledOnce();
    expect(h.input.recorder.bundle().currentSession.samples).toHaveLength(2);
    expect(h.input.status.textContent).toContain("样本 2");
    h.input.downloadButton.dispatchEvent(new Event("click"));
    expect(h.input.download).toHaveBeenCalledExactlyOnceWith("world-a-runtime-diagnostics-2026-09-06T00-00-00.000Z.json", h.input.recorder.bundle());
    h.controls.dispose();
    h.input.markButton.dispatchEvent(new Event("click"));
    h.input.downloadButton.dispatchEvent(new Event("click"));
    expect(h.input.root.hidden).toBe(true);
    expect(h.input.download).toHaveBeenCalledOnce();
    expect(h.storage.setItem).toHaveBeenCalledOnce();
    h.close();
  });
  it.each([false, true])("copies a redacted summary with the old manual fallback (denied=%s)", async (denied) => {
    const h = harness();
    if (denied) h.input.copyText.mockRejectedValueOnce(new Error("private-browser-error"));
    h.input.copyButton.dispatchEvent(new Event("click"));
    await vi.waitFor(() => expect(h.input.status.textContent).toContain(denied ? "手动复制" : "已复制"));
    const text = h.input.copyText.mock.calls[0]![0];
    expect(text).toContain("tick=2; frame=1; fps=60");
    expect(text).not.toMatch(/private|provider|position/);
    if (denied) expect(h.input.copyFallback).toHaveBeenCalledExactlyOnceWith(text);
    else expect(h.input.copyFallback).not.toHaveBeenCalled();
    h.close();
  });
  it("ignores late clipboard failures after disposal and contains download errors", async () => {
    const h = harness();
    h.input.download.mockImplementationOnce(() => { throw new Error("private-download-error"); });
    h.input.downloadButton.dispatchEvent(new Event("click"));
    expect(h.input.status.textContent).toBe("诊断下载失败，运行不受影响");
    let reject!: (error: Error) => void;
    h.input.copyText.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
    h.input.copyButton.dispatchEvent(new Event("click"));
    await Promise.resolve();
    h.controls.dispose();
    const status = h.input.status.textContent;
    reject(new Error("private-clipboard-error"));
    await Promise.resolve(); await Promise.resolve();
    expect(h.input.copyFallback).not.toHaveBeenCalled();
    expect(h.input.status.textContent).toBe(status);
    h.close();
  });
});
