// Read-only evaluation center. Studio-style trajectories use actual Host events;
// result readiness, active playback and human feedback retain separate owners.
import { SharedReviews, reviewSummary } from './reviews.mjs';
const $ = (id) => document.getElementById(id);
const labels = { cancelled: "已终止", stopping: "正在终止", ready: "可试玩", issues: "可试玩 · 有问题", running: "运行中", queued: "等待执行", submitted: "已提交", starting: "等待 Agent 启动", verifying: "产物同步中", delivered: "产物同步中", failed: "失败", unknown: "待确认" };
const stages = { cancelled: "已终止", stopping: "正在终止", queued: "等待执行", "awaiting-agent": "请求已提交 · 等待 Agent 启动", starting: "启动 Agent", planning: "整体地图规划", authoring: "编写与校验", preview: "预览与检查", playtest: "实际操作测试", capture: "采集对象视图", packaging: "整理交付", delivered: "技术交付完成", failed: "执行失败", unknown: "等待可确认状态" };
const toolStatusLabels = { succeeded: "调用完成", failed: "未通过", running: "进行中", queued: "等待中", completed: "已返回" };
function operationDetail(p) {
  const op = p?.toolSummary?.latestOperation;
  if (p?.failure?.message)
    return p.failure.message;
  if (op?.progress && finite(op.progress.elapsedSeconds) && finite(op.progress.requestedSeconds))
    return `${op.progress.elapsedSeconds.toFixed(1)} / ${op.progress.requestedSeconds.toFixed(1)} 秒 · 第 ${(op.progress.stepIndex ?? 0) + 1} 步`;
  if (op?.type)
    return `${op.type} · ${toolStatusLabels[op.status] || op.status || "已观测"}`;
  return p?.toolSummary?.latestTool || (p?.lastObservedAt ? `观测于 ${formatTime(p.lastObservedAt)}` : "等待观测记录");
}
const phaseOrder = ["starting", "planning", "authoring", "preview", "playtest", "capture", "packaging", "delivered"];
let data, progress, selectedId, activeTab = "process", artifactKey = "", pendingRefresh = false, lastFetchAt = null, progressUnavailable = false, lastRefreshFailed = false;
let resumePlayerOnReturn = false, activePlayer = null;
let feedbackContext = '';
const sharedReviews = new SharedReviews(() => { drawCards(); renderFeedback(); });
const isDelivered = (c) => !c?.recoveredDelivery && Boolean(c?.playable) && (["ready", "issues"].includes(c.status) || c.deliveryStatus === "ready");
const isRecovered = (c) => c?.recoveredDelivery?.kind === "three-creator-recovered-delivery" && c.recoveredDelivery.status === "artifact-verified" && Boolean(c.playable);
const runnableCheckpoint = (c) => c?.checkpoint?.kind === "three-creator-checkpoint" && c.checkpoint.status === "runnable" && c.checkpoint.playable ? c.checkpoint : null;
function availableArtifacts(c) {
  if (isDelivered(c)) return { ...c, intermediate: false };
  if (isRecovered(c)) return { ...c, intermediate: false, recovered: true };
  const checkpoint = runnableCheckpoint(c);
  return checkpoint ? { ...checkpoint, opening: checkpoint.preview, intermediate: true } : { ...c, playable: null, intermediate: false };
}
const isPlayable = (c) => Boolean(availableArtifacts(c).playable);
const shortHash = (hash) => typeof hash === "string" ? hash.slice(0, 8) : "未知版本";
const previewLabels = { opening: "首帧", current: "当前视角", "top-down": "俯视图", "entity-triview": "对象三视图" };
const el = (tag, text, className) => {
  const n = document.createElement(tag);
  if (text !== void 0)
    n.textContent = text;
  if (className)
    n.className = className;
  return n;
};
const finite = (n) => typeof n === "number" && Number.isFinite(n);
const timeMs = (x) => x && Number.isFinite(Date.parse(x)) ? Date.parse(x) : null;
const formatTime = (x) => timeMs(x) === null ? "时间未提供" : new Date(x).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
function duration(seconds) {
  if (!finite(seconds))
    return "—";
  seconds = Math.max(0, Math.floor(seconds));
  return seconds >= 3600 ? `${Math.floor(seconds / 3600)}时 ${Math.floor(seconds % 3600 / 60)}分` : `${Math.floor(seconds / 60)}分 ${String(seconds % 60).padStart(2, "0")}秒`;
}
function sourceUrl(relative) {
  const u = new URL(relative, location.href);
  if (u.origin !== location.origin || !u.pathname.startsWith("/creator-evals/"))
    throw new Error("Invalid artifact URL");
  return u.href;
}
function picture(relative, alt, className) {
  const n = el("img", void 0, className);
  n.src = sourceUrl(relative);
  n.alt = alt;
  n.loading = "lazy";
  return n;
}
function badge(status, text) {
  return el("span", text || labels[status] || status, `badge ${status}`);
}
function currentProgress(id) {
  return progress?.runId === data?.id ? progress.cases?.find((c) => c.taskId === id) : null;
}
function caseStatus(c, p = currentProgress(c.id)) {
  if (isDelivered(c))
    return ["ready", "issues"].includes(c.status) ? c.status : "ready";
  const phase = p?.phase;
  if (["cancelled", "stopped"].includes(phase)) return "cancelled";
  if (phase === "stop-pending") return "stopping";
  if (["delivered", "completed", "succeeded"].includes(phase))
    return "verifying";
  if (["submitted", "reserved", "not-started"].includes(phase))
    return p?.startedAt ? "running" : "queued";
  return ["running", "queued", "starting", "failed", "unknown"].includes(phase) ? phase : c.status;
}
function elapsed(p) {
  if (!p)
    return null;
  const starts = (p.attempts || []).map((a) => timeMs(a.submittedAt)).filter((t) => t !== null);
  const start = starts.length ? Math.min(...starts) : timeMs(p.submittedAt), end = timeMs(p.completedAt);
  if (start !== null)
    return ((end ?? Date.now()) - start) / 1e3;
  return p.elapsedSeconds ?? null;
}
function activeElapsed(p) {
  const start = timeMs(p?.startedAt), end = timeMs(p?.completedAt);
  return start === null ? null : ((end ?? Date.now()) - start) / 1e3;
}
function activity(p, c) {
  if (isDelivered(c))
    return "产物已就绪";
  if (!p)
    return c.status === "failed" ? "查看已记录的问题" : "等待过程状态";
  const stage = p.stageLabel || stages[p.stage] || labels[p.phase] || "等待可确认状态";
  return p.continuation ? `从已有工程继续 · ${!p.jobId && !p.submittedAt ? "等待投递" : stage}` : stage;
}
function attemptCount(p) {
  return p?.attempts?.length ? p.attempts.filter(a => a.jobId || a.submittedAt).length : p?.jobId || p?.submittedAt ? 1 : null;
}
function continuationDetail(value) {
  return `从已有工程继续 · 第 ${value.attemptNumber} / ${value.maximumModelAttempts} 次模型尝试 · 来源 ${shortHash(value.sourceHash)}（${value.sourceKind === "progress" ? "开发进度，尚未验证" : "可运行版本"}）`;
}
function previewCount(p) {
  const count = p?.toolSummary?.counts?.world_preview ?? p?.toolSummary?.completedMcpCalls?.world_preview;
  return Number.isInteger(count) && count >= 0 ? count : null;
}
function processMetrics(p) {
  metrics($("process-metrics"), [[duration(elapsed(p)), "总耗时"], [duration(p?.queueSeconds), "启动等待"], [duration(activeElapsed(p)), "Agent 执行"], [attemptCount(p) === null ? "—" : `${attemptCount(p)} 次`, "任务投递"], [previewCount(p) === null ? "—" : `${previewCount(p)} 次`, "本次预览调用"], [p?.lastObservedAt ? formatTime(p.lastObservedAt) : "—", "最近观测"]]);
}
function metrics(node, values) {
  node.replaceChildren(...values.map(([value, label]) => {
    const n = el("div", void 0, "metric");
    n.append(el("strong", value), el("span", label));
    return n;
  }));
}
function renderCoverage(c) {
  const coverage = c.evaluation;
  $("case-coverage").hidden = !coverage;
  $("coverage-content").replaceChildren();
  if (!coverage) return;
  for (const [key, label] of [["actions", "覆盖动作"], ["sceneRequirements", "触发与场景条件"], ["checks", "检查目标"]]) {
    const values = coverage[key] || [];
    if (!values.length) continue;
    const section = el("section"), list = el("ul");
    section.append(el("h3", label));
    list.append(...values.map(value => el("li", value)));
    section.append(list);
    $("coverage-content").append(section);
  }
}
function setConnection() {
  const active = (progress?.cases || []).filter((c) => (c.jobId || c.submittedAt) && ["running", "starting", "submitted", "queued", "unknown"].includes(c.phase));
  const observed = active.map((c) => timeMs(c.lastObservedAt) ?? timeMs(c.submittedAt));
  const seen = progress ? active.length ? observed.every((t) => t !== null) ? Math.min(...observed) : null : timeMs(progress.updatedAt) : timeMs(data?.updatedAt);
  const age = seen === null ? null : (Date.now() - seen) / 1e3;
  const needsUpdates = (progress?.cases || []).some(c => !["delivered", "failed", "cancelled", "stopped"].includes(c.phase));
  const stale = lastRefreshFailed || !lastFetchAt || needsUpdates && (age === null || age > 90);
  $("connection").classList.toggle("stale", stale);
  $("connection").lastElementChild.textContent = lastRefreshFailed ? "更新连接中断" : stale ? "状态更新延迟" : progressUnavailable ? "产物视图 · 过程未连接" : "状态已连接";
  $("updated").textContent = seen === null ? "暂无更新时间" : `最近观测 ${formatTime(new Date(seen).toISOString())}`;
}
function drawSummary() {
  if (!data)
    return;
  const rows = data.cases.map((c) => caseStatus(c));
  const values = [[data.cases.length, "本轮任务", ""], [rows.filter((s) => s === "running").length, "Agent 执行中", "running"], [rows.filter((s) => ["queued", "submitted", "starting", "unknown"].includes(s)).length, "等待执行 / 启动", ""], [rows.filter((s) => s === "verifying").length, "产物同步中", ""], [data.cases.filter(isPlayable).length, "可试玩", "ready"], [rows.filter((s) => ["failed", "issues"].includes(s)).length, "生产异常", "failed"]];
  $("run-stats").replaceChildren(...values.map(([n, label, kind]) => {
    const card = el("div", void 0, `stat ${kind}`);
    card.append(el("strong", n), el("span", label));
    return card;
  }));
  $("evaluation-title").textContent = data.title || "云端生成评测";
  $("evaluation-description").textContent = data.description || "查看场景的生成过程、交付物与试玩结果。";
  $("run-meta").replaceChildren(...[progress?.model ? `配置模型 · ${progress.model}` : "模型配置待确认", (progress?.reasoningEffort || progress?.effort) ? `配置推理 · ${progress.reasoningEffort || progress.effort}` : "推理配置待确认", data.suite === "sdk-only" ? "Three SDK" : "参考图生成", `${data.cases.length} 个 case`, data.sourceIdentity?.branch, data.id].filter(Boolean).map((t) => el("span", t, "meta-chip")));
  $("run-source").textContent = JSON.stringify(data.sourceIdentity || {}, null, 2);
  $("run-history").replaceChildren(...(data.historyRuns || []).map((run) => {
    const a = el("a", `↗ ${run.label}`);
    a.href = sourceUrl(run.href);
    return a;
  }));
  $("footer-run").textContent = data.id;
  $("task-count").textContent = `${data.cases.length} 个`;
  setConnection();
}
function drawCards() {
  if (!data)
    return;
  if ($('cases').contains(document.activeElement) && document.activeElement.matches('select')) return;
  const query = $("search").value.trim().toLowerCase(), filter = $("status-filter").value, reviewFilter = $('review-filter').value;
  const cases = data.cases.filter((c) => {
    const s = caseStatus(c);
    const build = availableArtifacts(c).worldBuildHash;
    const summary = reviewSummary(sharedReviews.list(c.id, build));
    const matchesReview = reviewFilter === 'all' || reviewFilter === summary.status || reviewFilter === 'mine-pending' && !sharedReviews.mine(c.id, build).verdict;
    return matchesReview && (!query || `${c.id} ${c.title} ${(c.evaluation?.actions || []).join(" ")}`.toLowerCase().includes(query)) && (filter === "all" || filter === "active" && ["running", "queued", "starting", "submitted", "unknown"].includes(s) || filter === "playable" && isPlayable(c) || filter === "failed" && ["failed", "issues"].includes(s));
  });
  $("empty-list").hidden = cases.length > 0;
  const frag = document.createDocumentFragment();
  for (const c of cases) {
    const p = currentProgress(c.id), s = caseStatus(c), tr = el("tr");
    tr.dataset.caseId = c.id;
    tr.setAttribute("aria-selected", String(c.id === selectedId));
    tr.tabIndex = 0;
    const name = el("td"), cell = el("div", void 0, "case-cell"), copy = el("div", void 0, "case-copy");
    copy.append(el("strong", c.title), el("small", c.baseCaseId || c.id));
    if (c.evaluation?.actions?.length) copy.append(el("small", c.evaluation.actions.join(" · "), "case-actions"));
    cell.append(picture(c.reference, c.title), copy);
    name.append(cell);
    const state = el("td");
    state.append(badge(s));
    const current = el("td");
    current.append(el("span", activity(p, c), "activity-title"), el("span", operationDetail(p), "activity-detail"));
    const timing = el("td", duration(elapsed(p)), "duration"), attempt = el("td"), artifacts = el("td");
    attempt.append(el("span", attemptCount(p) === null ? "投递次数未知" : `${attemptCount(p)} 次投递`, "activity-title"), el("small", previewCount(p) === null ? "预览次数未知" : `本次预览 ${previewCount(p)} 次`, "activity-detail"));
    const a = availableArtifacts(c);
    if (a.playable) {
      const play = el('a', '试玩 ↗', 'row-play');
      const url = new URL(sourceUrl(a.playable)); url.searchParams.set('play', '1');
      play.href = url.href; play.target = '_blank'; play.rel = 'noopener'; play.setAttribute('aria-label', `试玩 ${c.title}`);
      play.onclick = e => e.stopPropagation(); artifacts.append(play);
      if (a.intermediate) artifacts.append(el('small', '中间版本', 'activity-detail'));
      else if (a.video || a.triviews?.length) {
        const more = el('button', [a.video && '录像', a.triviews?.length && '三视图'].filter(Boolean).join(' / '), 'row-output'); more.type = 'button';
        more.onclick = e => { e.stopPropagation(); select(c.id, true); switchTab('outputs'); }; artifacts.append(more);
      }
    } else artifacts.append(el('span', s === 'verifying' ? '正在同步' : '等待交付', 'artifact-count'));
    tr.append(name, state, current, timing, attempt, artifacts, reviewCell(c));
    tr.onclick = () => select(c.id, true);
    tr.onkeydown = (e) => {
      if (e.target !== tr) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        select(c.id, true);
      }
    };
    frag.append(tr);
  }
  $("cases").replaceChildren(frag);
  drawSummary();
}

function reviewCell(c) {
  const cell = el('td', undefined, 'review-cell'), a = availableArtifacts(c), rows = sharedReviews.list(c.id, a.worldBuildHash), summary = reviewSummary(rows);
  cell.onclick = e => e.stopPropagation();
  const label = el('button', summary.label, `review-badge ${summary.status}`); label.type = 'button';
  label.onclick = () => { select(c.id, true); switchTab('review'); };
  cell.append(label);
  if (rows.length) cell.append(el('small', `${summary.passed} 通过 · ${summary.failed} 不通过`, 'review-counts'));
  const choice = el('select'); choice.setAttribute('aria-label', `评价 ${c.title}`);
  for (const [value, text] of [['', '我的：未评价'], ['pass', '我的：通过'], ['fail', '我的：不通过']]) { const option = el('option', text); option.value = value; choice.append(option); }
  choice.value = sharedReviews.mine(c.id, a.worldBuildHash).verdict || '';
  choice.disabled = !a.playable || !a.worldBuildHash || !sharedReviews.reviewer;
  choice.title = !a.playable ? '等待可玩世界' : !sharedReviews.reviewer ? '请先填写上方标注人姓名' : '选择后自动保存';
  choice.onchange = () => { const verdict = choice.value; choice.blur(); sharedReviews.change(c.id, a.worldBuildHash, { ...sharedReviews.mine(c.id, a.worldBuildHash), verdict }); };
  choice.onblur = () => setTimeout(drawCards, 0);
  cell.append(choice);
  const draft = sharedReviews.drafts[sharedReviews.key(c.id, a.worldBuildHash)];
  if (draft) cell.append(el('small', sharedReviews.state(c.id, a.worldBuildHash), 'review-save-state'));
  return cell;
}

function feedbackTarget() {
  const c = data?.cases.find(c => c.id === selectedId);
  return c && { c, a: activePlayer?.caseId === selectedId ? activePlayer : availableArtifacts(c) };
}
function renderFeedback() {
  const profile = sharedReviews.reviewer;
  if (document.activeElement !== $('reviewer-name') && profile) $('reviewer-name').value = profile.displayName;
  $('reviewer-save').textContent = profile ? '更新姓名' : '开始标注';
  $('review-connection').textContent = sharedReviews.connected ? profile ? `${profile.displayName} · 共享评价已连接` : '填写姓名后开始标注' : '共享服务未连接 · 待保存内容会保留';
  $('review-connection').classList.toggle('offline', !sharedReviews.connected);
  const target = feedbackTarget(); if (!target) return;
  const { c, a } = target, mine = sharedReviews.mine(c.id, a.worldBuildHash), context = sharedReviews.key(c.id, a.worldBuildHash);
  const editing = $('review').contains(document.activeElement);
  if (context !== feedbackContext || !editing) {
    for (const name of ['verdict', 'fidelity', 'playability', 'bugs', 'notes']) $('review').elements[name].value = mine[name] || '';
    feedbackContext = context;
  }
  for (const field of $('review').querySelectorAll('select,textarea')) field.disabled = !profile || !a.worldBuildHash || !a.playable;
  $('review-version').textContent = a.worldBuildHash ? `评价构建 ${shortHash(a.worldBuildHash)}${a.intermediate ? ' · 中间版本' : ''}${activePlayer?.caseId === c.id ? ' · 当前打开的游玩版本' : ''}` : '有可玩世界后即可评价。';
  $('save-status').textContent = sharedReviews.state(c.id, a.worldBuildHash);
  const draft = sharedReviews.drafts[context]; $('review-conflict').hidden = !draft?.conflict;
  if (draft?.conflict) {
    const note = el('span', '此记录已被另一窗口更新。你的草稿仍保留。'); $('review-conflict').replaceChildren(note);
    if (draft.conflict.current) for (const [text, keep] of [['保留我的修改', true], ['使用云端记录', false]]) {
      const button = el('button', text, 'secondary'); button.type = 'button'; button.onclick = () => { feedbackContext = ''; sharedReviews.resolve(c.id, a.worldBuildHash, keep); }; $('review-conflict').append(button);
    }
    else $('review-conflict').append(el('span', '目标版本或轮次已变化，请刷新后查看；草稿仍可导出。'));
  }
  const rows = sharedReviews.list(c.id, a.worldBuildHash), summary = reviewSummary(rows);
  $('shared-review-summary').textContent = `${summary.label} · ${summary.passed} 通过 / ${summary.failed} 不通过`;
  $('shared-review-list').replaceChildren(...(rows.length ? rows.slice().sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).map(r => {
    const item = el('article', undefined, 'shared-review'); const heading = el('div');
    heading.append(el('strong', r.reviewerName), el('span', r.verdict === 'pass' ? '通过' : r.verdict === 'fail' ? '不通过' : '未评价', `review-badge ${r.verdict || 'unreviewed'}`), el('small', new Date(r.updatedAt).toLocaleString('zh-CN')));
    item.append(heading); if (r.notes) item.append(el('p', r.notes));
    if (r.fidelity || r.playability || r.bugs) item.append(el('small', `首帧 ${r.fidelity || '—'} / 5 · 探索 ${r.playability || '—'} / 5 · 问题：${{'none-observed':'暂未发现',minor:'轻微',blocking:'阻断'}[r.bugs] || '未评价'}`));
    return item;
  }) : [el('p', sharedReviews.connected ? '此版本还没有人工评价。' : '共享评价正在连接，已有草稿不会丢失。', 'muted')]));
}
function sourceFailure(p) {
  const f = p?.failure;
  if (!f)
    return null;
  return typeof f === "string" ? f : f.message || f.code || "任务执行失败，请查看运行尝试。";
}
function renderEvents(p) {
  const list = el("ol", void 0, "event-stream");
  const events = p?.events || [];
  for (const e of events.slice(-100)) {
    const li = el("li", void 0, e.status === "failed" ? "failed" : "");
    li.dataset.eventId = e.id || `${e.at}|${e.label}`;
    li.append(el("time", e.at ? formatTime(e.at) : "已观测"), el("i"));
    const copy = el("div");
    copy.append(el("b", e.label || stages[e.stage] || "状态更新"));
    if (e.status) {
      const passed = e.resultStatus === "passed" && e.stage !== "playtest";
      copy.append(badge(e.status === "succeeded" ? "ready" : e.status, passed ? "检查通过" : toolStatusLabels[e.status] || "已记录"));
    }
    if (e.progress && finite(e.progress.elapsedSeconds)) {
      copy.append(el("p", `最近采样：${e.progress.elapsedSeconds.toFixed(1)} / ${e.progress.requestedSeconds ?? "—"} 秒${finite(e.progress.stepIndex) ? ` · 第 ${e.progress.stepIndex + 1} 步` : ""}`));
    }
    if (e.detail)
      copy.append(el("p", typeof e.detail === "string" ? e.detail : JSON.stringify(e.detail)));
    li.append(copy);
    list.append(li);
  }
  const box = $("events"), scroll = box.scrollTop;
  if (!events.length)
    box.replaceChildren(el("p", p ? "尚无可公开的工具事件。已确认的启动信息会显示在左侧。" : "等待任务状态连接。", "empty"));
  else
    box.replaceChildren(list);
  box.scrollTop = $("follow-events").checked ? box.scrollHeight : scroll;
}
function renderTrajectory(p, c) {
  const list = el("ol", void 0, "trajectory");
  const seen = new Set((p?.events || []).map((e) => e.stage).filter(Boolean));
  for (const a of p?.attempts || [])
    for (const e of a.events || [])
      if (e.stage)
        seen.add(e.stage);
  const counts = p?.toolSummary?.counts || p?.toolSummary?.completedMcpCalls || {};
  for (const [name, count] of Object.entries(counts)) {
    if (count > 0) {
      const stage = name.includes("playtest") ? "playtest" : name.includes("capture") ? "capture" : name.includes("submit") ? "packaging" : /preview|inspect|command/.test(name) ? "preview" : /validate|schema|examples|assets/.test(name) ? "authoring" : null;
      if (stage)
        seen.add(stage);
    }
  }
  if (p?.startedAt)
    seen.add("starting");
  if (["delivered", "verifying"].includes(caseStatus(c, p)) || isDelivered(c))
    seen.add("delivered");
  const selected = p?.stage;
  const visibleStages = phaseOrder.filter(id => !(["playtest", "planning"].includes(id)) || seen.has(id) || selected === id);
  for (const [index, id] of visibleStages.entries()) {
    let status = selected === id && caseStatus(c, p) === "running" ? "active" : seen.has(id) ? "complete" : "pending";
    if (caseStatus(c, p) === "failed" && id === (p?.lastStage || selected))
      status = "failed";
    const li = el("li");
    li.dataset.status = status;
    const marker = el("div", status === "complete" ? "✓" : String(index + 1).padStart(2, "0"), "trajectory-marker"), copy = el("div", void 0, "trajectory-copy");
    copy.append(el("strong", stages[id]), el("small", id === "delivered" ? isDelivered(c) ? "可直接试玩" : "尚无正式交付" : status === "active" ? "当前可观察活动" : status === "complete" ? "已有实际执行记录" : "尚无执行记录"));
    li.append(marker, copy, el("span", { active: "进行中", complete: "已记录", pending: "待执行", failed: "失败" }[status], "stage-state"));
    list.append(li);
  }
  $("trajectory").replaceChildren(list);
}
function renderAttempts(p) {
  const items = p?.attempts?.length ? p.attempts : [p].filter(Boolean);
  if (!items.length) {
    $("attempts").replaceChildren(el("p", "任务信息尚未连接。", "empty"));
    return;
  }
  $("attempts").replaceChildren(...items.map((a, i) => {
    const row = el("div", void 0, "attempt-row");
    const pending = a.continuation && !a.jobId && !a.submittedAt;
    const label = el("b", pending ? "续作待投递" : `投递 ${items.slice(0, i + 1).filter(a => a.jobId || a.submittedAt).length || i + 1}`), copy = el("div");
    copy.append(el("span", a.failure?.message || a.stageLabel || stages[a.stage] || labels[a.phase] || "已提交"), el("small", a.jobId || "等待云端任务 ID", "mono"));
    if (a.continuation) copy.append(el("small", continuationDetail(a.continuation)), el("small", `上次任务 ${a.continuation.parentJobId} → ${a.jobId || "续作等待投递"}`, "mono"));
    if (a.progress) copy.append(el("small", `开发进度 ${shortHash(a.progress.sourceHash)} 已保存，尚未验证可运行。`));
    const state = el("span");
    state.append(badge(a.phase || "unknown"));
    const time = el("span", duration(elapsed(a)), "duration");
    row.append(label, copy, state, time);
    return row;
  }));
}
function renderProcess() {
  if (!data || !selectedId)
    return;
  const c = data.cases.find((x) => x.id === selectedId);
  if (!c)
    return;
  const p = currentProgress(c.id), s = caseStatus(c, p);
  renderCoverage(c);
  $("case-status").replaceWith(Object.assign(badge(s), { id: "case-status" }));
  $("case-note").textContent = isDelivered(c) ? c.note || "" : s === "failed" ? "任务已结束，原始错误与每次尝试均保留在下方。" : p?.phase === "delivered" ? "云端已交付，正在自动同步产物。" : p?.phase === "running" ? "Agent 正在自主完成场景与工具检查，以下过程来自实际运行事件。" : c.note || "";
  if (p?.continuation && !isDelivered(c)) $("case-note").textContent = `${continuationDetail(p.continuation)}。${!p.jobId && !p.submittedAt ? "已准备续作，等待云端投递。" : ""}原始失败和每次尝试保留在下方。`;
  const checkpoint = !isDelivered(c) && runnableCheckpoint(c);
  $("checkpoint-notice").hidden = !checkpoint;
  if (checkpoint) $("checkpoint-notice").replaceChildren(el("strong", "中间可玩版本 · 尚未正式交付"), el("span", `构建 ${shortHash(checkpoint.worldBuildHash)} · 保存于 ${formatTime(checkpoint.createdAt)} · 当前生成状态：${labels[s] || s}。可直接试玩此版本；生成状态与正式交付另行更新。`));
  const message = sourceFailure(p);
  $("failure-banner").hidden = !message;
  if (message) {
    $("failure-banner").replaceChildren(el("strong", p.failure?.category === "model-capacity" ? "模型服务容量不足" : "本次运行出现异常"), el("span", message));
  }
  processMetrics(p);
  renderTrajectory(p, c);
  renderEvents(p);
  renderAttempts(p);
  $("technical").textContent = JSON.stringify({ runSource: data.sourceIdentity, runtimeHash: c.runtimeHash, creatorRuntimeLockHash: c.creatorRuntimeLockHash, reviewIdentity: c.reviewIdentity, caseId: c.baseCaseId || c.id, taskId: c.id, jobId: p?.jobId || null, sourceHash: c.sourceHash || null, worldBuildHash: c.worldBuildHash || null, checkpoint: checkpoint || null, continuation: p?.continuation || null, progress: p?.progress || null, providerStatus: p?.providerStatus || null, itemStatus: p?.itemStatus || null, stateSource: p?.stateSource || p?.source || null, failureFacts: p?.failureFacts || [], observedAt: p?.lastObservedAt || null, note: "过程只展示可观察事件；模型推理、源码、完整命令和凭证不公开。" }, null, 2);
}
function renderDeliverables(c) {
  const p = currentProgress(c.id), a = availableArtifacts(c), playable = Boolean(a.playable);
  const viewCount = a.triviews?.length || 0;
  const viewsDetail = a.selectionPolicy === "important-representatives-v1" ? `${Math.min(5, viewCount)} 张主要对象${viewCount > 5 ? ` · ${viewCount - 5} 张补充对象` : ""}` : `${viewCount} 张历史三视图 · 保留原始顺序`;
  const rows = [["reference", "用户参考图", true, c.reference, "原始上传图片"], ["worldPlan", "整体俯视规划图", Boolean(a.worldPlan), a.worldPlan, a.intermediate ? "中间版本随附的整体地图规划" : "随生成产物交付的整体地图规划"], ["opening", a.intermediate ? "中间版本预览" : "白模首帧", Boolean(a.opening), a.opening, a.intermediate ? previewLabels[a.previewView] || "实际预览" : "同一个可玩世界的首帧"], ["playable", a.intermediate ? "中间可玩版本" : "可玩世界", playable, a.playable, a.intermediate ? "尚未正式交付，保留生成时的可运行版本" : "保留 Agent 原始交付"], ["video", "真实试玩录像", Boolean(a.video), a.video, "实际按键操作与浏览器录制"], ["views", "对象三视图", Boolean(viewCount), null, viewsDetail]].filter(([kind]) => (kind !== "video" || c.validationMode !== "interactive-preview" && !a.intermediate) && (kind !== "worldPlan" || a.worldPlan) && (kind !== "views" || !a.intermediate));
  $("deliverables").replaceChildren(...rows.map(([id, title, ready, url, detail]) => {
    const row = el("div", void 0, `deliverable-row ${ready ? "" : "pending"}`);
    row.append(el("span", ready ? "✓" : "○", "deliverable-icon"));
    const copy = el("div");
    copy.append(el("span", title), el("small", detail));
    row.append(copy);
    if (url) {
      const link = el("a", "打开 ↗");
      link.href = sourceUrl(url);
      link.target = "_blank";
      link.rel = "noopener";
      row.append(link);
    } else
      row.append(el("span", ready ? "已交付" : p?.phase === "failed" ? "未交付" : "等待交付", "muted"));
    return row;
  }));
}
function frameController(frame) {
  const w = frame?.contentWindow;
  if (!w)
    return null;
  if (w.__THREE_CREATOR_HOST__)
    return { start: () => w.__THREE_CREATOR_HOST__.start(), stop: () => w.__THREE_CREATOR_HOST__.stop(), running: () => w.__THREE_CREATOR_HOST__.read()?.isRunning };
  const a = w.__WORLDKIT_EVAL__ || w.__WORLDKIT_CREATOR__;
  return a ? { start: () => a.startLive?.(), stop: () => a.stopLive?.(), running: () => a.snapshot?.()?.isRunning } : null;
}
function pausePlayer() {
  const frame = $("player").querySelector("iframe");
  if (!frame)
    return;
  try {
    const api = frameController(frame);
    resumePlayerOnReturn = api?.running() !== false;
    void Promise.resolve(api?.stop()).catch(() => {
    });
  } catch {
  }
}
function playableUrl(path) {
  const url = new URL(sourceUrl(path));
  url.searchParams.set("play", "1");
  return url.href;
}
function launchPlayer(c, a) {
  pausePlayer(); resumePlayerOnReturn = false;
  const frame = el("iframe");
  frame.title = c.title + (a.intermediate ? "中间可玩版本" : "交互白模");
  frame.allow = "fullscreen"; frame.src = playableUrl(a.playable);
  activePlayer = { runId: data.id, caseId: c.id, playable: a.playable, worldBuildHash: a.worldBuildHash, sourceHash: a.sourceHash, intermediate: a.intermediate };
  $("player").replaceChildren(frame);
  frame.onload = () => { frame.focus(); if (activeTab !== "play") pausePlayer(); };
  renderPlayerVersion(c, a);
}
function renderPlayerVersion(c, a) {
  const playing = activePlayer?.runId === data.id && activePlayer.caseId === c.id && $("player").querySelector("iframe") ? activePlayer : null;
  const newer = playing && a.playable && playing.playable !== a.playable;
  $("player-version").hidden = !playing;
  $("load-latest").hidden = !newer;
  $("player-version").textContent = playing ? `当前试玩：${playing.intermediate ? "中间版本" : "正式交付"} ${shortHash(playing.worldBuildHash)}${newer ? `。已有新的${a.intermediate ? "中间版本" : "正式交付"} ${shortHash(a.worldBuildHash)}；当前场景会保留，切换版本将重新开始。` : "。"}` : "";
  $("load-latest").onclick = newer ? () => launchPlayer(c, a) : null;
}
function renderTriviews(a) {
  const views = a.triviews || [], prioritized = a.selectionPolicy === "important-representatives-v1";
  const figure = (view, index) => {
    const node = el("figure");
    const subject = prioritized && index === 0 && view.entityIds?.[0] === "player" ? "主体 · " : "";
    node.append(el("figcaption", `${index + 1} · ${subject}${view.name}`), picture(view.image, `${view.name}三视图`));
    return node;
  };
  $("triview-section").hidden = !views.length;
  $("triview-section").open = true;
  $("triview-note").textContent = prioritized ? "每张图片是一张拼图，只展示一个完整对象的正面、右侧和背面。主体排第一，随后按重要程度排列；最多前五张用于画面渲染参考，首帧单独展示。" : "每张图片展示对象的正面、右侧和背面；多对象图片以标题标记为准。";
  $("triviews").replaceChildren(...views.slice(0, 5).map(figure));
  $("triview-extra-images").replaceChildren(...views.slice(5).map((view, index) => figure(view, index + 5)));
  $("triview-extra").hidden = views.length <= 5;
  $("triview-extra").open = false;
  $("triview-extra-label").textContent = prioritized ? `补充对象（${Math.max(0, views.length - 5)} 张，不包含在前五张渲染参考中）` : `更多三视图（${Math.max(0, views.length - 5)} 张）`;
}
function mountArtifacts(c) {
  const a = availableArtifacts(c);
  const next = [c.id, a.sourceHash, a.worldBuildHash, a.playable, a.opening, a.video, a.worldPlan, a.previewView, a.createdAt, a.intermediate, a.selectionPolicy, JSON.stringify(a.conditioningEntityIds), JSON.stringify(a.triviews)].join("|");
  renderDeliverables(c);
  renderPlayerVersion(c, a);
  if (next === artifactKey)
    return;
  artifactKey = next;
  const preservePlayer = activePlayer?.runId === data.id && activePlayer.caseId === c.id && Boolean($("player").querySelector("iframe"));
  if (!preservePlayer) { pausePlayer(); resumePlayerOnReturn = false; activePlayer = null; $("player").replaceChildren(); }
  $("video").pause();
  $("video").removeAttribute("src");
  $("video").load();
  $("reference").src = sourceUrl(c.reference);
  $("reference-link").href = sourceUrl(c.reference);
  $("prompt").textContent = c.prompt || "";
  $("opening-title").textContent = a.intermediate ? "中间版本预览" : "白模首帧";
  $("opening-state").textContent = a.opening ? a.intermediate ? `${previewLabels[a.previewView] || "实际预览"} · ${shortHash(a.worldBuildHash)}` : "实际交付版本" : "尚未交付";
  $("opening-container").replaceChildren(a.opening ? picture(a.opening, c.title + (a.intermediate ? "中间版本预览" : "白模首帧")) : el("span", "交付后在此对照首帧"));
  const playable = Boolean(a.playable);
  $("ready-content").hidden = !playable && !preservePlayer;
  $("play-pending").hidden = playable || preservePlayer;
  $("open-play").hidden = !playable;
  $("media-content").hidden = !a.video && !a.triviews?.length;
  renderTriviews(a);
  $("video").closest("details").hidden = !a.video;
  if (a.video) {
    $("video").src = sourceUrl(a.video);
    if (a.opening)
      $("video").poster = sourceUrl(a.opening);
    $("video-note").textContent = `录像按 ${c.metrics?.captureFps ?? "未知"} fps 采样，用于检查游玩过程；这不是实际游戏渲染帧率。`;
  }
  if (playable) {
    $("open-play").href = playableUrl(a.playable);
    if (!preservePlayer) {
      if (a.opening) $("player").append(picture(a.opening, "", "play-cover"));
      const launch = el("button", a.intermediate ? "加载中间版本 · 开始试玩" : "加载场景 · 开始试玩");
      launch.type = "button"; launch.onclick = () => launchPlayer(c, a);
      $("player").append(launch);
    }
    const m = c.metrics || {};
    if (a.intermediate) metrics($("metrics"), [["中间版本", "交付状态"], [shortHash(a.worldBuildHash), "可用构建"], [formatTime(a.createdAt), "保存时间"]]);
    else if (c.validationMode === "interactive-preview") metrics($("metrics"), [["实时预览", "生成检查方式"], ["可直接体验", "路线与探索"], [finite(m.generationMinutes) ? `${m.generationMinutes} 分钟` : "—", "生成耗时"]]);
    else metrics($("metrics"), [[finite(m.activePlaySeconds) ? `${m.activePlaySeconds.toFixed(1)} 秒` : finite(m.simulationSeconds) ? `${m.simulationSeconds} 秒` : "—", finite(m.activePlaySeconds) ? "主动游玩" : "录制时长"], [`${m.visitedTargets ?? "—"} / ${m.targetCount ?? "—"}`, "作者路线目标"], [finite(m.travelledMeters) ? `${Math.round(m.travelledMeters)} m` : "—", "记录行进距离"], [finite(m.generationMinutes) ? `${m.generationMinutes} 分钟` : "—", "生成耗时"]]);
    $("play-controls").textContent = c.profile === "three-sdk" ? "点击场景后操作：WASD 移动 · Shift 冲刺 · Space 跳跃 / 翻越 / 起身 · C/Ctrl 蹲伏 · Shift + C/Ctrl 滑铲 · Z 匍匐 · Q 翻滚 · E 交互 · G 放下 · F 上下载具。动作需满足场景与状态条件，具体改键以场景说明为准。" : "WASD 移动 · Shift 跑步 · Space 跳跃 · 拖动转镜头 · 滚轮缩放 · R 重置。具体操作以场景说明为准。";
  }
  renderPlayerVersion(c, a);
}
function select(id, reveal = false) {
  if (!data?.cases.length)
    return;
  const c = data.cases.find((c2) => c2.id === id) || data.cases[0];
  const changed = selectedId !== c.id;
  selectedId = c.id;
  history.replaceState(null, "", "#" + encodeURIComponent(c.id));
  $("detail").hidden = false;
  $("case-title").textContent = c.title;
  $("case-id").textContent = c.id;
  $("case-tags").textContent = (c.tags || []).join(" · ");
  if (changed) {
    feedbackContext = '';
    $("events").scrollTop = 0;
  }
  mountArtifacts(c);
  drawCards();
  renderProcess();
  renderFeedback();
  switchTab(activeTab);
  if (reveal)
    $("detail").scrollIntoView({ behavior: "smooth", block: "start" });
}
function switchTab(tab) {
  if (!["process", "outputs", "play", "review"].includes(tab))
    return;
  const previous = activeTab;
  if (tab === 'review') renderFeedback();
  activeTab = tab;
  for (const name of ["process", "outputs", "play", "review"]) {
    $("tab-" + name).hidden = name !== tab;
    document.querySelector(`[data-tab="${name}"]`).setAttribute("aria-selected", String(name === tab));
  }
  if (tab !== "outputs")
    $("video").pause();
  if (previous === "play" && tab !== "play")
    pausePlayer();
  if (tab === "play" && previous !== "play" && resumePlayerOnReturn) {
    try {
      void Promise.resolve(frameController($("player").querySelector("iframe"))?.start()).catch(() => {
      });
    } catch {
    }
    resumePlayerOnReturn = false;
  }
}
for (const b of document.querySelectorAll("[data-tab]"))
  b.onclick = () => switchTab(b.dataset.tab);
$("search").oninput = drawCards;
$("status-filter").onchange = drawCards;
$('review-filter').onchange = drawCards;
$('reviewer-form').onsubmit = async e => {
  e.preventDefault(); $('reviewer-save').disabled = true;
  try { await sharedReviews.identify($('reviewer-name').value); }
  catch { $('review-connection').textContent = '姓名保存失败，请检查连接后重试'; }
  finally { $('reviewer-save').disabled = false; }
};
$("follow-events").onchange = () => {
  if ($("follow-events").checked)
    $("events").scrollTop = $("events").scrollHeight;
};
$("review").oninput = () => {
  const target = feedbackTarget(); if (!target) return;
  sharedReviews.change(target.c.id, target.a.worldBuildHash, Object.fromEntries(new FormData($('review'))));
};
$('review').onsubmit = e => e.preventDefault();
$("export").onclick = () => {
  if (!data)
    return;
  const a = el("a"), url = URL.createObjectURL(new Blob([JSON.stringify({ schemaVersion: 2, evaluationId: data.id, exportedAt: new Date().toISOString(), reviews: sharedReviews.records, unsyncedDrafts: Object.values(sharedReviews.drafts).filter(r => r.runId === data.id) }, null, 2)], { type: "application/json" }));
  a.href = url;
  a.download = "worldkit-evaluation-reviews.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1e3);
};
async function readJson(name) {
  const response = await fetch(name, { cache: "no-store", signal: AbortSignal.timeout(8e3) });
  if (!response.ok)
    throw new Error(String(response.status));
  return response.json();
}
async function refresh() {
  if (pendingRefresh)
    return;
  pendingRefresh = true;
  $("refresh").disabled = true;
  try {
    const [results, live] = await Promise.allSettled([readJson("./results.json"), readJson("./progress.json")]);
    if (results.status === "rejected")
      throw results.reason;
    const next = results.value;
    if (!Array.isArray(next.cases) || !next.cases.length)
      throw new Error("Empty evaluation");
    if (data && data.id !== next.id) {
      selectedId = null;
      artifactKey = "";
    }
    data = next;
    sharedReviews.configure(data.id);
    if (live.status === "fulfilled" && live.value.kind === "three-creator-run-progress" && live.value.runId === data.id) {
      progress = live.value;
      progressUnavailable = false;
    } else {
      progressUnavailable = true;
      if (progress?.runId !== data.id)
        progress = null;
    }
    lastFetchAt = Date.now();
    lastRefreshFailed = false;
    $("load-error").hidden = true;
    const selected = data.cases.find((c) => c.id === selectedId);
    if (!selected) {
      let hash = "";
      try {
        hash = decodeURIComponent(location.hash.slice(1));
      } catch {
      }
      select(hash);
    } else {
      $("case-title").textContent = selected.title;
      $("case-id").textContent = selected.id;
      $("case-tags").textContent = (selected.tags || []).join(" · ");
      mountArtifacts(selected);
      drawCards();
      renderProcess();
      renderFeedback();
    }
  } catch {
    lastRefreshFailed = true;
    $("load-error").textContent = "状态更新暂时不可用，正在重试。已打开的场景和评测输入会保留。";
    $("load-error").hidden = false;
    $("connection").classList.add("stale");
    $("connection").lastElementChild.textContent = "更新连接中断";
  } finally {
    pendingRefresh = false;
    $("refresh").disabled = false;
  }
}
$("refresh").onclick = refresh;
await refresh();
setInterval(refresh, 1e4);
setInterval(() => {
  if (data) {
    setConnection();
    const c = data.cases.find((x) => x.id === selectedId), p = c && currentProgress(c.id);
    if (p) processMetrics(p);
  }
}, 1e3);
