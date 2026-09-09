import {expect,it} from 'vitest';
import {Vector3,Quaternion,Euler} from 'three';
import {CAMERA_PARAMETERS,CAMERA_SCHEMA_PROPERTIES,DEFAULT_CAMERA_TUNING,parseCameraTuning} from './camera';
import {CAMERA_EFFECTS,DEFAULT_SHADOW_SETTINGS,resolveShadowSettings} from './presentation';
import {applyVehicleCameraRoll} from '../training/camera-roll';

it('resolves JSON shadow overrides into independent immutable settings',()=>{
 const input=JSON.parse('{"enabled":false,"coverageMeters":90,"mapSizePixels":4096,"type":"basic","radius":0,"intensity":0.4}');
 const settings=resolveShadowSettings(input),defaults=resolveShadowSettings();
 expect(settings).toMatchObject({enabled:false,coverageMeters:90,mapSizePixels:4096,type:'basic',radius:0,intensity:.4});
 expect(settings.bias).toBe(DEFAULT_SHADOW_SETTINGS.bias);
 input.coverageMeters=10;expect(settings.coverageMeters).toBe(90);
 expect(defaults).toEqual(DEFAULT_SHADOW_SETTINGS);expect(defaults).not.toBe(DEFAULT_SHADOW_SETTINGS);
 expect(Object.isFrozen(defaults)).toBe(true);expect(Object.isFrozen(DEFAULT_SHADOW_SETTINGS)).toBe(true);
});
it.each([null,[],{enabled:'false'},{type:'pcf-soft'},{mapSizePixels:1000},{mapSizePixels:0},{coverageMeters:0},
 {nearMeters:0},{nearMeters:400,farMeters:350},{bias:NaN},{normalBiasMeters:-1},{radius:-1},{intensity:1.1},{unknown:true}])('rejects unusable shadow settings %j',input=>{
 expect(()=>resolveShadowSettings(input)).toThrow(/SHADOW_SETTINGS_INVALID/);
});

it('derives the complete camera schema from parameter definitions and rejects incomplete values',()=>{
 expect(Object.keys(CAMERA_SCHEMA_PROPERTIES)).toEqual(Object.keys(CAMERA_PARAMETERS));
 expect(parseCameraTuning(DEFAULT_CAMERA_TUNING)).toEqual(DEFAULT_CAMERA_TUNING);
 expect(()=>parseCameraTuning({...DEFAULT_CAMERA_TUNING,baseFovDegrees:101})).toThrow();
 expect(()=>parseCameraTuning({baseFovDegrees:55})).toThrow();
 expect(CAMERA_SCHEMA_PROPERTIES).not.toHaveProperty('vehicleTurnLean');
 expect(Object.isFrozen(CAMERA_EFFECTS.vehicleTurnLean)).toBe(true);
});
it.each([0,.5,1])('changes only roll inheritance at strength %s, preserving the view direction',strength=>{
 const rotation=new Quaternion().setFromEuler(new Euler(.21,.4,.5,'YXZ'));
 const direction=new Vector3(0,0,1).applyEuler(new Euler(.1,.3,0,'YXZ')).applyQuaternion(rotation).normalize();
 const up=new Vector3(0,1,0).applyQuaternion(rotation),before=up.clone(),look=direction.clone();
 applyVehicleCameraRoll(up,direction,{enabled:true,strength});
 expect(direction).toEqual(look);
 if(strength===1)expect(up).toEqual(before);
 else{
  const neutral=new Vector3(0,1,0).addScaledVector(direction,-direction.y).normalize();
  const projected=before.clone().addScaledVector(direction,-before.dot(direction)).normalize();
  expect(up.angleTo(neutral)).toBeCloseTo(projected.angleTo(neutral)*strength,10);
 }
});
it('disables roll without changing vehicle attitude and remains finite at a vertical view',()=>{
 const direction=new Vector3(0,0,1),up=new Vector3(.5,Math.sqrt(.75),0);
 applyVehicleCameraRoll(up,direction,{enabled:false,strength:1});expect(up.toArray()).toEqual([0,1,0]);
 const vertical=new Vector3(0,1,0),poleUp=new Vector3(1,0,0);
 applyVehicleCameraRoll(poleUp,vertical,{enabled:false,strength:1});expect(poleUp.toArray()).toEqual([1,0,0]);
});

it('exposes controller-specific fields without turning inactive stored values into new gates',async()=>{
 const {controlSchemaForFamily,controlFields}=await import('./control-fields');
 const {defaultTrainingControl,parseTrainingControl,DEFAULT_CHARACTER_CONTROL_BASE,CONTROL_RANGES}=await import('./control');
 expect(controlSchemaForFamily('bike')).not.toHaveProperty('rollResponse');
 expect(controlSchemaForFamily('plane')).toHaveProperty('rollResponse');
 expect(controlFields('glider').find(field=>field.key==='accel')?.disabled).toBe(true);
 expect(parseTrainingControl({rollResponse:4},defaultTrainingControl('character',DEFAULT_CHARACTER_CONTROL_BASE)).rollResponse).toBe(4);
 expect(Object.isFrozen(CONTROL_RANGES.speed)).toBe(true);
});
