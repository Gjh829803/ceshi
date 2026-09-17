/** Keyboard, HUD and recording admission all read this semantic binding table. */
const binding=(codes:readonly string[],label:string)=>Object.freeze({codes:Object.freeze([...codes]),label});
export const INPUT_BINDINGS = Object.freeze({
  forward:binding(['KeyW'],'前进'), backward:binding(['KeyS'],'后退'),
  left:binding(['KeyA'],'左移'), right:binding(['KeyD'],'右移'),
  sprint:binding(['ShiftLeft','ShiftRight'],'冲刺 / 加速'),
  jump:binding(['Space'],'跳跃 / 翻越 / 起身；攀爬时尝试翻上；游泳时按住上浮'),
  crouch:binding(['KeyC'],'蹲伏 / 站立；冲刺时滑铲；攀爬时松手；游泳时按住下潜'),
  prone:binding(['KeyZ'],'匍匐 / 起身'), roll:binding(['KeyQ'],'翻滚'),
  interact:binding(['KeyF'],'场景交互 / 拾取 / 放下 / 上下载具 / 坐骑'),
  putDown:binding([],'放下物件（与 F 交互共用）'),
  summonDragon:binding(['KeyH'],'召唤飞龙'),
  swimStyle:binding([],'切换泳姿（动作菜单，可自定义按键）'),
  slow:binding(['ControlLeft','ControlRight'],'人物按住慢走 / 载具减速'),
  ascend:binding(['KeyQ'],'起飞 / 上升 / 上浮'),
  descend:binding(['KeyE'],'下降 / 下潜'),
  airbrake:binding(['KeyC'],'滑翔扰流 / 下降辅助'),
  pitchDown:binding(['KeyC'],'低头'),
  pitchUp:binding(['Space'],'抬头'),
  fixedWingPitchDown:binding(['KeyQ'],'动力固定翼低头'),
  fixedWingPitchUp:binding(['KeyE'],'动力固定翼抬头'),
  rollLeft:binding(['KeyZ'],'横滚左 / 炮塔左 / 侧倾侧移左 / 飞龙闪避'),
  rollRight:binding(['KeyX'],'横滚右 / 炮塔右 / 侧倾侧移右'),
  reset:binding(['Backspace'],'长按 0.8 秒复位（挂载时）'),
  cameraToggle:binding(['KeyV'],'切换视角（需启用）'),
  cameraLeft:binding(['ArrowLeft'],'视角左转'),
  cameraRight:binding(['ArrowRight'],'视角右转'),
  cameraUp:binding(['ArrowUp'],'镜头向上'),
  cameraDown:binding(['ArrowDown'],'镜头向下'),
});
export type ControlAction=keyof typeof INPUT_BINDINGS;
export type KeyBindings=Readonly<Record<ControlAction,readonly string[]>>;
export const SUPPORTED_KEY_CODES:readonly string[]=Object.freeze([...Array.from({length:26},(_,i)=>`Key${String.fromCharCode(65+i)}`),...Array.from({length:10},(_,i)=>`Digit${i}`),'Space','Backspace','ShiftLeft','ShiftRight','ControlLeft','ControlRight','AltLeft','AltRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
export const INPUT_RESET_HOLD_SECONDS=.8;
/** Preserve the calibrated observation speed for flying and underwater vehicles. */
export const MOUNTED_CAMERA_PITCH_RATIO=.2;
export const DEFAULT_KEY_BINDINGS:KeyBindings=Object.freeze(Object.fromEntries(Object.entries(INPUT_BINDINGS).map(([id,b])=>[id,Object.freeze([...b.codes])]))) as KeyBindings;
