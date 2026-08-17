import { spawn, spawnSync } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  appendFile,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { createServer, request as createHttpRequest } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const studioRoot = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(studioRoot, "../..");
const defaultDataRoot = path.join(studioRoot, "data");
const publicRoot = path.join(studioRoot, "public");
const idPattern = /^[a-z0-9][a-z0-9-]{2,79}$/;
const allowedRootSceneAssets = new Set([
  "world-plan.png",
  "opening-shot.png",
  "whitebox-opening-frame.png",
  "opening-frame-rendered.png",
]);
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

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

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, filePath);
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

export function isAllowedSceneAsset(relativePath) {
  if (allowedRootSceneAssets.has(relativePath)) return true;
  if (/^reference-[0-9]+\.(?:png|jpe?g|webp)$/.test(relativePath)) return true;
  return /^prototypes\/[a-z0-9][a-z0-9-]*\/(?:whitebox|styled)-triview\.png$/.test(relativePath);
}

export function createStudio(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? defaultRepoRoot);
  const dataRoot = path.resolve(options.dataRoot ?? defaultDataRoot);
  const worldsRoot = path.join(dataRoot, "worlds");
  const playgroundOrigin = options.playgroundOrigin ?? "http://127.0.0.1:5173";
  const playgroundInternalOrigin = options.playgroundInternalOrigin ?? "http://127.0.0.1:5173";
  const accessKey = options.accessKey ?? "";
  const queue = [];
  let activeJob = null;
  let activeChild = null;
  let shuttingDown = false;

  const recordPath = (id) => path.join(worldsRoot, id, "record.json");
  const logPath = (id) => path.join(worldsRoot, id, "agent.log");

  async function readRecord(id) {
    if (!idPattern.test(id)) return null;
    try {
      return JSON.parse(await readFile(recordPath(id), "utf8"));
    } catch {
      return null;
    }
  }

  async function writeRecord(record) {
    record.updatedAt = new Date().toISOString();
    await writeJsonAtomic(recordPath(record.id), record);
  }

  async function updateRecord(id, patch) {
    const record = await readRecord(id);
    if (!record) return null;
    Object.assign(record, patch);
    await writeRecord(record);
    return record;
  }

  async function listRecords() {
    await mkdir(worldsRoot, { recursive: true });
    const entries = await readdir(worldsRoot, { withFileTypes: true });
    const records = (
      await Promise.all(entries.filter((entry) => entry.isDirectory()).map((entry) => readRecord(entry.name)))
    ).filter(Boolean);
    return records.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async function importExistingWorlds() {
    const artifactsRoot = path.join(repoRoot, "artifacts/scenes");
    if (!await fileExists(artifactsRoot)) return;
    const currentRecords = await listRecords();
    const knownSceneIds = new Set(currentRecords.map((record) => record.sceneId));
    const entries = await readdir(artifactsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !idPattern.test(entry.name) || knownSceneIds.has(entry.name)) continue;
      const manifestPath = path.join(artifactsRoot, entry.name, "manifest.json");
      const specPath = path.join(artifactsRoot, entry.name, "world-spec.json");
      try {
        const [manifest, spec, manifestStats] = await Promise.all([
          readFile(manifestPath, "utf8").then(JSON.parse),
          readFile(specPath, "utf8").then(JSON.parse),
          stat(manifestPath),
        ]);
        if (manifest.workflowStage !== "verified" || spec.id !== entry.name) continue;
        const timestamp = manifestStats.mtime.toISOString();
        await writeRecord({
          id: entry.name,
          sceneId: entry.name,
          title: typeof spec.title === "string" ? spec.title : entry.name,
          prompt: typeof spec.source?.request === "string" ? spec.source.request : spec.intent ?? "Imported WorldKit scene",
          referenceImage: null,
          status: "ready",
          stage: "ready",
          attempt: 1,
          origin: "existing-sdk-scene",
          createdAt: timestamp,
          updatedAt: timestamp,
          startedAt: null,
          finishedAt: timestamp,
          error: null,
        });
        knownSceneIds.add(entry.name);
      } catch {
        // Ignore incomplete or non-canonical artifact directories.
      }
    }
  }

  async function enrichRecord(record) {
    const scenePlanRoot = path.join(repoRoot, "apps/playground/public/scene-plans", record.sceneId);
    const coverCandidates = [
      "whitebox-opening-frame.png",
      "opening-shot.png",
      "world-plan.png",
    ];
    let coverUrl = record.referenceImage ? `/api/worlds/${record.id}/reference` : null;
    for (const candidate of coverCandidates) {
      if (await fileExists(path.join(scenePlanRoot, candidate))) {
        coverUrl = `/scene-assets/${record.sceneId}/${candidate}`;
        break;
      }
    }
    return {
      ...record,
      coverUrl,
      referenceUrl: record.referenceImage ? `/api/worlds/${record.id}/reference` : null,
      previewUrl: `${playgroundOrigin}/?scene=${encodeURIComponent(record.sceneId)}`,
      queuePosition: record.status === "queued" ? queue.indexOf(record.id) + 1 : null,
    };
  }

  async function readJsonIfPresent(filePath) {
    try {
      return JSON.parse(await readFile(filePath, "utf8"));
    } catch {
      return null;
    }
  }

  async function collectWorldMedia(record) {
    const sceneId = record.sceneId;
    const scenePlanRoot = path.join(repoRoot, "apps/playground/public/scene-plans", sceneId);
    const artifactsRoot = path.join(repoRoot, "artifacts/scenes", sceneId);
    const [spec, catalogArtifact, compositionArtifact] = await Promise.all([
      readJsonIfPresent(path.join(artifactsRoot, "world-spec.json")),
      readJsonIfPresent(path.join(artifactsRoot, "entity-catalog.json")),
      readJsonIfPresent(path.join(scenePlanRoot, "opening-composition-report.json")),
    ]);
    const catalog = spec?.entityCatalog ?? catalogArtifact ?? { prototypes: [] };
    const artifactByKind = new Map((spec?.artifacts ?? []).map((artifact) => [artifact.kind, artifact]));
    const planning = [];

    if (record.referenceImage) {
      planning.push({
        kind: "reference",
        title: "用户参考图",
        description: "用户上传、供 World Planner 理解构图与空间关系的原始参考。",
        prompt: record.prompt,
        url: `/api/worlds/${record.id}/reference`,
        available: true,
      });
    } else {
      const declaredReference = (spec?.source?.referenceImages ?? []).find((uri) => {
        const prefix = `/scene-plans/${sceneId}/`;
        return typeof uri === "string" && uri.startsWith(prefix) && isAllowedSceneAsset(uri.slice(prefix.length));
      });
      if (declaredReference) {
        const relativePath = declaredReference.slice(`/scene-plans/${sceneId}/`.length);
        if (await fileExists(path.join(scenePlanRoot, relativePath))) {
          planning.push({
            kind: "reference",
            title: "用户参考图",
            description: "World Planner 使用的原始视觉参考。",
            prompt: record.prompt,
            url: `/scene-assets/${sceneId}/${relativePath}`,
            available: true,
          });
        }
      }
    }

    const planningDefinitions = [
      {
        file: "world-plan.png",
        kind: "world-plan",
        title: "世界俯视规划图",
        description: "正交俯视的完整世界拓扑，用于锁定地形、水体、路线和标志物关系。",
      },
      {
        file: "opening-shot.png",
        kind: "opening-shot",
        title: "进入视角规划图",
        description: "玩家进入世界时的目标构图，约束镜头、主体位置和前中后景层次。",
      },
      {
        file: "whitebox-opening-frame.png",
        kind: "whitebox-opening-frame",
        title: "白膜首帧",
        description: "SDK 实际搭建完成后的进入视角截图，用来和参考构图核对。",
      },
      {
        file: "opening-frame-rendered.png",
        kind: "opening-frame-rendered",
        title: "样式化首帧",
        description: "在白膜空间结构上完成视觉渲染后的首帧目标。",
      },
    ];
    for (const definition of planningDefinitions) {
      const available = await fileExists(path.join(scenePlanRoot, definition.file));
      const artifact = artifactByKind.get(definition.kind);
      planning.push({
        ...definition,
        prompt: artifact?.prompt ?? (definition.kind.includes("opening") ? spec?.worldPrompt?.openingShot : null),
        url: available ? `/scene-assets/${sceneId}/${definition.file}` : null,
        available,
      });
    }

    const prototypes = [];
    for (const prototype of catalog.prototypes ?? []) {
      const prefix = `/scene-plans/${sceneId}/`;
      const toView = async (uri, fallback) => {
        const relativePath = typeof uri === "string" && uri.startsWith(prefix) ? uri.slice(prefix.length) : fallback;
        if (!isAllowedSceneAsset(relativePath) || !await fileExists(path.join(scenePlanRoot, relativePath))) return null;
        return `/scene-assets/${sceneId}/${relativePath}`;
      };
      const whiteboxUrl = await toView(
        prototype.views?.whiteboxUri,
        `prototypes/${prototype.id}/whitebox-triview.png`,
      );
      const styledUrl = await toView(
        prototype.views?.styledUri,
        `prototypes/${prototype.id}/styled-triview.png`,
      );
      prototypes.push({
        id: prototype.id,
        role: prototype.role,
        semantic: prototype.semantic,
        description: prototype.description,
        appearancePrompt: prototype.appearancePrompt,
        negativePrompt: prototype.negativePrompt,
        instanceColor: prototype.instanceColor,
        approximateSize: prototype.approximateSize,
        whiteboxUrl,
        styledUrl,
      });
    }

    return {
      planning,
      prototypes,
      composition: typeof compositionArtifact?.score === "number" && typeof compositionArtifact?.pass === "boolean"
        ? {
            score: compositionArtifact.score,
            minimumScore: compositionArtifact.minimumScore,
            pass: compositionArtifact.pass,
            regionPassCount: (compositionArtifact.regions ?? []).filter((region) => region.pass).length,
            regionCount: (compositionArtifact.regions ?? []).length,
            anchorPassCount: (compositionArtifact.anchors ?? []).filter((anchor) => anchor.pass).length,
            anchorCount: (compositionArtifact.anchors ?? []).length,
          }
        : null,
      availableImageCount:
        planning.filter((item) => item.available).length +
        prototypes.reduce((count, prototype) => count + Number(Boolean(prototype.whiteboxUrl)) + Number(Boolean(prototype.styledUrl)), 0),
    };
  }

  async function appendJobLog(id, text) {
    await appendFile(logPath(id), text, "utf8");
  }

  function consumeOutput(id, source, chunk, state) {
    const text = chunk.toString("utf8");
    void appendJobLog(id, `[${source}] ${text}`);
    state.buffer += text;
    const lines = state.buffer.split(/\r?\n/);
    state.buffer = lines.pop() ?? "";
    for (const line of lines) {
      const match = /^WORLDKIT_STAGE ([a-z-]+)$/.exec(line.trim());
      if (match) void updateRecord(id, { stage: match[1] });
    }
  }

  async function runJob(id) {
    const record = await readRecord(id);
    if (!record || shuttingDown) return;
    const attempt = (record.attempt ?? 0) + 1;
    await writeFile(logPath(id), `WorldKit Creator Studio\nscene=${record.sceneId}\nattempt=${attempt}\n\n`, "utf8");
    await updateRecord(id, {
      status: "running",
      stage: "preparing",
      attempt,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
    });

    const args = ["agent:scene", "--", "--scene-id", record.sceneId];
    if (record.referenceImage) args.push("--image", path.join(worldsRoot, id, record.referenceImage.fileName));
    args.push(record.prompt);

    await appendJobLog(id, `Launching the isolated Planner → Builder pipeline.\n`);
    const child = spawn("pnpm", args, {
      cwd: repoRoot,
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    activeChild = child;
    const stdout = { buffer: "" };
    const stderr = { buffer: "" };
    child.stdout.on("data", (chunk) => consumeOutput(id, "stdout", chunk, stdout));
    child.stderr.on("data", (chunk) => consumeOutput(id, "stderr", chunk, stderr));

    const exit = await new Promise((resolve) => {
      child.once("error", (error) => resolve({ code: -1, error }));
      child.once("close", (code, signal) => resolve({ code: code ?? -1, signal }));
    });
    activeChild = null;
    if (stdout.buffer) await appendJobLog(id, `[stdout] ${stdout.buffer}\n`);
    if (stderr.buffer) await appendJobLog(id, `[stderr] ${stderr.buffer}\n`);

    if (shuttingDown) {
      await updateRecord(id, {
        status: "interrupted",
        stage: "interrupted",
        finishedAt: new Date().toISOString(),
        error: "Creator Studio stopped while this world was being generated.",
      });
      return;
    }

    const sceneSourceExists =
      (await fileExists(path.join(repoRoot, "apps/playground/src/scenes", `${record.sceneId}.ts`))) ||
      (await fileExists(path.join(repoRoot, "apps/playground/src/scenes", `${record.sceneId}-scene.ts`)));
    const manifestExists = await fileExists(path.join(repoRoot, "artifacts/scenes", record.sceneId, "manifest.json"));
    if (exit.code === 0 && sceneSourceExists && manifestExists) {
      await updateRecord(id, {
        status: "ready",
        stage: "ready",
        finishedAt: new Date().toISOString(),
        error: null,
      });
      await appendJobLog(id, "\nWorld generation completed.\n");
      return;
    }

    const reason = exit.error instanceof Error
      ? exit.error.message
      : `World generation exited with code ${exit.code}${exit.signal ? ` (${exit.signal})` : ""}.`;
    await updateRecord(id, {
      status: "failed",
      stage: exit.code === 3 ? "change-requested" : "failed",
      finishedAt: new Date().toISOString(),
      error: reason,
    });
    await appendJobLog(id, `\n${reason}\n`);
  }

  async function pumpQueue() {
    if (activeJob || shuttingDown) return;
    const id = queue.shift();
    if (!id) return;
    activeJob = id;
    try {
      await runJob(id);
    } finally {
      activeJob = null;
      void pumpQueue();
    }
  }

  function enqueue(id) {
    if (id !== activeJob && !queue.includes(id)) queue.push(id);
    void pumpQueue();
  }

  async function initialize() {
    await mkdir(worldsRoot, { recursive: true });
    await importExistingWorlds();
    const records = await listRecords();
    for (const record of records) {
      if (record.status === "running") {
        await updateRecord(record.id, {
          status: "interrupted",
          stage: "interrupted",
          finishedAt: new Date().toISOString(),
          error: "Creator Studio restarted before this task completed.",
        });
      } else if (record.status === "queued") {
        queue.push(record.id);
      }
    }
    void pumpQueue();
  }

  async function handleApi(request, response, url) {
    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, {
        ok: true,
        codexAvailable: commandAvailable("codex"),
        pnpmAvailable: commandAvailable("pnpm"),
        activeJob,
        queued: queue.length,
        playgroundOrigin,
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
      const existingIds = new Set((await listRecords()).map((record) => record.id));
      const id = createSceneId(title, existingIds);
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
        attempt: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
        startedAt: null,
        finishedAt: null,
        error: null,
      };
      await writeRecord(record);
      enqueue(id);
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
      await updateRecord(record.id, { status: "queued", stage: "queued", error: null });
      enqueue(record.id);
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
    if (activeChild && !activeChild.killed) activeChild.kill("SIGTERM");
    if (activeJob) {
      await updateRecord(activeJob, {
        status: "interrupted",
        stage: "interrupted",
        finishedAt: new Date().toISOString(),
        error: "Creator Studio stopped while this world was being generated.",
      });
    }
    await new Promise((resolve) => server.close(resolve));
  }

  return {
    server,
    initialize,
    shutdown,
    get activeJob() { return activeJob; },
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
