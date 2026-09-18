/** One-time maintenance boundary. Never imported by the runtime or browser. */
import {createHash} from 'node:crypto';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {parseCameraDocument,serializeCameraDocument,type CameraDocument,type CameraViewConfiguration} from '@worldkit/three';
export type MigrationStatus='equivalent'|'converted'|'retune'|'inactive'|'conflict'|'unknown';
export interface MigrationField {field:string;status:MigrationStatus;destination?:string;note:string}
export interface MigrationInput {
 sourcePath:string;sourceBytes:string;
 context:{targetEntityId:string;subject:string;distanceIntent?:string;mapDistanceMeters?:number;speed?:number;viewIds?:string[];nearMeters?:number;farMeters?:number;mode?:string;archetype?:string;aircraftSubtype?:string;creature?:boolean;seat?:number[];flyingCreature?:boolean};
}
export interface MigrationPlan {sourcePath:string;sourceBytes:string;sourceHash:string;document:CameraDocument;documentBytes:string;report:MigrationField[]}
export const sourceSha256=(bytes:string)=>createHash('sha256').update(bytes).digest('hex');
export function planCameraMigration(input:MigrationInput):MigrationPlan {
 const isRecord=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 const invalid=(field:string):never=>{throw new Error(`LEGACY_FIELD_INVALID:${field}`);};
 const parsed:unknown=JSON.parse(input.sourceBytes);
 if(!isRecord(parsed))invalid('$');
 const root=parsed as Record<string,unknown>;
 const wrapped=Object.hasOwn(root,'camera');
 if(wrapped&&!isRecord(root.camera))invalid('camera');
 const old=(wrapped?root.camera:root) as Record<string,unknown>;
 const oldPath=(key:string)=>wrapped?`camera.${key}`:key;
 const numericFields=['baseFovDegrees','distance','distanceMeters','pitchRadians','targetHeightMeters','targetHeightOffset','horizontalOffset','recenterDelaySeconds','recenterResponsePerSecond','followResponsePerSecond','followHalfLifeSeconds','targetHalfLifeSeconds','recoveryHalfLifeSeconds','maximumRecoveryMetersPerSecond','rotationSpeedRadiansPerSecond','transitionSeconds','collisionRadiusMeters'];
 const signed=new Set(['pitchRadians','targetHeightMeters','targetHeightOffset','horizontalOffset']);
 for(const key of numericFields)if(Object.hasOwn(old,key)){
  const value=old[key];
  if(typeof value!=='number'||!Number.isFinite(value)||(!signed.has(key)&&value<0)||(['followResponsePerSecond','collisionRadiusMeters','maximumRecoveryMetersPerSecond'].includes(key)&&value===0)||(key==='baseFovDegrees'&&(value<=0||value>=180)))invalid(oldPath(key));
 }
 const validateSwitches=(record:Record<string,unknown>,prefix:string)=>{
  for(const key of ['collisionEnabled','activateOnInput','keyboardToggleEnabled'])if(Object.hasOwn(record,key)&&typeof record[key]!=='boolean')invalid(prefix+key);
  if(Object.hasOwn(record,'defaultPerspective')&&!['first-person','third-person'].includes(record.defaultPerspective as string))invalid(prefix+'defaultPerspective');
  if(Object.hasOwn(record,'mode')&&(!Number.isInteger(record.mode)||!([0,1,2] as unknown[]).includes(record.mode)))invalid(prefix+'mode');
 };
 validateSwitches(old,wrapped?'camera.':'');
 if(wrapped&&Object.hasOwn(root,'mode'))validateSwitches({mode:root.mode},'');
 if(Object.hasOwn(root,'cameraDistanceMeters')&&root.cameraDistanceMeters!==null&&(typeof root.cameraDistanceMeters!=='number'||!Number.isFinite(root.cameraDistanceMeters)||root.cameraDistanceMeters<0))invalid('cameraDistanceMeters');
 for(const [record,prefix] of (wrapped?[[root,''],[old,'camera.']]:[[old,'']]) as [Record<string,unknown>,string][]){
  if(Object.hasOwn(record,'view')){if(!isRecord(record.view))invalid(prefix+'view');validateSwitches(Object.fromEntries(Object.entries(record.view as Record<string,unknown>).filter(([key])=>['defaultPerspective','keyboardToggleEnabled'].includes(key))),prefix+'view.');}
 }
 if(Object.hasOwn(old,'opening')){
  const opening=old.opening;
  if(!isRecord(opening))invalid(oldPath('opening'));
  const values=opening as Record<string,unknown>;
  for(const key of ['positionWorldMetersXYZ','lookAtWorldMetersXYZ','upWorldXYZ'])if(key!=='upWorldXYZ'||Object.hasOwn(values,key)){
   const vector=values[key];if(!Array.isArray(vector)||vector.length!==3||vector.some(value=>typeof value!=='number'||!Number.isFinite(value)))invalid(oldPath('opening.'+key));
  }
  if(typeof values.fovDegrees!=='number'||!Number.isFinite(values.fovDegrees)||values.fovDegrees<=0||values.fovDegrees>=180)invalid(oldPath('opening.fovDegrees'));
 }
 const c=input.context,human=c.subject==='humanoid',vehicle=c.subject==='vehicle';
 for(const key of ['mapDistanceMeters','speed','nearMeters','farMeters'] as const)if(Object.hasOwn(c,key)){const value=c[key];if(typeof value!=='number'||!Number.isFinite(value)||value<0||((key==='nearMeters'||key==='farMeters')&&value===0))invalid('context.'+key);}
 for(const key of ['creature','flyingCreature'] as const)if(Object.hasOwn(c,key)&&typeof c[key]!=='boolean')invalid('context.'+key);
 if(Object.hasOwn(c,'seat')&&(!Array.isArray(c.seat)||c.seat.length!==3||c.seat.some(value=>typeof value!=='number'||!Number.isFinite(value))))invalid('context.seat');
 if(Object.hasOwn(c,'distanceIntent')&&!['explicit','inherit'].includes(c.distanceIntent!))invalid('context.distanceIntent');
 for(const key of ['mode','archetype','aircraftSubtype'] as const)if(Object.hasOwn(c,key)&&typeof c[key]!=='string')invalid('context.'+key);

 const report:MigrationField[]=[];
 const add=(field:string,status:MigrationStatus,destination:string|undefined,note:string)=>report.push({field,status,...(destination?{destination}:{}),note});
 const number=(key:string,fallback:number)=>typeof old[key]==='number'?old[key] as number:fallback;
 const worldDistance=root.cameraDistanceMeters;
 const distance=typeof worldDistance==='number'?worldDistance:number('distanceMeters',number('distance',human?8.8:4));
 if(Object.hasOwn(root,'cameraDistanceMeters'))add('cameraDistanceMeters','converted','position.distanceMeters',worldDistance===null?'Explicit null restores the context subject baseline.':'Explicit world override is materialized for this subject only.');
 else add('cameraDistanceMeters','inactive',undefined,'Omitted world override: use the specified subject/context baseline.');
 let effectiveDistance=distance;
 if(human&&distance===8.8&&c.distanceIntent===undefined)add('distance','unknown','position.distanceMeters','8.8 may be a map sentinel or explicit user value; kept explicit pending context.');
 if((c.distanceIntent==='inherit'||worldDistance===null)&&c.mapDistanceMeters!==undefined){effectiveDistance=c.mapDistanceMeters;add('distance','converted','position.distanceMeters','Resolved map context into an explicit scene value.');}
 const recenter=number('recenterResponsePerSecond',1.9),response=number('followResponsePerSecond',human?7:8);
 const airborne=['spacecraft','plane','glider','submarine','dragon'].includes(c.mode??'');
 const height=number('targetHeightMeters',vehicle?(c.mode==='tank'?2.3:c.creature===true?(c.seat?.[1]??0)+.6:1):0);
 const sharedRecovery=number('recoveryHalfLifeSeconds',vehicle?.18:human?Math.LN2/5:.24);
 const third={
  framing:{kind:old.opening?'preserve-opening':'look-at'},
  lens:{verticalFovDegrees:number('baseFovDegrees',human?58:55),nearMeters:human?.08:c.nearMeters??.12,farMeters:c.farMeters??2100},
  position:{distanceMeters:effectiveDistance,anchor:!vehicle&&!Object.hasOwn(old,'targetHeightMeters')?human?{kind:'follow-pivot'}:{kind:'body',heightRatio:.65}:{kind:'origin'},anchorOffset:{space:number('horizontalOffset',0)===0?'world':'orbit',offsetMetersXYZ:[number('horizontalOffset',0),height+number('targetHeightOffset',0),0]},subjectTranslationHalfLifeSeconds:number('followHalfLifeSeconds',number('targetHalfLifeSeconds',vehicle||human?0:.08)),anchorHalfLifeSeconds:human?Math.LN2/response:0,armHalfLifeSeconds:vehicle?Math.LN2/response:0},
  orientation:{pitchLimitsRadians:{kind:'bounded',minimumRadians:-85*Math.PI/180,maximumRadians:human?1.1:1.25},initialPitchRadians:number('pitchRadians',human?.35:vehicle?.3:.25),referenceFrame:c.mode==='spacecraft'?'subject-up':'world-up',inheritSubjectYaw:c.mode!=='spacecraft',upHalfLifeSeconds:c.mode==='spacecraft'?Math.LN2/5:0,recenter:{enabled:!human&&recenter>0,delaySeconds:number('recenterDelaySeconds',1.5),yawHalfLifeSeconds:recenter>0?Math.LN2/(recenter*(airborne?1.3/1.9:1)):Math.LN2/1.9,...(vehicle?{pitch:{targetRadians:airborne?.2:.28,halfLifeSeconds:recenter>0?Math.LN2/(1.2*recenter/1.9):0}}:{})}},
  zoom:{range:{kind:'bounded',minimumDistanceMeters:vehicle?effectiveDistance*.45:human?3.2:0,maximumDistanceMeters:vehicle?effectiveDistance*2.5:human?12:100},halfLifeSeconds:human||vehicle?0:number('recoveryHalfLifeSeconds',old.opening?.18:.24)},
  constraints:{collision:{enabled:old.collisionEnabled!==false,radiusMeters:number('collisionRadiusMeters',human?.2:.25),armClearanceMeters:human?.04:0,pivotClearanceMeters:.02},recovery:{halfLifeSeconds:sharedRecovery,clearHoldSeconds:vehicle?.12:0,releaseDeadbandMeters:vehicle&&!c.flyingCreature?.015:0,speedLimit:c.flyingCreature?{kind:'limited',maximumSpeedMetersPerSecond:12}:typeof old.maximumRecoveryMetersPerSecond==='number'&&old.maximumRecoveryMetersPerSecond>0&&old.maximumRecoveryMetersPerSecond<Number.MAX_VALUE?{kind:'limited',maximumSpeedMetersPerSecond:old.maximumRecoveryMetersPerSecond}:vehicle?{kind:'limited',maximumSpeedMetersPerSecond:6}:{kind:'unlimited'}}},
  effects:{speedDistance:{enabled:vehicle,fullEffectSpeedMetersPerSecond:4/.075,maximumOffsetMeters:4,extendHalfLifeSeconds:Math.LN2/3,retractHalfLifeSeconds:Math.LN2/1.2},speedFov:{enabled:vehicle,fullEffectSpeedMetersPerSecond:12/.23,maximumOffsetDegrees:12,halfLifeSeconds:Math.LN2/3}},
 };
 const opening=old.opening?Object.fromEntries(Object.entries(old.opening as Record<string,unknown>).filter(([key])=>['positionWorldMetersXYZ','lookAtWorldMetersXYZ','upWorldXYZ','fovDegrees'].includes(key))):undefined;
 // Authored opening owns these fields; project overrides would be rejected by the SDK.
 const {verticalFovDegrees:_fov,...openingLens}=third.lens;
 const {distanceMeters:_distance,anchor:_anchor,anchorOffset:_offset,...openingPosition}=third.position;
 const {initialPitchRadians:_pitch,...openingOrientation}=third.orientation;
 const thirdOverrides=opening?{...third,lens:openingLens,position:openingPosition,orientation:openingOrientation}:third;
 const ids=c.viewIds??['third-person','first-person','shoulder'];
 const views:Record<string,CameraViewConfiguration>={};
 for(const id of ids){
  if(id==='first-person')views[id]={kind:'first-person',overrides:{
   lens:{...third.lens,nearMeters:.035},position:{anchor:{kind:'eye'},subjectTranslationHalfLifeSeconds:0,anchorHalfLifeSeconds:0,armHalfLifeSeconds:0},
   orientation:{initialPitchRadians:['atv','jetski'].includes(c.archetype??'')?.34:0,referenceFrame:vehicle?'subject-up':'world-up',rollInheritanceRatio:vehicle?1:0,
    pitchLimitsRadians:{kind:'bounded',minimumRadians:-85*Math.PI/180,maximumRadians:1.4},...(vehicle?{yawLimitsRadians:{kind:'bounded' as const,minimumRadians:-Math.PI*5/6,maximumRadians:Math.PI*5/6}}:{}),recenter:{enabled:false}},
   constraints:{collision:{enabled:!human&&!vehicle}},effects:{speedFov:{enabled:false}}}};
  else if(id==='shoulder')views[id]={kind:'shoulder',overrides:{
   lens:{...third.lens,nearMeters:.05},position:{anchor:{kind:'shoulder-eye'},distanceMeters:2,anchorOffset:{space:'orbit',offsetMetersXYZ:[.48+number('horizontalOffset',0),(vehicle?.22:.08)+number('targetHeightOffset',0),0]},subjectTranslationHalfLifeSeconds:0,anchorHalfLifeSeconds:Math.LN2/response,armHalfLifeSeconds:0},
   orientation:{pitchLimitsRadians:{kind:'bounded',minimumRadians:-85*Math.PI/180,maximumRadians:1.05},initialPitchRadians:.12,referenceFrame:vehicle?(['plane','glider'].includes(c.mode??'')&&!['wingsuit','paraglider','balloon'].includes(c.aircraftSubtype??'')?'subject-heading':'subject-up'):'world-up',
    ...(vehicle?{yawLimitsRadians:{kind:'bounded' as const,minimumRadians:-Math.PI*5/6,maximumRadians:Math.PI*5/6}}:{}),recenter:{enabled:vehicle&&recenter>0,delaySeconds:number('recenterDelaySeconds',1.5),yawHalfLifeSeconds:recenter>0?Math.LN2/recenter:0}},
   zoom:{halfLifeSeconds:0},constraints:{collision:{enabled:old.collisionEnabled!==false,radiusMeters:Math.min(.2,number('collisionRadiusMeters',.25)),armClearanceMeters:.025},recovery:{halfLifeSeconds:Math.LN2/5,speedLimit:{kind:'unlimited'}}},
   effects:{speedDistance:{enabled:true,fullEffectSpeedMetersPerSecond:vehicle?Math.max(8,c.speed??8):5.8,maximumOffsetMeters:.3,extendHalfLifeSeconds:0,retractHalfLifeSeconds:0},speedFov:{enabled:true,fullEffectSpeedMetersPerSecond:vehicle?Math.max(8,c.speed??8):5.8,maximumOffsetDegrees:4,halfLifeSeconds:Math.LN2/5}}}};
  else views[id]={kind:'third-person',overrides:thirdOverrides as unknown as NonNullable<Extract<CameraViewConfiguration,{kind:'third-person'}>['overrides']>,...(opening?{opening:opening as never}:{})};
 }
 const mapping:Record<string,string>={baseFovDegrees:'lens.verticalFovDegrees',targetHeightOffset:'position.anchorOffset',horizontalOffset:'position.anchorOffset',targetHeightMeters:'position.anchor',distance:'position.distanceMeters',distanceMeters:'position.distanceMeters',pitchRadians:'orientation.initialPitchRadians',recenterDelaySeconds:'orientation.recenter.delaySeconds',recenterResponsePerSecond:'orientation.recenter',followResponsePerSecond:human?'position.anchorHalfLifeSeconds':'position.armHalfLifeSeconds',followHalfLifeSeconds:'position.subjectTranslationHalfLifeSeconds',targetHalfLifeSeconds:'position.subjectTranslationHalfLifeSeconds',recoveryHalfLifeSeconds:'zoom.halfLifeSeconds + constraints.recovery.halfLifeSeconds',maximumRecoveryMetersPerSecond:'constraints.recovery.speedLimit',collisionEnabled:'constraints.collision.enabled',collisionRadiusMeters:'constraints.collision.radiusMeters',opening:'views.third-person.opening',rotationSpeedRadiansPerSecond:'input.orbitRateRadiansPerSecond',transitionSeconds:'transition.durationSeconds',activateOnInput:'activation',cameraDistanceMeters:'position.distanceMeters',mode:'defaultViewId',defaultPerspective:'defaultViewId',keyboardToggleEnabled:'input.cycleViewIds',view:'defaultViewId + input.cycleViewIds'};
 const unknown=(value:unknown,field:string)=>{
  if(isRecord(value)&&Object.keys(value).length){for(const [key,child] of Object.entries(value))unknown(child,field+'.'+key);}
  else add(field,'unknown',undefined,'Unsupported source field retained in original bytes; requires manual migration.');
 };
 for(const key of Object.keys(old)){
  if(key==='view')continue;
  if(wrapped&&key==='cameraDistanceMeters'){unknown(old[key],oldPath(key));continue;}
  if(!mapping[key]){unknown(old[key],oldPath(key));continue;}
  add(oldPath(key),old.opening&&['distance','distanceMeters','pitchRadians','baseFovDegrees','targetHeightMeters','targetHeightOffset','horizontalOffset'].includes(key)?'inactive':['baseFovDegrees','recenterDelaySeconds','distance','distanceMeters','pitchRadians','opening'].includes(key)?'equivalent':'converted',mapping[key],'Mapped from the specified source context.');
 }
 for(const [record,prefix] of (wrapped?[[root,''],[old,'camera.']]:[[old,'']]) as [Record<string,unknown>,string][]){
  if(isRecord(record.view))for(const [key,value] of Object.entries(record.view)){
   if(['defaultPerspective','keyboardToggleEnabled'].includes(key))add(prefix+'view.'+key,prefix&&root.view?'inactive':'converted',mapping[key],prefix&&root.view?'Top-level view takes precedence; retained source value is inactive.':'Mapped from the specified source context.');
   else unknown(value,prefix+'view.'+key);
  }
 }
 if(wrapped)for(const [key,value] of Object.entries(root))if(!['camera','cameraDistanceMeters','view','mode'].includes(key))unknown(value,key);
 if(wrapped&&Object.hasOwn(root,'mode'))add('mode','converted','defaultViewId','Mapped from the source numeric mode.');
 if(isRecord(old.opening))for(const [key,value] of Object.entries(old.opening))if(!['positionWorldMetersXYZ','lookAtWorldMetersXYZ','upWorldXYZ','fovDegrees'].includes(key))unknown(value,oldPath('opening.'+key));
 for(const [field,note] of Object.entries({hiddenOpeningPitch:'Explicit .35 humanoid / .3 vehicle / .12 shoulder; public .25.',hiddenBodyAnchor:'Measured follow-pivot retains body ratio .655 and swimming height 1.4.',hiddenNear:'Construction .12 and view .035/.05 are explicit per-view lens values.',hiddenRecenter:'Airborne yaw multiplier and ground/air pitch targets exported as values.',shoulderPace:'Full-effect speed exported from the specified source speed; never read dynamics at runtime.',shoulderRadius:'Effective min(.2, configured radius) exported; new edits have no hidden clamp.',roll:'Vehicle first-person retains the source roll inheritance.',collision:'Native first-person uses actor/vehicle contacts; third-person uses immediate safe contraction and source radial recovery.',anchorSpace:'Orbit lateral offsets remain relative to camera yaw; fixed tank eye and orbit offset are separate.',seatEye:'Native eye and shoulder-eye facts retain stable capsule posture and source seat fallbacks.'}))add(field,'converted',undefined,note);
 if(vehicle&&c.speed===undefined)add('shoulderPace','unknown',undefined,'No exported source speed; provisional 8 m/s must be retuned.');
 const legacyView=(root.view??old.view??{}) as Record<string,unknown>;
 const requestedView=legacyView.defaultPerspective??old.defaultPerspective;
 const numericMode=root.mode??old.mode;
 const defaultViewId=typeof requestedView==='string'&&ids.includes(requestedView)?requestedView:typeof numericMode==='number'&&ids[numericMode]?ids[numericMode]!:ids[0]!;
 const document=parseCameraDocument({kind:'world-camera',schemaVersion:1,defaultViewId,views,binding:{targetEntityId:c.targetEntityId,mountTarget:vehicle?'vehicle':'actor'},activation:old.activateOnInput===false||views[defaultViewId]?.kind==='first-person'?'immediate':'on-input',input:{cycleViewIds:legacyView.keyboardToggleEnabled===false||old.keyboardToggleEnabled===false?[]:ids,orbitRateRadiansPerSecond:number('rotationSpeedRadiansPerSecond',human||vehicle?1.2:1.8),...(human||vehicle?{orbitPitchRateRadiansPerSecond:1}:{})},transition:{durationSeconds:number('transitionSeconds',human||vehicle?0:.35)}});
 return {sourcePath:input.sourcePath,sourceBytes:input.sourceBytes,sourceHash:sourceSha256(input.sourceBytes),document,documentBytes:serializeCameraDocument(document)+'\n',report};
}
/** A hash conflict is checked before any output or backup write; original bytes remain untouched. */
export async function writeCameraMigration(plan:MigrationPlan,destination:string):Promise<void>{
 if(sourceSha256(await readFile(plan.sourcePath,'utf8'))!==plan.sourceHash)throw new Error('SOURCE_HASH_CONFLICT');
 if(destination===plan.sourcePath)throw new Error('MIGRATION_DESTINATION_MUST_DIFFER');
 await writeFile(destination+'.source.json',JSON.stringify({sourcePath:plan.sourcePath,sourceHash:plan.sourceHash,sourceBytes:plan.sourceBytes,report:plan.report},null,2)+'\n');
 await writeFile(destination+'.tmp',plan.documentBytes);await rename(destination+'.tmp',destination);
}

/** Explicit export conversion; browser runtime never imports or runs this reader. */
export async function migrateLegacyAssetProfile(sourceBytes:string){
 const {parseControlProfile}=await import('@worldkit/preset-content/platform/profiles');
 const old=JSON.parse(sourceBytes);
 if(old.version!==1)throw new Error('LEGACY_PROFILE_VERSION_REQUIRED');
 const profile=parseControlProfile({version:3,assetId:old.assetId,control:old.control});
 return {profile,envelope:old.envelope,sourceBytes,sourceHash:sourceSha256(sourceBytes),inactiveCamera:old.camera,report:[
  {field:'control',status:'equivalent',note:'Explicit import into the v3 control owner.'},
  {field:'envelope',status:'separate',note:'Geometry remains a separate asset fact and is not written into the control profile.'},
  {field:'camera',status:'inactive',note:'Requires separate CameraDocument migration; never applied by profile import.'},
  ...Object.keys(old).filter(k=>!['version','assetId','control','envelope','camera'].includes(k)).map(field=>({field,status:'unknown',note:'Retained in source bytes; manual review required.'})),
 ]};
}

/** Only rewrite an explicitly inventoried byte range; unsupported custom code is reported. */
export function rewriteKnownCameraCall(source:string,site:{path:string;start:number;end:number;expectedCall:string;worldExpression:string},plan:MigrationPlan){
 const current=source.slice(site.start,site.end);
 if(current!==site.expectedCall)return {source,report:{field:`${site.path}:${site.start}`,status:'conflict' as const,note:'Known call bytes changed; source left untouched.'}};
 if(!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(site.worldExpression)||!current.startsWith(site.worldExpression+'.setCameraFollow('))return {source,report:{field:`${site.path}:${site.start}`,status:'unknown' as const,note:'Unsupported custom camera call; migrate manually.'}};
 return {source:source.slice(0,site.start)+`${site.worldExpression}.setCameraFollow({configuration:${plan.documentBytes.trim()}})`+source.slice(site.end),report:{field:`${site.path}:${site.start}`,status:'converted' as const,note:'Explicitly inventoried call replaced with canonical document.'}};
}
