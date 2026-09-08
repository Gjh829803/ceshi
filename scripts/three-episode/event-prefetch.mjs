import path from 'node:path';
import {readFile,mkdir} from 'node:fs/promises';
import {sha256File,writeJsonAtomic} from '../lib/episode-style-variants.mjs';
import {THREE_EPISODE_VISUAL_VERSION,THREE_EPISODE_EVENT_SLOTS,hashVisualInput,normalizeThreeEpisodeEvents,normalizeVisualHash} from './visual-contracts.mjs';
import { actionTimelineIdentity, actionEvidenceText, verifyActionEvidence } from './action-evidence.mjs';
/** Events consume real motion plus an accepted appearance dictionary, without waiting for later styled frames. */
export function buildPrefetchedEventRequest({variant,capture,anchor,appearanceLock,config,promptTemplate}){
 if(config.model!=='gemini-3.5-flash'||JSON.stringify(config.selectedCaptureIndices)!=='[0,2,4]'||config.videoSamplingFps!==.25||appearanceLock.anchorSha256!==anchor.sha256)throw Error('EPISODE_EVENT_PREFETCH_INPUT_INVALID');
 const indices=config.selectedCaptureIndices;
 const instruction=`${variant.geminiEventPrompt}\n\n${promptTemplate.replace('HOST_EVENT_SLOTS_JSON',JSON.stringify(THREE_EPISODE_EVENT_SLOTS))}\nThe three images are the actual WHITEBOX first frames for the three corresponding videos. They own layout and visibility only; their simplified materials are not final appearance. The independently accepted anchor has this hash-bound final appearance dictionary: ${JSON.stringify(appearanceLock)}. Use it for materials, identities, lighting and style. Do not invent camera motion, change the recorded path, or claim events are already present in the whitebox. These events will be applied only during video rendering.\n${actionEvidenceText(indices.map(i=>capture.segments[i]))}`;
 return {model:config.model,instruction,videos:indices.map(i=>({path:capture.segments[i].video.path,samplingFps:.25})),images:indices.map(i=>capture.segments[i].firstFrame.path),slots:THREE_EPISODE_EVENT_SLOTS,
 inputIdentity:{policy:'whitebox-motion-accepted-appearance-v2',variantHash:hashVisualInput(variant),anchorSha256:normalizeVisualHash(anchor.sha256),appearanceLockHash:hashVisualInput(appearanceLock),config,templateHash:hashVisualInput(promptTemplate),inputs:indices.map(i=>({segmentId:capture.segments[i].id,...actionTimelineIdentity(capture.segments[i]),video:{sha256:normalizeVisualHash(capture.segments[i].video.sha256)},whiteboxFrame:{sha256:normalizeVisualHash(capture.segments[i].firstFrame.sha256)}}))}};
}
export async function prefetchThreeEpisodeEvents({variant,capture,anchor,appearanceLock,outputRoot,cloud,repoRoot=process.cwd()}){
 const config=JSON.parse(await readFile(path.join(repoRoot,'config/episode-visual-event-director.json'),'utf8')),promptTemplate=await readFile(path.join(repoRoot,'config/prompts/episode-visual-event-director.zh-CN.md'),'utf8');
 for(const ref of [anchor,...capture.segments.flatMap(s=>[s.video,s.firstFrame,...(s.actionEvidence?[s.actionEvidence]:[])])])if(normalizeVisualHash(await sha256File(ref.path))!==normalizeVisualHash(ref.sha256))throw Error('EPISODE_EVENT_PREFETCH_STALE_INPUT');
 await Promise.all(capture.segments.map(verifyActionEvidence));
 const request=buildPrefetchedEventRequest({variant,capture,anchor,appearanceLock,config,promptTemplate});
 const inputHash=hashVisualInput({version:THREE_EPISODE_VISUAL_VERSION,kind:'visual-events',input:request.inputIdentity}),root=path.join(outputRoot,'tasks','visual-events-'+inputHash.slice(0,24)),record=path.join(root,'stage.json');
 let prior;try{prior=JSON.parse(await readFile(record,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(prior?.status==='completed'&&prior.inputHash===inputHash){for(const f of prior.files)if(normalizeVisualHash(await sha256File(f.path))!==normalizeVisualHash(f.sha256))throw Error('EPISODE_EVENT_PREFETCH_CACHE_CORRUPT');return{...prior.result,inputIdentity:request.inputIdentity};}
 await mkdir(root,{recursive:true});await writeJsonAtomic(path.join(root,'input.json'),request.inputIdentity);await writeJsonAtomic(record,{kind:'visual-events',inputHash,status:'running'});
 try{
  const outputPath=path.join(root,'events-raw.json'),evidence=await cloud.generateEvents({...request,taskId:'three-episode-visual-events-'+inputHash.slice(0,24),outputRoot:root,outputPath});
  const raw=JSON.parse(await readFile(outputPath,'utf8')),result={raw,events:normalizeThreeEpisodeEvents(raw)};
  await writeJsonAtomic(record,{kind:'visual-events',inputHash,status:'completed',result,files:[{path:outputPath,sha256:normalizeVisualHash(await sha256File(outputPath))}],evidence});
  const promptFile=path.join(outputRoot,'variants',variant.id,'prefetched-events.json');await mkdir(path.dirname(promptFile),{recursive:true});await writeJsonAtomic(promptFile,{kind:'three-episode-prefetched-events',status:'prompt-ready',inputIdentity:request.inputIdentity,...result,stopBeforeSeedance:true,providerVideoSubmissionCount:0});
  return{...result,inputIdentity:request.inputIdentity};
 }catch(error){await writeJsonAtomic(record,{kind:'visual-events',inputHash,status:'failed',message:error.message});throw error;}
}
