import {describe, expect, it} from 'vitest';
import {humanoid} from '@worldkit/three';
import {controlsFor, controlSummaryFor, systemControlsFor} from './shortcuts';

const fixedWing = {mode:'plane', aircraftSubtype:'pusher'} as const;
const labelFor = (rows:[string,string][], key:string) => rows.find(row=>row[0]===key)?.[1];

describe('current input semantics in Playground HUD',()=>{
  it.each(['fixed-wing','pusher'] as const)('%s presents W/S throttle, Q/E down/up pitch and Space brake',aircraftSubtype=>{
    const spec={mode:'plane' as const,aircraftSubtype},rows=controlsFor(spec);
    expect(labelFor(rows,'W / S')).toBe('增加油门 / 减少油门');
    expect(labelFor(rows,'Q / E')).toBe('低头 / 抬头');expect(labelFor(rows,'Space')).toBe('地面刹车');expect(labelFor(rows,'C')).toBeUndefined();
    expect(labelFor(rows,'Z / X')).toBeUndefined();expect(labelFor(rows,'↑ / ↓')).toBeUndefined();
    expect(labelFor(rows,'Ctrl')).toBe('减油门 / 地面刹车');
    expect(labelFor(rows,'Shift')).toBe('辅助增加油门');
    expect(controlSummaryFor(spec)).toContain('W / S 增加油门 / 减少油门');
    expect(controlSummaryFor(spec)).not.toMatch(/W \/ S (俯仰|低头)|S 拉起|Shift/);
    expect(humanoid.readControls(new Set(['KeyW','KeyE','Space','ArrowUp']),true,false,{},undefined,spec)).toMatchObject({forward:1,pitch:-1,brake:true});
  });

  it.each(['helicopter','multirotor','tiltrotor'] as const)('%s separates travel, vertical demand and horizontal braking',aircraftSubtype=>{
    const rows=controlsFor({mode:'plane',aircraftSubtype});
    expect(labelFor(rows,'W / S')).toBe('向前飞行 / 向后飞行');
    expect(labelFor(rows,'Q / E')).toContain('50% 悬停');
    expect(labelFor(rows,'Ctrl')).toBe('水平减速（不降低升力）');
    expect(labelFor(rows,'Z / X')).toBe('侧倾侧移左 / 侧倾侧移右');
    expect(rows.flat().join(' ')).not.toMatch(/Space|俯仰|抬头|低头/);
    expect(rows.flat().join(' ')).not.toContain('油门');
  });

  it.each(['glider','paraglider','wingsuit'] as const)('%s shows airspeed trim instead of throttle',aircraftSubtype=>{
    const rows=controlsFor({mode:'plane',aircraftSubtype});
    expect(labelFor(rows,'W / S')).toBe('提高目标空速 / 降低目标空速');
    expect(labelFor(rows,'C')).toBe('扰流 / 下降辅助');
    expect(labelFor(rows,'Shift')).toBeUndefined();
    expect(rows.flat().join(' ')).not.toMatch(/Q|E|Z|X|↑|↓|俯仰|横滚/);
    expect(rows.flat().join(' ')).not.toContain('油门');
    if(aircraftSubtype==='wingsuit')expect(labelFor(rows,'Space')).toContain('开伞');
  });

  it('keeps balloon inputs sparse and all camera arrows available',()=>{
    const spec={mode:'plane',aircraftSubtype:'balloon'} as const,rows=controlsFor(spec);
    expect(rows).toContainEqual(['Q','加热上升']);expect(rows).toContainEqual(['E','放热下降']);
    expect(rows.flat().join(' ')).not.toMatch(/Shift|Ctrl|油门|横滚|俯仰/);
    expect(systemControlsFor(spec)).toContainEqual(['↑ / ↓','镜头向上 / 镜头向下']);
  });

  it('uses Ctrl for submarine/space braking, Q/E for lift and no keyboard strafe for space',()=>{
    const sub=controlsFor({mode:'submarine'}),space=controlsFor({mode:'spacecraft'});
    expect(sub).toContainEqual(['Q / E','上浮 / 下潜']);
    expect(labelFor(sub,'Ctrl')).toBe('减速制动');expect(labelFor(sub,'Shift')).toBe('加速');
    expect(space).toContainEqual(['Ctrl','反推制动']);
    expect(sub).toContainEqual(['Space / C','抬头 / 低头']);expect(labelFor(sub,'Z / X')).toBeUndefined();
    expect(space).toContainEqual(['Space / C','抬头 / 低头']);expect(space).toContainEqual(['Z / X','向左横滚 / 向右横滚']);
    expect(space.flat().join(' ')).not.toMatch(/Shift|侧移/);
  });

  it('does not advertise tank gun pitch or dragon flame as keyboard actions',()=>{
    const tank=controlsFor({mode:'tank'}),dragon=controlsFor({mode:'dragon',flyingCreature:{}} as Parameters<typeof controlsFor>[0]);
    expect(tank).toContainEqual(['Z / X','炮塔左转 / 炮塔右转']);
    expect(controlsFor({mode:'hover'})).toContainEqual(['Z / X','向左侧移 / 向右侧移']);
    expect(tank.flat().join(' ')).not.toMatch(/炮管|抬高|↑|↓/);
    expect(systemControlsFor({mode:'tank'})).toContainEqual(['↑ / ↓','镜头向上 / 镜头向下']);
    expect(dragon).toContainEqual(['Z','闪避']);expect(dragon).toContainEqual(['Space / C','抬头 / 低头']);
    expect(dragon.flat().join(' ')).not.toMatch(/喷火|滑翔/);
  });

  it('distinguishes mount jump from carriage braking and on-foot crouch',()=>{
    expect(controlsFor({mode:'mount'})).toContainEqual(['Space','跳跃']);
    expect(controlsFor({mode:'carriage'})).toContainEqual(['Space','勒停']);
    expect(controlsFor(undefined)).toContainEqual(['C','蹲伏 / 站立；攀爬时松手']);
    expect(controlsFor(undefined)).toContainEqual(['Ctrl','按住 + 移动：慢走（不蹲伏）']);
    expect(controlsFor(undefined)).toContainEqual(['Shift + C','滑铲（需助跑）']);
    const rebound=humanoid.createKeyBindings({slow:['KeyB']});
    expect(controlsFor(undefined,rebound)).toContainEqual(['B','按住 + 移动：慢走（不蹲伏）']);
    expect(controlsFor(undefined,rebound).some(([key])=>key.includes('Ctrl'))).toBe(false);
    expect(controlsFor(undefined).some(([key])=>key==='G')).toBe(false);
  });

  it('reads remapped keys in vehicle, camera and context hints without fixed F/T aliases',()=>{
    const bindings=humanoid.createKeyBindings({forward:['KeyI'],backward:['KeyK'],interact:['KeyJ'],cameraToggle:['KeyT'],cameraUp:['KeyU'],cameraDown:['KeyO'],slow:['KeyL'],fixedWingPitchDown:['KeyB'],fixedWingPitchUp:['KeyN']});
    const rows=controlsFor(fixedWing,bindings),system=systemControlsFor(fixedWing,bindings);
    expect(rows).toContainEqual(['I / K','增加油门 / 减少油门']);
    expect(rows).toContainEqual(['B / N','低头 / 抬头']);expect(system).toContainEqual(['U / O','镜头向上 / 镜头向下']);
    expect(labelFor(rows,'J')).toContain('离开载具');
    expect(system).toContainEqual(['T','切换视角']);
    expect(controlSummaryFor(fixedWing,bindings)).toContain('L 减油门');
    expect(rows.concat(system).some(([key])=>['W / S','F','V','Ctrl'].includes(key))).toBe(false);
  });

  it('hides unavailable keys and preserves the remaining half of a remapped pair',()=>{
    const bindings=humanoid.createKeyBindings({forward:[],cameraToggle:[],reset:[],descend:[]});
    expect(controlsFor(fixedWing,bindings)).toContainEqual(['S','减少油门']);
    expect(systemControlsFor(fixedWing,bindings).flat().join(' ')).not.toMatch(/未绑定|动作菜单|Backspace|切换视角/);
    expect(controlsFor({mode:'submarine'},bindings)).toContainEqual(['Q','上浮']);
    expect(systemControlsFor(fixedWing,undefined,false).some(([,label])=>label==='切换视角')).toBe(false);
  });

  it('uses V once, and reserves mounted arrows exclusively for observation',()=>{
    const vehicle=controlsFor(fixedWing),system=systemControlsFor(fixedWing);
    expect(vehicle.concat(system).filter(([key])=>key==='V')).toEqual([['V','切换视角']]);
    expect(system).toContainEqual(['← / →','镜头左转 / 镜头右转']);
    expect(system).toContainEqual(['↑ / ↓','镜头向上 / 镜头向下']);
    expect(system).toContainEqual(['Backspace','长按 · 场景复位']);
    expect(systemControlsFor(undefined).some(([key])=>key==='Backspace')).toBe(false);
  });

  it('keeps wearable flight warnings aligned with speed trim and remapped canopy keys',()=>{
    const state:Parameters<typeof humanoid.wearableHint>[0]={phase:'glide',airborneSeconds:1,landingSeconds:0,hadFlight:true,heightMeters:100,sinkMetersPerSecond:0,spread:1,seated:0,lowSpeedAssist:false};
    expect(humanoid.wearableHint(state,0)).toContain('W / S 调整目标空速');
    expect(humanoid.wearableHint(state,0)).not.toContain('俯仰');
    const bindings=humanoid.createKeyBindings({jump:['KeyJ'],forward:['KeyU'],backward:['KeyO']});
    expect(humanoid.wearableHint(state,0,bindings)).toContain('U / O 调整目标空速 · J 开伞');
    expect(humanoid.wearableHint({...state,heightMeters:10},0,bindings)).toBe('高度偏低 · 立即按 J 开伞');
  });
  it('shows wingsuit walking and F unequip without an airborne canopy prompt',()=>{
    const rows=controlsFor({mode:'plane',aircraftSubtype:'wingsuit',groundLocomotion:true});
    expect(rows).toContainEqual(['W / S','前进 / 后退']);expect(rows).toContainEqual(['A / D','向左移动 / 向右移动']);
    expect(rows).toContainEqual(['Space','跳跃']);expect(rows).toContainEqual(['F','脱下翼装']);expect(rows).toContainEqual(['Ctrl','慢走']);
    expect(rows.flat().join(' ')).not.toMatch(/开伞|牵引|空速/);
  });
});
