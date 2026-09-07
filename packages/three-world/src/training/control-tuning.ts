import type {Mode} from './config';

/** Speeds: m/s; accelerations: m/s²; exponential response/damping: 1/s. */
export const CONTROL_RANGES={
 speed:[0,200],accel:[0,100],grip:[0,100],steer:[0,30],
 maxSpeed:[0,250],reverseSpeed:[0,100],slowSpeed:[0,100],groundSpeed:[0,100],
 coastDeceleration:[0,100],brakeDeceleration:[0,200],brakeDamping:[0,100],groundDeceleration:[0,100],directionChangeDeceleration:[0,200],
 steeringResponse:[0,100],steeringReturn:[0,100],
 verticalAcceleration:[0,100],linearDamping:[0,100],verticalDamping:[0,100],
 drag:[0,100],dragQuadratic:[0,1],pitchResponse:[0,50],rollResponse:[0,50],
 throttleResponse:[0,10],minimumSpeed:[0,100],launchSpeed:[0,100],jumpSpeed:[0,30],
} as const;
export interface TrainingControl {
 speed:number;accel:number;grip:number;steer:number;
 maxSpeed:number;reverseSpeed:number;slowSpeed:number;groundSpeed:number;
 coastDeceleration:number;brakeDeceleration:number;brakeDamping:number;groundDeceleration:number;directionChangeDeceleration:number;
 steeringResponse:number;steeringReturn:number;
 verticalAcceleration:number;linearDamping:number;verticalDamping:number;
 drag:number;dragQuadratic:number;pitchResponse:number;rollResponse:number;
 throttleResponse:number;minimumSpeed:number;launchSpeed:number;jumpSpeed:number;
}
export type ControlKey=keyof TrainingControl;
export type CoreControl=Pick<TrainingControl,'speed'|'accel'|'grip'|'steer'>;
export type ExtendedControl=Omit<TrainingControl,keyof CoreControl>;
export const CONTROL_SCHEMA_PROPERTIES=Object.fromEntries(Object.entries(CONTROL_RANGES).map(([key,[minimum,maximum]])=>[key,{type:'number',minimum,maximum}]));

/** Materialize family constants once per instance. Acceleration edits must not
 * silently rewrite independent coasting or braking settings. */
export function defaultTrainingControl(mode:Mode|'character',base:CoreControl):TrainingControl{
 const road=mode==='wheeled'||mode==='bike',creature=mode==='mount'||mode==='carriage',person=mode==='character';
 return {speed:base.speed,accel:base.accel,grip:base.grip,steer:base.steer,
  maxSpeed:person?5.8*base.speed/3.8:mode==='dragon'?base.speed*1.2:creature||['plane','glider','space','sub'].includes(mode)?base.speed:base.speed*1.15,
  reverseSpeed:mode==='dragon'?base.speed*.2:mode==='carriage'?1.4:mode==='mount'?2.5:base.speed*.3,
  slowSpeed:person?1.45*base.speed/3.8:2.5,groundSpeed:5,
  coastDeceleration:person?20*base.accel/12:mode==='dragon'?base.grip*2:creature?base.accel:road?5:mode==='hover'?3:1.8,
  brakeDeceleration:creature?20:base.accel*1.8,brakeDamping:mode==='space'?8:mode==='sub'?6:road?3.8:3.5,groundDeceleration:base.accel,directionChangeDeceleration:base.accel*2,
  steeringResponse:creature||mode==='dragon'?10:road?14:9,steeringReturn:creature||mode==='dragon'?10:road?22:14,
  verticalAcceleration:base.accel*.8,linearDamping:mode==='sub'?.9:base.grip,verticalDamping:1.8,
  drag:mode==='plane'?.8:mode==='glider'?.26:.25,dragQuadratic:mode==='glider'?.0008:.002,
  pitchResponse:mode==='glider'?2.6:mode==='sub'?2:3.2,rollResponse:3.5,throttleResponse:.38,
  minimumSpeed:mode==='glider'?7:0,launchSpeed:22,jumpSpeed:6.3,
 };
}
export function parseTrainingControl(value:unknown,defaults:TrainingControl):TrainingControl{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!Object.hasOwn(CONTROL_RANGES,k)))throw new Error('TRAINING_CONTROL_INVALID');
 const result={...defaults,...value};
 for(const key of Object.keys(CONTROL_RANGES) as ControlKey[]){const n=result[key],range=CONTROL_RANGES[key];if(typeof n!=='number'||!Number.isFinite(n)||n<range[0]||n>range[1])throw new Error(`TRAINING_CONTROL_INVALID: ${key}`);}
 return result;
}
export function readTrainingControl(value:TrainingControl):TrainingControl{
 const result={} as TrainingControl;
 for(const key of Object.keys(CONTROL_RANGES) as ControlKey[])result[key]=value[key];
 return result;
}
