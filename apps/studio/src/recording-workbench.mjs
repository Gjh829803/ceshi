import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,79}$/;
const RECORDING_ID_PATTERN = /^recording-[0-9]{8}t[0-9]{6}-[a-f0-9]{6}$/;
const MAX_RECORDING_BYTES = 256 * 1024 * 1024;
const RECORDING_WIDTH = 1280;
const RECORDING_HEIGHT = 720;
const RECORDING_FPS = 24;
const ACTIVE_PROMPT_STATUSES = new Set(["queued", "running"]);
const ACTIVE_VIDEO_STATUSES = new Set(["queued", "preparing", "submitted", "running"]);

class RecordingBundleNotReadyError extends Error {}

export const RECORDING_PROMPT_TEMPLATE = `参考素材职责：

@视频1是本视频唯一且严格的运动、镜头和空间调度参考。
严格复现@视频1中的相机路径、镜头速度、焦点变化、起止构图、人物站位、
移动方向、动作时序、关键姿态、遮挡关系和最终落点。

@视频1不提供最终视觉外观。
忽略其中的白膜材质、灰色占位体、简化几何、低模背景、视窗网格、
坐标轴、线框、辅助线、文字和标记。
最终视频中不得出现任何灰模、白模或3D视窗痕迹。

@图片1是主角最终外观的唯一参考。
严格保持其面部、发型、体型、服装、配色、材质和身份一致。
只替换白膜角色的外观，不改变白膜视频规定的动作、位置和时间节奏。

@图片2是最终环境与灯光参考。
保持其中的建筑材质、空间气氛、色调和主光方向，
但空间布局、相机路径和遮挡关系仍以@视频1为准。

最终画面：
[写清地点、时间、天气、地面和墙体材质、主光方向、色温、画面风格]

动作：
动作具有自然重量、惯性、重心转换、衣物滞后和真实接触感。
关键姿态和动作时间严格遵循@视频1，允许补充自然的细微动作和过渡帧，
但不得增加新的主要动作。

摄影：
保持@视频1的镜头轨迹和镜头节奏。
[35mm/50mm]镜头，[手持跟拍/轨道推进/弧形环绕]，
自然运动模糊，稳定空间连续性。
不得自行增加切镜、反打、旋转或额外推拉。

声音：
生成与画面事件严格同步的环境音和动作音效，包括脚步、载具、衣物、风声、
地面接触、碰撞及场景中真实可见声源产生的声音。
不得加入背景音乐、配乐、歌曲、歌声、对白、旁白、解说或任何人类语音。
不得用音乐替代环境音效，不得增加画面中没有声源依据的夸张声音。

限制：
主体身份全程一致；无角色交换；无额外人物；无肢体融合；
无穿模；无漂移；无闪烁；无材质跳变；无灰模残留；
无文字、字幕、Logo、水印、时间码或界面元素。
`;

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

function now() {
  return new Date().toISOString();
}

function createRecordingId(date = new Date()) {
  const stamp = date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").toLowerCase();
  return `recording-${stamp}-${randomBytes(3).toString("hex")}`;
}

function mergeRecord(record, patch) {
  return {
    ...record,
    ...patch,
    source: { ...(record.source ?? {}), ...(patch.source ?? {}) },
    prompt: { ...(record.prompt ?? {}), ...(patch.prompt ?? {}) },
    video: { ...(record.video ?? {}), ...(patch.video ?? {}) },
  };
}

export function deriveRecordingWorkflowStatus(record) {
  if (record?.video?.status === "succeeded") return "ready";
  if (ACTIVE_VIDEO_STATUSES.has(record?.video?.status)) return "video-running";
  if (record?.video?.status === "failed") return "video-failed";
  if (record?.prompt?.status === "succeeded") return "prompt-ready";
  if (ACTIVE_PROMPT_STATUSES.has(record?.prompt?.status)) return "prompt-running";
  if (record?.prompt?.status === "failed") return "prompt-failed";
  return "recorded";
}

export function recordingNormalizationFfmpegArgs(sourcePath, destinationPath, durationSeconds) {
  if (!Number.isSafeInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 120) {
    throw new Error("白膜录屏必须裁剪为 1–120 秒的整数时长。");
  }
  const frameCount = durationSeconds * RECORDING_FPS;
  return [
    "-y",
    "-v", "error",
    "-fflags", "+genpts",
    "-i", sourcePath,
    "-an",
    "-vf", `scale=${RECORDING_WIDTH}:${RECORDING_HEIGHT}:force_original_aspect_ratio=decrease,` +
      `pad=${RECORDING_WIDTH}:${RECORDING_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,` +
      `setsar=1,fps=${RECORDING_FPS}`,
    "-t", String(durationSeconds),
    "-frames:v", String(frameCount),
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-r", String(RECORDING_FPS),
    "-movflags", "+faststart",
    destinationPath,
  ];
}

export function recordingTriviewComparisonFfmpegArgs(
  whiteboxPath,
  styledPath,
  destinationPath,
) {
  const normalizePanel = "scale=1280:720:force_original_aspect_ratio=decrease," +
    "pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0xF2F2F2";
  return [
    "-y",
    "-v", "error",
    "-i", whiteboxPath,
    "-i", styledPath,
    "-filter_complex",
    `[0:v]${normalizePanel}[whitebox];` +
      `[1:v]${normalizePanel}[styled];` +
      "[whitebox][styled]hstack=inputs=2[comparison]",
    "-map", "[comparison]",
    "-frames:v", "1",
    "-pix_fmt", "rgb24",
    "-compression_level", "6",
    destinationPath,
  ];
}

export function buildRecordingPromptInstruction({ sceneId, triViews }) {
  const primary = triViews.find(({ role }) => role === "primary-subject");
  if (!primary) throw new Error("渲染后三视图缺少 primary-subject，无法建立 @图片1。 ");
  const supplements = triViews
    .filter(({ id }) => id !== primary.id)
    .map((target, index) =>
      `- @图片${index + 3}：${target.id}（${target.role || "landmark"}）的完整 Front / Right / Back 外观参考；只约束该完整标识物的身份、轮廓、材质与细节，不改变@视频1的空间布局。`)
    .join("\n");
  return `你是 WorldKit 的 Seedance 2.5 Prompt Synthesis Agent。

为场景 ${sceneId} 生成一份可直接提交给 Seedance 2.5 的中文最终 Prompt，并且只写入 final-prompt.txt。不要输出 Markdown、分析过程、JSON 或备选版本。

附件角色已经固定：
- @视频1：浏览器直接录制的真实白膜游玩视频，是唯一运动、镜头、时序和空间调度权威。
- @图片1：${primary.id} 的渲染后三视图，是主角最终身份、服装、材质和完整外观权威。
- @图片2：最终样式化首帧，是环境、灯光、色调、建筑材质及开场视觉构图权威。
${supplements || "- 没有额外标识物三视图。"}

先逐段理解@视频1的相机路径、速度变化、动作时序、关键姿态和遮挡关系；再观察图片中的最终外观。补全模板内的地点、时间、天气、材质、灯光、色温、镜头焦段与运镜方式。不得改变模板的参考职责，不得增加@视频1不存在的主要动作，不得把白膜外观带入最终画面。

声音必须只包含与画面同步的真实环境音和动作音效；严禁音乐、配乐、歌曲、对白、旁白、解说、人声或语音。

输出必须保留以下模板结构和全部限制，并把方括号占位内容替换成明确、可执行的描述：

${RECORDING_PROMPT_TEMPLATE}

在“@图片2”段落之后加入上述 @图片3 及后续三视图的职责说明。最终只输出完成后的 Prompt 正文。`;
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function fileExists(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, filePath);
}

async function writeRecordingBody(request, destination, maximumBytes = MAX_RECORDING_BYTES) {
  const temporary = `${destination}.${process.pid}.${randomBytes(3).toString("hex")}.upload`;
  const handle = await open(temporary, "wx");
  const digest = createHash("sha256");
  let sizeBytes = 0;
  let signature = Buffer.alloc(0);
  try {
    for await (const rawChunk of request) {
      const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
      sizeBytes += chunk.length;
      if (sizeBytes > maximumBytes) throw new Error("单段录屏不能超过 256 MB。");
      if (signature.length < 16) signature = Buffer.concat([signature, chunk]).subarray(0, 16);
      digest.update(chunk);
      await handle.write(chunk);
    }
    if (sizeBytes === 0) throw new Error("录屏内容为空。");
    await handle.close();
    await rename(temporary, destination);
    return { sizeBytes, contentSha256: digest.digest("hex"), signature };
  } catch (error) {
    await handle.close().catch(() => undefined);
    await rm(temporary, { force: true });
    throw error;
  }
}

function validVideoSignature(signature, extension) {
  if (extension === "webm") return signature.subarray(0, 4).toString("hex") === "1a45dfa3";
  return signature.length >= 12 && signature.subarray(4, 8).toString("ascii") === "ftyp";
}

function tail(value, maximum = 12_000) {
  const text = String(value ?? "").trim();
  return text.length <= maximum ? text : text.slice(-maximum);
}

function runChild(command, args, { cwd, env, spawnImplementation = spawn, onSpawn } = {}) {
  return new Promise((resolve) => {
    const child = spawnImplementation(command, args, {
      cwd,
      env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    onSpawn?.(child);
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout = tail(`${stdout}${chunk}`, 100_000); });
    child.stderr?.on("data", (chunk) => { stderr = tail(`${stderr}${chunk}`, 100_000); });
    child.once("error", (error) => resolve({ child, code: -1, error, stdout, stderr }));
    child.once("close", (code, signal) => resolve({ child, code: code ?? -1, signal, stdout, stderr }));
  });
}

function mimeTypeFor(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".mp4": return "video/mp4";
    case ".webm": return "video/webm";
    case ".png": return "image/png";
    case ".txt": return "text/plain; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".zip": return "application/zip";
    default: return "application/octet-stream";
  }
}

async function serveFile(request, response, filePath, { downloadName = null } = {}) {
  const metadata = await stat(filePath);
  const headers = {
    "content-type": mimeTypeFor(filePath),
    "cache-control": "private, no-store",
    "accept-ranges": "bytes",
  };
  if (downloadName) headers["content-disposition"] = `attachment; filename="${downloadName.replaceAll('"', "")}"`;
  const range = request.headers.range;
  if (range && /^bytes=[0-9]*-[0-9]*$/.test(range)) {
    const [rawStart, rawEnd] = range.slice(6).split("-");
    const start = rawStart === "" ? Math.max(0, metadata.size - Number(rawEnd || 0)) : Number(rawStart);
    const end = rawStart === "" ? metadata.size - 1 : Math.min(metadata.size - 1, rawEnd === "" ? metadata.size - 1 : Number(rawEnd));
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) {
      response.writeHead(416, { "content-range": `bytes */${metadata.size}` });
      response.end();
      return;
    }
    response.writeHead(206, {
      ...headers,
      "content-range": `bytes ${start}-${end}/${metadata.size}`,
      "content-length": end - start + 1,
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(filePath, { start, end }).pipe(response);
    return;
  }
  response.writeHead(200, { ...headers, "content-length": metadata.size });
  if (request.method === "HEAD") response.end();
  else createReadStream(filePath).pipe(response);
}

export function createRecordingWorkbenchService(options = {}) {
  const repoRoot = path.resolve(options.repoRoot);
  const dataRoot = path.resolve(options.dataRoot);
  const recordingsRoot = path.join(dataRoot, "recordings");
  const maxConcurrentJobs = Math.max(1, Math.min(4, Number(
    options.maxConcurrentJobs ?? process.env.WORLDKIT_RECORDING_MAX_CONCURRENT_JOBS ?? 2,
  ) || 2));
  const autoRunJobs = options.autoRunJobs ?? true;
  const spawnImplementation = options.spawnImplementation ?? spawn;
  const codexBackendProvider = options.codexBackendProvider ?? (() => "cloud");
  const generationRunner = options.generationRunner;
  const transcodeRecording = options.transcodeRecording;
  const composeTriviewComparison = options.composeTriviewComparison;
  const queue = [];
  const activeJobs = new Map();
  const activeChildren = new Map();
  let shuttingDown = false;

  function resolveCodexBackend() {
    const backend = codexBackendProvider();
    if (backend !== "cloud" && backend !== "local") {
      throw new Error(`Unsupported Codex backend: ${String(backend)}`);
    }
    return backend;
  }

  const sceneRoot = (sceneId) => path.join(recordingsRoot, sceneId);
  const recordingRoot = (sceneId, recordingId) => path.join(sceneRoot(sceneId), recordingId);
  const recordPath = (sceneId, recordingId) => path.join(recordingRoot(sceneId, recordingId), "record.json");

  async function runTrackedChild(stage, sceneId, recordingId, command, args, runOptions = {}) {
    const key = `${sceneId}:${recordingId}:${stage}`;
    try {
      return await runChild(command, args, {
        ...runOptions,
        spawnImplementation,
        onSpawn: (child) => activeChildren.set(key, child),
      });
    } finally {
      activeChildren.delete(key);
    }
  }

  async function normalizeRecordingVideo(sceneId, recordingId, sourcePath, extension, durationSeconds) {
    const destinationPath = path.join(recordingRoot(sceneId, recordingId), "whitebox-recording.mp4");
    let injectedMedia = null;
    if (typeof transcodeRecording === "function") {
      injectedMedia = await transcodeRecording({
        sourcePath, destinationPath, sceneId, recordingId, durationSeconds,
      });
    } else {
      const result = await runTrackedChild(
        "recording-normalize",
        sceneId,
        recordingId,
        "ffmpeg",
        recordingNormalizationFfmpegArgs(sourcePath, destinationPath, durationSeconds),
        { cwd: repoRoot, env: process.env },
      );
      if (result.code !== 0) {
        throw new Error(tail(result.stderr || result.stdout || "录屏 MP4 规范化失败。"));
      }
    }
    if (!await fileExists(destinationPath) || (await stat(destinationPath)).size === 0) {
      throw new Error("录屏 MP4 规范化没有生成有效文件。");
    }
    let media = injectedMedia;
    if (media === null || typeof media !== "object") {
      const probe = await runTrackedChild(
        "recording-probe",
        sceneId,
        recordingId,
        "ffprobe",
        [
          "-v", "error", "-count_frames", "-select_streams", "v:0",
          "-show_entries", "stream=width,height,avg_frame_rate,nb_read_frames,nb_frames",
          "-show_entries", "format=duration", "-of", "json", destinationPath,
        ],
        { cwd: repoRoot, env: process.env },
      );
      if (probe.code !== 0) throw new Error(tail(probe.stderr || "无法检查规范化白膜视频。"));
      const body = JSON.parse(probe.stdout);
      const stream = body.streams?.[0] ?? {};
      const [numerator, denominator = "1"] = String(stream.avg_frame_rate ?? "0/1").split("/");
      media = {
        width: Number(stream.width),
        height: Number(stream.height),
        fps: Number(numerator) / Number(denominator),
        frameCount: Number(stream.nb_read_frames ?? stream.nb_frames),
        durationSeconds: Number(body.format?.duration),
      };
    }
    const expectedFrames = durationSeconds * RECORDING_FPS;
    if (
      media.width !== RECORDING_WIDTH || media.height !== RECORDING_HEIGHT ||
      media.fps !== RECORDING_FPS || media.frameCount !== expectedFrames
    ) {
      throw new Error(
        `白膜录屏规格不合格：${media.width}x${media.height} ${media.fps}fps ` +
        `${media.frameCount}帧；要求 ${RECORDING_WIDTH}x${RECORDING_HEIGHT} ` +
        `${RECORDING_FPS}fps ${expectedFrames}帧。`,
      );
    }
    return {
      fileName: path.basename(destinationPath),
      extension: "mp4",
      mimeType: "video/mp4",
      normalizedFrom: path.basename(sourcePath),
      media,
    };
  }

  async function sceneAvailable(sceneId) {
    return ID_PATTERN.test(sceneId) && await fileExists(
      path.join(repoRoot, "artifacts", "scenes", sceneId, "authoring.json"),
    );
  }

  async function readRecord(sceneId, recordingId) {
    if (!ID_PATTERN.test(sceneId) || !RECORDING_ID_PATTERN.test(recordingId)) return null;
    return readJson(recordPath(sceneId, recordingId));
  }

  async function updateRecord(sceneId, recordingId, patch) {
    const current = await readRecord(sceneId, recordingId);
    if (!current) return null;
    const next = mergeRecord(current, { ...patch, updatedAt: now() });
    await writeJsonAtomic(recordPath(sceneId, recordingId), next);
    return next;
  }

  async function resolveSceneAssets(sceneId) {
    const artifactRoot = path.join(repoRoot, "artifacts", "scenes", sceneId);
    const worldPlanPath = path.join(
      repoRoot, "apps", "playground", "public", "scene-plans", sceneId, "world-plan.png",
    );
    const openingFramePath = path.join(artifactRoot, "styled-opening-frame.png");
    const manifest = await readJson(path.join(artifactRoot, "styled-triviews-manifest.json"));
    const declaredTargets = Array.isArray(manifest?.targets) ? manifest.targets : [];
    const triViews = [];
    const unresolvedVisualTargetIds = [];
    const seenVisualTargetIds = new Set();
    for (const [index, target] of declaredTargets.entries()) {
      const visualTargetId = ID_PATTERN.test(target?.visualTargetId)
        ? target.visualTargetId
        : `manifest-target-${index + 1}`;
      if (!ID_PATTERN.test(target?.visualTargetId) || seenVisualTargetIds.has(target.visualTargetId)) {
        unresolvedVisualTargetIds.push(visualTargetId);
        continue;
      }
      seenVisualTargetIds.add(target.visualTargetId);
      const relativePath = target?.styledTriview?.path;
      if (typeof relativePath !== "string" || relativePath.includes("..") || path.isAbsolute(relativePath)) {
        unresolvedVisualTargetIds.push(target.visualTargetId);
        continue;
      }
      const styledPath = path.resolve(artifactRoot, relativePath);
      if (!styledPath.startsWith(`${artifactRoot}${path.sep}`) || !await fileExists(styledPath)) {
        unresolvedVisualTargetIds.push(target.visualTargetId);
        continue;
      }
      const whiteboxPath = path.join(
        artifactRoot,
        "triviews",
        target.visualTargetId,
        "whitebox-triview.png",
      );
      triViews.push({
        visualTargetId: target.visualTargetId,
        role: target.role ?? "landmark",
        semanticClassId: target.semanticClassId ?? null,
        styledPath,
        whiteboxPath: await fileExists(whiteboxPath) ? whiteboxPath : null,
      });
    }
    triViews.sort((left, right) => {
      const rank = (value) => value === "primary-subject" ? 0 : value === "primary-landmark" ? 1 : 2;
      return rank(left.role) - rank(right.role) || left.visualTargetId.localeCompare(right.visualTargetId);
    });
    const openingFrameReady = await fileExists(openingFramePath);
    const worldPlanReady = await fileExists(worldPlanPath);
    const ready = openingFrameReady && triViews.some(({ role, whiteboxPath }) =>
      role === "primary-subject" && whiteboxPath !== null);
    const bundleReady = ready && worldPlanReady && declaredTargets.length > 0 &&
      unresolvedVisualTargetIds.length === 0 &&
      triViews.length === declaredTargets.length &&
      triViews.every(({ whiteboxPath }) => whiteboxPath !== null);
    return {
      ready,
      bundleReady,
      openingFramePath,
      worldPlanPath,
      worldPlanReady,
      triViews,
      unresolvedTargetIds: unresolvedVisualTargetIds,
    };
  }

  async function enrichRecord(record) {
    const assets = await resolveSceneAssets(record.sceneId);
    const liveResult = ACTIVE_VIDEO_STATUSES.has(record.video?.status)
      ? await readJson(path.join(recordingRoot(record.sceneId, record.id), "seedance-result.json"))
      : null;
    const current = liveResult
      ? mergeRecord(record, {
          video: {
            taskId: liveResult.taskId ?? record.video?.taskId ?? null,
            providerStatus: liveResult.status ?? record.video?.providerStatus ?? null,
          },
        })
      : record;
    return {
      ...current,
      workflowStatus: deriveRecordingWorkflowStatus(current),
      sourceUrl: `/api/recording-worlds/${record.sceneId}/recordings/${record.id}/source`,
      promptTemplateUrl: `/api/recording-worlds/${record.sceneId}/recordings/${record.id}/prompt-template`,
      promptUrl: await fileExists(path.join(recordingRoot(record.sceneId, record.id), "final-prompt.txt"))
        ? `/api/recording-worlds/${record.sceneId}/recordings/${record.id}/prompt`
        : null,
      generatedVideoUrl: await fileExists(path.join(recordingRoot(record.sceneId, record.id), "seedance25.mp4"))
        ? `/api/recording-worlds/${record.sceneId}/recordings/${record.id}/generated`
        : null,
      bundleUrl: assets.bundleReady
        ? `/api/recording-worlds/${record.sceneId}/recordings/${record.id}/bundle`
        : null,
      assets: {
        ready: assets.ready,
        bundleReady: assets.bundleReady,
        styledOpeningFrameUrl: await fileExists(assets.openingFramePath)
          ? `/api/worlds/${record.sceneId}/deliverables/styled-opening-frame`
          : null,
        styledTriviews: assets.triViews.map((target) => ({
          id: target.id,
          role: target.role,
          semanticClassId: target.semanticClassId,
          whiteboxUrl: target.whiteboxPath === null
            ? null
            : `/api/worlds/${record.sceneId}/triviews/${target.id}`,
          url: `/api/worlds/${record.sceneId}/styled-triviews/${target.id}`,
        })),
      },
    };
  }

  async function listRecordings(sceneId) {
    let entries = [];
    try { entries = await readdir(sceneRoot(sceneId), { withFileTypes: true }); } catch {}
    const records = (await Promise.all(entries
      .filter((entry) => entry.isDirectory() && RECORDING_ID_PATTERN.test(entry.name))
      .map((entry) => readRecord(sceneId, entry.name))))
      .filter(Boolean)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return Promise.all(records.map(enrichRecord));
  }

  async function runDefaultGeneration(sceneId, recordingId, frozenCodexBackend = null) {
    let record = await readRecord(sceneId, recordingId);
    if (!record) throw new Error("录屏记录不存在。");
    const root = recordingRoot(sceneId, recordingId);
    const assets = await resolveSceneAssets(sceneId);
    if (!assets.ready) throw new Error("最终样式化首帧或主角渲染后三视图尚未准备完成。");
    const primary = assets.triViews.find(({ role }) => role === "primary-subject");
    const remaining = assets.triViews.filter(({ id }) => id !== primary.id);
    const referenceImages = [
      primary.styledPath,
      assets.openingFramePath,
      ...remaining.map(({ styledPath }) => styledPath),
    ];
    const finalPromptPath = path.join(root, "final-prompt.txt");

    if (record.prompt?.status !== "succeeded" || !await fileExists(finalPromptPath)) {
      const codexBackend = frozenCodexBackend ?? record.prompt?.backend ?? resolveCodexBackend();
      const instructionPath = path.join(root, "prompt-instruction.txt");
      await writeFile(
        instructionPath,
        `${buildRecordingPromptInstruction({ sceneId, triViews: assets.triViews })}\n`,
        "utf8",
      );
      record = await updateRecord(sceneId, recordingId, {
        prompt: {
          status: "running",
          backend: codexBackend,
          jobId: null,
          taskId: null,
          startedAt: now(),
          finishedAt: null,
          error: null,
        },
        video: { status: "waiting-for-prompt", error: null },
        error: null,
      });
      const cloudRoot = String(
        process.env.WORLDKIT_LWDP_S3_ROOT ||
        "s3://leap-world-us-east-2/world-model/platform/agent-whitebox-world-sdk",
      ).replace(/\/$/, "");
      const cloudPrefix = `${cloudRoot}/${sceneId}/recording-workbench/${recordingId}/prompt`;
      const taskId = `prompt-${recordingId}`;
      const sourcePath = path.join(root, record.source.fileName);
      const args = [
        path.join(repoRoot, "scripts", "agents", "run-codex-task.mjs"),
        "--backend", codexBackend,
        "--repo-root", repoRoot,
        "--task-id", taskId,
        "--stage", "recording-prompt",
        "--job-name", `WorldKit Recording Prompt · ${sceneId}`,
        "--request-id", `${sceneId}-${recordingId}-prompt`,
        "--output-s3-prefix", cloudPrefix,
        "--instruction-file", instructionPath,
        "--submit-attempts", "1",
        "--asset", `video-1-motion::${sourcePath}::video::${record.source.mimeType}`,
      ];
      referenceImages.forEach((imagePath, index) => {
        args.push("--asset", `image-${index + 1}::${imagePath}::image::image/png`);
      });
      args.push("--output", `final-prompt.txt::${finalPromptPath}::text/plain`);
      const result = await runTrackedChild("prompt", sceneId, recordingId, process.execPath, args, {
        cwd: repoRoot,
        env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
      });
      if (result.code !== 0 || !await fileExists(finalPromptPath)) {
        const reason = tail(result.stderr || result.stdout || result.error?.message || `Codex exited ${result.code}`);
        await updateRecord(sceneId, recordingId, {
          prompt: { status: "failed", finishedAt: now(), error: reason },
          video: { status: "blocked", error: "最终 Prompt 未生成。" },
          error: reason,
        });
        return;
      }
      const cloudMarker = /WORLDKIT_LWDP_JOB\s+\S+\s+(\S+)\s+(gen_[a-z0-9]+)/.exec(result.stdout);
      const localMarker = /WORLDKIT_LOCAL_CODEX_JOB\s+\S+\s+(\S+)\s+pid=/.exec(result.stdout);
      const completedTaskId = codexBackend === "cloud"
        ? cloudMarker?.[1] ?? null
        : localMarker?.[1] ?? null;
      const jobId = codexBackend === "cloud" ? cloudMarker?.[2] ?? null : null;
      record = await updateRecord(sceneId, recordingId, {
        prompt: {
          status: "succeeded",
          backend: codexBackend,
          taskId: completedTaskId,
          jobId,
          finishedAt: now(),
          error: null,
        },
      });
    }

    const seedanceRequestPath = path.join(root, "seedance-request.json");
    const seedanceResultPath = path.join(root, "seedance-result.json");
    const generatedPath = path.join(root, "seedance25.mp4");
    await writeJsonAtomic(seedanceRequestPath, {
      kind: "worldkit-seedance25-reference-video-request",
      schemaVersion: 1,
      sceneId,
      recordingId,
      promptPath: finalPromptPath,
      referenceVideoPath: path.join(root, record.source.fileName),
      durationSeconds: record.source.durationSeconds ?? Math.floor(record.source.durationMs / 1_000),
      frameRate: record.source.fps ?? RECORDING_FPS,
      frameCount: record.source.frameCount ??
        Math.floor(record.source.durationMs / 1_000) * RECORDING_FPS,
      width: record.source.width ?? RECORDING_WIDTH,
      height: record.source.height ?? RECORDING_HEIGHT,
      requireAudio: true,
      referenceImagePaths: referenceImages,
      outputPath: generatedPath,
    });
    await updateRecord(sceneId, recordingId, {
      video: {
        status: "running",
        providerStatus: "preparing-references",
        startedAt: now(),
        finishedAt: null,
        taskId: null,
        error: null,
      },
      error: null,
    });
    const python = process.env.WORLDKIT_SEEDANCE_PYTHON || "python3";
    const result = await runTrackedChild("seedance25", sceneId, recordingId, python, [
      path.join(repoRoot, "scripts", "visual", "run-seedance25-reference-video.py"),
      "--request", seedanceRequestPath,
      "--result", seedanceResultPath,
    ], {
      cwd: repoRoot,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });
    const runRecord = await readJson(seedanceResultPath);
    if (result.code !== 0 || !await fileExists(generatedPath) || runRecord?.status !== "succeeded") {
      const reason = runRecord?.error || tail(result.stderr || result.stdout || result.error?.message || `Seedance exited ${result.code}`);
      await updateRecord(sceneId, recordingId, {
        video: {
          status: "failed",
          providerStatus: runRecord?.status ?? "failed",
          taskId: runRecord?.taskId ?? null,
          finishedAt: now(),
          error: reason,
        },
        error: reason,
      });
      return;
    }
    await updateRecord(sceneId, recordingId, {
      video: {
        status: "succeeded",
        providerStatus: "succeeded",
        taskId: runRecord.taskId ?? null,
        model: runRecord.resolvedModel ?? "doubao-seedance-2-5-260628",
        media: runRecord.output?.media ?? null,
        finishedAt: now(),
        error: null,
      },
      error: null,
    });
  }

  async function runGeneration(sceneId, recordingId, frozenCodexBackend = null) {
    if (typeof generationRunner === "function") {
      await generationRunner({
        sceneId,
        recordingId,
        codexBackend: frozenCodexBackend,
        root: recordingRoot(sceneId, recordingId),
        readRecord: () => readRecord(sceneId, recordingId),
        updateRecord: (patch) => updateRecord(sceneId, recordingId, patch),
        resolveSceneAssets: () => resolveSceneAssets(sceneId),
      });
      return;
    }
    await runDefaultGeneration(sceneId, recordingId, frozenCodexBackend);
  }

  function pumpQueue() {
    if (!autoRunJobs || shuttingDown) return;
    while (activeJobs.size < maxConcurrentJobs) {
      const item = queue.shift();
      if (!item) return;
      const key = `${item.sceneId}:${item.recordingId}`;
      if (activeJobs.has(key)) continue;
      const task = Promise.resolve()
        .then(() => runGeneration(item.sceneId, item.recordingId, item.codexBackend))
        .catch(async (error) => {
          await updateRecord(item.sceneId, item.recordingId, {
            video: { status: "failed", finishedAt: now(), error: error instanceof Error ? error.message : String(error) },
            error: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          activeJobs.delete(key);
          pumpQueue();
        });
      activeJobs.set(key, task);
    }
  }

  function enqueue(sceneId, recordingId, codexBackend = null) {
    const key = `${sceneId}:${recordingId}`;
    if (!activeJobs.has(key) && !queue.some((item) => `${item.sceneId}:${item.recordingId}` === key)) {
      queue.push({ sceneId, recordingId, codexBackend });
    }
    pumpQueue();
  }

  async function prepareBundle(sceneId, recordingId, record) {
    const assets = await resolveSceneAssets(sceneId);
    const temporaryRoot = await mkdtemp(path.join(recordingRoot(sceneId, recordingId), ".bundle-"));
    const folderName = `${sceneId}-${recordingId}`;
    const folder = path.join(temporaryRoot, folderName);
    try {
      await mkdir(folder, { recursive: true });
      if (!assets.worldPlanReady) {
        throw new RecordingBundleNotReadyError("下载包缺少 Planner 生成的 world-plan.png。");
      }
      if (!assets.bundleReady) {
        const unresolved = assets.unresolvedTargetIds.length > 0
          ? `：${assets.unresolvedTargetIds.join(", ")}`
          : "";
        throw new RecordingBundleNotReadyError(
          `下载包所需的完整首帧和成对白膜/渲染三视图尚未准备完成${unresolved}`,
        );
      }
      const missingWhiteboxTargets = assets.triViews
        .filter(({ whiteboxPath }) => whiteboxPath === null)
        .map(({ visualTargetId }) => visualTargetId);
      if (missingWhiteboxTargets.length > 0) {
        throw new Error(`下载包缺少白膜三视图：${missingWhiteboxTargets.join(", ")}`);
      }
      const bundleTriviews = assets.triViews.map((target, index) => {
        const number = String(index + 1).padStart(2, "0");
        return {
          index: index + 1,
          visualTargetId: target.visualTargetId,
          role: target.role,
          semanticClassId: target.semanticClassId,
          layout: "whitebox-left-styled-right",
          whiteboxFile: `triview-${number}-whitebox.png`,
          styledFile: `triview-${number}-styled.png`,
          comparisonFile: `triview-${number}-comparison.png`,
          whiteboxPath: target.whiteboxPath,
          styledPath: target.styledPath,
        };
      });
      const copies = [
        [assets.worldPlanPath, "world-plan.png"],
        [path.join(recordingRoot(sceneId, recordingId), record.source.fileName), `whitebox-recording.${record.source.extension}`],
        ...(record.source.originalFileName ? [[
          path.join(recordingRoot(sceneId, recordingId), record.source.originalFileName),
          `whitebox-recording-original.${record.source.originalExtension || "webm"}`,
        ]] : []),
        [path.join(recordingRoot(sceneId, recordingId), "prompt-template.txt"), "prompt-template.txt"],
        [path.join(recordingRoot(sceneId, recordingId), "final-prompt.txt"), "final-prompt.txt"],
        [path.join(recordingRoot(sceneId, recordingId), "seedance25.mp4"), "seedance25-generated.mp4"],
        [path.join(recordingRoot(sceneId, recordingId), "seedance-result.json"), "seedance25-run.json"],
        [assets.openingFramePath, "styled-opening-frame.png"],
        ...bundleTriviews.flatMap((target) => [
          [target.whiteboxPath, target.whiteboxFile],
          [target.styledPath, target.styledFile],
        ]),
      ];
      for (const [source, name] of copies) {
        if (await fileExists(source)) await copyFile(source, path.join(folder, name));
      }
      for (const target of bundleTriviews) {
        const destinationPath = path.join(folder, target.comparisonFile);
        if (typeof composeTriviewComparison === "function") {
          await composeTriviewComparison({
            whiteboxPath: target.whiteboxPath,
            styledPath: target.styledPath,
            destinationPath,
            sceneId,
            recordingId,
            visualTargetId: target.visualTargetId,
          });
        } else {
          const result = await runTrackedChild(
            `bundle-triview-${target.index}`,
            sceneId,
            recordingId,
            "ffmpeg",
            recordingTriviewComparisonFfmpegArgs(
              target.whiteboxPath,
              target.styledPath,
              destinationPath,
            ),
            { cwd: repoRoot, env: process.env },
          );
          if (result.code !== 0) {
            throw new Error(tail(result.stderr || result.stdout || "三视图对照图拼接失败。"));
          }
        }
        if (!await fileExists(destinationPath) || (await stat(destinationPath)).size === 0) {
          throw new Error(`三视图对照图没有生成：${target.visualTargetId}`);
        }
      }
      await writeJsonAtomic(path.join(folder, "recording-manifest.json"), {
        ...record,
        prompt: { ...record.prompt, error: record.prompt?.error ? "See local status; excluded from portable bundle." : null },
        video: { ...record.video, error: record.video?.error ? "See local status; excluded from portable bundle." : null },
        portableBundle: {
          schemaVersion: 1,
          worldPlan: {
            file: "world-plan.png",
            role: "planner-navigation-layout",
          },
          triviewComparisonLayout: "whitebox-left-styled-right",
          triviewPanelSizePixels: [1280, 720],
          triviewComparisonSizePixels: [2560, 720],
          triviews: bundleTriviews.map(({ whiteboxPath, styledPath, ...target }) => target),
        },
      });
      const zipPath = path.join(temporaryRoot, `${folderName}.zip`);
      const result = await runChild("/usr/bin/zip", ["-q", "-r", path.basename(zipPath), folderName], {
        cwd: temporaryRoot,
        env: process.env,
        spawnImplementation,
      });
      if (result.code !== 0 || !await fileExists(zipPath)) {
        throw new Error(tail(result.stderr || "无法创建下载包。"));
      }
      return { temporaryRoot, zipPath, fileName: `${folderName}.zip` };
    } catch (error) {
      await rm(temporaryRoot, { recursive: true, force: true });
      throw error;
    }
  }

  async function initialize() {
    await mkdir(recordingsRoot, { recursive: true });
    let scenes = [];
    try { scenes = await readdir(recordingsRoot, { withFileTypes: true }); } catch {}
    for (const scene of scenes.filter((entry) => entry.isDirectory() && ID_PATTERN.test(entry.name))) {
      const records = await listRecordings(scene.name);
      for (const record of records) {
        if (record.source?.extension === "webm") {
          const root = recordingRoot(scene.name, record.id);
          const originalPath = path.join(root, record.source.fileName);
          try {
            const normalized = await normalizeRecordingVideo(
              scene.name,
              record.id,
              originalPath,
              "webm",
            );
            const normalizedMetadata = await stat(path.join(root, normalized.fileName));
            await updateRecord(scene.name, record.id, {
              source: {
                ...normalized,
                originalFileName: record.source.fileName,
                originalExtension: "webm",
                originalSizeBytes: record.source.sizeBytes,
                sizeBytes: normalizedMetadata.size,
              },
            });
          } catch (error) {
            await updateRecord(scene.name, record.id, {
              error: `录屏 MP4 规范化失败：${error instanceof Error ? error.message : String(error)}`,
            });
          }
        }
        if (ACTIVE_PROMPT_STATUSES.has(record.prompt?.status) || ACTIVE_VIDEO_STATUSES.has(record.video?.status)) {
          await updateRecord(scene.name, record.id, {
            prompt: ACTIVE_PROMPT_STATUSES.has(record.prompt?.status)
              ? { status: "failed", finishedAt: now(), error: "服务重启中断了 Prompt 生成，请重试。" }
              : {},
            video: ACTIVE_VIDEO_STATUSES.has(record.video?.status)
              ? { status: "failed", finishedAt: now(), error: "服务重启中断了视频生成，请重试。" }
              : {},
            error: "录制生成服务重启，任务已保留并可重试。",
          });
        }
      }
    }
  }

  async function handleApi(request, response, url) {
    const collection = /^\/api\/recording-worlds\/([a-z0-9-]+)\/recordings$/.exec(url.pathname);
    if (collection && request.method === "GET") {
      const sceneId = collection[1];
      if (!await sceneAvailable(sceneId)) {
        sendError(response, 404, "没有找到可录制的 Canonical 世界。");
        return true;
      }
      sendJson(response, 200, {
        sceneId,
        recordings: await listRecordings(sceneId),
        activeJobs: [...activeJobs.keys()].filter((key) => key.startsWith(`${sceneId}:`)).length,
        maxConcurrentJobs,
      });
      return true;
    }

    if (collection && request.method === "POST") {
      const sceneId = collection[1];
      if (!await sceneAvailable(sceneId)) {
        sendError(response, 404, "没有找到可录制的 Canonical 世界。");
        return true;
      }
      const contentType = String(request.headers["content-type"] || "").split(";", 1)[0].trim();
      const extension = contentType === "video/mp4" ? "mp4" : contentType === "video/webm" ? "webm" : null;
      if (!extension) {
        sendError(response, 415, "仅支持浏览器生成的 MP4 或 WebM 录屏。");
        return true;
      }
      const durationMs = Number(request.headers["x-worldkit-recording-duration-ms"]);
      if (!Number.isFinite(durationMs) || durationMs < 1_000 || durationMs > 120_999) {
        sendError(response, 400, "录屏时长必须至少 1 秒且不超过 120 秒。");
        return true;
      }
      const durationSeconds = Math.floor(durationMs / 1_000);
      const recordingId = createRecordingId();
      const root = recordingRoot(sceneId, recordingId);
      await mkdir(sceneRoot(sceneId), { recursive: true });
      await mkdir(root, { recursive: false });
      const fileName = `whitebox-recording.original.${extension}`;
      try {
        const uploaded = await writeRecordingBody(request, path.join(root, fileName));
        if (!validVideoSignature(uploaded.signature, extension)) {
          throw new Error("录屏内容与声明的视频格式不匹配。");
        }
        const normalized = await normalizeRecordingVideo(
          sceneId,
          recordingId,
          path.join(root, fileName),
          extension,
          durationSeconds,
        );
        const normalizedMetadata = await stat(path.join(root, normalized.fileName));
        const timestamp = now();
        const record = {
          kind: "worldkit-playground-recording",
          schemaVersion: 1,
          id: recordingId,
          sceneId,
          title: `录制 ${timestamp.slice(11, 19)}`,
          createdAt: timestamp,
          updatedAt: timestamp,
          source: {
            fileName: normalized.fileName,
            extension: normalized.extension,
            mimeType: normalized.mimeType,
            normalizedFrom: normalized.normalizedFrom,
            sizeBytes: normalizedMetadata.size,
            durationMs: durationSeconds * 1_000,
            durationSeconds,
            width: normalized.media.width,
            height: normalized.media.height,
            fps: normalized.media.fps,
            frameCount: normalized.media.frameCount,
            contentSha256: createHash("sha256")
              .update(await readFile(path.join(root, normalized.fileName)))
              .digest("hex"),
            originalFileName: normalized.normalizedFrom,
            originalExtension: extension,
            originalSizeBytes: uploaded.sizeBytes,
            originalContentSha256: uploaded.contentSha256,
          },
          prompt: {
            status: "not-started",
            jobId: null,
            startedAt: null,
            finishedAt: null,
            error: null,
          },
          video: {
            status: "not-started",
            provider: "Volcengine Ark",
            model: "doubao-seedance-2-5-260628",
            taskId: null,
            providerStatus: null,
            media: null,
            startedAt: null,
            finishedAt: null,
            error: null,
          },
          error: null,
        };
        await writeFile(path.join(root, "prompt-template.txt"), RECORDING_PROMPT_TEMPLATE, "utf8");
        await writeJsonAtomic(recordPath(sceneId, recordingId), record);
        sendJson(response, 201, { recording: await enrichRecord(record) });
      } catch (error) {
        await rm(root, { recursive: true, force: true });
        sendError(response, 400, error);
      }
      return true;
    }

    const generate = /^\/api\/recording-worlds\/([a-z0-9-]+)\/recordings\/(recording-[a-z0-9-]+)\/generate$/.exec(url.pathname);
    if (generate && request.method === "POST") {
      const [, sceneId, recordingId] = generate;
      const record = await readRecord(sceneId, recordingId);
      if (!record) {
        sendError(response, 404, "录屏记录不存在。");
        return true;
      }
      const key = `${sceneId}:${recordingId}`;
      const alreadyScheduled = activeJobs.has(key) ||
        queue.some((item) => `${item.sceneId}:${item.recordingId}` === key);
      if (!alreadyScheduled) {
        const assets = await resolveSceneAssets(sceneId);
        if (!assets.ready) {
          sendError(response, 409, "最终样式化首帧或主角渲染后三视图尚未生成。");
          return true;
        }
        const promptReady = record.prompt?.status === "succeeded" && await fileExists(
          path.join(recordingRoot(sceneId, recordingId), "final-prompt.txt"),
        );
        const selectedCodexBackend = resolveCodexBackend();
        const existingPromptBackend = record.prompt?.backend === "local" ? "local" : "cloud";
        const promptMatchesSelection = promptReady && existingPromptBackend === selectedCodexBackend;
        const codexBackend = promptMatchesSelection ? null : selectedCodexBackend;
        await updateRecord(sceneId, recordingId, {
          prompt: promptMatchesSelection
            ? { status: "succeeded", error: null }
            : {
                status: "queued",
                backend: codexBackend,
                jobId: null,
                taskId: null,
                startedAt: null,
                finishedAt: null,
                error: null,
              },
          video: { status: "queued", providerStatus: null, startedAt: null, finishedAt: null, error: null },
          error: null,
        });
        enqueue(sceneId, recordingId, codexBackend);
      }
      sendJson(response, 202, { recording: await enrichRecord(await readRecord(sceneId, recordingId)) });
      return true;
    }

    const media = /^\/api\/recording-worlds\/([a-z0-9-]+)\/recordings\/(recording-[a-z0-9-]+)\/(source|generated|prompt|prompt-template|bundle)$/.exec(url.pathname);
    if (media && ["GET", "HEAD"].includes(request.method)) {
      const [, sceneId, recordingId, kind] = media;
      const record = await readRecord(sceneId, recordingId);
      if (!record) {
        sendError(response, 404, "录屏记录不存在。");
        return true;
      }
      if (kind === "bundle") {
        if (request.method === "HEAD") {
          response.writeHead(405);
          response.end();
          return true;
        }
        try {
          const bundle = await prepareBundle(sceneId, recordingId, record);
          response.once("close", () => void rm(bundle.temporaryRoot, { recursive: true, force: true }));
          await serveFile(request, response, bundle.zipPath, { downloadName: bundle.fileName });
        } catch (error) {
          sendError(response, error instanceof RecordingBundleNotReadyError ? 409 : 500, error);
        }
        return true;
      }
      const filePath = kind === "source"
        ? path.join(recordingRoot(sceneId, recordingId), record.source.fileName)
        : kind === "generated"
          ? path.join(recordingRoot(sceneId, recordingId), "seedance25.mp4")
          : kind === "prompt"
            ? path.join(recordingRoot(sceneId, recordingId), "final-prompt.txt")
            : path.join(recordingRoot(sceneId, recordingId), "prompt-template.txt");
      if (!await fileExists(filePath)) {
        sendError(response, 404, "请求的录制工件尚未生成。");
        return true;
      }
      const downloadName = url.searchParams.get("download") === "1"
        ? path.basename(filePath)
        : null;
      await serveFile(request, response, filePath, { downloadName });
      return true;
    }
    return false;
  }

  async function shutdown() {
    shuttingDown = true;
    queue.length = 0;
    for (const child of activeChildren.values()) {
      if (!child.killed) child.kill("SIGTERM");
    }
    await Promise.allSettled([...activeJobs.values()]);
  }

  return {
    handleApi,
    initialize,
    shutdown,
    listRecordings,
    get activeJobs() { return [...activeJobs.keys()]; },
    maxConcurrentJobs,
  };
}
