import {bindingLabel,DEFAULT_KEY_BINDINGS,type ControlAction,type KeyBindings} from '../../input';

/** 翼装/滑翔伞专用训练状态；不参与其他飞机或公共积分器。 */
export interface WearableFlightState {
  phase:'ready'|'runup'|'leap'|'glide'|'deploying'|'canopy'|'landing'|'stowed';
  airborneSeconds:number; landingSeconds:number; hadFlight:boolean;
  heightMeters:number|null; sinkMetersPerSecond:number;
  spread:number; seated:number; lowSpeedAssist:boolean;
}
export const wearableFlight=(subtype:string)=>subtype==='wingsuit'||subtype==='paraglider';
export const unit=(x:number)=>Math.max(0,Math.min(1,x));
export const smooth=(x:number)=>{const t=unit(x);return t*t*(3-2*t);};
export function createWearableFlight():WearableFlightState {
  return {phase:'ready',airborneSeconds:0,landingSeconds:0,hadFlight:false,heightMeters:null,sinkMetersPerSecond:0,spread:0,seated:0,lowSpeedAssist:false};
}
export function wearableHint(s:WearableFlightState,canopy:number,bindings:KeyBindings=DEFAULT_KEY_BINDINGS):string {
  const key=(action:ControlAction)=>bindingLabel(action,bindings);
  if(s.phase==='stowed')return '已收伞 · 可步行或在资产库重新选择飞行装备';
  if(s.phase==='landing')return '着地缓冲、收伞中';
  if(s.phase==='ready'||s.phase==='runup')return `${key('sprint')} 助跑离台 · ${key('left')} / ${key('right')} 转向`;
  if(s.phase==='deploying')return '伞绳张紧、伞翼展开中 · 保持平稳';
  if(canopy>.8||s.phase==='canopy')return `${key('left')} / ${key('right')} 转弯 · 接近地面按住 ${key('jump')} 刹车缓降`;
  if(s.heightMeters!==null&&s.heightMeters<Math.max(35,s.sinkMetersPerSecond*5+15))return `高度偏低 · 立即按 ${key('jump')} 开伞`;
  return s.lowSpeedAssist?`低速辅助：轻压机头增速 · ${key('jump')} 开伞`:`${key('left')} / ${key('right')} 协调转弯 · ${key('cameraUp')} / ${key('cameraDown')} 俯仰 · ${key('jump')} 开伞`;
}

export function mountedPose(v:import('../../simulation').VehicleState){
 if(v.motion.aircraft?.wearable){
  if(v.spec.characterPose==='paraglider')return v.grounded?'wingsuit-ready' as const:'paraglider' as const;
  if(v.spec.characterPose==='wingsuit')return v.grounded?'wingsuit-ready' as const:v.motion.aircraft.canopy>.8?'paraglider' as const:'wingsuit' as const;
 }
 return v.spec.characterPose??'drive';
}

/** 可穿戴装备助跑时以脚底挂接；空中仍使用配置的飞行挂点。 */
export function mountedRiderOffset(v:import('../../simulation').VehicleState):readonly [number,number,number]{
 return mountedPose(v)==='wingsuit-ready'?[0,0,0]:v.spec.seat;
}
