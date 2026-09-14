import {expect,it} from 'vitest';
import {parseCameraDocument,resolveCameraConfiguration,type CameraPreset} from '@worldkit/three';
import presets from '../../config/cameras/presets.json';
import variantPresets from '../../config/cameras/dragon-variants.json';
import {SPECS} from '../config';
import {DRAGON_VARIANTS} from '../creatures/dragon-variants';

const kinds=['third-person','first-person','shoulder'] as const;
function resolvePreset(subjectId:string,preset:CameraPreset){
 const document=parseCameraDocument({kind:'world-camera',schemaVersion:1,defaultViewId:preset.kind,
  views:{[preset.kind]:{kind:preset.kind}},presets:{selected:preset},
  binding:{targetEntityId:subjectId,subjectOverrides:{[subjectId]:{views:{[preset.kind]:{presetId:'selected'}}}}}});
 return resolveCameraConfiguration(document,{subjectId,subjectGeneration:0,subjectKind:'vehicle',
  availableAnchors:['eye','seat'],headingAvailable:true,body:{minimumHeightMeters:0,maximumHeightMeters:2}});
}

it('resolves all maintained vehicle views from content presets without spec camera scalars',()=>{
 for(const spec of SPECS){
  expect(spec).not.toHaveProperty('camera');
  for(const kind of kinds){
   const preset=(presets as Record<string,unknown>)[`${spec.id}.${kind}`] as CameraPreset;
   expect(preset,`${spec.id}.${kind}`).toBeDefined();
   const resolved=resolvePreset(spec.id,preset);
   expect(resolved.kind).toBe(kind);
   if(kind==='third-person'){
    expect(resolved.values.constraints.recovery).toEqual({halfLifeSeconds:.18,
     speedLimit:{kind:'limited',maximumSpeedMetersPerSecond:6},clearHoldSeconds:.12,releaseDeadbandMeters:.015});
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
