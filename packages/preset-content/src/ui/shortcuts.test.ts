import {describe, expect, it} from 'vitest';
import {humanoid} from '@worldkit/three';
import {controlsFor, controlSummaryFor, systemControlsFor} from './shortcuts';

const fixedWing = {mode:'plane', aircraftSubtype:'pusher'} as const;
const labelFor = (rows:[string,string][], key:string) => rows.find(row=>row[0]===key)?.[1];

describe('current input semantics in Playground HUD',()=>{
  it.each(['fixed-wing','pusher'] as const)('%s presents W/S throttle, arrow pitch and the actual Shift assist',aircraftSubtype=>{
    const spec={mode:'plane' as const,aircraftSubtype},rows=controlsFor(spec);
    expect(labelFor(rows,'W / S')).toBe('增加油门 / 减少油门');
    expect(labelFor(rows,'↑ / ↓')).toContain('镜头有限跟随');
    expect(labelFor(rows,'Ctrl')).toBe('减油门 / 地面刹车');
    expect(labelFor(rows,'Shift')).toBe('辅助增加油门');
    expect(controlSummaryFor(spec)).toContain('W / S 增加油门 / 减少油门');
    expect(controlSummaryFor(spec)).not.toMatch(/W \/ S (俯仰|低头)|S 拉起|Shift/);
    expect(humanoid.readControls(new Set(['KeyW','ArrowUp']),true,false,{},undefined,spec)).toMatchObject({forward:1,pitch:-1});
  });

  it.each(['helicopter','multirotor','tiltrotor'] as const)('%s separates travel, vertical demand and horizontal braking',aircraftSubtype=>{
    const rows=controlsFor({mode:'plane',aircraftSubtype});
    expect(labelFor(rows,'W / S')).toBe('向前飞行 / 向后飞行');
    expect(labelFor(rows,'Space / C')).toContain('50% 悬停');
    expect(labelFor(rows,'Ctrl')).toBe('水平减速（不降低升力）');
    expect(labelFor(rows,'Q / E')).toContain('横滚');
    expect(rows.flat().join(' ')).not.toContain('油门');
  });

  it.each(['glider','paraglider','wingsuit'] as const)('%s shows airspeed trim instead of throttle',aircraftSubtype=>{
    const rows=controlsFor({mode:'plane',aircraftSubtype});
    expect(labelFor(rows,'W / S')).toBe('提高目标空速 / 降低目标空速');
    expect(labelFor(rows,'C')).toBe('扰流 / 下降辅助');
    expect(labelFor(rows,'↑ / ↓')).toContain('抬头');
    expect(rows.flat().join(' ')).not.toContain('油门');
    if(aircraftSubtype==='wingsuit')expect(labelFor(rows,'Space')).toContain('开伞');
  });

  it('keeps balloon inputs sparse and all camera arrows available',()=>{
    const spec={mode:'plane',aircraftSubtype:'balloon'} as const,rows=controlsFor(spec);
    expect(rows).toContainEqual(['Space','加热上升']);expect(rows).toContainEqual(['C','放热下降']);
    expect(rows.flat().join(' ')).not.toMatch(/Shift|Ctrl|油门|横滚|俯仰/);
    expect(systemControlsFor(spec)).toContainEqual(['↑ / ↓','镜头向上 / 镜头向下']);
  });

  it('uses Ctrl for submarine/space braking, C for descent and no keyboard strafe for space',()=>{
    const sub=controlsFor({mode:'submarine'}),space=controlsFor({mode:'spacecraft'});
    expect(sub).toContainEqual(['Space / C','上浮 / 下潜']);
    expect(labelFor(sub,'Ctrl')).toBe('减速制动');expect(labelFor(sub,'Shift')).toBe('加速');
    expect(space).toContainEqual(['Ctrl','反推制动']);
    expect(space.flat().join(' ')).not.toMatch(/Shift|侧移/);
  });

  it('does not advertise tank gun pitch or dragon flame as keyboard actions',()=>{
    const tank=controlsFor({mode:'tank'}),dragon=controlsFor({mode:'dragon',flyingCreature:{}} as Parameters<typeof controlsFor>[0]);
    expect(tank).toContainEqual(['Q / E','炮塔左转 / 炮塔右转']);
    expect(tank.flat().join(' ')).not.toMatch(/炮管|抬高|↑|↓/);
    expect(systemControlsFor({mode:'tank'})).toContainEqual(['↑ / ↓','镜头向上 / 镜头向下']);
    expect(dragon).toContainEqual(['Q','闪避']);
    expect(dragon.flat().join(' ')).not.toMatch(/喷火|滑翔|E/);
  });

  it('distinguishes mount jump from carriage braking and on-foot crouch',()=>{
    expect(controlsFor({mode:'mount'})).toContainEqual(['Space','跳跃']);
    expect(controlsFor({mode:'carriage'})).toContainEqual(['Space','勒停']);
    expect(controlsFor(undefined)).toContainEqual(['C / Ctrl','蹲伏 / 站立；攀爬时松手']);
    expect(controlsFor(undefined).some(([key])=>key==='G')).toBe(false);
  });

  it('reads remapped keys in vehicle, camera and context hints without fixed F/T aliases',()=>{
    const bindings=humanoid.createKeyBindings({forward:['KeyI'],backward:['KeyK'],interact:['KeyJ'],cameraToggle:['KeyT'],cameraUp:['KeyU'],cameraDown:['KeyO'],slow:['KeyL']});
    const rows=controlsFor(fixedWing,bindings),system=systemControlsFor(fixedWing,bindings);
    expect(rows).toContainEqual(['I / K','增加油门 / 减少油门']);
    expect(labelFor(rows,'U / O')).toContain('镜头有限跟随');
    expect(labelFor(rows,'J')).toContain('离开载具');
    expect(system).toContainEqual(['T','切换视角']);
    expect(controlSummaryFor(fixedWing,bindings)).toContain('L 减油门');
    expect(rows.concat(system).some(([key])=>['W / S','F','V','Ctrl'].includes(key))).toBe(false);
  });

  it('hides unavailable keys and preserves the remaining half of a remapped pair',()=>{
    const bindings=humanoid.createKeyBindings({forward:[],cameraToggle:[],reset:[],descend:[]});
    expect(controlsFor(fixedWing,bindings)).toContainEqual(['S','减少油门']);
    expect(systemControlsFor(fixedWing,bindings).flat().join(' ')).not.toMatch(/未绑定|动作菜单|Backspace|切换视角/);
    expect(controlsFor({mode:'submarine'},bindings)).toContainEqual(['Space','上浮']);
    expect(systemControlsFor(fixedWing,undefined,false).some(([,label])=>label==='切换视角')).toBe(false);
  });

  it('uses V once, and reserves mounted up/down for attitude plus bounded camera follow',()=>{
    const vehicle=controlsFor(fixedWing),system=systemControlsFor(fixedWing);
    expect(vehicle.concat(system).filter(([key])=>key==='V')).toEqual([['V','切换视角']]);
    expect(system).toContainEqual(['← / →','镜头左转 / 镜头右转']);
    expect(system.some(([key])=>key==='↑ / ↓')).toBe(false);
    expect(system).toContainEqual(['Backspace','长按 · 场景复位']);
    expect(systemControlsFor(undefined).some(([key])=>key==='Backspace')).toBe(false);
  });

  it('keeps wearable flight warnings aligned with arrow pitch and remapped canopy keys',()=>{
    const state:Parameters<typeof humanoid.wearableHint>[0]={phase:'glide',airborneSeconds:1,landingSeconds:0,hadFlight:true,heightMeters:100,sinkMetersPerSecond:0,spread:1,seated:0,lowSpeedAssist:false};
    expect(humanoid.wearableHint(state,0)).toContain('↑ / ↓ 俯仰');
    expect(humanoid.wearableHint(state,0)).not.toContain('W/S 俯仰');
    const bindings=humanoid.createKeyBindings({jump:['KeyJ'],cameraUp:['KeyU'],cameraDown:['KeyO']});
    expect(humanoid.wearableHint(state,0,bindings)).toContain('U / O 俯仰 · J 开伞');
    expect(humanoid.wearableHint({...state,heightMeters:10},0,bindings)).toBe('高度偏低 · 立即按 J 开伞');
  });
});
