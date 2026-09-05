import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { runThreeEpisodeVisuals } from './visuals.mjs';
import { assertThreeEpisodeVisualInputs, normalizeThreeEpisodeEvents, THREE_EPISODE_STYLE_IDS } from './visual-contracts.mjs';

const temporary = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function ref(filename) { return { path: filename, sha256: createHash('sha256').update(await readFile(filename)).digest('hex') }; }
const event = () => ({ targetNames: ['main subject'], eventClass: 'atmospheric-spectacle', magnitude: 'large-scale', frameImpact: { scope: 'sky-dominant', coverage: 'large', contrast: 'dramatic' },
  dominantChange: 'Aurora appears', targetContext: 'Sky behind the subject', beforeState: 'Clear sky', transitionDescription: 'Colored light spreads across the sky', afterState: 'Aurora remains', spatialContinuity: 'Keep camera, terrain, silhouettes and movement unchanged', audioDescription: 'Environmental sound only', negativeConstraints: 'No teleport, cut, camera motion or SDK commands', timing: { transitionDurationSeconds: 2, ending: 'hold', endingDurationSeconds: 2 } });
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
        result.variants = THREE_EPISODE_STYLE_IDS.map((id, index) => ({ id, name: `name ${index}`, styleFamily: `family ${index}`, worldIdentity: `world ${index}`, subjectIdentity: `subject ${index}`, diversityRationale: `rationale ${index}`, concept: `concept ${index}`, visualPrompt: `visual ${index}`, geminiEventPrompt: `events ${index}`, negativeConstraints: 'preserve geometry', targetInterpretations: source.targets.map(target => ({ visualTargetId: target.id, finalIdentity: `final ${index} ${target.id}`, appearance: 'fixture appearance' })) }));
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
  return { root, source, capture, calls, options: { source, capture, cloud, episodeId: 'fixture-episode', outputRoot: path.join(root, 'output'), stopBeforeSeedance: true } };
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
