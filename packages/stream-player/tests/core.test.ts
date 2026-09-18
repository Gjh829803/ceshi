import {it,expect} from 'vitest';
import {ReceiptTimings} from '../src/diagnostics.js';
import {PresentationCoordinator} from '../src/core.js';
import type {FrameHeader} from '@worldkit/stream-protocol';
const frame:FrameHeader={protocolVersion:1,sessionId:'a',epoch:1,mediaGeneration:1,outputFrameId:1,outputPtsUs:10,type:'key',source:{presentationId:'p',sdkEpoch:0,sourceFrameId:1,sourceTimeUs:10,simulationTick:1,worldRevision:0},uiRevision:1,uiCompleteThroughUs:10,widthPixels:100,heightPixels:100,payloadBytes:2};
it('never presents future, foreign or old-epoch UI',()=>{
  const player=new PresentationCoordinator('a',1);
  player.snapshot({revision:1,effectiveSourceTimeUs:11,completeThroughUs:11,state:{health:60},activeAnimations:[]});
  expect(player.select(frame)).toBeUndefined();
  player.snapshot({revision:1,effectiveSourceTimeUs:10,completeThroughUs:10,state:{health:80},activeAnimations:[]});
  expect(player.select(frame)?.state).toEqual({health:80});
  expect(player.select({...frame,sessionId:'b'})).toBeUndefined();
  player.reset(2);expect(player.select(frame)).toBeUndefined();
});

it('matches receipt samples once and excludes unmatched, expired and prior-session requests',()=>{
  let now=0;const timings=new ReceiptTimings(()=>now);
  timings.received('input:heartbeat');expect(timings.snapshot().sampleCount).toBe(0);
  timings.sent('input:12');now=25;timings.received('input:13');expect(timings.snapshot().latestMs).toBeNull();
  timings.received('input:12');timings.received('input:12');expect(timings.snapshot()).toEqual({latestMs:25,p95Ms:25,sampleCount:1});
  timings.sent('action:old');now=30_026;timings.received('action:old');expect(timings.snapshot().sampleCount).toBe(1);
  now=60_026;expect(timings.snapshot()).toEqual({latestMs:null,p95Ms:null,sampleCount:0});
  timings.sent('input:1');timings.reset();now++;timings.received('input:1');expect(timings.snapshot().sampleCount).toBe(0);
});
it('bounds pending receipt memory and computes P95 from at most 128 recent samples',()=>{
  let now=0;const timings=new ReceiptTimings(()=>now);
  for(let i=0;i<300;i++)timings.sent(`input:${i}`);
  now=1;timings.received('input:0');expect(timings.snapshot().sampleCount).toBe(0);
  for(let i=1;i<=200;i++){timings.sent(`action:${i}`);now+=i;timings.received(`action:${i}`);}
  expect(timings.snapshot()).toEqual({latestMs:200,p95Ms:194,sampleCount:128});
});
