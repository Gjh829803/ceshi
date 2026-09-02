import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const DEFAULT_TITLE = "WorldKit Seedance Review";

function requiredId(value, label) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    throw new Error(`${label} must be a lowercase kebab-case identifier.`);
  }
  return value;
}

function relativeArtifactUrl(episodeId, relativePath) {
  const normalized = String(relativePath ?? "")
    .split("/")
    .filter((part) => part.length > 0 && part !== "." && part !== "..")
    .join("/");
  if (!normalized) throw new Error("Episode artifact path is empty.");
  return `cases/${episodeId}/artifacts/${normalized}`;
}

function staticMedia(episodeId, media) {
  if (media === null || media === undefined) return media;
  const output = { ...media };
  if (typeof media.relativePath === "string") {
    output.url = relativeArtifactUrl(episodeId, media.relativePath);
  }
  if (media.poster !== null && typeof media.poster === "object") {
    output.poster = staticMedia(episodeId, media.poster);
  }
  return output;
}

function artifactPathFromApiUrl(url) {
  if (typeof url !== "string") return undefined;
  const match = /\/artifacts\/(.+)$/.exec(url);
  return match?.[1];
}

function sceneAssetExtension(image) {
  const id = String(image.id ?? "image");
  if (/\.webp$/i.test(id)) return ".webp";
  if (/\.jpe?g$/i.test(id)) return ".jpg";
  return ".png";
}

function staticDownloadImage(episodeId, image, requests) {
  if (typeof image.relativePath === "string") {
    return {
      ...image,
      url: relativeArtifactUrl(episodeId, image.relativePath),
    };
  }
  const destination = `cases/${episodeId}/scene-assets/${requiredId(image.id, "image id")}${sceneAssetExtension(image)}`;
  requests.push({
    kind: "http",
    sourcePath: image.url,
    destination,
    expectedKind: "image",
  });
  return { ...image, url: destination };
}

function staticDownloadDocument(episodeId, document, requests) {
  const artifactPath = artifactPathFromApiUrl(document.url);
  if (artifactPath !== undefined) {
    return {
      ...document,
      url: relativeArtifactUrl(episodeId, artifactPath),
    };
  }
  const extension = document.kind === "json" ? ".json" : ".txt";
  const destination = `cases/${episodeId}/data/${requiredId(document.id, "document id")}${extension}`;
  requests.push({
    kind: "http",
    sourcePath: document.url,
    destination,
    expectedKind: document.kind ?? "document",
  });
  return { ...document, url: destination };
}

function episodeArtifactRequests(episode) {
  return episode.artifacts.map((artifact) => ({
    kind: "episode-artifact",
    episodeId: episode.episodeId,
    sourceRelativePath: artifact.relativePath,
    destination: relativeArtifactUrl(episode.episodeId, artifact.relativePath),
    sizeBytes: artifact.sizeBytes,
  }));
}

export function rewriteEpisodeForStaticReview(input) {
  const episodeId = requiredId(input.episodeId, "episodeId");
  const sceneId = requiredId(input.sceneId, "sceneId");
  const requests = episodeArtifactRequests(input);
  const playbackComparisons = input.playbackComparisons.map((comparison) => ({
    ...comparison,
    whiteboxVideo: staticMedia(episodeId, comparison.whiteboxVideo),
    finalVideo: staticMedia(episodeId, comparison.finalVideo),
    publicPreviewVideo: staticMedia(episodeId, comparison.publicPreviewVideo),
    baseStyledOpeningFrame: undefined,
    reviewStyledOpeningFrame: staticMedia(episodeId, comparison.reviewStyledOpeningFrame),
    legacyPromptVideo: staticMedia(episodeId, comparison.legacyPromptVideo),
    relaxedActionVideo: staticMedia(episodeId, comparison.relaxedActionVideo),
  }));
  const reviewDownloads = {
    images: input.reviewDownloads.images.map((image) =>
      staticDownloadImage(episodeId, image, requests)),
    documents: input.reviewDownloads.documents.map((document) =>
      staticDownloadDocument(episodeId, document, requests)),
    bundle: input.reviewDownloads.bundle.ready
      ? {
          ...input.reviewDownloads.bundle,
          url: `cases/${episodeId}/bundle/${basename(input.reviewDownloads.bundle.fileName)}`,
        }
      : { ...input.reviewDownloads.bundle },
  };
  if (input.reviewDownloads.bundle.ready) {
    requests.push({
      kind: "http",
      sourcePath: input.reviewDownloads.bundle.url,
      destination: reviewDownloads.bundle.url,
      expectedKind: "zip",
    });
  }
  const manifest = {
    kind: "worldkit-static-seedance-review-case",
    schemaVersion: 1,
    episodeId,
    sceneId,
    status: input.status,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    finishedAt: input.finishedAt,
    stages: input.stages,
    playbackComparisons,
    reviewDownloads,
    playUrl: `play/index.html?authoring=1&world=${encodeURIComponent(sceneId)}`,
  };
  const firstComparison = playbackComparisons[0];
  return {
    manifest,
    requests,
    catalogEntry: {
      episodeId,
      sceneId,
      status: input.status,
      updatedAt: input.updatedAt,
      segmentCount: playbackComparisons.length,
      manifestUrl: `cases/${episodeId}/manifest.json`,
      posterUrl: firstComparison?.finalVideo?.poster?.url ??
        firstComparison?.whiteboxVideo?.poster?.url,
    },
  };
}

function releaseIdentity(entries) {
  return createHash("sha256")
    .update(JSON.stringify(entries.map(({ episodeId, updatedAt }) => ({ episodeId, updatedAt }))))
    .digest("hex");
}

export function buildStaticReviewModel(apiPayload, options = {}) {
  if (apiPayload === null || typeof apiPayload !== "object" ||
      !Array.isArray(apiPayload.episodes)) {
    throw new Error("Seedance review payload must contain an episodes array.");
  }
  const rewritten = apiPayload.episodes
    .filter((episode) => episode.status === "succeeded")
    .map(rewriteEpisodeForStaticReview)
    .sort((left, right) =>
      String(right.catalogEntry.updatedAt).localeCompare(String(left.catalogEntry.updatedAt)));
  const entries = rewritten.map(({ catalogEntry }) => catalogEntry);
  return {
    catalog: {
      kind: "worldkit-static-seedance-review-catalog",
      schemaVersion: 1,
      title: options.title ?? DEFAULT_TITLE,
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      releaseIdentitySha256: releaseIdentity(entries),
      episodes: entries,
    },
    cases: rewritten.map(({ manifest }) => manifest),
    requests: rewritten.flatMap(({ requests }) => requests),
  };
}

const INDEX_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="WorldKit 三段白膜与 Seedance 成片持久评审页">
  <title>WorldKit Seedance Review</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header class="topbar">
    <a class="brand" href="./"><span class="brand-mark">W</span><span><b>WORLDKIT</b><small>CREATOR STUDIO</small></span></a>
    <nav><span class="active">Seedance 对比</span><span class="storage">S3 PERSISTENT</span></nav>
  </header>
  <main class="layout">
    <aside><div class="aside-title"><span>已完成 Case</span><b id="case-count">0</b></div><div id="case-list"></div></aside>
    <section id="review"><div class="loading">正在读取持久评审清单…</div></section>
  </main>
  <script type="module" src="app.js"></script>
</body>
</html>
`;

const APP_JS = String.raw`const state={catalog:null,episode:null,segmentIndex:0,syncing:false,raf:0};
const list=document.querySelector('#case-list'),review=document.querySelector('#review'),count=document.querySelector('#case-count');
const absolute=(path)=>new URL(path,document.baseURI).href;
const text=(tag,className,value)=>{const node=document.createElement(tag);if(className)node.className=className;node.textContent=value??'';return node};
const formatDate=(value)=>new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
const formatBytes=(value)=>{if(!Number.isFinite(value))return '';const units=['B','KB','MB','GB'];let n=value,u=0;while(n>=1024&&u<units.length-1){n/=1024;u+=1}return n.toFixed(u===0?0:1)+' '+units[u]};
async function json(path){const response=await fetch(absolute(path),{cache:'no-store'});if(!response.ok)throw new Error('HTTP '+response.status);return response.json()}
function caseRow(entry){const button=document.createElement('button');button.className='case-row';button.dataset.episodeId=entry.episodeId;const image=document.createElement('img');image.loading='lazy';image.src=absolute(entry.posterUrl);image.alt='';const body=document.createElement('span');body.append(text('b','',entry.sceneId),text('small','',entry.episodeId),text('em','',entry.segmentCount+'/3 段 · '+formatDate(entry.updatedAt)));button.append(image,body);button.addEventListener('click',()=>selectCase(entry));return button}
async function selectCase(entry){document.querySelectorAll('.case-row').forEach(node=>node.classList.toggle('selected',node.dataset.episodeId===entry.episodeId));review.innerHTML='<div class="loading">正在读取 '+entry.sceneId+'…</div>';state.episode=await json(entry.manifestUrl);state.segmentIndex=0;renderEpisode()}
function keyName(value){return value}
const KEYS=['W','A','S','D','Shift','Space','J','I','K','L'];
function renderKeys(root,comparison,video){const panel=document.createElement('section');panel.className='timeline-panel';const keys=document.createElement('div');keys.className='keys';const nodes=new Map;for(const key of KEYS){const node=text('kbd','',keyName(key));node.dataset.key=key;keys.append(node);nodes.set(key,node)}const prompt=document.createElement('div');prompt.className='prompt-event';prompt.append(text('small','','本段 Prompt 事件'),text('p','',comparison.promptEvent?.eventPrompt||comparison.promptEvent?.commandText||'本段没有 Prompt 事件'));panel.append(keys,prompt);root.append(panel);const tick=()=>{const now=video.currentTime;for(const [key,node] of nodes)node.classList.toggle('active',comparison.inputActivations.some(item=>item.keys.includes(key)&&now>=item.startSeconds&&now<=item.endSeconds));state.raf=requestAnimationFrame(tick)};cancelAnimationFrame(state.raf);tick()}
function pairedVideos(root,comparison){const grid=document.createElement('div');grid.className='video-grid';const make=(titleValue,media)=>{const card=document.createElement('article');card.append(text('h3','',titleValue));const video=document.createElement('video');video.controls=true;video.playsInline=true;video.preload='metadata';video.src=absolute(media.url);if(media.poster?.url)video.poster=absolute(media.poster.url);card.append(video);return{card,video}};const left=make('白膜视频',comparison.whiteboxVideo),right=make('Seedance 最终视频',comparison.finalVideo);grid.append(left.card,right.card);root.append(grid);const controls=document.createElement('div');controls.className='sync-controls';const sync=text('button','primary','一键同步对比');const reset=text('button','','回到本段开头');controls.append(sync,reset);root.prepend(controls);sync.addEventListener('click',async()=>{left.video.pause();right.video.pause();left.video.currentTime=0;right.video.currentTime=0;await Promise.allSettled([left.video.play(),right.video.play()])});reset.addEventListener('click',()=>{left.video.pause();right.video.pause();left.video.currentTime=0;right.video.currentTime=0});for(const event of ['play','pause','seeking','ratechange'])left.video.addEventListener(event,()=>{if(state.syncing)return;state.syncing=true;right.video.playbackRate=left.video.playbackRate;if(Math.abs(right.video.currentTime-left.video.currentTime)>.12)right.video.currentTime=left.video.currentTime;if(event==='play')void right.video.play();if(event==='pause')right.video.pause();state.syncing=false});renderKeys(root,comparison,left.video)}
function downloads(root,episode){const section=document.createElement('section');section.className='downloads';section.append(text('h2','','相关图片与文件'));const gallery=document.createElement('div');gallery.className='gallery';for(const image of episode.reviewDownloads.images){const link=document.createElement('a');link.href=absolute(image.url);link.target='_blank';const preview=document.createElement('img');preview.loading='lazy';preview.src=absolute(image.url);preview.alt=image.title;link.append(preview,text('span','',image.title));gallery.append(link)}section.append(gallery);const docs=document.createElement('div');docs.className='documents';for(const downloadableDocument of episode.reviewDownloads.documents){const link=document.createElement('a');link.href=absolute(downloadableDocument.url);link.download='';link.textContent=downloadableDocument.title;docs.append(link)}if(episode.reviewDownloads.bundle.ready){const bundle=document.createElement('a');bundle.className='primary';bundle.href=absolute(episode.reviewDownloads.bundle.url);bundle.download=episode.reviewDownloads.bundle.fileName;bundle.textContent='一键下载全部 ZIP';docs.prepend(bundle)}section.append(docs);root.append(section)}
function renderEpisode(){const episode=state.episode,comparison=episode.playbackComparisons[state.segmentIndex];review.replaceChildren();const hero=document.createElement('header');hero.className='case-header';const copy=document.createElement('div');copy.append(text('small','','TEST SET · '+episode.episodeId),text('h1','',episode.sceneId),text('p','','三段白膜运动与 Seedance 最终视频持久对比'));const actions=document.createElement('div');const play=document.createElement('a');play.className='button';play.href=episode.playUrl;play.textContent='进入白膜世界 ↗';actions.append(play);hero.append(copy,actions);review.append(hero);const tabs=document.createElement('div');tabs.className='segment-tabs';episode.playbackComparisons.forEach((segment,index)=>{const button=text('button',index===state.segmentIndex?'active':'',segment.title+' · '+String(segment.globalStartSeconds).padStart(2,'0')+'–'+String(segment.globalEndSeconds).padStart(2,'0')+'s');button.addEventListener('click',()=>{state.segmentIndex=index;renderEpisode()});tabs.append(button)});review.append(tabs);const content=document.createElement('section');content.className='segment';content.append(text('small','eyebrow','阶段 '+(state.segmentIndex+1)+' · '+comparison.segmentId),text('h2','','白膜动作真值 ↔ Seedance 最终视频'));pairedVideos(content,comparison);review.append(content);downloads(review,episode)}
async function boot(){try{state.catalog=await json('data/catalog.json');count.textContent=String(state.catalog.episodes.length);list.replaceChildren(...state.catalog.episodes.map(caseRow));if(state.catalog.episodes[0])await selectCase(state.catalog.episodes[0]);else review.innerHTML='<div class="loading">暂无完成的 Seedance Case</div>'}catch(error){review.innerHTML='<div class="error">持久评审清单读取失败：'+String(error.message||error)+'</div>'}}boot();
`;

const STYLES_CSS = `:root{--paper:#f3f1e8;--ink:#102e37;--muted:#6f7d7b;--line:#c8ccc4;--accent:#0d596b;--panel:#fbfaf5;--dark:#071d24}*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--paper);color:var(--ink);font-family:Inter,"Noto Sans SC",system-ui,sans-serif}button,a{font:inherit}.topbar{height:94px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;padding:0 28px;background:#f6f4ec;position:sticky;top:0;z-index:5}.brand{display:flex;align-items:center;gap:14px;color:var(--ink);text-decoration:none;letter-spacing:.14em}.brand-mark{width:54px;height:54px;border:2px solid var(--ink);border-radius:50%;display:grid;place-items:center;font:700 22px Georgia}.brand small{display:block;margin-top:4px;font-size:10px;color:#81908e}.topbar nav{display:flex;gap:24px;align-items:center}.topbar nav .active{font-weight:700}.storage{padding:8px 11px;background:#d9eee3;color:#25634c;font:700 11px ui-monospace;letter-spacing:.08em}.layout{display:grid;grid-template-columns:460px minmax(0,1fr);min-height:calc(100vh - 94px)}aside{border-right:1px solid var(--line);background:#efeee7;position:sticky;top:94px;height:calc(100vh - 94px);overflow:auto}.aside-title{height:58px;padding:0 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);font-size:13px;letter-spacing:.08em}.case-row{width:100%;border:0;border-bottom:1px solid var(--line);background:transparent;display:grid;grid-template-columns:112px 1fr;gap:16px;padding:18px;text-align:left;color:var(--ink);cursor:pointer}.case-row:hover,.case-row.selected{background:#fbfaf5}.case-row.selected{box-shadow:inset 4px 0 var(--accent)}.case-row img{width:112px;height:74px;object-fit:cover;background:#d9ddd7}.case-row b,.case-row small,.case-row em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.case-row b{font-size:14px}.case-row small{margin-top:8px;color:var(--muted);font:11px ui-monospace}.case-row em{margin-top:7px;color:#1680a0;font:700 12px ui-monospace;font-style:normal}#review{min-width:0}.loading,.error{padding:70px;text-align:center;color:var(--muted)}.error{color:#a23b3b}.case-header{padding:30px 34px 24px;display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid var(--line)}.case-header small,.eyebrow{font:700 11px ui-monospace;letter-spacing:.12em;color:#23839e}.case-header h1{font-size:28px;margin:8px 0}.case-header p{margin:0;color:var(--muted)}.button,.documents a,.sync-controls button{border:1px solid var(--ink);padding:12px 16px;color:var(--ink);background:transparent;text-decoration:none;display:inline-block;cursor:pointer}.primary,.sync-controls .primary{background:var(--dark)!important;color:white!important}.segment-tabs{display:flex;gap:8px;padding:18px 34px;border-bottom:1px solid var(--line);overflow:auto}.segment-tabs button{border:1px solid var(--line);background:transparent;padding:10px 14px;white-space:nowrap;color:var(--ink);cursor:pointer}.segment-tabs button.active{background:var(--ink);color:white}.segment{padding:28px 34px}.segment h2{margin:8px 0 20px;font-size:22px}.sync-controls{display:flex;justify-content:flex-end;gap:10px;margin-bottom:14px}.video-grid{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--line);background:var(--panel)}.video-grid article+article{border-left:1px solid var(--line)}.video-grid h3{font-size:14px;margin:0;padding:14px 18px;border-bottom:1px solid var(--line)}video{display:block;width:100%;aspect-ratio:16/9;background:#020b0e}.timeline-panel{margin-top:0;background:var(--dark);color:#eaf3ef;display:grid;grid-template-columns:auto 1fr;gap:28px;padding:20px}.keys{display:grid;grid-template-columns:repeat(6,42px);gap:8px;align-content:start}kbd{height:38px;border:1px solid #688087;border-radius:7px;display:grid;place-items:center;font:700 12px ui-monospace;background:#19323a;transition:.08s}.keys kbd.active{background:#7bedad;color:#082818;border-color:#7bedad;box-shadow:0 0 18px #60d39466}.prompt-event{border-left:1px solid #36525a;padding-left:24px}.prompt-event small{color:#7bedad;font:700 11px ui-monospace;letter-spacing:.1em}.prompt-event p{line-height:1.65;margin:8px 0 0}.downloads{padding:0 34px 48px}.downloads h2{margin:30px 0 16px}.gallery{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.gallery a{border:1px solid var(--line);background:var(--panel);color:var(--ink);text-decoration:none}.gallery img{width:100%;aspect-ratio:16/10;object-fit:cover;background:#dfe3de}.gallery span{display:block;padding:10px;font-size:12px}.documents{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}.documents a{font-size:12px;background:var(--panel)}@media(max-width:1100px){.layout{grid-template-columns:310px minmax(0,1fr)}.case-row{grid-template-columns:72px 1fr}.case-row img{width:72px;height:60px}.video-grid{grid-template-columns:1fr}.video-grid article+article{border-left:0;border-top:1px solid var(--line)}.timeline-panel{grid-template-columns:1fr}.prompt-event{border-left:0;border-top:1px solid #36525a;padding:18px 0 0}.gallery{grid-template-columns:repeat(2,1fr)}}@media(max-width:720px){.topbar{height:72px;padding:0 14px}.topbar nav .active{display:none}.brand-mark{width:42px;height:42px}.layout{display:block}.layout aside{position:relative;top:0;height:auto;max-height:270px;border-right:0;border-bottom:1px solid var(--line)}.case-header,.segment,.downloads{padding-left:16px;padding-right:16px}.segment-tabs{padding:14px 16px}.gallery{grid-template-columns:1fr}.keys{grid-template-columns:repeat(5,42px)}}\n`;

export async function writeStaticReviewBundle(outputDirectory, model) {
  await Promise.all([
    mkdir(join(outputDirectory, "data"), { recursive: true }),
    mkdir(join(outputDirectory, "cases"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(outputDirectory, "index.html"), INDEX_HTML),
    writeFile(join(outputDirectory, "app.js"), APP_JS),
    writeFile(join(outputDirectory, "styles.css"), STYLES_CSS),
    writeFile(join(outputDirectory, "data", "catalog.json"), `${JSON.stringify(model.catalog, null, 2)}\n`),
    writeFile(join(outputDirectory, "data", "publication-plan.json"), `${JSON.stringify({
      kind: "worldkit-static-seedance-publication-plan",
      schemaVersion: 1,
      requests: model.requests,
    }, null, 2)}\n`),
    ...model.cases.map(async (manifest) => {
      const directory = join(outputDirectory, "cases", manifest.episodeId);
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    }),
  ]);
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`Unknown argument '${token}'.`);
    const key = token.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Argument '--${key}' requires a value.`);
    }
    values[key] = value;
    index += 1;
  }
  return values;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const inputPath = resolve(args.input ?? "");
  const outputDirectory = resolve(args.output ?? "");
  if (!args.input || !args.output) {
    throw new Error("Usage: build-seedance-static-review.mjs --input <episodes.json> --output <directory>");
  }
  const payload = JSON.parse(await readFile(inputPath, "utf8"));
  const model = buildStaticReviewModel(payload);
  await writeStaticReviewBundle(outputDirectory, model);
  process.stdout.write(`${JSON.stringify({
    outputDirectory,
    episodeCount: model.catalog.episodes.length,
    requestCount: model.requests.length,
    releaseIdentitySha256: model.catalog.releaseIdentitySha256,
  }, null, 2)}\n`);
}

const invokedPath = process.argv[1] === undefined ? "" : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
