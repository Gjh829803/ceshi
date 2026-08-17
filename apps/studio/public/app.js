const state = {
  worlds: [],
  filter: "all",
  image: null,
  selectedId: null,
  captureAttempts: new Set(),
};

const stageLabels = {
  queued: "等待本地 Codex",
  preparing: "准备隔离工作区",
  planner: "规划完整世界与进入视角",
  "plan-freeze": "冻结 WorldSpec 与实体目录",
  builder: "搭建可碰撞白膜世界",
  validation: "验证场景、物理与构图",
  ready: "白膜世界已可游玩",
  failed: "生成失败，可查看日志",
  interrupted: "任务中断，可以重试",
  "change-requested": "Agent 请求修改冻结计划",
};
const statusLabels = {
  queued: "QUEUED",
  running: "GENERATING",
  ready: "PLAYABLE",
  failed: "FAILED",
  interrupted: "INTERRUPTED",
};
const progressByStage = {
  queued: 5,
  preparing: 10,
  planner: 28,
  "plan-freeze": 48,
  builder: 68,
  validation: 90,
  ready: 100,
  failed: 100,
  interrupted: 100,
  "change-requested": 100,
};

const form = document.querySelector("#create-form");
const titleInput = document.querySelector("#world-title");
const promptInput = document.querySelector("#world-prompt");
const imageInput = document.querySelector("#world-image");
const dropzone = document.querySelector("#dropzone");
const imagePreview = document.querySelector("#image-preview");
const replaceImage = document.querySelector("#replace-image");
const submitButton = document.querySelector("#submit-button");
const formMessage = document.querySelector("#form-message");
const worldGrid = document.querySelector("#world-grid");
const emptyState = document.querySelector("#empty-state");
const historyStats = document.querySelector("#history-stats");
const runtimeState = document.querySelector("#runtime-state");
const template = document.querySelector("#world-card-template");
const dialog = document.querySelector("#world-dialog");
const dialogContent = document.querySelector("#dialog-content");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeCssColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value)) ? String(value) : "#9aa9a8";
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function applyImage(file) {
  if (!file) return;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
    showMessage("仅支持 PNG、JPEG 或 WebP 图片。", true);
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    showMessage("参考图不能超过 12 MB。", true);
    return;
  }
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    state.image = { name: file.name, dataUrl: reader.result };
    imagePreview.src = reader.result;
    imagePreview.hidden = false;
    replaceImage.hidden = false;
    showMessage(`已选择 ${file.name}`);
  });
  reader.readAsDataURL(file);
}

function showMessage(message, error = false) {
  formMessage.textContent = message;
  formMessage.classList.toggle("error", error);
}

function matchesFilter(world) {
  if (state.filter === "all") return true;
  if (state.filter === "running") return ["queued", "running"].includes(world.status);
  if (state.filter === "failed") return ["failed", "interrupted"].includes(world.status);
  return world.status === state.filter;
}

function renderHistory() {
  worldGrid.replaceChildren();
  const filtered = state.worlds.filter(matchesFilter);
  emptyState.hidden = filtered.length > 0;
  worldGrid.hidden = filtered.length === 0;
  const ready = state.worlds.filter((world) => world.status === "ready").length;
  const active = state.worlds.filter((world) => ["queued", "running"].includes(world.status)).length;
  historyStats.innerHTML = `<span><b>${state.worlds.length}</b>全部世界</span><span><b>${ready}</b>可游玩</span><span><b>${active}</b>生成中</span>`;

  for (const world of filtered) {
    const fragment = template.content.cloneNode(true);
    const card = fragment.querySelector(".world-card");
    card.dataset.status = world.status;
    const image = fragment.querySelector(".card-cover img");
    const fallback = fragment.querySelector(".cover-fallback");
    if (world.coverUrl) {
      image.src = `${world.coverUrl}?t=${encodeURIComponent(world.updatedAt)}`;
      image.alt = `${world.title} 的世界规划或参考图`;
      image.addEventListener("load", () => { fallback.hidden = true; });
      image.addEventListener("error", () => { image.removeAttribute("src"); fallback.hidden = false; });
    }
    fragment.querySelector(".status-pill").textContent = statusLabels[world.status] ?? world.status;
    fragment.querySelector(".scene-id").textContent = world.sceneId;
    fragment.querySelector("time").textContent = formatDate(world.createdAt);
    fragment.querySelector("h3").textContent = world.title;
    fragment.querySelector(".prompt-excerpt").textContent = world.prompt;
    fragment.querySelector(".progress-track i").style.width = `${progressByStage[world.stage] ?? 8}%`;
    const queue = world.queuePosition ? ` · 队列第 ${world.queuePosition} 位` : "";
    fragment.querySelector(".stage-copy").textContent = `${stageLabels[world.stage] ?? world.stage}${queue}`;
    const play = fragment.querySelector(".play-button");
    play.href = world.previewUrl;
    play.setAttribute("aria-disabled", world.status === "ready" ? "false" : "true");
    for (const button of fragment.querySelectorAll(".details-button, .card-cover")) {
      button.addEventListener("click", () => openWorld(world.id));
    }
    worldGrid.append(fragment);
  }
}

async function loadWorlds() {
  try {
    const response = await fetch("/api/worlds", { cache: "no-store" });
    if (!response.ok) throw new Error("无法读取历史世界");
    const payload = await response.json();
    state.worlds = payload.worlds;
    renderHistory();
    if (state.selectedId && dialog.open) await refreshDialog(state.selectedId);
  } catch (error) {
    runtimeState.className = "runtime-state offline";
    runtimeState.querySelector("span").textContent = error.message;
  }
}

async function loadHealth() {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    const health = await response.json();
    const online = health.ok && health.codexAvailable && health.pnpmAvailable;
    runtimeState.className = `runtime-state ${online ? "online" : "offline"}`;
    runtimeState.querySelector("span").textContent = online
      ? health.activeJob ? "本地 Codex 正在生成世界" : "本地 Codex 已连接"
      : "Codex 或 pnpm 不可用";
  } catch {
    runtimeState.className = "runtime-state offline";
    runtimeState.querySelector("span").textContent = "本地运行时未连接";
  }
}

function renderPlanningMedia(media) {
  const items = media?.planning ?? [];
  if (!items.length) return `<p class="media-empty">规划图片尚未产生，生成过程中会自动出现在这里。</p>`;
  return `<div class="planning-gallery">${items.map((item) => `
    <article class="media-card ${item.available ? "" : "is-pending"}">
      <div class="media-frame">
        ${item.url
          ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer"><img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.title)}" loading="lazy" /></a>`
          : `<div class="media-pending"><span>GENERATING</span><b>${escapeHtml(item.title)}</b><small>产物生成后自动显示</small></div>`}
      </div>
      <div class="media-copy">
        <span>${escapeHtml(item.kind)}</span>
        <h4>${escapeHtml(item.title)}</h4>
        <p>${escapeHtml(item.description ?? "")}</p>
        ${item.prompt ? `<details><summary>查看对应 Prompt</summary><pre>${escapeHtml(item.prompt)}</pre></details>` : ""}
      </div>
    </article>`).join("")}</div>`;
}

function renderPrototypeMedia(media) {
  const prototypes = media?.prototypes ?? [];
  if (!prototypes.length) return `<p class="media-empty">实体目录将在 WorldSpec 冻结后出现；三视图会随着验证与样式化阶段补齐。</p>`;
  return `<div class="prototype-gallery">${prototypes.map((prototype) => {
    const size = Array.isArray(prototype.approximateSize) ? prototype.approximateSize.join(" × ") : "—";
    const renderView = (url, label, pending) => url
      ? `<a class="prototype-view" href="${escapeHtml(url)}" target="_blank" rel="noreferrer"><img src="${escapeHtml(url)}" alt="${escapeHtml(`${prototype.id} ${label}`)}" loading="lazy" /><span>${escapeHtml(label)} ↗</span></a>`
      : `<div class="prototype-view view-pending"><span>${escapeHtml(pending)}</span></div>`;
    return `<article class="prototype-card">
      <header>
        <i style="background:${safeCssColor(prototype.instanceColor)}"></i>
        <div><small>${escapeHtml(prototype.role ?? "entity")} · ${escapeHtml(prototype.semantic ?? prototype.id)}</small><h4>${escapeHtml(prototype.id)}</h4></div>
        <span>${escapeHtml(size)}</span>
      </header>
      <p>${escapeHtml(prototype.description ?? "")}</p>
      <div class="prototype-views">
        ${renderView(prototype.whiteboxUrl, "白膜三视图", "等待白膜三视图")}
        ${renderView(prototype.styledUrl, "样式三视图", "样式化阶段待生成")}
      </div>
      ${prototype.appearancePrompt ? `<details><summary>查看外观 Prompt 与限制</summary><pre>${escapeHtml(prototype.appearancePrompt)}${prototype.negativePrompt ? `\n\nNegative: ${escapeHtml(prototype.negativePrompt)}` : ""}</pre></details>` : ""}
    </article>`;
  }).join("")}</div>`;
}

function renderCompositionStatus(media) {
  const composition = media?.composition;
  if (!composition) return `<span>${media?.availableImageCount ?? 0} 张产物</span>`;
  const score = `${Math.round(composition.score * 100)}%`;
  return `<span class="composition-status ${composition.pass ? "pass" : "fail"}">${composition.pass ? "构图通过" : "构图待调整"} · ${score}</span>`;
}

function requestMissingWhiteboxArtifacts(world, media) {
  if (world.status !== "ready" || state.captureAttempts.has(world.sceneId)) return;
  const missingOpeningFrame = !(media?.planning ?? []).some((item) => item.kind === "whitebox-opening-frame" && item.available);
  const missingTriView = (media?.prototypes ?? []).some((prototype) => !prototype.whiteboxUrl);
  if (!missingOpeningFrame && !missingTriView) return;
  state.captureAttempts.add(world.sceneId);
  const frame = document.createElement("iframe");
  frame.className = "artifact-capture-frame";
  frame.title = `${world.title} 白膜产物导出器`;
  frame.src = `${world.previewUrl}&captureArtifacts=1`;
  document.body.append(frame);
  window.setTimeout(() => frame.remove(), 30_000);
}

async function refreshDialog(id) {
  const response = await fetch(`/api/worlds/${id}`, { cache: "no-store" });
  if (!response.ok) return;
  const { world, media, log } = await response.json();
  const canRetry = ["failed", "interrupted"].includes(world.status);
  dialogContent.innerHTML = `
    <div class="dialog-hero">
      ${world.coverUrl ? `<img src="${escapeHtml(world.coverUrl)}?t=${encodeURIComponent(world.updatedAt)}" alt="" />` : ""}
      <div class="dialog-title"><p>${escapeHtml(statusLabels[world.status] ?? world.status)} · ${escapeHtml(world.sceneId)}</p><h2>${escapeHtml(world.title)}</h2></div>
    </div>
    <div class="dialog-body">
      <div class="dialog-info">
        <div class="dialog-section"><small>WORLD PROMPT</small><p>${escapeHtml(world.prompt)}</p></div>
        <div class="dialog-section"><small>CURRENT STAGE</small><p>${escapeHtml(stageLabels[world.stage] ?? world.stage)}<br />创建于 ${escapeHtml(formatDate(world.createdAt))}<br />尝试次数 ${world.attempt}</p></div>
      </div>
      <section class="output-section">
        <div class="output-heading"><div><small>WORLD PLANNING IMAGES</small><h3>世界规划与首帧</h3></div>${renderCompositionStatus(media)}</div>
        ${renderPlanningMedia(media)}
      </section>
      <section class="output-section">
        <div class="output-heading"><div><small>ENTITY COMPARISON SHEETS</small><h3>主体、标志物与客体</h3></div><span>${media?.prototypes?.length ?? 0} 个原型</span></div>
        ${renderPrototypeMedia(media)}
      </section>
      ${world.error ? `<div class="dialog-section dialog-log"><small>ERROR</small><p>${escapeHtml(world.error)}</p></div>` : ""}
      <details class="dialog-section dialog-log runtime-log" ${world.status === "running" ? "open" : ""}><summary>LOCAL CODEX LOG</summary><pre>${escapeHtml(log || "任务尚未开始输出日志。")}</pre></details>
      <div class="dialog-actions">
        ${world.status === "ready" ? `<a href="${escapeHtml(world.previewUrl)}" target="_blank" rel="noreferrer">进入白膜世界 ↗</a>` : ""}
        ${canRetry ? `<button type="button" id="retry-world">重新生成</button>` : ""}
      </div>
    </div>`;
  const retry = dialogContent.querySelector("#retry-world");
  retry?.addEventListener("click", async () => {
    retry.disabled = true;
    const result = await fetch(`/api/worlds/${id}/retry`, { method: "POST" });
    if (!result.ok) {
      const payload = await result.json();
      retry.textContent = payload.error ?? "重试失败";
      retry.disabled = false;
      return;
    }
    await loadWorlds();
  });
  const pre = dialogContent.querySelector("pre");
  if (pre) pre.scrollTop = pre.scrollHeight;
  requestMissingWhiteboxArtifacts(world, media);
}

async function openWorld(id) {
  state.selectedId = id;
  await refreshDialog(id);
  if (!dialog.open) dialog.showModal();
}

dropzone.addEventListener("click", () => imageInput.click());
imageInput.addEventListener("change", () => applyImage(imageInput.files?.[0]));
for (const eventName of ["dragenter", "dragover"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("dragging");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("dragging");
  });
}
dropzone.addEventListener("drop", (event) => applyImage(event.dataTransfer?.files?.[0]));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  showMessage("正在创建任务并写入本地历史……");
  try {
    const response = await fetch("/api/worlds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: titleInput.value,
        prompt: promptInput.value,
        image: state.image,
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "创建失败");
    form.reset();
    state.image = null;
    imagePreview.hidden = true;
    imagePreview.removeAttribute("src");
    replaceImage.hidden = true;
    showMessage(`“${payload.world.title}”已进入生成队列。可以离开页面，历史记录会保留。`);
    state.filter = "all";
    document.querySelectorAll(".filters button").forEach((button) => button.classList.toggle("active", button.dataset.filter === "all"));
    await loadWorlds();
    await openWorld(payload.world.id);
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelectorAll(".filters button").forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    document.querySelectorAll(".filters button").forEach((item) => item.classList.toggle("active", item === button));
    renderHistory();
  });
});
document.querySelector("#dialog-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});
dialog.addEventListener("close", () => { state.selectedId = null; });

await Promise.all([loadHealth(), loadWorlds()]);
setInterval(() => void loadHealth(), 5_000);
setInterval(() => void loadWorlds(), 2_500);
