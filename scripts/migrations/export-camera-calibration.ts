/** Explicit maintenance export: all inputs are preserved source inventories, never runtime imports. */
import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {resolve,relative,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {CAMERA_STRATEGY_DEFAULTS,HUMANOID_CAMERA_PRESETS,createHumanoidCameraDocument,parseCameraDocument,serializeCameraDocument,type CameraDocument,type CameraPreset} from '@worldkit/three';
import {planCameraMigration,sourceSha256} from './camera-configuration';
export interface CalibrationExportInput {baselinePath?:string;variantPath?:string;subjectFactsPath?:string}
export interface CalibrationExportPlan {
 readonly sources:readonly {sourcePath:string;sourceBytes:string;sourceHash:string}[];
 readonly outputs:Readonly<Record<string,string>>;
}
function differences(value:unknown,defaults:unknown):unknown {
 if(JSON.stringify(value)===JSON.stringify(defaults))return undefined;
 if(value&&typeof value==='object'&&!Array.isArray(value)){const entries=Object.entries(value).flatMap(([key,v])=>{const d=differences(v,(defaults as Record<string,unknown>|undefined)?.[key]);return d===undefined?[]:[[key,d]];});return entries.length?Object.fromEntries(entries):undefined;}
 return value;
}
/** Planning captures all source bytes and computes every output without writes. */
export async function planCameraCalibrationExport(input:CalibrationExportInput={}):Promise<CalibrationExportPlan>{
 const paths=[input.baselinePath??'scripts/migrations/fixtures/legacy-camera-baseline.json',input.variantPath??'scripts/migrations/fixtures/legacy-dragon-variants.json',input.subjectFactsPath??'scripts/migrations/fixtures/legacy-camera-subject-facts.json'];
 const sources=await Promise.all(paths.map(async path=>{const sourcePath=resolve(path),sourceBytes=await readFile(sourcePath,'utf8');return {sourcePath,sourceBytes,sourceHash:sourceSha256(sourceBytes)};}));
 const baseline=JSON.parse(sources[0]!.sourceBytes),variants=JSON.parse(sources[1]!.sourceBytes),facts=JSON.parse(sources[2]!.sourceBytes);
 if(typeof facts.sourceRevision!=='string'||!facts.sourceRevision.startsWith(baseline.source))throw new Error('CALIBRATION_SOURCE_IDENTITY_MISMATCH');
 const presets:Record<string,CameraPreset>={},subjects:Record<string,{views:Record<string,{presetId:string}>}>={},reports:unknown[]=[];
 const outputs:Record<string,string>={};
 for(const [id,profile] of Object.entries(baseline.profiles) as [string,{camera:Record<string,unknown>}][]){
  const spec=baseline.vehicles.find((v:{id:string})=>v.id===id),subjectFacts=spec?facts.subjects[id]:undefined;
  if(spec&&(!subjectFacts||typeof subjectFacts.archetype!=='string'||typeof subjectFacts.creature!=='boolean'))throw new Error(`CALIBRATION_SUBJECT_FACTS_MISSING:${id}`);
  const plan=planCameraMigration({sourcePath:sources[0]!.sourcePath,sourceBytes:JSON.stringify(profile.camera),context:{targetEntityId:'person',subject:spec?'vehicle':'humanoid',distanceIntent:'explicit',...spec,...subjectFacts}});
  subjects[id]={views:{}};
  for(const [viewId,view] of Object.entries(plan.document.views)){
   const presetId=`${id}.${viewId}`;
   presets[presetId]={kind:view.kind,values:(id==='person'?{...HUMANOID_CAMERA_PRESETS[`humanoid.${viewId}`]!.values,lens:{...HUMANOID_CAMERA_PRESETS[`humanoid.${viewId}`]!.values.lens,farMeters:2100}}:differences(view.overrides,CAMERA_STRATEGY_DEFAULTS[view.kind])) as CameraPreset['values'],sourceIdentity:{id:`calibration.${id}`,version:baseline.source}} as CameraPreset;
   subjects[id].views[viewId]={presetId};
  }
  reports.push({subjectId:id,sourceHash:sources[0]!.sourceHash,...(subjectFacts?{subjectFacts}:{}),report:plan.report});
 }
 const variantSnapshots:Record<string,Record<string,CameraPreset>>={};
 for(const variant of variants){
  const spec=baseline.vehicles.find((v:{id:string})=>v.id==='dragon');
  const plan=planCameraMigration({sourcePath:sources[1]!.sourcePath,sourceBytes:JSON.stringify({...baseline.profiles.dragon.camera,distance:variant.camera}),context:{targetEntityId:'person',subject:'vehicle',distanceIntent:'explicit',...spec,...facts.subjects.dragon,flyingCreature:true,...(variant.seat?{seat:variant.seat}:{})}});
  variantSnapshots[variant.id]=Object.fromEntries(Object.entries(plan.document.views).map(([id,view])=>[id,{kind:view.kind,values:differences(view.overrides,CAMERA_STRATEGY_DEFAULTS[view.kind]),sourceIdentity:{id:`dragon.${variant.id}`,version:baseline.source}}])) as Record<string,CameraPreset>;
 }
 outputs['packages/preset-content/config/cameras/dragon-variants.json']=JSON.stringify(variantSnapshots,null,2)+'\n';
 outputs['packages/preset-content/config/cameras/presets.json']=JSON.stringify(presets,null,2)+'\n';
 const document:CameraDocument={kind:'world-camera',schemaVersion:1,defaultViewId:'third-person',views:{'third-person':{kind:'third-person'},'first-person':{kind:'first-person'},shoulder:{kind:'shoulder'}},binding:{targetEntityId:'person',mountTarget:'vehicle',subjectOverrides:subjects},presets,activation:'immediate',input:{...createHumanoidCameraDocument('person').input,cycleViewIds:['third-person','first-person','shoulder']}};
 outputs['apps/sdk-playground/config/camera.json']=serializeCameraDocument(parseCameraDocument(document))+'\n';
 for(const [id,distanceMeters] of [['indoor-lab',5.6],['npc-workshop',7]] as const){
  const scene=structuredClone(document) as any;
  scene.binding.subjectOverrides.person.views['third-person'].overrides={position:{distanceMeters}};
  outputs[`apps/sdk-playground/config/cameras/${id}.json`]=serializeCameraDocument(parseCameraDocument(scene))+'\n';
 }
 outputs['packages/preset-content/config/cameras/migration-report.json']=JSON.stringify({sources:sources.map(({sourcePath,sourceHash})=>({sourcePath:relative(process.cwd(),sourcePath),sourceHash})),sourceIdentity:baseline.source,subjectFactsSourceRevision:facts.sourceRevision,subjects:reports,dragonVariants:variants.map((v:any)=>({id:v.id,distanceMeters:v.camera,sourceHash:sources[1]!.sourceHash,status:'retune',note:'Explicit variant distance inventory; selected variant document must bind this calibration.'})),unexportedBrowserProfiles:{status:'unknown',note:'No browser storage inspected; raw v1 keys remain untouched.'}},null,2)+'\n';
 return {sources,outputs};
}
/** Recheck every captured input immediately before the first directory/output write. */
export async function writeCameraCalibrationExport(plan:CalibrationExportPlan,outputRoot:string):Promise<void>{
 const repositoryRoot=fileURLToPath(new URL('../../',import.meta.url));
 const target=outputRoot?resolve(outputRoot):repositoryRoot;
 const withinRepository=relative(repositoryRoot,target).replaceAll('\\','/');
 if(!outputRoot||!withinRepository||/^(asset-library|packages|apps|config)(\/|$)/.test(withinRepository))throw new Error('CALIBRATION_ARCHIVE_OUTPUT_REQUIRED');
 if(await lstat(target).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;}))throw new Error('CALIBRATION_ARCHIVE_OUTPUT_MUST_BE_NEW');
 const current=await Promise.all(plan.sources.map(async source=>sourceSha256(await readFile(source.sourcePath,'utf8'))));
 for(const [index,source] of plan.sources.entries())if(current[index]!==source.sourceHash)throw new Error(`SOURCE_HASH_CONFLICT:${source.sourcePath}`);
 for(const [path,bytes] of Object.entries(plan.outputs)){const output=resolve(outputRoot,path);await mkdir(dirname(output),{recursive:true});await writeFile(output,bytes);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2),outputIndex=args.indexOf('--output'),baselineIndex=args.indexOf('--baseline');
 const output=outputIndex>=0?args[outputIndex+1]:undefined;
 if(!output||output.startsWith('--'))throw new Error('CALIBRATION_ARCHIVE_OUTPUT_REQUIRED: use --output <archive-directory>; active calibration lives in asset-library subject profiles');
 const baseline=baselineIndex>=0?args[baselineIndex+1]:undefined;
 if(baselineIndex>=0&&(!baseline||baseline.startsWith('--')))throw new Error('CALIBRATION_BASELINE_REQUIRED');
 const plan=await planCameraCalibrationExport(baseline?{baselinePath:baseline}:{});
 await writeCameraCalibrationExport(plan,output);
}
