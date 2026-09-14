import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createWorld,createHumanoidCameraDocument,resolveCameraConfiguration,parseCameraDocument} from '@worldkit/three';
import {Group,PerspectiveCamera} from 'three';
import {SPECS} from '@worldkit/preset-content/config';
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
  for(const spec of baseline.vehicles){const resolved=resolveCameraConfiguration(document,{subjectId:spec.id,subjectGeneration:0,subjectKind:'vehicle',availableAnchors:['eye','seat'],headingAvailable:true});
   expect(resolved.values.position).toMatchObject({distanceMeters:spec.camera});
   const shoulder=resolveCameraConfiguration(document,{viewId:'shoulder',subjectId:spec.id,subjectGeneration:0,subjectKind:'vehicle',availableAnchors:['eye','seat'],headingAvailable:true});
   expect(shoulder.values.effects.speedFov.fullEffectSpeedMetersPerSecond).toBe(Math.max(8,spec.speed));
  }
 });

it('resolves source archetype pitch and creature-state anchor calibrations',()=>{const {savedDocument:document}=calibrationProject('campus','D01');const context={subjectGeneration:0,subjectKind:'vehicle',availableAnchors:['eye','seat'] as const,headingAvailable:true};for(const subjectId of ['atv','jetski'])expect(resolveCameraConfiguration(document,{...context,subjectId,viewId:'first-person'}).values.orientation.initialPitchRadians).toBe(.34);for(const [subjectId,height] of [['horse',2.25],['carriage',2.05]] as const)expect(resolveCameraConfiguration(document,{...context,subjectId}).values.position.anchorOffset.offsetMetersXYZ[1]).toBeCloseTo(height);});

it('makes scene distance and variant selection actual inspectable document edits',()=>{
  const scene=calibrationProject('indoor-lab','D02');expect(scene.configurationId).toBe('indoor-lab');expect(scene.unsaved).toBe(true);
  const custom=parseCameraDocument({...scene.document,binding:{...scene.document.binding,subjectOverrides:{...scene.document.binding.subjectOverrides,dragon:{views:{'third-person':{overrides:{position:{distanceMeters:17},zoom:{range:{kind:'unbounded'}}}}}}}}});
  const selected=selectDragonCameraVariant(custom,'D03');expect(selected.binding.subjectOverrides?.dragon?.views['third-person']?.overrides?.position).toEqual({distanceMeters:17});
  expect(scene.document.binding.subjectOverrides?.person?.views['third-person']?.overrides?.position).toEqual({distanceMeters:5.6});
 });

it('installs through actual World owner, and profile application cannot replace the camera',async()=>{
  const world=await createWorld({camera:new PerspectiveCamera(),navigation:false,assetDefinitions:{},humanoid:{map:getMap('campus'),character:{instanceId:'person',object:new Group()},vehicles:[]}});
  try{world.setCameraFollow({configuration:calibrationProject('campus','D01').document});const before=world.inspectCamera();applyControlProfile(world.humanoid!,getDefaultProfile('person')!);expect(world.inspectCamera().configurationRevision).toBe(before.configurationRevision);expect(world.inspectCamera().resolved?.values.position).toMatchObject({anchor:{kind:'body',heightRatio:.655}});}finally{world.dispose();}
 });

it('scopes native default calibration to the on-foot subject and leaves vehicle fallback generic',()=>{const document=createHumanoidCameraDocument('person');const context={subjectGeneration:0,subjectKind:'actor',availableAnchors:['eye','seat'] as const,headingAvailable:true,body:{minimumHeightMeters:0,maximumHeightMeters:1.68}};const person=resolveCameraConfiguration(document,{...context,subjectId:'person'}),vehicle=resolveCameraConfiguration(document,{...context,subjectId:'rover'});expect(person.values.orientation.initialPitchRadians).toBe(.35);expect(vehicle.values.orientation.initialPitchRadians).toBe(.2);});

it('removes camera authority from all current content specifications',()=>{for(const spec of SPECS)expect(spec).not.toHaveProperty('camera');});

it('pure calibration state uses explicit document bytes without inventing build identity',()=>{
 const sourceBytes=readFileSync(new URL('../../config/camera.json',import.meta.url),'utf8');
 const state=createCameraProjectState('campus',JSON.parse(sourceBytes),'D01');
 expect(state.savedDocument).toEqual(parseCameraDocument(JSON.parse(sourceBytes)));
 expect(state).not.toHaveProperty('importedFileSha256');
});
