import { spawn, spawnSync } from "node:child_process";
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  appendFile,
  chmod,
  copyFile,
  mkdtemp,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { createServer, request as createHttpRequest } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createRecordingWorkbenchService } from "./recording-workbench.mjs";
import { createEpisodeWorkflowService } from "./episode-workflows.mjs";
import { resolveLatestCompatibleCloudEpisodeManifest } from "./cloud-episode-resume.mjs";
import {
  StudioPreviewBootstrapError,
  assembleStudioPreviewBootstrapV1,
} from "./preview-bootstrap.mjs";
import { FORMAL_CODEX_EXECUTION_PROFILE } from "../../../scripts/lib/lwdp-codex-profile.mjs";
import {
  cancelGenerationJob,
  classifyCodexTaskFailureForRetry,
  LwdpJobPendingError,
  joinS3Uri,
  loadLwdpGenerationConfig,
} from "../../../scripts/lib/lwdp-generation-client.mjs";
import { recoverSucceededCodexJobOutputs } from "../../../scripts/lib/lwdp-codex-output-recovery.mjs";
import {
  cancelCloudExecution,
  cloudExecutionRecord,
  dispatchCloudExecution,
  getCloudExecution,
  getCloudExecutionCapacity,
  getCloudExecutionStages,
} from "../../../scripts/lib/lwdp-cloud-execution-client.mjs";
import { readRemoteS3Artifact } from "../../../scripts/lib/cloud-s3-runtime.mjs";
import {
  cloudInternalStage,
  cloudArtifactManifestS3Uri,
  executeStudioCloudScene,
  launchStudioCloudSceneWorker,
  loadCloudSceneProductionConfig,
  rebuildStudioCloudSceneBuilder,
  resumeStudioCloudSceneBuilder,
  resumeStudioCloudSceneHost,
} from "./cloud-scene-production.mjs";
import {
  executeStudioCloudEpisode,
  loadCloudEpisodeProductionConfig,
  recoverStudioCloudEpisode,
  retryStudioCloudEpisode,
} from "./cloud-episode-production.mjs";
import {
  cloudArtifactByPath,
  readCloudArtifactManifest,
  readVerifiedCloudArtifact,
  streamCloudArtifact,
  redirectToPresignedCloudArtifact,
} from "./remote-cloud-artifacts.mjs";
import {
  listCloudSceneRunIndexRecords,
  listCloudEpisodeRunIndexRecords,
  readCloudSceneRunIndexRecord,
  readCloudEpisodeRunIndexRecord,
  writeCloudSceneRunIndexRecord,
  writeCloudEpisodeRunIndexRecord,
} from "../../../scripts/lib/cloud-production-run-index.mjs";
import { deleteCloudEpisodeWorkerJobs } from
  "../../../scripts/cloud/launch-worldkit-cloud-episode-worker-job.mjs";
import { loadCloudProductionThroughputConfigSync } from
  "../../../scripts/lib/cloud-production-throughput.mjs";

const studioSourceRoot = path.dirname(fileURLToPath(import.meta.url));
const studioRoot = path.resolve(studioSourceRoot, "..");
const defaultRepoRoot = path.resolve(studioRoot, "../..");
const defaultDataRoot = path.join(studioRoot, "data");
const publicRoot = path.join(studioRoot, "public");
const idPattern = /^[a-z0-9][a-z0-9-]{2,79}$/;
// Container runtimes commonly reuse the same PID after restarting the main
// process inside an existing Pod. Keep a process-generation marker in the
// filesystem lease so a dead predecessor with the same PID cannot fence the
// replacement forever. This marker is shared by every Studio instance in one
// live Node process, preserving the single-writer guard in tests and embeds.
const studioWriterProcessIdentity = `${process.pid}-${randomBytes(12).toString("hex")}`;
const studioWriterProcessStartedAtMs = Date.now() - (process.uptime() * 1_000);
// The Studio workflow is unreleased and intentionally has one current contract.
// Bump this only when the persisted Studio record shape changes; do not keep
// parallel historical workflow implementations in the runtime.
export const workflowPolicyVersion = 6;
export function defaultManagedPlaygroundPort(studioPort) {
  if (!Number.isSafeInteger(studioPort) || studioPort < 1 || studioPort > 64_535) {
    throw new Error("Studio port must leave room for an isolated Playground port.");
  }
  return studioPort + 1_000;
}
const codexBackendValues = new Set(["cloud", "local"]);
const recordLifecycleFields = new Set([
  "attempt",
  "captureError",
  "captureRequired",
  "captureStatus",
  "cloudBuilderRebuildSourceExecutionId",
  "cloudBuilderRebuildSourceManifestS3Uri",
  "cloudBuilderRebuildSourceRequestS3Uri",
  "error",
  "failedStage",
  "finishedAt",
  "outcome",
  "remoteExecutionId",
  "remoteJobId",
  "remoteOutputS3Prefix",
  "remotePendingDeadlineAt",
  "remotePendingSince",
  "remoteRequestId",
  "remoteStageId",
  "remoteTaskId",
  "resumeFromStage",
  "stage",
  "startedAt",
  "status",
  "styledOpeningFrameStatus",
  "styledTriviewsStatus",
  "triviewStatus",
  "whiteboxOutcome",
]);

export function evaluateRecordTransition(current, patch, {
  allowReadyLifecycleTransition = false,
  expectedAttempt,
  expectedRecordRevision,
  expectedRemoteExecutionId,
  expectedRemoteJobId,
  expectedStatuses,
} = {}) {
  if (current === null || typeof current !== "object") {
    return { allowed: false, reason: "missing" };
  }
  if (expectedAttempt !== undefined && current.attempt !== expectedAttempt) {
    return { allowed: false, reason: "attempt-drift" };
  }
  if (
    expectedRecordRevision !== undefined &&
    current.recordRevision !== expectedRecordRevision
  ) {
    return { allowed: false, reason: "revision-drift" };
  }
  if (
    expectedRemoteExecutionId !== undefined &&
    current.remoteExecutionId !== expectedRemoteExecutionId
  ) {
    return { allowed: false, reason: "execution-drift" };
  }
  if (
    expectedRemoteJobId !== undefined &&
    current.remoteJobId !== expectedRemoteJobId
  ) {
    return { allowed: false, reason: "job-drift" };
  }
  if (
    expectedStatuses !== undefined &&
    !new Set(expectedStatuses).has(current.status)
  ) {
    return {
      allowed: false,
      reason: current.status === "ready" ? "already-complete" : "status-drift",
    };
  }
  if (
    current.status === "ready" &&
    !allowReadyLifecycleTransition &&
    Object.keys(patch).some((field) => recordLifecycleFields.has(field))
  ) {
    return { allowed: false, reason: "already-complete" };
  }
  return { allowed: true, reason: "applied" };
}

export function applyRecordPatch(current, patch) {
  return { ...current, ...patch };
}

export function hasRemoteCloudHostResumeInputs(record) {
  if (
    typeof record?.remoteExecutionId !== "string" ||
    typeof record?.remoteArtifactManifestS3Uri !== "string" ||
    typeof record?.remoteRequestS3Uri !== "string" ||
    typeof record?.remoteOutputS3Prefix !== "string"
  ) return false;
  const requiredPaths = [
    "scene/scene-brief.md",
    "scene/planner-self-check.json",
    "scene/visual-identity-palette.json",
    "scene/world.mjs",
    "scene/authoring.json",
    "scene/implementation-map.draft.json",
    "scene/builder-self-check.json",
    "scene/builder-top-down-comparison.png",
    "scene/builder-entry-comparison.png",
    "scene-plan/entry-whitebox-target.png",
    "scene-plan/world-plan.png",
  ];
  if (requiredPaths.some((artifactPath) => cloudArtifactByPath(record, artifactPath) === null)) {
    return false;
  }
  return !record.referenceImage || ["png", "jpg", "webp"].some((extension) =>
    cloudArtifactByPath(record, `scene-plan/reference-0.${extension}`) !== null);
}

export function hasRemoteCloudPlannerResumeInputs(record) {
  if (
    typeof record?.remoteExecutionId !== "string" ||
    typeof record?.remoteArtifactManifestS3Uri !== "string" ||
    typeof record?.remoteRequestS3Uri !== "string" ||
    typeof record?.remoteOutputS3Prefix !== "string"
  ) return false;
  const requiredPaths = [
    "scene/scene-brief.md",
    "scene/planner-self-check.json",
    "scene/visual-identity-palette.json",
    "scene-plan/entry-whitebox-target.png",
    "scene-plan/world-plan.png",
  ];
  if (requiredPaths.some((artifactPath) => cloudArtifactByPath(record, artifactPath) === null)) {
    return false;
  }
  return !record.referenceImage || ["png", "jpg", "webp"].some((extension) =>
    cloudArtifactByPath(record, `scene-plan/reference-0.${extension}`) !== null);
}

export async function resolveCloudBuilderRebuildSource(record, {
  outputS3Root,
  repoRoot,
  readManifestImplementation = readCloudArtifactManifest,
  readArtifactImplementation = readRemoteS3Artifact,
} = {}) {
  if (
    typeof record?.cloudBuilderRebuildSourceExecutionId === "string" &&
    typeof record?.cloudBuilderRebuildSourceManifestS3Uri === "string" &&
    typeof record?.cloudBuilderRebuildSourceRequestS3Uri === "string"
  ) {
    return {
      executionId: record.cloudBuilderRebuildSourceExecutionId,
      manifestS3Uri: record.cloudBuilderRebuildSourceManifestS3Uri,
      requestS3Uri: record.cloudBuilderRebuildSourceRequestS3Uri,
    };
  }
  if (hasRemoteCloudPlannerResumeInputs(record)) {
    return {
      executionId: record.remoteExecutionId,
      manifestS3Uri: record.remoteArtifactManifestS3Uri,
      requestS3Uri: record.remoteRequestS3Uri,
    };
  }
  if (
    typeof outputS3Root !== "string" ||
    typeof record?.sceneId !== "string" ||
    !Number.isSafeInteger(record.attempt) || record.attempt < 1
  ) return null;
  const requiredPaths = new Set([
    "scene/scene-brief.md",
    "scene/planner-self-check.json",
    "scene/visual-identity-palette.json",
    "scene-plan/entry-whitebox-target.png",
    "scene-plan/world-plan.png",
  ]);
  for (let attempt = record.attempt; attempt >= 1; attempt -= 1) {
    const attemptRoot = joinS3Uri(outputS3Root, record.sceneId, `attempt-${attempt}`);
    const manifestS3Uri = joinS3Uri(
      attemptRoot,
      "stages",
      "scene-production",
      "cloud-artifact-manifest.json",
    );
    try {
      const manifest = await readManifestImplementation(manifestS3Uri, {
        repoRoot,
        expectedSceneId: record.sceneId,
      });
      const artifactPaths = new Set(manifest.artifacts.map(({ path: artifactPath }) => artifactPath));
      if ([...requiredPaths].some((artifactPath) => !artifactPaths.has(artifactPath))) continue;
      if (record.referenceImage && !["png", "jpg", "webp"].some((extension) =>
        artifactPaths.has(`scene-plan/reference-0.${extension}`))) continue;
      const requestS3Uri = joinS3Uri(attemptRoot, "inputs", "request.json");
      const requestBytes = await readArtifactImplementation(requestS3Uri, {
        repoRoot,
        maximumBytes: 1024 * 1024,
      });
      const sourceRequest = JSON.parse(requestBytes.toString("utf8"));
      if (
        sourceRequest?.kind !== "worldkit-cloud-scene-request" ||
        sourceRequest.schemaVersion !== 1 ||
        sourceRequest.sceneId !== record.sceneId
      ) continue;
      return {
        executionId: manifest.executionId,
        manifestS3Uri,
        requestS3Uri,
      };
    } catch {
      // Older or incomplete attempts are not rebuild authorities; keep scanning.
    }
  }
  return null;
}

export function expectedCloudSceneManifestS3Uri(record) {
  return typeof record?.remoteOutputS3Prefix === "string"
    ? `${record.remoteOutputS3Prefix.replace(/\/$/, "")}/stages/scene-production/cloud-artifact-manifest.json`
    : null;
}
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
  [".mjs", "text/javascript; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".mp4", "video/mp4"],
  [".log", "text/plain; charset=utf-8"],
  [".ts", "text/plain; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".webm", "video/webm"],
]);

export function normalizeTrustedCapturePublicKeyPaths(primaryPath, additionalPaths = []) {
  if (typeof primaryPath !== "string" || primaryPath.length === 0) {
    throw new Error("Primary capture trust public key path is required.");
  }
  if (!Array.isArray(additionalPaths)) {
    throw new Error("Additional capture trust public key paths must be an array.");
  }
  const normalized = [primaryPath, ...additionalPaths].map((value) => {
    if (typeof value !== "string" || value.length === 0) {
      throw new Error("Capture trust public key paths must be non-empty strings.");
    }
    return path.resolve(value);
  });
  return [...new Set(normalized)];
}

export async function finalizeRecoveredVisualOutputs({
  repoRoot,
  sceneId,
  userFrame,
  spawnSyncImplementation = spawnSync,
}) {
  const sceneRoot = path.join(repoRoot, "artifacts", "scenes", sceneId);
  const commands = [
    [
      "scripts/visual/finalize-styled-opening-frame.ts",
      "--scene-id", sceneId,
      "--scene-root", sceneRoot,
      "--user-frame", userFrame,
    ],
    [
      "scripts/visual/finalize-styled-triviews.ts",
      "--scene-id", sceneId,
      "--scene-root", sceneRoot,
    ],
  ];
  for (const args of commands) {
    const result = spawnSyncImplementation(
      "pnpm",
      ["exec", "tsx", ...args],
      { cwd: repoRoot, encoding: "utf8", env: process.env },
    );
    if (result?.status !== 0) {
      throw new Error(
        `Recovered visual output finalization failed: ${String(result?.stderr || result?.error?.message || "unknown error").trim()}`,
      );
    }
  }
}

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
    description: "生成非权威 Scene Brief、单一连续且至少四倍参考可见面积的方块俯视图和进入图，并在同一任务内检查语义颜色、视觉目标与第三人称构图。真实世界权威由 Builder 的 world.mjs 建立。",
    required: ["scene-brief", "visual-identity-palette", "world-plan", "entry-whitebox-target", "planner-self-check"],
  },
  {
    id: "coding-agent",
    title: "方块白膜实现",
    owner: "Block Builder",
    description: "直接编写 Three.js 单位方块世界并自检，再查看 Planner/Builder 俯视与进入构图对比图迭代；运行传输与视觉映射由检查器自动派生。",
    required: [
      "world-module",
      "authoring-spec",
      "implementation-map-draft",
      "builder-self-check",
      "builder-top-down-comparison",
      "builder-entry-comparison",
    ],
  },
  {
    id: "block-build",
    title: "方块编译",
    owner: "Trusted Host",
    description: "可信宿主复验方块模块与 Manifest，进入 Canonical Scene Plan V1 / World Build Identity 链路，并固化视觉目标到 runtime entity 的一对多映射。",
    required: ["implementation-map", "execution-plan"],
  },
  {
    id: "runtime-capture",
    title: "真实白膜捕获",
    owner: "Playground",
    description: "无头 Babylon 真实运行。进入首帧与 Runtime Snapshot 成功后白膜世界即可进入；Front/Right/Back 三视图是独立后处理结果。",
    required: [
      "opening-frame",
      "runtime-snapshot",
      "whitebox-capture-receipt",
      "whitebox-triview-manifest",
    ],
  },
  {
    id: "entry-alignment-validation",
    title: "进入构图校验",
    owner: "Trusted Host",
    description: "基于真实白膜首帧与 Runtime Snapshot V4 检查主体严格居中、相机锁定受控主体且位于正后方。",
    required: ["entry-third-person-validation"],
  },
  {
    id: "visual-reconstruction",
    title: "LWDP Codex 视觉重建",
    owner: "Visual Reconstructor",
    description: "可选：一个正式 LWDP Codex Job 在同一隔离 workspace 内编写视觉提示词，生成最终样式首帧及全部完整目标三视图。",
    required: ["visual-generation-prompts", "styled-opening-frame", "styled-triviews-manifest"],
  },
];

const runtimeStageAliases = new Map([
  ["plan-ready", "planner"],
  ["route-validation", "block-build"],
  ["change-requested", "coding-agent"],
  ["visual-prompt-synthesis", "visual-reconstruction"],
  ["visual-imagegen", "visual-reconstruction"],
  ["visual-imagegen-ready", "visual-reconstruction"],
  ["visual-reconstruction-ready", "visual-reconstruction"],
]);

const agentTokenStageIds = new Set([
  "planner", "coding-agent", "visual-reconstruction",
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
    ? "visual-reconstruction"
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

function lastMatch(source, pattern) {
  let matched = null;
  for (const candidate of String(source).matchAll(pattern)) matched = candidate;
  return matched;
}

export function parseRemotePendingLwdpMarker(rawLog = "") {
  const match = lastMatch(
    rawLog,
    /^(?:\[stdout\]\s*)?WORLDKIT_LWDP_REMOTE_PENDING (planner|coding-agent|visual-reconstruction) ([a-z0-9-]+) (gen_[a-zA-Z0-9]+) ([^\s]+) (s3:\/\/[^\s]+) ([0-9]+) ([a-z_]+) (\{[^\n]*\})$/gm,
  );
  if (!match) return null;
  let counters = {};
  try {
    counters = JSON.parse(match[8]);
  } catch {
    return null;
  }
  const timeoutMs = Number(match[6]);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) return null;
  return {
    stage: match[1],
    taskId: match[2],
    jobId: match[3],
    requestId: match[4],
    outputS3Prefix: match[5],
    timeoutMs,
    remoteStatus: match[7],
    counters,
  };
}

export function parseLatestLwdpJobMarker(rawLog = "") {
  const match = lastMatch(
    rawLog,
    /^(?:\[stdout\]\s*)?WORLDKIT_LWDP_JOB (planner|coding-agent|visual-reconstruction) ([a-z0-9-]+) (gen_[a-zA-Z0-9]+)([^\n]*)$/gm,
  );
  if (!match) return null;
  const suffix = match[4] ?? "";
  const requestId = /(?:^|\s)requestId=([^\s]+)/.exec(suffix)?.[1] ?? null;
  const outputS3Prefix = /(?:^|\s)outputS3Prefix=(s3:\/\/[^\s]+)/.exec(suffix)?.[1] ?? null;
  const taskAttempt = /(?:^|\s)taskAttempt=([0-9]+)\/([0-9]+)/.exec(suffix);
  return {
    stage: match[1],
    taskId: match[2],
    jobId: match[3],
    requestId,
    outputS3Prefix,
    taskAttempt: taskAttempt ? Number(taskAttempt[1]) : null,
    taskAttemptLimit: taskAttempt ? Number(taskAttempt[2]) : null,
  };
}

/** Convert a child-process exit into the most specific safe failure shown by Studio. */
export function deriveWorldGenerationFailureReason(
  rawLog = "",
  { code = -1, signal = null } = {},
) {
  const completeLog = String(rawLog);
  const attemptMarkers = [...completeLog.matchAll(/^WorldKit Creator Studio\nscene=[^\n]+\nattempt=[0-9]+\n/gm)];
  const log = attemptMarkers.length === 0
    ? completeLog
    : completeLog.slice(attemptMarkers.at(-1).index);
  const pending = parseRemotePendingLwdpMarker(log);
  if (pending) {
    const minutes = Math.round(pending.timeoutMs / 60_000);
    return `LWDP 云端 Job ${pending.jobId} 在 ${minutes} 分钟后仍为 ${pending.remoteStatus}；已转入远端对账状态，本地不会重复提交 Job。`;
  }
  const timeout = lastMatch(
    log,
    /LWDP job (gen_[a-zA-Z0-9]+) timed out after ([0-9]+)ms\./g,
  );
  if (timeout) {
    const progress = lastMatch(
      log,
      /WORLDKIT_LWDP_PROGRESS [^\s]+ ([a-z_]+) (\{[^\n]*\})/g,
    );
    let progressSummary = "远端未返回可确认的最终状态";
    if (progress) {
      try {
        const counters = JSON.parse(progress[2]);
        progressSummary = `远端最后状态=${progress[1]}，queued=${Number(counters.queued ?? 0)}，running=${Number(counters.running ?? 0)}，succeeded=${Number(counters.succeeded ?? 0)}，failed=${Number(counters.failed ?? 0)}`;
      } catch {
        progressSummary = `远端最后状态=${progress[1]}`;
      }
    }
    const minutes = Math.round(Number(timeout[2]) / 60_000);
    return `LWDP 云端 Job ${timeout[1]} 在 ${minutes} 分钟内未进入终态；${progressSummary}。本地已停止轮询且没有重复提交 Job，需要按该 Job ID 与服务端对账。`;
  }

  if (/Selected model is at capacity/i.test(log)) {
    const cloudJob = lastMatch(
      log,
      /WORLDKIT_LWDP_JOB [^\s]+ [^\s]+ (gen_[a-zA-Z0-9]+)/g,
    );
    return `LWDP Codex${cloudJob ? ` Job ${cloudJob[1]}` : ""} 失败：gpt-5.6-sol 当前容量不足，远端任务已终止且没有生成完整产物；可在容量恢复后重试。`;
  }

  if (/BLOCK_WORLD_SUBJECT_MOVEMENT_UNSATISFIED/.test(log)) {
    return "Builder 选择的主体不具备 Scene Brief 要求的运动能力；当前 Agent Authoring Catalog 没有可执行的对应运动闭包，Host 已阻止静默降级。";
  }

  const missingOutputs = lastMatch(log, /missing required outputs:\s*([^\n]+)/gi);
  if (missingOutputs) {
    return `云端 Codex 已结束，但缺少声明的必需产物：${missingOutputs[1].trim()}`;
  }
  if (/Builder top-down visual review does not match trusted Host replay\./.test(log)) {
    return "Builder 俯视复核图的解码像素与可信 Host 重放不一致。";
  }
  if (/Builder entry visual review does not match trusted Host replay\./.test(log)) {
    return "Builder 进入构图复核图的解码像素与可信 Host 重放不一致。";
  }
  if (/WORLDKIT_CAPTURE_VISIBLE_WORLD_MISSING/.test(log)) {
    return "真实白膜 Runtime 已启动，但连续捕获只得到背景或近乎单色画面；通常表示相机位于主体/碰撞体内部，或入口相机没有看到场景，必须修正 Builder 主体与相机后再捕获。";
  }

  const shellSyntaxFailure = lastMatch(
    log,
    /^(?:\[stderr\]\s*)?([^\n]*unexpected EOF while looking for matching[^\n]*)$/gim,
  );
  if (shellSyntaxFailure) {
    return `工作流收尾脚本存在语法错误：${shellSyntaxFailure[1].trim()}`;
  }

  const explicitError = lastMatch(log, /^Error:\s*([^\n]+)$/gm);
  if (explicitError) return explicitError[1].trim();
  return `World generation exited with code ${code}${signal ? ` (${signal})` : ""}.`;
}

export function isRecoverableVisualFinalizationFailure(record, rawLog = "") {
  return record?.status === "failed" &&
    record?.failedStage === "visual-reconstruction" &&
    record?.captureStatus === "passed" &&
    record?.triviewStatus === "passed" &&
    record?.whiteboxOutcome === "passed" &&
    !/alignment.{0,24}(?:fail|error)|(?:fail|error).{0,24}alignment/i.test(rawLog) &&
    /收尾脚本存在语法错误/.test(
      deriveWorldGenerationFailureReason(rawLog),
    );
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
      /timeout|timed out|capacity|queued|connection|http2|rate.?limit|502|503|504|stopped|restart|lwdp 云端/.test(failureText)
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
        ["running", "remote-pending"].includes(record.status) ? "live" : "partial",
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
    if (
      definition.id === "runtime-capture" &&
      (record.captureStatus === "failed" || record.triviewStatus === "failed")
    ) status = "failed";
    if (definition.id === "visual-reconstruction" && record.styledTriviewsRequired !== true) {
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
  const hostTrustRoot = path.join(dataRoot, "host-trust");
  const captureSigningPrivateKeyPath = path.resolve(
    options.captureSigningPrivateKeyPath ??
      path.join(hostTrustRoot, "whitebox-capture-private.pem"),
  );
  const trustedCapturePublicKeyPath = path.resolve(
    options.trustedCapturePublicKeyPath ??
      path.join(hostTrustRoot, "whitebox-capture-public.pem"),
  );
  const trustedCapturePublicKeyPaths = normalizeTrustedCapturePublicKeyPaths(
    trustedCapturePublicKeyPath,
    options.additionalTrustedCapturePublicKeyPaths ?? [],
  );
  if (
    (options.captureSigningPrivateKeyPath === undefined) !==
    (options.trustedCapturePublicKeyPath === undefined)
  ) {
    throw new Error(
      "Studio capture trust configuration requires both private and public key paths.",
    );
  }

  async function ensureWhiteboxCaptureHostKeyPair() {
    const [privatePem, publicPem] = await Promise.all([
      readFile(captureSigningPrivateKeyPath).catch(() => null),
      readFile(trustedCapturePublicKeyPath).catch(() => null),
    ]);
    if (privatePem === null && publicPem !== null) {
      throw new Error(
        "Studio capture Host trust is missing its private signing key.",
      );
    }
    if (privatePem !== null && publicPem === null) {
      const recoveredPublicPem = createPublicKey(createPrivateKey(privatePem)).export({
        type: "spki",
        format: "pem",
      });
      await mkdir(path.dirname(trustedCapturePublicKeyPath), {
        recursive: true,
        mode: 0o700,
      });
      await writeFile(trustedCapturePublicKeyPath, recoveredPublicPem, {
        mode: 0o644,
        flag: "wx",
      });
      await chmod(captureSigningPrivateKeyPath, 0o600);
      return;
    }
    if (privatePem !== null && publicPem !== null) {
      const derivedPublicPem = createPublicKey(createPrivateKey(privatePem)).export({
        type: "spki",
        format: "pem",
      });
      const configuredPublicPem = createPublicKey(publicPem).export({
        type: "spki",
        format: "pem",
      });
      if (!Buffer.from(derivedPublicPem).equals(Buffer.from(configuredPublicPem))) {
        throw new Error("Studio capture Host trust key pair does not match.");
      }
      await Promise.all([
        chmod(captureSigningPrivateKeyPath, 0o600),
        chmod(trustedCapturePublicKeyPath, 0o644),
      ]);
      return;
    }
    await Promise.all([
      mkdir(path.dirname(captureSigningPrivateKeyPath), {
        recursive: true,
        mode: 0o700,
      }),
      mkdir(path.dirname(trustedCapturePublicKeyPath), {
        recursive: true,
        mode: 0o700,
      }),
    ]);
    const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    await Promise.all([
      writeFile(captureSigningPrivateKeyPath, privateKey, { mode: 0o600, flag: "wx" }),
      writeFile(trustedCapturePublicKeyPath, publicKey, { mode: 0o644, flag: "wx" }),
    ]);
  }
  const builtinTestSetsRoot = path.join(repoRoot, "apps/studio/builtin-test-sets");
  const builtinResultsRoot = path.join(repoRoot, "apps/studio/builtin-results");
  const playgroundOrigin = options.playgroundOrigin ?? "http://127.0.0.1:5173";
  const playgroundInternalOrigin = options.playgroundInternalOrigin ?? "http://127.0.0.1:5173";
  const accessKey = options.accessKey ?? "";
  const readinessNonce = options.readinessNonce ?? "";
  if (readinessNonce !== "" && !/^[a-f0-9]{32,128}$/.test(readinessNonce)) {
    throw new Error("Studio readiness nonce must contain 32 to 128 lowercase hexadecimal characters.");
  }
  const autoRunJobs = options.autoRunJobs ?? true;
  let cloudProductionThroughput = options.cloudProductionThroughput;
  if (!cloudProductionThroughput) {
    try {
      cloudProductionThroughput = loadCloudProductionThroughputConfigSync(repoRoot);
    } catch (error) {
      if (error?.code !== "ENOENT" || repoRoot === defaultRepoRoot) throw error;
      // Isolated Studio tests and embedded callers may point repoRoot at a
      // fixture containing only Scene assets. The production throughput
      // contract remains owned by this installed Studio source tree.
      cloudProductionThroughput = loadCloudProductionThroughputConfigSync(defaultRepoRoot);
    }
  }
  const configuredConcurrency = Number(
    options.maxConcurrentJobs ?? process.env.WORLDKIT_STUDIO_MAX_CONCURRENT_JOBS ??
      cloudProductionThroughput.pools.sceneCases,
  );
  const maxConcurrentJobs = Number.isSafeInteger(configuredConcurrency) &&
    configuredConcurrency >= 1 && configuredConcurrency <= 100
    ? configuredConcurrency
    : cloudProductionThroughput.pools.sceneCases;
  const configuredBackendConcurrency = (value, fallback) => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 100
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
  const studioOwnerPath = path.join(dataRoot, "studio-owner.json");
  const studioInstanceId = `${process.pid}-${randomBytes(12).toString("hex")}`;
  const enforceSingleWriterLease = options.enforceSingleWriterLease ?? true;
  let ownsStudioWriterLease = false;

  const processIsAlive = (pid) => {
    if (!Number.isSafeInteger(pid) || pid < 1) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return error?.code === "EPERM";
    }
  };

  async function acquireStudioWriterLease() {
    if (!enforceSingleWriterLease || ownsStudioWriterLease) return;
    await mkdir(dataRoot, { recursive: true });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const handle = await open(studioOwnerPath, "wx", 0o600);
        try {
          await handle.writeFile(`${JSON.stringify({
            kind: "worldkit-studio-writer-lease",
            schemaVersion: 1,
            instanceId: studioInstanceId,
            pid: process.pid,
            processIdentity: studioWriterProcessIdentity,
            startedAt: new Date().toISOString(),
          })}\n`, "utf8");
        } finally {
          await handle.close();
        }
        ownsStudioWriterLease = true;
        return;
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
        const owner = await readJsonIfPresent(studioOwnerPath);
        if (owner?.instanceId === studioInstanceId) {
          ownsStudioWriterLease = true;
          return;
        }
        const ownerStartedAtMs = Date.parse(owner?.startedAt);
        const reusedCurrentPid = owner?.pid === process.pid && (
          (typeof owner?.processIdentity === "string" &&
            owner.processIdentity !== studioWriterProcessIdentity) ||
          (typeof owner?.processIdentity !== "string" &&
            Number.isFinite(ownerStartedAtMs) &&
            ownerStartedAtMs < studioWriterProcessStartedAtMs - 1_000)
        );
        if (attempt === 0 && (!processIsAlive(owner?.pid) || reusedCurrentPid)) {
          await unlink(studioOwnerPath).catch(() => undefined);
          continue;
        }
        throw new Error(
          `WORLDKIT_STUDIO_WRITER_ALREADY_ACTIVE: ${owner?.instanceId ?? "unknown"}`,
        );
      }
    }
  }

  async function releaseStudioWriterLease() {
    if (!ownsStudioWriterLease) return;
    const owner = await readJsonIfPresent(studioOwnerPath);
    if (owner?.instanceId === studioInstanceId) {
      await unlink(studioOwnerPath).catch(() => undefined);
    }
    ownsStudioWriterLease = false;
  }
  const projectLwdpEnvFile = path.join(
    repoRoot,
    ".codex-tmp",
    "runtime-config",
    "lwdp.env",
  );
  const cloudControlPlane = options.cloudControlPlane ??
    process.env.WORLDKIT_CLOUD_CONTROL_PLANE === "1";
  const cloudSceneExecutionEnabled = options.cloudSceneExecutionEnabled ?? true;
  const listCloudSceneRunIndexRecordsImplementation =
    options.listCloudSceneRunIndexRecordsImplementation ?? listCloudSceneRunIndexRecords;
  const loadCloudSceneProductionConfigImplementation =
    options.loadCloudSceneProductionConfigImplementation ??
    (() => loadCloudSceneProductionConfig(repoRoot));
  const executeStudioCloudSceneImplementation =
    options.executeStudioCloudSceneImplementation ?? executeStudioCloudScene;
  const launchStudioCloudSceneWorkerImplementation =
    options.launchStudioCloudSceneWorkerImplementation ?? launchStudioCloudSceneWorker;
  const loadCloudEpisodeProductionConfigImplementation =
    options.loadCloudEpisodeProductionConfigImplementation ??
    (() => loadCloudEpisodeProductionConfig(repoRoot));
  const executeStudioCloudEpisodeImplementation =
    options.executeStudioCloudEpisodeImplementation ?? executeStudioCloudEpisode;
  const retryStudioCloudEpisodeImplementation =
    options.retryStudioCloudEpisodeImplementation ?? retryStudioCloudEpisode;
  const recoverStudioCloudEpisodeImplementation =
    options.recoverStudioCloudEpisodeImplementation ?? recoverStudioCloudEpisode;
  const resumeStudioCloudSceneHostImplementation =
    options.resumeStudioCloudSceneHostImplementation ?? resumeStudioCloudSceneHost;
  const resumeStudioCloudSceneBuilderImplementation =
    options.resumeStudioCloudSceneBuilderImplementation ?? resumeStudioCloudSceneBuilder;
  const rebuildStudioCloudSceneBuilderImplementation =
    options.rebuildStudioCloudSceneBuilderImplementation ?? rebuildStudioCloudSceneBuilder;
  const getCloudExecutionImplementation =
    options.getCloudExecutionImplementation ?? getCloudExecution;
  const getCloudExecutionStagesImplementation =
    options.getCloudExecutionStagesImplementation ?? getCloudExecutionStages;
  const getCloudExecutionCapacityImplementation =
    options.getCloudExecutionCapacityImplementation ?? getCloudExecutionCapacity;
  const cancelCloudExecutionImplementation =
    options.cancelCloudExecutionImplementation ?? cancelCloudExecution;
  const dispatchCloudExecutionImplementation =
    options.dispatchCloudExecutionImplementation ?? dispatchCloudExecution;
  const readCloudArtifactManifestImplementation =
    options.readCloudArtifactManifestImplementation ?? readCloudArtifactManifest;
  const readVerifiedCloudArtifactImplementation =
    options.readVerifiedCloudArtifactImplementation ?? readVerifiedCloudArtifact;
  const streamCloudArtifactImplementation =
    options.streamCloudArtifactImplementation ?? streamCloudArtifact;
  let cachedCloudSceneProductionConfig = null;
  let cachedCloudEpisodeProductionConfig;
  const cloudSceneProductionConfig = async () => {
    if (!cloudSceneExecutionEnabled) return null;
    if (cachedCloudSceneProductionConfig === null) {
      cachedCloudSceneProductionConfig = await loadCloudSceneProductionConfigImplementation();
    }
    return cachedCloudSceneProductionConfig;
  };
  const cloudEpisodeProductionConfig = async () => {
    if (!cloudSceneExecutionEnabled) return null;
    if (cachedCloudEpisodeProductionConfig === undefined) {
      cachedCloudEpisodeProductionConfig =
        await loadCloudEpisodeProductionConfigImplementation();
    }
    return cachedCloudEpisodeProductionConfig;
  };
  const initialCodexBackend = normalizedCodexBackend(
    options.initialCodexBackend ?? options.codexBackend ?? process.env.WORLDKIT_CODEX_BACKEND,
    "cloud",
  );
  const codexSpawnSync = options.codexSpawnSync ?? spawnSync;
  const codexBinary = options.codexBinary ?? process.env.WORLDKIT_LOCAL_CODEX_BIN ?? "codex";
  const worldSpawnImplementation = options.worldSpawnImplementation ?? spawn;
  const artifactVerificationWaiters = [];
  let activeArtifactVerifications = 0;
  const withArtifactVerificationSlot = async (task) => {
    if (activeArtifactVerifications >= 4) {
      await new Promise((resolve) => artifactVerificationWaiters.push(resolve));
    }
    activeArtifactVerifications += 1;
    try {
      return await task();
    } finally {
      activeArtifactVerifications -= 1;
      artifactVerificationWaiters.shift()?.();
    }
  };
  const runArtifactVerifier = (arguments_) => withArtifactVerificationSlot(() =>
    new Promise((resolve) => {
      const child = spawn("pnpm", arguments_, {
        cwd: repoRoot,
        env: process.env,
        stdio: "ignore",
        timeout: 30_000,
      });
      let settled = false;
      const finish = (passed) => {
        if (settled) return;
        settled = true;
        resolve(passed);
      };
      child.once("error", () => finish(false));
      child.once("close", (code) => finish(code === 0));
    }));
  const verifyHostedWhiteboxArtifactsImplementation =
    options.verifyHostedWhiteboxArtifactsImplementation ?? (async (input) => {
      for (const trustedPublicKeyPath of trustedCapturePublicKeyPaths) {
        const arguments_ = [
          "exec",
          "tsx",
          "scripts/cli/verify-hosted-whitebox-artifacts.ts",
          "--scene-id", input.sceneId,
          "--authoring", input.authoringPath,
          "--build", input.buildPath,
          "--opening-frame", input.openingFramePath,
          "--runtime-snapshot", input.runtimeSnapshotPath,
          "--capture-receipt", input.captureReceiptPath,
          "--trusted-public-key", trustedPublicKeyPath,
          ...(input.requireTriview
            ? [
                "--require-triview",
                "--triview-manifest", input.whiteboxTriviewManifestPath,
                "--triview-root", input.whiteboxTriviewRoot,
              ]
            : []),
        ];
        if (await runArtifactVerifier(arguments_)) return true;
      }
      return false;
    });
  const beforeWorldSpawn = options.beforeWorldSpawn ?? (() => undefined);
  const autoRecoverLateLwdpJobs = options.autoRecoverLateLwdpJobs ?? autoRunJobs;
  const lateLwdpRecoveryImplementation = options.lateLwdpRecoveryImplementation ??
    recoverSucceededCodexJobOutputs;
  const loadLwdpConfigImplementation = options.loadLwdpConfigImplementation ??
    loadLwdpGenerationConfig;
  const visualRecoveryFinalizeImplementation = options.visualRecoveryFinalizeImplementation ??
    finalizeRecoveredVisualOutputs;
  const configuredRemotePendingGraceMs = Number(
    options.remotePendingGraceMs ?? process.env.WORLDKIT_LWDP_REMOTE_PENDING_GRACE_MS ?? 60 * 60_000,
  );
  const remotePendingGraceMs = Number.isSafeInteger(configuredRemotePendingGraceMs) &&
    configuredRemotePendingGraceMs >= 1_000
    ? configuredRemotePendingGraceMs
    : 60 * 60_000;
  const configuredRemoteRecoveryIntervalMs = Number(
    options.remoteRecoveryIntervalMs ??
    process.env.WORLDKIT_LWDP_REMOTE_RECOVERY_INTERVAL_MS ?? 60_000,
  );
  const remoteRecoveryIntervalMs = Number.isSafeInteger(configuredRemoteRecoveryIntervalMs) &&
    configuredRemoteRecoveryIntervalMs >= 1_000
    ? configuredRemoteRecoveryIntervalMs
    : 60_000;
  const queue = [];
  const activeJobs = new Set();
  const activeJobBackends = new Map();
  const activeChildren = new Map();
  const stoppingJobs = new Set();
  let cloudSceneRunIndexCache = null;
  let cloudSceneRunIndexInFlight = null;
  let cloudSceneRunIndexRevision = 0;
  const runRecordMutation = createKeyedSerialExecutor();
  const runRuntimeSettingsMutation = createKeyedSerialExecutor();
  let selectedCodexBackend = initialCodexBackend;
  let shuttingDown = false;
  let remoteRecoveryTimer = null;
  let remoteRecoveryInFlight = false;
  const remoteRecoveryLogKeys = new Set();
  const pnpmAvailable = options.pnpmAvailable ?? commandAvailable("pnpm");
  const codexAvailabilityTtlMs = Math.max(1_000, Number(options.codexAvailabilityTtlMs ?? 30_000));
  let cachedCodexAvailability = null;
  let cachedCodexAvailabilityAt = 0;
  let codexAvailabilityInFlight = null;
  let enrichedWorldListCache = null;
  let enrichedWorldListInFlight = null;
  let worldListRevision = 0;
  const playableWhiteboxVerificationCache = new Map();

  async function verifyPlayableWhiteboxArtifacts(input) {
    const boundPaths = [
      input.authoringPath,
      input.buildPath,
      input.openingFramePath,
      input.runtimeSnapshotPath,
      input.captureReceiptPath,
      ...trustedCapturePublicKeyPaths,
    ];
    const hashes = await Promise.all(boundPaths.map(sourceHash));
    if (hashes.some((value) => value === null)) return false;
    const cacheKey = `${input.sceneId}\u0000${hashes.join("\u0000")}`;
    if (playableWhiteboxVerificationCache.has(cacheKey)) {
      return playableWhiteboxVerificationCache.get(cacheKey);
    }
    const passed = Boolean(await verifyHostedWhiteboxArtifactsImplementation({
      ...input,
      trustedCapturePublicKeyPath,
    }));
    if (playableWhiteboxVerificationCache.size >= 256) {
      playableWhiteboxVerificationCache.clear();
    }
    playableWhiteboxVerificationCache.set(cacheKey, passed);
    return passed;
  }

  function effectiveCodexBackend(record) {
    return normalizedCodexBackend(record?.codexBackend, "cloud");
  }

  async function codexBackendAvailability({ force = false } = {}) {
    const now = Date.now();
    if (!force && cachedCodexAvailability && now - cachedCodexAvailabilityAt < codexAvailabilityTtlMs) {
      return cachedCodexAvailability;
    }
    if (codexAvailabilityInFlight) return codexAvailabilityInFlight;
    codexAvailabilityInFlight = (async () => {
      let cloud = Boolean(options.lwdpConfigured ?? await fileExists(projectLwdpEnvFile));
      if (cloud && cloudSceneExecutionEnabled) {
        try {
          await cloudSceneProductionConfig();
        } catch {
          cloud = false;
        }
      }
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
      cachedCodexAvailability = Object.freeze({ cloud, local });
      cachedCodexAvailabilityAt = Date.now();
      return cachedCodexAvailability;
    })();
    try {
      return await codexAvailabilityInFlight;
    } finally {
      codexAvailabilityInFlight = null;
    }
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
  const episodeWorkflows = createEpisodeWorkflowService({
    repoRoot,
    studioOrigin: () => options.studioOrigin ??
      `http://127.0.0.1:${Number(process.env.WORLDKIT_STUDIO_PORT ?? 4174)}`,
    spawnImplementation: options.episodeSpawnImplementation,
    ensureCloudEpisodeAvailable: async () => {
      if (await cloudEpisodeProductionConfig() === null) {
        throw new Error(
          "Cloud Episode production is disabled until its digest-pinned GPU Worker image is deployed.",
        );
      }
      const lwdpConfig = await loadLwdpConfigImplementation({
        ...process.env,
        LWDP_GENERATION_API_TOKEN: undefined,
        LWDP_API_BASE: undefined,
        LWDP_USER_ID: undefined,
        WORLDKIT_LWDP_ENV_FILE: projectLwdpEnvFile,
      });
      try {
        await getCloudExecutionCapacityImplementation({ config: lwdpConfig });
      } catch (error) {
        if (error?.status === 404) {
          throw new Error(
            "LWDP Cloud Execution control plane is unavailable (404); " +
            "the Episode was not created and no Worker was launched.",
            { cause: error },
          );
        }
        throw error;
      }
    },
    resolveCloudSceneInput: async (sceneId) => {
      const sceneRecord = await readRecord(sceneId);
      if (
        sceneRecord?.status !== "ready" ||
        sceneRecord.remoteArtifactAdmission?.status !== "passed" ||
        sceneRecord.remoteArtifactAdmission?.executionId !== sceneRecord.remoteExecutionId ||
        typeof sceneRecord.remoteArtifactManifestS3Uri !== "string" ||
        typeof sceneRecord.remoteExecutionId !== "string"
      ) {
        throw new Error(
          "Cloud Episode requires a ready Scene with one admitted remote artifact manifest.",
        );
      }
      return {
        sceneRecord,
        sceneExecutionId: sceneRecord.remoteExecutionId,
        sceneManifestS3Uri: sceneRecord.remoteArtifactManifestS3Uri,
      };
    },
    executeCloudEpisode: async (input) => {
      const [productionConfig, lwdpConfig] = await Promise.all([
        cloudEpisodeProductionConfig(),
        loadLwdpConfigImplementation({
          ...process.env,
          LWDP_GENERATION_API_TOKEN: undefined,
          LWDP_API_BASE: undefined,
          LWDP_USER_ID: undefined,
          WORLDKIT_LWDP_ENV_FILE: projectLwdpEnvFile,
        }),
      ]);
      if (productionConfig === null) {
        throw new Error("Cloud Episode production is disabled until its Worker image is deployed.");
      }
      return executeStudioCloudEpisodeImplementation({
        ...input,
        config: productionConfig,
        cloudConfig: lwdpConfig,
      });
    },
    retryCloudEpisode: async (input) => {
      const [productionConfig, lwdpConfig] = await Promise.all([
        cloudEpisodeProductionConfig(),
        loadLwdpConfigImplementation({
          ...process.env,
          LWDP_GENERATION_API_TOKEN: undefined,
          LWDP_API_BASE: undefined,
          LWDP_USER_ID: undefined,
          WORLDKIT_LWDP_ENV_FILE: projectLwdpEnvFile,
        }),
      ]);
      if (productionConfig === null) {
        throw new Error("Cloud Episode production is disabled.");
      }
      return retryStudioCloudEpisodeImplementation({
        ...input,
        config: productionConfig,
        cloudConfig: lwdpConfig,
      });
    },
    recoverCloudEpisode: async (input) => {
      const [productionConfig, lwdpConfig] = await Promise.all([
        cloudEpisodeProductionConfig(),
        loadLwdpConfigImplementation({
          ...process.env,
          LWDP_GENERATION_API_TOKEN: undefined,
          LWDP_API_BASE: undefined,
          LWDP_USER_ID: undefined,
          WORLDKIT_LWDP_ENV_FILE: projectLwdpEnvFile,
        }),
      ]);
      if (productionConfig === null) {
        throw new Error("Cloud Episode production is disabled.");
      }
      return recoverStudioCloudEpisodeImplementation({
        ...input,
        config: productionConfig,
        cloudConfig: lwdpConfig,
      });
    },
    cancelCloudEpisode: async (executionId) => {
      const lwdpConfig = await loadLwdpConfigImplementation({
        ...process.env,
        LWDP_GENERATION_API_TOKEN: undefined,
        LWDP_API_BASE: undefined,
        LWDP_USER_ID: undefined,
        WORLDKIT_LWDP_ENV_FILE: projectLwdpEnvFile,
      });
      return cancelCloudExecutionImplementation(executionId, { config: lwdpConfig });
    },
    cancelCloudEpisodeWorkers: (executionId) => deleteCloudEpisodeWorkerJobs({
      executionId,
      namespace: "lwdp",
    }),
    readCloudEpisodeManifest: (manifestS3Uri, expected) =>
      readCloudArtifactManifestImplementation(manifestS3Uri, {
        repoRoot,
        ...expected,
      }),
    resolveCloudEpisodeResumeManifest: async (record) => {
      return resolveLatestCompatibleCloudEpisodeManifest({
        record,
        readManifest: (s3Uri, expected) =>
          readCloudArtifactManifestImplementation(s3Uri, { repoRoot, ...expected }),
      });
    },
    readVerifiedRemoteArtifact: (record, artifactPath) =>
      readVerifiedCloudArtifactImplementation(record, artifactPath, { repoRoot }),
    streamRemoteArtifact: (response, artifact, streamOptions = {}) =>
      streamCloudArtifactImplementation(response, artifact, {
        repoRoot,
        ...streamOptions,
      }),
    redirectRemoteArtifact: (response, artifact, streamOptions = {}) =>
      redirectToPresignedCloudArtifact(response, artifact, {
        repoRoot,
        ...streamOptions,
      }),
    persistCloudEpisodeRecord: async (record) => {
      const productionConfig = await cloudEpisodeProductionConfig();
      if (productionConfig === null) return null;
      return writeCloudEpisodeRunIndexRecord(record, {
        repoRoot,
        outputS3Root: productionConfig.outputS3Root,
      });
    },
    readCloudEpisodeRecord: async (episodeId) => {
      const productionConfig = await cloudEpisodeProductionConfig();
      if (productionConfig === null) return null;
      return readCloudEpisodeRunIndexRecord(episodeId, {
        repoRoot,
        outputS3Root: productionConfig.outputS3Root,
      });
    },
    listCloudEpisodeRecords: async () => {
      const productionConfig = await cloudEpisodeProductionConfig();
      if (productionConfig === null) return [];
      return listCloudEpisodeRunIndexRecords({
        repoRoot,
        outputS3Root: productionConfig.outputS3Root,
      });
    },
  });

  const recordPath = (id) => path.join(worldsRoot, id, "record.json");
  const logPath = (id) => path.join(worldsRoot, id, "agent.log");
  const trajectoryPath = (id) => path.join(worldsRoot, id, "trajectory.jsonl");
  const testSetRecordPath = (id) => path.join(testSetsRoot, id, "record.json");
  const subjectCatalogPath = path.join(
    repoRoot,
    ".codex/skills/worldkit-block-builder/references/agent-authoring-catalog.json",
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
      "world-module": [path.join(artifactRoot, "world.mjs")],
      "authoring-spec": [path.join(artifactRoot, "authoring.json")],
      "implementation-map-draft": [path.join(artifactRoot, "implementation-map.draft.json")],
      "builder-self-check": [path.join(artifactRoot, "builder-self-check.json")],
      "builder-top-down-comparison": [
        path.join(artifactRoot, "builder-top-down-comparison.png"),
      ],
      "builder-entry-comparison": [
        path.join(artifactRoot, "builder-entry-comparison.png"),
      ],
      "builder-host-resume": [path.join(artifactRoot, "builder-host-resume.json")],
      "implementation-map": [path.join(artifactRoot, "scene-implementation-map.json")],
      "execution-plan": [path.join(artifactRoot, "world.build.json")],
      "route-validation-manifest": [path.join(artifactRoot, "route-validation-manifest.json")],
      "opening-frame": [path.join(artifactRoot, "opening-frame.png")],
      "runtime-snapshot": [path.join(artifactRoot, "runtime-snapshot.json")],
      "whitebox-capture-receipt": [path.join(artifactRoot, "whitebox-capture-receipt.json")],
      "whitebox-triview-manifest": [path.join(artifactRoot, "triviews", "whitebox-triview-manifest.json")],
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

  function remoteDeliverableArtifactPath(id) {
    return ({
      "scene-brief": "scene/scene-brief.md",
      "planner-self-check": "scene/planner-self-check.json",
      "visual-identity-palette": "scene/visual-identity-palette.json",
      "world-plan": "scene-plan/world-plan.png",
      "entry-whitebox-target": "scene-plan/entry-whitebox-target.png",
      "world-module": "scene/world.mjs",
      "authoring-spec": "scene/authoring.json",
      "implementation-map-draft": "scene/implementation-map.draft.json",
      "builder-self-check": "scene/builder-self-check.json",
      "builder-top-down-comparison": "scene/builder-top-down-comparison.png",
      "builder-entry-comparison": "scene/builder-entry-comparison.png",
      "builder-host-resume": "scene/builder-host-resume.json",
      "implementation-map": "scene/scene-implementation-map.json",
      "execution-plan": "scene/world.build.json",
      "route-validation-manifest": "scene/route-validation-manifest.json",
      "opening-frame": "scene/opening-frame.png",
      "runtime-snapshot": "scene/runtime-snapshot.json",
      "whitebox-capture-receipt": "scene/whitebox-capture-receipt.json",
      "whitebox-triview-manifest": "scene/triviews/whitebox-triview-manifest.json",
      "entry-third-person-validation": "scene/entry-third-person-validation.json",
      "visual-generation-prompts": "scene/visual-generation-prompts.json",
      "styled-opening-frame": "scene/styled-opening-frame.png",
      "styled-opening-frame-manifest": "scene/styled-opening-frame-manifest.json",
      "styled-opening-frame-report": "scene/styled-opening-frame-report.json",
      "styled-triviews-manifest": "scene/styled-triviews-manifest.json",
      "styled-triviews-report": "scene/styled-triviews-report.json",
      "evaluation-run": "scene/evaluation-run.json",
      "evaluation-report": "scene/evaluation-report.json",
      "agent-log": "logs/pipeline.log",
    })[id] ?? null;
  }

  async function resolveDeliverable(record, id) {
    for (const candidate of deliverableCandidates(record, id)) {
      try {
        const metadata = await stat(candidate);
        if (!metadata.isFile()) continue;
        return { path: candidate, metadata };
      } catch {}
    }
    const remotePath = remoteDeliverableArtifactPath(id);
    const remote = remotePath === null ? null : cloudArtifactByPath(record, remotePath);
    if (remote !== null) {
      return {
        remote,
        metadata: {
          size: remote.byteSize,
          mtime: new Date(record.remoteArtifactAdmission?.verifiedAt ?? record.updatedAt),
        },
      };
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
    let local = null;
    try {
      local = JSON.parse(await readFile(recordPath(id), "utf8"));
    } catch {}
    if (!cloudControlPlane) return local;
    try {
      const productionConfig = await cloudSceneProductionConfig();
      if (productionConfig === null) return local;
      const remote = await readCloudSceneRunIndexRecord(id, {
        repoRoot,
        outputS3Root: productionConfig.outputS3Root,
      });
      if (!local) return remote;
      if (!remote) return local;
      return Number(remote.recordRevision ?? 0) > Number(local.recordRevision ?? 0)
        ? remote
        : local;
    } catch {
      return local;
    }
  }

  async function writeRecordUnlocked(record) {
    record.recordRevision = Number.isSafeInteger(record.recordRevision) &&
        record.recordRevision >= 0
      ? record.recordRevision + 1
      : 1;
    record.updatedAt = new Date().toISOString();
    if (cloudControlPlane && record.codexBackend === "cloud") {
      const productionConfig = await cloudSceneProductionConfig();
      if (productionConfig !== null) {
        await writeCloudSceneRunIndexRecord(record, {
          repoRoot,
          outputS3Root: productionConfig.outputS3Root,
        });
        cloudSceneRunIndexRevision += 1;
        cloudSceneRunIndexCache = null;
      }
    }
    await writeJsonAtomic(recordPath(record.id), record);
    worldListRevision += 1;
    enrichedWorldListCache = null;
    enrichedWorldListInFlight = null;
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

  async function transitionRecord(id, patch, expectations = {}) {
    return runRecordMutation(id, async () => {
      const record = await readRecord(id);
      if (!record) return { applied: false, reason: "missing", record: null };
      const decision = evaluateRecordTransition(record, patch, expectations);
      if (!decision.allowed) {
        return { applied: false, reason: decision.reason, record };
      }
      const updated = applyRecordPatch(record, patch);
      await writeRecordUnlocked(updated);
      return { applied: true, reason: "applied", record: updated };
    });
  }

  async function updateRecord(id, patch) {
    return (await transitionRecord(id, patch)).record;
  }

  async function listRecords() {
    await mkdir(worldsRoot, { recursive: true });
    const entries = await readdir(worldsRoot, { withFileTypes: true });
    let records = (
      await Promise.all(entries.filter((entry) => entry.isDirectory()).map((entry) => readRecord(entry.name)))
    ).filter(Boolean);
    if (cloudControlPlane) {
      const productionConfig = await cloudSceneProductionConfig();
      if (productionConfig !== null) {
        if (cloudSceneRunIndexCache?.expiresAt <= Date.now()) {
          cloudSceneRunIndexCache = null;
        }
        if (cloudSceneRunIndexCache === null && cloudSceneRunIndexInFlight === null) {
          const revision = cloudSceneRunIndexRevision;
          cloudSceneRunIndexInFlight = listCloudSceneRunIndexRecordsImplementation({
            repoRoot,
            outputS3Root: productionConfig.outputS3Root,
          }).then((remoteRecords) => {
            if (revision === cloudSceneRunIndexRevision) {
              cloudSceneRunIndexCache = {
                records: remoteRecords,
                expiresAt: Date.now() + 15_000,
              };
            }
            return remoteRecords;
          }).catch(() => []).finally(() => {
            cloudSceneRunIndexInFlight = null;
          });
        }
        const remoteRecords = cloudSceneRunIndexCache?.records ??
          await cloudSceneRunIndexInFlight;
        const byId = new Map(records.map((record) => [record.id, record]));
        for (const remoteRecord of remoteRecords) {
          const local = byId.get(remoteRecord.id);
          if (!local || Number(remoteRecord.recordRevision ?? 0) > Number(local.recordRevision ?? 0)) {
            byId.set(remoteRecord.id, remoteRecord);
          }
        }
        records = [...byId.values()];
      }
    }
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

  async function hasWhiteboxDisplayArtifacts(
    artifactRoot,
    freshnessFloor = Number.NEGATIVE_INFINITY,
  ) {
    const required = [
      "authoring.json",
      "world.build.json",
      "runtime-snapshot.json",
      "whitebox-capture-receipt.json",
    ].map((relativePath) => path.join(artifactRoot, relativePath));
    return (await Promise.all(required.map((filePath) =>
      nonemptyArtifact(filePath, freshnessFloor)))).every(Boolean) &&
      await pngArtifact(path.join(artifactRoot, "opening-frame.png"), freshnessFloor);
  }

  async function sourceHash(filePath) {
    try {
      return `sha256:${createHash("sha256").update(await readFile(filePath)).digest("hex")}`;
    } catch {
      return null;
    }
  }

  async function readRemoteArtifactBytes(record, artifactPath, maximumBytes) {
    return readVerifiedCloudArtifactImplementation(record, artifactPath, {
      repoRoot,
      ...(maximumBytes === undefined ? {} : { maximumBytes }),
    });
  }

  async function readSceneArtifactBytes(record, relativePath, maximumBytes) {
    const localPath = path.join(repoRoot, "artifacts", "scenes", record.sceneId, relativePath);
    try {
      return await readFile(localPath);
    } catch {
      return readRemoteArtifactBytes(record, `scene/${relativePath}`, maximumBytes);
    }
  }

  async function readSceneArtifactText(record, relativePath, maximumBytes = 16 * 1024 * 1024) {
    const bytes = await readSceneArtifactBytes(record, relativePath, maximumBytes);
    return bytes === null ? null : bytes.toString("utf8");
  }

  async function readSceneArtifactJson(record, relativePath, maximumBytes) {
    const source = await readSceneArtifactText(record, relativePath, maximumBytes);
    if (source === null) return null;
    try {
      return JSON.parse(source);
    } catch {
      return null;
    }
  }

  function remoteArtifactAvailable(record, artifactPath) {
    return cloudArtifactByPath(record, artifactPath) !== null;
  }

  async function admitCloudArtifactManifest(record, executionId, manifestS3Uri) {
    const manifest = await readCloudArtifactManifestImplementation(manifestS3Uri, {
      repoRoot,
      expectedExecutionId: executionId,
      expectedSceneId: record.sceneId,
    });
    const remoteRecord = { remoteArtifacts: manifest.artifacts };
    const requiredByFileName = {
      "authoring.json": "scene/authoring.json",
      "world.build.json": "scene/world.build.json",
      "opening-frame.png": "scene/opening-frame.png",
      "runtime-snapshot.json": "scene/runtime-snapshot.json",
      "whitebox-capture-receipt.json": "scene/whitebox-capture-receipt.json",
    };
    for (const artifactPath of Object.values(requiredByFileName)) {
      if (!remoteArtifactAvailable(remoteRecord, artifactPath)) {
        return { ok: false, manifest, error: `Cloud result omitted ${artifactPath}.` };
      }
    }
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), "worldkit-cloud-admission-"));
    try {
      const localPaths = {};
      for (const [fileName, artifactPath] of Object.entries(requiredByFileName)) {
        const bytes = await readVerifiedCloudArtifactImplementation(
          remoteRecord,
          artifactPath,
          { repoRoot, maximumBytes: 64 * 1024 * 1024 },
        );
        const localPath = path.join(temporaryRoot, fileName);
        await writeFile(localPath, bytes, { flag: "wx" });
        localPaths[fileName] = localPath;
      }
      const ok = Boolean(await verifyHostedWhiteboxArtifactsImplementation({
        sceneId: record.sceneId,
        authoringPath: localPaths["authoring.json"],
        buildPath: localPaths["world.build.json"],
        openingFramePath: localPaths["opening-frame.png"],
        runtimeSnapshotPath: localPaths["runtime-snapshot.json"],
        captureReceiptPath: localPaths["whitebox-capture-receipt.json"],
        requireTriview: false,
      }));
      return {
        ok,
        manifest,
        error: ok ? null : "Cloud whitebox failed independent trusted Host admission.",
      };
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }

  async function hasTrustedBuilderResumeInputs(record) {
    if (!record?.sceneId) return false;
    const artifactRoot = path.join(repoRoot, "artifacts/scenes", record.sceneId);
    const planRoot = path.join(repoRoot, "apps/playground/public/scene-plans", record.sceneId);
    const paths = {
      brief: path.join(artifactRoot, "scene-brief.md"),
      plannerCheck: path.join(artifactRoot, "planner-self-check.json"),
      palette: path.join(artifactRoot, "visual-identity-palette.json"),
      worldPlan: path.join(planRoot, "world-plan.png"),
      entryWhiteboxTarget: path.join(planRoot, "entry-whitebox-target.png"),
      worldModule: path.join(artifactRoot, "world.mjs"),
      authoring: path.join(artifactRoot, "authoring.json"),
      mapDraft: path.join(artifactRoot, "implementation-map.draft.json"),
      builderCheck: path.join(artifactRoot, "builder-self-check.json"),
      builderTopDownComparison: path.join(
        artifactRoot,
        "builder-top-down-comparison.png",
      ),
      builderEntryComparison: path.join(
        artifactRoot,
        "builder-entry-comparison.png",
      ),
    };
    if (!(await Promise.all(Object.values(paths).map((filePath) =>
      nonemptyArtifact(filePath)))).every(Boolean)) return false;
    if (!(await Promise.all([
      paths.worldPlan,
      paths.entryWhiteboxTarget,
      paths.builderTopDownComparison,
      paths.builderEntryComparison,
    ].map((filePath) => pngArtifact(filePath)))).every(Boolean)) return false;
    const [
      plannerCheck,
      palette,
      builderCheck,
      briefHash,
      worldPlanHash,
      entryWhiteboxTargetHash,
      worldModuleHash,
      authoringHash,
      mapDraftHash,
    ] = await Promise.all([
      readJsonIfPresent(paths.plannerCheck),
      readJsonIfPresent(paths.palette),
      readJsonIfPresent(paths.builderCheck),
      sourceHash(paths.brief),
      sourceHash(paths.worldPlan),
      sourceHash(paths.entryWhiteboxTarget),
      sourceHash(paths.worldModule),
      sourceHash(paths.authoring),
      sourceHash(paths.mapDraft),
    ]);
    return plannerCheck?.kind === "worldkit-planner-self-check" &&
      plannerCheck.schemaVersion === 1 &&
      plannerCheck.validatorVersion === "worldkit-planner-self-check-v4" &&
      plannerCheck.sceneId === record.sceneId && plannerCheck.status === "passed" &&
      plannerCheck.inputs?.sceneBriefHash === briefHash &&
      plannerCheck.inputs?.worldPlanHash === worldPlanHash &&
      plannerCheck.inputs?.entryWhiteboxTargetHash === entryWhiteboxTargetHash &&
      palette?.kind === "worldkit-visual-identity-palette" &&
      palette.schemaVersion === 1 && palette.sceneId === record.sceneId &&
      builderCheck?.kind === "worldkit-block-builder-self-check" &&
      builderCheck.schemaVersion === 1 &&
      [
        "worldkit-block-builder-self-check-v2",
        "worldkit-block-builder-self-check-v3",
        "worldkit-block-builder-self-check-v4",
        "worldkit-block-builder-self-check-v5",
        "worldkit-block-builder-self-check-v6",
        "worldkit-block-builder-self-check-v7",
        "worldkit-block-builder-self-check-v8",
        "worldkit-block-builder-self-check-v9",
        "worldkit-block-builder-self-check-v10",
      ].includes(builderCheck.validatorVersion) &&
      builderCheck.sceneId === record.sceneId && builderCheck.status === "passed" &&
      builderCheck.inputs?.sceneBriefHash === briefHash &&
      builderCheck.inputs?.worldModuleHash === worldModuleHash &&
      builderCheck.inputs?.authoringSpecHash === authoringHash &&
      builderCheck.inputs?.implementationMapDraftHash === mapDraftHash;
  }

  async function hasTrustedPlannerResumeInputs(record, { requirePalette = true } = {}) {
    const recoveryStage = record?.failedStage ?? record?.stage;
    if (!["planner", "coding-agent"].includes(recoveryStage)) return false;
    const artifactRoot = path.join(repoRoot, "artifacts/scenes", record.sceneId);
    const planRoot = path.join(repoRoot, "apps/playground/public/scene-plans", record.sceneId);
    const paths = {
      brief: path.join(artifactRoot, "scene-brief.md"),
      plannerCheck: path.join(artifactRoot, "planner-self-check.json"),
      palette: path.join(artifactRoot, "visual-identity-palette.json"),
      worldPlan: path.join(planRoot, "world-plan.png"),
      entryWhiteboxTarget: path.join(planRoot, "entry-whitebox-target.png"),
    };
    const requiredPaths = Object.entries(paths)
      .filter(([name]) => requirePalette || name !== "palette")
      .map(([, filePath]) => filePath);
    if (!(await Promise.all(requiredPaths.map((filePath) =>
      nonemptyArtifact(filePath)))).every(Boolean)) return false;
    if (!(await Promise.all([
      paths.worldPlan,
      paths.entryWhiteboxTarget,
    ].map((filePath) => pngArtifact(filePath)))).every(Boolean)) return false;
    const [brief, plannerCheck, palette, briefHash, worldPlanHash, entryWhiteboxTargetHash] =
      await Promise.all([
        readFile(paths.brief, "utf8").catch(() => null),
        readJsonIfPresent(paths.plannerCheck),
        readJsonIfPresent(paths.palette),
        sourceHash(paths.brief),
        sourceHash(paths.worldPlan),
        sourceHash(paths.entryWhiteboxTarget),
      ]);
    const plannerInputsAreTrusted = typeof brief === "string" && brief.startsWith("# WorldKit Scene Brief") &&
      plannerCheck?.kind === "worldkit-planner-self-check" &&
      plannerCheck.schemaVersion === 1 &&
      plannerCheck.validatorVersion === "worldkit-planner-self-check-v4" &&
      plannerCheck.sceneId === record.sceneId && plannerCheck.status === "passed" &&
      plannerCheck.inputs?.sceneBriefHash === briefHash &&
      plannerCheck.inputs?.worldPlanHash === worldPlanHash &&
      plannerCheck.inputs?.entryWhiteboxTargetHash === entryWhiteboxTargetHash;
    if (!plannerInputsAreTrusted || !requirePalette) return plannerInputsAreTrusted;
    return palette?.kind === "worldkit-visual-identity-palette" &&
      palette.schemaVersion === 1 && palette.sceneId === record.sceneId &&
      /^sha256:[a-f0-9]{64}$/.test(palette.sceneBriefHash ?? "") &&
      Array.isArray(palette.targets) && palette.targets.length > 0 && palette.targets.length <= 5;
  }

  async function prepareTrustedPlannerResume(record) {
    if (await hasTrustedPlannerResumeInputs(record)) return true;
    if (!await hasTrustedPlannerResumeInputs(record, { requirePalette: false })) return false;
    const artifactRoot = path.join(repoRoot, "artifacts/scenes", record.sceneId);
    const result = spawnSync("pnpm", [
      "exec",
      "tsx",
      "scripts/visual/write-visual-identity-palette.ts",
      "--scene-id",
      record.sceneId,
      "--brief",
      path.join(artifactRoot, "scene-brief.md"),
      "--output",
      path.join(artifactRoot, "visual-identity-palette.json"),
    ], { cwd: repoRoot, encoding: "utf8" });
    if (result.status !== 0) {
      await appendJobLog(
        record.id,
        `\nLate Planner recovery could not derive the visual identity palette: ${result.stderr || result.stdout}\n`,
      );
      return false;
    }
    return hasTrustedPlannerResumeInputs(record);
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
    authoringSpecHash,
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
      executionPlan.authoringSpecHash !== authoringSpecHash
    ) return false;
    const subject = report.subject;
    const receipt = report.routeValidationSetReceipt;
    const expectedSharedIdentity = {
      authoringSpecHash: executionPlan.authoringSpecHash,
      normalizedWorldIrHash: build.normalizedWorldIrHash,
      layoutSolveReportHash: executionPlan.layout?.layoutSolveReportHash,
    };
    for (const [field, expected] of Object.entries(expectedSharedIdentity)) {
      if (!/^sha256:[a-f0-9]{64}$/.test(expected ?? "")) return false;
      if (subject?.[field] !== expected || receipt?.[field] !== expected) return false;
    }
    if (
      subject?.worldBuildIdentityHash !== build.worldBuildIdentityHash ||
      Object.hasOwn(subject ?? {}, "executionPlanHash") ||
      !/^sha256:[a-f0-9]{64}$/.test(subject?.worldPackageRootHash ?? "") ||
      !/^sha256:[a-f0-9]{64}$/.test(subject?.resourceLockHash ?? "") ||
      receipt?.executionPlanHash !== build.executionPlanHash ||
      receipt?.resourceLockHash !==
        build.normalizedWorldIr?.resources?.resourceLockHash
    ) return false;
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

  async function hasPlayableWhiteboxArtifacts(
    artifactRoot,
    sceneId,
    freshnessFloor = Number.NEGATIVE_INFINITY,
  ) {
    const paths = {
      authoring: path.join(artifactRoot, "authoring.json"),
      implementationMap: path.join(artifactRoot, "scene-implementation-map.json"),
      build: path.join(artifactRoot, "world.build.json"),
      openingFrame: path.join(artifactRoot, "opening-frame.png"),
      snapshot: path.join(artifactRoot, "runtime-snapshot.json"),
      captureReceipt: path.join(artifactRoot, "whitebox-capture-receipt.json"),
    };
    if (!(await Promise.all(Object.values(paths).map((filePath) =>
      nonemptyArtifact(filePath, freshnessFloor)))).every(Boolean)) return false;
    if (!await pngArtifact(paths.openingFrame, freshnessFloor)) return false;
    const [authoring, implementationMap, build, snapshot] = await Promise.all([
      readJsonIfPresent(paths.authoring),
      readJsonIfPresent(paths.implementationMap),
      readJsonIfPresent(paths.build),
      readJsonIfPresent(paths.snapshot),
    ]);
    const authoringSpecHash = authoring === null ? null : hashCanonicalJson(authoring);
    const passed = authoring?.kind === "worldkit-authoring-spec" && authoring.schemaVersion === 4 &&
      authoring.id === sceneId &&
      implementationMap?.kind === "worldkit-scene-brief-implementation-map" &&
      implementationMap.schemaVersion === 1 && implementationMap.sceneId === sceneId &&
      implementationMap.authoringSpecId === authoring.id &&
      implementationMap.authoringSpecHash === authoringSpecHash &&
      build?.kind === "worldkit-build-artifact" && build.schemaVersion === 4 &&
      /^sha256:[a-f0-9]{64}$/.test(build.worldBuildIdentityHash ?? "") &&
      /^sha256:[a-f0-9]{64}$/.test(build.executionPlanHash ?? "") &&
      build.executionPlan?.kind === "worldkit-canonical-scene-execution-plan" &&
      build.executionPlan.schemaVersion === 1 &&
      hashCanonicalJson(build.executionPlan) === build.executionPlanHash &&
      build.executionPlan.authoringSpecHash === authoringSpecHash &&
      hashCanonicalJson(build.normalizedWorldIr) === build.normalizedWorldIrHash &&
      snapshot?.kind === "worldkit-runtime-snapshot" && snapshot.schemaVersion === 4 &&
      snapshot.runtime?.phase === "ready" && snapshot.resources?.phase === "ready";
    return passed && await verifyPlayableWhiteboxArtifacts({
      sceneId,
      authoringPath: paths.authoring,
      buildPath: paths.build,
      openingFramePath: paths.openingFrame,
      runtimeSnapshotPath: paths.snapshot,
      captureReceiptPath: paths.captureReceipt,
      requireTriview: false,
    });
  }

  async function hasTrustedWhiteboxArtifacts(artifactRoot, sceneId, freshnessFloor = Number.NEGATIVE_INFINITY) {
    const planRoot = path.join(repoRoot, "apps/playground/public/scene-plans", sceneId);
    const paths = {
      brief: path.join(artifactRoot, "scene-brief.md"),
      plannerCheck: path.join(artifactRoot, "planner-self-check.json"),
      palette: path.join(artifactRoot, "visual-identity-palette.json"),
      worldPlan: path.join(planRoot, "world-plan.png"),
      entryWhiteboxTarget: path.join(planRoot, "entry-whitebox-target.png"),
      worldModule: path.join(artifactRoot, "world.mjs"),
      authoring: path.join(artifactRoot, "authoring.json"),
      mapDraft: path.join(artifactRoot, "implementation-map.draft.json"),
      builderCheck: path.join(artifactRoot, "builder-self-check.json"),
      implementationMap: path.join(artifactRoot, "scene-implementation-map.json"),
      build: path.join(artifactRoot, "world.build.json"),
      openingFrame: path.join(artifactRoot, "opening-frame.png"),
      snapshot: path.join(artifactRoot, "runtime-snapshot.json"),
      captureReceipt: path.join(artifactRoot, "whitebox-capture-receipt.json"),
      captureTargets: path.join(artifactRoot, "triviews", "whitebox-triview-manifest.json"),
    };
    if (!(await Promise.all(Object.values(paths).map((filePath) =>
      nonemptyArtifact(filePath, freshnessFloor)))).every(Boolean)) return false;
    if (!(await Promise.all([
      paths.openingFrame,
      paths.worldPlan,
      paths.entryWhiteboxTarget,
    ].map((filePath) => pngArtifact(filePath, freshnessFloor)))).every(Boolean)) return false;

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
      worldPlanHash,
      entryWhiteboxTargetHash,
      worldModuleHash,
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
      sourceHash(paths.worldPlan),
      sourceHash(paths.entryWhiteboxTarget),
      sourceHash(paths.worldModule),
      sourceHash(paths.authoring),
      sourceHash(paths.mapDraft),
    ]);
    if (
      typeof brief !== "string" || !brief.startsWith("# WorldKit Scene Brief") ||
      plannerCheck?.kind !== "worldkit-planner-self-check" || plannerCheck.schemaVersion !== 1 ||
      ![
        "worldkit-planner-self-check-v3",
        "worldkit-planner-self-check-v4",
      ].includes(plannerCheck.validatorVersion) ||
      plannerCheck.sceneId !== sceneId || plannerCheck.status !== "passed" ||
      plannerCheck.inputs?.sceneBriefHash !== briefHash ||
      plannerCheck.inputs?.worldPlanHash !== worldPlanHash ||
      plannerCheck.inputs?.entryWhiteboxTargetHash !== entryWhiteboxTargetHash ||
      typeof plannerCheck.imageMeasurements?.worldPlan?.blockPaletteCoverageRatio !== "number" ||
      plannerCheck.imageMeasurements.worldPlan.blockPaletteCoverageRatio < 0.03 ||
      typeof plannerCheck.imageMeasurements?.entryWhiteboxTarget?.blockPaletteCoverageRatio !== "number" ||
      plannerCheck.imageMeasurements.entryWhiteboxTarget.blockPaletteCoverageRatio < 0.02 ||
      typeof plannerCheck.imageMeasurements.entryWhiteboxTarget.composition?.subjectCenterErrorRatio !== "number" ||
      plannerCheck.imageMeasurements.entryWhiteboxTarget.composition.subjectCenterErrorRatio > 0.015 ||
      palette?.kind !== "worldkit-visual-identity-palette" || palette.schemaVersion !== 1 ||
      palette.sceneId !== sceneId || !/^sha256:[a-f0-9]{64}$/.test(palette.sceneBriefHash ?? "") ||
      !Array.isArray(palette.targets) || palette.targets.length === 0 || palette.targets.length > 5 ||
      authoring?.kind !== "worldkit-authoring-spec" || authoring.schemaVersion !== 4 ||
      authoring.id !== sceneId ||
      builderCheck?.kind !== "worldkit-block-builder-self-check" || builderCheck.schemaVersion !== 1 ||
      builderCheck.validatorVersion !== "worldkit-block-builder-self-check-v10" ||
      builderCheck.sceneId !== sceneId || builderCheck.status !== "passed" ||
      builderCheck.inputs?.sceneBriefHash !== briefHash ||
      builderCheck.inputs?.worldModuleHash !== worldModuleHash ||
      builderCheck.inputs?.authoringSpecHash !== authoringHash ||
      builderCheck.inputs?.implementationMapDraftHash !== mapDraftHash ||
      implementationMap?.kind !== "worldkit-scene-brief-implementation-map" ||
      implementationMap.schemaVersion !== 1 || implementationMap.sceneId !== sceneId ||
      implementationMap.sceneBriefHash !== palette.sceneBriefHash ||
      !/^sha256:[a-f0-9]{64}$/.test(implementationMap.authoringSpecHash ?? "") ||
      implementationMap.authoringSpecId !== authoring.id ||
      !Array.isArray(implementationMap.visualTargetMappings) || implementationMap.visualTargetMappings.length === 0 ||
      !Array.isArray(implementationMap.visualCaptureGroups) || implementationMap.visualCaptureGroups.length === 0 ||
      build?.kind !== "worldkit-build-artifact" || build.schemaVersion !== 4 ||
      build.executionPlan?.kind !== "worldkit-canonical-scene-execution-plan" ||
      build.executionPlan.schemaVersion !== 1 ||
      !/^sha256:[a-f0-9]{64}$/.test(build.worldBuildIdentityHash ?? "") ||
      !/^sha256:[a-f0-9]{64}$/.test(build.executionPlanHash ?? "") ||
      snapshot?.kind !== "worldkit-runtime-snapshot" || snapshot.schemaVersion !== 4 ||
      captureTargets?.kind !== "worldkit-whitebox-triview-manifest" || captureTargets.schemaVersion !== 1 ||
      captureTargets.worldBuildIdentityHash !== build.worldBuildIdentityHash ||
      Object.hasOwn(captureTargets, "executionPlanHash") ||
      !Array.isArray(captureTargets.whiteboxTriviews) || captureTargets.whiteboxTriviews.length === 0 ||
      captureTargets.whiteboxTriviews.length > 5
    ) return false;
    if (!await hasTrustedRouteValidationArtifacts(
      artifactRoot,
      sceneId,
      builderCheck,
      build,
      implementationMap.authoringSpecHash,
      freshnessFloor,
    )) return false;
    const paletteTargetIds = palette.targets.map(({ id }) => id);
    const mappingTargetIds = implementationMap.visualTargetMappings.map(({ visualTargetId }) => visualTargetId);
    const captureGroupTargetIds = implementationMap.visualCaptureGroups.map(({ visualTargetId }) => visualTargetId);
    if (
      new Set(paletteTargetIds).size !== paletteTargetIds.length ||
      [...paletteTargetIds].sort().join(",") !== [...mappingTargetIds].sort().join(",") ||
      [...paletteTargetIds].sort().join(",") !== [...captureGroupTargetIds].sort().join(",")
    ) return false;
    const captureGroupByVisualTargetId = new Map(
      implementationMap.visualCaptureGroups.map((group) => [group.visualTargetId, group]),
    );
    const visualTargetIds = new Set();
    for (const target of captureTargets.whiteboxTriviews) {
      const group = captureGroupByVisualTargetId.get(target?.visualTargetId);
      if (
        !idPattern.test(target?.visualTargetId ?? "") || visualTargetIds.has(target.visualTargetId) ||
        group === undefined ||
        JSON.stringify(group.runtimeEntityIds) !== JSON.stringify(target.runtimeEntityIds) ||
        group.role !== target.role || group.semanticClassId !== target.semanticClassId ||
        group.identityColor !== target.identityColor ||
        target.imageUri !== `${target.visualTargetId}/whitebox-triview.png` ||
        !Array.isArray(target.views) || target.views.join(",") !== "front,right,back" ||
        !await pngArtifact(path.join(artifactRoot, "triviews", target.imageUri), freshnessFloor)
      ) return false;
      visualTargetIds.add(target.visualTargetId);
    }
    return visualTargetIds.size === captureGroupByVisualTargetId.size &&
      await verifyHostedWhiteboxArtifactsImplementation({
        sceneId,
        authoringPath: paths.authoring,
        buildPath: paths.build,
        openingFramePath: paths.openingFrame,
        runtimeSnapshotPath: paths.snapshot,
        captureReceiptPath: paths.captureReceipt,
        trustedCapturePublicKeyPath,
        requireTriview: true,
        whiteboxTriviewManifestPath: paths.captureTargets,
        whiteboxTriviewRoot: path.join(artifactRoot, "triviews"),
      });
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
      const captureTargetsPath = path.join(artifactsRoot, entry.name, "triviews", "whitebox-triview-manifest.json");
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
          triviewStatus: "passed",
          outcome: "passed",
          whiteboxOutcome: "passed",
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
    const artifactRoot = path.join(repoRoot, "artifacts/scenes", record.sceneId);
    const whiteboxOpeningFrameAvailable = await fileExists(
      path.join(scenePlanRoot, "whitebox-opening-frame.png"),
    ) || remoteArtifactAvailable(record, "scene-plan/whitebox-opening-frame.png");
    const coverCandidates = [
      "whitebox-opening-frame.png",
      "entry-styled-target.png",
      "entry-whitebox-target.png",
      "opening-shot.png",
      "world-plan.png",
    ];
    const canonicalOpeningFrameAvailable = await fileExists(
      path.join(artifactRoot, "opening-frame.png"),
    ) || remoteArtifactAvailable(record, "scene/opening-frame.png");
    const attemptStartedAt = record.origin === "existing-scene-brief-world"
      ? record.createdAt
      : record.startedAt;
    const attemptStartedAtMs = Date.parse(attemptStartedAt ?? "");
    const freshnessFloor = record.origin === "existing-scene-brief-world"
      ? Number.NEGATIVE_INFINITY
      : Number.isFinite(attemptStartedAtMs)
        ? attemptStartedAtMs - 1_000
        : Number.POSITIVE_INFINITY;
    // The list is a display projection of the durable Studio receipt. Keep it
    // responsive with bounded file checks; the Preview endpoint independently
    // replays the full signed Host verifier before serving playable authority.
    const remoteWhiteboxRuntimeAvailable =
      record.remoteArtifactAdmission?.status === "passed" &&
      record.remoteArtifactAdmission?.executionId === record.remoteExecutionId;
    const whiteboxRuntimeAvailable = remoteWhiteboxRuntimeAvailable || (record.captureStatus === "passed" &&
        record.whiteboxOutcome === "passed" && record.captureRequired === false
      ? await hasWhiteboxDisplayArtifacts(artifactRoot, freshnessFloor)
      : await hasPlayableWhiteboxArtifacts(
          artifactRoot,
          record.sceneId,
          freshnessFloor,
        ));
    const persistedError = typeof record.error === "string" ? record.error : null;
    const diagnosticError = record.status === "failed" &&
        /^World generation exited with code /.test(persistedError ?? "")
      ? deriveWorldGenerationFailureReason(
          await readFile(logPath(record.id), "utf8").catch(() => ""),
        )
      : persistedError;
    let coverUrl = canonicalOpeningFrameAvailable
      ? `/api/worlds/${record.id}/deliverables/opening-frame`
      : record.referenceImage ? `/api/worlds/${record.id}/reference` : null;
    if (!canonicalOpeningFrameAvailable) {
      for (const candidate of coverCandidates) {
        if (
          await fileExists(path.join(scenePlanRoot, candidate)) ||
          remoteArtifactAvailable(record, `scene-plan/${candidate}`)
        ) {
          coverUrl = `/scene-assets/${record.sceneId}/${candidate}`;
          break;
        }
      }
    }
    return {
      ...record,
      codexBackend: effectiveCodexBackend(record),
      error: diagnosticError,
      captureError: record.captureError === persistedError
        ? diagnosticError
        : record.captureError,
      coverUrl,
      referenceUrl: record.referenceImage ? `/api/worlds/${record.id}/reference` : null,
      whiteboxOpeningFrameUrl: whiteboxOpeningFrameAvailable
        ? `/scene-assets/${record.sceneId}/whitebox-opening-frame.png`
        : null,
      whiteboxRuntimeAvailable,
      previewUrl: whiteboxRuntimeAvailable
        ? `/play?authoring=1&world=${encodeURIComponent(record.id)}`
        : null,
      queuePosition: record.status === "queued"
        ? queue.findIndex((item) => item.endsWith(`:${record.id}`)) + 1
        : null,
    };
  }

  async function listEnrichedWorlds() {
    if (enrichedWorldListCache?.expiresAt > Date.now()) return enrichedWorldListCache.worlds;
    if (enrichedWorldListInFlight) return enrichedWorldListInFlight;
    const revision = worldListRevision;
    const promise = (async () => {
      const records = await listRecords();
      const worlds = await Promise.all(records.map(enrichRecord));
      if (revision === worldListRevision) {
        enrichedWorldListCache = { worlds, expiresAt: Date.now() + 5_000 };
      }
      return worlds;
    })();
    enrichedWorldListInFlight = promise;
    try {
      return await promise;
    } finally {
      if (enrichedWorldListInFlight === promise) enrichedWorldListInFlight = null;
    }
  }

  function currentPlannerArtifactIdentity(plannerCheck) {
    const inputs = plannerCheck?.inputs;
    if (
      plannerCheck?.kind !== "worldkit-planner-self-check" ||
      plannerCheck.status !== "passed" ||
      typeof inputs?.sceneBriefHash !== "string" ||
      typeof inputs?.worldPlanHash !== "string" ||
      typeof inputs?.entryWhiteboxTargetHash !== "string"
    ) return null;
    return {
      sceneBriefHash: inputs.sceneBriefHash,
      worldPlanHash: inputs.worldPlanHash,
      entryWhiteboxTargetHash: inputs.entryWhiteboxTargetHash,
    };
  }

  async function trustedPlannerArtifactIdentity(record, plannerCheck) {
    const artifactIdentity = currentPlannerArtifactIdentity(plannerCheck);
    if (artifactIdentity === null) return null;
    const artifactRoot = path.join(repoRoot, "artifacts/scenes", record.sceneId);
    const planRoot = path.join(repoRoot, "apps/playground/public/scene-plans", record.sceneId);
    const [sceneBriefHash, worldPlanHash, entryWhiteboxTargetHash] = await Promise.all([
      sourceHash(path.join(artifactRoot, "scene-brief.md")),
      sourceHash(path.join(planRoot, "world-plan.png")),
      sourceHash(path.join(planRoot, "entry-whitebox-target.png")),
    ]);
    return sceneBriefHash === artifactIdentity.sceneBriefHash &&
      worldPlanHash === artifactIdentity.worldPlanHash &&
      entryWhiteboxTargetHash === artifactIdentity.entryWhiteboxTargetHash
      ? artifactIdentity
      : null;
  }

  function effectivePlannerReview(record, artifactIdentity) {
    if (artifactIdentity === null) {
      return { status: "unavailable", artifactIdentity: null, reviewedAt: null };
    }
    const stored = record.plannerReview;
    const current = stored?.artifactIdentity;
    const matches = current?.sceneBriefHash === artifactIdentity.sceneBriefHash &&
      current?.worldPlanHash === artifactIdentity.worldPlanHash &&
      current?.entryWhiteboxTargetHash === artifactIdentity.entryWhiteboxTargetHash;
    return matches && ["approved", "rejected"].includes(stored?.status)
      ? {
          status: stored.status,
          artifactIdentity,
          reviewedAt: stored.reviewedAt ?? null,
        }
      : { status: "pending", artifactIdentity, reviewedAt: null };
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
        latestActive: latestBatch.filter(({ status }) =>
          ["queued", "running", "remote-pending"].includes(status)).length,
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
        description: "参考图驱动的简短意图摘要；它描述运动、空间、通行、构图和完整视觉目标，不定义几何或运行时。",
        owner: "WorldKit Planner", format: "Markdown",
      },
      {
        id: "planner-self-check", phase: "planner", title: "Planner 自检收据",
        description: "Planner 在同一 Codex Job 内完成 Brief、两张方块白膜图、固定颜色、16:9 与入口主体居中检查后生成的输入 Hash 与通过状态；俯视地理、镜头外延伸和出生点含义由人工审核。",
        owner: "WorldKit Planner", format: "JSON",
      },
      {
        id: "visual-identity-palette", phase: "planner", title: "视觉目标颜色表",
        description: "可信宿主为简报中的 1–5 个完整视觉目标分配稳定 ID 和颜色。",
        owner: "Trusted Host", format: "JSON",
      },
      {
        id: "world-plan", phase: "planner", title: "方块白膜俯视规划图",
        description: "以统一方块颜色表示至少四倍参考可见面积的连续布局、镜头外延伸、一个小型出生点、地面行进区域、碰撞、交互、水/云与完整标志物。飞行和游泳不绘制可行域。",
        owner: "WorldKit Planner", format: "PNG",
      },
      {
        id: "entry-whitebox-target", phase: "planner", title: "方块白膜进入构图图",
        description: "与俯视图使用同一方块语义颜色的 16:9 第三人称进入意图。真实白模仍由 Babylon Runtime 捕获。",
        owner: "WorldKit Planner", format: "PNG",
      },
      {
        id: "world-module", phase: "coding-agent", title: "方块世界模块",
        description: "Builder 直接创建单位方块、受控主体与第三人称相机的唯一权威 ESM 模块。",
        owner: "Block Builder", format: "JavaScript",
      },
      {
        id: "authoring-spec", phase: "coding-agent", title: "Canonical AuthoringSpec V4",
        description: "由方块自检器确定性派生的 Host 运行传输；不是 Agent 世界输入。",
        owner: "Trusted Host", format: "JSON",
      },
      {
        id: "implementation-map-draft", phase: "coding-agent", title: "视觉目标实现映射草稿",
        description: "由方块 visualGroupId 自动派生的视觉目标到 runtime entity 归因。",
        owner: "Trusted Host", format: "JSON",
      },
      {
        id: "builder-self-check", phase: "coding-agent", title: "Builder 自检收据",
        description: "Builder 在同一任务内完成方块、连通性、主体、相机、编译和映射检查后的输入哈希与状态。",
        owner: "Block Builder", format: "JSON",
      },
      {
        id: "builder-top-down-comparison", phase: "coding-agent", title: "Builder 俯视复核图",
        description: "左侧是 Planner 俯视意图，右侧是当前 world.mjs 的确定性俯视软件渲染；供 Builder 在同一任务内看图修改。",
        owner: "Block Builder", format: "PNG",
      },
      {
        id: "builder-entry-comparison", phase: "coding-agent", title: "Builder 进入构图复核图",
        description: "左侧是 Planner 进入图，右侧是当前 world.mjs 的确定性第三人称软件渲染；供 Builder 检查居中、层次、尺度和遮挡。",
        owner: "Block Builder", format: "PNG",
      },
      {
        id: "builder-host-resume", phase: "block-build", title: "Host-only 恢复收据",
        description: "证明恢复过程复用了同一 Scene Brief、world.mjs 与视觉映射，并由当前可信 Host 重新派生内部运行传输。",
        owner: "Trusted Host", format: "JSON", optional: record.resumeFromStage !== "block-build",
      },
      {
        id: "implementation-map", phase: "block-build", title: "已校验 Scene Brief 实现映射",
        description: "包含 Scene Brief 与 AuthoringSpec 哈希的可信映射。",
        owner: "Trusted Host", format: "JSON",
      },
      {
        id: "execution-plan", phase: "block-build", title: "Canonical Scene Plan V1",
        description: "由当前 Canonical compiler 从 Authoring V4 / IR V4 生成并绑定 World Build Identity 的执行计划。",
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
        id: "whitebox-capture-receipt", phase: "runtime-capture", title: "可信白膜捕获回执",
        description: "将正式 World Build Identity 与首帧、完整 Runtime Snapshot 及可选三视图字节绑定。",
        owner: "Trusted Host", format: "JSON",
      },
      {
        id: "whitebox-triview-manifest", phase: "runtime-capture", title: "白膜三视图清单",
        description: "每个 subject/object 的 Front / Right / Back 捕获索引。",
        owner: "Babylon Runtime", format: "JSON",
      },
      {
        id: "entry-third-person-validation", phase: "entry-alignment-validation", title: "进入构图校验报告",
        description: "使用 Runtime Snapshot V4 与真实白膜首帧验证主体居中、相机目标和正后方对齐。",
        owner: "Trusted Host", format: "JSON",
      },
      {
        id: "visual-generation-prompts", phase: "visual-reconstruction", title: "视觉生成提示词包",
        description: "同一个 LWDP Codex Job 固化首帧和全部完整目标三视图的参考职责与提示词。",
        owner: "Visual Reconstructor", format: "JSON", optional: record.styledOpeningFrameRequired !== true,
      },
      {
        id: "styled-opening-frame", phase: "visual-reconstruction", title: "样式化首帧",
        description: "真实白膜首帧是唯一底图并锁定全部空间投影；用户首帧只提供主体身份、材质、配色、风格和光照语言。",
        owner: "Visual Reconstructor", format: "PNG", optional: record.styledOpeningFrameRequired !== true,
      },
      {
        id: "styled-opening-frame-manifest", phase: "visual-reconstruction", title: "新首帧素材清单",
        description: "绑定真实白膜首帧、用户首帧、白膜三视图和新首帧，并记录内容哈希。",
        owner: "Trusted Host", format: "JSON", optional: true,
      },
      {
        id: "styled-opening-frame-report", phase: "visual-reconstruction", title: "新首帧完成报告",
        description: "记录新首帧流程的完成状态和素材清单哈希。",
        owner: "Trusted Host", format: "JSON", optional: true,
      },
      {
        id: "styled-triviews-manifest", phase: "visual-reconstruction", title: "渲染后三视图清单",
        description: "绑定新首帧、每个完整视觉组的白膜三视图与渲染后三视图，并记录内容哈希。",
        owner: "Trusted Host", format: "JSON", optional: record.styledTriviewsRequired !== true,
      },
      {
        id: "styled-triviews-report", phase: "visual-reconstruction", title: "渲染后三视图完成报告",
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
          ? "visual-reconstruction"
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
    const [sceneBrief, plannerCheck, captureManifest, episodes] = await Promise.all([
      readSceneArtifactText(record, "scene-brief.md"),
      readSceneArtifactJson(record, "planner-self-check.json"),
      readSceneArtifactJson(record, path.join("triviews", "whitebox-triview-manifest.json")),
      episodeWorkflows.listForScene(record.sceneId),
    ]);
    const plannerValidation = plannerCheck?.kind === "worldkit-planner-self-check" && [
        "worldkit-planner-self-check-v3",
        "worldkit-planner-self-check-v4",
      ].includes(plannerCheck.validatorVersion)
      ? {
          status: plannerCheck.status,
          validatorVersion: plannerCheck.validatorVersion,
          worldPlan: {
            blockPaletteCoverageRatio:
              plannerCheck.imageMeasurements?.worldPlan?.blockPaletteCoverageRatio ?? null,
            traversablePixelCount:
              plannerCheck.imageMeasurements?.worldPlan?.traversablePixelCount ?? null,
            interactivePixelCount:
              plannerCheck.imageMeasurements?.worldPlan?.interactivePixelCount ?? null,
          },
          entryWhiteboxTarget: {
            blockPaletteCoverageRatio:
              plannerCheck.imageMeasurements?.entryWhiteboxTarget?.blockPaletteCoverageRatio ?? null,
            aspectRatio:
              plannerCheck.imageMeasurements?.entryWhiteboxTarget?.aspectRatio ?? null,
            subjectCenterErrorRatio:
              plannerCheck.imageMeasurements?.entryWhiteboxTarget?.composition?.subjectCenterErrorRatio ?? null,
          },
        }
      : null;
    const plannerArtifactIdentity = await trustedPlannerArtifactIdentity(record, plannerCheck);
    const plannerReview = effectivePlannerReview(record, plannerArtifactIdentity);
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
        description: "一个或多个运动模式、四倍连续世界、地面通行意图、首帧与完整视觉目标。",
        prompt: sceneBrief, url: `/api/worlds/${record.id}/deliverables/scene-brief`, available: true,
      });
    }
    for (const item of [
      ["world-plan", "方块白膜俯视规划图", "统一颜色标记至少四倍参考可见面积的连续布局、镜头外延伸、小型出生点、地面行进区域、障碍、交互、水/云与完整标志物；飞行和游泳不绘制可行域。", "world-plan.png", `/scene-assets/${record.sceneId}/world-plan.png`],
      ["entry-whitebox-target", "方块白膜进入构图图", "与俯视图使用同一方块语义颜色的 16:9 标准第三人称进入构图。", "entry-whitebox-target.png", `/scene-assets/${record.sceneId}/entry-whitebox-target.png`],
      ["builder-top-down-comparison", "Builder 俯视复核图", "左 Planner 规划、右 Builder 当前方块世界；用于同任务内看图优化。", "builder-top-down-comparison.png", `/api/worlds/${record.id}/deliverables/builder-top-down-comparison`],
      ["builder-entry-comparison", "Builder 进入构图复核图", "左 Planner 规划、右 Builder 当前第三人称软件渲染；用于同任务内看图优化。", "builder-entry-comparison.png", `/api/worlds/${record.id}/deliverables/builder-entry-comparison`],
      ["opening-frame", "实际运行进入首帧", "Builder 方块世界经可信 Host 编译并由 Babylon 真实渲染的结果。", "opening-frame.png", `/api/worlds/${record.id}/deliverables/opening-frame`],
      ["styled-opening-frame", "最终样式化首帧", "白膜首帧是唯一空间底图；用户首帧只提供身份、材质、风格与光照语言。", "styled-opening-frame.png", `/api/worlds/${record.id}/deliverables/styled-opening-frame`],
    ]) {
      const [kind, title, description, fileName, url] = item;
      const filePath = [
        "opening-frame",
        "styled-opening-frame",
        "builder-top-down-comparison",
        "builder-entry-comparison",
      ].includes(kind)
        ? path.join(artifactRoot, fileName)
        : path.join(planRoot, fileName);
      const remotePath = [
        "opening-frame",
        "styled-opening-frame",
        "builder-top-down-comparison",
        "builder-entry-comparison",
      ].includes(kind)
        ? `scene/${fileName}`
        : `scene-plan/${fileName}`;
      const available = await fileExists(filePath) || remoteArtifactAvailable(record, remotePath);
      planning.push({ kind, title, description, prompt: null, url: available ? url : null, available });
    }
    const prototypes = [];
    for (const target of captureManifest?.whiteboxTriviews ?? []) {
      if (!idPattern.test(target?.visualTargetId)) continue;
      const imagePath = path.join(artifactRoot, "triviews", target.visualTargetId, "whitebox-triview.png");
      const styledImagePath = path.join(artifactRoot, "triviews", target.visualTargetId, "styled-triview.png");
      const available = await fileExists(imagePath) || remoteArtifactAvailable(
        record,
        `scene/triviews/${target.visualTargetId}/whitebox-triview.png`,
      );
      const styledAvailable = await fileExists(styledImagePath) || remoteArtifactAvailable(
        record,
        `scene/triviews/${target.visualTargetId}/styled-triview.png`,
      );
      prototypes.push({
        id: target.visualTargetId,
        role: target.role,
        semantic: target.semanticClassId,
        description: "Complete visual group Front / Right / Back whitebox capture.",
        appearancePrompt: null,
        negativePrompt: null,
        instanceColor: target.identityColor ?? null,
        approximateSize: null,
        memberCount: Array.isArray(target.runtimeEntityIds) ? target.runtimeEntityIds.length : 1,
        consistencyRationale: null,
        whiteboxUrl: available ? `/api/worlds/${record.id}/triviews/${target.visualTargetId}` : null,
        styledUrl: styledAvailable ? `/api/worlds/${record.id}/styled-triviews/${target.visualTargetId}` : null,
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
          phase: styled ? "visual-reconstruction" : "runtime-capture",
          title: `${prototype.id} · ${title}`,
          description: styled
            ? "以可配置视觉约束锁定外观、以真实 Babylon 白模三视图锁定结构的 Front / Right / Back 对照图。"
            : `SDK 从完整视觉组的 ${prototype.memberCount ?? 1} 个运行实体联合捕获的 Front / Right / Back 结构对照图。`,
          owner: styled ? "Visual Reconstructor" : "Babylon Runtime",
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
      episodes,
      planning,
      plannerValidation,
      plannerReview,
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

  async function appendRemoteRecoveryLogOnce(id, key, text) {
    const compoundKey = `${id}\u0000${key}`;
    if (remoteRecoveryLogKeys.has(compoundKey)) return;
    remoteRecoveryLogKeys.add(compoundKey);
    await appendJobLog(id, text);
  }

  async function markCloudRecordForRemoteReconciliation(record, reason) {
    if (
      effectiveCodexBackend(record) !== "cloud" ||
      record?.outcome === "cancelled"
    ) return false;
    if (
      typeof record.remoteExecutionId === "string" &&
      record.remoteExecutionId.length > 0
    ) {
      const now = new Date().toISOString();
      const transition = await transitionRecord(record.id, {
        status: "remote-pending",
        stage: record.stage,
        failedStage: null,
        finishedAt: null,
        error: reason,
        outcome: null,
        remotePendingSince: record.remotePendingSince ?? now,
        remotePendingDeadlineAt: new Date(Date.now() + remotePendingGraceMs).toISOString(),
      }, {
        expectedAttempt: record.attempt,
        expectedRemoteExecutionId: record.remoteExecutionId,
        expectedStatuses: [
          "running", "remote-pending", "interrupted", "visual-running",
          "visual-queued", "awaiting-recording",
        ],
      });
      if (!transition.applied && transition.reason !== "already-complete") return false;
      await appendTrajectoryEvent(
        record.id,
        record.stage,
        `Creator Studio 将继续按原 Cloud Execution ${record.remoteExecutionId} 对账，不会停止或重建云端 Worker。`,
        {
          kind: "remote-pending",
          executionId: record.remoteExecutionId,
          reason: "studio-lifecycle",
        },
      );
      return true;
    }
    const rawLog = await readFile(logPath(record.id), "utf8").catch(() => "");
    const pendingMarker = parseRemotePendingLwdpMarker(rawLog);
    const jobMarker = parseLatestLwdpJobMarker(rawLog) ?? pendingMarker;
    if (jobMarker === null && typeof record.remoteJobId !== "string") return false;
    const pendingForLatestJob = pendingMarker?.jobId === jobMarker?.jobId
      ? pendingMarker
      : null;
    const now = new Date().toISOString();
    const stage = canonicalWorkflowStage(
      jobMarker?.stage ?? record.failedStage ?? record.stage,
      record,
    );
    const jobId = jobMarker?.jobId ?? record.remoteJobId;
    const taskId = jobMarker?.taskId ?? record.remoteTaskId ?? null;
    const requestId = jobMarker?.requestId ?? pendingForLatestJob?.requestId ??
      record.remoteRequestId ?? null;
    const outputS3Prefix = jobMarker?.outputS3Prefix ?? pendingForLatestJob?.outputS3Prefix ??
      record.remoteOutputS3Prefix ?? null;
    await updateRecord(record.id, {
      status: "remote-pending",
      stage,
      failedStage: null,
      finishedAt: null,
      error: reason,
      outcome: null,
      remoteJobId: jobId,
      remoteTaskId: taskId,
      remoteRequestId: requestId,
      remoteOutputS3Prefix: outputS3Prefix,
      remotePendingSince: record.remotePendingSince ?? now,
      remotePendingDeadlineAt: new Date(Date.now() + remotePendingGraceMs).toISOString(),
      captureRequired: record.whiteboxOutcome !== "passed",
      captureError: null,
      captureStatus: record.whiteboxOutcome === "passed"
        ? "passed"
        : record.captureStatus === "passed" ? "passed" : "pending",
      triviewStatus: record.whiteboxOutcome === "passed"
        ? record.triviewStatus
        : "pending",
      styledOpeningFrameStatus: record.referenceImage ? "pending" : "not-required",
      styledTriviewsStatus: record.referenceImage ? "pending" : "not-required",
    });
    await appendTrajectoryEvent(
      record.id,
      stage,
      `Creator Studio 将继续按原 LWDP Job ${jobId} 对账，不会重复提交。`,
      { kind: "remote-pending", jobId, taskId, reason: "studio-lifecycle" },
    );
    return true;
  }

  function consumeOutput(id, source, chunk, state) {
    const text = chunk.toString("utf8");
    runBackgroundTask(id, "append-job-log", () => appendJobLog(id, `[${source}] ${text}`));
    state.raw += text;
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
          runBackgroundTask(id, "append-stage-completed", () => appendTrajectoryEvent(id, persistedStage, "方块编译与 Babylon 运行捕获已完成。", { kind: "completed" }));
        } else {
          runBackgroundTask(id, "append-stage-started", () => appendTrajectoryEvent(id, persistedStage, `流水线进入 ${persistedStage} 阶段。`, { kind: "started" }));
        }
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
      const cloudCodexJob = parseLatestLwdpJobMarker(line.trim());
      if (cloudCodexJob) {
        runBackgroundTask(id, "persist-codex-job", () => updateRecord(id, {
          stage: canonicalWorkflowStage(cloudCodexJob.stage, {
            styledTriviewsRequired: true,
          }),
          remoteJobId: cloudCodexJob.jobId,
          remoteTaskId: cloudCodexJob.taskId,
          ...(cloudCodexJob.requestId === null
            ? {}
            : { remoteRequestId: cloudCodexJob.requestId }),
          ...(cloudCodexJob.outputS3Prefix === null
            ? {}
            : { remoteOutputS3Prefix: cloudCodexJob.outputS3Prefix }),
        }));
        runBackgroundTask(id, "append-codex-job", () => appendTrajectoryEvent(
          id,
          cloudCodexJob.stage,
          `LWDP 云端 Codex 任务 ${cloudCodexJob.taskId} 已提交：${cloudCodexJob.jobId}。`,
          { kind: "cloud-job", jobId: cloudCodexJob.jobId, taskId: cloudCodexJob.taskId },
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
      const cloudStageRetry = /^WORLDKIT_LWDP_STAGE_RETRY ([a-z-]+) ([0-9]+) ([0-9]+) reason=([a-z-]+) previousJob=(\S+) delayMs=([0-9]+)$/.exec(line.trim());
      if (cloudStageRetry) {
        const retryStage = cloudStageRetry[1] === "coding-agent" ||
            cloudStageRetry[1] === "builder"
          ? "coding-agent"
          : cloudStageRetry[1];
        const delaySeconds = Math.ceil(Number(cloudStageRetry[6]) / 1_000);
        runBackgroundTask(id, "append-cloud-stage-retry", () => appendTrajectoryEvent(
          id,
          retryStage,
          `LWDP 云端任务因 ${cloudStageRetry[4]} 终态失败，将在 ${delaySeconds} 秒后自动重试 ${cloudStageRetry[2]}/${cloudStageRetry[3]}。`,
          {
            kind: "retry",
            attempt: Number(cloudStageRetry[2]),
            limit: Number(cloudStageRetry[3]),
            reason: cloudStageRetry[4],
            previousJobId: cloudStageRetry[5] === "unsubmitted" ? null : cloudStageRetry[5],
            delayMs: Number(cloudStageRetry[6]),
          },
        ));
        continue;
      }
      const agentRetry = /^WORLDKIT_AGENT_RETRY ([a-z-]+) ([0-9]+) ([0-9]+)$/.exec(line.trim());
      if (agentRetry) {
        const retryStage = agentRetry[1].includes("builder") || agentRetry[1] === "coding-agent"
          ? "coding-agent"
          : agentRetry[1].includes("visual") || agentRetry[1].includes("triview")
            ? "visual-reconstruction"
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

  async function finalizeCloudSceneExecution(record, execution, stagesPayload, manifestS3Uri) {
    const latest = await readRecord(record.id);
    if (latest?.status === "ready") return true;
    if (latest?.attempt !== record.attempt || latest?.remoteExecutionId !== execution.execution_id) {
      return false;
    }
    let admission = null;
    if (manifestS3Uri !== null) {
      admission = await admitCloudArtifactManifest(record, execution.execution_id, manifestS3Uri)
        .catch((error) => ({
          ok: false,
          manifest: null,
          error: error instanceof Error ? error.message : String(error),
        }));
    }
    const playable = admission?.ok === true;
    const remoteArtifacts = admission?.manifest?.artifacts ?? [];
    const whiteboxTriviewPassed = remoteArtifacts.some((artifact) =>
      artifact.path === "scene/triviews/whitebox-triview-manifest.json");
    const styledOpeningPassed = remoteArtifacts.some((artifact) =>
      artifact.path === "scene/styled-opening-frame.png");
    const styledTriviewsPassed = remoteArtifacts.some((artifact) =>
      artifact.path === "scene/styled-triviews-manifest.json");
    const fullySucceeded = execution.status === "succeeded" && playable;
    const finishedAt = new Date().toISOString();
    const stageError = execution.error ||
      (Array.isArray(stagesPayload?.stages)
        ? stagesPayload.stages.find((stage) => stage?.stage_id === "scene-production")?.diagnostics?.error
        : null) ||
      admission?.error ||
      `Cloud Scene Execution ended as ${execution.status}.`;
    const transition = await transitionRecord(record.id, {
      status: fullySucceeded ? "ready" : "failed",
      stage: fullySucceeded ? "ready" : "failed",
      failedStage: fullySucceeded ? null : cloudInternalStage(execution),
      finishedAt,
      error: fullySucceeded ? null : stageError,
      captureRequired: !playable,
      captureError: playable ? null : stageError,
      captureStatus: playable ? "passed" : "failed",
      triviewStatus: whiteboxTriviewPassed ? "passed" : playable ? "failed" : "not-run",
      whiteboxOutcome: playable ? "passed" : "failed",
      outcome: fullySucceeded ? "passed" : "failed",
      styledOpeningFrameStatus: record.referenceImage
        ? styledOpeningPassed ? "passed" : "failed"
        : "not-required",
      styledTriviewsStatus: record.referenceImage
        ? styledTriviewsPassed ? "passed" : "failed"
        : "not-required",
      remoteArtifactManifestS3Uri: manifestS3Uri,
      remoteArtifactAdmission: {
        status: playable ? "passed" : "failed",
        verifiedAt: new Date().toISOString(),
        executionId: execution.execution_id,
        error: admission?.error ?? null,
      },
      remoteArtifacts,
      remotePendingSince: null,
      remotePendingDeadlineAt: null,
    }, {
      expectedAttempt: record.attempt,
      expectedRemoteExecutionId: execution.execution_id,
      expectedStatuses: ["running", "remote-pending"],
    });
    if (!transition.applied) return transition.reason === "already-complete";
    await appendJobLog(
      record.id,
      fullySucceeded
        ? `\nCloud Scene Execution ${execution.execution_id} completed; trusted remote artifacts admitted without durable local hydration.\n`
        : `\nCloud Scene Execution ${execution.execution_id} ended ${execution.status}: ${stageError}\n`,
    );
    await appendTrajectoryEvent(
      record.id,
      fullySucceeded ? "ready" : "failed",
      fullySucceeded
        ? "云端 Worker 已完成完整生产、可信捕获和 S3 发布；本地仅保存远程工件索引。"
        : playable
          ? "云端后置阶段失败，但可信白膜世界已发布并保持可进入。"
          : `云端生产失败：${stageError}`,
      {
        kind: fullySucceeded ? "completed" : "failed",
        executionId: execution.execution_id,
        manifestS3Uri,
        whiteboxRuntimeAvailable: playable,
      },
    );
    return true;
  }

  async function runCloudSceneJob(id, initialRecord) {
    const attempt = (initialRecord.attempt ?? 0) + 1;
    const startedAt = new Date().toISOString();
    const requestId = `${initialRecord.sceneId}-cloud-attempt-${attempt}`;
    const cloudResumeMode = initialRecord.resumeFromStage === "cloud-host"
      ? "host"
      : initialRecord.resumeFromStage === "cloud-builder" ? "builder" : null;
    const cloudBuilderRebuild = initialRecord.resumeFromStage === "cloud-builder-rebuild";
    const cloudResume = cloudResumeMode !== null &&
      typeof initialRecord.remoteExecutionId === "string" &&
      typeof initialRecord.remoteArtifactManifestS3Uri === "string" &&
      typeof initialRecord.remoteRequestS3Uri === "string" &&
      typeof initialRecord.remoteOutputS3Prefix === "string";
    const resumeAuthority = cloudResume ? {
      executionId: initialRecord.remoteExecutionId,
      manifestS3Uri: initialRecord.remoteArtifactManifestS3Uri,
      requestS3Uri: initialRecord.remoteRequestS3Uri,
      outputS3Prefix: initialRecord.remoteOutputS3Prefix,
    } : null;
    const rebuildAuthority = !cloudBuilderRebuild
      ? null
      : typeof initialRecord.cloudBuilderRebuildSourceExecutionId === "string" &&
          typeof initialRecord.cloudBuilderRebuildSourceManifestS3Uri === "string" &&
          typeof initialRecord.cloudBuilderRebuildSourceRequestS3Uri === "string"
        ? {
            executionId: initialRecord.cloudBuilderRebuildSourceExecutionId,
            manifestS3Uri: initialRecord.cloudBuilderRebuildSourceManifestS3Uri,
            requestS3Uri: initialRecord.cloudBuilderRebuildSourceRequestS3Uri,
          }
        : typeof initialRecord.remoteExecutionId === "string" &&
            typeof initialRecord.remoteArtifactManifestS3Uri === "string" &&
            typeof initialRecord.remoteRequestS3Uri === "string"
          ? {
              executionId: initialRecord.remoteExecutionId,
              manifestS3Uri: initialRecord.remoteArtifactManifestS3Uri,
              requestS3Uri: initialRecord.remoteRequestS3Uri,
            }
          : null;
    if (cloudBuilderRebuild && rebuildAuthority === null) {
      throw new Error("Cloud Builder rebuild requires a prior trusted Planner manifest.");
    }
    const transition = await transitionRecord(id, {
      status: "running",
      stage: "preparing",
      attempt,
      startedAt,
      finishedAt: null,
      error: null,
      failedStage: null,
      captureRequired: true,
      captureError: null,
      captureStatus: "pending",
      triviewStatus: "pending",
      whiteboxOutcome: null,
      outcome: null,
      styledOpeningFrameRequired: initialRecord.referenceImage !== null,
      styledOpeningFrameStatus: initialRecord.referenceImage ? "pending" : "not-required",
      styledTriviewsRequired: initialRecord.referenceImage !== null,
      styledTriviewsStatus: initialRecord.referenceImage ? "pending" : "not-required",
      remoteExecutionId: resumeAuthority?.executionId ?? null,
      remoteStageId: "scene-production",
      remoteRequestId: requestId,
      remoteRequestS3Uri: resumeAuthority?.requestS3Uri ?? null,
      remoteOutputS3Prefix: resumeAuthority?.outputS3Prefix ?? null,
      remoteArtifactManifestS3Uri: resumeAuthority?.manifestS3Uri ?? null,
      remoteDispatchStatus: cloudResume ? "dispatched" : null,
      remoteWorkerLaunchStatus: null,
      remoteWorkerJobName: null,
      remoteArtifactAdmission: cloudResume
        ? initialRecord.remoteArtifactAdmission ?? null
        : null,
      remoteArtifacts: cloudResume ? initialRecord.remoteArtifacts ?? [] : [],
    }, {
      expectedAttempt: initialRecord.attempt ?? 0,
      expectedStatuses: ["queued"],
    });
    if (!transition.applied) return;
    const record = transition.record;
    await writeFile(logPath(id), [
      "WorldKit Creator Studio",
      `scene=${record.sceneId}`,
      `attempt=${attempt}`,
      `mode=${cloudBuilderRebuild
        ? "cloud-builder-rebuild"
        : cloudResume ? `cloud-${cloudResumeMode}-resume` : "cloud-scene-production"}`,
      "",
      cloudBuilderRebuild
        ? "Rebuilding Builder and downstream Host stages in a fresh Cloud Execution from the prior trusted Planner manifest."
        : cloudResume
        ? cloudResumeMode === "host"
          ? "Resuming only the trusted Host and downstream stages from the prior Cloud artifact manifest."
          : "Resuming Builder and downstream Host stages from the trusted Planner artifact manifest."
        : "Submitting the complete Scene pipeline to one isolated Cloud Scene Worker.",
      "",
    ].join("\n"), "utf8");
    await appendTrajectoryEvent(
      id,
      "preparing",
      cloudBuilderRebuild
        ? `第 ${attempt} 次云端 Builder 重建开始；复用上一次可信 Planner Manifest，在新 Execution 中运行 Builder、Host Capture 和视觉阶段。`
        : `第 ${attempt} 次端到端云端生产开始；Planner、Builder、Host Capture 和视觉阶段均在隔离 Worker 中运行。`,
      {
        kind: "started",
        codexBackend: "cloud",
        executionMode: cloudBuilderRebuild
          ? "cloud-builder-rebuild"
          : "cloud-scene-production",
      },
    );
    let submittedExecutionId = null;
    try {
      const [productionConfig, lwdpConfig] = await Promise.all([
        cloudSceneProductionConfig(),
        loadLwdpConfigImplementation({
          ...process.env,
          LWDP_GENERATION_API_TOKEN: undefined,
          LWDP_API_BASE: undefined,
          LWDP_USER_ID: undefined,
          WORLDKIT_LWDP_ENV_FILE: projectLwdpEnvFile,
        }),
      ]);
      if (productionConfig === null) throw new Error("Cloud Scene production is disabled.");
      const commonExecutionOptions = {
        sceneId: record.sceneId,
        prompt: record.prompt,
        referenceImagePath: record.referenceImage
          ? path.join(worldsRoot, record.id, record.referenceImage.fileName)
          : null,
        requestId,
        attempt,
        config: productionConfig,
        cloudConfig: lwdpConfig,
        onSubmitted: async (submitted) => {
          submittedExecutionId = submitted.executionId;
          const applied = await transitionRecord(id, {
            status: "running",
            stage: "preparing",
            remoteExecutionId: submitted.executionId,
            remoteStageId: "scene-production",
            remoteRequestId: requestId,
            remoteRequestS3Uri: submitted.requestS3Uri,
            remoteOutputS3Prefix: submitted.outputS3Prefix,
          }, {
            expectedAttempt: attempt,
            expectedStatuses: ["running"],
          });
          if (!applied.applied) throw new Error(`Cloud submission became stale: ${applied.reason}`);
          await appendTrajectoryEvent(id, "preparing",
            `Cloud Execution ${submitted.executionId} 已提交并绑定当前 attempt。`,
            { kind: "cloud-execution", executionId: submitted.executionId });
        },
        onLaunched: async (launched) => {
          const applied = await transitionRecord(id, {
            remoteWorkerLaunchStatus: "launched",
            remoteWorkerJobName: launched?.jobName ?? null,
          }, {
            expectedAttempt: attempt,
            expectedRemoteExecutionId: submittedExecutionId,
            expectedStatuses: ["running"],
          });
          if (!applied.applied) {
            throw new Error(`Cloud Worker launch became stale: ${applied.reason}`);
          }
        },
        onDispatched: async () => {
          const applied = await transitionRecord(id, {
            remoteDispatchStatus: "dispatched",
          }, {
            expectedAttempt: attempt,
            expectedRemoteExecutionId: submittedExecutionId,
            expectedStatuses: ["running"],
          });
          if (!applied.applied) {
            throw new Error(`Cloud dispatch became stale: ${applied.reason}`);
          }
        },
        onProgress: async (execution) => {
          if (submittedExecutionId === null) return;
          const internalStage = cloudInternalStage(execution);
          await transitionRecord(id, {
            status: "running",
            stage: canonicalWorkflowStage(internalStage, record),
            cloudInternalStage: internalStage,
            cloudLastHeartbeat: execution.last_heartbeat ?? new Date().toISOString(),
          }, {
            expectedAttempt: attempt,
            expectedRemoteExecutionId: submittedExecutionId,
            expectedStatuses: ["running"],
          });
        },
      };
      const result = cloudBuilderRebuild
        ? await rebuildStudioCloudSceneBuilderImplementation({
            ...commonExecutionOptions,
            sourceExecutionId: rebuildAuthority.executionId,
            sourceManifestS3Uri: rebuildAuthority.manifestS3Uri,
            sourceRequestS3Uri: rebuildAuthority.requestS3Uri,
            sourceRequestSource: (await readRemoteS3Artifact(
              rebuildAuthority.requestS3Uri,
              { repoRoot, maximumBytes: 1024 * 1024 },
            )).toString("utf8"),
          })
        : cloudResume
        ? await (cloudResumeMode === "host"
          ? resumeStudioCloudSceneHostImplementation
          : resumeStudioCloudSceneBuilderImplementation)({
            ...commonExecutionOptions,
            executionId: resumeAuthority.executionId,
            requestS3Uri: resumeAuthority.requestS3Uri,
            outputS3Prefix: resumeAuthority.outputS3Prefix,
            manifestS3Uri: resumeAuthority.manifestS3Uri,
            retryRequestId: `${requestId}-${cloudResumeMode}-resume`,
          })
        : await executeStudioCloudSceneImplementation(commonExecutionOptions);
      await finalizeCloudSceneExecution(
        await readRecord(id),
        result.execution,
        result.stages,
        result.manifestS3Uri,
      );
    } catch (error) {
      const latest = await readRecord(id);
      if (latest?.status === "ready" || latest?.attempt !== attempt) return;
      const message = error instanceof Error ? error.message : String(error);
      if (latest?.remoteExecutionId) {
        await transitionRecord(id, {
          status: "remote-pending",
          stage: latest.stage,
          error: `Cloud Execution ${latest.remoteExecutionId} 的即时对账中断；将继续按原 execution_id 后台恢复：${message}`,
          remotePendingSince: new Date().toISOString(),
          remotePendingDeadlineAt: new Date(Date.now() + remotePendingGraceMs).toISOString(),
        }, {
          expectedAttempt: attempt,
          expectedRemoteExecutionId: latest.remoteExecutionId,
          expectedStatuses: ["running"],
        });
        return;
      }
      if (error?.status === 404) {
        await transitionRecord(id, {
          status: "remote-pending",
          stage: "preparing",
          failedStage: "preparing",
          finishedAt: null,
          error: "LWDP Cloud Execution 控制面当前不可用（404）；任务输入与 request_id 已冻结，将在控制面恢复后自动提交。",
          remotePendingSince: new Date().toISOString(),
          remotePendingDeadlineAt: null,
          captureStatus: "pending",
          triviewStatus: "pending",
          whiteboxOutcome: null,
          outcome: null,
        }, {
          expectedAttempt: attempt,
          expectedStatuses: ["running"],
        });
        return;
      }
      await transitionRecord(id, {
        status: "failed",
        stage: "failed",
        failedStage: "preparing",
        finishedAt: new Date().toISOString(),
        error: message,
        captureStatus: "not-run",
        triviewStatus: "not-run",
        whiteboxOutcome: "failed",
        outcome: "failed",
      }, {
        expectedAttempt: attempt,
        expectedStatuses: ["running"],
      });
    }
  }

  async function runJob(id) {
    const record = await readRecord(id);
    if (!record || shuttingDown || stoppingJobs.has(id)) return;
    if (effectiveCodexBackend(record) === "cloud" && cloudSceneExecutionEnabled) {
      await runCloudSceneJob(id, record);
      return;
    }
    await runLocalSceneJob(id);
  }

  async function runLocalSceneJob(id) {
    const record = await readRecord(id);
    if (!record || shuttingDown || stoppingJobs.has(id)) return;
    const resumeHostOnly = record.resumeFromStage === "block-build";
    const resumeBuilderOnly = record.resumeFromStage === "planner";
    const executionMode = resumeHostOnly
      ? "host-resume"
      : resumeBuilderOnly ? "builder-resume" : "full";
    const codexBackend = effectiveCodexBackend(record);
    const attempt = (record.attempt ?? 0) + 1;
    const styledOpeningFrameRequired = record.referenceImage !== null;
    const styledTriviewsRequired = record.referenceImage !== null;
    const priorAgentLog = await readFile(logPath(id), "utf8").catch(() => "");
    const priorPlannerAttempts = submittedLwdpJobCountForStage(priorAgentLog, "planner");
    const priorBuilderAttempts = submittedLwdpJobCountForStage(priorAgentLog, "builder");
    const priorVisualAttempts = submittedLwdpJobCountForStage(priorAgentLog, "visual");
    const attemptHeader = `WorldKit Creator Studio\nscene=${record.sceneId}\nattempt=${attempt}\nmode=${executionMode}\n\n`;
    if (attempt > 1 || resumeHostOnly || resumeBuilderOnly) {
      await appendFile(logPath(id), `\n${attemptHeader}`, "utf8");
    }
    else await writeFile(logPath(id), attemptHeader, "utf8");
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
      triviewStatus: "pending",
      outcome: null,
      styledOpeningFrameRequired,
      styledOpeningFrameStatus: styledOpeningFrameRequired ? "pending" : "not-required",
      styledTriviewsRequired,
      styledTriviewsStatus: styledTriviewsRequired ? "pending" : "not-required",
      resumeFromStage: resumeHostOnly ? "block-build" : resumeBuilderOnly ? "planner" : null,
      remoteJobId: null,
      remoteTaskId: null,
      remoteRequestId: null,
      remoteOutputS3Prefix: null,
      remotePendingSince: null,
      remotePendingDeadlineAt: null,
    });
    await appendTrajectoryEvent(
      id,
      "preparing",
      resumeHostOnly
        ? `第 ${attempt} 次从可信 Host 方块编译继续，复用既有 Planner 与 Builder 产物。`
        : resumeBuilderOnly
          ? `第 ${attempt} 次从 Builder 继续，复用服务端迟到交付且经校验的 Planner 产物。`
        : `第 ${attempt} 次生成开始，使用${codexBackend === "cloud" ? "云端 LWDP" : "本地"} Codex，准备隔离任务环境。`,
      { kind: "started", codexBackend, executionMode },
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
      executionMode,
      startedAt,
    });

    const agentCommand = resumeHostOnly
      ? "agent:world:resume-host"
      : resumeBuilderOnly ? "agent:world:build" : "agent:world";
    const args = [agentCommand, "--", "--scene-id", record.sceneId];
    if (!resumeHostOnly && !resumeBuilderOnly && record.referenceImage) {
      args.push("--image", path.join(worldsRoot, id, record.referenceImage.fileName));
    }
    if (!resumeHostOnly && !resumeBuilderOnly) args.push(record.prompt);

    await appendJobLog(
      id,
      resumeHostOnly
        ? "Resuming from trusted Host block-build with existing Planner and Builder artifacts; no Codex task will be submitted.\n"
        : resumeBuilderOnly
          ? "Resuming from a trusted recovered Planner delivery; only Builder and downstream Host stages will run.\n"
        : `Launching ${codexBackend === "cloud" ? "LWDP cloud" : "local"} Codex: hosted Planner → direct Block Builder; trusted Host compiles and captures the whitebox, then one formal LWDP Codex Visual Reconstructor task may generate all styled outputs.\n`,
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
        WORLDKIT_CAPTURE_SIGNING_PRIVATE_KEY_PATH: captureSigningPrivateKeyPath,
        WORLDKIT_LWDP_PLANNER_PRIOR_ATTEMPTS: String(priorPlannerAttempts),
        WORLDKIT_LWDP_BUILDER_PRIOR_ATTEMPTS: String(priorBuilderAttempts),
        WORLDKIT_LWDP_VISUAL_PRIOR_ATTEMPTS: String(priorVisualAttempts),
      },
      shell: false,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    activeChildren.set(id, child);
    const stdout = { buffer: "", raw: "" };
    const stderr = { buffer: "", raw: "" };
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
      if (latestRecord && await markCloudRecordForRemoteReconciliation(
        latestRecord,
        "Creator Studio 停止时云端 Job 仍需对账；服务恢复后将接管原 Job。",
      )) return;
      await updateRecord(id, {
        status: "interrupted",
        stage: "interrupted",
        failedStage: latestRecord?.stage ?? "preparing",
        finishedAt: new Date().toISOString(),
        error: "Creator Studio stopped while this world was being generated.",
        captureStatus: "not-run",
        triviewStatus: "not-run",
        outcome: "failed",
      });
      await appendTrajectoryEvent(id, "interrupted", "Creator Studio 停止，运行中的任务被标记为中断。", { kind: "failed" });
      return;
    }

    const remotePending = parseRemotePendingLwdpMarker(`${stdout.raw}\n${stderr.raw}`);
    if (exit.code === 4 && remotePending !== null) {
      const freshnessFloor = Date.parse(startedAt) - 1_000;
      const whiteboxRuntimePassed = await hasPlayableWhiteboxArtifacts(
        artifactRoot,
        record.sceneId,
        freshnessFloor,
      );
      const whiteboxTriviewPassed = whiteboxRuntimePassed && await nonemptyArtifact(
        path.join(artifactRoot, "triviews", "whitebox-triview-manifest.json"),
        freshnessFloor,
      );
      const remotePendingSince = new Date().toISOString();
      const remotePendingDeadlineAt = new Date(Date.now() + remotePendingGraceMs).toISOString();
      const error = deriveWorldGenerationFailureReason(`${stdout.raw}\n${stderr.raw}`, exit);
      await updateRecord(id, {
        status: "remote-pending",
        stage: canonicalWorkflowStage(remotePending.stage, record),
        failedStage: null,
        finishedAt: null,
        error,
        remoteJobId: remotePending.jobId,
        remoteTaskId: remotePending.taskId,
        remoteRequestId: remotePending.requestId,
        remoteOutputS3Prefix: remotePending.outputS3Prefix,
        remotePendingSince,
        remotePendingDeadlineAt,
        captureRequired: !whiteboxRuntimePassed,
        captureError: null,
        captureStatus: whiteboxRuntimePassed ? "passed" : "pending",
        triviewStatus: whiteboxTriviewPassed
          ? "passed"
          : whiteboxRuntimePassed ? "failed" : "pending",
        whiteboxOutcome: whiteboxRuntimePassed ? "passed" : null,
        styledOpeningFrameStatus: styledOpeningFrameRequired ? "pending" : "not-required",
        styledTriviewsStatus: styledTriviewsRequired ? "pending" : "not-required",
        outcome: null,
      });
      await appendTrajectoryEvent(
        id,
        canonicalWorkflowStage(remotePending.stage, record),
        `LWDP Job ${remotePending.jobId} 超过常规等待窗口但仍在远端执行；已转入后台对账，不会重复提交。`,
        {
          kind: "remote-pending",
          jobId: remotePending.jobId,
          taskId: remotePending.taskId,
          remoteStatus: remotePending.remoteStatus,
          deadlineAt: remotePendingDeadlineAt,
        },
      );
      return;
    }

    const combinedOutput = `${stdout.raw}\n${stderr.raw}`;
    if (
      exit.code !== 0 && codexBackend === "cloud" &&
      parseLatestLwdpJobMarker(combinedOutput) !== null &&
      /(?:TypeError:\s*fetch failed|ERR_(?:SSL|TLS|NETWORK|SOCKET|CONNECTION)|ssl\/tls alert handshake failure|ECONN(?:RESET|REFUSED|ABORTED)|ENET(?:UNREACH|DOWN)|EHOSTUNREACH)/i.test(
        combinedOutput,
      )
    ) {
      const latestRecord = await readRecord(id);
      if (latestRecord && await markCloudRecordForRemoteReconciliation(
        latestRecord,
        "与 LWDP 的连接中断，但远端 Job 结果未知；已转入原 Job 对账，不会重复提交。",
      )) return;
    }

    const requiredArtifacts = [
      "scene-brief.md",
      "planner-self-check.json",
      "visual-identity-palette.json",
      "world.mjs",
      "authoring.json",
      "implementation-map.draft.json",
      "builder-self-check.json",
      "builder-top-down-comparison.png",
      "builder-entry-comparison.png",
      "scene-implementation-map.json",
      "world.build.json",
      "opening-frame.png",
      "runtime-snapshot.json",
      "whitebox-capture-receipt.json",
      path.join("triviews", "whitebox-triview-manifest.json"),
      "entry-third-person-validation.json",
    ];
    if (resumeHostOnly) requiredArtifacts.push("builder-host-resume.json");
    if (styledOpeningFrameRequired) {
      requiredArtifacts.push("visual-generation-prompts.json", "styled-opening-frame.png");
    }
    if (styledTriviewsRequired) {
      requiredArtifacts.push("styled-triviews-manifest.json", "styled-triviews-report.json");
      const captureManifest = await readJsonIfPresent(
        path.join(artifactRoot, "triviews", "whitebox-triview-manifest.json"),
      );
      for (const target of captureManifest?.whiteboxTriviews ?? []) {
        if (idPattern.test(target?.visualTargetId)) {
          requiredArtifacts.push(path.join("triviews", target.visualTargetId, "styled-triview.png"));
        }
      }
    }
    const freshnessFloor = Date.parse(startedAt) - 1_000;
    const reusableUpstreamArtifacts = new Set([
      "scene-brief.md",
      "planner-self-check.json",
      "visual-identity-palette.json",
      "world.mjs",
      "authoring.json",
      "implementation-map.draft.json",
      "builder-self-check.json",
      "builder-top-down-comparison.png",
      "builder-entry-comparison.png",
    ]);
    const reusablePlannerArtifacts = new Set([
      "scene-brief.md",
      "planner-self-check.json",
      "visual-identity-palette.json",
    ]);
    const artifactGates = Object.fromEntries(await Promise.all(requiredArtifacts.map(async (relativePath) => {
      try {
        const metadata = await stat(path.join(artifactRoot, relativePath));
        const minimumMtime = (
          (resumeHostOnly && reusableUpstreamArtifacts.has(relativePath)) ||
          (resumeBuilderOnly && reusablePlannerArtifacts.has(relativePath))
        )
          ? Number.NEGATIVE_INFINITY
          : freshnessFloor;
        return [relativePath, metadata.isFile() && metadata.size > 0 && metadata.mtimeMs >= minimumMtime];
      } catch {
        return [relativePath, false];
      }
    })));
    const artifactsComplete = Object.values(artifactGates).every(Boolean);
    const whiteboxRuntimePassed = await hasPlayableWhiteboxArtifacts(
      artifactRoot,
      record.sceneId,
      freshnessFloor,
    );
    const whiteboxTriviewPassed = whiteboxRuntimePassed &&
      artifactGates[path.join("triviews", "whitebox-triview-manifest.json")] === true;
    const finishedAt = new Date().toISOString();
    if (exit.code === 0 && artifactsComplete && whiteboxRuntimePassed) {
      await updateRecord(id, {
        status: "ready",
        stage: "ready",
        captureRequired: false,
        runtimeCaptureAttempts: 0,
        captureError: null,
        captureStatus: "passed",
        triviewStatus: "passed",
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
        executionMode,
        outcome: "passed",
        whiteboxOutcome: "passed",
        triviewStatus: "passed",
        gates: artifactGates,
        finishedAt,
      });
      await appendJobLog(id, "\nWorld generation completed after trusted Babylon capture and optional visual-provider outputs.\n");
      await appendTrajectoryEvent(id, "runtime-capture", "白膜首帧与 Runtime Snapshot 已生成，世界可进入；实体白膜三视图后处理也已完成。", { kind: "completed" });
      await appendTrajectoryEvent(id, "entry-alignment-validation", "真实首帧与 Runtime Snapshot V4 的第三人称进入构图校验已通过。", { kind: "completed" });
      if (styledTriviewsRequired) {
        await appendTrajectoryEvent(id, "visual-reconstruction", "单个 LWDP Codex Job 已生成视觉提示词、最终样式首帧和全部完整视觉目标三视图。", { kind: "completed" });
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
    const triviewFailure = whiteboxRuntimePassed && !whiteboxTriviewPassed;
    const processFailureReason = deriveWorldGenerationFailureReason(
      await readFile(logPath(id), "utf8").catch(() => ""),
      { code: exit.code, signal: exit.signal ?? null },
    );
    const reason = entryFailure
      ? `Entry third-person validation failed: ${entryFailure}`
      : triviewFailure
      ? "白膜世界已成功生成并可进入，但白膜三视图后处理失败；可以直接进入世界，并按需重试三视图。"
      : exit.error instanceof Error
      ? exit.error.message
      : exit.code === 0
        ? `World generation omitted required artifacts: ${Object.entries(artifactGates).filter(([, passed]) => !passed).map(([name]) => name).join(", ")}.`
        : processFailureReason;
    const latestRecord = await readRecord(id);
    await updateRecord(id, {
      status: "failed",
      stage: exit.code === 3 ? "change-requested" : "failed",
      failedStage: triviewFailure ? "runtime-capture" : latestRecord?.stage ?? "preparing",
      finishedAt,
      error: reason,
      captureError: whiteboxRuntimePassed ? null : reason,
      captureStatus: whiteboxRuntimePassed ? "passed" : "failed",
      triviewStatus: whiteboxTriviewPassed ? "passed" : whiteboxRuntimePassed ? "failed" : "not-run",
      whiteboxOutcome: whiteboxRuntimePassed ? "passed" : "failed",
      styledOpeningFrameStatus: styledOpeningFrameRequired
        ? artifactGates["styled-opening-frame.png"] ? "passed" : "failed"
        : "not-required",
      styledTriviewsStatus: styledTriviewsRequired
        ? artifactGates["styled-triviews-manifest.json"] ? "passed" : "failed"
        : "not-required",
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
      executionMode,
      outcome: "failed",
      whiteboxOutcome: whiteboxRuntimePassed ? "passed" : "failed",
      triviewStatus: whiteboxTriviewPassed ? "passed" : whiteboxRuntimePassed ? "failed" : "not-run",
      gates: artifactGates,
      error: reason,
      finishedAt,
    });
    await appendJobLog(id, `\n${reason}\n`);
    if (whiteboxRuntimePassed) {
      await appendTrajectoryEvent(
        id,
        "runtime-capture",
        whiteboxTriviewPassed
          ? "白膜首帧、Runtime Snapshot 和白膜三视图已生成；白膜世界保持可进入。"
          : "白膜首帧与 Runtime Snapshot 已生成，世界可进入；白膜三视图后处理失败。",
        { kind: "completed", whiteboxRuntimeAvailable: true, triviewStatus: whiteboxTriviewPassed ? "passed" : "failed" },
      );
    }
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
            const artifactRoot = path.join(repoRoot, "artifacts/scenes", latest?.sceneId ?? id);
            const startedAtMs = Date.parse(latest?.startedAt ?? "");
            const freshnessFloor = Number.isFinite(startedAtMs)
              ? startedAtMs - 1_000
              : Number.POSITIVE_INFINITY;
            const whiteboxRuntimePassed = latest !== null && await hasPlayableWhiteboxArtifacts(
              artifactRoot,
              latest.sceneId,
              freshnessFloor,
            );
            const whiteboxTriviewPassed = whiteboxRuntimePassed && await nonemptyArtifact(
              path.join(artifactRoot, "triviews", "whitebox-triview-manifest.json"),
              freshnessFloor,
            );
            await updateRecord(id, {
              status: "failed",
              stage: "failed",
              failedStage: whiteboxRuntimePassed && !whiteboxTriviewPassed
                ? "runtime-capture"
                : latest?.stage ?? "preparing",
              finishedAt,
              error: error instanceof Error ? error.message : String(error),
              captureStatus: whiteboxRuntimePassed ? "passed" : "failed",
              triviewStatus: whiteboxTriviewPassed
                ? "passed"
                : whiteboxRuntimePassed ? "failed" : "not-run",
              whiteboxOutcome: whiteboxRuntimePassed ? "passed" : "failed",
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
    if (typeof record.remoteExecutionId === "string" && record.remoteExecutionId) {
      try {
        const config = await loadLwdpConfigImplementation({
          ...process.env,
          LWDP_GENERATION_API_TOKEN: undefined,
          LWDP_API_BASE: undefined,
          LWDP_USER_ID: undefined,
          WORLDKIT_LWDP_ENV_FILE: projectLwdpEnvFile,
        });
        const response = await cancelCloudExecutionImplementation(
          record.remoteExecutionId,
          { config },
        );
        const execution = cloudExecutionRecord(response);
        return {
          requested: true,
          executionId: record.remoteExecutionId,
          status: execution.status,
        };
      } catch (error) {
        return {
          requested: true,
          executionId: record.remoteExecutionId,
          status: "cancel-request-failed",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
    const rawLog = await readFile(logPath(record.id), "utf8").catch(() => "");
    const matches = [...rawLog.matchAll(/WORLDKIT_LWDP_JOB\s+[^\s]+\s+[^\s]+\s+(gen_[a-zA-Z0-9]+)/g)];
    const jobId = matches.at(-1)?.[1] ?? null;
    if (jobId === null) return { requested: false, jobId: null };
    try {
      const config = await loadLwdpConfigImplementation({
        ...process.env,
        LWDP_GENERATION_API_TOKEN: undefined,
        LWDP_API_BASE: undefined,
        LWDP_USER_ID: undefined,
        WORLDKIT_LWDP_ENV_FILE: projectLwdpEnvFile,
      });
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
      triviewStatus: "pending",
      outcome: null,
      styledOpeningFrameRequired: referenceImage !== null,
      styledOpeningFrameStatus: referenceImage === null ? "not-required" : "pending",
      styledTriviewsRequired: referenceImage !== null,
      styledTriviewsStatus: referenceImage === null ? "not-required" : "pending",
      workflowPolicyVersion,
      plannerReview: null,
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
      record?.status === "ready" &&
      record?.outcome === "passed" &&
      record?.captureStatus === "passed" &&
      record?.whiteboxOutcome === "passed"
    ) return true;
    const rawLog = await readFile(logPath(record.id), "utf8").catch(() => "");
    const recoverableInFlightVisualStage =
      ["interrupted", "running", "remote-pending"].includes(record.status) &&
      [record.failedStage, record.stage].some((stage) => stage === "visual-reconstruction");
    const recoverableTriviewOnlyFailure =
      record.status === "failed" &&
      record.failedStage === "runtime-capture" &&
      record.captureStatus === "passed" &&
      record.triviewStatus === "failed" &&
      record.whiteboxOutcome === "passed" &&
      /白膜三视图后处理失败/.test(record.error ?? "");
    const recoverableFinalizationFailure = isRecoverableVisualFinalizationFailure(
      record,
      rawLog,
    );
    const recoverableLateVisualDelivery =
      ["failed", "remote-pending"].includes(record.status) &&
      [record.failedStage, record.stage].includes("visual-reconstruction") &&
      record.captureStatus === "passed" &&
      record.triviewStatus === "passed" &&
      record.whiteboxOutcome === "passed" &&
      /(?:World generation exited with code (?:-1|1)|LWDP.*(?:分钟|远端对账|timed out))/i.test(
        record.error ?? "",
      );
    if (
      record.workflowPolicyVersion !== workflowPolicyVersion ||
      !(recoverableInFlightVisualStage || recoverableTriviewOnlyFailure ||
        recoverableFinalizationFailure || recoverableLateVisualDelivery) ||
      /alignment.{0,24}(?:fail|error)|(?:fail|error).{0,24}alignment|视觉.{0,12}(?:失败|未通过)/i.test(
        `${record.error ?? ""}\n${rawLog}`,
      )
    ) return false;
    const artifactRoot = path.join(repoRoot, "artifacts/scenes", record.sceneId);
    if (recoverableFinalizationFailure) {
      if (record.referenceImage === null) return false;
      try {
        await visualRecoveryFinalizeImplementation({
          repoRoot,
          sceneId: record.sceneId,
          userFrame: path.join(worldsRoot, record.id, record.referenceImage.fileName),
        });
        await appendJobLog(
          record.id,
          "\nRecovered completed LWDP visual outputs by replaying trusted Host finalization only; no visual Job was resubmitted.\n",
        );
      } catch (error) {
        await appendJobLog(
          record.id,
          `\nTrusted Host visual finalization recovery failed: ${error instanceof Error ? error.message : String(error)}\n`,
        );
        return false;
      }
    }
    const startedAtMs = Date.parse(record.startedAt ?? "");
    if (!Number.isFinite(startedAtMs)) return false;
    const freshnessFloor = startedAtMs - 1_000;
    const evaluationRun = await readJsonIfPresent(
      path.join(artifactRoot, "evaluation-run.json"),
    );
    const isUpstreamResume = ["host-resume", "builder-resume"].includes(
      evaluationRun?.executionMode,
    );
    if (!await hasTrustedWhiteboxArtifacts(
      artifactRoot,
      record.sceneId,
      isUpstreamResume ? Number.NEGATIVE_INFINITY : freshnessFloor,
    )) return false;
    if (isUpstreamResume && !await hasPlayableWhiteboxArtifacts(
      artifactRoot,
      record.sceneId,
      freshnessFloor,
    )) return false;
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
        path.join(artifactRoot, "triviews", "whitebox-triview-manifest.json"),
      );
      for (const target of captureManifest?.whiteboxTriviews ?? []) {
        if (idPattern.test(target?.visualTargetId)) {
          required.push(path.join("triviews", target.visualTargetId, "styled-triview.png"));
        }
      }
    }
    const gates = Object.fromEntries(await Promise.all(required.map(async (relativePath) => [
      relativePath,
      await nonemptyArtifact(path.join(artifactRoot, relativePath), freshnessFloor),
    ])));
    if (!Object.values(gates).every(Boolean)) return false;
    if (!await pngArtifact(path.join(artifactRoot, "styled-opening-frame.png"), freshnessFloor)) return false;
    const [promptBundle, openingReport, triViewReport, captureManifest] = await Promise.all([
      readJsonIfPresent(path.join(artifactRoot, "visual-generation-prompts.json")),
      readJsonIfPresent(path.join(artifactRoot, "styled-opening-frame-report.json")),
      readJsonIfPresent(path.join(artifactRoot, "styled-triviews-report.json")),
      readJsonIfPresent(path.join(artifactRoot, "triviews", "whitebox-triview-manifest.json")),
    ]);
    if (
      evaluationRun?.kind !== "worldkit-evaluation-run" || evaluationRun.schemaVersion !== 1 ||
      evaluationRun.caseId !== record.id || evaluationRun.sceneId !== record.sceneId ||
      evaluationRun.workflowPolicyVersion !== workflowPolicyVersion ||
      evaluationRun.attempt !== record.attempt || evaluationRun.startedAt !== record.startedAt
    ) return false;
    if (record.referenceImage !== null) {
      const expectedTargetIds = (captureManifest?.whiteboxTriviews ?? [])
        .map(({ visualTargetId }) => visualTargetId);
      const promptTargetIds = (promptBundle?.styledTriviews ?? [])
        .map(({ visualTargetId }) => visualTargetId);
      if (
        promptBundle?.kind !== "worldkit-visual-generation-prompts" ||
        promptBundle.schemaVersion !== 2 || promptBundle.provider !== "lwdp-codex" ||
        promptBundle.sceneId !== record.sceneId ||
        JSON.stringify(promptBundle.openingFrame?.referenceRoles) !==
          JSON.stringify(["actual-whitebox-opening", "user-first-frame"]) ||
        typeof promptBundle.openingFrame?.prompt !== "string" ||
        promptBundle.openingFrame.prompt.trim().length < 200 ||
        JSON.stringify(promptTargetIds) !== JSON.stringify(expectedTargetIds) ||
        !Array.isArray(promptBundle.styledTriviews) ||
        promptBundle.styledTriviews.some((target) =>
          JSON.stringify(target.referenceRoles) !== JSON.stringify([
            "target-whitebox-triview", "styled-opening-frame", "user-first-frame",
          ]) || typeof target.prompt !== "string" || target.prompt.trim().length < 150) ||
        openingReport?.kind !== "worldkit-styled-opening-frame-report" || openingReport.schemaVersion !== 1 ||
        openingReport.sceneId !== record.sceneId || openingReport.status !== "passed" ||
        triViewReport?.kind !== "worldkit-styled-triview-report" || triViewReport.schemaVersion !== 1 ||
        triViewReport.sceneId !== record.sceneId || triViewReport.status !== "passed"
      ) return false;
      for (const target of captureManifest?.whiteboxTriviews ?? []) {
        if (!await pngArtifact(
          path.join(artifactRoot, "triviews", target.visualTargetId, "styled-triview.png"),
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
      triviewStatus: "passed",
      outcome: "passed",
      whiteboxOutcome: "passed",
      styledOpeningFrameStatus: record.referenceImage === null ? "not-required" : "passed",
      styledTriviewsStatus: record.referenceImage === null ? "not-required" : "passed",
      finishedAt,
      error: null,
      remoteJobId: null,
      remoteTaskId: null,
      remoteRequestId: null,
      remoteOutputS3Prefix: null,
      remotePendingSince: null,
      remotePendingDeadlineAt: null,
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
      record.referenceImage === null ? "runtime-capture" : "visual-reconstruction",
      record.referenceImage === null
        ? "已恢复新首帧完成状态。"
        : "已恢复：视觉提示词、新首帧及全部并发渲染后三视图均已生成。",
      { kind: "completed" },
    );
    return true;
  }

  function submittedLwdpJobCountForStage(rawLog, stage) {
    const logStage = stage === "builder"
      ? "coding-agent"
      : stage === "visual" ? "visual-reconstruction" : "planner";
    return new Set([...String(rawLog).matchAll(
      /^(?:\[stdout\]\s*)?WORLDKIT_LWDP_JOB (planner|coding-agent|visual-reconstruction) [a-z0-9-]+ (gen_[a-zA-Z0-9]+)\b/gm,
    )].filter((match) => match[1] === logStage).map((match) => match[2])).size;
  }

  async function queueRemoteStageRetry(record, {
    stage,
    jobId,
    rawLog,
    retryClass,
  }) {
    const retryLimit = retryClass === "task-timeout" ? 2 : 3;
    const submittedCount = submittedLwdpJobCountForStage(rawLog, stage);
    if (submittedCount >= retryLimit) return false;

    const resumeHostOnly = stage === "visual" && await hasTrustedBuilderResumeInputs(record);
    const resumeBuilderOnly = !resumeHostOnly && stage !== "planner" &&
      await prepareTrustedPlannerResume(record);
    const resumeFromStage = resumeHostOnly
      ? "block-build"
      : resumeBuilderOnly ? "planner" : null;
    const executionMode = resumeHostOnly
      ? "host-resume"
      : resumeBuilderOnly ? "builder-resume" : "full";
    const transition = await transitionRecord(record.id, {
      status: "queued",
      stage: "queued",
      failedStage: null,
      finishedAt: null,
      error: null,
      captureRequired: true,
      captureError: null,
      captureStatus: "pending",
      triviewStatus: "pending",
      whiteboxOutcome: null,
      outcome: null,
      styledOpeningFrameStatus: record.referenceImage ? "pending" : "not-required",
      styledTriviewsRequired: Boolean(record.referenceImage),
      styledTriviewsStatus: record.referenceImage ? "pending" : "not-required",
      resumeFromStage,
      remoteJobId: null,
      remoteTaskId: null,
      remoteRequestId: null,
      remoteOutputS3Prefix: null,
      remotePendingSince: null,
      remotePendingDeadlineAt: null,
    }, {
      expectedAttempt: record.attempt,
      expectedStatuses: ["failed", "remote-pending", "interrupted"],
    });
    if (!transition.applied) return transition.reason === "already-complete";
    await appendJobLog(
      record.id,
      `\nLWDP Job ${jobId} confirmed a retryable ${retryClass} terminal failure; queued ${executionMode} attempt ${submittedCount + 1}/${retryLimit}.\n`,
    );
    await appendTrajectoryEvent(
      record.id,
      "queued",
      `LWDP Job ${jobId} 已确认是 ${retryClass} 瞬时终态失败，进入有界阶段重试 ${submittedCount + 1}/${retryLimit}。`,
      {
        kind: "retry",
        reason: retryClass,
        attempt: submittedCount + 1,
        limit: retryLimit,
        previousJobId: jobId,
        executionMode,
        resumeFromStage,
      },
    );
    enqueue(record.id, effectiveCodexBackend(record));
    return true;
  }

  async function recoverLateLwdpCodexDelivery(record) {
    const recoverableInterrupted = record.status === "interrupted" &&
      record.outcome !== "cancelled";
    if (
      !autoRecoverLateLwdpJobs ||
      activeJobs.has(record.id) ||
      queue.some((item) => parseQueueItem(item)?.id === record.id) ||
      typeof record.remoteExecutionId === "string" ||
      !(recoverableInterrupted || ["failed", "remote-pending"].includes(record.status)) ||
      effectiveCodexBackend(record) !== "cloud"
    ) return false;
    const rawLog = await readFile(logPath(record.id), "utf8").catch(() => "");
    const matches = [...rawLog.matchAll(
      /^(?:\[stdout\]\s*)?WORLDKIT_LWDP_JOB (planner|coding-agent|visual-reconstruction) ([a-z0-9-]+) (gen_[a-z0-9]+)\b/gm,
    )];
    const latest = matches.at(-1);
    if (!latest) return false;
    const latestJobLog = rawLog.slice(latest.index ?? 0);
    const failureReason = deriveWorldGenerationFailureReason(rawLog);
    const knownRetryClass = classifyCodexTaskFailureForRetry(new Error(
      `${record.error ?? ""}\n${failureReason}\n${latestJobLog}`,
    ));
    if (
      record.status === "failed" && knownRetryClass === null &&
      !/LWDP.*(?:[0-9]+ 分钟|timed out|远端对账)/i.test(
        `${record.error ?? ""}\n${failureReason}`,
      )
    ) {
      return false;
    }
    const stage = latest[1] === "planner"
      ? "planner"
      : latest[1] === "coding-agent" ? "builder" : "visual";
    try {
      const config = await loadLwdpConfigImplementation({
        ...process.env,
        LWDP_GENERATION_API_TOKEN: undefined,
        LWDP_API_BASE: undefined,
        LWDP_USER_ID: undefined,
        WORLDKIT_LWDP_ENV_FILE: projectLwdpEnvFile,
      });
      const recovery = await lateLwdpRecoveryImplementation({
        jobId: latest[3],
        repoRoot,
        sceneId: record.sceneId,
        stage,
        config,
      });
      if (stage === "visual") {
        if (record.referenceImage === null) return false;
        await visualRecoveryFinalizeImplementation({
          repoRoot,
          sceneId: record.sceneId,
          userFrame: path.join(worldsRoot, record.id, record.referenceImage.fileName),
        });
        const latestRecord = await readRecord(record.id);
        if (latestRecord?.status === "ready") return true;
        const recovered = await recoverGeneratedStyledOutputs(latestRecord);
        if (!recovered) {
          if ((await readRecord(record.id))?.status === "ready") return true;
          throw new Error("Recovered visual outputs failed trusted Host finalization checks.");
        }
        await appendJobLog(
          record.id,
          `\nRecovered late LWDP visual delivery ${recovery.jobId}; finalized without resubmitting visual generation.\n`,
        );
        return true;
      }
      const trusted = stage === "builder"
        ? await hasTrustedBuilderResumeInputs(record)
        : await prepareTrustedPlannerResume(record);
      if (!trusted) {
        await appendRemoteRecoveryLogOnce(
          record.id,
          `untrusted-${stage}-${latest[3]}`,
          `\nLate LWDP ${stage} delivery ${latest[3]} downloaded but failed trusted local replay checks.\n`,
        );
        return false;
      }
      const resumeFromStage = stage === "builder" ? "block-build" : "planner";
      const executionMode = stage === "builder" ? "host-resume" : "builder-resume";
      const transition = await transitionRecord(record.id, {
        status: "queued",
        stage: "queued",
        failedStage: null,
        error: null,
        captureRequired: true,
        captureError: null,
        captureStatus: "pending",
        triviewStatus: "pending",
        whiteboxOutcome: null,
        outcome: null,
        styledOpeningFrameStatus: record.referenceImage ? "pending" : "not-required",
        styledTriviewsRequired: Boolean(record.referenceImage),
        styledTriviewsStatus: record.referenceImage ? "pending" : "not-required",
        resumeFromStage,
        remoteJobId: null,
        remoteTaskId: null,
        remoteRequestId: null,
        remoteOutputS3Prefix: null,
        remotePendingSince: null,
        remotePendingDeadlineAt: null,
      }, {
        expectedAttempt: record.attempt,
        expectedStatuses: ["failed", "remote-pending", "interrupted"],
      });
      if (!transition.applied) return transition.reason === "already-complete";
      await appendJobLog(
        record.id,
        `\nRecovered late LWDP ${stage} delivery ${recovery.jobId}; queued ${executionMode} without resubmitting the successful stage.\n`,
      );
      await appendTrajectoryEvent(
        record.id,
        "queued",
        stage === "builder"
          ? "服务端迟到交付的 Builder 产物已接管并通过可信检查，从 Host 方块编译继续。"
          : "服务端迟到交付的 Planner 产物已接管并通过可信检查，从 Builder 继续。",
        { kind: "late-lwdp-recovery", jobId: recovery.jobId, executionMode, resumeFromStage },
      );
      queue.push(queueItem(record.id, effectiveCodexBackend(record)));
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const latestRecord = await readRecord(record.id);
      if (
        latestRecord?.status === "ready" ||
        latestRecord?.attempt !== record.attempt
      ) return true;
      if (error instanceof LwdpJobPendingError || error?.code === "LWDP_JOB_PENDING") {
        if (["failed", "interrupted"].includes(latestRecord?.status)) {
          const remotePendingSince = new Date().toISOString();
          const remotePendingDeadlineAt = new Date(Date.now() + remotePendingGraceMs).toISOString();
          const pendingStage = stage === "builder"
            ? "coding-agent"
            : stage === "visual" ? "visual-reconstruction" : "planner";
          const transition = await transitionRecord(record.id, {
            status: "remote-pending",
            stage: pendingStage,
            failedStage: null,
            finishedAt: null,
            error: `LWDP 云端 Job ${latest[3]} 仍在远端执行；已从旧的超时失败状态转入后台对账，不会重复提交。`,
            remoteJobId: latest[3],
            remoteTaskId: latest[2],
            remotePendingSince,
            remotePendingDeadlineAt,
            captureRequired: record.whiteboxOutcome !== "passed",
            captureError: null,
            captureStatus: record.whiteboxOutcome === "passed" ? "passed" : "pending",
            triviewStatus: record.whiteboxOutcome === "passed"
              ? record.triviewStatus
              : "pending",
            whiteboxOutcome: record.whiteboxOutcome === "passed" ? "passed" : null,
            outcome: null,
            styledOpeningFrameStatus: record.referenceImage ? "pending" : "not-required",
            styledTriviewsStatus: record.referenceImage ? "pending" : "not-required",
          }, {
            expectedAttempt: record.attempt,
            expectedStatuses: ["failed", "interrupted"],
          });
          if (!transition.applied) return transition.reason === "already-complete";
          await appendTrajectoryEvent(
            record.id,
            pendingStage,
            `旧超时记录对应的 LWDP Job ${latest[3]} 仍未终止；已恢复后台对账状态。`,
            {
              kind: "remote-pending",
              jobId: latest[3],
              taskId: latest[2],
              deadlineAt: remotePendingDeadlineAt,
            },
          );
          return true;
        }
        const deadlineAt = Date.parse(latestRecord?.remotePendingDeadlineAt ?? "");
        if (
          latestRecord?.status === "remote-pending" &&
          Number.isFinite(deadlineAt) &&
          Date.now() >= deadlineAt
        ) {
          const finishedAt = new Date().toISOString();
          const transition = await transitionRecord(record.id, {
            status: "failed",
            stage: "failed",
            failedStage: record.stage,
            finishedAt,
            error: `LWDP 云端 Job ${latest[3]} 在延长对账窗口结束后仍未进入终态。`,
            outcome: "failed",
            styledOpeningFrameStatus: record.referenceImage ? "failed" : "not-required",
            styledTriviewsStatus: record.referenceImage ? "failed" : "not-required",
          }, {
            expectedAttempt: record.attempt,
            expectedStatuses: ["remote-pending"],
          });
          if (!transition.applied) return transition.reason === "already-complete";
          await appendTrajectoryEvent(
            record.id,
            "failed",
            `LWDP Job ${latest[3]} 超过绝对等待上限，已按云端基础设施卡死处理。`,
            { kind: "failed", jobId: latest[3], failureClass: "infrastructure-stalled" },
          );
          return true;
        }
        return false;
      }
      const retryClass = classifyCodexTaskFailureForRetry(error);
      if (retryClass !== null && await queueRemoteStageRetry(record, {
        stage,
        jobId: latest[3],
        rawLog,
        retryClass,
      })) return true;
      if (["remote-pending", "interrupted"].includes(latestRecord?.status)) {
        const finishedAt = new Date().toISOString();
        const transition = await transitionRecord(record.id, {
          status: "failed",
          stage: "failed",
          failedStage: record.stage,
          finishedAt,
          error: `LWDP 云端 Job ${latest[3]} 已进入失败终态：${message}`,
          outcome: "failed",
          styledOpeningFrameStatus: record.referenceImage ? "failed" : "not-required",
          styledTriviewsStatus: record.referenceImage ? "failed" : "not-required",
        }, {
          expectedAttempt: record.attempt,
          expectedRemoteJobId: latestRecord.remoteJobId ?? undefined,
          expectedStatuses: ["remote-pending", "interrupted"],
        });
        if (!transition.applied) return transition.reason === "already-complete";
        await appendTrajectoryEvent(
          record.id,
          "failed",
          `LWDP Job ${latest[3]} 已确认失败：${message}`,
          { kind: "failed", jobId: latest[3], failureClass: "remote-terminal" },
        );
        return true;
      }
      if (!/has 0 successful|did not succeed|status|not succeed/i.test(message)) {
        await appendJobLog(record.id, `\nLate LWDP delivery reconciliation failed: ${message}\n`);
      }
      return false;
    }
  }

  async function reconcileCloudSceneExecution(record) {
    if (
      !cloudSceneExecutionEnabled ||
      effectiveCodexBackend(record) !== "cloud" ||
      typeof record.remoteExecutionId !== "string" ||
      !record.remoteExecutionId
    ) return false;
    try {
      const config = await loadLwdpConfigImplementation({
        ...process.env,
        LWDP_GENERATION_API_TOKEN: undefined,
        LWDP_API_BASE: undefined,
        LWDP_USER_ID: undefined,
        WORLDKIT_LWDP_ENV_FILE: projectLwdpEnvFile,
      });
      const execution = cloudExecutionRecord(await getCloudExecutionImplementation(
        record.remoteExecutionId,
        { config },
      ));
      if (["succeeded", "failed", "interrupted", "cancelled"].includes(execution.status)) {
        const stages = await getCloudExecutionStagesImplementation(
          record.remoteExecutionId,
          { config },
        );
        const manifestS3Uri = cloudArtifactManifestS3Uri(execution, stages);
        return finalizeCloudSceneExecution(record, execution, stages, manifestS3Uri);
      }
      if (record.remoteDispatchStatus !== "dispatched") {
        if (["queued", "submitted", "pending"].includes(execution.status)) {
          await dispatchCloudExecutionImplementation(record.remoteExecutionId, { config });
        } else if (execution.status !== "running") {
          return false;
        }
        const dispatchTransition = await transitionRecord(record.id, {
          remoteDispatchStatus: "dispatched",
          error: `Cloud Execution ${record.remoteExecutionId} 已按原 execution_id 完成 dispatch 对账。`,
        }, {
          expectedAttempt: record.attempt,
          expectedRemoteExecutionId: record.remoteExecutionId,
          expectedStatuses: ["running", "remote-pending", "interrupted"],
        });
        if (!dispatchTransition.applied && dispatchTransition.reason !== "already-complete") {
          return false;
        }
      }
      if (
        record.remoteWorkerLaunchStatus !== "launched" &&
        typeof record.remoteRequestS3Uri === "string" &&
        typeof record.remoteOutputS3Prefix === "string"
      ) {
        const productionConfig = await cloudSceneProductionConfig();
        if (productionConfig === null) return false;
        const hostResume = record.resumeFromStage === "cloud-host" &&
          typeof record.remoteArtifactManifestS3Uri === "string";
        const builderResume = record.resumeFromStage === "cloud-builder" &&
          typeof record.remoteArtifactManifestS3Uri === "string";
        const launched = await launchStudioCloudSceneWorkerImplementation({
          executionId: record.remoteExecutionId,
          requestS3Uri: record.remoteRequestS3Uri,
          outputS3Prefix: record.remoteOutputS3Prefix,
          manifestS3Uri: hostResume || builderResume
            ? record.remoteArtifactManifestS3Uri
            : null,
          resumeMode: hostResume ? "host" : builderResume ? "builder" : "verify-only",
          attempt: record.attempt,
          userId: config.userId,
          config: productionConfig,
        });
        const launchTransition = await transitionRecord(record.id, {
          remoteWorkerLaunchStatus: "launched",
          remoteWorkerJobName: launched?.jobName ?? null,
          error: `Cloud Execution ${record.remoteExecutionId} 的 Worker 已按原 execution_id 幂等补启动。`,
        }, {
          expectedAttempt: record.attempt,
          expectedRemoteExecutionId: record.remoteExecutionId,
          expectedStatuses: ["running", "remote-pending", "interrupted"],
        });
        if (!launchTransition.applied && launchTransition.reason !== "already-complete") {
          return false;
        }
      }
      const internalStage = cloudInternalStage(execution);
      const transition = await transitionRecord(record.id, {
        status: "remote-pending",
        stage: canonicalWorkflowStage(internalStage, record),
        cloudInternalStage: internalStage,
        cloudLastHeartbeat: execution.last_heartbeat ?? new Date().toISOString(),
        error: `Cloud Execution ${record.remoteExecutionId} 仍在云端运行；Studio 正按原 execution_id 对账。`,
      }, {
        expectedAttempt: record.attempt,
        expectedRemoteExecutionId: record.remoteExecutionId,
        expectedStatuses: ["running", "remote-pending", "interrupted"],
      });
      return transition.applied || transition.reason === "already-complete";
    } catch (error) {
      if (error?.status === 404) {
        const manifestS3Uri = expectedCloudSceneManifestS3Uri(record);
        if (manifestS3Uri !== null) {
          try {
            const manifest = await readCloudArtifactManifestImplementation(manifestS3Uri, {
              repoRoot,
              expectedSceneId: record.sceneId,
              expectedExecutionId: record.remoteExecutionId,
            });
            const pipelineLog = await readVerifiedCloudArtifactImplementation(
              { remoteArtifacts: manifest.artifacts },
              "logs/pipeline.log",
              { repoRoot, maximumBytes: 16 * 1024 * 1024 },
            );
            const pipelineLogText = pipelineLog?.toString("utf8") ?? "";
            const publishedReady =
              /(?:^|\n)WORLDKIT_STAGE ready(?:\r?\n|$)/.test(pipelineLogText);
            const recoveredExecution = {
              execution_id: record.remoteExecutionId,
              status: publishedReady ? "succeeded" : "failed",
              current_stage_id: "scene-production",
              error: publishedReady
                ? null
                : deriveWorldGenerationFailureReason(pipelineLogText, { code: 1 }),
              diagnostics: {
                internal_stage: publishedReady ? "ready" : "failure-artifact-upload",
                recovered_from_expected_manifest: true,
              },
            };
            return await finalizeCloudSceneExecution(
              record,
              recoveredExecution,
              { stages: [{
                stage_id: "scene-production",
                status: recoveredExecution.status,
                diagnostics: {
                  internal_stage: recoveredExecution.diagnostics.internal_stage,
                  manifest_s3_uri: manifestS3Uri,
                },
              }] },
              manifestS3Uri,
            );
          } catch {
            // The exact Worker manifest is not published yet. Keep reconciling
            // the same execution identity without creating another task.
          }
        }
      }
      await appendRemoteRecoveryLogOnce(
        record.id,
        `cloud-execution-${record.remoteExecutionId}`,
        `\nCloud Execution reconciliation is temporarily unavailable: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      return false;
    }
  }

  async function reconcileCloudSceneSubmission(record) {
    if (
      !cloudSceneExecutionEnabled ||
      effectiveCodexBackend(record) !== "cloud" ||
      typeof record.remoteExecutionId === "string" ||
      typeof record.remoteRequestId !== "string" ||
      !["failed", "remote-pending"].includes(record.status) ||
      !/Cloud Execution|request failed \(404\)|Not Found/i.test(record.error ?? "")
    ) return false;
    try {
      const config = await loadLwdpConfigImplementation({
        ...process.env,
        LWDP_GENERATION_API_TOKEN: undefined,
        LWDP_API_BASE: undefined,
        LWDP_USER_ID: undefined,
        WORLDKIT_LWDP_ENV_FILE: projectLwdpEnvFile,
      });
      await getCloudExecutionCapacityImplementation({ config });
      const transition = await transitionRecord(record.id, {
        status: "queued",
        stage: "queued",
        failedStage: null,
        finishedAt: null,
        error: null,
        captureRequired: true,
        captureError: null,
        captureStatus: "pending",
        triviewStatus: "pending",
        whiteboxOutcome: null,
        outcome: null,
        remotePendingSince: null,
        remotePendingDeadlineAt: null,
      }, {
        expectedAttempt: record.attempt,
        expectedStatuses: ["failed", "remote-pending"],
      });
      if (!transition.applied) return transition.reason === "already-complete";
      await appendTrajectoryEvent(
        record.id,
        "queued",
        "LWDP Cloud Execution 控制面已恢复；冻结输入重新进入云端提交队列。",
        { kind: "retry", reason: "cloud-control-plane-restored" },
      );
      enqueue(record.id, "cloud");
      return true;
    } catch {
      return false;
    }
  }

  async function reconcileRemoteLwdpDeliveries() {
    if (!autoRecoverLateLwdpJobs || shuttingDown || remoteRecoveryInFlight) return;
    remoteRecoveryInFlight = true;
    try {
      const records = await listRecords();
      for (const record of records) {
        if (shuttingDown) break;
        if (
          activeJobs.has(record.id) ||
          queue.some((item) => parseQueueItem(item)?.id === record.id)
        ) continue;
        if (
          !["failed", "remote-pending", "interrupted"].includes(record.status) ||
          (record.status === "interrupted" && record.outcome === "cancelled")
        ) continue;
        if (await reconcileCloudSceneSubmission(record)) continue;
        if (await reconcileCloudSceneExecution(record)) continue;
        if (await recoverGeneratedStyledOutputs(record)) continue;
        await recoverLateLwdpCodexDelivery(record);
      }
      pumpQueue();
    } finally {
      remoteRecoveryInFlight = false;
    }
  }

  async function initialize() {
    await acquireStudioWriterLease();
    try {
      await ensureWhiteboxCaptureHostKeyPair();
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
      const recoverPersistedRecords = async () => {
        // The dedicated cloud control plane must eagerly recover S3-owned Runs.
        // A local/public Studio starts from its local cache and lets ordinary
        // API/background reconciliation fetch remote projections after
        // readiness, so an S3 inventory scan cannot hold both listeners closed.
        await episodeWorkflows.recoverPersistedCloudEpisodes({
          includeRemote: cloudControlPlane,
        });
        const records = await listRecords();
        for (const record of records) {
          if (await recoverGeneratedStyledOutputs(record)) continue;
          if (["running", "visual-running", "visual-queued", "awaiting-recording"].includes(record.status)) {
            if (
              effectiveCodexBackend(record) === "cloud" &&
              typeof record.remoteExecutionId === "string" &&
              record.remoteExecutionId
            ) {
              await transitionRecord(record.id, {
                status: "remote-pending",
                stage: record.stage,
                finishedAt: null,
                error: `Creator Studio 已重启；正在按原 Cloud Execution ${record.remoteExecutionId} 对账。`,
                remotePendingSince: new Date().toISOString(),
                remotePendingDeadlineAt: new Date(Date.now() + remotePendingGraceMs).toISOString(),
              }, {
                expectedAttempt: record.attempt,
                expectedRemoteExecutionId: record.remoteExecutionId,
                expectedStatuses: ["running", "visual-running", "visual-queued", "awaiting-recording"],
              });
              continue;
            }
            if (await markCloudRecordForRemoteReconciliation(
              record,
              "Creator Studio 已重启；正在按持久化的原 LWDP Job 对账，不会重复提交。",
            )) continue;
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
      };
      if (cloudControlPlane) {
        runBackgroundTask("cloud-control-plane", "startup-recovery", recoverPersistedRecords);
      } else {
        await recoverPersistedRecords();
      }
      if (autoRecoverLateLwdpJobs && remoteRecoveryTimer === null) {
        remoteRecoveryTimer = setInterval(() => {
          runBackgroundTask("remote-lwdp", "reconcile-late-deliveries", () =>
            reconcileRemoteLwdpDeliveries());
        }, remoteRecoveryIntervalMs);
        remoteRecoveryTimer.unref?.();
        runBackgroundTask("remote-lwdp", "initial-reconcile-late-deliveries", () =>
          reconcileRemoteLwdpDeliveries());
      }
    } catch (error) {
      await releaseStudioWriterLease();
      throw error;
    }
  }

  async function handleApi(request, response, url) {
    if (await recordingWorkbench.handleApi(request, response, url)) return true;
    if (await episodeWorkflows.handleApi(request, response, url)) return true;

    if (request.method === "PUT" && url.pathname === "/api/settings/codex-backend") {
      const body = await readJsonBody(request);
      const requestedBackend = normalizedCodexBackend(body?.backend);
      if (requestedBackend === null) {
        throw new InputError("Codex 运行端只能是 cloud 或 local。");
      }
      const result = await runRuntimeSettingsMutation("codex-backend", async () => {
        const availability = await codexBackendAvailability({ force: true });
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
        visualReconstructionBackend: "lwdp-codex",
        visualReconstructionExecutionProfile: FORMAL_CODEX_EXECUTION_PROFILE,
        codexExecutionProfile: FORMAL_CODEX_EXECUTION_PROFILE,
        pnpmAvailable,
        activeJob: activeJobs.values().next().value ?? null,
        activeJobs: activeJobSummaries,
        maxConcurrentJobs,
        maxConcurrentJobsByBackend,
        cloudProductionThroughput,
        recordingActiveJobs: recordingWorkbench.activeJobs,
        recordingMaxConcurrentJobs: recordingWorkbench.maxConcurrentJobs,
        episodeActiveJobs: episodeWorkflows.activeJobs,
        queued: queue.length,
        queuedByBackend: {
          cloud: queuedCountForBackend("cloud"),
          local: queuedCountForBackend("local"),
        },
        playgroundOrigin,
        workflow: "switchable-codex-current-block-whitebox-hosted-evaluation",
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
      const catalog = await readJsonIfPresent(subjectCatalogPath);
      const definitions = catalog?.kind === "worldkit-agent-authoring-catalog" &&
          catalog.schemaVersion === 2 && Array.isArray(catalog.subjectPacks)
        ? catalog.subjectPacks
        : null;
      if (definitions === null) {
        sendError(response, 503, "主体目录暂不可用。");
        return true;
      }
      const presets = definitions.map((definition) => ({
        label: definition.displayName ?? definition.subjectDefinitionRef,
        maturity: definition.authoringAvailability,
        packId: definition.id,
        ref: definition.subjectDefinitionRef,
        description: definition.description ?? definition.bodyTopology,
        planningBounds: definition.visualReviewProxy === undefined
          ? null
          : definition.visualReviewProxy.boundsMaximumMetersXYZ.map((value, axis) =>
              value - definition.visualReviewProxy.boundsMinimumMetersXYZ[axis]),
        compatibleMotionPackIds: definition.compatibleMotionPackIds ?? [],
        bodyTopology: definition.bodyTopology,
        selectionPolicy: definition.selectionPolicy,
      }));
      sendJson(response, 200, {
        presets,
        motionPacks: Array.isArray(catalog.motionPacks) ? catalog.motionPacks : [],
        cameraPacks: Array.isArray(catalog.cameraPacks) ? catalog.cameraPacks : [],
        customMeshPolicy: catalog.customMeshPolicy ?? null,
        productionRefs: presets
          .filter((preset) => preset?.maturity === "recommended")
          .map((preset) => preset.ref),
        advancedRefs: presets
          .filter((preset) => preset?.maturity === "advanced")
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
      sendJson(response, 200, { worlds: await listEnrichedWorlds() });
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

    const plannerReviewMatch =
      /^\/api\/worlds\/([a-z0-9-]+)\/planner-review$/.exec(url.pathname);
    if (request.method === "POST" && plannerReviewMatch) {
      const record = await readRecord(plannerReviewMatch[1]);
      if (!record) {
        sendError(response, 404, "没有找到这个世界。");
        return true;
      }
      const body = await readJsonBody(request);
      if (!body || !["approved", "rejected"].includes(body.status)) {
        throw new InputError("Planner 人工审核只能提交 approved 或 rejected。");
      }
      const plannerCheck = await readJsonIfPresent(path.join(
        repoRoot,
        "artifacts/scenes",
        record.sceneId,
        "planner-self-check.json",
      ));
      const artifactIdentity = await trustedPlannerArtifactIdentity(record, plannerCheck);
      if (artifactIdentity === null) {
        sendError(response, 409, "Planner 三项工件尚未形成可审核的通过收据。");
        return true;
      }
      const reviewedAt = new Date().toISOString();
      const updated = await updateRecord(record.id, {
        plannerReview: {
          status: body.status,
          artifactIdentity,
          reviewedAt,
        },
      });
      await appendTrajectoryEvent(
        record.id,
        "planner",
        body.status === "approved"
          ? "人工已确认俯视规划、镜头外延伸、出生点标记和进入构图。"
          : "人工已退回 Planner 视觉规划；当前决定绑定现有三项工件 Hash。",
        { kind: "human-review", reviewStatus: body.status, artifactIdentity },
      );
      sendJson(response, 200, {
        ok: true,
        plannerReview: effectivePlannerReview(updated, artifactIdentity),
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
      const remote = cloudArtifactByPath(
        record,
        `scene/triviews/${triviewMatch[2]}/whitebox-triview.png`,
      );
      if (!await fileExists(imagePath) && remote === null) {
        sendError(response, 404, "这个三视图尚未生成。");
        return true;
      }
      if (await fileExists(imagePath)) serveFile(response, imagePath, "private, no-store");
      else await streamCloudArtifactImplementation(response, remote, { repoRoot });
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
      const remote = cloudArtifactByPath(
        record,
        `scene/triviews/${styledTriviewMatch[2]}/styled-triview.png`,
      );
      if (!await fileExists(imagePath) && remote === null) {
        sendError(response, 404, "这个渲染后三视图尚未生成。");
        return true;
      }
      if (await fileExists(imagePath)) serveFile(response, imagePath, "private, no-store");
      else await streamCloudArtifactImplementation(response, remote, { repoRoot });
      return true;
    }

    const previewBootstrapMatch = /^\/api\/worlds\/([a-z0-9-]+)\/preview-bootstrap$/.exec(url.pathname);
    if (request.method === "GET" && previewBootstrapMatch) {
      const worldId = previewBootstrapMatch[1];
      const recordBefore = await readRecord(worldId);
      if (recordBefore === null) {
        sendJson(response, 404, {
          code: "STUDIO_PREVIEW_NOT_FOUND",
          error: "没有找到这个世界。",
        });
        return true;
      }
      const artifactRoot = path.join(repoRoot, "artifacts/scenes", recordBefore.sceneId);
      const readSourceIfPresent = async (relativePath) => {
        return readSceneArtifactText(recordBefore, relativePath);
      };
      const attemptStartedAt = recordBefore.origin === "existing-scene-brief-world"
        ? recordBefore.createdAt
        : recordBefore.startedAt;
      const attemptStartedAtMs = Date.parse(attemptStartedAt ?? "");
      const [
        authoringSource,
        implementationMapSource,
        evaluationRunSource,
        whiteboxRuntimeAvailable,
      ] =
        await Promise.all([
          readSourceIfPresent("authoring.json"),
          readSourceIfPresent("scene-implementation-map.json"),
          readSourceIfPresent("evaluation-run.json"),
          recordBefore.remoteArtifactAdmission?.status === "passed" &&
              recordBefore.remoteArtifactAdmission?.executionId === recordBefore.remoteExecutionId
            ? true
            : hasPlayableWhiteboxArtifacts(
                artifactRoot,
                recordBefore.sceneId,
                recordBefore.origin === "existing-scene-brief-world"
                  ? Number.NEGATIVE_INFINITY
                  : Number.isFinite(attemptStartedAtMs)
                    ? attemptStartedAtMs - 1_000
                    : Number.POSITIVE_INFINITY,
              ),
        ]);
      const recordAfter = await readRecord(worldId);
      if (authoringSource === null || implementationMapSource === null) {
        sendJson(response, 404, {
          code: "STUDIO_PREVIEW_NOT_FOUND",
          error: "这个世界尚未生成完整 Preview authority。",
        });
        return true;
      }
      try {
        const bootstrap = assembleStudioPreviewBootstrapV1({
          worldId,
          whiteboxRuntimeAvailable,
          recordBefore,
          recordAfter,
          authoringSource,
          implementationMapSource,
          evaluationRunSource,
        });
        sendJson(response, 200, bootstrap);
      } catch (error) {
        if (!(error instanceof StudioPreviewBootstrapError)) throw error;
        const statusCode = error.code === "STUDIO_PREVIEW_NOT_FOUND" ? 404 : 409;
        sendJson(response, statusCode, { code: error.code, error: error.message });
      }
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
      if (deliverable.remote) {
        await streamCloudArtifactImplementation(response, deliverable.remote, { repoRoot });
      } else {
        serveFile(response, deliverable.path, "private, no-store");
      }
      return true;
    }

    const stopMatch = /^\/api\/worlds\/([a-z0-9-]+)\/stop$/.exec(url.pathname);
    if (request.method === "POST" && stopMatch) {
      const record = await readRecord(stopMatch[1]);
      if (!record) {
        sendError(response, 404, "没有找到这个世界。");
        return true;
      }
      if (!["queued", "running", "remote-pending", "visual-queued", "visual-running"].includes(record.status)) {
        sendError(response, 409, "只有排队或运行中的任务可以停止。");
        return true;
      }

      const wasActive = activeJobs.has(record.id);
      if (wasActive) stoppingJobs.add(record.id);
      for (let index = queue.length - 1; index >= 0; index -= 1) {
        if (parseQueueItem(queue[index])?.id === record.id) queue.splice(index, 1);
      }

      const remoteCancellation = wasActive || record.status === "remote-pending"
        ? await cancelRemoteLwdpJob(record)
        : { requested: false, jobId: null };
      if (wasActive) terminateChild(activeChildren.get(record.id));

      const artifactRoot = path.join(repoRoot, "artifacts/scenes", record.sceneId);
      const startedAtMs = Date.parse(record.startedAt ?? "");
      const freshnessFloor = Number.isFinite(startedAtMs)
        ? startedAtMs - 1_000
        : Number.POSITIVE_INFINITY;
      const capturePassed = await hasPlayableWhiteboxArtifacts(
        artifactRoot,
        record.sceneId,
        freshnessFloor,
      );
      const triviewPassed = capturePassed && await nonemptyArtifact(
        path.join(artifactRoot, "triviews", "whitebox-triview-manifest.json"),
        freshnessFloor,
      );
      const stopped = await updateRecord(record.id, {
        status: "interrupted",
        stage: "interrupted",
        failedStage: record.stage,
        finishedAt: new Date().toISOString(),
        error: record.status === "remote-pending"
          ? "用户已停止等待远端对账的任务。"
          : wasActive ? "用户已停止正在运行的任务。" : "用户已取消排队任务。",
        captureRequired: false,
        captureStatus: capturePassed ? "passed" : "not-run",
        triviewStatus: triviewPassed ? "passed" : capturePassed ? "failed" : "not-run",
        whiteboxOutcome: capturePassed ? "passed" : null,
        outcome: "cancelled",
      });
      await appendJobLog(
        record.id,
        `\nWorld generation ${record.status === "remote-pending" ? "remote reconciliation stopped" : wasActive ? "stopped" : "removed from queue"} by user.\n`,
      );
      await appendTrajectoryEvent(
        record.id,
        "interrupted",
        record.status === "remote-pending"
          ? "用户停止了等待远端对账的任务。"
          : wasActive ? "用户停止了正在运行的任务。" : "用户取消了排队任务。",
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

    const rebuildBuilderMatch =
      /^\/api\/worlds\/([a-z0-9-]+)\/rebuild-builder$/.exec(url.pathname);
    if (request.method === "POST" && rebuildBuilderMatch) {
      const record = await readRecord(rebuildBuilderMatch[1]);
      if (!record) {
        sendError(response, 404, "没有找到这个世界。");
        return true;
      }
      if (!["ready", "failed", "interrupted", "remote-pending"].includes(record.status)) {
        sendError(response, 409, "只有已完成、失败、中断或待远端对账的任务可以从 Builder 重建。");
        return true;
      }
      const productionConfig = await cloudSceneProductionConfig();
      const rebuildSource = effectiveCodexBackend(record) === "cloud"
        ? await resolveCloudBuilderRebuildSource(record, {
            outputS3Root: productionConfig?.outputS3Root,
            repoRoot,
          })
        : null;
      if (rebuildSource === null) {
        sendError(response, 409, "这个任务没有可复用的可信云端 Planner 产物。");
        return true;
      }
      const transition = await transitionRecord(record.id, {
        status: "queued",
        stage: "queued",
        failedStage: null,
        error: null,
        captureRequired: true,
        captureError: null,
        captureStatus: "pending",
        triviewStatus: "pending",
        whiteboxOutcome: null,
        outcome: null,
        styledOpeningFrameStatus: record.referenceImage ? "pending" : "not-required",
        styledTriviewsRequired: Boolean(record.referenceImage),
        styledTriviewsStatus: record.referenceImage ? "pending" : "not-required",
        resumeFromStage: "cloud-builder-rebuild",
        cloudBuilderRebuildSourceExecutionId: rebuildSource.executionId,
        cloudBuilderRebuildSourceManifestS3Uri: rebuildSource.manifestS3Uri,
        cloudBuilderRebuildSourceRequestS3Uri: rebuildSource.requestS3Uri,
      }, {
        allowReadyLifecycleTransition: true,
        expectedAttempt: record.attempt,
        expectedStatuses: [record.status],
      });
      if (!transition.applied) {
        sendError(response, 409, `任务状态已变化，无法从 Builder 重建：${transition.reason}`);
        return true;
      }
      await appendTrajectoryEvent(
        record.id,
        "queued",
        "用户发起云端 Builder 重建：复用可信 Planner Manifest，不重新运行 Planner。",
        { kind: "queued", executionMode: "cloud-builder-rebuild" },
      );
      enqueue(record.id, "cloud");
      sendJson(response, 202, {
        ok: true,
        executionMode: "cloud-builder-rebuild",
        resumeFromStage: "cloud-builder-rebuild",
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
      const resumeCloudHostOnly = effectiveCodexBackend(record) === "cloud" &&
        hasRemoteCloudHostResumeInputs(record);
      const resumeCloudBuilderOnly = effectiveCodexBackend(record) === "cloud" &&
        !resumeCloudHostOnly && hasRemoteCloudPlannerResumeInputs(record);
      const resumeHostOnly = !resumeCloudHostOnly && !resumeCloudBuilderOnly &&
        await hasTrustedBuilderResumeInputs(record);
      const resumeBuilderOnly = !resumeCloudHostOnly && !resumeCloudBuilderOnly && !resumeHostOnly &&
        await prepareTrustedPlannerResume(record);
      const resumeFromStage = resumeCloudHostOnly
        ? "cloud-host"
        : resumeCloudBuilderOnly ? "cloud-builder"
        : resumeHostOnly ? "block-build" : resumeBuilderOnly ? "planner" : null;
      const executionMode = resumeCloudHostOnly
        ? "cloud-host-resume"
        : resumeCloudBuilderOnly ? "cloud-builder-resume"
        : resumeHostOnly ? "host-resume" : resumeBuilderOnly ? "builder-resume" : "full";
      await updateRecord(record.id, {
        status: "queued",
        stage: "queued",
        failedStage: null,
        error: null,
        captureRequired: true,
        captureError: null,
        captureStatus: "pending",
        triviewStatus: "pending",
        whiteboxOutcome: null,
        outcome: null,
        styledOpeningFrameStatus: record.referenceImage ? "pending" : "not-required",
        styledTriviewsRequired: Boolean(record.referenceImage),
        styledTriviewsStatus: record.referenceImage ? "pending" : "not-required",
        resumeFromStage,
      });
      await appendTrajectoryEvent(
        record.id,
        "queued",
        resumeCloudHostOnly
          ? "用户发起云端 Host-only 恢复：复用同一 Cloud Execution 的可信 Manifest，不重新运行 Planner 或 Builder。"
          : resumeCloudBuilderOnly
            ? "用户发起云端 Builder 恢复：复用同一 Cloud Execution 的可信 Planner Manifest，不重新运行 Planner。"
          : resumeHostOnly
          ? "用户发起 Host-only 恢复：复用 Planner 与 Builder 产物，从方块编译继续。"
          : resumeBuilderOnly
            ? "用户发起 Builder 恢复：复用迟到交付且经可信校验的 Planner 产物。"
          : "用户发起完整重试，任务重新进入队列。",
        { kind: "queued", executionMode },
      );
      enqueue(record.id, effectiveCodexBackend(record));
      sendJson(response, 202, {
        ok: true,
        executionMode,
        resumeFromStage,
      });
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
      if (url.pathname === "/__worldkit/studio-ready") {
        if (
          request.method === "GET" &&
          readinessNonce !== "" &&
          typeof request.headers["x-worldkit-readiness-nonce"] === "string" &&
          constantTimeEqual(request.headers["x-worldkit-readiness-nonce"], readinessNonce)
        ) {
          sendJson(response, 200, { status: "ready", nonce: readinessNonce, pid: process.pid });
        } else {
          response.writeHead(404, { "cache-control": "no-store" });
          response.end("Not found");
        }
        return;
      }

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
          const record = (await listRecords()).find(({ sceneId }) => sceneId === assetMatch[1]);
          const remote = record === undefined
            ? null
            : cloudArtifactByPath(record, `scene-plan/${assetMatch[2]}`);
          if (remote) await streamCloudArtifactImplementation(response, remote, {
            repoRoot,
            cacheControl: "no-cache",
          });
          else {
            response.writeHead(404);
            response.end();
          }
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
    if (remoteRecoveryTimer !== null) {
      clearInterval(remoteRecoveryTimer);
      remoteRecoveryTimer = null;
    }
    for (const child of activeChildren.values()) {
      terminateChild(child);
    }
    // Child close handlers finalize records and trusted reports asynchronously.
    // Do not return while one of those handlers can still write into repoRoot;
    // callers (including tests and worktree cleanup) may remove it immediately.
    const closeDeadline = Date.now() + 5_000;
    while (activeJobs.size > 0 && Date.now() < closeDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await Promise.all([
      recordingWorkbench.shutdown(),
      episodeWorkflows.shutdown(),
      ...[...activeJobs].map(async (id) => {
        const record = await readRecord(id);
        if (record && await markCloudRecordForRemoteReconciliation(
          record,
          "Creator Studio 已停止；服务恢复后将继续对账原 LWDP Job。",
        )) return;
        await updateRecord(id, {
          status: "interrupted",
          stage: "interrupted",
          finishedAt: new Date().toISOString(),
          error: "Creator Studio stopped while this world was being generated.",
        });
      }),
    ]);
    await new Promise((resolve) => server.close(resolve));
    await releaseStudioWriterLease();
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
  const host = process.env.WORLDKIT_STUDIO_HOST ?? "127.0.0.1";
  if (!["127.0.0.1", "0.0.0.0"].includes(host)) {
    throw new Error("WORLDKIT_STUDIO_HOST must be 127.0.0.1 or 0.0.0.0.");
  }
  const port = Number(process.env.WORLDKIT_STUDIO_PORT ?? 4174);
  const dataRoot = process.env.WORLDKIT_STUDIO_DATA_ROOT ?? defaultDataRoot;
  const readinessNonce = process.env.WORLDKIT_STUDIO_READINESS_NONCE ?? "";
  delete process.env.WORLDKIT_STUDIO_READINESS_NONCE;
  const configuredPlaygroundInternalOrigin = process.env.WORLDKIT_PLAYGROUND_INTERNAL_ORIGIN;
  const managedPlayground = configuredPlaygroundInternalOrigin === undefined;
  const playgroundInternalOrigin = configuredPlaygroundInternalOrigin ??
    `http://${host}:${defaultManagedPlaygroundPort(port)}`;
  const playgroundOrigin = process.env.WORLDKIT_PLAYGROUND_ORIGIN ?? playgroundInternalOrigin;
  const additionalTrustedCapturePublicKeyPaths = [
    path.join(defaultRepoRoot, "config", "trust", "worldkit-cloud-capture-public.pem"),
    ...String(
    process.env.WORLDKIT_CAPTURE_ADDITIONAL_TRUSTED_PUBLIC_KEY_PATHS ?? "",
    ).split(path.delimiter).filter(Boolean),
  ];
  const accessKey = process.env.WORLDKIT_ACCESS_KEY ?? "";
  if (process.env.WORLDKIT_PUBLIC_MODE === "1" && accessKey.length < 16) {
    throw new Error("WORLDKIT_PUBLIC_MODE requires a WORLDKIT_ACCESS_KEY of at least 16 characters.");
  }
  const studio = createStudio({
    dataRoot,
    playgroundOrigin,
    playgroundInternalOrigin,
    additionalTrustedCapturePublicKeyPaths,
    accessKey,
    readinessNonce,
    importExistingArtifacts:
      process.env.WORLDKIT_STUDIO_IMPORT_EXISTING_ARTIFACTS === "1",
  });
  await studio.initialize();
  await new Promise((resolve, reject) => {
    studio.server.once("error", reject);
    studio.server.listen(port, host, resolve);
  });
  console.log(`WorldKit Creator Studio: http://${host}:${port}`);

  let playgroundChild = null;
  if (process.env.WORLDKIT_DISABLE_PLAYGROUND_SPAWN !== "1") {
    const originAvailable = await isOriginAvailable(playgroundInternalOrigin);
    if (managedPlayground && originAvailable) {
      await studio.shutdown();
      throw new Error(
        `WORLDKIT_MANAGED_PLAYGROUND_PORT_COLLISION: ${playgroundInternalOrigin}`,
      );
    }
    if (!originAvailable) {
      const playgroundUrl = new URL(playgroundInternalOrigin);
      if (playgroundUrl.protocol !== "http:" ||
          !["127.0.0.1", "localhost"].includes(playgroundUrl.hostname) ||
          playgroundUrl.port === "") {
        await studio.shutdown();
        throw new Error(
          `WORLDKIT_PLAYGROUND_INTERNAL_ORIGIN is unavailable and cannot be managed locally: ${playgroundInternalOrigin}`,
        );
      }
      playgroundChild = spawn(
        "pnpm",
        [
          "--filter", "@whitebox-world/playground", "dev",
          "--host", host, "--port", playgroundUrl.port, "--strictPort",
        ],
        { cwd: defaultRepoRoot, stdio: "inherit", shell: false },
      );
    }
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
