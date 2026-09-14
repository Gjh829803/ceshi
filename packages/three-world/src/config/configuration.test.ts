import {expect,it} from 'vitest';
import {DEFAULT_SHADOW_SETTINGS,resolveShadowSettings} from './presentation';
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

it('exposes controller-specific fields without turning inactive stored values into new gates',async()=>{
 const {controlSchemaForFamily,controlFields}=await import('./control-fields');
 const {defaultMovementSettings,parseMovementSettings,DEFAULT_CHARACTER_CONTROL_BASE,CONTROL_RANGES}=await import('./control');
 expect(controlSchemaForFamily('motorcycle')).not.toHaveProperty('rollResponse');
 expect(controlSchemaForFamily('plane')).toHaveProperty('rollResponse');
 expect(controlFields('glider').find(field=>field.key==='accel')?.disabled).toBe(true);
 expect(parseMovementSettings({rollResponse:4},defaultMovementSettings('character',DEFAULT_CHARACTER_CONTROL_BASE)).rollResponse).toBe(4);
 expect(Object.isFrozen(CONTROL_RANGES.speed)).toBe(true);
});
