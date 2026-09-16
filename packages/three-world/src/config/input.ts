/** Keyboard, HUD and recording admission all read this semantic binding table. */
const binding=(codes:readonly string[],label:string)=>Object.freeze({codes:Object.freeze([...codes]),label});
export const INPUT_BINDINGS = Object.freeze({
  forward:binding(['KeyW'],'前进'), backward:binding(['KeyS'],'后退'),
  left:binding(['KeyA'],'左移'), right:binding(['KeyD'],'右移'),
  sprint:binding(['ShiftLeft','ShiftRight'],'冲刺 / 加速'),
  jump:binding(['Space'],'跳跃 / 翻越 / 起身；攀爬时尝试翻上'),
  crouch:binding(['KeyC','ControlLeft','ControlRight'],'蹲伏 / 站立；冲刺时滑铲；攀爬时松手'),
  prone:binding(['KeyZ'],'匍匐 / 起身'), roll:binding(['KeyQ'],'翻滚'),
  interact:binding(['KeyF'],'场景交互 / 拾取 / 放下 / 上下载具 / 坐骑'),
  putDown:binding([],'放下物件（与 F 交互共用）'),
  summonDragon:binding(['KeyH'],'召唤飞龙'),
  swimStyle:binding([],'切换泳姿（动作菜单，可自定义按键）'),
  slow:binding(['ControlLeft','ControlRight'],'载具减速'),
  descend:binding(['KeyC'],'下降 / 扰流板'),
  rollLeft:binding(['KeyQ'],'横滚左 / 炮塔左 / 侧移左 / 飞龙闪避'),
  rollRight:binding(['KeyE'],'横滚右 / 炮塔右 / 侧移右'),
  reset:binding(['Backspace'],'长按 0.8 秒复位（挂载时）'),
  cameraToggle:binding(['KeyV'],'切换视角（需启用）'),
  cameraLeft:binding(['ArrowLeft'],'视角左转'),
  cameraRight:binding(['ArrowRight'],'视角右转'),
  cameraUp:binding(['ArrowUp'],'视角向上 / 抬头'),
  cameraDown:binding(['ArrowDown'],'视角向下 / 低头'),
});
export type ControlAction=keyof typeof INPUT_BINDINGS;
export type KeyBindings=Readonly<Record<ControlAction,readonly string[]>>;
export const SUPPORTED_KEY_CODES:readonly string[]=Object.freeze([...Array.from({length:26},(_,i)=>`Key${String.fromCharCode(65+i)}`),...Array.from({length:10},(_,i)=>`Digit${i}`),'Space','Backspace','ShiftLeft','ShiftRight','ControlLeft','ControlRight','AltLeft','AltRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
export const INPUT_RESET_HOLD_SECONDS=.8;
/** Mounted pitch uses the arrow keys for control, with a restrained camera follow. */
export const CAMERA_PITCH_FOLLOW_RATIO=.2;
export const CAMERA_PITCH_FOLLOW_MAX_OFFSET_RADIANS=10*Math.PI/180;
export const DEFAULT_KEY_BINDINGS:KeyBindings=Object.freeze(Object.fromEntries(Object.entries(INPUT_BINDINGS).map(([id,b])=>[id,Object.freeze([...b.codes])]))) as KeyBindings;
