import {it,expect} from 'vitest';
import {encodeFrame,decodeFrame,parseClientMessage,parseVideoSettings,validateUiClock,validateSourceDiagnostics,type FrameHeader} from '../src/index.js';
const header:FrameHeader={protocolVersion:1,sessionId:'session',epoch:2,mediaGeneration:1,outputFrameId:1,outputPtsUs:45000,type:'key',source:{presentationId:'p',sdkEpoch:0,sourceFrameId:10,sourceTimeUs:43000,simulationTick:3,worldRevision:1},uiRevision:2,uiCompleteThroughUs:43000,widthPixels:1280,heightPixels:720,payloadBytes:3};
it('round trips actual media timestamp and the separate SDK source identity',()=>{
  const value=decodeFrame(encodeFrame(header,new Uint8Array([1,2,3])));expect(value.header).toEqual(header);expect([...value.payload]).toEqual([1,2,3]);
});
it('rejects truncated, oversized and unproven frame envelopes',()=>{
  const bytes=encodeFrame(header,new Uint8Array([1,2,3]));expect(()=>decodeFrame(bytes.slice(0,-1))).toThrow();
  const corrupt=new Uint8Array(bytes);new DataView(corrupt.buffer).setUint32(0,999999);expect(()=>decodeFrame(corrupt)).toThrow();
  expect(()=>encodeFrame({...header,uiCompleteThroughUs:0},new Uint8Array([1,2,3]))).toThrow();
});
it('rejects malformed input and arbitrary messages',()=>{
  expect(()=>parseClientMessage('{"type":"eval","epoch":0,"code":"x"}')).toThrow();
  expect(()=>parseClientMessage(JSON.stringify({type:'input.state',epoch:0,input:{sequence:1,heldKeys:[],keyEdges:[],yawDeltaRadians:101,pitchDeltaRadians:0,distanceDeltaMeters:0}}))).toThrow();
});

it('validates real encoder settings and bounds',()=>{
  expect(parseVideoSettings({width:854,height:480,fps:24,bitrate:1000000})).toEqual({width:854,height:480,fps:24,bitrate:1000000});
  for(const change of [{width:853},{fps:0},{bitrate:1},{bitrate:Infinity},{height:8192}])expect(()=>parseVideoSettings({width:1280,height:720,fps:24,bitrate:2000000,...change})).toThrow();
});

it('supports independent UI subscriptions and validates their source clock',()=>{
  expect(parseClientMessage(JSON.stringify({type:'stream.subscribe',epoch:0,ui:true,clock:true}))).toEqual({type:'stream.subscribe',epoch:0,ui:true,clock:true});
  expect(()=>parseClientMessage(JSON.stringify({type:'stream.subscribe',epoch:0,ui:false,clock:true}))).toThrow();
  expect(()=>validateUiClock({sourceTimeUs:1000,simulationTick:6,uiRevision:2,completeThroughUs:999})).toThrow('STREAM_UI_CLOCK_INVALID');
});

it('validates source counters without fabricating FPS for invalid sample intervals',()=>{
  const sample={sampleDurationMs:1001.2,capturedFrames:12,encodedFrames:11,encodeQueueSize:1};
  expect(()=>validateSourceDiagnostics(sample)).not.toThrow();
  for(const change of [{sampleDurationMs:0},{sampleDurationMs:NaN},{capturedFrames:-1},{encodedFrames:1.5},{encodeQueueSize:Infinity}])expect(()=>validateSourceDiagnostics({...sample,...change})).toThrow('STREAM_SOURCE_DIAGNOSTICS_INVALID');
});
