const publicSeedanceMode = new URLSearchParams(location.search).get("public") === "seedance";
if (publicSeedanceMode) {
  document.body.dataset.publicSeedance = "true";
  document.title = "WorldKit Seedance Review";
  const brand = document.querySelector(".brand");
  if (brand) brand.href = "/?public=seedance#seedance-review";
}

const state = {
  worlds: [],
  filter: "all",
  image: null,
  selectedId: null,
  detailTab: "overview",
  detailRevision: null,
  detailPollInFlight: false,
  detailAvailableCount: 0,
  historyRevision: null,
  subjectCatalog: [],
  testSets: [],
  testSetRevision: null,
  testSetFiles: [],
  selectedTestCases: new Map(),
  casePickerTestSetId: null,
  casePickerDraft: new Set(),
  casePickerFilter: "all",
  health: null,
  codexBackend: null,
  codexAvailable: false,
  backendSwitching: false,
  backendMessage: "",
  submittingWorld: false,
  runningTestSets: false,
  episodeReviews: [],
  episodeReviewRevision: null,
  selectedEpisodeId: null,
  loadingEpisodeReviews: false,
  loadingWorlds: false,
  loadingTestSets: false,
  workspaceMode: publicSeedanceMode ? "seedance-review" : "create",
};

const stageLabels = {
  queued: "等待 Codex 执行",
  preparing: "准备任务工作区",
  planner: "生成意图摘要、两张方块白膜图与自检收据",
  "coding-agent": "Coding Agent 搭建可碰撞白膜世界",
  "block-build": "校验并编译方块世界",
  ready: "评测通过，运行产物已就绪",
  failed: "生成失败，可查看日志",
  interrupted: "任务中断，可以重试",
  "change-requested": "Agent 请求修改冻结计划",
  "runtime-capture": "捕获真实白膜运行结果",
  "entry-alignment-validation": "校验第三人称进入构图",
  "visual-reconstruction": "单个 LWDP Codex 生成首帧与全部三视图",
};
const statusLabels = {
  queued: "QUEUED",
  running: "GENERATING",
  "remote-pending": "REMOTE PENDING",
  ready: "READY",
  failed: "FAILED",
  interrupted: "INTERRUPTED",
};

const blockWhiteboxLegend = [
  ["#B7E4C7", "地面行进"],
  ["#5F6368", "障碍/碰撞"],
  ["#00B8A9", "可交互实体"],
  ["#B8DE6F", "交互触发区"],
  ["#8ECDF4", "水"],
  ["#D8D4F2", "可站立云"],
  ["#EEF6FF", "可穿过云"],
  ["#D6D3D1", "纯视觉"],
  ["#E85D5D", "出生位置 / 入口主体"],
  ["#F28E2B", "视觉目标 2"],
  ["#D9A514", "视觉目标 3"],
  ["#4E79A7", "视觉目标 4"],
  ["#9C6ADE", "视觉目标 5"],
];

function worldStatusLabel(world) {
  if (world.status === "ready") return "PASSED";
  return statusLabels[world.status] ?? world.status;
}
const progressByStage = {
  queued: 5,
  preparing: 10,
  planner: 42,
  "coding-agent": 64,
  "block-build": 82,
  validation: 82,
  "runtime-capture": 94,
  "entry-alignment-validation": 96,
  "visual-reconstruction": 99,
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
const codexBackendButtons = [...document.querySelectorAll("[data-codex-backend]")];
const codexBackendNote = document.querySelector("#codex-backend-note");
const submitBackendEyebrow = document.querySelector("#submit-backend-eyebrow");
const historyKicker = document.querySelector("#history-kicker");
const subjectCatalog = document.querySelector("#subject-catalog");
const capabilityCount = document.querySelector("#capability-count");
const template = document.querySelector("#world-card-template");
const dialog = document.querySelector("#world-dialog");
const dialogContent = document.querySelector("#dialog-content");
const testSetForm = document.querySelector("#test-set-form");
const testSetName = document.querySelector("#test-set-name");
const testSetPrompt = document.querySelector("#test-set-prompt");
const testSetFiles = document.querySelector("#test-set-files");
const testSetFolder = document.querySelector("#test-set-folder");
const testSetUploadList = document.querySelector("#test-set-upload-list");
const testSetSave = document.querySelector("#test-set-save");
const testSetMessage = document.querySelector("#test-set-message");
const testSetGrid = document.querySelector("#test-set-grid");
const testSetEmpty = document.querySelector("#test-set-empty");
const testSetCount = document.querySelector("#test-set-count");
const selectedTestCount = document.querySelector("#selected-test-count");
const runSelectedTestSets = document.querySelector("#run-selected-test-sets");
const caseDialog = document.querySelector("#test-case-dialog");
const caseDialogTitle = document.querySelector("#case-dialog-title");
const caseDialogDescription = document.querySelector("#case-dialog-description");
const caseDialogCount = document.querySelector("#case-dialog-count");
const casePickerGrid = document.querySelector("#case-picker-grid");
const caseFilterHumanoidWalking = document.querySelector("#case-filter-humanoid-walking");
const historyPanel = document.querySelector("#history");
const seedanceCaseList = document.querySelector("#seedance-case-list");
const seedanceCaseCount = document.querySelector("#seedance-case-count");
const seedanceCaseEmpty = document.querySelector("#seedance-case-empty");
const seedanceReviewDetail = document.querySelector("#seedance-review-detail");

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

const codexBackendDetails = Object.freeze({
  cloud: Object.freeze({ label: "云端 Codex", eyebrow: "RUN CLOUD CODEX", kicker: "WORLD HISTORY / CLOUD SELECTED" }),
  local: Object.freeze({ label: "本地 Codex", eyebrow: "RUN LOCAL CODEX", kicker: "WORLD HISTORY / LOCAL SELECTED" }),
});

function normalizeCodexBackend(value) {
  return value === "cloud" || value === "local" ? value : null;
}

function codexBackendLabel(value) {
  const backend = normalizeCodexBackend(value);
  return backend ? codexBackendDetails[backend].label : "Codex";
}

function worldCodexBackend(world) {
  return normalizeCodexBackend(world?.codexBackend);
}

function stageLabel(stage, backendValue = null) {
  const base = stageLabels[stage] ?? String(stage ?? "unknown");
  const backend = normalizeCodexBackend(backendValue);
  if (!backend) return base;
  if (stage === "queued") return `等待${codexBackendDetails[backend].label}`;
  if (["preparing", "planner", "spatial-planner", "image-planner", "builder", "coding-agent"].includes(stage)) {
    return `${codexBackendDetails[backend].label} · ${base}`;
  }
  return base;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) return "尚未产生";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function formatBytes(value) {
  if (!Number.isFinite(value)) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(value, status = "recorded") {
  if (status === "pending") return "待启动";
  if (!Number.isFinite(value)) return status === "live" ? "计时中" : "未记录";
  const seconds = Math.max(0, Math.floor(value / 1000));
  let formatted;
  if (seconds < 60) formatted = `${seconds}秒`;
  else if (seconds < 3600) formatted = `${Math.floor(seconds / 60)}分 ${seconds % 60}秒`;
  else formatted = `${Math.floor(seconds / 3600)}时 ${Math.floor((seconds % 3600) / 60)}分`;
  if (status === "live") return `${formatted} · 进行中`;
  return status === "inferred" ? `约 ${formatted}` : formatted;
}

function formatTokenCount(value, status = "recorded") {
  if (status === "pending" || status === "live") return Number.isFinite(value)
    ? `${value.toLocaleString("zh-CN")}+`
    : "统计中";
  if (!Number.isFinite(value)) return "未记录";
  return value.toLocaleString("zh-CN");
}

function historyRevision(worlds) {
  return JSON.stringify(worlds.map((world) => [
    world.id,
    world.status,
    world.stage,
    world.updatedAt,
    world.queuePosition,
    world.codexBackend,
    world.coverUrl,
    world.whiteboxOpeningFrameUrl,
  ]));
}

function detailRevision(world, media) {
  return JSON.stringify({
    status: world.status,
    stage: world.stage,
    updatedAt: world.updatedAt,
    error: world.error,
    deliverables: (media?.deliverables ?? []).map((item) => [item.id, item.status, item.updatedAt]),
    trajectory: (media?.trajectory?.stages ?? []).map((item) => [
      item.id,
      item.status,
      Number.isFinite(item.durationMs) ? Math.floor(item.durationMs / 1000) : null,
      item.durationStatus,
      item.tokenCount,
      item.tokenStatus,
    ]),
    trajectorySummary: media?.trajectory?.summary ? [
      Number.isFinite(media.trajectory.summary.durationMs)
        ? Math.floor(media.trajectory.summary.durationMs / 1000)
        : null,
      media.trajectory.summary.durationStatus,
      media.trajectory.summary.tokenCount,
      media.trajectory.summary.tokenStatus,
    ] : null,
    eventCount: media?.trajectory?.events?.length ?? 0,
    planning: (media?.planning ?? []).map((item) => [item.kind, item.available, item.url, item.prompt]),
    plannerReview: media?.plannerReview ?? null,
    prototypes: (media?.prototypes ?? []).map((item) => [item.id, item.whiteboxUrl, item.styledUrl]),
    helpers: (media?.helpers ?? []).map((item) => [item.id, item.featureId, item.position]),
    verification: media?.entryVerification?.stage ?? null,
    composition: media?.composition
      ? [media.composition.score, media.composition.pass, media.composition.advisoryOnly]
      : null,
    episodes: (media?.episodes ?? []).map((episode) => [
      episode.episodeId,
      episode.status,
      episode.currentStage,
      episode.updatedAt,
      episode.artifacts?.length ?? 0,
      episode.stages?.map((stage) => [stage.id, stage.status]),
      episode.playbackComparisons?.map((comparison) => [
        comparison.segmentId,
        comparison.whiteboxVideo?.sizeBytes ?? 0,
        comparison.finalVideo?.sizeBytes ?? 0,
        comparison.inputActivations?.length ?? 0,
        comparison.promptEvent?.id ?? null,
        comparison.promptEvent?.globalSeconds ?? null,
      ]),
    ]),
  });
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

function showTestSetMessage(message, error = false) {
  testSetMessage.textContent = message;
  testSetMessage.classList.toggle("error", error);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(new Error(`无法读取 ${file.name}`)));
    reader.readAsDataURL(file);
  });
}

function renderPendingTestImages() {
  if (state.testSetFiles.length === 0) {
    testSetUploadList.innerHTML = "<p>还没有选择图片。</p>";
    return;
  }
  const totalBytes = state.testSetFiles.reduce((sum, item) => sum + item.file.size, 0);
  testSetUploadList.innerHTML = `${state.testSetFiles.map((item, index) => `
    <article class="pending-test-image">
      <img src="${escapeHtml(item.previewUrl)}" alt="" />
      <div><b>${escapeHtml(item.file.webkitRelativePath || item.file.name)}</b><small>${escapeHtml(formatBytes(item.file.size))}</small></div>
      <button type="button" data-remove-test-image="${index}" aria-label="移除 ${escapeHtml(item.file.name)}">×</button>
    </article>
  `).join("")}<p>${state.testSetFiles.length} 张图片 · ${escapeHtml(formatBytes(totalBytes))}</p>`;
  for (const button of testSetUploadList.querySelectorAll("[data-remove-test-image]")) {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.removeTestImage);
      const [removed] = state.testSetFiles.splice(index, 1);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      renderPendingTestImages();
    });
  }
}

function addTestSetFiles(files) {
  const existing = new Set(state.testSetFiles.map(({ key }) => key));
  let rejected = 0;
  for (const file of files ?? []) {
    const key = `${file.name}|${file.size}|${file.lastModified}`;
    if (existing.has(key)) continue;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size === 0 || file.size > 12 * 1024 * 1024) {
      rejected += 1;
      continue;
    }
    if (state.testSetFiles.length >= 200) {
      rejected += 1;
      continue;
    }
    existing.add(key);
    state.testSetFiles.push({ key, file, previewUrl: URL.createObjectURL(file) });
  }
  renderPendingTestImages();
  showTestSetMessage(rejected > 0
    ? `已选择 ${state.testSetFiles.length} 张；${rejected} 个文件因格式、大小或数量限制被忽略。`
    : `已选择 ${state.testSetFiles.length} 张测试图片。`, rejected > 0);
}

function testSetsRevision(testSets) {
  return JSON.stringify(testSets.map((testSet) => [
    testSet.id,
    testSet.updatedAt,
    testSet.images?.length ?? 0,
    testSet.runSummary?.latestBatchId,
    testSet.runSummary?.latestReady,
    testSet.runSummary?.latestActive,
    testSet.runSummary?.latestFailed,
    testSet.runSummary?.reliability?.terminalCount,
    testSet.runSummary?.reliability?.failureRate,
    testSet.runSummary?.reliability?.confidenceUpper95,
    testSet.runSummary?.reliability?.status,
  ]));
}

function selectedCasesFor(testSetId) {
  return state.selectedTestCases.get(testSetId) ?? new Set();
}

function updateTestSetSelection() {
  let selectedSetCount = 0;
  let selectedCaseCount = 0;
  for (const testSet of state.testSets) {
    const count = selectedCasesFor(testSet.id).size;
    const runnableCount = testSet.validation?.runnableCount ?? testSet.images?.length ?? 0;
    if (count > 0) selectedSetCount += 1;
    selectedCaseCount += count;
    const card = testSetGrid.querySelector(`[data-test-set-id="${CSS.escape(testSet.id)}"]`);
    card?.classList.toggle("selected", count > 0);
    const countLabel = card?.querySelector("[data-selected-case-count]");
    if (countLabel) countLabel.textContent = count > 0 ? `已选 ${count} / ${runnableCount}` : "选择案例";
  }
  selectedTestCount.textContent = selectedCaseCount === 0
    ? "尚未选择 case"
    : `已选 ${selectedSetCount} 组 · 将创建 ${selectedCaseCount} 个世界任务`;
  runSelectedTestSets.disabled = selectedCaseCount === 0
    || !state.codexAvailable
    || state.backendSwitching
    || state.runningTestSets;
  runSelectedTestSets.title = state.codexAvailable
    ? "按当前选择的 Codex 执行端创建这些任务"
    : `${codexBackendLabel(state.codexBackend)}当前不可用`;
}

function renderTestSets() {
  testSetCount.textContent = `${state.testSets.length} 个测试集`;
  testSetEmpty.hidden = state.testSets.length > 0;
  testSetGrid.hidden = state.testSets.length === 0;
  testSetGrid.innerHTML = state.testSets.map((testSet) => {
    const previews = (testSet.images ?? []).slice(0, 4);
    const runnableCount = testSet.validation?.runnableCount ?? testSet.images?.length ?? 0;
    const humanoidWalkingCount = testSet.validation?.humanoidWalkingCount ?? 0;
    const duplicateCount = testSet.validation?.duplicateCount ?? 0;
    const summary = testSet.runSummary ?? {};
    const runStatus = summary.latestBatchId === null
      ? "尚未运行"
      : summary.latestActive > 0
        ? `${summary.latestActive} 个生成中`
        : summary.latestFailed > 0
          ? `${summary.latestReady ?? 0} 通过 · ${summary.latestFailed} 需处理`
          : `${summary.latestReady ?? 0} 个已完成`;
    const selectedCount = selectedCasesFor(testSet.id).size;
    const reliability = summary.reliability;
    const reliabilityText = reliability?.terminalCount > 0
      ? `终态失败 ${(reliability.failureRate * 100).toFixed(1)}% · 95% 上界 ${(reliability.confidenceUpper95 * 100).toFixed(1)}% · ${reliability.status === "pass" ? "已达 <1%" : reliability.status === "fail" ? "未达 <1%" : `样本不足 ${reliability.terminalCount}/${reliability.minimumSampleSize}`}`
      : "尚无终态可靠性样本";
    return `<article class="test-set-card ${selectedCount > 0 ? "selected" : ""}" data-test-set-id="${escapeHtml(testSet.id)}">
      <header><small>${escapeHtml(testSet.id)}</small><h3>${escapeHtml(testSet.name)}</h3></header>
      <p>${escapeHtml(testSet.prompt)}</p>
      <div class="test-set-preview">${previews.length > 0
        ? previews.map((image) => `<img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.originalName)}" loading="lazy" />`).join("")
        : "<span>NO IMAGES</span>"}</div>
      <footer><span>${runnableCount} 个可运行 case${humanoidWalkingCount > 0 ? ` · ${humanoidWalkingCount} 个正常步行人形` : ""}${duplicateCount > 0 ? ` · ${duplicateCount} 张重复` : ""} · <span class="test-run-status">${escapeHtml(runStatus)}</span><br><small>${escapeHtml(reliabilityText)}</small></span><button type="button" data-choose-test-cases="${escapeHtml(testSet.id)}" data-selected-case-count>${selectedCount > 0 ? `已选 ${selectedCount} / ${runnableCount}` : "选择案例"}</button></footer>
    </article>`;
  }).join("");
  for (const button of testSetGrid.querySelectorAll("[data-choose-test-cases]")) {
    button.addEventListener("click", () => openCasePicker(button.dataset.chooseTestCases));
  }
  updateTestSetSelection();
}

function updateCasePickerSelection() {
  for (const item of casePickerGrid.querySelectorAll("[data-case-id]")) {
    const selected = state.casePickerDraft.has(item.dataset.caseId);
    item.classList.toggle("selected", selected);
    const checkbox = item.querySelector('input[type="checkbox"]');
    if (checkbox) checkbox.checked = selected;
  }
  const testSet = state.testSets.find(({ id }) => id === state.casePickerTestSetId);
  const runnableCount = testSet?.validation?.runnableCount ?? testSet?.images?.length ?? 0;
  const filteredCount = (testSet?.images ?? []).filter((image) =>
    image.runnable !== false && image.labels?.humanoidWalking === true).length;
  caseDialogCount.textContent = state.casePickerFilter === "humanoid-walking"
    ? `当前显示 ${filteredCount} 个正常步行人形 · 已选 ${state.casePickerDraft.size} 个 · 全集 ${runnableCount}`
    : `已选 ${state.casePickerDraft.size} / ${runnableCount} 个可运行 case`;
  caseFilterHumanoidWalking.classList.toggle("active", state.casePickerFilter === "humanoid-walking");
  for (const item of casePickerGrid.querySelectorAll("[data-case-id]")) {
    item.hidden = state.casePickerFilter === "humanoid-walking" && item.dataset.humanoidWalking !== "true";
  }
  document.querySelector("#case-dialog-confirm").disabled = state.casePickerDraft.size === 0;
}

function renderCasePicker(testSet) {
  caseDialogTitle.textContent = testSet.name;
  const duplicateCount = testSet.validation?.duplicateCount ?? 0;
  caseDialogDescription.textContent = `从 ${testSet.images?.length ?? 0} 张图片中选择本次需要运行的 case。${duplicateCount > 0 ? `${duplicateCount} 张完全重复图片已禁用。` : ""}未选中的图片不会创建任务。`;
  casePickerGrid.innerHTML = (testSet.images ?? []).map((image, index) => {
    const humanoidWalking = image.labels?.humanoidWalking === true || image.tags?.includes("humanoid-walking");
    return `
    <label class="case-picker-item ${state.casePickerDraft.has(image.id) ? "selected" : ""} ${image.runnable === false ? "disabled" : ""}" data-case-id="${escapeHtml(image.id)}" data-humanoid-walking="${humanoidWalking}">
      <input type="checkbox" ${state.casePickerDraft.has(image.id) ? "checked" : ""} ${image.runnable === false ? "disabled" : ""} />
      <img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.originalName)}" loading="lazy" />
      <span><small>${image.runnable === false ? "DUPLICATE / DISABLED" : `CASE ${String(index + 1).padStart(3, "0")}${humanoidWalking ? " · NORMAL WALK HUMANOID" : ""}`}</small><b>${escapeHtml(image.originalName)}</b></span>
    </label>
  `; }).join("");
  for (const checkbox of casePickerGrid.querySelectorAll('input[type="checkbox"]')) {
    checkbox.addEventListener("change", () => {
      const id = checkbox.closest("[data-case-id]")?.dataset.caseId;
      if (!id) return;
      if (checkbox.checked) state.casePickerDraft.add(id);
      else state.casePickerDraft.delete(id);
      updateCasePickerSelection();
    });
  }
  updateCasePickerSelection();
}

function openCasePicker(testSetId) {
  const testSet = state.testSets.find(({ id }) => id === testSetId);
  if (!testSet) return;
  state.casePickerTestSetId = testSetId;
  state.casePickerDraft = new Set(selectedCasesFor(testSetId));
  state.casePickerFilter = "all";
  renderCasePicker(testSet);
  caseDialog.showModal();
}

async function loadTestSets() {
  if (state.loadingTestSets) return;
  state.loadingTestSets = true;
  try {
    const response = await fetch("/api/test-sets", { cache: "no-store" });
    if (!response.ok) throw new Error("无法读取测试集");
    const payload = await response.json();
    const revision = testSetsRevision(payload.testSets ?? []);
    state.testSets = payload.testSets ?? [];
    const available = new Map(state.testSets.map((testSet) => [
      testSet.id,
      new Set((testSet.images ?? []).filter(({ runnable }) => runnable !== false).map(({ id }) => id)),
    ]));
    for (const [testSetId, selectedIds] of state.selectedTestCases) {
      const availableIds = available.get(testSetId);
      if (!availableIds) {
        state.selectedTestCases.delete(testSetId);
        continue;
      }
      const filtered = new Set([...selectedIds].filter((id) => availableIds.has(id)));
      if (filtered.size > 0) state.selectedTestCases.set(testSetId, filtered);
      else state.selectedTestCases.delete(testSetId);
    }
    if (revision !== state.testSetRevision) {
      state.testSetRevision = revision;
      renderTestSets();
    }
  } catch (error) {
    testSetGrid.innerHTML = `<p class="capability-error">${escapeHtml(error.message)}</p>`;
  } finally {
    state.loadingTestSets = false;
  }
}

function setWorkspaceMode(mode, scroll = true) {
  const normalized = publicSeedanceMode
    ? "seedance-review"
    : ["create", "test-sets", "seedance-review"].includes(mode) ? mode : "create";
  if (normalized !== "seedance-review") disposeEpisodeComparisonMedia(seedanceReviewDetail);
  state.workspaceMode = normalized;
  for (const button of document.querySelectorAll("[data-workspace-mode]")) {
    button.classList.toggle("active", button.dataset.workspaceMode === normalized);
  }
  for (const panel of document.querySelectorAll("[data-workspace-panel]")) {
    panel.hidden = panel.dataset.workspacePanel !== normalized;
  }
  historyPanel.hidden = normalized === "seedance-review";
  if (normalized === "create") void loadWorlds();
  if (normalized === "test-sets") {
    void loadWorlds();
    void loadTestSets();
  }
  if (scroll) document.querySelector(`[data-workspace-panel="${normalized}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function matchesFilter(world) {
  if (state.filter === "all") return true;
  if (state.filter === "running") return ["queued", "running", "remote-pending"].includes(world.status);
  if (state.filter === "failed") return ["failed", "interrupted"].includes(world.status);
  return world.status === state.filter;
}

function configureCardCover(fragment, world) {
  const image = fragment.querySelector(".cover-image");
  const comparison = fragment.querySelector(".cover-comparison");
  const reference = fragment.querySelector(".comparison-reference");
  const whitebox = fragment.querySelector(".comparison-whitebox");
  const fallback = fragment.querySelector(".cover-fallback");

  const showSingleCover = () => {
    comparison.hidden = true;
    image.hidden = false;
    if (!world.coverUrl) {
      image.removeAttribute("src");
      fallback.hidden = false;
      return;
    }
    image.alt = `${world.title} 的世界封面`;
    image.addEventListener("load", () => { fallback.hidden = true; }, { once: true });
    image.addEventListener("error", () => {
      image.removeAttribute("src");
      fallback.hidden = false;
    }, { once: true });
    image.src = `${world.coverUrl}?t=${encodeURIComponent(world.updatedAt)}`;
  };

  if (!world.referenceUrl || !world.whiteboxOpeningFrameUrl) {
    showSingleCover();
    return;
  }

  image.hidden = true;
  comparison.hidden = false;
  reference.alt = `${world.title} 的用户参考图`;
  whitebox.alt = `${world.title} 的白膜首帧`;
  let loaded = 0;
  let failed = false;
  const onLoad = () => {
    loaded += 1;
    if (loaded === 2) fallback.hidden = true;
  };
  const onError = () => {
    if (failed) return;
    failed = true;
    showSingleCover();
  };
  reference.addEventListener("load", onLoad, { once: true });
  whitebox.addEventListener("load", onLoad, { once: true });
  reference.addEventListener("error", onError, { once: true });
  whitebox.addEventListener("error", onError, { once: true });
  reference.src = `${world.referenceUrl}?t=${encodeURIComponent(world.updatedAt)}`;
  whitebox.src = `${world.whiteboxOpeningFrameUrl}?t=${encodeURIComponent(world.updatedAt)}`;
}

function renderHistory() {
  worldGrid.replaceChildren();
  const filtered = state.worlds.filter(matchesFilter);
  emptyState.hidden = filtered.length > 0;
  worldGrid.hidden = filtered.length === 0;
  const ready = state.worlds.filter((world) => Boolean(world.previewUrl)).length;
  const active = state.worlds.filter((world) => ["queued", "running", "remote-pending"].includes(world.status)).length;
  historyStats.innerHTML = `<span><b>${state.worlds.length}</b>全部世界</span><span><b>${ready}</b>可游玩</span><span><b>${active}</b>生成中</span>`;

  for (const world of filtered) {
    const fragment = template.content.cloneNode(true);
    const card = fragment.querySelector(".world-card");
    card.dataset.status = world.status;
    configureCardCover(fragment, world);
    fragment.querySelector(".status-pill").textContent = worldStatusLabel(world);
    fragment.querySelector(".scene-id").textContent = world.testSetId
      ? `TEST SET · ${world.sceneId}`
      : world.sceneId;
    fragment.querySelector("time").textContent = formatDate(world.createdAt);
    fragment.querySelector("h3").textContent = world.title;
    fragment.querySelector(".prompt-excerpt").textContent = world.prompt;
    fragment.querySelector(".progress-track i").style.width = `${progressByStage[world.stage] ?? 8}%`;
    const backend = worldCodexBackend(world);
    const backendBadge = fragment.querySelector(".backend-badge");
    if (backend) {
      backendBadge.hidden = false;
      backendBadge.textContent = codexBackendLabel(backend);
      backendBadge.title = `该任务创建时已固定使用${codexBackendLabel(backend)}`;
      card.dataset.codexBackend = backend;
    }
    const queue = world.queuePosition ? ` · 队列第 ${world.queuePosition} 位` : "";
    fragment.querySelector(".stage-copy").textContent = world.status === "remote-pending"
      ? `等待远端 Job 对账 · ${stageLabel(world.stage, backend)}`
      : `${stageLabel(world.stage, backend)}${queue}`;
    const play = fragment.querySelector(".play-button");
    if (world.previewUrl) {
      play.href = world.previewUrl;
      play.setAttribute("aria-disabled", "false");
    } else {
      play.removeAttribute("href");
      play.setAttribute("aria-disabled", "true");
    }
    const stop = fragment.querySelector(".stop-button");
    if (["queued", "running", "remote-pending", "visual-queued", "visual-running"].includes(world.status)) {
      stop.hidden = false;
      stop.addEventListener("click", () => void requestWorldStop(world.id, stop));
    }
    for (const button of fragment.querySelectorAll(".details-button, .card-cover")) {
      button.addEventListener("click", () => openWorld(world.id));
    }
    worldGrid.append(fragment);
  }
}

async function loadWorlds() {
  if (state.loadingWorlds) return;
  state.loadingWorlds = true;
  try {
    const response = await fetch("/api/worlds", { cache: "no-store" });
    if (!response.ok) throw new Error("无法读取历史世界");
    const payload = await response.json();
    const revision = historyRevision(payload.worlds);
    state.worlds = payload.worlds;
    if (revision !== state.historyRevision) {
      state.historyRevision = revision;
      renderHistory();
      if (state.episodeReviews.length) renderSeedanceReview();
    }
  } catch (error) {
    runtimeState.className = "runtime-state offline";
    runtimeState.querySelector("span").textContent = error.message;
  } finally {
    state.loadingWorlds = false;
  }
}

async function loadHealth() {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    if (!response.ok) throw new Error("运行状态读取失败");
    const health = await response.json();
    const backend = normalizeCodexBackend(health.codexBackend);
    if (!backend) throw new Error("Codex 执行端配置无效");
    state.health = health;
    state.codexBackend = backend;
    state.codexAvailable = Boolean(health.codexAvailable);
    state.backendMessage = "";
    const online = health.ok && state.codexAvailable && health.pnpmAvailable;
    const profile = health.codexExecutionProfile ?? health.formalCodexExecutionProfile ?? health.formalProfile;
    const profileLabel = profile?.model && profile?.reasoningEffort
      ? `${profile.model} · ${profile.reasoningEffort}`
      : "正式模型未声明";
    const allActiveJobs = Array.isArray(health.activeJobs) ? health.activeJobs : health.activeJob ? [health.activeJob] : [];
    const taggedActiveJobs = allActiveJobs.filter((job) => normalizeCodexBackend(job?.codexBackend));
    const activeJobs = taggedActiveJobs.length > 0
      ? taggedActiveJobs.filter((job) => normalizeCodexBackend(job.codexBackend) === backend)
      : allActiveJobs;
    const activeCount = activeJobs.length;
    const backendLabel = codexBackendLabel(backend);
    const backendCapacity = health.maxConcurrentJobsByBackend?.[backend] ?? health.maxConcurrentJobs ?? activeCount;
    const backendQueued = health.queuedByBackend?.[backend] ?? 0;
    runtimeState.className = `runtime-state ${online ? "online" : "offline"}`;
    runtimeState.querySelector("span").textContent = online
      ? activeCount > 0
        ? `${backendLabel} · ${profileLabel} · 运行 ${activeCount}/${backendCapacity}${backendQueued > 0 ? ` · 排队 ${backendQueued}` : ""}`
        : `${backendLabel} · ${profileLabel} · 可用${backendQueued > 0 ? ` · 排队 ${backendQueued}` : ""}`
      : health.pnpmAvailable === false
        ? "主机 pnpm 当前不可用"
        : `${backendLabel}当前不可用`;
    syncCodexBackendUi();
  } catch (error) {
    state.health = null;
    state.codexAvailable = false;
    state.backendMessage = error.message;
    runtimeState.className = "runtime-state offline";
    runtimeState.querySelector("span").textContent = "本地运行时未连接";
    syncCodexBackendUi();
  }
}

function backendAvailability(backend) {
  return state.health?.codexBackends?.[backend]?.available === true;
}

function syncCodexBackendUi() {
  const backend = normalizeCodexBackend(state.codexBackend);
  const details = backend ? codexBackendDetails[backend] : null;
  for (const button of codexBackendButtons) {
    const option = normalizeCodexBackend(button.dataset.codexBackend);
    if (!option) continue;
    const available = backendAvailability(option);
    const isCurrent = option === backend;
    button.setAttribute("aria-pressed", String(isCurrent));
    button.classList.toggle("active", isCurrent);
    button.disabled = !available || state.backendSwitching || state.submittingWorld || state.runningTestSets;
    const reason = state.health?.codexBackends?.[option]?.reason;
    const unavailableReason = typeof reason === "string" && reason.trim()
      ? reason
      : option === "local"
        ? "这台机器未检测到已安装且登录的 Codex"
        : "项目内云端 Codex 配置不可用";
    const status = available
      ? `${isCurrent ? "当前使用" : "切换为"}${codexBackendLabel(option)}；只影响之后新建的任务`
      : `${codexBackendLabel(option)}不可用：${unavailableReason}`;
    button.title = status;
    button.setAttribute("aria-label", status);
  }

  submitBackendEyebrow.textContent = details?.eyebrow ?? "SELECT CODEX BACKEND";
  historyKicker.textContent = details?.kicker ?? "WORLD HISTORY / CODEX BACKENDS";
  submitButton.disabled = !state.codexAvailable || state.backendSwitching || state.submittingWorld;
  if (state.backendSwitching && details) {
    codexBackendNote.textContent = `正在切换到${details.label}……已经排队或运行的任务不会改变。`;
  } else if (state.backendMessage) {
    codexBackendNote.textContent = `执行端切换失败：${state.backendMessage}`;
  } else if (backend === "local") {
    codexBackendNote.textContent = "新任务将使用这台机器现有的 Codex 登录，不复制凭证；已经排队或运行的任务保持原执行端。";
  } else if (backend === "cloud") {
    codexBackendNote.textContent = "新任务将使用云端 Codex；已经排队或运行的任务保持原执行端。";
  } else {
    codexBackendNote.textContent = "正在读取执行端配置。切换只影响之后新建的任务。";
  }
  updateTestSetSelection();
}

async function selectCodexBackend(backendValue) {
  const backend = normalizeCodexBackend(backendValue);
  if (!backend || backend === state.codexBackend || state.backendSwitching || !backendAvailability(backend)) return;
  state.backendSwitching = true;
  state.backendMessage = "";
  syncCodexBackendUi();
  try {
    const response = await fetch("/api/settings/codex-backend", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ backend }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const retainedBackend = normalizeCodexBackend(payload.codexBackend);
      if (retainedBackend) state.codexBackend = retainedBackend;
      if (payload.codexBackends) {
        state.health = { ...state.health, codexBackends: payload.codexBackends };
        state.codexAvailable = Boolean(payload.codexAvailable);
      }
      throw new Error(payload.error ?? `无法切换到${codexBackendLabel(backend)}`);
    }
    state.codexBackend = backend;
    await loadHealth();
  } catch (error) {
    state.backendMessage = error.message;
  } finally {
    state.backendSwitching = false;
    syncCodexBackendUi();
  }
}

function renderSubjectCatalog() {
  capabilityCount.textContent = `${state.subjectCatalog.length} PRESETS`;
  subjectCatalog.innerHTML = state.subjectCatalog.map((preset) => `
    <article class="capability-item">
      <div><b>${escapeHtml(preset.label)}</b><span class="maturity ${escapeHtml(preset.maturity)}">${escapeHtml(preset.maturity)}</span></div>
      <code>${escapeHtml(preset.ref)}</code>
      <p>${escapeHtml(preset.description)}</p>
      <small>${Array.isArray(preset.planningBounds)
        ? "规划尺寸 W×H×D " + preset.planningBounds.map((value) => Number(value).toFixed(2)).join(" × ") + "m · 1S = " + Number(preset.planningBounds[1]).toFixed(2) + "m"
        : "规划尺寸由参考图推断"}</small>
      <small>${(preset.capabilities ?? []).map(escapeHtml).join(" · ")}</small>
    </article>
  `).join("");
}

async function loadSubjectCatalog() {
  try {
    const response = await fetch("/api/subject-catalog", { cache: "no-store" });
    if (!response.ok) throw new Error("主体目录读取失败");
    const payload = await response.json();
    state.subjectCatalog = Array.isArray(payload.presets) ? payload.presets : [];
    renderSubjectCatalog();
  } catch (error) {
    capabilityCount.textContent = "UNAVAILABLE";
    subjectCatalog.innerHTML = `<p class="capability-error">${escapeHtml(error.message)}</p>`;
  }
}

function renderPlanningMedia(media) {
  const items = media?.planning ?? [];
  if (!items.length) return `<p class="media-empty">规划图片尚未产生，生成过程中会自动出现在这里。</p>`;
  return `<div class="planning-gallery">${items.map(renderPlanningItem).join("")}</div>`;
}

function renderPlannerReview(media) {
  const review = media?.plannerReview ?? { status: "unavailable" };
  const labels = {
    unavailable: "等待 Planner 工件",
    pending: "待人工审核",
    approved: "人工已通过",
    rejected: "人工已退回",
  };
  const available = review.status !== "unavailable";
  return `<section class="planner-human-review ${escapeHtml(review.status)}" data-live-planner-review>
    <div><small>HUMAN PLANNER REVIEW</small><h4>${escapeHtml(labels[review.status] ?? review.status)}</h4><p>人工确认俯视图只用小型红色出生点、保持一个连续世界、覆盖至少四倍参考可见地理面积，且只把地面运动支持标为可行区域；飞行和游泳不绘制可行域。同时确认入口图的第三人称构图。这里不使用面积、包围盒或图像识别启发式 Gate。</p>${review.reviewedAt ? `<span>审核时间：${escapeHtml(formatDateTime(review.reviewedAt))}</span>` : ""}</div>
    <div class="planner-review-actions">
      <button type="button" data-planner-review="approved" ${available ? "" : "disabled"}>通过规划</button>
      <button type="button" data-planner-review="rejected" ${available ? "" : "disabled"}>退回规划</button>
    </div>
  </section>`;
}

function renderPlanningItem(item) {
  const showsBlockLegend = ["world-plan", "entry-whitebox-target"].includes(item.kind);
  return `<article class="media-card ${item.available ? "" : "is-pending"}" data-planning-kind="${escapeHtml(item.kind)}" data-planning-url="${escapeHtml(item.url ?? "")}">
      <div class="media-frame">
        ${item.url
          ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer"><img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.title)}" loading="lazy" /></a>`
          : `<div class="media-pending"><span>GENERATING</span><b>${escapeHtml(item.title)}</b><small>产物生成后自动显示</small></div>`}
      </div>
      <div class="media-copy">
        <span>${escapeHtml(item.kind)}</span>
        <h4>${escapeHtml(item.title)}</h4>
        <p>${escapeHtml(item.description ?? "")}</p>
        ${showsBlockLegend ? `<div class="block-whitebox-legend" aria-label="方块语义颜色图例">${blockWhiteboxLegend.map(([color, label]) => `<span><i style="background:${safeCssColor(color)}"></i>${escapeHtml(label)}</span>`).join("")}</div>` : ""}
        ${item.prompt ? `<details><summary>查看对应 Prompt</summary><pre>${escapeHtml(item.prompt)}</pre></details>` : ""}
      </div>
    </article>`;
}

function renderPrototypeMedia(media) {
  const prototypes = media?.prototypes ?? [];
  if (!prototypes.length) return `<p class="media-empty">Block Builder 完成后，Babylon 会为最多 5 个完整视觉组（包含主体）生成 Front / Right / Back 白膜三视图。</p>`;
  return `<div class="prototype-gallery">${prototypes.map(renderPrototypeItem).join("")}</div>`;
}

function renderPrototypeItem(prototype) {
  const size = Array.isArray(prototype.approximateSize) ? prototype.approximateSize.join(" × ") : "—";
  const renderView = (url, label, pending) => url
    ? `<a class="prototype-view" href="${escapeHtml(url)}" target="_blank" rel="noreferrer"><img src="${escapeHtml(url)}" alt="${escapeHtml(`${prototype.id} ${label}`)}" loading="lazy" /><span>${escapeHtml(label)} ↗</span></a>`
    : `<div class="prototype-view view-pending"><span>${escapeHtml(pending)}</span></div>`;
  return `<article class="prototype-card" data-prototype-id="${escapeHtml(prototype.id)}" data-prototype-views="${escapeHtml(`${prototype.whiteboxUrl ?? ""}|${prototype.styledUrl ?? ""}`)}">
      <header>
        <i style="background:${safeCssColor(prototype.instanceColor)}"></i>
        <div><small>${escapeHtml(prototype.role ?? "entity")} · ${escapeHtml(prototype.semantic ?? prototype.id)}</small><h4>${escapeHtml(prototype.id)}</h4></div>
        <span>${escapeHtml(prototype.memberCount ? `${prototype.memberCount} 个组件` : size)}</span>
      </header>
      <p>${escapeHtml(prototype.description ?? "")}</p>
      ${prototype.consistencyRationale ? `<p class="consistency-rationale">强一致性原因：${escapeHtml(prototype.consistencyRationale)}</p>` : ""}
      <div class="prototype-views">
        ${renderView(prototype.whiteboxUrl, "白膜三视图", "等待白膜三视图")}
        ${renderView(prototype.styledUrl, "渲染后三视图", "新首帧生成后自动渲染")}
      </div>
      ${prototype.appearancePrompt ? `<details><summary>查看外观 Prompt 与限制</summary><pre>${escapeHtml(prototype.appearancePrompt)}${prototype.negativePrompt ? `\n\nNegative: ${escapeHtml(prototype.negativePrompt)}` : ""}</pre></details>` : ""}
    </article>`;
}

function renderHelperMedia(media) {
  const helpers = media?.helpers ?? [];
  if (!helpers.length) return `<p class="media-empty">这个世界没有单独声明基础碰撞或地形辅助物。</p>`;
  return `<div class="helper-gallery">${helpers.map(renderHelperItem).join("")}</div>`;
}

function renderHelperItem(helper) {
  const size = Array.isArray(helper.approximateSize) ? helper.approximateSize.join(" × ") : "—";
  const position = Array.isArray(helper.position) ? helper.position.join(", ") : "—";
  return `<article class="helper-card" data-helper-id="${escapeHtml(helper.id)}">
      <header><div><small>${escapeHtml(helper.purpose ?? "helper")} · ${escapeHtml(helper.shapeHint ?? "low-detail")}</small><h4>${escapeHtml(helper.id)}</h4></div><span>${escapeHtml(size)}</span></header>
      <p>${escapeHtml(helper.semantic ?? "")}</p>
      <footer><span>Feature: ${escapeHtml(helper.featureId ?? "—")}</span><span>Position: ${escapeHtml(position)}</span></footer>
    </article>`;
}

const phaseTitles = {
  input: "需求输入",
  planner: "统一世界规划",
  "coding-agent": "白膜实现",
  "block-build": "方块编译",
  "runtime-capture": "真实运行捕获",
  "entry-alignment-validation": "进入构图校验",
  "visual-reconstruction": "LWDP Codex 视觉重建",
};

const trajectoryStatusLabels = {
  complete: "已完成",
  active: "进行中",
  pending: "等待中",
  failed: "需处理",
  skipped: "旧版跳过",
  optional: "可选",
};

function renderTrajectory(media, compact = false) {
  const stages = media?.trajectory?.stages ?? [];
  if (!stages.length) return `<p class="media-empty">任务轨迹尚未建立。</p>`;
  return `<ol class="trajectory ${compact ? "is-compact" : ""}">${stages.map((stage, index) => {
    const deliverableCount = (media?.deliverables ?? []).filter(
      (deliverable) => deliverable.phase === stage.id && deliverable.status === "available",
    ).length;
    return `<li data-stage-id="${escapeHtml(stage.id)}" data-status="${escapeHtml(stage.status)}">
      <div class="trajectory-marker"><span>${String(index + 1).padStart(2, "0")}</span></div>
      <div class="trajectory-copy">
        <header><div><small>${escapeHtml(stage.owner)}</small><h4>${escapeHtml(stage.title)}</h4></div><span data-stage-status>${escapeHtml(trajectoryStatusLabels[stage.status] ?? stage.status)}</span></header>
        <div class="stage-metrics"><span><b data-stage-duration>${escapeHtml(formatDuration(stage.durationMs, stage.durationStatus))}</b><small>耗时</small></span><span><b data-stage-tokens>${escapeHtml(formatTokenCount(stage.tokenCount, stage.tokenStatus))}</b><small>Token</small></span></div>
        ${compact ? "" : `<p>${escapeHtml(stage.description)}</p><footer data-stage-deliverables>${deliverableCount} 个已交付工件</footer>`}
      </div>
    </li>`;
  }).join("")}</ol>`;
}

function renderEventStream(media) {
  const trajectory = media?.trajectory;
  const events = trajectory?.events ?? [];
  if (!events.length) return `<p class="media-empty">还没有可观察的阶段事件。</p>`;
  return `<div class="event-stream-heading"><span>OBSERVABLE AGENT EVENTS</span><small>${trajectory.source === "reconstructed" ? "由历史工件恢复" : "任务运行时记录"}</small></div>
    <ol class="event-stream">${events.slice(-40).map(renderEventItem).join("")}
    </ol>`;
}

function eventKey(event) {
  return `${event.at}|${event.stage}|${event.message ?? ""}`;
}

function renderEventItem(event) {
  return `<li data-event-key="${escapeHtml(eventKey(event))}">
      <time>${escapeHtml(formatDateTime(event.at))}</time>
      <i></i>
      <div><b>${escapeHtml(stageLabels[event.stage] ?? phaseTitles[event.stage] ?? event.stage)}</b><p>${escapeHtml(event.message ?? "阶段状态发生变化。")}</p></div>
    </li>`;
}

function renderDeliverables(media) {
  const deliverables = media?.deliverables ?? [];
  if (!deliverables.length) return `<p class="media-empty">过程交付物尚未建立。</p>`;
  const phases = Object.keys(phaseTitles);
  return `<div class="deliverable-groups">${phases.map((phase) => {
    const items = deliverables.filter((item) => item.phase === phase);
    if (!items.length) return "";
    const available = items.filter((item) => item.status === "available").length;
    return `<section class="deliverable-group">
      <header><div><small>${escapeHtml(phase)}</small><h4>${escapeHtml(phaseTitles[phase])}</h4></div><span>${available} / ${items.length}</span></header>
      <div class="deliverable-list" data-deliverable-phase="${escapeHtml(phase)}">${items.map(renderDeliverableItem).join("")}</div>
    </section>`;
  }).join("")}</div>`;
}

function isImageDeliverable(item) {
  return /^(?:PNG|JPEG|JPG|WEBP|image\/)/i.test(item.format ?? "") || /\.(?:png|jpe?g|webp)(?:$|\?)/i.test(item.url ?? "");
}

function renderDeliverablePreview(item) {
  if (item.status !== "available" || !item.url) {
    return `<div class="deliverable-waiting">${item.status === "not-needed" ? "这个工件只在对应流程需要时产生。" : "工件生成后会自动出现在这里。"}</div>`;
  }
  const preview = isImageDeliverable(item)
    ? `<div class="artifact-image"><img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.title)}" loading="lazy" /></div>`
    : `<pre class="artifact-text" data-artifact-text>展开后加载内容…</pre>`;
  return `<details class="deliverable-inline" data-artifact-url="${escapeHtml(item.url)}" data-artifact-format="${escapeHtml(item.format ?? "")}">
      <summary><span>在页面内展开查看</span><small>${escapeHtml(item.format ?? "FILE")}</small></summary>
      <div class="artifact-preview">${preview}<a href="${escapeHtml(item.url)}" download>下载原文件</a></div>
    </details>`;
}

function renderDeliverableItem(item) {
  return `<article class="deliverable-item" data-deliverable-id="${escapeHtml(item.id)}" data-status="${escapeHtml(item.status)}" data-updated-at="${escapeHtml(item.updatedAt ?? "")}" data-url="${escapeHtml(item.url ?? "")}">
      <span class="deliverable-state">${item.status === "available" ? "✓" : item.status === "not-needed" ? "—" : "…"}</span>
      <div class="deliverable-copy"><small>${escapeHtml(item.owner)} · ${escapeHtml(item.format)}</small><h5>${escapeHtml(item.title)}</h5><p>${escapeHtml(item.description)}</p></div>
      <div class="deliverable-meta"><span>${escapeHtml(formatBytes(item.sizeBytes))}</span><time>${item.updatedAt ? escapeHtml(formatDate(item.updatedAt)) : "尚未生成"}</time><span>${item.status === "available" ? "可展开" : item.status === "not-needed" ? "按需产生" : "等待中"}</span></div>
      ${renderDeliverablePreview(item)}
    </article>`;
}

function wireArtifactPreviews(root = dialogContent) {
  for (const details of root.querySelectorAll(".deliverable-inline:not([data-wired])")) {
    details.dataset.wired = "true";
    details.addEventListener("toggle", async () => {
      const output = details.querySelector("[data-artifact-text]");
      if (!details.open || !output || output.dataset.loaded === "true" || output.dataset.loading === "true") return;
      output.dataset.loading = "true";
      try {
        const response = await fetch(details.dataset.artifactUrl, { cache: "no-store" });
        if (!response.ok) throw new Error(`读取失败（${response.status}）`);
        const raw = await response.text();
        if (/JSON/i.test(details.dataset.artifactFormat ?? "")) {
          try {
            output.textContent = JSON.stringify(JSON.parse(raw), null, 2);
          } catch {
            output.textContent = raw;
          }
        } else {
          output.textContent = raw;
        }
        output.dataset.loaded = "true";
      } catch (error) {
        output.textContent = error.message;
      } finally {
        delete output.dataset.loading;
      }
    });
  }
}

function renderValidation(media) {
  const composition = media?.composition;
  const planner = media?.plannerValidation;
  const plannerPassed = planner?.status === "passed";
  const captured = (media?.planning ?? []).some((item) => item.kind === "opening-frame" && item.available) ||
    (composition !== null && composition !== undefined);
  const percentage = (value) => Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "—";
  const metrics = [
    ["规划图颜色覆盖", percentage(planner?.worldPlan?.blockPaletteCoverageRatio)],
    ["入口图颜色覆盖", percentage(planner?.entryWhiteboxTarget?.blockPaletteCoverageRatio)],
    ["规划图地面支持像素", Number.isFinite(planner?.worldPlan?.traversablePixelCount) ? String(planner.worldPlan.traversablePixelCount) : "—"],
    ["规划图交互像素", Number.isFinite(planner?.worldPlan?.interactivePixelCount) ? String(planner.worldPlan.interactivePixelCount) : "—"],
    ["主体中心误差", percentage(planner?.entryWhiteboxTarget?.subjectCenterErrorRatio)],
    ["运行状态", captured ? "Runtime Captured" : "等待真实捕获"],
    ["权威来源", captured ? "Babylon Runtime" : "—"],
    ["协议", captured ? "Block World V2 / Snapshot V4" : "—"],
  ];
  return `<div class="validation-summary ${plannerPassed && captured ? "pass" : ""}">
      <div><small>BLOCK PLAN & RUNTIME</small><h3>${plannerPassed ? "方块规划已自检" : "等待方块规划自检"} · ${captured ? "运行捕获已完成" : "等待运行捕获"}</h3><p>Planner 收据核对两张方块白膜图的语义颜色、目标色、16:9 和主体居中；实际几何、碰撞与可玩结果仍由 Builder 方块检查和 Babylon Runtime 证明。</p></div>
      <span>${plannerPassed && captured ? "VERIFIED" : "PENDING"}</span>
    </div>
    <div class="metric-grid">${metrics.map(([label, value]) => `<article><small>${escapeHtml(label)}</small><b>${escapeHtml(value)}</b></article>`).join("")}</div>`;
}

function renderCompositionStatus(media) {
  const composition = media?.composition;
  if (!composition) return `<span data-live-composition>${media?.availableImageCount ?? 0} 张产物</span>`;
  if (composition.advisoryOnly) return `<span class="composition-status" data-live-composition>真实首帧已捕获</span>`;
  const score = `${Math.round(composition.score * 100)}%`;
  return `<span class="composition-status" data-live-composition>构图诊断 · ${score}</span>`;
}

const episodeStageLabels = {
  reconnaissance: "Runtime 侦察",
  "playthrough-plan": "六起点玩家操作剧本",
  "whitebox-capture": "白膜录制与切分",
  "visual-reconstruction": "样式首帧与三视图",
  "style-variant-production": "十种风格视觉生产",
  "style-variant-plan": "十种独立风格规划",
  "style-variant-visual-review": "Codex 构图与三视图质检",
  "style-variant-gemini-events": "逐风格 Gemini 事件",
  "style-variant-seedance-generation": "逐风格 Seedance 生成",
  "seedance-prompts": "Seedance 渲染 Prompt",
  "seedance-generation": "Seedance 2.5 原生 720p",
  "mg-seedance": "历史 MG Seedance 2.5 480p",
  "cf-upscale": "CF 超分 720p",
  "mediakit-upscale": "AI MediaKit 画质增强 720p",
  conformance: "视频规格对齐",
};
function formatEpisodeSeconds(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)}s` : "—";
}
const episodeInputKeyLabels = Object.freeze({
  W: "W", A: "A", S: "S", D: "D", Shift: "Shift", Space: "空格",
  I: "I", J: "J", K: "K", L: "L",
});

function renderComparisonVideo(video, role, title, description, { preload = "none", showPoster = true } = {}) {
  const poster = showPoster && video?.poster?.url ? ` poster="${escapeHtml(video.poster.url)}"` : "";
  return `<figure class="episode-compare-video" data-video-role="${role}">
    <figcaption><b>${escapeHtml(title)}</b><span>${escapeHtml(description)}</span></figcaption>
    ${video?.url
      ? `<video controls playsinline preload="${preload}"${poster} ${role === "whitebox" ? "muted" : ""} src="${escapeHtml(video.url)}" data-compare-video="${role}"></video>`
      : `<div class="episode-video-pending">该视频尚未生成</div>`}
  </figure>`;
}

function renderEpisodeComparison(comparison, { productionOnly = false } = {}) {
  const durationSeconds = Number(comparison?.durationSeconds) || 30;
  const globalStartSeconds = Number(comparison?.globalStartSeconds) || 0;
  const activations = Array.isArray(comparison?.inputActivations) ? comparison.inputActivations : [];
  const events = Array.isArray(comparison?.promptEvents)
    ? comparison.promptEvents
    : comparison?.promptEvent ? [comparison.promptEvent] : [];
  const promptEventsState = events.map((event, index) => ({
    index,
    startSeconds: Number.isFinite(Number(event?.relativeSeconds))
      ? Number(event.relativeSeconds)
      : null,
    endSeconds: Number.isFinite(Number(event?.activeEndSeconds))
      ? Number(event.activeEndSeconds)
      : Number.isFinite(Number(event?.relativeSeconds)) ? Number(event.relativeSeconds) : null,
    commandText: event?.commandText || `等待第 ${index + 1} 条世界指令`,
  }));
  const displayedFinalVideo = productionOnly && publicSeedanceMode
    ? comparison?.publicPreviewVideo ?? comparison?.finalVideo
    : comparison?.finalVideo;
  const hasComparison = Boolean(comparison?.whiteboxVideo?.url && displayedFinalVideo?.url &&
    (productionOnly || comparison?.legacyPromptVideo?.url && comparison?.relaxedActionVideo?.url));
  const activationData = escapeHtml(JSON.stringify(activations));
  const keyChip = (key, label, position = "") =>
    `<span class="episode-key ${position}" data-input-key="${key}" data-active="false">${escapeHtml(label)}</span>`;
  const movementKeys = [
    keyChip("W", "W", "key-up"),
    keyChip("A", "A", "key-left"),
    keyChip("S", "S", "key-down"),
    keyChip("D", "D", "key-right"),
  ].join("");
  const cameraKeys = [
    keyChip("I", "I", "key-up"),
    keyChip("J", "J", "key-left"),
    keyChip("K", "K", "key-down"),
    keyChip("L", "L", "key-right"),
  ].join("");
  const actionKeys = [keyChip("Space", "空格"), keyChip("Shift", "Shift")].join("");
  const activationBars = activations.map((activation) => {
    const start = Math.max(0, Math.min(durationSeconds, Number(activation.startSeconds) || 0));
    const end = Math.max(start, Math.min(durationSeconds, Number(activation.endSeconds) || start));
    return `<i class="episode-input-span" data-kind="${escapeHtml(activation.kind)}" style="left:${(start / durationSeconds) * 100}%;width:${Math.max(.25, ((end - start) / durationSeconds) * 100)}%"></i>`;
  }).join("");
  const promptMarkers = promptEventsState.map((event) => event.startSeconds === null
    ? ""
    : `<i class="episode-prompt-marker" style="left:${Math.max(0, Math.min(100, event.startSeconds / durationSeconds * 100))}%" title="Prompt Event ${event.index + 1} · ${formatEpisodeSeconds(event.startSeconds)}"></i>`).join("");
  const commandText = events[0]?.commandText || "本段无 Prompt Event，仅保持基础场景渲染";
  const promptPanels = events.length > 0 ? events.map((event, eventIndex) => {
    const relativeSeconds = promptEventsState[eventIndex]?.startSeconds ?? null;
    const eventPrompt = event?.eventPrompt || `该段第 ${eventIndex + 1} 条 Prompt Event 尚未生成。`;
    const providerPrompt = event?.providerPrompt || "完整 Seedance Provider Prompt 尚未生成。";
    const legacyProviderPrompt = event?.legacyProviderPrompt || "旧版重 Prompt 尚未生成。";
    const relaxedProviderPrompt = event?.relaxedProviderPrompt || "放开动作 Prompt 尚未生成。";
    return `<div class="episode-prompt-panel" data-prompt-state="pending" data-prompt-event-index="${eventIndex}">
      <header><div><small>SEEDANCE PROMPT EVENT ${eventIndex + 1}</small><h6>${event?.targetNames?.length ? escapeHtml(event.targetNames.join(" · ")) : `本段第 ${eventIndex + 1} 条输入 Prompt`}</h6></div><span data-prompt-status>${relativeSeconds === null ? "尚未生成" : `等待 ${formatEpisodeSeconds(relativeSeconds)}`}</span></header>
      <pre>${escapeHtml(eventPrompt)}</pre>
      ${eventIndex === 0 ? `<details><summary>查看送入模型的完整 Prompt（包含两条事件）</summary><pre>${escapeHtml(providerPrompt)}</pre></details>` : ""}
      ${productionOnly || eventIndex !== 0 ? "" : `<details><summary>查看 B 版旧 Prompt</summary><pre>${escapeHtml(legacyProviderPrompt)}</pre></details>`}
      ${productionOnly || eventIndex !== 0 ? "" : `<details><summary>查看 C 版放开动作 Prompt</summary><pre>${escapeHtml(relaxedProviderPrompt)}</pre></details>`}
    </div>`;
  }).join("") : `<div class="episode-prompt-panel" data-prompt-state="none">
      <header><div><small>NO PROMPT EVENT</small><h6>基础场景连续渲染</h6></div><span>本段无事件</span></header>
      <p>该起点仍生成 Seedance 最终视频，但不会注入 Gemini 世界变化事件。</p>
      ${comparison.seedanceProviderPrompt ? `<details><summary>查看送入模型的基础 Prompt</summary><pre>${escapeHtml(comparison.seedanceProviderPrompt)}</pre></details>` : ""}
    </div>`;
  const productionMediaOptions = productionOnly
    ? { preload: comparison.index === 0 ? "metadata" : "none", showPoster: comparison.index === 0 }
    : {};
  const openingReview = comparison.reviewStyledOpeningFrame?.url
    ? `<section class="episode-opening-review">
        <header><small>VISUAL RECONSTRUCTOR V5 · HUMAN REVIEW</small><b>白膜空间 → 原视觉基准 → 新分段首帧</b></header>
        <div class="episode-opening-review-grid">
          <figure><img src="${escapeHtml(comparison.whiteboxVideo?.poster?.url ?? "")}" alt="${escapeHtml(comparison.title)} 白膜首帧" loading="lazy" /><figcaption>当前分段白膜 · 空间权威</figcaption></figure>
          <figure><img src="${escapeHtml(comparison.baseStyledOpeningFrame?.url ?? "")}" alt="原 Visual Reconstructor 样式基准" loading="lazy" /><figcaption>原 Visual Reconstructor · 样式基准</figcaption></figure>
          <figure><img src="${escapeHtml(comparison.reviewStyledOpeningFrame.url)}" alt="${escapeHtml(comparison.title)} 新首帧" loading="lazy" /><figcaption>V5 新首帧 · 待人工审阅</figcaption></figure>
        </div>
      </section>`
    : "";
  return `<section class="episode-segment-comparison" data-episode-comparison
      data-segment-id="${escapeHtml(comparison.segmentId)}"
      data-duration-seconds="${durationSeconds}"
      data-global-start-seconds="${globalStartSeconds}"
      data-input-activations="${activationData}"
      data-command-text="${escapeHtml(commandText)}"
      data-prompt-events="${escapeHtml(JSON.stringify(promptEventsState))}">
    <header class="episode-comparison-heading">
      <div><small>${escapeHtml(comparison.title)} · ${String(globalStartSeconds).padStart(2, "0")}–${globalStartSeconds + durationSeconds}s</small><h5>${productionOnly ? "白膜动作真值 ↔ Seedance 最终视频" : "白膜动作真值 ↔ A 固定模板 ↔ B 旧版重 Prompt ↔ C 放开动作"}</h5></div>
      <div class="episode-comparison-actions">
        <button type="button" data-compare-toggle ${hasComparison ? "" : "disabled"}>一键同步对比</button>
        <button type="button" data-compare-reset ${hasComparison ? "" : "disabled"}>回到本段开头</button>
      </div>
    </header>
    ${openingReview}
    <div class="episode-video-pair">
      ${renderComparisonVideo(comparison.whiteboxVideo, "whitebox", "白膜视频", "运动、镜头、空间与时序权威", productionMediaOptions)}
      ${renderComparisonVideo(displayedFinalVideo, "final", productionOnly ? "Seedance 最终视频" : "A · 生产链路", "Seedance 2.5 · 720p 直出 · 24fps/720帧", productionMediaOptions)}
      ${productionOnly ? "" : renderComparisonVideo(comparison.legacyPromptVideo, "legacy", "B · 旧版重 Prompt", "完整 Brief + 逐项事件 · MG 480p")}
      ${productionOnly ? "" : renderComparisonVideo(comparison.relaxedActionVideo, "relaxed", "C · 放开动作", "新版动作条款 · MG 480p")}
    </div>
    <div class="episode-comparison-telemetry">
      <div class="episode-control-deck">
        <div class="episode-key-group"><small>移动</small><div class="episode-key-cluster" aria-label="当前 WASD 移动输入">${movementKeys}</div></div>
        <div class="episode-key-group"><small>视角</small><div class="episode-key-cluster" aria-label="当前方向键视角输入">${cameraKeys}</div></div>
        <div class="episode-key-group episode-action-group"><small>动作</small><div class="episode-action-keys">${actionKeys}</div></div>
        <div class="episode-world-command"><small>世界指令</small><div class="episode-command-field"><span data-prompt-command>${escapeHtml(commandText)}</span><button type="button" tabindex="-1" aria-label="Prompt Event 指令">→</button></div></div>
      </div>
      <div class="episode-input-readout"><b data-input-summary>等待播放</b><span><output data-local-time>00.00s</output> · 全局 <output data-global-time>${formatEpisodeSeconds(globalStartSeconds)}</output></span></div>
      <div class="episode-input-timeline" aria-label="本段输入时间线">
        ${activationBars}${promptMarkers}<i class="episode-input-cursor" data-input-cursor></i>
      </div>
      <div class="episode-timeline-legend"><span>移动输入</span><span>相机方向键</span><span>Prompt Event</span><output data-compare-status>${hasComparison ? "READY" : "WAITING"}</output></div>
    </div>
    <div class="episode-prompt-events">${promptPanels}</div>
  </section>`;
}

function renderEpisodeComparisons(episode, options = {}) {
  const comparisons = Array.isArray(episode?.playbackComparisons) ? episode.playbackComparisons : [];
  if (!comparisons.length) return "";
  return `<div class="episode-comparison-stack"><div class="episode-comparison-intro"><div><small>SIX 30S CAPTURES</small><h5>六个起点同步对比</h5></div><p>六段全部生成 Seedance；起点 1、3、5 含 Gemini Prompt Event，起点 2、4、6 仅做基础场景渲染。播放时按键与事件状态会同步更新。</p></div>${comparisons.map((comparison) => renderEpisodeComparison(comparison, options)).join("")}</div>`;
}

function renderStyleVariantReviews(episode) {
  const variants = Array.isArray(episode?.styleVariants) ? episode.styleVariants : [];
  if (!variants.length) return "";
  return `<section class="style-variant-review-stack">
    <header class="episode-comparison-intro"><div><small>TEN VISUAL WORLDS</small><h5>同一白膜 · 十种独立风格</h5></div><p>白膜视频固定运动、镜头和空间；每个风格拥有独立首帧、三视图、Codex 智能质检、Gemini 事件和 Seedance 成片。</p></header>
    ${variants.map((variant) => {
      const review = variant.visualReview ?? {};
      const passed = review.verdict === "passed";
      return `<details class="style-variant-card" data-status="${escapeHtml(variant.status ?? "pending")}" ${variant.id === "style-00" ? "open" : ""}>
        <summary><span><small>${escapeHtml(variant.id)}</small><b>${escapeHtml(variant.name)}</b></span><em data-status="${passed ? "passed" : "pending"}">${passed ? "CODEX QA PASSED" : escapeHtml(variant.status ?? "等待生成")}</em></summary>
        <p>${escapeHtml(variant.concept ?? "")}</p>
        ${review.summary ? `<article class="style-variant-review-result"><small>CODEX VISUAL REVIEW</small><b>${passed ? "镜头、构图与三视图审核通过" : "需要定向修复"}</b><p>${escapeHtml(review.summary)}</p>${review.repairInstructions ? `<pre>${escapeHtml(review.repairInstructions)}</pre>` : ""}</article>` : ""}
        <div class="style-variant-triviews">${(variant.triviews ?? []).map((target) => `<article><small>${escapeHtml(target.visualTargetId)}</small><div><img src="${escapeHtml(target.whiteboxUrl)}" alt="白膜三视图" loading="lazy" />${target.styled?.url ? `<img src="${escapeHtml(target.styled.url)}" alt="样式化三视图" loading="lazy" />` : ""}</div></article>`).join("")}</div>
        <div class="style-variant-segments">${(variant.comparisons ?? []).map((comparison) => `<article><header><b>${escapeHtml(comparison.title)}</b><small>${escapeHtml(comparison.segmentId)}</small></header><div>${comparison.styledOpeningFrame?.url ? `<img src="${escapeHtml(comparison.styledOpeningFrame.url)}" alt="样式化首帧" loading="lazy" />` : `<span>首帧待生成</span>`}${comparison.whiteboxVideo?.url ? `<video controls muted playsinline preload="none" src="${escapeHtml(comparison.whiteboxVideo.url)}"></video>` : ""}${comparison.finalVideo?.url ? `<video controls playsinline preload="none" src="${escapeHtml(comparison.finalVideo.url)}"></video>` : ""}</div></article>`).join("")}</div>
      </details>`;
    }).join("")}
  </section>`;
}

function renderSeedanceReviewDownloads(episode) {
  const downloads = episode?.reviewDownloads;
  if (!downloads) return "";
  const images = Array.isArray(downloads.images) ? downloads.images : [];
  const documents = Array.isArray(downloads.documents) ? downloads.documents : [];
  const bundle = downloads.bundle ?? {};
  const imageGrid = images.length
    ? `<div class="seedance-review-assets-grid">${images.map((image) => `<a href="${escapeHtml(image.url)}" download>
        <img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.title)}" loading="lazy" />
        <span>${escapeHtml(image.title)}</span>
      </a>`).join("")}</div>`
    : `<p class="media-empty">相关首帧、规划图和三视图尚未准备完成。</p>`;
  const fileList = documents.length
    ? `<div class="seedance-review-file-list">${documents.map((document) => `<a href="${escapeHtml(document.url)}" download>
        <span><small>${escapeHtml(String(document.kind ?? "FILE").toUpperCase())}</small><b>${escapeHtml(document.title)}</b></span><em>下载</em>
      </a>`).join("")}</div>`
    : `<p class="media-empty">相关 JSON 文件尚未准备完成。</p>`;
  const bundleAction = bundle.ready && bundle.url
    ? `<a class="seedance-review-download-all" href="${escapeHtml(bundle.url)}" download>一键下载全部 ZIP</a>`
    : `<button class="seedance-review-download-all" type="button" disabled>六段成片就绪后可下载</button>`;
  return `<section class="seedance-review-downloads">
    <header><div><small>CASE ASSETS & PORTABLE BUNDLE</small><h4>相关图片、输入记录与完整下载包</h4><p>ZIP 包含六段白膜、六段 Seedance 2.5 原生 720p 最终视频，以及六张首帧、规划图、三视图、Prompt、Provider 记录和交互时间线。</p></div>${bundleAction}</header>
    <section><div class="seedance-review-assets-heading"><small>RELATED IMAGES</small><h5>参考图与生成图片</h5></div>${imageGrid}</section>
    <section><div class="seedance-review-assets-heading"><small>JSON & METADATA</small><h5>输入、Prompt 与运行记录</h5></div>${fileList}</section>
  </section>`;
}

function seedanceEpisodeFinalCount(episode) {
  return (episode?.playbackComparisons ?? []).filter((comparison) =>
    comparison?.whiteboxVideo?.url && comparison?.finalVideo?.url).length;
}

function seedanceEpisodeExpectedCount(episode) {
  const declared = Array.isArray(episode?.seedanceSegmentIds)
    ? episode.seedanceSegmentIds.length
    : 0;
  return declared > 0 ? declared : 4;
}

function seedanceReviewRevision(episodes) {
  return episodes.map((episode) => [
    episode.episodeId,
    episode.sceneId,
    episode.status,
    episode.updatedAt,
    seedanceEpisodeFinalCount(episode),
    episode.reviewDownloads?.bundle?.ready ?? false,
    ...(episode.reviewDownloads?.images ?? []).map((image) => image.sizeBytes ?? 0),
    ...(episode.playbackComparisons ?? []).map((comparison) => comparison?.reviewStyledOpeningFrame?.sizeBytes ?? 0),
  ].join(":" )).join("|");
}

function worldForEpisode(episode) {
  return state.worlds.find((world) => world.sceneId === episode?.sceneId) ?? null;
}

function selectLatestSeedanceEpisodes(episodes) {
  const selected = [];
  const seenScenes = new Set();
  for (const episode of [...episodes].sort((left, right) =>
    String(right.updatedAt ?? right.createdAt).localeCompare(String(left.updatedAt ?? left.createdAt)))) {
    if (!episode?.sceneId || seedanceEpisodeFinalCount(episode) === 0 || seenScenes.has(episode.sceneId)) continue;
    seenScenes.add(episode.sceneId);
    selected.push(episode);
  }
  return selected;
}

function disposeEpisodeComparisonMedia(root) {
  if (!root) return;
  for (const video of root.querySelectorAll("video")) {
    try { video.pause(); } catch {}
    video.removeAttribute("src");
    video.removeAttribute("poster");
    try { video.load(); } catch {}
  }
}

function renderSeedanceReviewDetail(episode) {
  disposeEpisodeComparisonMedia(seedanceReviewDetail);
  if (!episode) {
    seedanceReviewDetail.innerHTML = `<div class="seedance-review-placeholder"><span>S–00</span><h3>选择一个 case</h3><p>右侧会展示六个起点的白膜与最终视频同步对比。</p></div>`;
    return;
  }
  const world = worldForEpisode(episode);
  const title = world?.title || episode.sceneId;
  const finalCount = seedanceEpisodeFinalCount(episode);
  const expectedCount = seedanceEpisodeExpectedCount(episode);
  const previewUrl = world?.previewUrl ?? `/play?authoring=1&world=${encodeURIComponent(episode.sceneId)}`;
  const playAction = `<a class="seedance-world-button" href="${escapeHtml(previewUrl)}" target="worldkit-playground" rel="noreferrer">进入世界试玩 ↗</a>`;
  seedanceReviewDetail.innerHTML = `<header class="seedance-review-case-heading">
    <div><small>${escapeHtml(episode.episodeId)}</small><h3>${escapeHtml(title)}</h3><p>${escapeHtml(episode.sceneId)} · ${finalCount}/${expectedCount} 段最终视频 · ${formatDateTime(episode.updatedAt)}</p></div>
    ${playAction}
  </header>${renderEpisodeComparisons(episode, { productionOnly: true })}${renderSeedanceReviewDownloads(episode)}`;
  wireEpisodeComparisonPlayers(seedanceReviewDetail);
}

function renderSeedanceReview() {
  const episodes = state.episodeReviews;
  const selectedExists = episodes.some((episode) => episode.episodeId === state.selectedEpisodeId);
  if (!selectedExists) state.selectedEpisodeId = episodes[0]?.episodeId ?? null;
  seedanceCaseCount.textContent = String(episodes.length);
  seedanceCaseEmpty.hidden = episodes.length > 0;
  seedanceCaseList.hidden = episodes.length === 0;
  seedanceCaseList.innerHTML = episodes.map((episode, index) => {
    const world = worldForEpisode(episode);
    const title = world?.title || episode.sceneId;
    const poster = episode.playbackComparisons?.find((comparison) => comparison?.finalVideo?.poster?.url)
      ?.finalVideo?.poster?.url;
    const active = episode.episodeId === state.selectedEpisodeId;
    return `<button type="button" role="tab" aria-selected="${active}" class="seedance-case-item ${active ? "active" : ""}" data-seedance-episode="${escapeHtml(episode.episodeId)}">
      ${poster ? `<img src="${escapeHtml(poster)}" alt="" loading="lazy" />` : `<span class="seedance-case-index">${String(index + 1).padStart(2, "0")}</span>`}
      <span class="seedance-case-copy"><b>${escapeHtml(title)}</b><small>${escapeHtml(episode.sceneId)}</small><em>${seedanceEpisodeFinalCount(episode)}/${seedanceEpisodeExpectedCount(episode)} 段 · ${formatDate(episode.updatedAt)}</em></span>
    </button>`;
  }).join("");
  for (const button of seedanceCaseList.querySelectorAll("[data-seedance-episode]")) {
    button.addEventListener("click", () => {
      state.selectedEpisodeId = button.dataset.seedanceEpisode;
      renderSeedanceReview();
    });
  }
  renderSeedanceReviewDetail(episodes.find((episode) => episode.episodeId === state.selectedEpisodeId));
}

async function loadSeedanceReviews() {
  if (state.loadingEpisodeReviews) return;
  state.loadingEpisodeReviews = true;
  try {
    const response = await fetch("/api/episode-workflows?review=seedance", { cache: "no-store" });
    if (!response.ok) throw new Error("无法读取 Seedance 视频 case");
    const payload = await response.json();
    const episodes = selectLatestSeedanceEpisodes(payload.episodes ?? []);
    const revision = seedanceReviewRevision(episodes);
    state.episodeReviews = episodes;
    if (revision !== state.episodeReviewRevision) {
      state.episodeReviewRevision = revision;
      renderSeedanceReview();
    }
  } catch (error) {
    seedanceReviewDetail.innerHTML = `<p class="capability-error">${escapeHtml(error.message)}</p>`;
  } finally {
    state.loadingEpisodeReviews = false;
  }
}

function isComparisonVideoArtifact(artifact) {
  return /^whitebox\/segment-0[0-5]\.mp4$/.test(artifact?.relativePath ?? "") ||
    /^video\/segment-0[0-5]\/final-(?:854x480|1280x720)-24fps-720f\.mp4$/.test(artifact?.relativePath ?? "");
}

function renderEpisodeArtifact(artifact) {
  let preview = "";
  if (artifact.kind === "image") {
    preview = `<img src="${escapeHtml(artifact.url)}" alt="${escapeHtml(artifact.title)}" loading="lazy" />`;
  } else if (artifact.kind === "video") {
    preview = `<video controls playsinline preload="none" src="${escapeHtml(artifact.url)}"></video>`;
  } else {
    preview = `<details class="deliverable-inline" data-artifact-url="${escapeHtml(artifact.url)}" data-artifact-format="${artifact.kind === "json" ? "JSON" : "TEXT"}"><summary>展开查看内容</summary><pre class="artifact-text" data-artifact-text>展开后加载内容…</pre></details>`;
  }
  return `<article class="episode-artifact" data-stage="${escapeHtml(artifact.stage)}">
    <header><div><small>${escapeHtml(episodeStageLabels[artifact.stage] ?? artifact.stage)}</small><h5>${escapeHtml(artifact.title)}</h5></div><a href="${escapeHtml(artifact.url)}" download>下载</a></header>
    ${preview}
  </article>`;
}

function renderEpisodeWorkflows(media, world) {
  const episodes = media?.episodes ?? [];
  const canStart = Boolean(world.previewUrl);
  const controls = `<div class="episode-controls"><div><small>ONE WHITEBOX · TEN VISUAL WORLDS</small><h3>六个白膜起点 → 十种风格 → 六十段 Seedance 成片</h3><p>白膜世界、试玩和六段 30 秒视频只生成一次；十个视觉分支分别生成首帧、三视图，经独立 Codex 智能质检后再进入各自 Gemini 与 Seedance。</p></div><button type="button" data-start-episode ${canStart ? "" : "disabled"}>${canStart ? "运行十风格完整链路" : "白膜世界就绪后可运行"}</button></div>`;
  if (!episodes.length) return `${controls}<p class="media-empty">还没有十风格数据任务。运行后会先出现共享白膜，再逐风格展示样式首帧、三视图、Codex QA、Gemini Prompt 和最终视频。</p>`;
  return `${controls}<div class="episode-runs">${episodes.map((episode) => {
    const artifacts = episode.artifacts ?? [];
    const supplementalArtifacts = episode.playbackComparisons?.length
      ? artifacts.filter((artifact) => !isComparisonVideoArtifact(artifact))
      : artifacts;
    return `<section class="episode-run" data-episode-id="${escapeHtml(episode.episodeId)}">
      <header class="episode-run-heading"><div><small>${escapeHtml(episode.episodeId)}</small><h4>${episode.status === "succeeded" ? "完整链路已交付" : episode.status === "failed" ? "链路需要处理" : "链路正在运行"}</h4></div><span data-status="${escapeHtml(episode.status)}">${escapeHtml(episode.currentStage ? episodeStageLabels[episode.currentStage] ?? episode.currentStage : episode.status)}</span></header>
      <ol class="episode-stages">${(episode.stages ?? []).map((stage, index) => `<li data-status="${escapeHtml(stage.status)}"><b>${String(index + 1).padStart(2, "0")}</b><span>${escapeHtml(stage.title ?? episodeStageLabels[stage.id] ?? stage.id)}</span><small>${escapeHtml(stage.status)}</small></li>`).join("")}</ol>
      ${episode.error ? `<p class="episode-error">${escapeHtml(episode.error)}</p>` : ""}
      ${episode.running ? `<button type="button" class="text-button" data-stop-episode="${escapeHtml(episode.episodeId)}">停止这条数据任务</button>` : ""}
      ${renderStyleVariantReviews(episode)}
      ${renderEpisodeComparisons(episode)}
      <div class="episode-artifacts">${supplementalArtifacts.map(renderEpisodeArtifact).join("") || `<p class="media-empty">本阶段尚未落下其他可展示工件。</p>`}</div>
    </section>`;
  }).join("")}</div>`;
}

function wireEpisodeComparisonPlayers(root = dialogContent) {
  for (const panel of root.querySelectorAll("[data-episode-comparison]")) {
    if (panel.dataset.wired === "true") continue;
    panel.dataset.wired = "true";
    const videos = [...panel.querySelectorAll("[data-compare-video]")];
    const whitebox = panel.querySelector('[data-compare-video="whitebox"]');
    const finalVideo = panel.querySelector('[data-compare-video="final"]');
    const toggle = panel.querySelector("[data-compare-toggle]");
    const reset = panel.querySelector("[data-compare-reset]");
    const durationSeconds = Number(panel.dataset.durationSeconds) || 30;
    const globalStartSeconds = Number(panel.dataset.globalStartSeconds) || 0;
    const commandText = panel.dataset.commandText || "等待本段世界指令";
    let activations = [];
    try { activations = JSON.parse(panel.dataset.inputActivations || "[]"); } catch {}
    let promptEvents = [];
    try { promptEvents = JSON.parse(panel.dataset.promptEvents || "[]"); } catch {}
    const hasEventSecond = (value) => value !== null && value !== "" &&
      Number.isFinite(Number(value));
    let internalSync = false;
    let animationFrame = null;
    let lastDriftCorrectionAt = 0;

    if (whitebox) whitebox.muted = true;

    const currentTime = () => {
      const playing = videos.find((video) => !video.paused && !video.ended);
      return Math.max(0, Math.min(durationSeconds, Number(playing?.currentTime ?? finalVideo?.currentTime ?? whitebox?.currentTime ?? 0)));
    };
    const setPlayingState = () => {
      const playing = videos.some((video) => !video.paused && !video.ended);
      panel.dataset.playing = String(playing);
      if (toggle) toggle.textContent = playing ? "暂停同步对比" : "一键同步对比";
      const status = panel.querySelector("[data-compare-status]");
      if (status) status.textContent = videos.length < 2 ? "WAITING" : playing ? "PLAYING · SYNCED" : "PAUSED · SYNCED";
      return playing;
    };
    const renderState = () => {
      if (!panel.isConnected) {
        return false;
      }
      const seconds = currentTime();
      const active = activations.filter((activation) =>
        seconds >= Number(activation.startSeconds) && seconds < Number(activation.endSeconds));
      const activeKeys = new Set(active.flatMap((activation) => activation.keys ?? []));
      for (const key of panel.querySelectorAll("[data-input-key]")) {
        key.dataset.active = String(activeKeys.has(key.dataset.inputKey));
      }
      const summary = panel.querySelector("[data-input-summary]");
      if (summary) summary.textContent = activeKeys.size
        ? `激活：${[...activeKeys].map((key) => episodeInputKeyLabels[key] ?? key).join(" + ")}`
        : "当前无输入";
      const localTime = panel.querySelector("[data-local-time]");
      const globalTime = panel.querySelector("[data-global-time]");
      if (localTime) localTime.textContent = formatEpisodeSeconds(seconds);
      if (globalTime) globalTime.textContent = formatEpisodeSeconds(globalStartSeconds + seconds);
      const cursor = panel.querySelector("[data-input-cursor]");
      if (cursor) cursor.style.left = `${Math.max(0, Math.min(100, seconds / durationSeconds * 100))}%`;
      for (const promptPanel of panel.querySelectorAll("[data-prompt-event-index]")) {
        const event = promptEvents[Number(promptPanel.dataset.promptEventIndex)];
        const promptStatus = promptPanel.querySelector("[data-prompt-status]");
        if (!event || !hasEventSecond(event.startSeconds) || !promptStatus) continue;
        const startSeconds = Number(event.startSeconds);
        const endSeconds = hasEventSecond(event.endSeconds)
          ? Number(event.endSeconds)
          : startSeconds;
        const state = seconds < startSeconds
          ? "pending"
          : seconds <= endSeconds ? "active" : "complete";
        promptPanel.dataset.promptState = state;
        promptStatus.textContent = state === "pending"
          ? `等待 ${formatEpisodeSeconds(startSeconds)}`
          : state === "active" ? "Prompt 正在生效" : "Prompt 已执行";
      }
      const activePrompt = promptEvents.find((event) =>
        hasEventSecond(event.startSeconds) &&
        seconds >= Number(event.startSeconds) &&
        seconds <= Number(event.endSeconds));
      const nextPrompt = promptEvents.find((event) =>
        hasEventSecond(event.startSeconds) && seconds < Number(event.startSeconds));
      const visiblePrompt = activePrompt ?? nextPrompt ?? promptEvents.at(-1);
      const promptCommand = panel.querySelector("[data-prompt-command]");
      const worldCommand = panel.querySelector(".episode-world-command");
      const promptState = activePrompt ? "active" : nextPrompt ? "pending" : "complete";
      if (worldCommand) worldCommand.dataset.promptState = promptState;
      if (promptCommand && visiblePrompt) {
        promptCommand.textContent = activePrompt
          ? `正在执行：${visiblePrompt.commandText}`
          : nextPrompt
            ? `即将在 ${formatEpisodeSeconds(visiblePrompt.startSeconds)} 执行：${visiblePrompt.commandText}`
            : `已执行：${visiblePrompt.commandText}`;
      } else if (promptCommand) {
        promptCommand.textContent = commandText;
      }
      const now = performance.now();
      if (finalVideo && whitebox && finalVideo.readyState >= 2 && whitebox.readyState >= 2 &&
          !finalVideo.paused && !whitebox.paused && now - lastDriftCorrectionAt >= 500 &&
          Math.abs(finalVideo.currentTime - whitebox.currentTime) > .25) {
        internalSync = true;
        whitebox.currentTime = finalVideo.currentTime;
        internalSync = false;
        lastDriftCorrectionAt = now;
      }
      return setPlayingState();
    };
    const frameLoop = () => {
      animationFrame = null;
      if (renderState() && panel.isConnected) animationFrame = requestAnimationFrame(frameLoop);
    };
    const scheduleUpdate = () => {
      if (animationFrame === null) animationFrame = requestAnimationFrame(frameLoop);
    };
    const playTogether = async (anchor = finalVideo ?? whitebox) => {
      if (videos.length < 2) return;
      internalSync = true;
      for (const video of videos) {
        if (video.readyState === 0) {
          video.preload = "auto";
          video.load();
        }
      }
      const seconds = anchor?.ended ? 0 : Math.min(durationSeconds - .01, Number(anchor?.currentTime) || 0);
      for (const video of videos) if (Math.abs(video.currentTime - seconds) > .04) video.currentTime = seconds;
      const results = await Promise.allSettled(videos.map((video) => video.play()));
      internalSync = false;
      if (results.some((result) => result.status === "rejected")) {
        videos.forEach((video) => video.pause());
      }
      scheduleUpdate();
    };
    const pauseTogether = () => {
      internalSync = true;
      videos.forEach((video) => video.pause());
      internalSync = false;
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      animationFrame = null;
      renderState();
    };
    toggle?.addEventListener("click", () => {
      if (videos.some((video) => !video.paused && !video.ended)) pauseTogether();
      else void playTogether(finalVideo ?? whitebox);
    });
    reset?.addEventListener("click", () => {
      pauseTogether();
      internalSync = true;
      videos.forEach((video) => { video.currentTime = 0; });
      internalSync = false;
      renderState();
    });
    for (const video of videos) {
      video.addEventListener("play", () => {
        if (!internalSync) void playTogether(video);
        else scheduleUpdate();
      });
      video.addEventListener("pause", () => {
        if (!internalSync && videos.some((item) => !item.paused && !item.ended)) pauseTogether();
        else scheduleUpdate();
      });
      video.addEventListener("seeking", () => {
        if (internalSync) return;
        internalSync = true;
        for (const peer of videos) if (peer !== video) peer.currentTime = video.currentTime;
        internalSync = false;
        scheduleUpdate();
      });
      video.addEventListener("timeupdate", scheduleUpdate);
      video.addEventListener("loadedmetadata", scheduleUpdate, { once: true });
    }
    renderState();
  }
}

function wireEpisodeActions(world) {
  const start = dialogContent.querySelector("[data-start-episode]");
  if (start && start.dataset.wired !== "true") {
    start.dataset.wired = "true";
    start.addEventListener("click", async () => {
      start.disabled = true;
      start.textContent = "正在建立任务…";
      const response = await fetch("/api/episode-workflows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sceneId: world.sceneId, backend: worldCodexBackend(world) ?? "cloud" }),
      });
      const payload = await response.json();
      if (!response.ok) {
        start.textContent = payload.error ?? "建立任务失败";
        start.disabled = false;
        return;
      }
      await refreshDialog(world.id);
    });
  }
  for (const stop of dialogContent.querySelectorAll("[data-stop-episode]")) {
    if (stop.dataset.wired === "true") continue;
    stop.dataset.wired = "true";
    stop.addEventListener("click", async () => {
      stop.disabled = true;
      await fetch(`/api/episode-workflows/${encodeURIComponent(stop.dataset.stopEpisode)}/stop`, { method: "POST" });
      await refreshDialog(world.id);
    });
  }
  wireEpisodeComparisonPlayers();
}

function patchEpisodeWorkflows(media, world) {
  const container = dialogContent.querySelector("[data-live-episodes]");
  if (!container) return;
  replaceContentsPreservingDetails(container, renderEpisodeWorkflows(media, world));
  wireArtifactPreviews(container);
  wireEpisodeActions(world);
}

function applyLiveDetailUpdate(world, media) {
  const available = (media?.deliverables ?? []).filter((item) => item.status === "available").length;
  const coreStages = (media?.trajectory?.stages ?? []).filter((stage) => !stage.optional && stage.status !== "skipped");
  const complete = coreStages.filter((stage) => stage.status === "complete").length;
  const setText = (selector, value) => {
    const element = dialogContent.querySelector(selector);
    if (element) element.textContent = value;
  };
  setText("[data-live-status]", worldStatusLabel(world));
  setText("[data-live-stage]", stageLabel(world.stage, worldCodexBackend(world)));
  setText("[data-live-core-stages]", `${complete}/${coreStages.length}`);
  setText("[data-live-deliverables]", String(available));
  setText("[data-live-prototypes]", String(media?.prototypes?.length ?? 0));
  setText(
    "[data-live-total-duration]",
    formatDuration(media?.trajectory?.summary?.durationMs, media?.trajectory?.summary?.durationStatus),
  );
  setText(
    "[data-live-total-tokens]",
    formatTokenCount(media?.trajectory?.summary?.tokenCount, media?.trajectory?.summary?.tokenStatus),
  );
  setText("[data-live-updated-at]", formatDateTime(world.updatedAt));
  for (const stage of media?.trajectory?.stages ?? []) {
    for (const item of dialogContent.querySelectorAll(`[data-stage-id="${CSS.escape(stage.id)}"]`)) {
      item.dataset.status = stage.status;
      const label = item.querySelector("[data-stage-status]");
      if (label) label.textContent = trajectoryStatusLabels[stage.status] ?? stage.status;
      const duration = item.querySelector("[data-stage-duration]");
      if (duration) duration.textContent = formatDuration(stage.durationMs, stage.durationStatus);
      const tokens = item.querySelector("[data-stage-tokens]");
      if (tokens) tokens.textContent = formatTokenCount(stage.tokenCount, stage.tokenStatus);
      const delivered = (media?.deliverables ?? []).filter(
        (deliverable) => deliverable.phase === stage.id && deliverable.status === "available",
      ).length;
      const footer = item.querySelector("[data-stage-deliverables]");
      if (footer) footer.textContent = `${delivered} 个已交付工件`;
    }
  }
  return { available, complete, coreStageCount: coreStages.length };
}

function htmlElement(markup) {
  const template = document.createElement("template");
  template.innerHTML = markup.trim();
  return template.content.firstElementChild;
}

function replaceElementPreservingDetails(current, replacement) {
  const states = [...current.querySelectorAll("details")].map((details) => {
    const text = details.querySelector("[data-artifact-text]");
    return {
      open: details.open,
      loaded: text?.dataset.loaded === "true",
      text: text?.textContent ?? "",
      scrollTop: text?.scrollTop ?? 0,
    };
  });
  current.replaceWith(replacement);
  wireArtifactPreviews(replacement.parentElement ?? dialogContent);
  [...replacement.querySelectorAll("details")].forEach((details, index) => {
    const state = states[index];
    if (!state) return;
    const text = details.querySelector("[data-artifact-text]");
    if (text && state.loaded) {
      text.textContent = state.text;
      text.dataset.loaded = "true";
      text.scrollTop = state.scrollTop;
    }
    details.open = state.open;
  });
}

function replaceContentsPreservingDetails(container, markup) {
  const openStates = [...container.querySelectorAll("details")].map((details) => details.open);
  container.innerHTML = markup;
  [...container.querySelectorAll("details")].forEach((details, index) => {
    details.open = openStates[index] ?? false;
  });
}

function patchEventStream(media) {
  const container = dialogContent.querySelector("[data-live-events]");
  if (!container) return;
  const events = (media?.trajectory?.events ?? []).slice(-40);
  if (!events.length) return;
  let list = container.querySelector(".event-stream");
  if (!list) {
    container.innerHTML = renderEventStream(media);
    return;
  }
  const expected = new Set(events.map(eventKey));
  for (const item of list.querySelectorAll("[data-event-key]")) {
    if (!expected.has(item.dataset.eventKey)) item.remove();
  }
  const present = new Set([...list.querySelectorAll("[data-event-key]")].map((item) => item.dataset.eventKey));
  for (const event of events) {
    const key = eventKey(event);
    if (!present.has(key)) list.append(htmlElement(renderEventItem(event)));
  }
  const source = container.querySelector(".event-stream-heading small");
  if (source) source.textContent = media?.trajectory?.source === "reconstructed" ? "由历史工件恢复" : "任务运行时记录";
}

function patchDeliverables(media) {
  const container = dialogContent.querySelector("[data-live-deliverable-inventory]");
  if (!container) return;
  const deliverables = media?.deliverables ?? [];
  if (!container.querySelector(".deliverable-groups")) {
    container.innerHTML = renderDeliverables(media);
    wireArtifactPreviews(container);
  } else {
    for (const item of deliverables) {
      const list = [...container.querySelectorAll("[data-deliverable-phase]")]
        .find((candidate) => candidate.dataset.deliverablePhase === item.phase);
      if (!list) continue;
      const current = [...list.querySelectorAll("[data-deliverable-id]")]
        .find((candidate) => candidate.dataset.deliverableId === item.id);
      if (!current) {
        list.append(htmlElement(renderDeliverableItem(item)));
        continue;
      }
      const changed = current.dataset.status !== item.status
        || current.dataset.updatedAt !== (item.updatedAt ?? "")
        || current.dataset.url !== (item.url ?? "");
      if (changed) replaceElementPreservingDetails(current, htmlElement(renderDeliverableItem(item)));
    }
    const expected = new Set(deliverables.map((item) => item.id));
    for (const current of container.querySelectorAll("[data-deliverable-id]")) {
      if (!expected.has(current.dataset.deliverableId)) current.remove();
    }
  }
  for (const group of container.querySelectorAll(".deliverable-group")) {
    const phase = group.querySelector("[data-deliverable-phase]")?.dataset.deliverablePhase;
    const items = deliverables.filter((item) => item.phase === phase);
    const available = items.filter((item) => item.status === "available").length;
    const count = group.querySelector(":scope > header > span");
    if (count) count.textContent = `${available} / ${items.length}`;
  }
  wireArtifactPreviews(container);
}

function patchPlanningMedia(media) {
  const items = media?.planning ?? [];
  for (const container of dialogContent.querySelectorAll("[data-live-planning]")) {
    let gallery = container.querySelector(".planning-gallery");
    if (!gallery && items.length) {
      container.innerHTML = renderPlanningMedia(media);
      gallery = container.querySelector(".planning-gallery");
    }
    if (!gallery) continue;
    const expected = new Set(items.map((item) => item.kind));
    for (const current of gallery.querySelectorAll("[data-planning-kind]")) {
      if (!expected.has(current.dataset.planningKind)) current.remove();
    }
    for (const item of items) {
      const current = [...gallery.querySelectorAll("[data-planning-kind]")]
        .find((candidate) => candidate.dataset.planningKind === item.kind);
      if (!current) {
        gallery.append(htmlElement(renderPlanningItem(item)));
      } else if (current.dataset.planningUrl !== (item.url ?? "") || current.classList.contains("is-pending") === item.available) {
        replaceElementPreservingDetails(current, htmlElement(renderPlanningItem(item)));
      }
    }
  }
}

function patchPrototypeMedia(media) {
  const container = dialogContent.querySelector("[data-live-prototype-inventory]");
  if (!container) return;
  const prototypes = media?.prototypes ?? [];
  let gallery = container.querySelector(".prototype-gallery");
  if (!gallery && prototypes.length) {
    container.innerHTML = renderPrototypeMedia(media);
    gallery = container.querySelector(".prototype-gallery");
  }
  if (!gallery) return;
  const expected = new Set(prototypes.map((prototype) => prototype.id));
  for (const current of gallery.querySelectorAll("[data-prototype-id]")) {
    if (!expected.has(current.dataset.prototypeId)) current.remove();
  }
  for (const prototype of prototypes) {
    const signature = `${prototype.whiteboxUrl ?? ""}|${prototype.styledUrl ?? ""}`;
    const current = [...gallery.querySelectorAll("[data-prototype-id]")]
      .find((candidate) => candidate.dataset.prototypeId === prototype.id);
    if (!current) gallery.append(htmlElement(renderPrototypeItem(prototype)));
    else if (current.dataset.prototypeViews !== signature) {
      replaceElementPreservingDetails(current, htmlElement(renderPrototypeItem(prototype)));
    }
  }
}

function patchHelperMedia(media) {
  const container = dialogContent.querySelector("[data-live-helper-inventory]");
  if (!container) return;
  const helpers = media?.helpers ?? [];
  let gallery = container.querySelector(".helper-gallery");
  if (!gallery && helpers.length) {
    container.innerHTML = renderHelperMedia(media);
    gallery = container.querySelector(".helper-gallery");
  }
  if (!gallery) return;
  const expected = new Set(helpers.map((helper) => helper.id));
  for (const current of gallery.querySelectorAll("[data-helper-id]")) {
    if (!expected.has(current.dataset.helperId)) current.remove();
  }
  const present = new Set([...gallery.querySelectorAll("[data-helper-id]")].map((item) => item.dataset.helperId));
  for (const helper of helpers) {
    if (!present.has(helper.id)) gallery.append(htmlElement(renderHelperItem(helper)));
  }
}

function patchValidation(media) {
  const signature = JSON.stringify([media?.composition ?? null, media?.visualQa ?? null, media?.entryVerification ?? null]);
  for (const container of dialogContent.querySelectorAll("[data-live-validation]")) {
    if (container._validationSignature === signature) continue;
    replaceContentsPreservingDetails(container, renderValidation(media));
    container._validationSignature = signature;
  }
  for (const status of dialogContent.querySelectorAll("[data-live-composition]")) {
    status.replaceWith(htmlElement(renderCompositionStatus(media)));
  }
}

function patchRuntimeLog(media, log) {
  const details = dialogContent.querySelector(".runtime-log");
  const output = details?.querySelector("pre");
  if (!details || !output) return;
  const next = log || "任务尚未开始输出日志。";
  if (output.textContent !== next) {
    const wasAtBottom = output.scrollHeight - output.scrollTop - output.clientHeight < 24;
    const previousScrollTop = output.scrollTop;
    output.textContent = next;
    output.scrollTop = wasAtBottom ? output.scrollHeight : previousScrollTop;
  }
  const fullLogUrl = (media?.deliverables ?? []).find((item) => item.id === "agent-log" && item.url)?.url;
  let link = details.querySelector(".full-log-link");
  if (fullLogUrl && !link) {
    link = htmlElement(`<a class="full-log-link" href="${escapeHtml(fullLogUrl)}" download>下载完整原始日志</a>`);
    details.querySelector("summary")?.after(link);
  } else if (fullLogUrl && link) {
    link.href = fullLogUrl;
  }
}

function renderDialogActions(world) {
  const canRetry = ["failed", "interrupted"].includes(world.status);
  const canStop = ["queued", "running", "remote-pending", "visual-queued", "visual-running"].includes(world.status);
  const retryLabel = world.failedStage === "block-build"
    ? "从方块编译继续"
    : "重新生成";
  return `${world.previewUrl ? `<a href="${escapeHtml(world.previewUrl)}" target="worldkit-playground" rel="noreferrer">进入白膜世界 ↗</a>` : ""}
    ${canStop ? `<button type="button" class="stop-world">停止任务</button>` : ""}
    ${canRetry ? `<button type="button" id="retry-world">${retryLabel}</button>` : ""}`;
}

async function requestWorldStop(id, button) {
  if (!button || button.disabled) return;
  button.disabled = true;
  const previousLabel = button.textContent;
  button.textContent = "停止中…";
  try {
    const result = await fetch(`/api/worlds/${id}/stop`, { method: "POST" });
    const payload = await result.json();
    if (!result.ok) throw new Error(payload.error ?? "停止失败");
    await loadWorlds();
    if (state.selectedId === id && dialog.open) await refreshDialog(id);
  } catch (error) {
    button.textContent = error.message;
    button.disabled = false;
    setTimeout(() => {
      if (button.isConnected && !button.disabled) button.textContent = previousLabel;
    }, 2_000);
  }
}

function wirePlannerReviewAction(id) {
  for (const button of dialogContent.querySelectorAll("[data-planner-review]")) {
    if (button.dataset.wired === "true") continue;
    button.dataset.wired = "true";
    button.addEventListener("click", async () => {
      const status = button.dataset.plannerReview;
      if (!status || button.disabled) return;
      for (const candidate of dialogContent.querySelectorAll("[data-planner-review]")) {
        candidate.disabled = true;
      }
      const response = await fetch(`/api/worlds/${id}/planner-review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        const payload = await response.json();
        button.textContent = payload.error ?? "审核保存失败";
        button.disabled = false;
        return;
      }
      await loadWorlds();
      await refreshDialog(id);
    });
  }
}

function wireStopAction(id) {
  const stop = dialogContent.querySelector(".stop-world");
  if (!stop || stop.dataset.wired === "true") return;
  stop.dataset.wired = "true";
  stop.addEventListener("click", () => void requestWorldStop(id, stop));
}

function wireRetryAction(id) {
  const retry = dialogContent.querySelector("#retry-world");
  if (!retry || retry.dataset.wired === "true") return;
  retry.dataset.wired = "true";
  retry.addEventListener("click", async () => {
    retry.disabled = true;
    const result = await fetch(`/api/worlds/${id}/retry`, { method: "POST" });
    if (!result.ok) {
      const payload = await result.json();
      retry.textContent = payload.error ?? "重试失败";
      retry.disabled = false;
      return;
    }
    await loadWorlds();
    await refreshDialog(id);
  });
}

function patchWorldActions(world) {
  const actions = dialogContent.querySelector("[data-live-actions]");
  if (!actions || actions.dataset.status === world.status) return;
  actions.dataset.status = world.status;
  actions.innerHTML = renderDialogActions(world);
  wireRetryAction(world.id);
  wireStopAction(world.id);
}

function patchDetailCounts(world, media) {
  const available = (media?.deliverables ?? []).filter((item) => item.status === "available").length;
  const deliverableSummary = dialogContent.querySelector("[data-live-deliverable-summary]");
  if (deliverableSummary) deliverableSummary.textContent = `${available} / ${media?.deliverables?.length ?? 0} 可查看`;
  for (const count of dialogContent.querySelectorAll("[data-live-image-count]")) {
    count.textContent = `${media?.availableImageCount ?? 0} 张已生成`;
  }
  const entitySummary = dialogContent.querySelector("[data-live-entity-summary]");
  if (entitySummary) entitySummary.textContent = `${media?.prototypes?.length ?? 0} 视觉组 · ${media?.helpers?.length ?? 0} Helper`;
  const hero = dialogContent.querySelector(".dialog-hero");
  if (hero && hero.dataset.coverUrl !== (world.coverUrl ?? "")) {
    hero.dataset.coverUrl = world.coverUrl ?? "";
    let cover = hero.querySelector(":scope > img");
    if (world.coverUrl && !cover) {
      cover = document.createElement("img");
      cover.alt = "";
      hero.prepend(cover);
    }
    if (cover && world.coverUrl) cover.src = `${world.coverUrl}?t=${encodeURIComponent(world.updatedAt)}`;
    if (cover && !world.coverUrl) cover.remove();
  }
}

function applyIncrementalDetailUpdate(payload) {
  const { world, media, log } = payload;
  const main = dialogContent.querySelector(".detail-main");
  const previousScrollTop = main?.scrollTop ?? 0;
  const summary = applyLiveDetailUpdate(world, media);
  patchEventStream(media);
  patchDeliverables(media);
  patchPlanningMedia(media);
  patchPrototypeMedia(media);
  patchHelperMedia(media);
  patchValidation(media);
  patchEpisodeWorkflows(media, world);
  patchRuntimeLog(media, log);
  patchWorldActions(world);
  patchDetailCounts(world, media);
  state.detailAvailableCount = summary.available;
  state.detailRevision = detailRevision(world, media);
  if (main) main.scrollTop = previousScrollTop;
}

async function pollSelectedWorld() {
  if (!state.selectedId || !dialog.open || state.detailPollInFlight) return;
  state.detailPollInFlight = true;
  try {
    const response = await fetch(`/api/worlds/${state.selectedId}`, { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    const revision = detailRevision(payload.world, payload.media);
    if (revision !== state.detailRevision) applyIncrementalDetailUpdate(payload);
  } finally {
    state.detailPollInFlight = false;
  }
}

async function refreshDialog(id, suppliedPayload = null) {
  const previousScrollTop = dialogContent.querySelector(".detail-main")?.scrollTop ?? 0;
  let payload = suppliedPayload;
  if (!payload) {
    const response = await fetch(`/api/worlds/${id}`, { cache: "no-store" });
    if (!response.ok) return;
    payload = await response.json();
  }
  const { world, media, log } = payload;
  const deliverables = media?.deliverables ?? [];
  const availableDeliverables = deliverables.filter((item) => item.status === "available").length;
  const coreStages = (media?.trajectory?.stages ?? []).filter((stage) => !stage.optional && stage.status !== "skipped");
  const completeStages = coreStages.filter((stage) => stage.status === "complete").length;
  const fullLogUrl = deliverables.find((item) => item.id === "agent-log" && item.url)?.url;
  state.detailRevision = detailRevision(world, media);
  state.detailAvailableCount = availableDeliverables;
  const activeTab = state.detailTab;
  const panel = (id, html) => `<section class="detail-panel" data-detail-panel="${id}" ${activeTab === id ? "" : "hidden"}>${html}</section>`;
  dialogContent.innerHTML = `
    <div class="dialog-hero" data-cover-url="${escapeHtml(world.coverUrl ?? "")}">
      ${world.coverUrl ? `<img src="${escapeHtml(world.coverUrl)}?t=${encodeURIComponent(world.updatedAt)}" alt="" />` : ""}
      <div class="dialog-title">
        <p><span class="detail-status" data-live-status>${escapeHtml(worldStatusLabel(world))}</span>${escapeHtml(world.sceneId)}</p>
        <h2>${escapeHtml(world.title)}</h2>
        <span data-live-stage>${escapeHtml(stageLabel(world.stage, worldCodexBackend(world)))}</span>
      </div>
      <div class="dialog-hero-metrics">
        <div><b data-live-total-duration>${escapeHtml(formatDuration(media?.trajectory?.summary?.durationMs, media?.trajectory?.summary?.durationStatus))}</b><small>总历时</small></div>
        <div><b data-live-total-tokens>${escapeHtml(formatTokenCount(media?.trajectory?.summary?.tokenCount, media?.trajectory?.summary?.tokenStatus))}</b><small>总 Token</small></div>
        <div><b data-live-core-stages>${completeStages}/${coreStages.length}</b><small>核心阶段</small></div>
        <div><b data-live-deliverables>${availableDeliverables}</b><small>已交付工件</small></div>
        <div><b data-live-prototypes>${media?.prototypes?.length ?? 0}</b><small>完整视觉组</small></div>
      </div>
    </div>
    <div class="detail-layout">
      <aside class="detail-sidebar">
        <section><small>WORLD REQUEST</small><p>${escapeHtml(world.prompt)}</p><button class="text-button" id="copy-world-prompt" type="button">复制用户描述</button></section>
        <section class="detail-meta"><small>TASK INFO</small><dl><div><dt>创建时间</dt><dd>${escapeHtml(formatDateTime(world.createdAt))}</dd></div><div><dt>最近更新</dt><dd data-live-updated-at>${escapeHtml(formatDateTime(world.updatedAt))}</dd></div>${worldCodexBackend(world) ? `<div><dt>Codex 执行端</dt><dd>${escapeHtml(codexBackendLabel(worldCodexBackend(world)))}</dd></div>` : ""}<div><dt>尝试次数</dt><dd>${world.attempt}</dd></div><div><dt>轨迹来源</dt><dd>${media?.trajectory?.source === "recorded" ? "运行时记录" : "历史工件恢复"}</dd></div></dl></section>
        <section><small>PIPELINE AT A GLANCE</small>${renderTrajectory(media, true)}</section>
        ${world.error ? `<section class="detail-error"><small>NEEDS ATTENTION</small><p>${escapeHtml(world.error)}</p></section>` : ""}
        <div class="dialog-actions" data-live-actions data-status="${escapeHtml(world.status)}">${renderDialogActions(world)}</div>
      </aside>
      <main class="detail-main">
        <nav class="detail-tabs" aria-label="世界任务详情">
          ${[
            ["overview", "总览"],
            ["trajectory", "Agent 轨迹"],
            ["deliverables", "过程交付"],
            ["entities", "实体资产"],
            ["validation", "验收"],
            ["episodes", "六起点数据"],
          ].map(([tab, label]) => `<button type="button" data-detail-tab="${tab}" class="${activeTab === tab ? "active" : ""}">${label}</button>`).join("")}
        </nav>
        ${panel("overview", `
          <div class="panel-heading-large"><div><small>WORLD GENERATION OVERVIEW</small><h3>从需求到可玩白膜</h3></div>${renderCompositionStatus(media)}</div>
          <div class="overview-grid"><section><div class="section-title"><span>CORE PIPELINE</span><h4>当前生成进度</h4></div>${renderTrajectory(media)}</section><section><div class="section-title"><span>VERIFICATION</span><h4>运行验收</h4></div><div data-live-validation>${renderValidation(media)}</div></section></div>
          <section class="output-section"><div class="output-heading"><div><small>KEY VISUAL OUTPUTS</small><h3>参考、规划与真实白膜</h3></div><span data-live-image-count>${media?.availableImageCount ?? 0} 张已生成</span></div>${renderPlannerReview(media)}<div data-live-planning>${renderPlanningMedia(media)}</div></section>
        `)}
        ${panel("trajectory", `
          <div class="panel-heading-large"><div><small>AUDITABLE EXECUTION TRAJECTORY</small><h3>Agent 执行轨迹</h3></div><span>展示可观察动作与工具输出，不展示隐藏思维链</span></div>
          <div class="trajectory-layout"><section>${renderTrajectory(media)}</section><section><div data-live-events>${renderEventStream(media)}</div></section></div>
          <details class="runtime-log" ${["running", "remote-pending"].includes(world.status) ? "open" : ""}><summary>查看${escapeHtml(codexBackendLabel(worldCodexBackend(world)))} Agent / Host 日志预览</summary>${fullLogUrl ? `<a class="full-log-link" href="${escapeHtml(fullLogUrl)}" download>下载完整原始日志</a>` : ""}<pre>${escapeHtml(log || "任务尚未开始输出日志。")}</pre></details>
        `)}
        ${panel("deliverables", `
          <div class="panel-heading-large"><div><small>PROCESS DELIVERABLE INVENTORY</small><h3>全过程交付物</h3></div><span data-live-deliverable-summary>${availableDeliverables} / ${deliverables.length} 可查看</span></div>
          <div data-live-deliverable-inventory>${renderDeliverables(media)}</div>
          <section class="output-section"><div class="output-heading"><div><small>PLANNING IMAGE DETAILS</small><h3>规划图片与对应 Prompt</h3></div>${renderCompositionStatus(media)}</div>${renderPlannerReview(media)}<div data-live-planning>${renderPlanningMedia(media)}</div></section>
        `)}
        ${panel("entities", `
          <div class="panel-heading-large"><div><small>VISUAL GROUPS & COMPARISON SHEETS</small><h3>完整视觉组与结构辅助</h3></div><span data-live-entity-summary>${media?.prototypes?.length ?? 0} 视觉组 · ${media?.helpers?.length ?? 0} Helper</span></div>
          <section class="output-section first-output"><div class="output-heading"><div><small>IDENTITY-CRITICAL</small><h3>强一致性主体与视觉标志物</h3></div><span>有颜色 · 有 Prompt · 有三视图</span></div><div data-live-prototype-inventory>${renderPrototypeMedia(media)}</div></section>
          <section class="output-section"><div class="output-heading"><div><small>STRUCTURAL HELPERS</small><h3>基础碰撞与地形辅助</h3></div><span>无颜色 · 无三视图</span></div><div data-live-helper-inventory>${renderHelperMedia(media)}</div></section>
        `)}
        ${panel("validation", `
          <div class="panel-heading-large"><div><small>RUNTIME VERIFICATION</small><h3>构图与进入视角验收</h3></div>${renderCompositionStatus(media)}</div>
          <div data-live-validation>${renderValidation(media)}</div>
          ${world.error ? `<section class="validation-error"><small>失败原因</small><p>${escapeHtml(world.error)}</p></section>` : ""}
        `)}
        ${panel("episodes", `
          <div data-live-episodes>${renderEpisodeWorkflows(media, world)}</div>
        `)}
      </main>
    </div>`;
  wireArtifactPreviews();
  wireEpisodeActions(world);
  for (const tab of dialogContent.querySelectorAll("[data-detail-tab]")) {
    tab.addEventListener("click", () => {
      state.detailTab = tab.dataset.detailTab;
      dialogContent.querySelectorAll("[data-detail-tab]").forEach((item) => item.classList.toggle("active", item === tab));
      dialogContent.querySelectorAll("[data-detail-panel]").forEach((item) => { item.hidden = item.dataset.detailPanel !== state.detailTab; });
      dialogContent.querySelector(".detail-main")?.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
  dialogContent.querySelector("#copy-world-prompt")?.addEventListener("click", async (event) => {
    await navigator.clipboard.writeText(world.prompt);
    event.currentTarget.textContent = "已复制";
  });
  wireRetryAction(id);
  wireStopAction(id);
  wirePlannerReviewAction(id);
  const pre = dialogContent.querySelector(".runtime-log pre");
  if (pre) pre.scrollTop = pre.scrollHeight;
  if (previousScrollTop > 0) {
    requestAnimationFrame(() => {
      const main = dialogContent.querySelector(".detail-main");
      if (main) main.scrollTop = previousScrollTop;
    });
  }
}

async function openWorld(id) {
  state.selectedId = id;
  state.detailTab = "overview";
  await refreshDialog(id);
  if (!dialog.open) dialog.showModal();
}

for (const button of document.querySelectorAll("[data-workspace-mode]")) {
  button.addEventListener("click", () => setWorkspaceMode(button.dataset.workspaceMode));
}
for (const link of document.querySelectorAll('a[href="#create"], a[href="#test-sets"], a[href="#seedance-review"]')) {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    setWorkspaceMode(link.getAttribute("href").slice(1));
  });
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

document.querySelector("#test-set-file-trigger").addEventListener("click", () => testSetFiles.click());
document.querySelector("#test-set-folder-trigger").addEventListener("click", () => testSetFolder.click());
testSetFiles.addEventListener("change", () => {
  addTestSetFiles(testSetFiles.files);
  testSetFiles.value = "";
});
testSetFolder.addEventListener("change", () => {
  addTestSetFiles(testSetFolder.files);
  testSetFolder.value = "";
});

document.querySelector("#case-dialog-close").addEventListener("click", () => caseDialog.close());
document.querySelector("#case-dialog-cancel").addEventListener("click", () => caseDialog.close());
caseFilterHumanoidWalking.addEventListener("click", () => {
  const testSet = state.testSets.find(({ id }) => id === state.casePickerTestSetId);
  if (!testSet) return;
  if (state.casePickerFilter === "humanoid-walking") {
    state.casePickerFilter = "all";
  } else {
    state.casePickerFilter = "humanoid-walking";
  }
  updateCasePickerSelection();
});
document.querySelector("#case-select-all").addEventListener("click", () => {
  const testSet = state.testSets.find(({ id }) => id === state.casePickerTestSetId);
  state.casePickerFilter = "all";
  state.casePickerDraft = new Set((testSet?.images ?? [])
    .filter(({ runnable }) => runnable !== false)
    .map(({ id }) => id));
  updateCasePickerSelection();
});
document.querySelector("#case-clear-all").addEventListener("click", () => {
  state.casePickerDraft.clear();
  updateCasePickerSelection();
});
document.querySelector("#case-dialog-confirm").addEventListener("click", () => {
  if (!state.casePickerTestSetId || state.casePickerDraft.size === 0) return;
  state.selectedTestCases.set(state.casePickerTestSetId, new Set(state.casePickerDraft));
  caseDialog.close();
  updateTestSetSelection();
});
caseDialog.addEventListener("click", (event) => {
  if (event.target === caseDialog) caseDialog.close();
});

testSetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.testSetFiles.length === 0) {
    showTestSetMessage("请先选择至少一张测试图片。", true);
    return;
  }
  testSetSave.disabled = true;
  try {
    showTestSetMessage("正在创建测试集……");
    const createResponse = await fetch("/api/test-sets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: testSetName.value, prompt: testSetPrompt.value }),
    });
    const created = await createResponse.json();
    if (!createResponse.ok) throw new Error(created.error ?? "测试集创建失败");
    const testSet = created.testSet;
    for (let index = 0; index < state.testSetFiles.length; index += 1) {
      const item = state.testSetFiles[index];
      showTestSetMessage(`正在导入 ${index + 1} / ${state.testSetFiles.length}：${item.file.name}`);
      const dataUrl = await fileToDataUrl(item.file);
      const uploadResponse = await fetch(`/api/test-sets/${testSet.id}/images`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: { name: item.file.name, dataUrl } }),
      });
      const uploaded = await uploadResponse.json();
      if (!uploadResponse.ok) throw new Error(uploaded.error ?? `${item.file.name} 导入失败`);
    }
    for (const item of state.testSetFiles) URL.revokeObjectURL(item.previewUrl);
    state.testSetFiles = [];
    testSetForm.reset();
    renderPendingTestImages();
    showTestSetMessage(`“${testSet.name}”已保存，请选择本次要运行的 case。`);
    await loadTestSets();
    openCasePicker(testSet.id);
  } catch (error) {
    showTestSetMessage(error.message, true);
    await loadTestSets();
  } finally {
    testSetSave.disabled = false;
  }
});

runSelectedTestSets.addEventListener("click", async () => {
  const selected = state.testSets
    .map((testSet) => ({ testSet, imageIds: [...selectedCasesFor(testSet.id)] }))
    .filter(({ imageIds }) => imageIds.length > 0);
  if (selected.length === 0 || !state.codexAvailable) return;
  const requestedBackend = state.codexBackend;
  state.runningTestSets = true;
  syncCodexBackendUi();
  let createdWorlds = 0;
  try {
    for (let index = 0; index < selected.length; index += 1) {
      const { testSet, imageIds } = selected[index];
      selectedTestCount.textContent = `正在启动 ${index + 1} / ${selected.length}：${testSet.name}（${imageIds.length} 个 case）`;
      const response = await fetch(`/api/test-sets/${testSet.id}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageIds }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? `${testSet.name} 启动失败`);
      createdWorlds += payload.worlds?.length ?? 0;
    }
    showTestSetMessage(`已按${codexBackendLabel(requestedBackend)}创建 ${createdWorlds} 个世界任务；每个任务已固定执行端。`);
    state.filter = "running";
    document.querySelectorAll(".filters button").forEach((button) => button.classList.toggle("active", button.dataset.filter === "running"));
    await Promise.all([loadTestSets(), loadWorlds()]);
    document.querySelector("#history")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    showTestSetMessage(error.message, true);
  } finally {
    state.runningTestSets = false;
    updateTestSetSelection();
    syncCodexBackendUi();
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.codexAvailable) {
    showMessage(`${codexBackendLabel(state.codexBackend)}当前不可用，请先选择可用的执行端。`, true);
    return;
  }
  const requestedBackend = state.codexBackend;
  state.submittingWorld = true;
  syncCodexBackendUi();
  showMessage(`正在通过${codexBackendLabel(requestedBackend)}创建任务并写入历史……`);
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
    showMessage(`“${payload.world.title}”已进入${codexBackendLabel(worldCodexBackend(payload.world) ?? requestedBackend)}队列。执行端已固定，可以离开页面。`);
    state.filter = "all";
    document.querySelectorAll(".filters button").forEach((button) => button.classList.toggle("active", button.dataset.filter === "all"));
    await loadWorlds();
    await openWorld(payload.world.id);
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    state.submittingWorld = false;
    syncCodexBackendUi();
  }
});

for (const button of codexBackendButtons) {
  button.addEventListener("click", () => void selectCodexBackend(button.dataset.codexBackend));
}

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
dialog.addEventListener("close", () => {
  state.selectedId = null;
  state.detailRevision = null;
});

const initialWorkspaceMode = publicSeedanceMode
  ? "seedance-review"
  : location.hash === "#test-sets"
  ? "test-sets"
  : location.hash === "#seedance-review" ? "seedance-review" : "create";
setWorkspaceMode(initialWorkspaceMode, false);
syncCodexBackendUi();
await Promise.all([
  loadHealth(),
  loadSeedanceReviews(),
  initialWorkspaceMode === "seedance-review" ? Promise.resolve() : loadWorlds(),
  initialWorkspaceMode === "test-sets" ? loadTestSets() : Promise.resolve(),
  initialWorkspaceMode === "create" ? loadSubjectCatalog() : Promise.resolve(),
]);
setInterval(() => void loadHealth(), 5_000);
setInterval(() => {
  if (state.workspaceMode !== "seedance-review") void loadWorlds();
}, 5_000);
setInterval(() => void pollSelectedWorld(), 2_500);
setInterval(() => {
  if (state.workspaceMode === "test-sets") void loadTestSets();
}, 8_000);
setInterval(() => void loadSeedanceReviews(), 15_000);
window.addEventListener("pagehide", () => disposeEpisodeComparisonMedia(seedanceReviewDetail));
