import type { CanvasRecordingResult } from "./canvas-recorder.js";

interface StyledTriviewAsset {
  visualTargetId: string;
  role: string;
  semanticClassId: string | null;
  url: string;
}

interface RecordingArtifactState {
  ready: boolean;
  bundleReady: boolean;
  styledOpeningFrameUrl: string | null;
  styledTriviews: StyledTriviewAsset[];
}

interface RecordingJobState {
  status: string;
  backend?: "cloud" | "local" | null;
  error?: string | null;
  taskId?: string | null;
  providerStatus?: string | null;
}

interface RecordingListItem {
  id: string;
  sceneId: string;
  title: string;
  createdAt: string;
  workflowStatus: string;
  source: {
    durationMs: number;
    sizeBytes: number;
    extension: string;
  };
  prompt: RecordingJobState;
  video: RecordingJobState & {
    model?: string | null;
    media?: { durationSeconds?: number; width?: number; height?: number } | null;
  };
  error?: string | null;
  sourceUrl: string;
  promptTemplateUrl: string;
  promptUrl: string | null;
  generatedVideoUrl: string | null;
  bundleUrl: string | null;
  assets: RecordingArtifactState;
}

interface RecordingListPayload {
  sceneId: string;
  recordings: RecordingListItem[];
  activeJobs: number;
  maxConcurrentJobs: number;
}

export interface RecordingWorkbench {
  uploadRecording(result: CanvasRecordingResult): Promise<RecordingListItem>;
  refresh(): Promise<void>;
  dispose(): void;
}

export function formatWorkbenchDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function recordingStatusLabel(status: string): string {
  return ({
    recorded: "已录制",
    "prompt-running": "正在补全 Prompt",
    "prompt-ready": "Prompt 已就绪",
    "prompt-failed": "Prompt 失败",
    "video-running": "Seedance 生成中",
    "video-failed": "视频生成失败",
    ready: "视频已完成",
  })[status] ?? status;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatBytes(value: number): string {
  if (value < 1_000_000) return `${(value / 1_000).toFixed(0)} KB`;
  return `${(value / 1_000_000).toFixed(1)} MB`;
}

function statusClass(status: string): string {
  if (status === "ready" || status === "prompt-ready") return "success";
  if (status.endsWith("failed")) return "failed";
  if (status.endsWith("running")) return "running";
  return "neutral";
}

function downloadUrl(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}download=1`;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload as T;
}

export function renderAssetStrip(assets: RecordingArtifactState): string {
  const images = [
    ...(assets.styledOpeningFrameUrl
      ? [{ label: "styled-opening-frame", role: "最终首帧", url: assets.styledOpeningFrameUrl }]
      : []),
    ...assets.styledTriviews.map((item) => ({ label: item.visualTargetId, role: item.role, url: item.url })),
  ];
  if (images.length === 0) return '<p class="recording-assets-empty">最终首帧和渲染后三视图尚未准备完成。</p>';
  return `<div class="recording-assets-strip">${images.map((image) => `
    <a href="${escapeHtml(image.url)}" download title="下载 ${escapeHtml(image.label)}">
      <img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.label)}" loading="lazy" />
      <span>${escapeHtml(image.role)}</span>
    </a>
  `).join("")}</div>`;
}

function renderRecordingCard(item: RecordingListItem): string {
  const active = ["prompt-running", "video-running"].includes(item.workflowStatus);
  const actionLabel = item.workflowStatus === "ready"
    ? "重新生成 Seedance 2.5"
    : item.workflowStatus.endsWith("failed")
      ? "重试生成"
      : "一键生成 Seedance 2.5";
  const sourceVideo = `
    <figure><video controls muted playsinline preload="metadata" src="${escapeHtml(item.sourceUrl)}"></video>
    <figcaption>白膜录屏 · 运动与镜头权威</figcaption></figure>`;
  const videos = item.generatedVideoUrl
    ? `<div class="recording-comparison">${sourceVideo}
        <figure><video controls playsinline preload="metadata" src="${escapeHtml(item.generatedVideoUrl)}"></video>
        <figcaption>Seedance 2.5 · 最终视频</figcaption></figure></div>`
    : `<div class="recording-source-preview">${sourceVideo}</div>`;
  const prompt = item.promptUrl
    ? `<details class="recording-prompt"><summary>查看最终 Prompt</summary><pre data-prompt-url="${escapeHtml(item.promptUrl)}">点击展开后加载…</pre></details>`
    : `<p class="recording-prompt-pending">Prompt：${escapeHtml(item.prompt.status)}</p>`;
  const error = item.error || item.prompt.error || item.video.error;
  return `<article class="recording-item" data-recording-id="${escapeHtml(item.id)}">
    <header>
      <div><strong>${escapeHtml(item.title)}</strong><span>${formatWorkbenchDuration(item.source.durationMs)} · ${formatBytes(item.source.sizeBytes)}</span></div>
      <em class="recording-status ${statusClass(item.workflowStatus)}">${escapeHtml(recordingStatusLabel(item.workflowStatus))}</em>
    </header>
    ${videos}
    <div class="recording-pipeline">
      <span class="${item.prompt.status === "succeeded" ? "done" : ""}">1 · Codex Prompt${item.prompt.backend ? ` · ${item.prompt.backend === "local" ? "本地" : "云端"}` : ""}</span>
      <i>→</i>
      <span class="${item.video.status === "succeeded" ? "done" : ""}">2 · Seedance 2.5</span>
    </div>
    ${renderAssetStrip(item.assets)}
    ${prompt}
    ${error ? `<p class="recording-error">${escapeHtml(error)}</p>` : ""}
    <div class="recording-actions">
      <button type="button" data-action="generate" ${active || !item.assets.ready ? "disabled" : ""}>${actionLabel}</button>
      <a href="${escapeHtml(downloadUrl(item.sourceUrl))}" download>白膜视频</a>
      <a href="${escapeHtml(downloadUrl(item.promptUrl || item.promptTemplateUrl))}" download>${item.promptUrl ? "最终 Prompt" : "Prompt 模板"}</a>
      ${item.generatedVideoUrl ? `<a href="${escapeHtml(downloadUrl(item.generatedVideoUrl))}" download>生成视频</a>` : ""}
      ${item.bundleUrl
        ? `<a class="recording-download-all" href="${escapeHtml(item.bundleUrl)}" download>下载全部 ZIP</a>`
        : '<button class="recording-download-all" type="button" disabled title="等待完整的成对三视图">全部 ZIP 等待三视图</button>'}
    </div>
  </article>`;
}

export function installRecordingWorkbench({
  root,
  sceneId,
}: {
  root: HTMLElement;
  sceneId: string;
}): RecordingWorkbench {
  const collectionUrl = `/api/recording-worlds/${encodeURIComponent(sceneId)}/recordings`;
  let state: RecordingListPayload = {
    sceneId,
    recordings: [],
    activeJobs: 0,
    maxConcurrentJobs: 2,
  };
  let loading = true;
  let uploading = false;
  let connectionError: string | null = null;
  let disposed = false;

  function render(): void {
    if (disposed) return;
    root.innerHTML = `<section class="recording-workbench">
      <header class="recording-workbench-heading">
        <div><p class="eyebrow">RECORDING WORKBENCH</p><h2>录制与视频生成</h2></div>
        <button type="button" data-action="refresh" title="刷新录制列表">↻</button>
      </header>
      <p class="recording-workbench-intro">每次停止录制都会保存到这里。白膜视频锁运动和镜头，最终首帧与渲染后三视图锁定最终外观。</p>
      ${uploading ? '<div class="recording-uploading">正在保存本次录屏…</div>' : ""}
      ${connectionError ? `<div class="recording-connection-error">${escapeHtml(connectionError)}</div>` : ""}
      <div class="recording-list">
        ${loading
          ? '<p class="recording-empty">正在读取录制列表…</p>'
          : state.recordings.length === 0
            ? '<p class="recording-empty">还没有录屏。点击页面顶部“录制画面”，试玩后再次点击即可保存。</p>'
            : state.recordings.map(renderRecordingCard).join("")}
      </div>
    </section>`;

    root.querySelector<HTMLButtonElement>('[data-action="refresh"]')?.addEventListener("click", () => void refresh());
    root.querySelectorAll<HTMLButtonElement>('[data-action="generate"]').forEach((button) => {
      button.addEventListener("click", async () => {
        const card = button.closest<HTMLElement>("[data-recording-id]");
        const recordingId = card?.dataset.recordingId;
        if (!recordingId) return;
        button.disabled = true;
        button.textContent = "正在提交…";
        try {
          await fetchJson(`${collectionUrl}/${encodeURIComponent(recordingId)}/generate`, { method: "POST" });
          await refresh();
        } catch (error) {
          connectionError = error instanceof Error ? error.message : String(error);
          render();
        }
      });
    });
    root.querySelectorAll<HTMLDetailsElement>(".recording-prompt").forEach((details) => {
      details.addEventListener("toggle", async () => {
        if (!details.open) return;
        const output = details.querySelector<HTMLPreElement>("[data-prompt-url]");
        if (!output || output.dataset.loaded === "1") return;
        try {
          const response = await fetch(output.dataset.promptUrl ?? "");
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          output.textContent = await response.text();
          output.dataset.loaded = "1";
        } catch (error) {
          output.textContent = error instanceof Error ? error.message : String(error);
        }
      });
    });
  }

  async function refresh(): Promise<void> {
    if (disposed) return;
    try {
      state = await fetchJson<RecordingListPayload>(collectionUrl);
      connectionError = null;
    } catch (error) {
      connectionError = `录制服务暂不可用：${error instanceof Error ? error.message : String(error)}`;
    } finally {
      loading = false;
      render();
    }
  }

  async function uploadRecording(result: CanvasRecordingResult): Promise<RecordingListItem> {
    uploading = true;
    connectionError = null;
    render();
    try {
      const payload = await fetchJson<{ recording: RecordingListItem }>(collectionUrl, {
        method: "POST",
        headers: {
          "Content-Type": result.mimeType.split(";", 1)[0] || `video/${result.extension}`,
          "X-WorldKit-Recording-Duration-Ms": String(Math.round(result.durationMs)),
        },
        body: result.blob,
      });
      await refresh();
      return payload.recording;
    } catch (error) {
      connectionError = `录屏未保存到页面：${error instanceof Error ? error.message : String(error)}`;
      throw error;
    } finally {
      uploading = false;
      render();
    }
  }

  void refresh();
  const pollTimer = window.setInterval(() => {
    if (state.recordings.some((item) => ["prompt-running", "video-running"].includes(item.workflowStatus))) {
      void refresh();
    }
  }, 4_000);

  return {
    uploadRecording,
    refresh,
    dispose() {
      disposed = true;
      window.clearInterval(pollTimer);
    },
  };
}
