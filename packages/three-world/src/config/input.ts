/** Keyboard, HUD and recording admission all read this semantic binding table. */
const binding=(codes:readonly string[],label:string)=>Object.freeze({codes:Object.freeze([...codes]),label});
export const INPUT_BINDINGS = Object.freeze({
  forward:binding(['KeyW'],'前进'), backward:binding(['KeyS'],'后退'),
  left:binding(['KeyA'],'左移'), right:binding(['KeyD'],'右移'),
  sprint:binding(['ShiftLeft','ShiftRight'],'冲刺 / 加速'),
  jump:binding(['Space'],'跳跃 / 翻越 / 起身；攀爬时尝试翻上'),
  crouch:binding(['KeyC','ControlLeft','ControlRight'],'蹲伏 / 站立；冲刺时滑铲；攀爬时松手'),
  prone:binding(['KeyZ'],'匍匐 / 起身'), roll:binding(['KeyQ'],'翻滚'),
  interact:binding(['KeyE'],'拾取 / 坐下 / 起身 / 进入攀爬'),
  putDown:binding(['KeyG'],'放下物件'), vehicle:binding(['KeyF'],'上下载具 / 坐骑'),
  summonDragon:binding(['KeyH'],'召唤飞龙'),
  swimStyle:binding([],'切换泳姿（动作菜单，可自定义按键）'),
  slow:binding([],'慢走（可自定义按键）'),
  cameraToggle:binding(['KeyT'],'切换视角（需启用）'),
  cameraLeft:binding(['ArrowLeft'],'视角左转 / 飞行左移'),
  cameraRight:binding(['ArrowRight'],'视角右转 / 飞行右移'),
  cameraUp:binding(['ArrowUp'],'视角向上 / 飞行俯仰'),
  cameraDown:binding(['ArrowDown'],'视角向下 / 飞行俯仰'),
});
export type ControlAction=keyof typeof INPUT_BINDINGS;
export type KeyBindings=Readonly<Record<ControlAction,readonly string[]>>;
export const SUPPORTED_KEY_CODES:readonly string[]=Object.freeze([...Array.from({length:26},(_,i)=>`Key${String.fromCharCode(65+i)}`),...Array.from({length:10},(_,i)=>`Digit${i}`),'Space','ShiftLeft','ShiftRight','ControlLeft','ControlRight','AltLeft','AltRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
export const DEFAULT_KEY_BINDINGS:KeyBindings=Object.freeze(Object.fromEntries(Object.entries(INPUT_BINDINGS).map(([id,b])=>[id,Object.freeze([...b.codes])]))) as KeyBindings;
