/** Camera parameters shared by the runtime, transport schemas and developer UI. */
const numeric = (defaultValue:number,minimum:number,maximum:number,unit:string,step:number,label:string,description?:string) =>
  Object.freeze({defaultValue,minimum,maximum,unit,step,label,...(description?{description}:{})});
export const CAMERA_PARAMETERS = Object.freeze({
  recenterDelaySeconds:numeric(1.5,0,15,'s',.1,'回正等待'),
  recenterResponsePerSecond:numeric(1.9,0,10,'1/s',.1,'回正响应'),
  followResponsePerSecond:numeric(8,1,25,'1/s',.1,'跟随响应'),
  baseFovDegrees:numeric(55,30,100,'degrees',1,'基础视野'),
  targetHeightOffset:numeric(0,-2,5,'m',.05,'垂直偏移','Vertical increment in meters on the existing target/eye anchor, not eye height or absolute height. Default 0. Shared by mode 0 and mode 2; mode 1 ignores it.'),
  horizontalOffset:numeric(0,-3,3,'m',.05,'水平偏移','Lateral increment in meters on the existing anchor, not an absolute position. Default 0. Shared by mode 0 and mode 2; mode 1 ignores it.'),
  collisionEnabled:Object.freeze({defaultValue:true,label:'启用碰撞检测'}),
  collisionRadiusMeters:numeric(.25,.05,1,'m',.01,'探测半径'),
} satisfies {[K in keyof CameraTuning]:CameraTuning[K] extends number?ReturnType<typeof numeric>:Readonly<{defaultValue:boolean;label:string}>});
export interface CameraTuning {
  recenterDelaySeconds:number;recenterResponsePerSecond:number;followResponsePerSecond:number;
  baseFovDegrees:number;
  /** Vertical increment in meters above the existing target/eye-based anchor, not eye height or absolute world height. Default 0. Shared by mode 0 and mode 2; mode 1 ignores it. */
  targetHeightOffset:number;
  /** Lateral increment in meters relative to the existing camera anchor, not an absolute position. Default 0. Shared by mode 0 and mode 2; mode 1 ignores it. */
  horizontalOffset:number;
  collisionEnabled:boolean;collisionRadiusMeters:number;
}
export type NumericCameraKey = Exclude<keyof CameraTuning,'collisionEnabled'>;
export const DEFAULT_CAMERA_TUNING:Readonly<CameraTuning> = Object.freeze(Object.fromEntries(
  Object.entries(CAMERA_PARAMETERS).map(([key,definition])=>[key,definition.defaultValue]),
) as unknown as CameraTuning);
/** Playground humanoid defaults, selected for all on-foot camera modes. */
export const HUMANOID_CAMERA_DEFAULTS:Readonly<CameraTuning> = Object.freeze({
  ...DEFAULT_CAMERA_TUNING,followResponsePerSecond:7,baseFovDegrees:58,collisionRadiusMeters:.2,
});
export const CAMERA_TUNING_RANGES = Object.freeze(Object.fromEntries(
  Object.entries(CAMERA_PARAMETERS).filter((entry):entry is [NumericCameraKey,typeof CAMERA_PARAMETERS[NumericCameraKey]]=>entry[0]!=='collisionEnabled')
    .map(([key,definition])=>[key,Object.freeze([definition.minimum,definition.maximum])]),
) as Record<NumericCameraKey,readonly[number,number]>);
export const CAMERA_SCHEMA_PROPERTIES = Object.freeze(Object.fromEntries(Object.entries(CAMERA_PARAMETERS).map(([key,definition])=>[
  key, Object.freeze('minimum' in definition
    ? {type:'number',minimum:definition.minimum,maximum:definition.maximum,...(definition.description
      ? {default:definition.defaultValue,description:definition.description}
      : {description:`${definition.label} (${definition.unit})`})}
    : {type:'boolean',description:definition.label}),
])));
/** Playground editor range, deliberately narrower than runtime capability. */
export const CAMERA_DISTANCE_EDITOR_RANGE=Object.freeze([1,40] as const);
export const CHARACTER_CAMERA_DISTANCE_METERS=8.8;
/** World-wide override; null is handled by TrainingProfile and restores per-subject defaults. */
export const CAMERA_DISTANCE_METERS_SCHEMA=Object.freeze({type:'number',exclusiveMinimum:0,maximum:100,description:'Nominal follow distance in meters, only for mode 0. Mode 1 ignores it; mode 2 has independent distance. Omit to keep the current setting; null restores the subject default.'});
/** A vehicle may deliberately use a zero nominal arm. This is not the world override. */
export const VEHICLE_CAMERA_DISTANCE_SCHEMA=Object.freeze({type:'number',minimum:0,description:'Vehicle nominal follow distance in meters, only for mode 0 when no world distance override is set. Mode 1 ignores distance; mode 2 has an independent shoulder distance.'});

/** Parse a complete resolved value. Callers explicitly merge partial overrides first. */
export function parseCameraTuning(input:unknown):CameraTuning {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('相机参数必须是对象');
  const values=input as Record<string,unknown>;
  if(Object.keys(values).some(key=>!Object.hasOwn(CAMERA_PARAMETERS,key)))throw new Error('未知相机参数');
  const result={} as CameraTuning;
  for(const name of Object.keys(CAMERA_TUNING_RANGES) as NumericCameraKey[]){
    const value=values[name],[minimum,maximum]=CAMERA_TUNING_RANGES[name];
    if(typeof value!=='number'||!Number.isFinite(value)||value<minimum||value>maximum)throw new Error(`${name} 必须在 ${minimum}–${maximum} 范围内`);
    result[name]=value;
  }
  if(typeof values.collisionEnabled!=='boolean')throw new Error('collisionEnabled 必须是布尔值');
  result.collisionEnabled=values.collisionEnabled;
  return result;
}

export interface TrainingViewSettings {
  readonly defaultPerspective:'first-person'|'third-person';
  readonly keyboardToggleEnabled:boolean;
}
export const DEFAULT_TRAINING_VIEW:TrainingViewSettings=Object.freeze({defaultPerspective:'third-person',keyboardToggleEnabled:false});
export const TRAINING_VIEW_SCHEMA_PROPERTIES=Object.freeze({
  defaultPerspective:Object.freeze({enum:Object.freeze(['first-person','third-person'])}),keyboardToggleEnabled:Object.freeze({type:'boolean'}),
});
