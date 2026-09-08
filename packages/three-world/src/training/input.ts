import type { HumanoidInput, Input } from './simulation';

/** Keyboard, HUD and recording admission all read this semantic binding table. */
export const INPUT_BINDINGS = {
  forward:{codes:['KeyW'],label:'前进'}, backward:{codes:['KeyS'],label:'后退'},
  left:{codes:['KeyA'],label:'左移'}, right:{codes:['KeyD'],label:'右移'},
  sprint:{codes:['ShiftLeft','ShiftRight'],label:'冲刺 / 加速'},
  jump:{codes:['Space'],label:'跳跃 / 翻越 / 起身；攀爬时尝试翻上'},
  crouch:{codes:['KeyC','ControlLeft','ControlRight'],label:'蹲伏 / 站立；冲刺时滑铲；攀爬时松手'},
  prone:{codes:['KeyZ'],label:'匍匐 / 起身'}, roll:{codes:['KeyQ'],label:'翻滚'},
  interact:{codes:['KeyE'],label:'拾取 / 坐下 / 起身 / 进入攀爬'},
  putDown:{codes:['KeyG'],label:'放下物件'}, vehicle:{codes:['KeyF'],label:'上下载具 / 坐骑'},
  swimStyle:{codes:[],label:'切换泳姿（动作菜单，可自定义按键）'},
  slow:{codes:[],label:'慢走（可自定义按键）'},
  cameraLeft:{codes:['ArrowLeft'],label:'视角左转 / 飞行左移'},
  cameraRight:{codes:['ArrowRight'],label:'视角右转 / 飞行右移'},
  cameraUp:{codes:['ArrowUp'],label:'视角向上 / 飞行俯仰'},
  cameraDown:{codes:['ArrowDown'],label:'视角向下 / 飞行俯仰'},
} as const;
export type ControlAction=keyof typeof INPUT_BINDINGS;
export type KeyBindings=Readonly<Record<ControlAction,readonly string[]>>;
export const SUPPORTED_KEY_CODES:readonly string[]=Object.freeze([...Array.from({length:26},(_,i)=>`Key${String.fromCharCode(65+i)}`),...Array.from({length:10},(_,i)=>`Digit${i}`),'Space','ShiftLeft','ShiftRight','ControlLeft','ControlRight','AltLeft','AltRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
export const DEFAULT_KEY_BINDINGS:KeyBindings=Object.freeze(Object.fromEntries(Object.entries(INPUT_BINDINGS).map(([id,b])=>[id,Object.freeze([...b.codes])]))) as KeyBindings;
export function createKeyBindings(overrides:Partial<KeyBindings>={},base:KeyBindings=DEFAULT_KEY_BINDINGS):KeyBindings {
  if(!overrides||typeof overrides!=='object'||Array.isArray(overrides))throw new Error('KEY_BINDINGS_INVALID');
  const result={...base},seen=new Map<string,string>();
  for(const [action,codes] of Object.entries(overrides)){
    if(!Object.hasOwn(INPUT_BINDINGS,action)||!Array.isArray(codes)||codes.some(code=>typeof code!=='string'||!SUPPORTED_KEY_CODES.includes(code)))throw new Error('KEY_BINDINGS_INVALID');
    result[action as ControlAction]=[...codes];
  }
  for(const [action,codes] of Object.entries(result))for(const code of codes){if(seen.has(code))throw new Error(`KEY_BINDING_CONFLICT: ${code}`);seen.set(code,action);}
  return Object.freeze(Object.fromEntries(Object.entries(result).map(([action,codes])=>[action,Object.freeze([...codes])]))) as KeyBindings;
}
export const keyLabel=(code:string):string=>({ArrowLeft:'←',ArrowRight:'→',ArrowUp:'↑',ArrowDown:'↓',ControlLeft:'Ctrl',ControlRight:'Ctrl',ShiftLeft:'Shift',ShiftRight:'Shift',AltLeft:'Alt',AltRight:'Alt'} as Record<string,string>)[code]??code.replace(/^Key|^Digit/,'');
export const bindingLabel=(action:ControlAction,bindings:KeyBindings=DEFAULT_KEY_BINDINGS):string=>[...new Set(bindings[action].map(keyLabel))].join(' / ')||'动作菜单';
export function controlHints(bindings:KeyBindings=DEFAULT_KEY_BINDINGS):[string,string][]{return [
  [['forward','left','backward','right'].map(action=>bindingLabel(action as ControlAction,bindings)).join(''),'移动'],
  [bindingLabel('sprint',bindings),'冲刺 / 加速'],[bindingLabel('jump',bindings),INPUT_BINDINGS.jump.label],
  [bindingLabel('crouch',bindings),'蹲伏 / 站立；攀爬时松手'],
  [`${bindingLabel('sprint',bindings)} + ${bindingLabel('crouch',bindings)}`,'滑铲（需助跑）'],
  ...(['prone','roll','interact','putDown','vehicle'] as const).map(action=>[bindingLabel(action,bindings),INPUT_BINDINGS[action].label] as [string,string]),
];}
/** Humanoid input fields with their default UI labels. Chords resolve at the new key press. */
export const HUMANOID_BINDINGS = {
  toggleCrouch:{code:DEFAULT_KEY_BINDINGS.crouch[0]!,key:bindingLabel('crouch'),label:'蹲伏 / 站立'},
  slide:{code:DEFAULT_KEY_BINDINGS.crouch[0]!,key:`${bindingLabel('sprint')} + ${bindingLabel('crouch')}`,label:'滑铲（先助跑）'},
  roll:{code:DEFAULT_KEY_BINDINGS.roll[0]!,key:bindingLabel('roll'),label:'翻滚'},
  interact:{code:DEFAULT_KEY_BINDINGS.interact[0]!,key:bindingLabel('interact'),label:INPUT_BINDINGS.interact.label},
  putDown:{code:DEFAULT_KEY_BINDINGS.putDown[0]!,key:bindingLabel('putDown'),label:INPUT_BINDINGS.putDown.label},
  prone:{code:DEFAULT_KEY_BINDINGS.prone[0]!,key:bindingLabel('prone'),label:INPUT_BINDINGS.prone.label},
  climb:{code:DEFAULT_KEY_BINDINGS.interact[0]!,key:bindingLabel('interact'),label:'进入攀爬'},
  toggleSwimStyle:{code:'',key:'动作菜单',label:'切换泳姿'},
} as const;
export const HUMANOID_INPUT_FIELDS=Object.freeze(['toggleCrouch','roll','slide','interact','putDown','prone','climb','releaseClimb','toggleSwimStyle','cancel'] as const);
export type KeyAction={kind:'vehicle'}|{kind:'humanoid';input:HumanoidInput};
export function actionForKey(code:string,mounted:boolean,held:ReadonlySet<string>=new Set(),bindings:KeyBindings=DEFAULT_KEY_BINDINGS):KeyAction|undefined {
  const bound=(action:ControlAction)=>bindings[action].includes(code);
  if(bound('vehicle'))return {kind:'vehicle'};
  if(mounted)return;
  if(bound('crouch'))return {kind:'humanoid',input:bindings.sprint.some(code=>held.has(code))?{slide:true}:{toggleCrouch:true}};
  for(const [action,field] of [['roll','roll'],['interact','interact'],['putDown','putDown'],['prone','prone'],['swimStyle','toggleSwimStyle']] as const)if(bound(action))return {kind:'humanoid',input:{[field]:true}};
}
export function readControls(held:ReadonlySet<string>,mounted:boolean,jump:boolean,commands:HumanoidInput,bindings:KeyBindings=DEFAULT_KEY_BINDINGS):Input {
  const key=(action:ControlAction)=>Number(bindings[action].some(code=>held.has(code)));
  const i:Input={forward:key('forward')-key('backward'),steer:key('right')-key('left'),roll:0,lift:0,pitch:0,strafe:0,
    boost:!!key('sprint'),brake:false,slow:!!key('slow'),jump:false};
  if(mounted){i.slow=!!key('crouch');i.roll=key('interact')-key('roll');i.lift=key('jump')-key('crouch');i.pitch=key('cameraDown')-key('cameraUp');i.strafe=key('cameraRight')-key('cameraLeft');i.brake=!!key('jump');}
  else {i.jump=jump;i.humanoid={...commands};}
  return i;
}
export function cameraOrbitInput(held:ReadonlySet<string>,mode:string,dt:number):[number,number]{
  if(mode==='space')return [0,0];
  const key=(code:string)=>held.has(code)?1:0;
  return [(key('ArrowRight')-key('ArrowLeft'))*dt*260,(key('ArrowDown')-key('ArrowUp'))*dt*220];
}
export const HUMANOID_CONTROL_HINTS:[string,string][]=controlHints();
