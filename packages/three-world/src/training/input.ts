import type { HumanoidInput, Input } from './simulation';

/** Host bindings only. Original character action parameters remain in humanoid/. */
export const HUMANOID_BINDINGS = {
  toggleCrouch:{code:'KeyC',key:'C',label:'蹲伏 / 站立'},
  slide:{code:'KeyQ',key:'Q',label:'滑铲（先助跑）'},
  roll:{code:'KeyV',key:'V',label:'翻滚'},
  interact:{code:'KeyE',key:'E',label:'拾取 / 坐下 / 起身'},
  putDown:{code:'KeyG',key:'G',label:'放下物件'},
  prone:{code:'KeyZ',key:'Z',label:'匍匐 / 起身'},
  climb:{code:'KeyB',key:'B',label:'进入 / 退出攀爬'},
  toggleSwimStyle:{code:'KeyN',key:'N',label:'切换泳姿'},
} as const;
export type KeyAction={kind:'vehicle'}|{kind:'humanoid';input:HumanoidInput};
export function actionForKey(code:string,mounted:boolean):KeyAction|undefined {
  if(code==='KeyF')return {kind:'vehicle'};
  if(mounted)return;
  const binding=Object.entries(HUMANOID_BINDINGS).find(([,value])=>value.code===code);
  if(binding)return {kind:'humanoid',input:{[binding[0]]:true}};
}
export function readControls(held:ReadonlySet<string>,mounted:boolean,jump:boolean,commands:HumanoidInput):Input {
  const key=(code:string)=>held.has(code)?1:0,ctrl=!!(key('ControlLeft')||key('ControlRight'));
  const i:Input={forward:key('KeyW')-key('KeyS'),steer:key('KeyD')-key('KeyA'),roll:0,lift:0,pitch:0,strafe:0,
    boost:!!(key('ShiftLeft')||key('ShiftRight')),brake:false,slow:ctrl,jump:false};
  if(mounted){i.roll=key('KeyE')-key('KeyQ');i.lift=key('Space')-Number(ctrl);i.pitch=key('ArrowDown')-key('ArrowUp');i.strafe=key('ArrowRight')-key('ArrowLeft');i.brake=!!key('Space');}
  else {i.slow=!!key('KeyX')||ctrl;i.jump=jump;i.humanoid={...commands};}
  return i;
}
/** Keep the existing arrow orbit, except spacecraft uses those axes to fly. */
export function cameraOrbitInput(held:ReadonlySet<string>,mode:string,dt:number):[number,number]{
  if(mode==='space')return [0,0];
  const key=(code:string)=>held.has(code)?1:0;
  return [(key('ArrowRight')-key('ArrowLeft'))*dt*260,(key('ArrowDown')-key('ArrowUp'))*dt*220];
}
export const HUMANOID_CONTROL_HINTS:[string,string][]=[
  ['WASD','移动'],['Shift / X','冲刺 / 慢走'],['Space','普通跳跃'],['WASD + Space','朝障碍翻越 / 攀上'],
  ['C / Z','蹲伏 / 匍匐'],['Q / V','滑铲 / 翻滚'],['E / G','交互 / 放下'],['B / N','攀爬 / 泳姿'],['F','上下载具'],
];
