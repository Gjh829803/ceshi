import { Vector3 } from 'three';
import { createPowertrain,validatePowertrain,type PowertrainConfig,type PowertrainState } from '../../powertrain';


/** SI 单位的刚体数据工具；不包含大类选择、默认标定或运动规则。 */
export interface BodyPhysicsConfig {
  kind:'unicycle'|'sled'|'paddle'|'tracks'|'jet'|'submersible'|'motion';
  mass:number;centerOfMassHeight:number;
  friction?:number;restitution?:number;
  /** Effective driven wheel/track/propulsor radius, in metres. */
  driveRadius?:number;powertrain?:PowertrainConfig;
  /** Displaced volume m³, immersion depth m, bottom below root m, heave damping s⁻¹. */
  water?:{displacement:number;depth:number;bottom:number;damping:number};
}
export interface BodyPhysicsState {
  riderMounted:boolean;
  angularVelocity:Vector3;powertrain:PowertrainState|undefined;
  effort:number;cadence:number;mass:number;contactCount:number;elapsed:number;
}
export const createBodyPhysics=(c:BodyPhysicsConfig):BodyPhysicsState=>({riderMounted:false,angularVelocity:new Vector3(),powertrain:c.powertrain?createPowertrain(c.powertrain):undefined,effort:0,cadence:0,mass:c.mass,contactCount:0,elapsed:0});
export function validateBodyPhysics(c:BodyPhysicsConfig):void {
  const fail=()=>{throw new Error('VEHICLE_BODY_PHYSICS_CONFIG_INVALID');};
  if(!['unicycle','sled','paddle','tracks','jet','submersible','motion'].includes(c.kind)||!Number.isFinite(c.mass)||c.mass<20||!Number.isFinite(c.centerOfMassHeight)||Math.abs(c.centerOfMassHeight)>5)fail();
  if(c.friction!==undefined&&(!Number.isFinite(c.friction)||c.friction<0||c.friction>2))fail();
  if(c.restitution!==undefined&&(!Number.isFinite(c.restitution)||c.restitution<0||c.restitution>1))fail();
  if(c.powertrain){validatePowertrain(c.powertrain);if(!c.driveRadius||!Number.isFinite(c.driveRadius)||c.driveRadius<.05)fail();}
  if(c.water&&Object.values(c.water).some(n=>!Number.isFinite(n)||n<=0))fail();
}

