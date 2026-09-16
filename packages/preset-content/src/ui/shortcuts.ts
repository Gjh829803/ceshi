import {humanoid} from '@worldkit/three';

type ControlSubject = Pick<humanoid.VehicleSpec, 'mode' | 'aircraftSubtype' | 'flyingCreature'> & Partial<Pick<humanoid.VehicleSpec, 'archetype'>> & {groundLocomotion?:boolean};
type Shortcut = [string, string];

/** Presentation only: key admission and bindings remain owned by the SDK. */
function shortcutRows(subject: ControlSubject | undefined, bindings: humanoid.KeyBindings) {
  const active = new Set(humanoid.activeControlActions(subject));
  const rows: Shortcut[] = [];
  const available = (action: humanoid.ControlAction) => active.has(action) && bindings[action].length > 0;
  const key = (action: humanoid.ControlAction) => humanoid.bindingLabel(action, bindings);
  const add = (action: humanoid.ControlAction, label: string) => {
    if (available(action)) rows.push([key(action), label]);
  };
  const pair = (a: humanoid.ControlAction, b: humanoid.ControlAction, first: string, second: string) => {
    if (available(a) && available(b)) rows.push([`${key(a)} / ${key(b)}`, `${first} / ${second}`]);
    else { add(a, first); add(b, second); }
  };
  return {rows, add, pair};
}

export function controlsFor(subject: ControlSubject | undefined, bindings = humanoid.DEFAULT_KEY_BINDINGS): Shortcut[] {
  if (!subject) return humanoid.controlHints(bindings);
  const {rows, add, pair} = shortcutRows(subject, bindings);
  const turn = () => pair('left', 'right', '左转', '右转');
  const pitch = () => pair('pitchUp', 'pitchDown', '抬头', '低头');
  const roll = () => pair('rollLeft', 'rollRight', '向左横滚', '向右横滚');
  const forward = () => pair('forward', 'backward', '前进', '制动后后退');
  const boost = () => add('sprint', '加速');
  const slow = (label = '减速制动') => add('slow', label);
  const brake = (label = '刹车') => add('jump', label);
  const subtype = subject.aircraftSubtype;

  if(subtype==='wingsuit'&&subject.groundLocomotion){
    pair('forward','backward','前进','后退');pair('left','right','向左移动','向右移动');
    add('sprint','跑步（可选）');slow('慢走');add('jump','跳跃');add('interact','脱下翼装');return rows;
  }

  if (subject.mode === 'plane') {
    if (subtype === 'balloon') {
      add('ascend', '加热上升'); add('descend', '放热下降');
      rows.push(['松键', '自然冷却，水平随风漂移']);
    } else if (subtype === 'helicopter' || subtype === 'multirotor' || subtype === 'tiltrotor') {
      pair('forward', 'backward', '向前飞行', '向后飞行');
      pair('ascend', 'descend', '增加垂直需求', '降低垂直需求（50% 悬停）');
      turn(); slow('水平减速（不降低升力）');
      pair('rollLeft', 'rollRight', '侧倾侧移左', '侧倾侧移右'); add('sprint', '提高前飞目标速度');
    } else if (subtype === 'glider' || subtype === 'paraglider' || subtype === 'wingsuit') {
      pair('forward', 'backward', '提高目标空速', '降低目标空速'); turn();
      if(subtype!=='wingsuit')add('forward',subtype==='glider'?'起飞阶段：有限牵引':'地面助跑');
      slow('空中减速'); add('airbrake', '扰流 / 下降辅助');
      brake(subtype === 'wingsuit' ? '开伞 / 伞下降落制动' : subtype === 'paraglider' ? '伞下降落制动' : '地面刹车');
    } else {
      pair('forward', 'backward', '增加油门', '减少油门'); pair('fixedWingPitchDown','fixedWingPitchUp','低头','抬头'); turn();
      slow('减油门 / 地面刹车'); brake('地面刹车');
      add('sprint', '辅助增加油门');
    }
  } else switch (subject.mode) {
    case 'dragon':
      pair('forward', 'backward', '前进', '减速'); pitch(); turn();
      pair('ascend', 'descend', '起飞 / 上升', '下降');
      slow('减速悬停'); boost(); if (subject.flyingCreature) add('rollLeft', '闪避');
      rows.push(['松开前进', '减速悬停']); break;
    case 'glider':
      pair('forward', 'backward', '提高目标空速', '降低目标空速'); turn();
      add('forward', '起飞阶段：有限牵引'); slow('空中减速'); add('airbrake', '扰流 / 下降辅助');
      brake('着陆制动'); break;
    case 'submarine':
      pair('forward', 'backward', '前进', '倒航'); turn();
      pair('ascend', 'descend', '上浮', '下潜'); pitch();
      slow('减速制动'); boost(); break;
    case 'spacecraft':
      pair('forward', 'backward', '向前推进', '向后推进'); turn();
      pair('ascend', 'descend', '局部上升', '局部下降'); pitch(); roll(); slow('反推制动'); break;
    case 'mount':
      pair('forward', 'backward', '前进', '后退'); turn();
      add('sprint', '疾驰'); slow('慢走'); add('jump', '跳跃'); break;
    case 'carriage':
      pair('forward', 'backward', '前进', '后退'); turn();
      add('sprint', '疾驰'); slow('慢行'); brake('勒停'); break;
    case 'tank':
      forward(); pair('left', 'right', '履带左转', '履带右转（支持原地）');
      slow(); brake(); boost(); pair('rollLeft', 'rollRight', '炮塔左转', '炮塔右转'); break;
    case 'hover':
      forward(); turn(); pair('rollLeft', 'rollRight', '向左侧移', '向右侧移');
      slow(); brake('制动'); boost(); break;
    case 'paddled_boat':
      pair('forward', 'backward', '划桨前进', '倒划'); pair('left', 'right', '左侧转向', '右侧转向');
      slow('停止划桨并制动'); brake(subject.archetype === 'raft' ? '压桨 / 拖地制动' : '压桨制动');
      if (subject.archetype === 'raft') add('sprint', '快划'); break;
    case 'boat':
      pair('forward', 'backward', '向前推进', '制动后倒船'); turn();
      slow(); brake('水阻制动'); boost(); break;
    case 'ski':
      add('forward', '低速撑杖起步'); add('backward', '刹停');
      pair('left', 'right', '左侧压刃', '右侧压刃'); slow(); brake('压刃制动');
      rows.push(['松键', '依靠重力顺坡滑行']); break;
    case 'sled':
      pair('forward', 'backward', '低速蹬地前进', '制动后低速后退'); turn(); slow(); brake('双脚拖地制动');
      rows.push(['松键', '依靠重力顺坡滑行']); break;
    case 'unicycle':
      pair('forward', 'backward', '踩踏前进', '制动后倒骑'); turn(); slow(); brake(); add('sprint', '加快踩踏');
      rows.push(['松键', '减速停稳，左脚撑地']); break;
    default:
      forward(); turn(); slow(); brake(subject.mode === 'wheeled' ? '手刹' : '刹车');
      if (subject.mode !== 'bus') boost();
  }
  add('interact', subtype==='wingsuit'?'脱下翼装（需安全落地）':subject.mode === 'dragon' ? '着陆 / 上下龙' : '离开载具（需满足离座条件）');
  return rows;
}

/** System strip is separate from vehicle controls, avoiding duplicate camera hotkeys. */
export function systemControlsFor(subject: ControlSubject | undefined, bindings = humanoid.DEFAULT_KEY_BINDINGS, canCycleView = true): Shortcut[] {
  const {rows, add, pair} = shortcutRows(subject, bindings);
  pair('cameraLeft', 'cameraRight', '镜头左转', '镜头右转');
  pair('cameraUp', 'cameraDown', '镜头向上', '镜头向下');
  if (canCycleView) add('cameraToggle', '切换视角');
  if (subject) add('reset', '长按 · 场景复位');
  rows.push(['拖动', '自由观察'], ['滚轮', '镜头距离'], ['Esc', '释放 / 暂停'], ['1–6', '快速前往（调试）']);
  return rows;
}

/** Context prompts reuse the visible control rows instead of stale asset key strings. */
export function controlSummaryFor(subject: ControlSubject, bindings = humanoid.DEFAULT_KEY_BINDINGS): string {
  return controlsFor(subject, bindings).slice(0, 4).map(([key, label]) => `${key} ${label}`).join(' · ');
}
