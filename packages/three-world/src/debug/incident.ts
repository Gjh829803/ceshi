/** Portable version-1 incident envelope. Replay validates the trace before changing the world. */
export interface DebugIncidentBundle {
 readonly metadata:{kind:'playground-debug-incident';schemaVersion:1;mapId:string;createdAt:string;label:string;source:{sourceHash:string;[key:string]:unknown};[key:string]:unknown};
 readonly screenshotDataUrl?:string;
 readonly recording?:unknown;
}
export interface DebugIncidentSummary {
 readonly id:string;readonly label:string;readonly createdAt:string;readonly sceneId:string;
 readonly sourceHash:string;readonly hasRecording:boolean;
}
export const MAX_DEBUG_INCIDENT_BYTES=32*1024*1024;
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
export function parseDebugIncident(text:string):DebugIncidentBundle{
 if(new TextEncoder().encode(text).byteLength>MAX_DEBUG_INCIDENT_BYTES)throw Error('DEBUG_BUNDLE_TOO_LARGE');
 let value:unknown;try{value=JSON.parse(text);}catch{throw Error('DEBUG_BUNDLE_JSON_INVALID');}
 if(!object(value)||!object(value.metadata))throw Error('DEBUG_BUNDLE_INVALID');
 const meta=value.metadata;
 if(meta.kind!=='playground-debug-incident'||meta.schemaVersion!==1||typeof meta.mapId!=='string'||!meta.mapId||meta.mapId.length>256||typeof meta.label!=='string'||meta.label.length>200||typeof meta.createdAt!=='string'||!Number.isFinite(Date.parse(meta.createdAt))||!object(meta.source)||typeof meta.source.sourceHash!=='string'||!/^[a-f0-9]{64}$/.test(meta.source.sourceHash))throw Error('DEBUG_BUNDLE_INVALID');
 if(value.screenshotDataUrl!==undefined&&(typeof value.screenshotDataUrl!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/]*={0,2}$/.test(value.screenshotDataUrl)))throw Error('DEBUG_BUNDLE_IMAGE_INVALID');
 if(value.recording!==undefined){const trace=value.recording;
  if(!object(trace)||trace.kind!=='playground-input-recording'||trace.schemaVersion!==1||!object(trace.source)||trace.source.sourceHash!==meta.source.sourceHash||!object(trace.start)||trace.start.mapId!==meta.mapId||!Array.isArray(trace.events)||trace.events.length>30000)throw Error('DEBUG_BUNDLE_RECORDING_INVALID');
 }
 return value as unknown as DebugIncidentBundle;
}
