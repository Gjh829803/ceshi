import type {VehicleState,Input} from '../../simulation';
import {emptyInput} from '../../simulation';
import {SOARING} from '../../../config/aircraft';

/** 动作语义只解释 aircraft 小类的现有输入，不计算或修改物理状态。 */
const definitions = {
 pitchUp:['pitch',-1,'抬头','axis'], pitchDown:['pitch',1,'低头','axis'],
 turnLeft:['steer',-1,'左转','axis'], turnRight:['steer',1,'右转','axis'],
 increaseThrottle:['forward',1,'增加持续油门','axis'], decreaseThrottle:['forward',-1,'减少持续油门','axis'],
 increaseVerticalDemand:['lift',1,'增加垂直速度需求；中位悬停','axis'], decreaseVerticalDemand:['lift',-1,'减少垂直速度需求；零位关机','axis'],
 wheelBrake:['brake',true,'地面轮刹','hold'], towAssist:['boost',true,'有限牵引助力，释放停止牵引','hold'],
 airBrake:['lift',-1,'展开扰流板降低升力、增加阻力','axis'],
 runUp:['forward',1,'地面向前助跑；翼装沿用人物移动','hold'], deployCanopy:['brake',true,'开始开伞，后续自动展开','trigger'],
 canopyBrake:['brake',true,'伞下双侧刹车','hold'],
 heatEnvelope:['lift',1,'燃烧器加热，松开后热惯性仍存在','axis'], ventEnvelope:['lift',-1,'放热下降，响应有延迟','axis'],
} as const;
export type AircraftActionId=keyof typeof definitions;
export interface AircraftActionRequest {action:AircraftActionId;strength?:number}
const steering:AircraftActionId[]=['pitchUp','pitchDown','turnLeft','turnRight'];
export function inspectAircraftActions(v:VehicleState|null|undefined) {
 if(!v?.motion.aircraft)return [];
 const a=v.motion.aircraft,k=a.subtype;
 const ids:AircraftActionId[]=a.wearable?.groundLocomotion?['runUp']:k==='balloon'?['heatEnvelope','ventEnvelope']:[...steering,...(
 k==='wingsuit'?['runUp','deployCanopy','canopyBrake']:
 k==='paraglider'?['runUp','canopyBrake']:
 k==='glider'?['towAssist','airBrake','wheelBrake']:
 ['helicopter','multirotor','tiltrotor'].includes(k)?['increaseVerticalDemand','decreaseVerticalDemand','wheelBrake']:
 ['increaseThrottle','decreaseThrottle','wheelBrake']) as AircraftActionId[]];
 return ids.map(action=>{
  const [channel,value,description,kind]=definitions[action];
  let reason:string|null=null;
  if((action==='runUp'||action==='wheelBrake')&&!v.grounded)reason='需要接地';
  if(action==='runUp'&&a.wearable?.hadFlight)reason='已完成飞行，请重新准备装备';
  if(action==='deployCanopy'&&(v.grounded||a.canopy>0))reason='需要离地且尚未开伞';
  if(action==='canopyBrake'&&(v.grounded||(k==='wingsuit'&&a.canopy<1)))reason='需要离地且伞已完全展开';
  if(action==='towAssist'&&(a.towReleased||a.towSeconds>=SOARING.towSeconds||(v.launched&&v.position.y>=20)))reason='牵引已释放、额度耗尽或超出牵引阶段';
  if(action==='heatEnvelope'&&a.fuel<=0)reason='燃料耗尽';
  return {action,description,kind,channel,value,available:reason===null,reason};
 });
}
/** 每个固定步重新检查条件；调用者只将结果交给已有输入所有者。 */
export function aircraftActionInput(v:VehicleState,requests:readonly AircraftActionRequest[]):Input {
 const guide=inspectAircraftActions(v),input=emptyInput(),used=new Set<string>();
 for(const request of requests){
  const item=guide.find(x=>x.action===request.action);
  if(!item)throw new Error('AIRCRAFT_ACTION_UNSUPPORTED: '+request.action);
  if(!item.available)throw new Error('AIRCRAFT_ACTION_UNAVAILABLE: '+item.reason);
  const strength=request.strength??1;
  if(!Number.isFinite(strength)||strength<0||strength>1||(item.kind!=='axis'&&strength!==1))throw new Error('AIRCRAFT_ACTION_STRENGTH_INVALID');
  if(used.has(item.channel))throw new Error('AIRCRAFT_ACTION_CONFLICT: '+item.channel);
  used.add(item.channel);
  if(typeof item.value==='number') (input as unknown as Record<string,number>)[item.channel]=item.value*strength;
  else (input as unknown as Record<string,boolean>)[item.channel]=true;
 }
 if(input.boost&&input.slow)throw new Error('AIRCRAFT_ACTION_CONFLICT: boost/slow');
 return input;
}
