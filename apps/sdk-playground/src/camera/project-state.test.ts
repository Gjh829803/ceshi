import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createWorld,createHumanoidCameraDocument,resolveCameraConfiguration,parseCameraDocument,type CameraPreset} from '@worldkit/three';
import {Group,PerspectiveCamera} from 'three';
import {SPECS} from '@worldkit/preset-content/config';
import cameraPresets from '@worldkit/preset-content/cameras/presets.json';
import {getMap} from '@worldkit/preset-content/environment/maps';
import {getDefaultProfile} from '@worldkit/preset-content/platform/profiles';
import {applyControlProfile} from '@worldkit/preset-content/platform/profile-runtime';
import {cameraConfigurationId,createCameraProjectState,selectDragonCameraVariant} from './project-state';
import {CAMERA_PROJECT_FILES} from './project-files';
function calibrationProject(sceneId:string,variantId:string){
 const configurationId=cameraConfigurationId(sceneId);
 const sourceBytes=readFileSync(new URL('../../'+CAMERA_PROJECT_FILES[configurationId],import.meta.url),'utf8');
 return createCameraProjectState(configurationId,JSON.parse(sourceBytes),variantId);
}
const baseline=JSON.parse(readFileSync(new URL('../../../../scripts/migrations/fixtures/legacy-camera-baseline.json',import.meta.url),'utf8'));
it('resolves all 32 vehicle distances and explicit shoulder speed from documents',()=>{
  const {savedDocument:document}=calibrationProject('campus','D01');expect(baseline.vehicles).toHaveLength(32);
  for(const spec of baseline.vehicles){const resolved=resolveCameraConfiguration(document,{subjectId:spec.id,subjectGeneration:0,subjectKind:'vehicle',availableAnchors:['eye','seat','shoulder-eye','follow-pivot'],headingAvailable:true});
   expect(resolved.values.position).toMatchObject({distanceMeters:spec.id==='glider'?16:spec.camera});
   const shoulder=resolveCameraConfiguration(document,{viewId:'shoulder',subjectId:spec.id,subjectGeneration:0,subjectKind:'vehicle',availableAnchors:['eye','seat','shoulder-eye','follow-pivot'],headingAvailable:true});
   expect(shoulder.values.effects.speedFov.fullEffectSpeedMetersPerSecond).toBe(Math.max(8,spec.speed));
  }
 });

it.each(Object.keys(CAMERA_PROJECT_FILES))('binds every current vehicle to the same named content presets in %s',configurationId=>{
 const context={subjectGeneration:0,subjectKind:'vehicle',availableAnchors:['eye','seat','shoulder-eye','follow-pivot'] as const,headingAvailable:true};
  const {savedDocument:document}=calibrationProject(configurationId,'D01');
  for(const spec of SPECS)for(const viewId of ['third-person','first-person','shoulder']){
   const presetId=`${spec.id}.${viewId}`;
   expect(document.binding.subjectOverrides?.[spec.id]?.views[viewId]?.presetId).toBe(presetId);
   expect(document.presets?.[presetId]).toEqual(cameraPresets[presetId as keyof typeof cameraPresets]);
   expect(resolveCameraConfiguration(document,{...context,subjectId:spec.id,viewId}).viewId).toBe(viewId);
  }
});

it('resolves source archetype pitch and creature-state anchor calibrations',()=>{const {savedDocument:document}=calibrationProject('campus','D01');const context={subjectGeneration:0,subjectKind:'vehicle',availableAnchors:['eye','seat','shoulder-eye','follow-pivot'] as const,headingAvailable:true};for(const subjectId of ['atv','jetski'])expect(resolveCameraConfiguration(document,{...context,subjectId,viewId:'first-person'}).values.orientation.initialPitchRadians).toBe(.34);for(const [subjectId,height] of [['horse',2.25],['carriage',2.05]] as const)expect(resolveCameraConfiguration(document,{...context,subjectId}).values.position.anchorOffset.offsetMetersXYZ[1]).toBeCloseTo(height);});

it('makes scene distance and variant selection actual inspectable document edits',()=>{
  const scene=calibrationProject('indoor-lab','D02');expect(scene.configurationId).toBe('indoor-lab');expect(scene.unsaved).toBe(true);
  const custom=parseCameraDocument({...scene.document,binding:{...scene.document.binding,subjectOverrides:{...scene.document.binding.subjectOverrides,dragon:{views:{'third-person':{overrides:{position:{distanceMeters:17},zoom:{range:{kind:'unbounded'}}}}}}}}});
  const selected=selectDragonCameraVariant(custom,'D03');expect(selected.binding.subjectOverrides?.dragon?.views['third-person']?.overrides?.position).toEqual({distanceMeters:17});
  expect(scene.document.binding.subjectOverrides?.person?.views['third-person']?.overrides?.position).toEqual({distanceMeters:5.6});
 });

it('keeps saved variant snapshots on reload and when switching away and back',()=>{
 const original=calibrationProject('campus','D01').document;
 const firstPresetId=original.binding.subjectOverrides!.dragon!.views['third-person']!.presetId!;
 const firstPreset=original.presets![firstPresetId]!;
 expect(firstPresetId).toBe('dragon.D01.third-person');
 expect(firstPreset.values.position).toMatchObject({distanceMeters:32});
 const first=parseCameraDocument({...original,presets:{...original.presets,[firstPresetId]:{...firstPreset,values:{...firstPreset.values,lens:{...firstPreset.values.lens,verticalFovDegrees:63}}}}});
 const reloaded=createCameraProjectState('campus',first,'D01');
 expect(reloaded.document).toEqual(first);expect(reloaded.unsaved).toBe(false);
 const switched=selectDragonCameraVariant(first,'D02');
 const secondPresetId=switched.binding.subjectOverrides!.dragon!.views['third-person']!.presetId!;
 const secondPreset=switched.presets![secondPresetId]!;
 const second=parseCameraDocument({...switched,presets:{...switched.presets,[secondPresetId]:{...secondPreset,values:{...secondPreset.values,lens:{...secondPreset.values.lens,verticalFovDegrees:71}}}}});
 const restored=selectDragonCameraVariant(second,'D01');
 expect(restored.binding.subjectOverrides!.dragon!.views['third-person']!.presetId).toBe(firstPresetId);
 expect(restored.presets![firstPresetId]).toEqual(first.presets![firstPresetId]);
 expect(selectDragonCameraVariant(restored,'D02').presets![secondPresetId]).toEqual(second.presets![secondPresetId]);
 expect(original.presets![firstPresetId]!.values.lens?.verticalFovDegrees).toBe(55);
});

it('preserves a renamed saved snapshot for the already selected variant',()=>{
 const original=calibrationProject('campus','D01').document;
 const subject=original.binding.subjectOverrides!.dragon!;
 const view=subject.views['third-person']!;
 const preset=original.presets![view.presetId!]!;
 const presets:Record<string,CameraPreset>={...original.presets,'custom.dragon.explore':{...preset,values:{...preset.values,lens:{...preset.values.lens,verticalFovDegrees:63}}}};
 delete presets[view.presetId!];
 const saved=parseCameraDocument({...original,presets,binding:{...original.binding,subjectOverrides:{...original.binding.subjectOverrides,dragon:{views:{...subject.views,'third-person':{...view,presetId:'custom.dragon.explore'}}}}}});
 expect(createCameraProjectState('campus',saved,'D01').document).toEqual(saved);
 const restored=selectDragonCameraVariant(selectDragonCameraVariant(saved,'D02'),'D01');
 expect(restored.binding.subjectOverrides!.dragon!.views['third-person']!.presetId).toBe('custom.dragon.explore');
 expect(restored.presets!['custom.dragon.explore']).toEqual(presets['custom.dragon.explore']);
});

it('loads an authored preset without variant provenance until a variant is explicitly selected',()=>{
 const original=calibrationProject('campus','D01').document;
 const subject=original.binding.subjectOverrides!.dragon!;
 const view=subject.views['third-person']!;
 const preset=original.presets![view.presetId!]!;
 const custom:CameraPreset={kind:preset.kind,values:{...preset.values,lens:{...preset.values.lens,verticalFovDegrees:63}}};
 const saved=parseCameraDocument({...original,presets:{...original.presets,'custom.explore':custom},binding:{...original.binding,subjectOverrides:{...original.binding.subjectOverrides,dragon:{views:{...subject.views,'third-person':{...view,presetId:'custom.explore'}}}}}});
 const loaded=createCameraProjectState('campus',saved,'D01');
 expect(loaded.document).toEqual(saved);expect(loaded.unsaved).toBe(false);
 const switched=selectDragonCameraVariant(saved,'D02');
 expect(switched.binding.subjectOverrides!.dragon!.views['third-person']!.presetId).toBe('dragon.D02.third-person');
 expect(switched.presets!['custom.explore']).toEqual(custom);
});

it('rejects conflicting view and saved variant preset kinds instead of skipping or replacing them',()=>{
 const mismatchedView=parseCameraDocument({kind:'world-camera',schemaVersion:1,defaultViewId:'third-person',binding:{targetEntityId:'person'},views:{'third-person':{kind:'first-person'}}});
 expect(()=>selectDragonCameraVariant(mismatchedView,'D01')).toThrow('CAMERA_VARIANT_VIEW_KIND_MISMATCH');
 const original=calibrationProject('campus','D01').document;
 const mismatchedPreset=parseCameraDocument({...original,presets:{...original.presets,'dragon.D02.third-person':{kind:'first-person',values:{}}}});
 expect(()=>selectDragonCameraVariant(mismatchedPreset,'D02')).toThrow('CAMERA_VARIANT_PRESET_KIND_MISMATCH');
});

it('keeps on-foot calibration when the NPC workshop follows either native character instance',()=>{
 const {savedDocument:document}=calibrationProject('npc-workshop','D01');
 const context={subjectGeneration:0,subjectKind:'actor',availableAnchors:['eye','seat','shoulder-eye','follow-pivot'] as const,headingAvailable:true,body:{minimumHeightMeters:0,maximumHeightMeters:1.68}};
 for(const subjectId of ['npc-left','npc-right']){
  const followed=parseCameraDocument({...document,binding:{...document.binding,targetEntityId:subjectId}});
  for(const viewId of ['third-person','first-person','shoulder']){
   const resolved=resolveCameraConfiguration(followed,{...context,subjectId,viewId});
   const player=resolveCameraConfiguration(document,{...context,subjectId:'person',viewId});
   expect(resolved.values).toEqual(player.values);
   expect(resolved.values.orientation.recenter.enabled).toBe(false);
   if(resolved.kind==='first-person'){
    expect(resolved.values.constraints.collision.enabled).toBe(false);
    expect(resolved.values.orientation.rollInheritanceRatio).toBe(0);
   }
  }
 }
});

it('installs through actual World owner, and profile application cannot replace the camera',async()=>{
  const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map:getMap('campus'),character:{instanceId:'person',object:new Group()},vehicles:[]}});
  try{world.setCameraFollow({configuration:calibrationProject('campus','D01').document});const before=world.inspectCamera();applyControlProfile(world.humanoid!,getDefaultProfile('person')!);expect(world.inspectCamera().configurationRevision).toBe(before.configurationRevision);expect(world.inspectCamera().resolved?.values.position).toMatchObject({anchor:{kind:'follow-pivot'}});}finally{world.dispose();}
 });

it('scopes native default calibration to the on-foot subject and leaves vehicle fallback generic',()=>{const document=createHumanoidCameraDocument('person');const context={subjectGeneration:0,subjectKind:'actor',availableAnchors:['eye','seat','shoulder-eye','follow-pivot'] as const,headingAvailable:true,body:{minimumHeightMeters:0,maximumHeightMeters:1.68}};const person=resolveCameraConfiguration(document,{...context,subjectId:'person'}),vehicle=resolveCameraConfiguration(document,{...context,subjectId:'rover'});expect(person.values.orientation.initialPitchRadians).toBe(.35);expect(vehicle.values.orientation.initialPitchRadians).toBe(.2);});

it('removes camera authority from all current content specifications',()=>{for(const spec of SPECS)expect(spec).not.toHaveProperty('camera');});

it('pure calibration state uses explicit document bytes without inventing build identity',()=>{
 const sourceBytes=readFileSync(new URL('../../config/camera.json',import.meta.url),'utf8');
 const state=createCameraProjectState('campus',JSON.parse(sourceBytes),'D01');
 expect(state.savedDocument).toEqual(parseCameraDocument(JSON.parse(sourceBytes)));
 expect(state).not.toHaveProperty('importedFileSha256');
});
