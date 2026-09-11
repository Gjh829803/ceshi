import path from 'node:path';
import {readFile, lstat} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {parseArgs} from 'node:util';
import {sha256File, writeJsonAtomic} from '../visuals/episode-style-variants.mjs';
import {hashVisualInput, normalizeVisualHash, THREE_EPISODE_VISUAL_VERSION} from '../visuals/visual-contracts.mjs';
import {prepareThreeEpisodeRenderRequests} from '../visuals/visuals.mjs';
import {verifyActionEvidence} from '../planning/action-evidence.mjs';

const exec = promisify(execFile);
const read = async file => JSON.parse(await readFile(file, 'utf8'));
const check = (ok, code) => { if (!ok) throw Error('SEEDANCE_PREFLIGHT_' + code); };
const digest = normalizeVisualHash;
const same = (a, b) => hashVisualInput(a) === hashVisualInput(b);
const refIdentity = ref => ({sha256: digest(ref.sha256)});
const readyRequests = ready => ready.requests ?? ready.variants?.flatMap(v => v.requests) ?? [];

async function verifyFile(ref) {
  check(ref && path.isAbsolute(ref.path), 'ABSOLUTE_FILE_REQUIRED');
  const info = await lstat(ref.path);
  check(info.isFile() && !info.isSymbolicLink(), 'REGULAR_FILE_REQUIRED');
  check(digest(await sha256File(ref.path)) === digest(ref.sha256), 'FILE_HASH_CHANGED');
  return ref;
}
async function fileRef(file) {
  const ref = {path: path.resolve(file), sha256: digest(await sha256File(file))};
  return verifyFile(ref);
}
async function checkedJson(ref) { await verifyFile(ref); return read(ref.path); }
async function verifySource(sourcePath) {
  await exec(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('../source/source.ts', import.meta.url)), '--verify', sourcePath], {timeout: 120000, maxBuffer: 1024 * 1024});
}

async function verifyManifestRequest(manifest, requestId, {verifySource: sourceCheck = verifySource} = {}) {
  check(manifest.kind === 'three-episode-ready-seedance' && manifest.schemaVersion === 1, 'MANIFEST_KIND');
  const auth = manifest.authorization;
  check(auth?.seedanceSubmission === true && Number.isInteger(auth.maximumConcurrency) && auth.maximumConcurrency >= 1 && auth.maximumConcurrency <= 160, 'AUTHORIZATION_REQUIRED');
  check(Array.isArray(manifest.requests) && new Set(manifest.requests.map(r => r.id)).size === manifest.requests.length, 'DUPLICATE_REQUEST');
  const request = manifest.requests.find(r => r.id === requestId);
  check(request?.kind === 'worldkit-three-episode-render-request' && request.schemaVersion === 1 && request.status === 'prepared' && request.providerSubmitted === false, 'PREPARED_REQUEST_REQUIRED');
  // Current Episode records complete 30-second segments. A half needs a separate
  // source-frame/opening/event proof adapter; transport support alone is insufficient.
  check(request.durationSeconds === 30, 'FULL_SEGMENT_REQUIRED');
  check(request.id === `${request.styleVariantId}-${request.segmentId}`, 'REQUEST_ID_CHANGED');
  check(hashVisualInput(request.inputIdentity) === request.inputHash, 'INPUT_HASH_CHANGED');
  const [source, capture, ready, history, policy] = await Promise.all([
    checkedJson(manifest.sourceRef), checkedJson(manifest.captureRef), read(manifest.readyPath),
    read(manifest.anchorHistoryPath), read(manifest.rejectionsPath),
  ]);
  await sourceCheck(manifest.sourceRef.path);
  // source.json stores bundle-relative references; the existing source verifier
  // checks confinement and hashes before these paths are used by material review.
  source.targets = source.targets.map(target => ({...target, whiteboxTriview: {...target.whiteboxTriview,
    path: path.resolve(path.dirname(manifest.sourceRef.path), target.whiteboxTriview.path)}}));
  const worldIdentity = Object.fromEntries(['worldId','sourceHash','worldBuildHash','runtimeHash'].map(k => [k, k === 'worldId' ? source[k] : digest(source[k])]));
  check(same(manifest.worldIdentity, worldIdentity), 'SOURCE_IDENTITY_CHANGED');
  check(capture.kind === 'three-episode-visual-capture-input' && capture.schemaVersion === 1 && digest(capture.worldBuildHash) === worldIdentity.worldBuildHash && digest(capture.runtimeHash) === worldIdentity.runtimeHash, 'CAPTURE_RUNTIME_CHANGED');
  const segment = capture.segments.find(s => s.id === request.segmentId);
  check(segment?.status === 'completed' && segment.frameCount === 720 && segment.durationSeconds === 30 && digest(segment.worldBuildHash) === worldIdentity.worldBuildHash && digest(segment.runtimeHash) === worldIdentity.runtimeHash, 'CAPTURE_INCOMPLETE');
  await Promise.all([segment.video, segment.firstFrame, segment.actionEvidence, segment.trace, segment.health].map(verifyFile));
  await verifyActionEvidence(segment);
  check(same(history.worldIdentity, worldIdentity), 'ANCHOR_SOURCE_CHANGED');
  const anchorEntry = history.styles?.[request.styleVariantId];
  const anchor = manifest.styleAnchors[request.styleVariantId];
  check(anchor && anchorEntry?.currentAnchor?.sha256 === anchor.sha256 && !anchorEntry.revisionReview, 'ANCHOR_NO_LONGER_ACCEPTED');
  await verifyFile(anchor);
  check(Array.isArray(policy.rejections), 'REJECTION_POLICY_REQUIRED');
  check(!policy.rejections.some(r => r.caseId === manifest.caseId && r.styleId === request.styleVariantId && digest(r.imageSha256) === digest(anchor.sha256)), 'HUMAN_REJECTED');
  check(ready.episodeId === manifest.episodeId && readyRequests(ready).some(r => r.id === request.id && r.inputHash === request.inputHash), 'REQUEST_NO_LONGER_READY');
  check(!(ready.excludedStyleIds ?? []).includes(request.styleVariantId), 'STYLE_EXCLUDED');
  if (ready.worldIdentity) check(same(ready.worldIdentity, worldIdentity), 'READY_SOURCE_CHANGED');

  const proof = manifest.reviewProofs[request.styleVariantId];
  const [input, stage, review] = await Promise.all([checkedJson(proof.input), checkedJson(proof.stage), checkedJson(proof.result)]);
  check(['style-review','partial-style-review'].includes(stage.kind) && stage.status === 'completed', 'REVIEW_INCOMPLETE');
  check(hashVisualInput({version: THREE_EPISODE_VISUAL_VERSION, kind: stage.kind, input}) === stage.inputHash && review.inputHash === stage.inputHash && same(stage.result, review), 'REVIEW_IDENTITY_CHANGED');
  check(same(input.worldIdentity, worldIdentity) && review.worldId === source.worldId && review.episodeId === manifest.episodeId && review.styleVariantId === request.styleVariantId && review.mode === 'style' && review.reviewer === 'cloud-codex', 'REVIEW_SCOPE_CHANGED');
  check(input.variant.id === request.styleVariantId && input.anchor.sha256 === digest(anchor.sha256), 'REVIEW_ANCHOR_CHANGED');
  const targets = source.targets.map(t => t.id);
  check(same(request.styledTriviews.map(t => t.targetId), targets), 'COMPLETE_TARGETS_REQUIRED');
  const images = [{id: request.segmentId, ...request.styledOpening}, ...request.styledTriviews.map(t => ({...t, id: 'target-' + t.targetId}))];
  for (const image of images) {
    const index = input.images.findIndex(i => i.id === image.id);
    check(index >= 0 && input.images[index].sha256 === digest(image.sha256), 'REVIEW_IMAGE_CHANGED');
    const whitebox = image.id === segment.id ? segment.firstFrame : source.targets.find(t => 'target-' + t.id === image.id).whiteboxTriview;
    await verifyFile(whitebox);
    check(input.whiteboxes[index].sha256 === digest(whitebox.sha256), 'REVIEW_SOURCE_FRAME_CHANGED');
    const finding = review.imageReviews.find(i => i.id === image.id);
    const acceptance = input.userAnchorAcceptance;
    const userAccepted = image.id === 'segment-00' && acceptance?.authority === 'user' && acceptance.scope === 'opening-anchor-only' && acceptance.verdict === 'passed' && acceptance.imageSha256 === digest(image.sha256) && same(anchorEntry.userAcceptance, acceptance);
    check(finding?.verdict === 'passed' || userAccepted, 'IMAGE_NOT_ACCEPTED');
  }
  const openings = capture.segments.map(s => s.id === request.segmentId ? request.styledOpening : null);
  const [rebuilt] = prepareThreeEpisodeRenderRequests({source, capture, variant: input.variant, openings, styledTriviews: request.styledTriviews, events: request.events, segmentIds: [request.segmentId]});
  check(rebuilt.inputHash === request.inputHash && same(rebuilt.inputIdentity, request.inputIdentity) && rebuilt.prompt === request.prompt && same(rebuilt.requestedOutput, request.requestedOutput), 'REQUEST_CONTENT_CHANGED');
  check(same(refIdentity(segment.video), refIdentity(request.video)), 'VIDEO_CHANGED');
  await Promise.all([request.video, request.styledOpening, ...request.styledTriviews].map(verifyFile));
  return {passed: true, requestId, inputHash: request.inputHash, worldBuildHash: worldIdentity.worldBuildHash, runtimeHash: worldIdentity.runtimeHash, durationSeconds: request.durationSeconds};
}

/** Re-read live publication, anchor and rejection state immediately before POST. */
export async function verifySeedanceRequest(manifestPath, requestId, options) {
  return verifyManifestRequest(await read(manifestPath), requestId, options);
}

/** No model calls. Each output directory is an immutable dispatch batch. */
export async function prepareSeedanceManifest({readyPath, sourcePath, capturePath, visualRoot, anchorHistoryPath, rejectionsPath, outputPath, maximumConcurrency = 1, requestIds}, options = {}) {
  const ready = await read(readyPath);
  check(['worldkit-three-episode-ready-render-requests','worldkit-three-episode-pre-seedance','three-episode-fast-ready-clips'].includes(ready.kind), 'READY_KIND');
  const sourceRef = await fileRef(sourcePath), captureRef = await fileRef(capturePath), source = await read(sourcePath);
  const available = readyRequests(ready);
  if(requestIds) check(requestIds.length > 0 && new Set(requestIds).size === requestIds.length && requestIds.every(id=>available.some(r=>r.id===id)), 'REQUEST_SELECTION_INVALID');
  const requests = requestIds ? available.filter(r=>requestIds.includes(r.id)) : available;
  check(requests.length > 0, 'NO_READY_REQUESTS');
  const history = await read(anchorHistoryPath), styleAnchors = {}, reviewProofs = {};
  for (const styleId of new Set(requests.map(r => r.styleVariantId))) {
    const material = ready.kind === 'three-episode-fast-ready-clips' ? ready : await read(path.join(visualRoot, 'variants', styleId, 'visual-manifest.json'));
    const kind = ready.kind === 'three-episode-fast-ready-clips' ? 'partial-style-review' : 'style-review';
    const root = path.join(visualRoot, 'tasks', `${kind}-${material.review.inputHash.slice(0,24)}`);
    reviewProofs[styleId] = {input: await fileRef(path.join(root,'input.json')), stage: await fileRef(path.join(root,'stage.json')), result: await fileRef(path.join(root,'result.json'))};
    styleAnchors[styleId] = history.styles?.[styleId]?.currentAnchor;
  }
  const manifest = {kind:'three-episode-ready-seedance',schemaVersion:1,caseId:ready.episodeId,episodeId:ready.episodeId,
    authorization:{seedanceSubmission:true,maximumConcurrency},
    worldIdentity:Object.fromEntries(['worldId','sourceHash','worldBuildHash','runtimeHash'].map(k => [k,k === 'worldId' ? source[k] : digest(source[k])])),
    sourceRef,captureRef,readyPath:path.resolve(readyPath),anchorHistoryPath:path.resolve(anchorHistoryPath),rejectionsPath:path.resolve(rejectionsPath),reviewProofs,styleAnchors,requests};
  await (options.verifySource ?? verifySource)(sourceRef.path);
  for (const request of requests) await verifyManifestRequest(manifest, request.id, {...options, verifySource:async()=>{}});
  try {
    const prior = await read(outputPath);
    check(same(prior,manifest),'IMMUTABLE_BATCH_CHANGED_USE_NEW_DIRECTORY');
  } catch(error) {
    if(error.code !== 'ENOENT') throw error;
    await writeJsonAtomic(path.resolve(outputPath),manifest);
  }
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if(process.argv[2] !== 'prepare') console.log(JSON.stringify(await verifySeedanceRequest(process.argv[2],process.argv[3])));
  else {
    const {values:v}=parseArgs({args:process.argv.slice(3),options:{...Object.fromEntries(['ready','source','capture','visual-root','anchor-history','rejections','output','maximum-concurrency'].map(k=>[k,{type:'string'}])), 'only-request':{type:'string',multiple:true}}});
    for(const k of ['ready','source','capture','visual-root','anchor-history','rejections','output'])check(v[k],'ARG_'+k);
    const manifest=await prepareSeedanceManifest({readyPath:v.ready,sourcePath:v.source,capturePath:v.capture,visualRoot:v['visual-root'],anchorHistoryPath:v['anchor-history'],rejectionsPath:v.rejections,outputPath:v.output,maximumConcurrency:Number(v['maximum-concurrency']??1),requestIds:v['only-request']});
    console.log(JSON.stringify({manifestPath:path.resolve(v.output),preparedRequestCount:manifest.requests.length,providerSubmissionCount:0}));
  }
}
