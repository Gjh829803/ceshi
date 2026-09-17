import { assertJson, type UiCatalog,type UiDocument,type UiSnapshot,type UiCommit,type JsonSchema,type JsonValue } from '@worldkit/world-ui/schema';
export const PROTOCOL_VERSION=1;
export const MAX_MEDIA_BYTES=4*1024*1024;
export const MAX_CONTROL_BYTES=1024*1024;
export interface SourceReference {presentationId:string;sdkEpoch:number;sourceFrameId:number;sourceTimeUs:number;simulationTick:number;worldRevision:number}
export interface FrameHeader {
  protocolVersion:1;sessionId:string;epoch:number;mediaGeneration:number;outputFrameId:number;outputPtsUs:number;
  type:'key'|'delta';source:SourceReference;uiRevision:number;uiCompleteThroughUs:number;
  widthPixels:number;heightPixels:number;payloadBytes:number;
}
export interface CodecConfig {codec:string;codedWidth:number;codedHeight:number;description?:number[]}
export interface InputState {
  sequence:number;heldKeys:string[];keyEdges:{code:string;kind:'down'|'up'}[];
  yawDeltaRadians:number;pitchDeltaRadians:number;distanceDeltaMeters:number;
}
export interface UiArtifact {
  catalog:UiCatalog;document:UiDocument;stateSchema:JsonSchema;
  moduleUrl:string;moduleSha256:string;styles:{url:string;sha256:string}[];
}
export interface VideoSettings {width:number;height:number;fps:number;bitrate:number}
export function parseVideoSettings(value:unknown):VideoSettings {
  assertJson(value);const v=value as unknown as VideoSettings;
  if(!v||typeof v!=='object'||Object.keys(v).some(k=>!['width','height','fps','bitrate'].includes(k))||
    !safeInteger(v.width,160,4096)||!safeInteger(v.height,90,4096)||v.width%2!==0||v.height%2!==0||
    !safeInteger(v.fps,1,60)||!safeInteger(v.bitrate,100_000,50_000_000))throw new Error('STREAM_VIDEO_SETTINGS_INVALID');
  return {width:v.width,height:v.height,fps:v.fps,bitrate:v.bitrate};
}
export interface SessionDescriptor extends VideoSettings {
  protocolVersion:1;sessionId:string;epoch:number;worldId:string;worldBuildHash:string;uiBundleHash:string;
  baseUrl:string;accessToken:string;ui:UiArtifact;
}
export interface UiClock {sourceTimeUs:number;simulationTick:number;uiRevision:number;completeThroughUs:number}
/** Counts over a producer-local interval, independent of subscriber video mode. */
export interface SourceDiagnostics {sampleDurationMs:number;capturedFrames:number;encodedFrames:number;encodeQueueSize:number}
export function validateSourceDiagnostics(value:SourceDiagnostics):void {
  if(!value||!Number.isFinite(value.sampleDurationMs)||value.sampleDurationMs<=0||
    ![value.capturedFrames,value.encodedFrames,value.encodeQueueSize].every(v=>safeInteger(v)))throw new Error('STREAM_SOURCE_DIAGNOSTICS_INVALID');
}
export function validateUiClock(value:UiClock):void {
  if(!value||![value.sourceTimeUs,value.simulationTick,value.uiRevision,value.completeThroughUs].every(v=>safeInteger(v))||value.completeThroughUs<value.sourceTimeUs)throw new Error('STREAM_UI_CLOCK_INVALID');
}
export type ClientMessage =
  | {type:'stream.subscribe';epoch:number;ui:boolean;clock:boolean}
  | {type:'input.state';epoch:number;input:InputState}
  | {type:'input.release';epoch:number}
  | {type:'input.action';epoch:number;actionId:string;name:string;params:Record<string,JsonValue>}
  | {type:'ui.resync';epoch:number};
export type ProducerMessage =
  | {type:'producer.ready'}
  | {type:'source.diagnostics';epoch:number;diagnostics:SourceDiagnostics}
  | {type:'ui.clock';epoch:number;clock:UiClock}
  | {type:'media.config';epoch:number;mediaGeneration:number;config:CodecConfig}
  | {type:'ui.snapshot';epoch:number;snapshot:UiSnapshot}
  | {type:'ui.commit';epoch:number;commit:UiCommit}
  | {type:'input.receipt';epoch:number;sequence:number;clientId:string;clientSequence:number;simulationTick:number}
  | {type:'action.receipt';epoch:number;actionId:string;status:'completed'|'failed';error?:string}
  | {type:'producer.error';message:string};
export type ServerMessage = ProducerMessage
  | {type:'stream.subscribed';epoch:number;ui:boolean;clock:boolean}
  | {type:'session.ready';epoch:number;role:'controller'|'spectator'}
  | {type:'session.reset';epoch:number}
  | {type:'session.video';epoch:number;video:VideoSettings}
  | {type:'session.ended';reason:string}
  | {type:'error';code:string};
export function safeInteger(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER):v is number{return Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max;}
export function parseJsonMessage(text:string):Record<string,unknown>{
  if(new TextEncoder().encode(text).length>MAX_CONTROL_BYTES)throw new Error('STREAM_MESSAGE_TOO_LARGE');
  const value:unknown=JSON.parse(text);assertJson(value);
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('STREAM_MESSAGE_INVALID');return value;
}
export function validateInput(value:unknown):asserts value is InputState {
  assertJson(value);const v=value as unknown as InputState;
  if(!v||!safeInteger(v.sequence)||!Array.isArray(v.heldKeys)||v.heldKeys.length>64||v.heldKeys.some(k=>typeof k!=='string'||k.length>32)||
    !Array.isArray(v.keyEdges)||v.keyEdges.length>128||v.keyEdges.some(e=>!e||!['down','up'].includes(e.kind)||typeof e.code!=='string'||e.code.length>32)||
    ![v.yawDeltaRadians,v.pitchDeltaRadians,v.distanceDeltaMeters].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100))throw new Error('STREAM_INPUT_INVALID');
}
export function parseClientMessage(text:string):ClientMessage {
  const v=parseJsonMessage(text);if(!safeInteger(v.epoch))throw new Error('STREAM_EPOCH_INVALID');
  if(v.type==='stream.subscribe'&&typeof v.ui==='boolean'&&typeof v.clock==='boolean'&&(!v.clock||v.ui))return v as unknown as ClientMessage;
  if(v.type==='input.state'){validateInput(v.input);return v as unknown as ClientMessage;}
  if(v.type==='input.release'||v.type==='ui.resync')return v as unknown as ClientMessage;
  if(v.type==='input.action'&&typeof v.actionId==='string'&&v.actionId.length>0&&v.actionId.length<=128&&typeof v.name==='string'&&v.name.length<=128&&v.params&&typeof v.params==='object'&&!Array.isArray(v.params))return v as unknown as ClientMessage;
  throw new Error('STREAM_CLIENT_MESSAGE_INVALID');
}
export function validateFrame(header:FrameHeader):void {
  assertJson(header);const s=header.source;
  if(header.protocolVersion!==1||!header.sessionId||!s||!s.presentationId||![header.epoch,header.mediaGeneration,header.outputFrameId,header.outputPtsUs,header.uiRevision,header.uiCompleteThroughUs,s.sdkEpoch,s.sourceFrameId,s.sourceTimeUs,s.simulationTick,s.worldRevision].every(n=>safeInteger(n))||
    !['key','delta'].includes(header.type)||!safeInteger(header.widthPixels,1,8192)||!safeInteger(header.heightPixels,1,8192)||!safeInteger(header.payloadBytes,1,MAX_MEDIA_BYTES)||header.uiCompleteThroughUs<s.sourceTimeUs)throw new Error('STREAM_FRAME_INVALID');
}
export function encodeFrame(header:FrameHeader,payload:Uint8Array):Uint8Array<ArrayBuffer> {
  validateFrame(header);if(payload.byteLength!==header.payloadBytes)throw new Error('STREAM_PAYLOAD_LENGTH');
  const bytes=new TextEncoder().encode(JSON.stringify(header));if(bytes.length>65536)throw new Error('STREAM_HEADER_TOO_LARGE');
  const result=new Uint8Array(4+bytes.length+payload.length);new DataView(result.buffer).setUint32(0,bytes.length);result.set(bytes,4);result.set(payload,4+bytes.length);return result;
}
export function decodeFrame(packet:ArrayBuffer|Uint8Array):{header:FrameHeader;payload:Uint8Array<ArrayBuffer>} {
  const bytes=packet instanceof Uint8Array?packet:new Uint8Array(packet);
  if(bytes.byteLength<5||bytes.byteLength>MAX_MEDIA_BYTES+65540)throw new Error('STREAM_PACKET_LENGTH');
  const length=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0);
  if(length>65536||length>bytes.length-5)throw new Error('STREAM_HEADER_LENGTH');
  const header=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(4,4+length))) as FrameHeader;validateFrame(header);
  const payload=new Uint8Array(bytes.subarray(4+length));if(payload.byteLength!==header.payloadBytes)throw new Error('STREAM_PAYLOAD_LENGTH');return {header,payload};
}
