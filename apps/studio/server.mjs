import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  appendFile,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { createServer, request as createHttpRequest } from "node:http";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createRecordingWorkbenchService } from "./recording-workbench.mjs";
import { FORMAL_CODEX_EXECUTION_PROFILE } from "../../scripts/lib/lwdp-codex-profile.mjs";
import {
  cancelGenerationJob,
  loadLwdpGenerationConfig,
} from "../../scripts/lib/lwdp-generation-client.mjs";

const studioRoot = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(studioRoot, "../..");
const defaultDataRoot = path.join(studioRoot, "data");
const publicRoot = path.join(studioRoot, "public");
const idPattern = /^[a-z0-9][a-z0-9-]{2,79}$/;
// The Studio workflow is unreleased and intentionally has one current contract.
// Bump this only when the persisted Studio record shape changes; do not keep
// parallel historical workflow implementations in the runtime.
export const workflowPolicyVersion = 3;
const codexBackendValues = new Set(["cloud", "local"]);
const allowedRootSceneAssets = new Set([
  "world-plan.png",
  "opening-shot.png",
  "entry-whitebox-target.png",
  "entry-styled-target.png",
  "whitebox-opening-frame.png",
  "opening-frame-rendered.png",
]);
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".jsonl", "application/x-ndjson; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".log", "text/plain; charset=utf-8"],
  [".ts", "text/plain; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
]);

const workflowStageDefinitions = [
  {
    id: "input",
    title: "需求进入",
    owner: "User",
    description: "保存世界描述和可选参考图，建立稳定任务记录。",
    required: [],
  },
  {
    id: "planner",
    title: "托管式意图规划",
    owner: "WorldKit Planner",
    description: "生成非权威 Scene Brief、世界规划图和进入构图目标，并在同一任务内完成输入自检。正式世界权威仍由 WorldSpec/plan-lock 与 Authoring V4 建立。",
    required: ["scene-brief", "visual-identity-palette", "world-plan", "entry-whitebox-target", "planner-self-check"],
  },
  {
    id: "coding-agent",
    title: "白膜实现",
    owner: "Coding Agent",
    description: "把已校验意图空间化为 Canonical AuthoringSpec V4，并通过与当前源码同源的便携校验器。",
    required: ["authoring-spec", "implementation-map-draft", "builder-self-check"],
  },
  {
    id: "canonical-build",
    title: "Canonical 构建",
    owner: "Trusted Host",
    description: "可信宿主复验 Authoring V4，编译 IR V4 / ExecutionPlan V5，并固化视觉目标到 runtime entity 的一对多映射。",
    required: ["implementation-map", "execution-plan"],
  },
  {
    id: "runtime-capture",
    title: "真实白膜捕获",
    owner: "Playground",
    description: "无头 Babylon 真实运行，输出进入首帧、快照、实体清单及 Front/Right/Back 白膜三视图。",
    required: ["opening-frame", "runtime-snapshot", "capture-targets"],
  },
  {
    id: "entry-alignment-validation",
    title: "进入构图校验",
    owner: "Trusted Host",
    description: "基于真实白膜首帧与 Runtime Snapshot V4 检查主体严格居中、相机锁定受控主体且位于正后方。",
    required: ["entry-third-person-validation"],
  },
  {
    id: "visual-prompt-synthesis",
    title: "视觉提示词合成",
    owner: "Configured Visual Prompt Provider",
    description: "可选：读取用户参考、真实 Babylon 白模捕获和三视图，生成共享视觉约束与逐目标提示词。",
    required: ["visual-generation-prompts"],
  },
  {
    id: "visual-imagegen",
    title: "可选视觉生成",
    owner: "Configured Image Provider",
    description: "可选：根据提示词和真实白模结构生成新首帧与样式三视图。该结果不改变几何、碰撞或 Canonical World State。",
    required: ["styled-opening-frame", "styled-triviews-manifest"],
  },
];

const runtimeStageAliases = new Map([
  ["plan-ready", "planner"],
  ["route-validation", "canonical-build"],
  ["change-requested", "coding-agent"],
  ["visual-imagegen-ready", "visual-imagegen"],
]);

const agentTokenStageIds = new Set([
  "planner", "coding-agent",
]);
const workflowStageIds = new Set(
  workflowStageDefinitions.map(({ id }) => id),
);

function canonicalWorkflowStage(stage, record = {}) {
  if (["failed", "interrupted", "change-requested"].includes(stage) && record.failedStage) {
    return runtimeStageAliases.get(record.failedStage) ?? record.failedStage;
  }
  if (stage === "preparing" || stage === "queued") return "input";
  if (stage === "ready") return record.styledTriviewsRequired === true
    ? "visual-imagegen"
    : "entry-alignment-validation";
  return runtimeStageAliases.get(stage) ?? stage;
}

function timestamp(value) {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedLogLine(line) {
  return line.replace(/^\[(?:stdout|stderr)\]\s*/, "").trim();
}

/** Parse Codex CLI totals, preferring explicit WorldKit usage markers when present. */
export function parseStageTokenUsage(rawLog = "") {
  const explicit = new Map();
  const fallback = new Map();
  let currentStage = null;
  let pendingTokenStage = null;
  for (const rawLine of String(rawLog).split(/\r?\n/)) {
    const line = normalizedLogLine(rawLine);
    const stageMatch = /^WORLDKIT_STAGE ([a-z-]+)$/.exec(line);
    if (stageMatch) {
      currentStage = canonicalWorkflowStage(stageMatch[1]);
      pendingTokenStage = null;
      continue;
    }
    const usageMatch = /^WORLDKIT_STAGE_USAGE ([a-z-]+) ([0-9]+)$/.exec(line);
    if (usageMatch) {
      const stage = canonicalWorkflowStage(usageMatch[1]);
      explicit.set(stage, (explicit.get(stage) ?? 0) + Number(usageMatch[2]));
      pendingTokenStage = null;
      continue;
    }
    if (/^tokens used$/i.test(line)) {
      pendingTokenStage = currentStage;
      continue;
    }
    if (pendingTokenStage !== null && /^[0-9][0-9,]*$/.test(line)) {
      const count = Number(line.replaceAll(",", ""));
      if (Number.isSafeInteger(count)) {
        fallback.set(pendingTokenStage, (fallback.get(pendingTokenStage) ?? 0) + count);
      }
      pendingTokenStage = null;
      continue;
    }
  }
  const usage = Object.fromEntries(fallback);
  for (const [stage, count] of explicit) usage[stage] = count;
  return usage;
}

export function deriveReliabilityMetrics(records = [], options = {}) {
  const targetFailureRate = options.targetFailureRate ?? 0.01;
  const minimumSampleSize = options.minimumSampleSize ?? 100;
  const successful = records.filter((record) => record?.outcome === "passed");
  const terminalFailures = records.filter((record) =>
    record?.outcome === "failed" ||
    record?.status === "failed" ||
    (record?.status === "interrupted" && record?.outcome !== "cancelled"));
  const terminalCount = successful.length + terminalFailures.length;
  const failureCount = terminalFailures.length;
  const failureRate = terminalCount === 0 ? null : failureCount / terminalCount;
  const recoveredSuccessCount = successful.filter((record) => (record?.attempt ?? 0) > 1).length;
  const z = 1.96;
  const confidenceUpper95 = terminalCount === 0
    ? null
    : (() => {
        const observed = failureCount / terminalCount;
        const z2 = z * z;
        const denominator = 1 + z2 / terminalCount;
        const center = observed + z2 / (2 * terminalCount);
        const margin = z * Math.sqrt(
          (observed * (1 - observed) + z2 / (4 * terminalCount)) / terminalCount,
        );
        return Math.min(1, (center + margin) / denominator);
      })();
  const failureClasses = { infrastructure: 0, authoring: 0, visual: 0 };
  for (const record of terminalFailures) {
    const failureText = `${record?.failedStage ?? ""} ${record?.error ?? ""}`.toLowerCase();
    if (/entry-verifier|visual qa|visual-reconstruction|visual-alignment|prompt-synthesis/.test(failureText)) {
      failureClasses.visual += 1;
    } else if (
      record?.status === "interrupted" ||
      /timeout|timed out|connection|http2|rate.?limit|502|503|504|stopped|restart/.test(failureText)
    ) {
      failureClasses.infrastructure += 1;
    } else {
      failureClasses.authoring += 1;
    }
  }
  const sampleQualified = terminalCount >= minimumSampleSize;
  const observedMeetsTarget = failureRate !== null && failureRate < targetFailureRate;
  const confidenceMeetsTarget = confidenceUpper95 !== null && confidenceUpper95 < targetFailureRate;
  return {
    targetFailureRate,
    minimumSampleSize,
    terminalCount,
    successCount: successful.length,
    failureCount,
    failureRate,
    confidenceUpper95,
    recoveredSuccessCount,
    failureClasses,
    sampleQualified,
    observedMeetsTarget,
    confidenceMeetsTarget,
    status: !sampleQualified
      ? "insufficient-sample"
      : confidenceMeetsTarget
        ? "pass"
        : "fail",
  };
}

function inferredEventKind(event) {
  if (event.kind) return event.kind;
  if (event.inferred) return "completed";
  if (event.stage === "ready") return "started";
  if (/进入|开始/.test(event.message ?? "")) return "started";
  if (/完成|通过|失败|未通过|中断/.test(event.message ?? "")) return "completed";
  return "started";
}

/** Build display-safe stage duration/token metrics without inventing missing history. */
export function deriveWorkflowMetrics({
  record,
  stages,
  events = [],
  deliverables = [],
  rawLog = "",
  now = Date.now(),
}) {
  const starts = new Map();
  const completions = new Map();
  const startSources = new Map();
  const completionSources = new Map();
  const attemptStart = timestamp(record.startedAt) ?? timestamp(record.createdAt);
  const inputStart = attemptStart;
  if (inputStart !== null) {
    starts.set("input", inputStart);
    startSources.set("input", "recorded");
  }
  const sortedEvents = [...events]
    .filter((event) => attemptStart === null || (timestamp(event.at) ?? 0) >= attemptStart)
    .sort((left, right) => (timestamp(left.at) ?? 0) - (timestamp(right.at) ?? 0));
  for (const event of sortedEvents) {
    const at = timestamp(event.at);
    const stage = canonicalWorkflowStage(event.stage, record);
    if (at === null || !workflowStageIds.has(stage) || event.kind === "usage") continue;
    const kind = inferredEventKind(event);
    const source = event.inferred || (event.stage === "ready" && event.kind === undefined)
      ? "inferred"
      : "recorded";
    if (["completed", "failed"].includes(kind)) {
      completions.set(stage, Math.max(completions.get(stage) ?? 0, at));
      completionSources.set(stage, source);
    } else if (kind === "started" && !starts.has(stage)) {
      starts.set(stage, at);
      startSources.set(stage, source);
    }
  }

  const phaseArtifactEnds = new Map();
  for (const deliverable of deliverables) {
    const at = timestamp(deliverable.updatedAt);
    if (at === null || !workflowStageIds.has(deliverable.phase)) continue;
    phaseArtifactEnds.set(deliverable.phase, Math.max(phaseArtifactEnds.get(deliverable.phase) ?? 0, at));
  }

  const tokenUsage = parseStageTokenUsage(rawLog);
  const byStage = {};
  const orderedStarts = stages.map((stage) => starts.get(stage.id) ?? null);
  for (const [index, stage] of stages.entries()) {
    const startedAt = starts.get(stage.id) ?? null;
    const laterStart = orderedStarts.slice(index + 1).find((value) => value !== null) ?? null;
    const recordedCompletion = completions.get(stage.id) ?? null;
    let endedAt = recordedCompletion !== null && (startedAt === null || recordedCompletion >= startedAt)
      ? recordedCompletion
      : laterStart;
    let durationStatus = endedAt === recordedCompletion && recordedCompletion !== null
      ? completionSources.get(stage.id) ?? "recorded"
      : laterStart !== null ? "recorded" : "unavailable";
    if (stage.status === "active" && startedAt !== null) {
      endedAt = now;
      durationStatus = "live";
    } else if (stage.status === "active" && startedAt === null) {
      durationStatus = "pending";
    } else if (endedAt === null && stage.status === "complete") {
      endedAt = phaseArtifactEnds.get(stage.id) ?? null;
      if (endedAt !== null) durationStatus = "inferred";
    }
    const durationMs = startedAt !== null && endedAt !== null && endedAt >= startedAt
      ? endedAt - startedAt
      : null;
    if (durationMs !== null && startSources.get(stage.id) === "inferred") durationStatus = "inferred";

    const parsedTokens = tokenUsage[stage.id];
    let tokenCount = Number.isSafeInteger(parsedTokens) ? parsedTokens : null;
    let tokenStatus = tokenCount === null ? "unavailable" : "recorded";
    if (!agentTokenStageIds.has(stage.id)) {
      tokenCount = 0;
      tokenStatus = "not-applicable";
    } else if (tokenCount === null && ["active", "pending"].includes(stage.status)) {
      tokenStatus = "pending";
    }
    byStage[stage.id] = { durationMs, durationStatus, tokenCount, tokenStatus };
  }

  const relevantAgentStages = stages.filter((stage) =>
    agentTokenStageIds.has(stage.id) && !["optional", "skipped", "pending"].includes(stage.status));
  const recordedAgentStages = relevantAgentStages.filter((stage) => byStage[stage.id]?.tokenCount !== null);
  const totalTokenCount = Object.values(tokenUsage).reduce((sum, count) => sum + count, 0);
  const totalStart = attemptStart;
  const terminal = ["ready", "failed", "interrupted"].includes(record.status);
  const observedEnds = [
    timestamp(record.finishedAt),
    ...sortedEvents.map((event) => timestamp(event.at)),
    ...deliverables.map((deliverable) => timestamp(deliverable.updatedAt)),
  ].filter((value) => value !== null);
  const totalEnd = terminal ? (observedEnds.length ? Math.max(...observedEnds) : null) : now;
  return {
    byStage,
    summary: {
      durationMs: totalStart !== null && totalEnd !== null && totalEnd >= totalStart ? totalEnd - totalStart : null,
      durationStatus: terminal ? "recorded" : "live",
      tokenCount: totalTokenCount,
      tokenStatus: relevantAgentStages.length === recordedAgentStages.length ? "recorded" :
        record.status === "running" ? "live" : "partial",
    },
  };
}

export function deriveWorkflowTrajectory({ record, availableIds = [] }) {
  const available = new Set(availableIds);
  const stageSource = ["failed", "interrupted"].includes(record.stage) && record.failedStage
    ? record.failedStage
    : record.stage;
  const activeStage = runtimeStageAliases.get(stageSource) ?? stageSource;
  const activeIndex = workflowStageDefinitions.findIndex((stage) => stage.id === activeStage);
  return workflowStageDefinitions.map((definition, index) => {
    const required = definition.required;
    const complete = definition.id === "input" || required.every((id) => available.has(id));
    const failed = ["failed", "change-requested", "interrupted"].includes(record.stage) && index === activeIndex;
    const active = !complete && !failed && index === activeIndex;
    let status = complete ? "complete" : active ? "active" : "pending";
    if (definition.id === "runtime-capture" && record.captureStatus === "failed") status = "failed";
    if (definition.id === "visual-prompt-synthesis" && record.styledOpeningFrameRequired !== true) {
      status = "optional";
    }
    if (definition.id === "visual-imagegen" && record.styledTriviewsRequired !== true) {
      status = "optional";
    }
    if (definition.optional && !complete) status = "optional";
    if (failed) status = "failed";
    return {
      ...definition,
      status,
      deliverableIds: required,
    };
  });
}

export class InputError extends Error {}

function constantTimeEqual(left, right) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  if (leftBytes.length !== rightBytes.length) return false;
  return timingSafeEqual(leftBytes, rightBytes);
}

export function isAuthorizedHeader(header, accessKey) {
  if (!accessKey) return true;
  if (typeof header !== "string" || !header.startsWith("Basic ")) return false;
  try {
    const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) return false;
    return constantTimeEqual(decoded.slice(0, separator), "worldkit") &&
      constantTimeEqual(decoded.slice(separator + 1), accessKey);
  } catch {
    return false;
  }
}

export function normalizePrompt(value) {
  if (typeof value !== "string") throw new InputError("请输入世界描述。");
  const prompt = value.replaceAll("\u0000", "").trim();
  if (prompt.length < 4) throw new InputError("世界描述至少需要 4 个字。");
  if (prompt.length > 8_000) throw new InputError("世界描述不能超过 8,000 个字符。");
  return prompt;
}

export function normalizeTitle(value, prompt) {
  const title = typeof value === "string" ? value.replaceAll("\u0000", "").trim() : "";
  return (title || prompt.slice(0, 28)).slice(0, 80);
}

export function normalizeTestSetName(value) {
  if (typeof value !== "string") throw new InputError("请输入测试集名称。");
  const name = value.replaceAll("\u0000", "").trim();
  if (name.length < 2) throw new InputError("测试集名称至少需要 2 个字。");
  if (name.length > 80) throw new InputError("测试集名称不能超过 80 个字符。");
  return name;
}

export function createSceneId(title, existingIds = new Set(), now = new Date()) {
  const asciiSlug = title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 46);
  const stamp = [
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
    String(now.getUTCHours()).padStart(2, "0"),
    String(now.getUTCMinutes()).padStart(2, "0"),
  ].join("");
  const base = asciiSlug || `world-${stamp}`;
  let candidate = `${base}-${randomBytes(2).toString("hex")}`;
  while (existingIds.has(candidate)) candidate = `${base}-${randomBytes(2).toString("hex")}`;
  return candidate;
}

export function decodeImagePayload(image) {
  if (image == null) return null;
  if (typeof image !== "object" || typeof image.dataUrl !== "string") {
    throw new InputError("参考图格式无效。");
  }
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(image.dataUrl);
  if (!match) throw new InputError("仅支持 PNG、JPEG 或 WebP 图片。");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0 || bytes.length > 12 * 1024 * 1024) {
    throw new InputError("参考图大小必须在 12 MB 以内。");
  }
  const kind = match[1];
  const valid =
    (kind === "png" && bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") ||
    (kind === "jpeg" && bytes.subarray(0, 3).toString("hex") === "ffd8ff") ||
    (kind === "webp" && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP");
  if (!valid) throw new InputError("参考图内容与文件格式不匹配。");
  return {
    bytes,
    contentSha256: createHash("sha256").update(bytes).digest("hex"),
    extension: kind === "jpeg" ? "jpg" : kind,
    mimeType: kind === "jpeg" ? "image/jpeg" : `image/${kind}`,
    originalName: typeof image.name === "string" ? path.basename(image.name).slice(0, 160) : null,
  };
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const nonce = randomBytes(12).toString("hex");
  const temporary = `${filePath}.${process.pid}.${nonce}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(temporary, filePath);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

export function createKeyedSerialExecutor() {
  const tails = new Map();
  return async function runSerially(key, operation) {
    const previous = tails.get(key) ?? Promise.resolve();
    const execution = previous.catch(() => undefined).then(operation);
    const settledTail = execution.then(() => undefined, () => undefined);
    tails.set(key, settledTail);
    try {
      return await execution;
    } finally {
      if (tails.get(key) === settledTail) tails.delete(key);
    }
  };
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 18 * 1024 * 1024) throw new InputError("请求内容不能超过 18 MB。");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new InputError("请求 JSON 无效。");
  }
}

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(value));
}

function sendError(response, statusCode, error) {
  sendJson(response, statusCode, {
    error: error instanceof Error ? error.message : String(error),
  });
}

function serveFile(response, filePath, cacheControl = "no-cache") {
  const type = contentTypes.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream";
  response.writeHead(200, { "content-type": type, "cache-control": cacheControl });
  createReadStream(filePath).on("error", () => {
    if (!response.headersSent) response.writeHead(404);
    response.end();
  }).pipe(response);
}

function commandAvailable(command) {
  const result = spawnSync(command, ["--version"], { stdio: "ignore" });
  return result.status === 0;
}

function normalizedCodexBackend(value, fallback = null) {
  return typeof value === "string" && codexBackendValues.has(value) ? value : fallback;
}

export function isAllowedSceneAsset(relativePath) {
  if (allowedRootSceneAssets.has(relativePath)) return true;
  if (/^reference-[0-9]+\.(?:png|jpe?g|webp)$/.test(relativePath)) return true;
  return /^prototypes\/[a-z0-9][a-z0-9-]*\/(?:whitebox|styled)-triview\.png$/.test(relativePath);
}

export function createStudio(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? defaultRepoRoot);
  const dataRoot = path.resolve(options.dataRoot ?? defaultDataRoot);
  const worldsRoot = path.join(dataRoot, "worlds");
  const testSetsRoot = path.join(dataRoot, "test-sets");
  const builtinTestSetsRoot = path.join(repoRoot, "apps/studio/builtin-test-sets");
  const builtinResultsRoot = path.join(repoRoot, "apps/studio/builtin-results");
  const playgroundOrigin = options.playgroundOrigin ?? "http://127.0.0.1:5173";
  const playgroundInternalOrigin = options.playgroundInternalOrigin ?? "http://127.0.0.1:5173";
  const accessKey = options.accessKey ?? "";
  const autoRunJobs = options.autoRunJobs ?? true;
  const configuredConcurrency = Number(
    options.maxConcurrentJobs ?? process.env.WORLDKIT_STUDIO_MAX_CONCURRENT_JOBS ?? 4,
  );
  const maxConcurrentJobs = Number.isSafeInteger(configuredConcurrency) &&
    configuredConcurrency >= 1 && configuredConcurrency <= 16
    ? configuredConcurrency
    : 4;
  const configuredBackendConcurrency = (value, fallback) => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 16
      ? parsed
      : fallback;
  };
  const maxConcurrentJobsByBackend = {
    cloud: configuredBackendConcurrency(
      options.maxConcurrentCloudJobs ?? process.env.WORLDKIT_STUDIO_MAX_CONCURRENT_CLOUD_JOBS,
      maxConcurrentJobs,
    ),
    local: configuredBackendConcurrency(
      options.maxConcurrentLocalJobs ?? process.env.WORLDKIT_STUDIO_MAX_CONCURRENT_LOCAL_JOBS,
      1,
    ),
  };
  const importExistingArtifacts = options.importExistingArtifacts ?? true;
  const importBuiltinTestSets = options.importBuiltinTestSets ?? dataRoot === defaultDataRoot;
  const importBuiltinResults = options.importBuiltinResults ?? dataRoot === defaultDataRoot;
  const runtimeSettingsPath = path.join(dataRoot, "runtime-settings.json");
  const initialCodexBackend = normalizedCodexBackend(
    options.initialCodexBackend ?? options.codexBackend ?? process.env.WORLDKIT_CODEX_BACKEND,
    "cloud",
  );
  const codexSpawnSync = options.codexSpawnSync ?? spawnSync;
  const codexBinary = options.codexBinary ?? process.env.WORLDKIT_LOCAL_CODEX_BIN ?? "codex";
  const worldSpawnImplementation = options.worldSpawnImplementation ?? spawn;
  const beforeWorldSpawn = options.beforeWorldSpawn ?? (() => undefined);
  const queue = [];
  const activeJobs = new Set();
  const activeJobBackends = new Map();
  const activeChildren = new Map();
  const stoppingJobs = new Set();
  const runRecordMutation = createKeyedSerialExecutor();
  const runRuntimeSettingsMutation = createKeyedSerialExecutor();
  let selectedCodexBackend = initialCodexBackend;
  let shuttingDown = false;

  function effectiveCodexBackend(record) {
    return normalizedCodexBackend(record?.codexBackend, "cloud");
  }

  async function codexBackendAvailability() {
    const lwdpEnvFile = process.env.WORLDKIT_LWDP_ENV_FILE ||
      path.join(homedir(), ".codex", "secrets", "lwdp_generation.env");
    const cloud = Boolean(options.lwdpConfigured ??
      (Boolean(process.env.LWDP_GENERATION_API_TOKEN) || await fileExists(lwdpEnvFile)));
    let local = false;
    try {
      const codexEnvironment = {
        ...process.env,
        ...(process.env.WORLDKIT_LOCAL_CODEX_HOME
          ? { CODEX_HOME: process.env.WORLDKIT_LOCAL_CODEX_HOME }
          : {}),
      };
      const version = codexSpawnSync(codexBinary, ["--version"], {
        stdio: "ignore",
        env: codexEnvironment,
      });
      const login = version?.status === 0
        ? codexSpawnSync(codexBinary, ["login", "status"], {
            stdio: "ignore",
            env: codexEnvironment,
          })
        : null;
      local = version?.status === 0 && login?.status === 0;
    } catch {
      local = false;
    }
    return { cloud, local };
  }

  async function persistCodexBackend(backend) {
    await writeJsonAtomic(runtimeSettingsPath, {
      kind: "worldkit-studio-runtime-settings",
      schemaVersion: 1,
      codexBackend: backend,
      updatedAt: new Date().toISOString(),
    });
  }

  function runBackgroundTask(id, operationName, operation) {
    void Promise.resolve().then(operation).catch((error) => {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      try {
        if (typeof options.onBackgroundError === "function") {
          options.onBackgroundError({ id, operationName, error });
        } else {
          console.error(`WORLDKIT_STUDIO_BACKGROUND_ERROR id=${id} operation=${operationName}\n${message}`);
        }
      } catch (reportingError) {
        console.error("WORLDKIT_STUDIO_BACKGROUND_ERROR_REPORT_FAILED", reportingError, message);
      }
    });
  }

  const recordingWorkbench = createRecordingWorkbenchService({
    repoRoot,
    dataRoot,
    autoRunJobs: options.autoRunRecordingJobs ?? true,
    maxConcurrentJobs: options.maxConcurrentRecordingJobs,
    generationRunner: options.recordingGenerationRunner,
    spawnImplementation: options.recordingSpawnImplementation,
    codexBackendProvider: () => selectedCodexBackend,
  });

  const recordPath = (id) => path.join(worldsRoot, id, "record.json");
  const logPath = (id) => path.join(worldsRoot, id, "agent.log");
  const trajectoryPath = (id) => path.join(worldsRoot, id, "trajectory.jsonl");
  const testSetRecordPath = (id) => path.join(testSetsRoot, id, "record.json");
  const subjectCatalogPath = path.join(
    repoRoot,
    "assets/registry/subject-definitions/catalog.json",
  );

  function testSetImagePath(record, image) {
    if (
      !record ||
      !image ||
      !/^image-[0-9]{3}-[a-f0-9]{4}$/.test(image.id) ||
      !["png", "jpg", "webp"].includes(image.extension)
    ) return null;
    const expected = `images/${image.id}.${image.extension}`;
    return image.fileName === expected ? path.join(testSetsRoot, record.id, expected) : null;
  }

  async function refreshTestSetIntegrity(record) {
    const seenHashes = new Map();
    let changed = false;
    const images = [];
    for (const image of record.images ?? []) {
      const imagePath = testSetImagePath(record, image);
      let contentSha256 = image.contentSha256 ?? null;
      let integrityError = imagePath === null ? "invalid-storage-path" : null;
      if (imagePath !== null && contentSha256 === null) {
        try {
          contentSha256 = createHash("sha256").update(await readFile(imagePath)).digest("hex");
        } catch {
          integrityError = "missing-or-unreadable-file";
        }
      }
      const duplicateOf = contentSha256 === null ? null : seenHashes.get(contentSha256) ?? null;
      if (contentSha256 !== null && duplicateOf === null) seenHashes.set(contentSha256, image.id);
      const next = { ...image, contentSha256, duplicateOf, integrityError };
      if (
        image.contentSha256 !== next.contentSha256 ||
        image.duplicateOf !== next.duplicateOf ||
        image.integrityError !== next.integrityError
      ) changed = true;
      images.push(next);
    }
    if (changed) {
      record.images = images;
      await writeTestSet(record);
    } else {
      record.images = images;
    }
    return record;
  }

  function deliverableCandidates(record, id) {
    const sceneId = record.sceneId;
    const artifactRoot = path.join(repoRoot, "artifacts/scenes", sceneId);
    const planRoot = path.join(repoRoot, "apps/playground/public/scene-plans", sceneId);
    const candidates = {
      "scene-brief": [path.join(artifactRoot, "scene-brief.md")],
      "planner-self-check": [path.join(artifactRoot, "planner-self-check.json")],
      "visual-identity-palette": [path.join(artifactRoot, "visual-identity-palette.json")],
      "world-plan": [path.join(planRoot, "world-plan.png")],
      "entry-whitebox-target": [path.join(planRoot, "entry-whitebox-target.png")],
      "authoring-spec": [path.join(artifactRoot, "authoring.json")],
      "implementation-map-draft": [path.join(artifactRoot, "implementation-map.draft.json")],
      "builder-self-check": [path.join(artifactRoot, "builder-self-check.json")],
      "implementation-map": [path.join(artifactRoot, "scene-implementation-map.json")],
      "execution-plan": [path.join(artifactRoot, "world.build.json")],
      "route-validation-manifest": [path.join(artifactRoot, "route-validation-manifest.json")],
      "opening-frame": [path.join(artifactRoot, "opening-frame.png")],
      "runtime-snapshot": [path.join(artifactRoot, "runtime-snapshot.json")],
      "capture-targets": [path.join(artifactRoot, "triviews", "capture-targets.json")],
      "entry-third-person-validation": [path.join(artifactRoot, "entry-third-person-validation.json")],
      "visual-generation-prompts": [path.join(artifactRoot, "visual-generation-prompts.json")],
      "styled-opening-frame": [path.join(artifactRoot, "styled-opening-frame.png")],
      "styled-opening-frame-manifest": [path.join(artifactRoot, "styled-opening-frame-manifest.json")],
      "styled-opening-frame-report": [path.join(artifactRoot, "styled-opening-frame-report.json")],
      "styled-triviews-manifest": [path.join(artifactRoot, "styled-triviews-manifest.json")],
      "styled-triviews-report": [path.join(artifactRoot, "styled-triviews-report.json")],
      "evaluation-run": [path.join(artifactRoot, "evaluation-run.json")],
      "evaluation-report": [path.join(artifactRoot, "evaluation-report.json")],
      "agent-log": [logPath(record.id)],
      "trajectory-events": [trajectoryPath(record.id)],
    };
    return candidates[id] ?? [];
  }

  async function resolveDeliverable(record, id) {
    for (const candidate of deliverableCandidates(record, id)) {
      try {
        const metadata = await stat(candidate);
        if (!metadata.isFile()) continue;
        return { path: candidate, metadata };
      } catch {}
    }
    return null;
  }

  async function appendTrajectoryEvent(id, stage, message, details = {}) {
    await appendFile(trajectoryPath(id), `${JSON.stringify({
      stage,
      message,
      at: new Date().toISOString(),
      ...details,
    })}\n`, "utf8");
  }

  async function readTrajectoryEvents(id) {
    try {
      const lines = (await readFile(trajectoryPath(id), "utf8")).split(/\r?\n/).filter(Boolean);
      return lines.flatMap((line) => {
        try {
          const value = JSON.parse(line);
          return typeof value?.stage === "string" && typeof value?.at === "string" ? [value] : [];
        } catch {
          return [];
        }
      });
    } catch {
      return [];
    }
  }

  async function readRecord(id) {
    if (!idPattern.test(id)) return null;
    try {
      return JSON.parse(await readFile(recordPath(id), "utf8"));
    } catch {
      return null;
    }
  }

  async function writeRecordUnlocked(record) {
    record.updatedAt = new Date().toISOString();
    await writeJsonAtomic(recordPath(record.id), record);
  }

  async function writeRecord(record) {
    return runRecordMutation(record.id, () => writeRecordUnlocked(record));
  }

  async function readTestSet(id) {
    if (!idPattern.test(id)) return null;
    try {
      return JSON.parse(await readFile(testSetRecordPath(id), "utf8"));
    } catch {
      return null;
    }
  }

  async function writeTestSet(record) {
    record.updatedAt = new Date().toISOString();
    await writeJsonAtomic(testSetRecordPath(record.id), record);
  }

  async function listTestSets() {
    await mkdir(testSetsRoot, { recursive: true });
    const entries = await readdir(testSetsRoot, { withFileTypes: true });
    const records = (
      await Promise.all(entries.filter((entry) => entry.isDirectory()).map((entry) => readTestSet(entry.name)))
    ).filter(Boolean);
    return records.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async function importBuiltinTestSetRecords() {
    if (!importBuiltinTestSets || !await fileExists(builtinTestSetsRoot)) return;
    const directories = await readdir(builtinTestSetsRoot, { withFileTypes: true });
    for (const directory of directories) {
      if (!directory.isDirectory()) continue;
      const builtinRoot = path.join(builtinTestSetsRoot, directory.name);
      const manifest = await readJsonIfPresent(path.join(builtinRoot, "manifest.json"));
      if (
        manifest?.kind !== "worldkit-builtin-test-set" ||
        manifest.schemaVersion !== 1 ||
        !idPattern.test(manifest.id) ||
        !Array.isArray(manifest.images) ||
        manifest.images.length === 0 ||
        manifest.images.length > 200
      ) continue;
      const existing = await readTestSet(manifest.id);
      const destinationRoot = path.join(testSetsRoot, manifest.id);
      await mkdir(path.join(destinationRoot, "images"), { recursive: true });
      const images = [];
      for (const image of manifest.images) {
        if (
          !idPattern.test(image?.id) ||
          !["png", "jpg", "webp"].includes(image?.extension) ||
          typeof image?.sourceFile !== "string" ||
          image.sourceFile.includes("..") ||
          path.isAbsolute(image.sourceFile)
        ) throw new Error(`Invalid built-in test image declaration: ${manifest.id}/${image?.id ?? "unknown"}`);
        const sourcePath = path.resolve(builtinRoot, image.sourceFile);
        if (!sourcePath.startsWith(`${builtinRoot}${path.sep}`) || !await fileExists(sourcePath)) {
          throw new Error(`Built-in test image is missing: ${manifest.id}/${image.id}`);
        }
        const bytes = await readFile(sourcePath);
        const contentSha256 = createHash("sha256").update(bytes).digest("hex");
        if (contentSha256 !== image.contentSha256 || bytes.length !== image.size) {
          throw new Error(`Built-in test image integrity mismatch: ${manifest.id}/${image.id}`);
        }
        const fileName = `images/${image.id}.${image.extension}`;
        const destinationPath = path.join(destinationRoot, fileName);
        const currentBytes = await fileExists(destinationPath) ? await readFile(destinationPath) : null;
        if (!currentBytes || createHash("sha256").update(currentBytes).digest("hex") !== contentSha256) {
          await copyFile(sourcePath, destinationPath);
        }
        images.push({
          id: image.id,
          fileName,
          extension: image.extension,
          mimeType: image.mimeType,
          contentSha256,
          duplicateOf: null,
          integrityError: null,
          originalName: image.originalName,
          size: image.size,
          labels: image.labels ?? {},
          tags: Array.isArray(image.tags) ? image.tags : [],
          createdAt: manifest.createdAt,
        });
      }
      await writeJsonAtomic(testSetRecordPath(manifest.id), {
        id: manifest.id,
        name: manifest.name,
        prompt: manifest.prompt,
        images,
        builtin: true,
        builtinSource: path.relative(repoRoot, builtinRoot),
        review: manifest.review ?? null,
        createdAt: manifest.createdAt,
        updatedAt: manifest.updatedAt,
        lastRunAt: existing?.lastRunAt ?? null,
        lastBatchId: existing?.lastBatchId ?? null,
      });
    }
  }

  async function importBuiltinResultRecords() {
    if (!importBuiltinResults || !await fileExists(builtinResultsRoot)) return;
    const directories = await readdir(builtinResultsRoot, { withFileTypes: true });
    for (const directory of directories) {
      if (!directory.isDirectory() || !idPattern.test(directory.name)) continue;
      const builtinRoot = path.join(builtinResultsRoot, directory.name);
      const record = await readJsonIfPresent(path.join(builtinRoot, "record.json"));
      if (
        record?.id !== directory.name ||
        record.sceneId !== directory.name ||
        record.origin !== "test-set" ||
        record.status !== "ready" ||
        record.outcome !== "passed" ||
        !idPattern.test(record.testSetId ?? "") ||
        !/^image-[0-9]{3}-[a-f0-9]{4}$/.test(record.testSetImageId ?? "")
      ) throw new Error(`Invalid built-in result record: ${directory.name}`);
      if (await readRecord(record.id)) continue;

      const artifactRoot = path.join(repoRoot, "artifacts/scenes", record.sceneId);
      const [evaluationRun, evaluationReport] = await Promise.all([
        readJsonIfPresent(path.join(artifactRoot, "evaluation-run.json")),
        readJsonIfPresent(path.join(artifactRoot, "evaluation-report.json")),
      ]);
      if (
        evaluationRun?.caseId !== record.id ||
        evaluationRun.testSetId !== record.testSetId ||
        evaluationRun.testSetImageId !== record.testSetImageId ||
        evaluationReport?.caseId !== record.id ||
        evaluationReport.outcome !== "passed"
      ) throw new Error(`Built-in result evidence mismatch: ${directory.name}`);

      const destinationRoot = path.join(worldsRoot, record.id);
      await mkdir(destinationRoot, { recursive: true });
      if (record.referenceImage?.fileName) {
        const sourceReference = path.join(
          repoRoot,
          "apps/playground/public/scene-plans",
          record.sceneId,
          "reference-0.png",
        );
        if (!await fileExists(sourceReference)) {
          throw new Error(`Built-in result reference is missing: ${directory.name}`);
        }
        await copyFile(sourceReference, path.join(destinationRoot, record.referenceImage.fileName));
      }
      for (const fileName of ["agent.log", "trajectory.jsonl"]) {
        const sourcePath = path.join(builtinRoot, fileName);
        if (await fileExists(sourcePath)) await copyFile(sourcePath, path.join(destinationRoot, fileName));
      }
      await writeJsonAtomic(recordPath(record.id), record);
    }
  }

  async function updateRecord(id, patch) {
    return runRecordMutation(id, async () => {
      const record = await readRecord(id);
      if (!record) return null;
      Object.assign(record, patch);
      await writeRecordUnlocked(record);
      return record;
    });
  }

  async function listRecords() {
    await mkdir(worldsRoot, { recursive: true });
    const entries = await readdir(worldsRoot, { withFileTypes: true });
    const records = (
      await Promise.all(entries.filter((entry) => entry.isDirectory()).map((entry) => readRecord(entry.name)))
    ).filter(Boolean);
    return records.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async function nonemptyArtifact(filePath, freshnessFloor = Number.NEGATIVE_INFINITY) {
    try {
      const metadata = await stat(filePath);
      return metadata.isFile() && metadata.size > 0 && metadata.mtimeMs >= freshnessFloor;
    } catch {
      return false;
    }
  }

  async function pngArtifact(filePath, freshnessFloor = Number.NEGATIVE_INFINITY) {
    if (!await nonemptyArtifact(filePath, freshnessFloor)) return false;
    try {
      const bytes = await readFile(filePath);
      return bytes.length > 8 && bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
    } catch {
      return false;
    }
  }

  async function sourceHash(filePath) {
    try {
      return `sha256:${createHash("sha256").update(await readFile(filePath)).digest("hex")}`;
    } catch {
      return null;
    }
  }

  function canonicalJson(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }

  function hashCanonicalJson(value) {
    return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
  }

  function expectedRequiredRoutes(executionPlan) {
    const requirements = executionPlan?.traversal?.connectivityRequirements;
    if (!Array.isArray(requirements)) return null;
    return requirements.map((requirement) => ({
      constraintId: requirement?.constraintId,
      routeId: requirement?.routeId,
      traversingEntityId: requirement?.traversingEntityId,
      startAnchorEntityId: requirement?.startAnchorEntityId,
      destinationAnchorEntityId: requirement?.destinationAnchorEntityId,
    })).sort((left, right) =>
      String(left.constraintId) < String(right.constraintId)
        ? -1
        : String(left.constraintId) > String(right.constraintId)
        ? 1
        : String(left.routeId) < String(right.routeId)
        ? -1
        : String(left.routeId) > String(right.routeId)
        ? 1
        : 0
    );
  }

  async function hasTrustedRouteValidationArtifacts(
    artifactRoot,
    sceneId,
    builderCheck,
    build,
    authoringHash,
    freshnessFloor,
  ) {
    if (builderCheck.requiresTrustedRouteValidation !== true) return true;
    const manifestPath = path.join(artifactRoot, "route-validation-manifest.json");
    if (!await nonemptyArtifact(manifestPath, freshnessFloor)) return false;
    const manifest = await readJsonIfPresent(manifestPath);
    if (
      manifest?.kind !== "worldkit-route-validation-manifest" ||
      manifest.schemaVersion !== 1 ||
      manifest.sceneId !== sceneId ||
      !/^route-validation\.[0-9]{8}-[0-9]{6}-[0-9]+\.json$/.test(
        manifest.reportFileName ?? "",
      ) ||
      !/^sha256:[a-f0-9]{64}$/.test(manifest.reportContentHash ?? "")
    ) return false;
    const reportPath = path.join(artifactRoot, manifest.reportFileName);
    if (!await nonemptyArtifact(reportPath, freshnessFloor)) return false;
    const [reportBytes, report] = await Promise.all([
      readFile(reportPath).catch(() => null),
      readJsonIfPresent(reportPath),
    ]);
    if (
      reportBytes === null ||
      reportBytes.toString("utf8") !== `${canonicalJson(report)}\n` ||
      `sha256:${createHash("sha256").update(reportBytes).digest("hex")}` !==
        manifest.reportContentHash ||
      report?.kind !== "worldkit-validation-report" ||
      report.schemaVersion !== 2 ||
      report.status !== "passed"
    ) return false;
    const executionPlan = build.executionPlan;
    const requiredRoutes = expectedRequiredRoutes(executionPlan);
    if (
      requiredRoutes === null ||
      requiredRoutes.length === 0 ||
      hashCanonicalJson(executionPlan) !== build.executionPlanHash ||
      hashCanonicalJson(build.normalizedWorldIr) !== build.normalizedWorldIrHash ||
      executionPlan.authoringSpecHash !== authoringHash
    ) return false;
    const subject = report.subject;
    const receipt = report.routeValidationSetReceipt;
    const expectedIdentity = {
      authoringSpecHash: executionPlan.authoringSpecHash,
      normalizedWorldIrHash: build.normalizedWorldIrHash,
      executionPlanHash: build.executionPlanHash,
      resourceLockHash: executionPlan.resourceLockHash,
      layoutSolveReportHash: executionPlan.layout?.layoutSolveReportHash,
    };
    for (const [field, expected] of Object.entries(expectedIdentity)) {
      if (!/^sha256:[a-f0-9]{64}$/.test(expected ?? "")) return false;
      if (subject?.[field] !== expected || receipt?.[field] !== expected) return false;
    }
    const expectedSetHash = hashCanonicalJson({
      kind: "route-validation-required-route-set",
      schemaVersion: 1,
      executionPlanHash: build.executionPlanHash,
      requiredRoutes,
    });
    if (
      receipt.requiredRouteCount !== requiredRoutes.length ||
      receipt.requiredRouteSetHash !== expectedSetHash ||
      canonicalJson(receipt.requiredRoutes) !== canonicalJson(requiredRoutes) ||
      !Array.isArray(receipt.rows) ||
      receipt.rows.length !== requiredRoutes.length
    ) return false;
    for (const [index, requiredRoute] of requiredRoutes.entries()) {
      const row = receipt.rows[index];
      if (
        row?.constraintId !== requiredRoute.constraintId ||
        row.routeId !== requiredRoute.routeId ||
        row.traversingEntityId !== requiredRoute.traversingEntityId ||
        row.startAnchorEntityId !== requiredRoute.startAnchorEntityId ||
        row.destinationAnchorEntityId !== requiredRoute.destinationAnchorEntityId ||
        row.connectivityStatus !== "complete" ||
        row.runtimeStatus !== "complete"
      ) return false;
    }
    return report.gateResultsById?.["route-connectivity"]?.status === "passed" &&
      report.gateResultsById?.["route-runtime-conformance"]?.status === "passed";
  }

  async function hasTrustedWhiteboxArtifacts(artifactRoot, sceneId, freshnessFloor = Number.NEGATIVE_INFINITY) {
    const paths = {
      brief: path.join(artifactRoot, "scene-brief.md"),
      plannerCheck: path.join(artifactRoot, "planner-self-check.json"),
      palette: path.join(artifactRoot, "visual-identity-palette.json"),
      authoring: path.join(artifactRoot, "authoring.json"),
      mapDraft: path.join(artifactRoot, "implementation-map.draft.json"),
      builderCheck: path.join(artifactRoot, "builder-self-check.json"),
      implementationMap: path.join(artifactRoot, "scene-implementation-map.json"),
      build: path.join(artifactRoot, "world.build.json"),
      openingFrame: path.join(artifactRoot, "opening-frame.png"),
      snapshot: path.join(artifactRoot, "runtime-snapshot.json"),
      captureTargets: path.join(artifactRoot, "triviews", "capture-targets.json"),
    };
    if (!(await Promise.all(Object.values(paths).map((filePath) =>
      nonemptyArtifact(filePath, freshnessFloor)))).every(Boolean)) return false;
    if (!await pngArtifact(paths.openingFrame, freshnessFloor)) return false;

    const [
      brief,
      plannerCheck,
      palette,
      authoring,
      builderCheck,
      implementationMap,
      build,
      snapshot,
      captureTargets,
      briefHash,
      authoringHash,
      mapDraftHash,
    ] = await Promise.all([
      readFile(paths.brief, "utf8").catch(() => null),
      readJsonIfPresent(paths.plannerCheck),
      readJsonIfPresent(paths.palette),
      readJsonIfPresent(paths.authoring),
      readJsonIfPresent(paths.builderCheck),
      readJsonIfPresent(paths.implementationMap),
      readJsonIfPresent(paths.build),
      readJsonIfPresent(paths.snapshot),
      readJsonIfPresent(paths.captureTargets),
      sourceHash(paths.brief),
      sourceHash(paths.authoring),
      sourceHash(paths.mapDraft),
    ]);
    if (
      typeof brief !== "string" || !brief.startsWith("# WorldKit Scene Brief") ||
      plannerCheck?.kind !== "worldkit-planner-self-check" || plannerCheck.schemaVersion !== 1 ||
      plannerCheck.validatorVersion !== "worldkit-planner-self-check-v1" ||
      plannerCheck.sceneId !== sceneId || plannerCheck.status !== "passed" ||
      plannerCheck.inputs?.sceneBriefHash !== briefHash ||
      palette?.kind !== "worldkit-visual-identity-palette" || palette.schemaVersion !== 1 ||
      palette.sceneId !== sceneId || !/^sha256:[a-f0-9]{64}$/.test(palette.sceneBriefHash ?? "") ||
      !Array.isArray(palette.targets) || palette.targets.length === 0 || palette.targets.length > 5 ||
      authoring?.kind !== "worldkit-authoring-spec" || authoring.schemaVersion !== 4 ||
      typeof authoring.id !== "string" || !idPattern.test(authoring.id) ||
      builderCheck?.kind !== "worldkit-builder-self-check" || builderCheck.schemaVersion !== 1 ||
      builderCheck.validatorVersion !== "worldkit-builder-self-check-v4" ||
      builderCheck.sceneId !== sceneId || builderCheck.status !== "passed" ||
      builderCheck.inputs?.sceneBriefHash !== briefHash ||
      builderCheck.inputs?.authoringSpecHash !== authoringHash ||
      builderCheck.inputs?.implementationMapDraftHash !== mapDraftHash ||
      implementationMap?.kind !== "worldkit-scene-brief-implementation-map" ||
      implementationMap.schemaVersion !== 1 || implementationMap.sceneId !== sceneId ||
      implementationMap.sceneBriefHash !== palette.sceneBriefHash ||
      !/^sha256:[a-f0-9]{64}$/.test(implementationMap.authoringSpecHash ?? "") ||
      implementationMap.authoringSpecId !== authoring.id ||
      !Array.isArray(implementationMap.mappings) || implementationMap.mappings.length === 0 ||
      !Array.isArray(implementationMap.visualCaptureGroups) || implementationMap.visualCaptureGroups.length === 0 ||
      build?.kind !== "worldkit-build-artifact" || build.schemaVersion !== 4 ||
      build.executionPlan?.kind !== "worldkit-execution-plan" || build.executionPlan.schemaVersion !== 5 ||
      !/^sha256:[a-f0-9]{64}$/.test(build.executionPlanHash ?? "") ||
      snapshot?.kind !== "worldkit-runtime-snapshot" || snapshot.schemaVersion !== 4 ||
      captureTargets?.kind !== "worldkit-runtime-triview-manifest" || captureTargets.schemaVersion !== 1 ||
      captureTargets.executionPlanHash !== build.executionPlanHash ||
      !Array.isArray(captureTargets.targets) || captureTargets.targets.length === 0 ||
      captureTargets.targets.length > 5
    ) return false;
    if (!await hasTrustedRouteValidationArtifacts(
      artifactRoot,
      sceneId,
      builderCheck,
      build,
      authoringHash,
      freshnessFloor,
    )) return false;

    const paletteTargetIds = palette.targets.map(({ id }) => id);
    const mappingTargetIds = implementationMap.mappings.map(({ visualTargetId }) => visualTargetId);
    const captureGroupTargetIds = implementationMap.visualCaptureGroups.map(({ visualTargetId }) => visualTargetId);
    if (
      new Set(paletteTargetIds).size !== paletteTargetIds.length ||
      [...paletteTargetIds].sort().join(",") !== [...mappingTargetIds].sort().join(",") ||
      [...paletteTargetIds].sort().join(",") !== [...captureGroupTargetIds].sort().join(",")
    ) return false;
    const captureGroupById = new Map(
      implementationMap.visualCaptureGroups.map((group) => [group.id, group]),
    );
    const targetIds = new Set();
    for (const target of captureTargets.targets) {
      const group = captureGroupById.get(target?.id);
      if (
        !idPattern.test(target?.id ?? "") || targetIds.has(target.id) ||
        group === undefined || group.visualTargetId !== target.visualTargetId ||
        JSON.stringify(group.runtimeEntityIds) !== JSON.stringify(target.runtimeEntityIds) ||
        group.role !== target.role || group.semanticClassId !== target.semanticClassId ||
        group.identityColor !== target.identityColor ||
        target.imagePath !== `${target.id}/whitebox-triview.png` ||
        !Array.isArray(target.views) || target.views.join(",") !== "front,right,back" ||
        !await pngArtifact(path.join(artifactRoot, "triviews", target.imagePath), freshnessFloor)
      ) return false;
      targetIds.add(target.id);
    }
    return targetIds.size === captureGroupById.size;
  }

  async function importExistingWorlds() {
    const artifactsRoot = path.join(repoRoot, "artifacts/scenes");
    if (!await fileExists(artifactsRoot)) return;
    const currentRecords = await listRecords();
    const knownSceneIds = new Set(currentRecords.map((record) => record.sceneId));
    const entries = await readdir(artifactsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !idPattern.test(entry.name) || knownSceneIds.has(entry.name)) continue;
      const sceneBriefPath = path.join(artifactsRoot, entry.name, "scene-brief.md");
      const captureTargetsPath = path.join(artifactsRoot, entry.name, "triviews", "capture-targets.json");
      const artifactRoot = path.join(artifactsRoot, entry.name);
      if (!await hasTrustedWhiteboxArtifacts(artifactRoot, entry.name)) continue;
      try {
        const [sceneBrief, metadata] = await Promise.all([
          readFile(sceneBriefPath, "utf8"),
          stat(captureTargetsPath),
        ]);
        const timestamp = metadata.mtime.toISOString();
        await writeRecord({
          id: entry.name,
          sceneId: entry.name,
          title: entry.name,
          prompt: sceneBrief.slice(0, 4_000),
          referenceImage: null,
          status: "ready",
          stage: "ready",
          attempt: 1,
          origin: "existing-scene-brief-world",
          workflowPolicyVersion,
          captureRequired: false,
          captureStatus: "passed",
          outcome: "passed",
          createdAt: timestamp,
          updatedAt: timestamp,
          startedAt: null,
          finishedAt: timestamp,
          error: null,
        });
        knownSceneIds.add(entry.name);
      } catch {}
    }
  }

  async function enrichRecord(record) {
    const scenePlanRoot = path.join(repoRoot, "apps/playground/public/scene-plans", record.sceneId);
    const whiteboxOpeningFrameAvailable = await fileExists(
      path.join(scenePlanRoot, "whitebox-opening-frame.png"),
    );
    const coverCandidates = [
      "whitebox-opening-frame.png",
      "entry-styled-target.png",
      "entry-whitebox-target.png",
      "opening-shot.png",
      "world-plan.png",
    ];
    const canonicalOpeningFrameAvailable = await fileExists(
      path.join(repoRoot, "artifacts/scenes", record.sceneId, "opening-frame.png"),
    );
    const canonicalAuthoringAvailable = await fileExists(
      path.join(repoRoot, "artifacts/scenes", record.sceneId, "authoring.json"),
    );
    let coverUrl = canonicalOpeningFrameAvailable
      ? `/api/worlds/${record.id}/deliverables/opening-frame`
      : record.referenceImage ? `/api/worlds/${record.id}/reference` : null;
    if (!canonicalOpeningFrameAvailable) {
      for (const candidate of coverCandidates) {
        if (await fileExists(path.join(scenePlanRoot, candidate))) {
          coverUrl = `/scene-assets/${record.sceneId}/${candidate}`;
          break;
        }
      }
    }
    return {
      ...record,
      codexBackend: effectiveCodexBackend(record),
      coverUrl,
      referenceUrl: record.referenceImage ? `/api/worlds/${record.id}/reference` : null,
      whiteboxOpeningFrameUrl: whiteboxOpeningFrameAvailable
        ? `/scene-assets/${record.sceneId}/whitebox-opening-frame.png`
        : null,
      previewUrl: canonicalAuthoringAvailable && (record.captureStatus === "passed" || record.status === "ready")
        ? `/play?authoring=1&world=${encodeURIComponent(record.id)}`
        : null,
      queuePosition: record.status === "queued"
        ? queue.findIndex((item) => item.endsWith(`:${record.id}`)) + 1
        : null,
    };
  }

  async function enrichTestSet(record, worldRecords = []) {
    const related = worldRecords.filter((world) => world.testSetId === record.id);
    const latestBatchId = related
      .slice()
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]?.batchId ?? null;
    const latestBatch = latestBatchId === null
      ? []
      : related.filter((world) => world.batchId === latestBatchId);
    const duplicateCount = (record.images ?? []).filter(({ duplicateOf }) => duplicateOf !== null).length;
    const invalidCount = (record.images ?? []).filter(({ integrityError }) => integrityError !== null).length;
    return {
      ...record,
      images: (record.images ?? []).map((image) => ({
        ...image,
        runnable: image.duplicateOf === null && image.integrityError === null,
        url: `/api/test-sets/${record.id}/images/${image.id}`,
      })),
      validation: {
        imageCount: record.images?.length ?? 0,
        runnableCount: (record.images?.length ?? 0) - duplicateCount - invalidCount,
        humanoidWalkingCount: (record.images ?? []).filter((image) =>
          image.duplicateOf === null &&
          image.integrityError === null &&
          (image.labels?.humanoidWalking === true || image.tags?.includes("humanoid-walking"))).length,
        duplicateCount,
        invalidCount,
        ready: invalidCount === 0,
      },
      runSummary: {
        totalWorlds: related.length,
        latestBatchId,
        latestTotal: latestBatch.length,
        latestReady: latestBatch.filter(({ status }) => status === "ready").length,
        latestActive: latestBatch.filter(({ status }) => ["queued", "running"].includes(status)).length,
        latestFailed: latestBatch.filter(({ status }) => ["failed", "interrupted"].includes(status)).length,
        reliability: deriveReliabilityMetrics(
          latestBatch.filter((world) => world.workflowPolicyVersion === workflowPolicyVersion),
        ),
        historicalReliability: deriveReliabilityMetrics(latestBatch),
      },
    };
  }

  async function readJsonIfPresent(filePath) {
    try {
      return JSON.parse(await readFile(filePath, "utf8"));
    } catch {
      return null;
    }
  }

  async function collectDeliverables(record) {
    const definitions = [
      {
        id: "scene-brief", phase: "planner", title: "Scene Brief（非权威意图摘要）",
        description: "参考图驱动的意图摘要；它不替代 WorldSpec、plan-lock 或 Canonical AuthoringSpec。",
        owner: "WorldKit Planner", format: "Markdown",
      },
      {
        id: "planner-self-check", phase: "planner", title: "Planner 自检收据",
        description: "Planner 在同一 Codex Job 内完成 Brief、PNG 和主体居中检查后生成的输入 Hash 与通过状态。",
        owner: "WorldKit Planner", format: "JSON",
      },
      {
        id: "visual-identity-palette", phase: "planner", title: "视觉目标颜色表",
        description: "可信宿主为简报中的 1–5 个完整视觉目标分配稳定 ID 和颜色。",
        owner: "Trusted Host", format: "JSON",
      },
      {
        id: "world-plan", phase: "planner", title: "极简导航俯视图",
        description: "只保留参考图一致的世界布局、初始人物位置和可通行区域/路径。",
        owner: "WorldKit Planner", format: "PNG",
      },
      {
        id: "entry-whitebox-target", phase: "planner", title: "进入构图意图图",
        description: "非权威的进入构图目标。真实白模必须由 Babylon Runtime 捕获，不能由图片生成冒充。",
        owner: "WorldKit Planner", format: "PNG",
      },
      {
        id: "authoring-spec", phase: "coding-agent", title: "Canonical AuthoringSpec V4",
        description: "Builder 面向当前 main 输出的权威场景 JSON。",
        owner: "Coding Agent", format: "JSON",
      },
      {
        id: "implementation-map-draft", phase: "coding-agent", title: "视觉目标实现映射草稿",
        description: "简报视觉目标到实际 runtime entity 的一对多归因。",
        owner: "Coding Agent", format: "JSON",
      },
      {
        id: "builder-self-check", phase: "coding-agent", title: "Builder 自检收据",
        description: "Builder 在同一任务内完成当前 Schema、布局、编译和映射检查后生成的输入哈希与通过状态。",
        owner: "Coding Agent", format: "JSON",
      },
      {
        id: "implementation-map", phase: "canonical-build", title: "已校验 Scene Brief 实现映射",
        description: "包含 Scene Brief 与 AuthoringSpec 哈希的可信映射。",
        owner: "Trusted Host", format: "JSON",
      },
      {
        id: "execution-plan", phase: "canonical-build", title: "ExecutionPlan V5",
        description: "由当前 Canonical compiler 从 Authoring V4 / IR V4 生成的执行计划。",
        owner: "Trusted Host", format: "JSON",
      },
      {
        id: "opening-frame", phase: "runtime-capture", title: "真实运行进入首帧",
        description: "无头 Babylon 从 AuthoringSpec 实际渲染的 PNG。",
        owner: "Babylon Runtime", format: "PNG",
      },
      {
        id: "runtime-snapshot", phase: "runtime-capture", title: "Runtime Snapshot",
        description: "暂停在确定性 tick 的运行状态。",
        owner: "Babylon Runtime", format: "JSON",
      },
      {
        id: "capture-targets", phase: "runtime-capture", title: "白膜三视图清单",
        description: "每个 subject/object 的 Front / Right / Back 捕获索引。",
        owner: "Babylon Runtime", format: "JSON",
      },
      {
        id: "entry-third-person-validation", phase: "entry-alignment-validation", title: "进入构图校验报告",
        description: "使用 Runtime Snapshot V4 与真实白膜首帧验证主体居中、相机目标和正后方对齐。",
        owner: "Trusted Host", format: "JSON",
      },
      {
        id: "visual-generation-prompts", phase: "visual-prompt-synthesis", title: "视觉生成提示词包",
        description: "可配置视觉提供方生成的共享视觉约束、新首帧提示词和逐目标三视图提示词。",
        owner: "Configured Visual Prompt Provider", format: "JSON", optional: record.styledOpeningFrameRequired !== true,
      },
      {
        id: "styled-opening-frame", phase: "visual-imagegen", title: "样式化首帧",
        description: "严格保持白膜地形、空间和相机投影；主体细节、材质、风格与灯光来自用户首帧。",
        owner: "Configured Image Provider", format: "PNG", optional: record.styledOpeningFrameRequired !== true,
      },
      {
        id: "styled-opening-frame-manifest", phase: "visual-imagegen", title: "新首帧素材清单",
        description: "绑定真实白膜首帧、用户首帧、白膜三视图和新首帧，并记录内容哈希。",
        owner: "Trusted Host", format: "JSON", optional: true,
      },
      {
        id: "styled-opening-frame-report", phase: "visual-imagegen", title: "新首帧完成报告",
        description: "记录新首帧流程的完成状态和素材清单哈希。",
        owner: "Trusted Host", format: "JSON", optional: true,
      },
      {
        id: "styled-triviews-manifest", phase: "visual-imagegen", title: "渲染后三视图清单",
        description: "绑定新首帧、每个完整视觉组的白膜三视图与渲染后三视图，并记录内容哈希。",
        owner: "Trusted Host", format: "JSON", optional: record.styledTriviewsRequired !== true,
      },
      {
        id: "styled-triviews-report", phase: "visual-imagegen", title: "渲染后三视图完成报告",
        description: "记录自动生成的视觉组数量和三视图清单哈希。",
        owner: "Trusted Host", format: "JSON", optional: record.styledTriviewsRequired !== true,
      },
      {
        id: "evaluation-run", phase: "input", title: "评测运行清单",
        description: "记录测试集、批次、case、policy 和代码版本。",
        owner: "Creator Studio", format: "JSON",
      },
      {
        id: "evaluation-report", phase: record.styledTriviewsRequired === true
          ? "visual-imagegen"
          : "runtime-capture", title: "评测报告",
        description: "基于结构化 gate 和 capture 结果的最终 passed/failed 判定。",
        owner: "Creator Studio", format: "JSON",
      },
      {
        id: "agent-log", phase: "coding-agent", title: "Agent / 工具日志",
        description: "完整流水线标准输出和错误输出。",
        owner: "Creator Studio", format: "LOG",
      },
      {
        id: "trajectory-events", phase: "coding-agent", title: "阶段事件流",
        description: "可恢复的阶段、重试和结果记录。",
        owner: "Creator Studio", format: "JSONL", optional: true,
      },
    ];
    const deliverables = [];
    if (record.referenceImage) {
      deliverables.push({
        id: "reference",
        phase: "input",
        title: "用户参考图",
        description: "用户上传的原始视觉证据。",
        owner: "User",
        format: record.referenceImage.mimeType,
        status: "available",
        url: `/api/worlds/${record.id}/reference`,
        sizeBytes: record.referenceImage.size,
        updatedAt: record.createdAt,
        optional: true,
      });
    }
    for (const definition of definitions) {
      const resolved = await resolveDeliverable(record, definition.id);
      deliverables.push({
        ...definition,
        status: resolved ? "available" : definition.optional ? "not-needed" : "pending",
        url: resolved ? `/api/worlds/${record.id}/deliverables/${definition.id}` : null,
        sizeBytes: resolved?.metadata.size ?? null,
        updatedAt: resolved?.metadata.mtime.toISOString() ?? null,
      });
    }
    return deliverables;
  }

  async function collectWorldMedia(record) {
    const artifactRoot = path.join(repoRoot, "artifacts/scenes", record.sceneId);
    const planRoot = path.join(repoRoot, "apps/playground/public/scene-plans", record.sceneId);
    const [sceneBrief, captureManifest] = await Promise.all([
      readFile(path.join(artifactRoot, "scene-brief.md"), "utf8").catch(() => null),
      readJsonIfPresent(path.join(artifactRoot, "triviews", "capture-targets.json")),
    ]);
    const planning = [];
    if (record.referenceImage) {
      planning.push({
        kind: "reference", title: "用户参考图", description: "测试 case 的原始视觉证据。",
        prompt: record.prompt, url: `/api/worlds/${record.id}/reference`, available: true,
      });
    }
    if (sceneBrief) {
      planning.push({
        kind: "scene-brief", title: "轻量场景简报",
        description: "运动模式、完整世界、通行意图、首帧与完整视觉目标。",
        prompt: sceneBrief, url: `/api/worlds/${record.id}/deliverables/scene-brief`, available: true,
      });
    }
    for (const item of [
      ["world-plan", "极简导航俯视图", "只显示参考图一致的世界布局、初始人物位置和可通行区域/路径。", "world-plan.png", `/scene-assets/${record.sceneId}/world-plan.png`],
      ["entry-whitebox-target", "标准进入白膜目标", "Planner 规定的可玩进入构图。", "entry-whitebox-target.png", `/scene-assets/${record.sceneId}/entry-whitebox-target.png`],
      ["opening-frame", "实际运行进入首帧", "Canonical JSON 经 Babylon 真实渲染后的结果。", "opening-frame.png", `/api/worlds/${record.id}/deliverables/opening-frame`],
      ["styled-opening-frame", "最终样式化首帧", "白膜投影锁空间，用户首帧锁身份、材质、风格和灯光。", "styled-opening-frame.png", `/api/worlds/${record.id}/deliverables/styled-opening-frame`],
    ]) {
      const [kind, title, description, fileName, url] = item;
      const filePath = ["opening-frame", "styled-opening-frame"].includes(kind)
        ? path.join(artifactRoot, fileName)
        : path.join(planRoot, fileName);
      const available = await fileExists(filePath);
      planning.push({ kind, title, description, prompt: null, url: available ? url : null, available });
    }
    const prototypes = [];
    for (const target of captureManifest?.targets ?? []) {
      if (!idPattern.test(target?.id)) continue;
      const imagePath = path.join(artifactRoot, "triviews", target.id, "whitebox-triview.png");
      const styledImagePath = path.join(artifactRoot, "triviews", target.id, "styled-triview.png");
      const available = await fileExists(imagePath);
      const styledAvailable = await fileExists(styledImagePath);
      prototypes.push({
        id: target.id,
        role: target.role,
        semantic: target.semanticClassId,
        description: "Complete visual group Front / Right / Back whitebox capture.",
        appearancePrompt: null,
        negativePrompt: null,
        instanceColor: target.identityColor ?? null,
        approximateSize: null,
        memberCount: Array.isArray(target.runtimeEntityIds) ? target.runtimeEntityIds.length : 1,
        consistencyRationale: null,
        whiteboxUrl: available ? `/api/worlds/${record.id}/triviews/${target.id}` : null,
        styledUrl: styledAvailable ? `/api/worlds/${record.id}/styled-triviews/${target.id}` : null,
      });
    }
    const helpers = [];
    const deliverables = await collectDeliverables(record, null);
    for (const prototype of prototypes) {
      for (const [kind, title, url] of [
        ["whitebox-triview", "白膜三视图", prototype.whiteboxUrl],
        ["styled-triview", "渲染后三视图", prototype.styledUrl],
      ]) {
        const styled = kind === "styled-triview";
        const optional = styled && record.styledTriviewsRequired !== true;
        deliverables.push({
          id: `${prototype.id}-${kind}`,
          phase: styled ? "visual-imagegen" : "runtime-capture",
          title: `${prototype.id} · ${title}`,
          description: styled
            ? "以可配置视觉约束锁定外观、以真实 Babylon 白模三视图锁定结构的 Front / Right / Back 对照图。"
            : `SDK 从完整视觉组的 ${prototype.memberCount ?? 1} 个运行实体联合捕获的 Front / Right / Back 结构对照图。`,
          owner: styled ? "Configured Image Provider" : "Babylon Runtime",
          format: "PNG",
          status: url ? "available" : optional ? "not-needed" : "pending",
          url,
          sizeBytes: null,
          updatedAt: null,
          optional,
        });
      }
    }
    const availableIds = deliverables
      .filter(({ status }) => status === "available")
      .map(({ id }) => id);
    const stages = deriveWorkflowTrajectory({ record, availableIds });
    const storedEvents = await readTrajectoryEvents(record.id);
    let rawAgentLog = "";
    try { rawAgentLog = await readFile(logPath(record.id), "utf8"); } catch {}
    const workflowMetrics = deriveWorkflowMetrics({
      record, stages, events: storedEvents, deliverables, rawLog: rawAgentLog,
    });
    return {
      planning,
      prototypes,
      helpers,
      deliverables,
      trajectory: {
        stages: stages.map((stage) => ({ ...stage, ...workflowMetrics.byStage[stage.id] })),
        events: storedEvents,
        source: "recorded",
        summary: workflowMetrics.summary,
      },
      composition: null,
      availableImageCount: planning.filter(({ available }) => available).length +
        prototypes.reduce((count, prototype) =>
          count + Number(Boolean(prototype.whiteboxUrl)) + Number(Boolean(prototype.styledUrl)), 0),
    };
  }

  async function appendJobLog(id, text) {
    await appendFile(logPath(id), text, "utf8");
  }

  function consumeOutput(id, source, chunk, state) {
    const text = chunk.toString("utf8");
    runBackgroundTask(id, "append-job-log", () => appendJobLog(id, `[${source}] ${text}`));
    state.buffer += text;
    const lines = state.buffer.split(/\r?\n/);
    state.buffer = lines.pop() ?? "";
    for (const line of lines) {
      const match = /^WORLDKIT_STAGE ([a-z-]+)$/.exec(line.trim());
      if (match) {
        const persistedStage = canonicalWorkflowStage(match[1], {
          styledTriviewsRequired: true,
        });
        runBackgroundTask(id, "persist-stage", () => updateRecord(id, { stage: persistedStage }));
        if (match[1] === "ready") {
          runBackgroundTask(id, "append-stage-completed", () => appendTrajectoryEvent(id, persistedStage, "Canonical 构建与 Babylon 运行捕获已完成。", { kind: "completed" }));
        } else {
          runBackgroundTask(id, "append-stage-started", () => appendTrajectoryEvent(id, persistedStage, `流水线进入 ${persistedStage} 阶段。`, { kind: "started" }));
        }
        continue;
      }
      const promptBundle = /^WORLDKIT_GEMINI_PROMPTS_READY ([a-z0-9.-]+)$/.exec(line.trim());
      if (promptBundle) {
        runBackgroundTask(id, "append-prompt-ready", () => appendTrajectoryEvent(
          id,
          "visual-prompt-synthesis",
          `视觉提示词提供方已生成共享视觉约束、新首帧提示词和全部三视图提示词：${promptBundle[1]}。`,
          { kind: "completed" },
        ));
        continue;
      }
      const directImage = /^WORLDKIT_DIRECT_IMAGEGEN_IMAGE (.+)$/.exec(line.trim());
      if (directImage) {
        runBackgroundTask(id, "append-image-progress", () => appendTrajectoryEvent(
          id,
          "visual-imagegen",
          `图片提供方已完成 ${directImage[1]}。`,
          { kind: "progress" },
        ));
        continue;
      }
      const directImageReady = /^WORLDKIT_DIRECT_IMAGEGEN_READY count=([0-9]+)$/.exec(line.trim());
      if (directImageReady) {
        runBackgroundTask(id, "append-image-ready", () => appendTrajectoryEvent(
          id,
          "visual-imagegen",
          `图片生成任务已完成，共 ${directImageReady[1]} 张图片。`,
          { kind: "completed", itemCount: Number(directImageReady[1]) },
        ));
        continue;
      }
      const usage = /^WORLDKIT_STAGE_USAGE ([a-z-]+) ([0-9]+)$/.exec(line.trim());
      if (usage) {
        const tokenCount = Number(usage[2]);
        runBackgroundTask(id, "append-stage-usage", () => appendTrajectoryEvent(
          id,
          usage[1],
          `${usage[1]} 阶段使用 ${tokenCount.toLocaleString("en-US")} Token。`,
          { kind: "usage", tokenCount },
        ));
        continue;
      }
      const cloudCodexJob = /^WORLDKIT_LWDP_JOB ([a-z-]+) ([a-z0-9-]+) (gen_[a-zA-Z0-9]+)$/.exec(line.trim());
      if (cloudCodexJob) {
        runBackgroundTask(id, "append-codex-job", () => appendTrajectoryEvent(
          id,
          cloudCodexJob[1],
          `LWDP 云端 Codex 任务 ${cloudCodexJob[2]} 已提交：${cloudCodexJob[3]}。`,
          { kind: "cloud-job", jobId: cloudCodexJob[3], taskId: cloudCodexJob[2] },
        ));
        continue;
      }
      const localCodexJob = /^WORLDKIT_LOCAL_CODEX_JOB ([a-z-]+) ([a-zA-Z0-9._:-]+)(?:\s+.*)?$/.exec(line.trim());
      if (localCodexJob) {
        runBackgroundTask(id, "append-local-codex-job", () => appendTrajectoryEvent(
          id,
          localCodexJob[1],
          `本地 Codex 任务 ${localCodexJob[2]} 已启动。`,
          { kind: "local-job", taskId: localCodexJob[2] },
        ));
        continue;
      }
      const cloudImageJob = /^WORLDKIT_LWDP_IMAGE_JOB ([a-z-]+) (gen_[a-zA-Z0-9]+) items=([0-9]+)$/.exec(line.trim());
      if (cloudImageJob) {
        runBackgroundTask(id, "append-image-job", () => appendTrajectoryEvent(
          id,
          cloudImageJob[1],
          `LWDP T2I Job ${cloudImageJob[2]} 已提交，包含 ${cloudImageJob[3]} 个并发 item。`,
          { kind: "cloud-job", jobId: cloudImageJob[2], itemCount: Number(cloudImageJob[3]) },
        ));
        continue;
      }
        const agentRetry = /^WORLDKIT_AGENT_RETRY ([a-z-]+) ([0-9]+) ([0-9]+)$/.exec(line.trim());
      if (agentRetry) {
        const retryStage = agentRetry[1].includes("builder") || agentRetry[1] === "coding-agent"
          ? "coding-agent"
          : agentRetry[1].includes("visual") || agentRetry[1].includes("triview")
            ? "visual-imagegen"
            : "planner";
        runBackgroundTask(id, "append-agent-retry", () => appendTrajectoryEvent(
          id,
          retryStage,
          `Agent 调用遇到瞬时连接故障，自动重试 ${agentRetry[2]}/${agentRetry[3]}；不消耗质量修复次数。`,
          { kind: "retry", attempt: Number(agentRetry[2]), limit: Number(agentRetry[3]) },
        ));
        continue;
      }
      const repair = /^WORLDKIT_PLANNER_REPAIR ([0-9]+)$/.exec(line.trim());
      if (repair) {
        runBackgroundTask(id, "append-planner-repair", () => appendTrajectoryEvent(
          id,
          "planner",
          `可信校验未通过，Planner 开始第 ${repair[1]} 次自动修复。`,
          { kind: "repair", attempt: Number(repair[1]) },
        ));
        continue;
      }
      const builderRepair = /^WORLDKIT_BUILDER_REPAIR ([0-9]+)$/.exec(line.trim());
      if (builderRepair) {
        runBackgroundTask(id, "append-builder-repair", () => appendTrajectoryEvent(
          id,
          "coding-agent",
          `可信校验未通过，Builder 开始第 ${builderRepair[1]} 次自动修复。`,
          { kind: "repair", attempt: Number(builderRepair[1]) },
        ));
        continue;
      }
    }
  }

  async function runJob(id) {
    const record = await readRecord(id);
    if (!record || shuttingDown || stoppingJobs.has(id)) return;
    const codexBackend = effectiveCodexBackend(record);
    const attempt = (record.attempt ?? 0) + 1;
    const styledOpeningFrameRequired = record.referenceImage !== null;
    const styledTriviewsRequired = record.referenceImage !== null;
    await writeFile(logPath(id), `WorldKit Creator Studio\nscene=${record.sceneId}\nattempt=${attempt}\n\n`, "utf8");
    if (shuttingDown || stoppingJobs.has(id)) return;
    const startedAt = new Date().toISOString();
    await updateRecord(id, {
      status: "running",
      stage: "preparing",
      codexBackend,
      workflowPolicyVersion,
      attempt,
      startedAt,
      finishedAt: null,
      error: null,
      failedStage: null,
      runtimeCaptureAttempts: 0,
      captureError: null,
      captureStatus: "pending",
      outcome: null,
      styledOpeningFrameRequired,
      styledOpeningFrameStatus: styledOpeningFrameRequired ? "pending" : "not-required",
      styledTriviewsRequired,
      styledTriviewsStatus: styledTriviewsRequired ? "pending" : "not-required",
    });
    await appendTrajectoryEvent(
      id,
      "preparing",
      `第 ${attempt} 次生成开始，使用${codexBackend === "cloud" ? "云端 LWDP" : "本地"} Codex，准备隔离任务环境。`,
      { kind: "started", codexBackend },
    );

    const artifactRoot = path.join(repoRoot, "artifacts/scenes", record.sceneId);
    await mkdir(artifactRoot, { recursive: true });
    const sourceRevision = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: repoRoot, encoding: "utf8",
    }).stdout.trim() || "unknown";
    const caseHash = `sha256:${createHash("sha256").update(JSON.stringify({
      prompt: record.prompt,
      referenceImageHash: record.referenceImage?.contentSha256 ?? null,
      codexBackend,
      workflowPolicyVersion,
    })).digest("hex")}`;
    await writeJsonAtomic(path.join(artifactRoot, "evaluation-run.json"), {
      kind: "worldkit-evaluation-run",
      schemaVersion: 1,
      caseId: record.id,
      caseHash,
      sceneId: record.sceneId,
      workflowPolicyVersion,
      sourceRevision,
      attempt,
      origin: record.origin,
      testSetId: record.testSetId ?? null,
      testSetImageId: record.testSetImageId ?? null,
      batchId: record.batchId ?? null,
      codexBackend,
      startedAt,
    });

    const args = ["agent:world", "--", "--scene-id", record.sceneId];
    if (record.referenceImage) args.push("--image", path.join(worldsRoot, id, record.referenceImage.fileName));
    args.push(record.prompt);

    await appendJobLog(
      id,
      `Launching ${codexBackend === "cloud" ? "LWDP cloud" : "local"} Codex: hosted Planner (Brief + built-in imagegen) → Canonical Builder; trusted Host validates Authoring V4 / IR V4 / Plan V5 and performs Babylon capture; configured visual adapters may generate optional styled outputs.\n`,
    );
    await beforeWorldSpawn(id);
    if (shuttingDown || stoppingJobs.has(id)) return;
    const child = worldSpawnImplementation("pnpm", args, {
      cwd: repoRoot,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        NO_COLOR: "1",
        WORLDKIT_CODEX_BACKEND: codexBackend,
      },
      shell: false,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    activeChildren.set(id, child);
    const stdout = { buffer: "" };
    const stderr = { buffer: "" };
    child.stdout.on("data", (chunk) => consumeOutput(id, "stdout", chunk, stdout));
    child.stderr.on("data", (chunk) => consumeOutput(id, "stderr", chunk, stderr));

    const exit = await new Promise((resolve) => {
      child.once("error", (error) => resolve({ code: -1, error }));
      child.once("close", (code, signal) => resolve({ code: code ?? -1, signal }));
    });
    activeChildren.delete(id);
    if (stdout.buffer) await appendJobLog(id, `[stdout] ${stdout.buffer}\n`);
    if (stderr.buffer) await appendJobLog(id, `[stderr] ${stderr.buffer}\n`);

    if (stoppingJobs.has(id)) return;

    if (shuttingDown) {
      const latestRecord = await readRecord(id);
      await updateRecord(id, {
        status: "interrupted",
        stage: "interrupted",
        failedStage: latestRecord?.stage ?? "preparing",
        finishedAt: new Date().toISOString(),
        error: "Creator Studio stopped while this world was being generated.",
        captureStatus: "not-run",
        outcome: "failed",
      });
      await appendTrajectoryEvent(id, "interrupted", "Creator Studio 停止，运行中的任务被标记为中断。", { kind: "failed" });
      return;
    }

    const requiredArtifacts = [
      "scene-brief.md",
      "planner-self-check.json",
      "visual-identity-palette.json",
      "authoring.json",
      "builder-self-check.json",
      "scene-implementation-map.json",
      "world.build.json",
      "opening-frame.png",
      "runtime-snapshot.json",
      path.join("triviews", "capture-targets.json"),
      "entry-third-person-validation.json",
    ];
    if (styledOpeningFrameRequired) {
      requiredArtifacts.push("visual-generation-prompts.json", "styled-opening-frame.png");
    }
    if (styledTriviewsRequired) {
      requiredArtifacts.push("styled-triviews-manifest.json", "styled-triviews-report.json");
      const captureManifest = await readJsonIfPresent(
        path.join(artifactRoot, "triviews", "capture-targets.json"),
      );
      for (const target of captureManifest?.targets ?? []) {
        if (idPattern.test(target?.id)) {
          requiredArtifacts.push(path.join("triviews", target.id, "styled-triview.png"));
        }
      }
    }
    const freshnessFloor = Date.parse(startedAt) - 1_000;
    const artifactGates = Object.fromEntries(await Promise.all(requiredArtifacts.map(async (relativePath) => {
      try {
        const metadata = await stat(path.join(artifactRoot, relativePath));
        return [relativePath, metadata.isFile() && metadata.size > 0 && metadata.mtimeMs >= freshnessFloor];
      } catch {
        return [relativePath, false];
      }
    })));
    const artifactsComplete = Object.values(artifactGates).every(Boolean);
    const finishedAt = new Date().toISOString();
    if (exit.code === 0 && artifactsComplete) {
      await updateRecord(id, {
        status: "ready",
        stage: "ready",
        captureRequired: false,
        runtimeCaptureAttempts: 0,
        captureError: null,
        captureStatus: "passed",
        outcome: "passed",
        whiteboxOutcome: "passed",
        styledOpeningFrameStatus: styledOpeningFrameRequired ? "passed" : "not-required",
        styledTriviewsStatus: styledTriviewsRequired ? "passed" : "not-required",
        finishedAt,
        error: null,
      });
      await writeJsonAtomic(path.join(artifactRoot, "evaluation-report.json"), {
        kind: "worldkit-evaluation-report",
        schemaVersion: 1,
        caseId: record.id,
        caseHash,
        workflowPolicyVersion,
        attempt,
        codexBackend,
        outcome: "passed",
        whiteboxOutcome: "passed",
        gates: artifactGates,
        finishedAt,
      });
      await appendJobLog(id, "\nWorld generation completed after trusted Babylon capture and optional visual-provider outputs.\n");
      await appendTrajectoryEvent(id, "runtime-capture", "进入首帧、运行快照与实体白膜三视图均已生成。", { kind: "completed" });
      await appendTrajectoryEvent(id, "entry-alignment-validation", "真实首帧与 Runtime Snapshot V4 的第三人称进入构图校验已通过。", { kind: "completed" });
      if (styledOpeningFrameRequired) {
        await appendTrajectoryEvent(id, "visual-prompt-synthesis", "视觉提示词提供方已依据用户首帧、真实白模首帧和白模三视图固化共享视觉约束。", { kind: "completed" });
      }
      if (styledTriviewsRequired) {
        await appendTrajectoryEvent(id, "visual-imagegen", "图片提供方已生成新首帧和全部视觉组的渲染后三视图。", { kind: "completed" });
      }
      return;
    }

    const entryValidation = await readJsonIfPresent(
      path.join(artifactRoot, "entry-third-person-validation.json"),
    );
    const entryFailure = entryValidation?.status === "failed"
      ? (entryValidation.diagnostics ?? [])
        .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
        .join("; ")
      : "";
    const reason = entryFailure
      ? `Entry third-person validation failed: ${entryFailure}`
      : exit.error instanceof Error
      ? exit.error.message
      : exit.code === 0
        ? `World generation omitted required artifacts: ${Object.entries(artifactGates).filter(([, passed]) => !passed).map(([name]) => name).join(", ")}.`
        : `World generation exited with code ${exit.code}${exit.signal ? ` (${exit.signal})` : ""}.`;
    const latestRecord = await readRecord(id);
    await updateRecord(id, {
      status: "failed",
      stage: exit.code === 3 ? "change-requested" : "failed",
      failedStage: latestRecord?.stage ?? "preparing",
      finishedAt,
      error: reason,
      captureStatus: artifactGates["opening-frame.png"] && artifactGates[path.join("triviews", "capture-targets.json")]
        ? "passed"
        : "failed",
      outcome: "failed",
    });
    await writeJsonAtomic(path.join(artifactRoot, "evaluation-report.json"), {
      kind: "worldkit-evaluation-report",
      schemaVersion: 1,
      caseId: record.id,
      caseHash,
      workflowPolicyVersion,
      attempt,
      codexBackend,
      outcome: "failed",
      gates: artifactGates,
      error: reason,
      finishedAt,
    });
    await appendJobLog(id, `\n${reason}\n`);
    await appendTrajectoryEvent(
      id,
      exit.code === 3 ? "change-requested" : "failed",
      reason,
      { kind: "failed" },
    );
  }

  function queueItem(id, backend) {
    return `world:${normalizedCodexBackend(backend, "cloud")}:${id}`;
  }

  function parseQueueItem(item) {
    const match = /^world:(cloud|local):([a-z0-9-]+)$/.exec(item);
    return match ? { backend: match[1], id: match[2] } : null;
  }

  function activeCountForBackend(backend) {
    return [...activeJobBackends.values()].filter((value) => value === backend).length;
  }

  function queuedCountForBackend(backend) {
    return queue.filter((item) => parseQueueItem(item)?.backend === backend).length;
  }

  function terminateChild(child) {
    if (!child || child.killed) return false;
    if (process.platform !== "win32" && Number.isSafeInteger(child.pid)) {
      try {
        process.kill(-child.pid, "SIGTERM");
        return true;
      } catch (error) {
        if (error?.code !== "ESRCH") throw error;
      }
    }
    return child.kill("SIGTERM");
  }

  function pumpQueue() {
    if (!autoRunJobs || shuttingDown) return;
    for (;;) {
      const queueIndex = queue.findIndex((item) => {
        const parsed = parseQueueItem(item);
        return parsed !== null &&
          activeCountForBackend(parsed.backend) < maxConcurrentJobsByBackend[parsed.backend];
      });
      if (queueIndex < 0) return;
      const [item] = queue.splice(queueIndex, 1);
      const parsed = parseQueueItem(item);
      if (parsed === null || activeJobs.has(parsed.id)) continue;
      const { backend, id } = parsed;
      activeJobs.add(id);
      activeJobBackends.set(id, backend);
      const executeJob = typeof options.jobRunner === "function" ? options.jobRunner : runJob;
      runBackgroundTask(id, "execute-queued-job", async () => {
        try {
          await executeJob(id);
        } catch (error) {
          if (!stoppingJobs.has(id)) {
            const latest = await readRecord(id);
            const finishedAt = new Date().toISOString();
            await updateRecord(id, {
              status: "failed",
              stage: "failed",
              failedStage: latest?.stage ?? "preparing",
              finishedAt,
              error: error instanceof Error ? error.message : String(error),
              captureStatus: "failed",
              outcome: "failed",
            });
          }
        } finally {
          activeJobs.delete(id);
          activeJobBackends.delete(id);
          activeChildren.delete(id);
          stoppingJobs.delete(id);
          pumpQueue();
        }
      });
    }
  }

  function enqueue(id, backend) {
    const key = queueItem(id, backend);
    if (!activeJobs.has(id) && !queue.includes(key)) queue.push(key);
    pumpQueue();
  }

  async function cancelRemoteLwdpJob(record) {
    if (effectiveCodexBackend(record) !== "cloud") return { requested: false, jobId: null };
    const rawLog = await readFile(logPath(record.id), "utf8").catch(() => "");
    const matches = [...rawLog.matchAll(/WORLDKIT_LWDP_JOB\s+[^\s]+\s+[^\s]+\s+(gen_[a-zA-Z0-9]+)/g)];
    const jobId = matches.at(-1)?.[1] ?? null;
    if (jobId === null) return { requested: false, jobId: null };
    try {
      const config = await loadLwdpGenerationConfig();
      const response = await cancelGenerationJob(jobId, { config, maxAttempts: 1 });
      const job = response?.job ?? response;
      return { requested: true, jobId, status: String(job?.status ?? "cancel-requested") };
    } catch (error) {
      return {
        requested: true,
        jobId,
        status: "cancel-request-failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async function createQueuedWorld({
    title,
    prompt,
    image = null,
    origin = "creator-studio",
    testSetId = null,
    testSetImageId = null,
    batchId = null,
    codexBackend = selectedCodexBackend,
  }, existingIds) {
    const ids = existingIds ?? new Set((await listRecords()).map((record) => record.id));
    const id = createSceneId(title, ids);
    ids.add(id);
    const directory = path.join(worldsRoot, id);
    await mkdir(directory, { recursive: false });
    let referenceImage = null;
    if (image) {
      const fileName = `reference.${image.extension}`;
      await writeFile(path.join(directory, fileName), image.bytes, { flag: "wx" });
      referenceImage = {
        fileName,
        mimeType: image.mimeType,
        originalName: image.originalName,
        size: image.bytes.length,
        contentSha256: image.contentSha256,
      };
    }
    const timestamp = new Date().toISOString();
    const record = {
      id,
      sceneId: id,
      title,
      prompt,
      referenceImage,
      status: "queued",
      stage: "queued",
      codexBackend,
      attempt: 0,
      origin,
      ...(testSetId === null ? {} : { testSetId }),
      ...(testSetImageId === null ? {} : { testSetImageId }),
      ...(batchId === null ? {} : { batchId }),
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: null,
      finishedAt: null,
      error: null,
      captureRequired: true,
      captureStatus: "pending",
      outcome: null,
      styledOpeningFrameRequired: referenceImage !== null,
      styledOpeningFrameStatus: referenceImage === null ? "not-required" : "pending",
      styledTriviewsRequired: referenceImage !== null,
      styledTriviewsStatus: referenceImage === null ? "not-required" : "pending",
      workflowPolicyVersion,
    };
    await writeRecord(record);
    const codexQueueLabel = codexBackend === "cloud" ? "LWDP 云端" : "本地";
    await appendTrajectoryEvent(id, "queued", testSetId === null
      ? `任务已创建并进入${codexQueueLabel} Codex 并发队列。`
      : `测试集 ${testSetId} 的图片任务已进入${codexQueueLabel} Codex 并发队列。`,
    { kind: "queued", codexBackend });
    enqueue(id, codexBackend);
    return record;
  }

  async function recoverGeneratedStyledOutputs(record) {
    if (
      record.workflowPolicyVersion !== workflowPolicyVersion ||
      !["interrupted", "running"].includes(record.status) ||
      /alignment.{0,24}(?:fail|error)|(?:fail|error).{0,24}alignment|视觉.{0,12}(?:失败|未通过)/i.test(record.error ?? "") ||
      ![record.failedStage, record.stage].some((stage) =>
        ["visual-prompt-synthesis", "visual-imagegen"].includes(stage))
    ) return false;
    const artifactRoot = path.join(repoRoot, "artifacts/scenes", record.sceneId);
    const startedAtMs = Date.parse(record.startedAt ?? "");
    if (!Number.isFinite(startedAtMs)) return false;
    const freshnessFloor = startedAtMs - 1_000;
    if (!await hasTrustedWhiteboxArtifacts(artifactRoot, record.sceneId, freshnessFloor)) return false;
    const required = [
      "visual-generation-prompts.json",
      "styled-opening-frame.png",
    ];
    if (record.referenceImage !== null) {
      required.push(
        "styled-opening-frame-manifest.json",
        "styled-opening-frame-report.json",
        "styled-triviews-manifest.json",
        "styled-triviews-report.json",
      );
      const captureManifest = await readJsonIfPresent(
        path.join(artifactRoot, "triviews", "capture-targets.json"),
      );
      for (const target of captureManifest?.targets ?? []) {
        if (idPattern.test(target?.id)) {
          required.push(path.join("triviews", target.id, "styled-triview.png"));
        }
      }
    }
    const gates = Object.fromEntries(await Promise.all(required.map(async (relativePath) => [
      relativePath,
      await nonemptyArtifact(path.join(artifactRoot, relativePath), freshnessFloor),
    ])));
    if (!Object.values(gates).every(Boolean)) return false;
    if (!await pngArtifact(path.join(artifactRoot, "styled-opening-frame.png"), freshnessFloor)) return false;
    const [evaluationRun, openingReport, triViewReport, captureManifest] = await Promise.all([
      readJsonIfPresent(path.join(artifactRoot, "evaluation-run.json")),
      readJsonIfPresent(path.join(artifactRoot, "styled-opening-frame-report.json")),
      readJsonIfPresent(path.join(artifactRoot, "styled-triviews-report.json")),
      readJsonIfPresent(path.join(artifactRoot, "triviews", "capture-targets.json")),
    ]);
    if (
      evaluationRun?.kind !== "worldkit-evaluation-run" || evaluationRun.schemaVersion !== 1 ||
      evaluationRun.caseId !== record.id || evaluationRun.sceneId !== record.sceneId ||
      evaluationRun.workflowPolicyVersion !== workflowPolicyVersion ||
      evaluationRun.attempt !== record.attempt || evaluationRun.startedAt !== record.startedAt
    ) return false;
    if (record.referenceImage !== null) {
      if (
        openingReport?.kind !== "worldkit-styled-opening-frame-report" || openingReport.schemaVersion !== 1 ||
        openingReport.sceneId !== record.sceneId || openingReport.status !== "passed" ||
        triViewReport?.kind !== "worldkit-styled-triview-report" || triViewReport.schemaVersion !== 1 ||
        triViewReport.sceneId !== record.sceneId || triViewReport.status !== "passed"
      ) return false;
      for (const target of captureManifest?.targets ?? []) {
        if (!await pngArtifact(
          path.join(artifactRoot, "triviews", target.id, "styled-triview.png"),
          freshnessFloor,
        )) return false;
      }
    }
    const finishedAt = new Date().toISOString();
    await updateRecord(record.id, {
      status: "ready",
      stage: "ready",
      failedStage: null,
      captureRequired: false,
      captureStatus: "passed",
      outcome: "passed",
      whiteboxOutcome: "passed",
      styledOpeningFrameStatus: record.referenceImage === null ? "not-required" : "passed",
      styledTriviewsStatus: record.referenceImage === null ? "not-required" : "passed",
      finishedAt,
      error: null,
    });
    await writeJsonAtomic(path.join(artifactRoot, "evaluation-report.json"), {
      kind: "worldkit-evaluation-report",
      schemaVersion: 1,
      caseId: record.id,
      caseHash: evaluationRun?.caseHash ?? null,
      workflowPolicyVersion,
      attempt: record.attempt,
      codexBackend: effectiveCodexBackend(record),
      outcome: "passed",
      whiteboxOutcome: "passed",
      imageValidation: "not-required",
      gates,
      finishedAt,
    });
    await appendTrajectoryEvent(
      record.id,
      record.referenceImage === null ? "runtime-capture" : "visual-imagegen",
      record.referenceImage === null
        ? "已恢复新首帧完成状态。"
        : "已恢复：视觉提示词、新首帧及全部并发渲染后三视图均已生成。",
      { kind: "completed" },
    );
    return true;
  }

  async function initialize() {
    await Promise.all([
      mkdir(worldsRoot, { recursive: true }),
      mkdir(testSetsRoot, { recursive: true }),
      recordingWorkbench.initialize(),
    ]);
    const persistedSettings = await readJsonIfPresent(runtimeSettingsPath);
    const persistedCodexBackend = normalizedCodexBackend(persistedSettings?.codexBackend);
    if (persistedCodexBackend === null) {
      await persistCodexBackend(selectedCodexBackend);
    } else {
      selectedCodexBackend = persistedCodexBackend;
    }
    await importBuiltinTestSetRecords();
    await importBuiltinResultRecords();
    for (const testSet of await listTestSets()) await refreshTestSetIntegrity(testSet);
    if (importExistingArtifacts) await importExistingWorlds();
    const records = await listRecords();
    for (const record of records) {
      if (await recoverGeneratedStyledOutputs(record)) continue;
      if (["running", "visual-running", "visual-queued", "awaiting-recording"].includes(record.status)) {
        await updateRecord(record.id, {
          status: "interrupted",
          stage: "interrupted",
          failedStage: record.stage,
          finishedAt: new Date().toISOString(),
          error: "Creator Studio restarted before this task completed.",
        });
        await appendTrajectoryEvent(record.id, "interrupted", "Creator Studio 重启，运行中的任务被标记为中断。", { kind: "failed" });
      } else if (record.status === "queued") {
        queue.push(queueItem(record.id, effectiveCodexBackend(record)));
      }
    }
    pumpQueue();
  }

  async function handleApi(request, response, url) {
    if (await recordingWorkbench.handleApi(request, response, url)) return true;

    if (request.method === "PUT" && url.pathname === "/api/settings/codex-backend") {
      const body = await readJsonBody(request);
      const requestedBackend = normalizedCodexBackend(body?.backend);
      if (requestedBackend === null) {
        throw new InputError("Codex 运行端只能是 cloud 或 local。");
      }
      const result = await runRuntimeSettingsMutation("codex-backend", async () => {
        const availability = await codexBackendAvailability();
        if (!availability[requestedBackend]) return { changed: false, availability };
        selectedCodexBackend = requestedBackend;
        await persistCodexBackend(selectedCodexBackend);
        return { changed: true, availability };
      });
      const codexBackends = {
        cloud: { available: result.availability.cloud },
        local: { available: result.availability.local },
      };
      if (!result.changed) {
        sendJson(response, 409, {
          error: requestedBackend === "cloud"
            ? "LWDP 云端 Codex 当前不可用，未切换运行端。"
            : "本地 Codex 未安装或尚未登录，未切换运行端。",
          codexBackend: selectedCodexBackend,
          codexAvailable: result.availability[selectedCodexBackend],
          codexBackends,
        });
        return true;
      }
      sendJson(response, 200, {
        codexBackend: selectedCodexBackend,
        codexAvailable: true,
        codexBackends,
      });
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/health") {
      const availability = await codexBackendAvailability();
      const lwdpConfigured = availability.cloud;
      const geminiRuntimeRoot = path.join(repoRoot, ".codex-tmp", "runtime-config");
      const geminiConfigured = await fileExists(path.join(geminiRuntimeRoot, "gemini.env")) &&
        await fileExists(path.join(geminiRuntimeRoot, "google-service-account.json"));
      const reliability = deriveReliabilityMetrics(
        (await listRecords()).filter((record) =>
          record.origin === "test-set" && record.workflowPolicyVersion === workflowPolicyVersion),
      );
      const activeJobSummaries = [...activeJobs].map((id) => ({
        id,
        codexBackend: activeJobBackends.get(id) ?? "cloud",
      }));
      sendJson(response, 200, {
        ok: true,
        codexBackend: selectedCodexBackend,
        codexAvailable: availability[selectedCodexBackend],
        codexBackends: {
          cloud: { available: availability.cloud },
          local: { available: availability.local },
        },
        lwdpConfigured,
        geminiConfigured,
        geminiPromptModel: "gemini-3-flash-preview",
        geminiImageModel: "gemini-3.1-flash-image",
        codexExecutionProfile: FORMAL_CODEX_EXECUTION_PROFILE,
        pnpmAvailable: commandAvailable("pnpm"),
        activeJob: activeJobs.values().next().value ?? null,
        activeJobs: activeJobSummaries,
        maxConcurrentJobs,
        maxConcurrentJobsByBackend,
        recordingActiveJobs: recordingWorkbench.activeJobs,
        recordingMaxConcurrentJobs: recordingWorkbench.maxConcurrentJobs,
        queued: queue.length,
        queuedByBackend: {
          cloud: queuedCountForBackend("cloud"),
          local: queuedCountForBackend("local"),
        },
        playgroundOrigin,
        workflow: "switchable-codex-current-canonical-whitebox-hosted-evaluation",
        reliability,
        workflowPolicyVersion,
      });
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/reliability") {
      const records = (await listRecords()).filter((record) => record.origin === "test-set");
      sendJson(response, 200, {
        workflowPolicyVersion,
        reliability: deriveReliabilityMetrics(
          records.filter((record) => record.workflowPolicyVersion === workflowPolicyVersion),
        ),
        historicalReliability: deriveReliabilityMetrics(records),
      });
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/subject-catalog") {
      const definitions = await readJsonIfPresent(subjectCatalogPath);
      if (!Array.isArray(definitions)) {
        sendError(response, 503, "主体目录暂不可用。");
        return true;
      }
      const presets = definitions.map((definition) => ({
        label: definition.aiMetadata?.displayName ?? definition.id,
        maturity: definition.authoringAvailability === "advanced" ? "alpha" : "experimental",
        ref: definition.resourceRef,
        description: definition.aiMetadata?.description ?? definition.semanticClassId,
        planningBounds: null,
        capabilities: definition.capabilityRefs ?? [],
      }));
      sendJson(response, 200, {
        presets,
        productionRefs: presets
          .filter((preset) => preset?.maturity === "alpha")
          .map((preset) => preset.ref),
        experimentalRefs: presets
          .filter((preset) => preset?.maturity === "experimental")
          .map((preset) => preset.ref),
      });
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/test-sets") {
      const [testSets, worlds] = await Promise.all([listTestSets(), listRecords()]);
      sendJson(response, 200, {
        testSets: await Promise.all(testSets.map((record) => enrichTestSet(record, worlds))),
      });
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/test-sets") {
      const body = await readJsonBody(request);
      const name = normalizeTestSetName(body.name);
      const prompt = normalizePrompt(body.prompt);
      const existingIds = new Set((await listTestSets()).map((record) => record.id));
      const id = createSceneId(`test-set-${name}`, existingIds);
      const timestamp = new Date().toISOString();
      const record = {
        id,
        name,
        prompt,
        images: [],
        createdAt: timestamp,
        updatedAt: timestamp,
        lastRunAt: null,
        lastBatchId: null,
      };
      await mkdir(path.join(testSetsRoot, id, "images"), { recursive: true });
      await writeTestSet(record);
      sendJson(response, 201, { testSet: await enrichTestSet(record, []) });
      return true;
    }

    const testSetImageCollectionMatch = /^\/api\/test-sets\/([a-z0-9-]+)\/images$/.exec(url.pathname);
    if (request.method === "POST" && testSetImageCollectionMatch) {
      const record = await readTestSet(testSetImageCollectionMatch[1]);
      if (!record) {
        sendError(response, 404, "没有找到这个测试集。");
        return true;
      }
      if ((record.images ?? []).length >= 200) {
        sendError(response, 409, "一个测试集最多保存 200 张图片。");
        return true;
      }
      const body = await readJsonBody(request);
      const image = decodeImagePayload(body.image);
      if (!image) throw new InputError("请选择要加入测试集的图片。");
      const duplicate = (record.images ?? []).find(({ contentSha256 }) =>
        contentSha256 === image.contentSha256);
      if (duplicate) {
        throw new InputError(`这张图片与测试集中的 ${duplicate.originalName} 完全重复。`);
      }
      const imageId = `image-${String((record.images ?? []).length + 1).padStart(3, "0")}-${randomBytes(2).toString("hex")}`;
      const fileName = `images/${imageId}.${image.extension}`;
      await writeFile(path.join(testSetsRoot, record.id, fileName), image.bytes, { flag: "wx" });
      const item = {
        id: imageId,
        fileName,
        extension: image.extension,
        mimeType: image.mimeType,
        contentSha256: image.contentSha256,
        duplicateOf: null,
        integrityError: null,
        originalName: image.originalName ?? `${imageId}.${image.extension}`,
        size: image.bytes.length,
        createdAt: new Date().toISOString(),
      };
      record.images = [...(record.images ?? []), item];
      await writeTestSet(record);
      sendJson(response, 201, {
        image: { ...item, url: `/api/test-sets/${record.id}/images/${item.id}` },
        imageCount: record.images.length,
      });
      return true;
    }

    const testSetImageMatch = /^\/api\/test-sets\/([a-z0-9-]+)\/images\/([a-z0-9-]+)$/.exec(url.pathname);
    if (request.method === "GET" && testSetImageMatch) {
      const record = await readTestSet(testSetImageMatch[1]);
      const image = record?.images?.find((item) => item.id === testSetImageMatch[2]);
      const imagePath = testSetImagePath(record, image);
      if (!record || imagePath === null) {
        response.writeHead(404);
        response.end();
        return true;
      }
      serveFile(response, imagePath, "private, max-age=300");
      return true;
    }

    const runTestSetMatch = /^\/api\/test-sets\/([a-z0-9-]+)\/run$/.exec(url.pathname);
    if (request.method === "POST" && runTestSetMatch) {
      const record = await readTestSet(runTestSetMatch[1]);
      if (!record) {
        sendError(response, 404, "没有找到这个测试集。");
        return true;
      }
      if (!Array.isArray(record.images) || record.images.length === 0) {
        sendError(response, 409, "这个测试集还没有图片。");
        return true;
      }
      const body = await readJsonBody(request);
      const prompt = body.prompt == null || body.prompt === ""
        ? normalizePrompt(record.prompt)
        : normalizePrompt(body.prompt);
      let selectedImages = record.images.filter(({ duplicateOf, integrityError }) =>
        duplicateOf === null && integrityError === null);
      if (body.imageIds !== undefined) {
        if (
          !Array.isArray(body.imageIds) ||
          body.imageIds.length === 0 ||
          body.imageIds.length > record.images.length ||
          body.imageIds.some((id) => typeof id !== "string") ||
          new Set(body.imageIds).size !== body.imageIds.length
        ) {
          throw new InputError("请选择至少一个且不重复的测试 case。");
        }
        const selectedIds = new Set(body.imageIds);
        selectedImages = record.images.filter(({ id }) => selectedIds.has(id));
        if (selectedImages.length !== selectedIds.size) {
          throw new InputError("选中的测试 case 不属于这个测试集。");
        }
        if (selectedImages.some(({ duplicateOf, integrityError }) => duplicateOf !== null || integrityError !== null)) {
          throw new InputError("选中的测试 case 包含重复或无效图片，请重新选择。");
        }
      }
      if (selectedImages.length === 0) {
        throw new InputError("这个测试集没有可运行的有效 case。");
      }
      const batchId = `batch-${Date.now().toString(36)}-${randomBytes(2).toString("hex")}`;
      const batchCodexBackend = selectedCodexBackend;
      const existingIds = new Set((await listRecords()).map((world) => world.id));
      const worlds = [];
      for (const image of selectedImages) {
        const imagePath = testSetImagePath(record, image);
        if (imagePath === null) continue;
        const bytes = await readFile(imagePath);
        const imageStem = path.basename(image.originalName, path.extname(image.originalName)).slice(0, 42);
        const title = normalizeTitle(`${record.name} · ${imageStem}`, prompt);
        const world = await createQueuedWorld({
          title,
          prompt,
          image: {
            bytes,
            extension: image.extension,
            mimeType: image.mimeType,
            originalName: image.originalName,
            contentSha256: image.contentSha256,
          },
          origin: "test-set",
          testSetId: record.id,
          testSetImageId: image.id,
          batchId,
          codexBackend: batchCodexBackend,
        }, existingIds);
        worlds.push(world);
      }
      record.lastRunAt = new Date().toISOString();
      record.lastBatchId = batchId;
      await writeTestSet(record);
      sendJson(response, 202, {
        batchId,
        worlds: await Promise.all(worlds.map(enrichRecord)),
      });
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/worlds") {
      const records = await listRecords();
      sendJson(response, 200, { worlds: await Promise.all(records.map(enrichRecord)) });
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/worlds") {
      const body = await readJsonBody(request);
      const prompt = normalizePrompt(body.prompt);
      const title = normalizeTitle(body.title, prompt);
      const image = decodeImagePayload(body.image);
      const record = await createQueuedWorld({ title, prompt, image });
      sendJson(response, 202, { world: await enrichRecord(record) });
      return true;
    }

    const worldMatch = /^\/api\/worlds\/([a-z0-9-]+)$/.exec(url.pathname);
    if (request.method === "GET" && worldMatch) {
      const record = await readRecord(worldMatch[1]);
      if (!record) {
        sendError(response, 404, "没有找到这个世界。");
        return true;
      }
      let log = "";
      try {
        const rawLog = await readFile(logPath(record.id), "utf8");
        log = rawLog.slice(-100_000);
      } catch {}
      sendJson(response, 200, {
        world: await enrichRecord(record),
        media: await collectWorldMedia(record),
        log,
      });
      return true;
    }

    const triviewMatch = /^\/api\/worlds\/([a-z0-9-]+)\/triviews\/([a-z0-9-]+)$/.exec(url.pathname);
    if (request.method === "GET" && triviewMatch) {
      const record = await readRecord(triviewMatch[1]);
      if (!record || !idPattern.test(triviewMatch[2])) {
        sendError(response, 404, "没有找到这个三视图工件。");
        return true;
      }
      const imagePath = path.join(
        repoRoot,
        "artifacts/scenes",
        record.sceneId,
        "triviews",
        triviewMatch[2],
        "whitebox-triview.png",
      );
      if (!await fileExists(imagePath)) {
        sendError(response, 404, "这个三视图尚未生成。");
        return true;
      }
      serveFile(response, imagePath, "private, no-store");
      return true;
    }

    const styledTriviewMatch = /^\/api\/worlds\/([a-z0-9-]+)\/styled-triviews\/([a-z0-9-]+)$/.exec(url.pathname);
    if (request.method === "GET" && styledTriviewMatch) {
      const record = await readRecord(styledTriviewMatch[1]);
      if (!record || !idPattern.test(styledTriviewMatch[2])) {
        sendError(response, 404, "没有找到这个渲染后三视图工件。");
        return true;
      }
      const imagePath = path.join(
        repoRoot,
        "artifacts/scenes",
        record.sceneId,
        "triviews",
        styledTriviewMatch[2],
        "styled-triview.png",
      );
      if (!await fileExists(imagePath)) {
        sendError(response, 404, "这个渲染后三视图尚未生成。");
        return true;
      }
      serveFile(response, imagePath, "private, no-store");
      return true;
    }

    const authoringSourceMatch = /^\/api\/worlds\/([a-z0-9-]+)\/authoring-spec$/.exec(url.pathname);
    if (request.method === "GET" && authoringSourceMatch) {
      const record = await readRecord(authoringSourceMatch[1]);
      const authoringPath = record === null
        ? null
        : path.join(repoRoot, "artifacts/scenes", record.sceneId, "authoring.json");
      if (record === null || authoringPath === null || !await fileExists(authoringPath)) {
        sendError(response, 404, "这个世界尚未生成 Canonical AuthoringSpec。");
        return true;
      }
      serveFile(response, authoringPath, "private, no-store");
      return true;
    }

    const visualCaptureTargetsMatch = /^\/api\/worlds\/([a-z0-9-]+)\/visual-capture-targets$/.exec(url.pathname);
    if (request.method === "GET" && visualCaptureTargetsMatch) {
      const record = await readRecord(visualCaptureTargetsMatch[1]);
      const implementationMapPath = record === null
        ? null
        : path.join(repoRoot, "artifacts/scenes", record.sceneId, "scene-implementation-map.json");
      if (record === null || implementationMapPath === null ||
          !await fileExists(implementationMapPath)) {
        sendError(response, 404, "这个世界尚未生成可信视觉目标映射。");
        return true;
      }
      const implementationMap = JSON.parse(await readFile(implementationMapPath, "utf8"));
      if (!Array.isArray(implementationMap.visualCaptureGroups)) {
        sendError(response, 409, "这个世界的可信视觉目标映射无效。");
        return true;
      }
      sendJson(response, 200, { targets: implementationMap.visualCaptureGroups });
      return true;
    }

    const deliverableMatch = /^\/api\/worlds\/([a-z0-9-]+)\/deliverables\/([a-z0-9-]+)$/.exec(url.pathname);
    if (request.method === "GET" && deliverableMatch) {
      const record = await readRecord(deliverableMatch[1]);
      if (!record) {
        sendError(response, 404, "没有找到这个世界。");
        return true;
      }
      const deliverable = await resolveDeliverable(record, deliverableMatch[2]);
      if (!deliverable) {
        sendError(response, 404, "这个过程交付物尚未生成。");
        return true;
      }
      serveFile(response, deliverable.path, "private, no-store");
      return true;
    }

    const stopMatch = /^\/api\/worlds\/([a-z0-9-]+)\/stop$/.exec(url.pathname);
    if (request.method === "POST" && stopMatch) {
      const record = await readRecord(stopMatch[1]);
      if (!record) {
        sendError(response, 404, "没有找到这个世界。");
        return true;
      }
      if (!["queued", "running", "visual-queued", "visual-running"].includes(record.status)) {
        sendError(response, 409, "只有排队或运行中的任务可以停止。");
        return true;
      }

      const wasActive = activeJobs.has(record.id);
      if (wasActive) stoppingJobs.add(record.id);
      for (let index = queue.length - 1; index >= 0; index -= 1) {
        if (parseQueueItem(queue[index])?.id === record.id) queue.splice(index, 1);
      }

      const remoteCancellation = wasActive
        ? await cancelRemoteLwdpJob(record)
        : { requested: false, jobId: null };
      if (wasActive) terminateChild(activeChildren.get(record.id));

      const artifactRoot = path.join(repoRoot, "artifacts/scenes", record.sceneId);
      const capturePassed = await fileExists(path.join(artifactRoot, "opening-frame.png")) &&
        await fileExists(path.join(artifactRoot, "triviews", "capture-targets.json"));
      const stopped = await updateRecord(record.id, {
        status: "interrupted",
        stage: "interrupted",
        failedStage: record.stage,
        finishedAt: new Date().toISOString(),
        error: wasActive ? "用户已停止正在运行的任务。" : "用户已取消排队任务。",
        captureRequired: false,
        captureStatus: capturePassed ? "passed" : "not-run",
        outcome: "cancelled",
      });
      await appendJobLog(
        record.id,
        `\nWorld generation ${wasActive ? "stopped" : "removed from queue"} by user.\n`,
      );
      await appendTrajectoryEvent(
        record.id,
        "interrupted",
        wasActive ? "用户停止了正在运行的任务。" : "用户取消了排队任务。",
        { kind: "cancelled", remoteCancellation },
      );
      pumpQueue();
      sendJson(response, 200, {
        ok: true,
        world: await enrichRecord(stopped),
        remoteCancellation,
      });
      return true;
    }

    const retryMatch = /^\/api\/worlds\/([a-z0-9-]+)\/retry$/.exec(url.pathname);
    if (request.method === "POST" && retryMatch) {
      const record = await readRecord(retryMatch[1]);
      if (!record) {
        sendError(response, 404, "没有找到这个世界。");
        return true;
      }
      if (!["failed", "interrupted"].includes(record.status)) {
        sendError(response, 409, "只有失败或中断的任务可以重试。");
        return true;
      }
      await updateRecord(record.id, {
        status: "queued",
        stage: "queued",
        failedStage: null,
        error: null,
        captureRequired: true,
        captureStatus: "pending",
        outcome: null,
        styledOpeningFrameStatus: record.referenceImage ? "pending" : "not-required",
        styledTriviewsRequired: Boolean(record.referenceImage),
        styledTriviewsStatus: record.referenceImage ? "pending" : "not-required",
      });
      await appendTrajectoryEvent(record.id, "queued", "用户发起重试，任务重新进入队列。", { kind: "queued" });
      enqueue(record.id, effectiveCodexBackend(record));
      sendJson(response, 202, { ok: true });
      return true;
    }

    const referenceMatch = /^\/api\/worlds\/([a-z0-9-]+)\/reference$/.exec(url.pathname);
    if (request.method === "GET" && referenceMatch) {
      const record = await readRecord(referenceMatch[1]);
      if (!record?.referenceImage) {
        response.writeHead(404);
        response.end();
        return true;
      }
      serveFile(response, path.join(worldsRoot, record.id, record.referenceImage.fileName), "private, max-age=60");
      return true;
    }
    return false;
  }

  function shouldProxyToPlayground(pathname) {
    return pathname === "/play" ||
      pathname.startsWith("/play/") ||
      pathname.startsWith("/@vite/") ||
      pathname.startsWith("/src/") ||
      pathname.startsWith("/node_modules/") ||
      pathname.startsWith("/@fs/") ||
      pathname.startsWith("/local-assets/") ||
      pathname.startsWith("/subject-assets/") ||
      pathname.startsWith("/worldkit-assets/") ||
      pathname.startsWith("/scene-plans/") ||
      pathname.startsWith("/__whitebox/");
  }

  function proxyToPlayground(request, response, url) {
    return new Promise((resolve) => {
      const target = new URL(playgroundInternalOrigin);
      const pathname = url.pathname === "/play"
        ? "/"
        : url.pathname.startsWith("/play/")
          ? url.pathname.slice("/play".length)
          : url.pathname;
      const headers = { ...request.headers, host: target.host };
      delete headers.authorization;
      const proxyRequest = createHttpRequest({
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        method: request.method,
        path: `${pathname}${url.search}`,
        headers,
      }, (proxyResponse) => {
        response.writeHead(proxyResponse.statusCode ?? 502, proxyResponse.headers);
        proxyResponse.pipe(response);
        proxyResponse.once("end", resolve);
      });
      proxyRequest.once("error", (error) => {
        if (!response.headersSent) response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
        response.end(`Playground unavailable: ${error.message}`);
        resolve();
      });
      request.pipe(proxyRequest);
    });
  }

  async function handleRequest(request, response) {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    try {
      if (!isAuthorizedHeader(request.headers.authorization, accessKey)) {
        response.writeHead(401, {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
          "www-authenticate": 'Basic realm="WorldKit Creator Studio", charset="UTF-8"',
        });
        response.end("WorldKit Creator Studio requires an access key.");
        return;
      }

      if (shouldProxyToPlayground(url.pathname)) {
        await proxyToPlayground(request, response, url);
        return;
      }

      if (url.pathname.startsWith("/api/") && await handleApi(request, response, url)) return;

      const assetMatch = /^\/scene-assets\/([a-z0-9-]+)\/(.+)$/.exec(url.pathname);
      if (request.method === "GET" && assetMatch && idPattern.test(assetMatch[1]) && isAllowedSceneAsset(assetMatch[2])) {
        const assetPath = path.join(repoRoot, "apps/playground/public/scene-plans", assetMatch[1], assetMatch[2]);
        if (await fileExists(assetPath)) serveFile(response, assetPath, "no-cache");
        else {
          response.writeHead(404);
          response.end();
        }
        return;
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405);
        response.end();
        return;
      }
      const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const staticPath = path.resolve(publicRoot, requested);
      if (!staticPath.startsWith(`${publicRoot}${path.sep}`) || !await fileExists(staticPath) || !(await stat(staticPath)).isFile()) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
      serveFile(response, staticPath, requested.includes(".") ? "no-cache" : "no-store");
    } catch (error) {
      sendError(response, error instanceof InputError ? 400 : 500, error);
    }
  }

  const server = createServer((request, response) => void handleRequest(request, response));

  async function shutdown() {
    shuttingDown = true;
    for (const child of activeChildren.values()) {
      terminateChild(child);
    }
    await Promise.all([
      recordingWorkbench.shutdown(),
      ...[...activeJobs].map((id) => updateRecord(id, {
          status: "interrupted",
          stage: "interrupted",
          finishedAt: new Date().toISOString(),
          error: "Creator Studio stopped while this world was being generated.",
        })),
    ]);
    await new Promise((resolve) => server.close(resolve));
  }

  return {
    server,
    initialize,
    shutdown,
    get activeJob() { return activeJobs.values().next().value ?? null; },
    get activeJobs() { return [...activeJobs]; },
  };
}

async function isOriginAvailable(origin) {
  try {
    const response = await fetch(origin, { signal: AbortSignal.timeout(1_000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function startMain() {
  const host = "127.0.0.1";
  const port = Number(process.env.WORLDKIT_STUDIO_PORT ?? 4174);
  const playgroundInternalOrigin = process.env.WORLDKIT_PLAYGROUND_INTERNAL_ORIGIN ?? "http://127.0.0.1:5173";
  const playgroundOrigin = process.env.WORLDKIT_PLAYGROUND_ORIGIN ?? playgroundInternalOrigin;
  const accessKey = process.env.WORLDKIT_ACCESS_KEY ?? "";
  if (process.env.WORLDKIT_PUBLIC_MODE === "1" && accessKey.length < 16) {
    throw new Error("WORLDKIT_PUBLIC_MODE requires a WORLDKIT_ACCESS_KEY of at least 16 characters.");
  }
  const studio = createStudio({ playgroundOrigin, playgroundInternalOrigin, accessKey });
  await studio.initialize();
  await new Promise((resolve, reject) => {
    studio.server.once("error", reject);
    studio.server.listen(port, host, resolve);
  });
  console.log(`WorldKit Creator Studio: http://${host}:${port}`);

  let playgroundChild = null;
  if (process.env.WORLDKIT_DISABLE_PLAYGROUND_SPAWN !== "1" && !await isOriginAvailable(playgroundInternalOrigin)) {
    playgroundChild = spawn(
      "pnpm",
      ["--filter", "@whitebox-world/playground", "dev", "--host", host, "--port", "5173"],
      { cwd: defaultRepoRoot, stdio: "inherit", shell: false },
    );
  }

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    if (playgroundChild && !playgroundChild.killed) playgroundChild.kill("SIGTERM");
    await studio.shutdown();
    process.exit(0);
  };
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startMain().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
