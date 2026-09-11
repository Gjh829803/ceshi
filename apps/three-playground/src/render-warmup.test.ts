import {expect,it,vi} from 'vitest';
import {preparePlaygroundRendering} from './render-warmup';

it('waits for shader compilation before rendering and yields around the warmup',async()=>{
 const events:string[]=[];let finish!:()=>void;
 const pending=new Promise<void>(resolve=>{finish=resolve;});
 const work=preparePlaygroundRendering({
  paint:async()=>{events.push('paint');},
  prepareVisuals:()=>{events.push('visuals');},
  compile:()=>{events.push('compile');return pending;},
  render:()=>{events.push('render');},
 });
 await Promise.resolve();
 expect(events).toEqual(['paint','visuals','compile']);
 finish();await work;
 expect(events).toEqual(['paint','visuals','compile','render','paint']);
});

it('propagates shader failure without rendering an unprepared world',async()=>{
 const render=vi.fn(),error=new Error('shader failure');
 await expect(preparePlaygroundRendering({paint:async()=>{},prepareVisuals:()=>{},compile:async()=>{throw error;},render})).rejects.toBe(error);
 expect(render).not.toHaveBeenCalled();
});

it('does not touch disposed scene objects after asynchronous compilation',async()=>{
 const controller=new AbortController(),render=vi.fn();
 await expect(preparePlaygroundRendering({paint:async()=>{},prepareVisuals:()=>{},compile:async()=>{controller.abort();},render,signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});
 expect(render).not.toHaveBeenCalled();
});
