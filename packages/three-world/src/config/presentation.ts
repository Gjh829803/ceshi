import type {ShadowSettings} from '../contracts';

export const DEFAULT_SHADOW_SETTINGS:Readonly<ShadowSettings> = Object.freeze({
  enabled:true,
  type:'pcf',
  mapSizePixels:2048,
  // 60 / 2048 = ~2.9 cm per texel in the light's view.
  coverageMeters:60,
  nearMeters:1,
  farMeters:350,
  // Keep the receiver offset below a texel at the default depth range for contact shadows.
  bias:-0.00002,
  normalBiasMeters:0.01,
  radius:1,
  intensity:1,
});

/** Partial project overrides; never mutate the defaults or the caller's JSON. */
export function resolveShadowSettings(input:unknown={}):Readonly<ShadowSettings>{
 const invalid=(field:string):never=>{throw new Error(`SHADOW_SETTINGS_INVALID: ${field}`);};
 if(!input||typeof input!=='object'||Array.isArray(input))invalid('expected an object');
 const value=input as Record<string,unknown>;
 for(const key of Object.keys(value))if(!Object.hasOwn(DEFAULT_SHADOW_SETTINGS,key))invalid(key);
 const settings={...DEFAULT_SHADOW_SETTINGS,...value} as ShadowSettings;
 if(typeof settings.enabled!=='boolean')invalid('enabled');
 if(!['basic','pcf','vsm'].includes(settings.type))invalid('type');
 for(const key of ['mapSizePixels','coverageMeters','nearMeters','farMeters','bias','normalBiasMeters','radius','intensity'] as const){
  if(typeof settings[key]!=='number'||!Number.isFinite(settings[key]))invalid(key);
 }
 if(settings.mapSizePixels<1||!Number.isSafeInteger(settings.mapSizePixels)||!Number.isInteger(Math.log2(settings.mapSizePixels)))invalid('mapSizePixels must be a positive power of two');
 if(settings.coverageMeters<=0)invalid('coverageMeters');
 if(settings.nearMeters<=0||settings.farMeters<=settings.nearMeters)invalid('nearMeters / farMeters');
 if(Math.abs(settings.bias)>1)invalid('bias');
 if(settings.normalBiasMeters<0)invalid('normalBiasMeters');
 if(settings.radius<0)invalid('radius');
 if(settings.intensity<0||settings.intensity>1)invalid('intensity');
 return Object.freeze(settings);
}
