import type { installRuntimeFlightRecorderV1, RuntimeFlightBundleV1 } from "@whitebox-world/runtime-babylon";

type Button = Pick<EventTarget, "addEventListener" | "removeEventListener">;

/** UI projection only: no Runtime controls, mutable state or recovery authority. */
export function installRuntimeFlightControlsV1(input: {
  readonly recorder: Pick<ReturnType<typeof installRuntimeFlightRecorderV1>, "mark" | "bundle">;
  readonly root: Pick<HTMLElement, "hidden">;
  readonly status: Pick<HTMLElement, "textContent">;
  readonly markButton: Button;
  readonly copyButton: Button;
  readonly downloadButton: Button;
  readonly download: (filename: string, bundle: RuntimeFlightBundleV1) => void;
  readonly copyText: (text: string) => Promise<void>;
  readonly copyFallback: (text: string) => void;
  readonly now?: () => Date;
}) {
  let disposed = false;
  const listeners: (() => void)[] = [];
  const status = (text: string) => { if (!disposed) input.status.textContent = text; };
  const onMark = () => {
    if (disposed) return;
    try {
      const report = input.recorder.mark();
      status(`已记录现场 · 样本 ${report.samples.at(-1)?.sequence ?? 0}`);
    } catch { status("运行诊断暂不可用"); }
  };
  const onDownload = () => {
    if (disposed) return;
    try {
      const bundle = input.recorder.bundle();
      const world = (bundle.worldId ?? "worldkit-world").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "worldkit-world";
      const filename = `${world}-runtime-diagnostics-${(input.now?.() ?? new Date()).toISOString().replaceAll(":", "-")}.json`;
      input.download(filename, bundle);
      status(`已下载 ${filename}`);
    } catch { status("诊断下载失败，运行不受影响"); }
  };
  const onCopy = () => {
    if (disposed) return;
    let text: string;
    try {
      const bundle = input.recorder.bundle();
      const report = bundle.currentSession;
      const sample = report.samples.at(-1);
      text = `WorldKit runtime diagnostics: ${bundle.worldId ?? "world"}\n` +
        `${sample?.health ?? "no-sample"}; tick=${sample?.metrics?.tick ?? "unavailable"}; frame=${sample?.metrics?.frame ?? "unavailable"}; fps=${sample?.metrics?.fps ?? "unavailable"}\n` +
        `samples=${report.samples.length}; dropped=${report.droppedSampleCount}; previous=${bundle.previousSession !== null}`;
    } catch { status("运行诊断暂不可用"); return; }
    void Promise.resolve().then(() => { if (!disposed) return input.copyText(text); }).then(() => {
      status("诊断摘要已复制");
    }, () => {
      if (disposed) return;
      try { input.copyFallback(text); status("可手动复制诊断摘要"); }
      catch { status("复制失败，可下载 JSON"); }
    });
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const remove of listeners) remove();
    input.root.hidden = true;
  };
  try {
    for (const [button, listener] of [[input.markButton, onMark], [input.copyButton, onCopy],
      [input.downloadButton, onDownload]] as const) {
      listeners.push(() => button.removeEventListener("click", listener));
      button.addEventListener("click", listener);
    }
    input.root.hidden = false;
    status(input.recorder.bundle().previousSession === null ? "只读诊断 · 当前会话" : "只读诊断 · 包含上一会话");
  } catch (error) { dispose(); throw error; }
  return Object.freeze({ dispose });
}
