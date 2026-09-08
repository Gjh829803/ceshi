import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { runThreeEpisodeVisuals, buildThreeEpisodeEventRequest, prepareThreeEpisodeRenderRequests } from './visuals.mjs';
import { buildPrefetchedEventRequest } from './event-prefetch.mjs';
import { assertThreeEpisodeVisualInputs, assertThreeEpisodeStylePlan, normalizeThreeEpisodeEvents, THREE_EPISODE_STYLE_IDS } from './visual-contracts.mjs';

const temporary = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function ref(filename) { return { path: filename, sha256: createHash('sha256').update(await readFile(filename)).digest('hex') }; }
const event = () => ({ targetNames: ['main subject'], eventClass: 'atmospheric-spectacle', magnitude: 'large-scale', frameImpact: { scope: 'sky-dominant', coverage: 'large', contrast: 'dramatic' },
  dominantChange: 'Aurora appears', targetContext: 'Sky behind the subject', beforeState: 'Clear sky', transitionDescription: 'Colored light spreads across the sky', afterState: 'Aurora remains', spatialContinuity: 'Keep camera, terrain, silhouettes and movement unchanged', audioDescription: 'Environmental sound only', negativeConstraints: 'No teleport, cut, camera motion or SDK commands', timing: { transitionDurationSeconds: 2, ending: 'hold', endingDurationSeconds: 2 } });
test('binds short actual action observations into event and render prompts and input identities', async () => {
  const setup = await fixture();
  const { capture, source } = setup;
  const config = { model: 'gemini-3.5-flash', selectedCaptureIndices: [0, 2, 4], videoSamplingFps: .25 };
  const variant = { id: 'style-00', geminiEventPrompt: 'Keep recorded actions', worldIdentity: 'world', subjectIdentity: 'traveler', visualPrompt: 'painted', negativeConstraints: 'preserve motion' };
  const openings = capture.segments.map(segment => segment.firstFrame), anchor = openings[0], appearanceLock = { anchorSha256: anchor.sha256 };
  const args = { variant, capture, openings, promptTemplate: 'HOST_EVENT_SLOTS_JSON', config };
  const baseline = buildThreeEpisodeEventRequest(args).inputIdentity;
  const baselinePrefetch = buildPrefetchedEventRequest({ ...args, anchor, appearanceLock }).inputIdentity;
  const baselineRender = prepareThreeEpisodeRenderRequests({ source, capture, variant, openings, styledTriviews: [], events: [] })[0].inputHash;
  capture.segments[0].actionTimeline = [{ goalId: 'slide-under-beam', intent: { kind: 'skill', action: 'slide' }, targetId: null, result: 'succeeded', startTick: 13, endTick: 41, startFrame: 5, endFrame: 16, stateChanges: [{ tick: 14, frame: 5, state: { character: { activeAction: { action: 'slide', phase: 'lower' } } } }] }];
  const request = buildThreeEpisodeEventRequest(args);
  assert.match(request.instruction, /slide-under-beam/); assert.match(request.instruction, /"startTick":13/);
  assert.notDeepEqual(request.inputIdentity, baseline);
  const prefetched = buildPrefetchedEventRequest({ ...args, anchor, appearanceLock });
  assert.match(prefetched.instruction, /"endTick":41/); assert.notDeepEqual(prefetched.inputIdentity, baselinePrefetch);
  const rendered = prepareThreeEpisodeRenderRequests({ source, capture, variant, openings, styledTriviews: [], events: [] })[0];
  assert.match(rendered.prompt, /slide-under-beam/); assert.notEqual(rendered.inputHash, baselineRender);
  const before = rendered.inputHash;
  capture.segments[0].actionTimeline[0].result = 'cancelled';
  assert.notEqual(prepareThreeEpisodeRenderRequests({ source, capture, variant, openings, styledTriviews: [], events: [] })[0].inputHash, before);
});
async function fixture({ failImageOnce = false, rejectLockedAnchorOnce = false, rejectReplacementAnchors = false } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'three-episode-visual-test-')); temporary.push(root);
  const openingPath = path.join(root, 'whitebox.png'), triviewPath = path.join(root, 'triview.png'), videoPath = path.join(root, 'whitebox.mp4');
  await sharp({ create: { width: 96, height: 54, channels: 3, background: '#558877' } }).png().toFile(openingPath);
  await sharp({ create: { width: 96, height: 32, channels: 3, background: '#aa8866' } }).png().toFile(triviewPath);
  await writeFile(videoPath, 'fixture video bytes; media integrity is proven by capture tests, not this provider mock');
  const worldBuildHash = 'a'.repeat(64), runtimeHash = 'b'.repeat(64);
  const source = { worldId: 'fixture-world', sourceHash: 'c'.repeat(64), worldBuildHash, runtimeHash,
    targets: await Promise.all(Array.from({ length: 7 }, async (_, index) => ({ id: index === 0 ? 'CamelNPC/骆驼' : `target-${index}`, name: `Target ${index}`, role: 'complete-target', whiteboxTriview: await ref(triviewPath) }))) };
  const capture = { worldBuildHash, runtimeHash, segments: await Promise.all(Array.from({ length: 6 }, async (_, index) => ({ id: `segment-0${index}`, status: 'completed', video: await ref(videoPath), firstFrame: await ref(openingPath) }))) };
  const calls = { codex: 0, images: 0, events: 0, videos: 0, maximumImageConcurrency: 0, activeImages: 0, failedOnce: false, tasks: [], lockedAnchorRejected: false, imageCountsByStyle: {} };
  const cloud = {
    async runCodex(args) {
      calls.codex++; calls.tasks.push(args.taskId);
      if(args.assets.some(a=>a.logicalImageId==='user-original-reference'||a.path===source.referenceImage?.path)) calls.referenceTasks=(calls.referenceTasks??0)+1;
      assert.equal(args.model, 'gpt-6-astra'); assert.equal(args.reasoningEffort, 'xhigh');
      for (const asset of args.assets) assert.match(asset.id, /^[a-z0-9][a-z0-9-]{2,119}$/);
      const context = JSON.parse(await readFile(args.assets.find(asset => asset.id === 'context').path, 'utf8'));
      const schema = context.outputSchema;
      if(schema.kind.includes('review')){
        const names=context.attachedImages.map(image=>image.name);
        assert.equal(new Set(names).size,names.length);
        assert.deepEqual(names,args.assets.filter(asset=>asset.id!=='context').map(asset=>asset.id+path.extname(asset.path).toLowerCase()));
      }
      let result = { ...structuredClone(schema), inputHash: context.inputHash };
      if (schema.kind === 'worldkit-three-episode-style-plan') {
        result.variants = THREE_EPISODE_STYLE_IDS.map((id, index) => ({ id, ...(context.sourceStylePolicy?.referenceStyleVariantId === id ? {styleMode:'source-reference',referenceImageSha256:context.sourceStylePolicy.referenceImageSha256} : {}), name: `name ${index}`, styleFamily: `family ${index}`, worldIdentity: `world ${index}`, subjectIdentity: `subject ${index}`, diversityRationale: `rationale ${index}`, concept: `concept ${index}`, visualPrompt: `visual ${index}`, geminiEventPrompt: `events ${index}`, negativeConstraints: 'preserve geometry', targetInterpretations: source.targets.map(target => ({ visualTargetId: target.id, finalIdentity: `final ${index} ${target.id}`, appearance: 'fixture appearance' })) }));
      } else if (schema.kind === 'worldkit-three-episode-appearance-lock') {
        result = {...result, subjectAppearance:'bound subject appearance',environmentAppearance:'bound environment materials',lighting:'bright diffuse light',palette:'anchor palette',negativeConstraints:'preserve whitebox geometry',targetAppearances:schema.targetAppearances.map(item=>({...item,appearance:'bound '+item.targetId,basis:'anchor-visible'}))};
      } else if (schema.kind === 'worldkit-three-episode-visual-review') {
        result = { ...result, verdict: 'passed', summary: 'Mock review validates orchestration only, not visual quality', imageReviews: schema.imageReviews.map(image => ({ id: image.id, verdict: 'passed', observations: 'mock observation' })) };
        if (rejectLockedAnchorOnce && !calls.lockedAnchorRejected && schema.mode === 'style' && schema.styleVariantId === 'style-00') {
          calls.lockedAnchorRejected = true;
          result.verdict = 'needs-repair'; result.imageReviews[0].verdict = 'needs-repair'; result.imageReviews[0].observations = 'Fixture reviewer requests a different registered material'; result.repairInstructions = 'Repair this style anchor and independently review the new image';
        } else if (rejectReplacementAnchors && schema.mode === 'anchors' && schema.styleVariantId === 'style-00') {
          result.verdict = 'needs-repair'; result.imageReviews[0].verdict = 'needs-repair'; result.imageReviews[0].observations = 'Fixture replacement remains incorrect'; result.repairInstructions = 'Repair the replacement material';
        }
      } else if (schema.kind === 'worldkit-three-episode-diversity-review') {
        result = { ...result, verdict: 'passed', summary: 'Mock diversity findings', dimensionReviews: schema.dimensionReviews.map(item => ({ dimension: item.dimension, verdict: 'passed', observations: 'mock observation' })), variantReviews: schema.variantReviews.map(item => ({ styleVariantId: item.styleVariantId, verdict: 'passed', confusableWith: [], observations: 'mock observation' })) };
      } else assert.fail(`unexpected schema ${schema.kind}`);
      await writeFile(args.outputs[0].path, JSON.stringify(result)); return { mode: 'mock-provider-test', taskId: args.taskId };
    },
    async generateImages(args) {
      calls.images++; calls.activeImages++; calls.maximumImageConcurrency = Math.max(calls.maximumImageConcurrency, calls.activeImages);
      try {
        await new Promise(resolve => setTimeout(resolve, 3));
        if (failImageOnce && !calls.failedOnce && args.items[0].prompt.includes('segment-03')) { calls.failedOnce = true; throw new Error('FIXTURE_IMAGE_PROVIDER_FAILURE'); }
        for (const item of args.items) {
          assert.equal(item.images.length,1, 'native generation must receive only the current whitebox geometry reference');
          assert.match(item.id, /^[a-z0-9][a-z0-9-]{2,119}$/);
          const styleId = /"id":"(style-\d+)"/.exec(item.prompt)?.[1];
          calls.imageCountsByStyle[styleId] = (calls.imageCountsByStyle[styleId] ?? 0) + 1;
          if (item.prompt.includes('Create styled scene segment-00') && item.prompt.includes('Independent review correction:')) {
            await sharp(item.images[0]).tint({r: calls.images % 255, g: 30, b: 180}).png().toFile(item.outputPath);
          } else await copyFile(item.images[0], item.outputPath);
        }
        return { mode: 'mock-image-provider-test', batchId: args.batchId };
      } finally { calls.activeImages--; }
    },
    async generateEvents(args) {
      calls.events++; assert.equal(args.model, 'gemini-3.5-flash'); assert.equal(args.videos.length, 3);
      assert.deepEqual(args.videos.map(video => video.samplingFps), [.25, .25, .25]);
      await writeFile(args.outputPath, JSON.stringify({ events: Array.from({ length: 5 }, event) })); return { mode: 'mock-events-provider-test' };
    },
    async generateVideo() { calls.videos++; assert.fail('Seedance must never be called by this pipeline'); },
  };
  return { root, source, capture, calls, options: { streaming:false, source, capture, cloud, episodeId: 'fixture-episode', outputRoot: path.join(root, 'output'), stopBeforeSeedance: true } };
}

test('rejects foreign world/runtime recordings and incomplete capture states before provider work', async () => {
  const setup = await fixture();
  const foreignWorld = structuredClone(setup.capture); foreignWorld.worldBuildHash = 'd'.repeat(64);
  assert.throws(() => assertThreeEpisodeVisualInputs(setup.source, foreignWorld), /another world/);
  const foreignRuntime = structuredClone(setup.capture); foreignRuntime.runtimeHash = 'd'.repeat(64);
  assert.throws(() => assertThreeEpisodeVisualInputs(setup.source, foreignRuntime), /another runtime/);
  const incomplete = structuredClone(setup.capture); delete incomplete.segments[0].status;
  assert.throws(() => assertThreeEpisodeVisualInputs(setup.source, incomplete), /not completed/);
  await assert.rejects(runThreeEpisodeVisuals({ ...setup.options, stopBeforeSeedance: false }), /SEEDANCE_DISABLED/);
  assert.equal(setup.calls.codex + setup.calls.images + setup.calls.events + setup.calls.videos, 0);
});

test('preserves all seven arbitrary SDK target IDs, produces sixty prepared requests, bounds image concurrency and makes zero video calls', async () => {
  const setup = await fixture();
  const result = await runThreeEpisodeVisuals(setup.options);
  assert.equal(result.preparedRequestCount, 60); assert.equal(result.providerVideoSubmissionCount, 0); assert.equal(setup.calls.videos, 0);
  assert.equal(result.variants.length, 10); assert.equal(setup.calls.images, 130); assert.equal(setup.calls.events, 10);
  assert.ok(setup.calls.maximumImageConcurrency <= 10);
  for (const variant of result.variants) {
    assert.deepEqual(variant.styledTriviews.map(item => item.targetId), setup.source.targets.map(item => item.id));
    assert.equal(variant.openings.length, 6); assert.equal(variant.requests.length, 6);
    assert.equal(variant.appearanceLock.anchorSha256,variant.anchor.sha256);
    assert.deepEqual(variant.appearanceLock.targetAppearances.map(item=>item.targetId),setup.source.targets.map(item=>item.id));
    for (const request of variant.requests) { assert.equal(request.stopBeforeSeedance, true); assert.equal(request.providerSubmitted, false); assert.equal(request.styledTriviews.length, 7); assert.equal(request.referencePolicy.providerCapabilityStatus, 'not-submitted-not-verified'); }
  }
  const before = { codex: setup.calls.codex, images: setup.calls.images, events: setup.calls.events };
  const resumed = await runThreeEpisodeVisuals(setup.options);
  assert.equal(resumed.status, 'pre-seedance-ready'); assert.deepEqual({ codex: setup.calls.codex, images: setup.calls.images, events: setup.calls.events }, before);
});

test('retains successful image tasks across a failed image call and resumes only missing work', async () => {
  const setup = await fixture({ failImageOnce: true });
  await assert.rejects(runThreeEpisodeVisuals(setup.options), /visual operations failed/);
  assert.equal(setup.calls.videos, 0); assert.equal(setup.calls.failedOnce, true);
  const result = await runThreeEpisodeVisuals(setup.options);
  assert.equal(result.status, 'pre-seedance-ready'); assert.equal(setup.calls.images, 131); assert.equal(setup.calls.videos, 0);
});

test('rejects a corrupted image cache through its source hash instead of trusting completed state', async () => {
  const setup = await fixture();
  const result = await runThreeEpisodeVisuals(setup.options);
  const image = result.variants[0].openings[3]; await writeFile(image.path, 'corrupted png');
  const previousImages = setup.calls.images;
  await runThreeEpisodeVisuals(setup.options);
  assert.equal(setup.calls.images, previousImages + 1); assert.equal(setup.calls.videos, 0);
});

test('normalizes exactly five bounded video-only events and rejects SDK commands or out-of-clip timing', () => {
  const events = normalizeThreeEpisodeEvents({ events: Array.from({ length: 5 }, event) });
  assert.deepEqual(events.map(item => [item.segmentId, item.segmentRelativeSeconds]), [['segment-00', 8], ['segment-00', 20], ['segment-02', 8], ['segment-02', 20], ['segment-04', 14]]);
  assert.ok(events.every(item => item.application === 'video-render-only'));
  const bad = Array.from({ length: 5 }, event); bad[0].command = { type: 'entity.spawn' };
  assert.throws(() => normalizeThreeEpisodeEvents({ events: bad }), /unsupported event fields/);
  const late = Array.from({ length: 5 }, event); late[1].timing.endingDurationSeconds = 12;
  assert.throws(() => normalizeThreeEpisodeEvents({ events: late }), /extends beyond capture/);
});

test('replaces a rejected locked anchor only after independent acceptance, preserving other styles and the old immutable lock', async () => {
  const setup = await fixture({ rejectLockedAnchorOnce: true });
  const result = await runThreeEpisodeVisuals(setup.options);
  assert.equal(result.status, 'pre-seedance-ready'); assert.equal(setup.calls.images, 143); assert.equal(setup.calls.videos, 0);
  assert.equal(setup.calls.imageCountsByStyle['style-00'], 26);
  for (const id of THREE_EPISODE_STYLE_IDS.slice(1)) assert.equal(setup.calls.imageCountsByStyle[id], 13);
  const history = JSON.parse(await readFile(result.anchorHistoryPath, 'utf8'));
  const firstStyle = history.styles['style-00'];
  assert.equal(firstStyle.attempts.length, 2); assert.deepEqual(firstStyle.attempts.map(item => item.status), ['accepted', 'accepted']);
  assert.equal(firstStyle.attempts[1].supersedesAnchorSha256, firstStyle.attempts[0].image.sha256);
  assert.notEqual(firstStyle.attempts[1].image.generationInputHash, firstStyle.attempts[0].image.generationInputHash);
  assert.equal(firstStyle.currentReview.mode, 'anchors'); assert.equal(firstStyle.currentReview.styleVariantId, 'style-00'); assert.equal(firstStyle.currentReview.verdict, 'passed');
  assert.equal(result.variants[0].anchor.sha256, firstStyle.attempts[1].image.sha256);
  const { readdir } = await import('node:fs/promises');
  const lockFiles = (await readdir(path.join(setup.options.outputRoot, 'anchors'))).filter(name => name.startsWith('lock-'));
  assert.ok(lockFiles.length >= 2);
  const locks = await Promise.all(lockFiles.map(async name => JSON.parse(await readFile(path.join(setup.options.outputRoot, 'anchors', name), 'utf8'))));
  assert.ok(locks.some(lock => lock.anchors[0].anchor.sha256 === firstStyle.attempts[0].image.sha256));
  assert.ok(locks.some(lock => lock.anchors[0].anchor.sha256 === firstStyle.attempts[1].image.sha256));
});

test('persists the per-style anchor attempt budget and never bypasses failed independent reviews after restart', async () => {
  const setup = await fixture({ rejectLockedAnchorOnce: true, rejectReplacementAnchors: true });
  await assert.rejects(runThreeEpisodeVisuals(setup.options), /OPENING_REPAIR_BUDGET_EXHAUSTED/);
  const before = { images: setup.calls.images, codex: setup.calls.codex, events: setup.calls.events };
  await assert.rejects(runThreeEpisodeVisuals(setup.options), /OPENING_REPAIR_BUDGET_EXHAUSTED/);
  assert.deepEqual({ images: setup.calls.images, codex: setup.calls.codex, events: setup.calls.events }, before);
  assert.equal(setup.calls.events, 0); assert.equal(setup.calls.videos, 0);
  const { readdir } = await import('node:fs/promises');
  const historyFile = (await readdir(path.join(setup.options.outputRoot, 'anchors'))).find(name => name.startsWith('history-'));
  const history = JSON.parse(await readFile(path.join(setup.options.outputRoot, 'anchors', historyFile), 'utf8'));
  assert.equal(history.styles['style-00'].attempts.length, 4);
  assert.deepEqual(history.styles['style-00'].attempts.map(item => item.status), ['accepted', 'needs-repair', 'needs-repair', 'needs-repair']);
  assert.ok(history.styles['style-00'].revisionReview);
});

test('recovery candidates get a new cloud planning identity and are never admitted directly', async () => {
  const setup=await fixture(); const planCalls=[]; const original=setup.options.cloud.runCodex;
  setup.options.cloud.runCodex=async args=>{if(args.taskId.startsWith('three-episode-style-plan-'))planCalls.push(args);return original(args);};
  await runThreeEpisodeVisuals(setup.options);
  const candidate=path.join(setup.root,'unadmitted-candidate.json');await copyFile(path.join(setup.options.outputRoot,'style-plan.json'),candidate);
  const stylePlanCandidate=await ref(candidate);
  await runThreeEpisodeVisuals({...setup.options,stylePlanCandidate});
  assert.equal(planCalls.length,2);assert.notEqual(planCalls[0].taskId,planCalls[1].taskId);
  assert.equal(planCalls[1].assets.find(a=>a.id==='prior-style-plan').path,candidate);
  assert.match(planCalls[1].instruction,/untrusted candidate/);
  const context=JSON.parse(await readFile(planCalls[1].assets.find(a=>a.id==='context').path,'utf8'));
  assert.deepEqual(context.recoveryCandidate,{sha256:stylePlanCandidate.sha256});
  await writeFile(candidate,'changed candidate');
  await assert.rejects(runThreeEpisodeVisuals({...setup.options,stylePlanCandidate}),/STALE_INPUT/);
  assert.equal(planCalls.length,2);assert.equal(setup.calls.videos,0);
});

test('legacy colliding-input review histories cannot consume the corrected review repair budget',async()=>{
 const setup=await fixture();const result=await runThreeEpisodeVisuals(setup.options);const images=setup.calls.images;
 const {hashVisualInput}=await import('./visual-contracts.mjs');const legacyPath=path.join(setup.options.outputRoot,'anchors',`history-${hashVisualInput(result.plan)}.json`);
 const legacy={kind:'legacy-host-collision-evidence',styles:Object.fromEntries(THREE_EPISODE_STYLE_IDS.map(id=>[id,{attempts:Array(4).fill({status:'needs-repair'}),pendingFeedback:'invalid same-filename review'}]))};
 const bytes=JSON.stringify(legacy);await writeFile(legacyPath,bytes);await rm(result.anchorHistoryPath);
 const restored=await runThreeEpisodeVisuals(setup.options);assert.equal(restored.preparedRequestCount,60);assert.equal(setup.calls.images,images);assert.equal(await readFile(legacyPath,'utf8'),bytes);
 const history=JSON.parse(await readFile(restored.anchorHistoryPath,'utf8'));assert.equal(history.reviewAttachmentPolicy,'asset-id-filenames-v1');assert(Object.values(history.styles).every(s=>s.attempts.length===1));
});

test('appearance dictionaries are bound to the exact accepted anchor and every ordered target',async()=>{
 const setup=await fixture();const result=await runThreeEpisodeVisuals(setup.options);const variant=result.variants[0];
 const {assertThreeEpisodeAppearanceLock}=await import('./visual-contracts.mjs');const lock=variant.appearanceLock;
 const expected={worldId:setup.source.worldId,episodeId:setup.options.episodeId,inputHash:lock.inputHash,styleVariantId:variant.id,anchorSha256:variant.anchor.sha256,targetIds:setup.source.targets.map(t=>t.id)};
 assert.equal(assertThreeEpisodeAppearanceLock(lock,expected),lock);
 assert.throws(()=>assertThreeEpisodeAppearanceLock({...lock,anchorSha256:'f'.repeat(64)},expected),/identity mismatch/);
 assert.throws(()=>assertThreeEpisodeAppearanceLock({...lock,targetAppearances:lock.targetAppearances.slice(1)},expected),/every ordered ID/);
 assert.throws(()=>assertThreeEpisodeAppearanceLock({...lock,lighting:''},expected),/lighting missing/);
 assert.equal(result.imageInputPolicy,'single-whitebox-text-appearance-v1');
});

async function calibratedFixture() {
 const setup=await fixture(); const baseline=await runThreeEpisodeVisuals(setup.options);
 const {hashVisualInput}=await import('./visual-contracts.mjs');const {THREE_EPISODE_REVIEW_POLICY_ID}=await import('./review-policy.mjs');
 const decision={id:'fixture-explicit-user-decision',authority:'user',scope:'opening-anchor-only',userInstruction:'Fixture user accepts this exact opening',worldId:setup.source.worldId,worldBuildHash:setup.source.worldBuildHash,planHash:hashVisualInput(baseline.plan),whiteboxOpeningSha256:setup.capture.segments[0].firstFrame.sha256,approvedAnchors:[{styleVariantId:'style-00',imageSha256:baseline.anchors[0].sha256}]};
 const calibration={kind:'three-episode-user-review-calibration',schemaVersion:1,reviewPolicyId:THREE_EPISODE_REVIEW_POLICY_ID,decisions:[decision]};
 return {setup,baseline,calibration,decision};
}

test('user calibration is scoped to exact world, plan, opening bytes and opening-only decisions',async()=>{
 const {setup,baseline,calibration,decision}=await calibratedFixture();const {resolveUserAnchorAcceptance,validateReviewCalibration}=await import('./review-policy.mjs');
 const identity={...decision,styleVariantId:'style-00',imageSha256:baseline.anchors[0].sha256};
 assert.equal(resolveUserAnchorAcceptance(calibration,identity).authority,'user');
 for(const field of ['worldBuildHash','planHash','whiteboxOpeningSha256','imageSha256'])assert.equal(resolveUserAnchorAcceptance(calibration,{...identity,[field]:'f'.repeat(64)}),null);
 assert.equal(resolveUserAnchorAcceptance(calibration,{...identity,scope:'later-frame'}),null);
 assert.equal(resolveUserAnchorAcceptance(calibration,{...identity,styleVariantId:'style-02'}),null);
 assert.throws(()=>validateReviewCalibration({...calibration,decisions:[{...decision,approvedAnchors:[...decision.approvedAnchors,...decision.approvedAnchors]}]}),/IMAGE_INVALID/);
});

test('explicit user approval admits the exact opening without regenerating it or rewriting cloud verdicts',async()=>{
 const {setup,calibration}=await calibratedFixture();const before=setup.calls.images;const original=setup.options.cloud.runCodex;
 setup.options.cloud.runCodex=async args=>{const evidence=await original(args);const file=args.outputs[0].path;const r=JSON.parse(await readFile(file,'utf8'));
  if(r.kind==='worldkit-three-episode-visual-review' && (r.mode==='anchors'||r.styleVariantId==='style-00')){r.imageReviews[0].verdict='needs-repair';r.imageReviews[0].observations='Fixture cosmetic opening mismatch';r.verdict='needs-repair';r.repairInstructions='Fixture cosmetic correction';await writeFile(file,JSON.stringify(r));}return evidence;};
 const result=await runThreeEpisodeVisuals({...setup.options,reviewCalibration:calibration});
 assert.equal(result.preparedRequestCount,60);assert.equal(setup.calls.images,before);
 assert.equal(result.anchorReview.verdict,'needs-repair');assert.equal(result.variants[0].review.verdict,'needs-repair');
 assert.equal(result.anchorAdmissions[0].userAcceptance.authority,'user');assert.equal(result.variants[0].anchorAcceptance.scope,'opening-anchor-only');
 const history=JSON.parse(await readFile(result.anchorHistoryPath,'utf8'));assert.equal(history.styles['style-00'].attempts.length,1);assert.equal(history.styles['style-00'].attempts[0].userAcceptances.length,1);
});

test('opening approval cannot turn a failed later frame into a passed full style set',async()=>{
 const {setup,calibration}=await calibratedFixture();const original=setup.options.cloud.runCodex;
 setup.options.cloud.runCodex=async args=>{const evidence=await original(args);const file=args.outputs[0].path;const r=JSON.parse(await readFile(file,'utf8'));
  if(r.kind==='worldkit-three-episode-visual-review'&&r.mode==='style'&&r.styleVariantId==='style-00'){r.imageReviews[1].verdict='needs-repair';r.imageReviews[1].observations='A principal target blocks the actual route in segment-01';r.verdict='needs-repair';r.repairInstructions='Restore the segment-01 route';await writeFile(file,JSON.stringify(r));}return evidence;};
 await assert.rejects(runThreeEpisodeVisuals({...setup.options,reviewCalibration:calibration}),/VISUAL_REPAIR_BUDGET_EXHAUSTED/);assert.equal(setup.calls.videos,0);
});

test('a revised rubric re-evaluates exhausted existing candidates once without resetting image budgets',async()=>{
 const setup=await fixture();const baseline=await runThreeEpisodeVisuals(setup.options);const history=JSON.parse(await readFile(baseline.anchorHistoryPath,'utf8'));const entry=history.styles['style-00'];const image=entry.currentAnchor;
 entry.attempts=[];
 for(let index=0;index<4;index++){const file=path.join(setup.root,`old-policy-${index}.png`);await copyFile(image.path,file);entry.attempts.push({index,status:'needs-repair',feedbackHash:'old',image:{...image,path:file}});}
 entry.currentAnchor=null;entry.currentReview=null;entry.revisionReview={verdict:'needs-repair'};entry.pendingFeedback='Old strict framing requirement';entry.lastEvaluationPolicyHash='old-policy';
 await writeFile(baseline.anchorHistoryPath,JSON.stringify(history));const before=setup.calls.images;
 const result=await runThreeEpisodeVisuals(setup.options);assert.equal(result.preparedRequestCount,60);assert.equal(setup.calls.images,before);
 const updated=JSON.parse(await readFile(result.anchorHistoryPath,'utf8'));assert.equal(updated.styles['style-00'].attempts.length,4);assert.equal(updated.styles['style-00'].attempts[3].status,'accepted');
 // The same-policy failure still exhausts the same four attempts.
 Object.assign(updated.styles['style-00'],{currentAnchor:null,currentReview:null,revisionReview:{verdict:'needs-repair'},pendingFeedback:'Still invalid under this policy'});updated.styles['style-00'].attempts[3].status='needs-repair';await writeFile(result.anchorHistoryPath,JSON.stringify(updated));
 await assert.rejects(runThreeEpisodeVisuals(setup.options),/OPENING_REPAIR_BUDGET_EXHAUSTED/);assert.equal(setup.calls.images,before);
});

 test('requires one hash-bound original-reference style when a user image exists', async()=>{
  const f=await fixture(); await runThreeEpisodeVisuals(f.options);
  const plan=JSON.parse(await readFile(path.join(f.options.outputRoot,'style-plan.json'),'utf8'));
  assert.throws(()=>assertThreeEpisodeStylePlan(plan,{worldId:plan.worldId,episodeId:plan.episodeId,inputHash:plan.inputHash,targetIds:f.source.targets.map(t=>t.id),referenceImageSha256:'d'.repeat(64),referenceStyleVariantId:'style-02'}),/original.reference style/);
 });

 test('carries the actual original into planning/review, reserves its slot and keeps image generation single-whitebox', async()=>{
  const f=await fixture(); f.source.referenceImage=await ref(path.join(f.root,'triview.png'));
  await runThreeEpisodeVisuals({...f.options,referenceStyleVariantId:'style-02'});
  const plan=JSON.parse(await readFile(path.join(f.options.outputRoot,'style-plan.json'),'utf8'));
  assert.equal(plan.variants.filter(v=>v.styleMode==='source-reference').length,1);
  assert.equal(plan.variants[2].referenceImageSha256,f.source.referenceImage.sha256);
  assert.ok(f.calls.referenceTasks>2,'source reference must reach director and independent reviews');
  assert.equal(f.calls.images,130);assert.equal(f.calls.videos,0);
  const bad=structuredClone(plan);bad.variants[2].referenceImageSha256='e'.repeat(64);
  assert.throws(()=>assertThreeEpisodeStylePlan(bad,{worldId:plan.worldId,episodeId:plan.episodeId,inputHash:plan.inputHash,targetIds:f.source.targets.map(t=>t.id),referenceImageSha256:f.source.referenceImage.sha256,referenceStyleVariantId:'style-02'}),/original-reference style/);
 });
 test('rejects a corrupted user original before any provider work', async()=>{
  const f=await fixture();f.source.referenceImage={path:path.join(f.root,'triview.png'),sha256:'f'.repeat(64)};
  await assert.rejects(runThreeEpisodeVisuals(f.options),/STALE_INPUT/);
  assert.equal(f.calls.codex+f.calls.images+f.calls.events,0);
 });

test('continues existing anchors without regeneration, preserving spent budgets and only unchanged scoped approvals',async()=>{
 const {setup,baseline,calibration}=await calibratedFixture();const {hashVisualInput}=await import('./visual-contracts.mjs');
 const continuation={kind:'three-episode-anchor-continuation',schemaVersion:1,worldBuildHash:setup.source.worldBuildHash,runtimeHash:setup.source.runtimeHash,whiteboxOpeningSha256:setup.capture.segments[0].firstFrame.sha256,plan:baseline.plan,historicalPlan:baseline.plan,anchors:baseline.anchors.map((image,index)=>({id:THREE_EPISODE_STYLE_IDS[index],image,previousAttemptCount:4,additionalOpeningAttempts:index===3?2:0}))};
 const file=path.join(setup.root,'continuation.json');await writeFile(file,JSON.stringify(continuation));const before=setup.calls.images;
 const result=await runThreeEpisodeVisuals({...setup.options,episodeId:'fixture-continued',outputRoot:path.join(setup.root,'continued'),anchorContinuation:await ref(file),reviewCalibration:calibration});
 assert.equal(setup.calls.images-before,120,'only later images, not ten imported openings');
 const carried=result.anchorAdmissions[0].userAcceptance;assert.equal(carried.kind,'three-episode-carried-user-anchor-acceptance');assert.equal(carried.sourceAcceptance.planHash,hashVisualInput(baseline.plan));assert.equal(carried.planHash,hashVisualInput(result.plan));
 const history=JSON.parse(await readFile(result.anchorHistoryPath,'utf8'));assert.equal(history.styles['style-03'].attempts.length,4);assert.equal(history.styles['style-03'].importedBudget.additionalOpeningAttempts,2);
 const {validateAnchorContinuation,carriedUserAnchorAcceptance}=await import('./anchor-continuation.mjs');
 const changed=structuredClone(result.plan);changed.variants[0].concept='changed accepted variant';assert.throws(()=>validateAnchorContinuation(continuation,{source:setup.source,plan:changed,whiteboxOpeningSha256:setup.capture.segments[0].firstFrame.sha256}),/variant.*changed/);
 assert.equal(carriedUserAnchorAcceptance(calibration,continuation,{...carried,scope:'later-frame'},result.plan.variants[0]),null);
});

test('streaming prepares six requests before a later anchor finishes, with no video submission', async () => {
 const setup=await fixture();let unblock;const blocked=new Promise(resolve=>{unblock=resolve;});let entered;const pending=new Promise(resolve=>{entered=resolve;});
 const generate=setup.options.cloud.generateImages;
 setup.options.cloud.generateImages=async args=>{if(args.items[0].prompt.includes('Create styled scene segment-00')&&args.items[0].prompt.includes('"id":"style-01"')){entered();await blocked;}return generate(args);};
 const run=runThreeEpisodeVisuals({...setup.options,streaming:true});
 try {
  await Promise.race([pending,new Promise((_,reject)=>setTimeout(()=>reject(Error('streaming did not reach next anchor')),15000))]);
  const ready=JSON.parse(await readFile(path.join(setup.options.outputRoot,'ready-render-requests.json'),'utf8'));
  assert.equal(ready.preparedRequestCount,6);assert.equal(ready.styles[0].id,'style-00');assert.equal(setup.calls.events,1);assert.equal(setup.calls.videos,0);
  assert(ready.requests.every(r=>r.stopBeforeSeedance&&r.providerSubmitted===false));
 }finally{unblock();}
 const result=await run;assert.equal(result.preparedRequestCount,60);
 const before={images:setup.calls.images,events:setup.calls.events,codex:setup.calls.codex};await runThreeEpisodeVisuals({...setup.options,streaming:true});assert.deepEqual({images:setup.calls.images,events:setup.calls.events,codex:setup.calls.codex},before);
});

test('a failed style does not block later streaming requests or erase completed styles',async()=>{
 const setup=await fixture();const generate=setup.options.cloud.generateImages;
 setup.options.cloud.generateImages=async args=>{if(args.items[0].prompt.includes('Create styled scene segment-00')&&args.items[0].prompt.includes('"id":"style-01"'))throw Error('FIXTURE_STYLE_ONE_QUOTA');return generate(args);};
 await assert.rejects(runThreeEpisodeVisuals({...setup.options,streaming:true}),/FIXTURE_STYLE_ONE_QUOTA/);
 const ready=JSON.parse(await readFile(path.join(setup.options.outputRoot,'ready-render-requests.json'),'utf8'));
 assert.equal(ready.preparedRequestCount,54);assert(!ready.styles.some(s=>s.id==='style-01'));assert(ready.styles.some(s=>s.id==='style-09'));assert.equal(setup.calls.videos,0);
 const counts=[];await assert.rejects(runThreeEpisodeVisuals({...setup.options,streaming:true,onProgress:async s=>{if(Number.isInteger(s.preparedRequestCount))counts.push(s.preparedRequestCount);}}),/FIXTURE_STYLE_ONE_QUOTA/);assert(counts.length);assert(counts.every(n=>n===54));
});

test('event prompts can finish with real motion and accepted appearance before any styled image is generated',async()=>{
 const {prefetchThreeEpisodeEvents}=await import('./event-prefetch.mjs');const s=await fixture();const anchor=s.capture.segments[0].firstFrame,variant={id:'style-00',geminiEventPrompt:'Use the accepted appearance with the actual motion'},appearanceLock={anchorSha256:anchor.sha256,subjectAppearance:'accepted subject'};
 const args={variant,capture:s.capture,anchor,appearanceLock,outputRoot:s.options.outputRoot,cloud:s.options.cloud};const result=await prefetchThreeEpisodeEvents(args);assert.equal(result.events.length,5);assert.equal(s.calls.images,0);assert.equal(s.calls.events,1);await prefetchThreeEpisodeEvents(args);assert.equal(s.calls.events,1);
});

test('human rejected anchor versions are excluded without forcing ten-style completion',async()=>{
 const setup=await fixture(),baseline=await runThreeEpisodeVisuals(setup.options),before=setup.calls.images;
 const rejected=[2,3].map(i=>({caseId:'fixture-episode',styleId:'style-0'+i,imageSha256:baseline.anchors[i].sha256}));
 const result=await runThreeEpisodeVisuals({...setup.options,streaming:true,loadRejectionPolicy:async()=>({rejections:rejected})});
 assert.equal(result.preparedRequestCount,48);assert.equal(result.expectedRequestCount,48);assert.deepEqual(result.excludedStyleIds,['style-02','style-03']);assert.equal(setup.calls.images,before);assert.equal(result.batchDiversityStatus,'not-applicable-user-exclusions');
});

test('reviewed clips reach a complete package while another styled frame is still blocked',async()=>{
 const setup=await fixture();let unblock;const gate=new Promise(r=>{unblock=r;});let delivered;const ready=new Promise(r=>{delivered=r;});const image=setup.options.cloud.generateImages;
 setup.options.cloud.generateImages=async args=>{if(args.items[0].prompt.includes('"id":"style-00"')&&args.items[0].prompt.includes('for segment-05.'))await gate;return image(args);};
 const run=runThreeEpisodeVisuals({...setup.options,streaming:true,onProgress:async s=>{if(s.variants[0].fastPreparedRequestCount)delivered();}});
 let timer;try{await Promise.race([ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('no early clip package')),10000);})]);const pkg=JSON.parse(await readFile(path.join(setup.options.outputRoot,'fast-ready/style-00/ready-clips.json'),'utf8'));assert(pkg.preparedRequestCount>=1&&pkg.preparedRequestCount<6);assert(pkg.requests.every(r=>r.segmentId!=='segment-05'&&r.styledTriviews.length===7&&r.providerSubmitted===false));}finally{clearTimeout(timer);unblock();}
 await run;
});
