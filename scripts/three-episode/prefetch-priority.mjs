import{readFile,writeFile,readdir}from'node:fs/promises';import{createCloudClient}from'./cloud.mjs';import{prefetchThreeEpisodeEvents}from'./event-prefetch.mjs';
const root=process.argv[2];if(!/^\/episode\/output\/human-ten-0[1-9]$/.test(root??''))throw Error('PREFETCH_ROOT_INVALID');
const vroot=root+'/visuals',read=async p=>JSON.parse(await readFile(p,'utf8')),plan=await read(vroot+'/style-plan.json'),capture=await read(root+'/capture-input.json'),variant=plan.variants.find(v=>v.id==='style-00');let anchor,appearanceLock;
for(const name of await readdir(vroot+'/anchors'))if(name.startsWith('history-')){const h=await read(vroot+'/anchors/'+name);if(h.styles?.['style-00']?.currentAnchor)anchor=h.styles['style-00'].currentAnchor;}
if(!anchor)throw Error('ACCEPTED_ANCHOR_REQUIRED');
for(const name of await readdir(vroot+'/tasks'))if(name.startsWith('appearance-lock-')){const s=await read(vroot+'/tasks/'+name+'/stage.json');if(s.status==='completed'&&s.result?.styleVariantId==='style-00'&&s.result.anchorSha256===anchor.sha256)appearanceLock=s.result;}
if(!appearanceLock)throw Error('APPEARANCE_LOCK_REQUIRED');
try{const result=await prefetchThreeEpisodeEvents({variant,capture,anchor,appearanceLock,outputRoot:vroot,cloud:createCloudClient()});await writeFile('/tmp/episode-fast-prompt.json',JSON.stringify({status:'completed',eventCount:result.events.length,at:new Date().toISOString()}));}catch(e){await writeFile('/tmp/episode-fast-prompt.json',JSON.stringify({status:'failed',error:e.message}));throw e;}
