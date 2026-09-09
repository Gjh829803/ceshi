import type {Mode} from '../humanoid-runtime/config';

/** Speeds: m/s; accelerations: m/s²; exponential response/damping: 1/s. */
const range=(minimum:number,maximum:number)=>Object.freeze([minimum,maximum] as const);
export const CONTROL_RANGES=Object.freeze({
 speed:range(0,200),accel:range(0,100),grip:range(0,100),steer:range(0,30),
 maxSpeed:range(0,250),reverseSpeed:range(0,100),slowSpeed:range(0,100),groundSpeed:range(0,100),
 coastDeceleration:range(0,100),brakeDeceleration:range(0,200),brakeDamping:range(0,100),groundDeceleration:range(0,100),directionChangeDeceleration:range(0,200),
 steeringResponse:range(0,100),steeringReturn:range(0,100),
 verticalAcceleration:range(0,100),linearDamping:range(0,100),verticalDamping:range(0,100),
 drag:range(0,100),dragQuadratic:range(0,1),pitchResponse:range(0,50),rollResponse:range(0,50),
 throttleResponse:range(0,10),minimumSpeed:range(0,100),launchSpeed:range(0,100),jumpSpeed:range(0,30),
});
export interface MovementSettings {
 speed:number;accel:number;grip:number;steer:number;
 maxSpeed:number;reverseSpeed:number;slowSpeed:number;groundSpeed:number;
 coastDeceleration:number;brakeDeceleration:number;brakeDamping:number;groundDeceleration:number;directionChangeDeceleration:number;
 steeringResponse:number;steeringReturn:number;
 verticalAcceleration:number;linearDamping:number;verticalDamping:number;
 drag:number;dragQuadratic:number;pitchResponse:number;rollResponse:number;
 throttleResponse:number;minimumSpeed:number;launchSpeed:number;jumpSpeed:number;
}
export type ControlKey=keyof MovementSettings;
export type CoreControl=Pick<MovementSettings,'speed'|'accel'|'grip'|'steer'>;
/** Calibrated Playground authoring values; movement conversion remains in the controller. */
export const DEFAULT_CHARACTER_CONTROL_BASE:Readonly<CoreControl>=Object.freeze({speed:3.1,accel:14,grip:5,steer:8});
export type ExtendedControl=Omit<MovementSettings,keyof CoreControl>;
export const CONTROL_SCHEMA_PROPERTIES=Object.freeze(Object.fromEntries(Object.entries(CONTROL_RANGES).map(([key,[minimum,maximum]])=>[key,Object.freeze({type:'number',minimum,maximum})])));

/** Materialize family constants once per instance. Acceleration edits must not
 * silently rewrite independent coasting or braking settings. */
export function defaultMovementSettings(mode:Mode|'character',base:CoreControl):MovementSettings{
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
export function parseMovementSettings(value:unknown,defaults:MovementSettings):MovementSettings{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!Object.hasOwn(CONTROL_RANGES,k)))throw new Error('HUMANOID_CONTROL_INVALID');
 const result={...defaults,...value};
 for(const key of Object.keys(CONTROL_RANGES) as ControlKey[]){const n=result[key],range=CONTROL_RANGES[key];if(typeof n!=='number'||!Number.isFinite(n)||n<range[0]||n>range[1])throw new Error(`HUMANOID_CONTROL_INVALID: ${key}`);}
 return result;
}
export function readMovementSettings(value:MovementSettings):MovementSettings{
 const result={} as MovementSettings;
 for(const key of Object.keys(CONTROL_RANGES) as ControlKey[])result[key]=value[key];
 return result;
}
