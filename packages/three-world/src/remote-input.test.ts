import {it,expect} from 'vitest';
import {WorldKeyboard} from './input.js';
import {QueuedRemoteInput} from './remote-input.js';
it('queues short key edges, rejects duplicate relative movement, and releases ownership',()=>{
  let tick=0;const keyboard=new WorldKeyboard(()=>tick,()=>{});keyboard.enabled=true;
  const pointers:unknown[]=[];let releases=0;
  const lease=new QueuedRemoteInput(keyboard,v=>pointers.push(v),()=>releases++);
  const packet={sequence:1,heldKeys:['KeyW'],keyEdges:[{code:'Space',kind:'down' as const},{code:'Space',kind:'up' as const}],yawDeltaRadians:.1};
  expect(lease.submit(packet)).toBe(true);expect(tick).toBe(0);expect(keyboard.sample().jumpPressed).toBe(false);
  expect(lease.submit(packet)).toBe(false);lease.drain();tick++;
  const sample=keyboard.sample();expect(sample.jumpPressed).toBe(true);expect(sample.moveZRatio).toBe(-1);expect(pointers).toHaveLength(1);
  expect(keyboard.sample().jumpPressed).toBe(false);lease.dispose();expect(keyboard.held.size).toBe(0);expect(keyboard.remoteMode).toBe(false);expect(releases).toBe(1);
  expect(()=>lease.submit({...packet,sequence:2})).toThrow('RELEASED');
});
