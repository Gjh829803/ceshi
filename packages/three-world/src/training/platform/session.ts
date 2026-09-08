/** Nominal follow arm; framing clamps and collision remain camera-owner policies. */
export const CAMERA_DISTANCE_METERS_SCHEMA=Object.freeze({type:'number',exclusiveMinimum:0,maximum:100});
export interface CameraTuning {
  recenterDelaySeconds:number;
  recenterResponsePerSecond:number;
  followResponsePerSecond:number;
  baseFovDegrees:number;
  targetHeightOffset:number;
  horizontalOffset:number;
  collisionEnabled:boolean;
  collisionRadiusMeters:number;
}
export const DEFAULT_CAMERA_TUNING: Readonly<CameraTuning> = Object.freeze({
  recenterDelaySeconds:1.5, recenterResponsePerSecond:1.9, followResponsePerSecond:8, baseFovDegrees:55,
  targetHeightOffset:0, horizontalOffset:0, collisionEnabled:true, collisionRadiusMeters:.25,
});
export const CAMERA_TUNING_RANGES:Readonly<Record<Exclude<keyof CameraTuning,'collisionEnabled'>,readonly[number,number]>>=Object.freeze({
  recenterDelaySeconds:[0,15], recenterResponsePerSecond:[0,10], followResponsePerSecond:[1,25], baseFovDegrees:[30,100],
  targetHeightOffset:[-2,5], horizontalOffset:[-3,3], collisionRadiusMeters:[.05,1],
});
export function parseCameraTuning(input:unknown,defaults:Readonly<CameraTuning>=DEFAULT_CAMERA_TUNING):CameraTuning {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('相机参数必须是对象');
  const values=input as Record<string,unknown>, result={} as CameraTuning;
  // Existing V1 profiles contain the original three fields. Only new fields
  // inherit defaults; malformed original fields must still fail validation.
  const originalFields=new Set(['recenterDelaySeconds','followResponsePerSecond','baseFovDegrees']);
  for(const name of Object.keys(CAMERA_TUNING_RANGES) as (Exclude<keyof CameraTuning,'collisionEnabled'>)[]){
    const value=values[name]===undefined&&!originalFields.has(name)?defaults[name]:values[name],range=CAMERA_TUNING_RANGES[name];
    if(typeof value!=='number'||!Number.isFinite(value)||value<range[0]||value>range[1])throw new Error(`${name} 必须在 ${range[0]}–${range[1]} 范围内`);
    result[name]=value;
  }
  const collisionEnabled=values.collisionEnabled===undefined?defaults.collisionEnabled:values.collisionEnabled;
  if(typeof collisionEnabled!=='boolean')throw new Error('collisionEnabled 必须是布尔值');
  result.collisionEnabled=collisionEnabled;
  return result;
}
