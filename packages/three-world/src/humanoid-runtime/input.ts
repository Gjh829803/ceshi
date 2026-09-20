import type { HumanoidActionInput, Input } from './simulation';
import type { Mode } from './config';
import {AIRCRAFT_SUBTYPES,type AircraftSubtype} from '../config/aircraft';

import {INPUT_BINDINGS,DEFAULT_KEY_BINDINGS,SUPPORTED_KEY_CODES,MOUNTED_CAMERA_PITCH_RATIO,type ControlAction,type KeyBindings} from '../config/input';
export {INPUT_BINDINGS,DEFAULT_KEY_BINDINGS,SUPPORTED_KEY_CODES,MOUNTED_CAMERA_PITCH_RATIO,type ControlAction,type KeyBindings} from '../config/input';
export function createKeyBindings(overrides:Partial<KeyBindings>={},base:KeyBindings=DEFAULT_KEY_BINDINGS):KeyBindings {
  if(!overrides||typeof overrides!=='object'||Array.isArray(overrides))throw new Error('KEY_BINDINGS_INVALID');
  const result={...base};
  for(const [action,codes] of Object.entries(overrides)){
    if(!Object.hasOwn(INPUT_BINDINGS,action)||!Array.isArray(codes)||codes.some(code=>typeof code!=='string'||!SUPPORTED_KEY_CODES.includes(code)))throw new Error('KEY_BINDINGS_INVALID');
    result[action as ControlAction]=[...codes];
  }
  for(const context of bindingContexts){
    const seen=new Map<string,string>();
    for(const action of activeControlActions(context))for(const code of result[action]){
      if(seen.has(code))throw new Error(`KEY_BINDING_CONFLICT: ${code} (${seen.get(code)}, ${action})`);
      seen.set(code,action);
    }
  }
  return Object.freeze(Object.fromEntries(Object.entries(result).map(([action,codes])=>[action,Object.freeze([...codes])]))) as KeyBindings;
}
export const keyLabel=(code:string):string=>({ArrowLeft:'←',ArrowRight:'→',ArrowUp:'↑',ArrowDown:'↓',ControlLeft:'Ctrl',ControlRight:'Ctrl',ShiftLeft:'Shift',ShiftRight:'Shift',AltLeft:'Alt',AltRight:'Alt'} as Record<string,string>)[code]??code.replace(/^Key|^Digit/,'');
export const bindingLabel=(action:ControlAction,bindings:KeyBindings=DEFAULT_KEY_BINDINGS):string=>[...new Set(bindings[action].map(keyLabel))].join(' / ')||'动作菜单';
export function controlHints(bindings:KeyBindings=DEFAULT_KEY_BINDINGS):[string,string][]{
  const rows:[string,string][]=[];
  const add=(action:ControlAction,label=INPUT_BINDINGS[action].label)=>{
    if(bindings[action].length)rows.push([bindingLabel(action,bindings),label]);
  };
  const movement=['forward','left','backward','right'] as const;
  if(movement.every(action=>bindings[action].length===1))rows.push([movement.map(action=>bindingLabel(action,bindings)).join(''),'移动']);
  else movement.forEach(action=>add(action));
  add('sprint');add('jump');add('slow','按住 + 移动：慢走（不蹲伏）');add('crouch');
  if(bindings.sprint.length&&bindings.crouch.length)rows.push([`${bindingLabel('sprint',bindings)} + ${bindingLabel('crouch',bindings)}`,'滑铲（需助跑）']);
  (['prone','roll','interact','summonDragon'] as const).forEach(action=>add(action));
  add('putDown','放下物件');add('swimStyle','切换泳姿');
  return rows;
}
/** Humanoid input fields with their default UI labels. Chords resolve at the new key press. */
export const HUMANOID_BINDINGS = {
  toggleCrouch:{code:DEFAULT_KEY_BINDINGS.crouch[0]!,key:bindingLabel('crouch'),label:'蹲伏 / 站立'},
  slide:{code:DEFAULT_KEY_BINDINGS.crouch[0]!,key:`${bindingLabel('sprint')} + ${bindingLabel('crouch')}`,label:'滑铲（先助跑）'},
  roll:{code:DEFAULT_KEY_BINDINGS.roll[0]!,key:bindingLabel('roll'),label:'翻滚'},
  interact:{code:DEFAULT_KEY_BINDINGS.interact[0]!,key:bindingLabel('interact'),label:INPUT_BINDINGS.interact.label},
  putDown:{code:'',key:bindingLabel('interact'),label:INPUT_BINDINGS.putDown.label},
  prone:{code:DEFAULT_KEY_BINDINGS.prone[0]!,key:bindingLabel('prone'),label:INPUT_BINDINGS.prone.label},
  climb:{code:DEFAULT_KEY_BINDINGS.interact[0]!,key:bindingLabel('interact'),label:'进入攀爬'},
  toggleSwimStyle:{code:'',key:'动作菜单',label:'切换泳姿'},
} as const;
export const HUMANOID_ACTION_INPUT_FIELDS=Object.freeze(['toggleCrouch','roll','slide','interact','putDown','prone','climb','releaseClimb','toggleSwimStyle','cancel','summonDragon'] as const);
export type KeyAction={kind:'interact'}|{kind:'camera-toggle'}|{kind:'humanoid';input:HumanoidActionInput};
export function actionForKey(code:string,mounted:boolean,held:ReadonlySet<string>=new Set(),bindings:KeyBindings=DEFAULT_KEY_BINDINGS):KeyAction|undefined {
  const bound=(action:ControlAction)=>bindings[action].includes(code);
  if(bound('interact'))return {kind:'interact'};
  if(bound('cameraToggle'))return {kind:'camera-toggle'};
  if(mounted)return;
  if(bound('summonDragon'))return {kind:'humanoid',input:{summonDragon:true}};
  if(bound('crouch'))return {kind:'humanoid',input:bindings.sprint.some(code=>held.has(code))?{slide:true}:{toggleCrouch:true}};
  for(const [action,field] of [['roll','roll'],['putDown','putDown'],['prone','prone'],['swimStyle','toggleSwimStyle']] as const)if(bound(action))return {kind:'humanoid',input:{[field]:true}};
}
export interface MountedInputContext {mode:Mode;aircraftSubtype?:AircraftSubtype|undefined;instanceId?:string;groundLocomotion?:boolean;canopyDeployed?:boolean}
const bindingContexts:(MountedInputContext|undefined)[]=[undefined,
  ...(['wheeled','bus','tank','motorcycle','unicycle','skateboard','sled','ski','hover','paddled_boat','boat','submarine','glider','spacecraft','mount','carriage','dragon'] as const).map(mode=>({mode})),
  ...AIRCRAFT_SUBTYPES.map(aircraftSubtype=>({mode:'plane' as const,aircraftSubtype})),{mode:'plane',aircraftSubtype:'wingsuit',groundLocomotion:true}];
export function isFixedWing(context:MountedInputContext):boolean{return context.mode==='plane'&&['fixed-wing','pusher'].includes(context.aircraftSubtype??'fixed-wing');}
export function isSoaring(context:MountedInputContext):boolean{return context.mode==='glider'||['glider','paraglider','wingsuit'].includes(context.aircraftSubtype??'');}
/** Separate binding slots preserve independent rebinding of single-axis and dual-axis aircraft. */
export function pitchControlActions(context:MountedInputContext):readonly [ControlAction,ControlAction]{
  return isFixedWing(context)?['fixedWingPitchDown','fixedWingPitchUp']:['pitchDown','pitchUp'];
}
/** Only the current controller may consume a key; cross-context reuse is intentional. */
export function activeControlActions(context?:MountedInputContext):ControlAction[]{
  const common:ControlAction[]=['interact','cameraToggle','cameraLeft','cameraRight','cameraUp','cameraDown','reset'];
  if(!context)return [...common,'forward','backward','left','right','sprint','slow','jump','crouch','prone','roll','putDown','summonDragon','swimStyle'];
  if(context.aircraftSubtype==='balloon')return [...common,'ascend','descend'];
  const actions:ControlAction[]=[...common,'forward','backward','left','right','slow'];
  if(context.aircraftSubtype==='wingsuit'&&context.groundLocomotion)return [...actions,'sprint','jump'];
  if(hasVerticalControls(context))actions.push('ascend','descend');
  else actions.push('jump');
  if(context.mode!=='spacecraft'&&!isSoaring(context))actions.push('sprint');
  if(vehicleKeyboardAxes(context).pitch)actions.push(...pitchControlActions(context));
  if(['tank','hover','spacecraft'].includes(context.mode)||context.mode==='plane'&&['helicopter','multirotor','tiltrotor'].includes(context.aircraftSubtype??''))actions.push('rollLeft','rollRight');
  if(context.mode==='dragon')actions.push('rollLeft');
  if(context.mode==='glider'||['glider','paraglider','wingsuit'].includes(context.aircraftSubtype??''))actions.push('airbrake');
  return actions;
}
function hasVerticalControls(context:MountedInputContext):boolean{
  return ['dragon','submarine','spacecraft'].includes(context.mode)||context.mode==='plane'&&['helicopter','multirotor','tiltrotor','balloon'].includes(context.aircraftSubtype??'');
}
export function vehicleKeyboardAxes(context:MountedInputContext|undefined):{pitch:boolean}{
  return {pitch:!!context&&(['dragon','submarine','spacecraft'].includes(context.mode)||context.mode==='plane'&&['fixed-wing','pusher'].includes(context.aircraftSubtype??'fixed-wing'))};
}
/** Camera speed is independent of whether the vehicle exposes a manual pitch key. */
export function cameraKeyboardPitchRatio(context:MountedInputContext|undefined):number{
  return context&&context.aircraftSubtype!=='balloon'&&['dragon','submarine','plane','glider','spacecraft'].includes(context.mode)?MOUNTED_CAMERA_PITCH_RATIO:1;
}
export function readControls(held:ReadonlySet<string>,mounted:boolean,jump:boolean,commands:HumanoidActionInput,bindings:KeyBindings=DEFAULT_KEY_BINDINGS,context?:MountedInputContext):Input {
  const active=new Set(activeControlActions(context));
  const key=(action:ControlAction)=>Number(active.has(action)&&bindings[action].some(code=>held.has(code)));
  const i:Input={forward:key('forward')-key('backward'),steer:key('right')-key('left'),roll:0,lift:0,pitch:0,strafe:0,
    boost:!!key('sprint'),brake:false,slow:!!key('slow'),jump:false};
  if(mounted&&context){
    const mode=context.mode,subtype=context.aircraftSubtype;
    if(subtype==='wingsuit'&&context.groundLocomotion){i.jump=jump;return i;}
    const vertical=hasVerticalControls(context);
    const soaring=mode==='glider'||['glider','paraglider','wingsuit'].includes(subtype??'');
    i.roll=key('rollRight')-key('rollLeft');
    if(mode==='dragon'){i.roll=0;i.secondary=!!key('rollLeft');i.jump=jump;}
    if(mode==='mount')i.jump=jump;
    if(vertical)i.lift=key('ascend')-key('descend');
    else if(soaring)i.lift=-key('airbrake');
    i.brake=!vertical&&mode!=='mount'&&(subtype==='wingsuit'&&!context.canopyDeployed?jump:!!key('jump'));
    const [pitchDown,pitchUp]=pitchControlActions(context);
    i.pitch=key(pitchDown)-key(pitchUp);
  }
  else {i.jump=jump;i.lift=key('jump')-key('crouch');i.actions={...commands};}
  return i;
}
export const HUMANOID_CONTROL_HINTS:[string,string][]=controlHints();
