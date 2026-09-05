import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir, readFile, lstat} from 'node:fs/promises';
import sharp from 'sharp';
import {createJsonAtomicWriter, loadEpisodeStyleVariantConfig, sha256File, writeJsonAtomic} from '../lib/episode-style-variants.mjs';
import {
  THREE_EPISODE_VISUAL_VERSION, THREE_EPISODE_STYLE_IDS, THREE_EPISODE_EVENT_SLOTS,
  assertThreeEpisodeVisualInputs, assertThreeEpisodeStylePlan,
  assertThreeEpisodeVisualReview, assertThreeEpisodeDiversityReview,
  normalizeThreeEpisodeEvents, normalizeVisualHash, hashVisualInput,
  assertAnchorHashesUnchanged, buildThreeEpisodeRenderPrompt,
} from './visual-contracts.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CODEX_MODEL = 'gpt-6-astra';
const CODEX_REASONING = 'xhigh';
const REVIEW_ATTACHMENT_POLICY = 'asset-id-filenames-v1';
async function json(file) { try { return JSON.parse(await readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
async function fileRef(file) {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) throw new Error(`THREE_EPISODE_VISUAL_FILE_INVALID: ${file}`);
  return {path: path.resolve(file), sha256: normalizeVisualHash(await sha256File(file)), sizeBytes: stat.size};
}
async function verifyRef(ref) {
  const actual = await fileRef(ref.path);
  if (actual.sha256 !== normalizeVisualHash(ref.sha256)) throw new Error(`THREE_EPISODE_VISUAL_STALE_INPUT: ${ref.path}`);
  return actual;
}
async function imageRef(file) {
  const ref = await fileRef(file);
  const info = await sharp(file).metadata();
  if (info.format !== 'png' || !info.width || !info.height) throw new Error(`THREE_EPISODE_VISUAL_IMAGE_INVALID: ${file}`);
  return {...ref, width: info.width, height: info.height};
}
async function mapConcurrent(items, concurrency, operation) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({length: Math.min(items.length, concurrency)}, async () => {
    while (next < items.length) {
      const index = next++;
      try { results[index] = {ok: true, value: await operation(items[index], index)}; }
      catch (error) { results[index] = {ok: false, error}; }
    }
  }));
  const failed = results.filter(item => !item.ok);
  if (failed.length) throw new AggregateError(failed.map(item => item.error), `${failed.length}/${items.length} visual operations failed: ${failed[0].error.message}`);
  return results.map(item => item.value);
}
function concurrencyGate(maximum) {
  let active = 0;
  const queue = [];
  return async operation => {
    if (active >= maximum) await new Promise(resolve => queue.push(resolve));
    else active++;
    try { return await operation(); }
    finally { const next = queue.shift(); if (next) next(); else active--; }
  };
}
const identityRef = ref => ({sha256: normalizeVisualHash(ref.sha256)});
const identityTarget = target => ({id: target.id, name: target.name, role: target.role ?? null, appearancePrompt: target.appearancePrompt ?? null, whiteboxTriview: identityRef(target.whiteboxTriview)});

/** Real videos are used once per style's joint event call, without legacy Scene files. */
export function buildThreeEpisodeEventRequest({variant, capture, openings, promptTemplate, config}) {
  const indices = config.selectedCaptureIndices;
  if (JSON.stringify(indices) !== '[0,2,4]' || config.videoSamplingFps !== 0.25 || config.model !== 'gemini-3.5-flash') throw new Error('THREE_EPISODE_EVENT_CONFIG_INVALID');
  return {
    model: config.model,
    instruction: `${variant.geminiEventPrompt}\n\n${promptTemplate.replace('HOST_EVENT_SLOTS_JSON', JSON.stringify(THREE_EPISODE_EVENT_SLOTS))}\n这些是视频后处理事件，不能声称已经改变白模或执行过SDK命令。`,
    videos: indices.map(index => ({path: capture.segments[index].video.path, samplingFps: config.videoSamplingFps})),
    images: indices.map(index => openings[index].path),
    slots: THREE_EPISODE_EVENT_SLOTS,
    inputIdentity: {
      variantHash: hashVisualInput(variant), config,
      templateHash: hashVisualInput(promptTemplate),
      inputs: indices.map(index => ({segmentId: capture.segments[index].id, video: identityRef(capture.segments[index].video), styledOpening: identityRef(openings[index])})),
    },
  };
}

/** Prepare only. No video provider, credentials or submission helper is imported here. */
export function prepareThreeEpisodeRenderRequests({source, capture, variant, openings, styledTriviews, events}) {
  return capture.segments.map((segment, index) => {
    const segmentEvents = events.filter(event => event.segmentId === segment.id);
    const prompt = buildThreeEpisodeRenderPrompt({variant, segment, styledTriviews, events: segmentEvents});
    const inputIdentity = {
      version: THREE_EPISODE_VISUAL_VERSION, worldBuildHash: normalizeVisualHash(source.worldBuildHash),
      runtimeHash: normalizeVisualHash(source.runtimeHash), variantHash: hashVisualInput(variant),
      video: identityRef(segment.video), opening: identityRef(openings[index]),
      triviews: styledTriviews.map(item => ({targetId: item.targetId, ...identityRef(item)})),
      promptHash: hashVisualInput(prompt),
    };
    return {
      kind: 'worldkit-three-episode-render-request', schemaVersion: 1,
      id: `${variant.id}-${segment.id}`, styleVariantId: variant.id, segmentId: segment.id,
      status: 'prepared', stopBeforeSeedance: true, providerSubmitted: false,
      inputHash: hashVisualInput(inputIdentity), inputIdentity,
      video: segment.video, styledOpening: openings[index], styledTriviews, prompt,
      events: segmentEvents, durationSeconds: 30,
      requestedOutput: {width: 1280, height: 720, fps: 24, frameCount: 720, generateAudio: true, frameSynthesisAllowed: false},
      referencePolicy: {includeAllStyledTriviews: true, targetCount: styledTriviews.length, providerCapabilityStatus: 'not-submitted-not-verified'},
    };
  });
}

/**
 * cloud.runCodex writes declared absolute outputs inside outputRoot.
 * cloud.generateImages writes native PNGs to item.outputPath.
 * cloud.generateEvents writes {events:[five Gemini outputs]} to outputPath.
 * Each helper owns provider idempotence/reconciliation for the stable task ID.
 */
export async function runThreeEpisodeVisuals({source, capture, episodeId, outputRoot, cloud, onProgress = async () => {}, stopBeforeSeedance = true, repoRoot = REPO_ROOT, stylePlanCandidate}) {
  if (stopBeforeSeedance !== true) throw new Error('THREE_EPISODE_SEEDANCE_DISABLED: this worker only prepares pre-Seedance artifacts');
  assertThreeEpisodeVisualInputs(source, capture);
  if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(episodeId ?? '')) throw new Error('THREE_EPISODE_VISUAL_EPISODE_ID_INVALID');
  for (const name of ['runCodex', 'generateImages', 'generateEvents']) if (typeof cloud?.[name] !== 'function') throw new Error(`THREE_EPISODE_VISUAL_PROVIDER_MISSING: ${name}`);
  outputRoot = path.resolve(outputRoot);
  await mkdir(outputRoot, {recursive: true});
  await Promise.all([...capture.segments.flatMap(item => [item.video, item.firstFrame]), ...source.targets.map(item => item.whiteboxTriview)].map(verifyRef));
  const [config, directorPrompt, imagePrompt, reviewPrompt, eventConfig, eventPrompt] = await Promise.all([
    loadEpisodeStyleVariantConfig(repoRoot),
    readFile(path.join(repoRoot, 'config/prompts/three-episode-style-director.md'), 'utf8'),
    readFile(path.join(repoRoot, 'config/prompts/three-episode-image.md'), 'utf8'),
    readFile(path.join(repoRoot, 'config/prompts/three-episode-review.md'), 'utf8'),
    json(path.join(repoRoot, 'config/episode-visual-event-director.json')),
    readFile(path.join(repoRoot, 'config/prompts/episode-visual-event-director.zh-CN.md'), 'utf8'),
  ]);
  const saveState = createJsonAtomicWriter(path.join(outputRoot, 'visual-state.json'));
  const generateImageWithSlot = concurrencyGate(config.visualConcurrency);
  const runCodexWithSlot = concurrencyGate(config.reviewConcurrency);
  const state = {kind: 'worldkit-three-episode-visual-state', schemaVersion: 1, worldId: source.worldId, episodeId, status: 'running', stage: 'planning', stopBeforeSeedance: true, providerVideoSubmissionCount: 0, variants: THREE_EPISODE_STYLE_IDS.map(id => ({id, stage: 'pending'}))};
  const update = async (stage, styleId, extra = {}) => {
    if (styleId) Object.assign(state.variants.find(item => item.id === styleId), {stage, ...extra}); else Object.assign(state, {stage, ...extra});
    await saveState(structuredClone(state));
    await onProgress(structuredClone(state));
  };
  const worldIdentity = {worldId: source.worldId, sourceHash: normalizeVisualHash(source.sourceHash), worldBuildHash: normalizeVisualHash(source.worldBuildHash), runtimeHash: normalizeVisualHash(source.runtimeHash)};
  const targetIds = source.targets.map(target => target.id);
  const openingWhiteboxes = await Promise.all(capture.segments.map(item => imageRef(item.firstFrame.path)));
  const targetWhiteboxes = await Promise.all(source.targets.map(item => imageRef(item.whiteboxTriview.path)));

  async function stage(kind, input, execute, validate) {
    const inputHash = hashVisualInput({version: THREE_EPISODE_VISUAL_VERSION, kind, input});
    const root = path.join(outputRoot, 'tasks', `${kind}-${inputHash.slice(0, 24)}`);
    const recordPath = path.join(root, 'stage.json');
    const prior = await json(recordPath);
    if (prior?.status === 'completed' && prior.inputHash === inputHash) {
      try {
        await Promise.all(prior.files.map(verifyRef));
        await validate(prior.result, inputHash);
        return prior.result;
      } catch { /* Content changed: reconcile the same stable task with the provider. */ }
    }
    await mkdir(root, {recursive: true});
    await writeJsonAtomic(path.join(root, 'input.json'), input);
    await writeJsonAtomic(recordPath, {kind, inputHash, status: 'running'});
    try {
      const {result, files, evidence} = await execute({root, inputHash, taskId: `three-episode-${kind}-${inputHash.slice(0, 24)}`});
      await validate(result, inputHash);
      const checkedFiles = await Promise.all(files.map(fileRef));
      await writeJsonAtomic(recordPath, {kind, inputHash, status: 'completed', result, files: checkedFiles, evidence: evidence ?? null});
      return result;
    } catch (error) {
      await writeJsonAtomic(recordPath, {kind, inputHash, status: 'failed', message: error.message});
      throw error;
    }
  }
  async function codexJson(kind, input, assets, instruction, validate) {
    const attachedImages = assets.map(asset => ({ assetId: asset.id, logicalImageId: asset.logicalImageId ?? asset.id,
      ...(kind.includes('review') ? { name: `${asset.id}${path.extname(asset.path).toLowerCase()}`, attachmentPolicy: REVIEW_ATTACHMENT_POLICY } : {}) }));
    return stage(kind, {...input, attachedImages, instruction, model: CODEX_MODEL, reasoningEffort: CODEX_REASONING}, async ({root, inputHash, taskId}) => {
      const outputPath = path.join(root, 'result.json');
      const context = {...input, attachedImages, inputHash, worldId: source.worldId, episodeId};
      const contextPath = path.join(root, 'context.json');
      await writeJsonAtomic(contextPath, context);
      const evidence = await runCodexWithSlot(() => cloud.runCodex({taskId, instruction: `${instruction}\nExact task identity and full inputs are in the attached context.json. attachedImages maps each transport assetId to its logical image or target identity. Output result.json. Copy inputHash=${inputHash}; worldId=${source.worldId}; episodeId=${episodeId}.`, assets: [{id: 'context', path: contextPath, attachAs: 'file'}, ...assets], outputs: [{path: outputPath, required: true, contentType: 'application/json'}], model: CODEX_MODEL, reasoningEffort: CODEX_REASONING, outputRoot: root}));
      const result = await json(outputPath);
      await validate(result, inputHash);
      return {result, files: [outputPath], evidence};
    }, (result, inputHash) => validate(result, inputHash));
  }
  async function generateImage(kind, {id, prompt, references, width, height, generationContext = null}) {
    const input = {id, prompt, references: references.map(identityRef), width, height, generationContext};
    return stage(kind, input, async ({root, taskId, inputHash}) => {
      const nativePath = path.join(root, 'native.png');
      const evidence = await generateImageWithSlot(() => cloud.generateImages({batchId: taskId, items: [{id: `image-${hashVisualInput(id).slice(0, 24)}`, prompt, images: references.map(ref => ref.path), outputPath: nativePath, width, height}], outputRoot: root}));
      const native = await imageRef(nativePath);
      if (Math.abs(native.width / native.height - width / height) > 0.015) throw new Error(`THREE_EPISODE_VISUAL_ASPECT_MISMATCH: ${id} expected ${width}x${height}, received ${native.width}x${native.height}; cropping is not permitted`);
      const outputPath = path.join(root, 'image.png');
      await sharp(nativePath).resize(width, height, {fit: 'fill'}).png().toFile(outputPath);
      const result = {...await imageRef(outputPath), id, native, generationInputHash: inputHash, generationContext, derivation: native.width === width && native.height === height ? 'png-encoding' : 'resize-same-aspect-no-crop'};
      return {result, files: [nativePath, outputPath], evidence};
    }, async result => { await verifyRef(result); await verifyRef(result.native); });
  }
  const imageAsset = (id, ref) => ({id: `asset-${hashVisualInput(id).slice(0, 24)}`, logicalImageId: id, path: ref.path, attachAs: 'image'});
  const reviewSchema = (mode, imageIds, styleVariantId = null) => ({kind: 'worldkit-three-episode-visual-review', schemaVersion: 1, reviewer: 'cloud-codex', worldId: source.worldId, episodeId, inputHash: '<copy supplied identity>', mode, styleVariantId, verdict: 'passed | needs-repair', imageReviews: imageIds.map(id => ({id, verdict: 'passed | needs-repair', observations: '<actual visual findings>'})), summary: '<aggregate findings>', repairInstructions: '<required when needs-repair>'});
  const diversitySchema = {kind: 'worldkit-three-episode-diversity-review', schemaVersion: 1, reviewer: 'cloud-codex', worldId: source.worldId, episodeId, inputHash: '<copy supplied identity>', verdict: 'passed | needs-repair', dimensionReviews: ['spatial-registration', 'subjects', 'environments', 'landmarks', 'overall-read'].map(dimension => ({dimension, verdict: 'passed | needs-repair', observations: '<actual findings>'})), variantReviews: THREE_EPISODE_STYLE_IDS.map(styleVariantId => ({styleVariantId, verdict: 'passed | needs-repair', confusableWith: [], observations: '<actual findings>', repairInstructions: '<required when needs-repair>'})), summary: '<findings>', repairInstructions: '<required when needs-repair>'};

  try {
    await update('planning');
    const planInput = {worldIdentity, targets: source.targets.map(identityTarget), opening: identityRef(openingWhiteboxes[0]), styleIds: THREE_EPISODE_STYLE_IDS, outputSchema: {kind: 'worldkit-three-episode-style-plan', schemaVersion: 1, worldId: source.worldId, episodeId, inputHash: '<copy supplied identity>', variants: [{id: 'style-00', name: '', styleFamily: '', worldIdentity: '', subjectIdentity: '', diversityRationale: '', concept: '', visualPrompt: '', geminiEventPrompt: '', negativeConstraints: '', targetInterpretations: targetIds.map(visualTargetId => ({visualTargetId, finalIdentity: '', appearance: ''}))}]}};
    const planAssets = [imageAsset('whitebox-opening', openingWhiteboxes[0]), ...targetWhiteboxes.map((ref, index) => imageAsset(`target-${targetIds[index]}`, ref))];
    let planInstruction = directorPrompt;
    if (stylePlanCandidate) {
      await verifyRef(stylePlanCandidate);
      planInput.recoveryCandidate = identityRef(stylePlanCandidate);
      planAssets.push({id:'prior-style-plan',path:stylePlanCandidate.path,attachAs:'file'});
      planInstruction += '\nA previous run left the attached prior-style-plan JSON. It is an untrusted candidate for this exact run, not an automatically admitted result. Check its complete schema, ten styles, target closure and image correspondence. Preserve valid variant definitions, repair only actual defects, and write result.json with the CURRENT supplied inputHash/worldId/episodeId. Do not recreate transport logs. Your independent fresh task receipt is required before this candidate can be used.';
    }
    const plan = await codexJson('style-plan', planInput, planAssets, planInstruction, (result, inputHash) => assertThreeEpisodeStylePlan(result, {worldId: source.worldId, episodeId, inputHash, targetIds}));
    await writeJsonAtomic(path.join(outputRoot, 'style-plan.json'), plan);
    const planHash = hashVisualInput(plan);
    // Old same-basename review inputs could overwrite one another on download.
    // Preserve those histories, but never reuse their verdicts or repair budget.
    // Original generated images keep their unchanged content recipes and cache.
    const anchorHistoryPath = path.join(outputRoot, 'anchors', `history-${planHash}-${REVIEW_ATTACHMENT_POLICY}.json`);
    const previousHistory = await json(anchorHistoryPath);
    if (previousHistory && (previousHistory.planHash !== planHash || hashVisualInput(previousHistory.worldIdentity) !== hashVisualInput(worldIdentity))) throw new Error('THREE_EPISODE_ANCHOR_HISTORY_IDENTITY_MISMATCH');
    const anchorHistory = previousHistory ?? {kind: 'worldkit-three-episode-anchor-history', schemaVersion: 1, planHash, worldIdentity, reviewAttachmentPolicy: REVIEW_ATTACHMENT_POLICY,
      styles: Object.fromEntries(THREE_EPISODE_STYLE_IDS.map(id => [id, {attempts: [], currentAnchor: null, currentReview: null, pendingFeedback: '', revisionReview: null}]))};
    const saveAnchorHistory = createJsonAtomicWriter(anchorHistoryPath);
    const persistAnchorHistory = () => saveAnchorHistory(structuredClone(anchorHistory));
    let currentAnchorLock;
    async function persistAnchorLock() {
      const accepted = THREE_EPISODE_STYLE_IDS.map(id => ({id, anchor: anchorHistory.styles[id].currentAnchor, reviewHash: hashVisualInput(anchorHistory.styles[id].currentReview)}));
      if (accepted.some(item => !item.anchor || anchorHistory.styles[item.id].revisionReview)) return;
      const value = {kind: 'worldkit-three-episode-anchor-lock', schemaVersion: 1, worldIdentity, planHash, anchors: accepted, anchorHistoryPath};
      const lockHash = hashVisualInput(value), lockPath = path.join(outputRoot, 'anchors', `lock-${lockHash}.json`);
      const prior = await json(lockPath);
      if (prior && hashVisualInput(prior) !== hashVisualInput(value)) throw new Error('THREE_EPISODE_ANCHOR_LOCK_CHANGED');
      if (!prior) await writeJsonAtomic(lockPath, value);
      currentAnchorLock = {path: lockPath, sha256: normalizeVisualHash(await sha256File(lockPath)), lockHash};
      // Immutable lock files remain intact. Only this explicitly named pointer moves.
      await writeJsonAtomic(path.join(outputRoot, 'current-opening-anchor-lock.json'), currentAnchorLock);
    }
    async function reviseAnchor(styleId, feedback, review) {
      const entry = anchorHistory.styles[styleId];
      entry.pendingFeedback = feedback; entry.revisionReview = review;
      await persistAnchorHistory();
    }
    async function obtainAnchor(variant) {
      const entry = anchorHistory.styles[variant.id];
      if (entry.currentAnchor && !entry.revisionReview) { await verifyRef(entry.currentAnchor); return entry.currentAnchor; }
      const feedback = entry.pendingFeedback || '', feedbackHash = hashVisualInput(feedback);
      let attempt = entry.attempts.at(-1);
      if (!attempt || !['pending', 'generated'].includes(attempt.status) || attempt.feedbackHash !== feedbackHash) {
        if (entry.attempts.length >= config.maximumOpeningAttempts) throw new Error(`THREE_EPISODE_OPENING_REPAIR_BUDGET_EXHAUSTED: ${variant.id} used ${entry.attempts.length}/${config.maximumOpeningAttempts} durable attempts`);
        attempt = {index: entry.attempts.length, status: 'pending', feedbackHash, feedback, supersedesAnchorSha256: entry.currentAnchor?.sha256 ?? null,
          triggeringReviewHash: entry.revisionReview ? hashVisualInput(entry.revisionReview) : null};
        entry.attempts.push(attempt); await persistAnchorHistory();
      }
      const prompt = `${imagePrompt}\nCreate styled scene segment-00 at ${openingWhiteboxes[0].width}x${openingWhiteboxes[0].height}. Image 1 is the true whitebox scene; remaining images are complete whitebox targets in the following order: ${targetIds.join(', ')}.\nStyle: ${JSON.stringify(variant)}\n${feedback}`;
      const image = await generateImage('opening-anchor', {id: variant.id, prompt, references: [openingWhiteboxes[0], ...targetWhiteboxes], width: openingWhiteboxes[0].width, height: openingWhiteboxes[0].height,
        generationContext: {anchorAttempt: attempt.index, supersedesAnchorSha256: attempt.supersedesAnchorSha256, triggeringReviewHash: attempt.triggeringReviewHash}});
      attempt.status = 'generated'; attempt.image = image; await persistAnchorHistory(); return image;
    }
    async function acceptAnchor(styleId, image, review) {
      const entry = anchorHistory.styles[styleId], attempt = entry.attempts.find(item => item.image?.path === image.path);
      if (!attempt) throw new Error('THREE_EPISODE_ANCHOR_ATTEMPT_MISSING');
      attempt.status = 'accepted'; attempt.acceptedByReviewHash ??= hashVisualInput(review);
      entry.currentAnchor = image; entry.currentReview = review; entry.revisionReview = null; entry.pendingFeedback = '';
      await persistAnchorHistory();
    }
    async function rejectAnchor(styleId, image, feedback, review) {
      const entry = anchorHistory.styles[styleId], attempt = entry.attempts.find(item => item.image?.path === image.path);
      // Do not rewrite the historical acceptance. A later independent rejection
      // requests a new revision and preserves the old immutable image/lock.
      if (attempt && attempt.status !== 'accepted') attempt.status = 'needs-repair';
      await reviseAnchor(styleId, feedback, review);
    }
    async function repairLockedAnchor(variant, rejectedAnchor, review) {
      const finding = review.imageReviews.find(item => item.id === 'segment-00');
      await rejectAnchor(variant.id, rejectedAnchor, `Independent review correction: ${finding.observations}\n${review.repairInstructions}`, review);
      for (;;) {
        await update('anchor-repair', variant.id, {anchorAttemptsUsed: anchorHistory.styles[variant.id].attempts.length});
        const candidate = await obtainAnchor(variant);
        const input = {worldIdentity, variant, candidate: identityRef(candidate), whitebox: identityRef(openingWhiteboxes[0]),
          anchorAttempt: candidate.generationContext.anchorAttempt, supersedesAnchorSha256: rejectedAnchor.sha256,
          triggeringReviewHash: hashVisualInput(review), outputSchema: reviewSchema('anchors', [variant.id], variant.id)};
        const replacementReview = await codexJson('anchor-repair-review', input, [imageAsset('whitebox-opening', openingWhiteboxes[0]), imageAsset(variant.id, candidate)], reviewPrompt,
          (result, inputHash) => assertThreeEpisodeVisualReview(result, {worldId: source.worldId, episodeId, inputHash, mode: 'anchors', styleVariantId: variant.id, imageIds: [variant.id]}));
        if (replacementReview.verdict === 'passed') { await acceptAnchor(variant.id, candidate, replacementReview); await persistAnchorLock(); return candidate; }
        await rejectAnchor(variant.id, candidate, `Independent review correction: ${replacementReview.imageReviews[0].observations}\n${replacementReview.repairInstructions}`, replacementReview);
      }
    }
    let variants;
    let diversityReview;
    let anchors;
    let anchorReview;
    for (let visualRound = 0; visualRound < config.maximumVisualAttempts; visualRound++) {
      for (let attempt = 0; attempt < config.maximumOpeningAttempts; attempt++) {
        await update('opening-anchors', null, {visualRound, openingAttempt: attempt});
        anchors = await mapConcurrent(plan.variants, config.visualConcurrency, async variant => {
          await update('opening-anchor', variant.id);
          return obtainAnchor(variant);
        });
        const input = {worldIdentity, planHash: hashVisualInput(plan), anchors: anchors.map((ref, index) => ({id: THREE_EPISODE_STYLE_IDS[index], ...identityRef(ref)})), whitebox: identityRef(openingWhiteboxes[0]), outputSchema: reviewSchema('anchors', THREE_EPISODE_STYLE_IDS)};
        anchorReview = await codexJson('anchor-review', input, [imageAsset('whitebox-opening', openingWhiteboxes[0]), ...anchors.map((ref, index) => imageAsset(THREE_EPISODE_STYLE_IDS[index], ref))], reviewPrompt, (result, inputHash) => assertThreeEpisodeVisualReview(result, {worldId: source.worldId, episodeId, inputHash, mode: 'anchors', imageIds: THREE_EPISODE_STYLE_IDS}));
        for (const finding of anchorReview.imageReviews) {
          const image = anchors[THREE_EPISODE_STYLE_IDS.indexOf(finding.id)];
          if (finding.verdict === 'passed') await acceptAnchor(finding.id, image, anchorReview);
          else await rejectAnchor(finding.id, image, `Independent review correction: ${finding.observations}\n${anchorReview.repairInstructions}`, anchorReview);
        }
        if (anchorReview.verdict === 'passed') break;
      }
      if (anchorReview.verdict !== 'passed') throw new Error('THREE_EPISODE_OPENING_REPAIR_BUDGET_EXHAUSTED');
      const lockedAnchorRefs = [...anchors], anchorHashes = lockedAnchorRefs.map(item => item.sha256);
      await persistAnchorLock();
      variants = await mapConcurrent(plan.variants, config.visualConcurrency, async (variant, styleIndex) => {
        let anchor = anchors[styleIndex];
        const feedback = new Map();
        let images, review;
        const imageIds = [...capture.segments.map(item => item.id), ...targetIds.map(id => `target-${id}`)];
        for (let attempt = 0; attempt < config.maximumVisualAttempts; attempt++) {
          await update('style-images', variant.id, {attempt});
          images = await mapConcurrent(imageIds.slice(1), 2, async id => {
            const segmentIndex = capture.segments.findIndex(item => item.id === id);
            const targetIndex = targetIds.findIndex(targetId => `target-${targetId}` === id);
            const whitebox = segmentIndex >= 0 ? openingWhiteboxes[segmentIndex] : targetWhiteboxes[targetIndex];
            const interpretation = segmentIndex >= 0 ? null : variant.targetInterpretations[targetIndex];
            const appearance = {id:variant.id,styleFamily:variant.styleFamily,subjectIdentity:variant.subjectIdentity,negativeConstraints:variant.negativeConstraints,
              targetInterpretations:interpretation?[interpretation]:variant.targetInterpretations};
            const prompt = `${imagePrompt}\nImage 1 is the ONLY composition, pose and visibility authority: the actual ${segmentIndex >= 0 ? 'whitebox scene first frame' : 'complete whitebox target tri-view'} for ${id}. Image 2 supplies APPEARANCE ONLY: palette, materials, lighting and identities.\nOutput ${whitebox.width}x${whitebox.height}. Conditional appearance dictionary: ${JSON.stringify(appearance)}\n${interpretation ? `Render ONLY the specified target in the exact supplied three-view arrangement: ${JSON.stringify(interpretation)}` : 'The dictionary is not a scene checklist. Do not insert any target that is absent from Image 1, even if it is prominent in Image 2. Do not copy the anchor camera, layout, foreground arrangement or target distance. Keep tiny distant objects tiny and distant.'}\nOmit any semantic decoration that would add geometry outside the source silhouettes, expand a footprint, or change ground contacts. Preserve the exact source pose.\n${feedback.get(id) ?? ''}`;
            return generateImage('style-image', {id: `${variant.id}-${id}`, prompt, references: [whitebox, anchor], width: whitebox.width, height: whitebox.height});
          });
          images = [anchor, ...images];
          await update('style-review', variant.id);
          const input = {worldIdentity, variant, anchor: identityRef(anchor), images: images.map((ref, index) => ({id: imageIds[index], ...identityRef(ref)})), whiteboxes: [...openingWhiteboxes, ...targetWhiteboxes].map(identityRef), outputSchema: reviewSchema('style', imageIds, variant.id)};
          review = await codexJson('style-review', input, [...openingWhiteboxes.map((ref, index) => imageAsset(`whitebox-${capture.segments[index].id}`, ref)), ...targetWhiteboxes.map((ref, index) => imageAsset(`whitebox-target-${targetIds[index]}`, ref)), ...images.map((ref, index) => imageAsset(`styled-${imageIds[index]}`, ref))], reviewPrompt, (result, inputHash) => assertThreeEpisodeVisualReview(result, {worldId: source.worldId, episodeId, inputHash, styleVariantId: variant.id, mode: 'style', imageIds}));
          if (review.verdict === 'passed') break;
          if (review.imageReviews[0].verdict !== 'passed') {
            anchor = await repairLockedAnchor(variant, anchor, review); anchors[styleIndex] = anchor;
            feedback.clear(); attempt = -1; continue;
          }
          for (const finding of review.imageReviews.filter(item => item.verdict === 'needs-repair')) feedback.set(finding.id, `${feedback.get(finding.id) ?? ''}\nIndependent review correction: ${finding.observations}\n${review.repairInstructions}`);
        }
        if (review.verdict !== 'passed') throw new Error(`THREE_EPISODE_VISUAL_REPAIR_BUDGET_EXHAUSTED: ${variant.id}`);
        await update('images-ready', variant.id);
        const result = {id: variant.id, variant, anchor, openings: images.slice(0, 6).map((ref, index) => ({...ref, segmentId: capture.segments[index].id})), styledTriviews: images.slice(6).map((ref, index) => ({...ref, targetId: targetIds[index], name: variant.targetInterpretations[index].finalIdentity})), review};
        await writeJsonAtomic(path.join(outputRoot, 'variants', variant.id, 'visual-manifest.json'), result);
        return result;
      });
      assertAnchorHashesUnchanged(anchorHashes, await Promise.all(lockedAnchorRefs.map(async item => (await verifyRef(item)).sha256)));
      await persistAnchorLock();
      await update('diversity-review');
      diversityReview = await codexJson('diversity-review', {worldIdentity, plan, variants: variants.map(item => ({id: item.id, openings: item.openings.map(identityRef), triviews: item.styledTriviews.map(ref => ({targetId: ref.targetId, ...identityRef(ref)})), reviewHash: hashVisualInput(item.review)})), outputSchema: diversitySchema}, [imageAsset('whitebox-opening', openingWhiteboxes[0]), ...variants.flatMap(item => [imageAsset(`${item.id}-opening`, item.anchor), ...item.styledTriviews.map(ref => imageAsset(`${item.id}-target-${ref.targetId}`, ref))])], reviewPrompt, (result, inputHash) => assertThreeEpisodeDiversityReview(result, {worldId: source.worldId, episodeId, inputHash}));
      if (diversityReview.verdict === 'passed') break;
      for (const finding of diversityReview.variantReviews.filter(item => item.verdict === 'needs-repair')) await reviseAnchor(finding.styleVariantId, `Independent diversity correction: ${finding.observations}\n${finding.repairInstructions}\n${diversityReview.repairInstructions}`, diversityReview);
    }
    if (diversityReview.verdict !== 'passed') throw new Error('THREE_EPISODE_DIVERSITY_REPAIR_BUDGET_EXHAUSTED');
    await writeJsonAtomic(path.join(outputRoot, 'diversity-review.json'), diversityReview);
    await update('visual-events');
    const prepared = await mapConcurrent(variants, config.geminiConcurrency, async result => {
      await update('visual-events', result.id);
      const eventRequest = buildThreeEpisodeEventRequest({variant: result.variant, capture, openings: result.openings, promptTemplate: eventPrompt, config: eventConfig});
      const eventResult = await stage('visual-events', eventRequest.inputIdentity, async ({root, taskId}) => {
        const outputPath = path.join(root, 'events-raw.json');
        const evidence = await cloud.generateEvents({...eventRequest, taskId, outputPath, outputRoot: root});
        const raw = await json(outputPath);
        return {result: {raw, events: normalizeThreeEpisodeEvents(raw)}, files: [outputPath], evidence};
      }, item => normalizeThreeEpisodeEvents(item.raw));
      const requests = prepareThreeEpisodeRenderRequests({source, capture, variant: result.variant, openings: result.openings, styledTriviews: result.styledTriviews, events: eventResult.events});
      const variantRoot = path.join(outputRoot, 'variants', result.id);
      await writeJsonAtomic(path.join(variantRoot, 'events.json'), {kind: 'worldkit-three-episode-visual-events', schemaVersion: 1, application: 'video-render-only', model: eventConfig.model, inputIdentity: eventRequest.inputIdentity, events: eventResult.events});
      await writeJsonAtomic(path.join(variantRoot, 'prepared-render-requests.json'), requests);
      await update('pre-seedance-ready', result.id, {preparedRequestCount: requests.length});
      return {...result, events: eventResult.events, requests};
    });
    const output = {kind: 'worldkit-three-episode-pre-seedance', schemaVersion: 1, worldIdentity, episodeId, status: 'pre-seedance-ready', stopBeforeSeedance: true, providerVideoSubmissionCount: 0, plan, anchors, anchorReview, currentAnchorLock, anchorHistoryPath, diversityReview, variants: prepared, preparedRequestCount: prepared.reduce((sum, item) => sum + item.requests.length, 0)};
    if (output.preparedRequestCount !== 60) throw new Error('THREE_EPISODE_RENDER_REQUEST_CLOSURE_INVALID');
    await writeJsonAtomic(path.join(outputRoot, 'pre-seedance-manifest.json'), output);
    await update('pre-seedance-ready', null, {status: 'completed', preparedRequestCount: 60});
    return output;
  } catch (error) {
    await update(state.stage, null, {status: 'failed', error: error.message});
    throw error;
  }
}
