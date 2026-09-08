import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {prepareThreeEpisodeRenderRequests} from './visuals.mjs';
import {hashVisualInput, THREE_EPISODE_VISUAL_VERSION} from './visual-contracts.mjs';
import {prepareSeedanceManifest, verifySeedanceRequest} from './seedance-preflight.mjs';

const json = async p => JSON.parse(await readFile(p));
async function fixture(t, fast = false) {
  const root = await mkdtemp(path.join(os.tmpdir(),'seedance-preflight-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const save = async (name,data) => {
    const file = path.join(root,name), bytes = Buffer.from(typeof data === 'string' ? data : JSON.stringify(data));
    await mkdir(path.dirname(file),{recursive:true}); await writeFile(file,bytes);
    return {path:file,sha256:createHash('sha256').update(bytes).digest('hex')};
  };
  const worldIdentity = {worldId:'world',sourceHash:'a'.repeat(64),worldBuildHash:'b'.repeat(64),runtimeHash:'c'.repeat(64)};
  const whitebox = await save('whitebox.png','source first frame'), styled = await save('styled.png','accepted frame');
  const targetWhite = await save('target-white.png','source target'), targetStyle = {...await save('target-style.png','styled target'),targetId:'subject/角色',name:'subject'};
  const source = {...worldIdentity,targets:[{id:targetStyle.targetId,whiteboxTriview:targetWhite}]};
  const segment = {id:'segment-00',status:'completed',worldBuildHash:source.worldBuildHash,runtimeHash:source.runtimeHash,
    video:await save('capture.mp4','mock capture; media encoding tested by capture suite'),firstFrame:whitebox,
    trace:await save('trace.json',{}),health:await save('health.json',{}),
    actionEvidence:await save('actions.json',{kind:'three-episode-action-timeline',schemaVersion:1,actionTimeline:[]}),
    actionTimeline:[],frameCount:720,durationSeconds:30};
  const capture = {kind:'three-episode-visual-capture-input',schemaVersion:1,worldBuildHash:source.worldBuildHash,runtimeHash:source.runtimeHash,segments:[segment]};
  const variant = {id:'style-00',worldIdentity:'world',subjectIdentity:'subject',visualPrompt:'painted',negativeConstraints:'preserve motion'};
  const requests = prepareThreeEpisodeRenderRequests({source,capture,variant,openings:[styled],styledTriviews:[targetStyle],events:[]});
  const input = {worldIdentity,variant,anchor:{sha256:styled.sha256},images:[{id:'segment-00',sha256:styled.sha256},{id:'target-'+targetStyle.targetId,sha256:targetStyle.sha256}],whiteboxes:[{sha256:whitebox.sha256},{sha256:targetWhite.sha256}]};
  const kind = fast ? 'partial-style-review' : 'style-review';
  const inputHash = hashVisualInput({version:THREE_EPISODE_VISUAL_VERSION,kind,input});
  const review = {kind:'worldkit-three-episode-visual-review',schemaVersion:1,reviewer:'cloud-codex',worldId:'world',episodeId:'episode',styleVariantId:'style-00',mode:'style',inputHash,verdict:'passed',imageReviews:input.images.map(i=>({id:i.id,verdict:'passed'}))};
  const reviewRoot = `tasks/${kind}-${inputHash.slice(0,24)}`;
  await save(reviewRoot+'/input.json',input); await save(reviewRoot+'/result.json',review);
  await save(reviewRoot+'/stage.json',{kind,status:'completed',inputHash,result:review});
  await save('variants/style-00/visual-manifest.json',{review});
  await save('ready.json',{kind:fast?'three-episode-fast-ready-clips':'worldkit-three-episode-ready-render-requests',schemaVersion:1,worldIdentity,episodeId:'episode',requests,review});
  await save('source.json',{...source,targets:source.targets.map(t=>({...t,whiteboxTriview:{...t.whiteboxTriview,path:path.relative(root,t.whiteboxTriview.path)}}))}); await save('capture.json',capture);
  await save('history.json',{worldIdentity,styles:{'style-00':{currentAnchor:styled,revisionReview:null}}});
  await save('rejections.json',{rejections:[]});
  const args = {readyPath:path.join(root,'ready.json'),sourcePath:path.join(root,'source.json'),capturePath:path.join(root,'capture.json'),visualRoot:root,anchorHistoryPath:path.join(root,'history.json'),rejectionsPath:path.join(root,'rejections.json'),outputPath:path.join(root,'batch/seedance-requests.json'),maximumConcurrency:2};
  let sourceChecks = 0;
  const options = {verifySource:async()=>{sourceChecks++;}};
  const manifest = await prepareSeedanceManifest(args,options);
  return {root,save,args,options,manifest,sourceChecks:()=>sourceChecks,verify:()=>verifySeedanceRequest(args.outputPath,requests[0].id,options)};
}

test('current style and independently ready clip packages enter the provider adapter without a model call',async t=>{
  for(const fast of [false,true]) {
    const f=await fixture(t,fast); const result=await f.verify();
    assert.equal(result.passed,true); assert.equal(result.runtimeHash,'c'.repeat(64));
    assert.equal(f.sourceChecks(),2);
    assert.deepEqual(await prepareSeedanceManifest(f.args,f.options),f.manifest);
  }
});
test('live rejection, changed anchor and withdrawn request block already prepared batches',async t=>{
  for(const field of ['rejection','anchor','withdraw']) {
    const f=await fixture(t);
    if(field==='rejection')await f.save('rejections.json',{rejections:[{caseId:'episode',styleId:'style-00',imageSha256:f.manifest.styleAnchors['style-00'].sha256}]});
    if(field==='anchor'){const history=await json(f.args.anchorHistoryPath);history.styles['style-00'].revisionReview={verdict:'needs-repair'};await f.save('history.json',history);}
    if(field==='withdraw'){const ready=await json(f.args.readyPath);ready.requests=[];await f.save('ready.json',ready);}
    await assert.rejects(f.verify(),/HUMAN_REJECTED|ANCHOR_NO_LONGER_ACCEPTED|REQUEST_NO_LONGER_READY/);
  }
});
test('source closure verifier failures propagate before admission',async t=>{
  const f=await fixture(t);
  await assert.rejects(verifySeedanceRequest(f.args.outputPath,f.manifest.requests[0].id,{verifySource:async()=>{throw Error('runtime bytes changed');}}),/runtime bytes changed/);
});
test('changed source, capture, reviewed result or material bytes invalidate prepared evidence',async t=>{
  for(const field of ['sourceRef','captureRef','review','image']) {
    const f=await fixture(t),m=f.manifest;
    const ref=field==='review'?m.reviewProofs['style-00'].result:field==='image'?m.requests[0].styledOpening:m[field];
    await writeFile(ref.path,'changed bytes'); await assert.rejects(f.verify(),/FILE_HASH_CHANGED/);
  }
});
test('changing prompt or dropping target references cannot reuse approval',async t=>{
  for(const change of ['prompt','targets']) {
    const f=await fixture(t),m=structuredClone(f.manifest);
    if(change==='prompt')m.requests[0].prompt+='added content';else m.requests[0].styledTriviews=[];
    await writeFile(f.args.outputPath,JSON.stringify(m));
    await assert.rejects(f.verify(),/REQUEST_CONTENT_CHANGED|COMPLETE_TARGETS_REQUIRED/);
  }
});
test('changed SDK identity and unproven half conversion fail closed',async t=>{
  for(const change of ['runtime','half']) {
    const f=await fixture(t),m=structuredClone(f.manifest);
    if(change==='runtime')m.worldIdentity.runtimeHash='d'.repeat(64);else m.requests[0].durationSeconds=15;
    await writeFile(f.args.outputPath,JSON.stringify(m));
    await assert.rejects(f.verify(),/SOURCE_IDENTITY_CHANGED|FULL_SEGMENT_REQUIRED/);
  }
});
