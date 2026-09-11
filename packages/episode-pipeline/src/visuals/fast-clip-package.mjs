import path from 'node:path';import{mkdir,copyFile}from'node:fs/promises';
import{sha256File,writeJsonAtomic}from'./episode-style-variants.mjs';import{normalizeVisualHash}from'./visual-contracts.mjs';
/** Publish immutable, independently reviewed clips without waiting for the other recordings' styled frames. */
export async function publishFastClipPackage({source,capture,episodeId,variant,openings,styledTriviews,events,review,prepareRequests,outputRoot,publishS3Prefix,cloud}){
 if(typeof episodeId!=='string'||episodeId!==review.episodeId)throw Error('EPISODE_FAST_CLIP_EPISODE_IDENTITY_REQUIRED');
 const indices=capture.segments.map((_,i)=>i).filter(i=>openings[i]);if(!indices.length||styledTriviews.length!==source.targets.length)throw Error('EPISODE_FAST_CLIP_MATERIALS_INCOMPLETE');
 const ids=[...indices.map(i=>capture.segments[i].id),...source.targets.map(t=>'target-'+t.id)];
 if(review.verdict!=='passed'||ids.some(id=>!review.imageReviews.some(r=>r.id===id&&r.verdict==='passed')))throw Error('EPISODE_FAST_CLIP_REVIEW_REQUIRED');
 const root=path.join(outputRoot,'fast-ready',variant.id);await mkdir(path.join(root,'assets'),{recursive:true});const prefix=publishS3Prefix?publishS3Prefix.replace(/\/$/,'')+'/fast-ready/'+variant.id:null;
 const copied=new Map();async function material(ref){
  const sha=normalizeVisualHash(ref.sha256);if(normalizeVisualHash(await sha256File(ref.path))!==sha)throw Error('EPISODE_FAST_CLIP_STALE_MATERIAL');
  const ext=path.extname(ref.path),file=path.join(root,'assets',sha+ext);if(!copied.has(file)){await copyFile(ref.path,file);if(normalizeVisualHash(await sha256File(file))!==sha)throw Error('EPISODE_FAST_CLIP_COPY_CHANGED');copied.set(file,true);}
  return{...ref,path:file,sha256:sha,...(prefix?{s3Uri:prefix+'/inputs/'+sha+ext.toLowerCase()}: {})};
 }
 const captures=structuredClone(capture),frames=new Array(6),targets=[];
 for(const i of indices){captures.segments[i].video=await material(capture.segments[i].video);frames[i]=await material(openings[i]);}
 for(const t of styledTriviews)targets.push(await material(t));
 const requests=prepareRequests({source,capture:captures,variant,openings:frames,styledTriviews:targets,events,segmentIds:indices.map(i=>capture.segments[i].id)});
 const result={kind:'three-episode-fast-ready-clips',schemaVersion:1,episodeId,styleVariantId:variant.id,anchorSha256:openings[0]?.sha256,worldBuildHash:source.worldBuildHash,runtimeHash:source.runtimeHash,status:'prepared',readinessScope:'independent-clip',preparedRequestCount:requests.length,stopBeforeSeedance:true,providerVideoSubmissionCount:0,review,requests};
 await writeJsonAtomic(path.join(root,'ready-clips.json'),result);
 if(prefix)await cloud.publishDirectory(root,prefix);
 return result;
}
