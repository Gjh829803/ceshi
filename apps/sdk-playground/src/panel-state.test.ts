import {expect,it} from 'vitest';
import {createPanelStateStore,PANEL_STORAGE_KEY} from './panel-state';
function memory(raw:string|null=null){let value=raw,writes=0;return {getItem:()=>value,setItem:(_key:string,next:string)=>{value=next;writes++;},value:()=>value,writes:()=>writes};}
it('restores independent panel states and writes only changed persisted fields',()=>{
 const storage=memory(),first=createPanelStateStore(storage);
 first.update('assetLibrary',{open:true,pinned:true,query:'飞机'});first.update('inspector',{open:false,tab:'camera'});first.update('shortcuts',{layout:'collapsed'});
 const writes=storage.writes();first.update('shortcuts',{layout:'collapsed'});expect(storage.writes()).toBe(writes);
 const next=createPanelStateStore(storage);expect(next.read('assetLibrary')).toMatchObject({open:true,pinned:true,query:'飞机'});
 expect(next.read('inspector')).toMatchObject({open:false,tab:'camera'});expect(next.read('shortcuts').layout).toBe('collapsed');
 const copy=next.read('assetLibrary');Reflect.set(copy,'open',false);expect(next.read('assetLibrary').open).toBe(true);
 expect(PANEL_STORAGE_KEY).toBe('worldkit.playground.panels');
});
it('validates fields independently, fills new defaults and preserves unknown panel IDs',()=>{
 const storage=memory(JSON.stringify({version:1,panels:{inspector:{open:false,pinned:'broken',tab:'camera',futureWidth:420},shortcuts:{layout:'unknown'},futurePanel:{width:500}}}));
 const store=createPanelStateStore(storage);expect(store.read('inspector')).toEqual({open:false,pinned:false,tab:'camera'});expect(store.read('shortcuts').layout).toBe('floating');
 store.update('performance',{open:true});expect(JSON.parse(storage.value()!).panels.futurePanel).toEqual({width:500});
 expect(JSON.parse(storage.value()!).panels.inspector.futureWidth).toBe(420);
});
it('keeps working in memory when storage is blocked, full, malformed or from a newer version',()=>{
 for(const storage of [memory('{'),memory(JSON.stringify({version:2,panels:{}})),{getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');}}, {getItem:()=>null,setItem:()=>{throw Error('quota');}}]){
  const store=createPanelStateStore(storage);store.update('inspector',{pinned:true});expect(store.read('inspector').pinned).toBe(true);expect(store.status().available).toBe(false);
 }
});
it('does not persist teardown close callbacks after suspension',()=>{
 const storage=memory(),store=createPanelStateStore(storage);store.update('assetLibrary',{open:true});store.suspendPersistence();store.update('assetLibrary',{open:false});
 expect(createPanelStateStore(storage).read('assetLibrary').open).toBe(true);
});
