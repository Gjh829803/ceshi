#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { readRemoteS3Artifact } from "../lib/cloud-s3-runtime.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const manifests = args.flatMap((value, index) =>
  value === "--manifest" && args[index + 1] ? [args[index + 1]] : []);
const value = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const statePath = path.resolve(repoRoot, value(
  "--state",
  ".codex-tmp/direct-s3-video-production/state.json",
));
const outputPath = path.resolve(repoRoot, value(
  "--output",
  ".codex-tmp/direct-s3-video-production/review/completed.html",
));
const playOrigin = value("--play-origin", "http://127.0.0.1:4597").replace(/\/$/, "");
if (manifests.length === 0) throw new Error("At least one --manifest S3 URI is required.");

const execFileAsync = promisify(execFile);
const state = JSON.parse(await readFile(statePath, "utf8"));
const succeeded = new Map(Object.entries(state.tasks ?? {}).filter(([, task]) =>
  task?.status === "succeeded" && typeof task.outputS3Prefix === "string"));
const manifestRecords = await Promise.all(manifests.map(async (s3Uri) => {
  const bytes = await readRemoteS3Artifact(s3Uri, { repoRoot, maximumBytes: 8 * 1024 * 1024 });
  const manifest = JSON.parse(bytes.toString("utf8"));
  return {
    manifest,
    artifacts: new Map(manifest.artifacts.map((artifact) => [artifact.path, artifact])),
  };
}));
const manifestByEpisode = new Map(manifestRecords.map((record) =>
  [record.manifest.episodeId, record]));

function episodeArtifactPath(absolutePath, episodeId) {
  const marker = `/artifacts/episodes/${episodeId}/`;
  const normalized = String(absolutePath ?? "").replaceAll("\\", "/");
  const index = normalized.indexOf(marker);
  if (index < 0) throw new Error(`Episode request path is not portable: ${absolutePath}`);
  return `episode/${normalized.slice(index + marker.length)}`;
}

const regionCache = new Map();
async function bucketRegion(s3Uri) {
  const bucket = new URL(s3Uri).hostname;
  if (!regionCache.has(bucket)) {
    regionCache.set(bucket, (async () => {
      const { stdout } = await execFileAsync("aws", [
        "s3api", "get-bucket-location", "--bucket", bucket,
        "--query", "LocationConstraint", "--output", "text",
      ], { cwd: repoRoot, timeout: 60_000 });
      const region = stdout.trim();
      return !region || region === "None" ? "us-east-1" : region === "EU" ? "eu-west-1" : region;
    })());
  }
  return regionCache.get(bucket);
}

async function presign(s3Uri) {
  const { stdout } = await execFileAsync("aws", [
    "s3", "presign", s3Uri,
    "--region", await bucketRegion(s3Uri),
    "--expires-in", "86400",
  ], { cwd: repoRoot, timeout: 60_000, maxBuffer: 1024 * 1024 });
  const url = stdout.trim();
  if (!url.startsWith("https://")) throw new Error(`Unable to presign ${s3Uri}`);
  return url;
}

async function mapLimit(values, limit, mapper) {
  const results = new Array(values.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= values.length) return;
      results[index] = await mapper(values[index], index);
    }
  }));
  return results;
}

const rows = (await mapLimit([...succeeded], 12, async ([taskId, taskState]) => {
  const match = /^([^/]+)\/(style-\d{2})\/(segment-\d{2})$/.exec(taskId);
  if (!match) return null;
  const [, episodeId, styleVariantId, segmentId] = match;
  const source = manifestByEpisode.get(episodeId);
  if (!source) return null;
  const requestPath = `episode/style-variants/${styleVariantId}/video/${segmentId}/request.json`;
  const requestArtifact = source.artifacts.get(requestPath);
  if (!requestArtifact) return null;
  const request = JSON.parse((await readRemoteS3Artifact(requestArtifact.s3Uri, {
    repoRoot,
    maximumBytes: 1024 * 1024,
  })).toString("utf8"));
  const whiteboxArtifact = source.artifacts.get(
    episodeArtifactPath(request.referenceVideoPath, episodeId),
  );
  const openingArtifact = source.artifacts.get(
    episodeArtifactPath(request.referenceImagePaths[0], episodeId),
  );
  if (!whiteboxArtifact || !openingArtifact) return null;
  const journalPath = path.join(
    path.dirname(statePath), "outputs", taskId, "provider-run.json",
  );
  const journal = JSON.parse(await readFile(journalPath, "utf8"));
  if (journal.status !== "succeeded" || journal.output?.frameParity !== true ||
      journal.output?.deliveryResolutionConformant !== true) return null;
  const finalS3Uri = `${taskState.outputS3Prefix.replace(/\/$/, "")}/${journal.output.fileName}`;
  const [whiteboxUrl, finalUrl, posterUrl] = await Promise.all([
    presign(whiteboxArtifact.s3Uri),
    presign(finalS3Uri),
    presign(openingArtifact.s3Uri),
  ]);
  return {
    taskId,
    sceneId: source.manifest.sceneId,
    episodeId,
    styleVariantId,
    segmentId,
    whiteboxUrl,
    finalUrl,
    posterUrl,
    media: journal.output.media,
    playUrl: `${playOrigin}/play?authoring=1&world=${encodeURIComponent(source.manifest.sceneId)}`,
  };
})).filter(Boolean).sort((left, right) => left.taskId.localeCompare(right.taskId));

const groups = [...Map.groupBy(rows, (row) =>
  `${row.episodeId}/${row.styleVariantId}`).entries()].map(([id, items]) => ({
    id,
    episodeId: items[0].episodeId,
    sceneId: items[0].sceneId,
    styleVariantId: items[0].styleVariantId,
    playUrl: items[0].playUrl,
    items,
  }));
const data = JSON.stringify({ generatedAt: new Date().toISOString(), rows, groups })
  .replaceAll("<", "\\u003c");
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" /><title>WorldKit · 已完成视频</title>
<style>
:root{--paper:#f3f1e8;--ink:#092d36;--line:#b9c4c0;--blue:#117b9c}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,"PingFang SC",sans-serif}header{height:78px;padding:0 28px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between}header b{font-size:20px;letter-spacing:.12em}header span{font:12px ui-monospace,monospace;color:var(--blue)}main{height:calc(100vh - 78px);display:grid;grid-template-columns:330px 1fr}.list{overflow:auto;border-right:1px solid var(--line)}button{width:100%;padding:18px;border:0;border-bottom:1px solid var(--line);background:transparent;text-align:left;color:inherit;cursor:pointer}button.active{background:#fff}button b,button small,button em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}button small{margin:6px 0;color:#607478}button em{color:var(--blue);font-style:normal}.detail{overflow:auto;padding:28px}.title{display:flex;align-items:end;justify-content:space-between;margin-bottom:22px}.title h2{margin:4px 0}.title a{padding:12px 16px;background:var(--ink);color:#fff;text-decoration:none}.pair{margin:0 0 28px;border:1px solid var(--line);background:#fff}.pair>h3{margin:0;padding:14px 18px;border-bottom:1px solid var(--line);font-size:14px}.videos{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line)}figure{margin:0;background:#fff}video{display:block;width:100%;aspect-ratio:16/9;background:#071114}figcaption{padding:10px 14px;font-size:12px}.empty{height:100%;display:grid;place-items:center;color:#718286}@media(max-width:900px){main{display:block;height:auto}.list{max-height:260px;border-right:0}.videos{grid-template-columns:1fr}}
</style></head><body><header><b>WORLDKIT · COMPLETED VIDEO REVIEW</b><span>${rows.length} 段已通过媒体闭合</span></header><main><aside class="list" id="list"></aside><section class="detail" id="detail"></section></main>
<script>const DATA=${data};const list=document.querySelector('#list'),detail=document.querySelector('#detail');let selected=DATA.groups[0]?.id;function render(){list.innerHTML=DATA.groups.map(g=>\`<button data-id="\${g.id}" class="\${g.id===selected?'active':''}"><b>\${g.sceneId} · \${g.styleVariantId}</b><small>\${g.episodeId}</small><em>\${g.items.length}/6 段已完成</em></button>\`).join('');list.querySelectorAll('button').forEach(b=>b.onclick=()=>{selected=b.dataset.id;render()});const g=DATA.groups.find(x=>x.id===selected);if(!g){detail.innerHTML='<div class="empty">暂无已完成视频</div>';return}detail.innerHTML=\`<div class="title"><div><small>\${g.episodeId}</small><h2>\${g.sceneId} · \${g.styleVariantId}</h2><span>白膜运动真值 ↔ Seedance 最终视频</span></div><a href="\${g.playUrl}" target="_blank">进入世界试玩 ↗</a></div>\${g.items.map(x=>\`<article class="pair"><h3>\${x.segmentId} · 1280×720 · 24fps · 720帧 · 30秒 · 含声音</h3><div class="videos"><figure><video controls muted playsinline preload="metadata" src="\${x.whiteboxUrl}"></video><figcaption>白膜参考视频</figcaption></figure><figure><video controls playsinline preload="metadata" poster="\${x.posterUrl}" src="\${x.finalUrl}"></video><figcaption>最终 Seedance 视频</figcaption></figure></div></article>\`).join('')}\`;}</script><script>render()</script></body></html>`;
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, html, "utf8");
process.stdout.write(`WORLDKIT_DIRECT_REVIEW_READY rows=${rows.length} groups=${groups.length} ${outputPath}\n`);
