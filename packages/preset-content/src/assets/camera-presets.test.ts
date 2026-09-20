import {expect,it} from 'vitest';
import {createHumanoidCameraDocument,parseCameraDocument,resolveCameraConfiguration,type CameraPreset} from '@worldkit/three';
import presets from '../../config/generated/camera-presets.json';
import variantPresets from '../../config/generated/dragon-camera-presets.json';
import {SPECS} from '../config';
import {DRAGON_VARIANTS,readDragonSpec} from '../creatures/dragon-variants';

const kinds=['third-person','first-person','shoulder'] as const;
function resolvePreset(subjectId:string,preset:CameraPreset){
 const document=parseCameraDocument({kind:'world-camera',schemaVersion:1,defaultViewId:preset.kind,
  views:{[preset.kind]:{kind:preset.kind}},presets:{selected:preset},
  binding:{targetEntityId:subjectId,subjectOverrides:{[subjectId]:{views:{[preset.kind]:{presetId:'selected'}}}}}});
 return resolveCameraConfiguration(document,{subjectId,subjectGeneration:0,subjectKind:'vehicle',
  availableAnchors:['eye','seat','follow-pivot','shoulder-eye'],headingAvailable:true,body:{minimumHeightMeters:0,maximumHeightMeters:2}});
}

it('snapshots native on-foot fading without enabling it on vehicle presets',()=>{
 const native=createHumanoidCameraDocument('person');
 for(const kind of ['third-person','shoulder'] as const){
  const content=resolvePreset('person',presets[`person.${kind}`] as CameraPreset);
  expect(content.values).toMatchObject({subjectFade:{enabled:true,startDistanceMeters:1.2,endDistanceMeters:.75}});
  expect(native.presets![`humanoid.${kind}`]!.values).toMatchObject({subjectFade:presets[`person.${kind}`].values.subjectFade});
  for(const spec of SPECS)expect(resolvePreset(spec.id,(presets as Record<string,unknown>)[`${spec.id}.${kind}`] as CameraPreset).values).toMatchObject({subjectFade:{enabled:false}});
 }
});

it('resolves all maintained vehicle views from content presets without spec camera scalars',()=>{
 for(const spec of SPECS){
  expect(spec).not.toHaveProperty('camera');
  for(const kind of kinds){
   const preset=(presets as Record<string,unknown>)[`${spec.id}.${kind}`] as CameraPreset;
   expect(preset,`${spec.id}.${kind}`).toBeDefined();
   const resolved=resolvePreset(spec.id,preset);
   expect(resolved.kind).toBe(kind);
   if(kind==='third-person'){
    expect(resolved.values.constraints.recovery).toEqual({halfLifeSeconds:.18, speedLimit:{kind:'limited',maximumSpeedMetersPerSecond:6},clearHoldSeconds:.12,releaseDeadbandMeters:.015});
    expect(resolved.fields['constraints.recovery.halfLifeSeconds']?.source).toBe('subject-preset');
   }
  }
 }
});

it('keeps every numbered flying creature on its own measured preset and recovery',()=>{
 expect(DRAGON_VARIANTS.map(variant=>variant.id)).toEqual(Array.from({length:11},(_,index)=>`D${String(index+1).padStart(2,'0')}`));
 for(const variant of DRAGON_VARIANTS){
  expect(variant).not.toHaveProperty('camera');
  for(const kind of kinds){
   const preset=(variantPresets as Record<string,Record<string,unknown>>)[variant.id]![kind] as CameraPreset;
   const resolved=resolvePreset(variant.id,preset);
   if(kind==='third-person')expect(resolved.values.constraints.recovery).toEqual({halfLifeSeconds:.18,
    speedLimit:{kind:'limited',maximumSpeedMetersPerSecond:12},clearHoldSeconds:.12,releaseDeadbandMeters:0});
  }
 }
});

// Fixed behavioral fingerprints captured from this branch before the authority move.
// They protect tuned values and public ordering while allowing serialization changes.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {DEFAULT_PROFILES} from '../profiles/profiles';
import {ROAD_CUSHIONS} from '../vehicles/road/seating';
import {ATV_SOCKETS} from '../vehicles/atv/spec';
import {JETSKI_SOCKETS} from '../vehicles/jetski/spec';
import {RAFT_SOCKETS} from '../vehicles/raft/spec';
import {TANK_SOCKETS} from '../vehicles/tank/spec';
import {UNICYCLE_SOCKETS} from '../vehicles/unicycle/spec';
import {syncPresetContent} from '../../../../asset-library/tools/presets.mjs';
import {presetAuthoringContext,createContentAdapter} from './host-adapter.mjs';
const repositoryRoot=fileURLToPath(new URL('../../../../',import.meta.url));
function canonical(value:unknown):unknown{
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical((value as Record<string,unknown>)[key])]));
 return value;
}
function fingerprint(value:unknown){return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');}
it('preserves merged dev handling, variant, seating and camera calibration',()=>{
 // dev f6000cdc/d84a9641 calibration plus 8b6854ea kart seat and compound chassis.
 // Control settings now enter through the shared profile adapter, including its stable profile id.
 expect(fingerprint(SPECS)).toBe('b1ccde69dda68c7b861255edb4792379a028a9f2b8c4c7867c998031c9eb848f');
 expect(fingerprint(DRAGON_VARIANTS)).toBe('efb0be7ca627d8d61fead83ca73bfb45acad424757b7954476639b98489d33a4');
 expect(fingerprint(ROAD_CUSHIONS)).toBe('c6d31c87e47751d852360b73f30cd906f9a895291714f4ead60076ee913028de');
 expect(fingerprint(DEFAULT_PROFILES)).toBe('5d518395534295eac4b4319c7d00a8d1a5bf9568145cc23f293fbe89dddbaea8');
 expect(fingerprint(presets)).toBe('3970adaec5213432352e1365a00c6cfe1e7e80fb2098560297d36e7f41796a5f');
 expect(fingerprint(variantPresets)).toBe('9f0294e0545a6be58daa0593b1c5080e3aed417e87c00e2f589285fe7f7fe34b');
 expect(fingerprint({atv:ATV_SOCKETS,jetski:JETSKI_SOCKETS,raft:RAFT_SOCKETS,tank:TANK_SOCKETS,unicycle:UNICYCLE_SOCKETS})).toBe('3fc1ace9243c024cc7930772a9eabae76c1680a672f9f3dc143d8bbcea90de8c');
 expect(()=>syncPresetContent(path.join(repositoryRoot,'asset-library'),path.join(repositoryRoot,'packages/preset-content'),true,presetAuthoringContext())).not.toThrow();
});
it('composes independent engine tuning and content geometry without changing content artifact identity',()=>{
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'preset-authority-'));
 try{
  const library=path.join(temporary,'library'),output=path.join(temporary,'package');
  for(const folder of ['subjects','shared'])fs.cpSync(path.join(repositoryRoot,'asset-library',folder),path.join(library,folder),{recursive:true,filter:source=>fs.statSync(source).isDirectory()||source.endsWith('.json')});
  const engine={presets:JSON.parse(fs.readFileSync(path.join(repositoryRoot,'packages/preset-content/config/presets/subjects.json'),'utf8')),
   integrations:JSON.parse(fs.readFileSync(path.join(repositoryRoot,'packages/preset-content/config/integrations/whitebox.json'),'utf8'))};
  const originalContext=createContentAdapter(engine).runtimeAssetContext(['vehicle.atv']);
  syncPresetContent(library,output,false,presetAuthoringContext(engine));
  expect(()=>syncPresetContent(library,output,true,presetAuthoringContext(engine))).not.toThrow();
  const subject=path.join(library,'subjects/vehicles/vehicle.atv/0.1.0/profiles');
  const contentBefore=fs.readFileSync(path.join(subject,'locomotion.json'),'utf8');
  const resourceBefore=fs.readFileSync(path.join(subject,'../resources.json'),'utf8');
  engine.presets['vehicle.atv'].parameters.speed=17.25;
  engine.presets['vehicle.atv'].camera['atv.third-person'].values.position.distanceMeters=19;
  expect(createContentAdapter(engine).runtimeAssetContext(['vehicle.atv']).preset_digest).not.toBe(originalContext.preset_digest);
  expect(fs.readFileSync(path.join(subject,'locomotion.json'),'utf8')).toBe(contentBefore);
  expect(fs.readFileSync(path.join(subject,'../resources.json'),'utf8')).toBe(resourceBefore);
  const locomotion=JSON.parse(fs.readFileSync(path.join(subject,'locomotion.json'),'utf8'));
  locomotion.parameters.wheelPhysics.radius=.777;
  locomotion.parameters.seat=[0,3,0];
  fs.writeFileSync(path.join(subject,'locomotion.json'),JSON.stringify(locomotion));
  const socketFile=path.join(subject,'../bindings/sockets.json');
  const sockets=JSON.parse(fs.readFileSync(socketFile,'utf8'));
  sockets.sockets.find((socket:{id:string})=>socket.id==='entry.left').positionMetersXYZ=[2,3,4];
  fs.writeFileSync(socketFile,JSON.stringify(sockets));
  const dragonFile=path.join(library,'subjects/fantastical/creature.dragon.d02/0.1.0/profiles/locomotion.json');
  const dragon=JSON.parse(fs.readFileSync(dragonFile,'utf8'));
  dragon.parameters.seat=[0,4,0];
  engine.presets['creature.dragon.d02'].parameters.speed=27;
  fs.writeFileSync(dragonFile,JSON.stringify(dragon));
  expect(()=>syncPresetContent(library,output,true,presetAuthoringContext(engine))).toThrow(/PRESET_CONTENT_OUT_OF_DATE/);
  syncPresetContent(library,output,false,presetAuthoringContext(engine));
  expect(JSON.parse(fs.readFileSync(path.join(output,'config/generated/subjects.json'),'utf8')).atv.speed).toBe(17.25);
  expect(JSON.parse(fs.readFileSync(path.join(output,'config/generated/subjects.json'),'utf8')).atv.wheelPhysics.radius).toBe(.777);
  expect(JSON.parse(fs.readFileSync(path.join(output,'config/generated/subjects.json'),'utf8')).atv.seat).toEqual([0,3,0]);
  expect(fs.readFileSync(path.join(subject,'../resources.json'),'utf8')).toBe(resourceBefore);
  expect(JSON.parse(fs.readFileSync(path.join(output,'config/generated/camera-presets.json'),'utf8'))['atv.third-person'].values.position.distanceMeters).toBe(19);
  expect(JSON.parse(fs.readFileSync(path.join(output,'config/generated/models.json'),'utf8')).atv.sockets['entry.left']).toEqual([2,3,4]);
  expect(JSON.parse(fs.readFileSync(path.join(output,'config/generated/dragon-variants.json'),'utf8'))[1].seat).toEqual([0,4,0]);
  expect(JSON.parse(fs.readFileSync(path.join(output,'config/generated/dragon-specs.json'),'utf8')).D02.speed).toBe(27);
  fs.rmSync(path.join(subject,'locomotion.json'));
  expect(()=>syncPresetContent(library,output,false,presetAuthoringContext(engine))).toThrow();
 }finally{fs.rmSync(temporary,{recursive:true,force:true});}
},15000);
it('reads canonical numbered dragon specs as independent copies with explicit missing-ID errors',()=>{
 const librarySpecs=JSON.parse(fs.readFileSync(path.join(repositoryRoot,'packages/preset-content/config/generated/dragon-specs.json'),'utf8'));
 for(const variant of DRAGON_VARIANTS)expect(readDragonSpec(variant.id)).toEqual(librarySpecs[variant.id]);
 const copy=readDragonSpec('D01');copy.speed=99;copy.seat[1]=99;
 expect(readDragonSpec('D01')).toEqual(librarySpecs.D01);
 expect(()=>readDragonSpec('missing')).toThrow('Unknown dragon variant');
});
