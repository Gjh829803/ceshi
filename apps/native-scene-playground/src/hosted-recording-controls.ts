import type { CanvasRecordingResult } from "@whitebox-world/browser-recording/canvas-recorder";
import { formatWorkbenchDuration } from "@whitebox-world/browser-recording/workbench";
import type { HostedRecordingClient } from "./hosted-recording.js";

export function installHostedRecordingControls(input: {
  button: HTMLButtonElement;
  time: HTMLElement;
  status: HTMLElement;
  client: HostedRecordingClient;
  save: (result: CanvasRecordingResult) => Promise<string>;
  focusCanvas: () => void;
}): { dispose(): void } {
  let disposed = false;
  let busy = false;
  let timer: number | undefined;
  function clearTimer(): void {
    if (timer !== undefined) window.clearInterval(timer);
    timer = undefined;
  }
  function update(): void {
    if (disposed) return;
    input.button.disabled = busy || input.client.state === "disposed";
    input.button.textContent = busy ? "正在处理…" : input.client.state === "recording" ? "停止录制" : "录制画面";
    input.button.setAttribute("aria-pressed", String(input.client.state === "recording"));
  }
  async function clicked(): Promise<void> {
    if (disposed || busy) return;
    busy = true; update();
    try {
      if (input.client.state === "idle") {
        await input.client.start();
        if (disposed) return;
        input.status.textContent = "正在录制真实白膜画面";
        const startedAt = performance.now();
        input.time.textContent = "00:00";
        timer = window.setInterval(() => {
          input.time.textContent = formatWorkbenchDuration(performance.now() - startedAt);
        }, 250);
      } else if (input.client.state === "recording") {
        const result = await input.client.stop();
        if (disposed) return;
        const message = await input.save(result);
        if (!disposed) input.status.textContent = message;
      }
    } catch (error) {
      if (!disposed) input.status.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
      if (input.client.state !== "recording") clearTimer();
      update();
      if (!disposed) input.focusCanvas();
    }
  }
  function onClick(): void { void clicked(); }
  input.button.addEventListener("click", onClick);
  const unsubscribe = input.client.onDisposed(() => {
    if (disposed) return;
    disposed = true;
    clearTimer();
    input.button.removeEventListener("click", onClick);
    input.button.disabled = true;
    input.button.setAttribute("aria-pressed", "false");
    input.status.textContent = "录制连接已关闭";
  });
  update();
  return { dispose() {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    clearTimer();
    input.button.removeEventListener("click", onClick);
    input.client.dispose();
  } };
}
