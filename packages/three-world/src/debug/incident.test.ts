import {expect,it} from 'vitest';
import {parseDebugIncident,MAX_DEBUG_INCIDENT_BYTES} from '@worldkit/three/debug';
const incident=()=>({metadata:{kind:'playground-debug-incident',schemaVersion:1,mapId:'lab',label:'wing issue',createdAt:'2026-09-16T00:00:00.000Z',source:{sourceHash:'a'.repeat(64),runtimeHash:'b'.repeat(64)},frame:{frameId:42}},screenshotDataUrl:'data:image/png;base64,YQ=='});
it('preserves recorded identity and unknown diagnostic fields in portable incidents',()=>{
 const original=incident();expect(parseDebugIncident(JSON.stringify(original))).toEqual(original);
 expect(parseDebugIncident(JSON.stringify({...original,recording:{kind:'playground-input-recording',schemaVersion:1,source:original.metadata.source,start:{mapId:'lab'},events:[]}})).recording).toBeDefined();
});
it('rejects invalid format, oversized files and non-PNG screenshot URLs',()=>{
 expect(()=>parseDebugIncident('{')).toThrow('DEBUG_BUNDLE_JSON_INVALID');
 for(const change of [{kind:'other'},{schemaVersion:2},{mapId:''},{source:{sourceHash:'unknown'}},{createdAt:'never'}])expect(()=>parseDebugIncident(JSON.stringify({...incident(),metadata:{...incident().metadata,...change}}))).toThrow('DEBUG_BUNDLE_INVALID');
 expect(()=>parseDebugIncident(' '.repeat(MAX_DEBUG_INCIDENT_BYTES+1))).toThrow('DEBUG_BUNDLE_TOO_LARGE');
 expect(()=>parseDebugIncident(JSON.stringify({...incident(),screenshotDataUrl:'https://example.com/tracking.png'}))).toThrow('DEBUG_BUNDLE_IMAGE_INVALID');
});
it('rejects traces with mismatched source or scene before they enter local storage',()=>{
 const trace={kind:'playground-input-recording',schemaVersion:1,source:{sourceHash:'a'.repeat(64)},start:{mapId:'lab'},events:[]};
 for(const change of [{source:{sourceHash:'c'.repeat(64)}},{start:{mapId:'another-map'}},{schemaVersion:2}]){
  expect(()=>parseDebugIncident(JSON.stringify({...incident(),recording:{...trace,...change}}))).toThrow('DEBUG_BUNDLE_RECORDING_INVALID');
 }
});
